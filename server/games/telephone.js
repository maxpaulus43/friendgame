import { shuffle, UserError } from '../util.js';

const WRITE_MS = 60_000;
const DRAW_MS = 90_000;
const GUESS_MS = 45_000;
const MAX_HOPS = 8;
const MAX_TEXT = 100;
const MAX_IMAGE = 1_500_000;

const starters = [
  'A cat running for mayor',
  'Grandma at a rave',
  'A shark afraid of water',
  'The world\'s saddest birthday party',
  'A dog doing taxes',
  'Aliens visiting a Walmart',
  'A haunted toaster',
  'Two snails racing',
  'A pirate stuck in traffic',
  'A cowboy riding a giant chicken',
  'A wizard who lost his wand',
  'A burrito on vacation',
  'The moon eating spaghetti',
  'A very confident potato',
  'A raccoon stealing a car',
  'A ghost going to the gym',
];

// Chains pass along the circle: whoever starts chain c writes, the next
// person draws it, the next guesses the drawing, and so on.
export default {
  id: 'telephone',
  name: 'Doodle Telephone',
  emoji: '🖍️',
  tags: ['laugh'],
  sensors: [],
  blurb: 'Write a phrase, draw someone else\'s, guess someone\'s drawing. Then watch how far every story drifted.',
  howTo: [
    'Everyone writes a short phrase. It\'s passed to the next person, who draws it.',
    'The drawing goes to the next person, who guesses what it is. Then someone draws that guess…',
    'At the end, flip through every chain together and see how wrong it all went.',
  ],
  minPlayers: 3,
  start(r) {
    const order = shuffle(r.playerIds());
    const hops = Math.min(order.length, MAX_HOPS);
    r.data = { order, hops, hop: 0, chains: order.map((owner) => ({ owner, entries: [] })), reveal: { chain: 0, idx: 0 } };
    startHop(r);
  },
  action(r, pid, msg) {
    const d = r.data;
    if (msg.a === 'reveal') {
      if (r.step !== 'reveal' || pid !== r.room.effectiveHost()) return;
      return advanceReveal(r);
    }
    if (msg.a !== 'submit' || !['write', 'draw', 'guess'].includes(r.step)) return;
    const c = chainFor(r, pid);
    if (c === null) return;
    const kind = kindOf(d.hop);
    let entry;
    if (kind === 'draw') {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(msg.data || '');
      if (!m) throw new UserError('That drawing didn\'t upload. Try again?');
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > MAX_IMAGE) throw new UserError('That drawing is too big.');
      entry = { pid, kind, mediaId: r.putMedia(buf, m[1]) };
    } else {
      const text = String(msg.text ?? '').trim().slice(0, MAX_TEXT);
      if (!text) return;
      entry = { pid, kind, text };
    }
    d.chains[c].entries[d.hop] = entry;
    r.touch();
    this.check(r);
  },
  check(r) {
    if (!['write', 'draw', 'guess'].includes(r.step)) return;
    const d = r.data;
    const done = r.activeIds().filter((id) => d.order.includes(id)).every((id) => d.chains[chainFor(r, id)].entries[d.hop]);
    if (done) endHop(r);
  },
  view(r, pid) {
    const d = r.data;
    if (r.step === 'reveal' || r.step === 'results') {
      return {
        chains: d.chains.map((ch) => ({ owner: ch.owner, entries: ch.entries.map((e) => publicEntry(r, e)) })),
        reveal: d.reveal,
      };
    }
    const kind = kindOf(d.hop);
    const c = chainFor(r, pid);
    const base = { hop: d.hop, hops: d.hops, kind, done: doneIds(r) };
    if (c === null) return base;
    const prev = d.hop > 0 ? publicEntry(r, d.chains[c].entries[d.hop - 1]) : null;
    return { ...base, prev, submitted: !!d.chains[c].entries[d.hop], suggestion: d.hop === 0 ? starters[(d.order.indexOf(pid) + r.id) % starters.length] : null };
  },
};

// Hop 0 writes, odd hops draw, even hops guess.
const kindOf = (hop) => (hop === 0 ? 'write' : hop % 2 ? 'draw' : 'guess');

function chainFor(r, pid) {
  const { order, hop } = r.data;
  const i = order.indexOf(pid);
  if (i < 0) return null;
  const n = order.length;
  return (((i - hop) % n) + n) % n;
}

function doneIds(r) {
  const d = r.data;
  return d.order.filter((id) => d.chains[chainFor(r, id)].entries[d.hop]);
}

function publicEntry(r, e) {
  if (!e) return null;
  return { pid: e.pid, kind: e.kind, text: e.text ?? null, url: e.mediaId ? r.mediaUrl(e.mediaId) : null, missing: !!e.missing };
}

function startHop(r) {
  const kind = kindOf(r.data.hop);
  const ms = kind === 'write' ? WRITE_MS : kind === 'draw' ? DRAW_MS : GUESS_MS;
  r.setStep(kind, ms, () => endHop(r));
}

function endHop(r) {
  const d = r.data;
  // Anyone who ran out of time leaves a gap the next person has to improvise around.
  for (const ch of d.chains) {
    if (!ch.entries[d.hop]) {
      const pid = d.order[(d.order.indexOf(ch.owner) + d.hop) % d.order.length];
      ch.entries[d.hop] = { pid, kind: kindOf(d.hop), text: null, missing: true };
    }
  }
  d.hop++;
  if (d.hop < d.hops) return startHop(r);
  d.reveal = { chain: 0, idx: 0 };
  // No timer: the host flips through. Their "skip" also flips a page.
  const flip = () => {
    advanceReveal(r);
    if (r.step === 'reveal') r.onTimeout = flip;
  };
  r.setStep('reveal', 0, flip);
}

function advanceReveal(r) {
  const d = r.data;
  const rv = d.reveal;
  if (rv.idx + 1 < d.chains[rv.chain].entries.length) rv.idx++;
  else if (rv.chain + 1 < d.chains.length) d.reveal = { chain: rv.chain + 1, idx: 0 };
  else return finishUp(r);
  r.touch();
}

function finishUp(r) {
  const d = r.data;
  const points = {};
  // Everyone who played their part scores; a chain that made it all the way scores its starter a bonus.
  for (const ch of d.chains) {
    for (const e of ch.entries) if (e && !e.missing) points[e.pid] = (points[e.pid] || 0) + 40;
    if (ch.entries.every((e) => e && !e.missing)) points[ch.owner] = (points[ch.owner] || 0) + 50;
  }
  r.finish(points);
}
