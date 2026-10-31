import { h, replace, toast, doneRow, card, sleep } from '../ui.js';
import * as sensors from '../sensors.js';
import * as net from '../net.js';

const MAX_RECORD_MS = 6000;
const LETTERS = 'ABCDEFGHIJKLMNOP';
const FETCH_TIMEOUT_MS = 9000;
const FETCH_TRIES = 3;

// ---- reliable uploads -------------------------------------------------------
// One upload in flight at a time. It's re-sent after every reconnect until the
// server's state shows it arrived, so a photo can't vanish because the socket
// died while the camera was open.

const upload = { roundId: null, uploadId: null, confirmed: null, stop: null, onBad: null };

function startUpload(c, data, onBad) {
  upload.stop?.();
  const uploadId = Math.random().toString(36).slice(2, 10);
  Object.assign(upload, { roundId: c.round.id, uploadId, confirmed: null, onBad });
  upload.stop = net.sendUntil({ t: 'g', a: 'submit', data, uploadId }, () => upload.confirmed === uploadId, 6000, 180_000);
  return uploadId;
}

function noteConfirmed(c, view) {
  if (c.round.id === upload.roundId) upload.confirmed = view.mineUpload ?? null;
}

function stopUpload() {
  upload.stop?.();
  upload.stop = null;
}

// The server refused the file (e.g. it arrived corrupted): stop re-sending it.
net.on('message', (msg) => {
  if (msg.t === 'error' && msg.code === 'badupload' && upload.stop) {
    stopUpload();
    upload.onBad?.();
  }
});

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
      stopUpload();
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
  if (kind === 'photo') return photo(url);
  return audioButton(url);
}

// Downloads are fetched (not left to <img>) so a stalled request can be timed
// out and retried. If that keeps failing, the photo comes over the game's own
// connection instead. Each photo is downloaded once and reused.
const photoCache = new Map();

async function fetchPhoto(url) {
  for (let i = 0; i < FETCH_TRIES; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(i ? `${url}?try=${i}` : url, { signal: ctrl.signal, cache: i ? 'no-store' : 'default' });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size) return URL.createObjectURL(blob);
      }
    } catch {
    } finally {
      clearTimeout(t);
    }
    await sleep(600 * (i + 1));
  }
  const viaSocket = await net.requestMedia(url.split('/').pop());
  if (viaSocket) return viaSocket;
  throw new Error('photo unavailable');
}

const PHOTO_CACHE_MAX = 40;

function loadPhoto(url) {
  if (!photoCache.has(url)) {
    const p = fetchPhoto(url);
    photoCache.set(url, p);
    p.catch(() => photoCache.delete(url));
    // Forget the oldest photos so a long night doesn't fill the phone's memory.
    while (photoCache.size > PHOTO_CACHE_MAX) {
      const [oldUrl, old] = photoCache.entries().next().value;
      photoCache.delete(oldUrl);
      old.then((src) => src.startsWith('blob:') && setTimeout(() => URL.revokeObjectURL(src), 60_000), () => {});
    }
  }
  return photoCache.get(url);
}

