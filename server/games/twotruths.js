import { shuffle } from '../util.js';

const WRITE_MS = 150_000;
const GUESS_MS = 50_000;
const REVEAL_MS = 12_000;
const MAX_LEN = 120;

export default {
  id: 'twotruths',
  name: 'Two Truths & a Lie',
  emoji: '🤥',
  tags: ['argue', 'laugh'],
  sensors: [],
  blurb: 'Write two true things about yourself and one lie. Everyone grills you, then guesses the lie.',
  howTo: [
    'Write three things about yourself. Two true, one lie. Mark which one is the lie.',
    'One by one, everyone sees your three. They can interrogate you on the call before guessing.',
    '+100 for spotting a lie. +75 for every friend your lie fools.',
  ],
  minPlayers: 2,
  start(r) {
    r.data = { sets: new Map(), queue: [], qi: 0, guesses: new Map() };
    r.setStep('write', WRITE_MS, () => toGuessing(r));
  },
  action(r, pid, msg) {
    if (!r.isIn(pid)) return;
    const d = r.data;
    if (r.step === 'write' && msg.a === 'submit') {
      const statements = (Array.isArray(msg.statements) ? msg.statements : []).slice(0, 3).map((x) => String(x ?? '').trim().slice(0, MAX_LEN));
      const lie = Number(msg.lie);
      if (statements.length !== 3 || statements.some((x) => !x) || ![0, 1, 2].includes(lie)) return;
      // Shuffle once so the lie isn't always in the spot you typed it.
      const order = shuffle([0, 1, 2]);
      d.sets.set(pid, { statements: order.map((i) => statements[i]), lie: order.indexOf(lie) });
      r.touch();
      this.check(r);
    } else if (r.step === 'guess' && msg.a === 'guess' && pid !== currentAuthor(r) && [0, 1, 2].includes(Number(msg.i))) {
      d.guesses.get(currentAuthor(r)).set(pid, Number(msg.i));
      r.touch();
      this.check(r);
    }
  },
  check(r) {
    const d = r.data;
    if (r.step === 'write' && r.activeIds().every((id) => d.sets.has(id))) toGuessing(r);
    else if (r.step === 'guess') {
      const author = currentAuthor(r);
      const g = d.guesses.get(author);
      if (r.activeIds().filter((id) => id !== author).every((id) => g.has(id))) reveal(r);
    }
  },
  view(r, pid) {
    const d = r.data;
    if (r.step === 'write') return { submitted: d.sets.has(pid), done: [...d.sets.keys()] };
    const author = currentAuthor(r);
    const set = d.sets.get(author);
    const g = d.guesses.get(author) ?? new Map();
    const base = { author, statements: set?.statements ?? [], qi: d.qi, total: d.queue.length };
    if (r.step === 'guess') return { ...base, myGuess: g.get(pid) ?? null, done: [...g.keys()] };
    if (r.step === 'reveal') return { ...base, lie: set.lie, guesses: Object.fromEntries(g) };
    if (r.step === 'results') return { fooled: d.fooled };
    return base;
  },
};

const currentAuthor = (r) => r.data.queue[r.data.qi];

function toGuessing(r) {
  const d = r.data;
  d.queue = shuffle([...d.sets.keys()]);
  for (const id of d.queue) d.guesses.set(id, new Map());
  if (!d.queue.length) return finishUp(r);
  d.qi = 0;
  ask(r);
}

function ask(r) {
  r.setStep('guess', GUESS_MS, () => reveal(r));
}

function reveal(r) {
  r.setStep('reveal', REVEAL_MS, () => {
    if (r.data.qi + 1 < r.data.queue.length) {
      r.data.qi++;
      ask(r);
    } else finishUp(r);
  });
}

function finishUp(r) {
  const d = r.data;
  const points = {};
  const fooled = {};
  for (const author of d.queue) {
    const { lie } = d.sets.get(author);
    for (const [guesser, i] of d.guesses.get(author)) {
      if (i === lie) points[guesser] = (points[guesser] || 0) + 100;
      else {
        points[author] = (points[author] || 0) + 75;
        fooled[author] = (fooled[author] || 0) + 1;
      }
    }
  }
  d.fooled = fooled;
  r.finish(points);
}
