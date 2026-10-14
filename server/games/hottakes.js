const RATE_MS = 30_000;
const DEBATE_MS = 75_000;
const RERATE_MS = 25_000;

const statements = [
  'A hot dog is a sandwich.',
  'Cereal is a soup.',
  'It\'s fine to recline your seat on a plane.',
  'Pineapple belongs on pizza.',
  'Breakfast for dinner beats dinner for dinner.',
  'Replying "k" is a hostile act.',
  'Socks with sandals are acceptable.',
  'Dogs are better than cats.',
  'Water is wet.',
  'Die Hard is a Christmas movie.',
  'Leaving a voicemail in 2026 is rude.',
  'Ranch goes with everything.',
  'Toilet paper goes over, not under.',
  'Showering at night is superior to showering in the morning.',
  'Mint chocolate chip tastes like toothpaste.',
  'Going to the movies alone is the best way to see a movie.',
  'If you\'re early you\'re on time, if you\'re on time you\'re late.',
  'Ketchup on eggs is completely fine.',
  'A taco is a sandwich.',
  'You should be allowed to bring your own snacks to a movie theater.',
  'It\'s okay to wear pajamas to the grocery store.',
  'The best seat on a road trip is the back seat.',
  'Wednesday is the best day of the week.',
  'You should always make your bed in the morning.',
  'Board games are better than video games.',
  'Brunch is overrated.',
  'Calling someone without texting first is unacceptable.',
  'Cold pizza is better than reheated pizza.',
  'Talking to strangers on a plane is fine.',
  'Sleeping with socks on is acceptable behavior.',
  'Pickles are a perfectly good snack on their own.',
  'Splitting the bill evenly is fair even if you only had a salad.',
];

export default {
  id: 'hottakes',
  name: 'Hot Takes',
  emoji: '🌶️',
  tags: ['argue'],
  sensors: [],
  blurb: 'Rate a spicy statement. See who disagrees. Argue. Re-rate. Points for changing minds.',
  howTo: [
    'Rate the statement from 0 (absolutely not) to 10 (obviously yes).',
    'Everyone\'s answers are revealed. The extremes have to defend themselves.',
    'Re-rate after the debate. You earn points for every point someone moved toward your original take.',
  ],
  minPlayers: 2,
  start(r) {
    r.data = { statement: r.freshPrompt(statements), r1: new Map(), r2: new Map() };
    r.setStep('rate1', RATE_MS, () => toDebate(r));
  },
  action(r, pid, msg) {
    if (msg.a !== 'rate' || !r.isIn(pid)) return;
    const v = Math.max(0, Math.min(10, Math.round(Number(msg.v))));
    if (!Number.isFinite(v)) return;
    if (r.step === 'rate1') r.data.r1.set(pid, v);
    else if (r.step === 'rate2') r.data.r2.set(pid, v);
    else return;
    r.touch();
    this.check(r);
  },
  check(r) {
    const active = r.activeIds();
    if (r.step === 'rate1' && active.every((id) => r.data.r1.has(id))) toDebate(r);
    else if (r.step === 'rate2' && active.filter((id) => r.data.r1.has(id)).every((id) => r.data.r2.has(id))) finishUp(r);
  },
  view(r, pid) {
    const d = r.data;
    const base = { statement: d.statement };
    if (r.step === 'rate1') return { ...base, mine: d.r1.get(pid) ?? null, done: [...d.r1.keys()] };
    if (r.step === 'debate') return { ...base, ratings: Object.fromEntries(d.r1), callout: callout(d.r1) };
    if (r.step === 'rate2') return { ...base, first: d.r1.get(pid) ?? null, mine: d.r2.get(pid) ?? null, done: [...d.r2.keys()], ratings: Object.fromEntries(d.r1) };
    if (r.step === 'results') return { ...base, r1: Object.fromEntries(d.r1), r2: Object.fromEntries(d.final), sway: d.sway };
    return base;
  },
};

// Find the juiciest disagreement to put on the spot.
function callout(ratings) {
  const entries = [...ratings.entries()];
  if (entries.length < 2) return null;
  let lo = entries[0];
  let hi = entries[0];
  for (const e of entries) {
    if (e[1] < lo[1]) lo = e;
    if (e[1] > hi[1]) hi = e;
  }
  const mean = entries.reduce((s, e) => s + e[1], 0) / entries.length;
  // A lone wolf: one person far from where everyone else landed.
  let loner = null;
  if (entries.length >= 4) {
    const othersMean = (e) => entries.filter((x) => x !== e).reduce((s, x) => s + x[1], 0) / (entries.length - 1);
    const far = [...entries].sort((a, b) => Math.abs(b[1] - othersMean(b)) - Math.abs(a[1] - othersMean(a)));
    if (Math.abs(far[0][1] - othersMean(far[0])) >= 4) loner = far[0][0];
  }
  return { lo: lo[0], hi: hi[0], gap: hi[1] - lo[1], mean: Math.round(mean * 10) / 10, loner };
}

function toDebate(r) {
  if (r.data.r1.size < 2) return finishUp(r);
  r.setStep('debate', DEBATE_MS, () => r.setStep('rate2', RERATE_MS, () => finishUp(r)));
}

function finishUp(r) {
  const { r1, r2 } = r.data;
  const final = new Map([...r1].map(([pid, v]) => [pid, r2.has(pid) ? r2.get(pid) : v]));
  const sway = {};
  for (const [p, pv] of r1) {
    let moved = 0;
    for (const [q, qv] of r1) {
      if (q === p) continue;
      moved += Math.max(0, Math.abs(qv - pv) - Math.abs(final.get(q) - pv));
    }
    sway[p] = moved;
  }
  r.data.final = final;
  r.data.sway = sway;
  const points = {};
  for (const pid of r.playerIds()) points[pid] = (sway[pid] || 0) * 40 + (r1.has(pid) ? 25 : 0);
  r.finish(points);
}
