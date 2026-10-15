import { h, replace, card, doneRow, sleep } from '../ui.js';
import * as sensors from '../sensors.js';

// Pitch Imperfect (mode 'notes') and Siren Song (mode 'siren').

const LISTEN_MS = 1500;
const SING_MS = 4000;
const SETTLE_MS = 600; // ignore the first bit while you find the note
const SAMPLE_MS = 33;
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const PHRASE_NAMES = { glide: 'The slide', steps: 'The jumps', wave: 'The wobble' };

const noteName = (f) => NOTE_NAMES[(((Math.round(12 * Math.log2(f / 440)) + 69) % 12) + 12) % 12];
const centsScore = (c) => (c === null ? 0 : Math.max(0, Math.round(100 - c / 2)));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

const judgeCents = (c) => {
  if (c === null) return 'We heard nothing. 🦗';
  if (c < 15) return 'Perfect pitch?! 🤯';
  if (c < 40) return 'Nailed it 🎯';
  if (c < 80) return 'Pretty close 👍';
  if (c < 140) return 'Karaoke energy 🎤';
  if (c < 220) return 'Enthusiastic 🦆';
  return 'A brave choice 🐐';
};
const judgeScore = (s) => {
  if (s >= 85) return 'Human theremin 🤯';
  if (s >= 65) return 'Smooth 🎯';
  if (s >= 45) return 'Hanging on 👍';
  if (s >= 25) return 'Lost the plot 🦆';
  if (s > 0) return 'Abstract art 🐐';
  return 'Silence 🦗';
};

// A phrase's target frequency at t seconds.
export function phraseFn(p) {
  const T = p.ms / 1000;
  if (p.type === 'glide') return (t) => p.from * (p.to / p.from) ** Math.min(1, Math.max(0, t / T));
  if (p.type === 'steps') return (t) => p.notes[Math.min(p.notes.length - 1, Math.max(0, Math.floor(t / (T / p.notes.length))))];
  return (t) => p.center * 2 ** ((p.depth * Math.sin((2 * Math.PI * t) / p.period)) / 12);
}

