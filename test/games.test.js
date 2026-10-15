// Plays every mini-game end to end with a few bot players over real
// WebSockets. Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';

const PORT = 40000 + Math.floor(Math.random() * 10000);
let server;

before(async () => {
  server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('live') && resolve()));
});

after(() => server.kill());

class Bot {
  constructor(name) {
    this.name = name;
    this.pid = `bot-${name}-${Math.random().toString(36).slice(2, 10)}`;
    this.state = null;
    this.errors = [];
    this.waiters = [];
  }
  async connect() {
    this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.t === 'state') this.state = msg.room;
      if (msg.t === 'error') this.errors.push(msg.msg);
      if (msg.t === 'joined') this.code = msg.code;
      this.waiters = this.waiters.filter((w) => !w());
    });
    await once(this.ws, 'open');
    return this;
  }
  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }
  g(a, data = {}) {
    this.send({ t: 'g', a, ...data });
  }
  host(action, data = {}) {
    this.send({ t: 'host', action, ...data });
  }
  get round() {
    return this.state?.round;
  }
  get view() {
    return this.state?.round?.view;
  }
  get me() {
    return this.state?.players.find((p) => p.id === this.pid);
  }
  until(pred, label = 'condition', ms = 8000) {
    return new Promise((resolve, reject) => {
      const check = () => {
        try {
          if (this.state && pred(this.state)) {
            clearTimeout(timer);
            resolve(this.state);
            return true;
          }
        } catch {}
        return false;
      };
      const timer = setTimeout(() => reject(new Error(`${this.name} timed out waiting for ${label}; step=${this.round?.step}`)), ms);
      if (!check()) this.waiters.push(check);
    });
  }
  nextState(ms = 3000) {
    let seen = false;
    return this.until(() => (seen ? true : ((seen = true), false)), 'next state', ms).catch(() => {});
  }
  untilStep(step, ms) {
    return this.until((s) => s.round?.step === step, `step ${step}`, ms);
  }
  close() {
    this.ws.close();
  }
}

async function makeRoom(n = 3) {
  const bots = await Promise.all(['ann', 'bob', 'cat', 'dan'].slice(0, n).map((x) => new Bot(x).connect()));
  const [host, ...rest] = bots;
  host.send({ t: 'create', pid: host.pid, name: host.name, avatar: '🦊' });
  await host.until(() => host.code, 'room code');
  for (const b of rest) b.send({ t: 'join', code: host.code, pid: b.pid, name: b.name, avatar: '🐸' });
  await Promise.all(bots.map((b) => b.until((s) => s.players.length === n && s.players.every((p) => p.connected), 'everyone joined')));
  return bots;
}

async function startGame(bots, game) {
  bots[0].host('start', { game });
  await Promise.all(bots.map((b) => b.until((s) => s.round?.gameId === game && s.round.step === 'intro', 'intro')));
  for (const b of bots) b.send({ t: 'ready' });
  await Promise.all(bots.map((b) => b.until((s) => s.round.step !== 'intro', 'game start')));
}

const points = (bot) => bot.round.points;
const closeAll = (bots) => bots.forEach((b) => b.close());

test('shake: biggest shaker wins', async () => {
  const bots = await makeRoom();
  await startGame(bots, 'shake');
  await new Promise((r) => setTimeout(r, bots[0].view.startAt - Date.now() + 200));
  bots.forEach((b, i) => b.g('shake', { value: (i + 1) * 1000 }));
  await bots[0].until((s) => Object.keys(s.round.view.scores).length === 3, 'scores');
  bots[0].host('skip');
  await Promise.all(bots.map((b) => b.untilStep('results')));
  const p = points(bots[0]);
  assert.equal(p[bots[2].pid], 300);
  assert.equal(p[bots[1].pid], 200);
  assert.equal(p[bots[0].pid], 150);
  closeAll(bots);
});

