import { h } from './ui.js';

const SIZE = 600;
const COLORS = ['#1b1033', '#e63946', '#f4a261', '#ffd23f', '#2a9d8f', '#3a86ff', '#8338ec', '#ff5fa2', '#6b4226', '#ffffff'];
const WIDTHS = [4, 10, 22];

// A finger-painting canvas with colors, brush sizes, undo and clear.
export function drawingPad() {
  const canvas = h('canvas', { class: 'pad', width: SIZE, height: SIZE });
  const g = canvas.getContext('2d');
  const strokes = [];
  let current = null;
  let color = COLORS[0];
  let width = WIDTHS[1];

  const paint = () => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, SIZE, SIZE);
    for (const s of strokes) drawStroke(s);
    if (current) drawStroke(current);
  };
  const drawStroke = (s) => {
    g.strokeStyle = s.color;
    g.fillStyle = s.color;
    g.lineWidth = s.width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (s.points.length === 1) {
      g.beginPath();
      g.arc(s.points[0][0], s.points[0][1], s.width / 2, 0, Math.PI * 2);
      g.fill();
      return;
    }
    g.beginPath();
    g.moveTo(...s.points[0]);
    for (const p of s.points.slice(1)) g.lineTo(...p);
    g.stroke();
  };
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE];
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    current = { color, width, points: [pos(e)] };
    paint();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) current.points.push(pos(ev));
    paint();
  });
  const end = () => {
    if (current) strokes.push(current);
    current = null;
    paint();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  const swatches = COLORS.map((c) =>
    h('button', {
      class: `swatch ${c === color ? 'on' : ''}`,
      style: { background: c },
      'aria-label': c === '#ffffff' ? 'Eraser (white)' : `Color ${c}`,
      onclick: (e) => {
        color = c;
        swatches.forEach((s) => s.classList.remove('on'));
        e.currentTarget.classList.add('on');
      },
    }),
  );
  const sizes = WIDTHS.map((w) =>
    h(
      'button',
      {
        class: `size-btn ${w === width ? 'on' : ''}`,
        'aria-label': `Brush ${w}`,
        onclick: (e) => {
          width = w;
          sizes.forEach((s) => s.classList.remove('on'));
          e.currentTarget.classList.add('on');
        },
      },
      h('span', { style: { width: `${w / 1.5 + 2}px`, height: `${w / 1.5 + 2}px` } }),
    ),
  );
  const tools = h(
    'div',
    { class: 'pad-tools' },
    h('div', { class: 'swatches' }, swatches),
    h(
      'div',
      { class: 'row' },
      sizes,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small', onclick: () => (strokes.pop(), paint()) }, '↶ Undo'),
      h('button', { class: 'btn small ghost', onclick: () => strokes.length && (strokes.length = 0, paint()) }, 'Clear'),
    ),
  );
  paint();

  return {
    el: h('div', { class: 'pad-wrap' }, canvas, tools),
    isEmpty: () => strokes.length === 0,
    toDataUrl: () => canvas.toDataURL('image/jpeg', 0.7),
  };
}