export default {
  mount(el, c) {
    const v = c.round.view;
    const siren = v.mode === 'siren';
    const targets = v.targets;
    const results = []; // cents (notes) or scores (siren)
    let running = false;
    let cancelled = false;
    let submitted = !!v.mine;
    let tracker = null;
    let onSample = null; // current phase's handler for each mic reading
    let quietSince = 0;

    const stage = h('div', { class: 'card center pitch-stage' });
    const meter = h('div', { class: 'pitch-meter hidden' }, h('div', { class: 'pitch-target' }), h('div', { class: 'pitch-needle' }), h('span', { class: 'lab hi' }, 'too high'), h('span', { class: 'lab lo' }, 'too low'));
    const needle = meter.querySelector('.pitch-needle');
    const canvas = h('canvas', { class: 'siren-canvas hidden', height: 220 });
    const levelFill = h('div', { class: 'fill' });
    const level = h('div', { class: 'level-row' }, h('span', { class: 'small muted' }, '🎤 Mic'), h('div', { class: 'bar level' }, levelFill));
    const hint = h('p', { class: 'center small warn' });
    const log = h('div');
    const status = h('div');
    const startBtn = h('button', { class: 'btn primary huge wide', onclick: () => run() }, siren ? '🚨 Start' : '🎵 Start singing');

    replace(el, stage, meter, canvas, level, hint, log, startBtn, status);
    replace(
      stage,
      h('div', { class: 'intro-emoji' }, siren ? '🚨' : '🎶'),
      h('p', {}, 'Volume up, silent mode off.'),
      h('p', { class: 'muted small' }, 'Mic check: hum something. The bar below should jump. If it doesn\'t, a call might be using your mic.'),
    );

    // One sampling loop feeds the level bar and whatever phase is running.
    const timer = setInterval(() => {
      if (!tracker) return;
      const r = tracker.read();
      levelFill.style.width = `${Math.min(100, r.rms * 900)}%`;
      onSample?.(r);
    }, SAMPLE_MS);

    async function attachMic() {
      if (tracker) return true;
      try {
        const stream = await sensors.getMic();
        const ctx = await sensors.micAudioCtx();
        tracker = sensors.pitchTracker(stream, ctx);
        replace(hint);
        return true;
      } catch (e) {
        replace(hint, 'Couldn\'t open the microphone. If you\'re on a call on this phone, the call is hogging it.');
        return false;
      }
    }
    if (!submitted) attachMic();

    async function run() {
      if (running || submitted) return;
      running = true;
      startBtn.classList.add('hidden');
      sensors.audioCtx(); // unlock audio inside the tap
      if (!(await attachMic())) {
        running = false;
        startBtn.classList.remove('hidden');
        startBtn.textContent = 'Try again';
        log.replaceChildren(h('button', { class: 'btn ghost wide', onclick: () => submit() }, 'Give up (0 pts)'));
        return;
      }
      const ctx = await sensors.micAudioCtx();
      for (let i = results.length; i < targets.length && !cancelled; i++) {
        const res = siren ? await singPhrase(i, ctx) : await singNote(i, ctx);
        results.push(res);
        log.append(
          siren
            ? h('div', { class: 'shot' }, h('b', {}, `${PHRASE_NAMES[targets[i].type]}: `), judgeScore(res), h('span', { class: 'muted small' }, ` · +${res}`))
            : h('div', { class: 'shot' }, h('b', {}, `Note ${i + 1}: `), judgeCents(res), res !== null ? h('span', { class: 'muted small' }, ` · ${res} cents off · +${centsScore(res)}`) : null),
        );
        await sleep(500);
      }
      if (!cancelled) submit();
      running = false;
    }

    function watchForSilence(r, t) {
      if (r.rms > 0.01) quietSince = t;
      if (t - quietSince > 1600) replace(hint, '🙉 We can\'t hear you. Sing louder, or move the call off this phone.');
      else if (hint.textContent.startsWith('🙉')) replace(hint);
    }

    async function singNote(i, ctx) {
      const target = targets[i];
      replace(stage, h('div', { class: 'muted small' }, `Note ${i + 1} of ${targets.length}`), h('div', { class: 'pitch-big' }, '👂 Listen…'), h('div', { class: 'muted' }, noteName(target)));
      meter.classList.add('hidden');
      onSample = null;
      await sensors.playTone(target, LISTEN_MS, ctx);
      await sleep(150);
      replace(stage, h('div', { class: 'muted small' }, `Note ${i + 1} of ${targets.length}`), h('div', { class: 'pitch-big sing' }, '🎤 Sing!'), h('div', { class: 'muted' }, noteName(target)));
      meter.classList.remove('hidden');
      const cents = [];
      const t0 = performance.now();
      quietSince = 0;
      onSample = (r) => {
        const t = performance.now() - t0;
        watchForSilence(r, t);
        if (r.freq && r.freq > 60 && r.freq < 1200) {
          const cc = sensors.foldedCents(r.freq, target);
          needle.style.bottom = `${50 + Math.max(-48, Math.min(48, cc / 6))}%`;
          needle.classList.toggle('good', Math.abs(cc) < 40);
          if (t > SETTLE_MS) cents.push(Math.abs(cc));
        } else needle.classList.remove('good');
      };
      await sleep(SING_MS);
      onSample = null;
      meter.classList.add('hidden');
      return cents.length >= 6 ? Math.round(median(cents)) : null;
    }

    async function singPhrase(i, ctx) {
      const p = targets[i];
      const fn = phraseFn(p);
      const T = p.ms / 1000;
      const plot = sirenPlot(canvas, fn, T);
      canvas.classList.remove('hidden');
      onSample = null;

      replace(stage, h('div', { class: 'muted small' }, `Phrase ${i + 1} of ${targets.length}`), h('div', { class: 'pitch-big' }, `👂 ${PHRASE_NAMES[p.type]}`));
      const listenStart = performance.now();
      const anim = setInterval(() => plot.draw((performance.now() - listenStart) / 1000, 'listen'), 33);
      await sensors.playTone(fn, p.ms, ctx);
      clearInterval(anim);
      plot.draw(T, 'listen');

      for (const n of [3, 2, 1]) {
        replace(stage, h('div', { class: 'muted small' }, `Phrase ${i + 1} of ${targets.length}`), h('div', { class: 'pitch-big' }, `${n}…`));
        await sleep(450);
      }
      replace(stage, h('div', { class: 'muted small' }, `Phrase ${i + 1} of ${targets.length}`), h('div', { class: 'pitch-big sing' }, '🎤 Sing it!'));
      plot.clearTrace();
      const frames = [];
      const t0 = performance.now();
      quietSince = 0;
      onSample = (r) => {
        const t = (performance.now() - t0) / 1000;
        if (t > T) return;
        watchForSilence(r, t * 1000);
        let score = 0;
        if (r.freq && r.freq > 60 && r.freq < 1200) {
          // Allow a little reaction lag: compare against where the line was a moment ago too.
          let best = Infinity;
          for (const lag of [0, 0.1, 0.2, 0.3]) best = Math.min(best, Math.abs(sensors.foldedCents(r.freq, fn(Math.max(0, t - lag)))));
          score = Math.max(0, 100 - best / 2);
          plot.addDot(t, fn(t) * 2 ** (sensors.foldedCents(r.freq, fn(t)) / 1200), best < 60);
        }
        if (t > 0.25) frames.push(score);
        plot.draw(t, 'sing');
      };
      await sleep(p.ms + 100);
      onSample = null;
      return frames.length ? Math.round(frames.reduce((a, b) => a + b, 0) / frames.length) : 0;
    }

    function submit() {
      c.send('result', siren ? { scores: targets.map((_, i) => results[i] ?? 0) } : { cents: targets.map((_, i) => results[i] ?? null) });
      showDone();
    }

    function showDone() {
      submitted = true;
      startBtn.classList.add('hidden');
      level.classList.add('hidden');
      canvas.classList.add('hidden');
      replace(hint);
      replace(stage, h('div', { class: 'intro-emoji' }, '🎼'), h('h2', {}, 'Done!'), h('p', { class: 'muted' }, 'Waiting for the rest of the choir.'));
      tracker?.stop();
      tracker = null;
      sensors.releaseMic();
    }

    if (submitted) showDone();

    return {
      update(view, c2) {
        replace(status, doneRow(c2, view.done, 'Finished'));
      },
      unmount() {
        cancelled = true;
        clearInterval(timer);
        tracker?.stop();
      },
    };
  },
  results(view, c) {
    const siren = view.mode === 'siren';
    return card(
      (view.rows || []).map((row, i) =>
        h(
          'div',
          { class: 'shot' },
          h('div', { class: 'entry-head' }, h('span', { class: 'rank' }, `${i + 1}.`), h('span', { class: 'face' }, c.player(row.pid)?.avatar ?? '❓'), h('b', {}, c.player(row.pid)?.name ?? '?'), h('span', { class: 'spacer' }), h('span', { class: 'score' }, `${row.total}/300`)),
          h('div', { class: 'small muted' }, siren ? row.scores.map(judgeScore).join(' · ') : (row.cents || row.scores.map(() => null)).map(judgeCents).join(' · ')),
        ),
      ),
    );
  },
};