test('hot takes: persuasion scores', async () => {
  const bots = await makeRoom();
  await startGame(bots, 'hottakes');
  [0, 5, 10].forEach((v, i) => bots[i].g('rate', { v }));
  await bots[0].untilStep('debate');
  assert.equal(bots[0].view.callout.gap, 10);
  bots[0].host('skip');
  await bots[0].untilStep('rate2');
  // Bob (5) moves all the way to Ann's 0; Cat stays at 10.
  bots[0].g('rate', { v: 0 });
  bots[1].g('rate', { v: 0 });
  bots[2].g('rate', { v: 10 });
  await bots[0].untilStep('results');
  assert.equal(bots[0].view.sway[bots[0].pid], 5);
  assert.ok(points(bots[0])[bots[0].pid] > points(bots[0])[bots[2].pid]);
  closeAll(bots);
});

test('most likely: three questions, majority voters score', async () => {
  const bots = await makeRoom();
  await startGame(bots, 'mostlikely');
  for (let q = 0; q < 3; q++) {
    await bots[0].until((s) => s.round.step === 'vote' && s.round.view.qi === q, `question ${q}`);
    bots.forEach((b) => b.g('vote', { pid: bots[1].pid }));
    await bots[0].untilStep('reveal');
    assert.deepEqual(bots[0].view.winners, [bots[1].pid]);
    bots[0].host('skip');
  }
  await bots[0].untilStep('results');
  assert.equal(points(bots[0])[bots[0].pid], 180);
  assert.equal(points(bots[0])[bots[1].pid], 240);
  closeAll(bots);
});

test('count up: collisions reset, reaching target wins', async () => {
  const bots = await makeRoom(2);
  await startGame(bots, 'countup');
  bots[0].g('tap');
  bots[1].g('tap');
  await bots[0].until((s) => s.round.view.totalCollisions === 1, 'collision');
  assert.equal(bots[0].view.n, 0);
  const target = bots[0].view.target;
  for (let i = 0; i < target; i++) {
    bots[i % 2].g('tap');
    await bots[0].until((s) => s.round.step === 'results' || s.round.view.n === i + 1, `count ${i + 1}`);
    await new Promise((r) => setTimeout(r, 850));
  }
  await bots[0].untilStep('results');
  assert.equal(bots[0].view.outcome, 'win');
  closeAll(bots);
});

test('snap judgment: upload, vote, media served with ranges', async () => {
  const bots = await makeRoom();
  await startGame(bots, 'snap');
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes-0123456789').toString('base64');
  bots.forEach((b) => b.g('submit', { data: jpeg }));
  await Promise.all(bots.map((b) => b.untilStep('vote')));
  const entries = bots[0].view.entries;
  assert.equal(entries.length, 3);
  const target = (b) => b.view.entries.find((e) => !e.mine && b === bots[0]) ?? b.view.entries.find((e) => !e.mine);
  // Everyone votes for Ann's photo, except Ann who votes for anyone else.
  const annEntry = bots[1].view.entries.find((e) => !e.mine && bots[0].view.entries.find((x) => x.id === e.id).mine);
  bots[0].g('vote', { id: target(bots[0]).id });
  bots[1].g('vote', { id: annEntry.id });
  bots[2].g('vote', { id: annEntry.id });
  await bots[0].untilStep('results');
  assert.equal(points(bots[0])[bots[0].pid], 250);
  const url = `http://localhost:${PORT}${bots[0].view.entries[0].url}`;
  const full = await fetch(url);
  assert.equal(full.status, 200);
  const part = await fetch(url, { headers: { range: 'bytes=0-3' } });
  assert.equal(part.status, 206);
  assert.equal(await part.text(), 'fake');
  closeAll(bots);
});

test('bomb squad: holding together defuses it', async () => {
  const bots = await makeRoom();
  await startGame(bots, 'bomb');
  assert.equal(bots[0].view.stages, 4);
  for (let stage = 0; stage < 4; stage++) {
    await bots[0].until((s) => s.round.step === 'results' || s.round.view.stage === stage, `stage ${stage}`);
    bots.forEach((b) => b.g('zone', { stage, in: true }));
  }
  await bots[0].untilStep('results', 20000);
  assert.equal(bots[0].view.outcome, 'defused');
  assert.equal(points(bots[0])[bots[1].pid], 300);
  closeAll(bots);
});

