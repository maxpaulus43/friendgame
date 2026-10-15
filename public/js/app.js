import { h, replace, toast, tagChips, avatar, timer, fmt, SENSOR_LABELS, TAG_LABELS } from './ui.js';
import * as net from './net.js';
import * as sensors from './sensors.js';
import snap from './games/snap.js';
import sound from './games/sound.js';
import shake from './games/shake.js';
import homing from './games/homing.js';
import bomb from './games/bomb.js';
import hottakes from './games/hottakes.js';
import mostlikely from './games/mostlikely.js';
import pitch from './games/pitch.js';
import countup from './games/countup.js';
import imposter from './games/imposter.js';
import twotruths from './games/twotruths.js';
import spectrum from './games/spectrum.js';
import telephone from './games/telephone.js';

const MODULES = { snap, sound, shake, homing, bomb, hottakes, mostlikely, pitch, siren: pitch, countup, imposter, twotruths, spectrum, telephone };

const AVATARS = ['🦊', '🐸', '🐙', '🦄', '🐔', '🐢', '🦖', '🐼', '🦉', '🐝', '🦀', '🐷', '🐵', '🦩', '🐳', '🦔', '👽', '🤖', '👻', '🤠', '🧙', '🥑', '🌮', '🍕'];

// ---- local identity -------------------------------------------------------

const ls = {
  get: (k) => {
    try {
      return localStorage.getItem(`wd.${k}`);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      if (v === null || v === undefined) localStorage.removeItem(`wd.${k}`);
      else localStorage.setItem(`wd.${k}`, v);
    } catch {}
  },
};

const me = {
  pid: ls.get('pid') || newPid(),
  name: ls.get('name') || '',
  avatar: ls.get('avatar') || AVATARS[Math.floor(Math.random() * AVATARS.length)],
  code: ls.get('code'),
};
ls.set('pid', me.pid);

function newPid() {
  return (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/[^\w-]/g, '');
}

const inviteCode = new URLSearchParams(location.search).get('room')?.toUpperCase().slice(0, 4) || null;
if (inviteCode && inviteCode !== me.code) me.code = null;

// ---- app state ------------------------------------------------------------

const state = {
  room: null,
  offset: 0,
  key: null,
  screen: null,
  joining: false,
  roundId: null,
};

const root = document.getElementById('app');
const header = document.getElementById('header');

const serverNow = () => Date.now() + state.offset;

// The host's round settings follow them from week to week on this phone.
function savedSettings() {
  try {
    return JSON.parse(ls.get('settings')) || undefined;
  } catch {
    return undefined;
  }
}
const MINUTES_PER_ROUND = 4;
const player = (pid) => state.room?.players.find((p) => p.id === pid);
const isHost = () => state.room?.hostId === me.pid;

function ctx() {
  const room = state.room;
  return {
    me: me.pid,
    room,
    round: room?.round,
    player,
    isHost: isHost(),
    now: serverNow,
    send: (a, data = {}) => net.send({ t: 'g', a, ...data }),
    host: (action, data = {}) => net.send({ t: 'host', action, ...data }),
    meta: room?.round ? room.catalog.find((g) => g.id === room.round.gameId) : null,
    toast,
  };
}

// ---- networking -----------------------------------------------------------

net.on('open', () => {
  if (me.code && me.name) {
    state.joining = true;
    net.send({ t: 'join', code: me.code, pid: me.pid, name: me.name, avatar: me.avatar });
  }
});

net.on('status', () => renderHeader());

net.on('message', (msg) => {
  switch (msg.t) {
    case 'state':
      state.offset = msg.now - Date.now();
      state.room = msg.room;
      state.joining = false;
      render();
      break;
    case 'joined':
      me.code = msg.code;
      ls.set('code', msg.code);
      history.replaceState(null, '', `?room=${msg.code}`);
      sensors.keepAwake.enabled = true;
      sensors.keepAwake();
      break;
    case 'error':
      state.joining = false;
      if (msg.code === 'noroom') {
        me.code = null;
        ls.set('code', null);
        state.room = null;
        history.replaceState(null, '', location.pathname);
        render();
      }
      toast(msg.msg);
      break;
    case 'left':
      me.code = null;
      ls.set('code', null);
      state.room = null;
      history.replaceState(null, '', location.pathname);
      render();
      break;
  }
});

