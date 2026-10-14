import { rankPoints } from '../util.js';

const SING_MS = 100_000;
const NOTES = 3;

// MIDI 55 (G3) to 66 (F#4): comfy for most voices; scoring ignores octave.
const randomNote = () => 440 * 2 ** ((55 + Math.floor(Math.random() * 12) - 69) / 12);

export default {
  id: 'pitch',
  name: 'Pitch Imperfect',
  emoji: '🎶',
  tags: ['compete', 'laugh'],
  sensors: ['mic'],
  needs: ['mic', 'audio'],
  blurb: 'Your phone plays a note. You sing it back. Your phone judges you.',
  howTo: [
    'Turn your volume up (and silent mode off). You\'ll hear a note, then sing it back.',
    'Hum, sing, whistle — anything with a pitch. Any octave counts.',
    'Three notes. Up to 100 points each for nailing it.',
  ],
  minPlayers: 1,
  start(r) {
    r.data = { notes: Array.from({ length: NOTES }, randomNote), results: new Map() };
    r.setStep('sing', SING_MS, () => finishUp(r));
  },
  action(r, pid, msg) {
    if (r.step !== 'sing' || msg.a !== 'result' || !r.isIn(pid) || !Array.isArray(msg.cents)) return;
    const cents = msg.cents.slice(0, NOTES).map((c) => (c === null || !Number.isFinite(Number(c)) ? null : Math.min(600, Math.abs(Number(c)))));
    r.data.results.set(pid, cents);
    r.touch();
    this.check(r);
  },
  check(r) {
    if (r.step === 'sing' && r.activeIds().every((id) => r.data.results.has(id))) finishUp(r);
  },
  view(r, pid) {
    const d = r.data;
    if (r.step === 'sing') return { notes: d.notes, done: [...d.results.keys()], mine: d.results.get(pid) ?? null };
    if (r.step === 'results') return { rows: d.rows };
    return {};
  },
};

export const noteScore = (c) => (c === null ? 0 : Math.max(0, Math.round(100 - c / 2)));

function finishUp(r) {
  const rows = r.playerIds().map((pid) => {
    const cents = r.data.results.get(pid) ?? Array(NOTES).fill(null);
    const scores = cents.map(noteScore);
    return { pid, cents, scores, total: scores.reduce((a, b) => a + b, 0) };
  });
  rows.sort((a, b) => b.total - a.total);
  r.data.rows = rows;
  const points = {};
  const bonus = rankPoints(rows.map((x) => ({ pid: x.pid, value: x.total })), [100, 50, 25]);
  for (const row of rows) points[row.pid] = row.total + (bonus[row.pid] || 0);
  r.finish(points);
}
