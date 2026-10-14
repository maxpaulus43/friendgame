import { h, replace, card, doneRow, sleep } from '../ui.js';
import * as sensors from '../sensors.js';

const LISTEN_MS = 1500;
const SING_MS = 3500;
const SETTLE_MS = 700; // ignore the first bit while you find the note
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

const noteName = (f) => NOTE_NAMES[(Math.round(12 * Math.log2(f / 440)) + 69) % 12];
const score = (c) => (c === null ? 0 : Math.max(0, Math.round(100 - c / 2)));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

const judge = (c) => {
  if (c === null) return 'We heard nothing. 🦗';
  if (c < 15) return 'Perfect pitch?! 🤯';
  if (c < 40) return 'Nailed it 🎯';
  if (c < 80) return 'Pretty close 👍';
  if (c < 140) return 'Karaoke energy 🎤';
  if (c < 220) return 'Enthusiastic 🦆';
  return 'A brave choice 🐐';
};

export default {
  mount(el, c) {
    const notes = c.round.view.notes;
    const results = [];
    let running = false;
    let cancelled = false;
    let submitted = !!c.round.view.mine;
    const stage = h('div', { class: 'card center pitch-stage' });
    const meter = h('div', { class: 'pitch-meter' }, h('div', { class: 'pitch-target' }), h('div', { class: 'pitch-needle' }), h('span', { class: 'lab hi' }, 'too high'), h('span', { class: 'lab lo' }, 'too low'));
    const needle = meter.querySelector('.pitch-needle');
    const log = h('div');
    const status = h('div');
    const startBtn = h('button', { class: 'btn primary huge wide', onclick: () => run() }, '🎵 Start singing');

    replace(el, stage, meter, log, startBtn, status);
    replace(stage, h('div', { class: 'intro-emoji' }, '🎶'), h('p', {}, 'Volume up, silent mode off. You\'ll hear a note — then sing it back.'));
    meter.classList.add('hidden');

    async function run() {
      if (running || submitted) return;
      running = true;
      startBtn.classList.add('hidden');
      sensors.audioCtx();
      let stream;
      try {
        stream = await sensors.getMic();
      } catch (e) {
        replace(stage, h('div', { class: 'intro-emoji' }, '🙊'), h('p', {}, 'Couldn\'t open the microphone. If you\'re on a call on this phone, the call is hogging it.'), h('button', { class: 'btn', onclick: () => submit(notes.map(() => null)) }, 'Give up (0 pts)'));
        running = false;
        startBtn.classList.remove('hidden');
        startBtn.textContent = 'Try again';
        return;
      }
      const tracker = sensors.pitchTracker(stream);
      try {
        for (let i = results.length; i < notes.length && !cancelled; i++) {
          const target = notes[i];
          replace(stage, h('div', { class: 'muted small' }, `Note ${i + 1} of ${notes.length}`), h('div', { class: 'pitch-big' }, '👂 Listen…'), h('div', { class: 'muted' }, noteName(target)));
          meter.classList.add('hidden');
          await sensors.playTone(target, LISTEN_MS);
          await sleep(150);
          replace(stage, h('div', { class: 'muted small' }, `Note ${i + 1} of ${notes.length}`), h('div', { class: 'pitch-big sing' }, '🎤 Sing!'), h('div', { class: 'muted' }, noteName(target)));
          meter.classList.remove('hidden');
          const cents = [];
          const t0 = performance.now();
          while (performance.now() - t0 < SING_MS && !cancelled) {
            const { freq } = tracker.read();
            if (freq && freq > 60 && freq < 1200) {
              const cc = sensors.foldedCents(freq, target);
              needle.style.bottom = `${50 + Math.max(-48, Math.min(48, cc / 6))}%`;
              needle.classList.toggle('good', Math.abs(cc) < 40);
              if (performance.now() - t0 > SETTLE_MS) cents.push(Math.abs(cc));
            } else needle.classList.remove('good');
            await sleep(33);
          }
          const result = cents.length >= 8 ? Math.round(median(cents)) : null;
          results.push(result);
          log.append(h('div', { class: 'shot' }, h('b', {}, `Note ${i + 1}: `), judge(result), result !== null ? h('span', { class: 'muted small' }, ` · ${result} cents off · +${score(result)}`) : null));
          meter.classList.add('hidden');
          await sleep(500);
        }
      } finally {
        tracker.stop();
      }
      if (!cancelled) submit(results);
      running = false;
    }

    function submit(r) {
      c.send('result', { cents: r });
      showDone();
    }

    function showDone() {
      submitted = true;
      startBtn.classList.add('hidden');
      replace(stage, h('div', { class: 'intro-emoji' }, '🎼'), h('h2', {}, 'Done!'), h('p', { class: 'muted' }, 'Waiting for the rest of the choir.'));
      sensors.releaseMic();
    }

    if (submitted) showDone();

    return {
      update(v, c2) {
        replace(status, doneRow(c2, v.done, 'Finished'));
      },
      unmount() {
        cancelled = true;
      },
    };
  },
  results(view, c) {
    return card(
      (view.rows || []).map((row, i) =>
        h(
          'div',
          { class: 'shot' },
          h('div', { class: 'entry-head' }, h('span', { class: 'rank' }, `${i + 1}.`), h('span', { class: 'face' }, c.player(row.pid)?.avatar ?? '❓'), h('b', {}, c.player(row.pid)?.name ?? '?'), h('span', { class: 'spacer' }), h('span', { class: 'score' }, `${row.total}/300`)),
          h('div', { class: 'small muted' }, row.cents.map((x) => judge(x)).join(' · ')),
        ),
      ),
    );
  },
};
