import { rand } from '../util.js';

const TOTAL_MS = 100_000;
const HOLD_MS = 3000;
// Each wire is harder: smaller rings that drift faster, then sparks to dodge.
const STAGES = [
  { r: 0.28, drift: 0, speed: 0, sparks: 0 },
  { r: 0.24, drift: 0.28, speed: 1, sparks: 0 },
  { r: 0.22, drift: 0.32, speed: 1.6, sparks: 2 },
  { r: 0.2, drift: 0.38, speed: 2.2, sparks: 3 },
];

export default {
  id: 'bomb',
  name: 'Bomb Squad',
  emoji: '💣',
  tags: ['team'],
  sensors: ['tilt'],
  needs: ['motion', 'orientation'],
  blurb: 'Everyone tilts their phone to hold a ball in a target. All of you, at the same time, or it goes boom.',
  howTo: [
    'Hold your phone flat like a tray. Tilt to roll the ball into your ring. It slides, so be gentle.',
    'A wire only gets cut while EVERYONE is in their ring at once, for 3 seconds straight.',
    'Four wires. The rings start moving, then sparks fly. A spark knocks your ball away. Yell at each other.',
  ],
  minPlayers: 1,
  start(r) {
    r.data = { stage: 0, holdMs: 0, status: new Map(), targets: new Map(), outcome: null, endAt: Date.now() + TOTAL_MS };
    newStage(r);
    r.setStep('play', TOTAL_MS, () => end(r, false));
    r.every(100, () => tick(r));
  },
  action(r, pid, msg) {
    if (r.step !== 'play' || msg.a !== 'zone' || !r.isIn(pid)) return;
    if (msg.stage !== r.data.stage) return;
    const inZone = !!msg.in;
    if (r.data.status.get(pid) !== inZone) {
      r.data.status.set(pid, inZone);
      r.touch();
    }
  },
  view(r, pid) {
    const d = r.data;
    return {
      stage: d.stage,
      stages: STAGES.length,
      holdMs: d.holdMs,
      needMs: HOLD_MS,
      endAt: d.endAt,
      target: d.targets?.get(pid) ?? null,
      status: Object.fromEntries(r.playerIds().map((id) => [id, !!d.status?.get(id)])),
      outcome: d.outcome,
    };
  },
};

function newStage(r) {
  const s = STAGES[r.data.stage];
  r.data.status = new Map();
  r.data.holdMs = 0;
  for (const pid of r.playerIds()) {
    const lim = 0.62 - s.r;
    r.data.targets.set(pid, { x: rand(-lim, lim), y: rand(-lim, lim), r: s.r, drift: s.drift, speed: s.speed, sparks: s.sparks, seed: Math.random() * 1000 });
  }
  r.touch();
}

function tick(r) {
  const d = r.data;
  const active = r.activeIds();
  const allIn = active.length > 0 && active.every((id) => d.status.get(id));
  const before = d.holdMs;
  d.holdMs = allIn ? d.holdMs + 100 : Math.max(0, d.holdMs - 400);
  if (d.holdMs >= HOLD_MS) {
    d.stage++;
    if (d.stage >= STAGES.length) return end(r, true);
    newStage(r);
  } else if (d.holdMs !== before) r.touch();
}

function end(r, success) {
  r.data.outcome = success ? 'defused' : 'boom';
  const points = {};
  for (const pid of r.playerIds()) points[pid] = success ? 300 : 60 * r.data.stage;
  r.finish(points);
}