// ---- rendering ------------------------------------------------------------

function screenKey() {
  const room = state.room;
  if (!room) return 'home';
  if (room.phase === 'lobby') return 'lobby';
  if (room.phase === 'final') return 'final';
  const r = room.round;
  if (r.step === 'intro') return `intro:${r.id}`;
  if (r.step === 'results') return `results:${r.id}`;
  if (!r.participants.includes(me.pid)) return `spectate:${r.id}`;
  return `game:${r.id}:${r.step}`;
}

function render() {
  renderHeader();
  const roundId = state.room?.round?.id ?? null;
  if (roundId !== state.roundId) {
    // New round (or none): let go of the mic so the indicator turns off.
    if (state.roundId !== null) sensors.releaseMic();
    state.roundId = roundId;
  }
  const key = screenKey();
  if (key !== state.key) {
    try {
      state.screen?.unmount?.();
    } catch (e) {
      console.error(e);
    }
    state.key = key;
    replace(root);
    root.scrollTop = 0;
    window.scrollTo(0, 0);
    const [kind] = key.split(':');
    state.screen = SCREENS[kind](root);
  }
  try {
    state.screen?.update?.(ctx());
  } catch (e) {
    console.error(e);
  }
  tick();
}

function renderHeader() {
  const room = state.room;
  const st = net.status();
  const mine = room?.players.find((p) => p.id === me.pid);
  replace(
    header,
    h('div', { class: 'brand' }, '🐪 Wednesdaze'),
    room ? h('div', { class: 'room-code' }, room.code) : null,
    h('div', { class: 'spacer' }),
    mine ? h('div', { class: 'my-score' }, `${mine.avatar} ${fmt(mine.score)}`) : null,
    h('div', { class: `conn conn-${st}`, title: st }),
  );
  if (st === 'replaced') {
    replace(
      root,
      h(
        'div',
        { class: 'screen center' },
        h('h2', {}, 'Opened somewhere else'),
        h('p', { class: 'muted' }, 'This game is open in another tab or on another device.'),
        h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Use it here instead'),
      ),
    );
    state.key = 'replaced';
  }
}

// Update every countdown on screen a few times a second.
function tick() {
  for (const el of document.querySelectorAll('[data-deadline]')) {
    const left = Math.max(0, Math.ceil((Number(el.dataset.deadline) - serverNow()) / 1000));
    const text = left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : `${left}s`;
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('urgent', left <= 5);
  }
}
setInterval(tick, 250);

// ---- screens --------------------------------------------------------------

const SCREENS = {
  home: homeScreen,
  lobby: lobbyScreen,
  intro: introScreen,
  game: gameScreen,
  spectate: spectateScreen,
  results: resultsScreen,
  final: finalScreen,
};

