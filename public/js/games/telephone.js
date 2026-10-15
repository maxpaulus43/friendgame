import { h, replace, card, doneRow, toast } from '../ui.js';
import { drawingPad } from '../draw.js';
import { photo } from './mediavote.js';

const AUTO_SUBMIT_MS = 1500; // send whatever you have just before time runs out

const name = (c, pid) => `${c.player(pid)?.avatar ?? '❓'} ${c.player(pid)?.name ?? 'Someone'}`;

function entryEl(c, e, i) {
  if (!e) return null;
  const who = name(c, e.pid);
  if (e.missing) return h('div', { class: 'album-entry missing' }, h('div', { class: 'small muted' }, `${who} ran out of time`), h('div', {}, '⌛'));
  if (e.kind === 'draw') return h('div', { class: 'album-entry' }, h('div', { class: 'small muted' }, `🎨 ${who} drew:`), photo(e.url));
  return h('div', { class: 'album-entry' }, h('div', { class: 'small muted' }, i === 0 ? `✏️ ${who} started with:` : `🤔 ${who} guessed:`), h('div', { class: 'album-text' }, e.text));
}

export default {
  mount(el, c) {
    const step = c.round.step;
    const v = c.round.view;
    if (step === 'reveal') return revealStep(el, c);
    if (!('prev' in v) && step !== 'write') {
      replace(el, card(h('p', { class: 'center muted' }, 'Sit tight, you\'re in the next round.')));
      return {};
    }

    let submitted = v.submitted;
    let sending = false;
    const status = h('div');
    const doneMsg = h('div', { class: 'card center hidden' }, h('div', { class: 'intro-emoji' }, '📨'), h('p', {}, 'Passed along! Waiting for everyone else.'));
    let getPayload;
    let body;

    if (step === 'write') {
      const input = h('input', { class: 'input', id: 'tele-write', maxLength: 100, placeholder: v.suggestion ? `e.g. ${v.suggestion}` : 'A short phrase', autocomplete: 'off' });
      body = h(
        'div',
        { class: 'card' },
        h('h3', {}, 'Write something for someone to draw'),
        h('p', { class: 'muted small' }, 'Short and weird works best.'),
        input,
        h('button', { class: 'btn small ghost', onclick: () => (input.value = v.suggestion) }, '🎲 Use the example'),
      );
      getPayload = (auto) => ({ text: input.value.trim() || (auto ? v.suggestion : '') });
    } else if (step === 'draw') {
      const pad = drawingPad();
      const prompt = v.prev && !v.prev.missing ? v.prev.text : null;
      body = h(
        'div',
        { class: 'tele-draw' },
        h('div', { class: 'card prompt' }, h('div', { class: 'muted small' }, 'Draw this'), h('h2', {}, prompt ?? 'Anything! (they ran out of time)')),
        pad.el,
      );
      getPayload = (auto) => (pad.isEmpty() && !auto ? null : { data: pad.toDataUrl() });
    } else {
      const input = h('input', { class: 'input', id: 'tele-guess', maxLength: 100, placeholder: 'What is this?', autocomplete: 'off' });
      body = h(
        'div',
        { class: 'card' },
        h('div', { class: 'muted small' }, 'What on earth is this?'),
        v.prev?.url ? photo(v.prev.url) : h('p', { class: 'center' }, '(Blank. They ran out of time. Make something up!)'),
        input,
      );
      getPayload = (auto) => ({ text: input.value.trim() || (auto ? '🤷' : '') });
    }

    const sendBtn = h('button', { class: 'btn primary huge wide', onclick: () => submit(false) }, step === 'draw' ? '🚀 Pass it on' : '🚀 Send');
    const submit = (auto) => {
      if (submitted || sending) return;
      const payload = getPayload(auto);
      if (!payload || (payload.text !== undefined && !payload.text)) return toast(step === 'draw' ? 'Draw something first!' : 'Type something first!');
      sending = true;
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      if (!c.send('submit', payload)) {
        sending = false;
        sendBtn.disabled = false;
        sendBtn.textContent = 'Try again';
        toast('Reconnecting… try again in a sec.');
      }
    };

    const head = h('div', { class: 'small muted center' }, `Step ${v.hop + 1} of ${v.hops}`);
    replace(el, head, body, sendBtn, doneMsg, status);

    const showDone = () => {
      body.classList.add('hidden');
      sendBtn.classList.add('hidden');
      doneMsg.classList.remove('hidden');
    };
    if (submitted) showDone();

    const autoTimer = setInterval(() => {
      const dl = c.round?.deadline;
      if (!submitted && dl && c.now() > dl - AUTO_SUBMIT_MS) submit(true);
    }, 300);

    return {
      update(view, c2) {
        c = c2;
        if (view.submitted && !submitted) {
          submitted = true;
          showDone();
        }
        replace(status, doneRow(c2, view.done || [], 'Done'));
      },
      unmount() {
        clearInterval(autoTimer);
      },
    };
  },
  results(view, c) {
    return h(
      'div',
      {},
      (view.chains || []).map((ch) =>
        card(h('h3', {}, `${name(c, ch.owner)}'s chain`), h('div', { class: 'album' }, ch.entries.map((e, i) => entryEl(c, e, i)))),
      ),
    );
  },
};

function revealStep(el, c) {
  const head = h('div');
  const album = h('div', { class: 'album' });
  const foot = h('div');
  replace(el, head, card(album), foot);
  let shown = { chain: -1, idx: -1 };
  return {
    update(v, c2) {
      const ch = v.chains[v.reveal.chain];
      if (v.reveal.chain !== shown.chain) {
        replace(head, h('div', { class: 'card center' }, h('div', { class: 'muted small' }, `Chain ${v.reveal.chain + 1} of ${v.chains.length}`), h('h2', {}, `${name(c2, ch.owner)}'s chain`)));
        replace(album);
        shown = { chain: v.reveal.chain, idx: -1 };
      }
      for (let i = shown.idx + 1; i <= v.reveal.idx; i++) {
        const node = entryEl(c2, ch.entries[i], i);
        if (node) {
          node.classList.add('pop');
          album.append(node);
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      shown.idx = v.reveal.idx;
      const lastInChain = v.reveal.idx + 1 >= ch.entries.length;
      const lastChain = v.reveal.chain + 1 >= v.chains.length;
      replace(
        foot,
        c2.isHost
          ? h('button', { class: 'btn primary huge wide', onclick: () => c2.send('reveal') }, lastInChain ? (lastChain ? '🏁 Finish' : '▶ Next chain') : '▶ Show next')
          : h('p', { class: 'center muted' }, `${name(c2, c2.room.hostId)} is flipping through the album…`),
      );
    },
  };
}