test('homing pigeon: pointing at friends', async () => {
  const bots = await makeRoom(2);
  bots[0].host('start', { game: 'homing' });
  await bots[0].untilStep('intro');
  // Sacramento and Los Angeles.
  bots[0].g('loc', { lat: 38.58, lon: -121.49 });
  bots[1].g('loc', { lat: 34.05, lon: -118.24 });
  bots.forEach((b) => b.send({ t: 'ready' }));
  await bots[0].untilStep('point');
  const t = bots[0].view.targets[0];
  assert.equal(t.kind, 'player');
  assert.ok(t.distMi > 350 && t.distMi < 400, `distance ${t.distMi}`);
  // LA is roughly south-east (~148°) from Sacramento.
  bots[0].g('lock', { heading: 148 });
  bots[0].g('lock', { heading: 0 });
  bots[0].g('lock', { heading: null });
  for (let i = 0; i < 3; i++) bots[1].g('lock', { heading: 90 });
  await bots[0].untilStep('results');
  const ann = bots[0].view.rows.find((r) => r.pid === bots[0].pid);
  assert.ok(ann.shots[0].err <= 3, `err ${ann.shots[0].err}`);
  assert.equal(ann.shots[2].pts, 0);
  closeAll(bots);
});

test('pitch: scores from cents', async () => {
  const bots = await makeRoom(2);
  await startGame(bots, 'pitch');
  bots[0].g('result', { cents: [0, 20, null] });
  bots[1].g('result', { cents: [300, 300, 300] });
  await bots[0].untilStep('results');
  assert.equal(points(bots[0])[bots[0].pid], 190 + 100);
  closeAll(bots);
});

test('sound off: needs audio mime', async () => {
  const bots = await makeRoom(2);
  await startGame(bots, 'sound');
  bots[0].g('submit', { data: 'data:text/html;base64,PGgxPg==' });
  await bots[0].until(() => bots[0].errors.length > 0, 'error');
  bots.forEach((b) => b.g('submit', { data: 'data:audio/mp4;base64,AAAA' }));
  await bots[0].untilStep('vote');
  closeAll(bots);
});

// Host fast-forwards through every step of the current round.
async function skipToResults(host) {
  for (let guard = 0; host.round.step !== 'results' && guard < 200; guard++) {
    host.host('skip');
    await host.nextState(1500);
  }
  assert.equal(host.round.step, 'results', `stuck in ${host.round.gameId}:${host.round.step}`);
}

test('a full night plays the lineup from the settings, then crowns a champion', async () => {
  const bots = await makeRoom();
  const rounds = Object.fromEntries(bots[0].state.catalog.map((g) => [g.id, 1]));
  rounds.snap = 2;
  bots[0].host('settings', { settings: { rounds } });
  await bots[0].until((s) => s.settings.rounds.snap === 2, 'settings');
  bots[0].host('start', { game: 'night' });
  await bots[0].untilStep('intro');
  const list = bots[0].state.night.list;
  assert.equal(list.length, bots[0].state.catalog.length + 1);
  // Both Snap Judgment rounds play back to back.
  assert.equal(list.indexOf('snap') + 1, list.lastIndexOf('snap'));
  for (let i = 0; i < list.length; i++) {
    await bots[0].until((s) => s.round?.step === 'intro' && s.night.i === i, `round ${i} (${list[i]})`);
    bots[0].host('begin');
    await bots[0].until((s) => s.round.step !== 'intro', 'begun');
    await skipToResults(bots[0]);
    bots[0].host('next');
  }
  await bots[0].until((s) => s.phase === 'final', 'final');
  assert.equal(bots[0].state.final.standings.length, 3);
  closeAll(bots);
});

