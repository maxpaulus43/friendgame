import { h, replace, toast, doneRow, card } from '../ui.js';
import * as sensors from '../sensors.js';

const MAX_RECORD_MS = 6000;
const LETTERS = 'ABCDEFGHIJKLMNOP';

// Shared UI for Snap Judgment (photos) and Sound Off (voice clips).
export function mediaVoteModule(kind) {
  return {
    mount(el, c) {
      const step = c.round.step;
      if (step === 'capture') return kind === 'photo' ? photoCapture(el, c) : audioCapture(el, c);
      if (step === 'vote') return voteStep(el, c);
      return {};
    },
    results(view, c) {
      if (!view.entries?.length) return card(h('p', { class: 'center muted' }, 'Nobody submitted anything. Bold strategy.'));
      const top = view.entries[0].voters.length;
      return h(
        'div',
        {},
        card(h('div', { class: 'muted small' }, 'The prompt was'), h('h3', {}, view.prompt.text)),
        view.entries.map((e) => {
          const p = c.player(e.author);
          return h(
            'div',
            { class: `card entry ${top > 0 && e.voters.length === top ? 'winner' : ''}` },
            h(
              'div',
              { class: 'entry-head' },
              top > 0 && e.voters.length === top ? h('span', { class: 'crown' }, '👑') : null,
              h('span', { class: 'face' }, p?.avatar ?? '❓'),
              h('b', {}, p?.name ?? 'Someone who left'),
              h('span', { class: 'spacer' }),
              h('span', { class: 'votes' }, `${e.voters.length} vote${e.voters.length === 1 ? '' : 's'}`),
            ),
            mediaEl(kind, e.url),
            e.voters.length ? h('div', { class: 'small muted' }, 'Votes from ', e.voters.map((v) => c.player(v)?.avatar ?? '❓').join(' ')) : null,
          );
        }),
      );
    },
  };
}

function promptCard(view) {
  const hint = view.kind === 'photo' ? (view.prompt.face === 'user' ? '🤳 Selfie time' : '📷 Go find it') : '🎙️ Make this sound';
  return h('div', { class: 'card prompt' }, h('div', { class: 'muted small' }, hint), h('h2', {}, view.prompt.text));
}

function mediaEl(kind, url) {
  if (kind === 'photo') return h('img', { class: 'photo', src: url, alt: '', loading: 'lazy' });
  return audioButton(url);
}

let playing = null;
function audioButton(url, label = '▶ Play') {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = url;
  const btn = h('button', { class: 'btn play-btn' }, label);
  const reset = () => {
    btn.textContent = label;
    btn.classList.remove('on');
  };
  audio.addEventListener('ended', reset);
  audio.addEventListener('pause', reset);
  btn.addEventListener('click', () => {
    if (!audio.paused) return audio.pause();
    if (playing && playing !== audio) playing.pause();
    playing = audio;
    audio.currentTime = 0;
    audio.play().then(
      () => {
        btn.textContent = '⏸ Playing…';
        btn.classList.add('on');
      },
      () => toast('Could not play that clip. Is your phone on silent?'),
    );
  });
  return btn;
}

function photoCapture(el, c) {
  const v = c.round.view;
  let dataUrl = null;
  let sending = false;
  let sent = false;

  const input = h('input', {
    type: 'file',
    accept: 'image/*',
    capture: v.prompt.face || 'environment',
    class: 'visually-hidden',
    onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        dataUrl = await sensors.shrinkImage(file);
        sent = false;
        draw();
      } catch (err) {
        toast(err.message);
      }
    },
  });
  const pickBtn = (label, cls) => h('label', { class: `btn ${cls}` }, label, input);
  const area = h('div');
  const status = h('div');

  const submit = () => {
    if (!dataUrl || sending) return;
    sending = true;
    if (!c.send('submit', { data: dataUrl })) toast('Reconnecting… try again in a sec.');
    draw();
  };

  function draw(view = v) {
    if (view.mine && sending) {
      sending = false;
      sent = true;
    }
    if (sent || (view.mine && !dataUrl)) {
      replace(
        area,
        h('img', { class: 'photo', src: dataUrl || view.mine, alt: '' }),
        h('p', { class: 'center' }, '✅ Sent! Now wait and judge.'),
        pickBtn('Change my photo', 'ghost wide'),
      );
    } else if (dataUrl) {
      replace(
        area,
        h('img', { class: 'photo', src: dataUrl, alt: '' }),
        h('div', { class: 'row' }, pickBtn('↺ Retake', ''), h('button', { class: 'btn primary grow', onclick: submit, disabled: sending }, sending ? 'Sending…' : '🚀 Send it')),
      );
    } else {
      replace(area, pickBtn('📸 Take photo', 'primary huge wide'));
    }
  }

  replace(el, promptCard(v), area, status);
  draw();
  return {
    update(view, c2) {
      if (view.mine && sending) draw(view);
      replace(status, doneRow(c2, view.submitted || [], 'Photos in'));
    },
  };
}

