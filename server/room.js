import { GAMES, catalog, buildNight } from './games/index.js';
import { randomId, pick, UserError } from './util.js';

export { UserError };

const MAX_PLAYERS = 16;
const MAX_MEDIA_BYTES = 60 * 1024 * 1024;

// One play-through of a single mini-game. Games get this object and use it to
// move between steps, set timers, read players and hand out points.
class Round {
  constructor(room, gameId, id) {
    this.room = room;
    this.id = id;
    this.gameId = gameId;
    this.game = GAMES[gameId];
    this.step = 'intro';
    this.deadline = null;
    this.onTimeout = null;
    this.ready = new Set();
    this.participants = new Set(room.connectedIds());
    this.data = {};
    this.points = null;
    this.timers = [];
  }

  get alive() {
    return this.room.round === this && !this.room.closed;
  }

  now() {
    return Date.now();
  }

  // Move to a new step. If ms is given, onTimeout fires when time runs out
  // (or when the host taps "skip").
  setStep(name, ms = 0, onTimeout = null) {
    this.clearTimers();
    this.step = name;
    this.deadline = ms ? Date.now() + ms : null;
    this.onTimeout = onTimeout;
    if (ms && onTimeout) this.after(ms, onTimeout);
    this.touch();
  }

  after(ms, fn) {
    const t = setTimeout(() => {
      if (this.alive) fn();
    }, ms);
    this.timers.push({ t, interval: false });
    return t;
  }

  every(ms, fn) {
    const t = setInterval(() => {
      if (this.alive) fn();
      else clearInterval(t);
    }, ms);
    this.timers.push({ t, interval: true });
    return t;
  }

  clearTimers() {
    for (const { t, interval } of this.timers) (interval ? clearInterval : clearTimeout)(t);
    this.timers = [];
  }

  touch() {
    this.room.touch();
  }

  // Everyone taking part in this round who hasn't left the room.
  playerIds() {
    return [...this.participants].filter((id) => this.room.players.has(id));
  }

  // Participants with a live connection right now. Use this when waiting for
  // "everyone" so one locked phone doesn't stall the game.
  activeIds() {
    return this.playerIds().filter((id) => this.room.players.get(id).connected);
  }

  isIn(pid) {
    return this.participants.has(pid) && this.room.players.has(pid);
  }

  player(pid) {
    return this.room.players.get(pid);
  }

  freshPrompt(list) {
    return this.room.freshPrompt(this.gameId, list);
  }

  putMedia(buf, mime) {
    return this.room.putMedia(buf, mime);
  }

  mediaUrl(id) {
    return `/media/${this.room.code}/${id}`;
  }

  finish(points = {}) {
    if (this.step === 'results') return;
    this.clearTimers();
    this.points = {};
    for (const pid of this.playerIds()) {
      const pts = Math.max(0, Math.round(points[pid] || 0));
      this.points[pid] = pts;
      this.room.players.get(pid).score += pts;
    }
    this.step = 'results';
    this.deadline = null;
    this.onTimeout = null;
    this.touch();
  }
}