function homeScreen(el) {
  let avatarChoice = me.avatar;
  const nameInput = h('input', {
    class: 'input',
    placeholder: 'Your name',
    maxLength: 16,
    value: me.name,
    autocomplete: 'nickname',
    enterkeyhint: 'done',
  });
  const codeInput = h('input', {
    class: 'input code-input',
    placeholder: 'CODE',
    maxLength: 4,
    value: inviteCode || '',
    autocapitalize: 'characters',
    autocomplete: 'off',
    oninput: (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '')),
  });
  const grid = h(
    'div',
    { class: 'avatar-grid' },
    AVATARS.map((a) =>
      h('button', {
        class: `avatar-btn ${a === avatarChoice ? 'on' : ''}`,
        onclick: (e) => {
          avatarChoice = a;
          grid.querySelectorAll('.avatar-btn').forEach((b) => b.classList.remove('on'));
          e.currentTarget.classList.add('on');
        },
      }, a),
    ),
  );

  const saveMe = () => {
    const name = nameInput.value.trim();
    if (!name) {
      toast('Pick a name first 🙂');
      nameInput.focus();
      return false;
    }
    me.name = name;
    me.avatar = avatarChoice;
    ls.set('name', name);
    ls.set('avatar', avatarChoice);
    return true;
  };

  const join = () => {
    if (!saveMe()) return;
    const code = codeInput.value.trim();
    if (code.length !== 4) return toast('Room codes are 4 letters.');
    net.send({ t: 'join', code, pid: me.pid, name: me.name, avatar: me.avatar });
  };
  const create = () => {
    if (!saveMe()) return;
    net.send({ t: 'create', pid: me.pid, name: me.name, avatar: me.avatar, settings: savedSettings() });
  };

  const joinBox = h(
    'div',
    { class: 'card' },
    h('h3', {}, inviteCode ? `You're invited to room ${inviteCode}` : 'Join your friends'),
    h('div', { class: 'row' }, codeInput, h('button', { class: 'btn primary', onclick: join }, 'Join')),
  );
  const createBox = h(
    'div',
    { class: 'card' },
    h('h3', {}, 'Hosting tonight?'),
    h('p', { class: 'muted small' }, 'Start a room and send the link to the group chat.'),
    h('button', { class: `btn ${inviteCode ? '' : 'primary'} wide`, onclick: create }, '🎉 Start a new room'),
  );

  replace(
    el,
    h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { class: 'hero' },
        h('div', { class: 'hero-emoji' }, '🐪'),
        h('h1', {}, 'Wednesdaze'),
        h('p', { class: 'muted' }, 'Party games for friends who live too far apart. Laugh, compete, argue, team up.'),
      ),
      h('div', { class: 'card' }, h('h3', {}, 'Who are you?'), nameInput, grid),
      inviteCode ? [joinBox, createBox] : [createBox, joinBox],
      installTip(),
    ),
  );
  const reconnecting = h('div', { class: 'card center muted' }, 'Reconnecting to your room…');
  el.querySelector('.screen').prepend(reconnecting);
  return {
    update() {
      reconnecting.classList.toggle('hidden', !(me.code && me.name));
    },
  };
}

function installTip() {
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (standalone) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return h(
    'details',
    { class: 'card tip' },
    h('summary', {}, '📲 Put it on your home screen'),
    ios
      ? h('p', { class: 'small' }, 'In Safari, tap the Share button, then "Add to Home Screen". It opens full-screen like a real app — no App Store needed.')
      : h('p', { class: 'small' }, 'Open your browser menu and choose "Add to Home screen" / "Install app".'),
  );
}

