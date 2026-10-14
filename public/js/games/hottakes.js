import { h, replace, card, doneRow } from '../ui.js';

const FACES = ['🤮', '😤', '😠', '🙄', '😕', '😐', '🙂', '😊', '😃', '😍', '🤩'];
const LABELS = ['Absolutely not', 'Nope', 'Nope', 'Mostly no', 'Eh, no', 'Torn', 'Eh, yes', 'Mostly yes', 'Yes', 'Yes!', 'Obviously yes'];

function scale(c, ratings, opts = {}) {
  // Stack people with the same answer so nobody hides behind anyone.
  const stacks = {};
  const line = h('div', { class: 'scale' }, h('div', { class: 'scale-line' }), h('span', { class: 'scale-end l' }, '0 · No'), h('span', { class: 'scale-end r' }, 'Yes · 10'));
  for (const [pid, v] of Object.entries(ratings)) {
    const n = (stacks[v] = (stacks[v] ?? 0) + 1);
    const p = c.player(pid);
    const from = opts.from?.[pid];
    line.append(
      h(
        'div',
        { class: 'scale-dot', style: { left: `${v * 10}%`, bottom: `${18 + (n - 1) * 34}px` }, title: p?.name },
        h('span', { class: 'face' }, p?.avatar ?? '❓'),
        from !== undefined && from !== v ? h('span', { class: 'moved' }, `${from}→${v}`) : null,
      ),
    );
  }
  const tallest = Math.max(1, ...Object.values(stacks));
  line.style.height = `${50 + tallest * 34}px`;
  return line;
}

function rater(el, c, { first }) {
  let value = 5;
  let locked = null;
  const face = h('div', { class: 'rate-face' }, FACES[5]);
  const label = h('div', { class: 'rate-label' }, `5 · ${LABELS[5]}`);
  const slider = h('input', {
    type: 'range',
    min: 0,
    max: 10,
    step: 1,
    value: 5,
    class: 'slider',
    oninput: (e) => {
      value = Number(e.target.value);
      face.textContent = FACES[value];
      label.textContent = `${value} · ${LABELS[value]}`;
      draw();
    },
  });
  const btn = h('button', { class: 'btn primary huge wide', onclick: () => c.send('rate', { v: value }) }, 'Lock it in');
  const status = h('div');
  const note = h('p', { class: 'center muted small' });
  const draw = () => {
    btn.textContent = locked === value ? `🔒 Locked: ${value}` : locked !== null ? `Change to ${value}` : 'Lock it in';
    btn.classList.toggle('primary', locked !== value);
  };
  replace(
    el,
    h('div', { class: 'card prompt' }, h('div', { class: 'muted small' }, first !== undefined ? 'Round two. Changed your mind?' : 'Hot take'), h('h2', {}, c.round.view.statement)),
    h('div', { class: 'card center' }, face, label, slider),
    btn,
    note,
    status,
  );
  let synced = false;
  return {
    update(v, c2) {
      if (v.mine !== null && v.mine !== undefined) {
        locked = v.mine;
        if (!synced) {
          // Coming back to the page after locking in: show what you picked.
          value = v.mine;
          slider.value = String(value);
          face.textContent = FACES[value];
          label.textContent = `${value} · ${LABELS[value]}`;
        }
      }
      synced = true;
      if (v.first !== null && v.first !== undefined) note.textContent = `Before the debate you said ${v.first}.`;
      draw();
      replace(status, doneRow(c2, v.done, 'Locked in'));
    },
  };
}

export default {
  mount(el, c) {
    const step = c.round.step;
    if (step === 'rate1') return rater(el, c, {});
    if (step === 'rate2') return rater(el, c, { first: c.round.view.first });
    if (step === 'debate') {
      const v = c.round.view;
      const co = v.callout;
      const name = (pid) => `${c.player(pid)?.avatar ?? ''} ${c.player(pid)?.name ?? '?'}`;
      replace(
        el,
        h('div', { class: 'card prompt' }, h('div', { class: 'muted small' }, 'The statement'), h('h2', {}, v.statement)),
        card(scale(c, v.ratings)),
        co && co.gap >= 3
          ? h('div', { class: 'card callout' }, h('h3', {}, '🔥 Fight!'), h('p', {}, `${name(co.lo)} said ${v.ratings[co.lo]}. ${name(co.hi)} said ${v.ratings[co.hi]}. That's ${co.gap} points apart.`), h('p', { class: 'big' }, 'Defend yourselves.'))
          : h('div', { class: 'card callout calm' }, h('h3', {}, '🤝 Suspiciously agreeable'), h('p', {}, `Everyone is within a few points (average ${co?.mean ?? '?'}). Somebody play devil's advocate.`)),
        co?.loner ? h('div', { class: 'card callout' }, h('p', {}, `🐺 ${name(co.loner)} is out there on their own. Explain yourself.`)) : null,
        h('p', { class: 'center muted small' }, 'Argue it out on the call. Then everyone re-rates — you score points for every point you pull people toward your take.'),
        c.isHost ? h('button', { class: 'btn primary wide', onclick: () => c.host('skip') }, 'Done arguing → re-vote') : null,
      );
      return {};
    }
    return {};
  },
  results(view, c) {
    const sway = Object.entries(view.sway || {}).sort((a, b) => b[1] - a[1]);
    const stubborn = Object.keys(view.r1 || {}).filter((pid) => view.r1[pid] === view.r2[pid]);
    const top = sway[0];
    return h(
      'div',
      {},
      card(h('div', { class: 'muted small' }, 'The statement'), h('h3', {}, view.statement), scale(c, view.r2 || {}, { from: view.r1 })),
      card(
        top && top[1] > 0 ? h('p', {}, `🗣️ Most persuasive: ${c.player(top[0])?.avatar ?? ''} ${c.player(top[0])?.name ?? '?'} (pulled people ${top[1]} point${top[1] === 1 ? '' : 's'})`) : h('p', {}, '🧱 Nobody changed anybody\'s mind. Classic.'),
        stubborn.length && stubborn.length < Object.keys(view.r1 || {}).length ? h('p', { class: 'muted' }, `🪨 Didn't budge: ${stubborn.map((id) => c.player(id)?.name ?? '?').join(', ')}`) : null,
      ),
    );
  },
};