export class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.hostId = null;
    this.phase = 'lobby';
    this.round = null;
    this.night = null;
    this.final = null;
    this.media = new Map();
    this.mediaBytes = 0;
    this.seq = 0;
    this.pending = false;
    this.lastActive = Date.now();
    this.used = new Map();
    this.closed = false;
  }

  // ---- membership ----------------------------------------------------------

  join(pid, name, avatar, ws) {
    let p = this.players.get(pid);
    if (!p) {
      if (this.players.size >= MAX_PLAYERS) throw new UserError('That room is full.');
      p = { id: pid, name, avatar, score: 0, ws: null, connected: false, joinedAt: Date.now(), loc: null };
      this.players.set(pid, p);
      if (!this.hostId) this.hostId = pid;
    }
    if (p.ws && p.ws !== ws) {
      p.ws.room = null;
      try {
        p.ws.close(4000, 'replaced');
      } catch {}
    }
    p.ws = ws;
    p.connected = true;
    if (name) p.name = name;
    if (avatar) p.avatar = avatar;
    ws.pid = pid;
    ws.room = this;
    this.lastActive = Date.now();
    if (this.round?.step === 'intro') this.round.participants.add(pid);
    this.membershipChanged();
  }

  disconnect(ws) {
    const p = this.players.get(ws.pid);
    if (p && p.ws === ws) {
      p.ws = null;
      p.connected = false;
      this.lastActive = Date.now();
      this.membershipChanged();
    }
  }

  remove(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    if (p.ws) {
      p.ws.room = null;
      send(p.ws, { t: 'left' });
    }
    this.players.delete(pid);
    if (this.hostId === pid) this.hostId = this.players.keys().next().value ?? null;
    this.round?.participants.delete(pid);
    this.round?.ready.delete(pid);
    this.membershipChanged();
  }

  membershipChanged() {
    const r = this.round;
    if (r) {
      if (r.step === 'intro') this.checkReady();
      else if (r.step !== 'results') safely(() => r.game.check?.(r));
    }
    this.touch();
  }

  connectedIds() {
    return [...this.players.values()].filter((p) => p.connected).map((p) => p.id);
  }

  // The host keeps the job while connected. If their phone drops, the
  // longest-standing connected player covers until they come back.
  effectiveHost() {
    const h = this.players.get(this.hostId);
    if (h?.connected) return h.id;
    const backup = [...this.players.values()].filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    return backup?.id ?? this.hostId;
  }

  isEmpty() {
    return this.connectedIds().length === 0;
  }

  // ---- broadcasting --------------------------------------------------------

  // Coalesce bursts of changes (e.g. live shake scores) into one update.
  touch() {
    if (this.pending) return;
    this.pending = true;
    setTimeout(() => {
      this.pending = false;
      this.broadcast();
    }, 60);
  }

  broadcast() {
    for (const p of this.players.values()) {
      if (p.ws) send(p.ws, this.viewFor(p.id));
    }
  }

  viewFor(pid) {
    const r = this.round;
    let roundView = null;
    if (r) {
      let view = null;
      try {
        view = r.game.view(r, pid);
      } catch (err) {
        console.error(`[${this.code}] view error in ${r.gameId}:`, err);
      }
      roundView = {
        id: r.id,
        gameId: r.gameId,
        step: r.step,
        deadline: r.deadline,
        ready: [...r.ready],
        participants: r.playerIds(),
        points: r.points,
        view,
      };
    }
    return {
      t: 'state',
      now: Date.now(),
      me: pid,
      room: {
        code: this.code,
        hostId: this.effectiveHost(),
        phase: this.phase,
        players: [...this.players.values()].map((p) => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          score: p.score,
          connected: p.connected,
        })),
        night: this.night ? { i: this.night.i, total: this.night.list.length, list: this.night.list } : null,
        round: roundView,
        final: this.final,
        catalog,
      },
    };
  }

  // ---- game flow -----------------------------------------------------------

  startNight() {
    const list = buildNight(this.connectedIds().length);
    for (const p of this.players.values()) p.score = 0;
    this.night = { list, i: 0 };
    this.startRound(list[0]);
  }

  startRound(gameId) {
    const game = GAMES[gameId];
    if (!game) throw new UserError('Unknown game.');
    const count = this.connectedIds().length;
    if (count < game.minPlayers) throw new UserError(`${game.name} needs at least ${game.minPlayers} players.`);
    this.round?.clearTimers();
    this.clearMedia();
    this.round = new Round(this, gameId, ++this.seq);
    this.phase = 'round';
    this.final = null;
    this.touch();
  }

  markReady(pid) {
    const r = this.round;
    if (!r || r.step !== 'intro' || !r.isIn(pid)) return;
    r.ready.add(pid);
    this.checkReady();
    this.touch();
  }

  checkReady() {
    const r = this.round;
    const active = r.activeIds();
    if (active.length > 0 && active.every((id) => r.ready.has(id))) this.begin();
  }

  begin() {
    const r = this.round;
    if (!r || r.step !== 'intro') return;
    r.step = 'starting';
    try {
      r.game.start(r);
    } catch (err) {
      console.error(`[${this.code}] start error in ${r.gameId}:`, err);
      r.finish({});
    }
    this.touch();
  }

  skip() {
    const r = this.round;
    if (!r) return;
    if (r.step === 'intro') return this.begin();
    if (r.onTimeout) {
      const fn = r.onTimeout;
      r.clearTimers();
      r.onTimeout = null;
      safely(fn);
    }
  }

  next() {
    const r = this.round;
    if (!r || r.step !== 'results') return;
    if (this.night) {
      this.night.i++;
      if (this.night.i < this.night.list.length) return this.startRound(this.night.list[this.night.i]);
      return this.finishNight();
    }
    this.round = null;
    this.phase = 'lobby';
    this.touch();
  }

  finishNight() {
    this.round?.clearTimers();
    this.round = null;
    this.night = null;
    this.phase = 'final';
    this.clearMedia();
    this.final = {
      standings: [...this.players.values()]
        .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score }))
        .sort((a, b) => b.score - a.score),
    };
    this.touch();
  }

  endRound() {
    this.round?.clearTimers();
    this.round = null;
    this.night = null;
    this.phase = 'lobby';
    this.clearMedia();
    this.touch();
  }

  hostAction(pid, msg) {
    if (pid !== this.effectiveHost()) throw new UserError('Only the host can do that.');
    switch (msg.action) {
      case 'start':
        if (msg.game === 'night') this.startNight();
        else {
          this.night = null;
          this.startRound(msg.game);
        }
        break;
      case 'begin':
        if (this.round?.step === 'intro') this.begin();
        break;
      case 'skip':
        this.skip();
        break;
      case 'next':
        this.next();
        break;
      case 'end':
        this.endRound();
        break;
      case 'lobby':
        this.phase = 'lobby';
        this.final = null;
        this.touch();
        break;
      case 'resetScores':
        for (const p of this.players.values()) p.score = 0;
        this.touch();
        break;
      case 'kick':
        if (msg.pid !== pid) this.remove(msg.pid);
        break;
      case 'makeHost':
        if (this.players.has(msg.pid)) this.hostId = msg.pid;
        this.touch();
        break;
    }
  }

  gameAction(pid, msg) {
    const r = this.round;
    if (!r || r.step === 'results') return;
    r.game.action(r, pid, msg);
  }

  // ---- misc ----------------------------------------------------------------

  // Avoid repeating a prompt within the same room until the list runs dry.
  freshPrompt(key, list) {
    let used = this.used.get(key);
    if (!used || used.size >= list.length) {
      used = new Set();
      this.used.set(key, used);
    }
    const options = list.filter((_, i) => !used.has(i));
    const chosen = pick(options);
    used.add(list.indexOf(chosen));
    return chosen;
  }

  freshPrompts(key, list, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      let p = this.freshPrompt(key, list);
      for (let tries = 0; out.includes(p) && tries < 10; tries++) p = this.freshPrompt(key, list);
      out.push(p);
    }
    return out;
  }

  putMedia(buf, mime) {
    if (this.mediaBytes + buf.length > MAX_MEDIA_BYTES) throw new UserError('Too much media in this room.');
    const id = randomId(16);
    this.media.set(id, { buf, mime });
    this.mediaBytes += buf.length;
    return id;
  }

  clearMedia() {
    this.media.clear();
    this.mediaBytes = 0;
  }

  close() {
    this.closed = true;
    this.round?.clearTimers();
  }
}

export function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function safely(fn) {
  try {
    fn();
  } catch (err) {
    console.error('game error:', err);
  }
}