test('playing one game runs its round count; repeats start on their own; skip game moves on', async () => {
  const bots = await makeRoom();
  bots[0].host('settings', { settings: { rounds: { hottakes: 3 } } });
  await bots[0].until((s) => s.settings.rounds.hottakes === 3, 'settings');
  await startGame(bots, 'hottakes');
  assert.deepEqual(bots[0].state.night.list, ['hottakes', 'hottakes', 'hottakes']);
  assert.deepEqual(bots[0].round.repeat, { k: 1, of: 3 });
  await skipToResults(bots[0]);
  bots[0].host('next');
  await bots[0].until((s) => s.round?.step === 'intro' && s.round.repeat?.k === 2, 'second round intro');
  assert.ok(bots[0].round.deadline, 'repeat intro has an auto-start countdown');
  bots[0].host('skipGame');
  await bots[0].until((s) => s.phase === 'lobby', 'back to lobby after skipping the game');
  closeAll(bots);
});

test('skip game in a night jumps to the next different game', async () => {
  const bots = await makeRoom();
  const rounds = Object.fromEntries(bots[0].state.catalog.map((g) => [g.id, 0]));
  Object.assign(rounds, { shake: 2, mostlikely: 1 });
  bots[0].host('settings', { settings: { rounds } });
  await bots[0].until((s) => s.settings.rounds.shake === 2, 'settings');
  bots[0].host('start', { game: 'night' });
  await bots[0].untilStep('intro');
  const first = bots[0].round.gameId;
  bots[0].host('skipGame');
  await bots[0].until((s) => s.round && s.round.gameId !== first, 'next game');
  bots[0].host('skipGame');
  await bots[0].until((s) => s.phase === 'final', 'final after last game skipped');
  closeAll(bots);
});

test('imposter: caught imposter can steal it by guessing the word', async () => {
  const bots = await makeRoom();
  await startGame(bots, 'imposter');
  const imp = bots.find((b) => b.view.isImposter);
  const others = bots.filter((b) => b !== imp);
  assert.equal(imp.view.word, null);
  assert.ok(others[0].view.word);
  const word = others[0].view.word;
  bots.forEach((b) => b.g('done'));
  await bots[0].untilStep('vote');
  others.forEach((b) => b.g('vote', { pid: imp.pid }));
  imp.g('vote', { pid: others[0].pid });
  await imp.untilStep('reveal');
  assert.equal(imp.view.caught, true);
  assert.equal(imp.view.word, null, 'caught imposter must not see the word before guessing');
  bots[0].host('skip');
  await imp.untilStep('guess');
  assert.ok(imp.view.words.includes(word));
  imp.g('guess', { word });
  await bots[0].untilStep('results');
  assert.equal(bots[0].view.outcome, 'stole');
  assert.equal(points(bots[0])[imp.pid], 200);
  closeAll(bots);
});

test('two truths: guess the lie, liars score for fooling people', async () => {
  const bots = await makeRoom();
  await startGame(bots, 'twotruths');
  bots.forEach((b) => b.g('submit', { statements: [`${b.name} one`, `${b.name} two`, `${b.name} lie`], lie: 2 }));
  for (let q = 0; q < 3; q++) {
    await bots[0].until((s) => s.round.step === 'guess' && s.round.view.qi === q, `guess ${q}`);
    const author = bots[0].view.author;
    const lieIdx = bots[0].view.statements.findIndex((x) => x.endsWith('lie'));
    for (const b of bots) if (b.pid !== author) b.g('guess', { i: b === bots.find((x) => x.pid !== author) ? lieIdx : (lieIdx + 1) % 3 });
    await bots[0].untilStep('reveal');
    assert.equal(bots[0].view.lie, lieIdx);
    bots[0].host('skip');
  }
  await bots[0].untilStep('results');
  // Each player: fooled one person (+75) and guessed right on someone at least once.
  for (const b of bots) assert.ok(points(bots[0])[b.pid] >= 75);
  closeAll(bots);
});