function lobbyScreen(el) {
  const body = h('div', { class: 'screen' });
  el.append(body);
  // Built once so they stay open/closed while the lobby updates.
  const tips = h(
    'details',
    { class: 'card tip' },
    h('summary', {}, '📞 Tips for long-distance game night'),
    h(
      'ul',
      { class: 'small' },
      h('li', {}, 'Get everyone on a group call — but run the call on a laptop, tablet or TV if you can. Some rounds need your phone\'s mic and camera, and iPhones won\'t share those with a live call.'),
      h('li', {}, 'Turn the ringer/silent switch off for the singing round.'),
      h('li', {}, 'If your phone locks, just open it again — you\'ll drop right back in.'),
    ),
  );
  const install = installTip();
  const leave = h('button', { class: 'btn ghost wide', onclick: () => confirm('Leave this room?') && net.send({ t: 'leave' }) }, 'Leave room');
  let lastSig = null;
  return {
    update(c) {
      const room = c.room;
      const sig = JSON.stringify([room.hostId, c.isHost, room.players, room.settings]);
      if (sig === lastSig) return;
      lastSig = sig;
      const host = player(room.hostId);
      const link = `${location.origin}/?room=${room.code}`;
      const share = async () => {
        const text = `Wednesday game night! Join room ${room.code}`;
        try {
          if (navigator.share) await navigator.share({ title: 'Wednesdaze', text, url: link });
          else {
            await navigator.clipboard.writeText(link);
            toast('Invite link copied!');
          }
        } catch {}
      };
      const players = [...room.players].sort((a, b) => b.score - a.score);
      const rounds = room.settings.rounds;
      const connected = room.players.filter((p) => p.connected).length;
      const nightRounds = room.catalog.filter((g) => g.minPlayers <= connected).reduce((n, g) => n + (rounds[g.id] || 0), 0);
      const setRounds = (id, n) => {
        const next = { ...rounds, [id]: Math.max(0, Math.min(3, n)) };
        ls.set('settings', JSON.stringify({ rounds: next }));
        c.host('settings', { settings: { rounds: next } });
      };
      const anyScore = players.some((p) => p.score > 0);
      replace(
        body,
        h(
          'div',
          { class: 'card center' },
          h('div', { class: 'muted small' }, 'Room code'),
          h('div', { class: 'big-code' }, room.code),
          h('button', { class: 'btn', onclick: share }, '🔗 Send invite link'),
        ),
        h(
          'div',
          { class: 'card' },
          h('h3', {}, `Players (${room.players.length})`, anyScore ? h('span', { class: 'muted small' }, ' · scores') : null),
          h(
            'div',
            { class: 'player-list' },
            players.map((p) =>
              h(
                'div',
                { class: `player-row ${p.connected ? '' : 'offline'}`, onclick: () => c.isHost && p.id !== me.pid && playerMenu(c, p) },
                h('span', { class: 'face' }, p.avatar),
                h('span', { class: 'name' }, p.name, p.id === room.hostId ? ' 👑' : '', p.id === me.pid ? h('span', { class: 'muted' }, ' (you)') : ''),
                h('span', { class: 'spacer' }),
                p.connected ? null : h('span', { class: 'muted small' }, 'away'),
                anyScore ? h('span', { class: 'score' }, fmt(p.score)) : null,
              ),
            ),
          ),
          c.isHost && anyScore ? h('button', { class: 'btn small ghost', onclick: () => c.host('resetScores') }, 'Reset scores') : null,
        ),
        c.isHost
          ? h(
              'div',
              { class: 'card' },
              h('button', { class: 'btn primary huge wide', onclick: () => c.host('start', { game: 'night' }), disabled: !nightRounds }, '🎉 Start the Night'),
              h('p', { class: 'muted small center' }, nightRounds ? `${nightRounds} rounds, about ${nightRounds * MINUTES_PER_ROUND} minutes. Scores reset. Change the lineup below.` : 'Turn on at least one game below.'),
            )
          : h('div', { class: 'card center' }, h('p', {}, `Waiting for ${host?.name ?? 'the host'} to start…`), h('div', { class: 'bounce' }, '⏳')),
        h(
          'div',
          { class: 'card' },
          h('h3', {}, 'Tonight\'s lineup'),
          h('p', { class: 'muted small' }, c.isHost ? 'Set how many rounds of each game the night includes (0 leaves it out). Tap ▶ to play just that game now.' : 'Rounds of each game in tonight\'s night.'),
          h(
            'div',
            { class: 'game-list' },
            room.catalog.map((g) => {
              const tooFew = connected < g.minPlayers;
              const n = rounds[g.id] || 0;
              return h(
                'div',
                { class: `game-card ${n ? '' : 'off'}` },
                h('div', { class: 'game-emoji' }, g.emoji),
                h(
                  'div',
                  { class: 'game-info' },
                  h('div', { class: 'game-name' }, g.name),
                  h('div', { class: 'small muted' }, g.blurb),
                  h('div', { class: 'chips' }, g.tags.map((t) => h('span', { class: `chip tag-${t}` }, TAG_LABELS[t])), g.sensors.map((s) => h('span', { class: 'chip sensor' }, SENSOR_LABELS[s]))),
                  tooFew ? h('div', { class: 'small warn' }, `Needs ${g.minPlayers}+ players`) : null,
                  c.isHost
                    ? h(
                        'div',
                        { class: 'game-controls' },
                        h(
                          'div',
                          { class: 'stepper', role: 'group', 'aria-label': `Rounds of ${g.name}` },
                          h('button', { class: 'btn small', onclick: () => setRounds(g.id, n - 1), disabled: n <= 0, 'aria-label': 'Fewer rounds' }, '−'),
                          h('span', { class: 'stepper-val' }, n ? `${n} round${n > 1 ? 's' : ''}` : 'Off'),
                          h('button', { class: 'btn small', onclick: () => setRounds(g.id, n + 1), disabled: n >= 3, 'aria-label': 'More rounds' }, '+'),
                        ),
                        h('button', { class: 'btn small primary', disabled: tooFew, onclick: () => c.host('start', { game: g.id }) }, `▶ Play${n > 1 ? ` ×${n}` : ''}`),
                      )
                    : h('div', { class: 'small muted' }, n ? `${n} round${n > 1 ? 's' : ''} tonight` : 'Not tonight'),
                ),
              );
            }),
          ),
        ),
        tips,
        install,
        leave,
      );
    },
  };
}

