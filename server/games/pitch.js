import { rankPoints, shuffle } from '../util.js';

const SING_MS = 110_000;

// MIDI 55 (G3) to 66 (F#4): comfy for most voices; scoring ignores octave.
const noteFreq = (midi) => 440 * 2 ** ((midi - 69) / 12);
const randomMidi = () => 55 + Math.floor(Math.random() * 12);
const randomNote = () => noteFreq(randomMidi());
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

export const noteScore = (c) => (c === null ? 0 : Math.max(0, Math.round(100 - c / 2)));

// Moving targets for Siren Song. The phone turns each one into a pitch curve.
function sirenPhrases() {
  const glide = () => {
    const from = randomMidi();
    const to = from + (Math.random() < 0.5 ? -1 : 1) * randInt(5, 9);
    return { type: 'glide', from: noteFreq(from), to: noteFreq(to), ms: 3000 };
  };
  const steps = () => {
    const a = randomMidi();
    return { type: 'steps', notes: [a, a + randInt(2, 5), a + randInt(-4, 7)].map(noteFreq), ms: 3000 };
  };
  const wave = () => ({ type: 'wave', center: noteFreq(randomMidi() + 2), depth: randInt(2, 4), period: 1.5, ms: 3000 });
  return shuffle([glide(), steps(), wave()]);
}

function pitchGame({ mode, ...meta }) {
  const finishUp = (r) => {
    const n = r.data.targets.length;
    const rows = r.playerIds().map((pid) => {
      const res = r.data.results.get(pid);
      const scores = res ? res.scores : Array(n).fill(0);
      return { pid, cents: res?.cents ?? null, scores, total: scores.reduce((a, b) => a + b, 0) };
    });
    rows.sort((a, b) => b.total - a.total);
    r.data.rows = rows;
    const bonus = rankPoints(rows.map((x) => ({ pid: x.pid, value: x.total })), [100, 50, 25]);
    const points = {};
    for (const row of rows) points[row.pid] = row.total + (bonus[row.pid] || 0);
    r.finish(points);
  };

  return {
    ...meta,
    sensors: ['mic'],
    needs: ['mic', 'audio'],
    minPlayers: 1,
    start(r) {
      const targets = mode === 'siren' ? sirenPhrases() : [randomNote(), randomNote(), randomNote()];
      r.data = { targets, results: new Map() };
      r.setStep('sing', SING_MS, () => finishUp(r));
    },
    action(r, pid, msg) {
      if (r.step !== 'sing' || msg.a !== 'result' || !r.isIn(pid)) return;
      const n = r.data.targets.length;
      const clean = (arr, fn) => (Array.isArray(arr) ? arr.slice(0, n) : []).map(fn);
      let res;
      if (mode === 'siren') {
        // Siren Song phones send a 0-100 score per phrase.
        const scores = clean(msg.scores, (x) => Math.max(0, Math.min(100, Math.round(Number(x) || 0))));
        res = { scores, cents: null };
      } else {
        const cents = clean(msg.cents, (c) => (c === null || !Number.isFinite(Number(c)) ? null : Math.min(600, Math.abs(Number(c)))));
        res = { cents, scores: cents.map(noteScore) };
      }
      while (res.scores.length < n) res.scores.push(0);
      r.data.results.set(pid, res);
      r.touch();
      this.check(r);
    },
    check(r) {
      if (r.step === 'sing' && r.activeIds().every((id) => r.data.results.has(id))) finishUp(r);
    },
    view(r, pid) {
      const d = r.data;
      if (r.step === 'sing') return { mode, targets: d.targets, done: [...d.results.keys()], mine: d.results.get(pid) ?? null };
      if (r.step === 'results') return { mode, rows: d.rows };
      return { mode };
    },
  };
}

export default pitchGame({
  mode: 'notes',
  id: 'pitch',
  name: 'Pitch Imperfect',
  emoji: '🎶',
  tags: ['compete', 'laugh'],
  blurb: 'Your phone plays a note. You sing it back. Your phone judges you.',
  howTo: [
    'Turn your volume up (and silent mode off). You\'ll hear a note, then sing it back.',
    'Hum, sing, whistle — anything with a pitch. Any octave counts.',
    'Three notes. Up to 100 points each for nailing it.',
  ],
});

export const siren = pitchGame({
  mode: 'siren',
  id: 'siren',
  name: 'Siren Song',
  emoji: '🚨',
  tags: ['compete', 'laugh'],
  blurb: 'Hard mode. The note slides, jumps and wobbles. Follow it with your voice.',
  howTo: [
    'Watch the yellow line and listen as the phone plays the tune.',
    'Then sing it back while the line scrolls. Your voice shows up as dots.',
    'Three phrases: a slide, some jumps, and a wobble. Any octave counts.',
  ],
});
