import { rankPoints } from '../util.js';

const COUNTDOWN_MS = 4000;
const SHAKE_MS = 10_000;
const GRACE_MS = 1500;
const MAX_SCORE = 100_000;

export default {
  id: 'shake',
  name: 'Shake Down',
  emoji: '🫨',
  tags: ['compete'],
  sensors: ['motion'],
  needs: ['motion'],
  blurb: '10 seconds. Shake your phone harder than anyone else. Hold on tight.',
  howTo: [
    'When the countdown hits zero, shake your phone like it owes you money.',
    'Live scores for everyone show up on screen.',
    'Grip it firmly. Nobody wants to explain a cracked screen.',
  ],
  minPlayers: 1,
  start(r) {
    const startAt = Date.now() + COUNTDOWN_MS;
    r.data = { startAt, endAt: startAt + SHAKE_MS, scores: new Map() };
    r.setStep('play', COUNTDOWN_MS + SHAKE_MS + GRACE_MS, () => finishUp(r));
  },
  action(r, pid, msg) {
    if (r.step !== 'play' || msg.a !== 'shake' || !r.isIn(pid)) return;
    const now = Date.now();
    if (now < r.data.startAt - 500 || now > r.data.endAt + GRACE_MS) return;
    const value = Math.min(MAX_SCORE, Math.max(0, Number(msg.value) || 0));
    r.data.scores.set(pid, Math.max(r.data.scores.get(pid) || 0, value));
    r.touch();
  },
  view(r) {
    const d = r.data;
    return {
      startAt: d.startAt,
      endAt: d.endAt,
      scores: Object.fromEntries([...(d.scores ?? [])].map(([k, v]) => [k, Math.round(v)])),
    };
  },
};

function finishUp(r) {
  const entries = r.playerIds().map((pid) => ({ pid, value: Math.round(r.data.scores.get(pid) || 0) }));
  r.finish(rankPoints(entries));
}