function playerMenu(c, p) {
  const choice = prompt(`${p.avatar} ${p.name}\n\nType "host" to hand them the host controls, or "kick" to remove them.`);
  if (!choice) return;
  if (choice.trim().toLowerCase() === 'host') c.host('makeHost', { pid: p.id });
  if (choice.trim().toLowerCase() === 'kick') c.host('kick', { pid: p.id });
}

function nightBadge(c) {
  const n = c.room.night;
  const rep = c.round?.repeat;
  const parts = [];
  if (n && n.kind === 'night') parts.push(`Round ${n.i + 1} of ${n.total}`);
  if (rep) parts.push(`${c.meta?.name ?? 'Game'} ${rep.k} of ${rep.of}`);
  return parts.length ? h('div', { class: 'night-badge' }, parts.join(' · ')) : null;
}

function hostBar(c, { skipLabel = '⏩ Skip timer' } = {}) {
  if (!c.isHost) return null;
  const queue = c.room.night;
  const moreAfter = queue && queue.list.slice(queue.i).some((id) => id !== c.round?.gameId);
  const skipGameLabel = moreAfter ? '⏭ Next game' : '⏭ Skip game';
  const skipGameAsk = moreAfter ? `Skip the rest of ${c.meta?.name} and move on to the next game?` : `Skip the rest of ${c.meta?.name}?`;
  return h(
    'div',
    { class: 'host-bar', 'aria-label': 'Host controls' },
    c.round?.deadline ? h('button', { class: 'btn small', onclick: () => c.host('skip') }, skipLabel) : null,
    c.round && c.round.step !== 'results' ? h('button', { class: 'btn small', onclick: () => confirm(skipGameAsk) && c.host('skipGame') }, skipGameLabel) : null,
    h('button', { class: 'btn small ghost', onclick: () => confirm('End the night and go back to the lobby?') && c.host('end') }, 'End'),
  );
}

