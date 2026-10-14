export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const rand = (lo, hi) => lo + Math.random() * (hi - lo);

export const randomId = (len = 12) => {
  const chars = 'abcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

// Hand out points by finishing position. Ties share the better position.
export const rankPoints = (entries, table = [300, 200, 150, 100, 75, 50, 40, 30, 20, 10]) => {
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const points = {};
  let lastValue = null;
  let lastRank = 0;
  sorted.forEach((e, i) => {
    const rank = e.value === lastValue ? lastRank : i;
    lastValue = e.value;
    lastRank = rank;
    points[e.pid] = e.value > 0 && rank < table.length ? table[rank] : 0;
  });
  return points;
};

// An error whose message is safe and useful to show the player.
export class UserError extends Error {}
