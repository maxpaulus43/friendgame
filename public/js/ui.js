// Tiny DOM helpers. h('div', { class: 'x', onclick }, 'text', child)
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function replace(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export const fmt = (n) => Math.round(n).toLocaleString();

let toastTimer;
export function toast(msg, ms = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export const TAG_LABELS = {
  laugh: '😂 Laugh',
  compete: '🏆 Compete',
  argue: '🗯️ Argue',
  team: '🤝 Team up',
};

export const SENSOR_LABELS = {
  camera: '📷 Camera',
  mic: '🎤 Mic',
  motion: '📳 Motion',
  tilt: '📐 Tilt',
  compass: '🧭 Compass',
  location: '📍 Location',
};

export function tagChips(tags) {
  return h('div', { class: 'chips' }, tags.map((t) => h('span', { class: `chip tag-${t}` }, TAG_LABELS[t] || t)));
}

export function avatar(p, opts = {}) {
  if (!p) return h('span', { class: 'who' }, '❓');
  return h(
    'span',
    { class: `who ${opts.big ? 'big' : ''} ${p.connected === false ? 'offline' : ''}` },
    h('span', { class: 'face' }, p.avatar),
    opts.noName ? null : h('span', { class: 'name' }, p.name),
  );
}

// A countdown that the app's ticker keeps up to date. Give it a server-time deadline.
export function timer(deadline, cls = '') {
  if (!deadline) return null;
  return h('span', { class: `timer ${cls}`, dataset: { deadline } }, '');
}

export function card(...children) {
  return h('div', { class: 'card' }, ...children);
}

// Row of avatars showing who is done / ready.
export function doneRow(ctx, doneIds, label = 'Done') {
  const ids = ctx.round.participants;
  const done = new Set(doneIds);
  return h(
    'div',
    { class: 'done-row' },
    h('div', { class: 'muted small' }, `${label}: ${ids.filter((id) => done.has(id)).length}/${ids.length}`),
    h(
      'div',
      { class: 'faces' },
      ids.map((id) => {
        const p = ctx.player(id);
        return h('span', { class: `face-dot ${done.has(id) ? 'done' : ''}`, title: p?.name }, p?.avatar ?? '❓');
      }),
    ),
  );
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