function introScreen(el) {
  // Static parts are built once; only the ready button and ready list
  // change, so a tap never lands on a button that's being swapped out.
  const c0 = ctx();
  const g = c0.meta;
  const mod = MODULES[g.id];
  let preparing = false;
  const errorsBox = h('div');
  const readyBtn = h('button', { class: 'btn huge wide primary pulse', onclick: onReady });
  const readyRow = h('div', { class: 'done-row' });
  const startAnyway = h('div');
  const autoStart = h('div', { class: 'center muted' });
  const footer = h('div');
  const body = h(
    'div',
    { class: 'screen' },
    nightBadge(c0),
    h('div', { class: 'card center intro' }, h('div', { class: 'intro-emoji' }, g.emoji), h('h1', {}, g.name), tagChips(g.tags), h('p', {}, g.blurb)),
    h('div', { class: 'card' }, h('h3', {}, 'How to play'), h('ol', { class: 'howto' }, g.howTo.map((x) => h('li', {}, x)))),
    g.sensors.length ? h('div', { class: 'chips center' }, g.sensors.map((s) => h('span', { class: 'chip sensor' }, `Uses ${SENSOR_LABELS[s]}`))) : null,
    errorsBox,
    autoStart,
    readyBtn,
    readyRow,
    startAnyway,
    footer,
  );
  el.append(body);

  async function onReady() {
    if (preparing) return;
    preparing = true;
    const prep = sensors.prepare(g.needs); // must start inside the tap (iOS)
    render();
    const { errors } = await prep;
    try {
      await mod.prepare?.(ctx());
    } catch (e) {
      errors.push(e.message);
    }
    replace(errorsBox, errors.length ? h('div', { class: 'card warn' }, errors.map((e) => h('p', { class: 'small' }, '⚠️ ', e))) : null);
    preparing = false;
    net.send({ t: 'ready' });
    render();
  }

  let lastSig = null;
  return {
    update(c) {
      const r = c.round;
      const amIn = r.participants.includes(me.pid);
      const ready = r.ready.includes(me.pid);
      readyBtn.classList.toggle('hidden', !amIn);
      readyBtn.disabled = ready || preparing;
      readyBtn.classList.toggle('primary', !ready);
      readyBtn.classList.toggle('pulse', !ready && !preparing);
      readyBtn.textContent = ready ? '✅ Ready!' : preparing ? 'Getting set up…' : g.needs.length ? "👍 I'm ready (allow access)" : "👍 I'm ready";
      const sig = JSON.stringify([r.ready, r.participants, c.isHost, amIn, c.room.players.map((p) => p.connected), r.deadline]);
      if (sig === lastSig) return;
      lastSig = sig;
      replace(autoStart, r.deadline ? ['Same rules as last round. Starting in ', timer(r.deadline), '…'] : null);
      const notReady = r.participants.filter((id) => !r.ready.includes(id) && player(id)?.connected);
      replace(
        readyRow,
        amIn ? null : h('p', { class: 'center muted' }, "You joined mid-round. You're in for the next one!"),
        h('div', { class: 'muted small' }, `Ready: ${r.ready.length}/${r.participants.length}`),
        h('div', { class: 'faces' }, r.participants.map((id) => h('span', { class: `face-dot ${r.ready.includes(id) ? 'done' : ''}` }, player(id)?.avatar ?? '❓'))),
      );
      replace(
        startAnyway,
        c.isHost && notReady.length && r.ready.length
          ? h('button', { class: 'btn wide', onclick: () => c.host('begin') }, `Start without ${notReady.map((id) => player(id)?.name).join(', ')}`)
          : null,
      );
      replace(footer, hostBar(c));
    },
  };
}

function gameScreen(el) {
  const c = ctx();
  const mod = MODULES[c.round.gameId];
  const header = h('div', { class: 'game-head' });
  const body = h('div', { class: 'screen game' });
  const foot = h('div');
  el.append(body);
  body.append(header);
  const inner = h('div', { class: 'game-body' });
  body.append(inner, foot);
  const view = mod.mount(inner, c) || {};
  let lastSig = null;
  return {
    update(c2) {
      const r = c2.round;
      const sig = `${r.deadline}|${c2.isHost}`;
      if (sig !== lastSig) {
        lastSig = sig;
        replace(
          header,
          h('span', { class: 'game-title' }, `${c2.meta.emoji} ${c2.meta.name}`),
          h('span', { class: 'spacer' }),
          r.deadline ? timer(r.deadline) : null,
        );
        replace(foot, hostBar(c2));
      }
      view.update?.(r.view, c2);
    },
    unmount() {
      view.unmount?.();
    },
  };
}

function spectateScreen(el) {
  const body = h('div', { class: 'screen center' });
  el.append(body);
  return {
    update(c) {
      replace(
        body,
        h('div', { class: 'card' }, h('div', { class: 'intro-emoji' }, c.meta.emoji), h('h2', {}, `${c.meta.name} is underway`), h('p', { class: 'muted' }, 'You\'ll jump in next round. Heckle freely.')),
        hostBar(c),
      );
    },
  };
}