export function photo(url, props = {}) {
  const img = h('img', { class: 'photo', alt: '', ...props });
  const wrap = h('div', { class: 'photo-wrap loading' }, img);
  const show = () =>
    loadPhoto(url).then(
      (src) => {
        img.onload = () => wrap.classList.remove('loading', 'broken');
        img.onerror = () => {
          // Couldn't decode what we got: forget it so a tap re-downloads.
          photoCache.delete(url);
          wrap.classList.remove('loading');
          wrap.classList.add('broken');
        };
        img.src = src;
      },
      () => {
        wrap.classList.remove('loading');
        wrap.classList.add('broken');
      },
    );
  wrap.addEventListener('click', () => {
    if (!wrap.classList.contains('broken')) return;
    wrap.classList.remove('broken');
    wrap.classList.add('loading');
    show();
  });
  show();
  return wrap;
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
  let state = v.mine ? 'sent' : 'pick'; // pick → preview → sending → sent
  let sendingSince = 0;
  let mineUrl = v.mine;

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
        stopUpload();
        state = 'preview';
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
    if (!dataUrl || state === 'sending') return;
    state = 'sending';
    sendingSince = Date.now();
    startUpload(c, dataUrl, () => {
      state = 'pick';
      dataUrl = null;
      draw();
    });
    draw();
  };

  function draw() {
    if (state === 'sent') {
      replace(
        area,
        dataUrl ? h('img', { class: 'photo', src: dataUrl, alt: '' }) : photo(mineUrl),
        h('p', { class: 'center' }, '✅ Got it! Now wait and judge.'),
        pickBtn('Change my photo', 'ghost wide'),
      );
    } else if (state === 'sending') {
      const slow = Date.now() - sendingSince > 6000;
      replace(
        area,
        h('img', { class: 'photo', src: dataUrl, alt: '' }),
        h('p', { class: 'center' }, '⏳ Sending…'),
        slow ? h('p', { class: 'center small warn' }, 'Weak signal? Still trying. Keep this screen open.') : null,
      );
    } else if (state === 'preview') {
      replace(
        area,
        h('img', { class: 'photo', src: dataUrl, alt: '' }),
        h('div', { class: 'row' }, pickBtn('↺ Retake', ''), h('button', { class: 'btn primary grow', onclick: submit }, '🚀 Send it')),
      );
    } else {
      replace(area, pickBtn('📸 Take photo', 'primary huge wide'));
    }
  }

  const slowTimer = setInterval(() => state === 'sending' && Date.now() - sendingSince > 6000 && !area.querySelector('.warn') && draw(), 1000);
  replace(el, promptCard(v), area, status);
  draw();
  return {
    update(view, c2) {
      noteConfirmed(c2, view);
      mineUrl = view.mine;
      if (state === 'sending' && view.mineUpload && view.mineUpload === upload.uploadId) {
        state = 'sent';
        draw();
      } else if (state === 'pick' && view.mine) {
        state = 'sent';
        draw();
      }
      replace(status, doneRow(c2, view.submitted || [], 'Photos in'));
    },
    unmount() {
      clearInterval(slowTimer);
      // An upload still in flight keeps going: late photos still count.
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
    startUpload(c, data, () => {
      sending = false;
      draw();
    });
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
      noteConfirmed(c2, view);
      if (sending && view.mineUpload && view.mineUpload === upload.uploadId) {
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
  const list = h('div', { class: 'entries' });
  const addEntry = (e) => {
    const i = buttons.size;
    const label = kindLabel(v.kind, i);
    const btn = h('button', { class: 'btn vote-btn', disabled: e.mine, onclick: () => c.send('vote', { id: e.id }) }, e.mine ? 'Yours' : 'Vote');
    buttons.set(e.id, btn);
    list.append(
      h(
        'div',
        { class: `card entry ${e.mine ? 'mine' : ''} ${i >= v.entries.length ? 'pop' : ''}` },
        h('div', { class: 'entry-head' }, h('b', {}, label), h('span', { class: 'spacer' }), btn),
        v.kind === 'photo' ? photo(e.url, { alt: label, onclick: () => !e.mine && c.send('vote', { id: e.id }) }) : audioButton(e.url),
      ),
    );
  };
  v.entries.forEach(addEntry);
  const status = h('div');
  replace(el, h('div', { class: 'card prompt' }, h('div', { class: 'muted small' }, 'Vote for the best'), h('h3', {}, v.prompt.text)), list, status);
  return {
    update(view, c2) {
      noteConfirmed(c2, view);
      // Late arrivals (uploaded just as time ran out) show up at the bottom.
      for (const e of view.entries) if (!buttons.has(e.id)) addEntry(e);
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