// Draws the moving target line, a playhead, and your voice as dots.
function sirenPlot(canvas, fn, T) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.parentElement.clientWidth || 340;
  const cssH = 220;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = '100%';
  canvas.style.height = `${cssH}px`;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i <= 100; i++) {
    const f = fn((i / 100) * T);
    lo = Math.min(lo, f);
    hi = Math.max(hi, f);
  }
  lo /= 2 ** (4 / 12);
  hi *= 2 ** (4 / 12);
  const x = (t) => 12 + (t / T) * (cssW - 24);
  const y = (f) => cssH - 14 - ((Math.log2(f) - Math.log2(lo)) / (Math.log2(hi) - Math.log2(lo))) * (cssH - 28);
  let dots = [];
  const css = getComputedStyle(document.documentElement);
  const color = (name, fallback) => css.getPropertyValue(name).trim() || fallback;

  return {
    clearTrace() {
      dots = [];
    },
    addDot(t, f, good) {
      dots.push({ t, f: Math.min(hi, Math.max(lo, f)), good });
    },
    draw(now, phase) {
      g.clearRect(0, 0, cssW, cssH);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, 0, cssW, cssH);
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.strokeStyle = color('--yellow', '#ffd23f');
      g.globalAlpha = 0.85;
      g.beginPath();
      const until = phase === 'listen' ? Math.min(now, T) : T;
      for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * until;
        const px = x(t);
        const py = y(fn(t));
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
      g.globalAlpha = 1;
      for (const d of dots) {
        g.fillStyle = d.good ? color('--good', '#3ee08f') : color('--team', '#3ed6e0');
        g.beginPath();
        g.arc(x(d.t), y(d.f), 4, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = color('--primary', '#ff5fa2');
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x(Math.min(now, T)), 0);
      g.lineTo(x(Math.min(now, T)), cssH);
      g.stroke();
    },
  };
}