test('spectrum: clue-giver sees the target, guessers score by distance', async () => {
  const bots = await makeRoom(2);
  await startGame(bots, 'spectrum');
  for (let t = 0; t < 2; t++) {
    await Promise.all(bots.map((b) => b.until((s) => s.round.step === 'clue' && s.round.view.turn === t, `turn ${t}`)));
    const giver = bots.find((b) => b.view.isGiver);
    const guesser = bots.find((b) => !b.view.isGiver);
    assert.equal(guesser.view.target, null);
    const target = giver.view.target;
    giver.g('clue', { clue: 'a sauna' });
    await guesser.untilStep('guess');
    guesser.g('guess', { v: target + 3 });
    await bots[0].untilStep('reveal');
    assert.equal(bots[0].view.points[guesser.pid], 100);
    assert.equal(bots[0].view.points[giver.pid], 100);
    bots[0].host('skip');
  }
  await bots[0].untilStep('results');
  assert.equal(points(bots[0])[bots[0].pid], 200);
  closeAll(bots);
});

test('doodle telephone: write, draw, guess, then flip through the album', async () => {
  const bots = await makeRoom();
  await startGame(bots, 'telephone');
  assert.equal(bots[0].view.kind, 'write');
  bots.forEach((b) => b.g('submit', { text: `${b.name}'s phrase` }));
  await bots[0].untilStep('draw');
  // Each drawer got someone else's phrase.
  for (const b of bots) {
    await b.untilStep('draw');
    assert.ok(b.view.prev.text.endsWith("'s phrase") && !b.view.prev.text.startsWith(b.name));
  }
  const png = 'data:image/jpeg;base64,' + Buffer.from('drawing').toString('base64');
  bots.forEach((b) => b.g('submit', { data: png }));
  await bots[0].untilStep('guess');
  for (const b of bots) await b.untilStep('guess');
  assert.ok(bots[1].view.prev.url.startsWith('/media/'));
  bots.slice(0, 2).forEach((b) => b.g('submit', { text: 'a cat?' }));
  await bots[0].until((s) => s.round.view.done.length === 2, 'two guesses in');
  bots[0].host('skip'); // the third player ran out of time
  await bots[0].untilStep('reveal');
  const chains = bots[0].view.chains;
  assert.equal(chains.length, 3);
  assert.equal(chains.flatMap((c) => c.entries).filter((e) => e.missing).length, 1);
  for (let i = 0; i < 9; i++) {
    bots[0].g('reveal');
    await bots[0].nextState(1000);
  }
  await bots[0].untilStep('results');
  // Two entries (+40 each), plus +50 if their own chain made it all the way round.
  assert.ok([80, 130].includes(points(bots[0])[bots[2].pid]));
  closeAll(bots);
});

test('siren song: phones send a score per phrase', async () => {
  const bots = await makeRoom(1);
  await startGame(bots, 'siren');
  assert.equal(bots[0].view.mode, 'siren');
  assert.deepEqual(bots[0].view.targets.map((t) => t.type).sort(), ['glide', 'steps', 'wave']);
  bots[0].g('result', { scores: [80, 50, 999] });
  await bots[0].untilStep('results');
  assert.equal(points(bots[0])[bots[0].pid], 80 + 50 + 100 + 100);
  closeAll(bots);
});

test('reconnecting keeps your seat and score; host hands over', async () => {
  const bots = await makeRoom(2);
  await startGame(bots, 'pitch');
  bots.forEach((b) => b.g('result', { cents: [0, 0, 0] }));
  await Promise.all(bots.map((b) => b.untilStep('results')));
  const score = bots[1].me.score;
  assert.ok(score > 0);
  bots[0].close();
  await bots[1].until((s) => s.hostId === bots[1].pid, 'backup host');
  const again = await new Bot('ann').connect();
  again.pid = bots[0].pid;
  again.send({ t: 'join', code: bots[1].state.code, pid: again.pid, name: 'ann', avatar: '🦊' });
  await again.until((s) => s.hostId === again.pid, 'host restored');
  assert.equal(again.state.players.length, 2);
  assert.equal(bots[1].me.score, score);
  again.close();
  bots[1].close();
});

test('unknown room code is a friendly error', async () => {
  const b = await new Bot('zed').connect();
  b.send({ t: 'join', code: 'QQQQ', pid: b.pid, name: 'zed' });
  await b.until(() => true, 'x', 100).catch(() => {});
  await new Promise((r) => setTimeout(r, 200));
  assert.match(b.errors[0], /No room/);
  b.close();
});
