import { shuffle, randInt } from '../util.js';

const CLUE_MS = 60_000;
const GUESS_MS = 50_000;
const REVEAL_MS = 12_000;
const MAX_TURNS = 5;

const spectrums = [
  ['Cold', 'Hot'],
  ['Overrated', 'Underrated'],
  ['Bad movie', 'Good movie'],
  ['Smells bad', 'Smells good'],
  ['Useless', 'Useful'],
  ['Breakfast food', 'Dinner food'],
  ['Normal pet', 'Weird pet'],
  ['Tastes bad', 'Tastes good'],
  ['Sad song', 'Happy song'],
  ['Villain', 'Hero'],
  ['For kids', 'For grown-ups'],
  ['Cheap', 'Expensive'],
  ['Rare', 'Common'],
  ['Forgettable', 'Iconic'],
  ['Unhealthy', 'Healthy'],
  ['Boring hobby', 'Exciting hobby'],
  ['Low effort', 'High effort'],
  ['Trashy', 'Classy'],
  ['Quiet', 'Loud'],
  ['Scary', 'Cute'],
  ['Weird thing to say on a first date', 'Normal thing to say on a first date'],
  ['Mildly annoying', 'Infuriating'],
  ['Easy to do drunk', 'Hard to do drunk'],
  ['Nobody owns one', 'Everybody owns one'],
  ['Bad superpower', 'Great superpower'],
  ['Dying trend', 'Here to stay'],
];

// Points for how close a guess lands to the target (0-100 scale).
export const closeness = (guess, target) => {
  const off = Math.abs(guess - target);
  if (off <= 5) return 100;
  if (off <= 12) return 60;
  if (off <= 20) return 30;
  return 0;
};

export default {
  id: 'spectrum',
  name: 'Spectrum',
  emoji: '🎚️',
  tags: ['team', 'argue'],
  sensors: [],
  blurb: 'One person sees a secret spot on a scale and gives a one-line clue. Everyone else argues about where it lands.',
  howTo: [
    'The clue-giver sees a scale (like Cold ↔ Hot) and a secret target on it, then types a clue: "soup"? "a sauna"?',
    'Everyone else talks it out on the call and drags the dial to where they think the target is.',
    'Close guesses score. The clue-giver scores the average of everyone\'s guesses. Everyone takes a turn.',
  ],
  minPlayers: 2,
  start(r) {
    const givers = shuffle(r.playerIds()).slice(0, MAX_TURNS);
    r.data = { givers, turn: 0, turns: [] };
    newTurn(r);
  },
  action(r, pid, msg) {
    if (!r.isIn(pid)) return;
    const t = cur(r);
    if (r.step === 'clue' && msg.a === 'clue' && pid === t.giver) {
      const clue = String(msg.clue ?? '').trim().slice(0, 80);
      if (!clue) return;
      t.clue = clue;
      r.setStep('guess', GUESS_MS, () => reveal(r));
    } else if (r.step === 'guess' && msg.a === 'guess' && pid !== t.giver) {
      const v = Math.round(Number(msg.v));
      if (!Number.isFinite(v)) return;
      t.guesses.set(pid, Math.max(0, Math.min(100, v)));
      r.touch();
      this.check(r);
    }
  },
  check(r) {
    const t = cur(r);
    if (r.step === 'guess' && r.activeIds().filter((id) => id !== t.giver).every((id) => t.guesses.has(id))) reveal(r);
  },
  view(r, pid) {
    const d = r.data;
    const t = cur(r);
    if (r.step === 'results') return { turns: d.turns.map(publicTurn) };
    const isGiver = pid === t.giver;
    const base = { turn: d.turn, total: d.givers.length, giver: t.giver, left: t.left, right: t.right, clue: t.clue, isGiver };
    if (r.step === 'clue') return { ...base, target: isGiver ? t.target : null };
    if (r.step === 'guess') return { ...base, target: isGiver ? t.target : null, myGuess: t.guesses.get(pid) ?? null, done: [...t.guesses.keys()] };
    return { ...base, ...publicTurn(t) };
  },
};

const cur = (r) => r.data.turns[r.data.turn];

const publicTurn = (t) => ({ giver: t.giver, left: t.left, right: t.right, clue: t.clue, target: t.target, guesses: Object.fromEntries(t.guesses), points: t.points });

function newTurn(r) {
  const d = r.data;
  const [left, right] = r.room.freshPrompt('spectrum', spectrums);
  d.turns[d.turn] = { giver: d.givers[d.turn], left, right, target: randInt(5, 95), clue: null, guesses: new Map(), points: {} };
  r.setStep('clue', CLUE_MS, () => skipTurn(r));
}

// The clue-giver ran out of time or left: no points this turn.
function skipTurn(r) {
  cur(r).clue = cur(r).clue ?? '(no clue given)';
  nextTurn(r);
}

function reveal(r) {
  const t = cur(r);
  const scores = [...t.guesses].map(([pid, v]) => [pid, closeness(v, t.target)]);
  for (const [pid, pts] of scores) t.points[pid] = pts;
  t.points[t.giver] = scores.length ? Math.round(scores.reduce((s, [, p]) => s + p, 0) / scores.length) : 0;
  r.setStep('reveal', REVEAL_MS, () => nextTurn(r));
}

function nextTurn(r) {
  const d = r.data;
  if (d.turn + 1 < d.givers.length) {
    d.turn++;
    return newTurn(r);
  }
  const points = {};
  for (const t of d.turns) for (const [pid, p] of Object.entries(t.points)) points[pid] = (points[pid] || 0) + p;
  r.finish(points);
}