function resultsScreen(el) {
  const body = h('div', { class: 'screen' });
  el.append(body);
  let lastSig = null;
  return {
    update(c) {
      // Results don't change once shown, apart from players coming and going.
      const sig = JSON.stringify([c.room.hostId, c.room.players.map((p) => [p.id, p.connected])]);
      if (sig === lastSig) return;
      lastSig = sig;
      const r = c.round;
      const mod = MODULES[r.gameId];
      const pts = r.points || {};
      const rows = Object.keys(pts)
        .map((pid) => ({ p: player(pid), pts: pts[pid] }))
        .filter((x) => x.p)
        .sort((a, b) => b.pts - a.pts);
      const night = c.room.night;
      const lastRound = night && night.i + 1 >= night.total;
      const nextLabel = !night ? '↩ Back to lobby' : lastRound ? (night.kind === 'night' ? '🏆 Final scores' : '↩ Back to lobby') : night.list[night.i + 1] === r.gameId ? '▶ Next round' : '▶ Next game';
      replace(
        body,
        nightBadge(c),
        h('div', { class: 'card center' }, h('div', { class: 'intro-emoji small-emoji' }, c.meta.emoji), h('h2', {}, `${c.meta.name}: results`)),
        mod.results ? mod.results(r.view, c) : null,
        h(
          'div',
          { class: 'card' },
          h('h3', {}, 'Points this round'),
          h(
            'div',
            { class: 'player-list' },
            rows.map(({ p, pts }) =>
              h(
                'div',
                { class: 'player-row' },
                h('span', { class: 'face' }, p.avatar),
                h('span', { class: 'name' }, p.name),
                h('span', { class: 'spacer' }),
                h('span', { class: 'plus' }, `+${fmt(pts)}`),
                h('span', { class: 'score muted' }, fmt(p.score)),
              ),
            ),
          ),
        ),
        c.isHost
          ? h('button', { class: 'btn primary huge wide', onclick: () => c.host('next') }, nextLabel)
          : h('p', { class: 'center muted' }, `Waiting for ${player(c.room.hostId)?.name ?? 'the host'} to continue…`),
      );
    },
  };
}

function finalScreen(el) {
  const body = h('div', { class: 'screen' });
  el.append(body);
  return {
    update(c) {
      const standings = c.room.final.standings;
      const champ = standings[0];
      const medals = ['🥇', '🥈', '🥉'];
      replace(
        body,
        h(
          'div',
          { class: 'card center champion' },
          h('div', { class: 'confetti' }, '🎉🎊🎉'),
          h('div', { class: 'muted' }, 'Wednesday Champion'),
          h('div', { class: 'champ-face' }, champ?.avatar ?? '🐪'),
          h('h1', {}, champ?.name ?? 'Nobody?'),
          h('div', { class: 'big-score' }, `${fmt(champ?.score ?? 0)} pts`),
        ),
        h(
          'div',
          { class: 'card' },
          h(
            'div',
            { class: 'player-list' },
            standings.map((p, i) =>
              h(
                'div',
                { class: 'player-row' },
                h('span', { class: 'rank' }, medals[i] ?? `${i + 1}.`),
                h('span', { class: 'face' }, p.avatar),
                h('span', { class: 'name' }, p.name),
                h('span', { class: 'spacer' }),
                h('span', { class: 'score' }, fmt(p.score)),
              ),
            ),
          ),
        ),
        h('p', { class: 'center muted' }, `Same time next week? Next game night: ${nextWednesday()}.`),
        c.isHost ? h('button', { class: 'btn primary wide', onclick: () => c.host('lobby') }, 'Back to lobby') : null,
      );
    },
  };
}

function nextWednesday() {
  const d = new Date();
  d.setDate(d.getDate() + (((3 - d.getDay() + 7) % 7) || 7));
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

// ---- boot -----------------------------------------------------------------

render();
net.connect();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