function audioCapture(el, c) {
  const v = c.round.view;
  let blob = null;
  let blobUrl = null;
  let rec = null;
  let startedAt = 0;
  let stopTimer = null;
  let sending = false;
  let sent = !!v.mine;
  let tickTimer = null;

  const area = h('div');
  const status = h('div');

  async function start() {
    let stream;
    try {
      sensors.audioCtx();
      stream = await sensors.getMic();
    } catch (e) {
      toast(e.name === 'NotAllowedError' ? 'Mic blocked. Allow it in Safari settings.' : 'Mic unavailable. Is a call using it?', 5000);
      return;
    }
    const mime = sensors.recorderMime();
    if (mime === null) return toast('This browser can\'t record audio. Update iOS?');
    const chunks = [];
    rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      clearInterval(tickTimer);
      clearTimeout(stopTimer);
      blob = new Blob(chunks, { type: (rec.mimeType || mime || 'audio/mp4').split(';')[0] });
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(blob);
      rec = null;
      sent = false;
      draw();
    };
    rec.start();
    startedAt = Date.now();
    stopTimer = setTimeout(() => rec?.state === 'recording' && rec.stop(), MAX_RECORD_MS);
    tickTimer = setInterval(draw, 100);
    draw();
  }

  const stop = () => rec?.state === 'recording' && rec.stop();

  async function submit() {
    if (!blob || sending) return;
    sending = true;
    draw();
    const data = await sensors.blobToDataUrl(blob);
    if (!c.send('submit', { data })) {
      sending = false;
      toast('Reconnecting… try again in a sec.');
      draw();
    }
  }

  // While recording, only the label and bar change: rebuilding the Stop
  // button every frame would swallow taps.
  const stopBtn = h('button', { class: 'btn record on huge wide', onclick: () => stop() });
  const stopBar = h('div', { class: 'bar' }, h('div', { class: 'fill' }));
  let mode = null;

  function draw() {
    if (rec) {
      const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
      stopBtn.textContent = `⏹ Stop  ${secs}s`;
      stopBar.firstChild.style.width = `${Math.min(100, ((Date.now() - startedAt) / MAX_RECORD_MS) * 100)}%`;
      if (mode !== 'rec') replace(area, stopBtn, stopBar);
      mode = 'rec';
      return;
    }
    mode = null;
    if (sent) {
      replace(area, h('p', { class: 'center' }, '✅ Sent! Now wait and judge.'), blobUrl ? audioButton(blobUrl, '▶ Hear yours') : null, h('button', { class: 'btn ghost wide', onclick: start }, 'Record a new take'));
    } else if (blob) {
      replace(
        area,
        audioButton(blobUrl, '▶ Listen back'),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: start }, '↺ Redo'), h('button', { class: 'btn primary grow', onclick: submit, disabled: sending }, sending ? 'Sending…' : '🚀 Send it')),
      );
    } else {
      replace(area, h('button', { class: 'btn record huge wide', onclick: start }, '🎙️ Tap to record'), h('p', { class: 'center muted small' }, 'Up to 6 seconds.'));
    }
  }

  replace(el, promptCard(v), area, status);
  draw();
  return {
    update(view, c2) {
      if (view.mine && sending) {
        sending = false;
        sent = true;
        draw();
      }
      replace(status, doneRow(c2, view.submitted || [], 'Sounds in'));
    },
    unmount() {
      clearInterval(tickTimer);
      clearTimeout(stopTimer);
      if (rec?.state === 'recording') {
        rec.onstop = null;
        rec.stop();
      }
    },
  };
}

function voteStep(el, c) {
  const v = c.round.view;
  const buttons = new Map();
  const cards = v.entries.map((e, i) => {
    const btn = h('button', { class: 'btn vote-btn', disabled: e.mine, onclick: () => c.send('vote', { id: e.id }) }, e.mine ? 'Yours' : 'Vote');
    buttons.set(e.id, btn);
    const label = kindLabel(v.kind, i);
    return h(
      'div',
      { class: `card entry ${e.mine ? 'mine' : ''}` },
      h('div', { class: 'entry-head' }, h('b', {}, label), h('span', { class: 'spacer' }), btn),
      v.kind === 'photo' ? h('img', { class: 'photo', src: e.url, alt: label, onclick: () => !e.mine && c.send('vote', { id: e.id }) }) : audioButton(e.url),
    );
  });
  const status = h('div');
  replace(el, h('div', { class: 'card prompt' }, h('div', { class: 'muted small' }, 'Vote for the best'), h('h3', {}, v.prompt.text)), cards, status);
  return {
    update(view, c2) {
      for (const [id, btn] of buttons) {
        if (btn.disabled) continue;
        const on = view.myVote === id;
        btn.textContent = on ? '✅ Voted' : 'Vote';
        btn.classList.toggle('primary', on);
        btn.closest('.entry').classList.toggle('picked', on);
      }
      replace(status, doneRow(c2, view.voted || [], 'Voted'));
    },
    unmount() {
      playing?.pause();
    },
  };
}

const kindLabel = (kind, i) => (kind === 'photo' ? `Photo ${LETTERS[i]}` : `Clip ${LETTERS[i]}`);
