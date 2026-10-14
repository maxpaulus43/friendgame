const PLAY_MS = 90_000;
const COLLIDE_MS = 800;

export default {
  id: 'countup',
  name: 'Count Up',
  emoji: '🔢',
  tags: ['team', 'laugh'],
  sensors: [],
  blurb: 'Count to the target as a team, one tap at a time. Two taps too close together and it\'s back to zero.',
  howTo: [
    'Anyone can tap the next number, but nobody can go twice in a row.',
    'If two people tap within a split second of each other: collision, back to zero.',
    'No taking turns in order and no planning out loud. (We can\'t stop you. But we\'ll know.)',
  ],
  minPlayers: 2,
  start(r) {
    const target = Math.max(10, Math.min(25, r.playerIds().length * 4));
    r.data = { target, n: 0, best: 0, last: null, collisions: [], outcome: null, endAt: Date.now() + PLAY_MS };
    r.setStep('play', PLAY_MS, () => end(r, false));
  },
  action(r, pid, msg) {
    if (r.step !== 'play' || msg.a !== 'tap' || !r.isIn(pid)) return;
    const d = r.data;
    const now = Date.now();
    if (d.last && d.last.pid === pid) return;
    if (d.last && now - d.last.t < COLLIDE_MS) {
      d.collisions.push({ a: d.last.pid, b: pid, at: d.n, t: now });
      d.n = 0;
      d.last = null;
      r.touch();
      return;
    }
    d.n++;
    d.best = Math.max(d.best, d.n);
    d.last = { pid, t: now };
    r.touch();
    if (d.n >= d.target) end(r, true);
  },
  view(r) {
    const d = r.data;
    return {
      target: d.target,
      n: d.n,
      best: d.best,
      lastPid: d.last?.pid ?? null,
      collisions: d.collisions?.slice(-3) ?? [],
      totalCollisions: d.collisions?.length ?? 0,
      endAt: d.endAt,
      outcome: d.outcome,
    };
  },
};

function end(r, success) {
  r.data.outcome = success ? 'win' : 'fail';
  const points = {};
  for (const pid of r.playerIds()) points[pid] = success ? 200 : r.data.best * 8;
  r.finish(points);
}
