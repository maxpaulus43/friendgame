import { h } from './ui.js';

const SIZE = 600;
const COLORS = [
  '#1b1033', '#e63946', '#f4a261', '#ffd23f', '#2a9d8f', '#3a86ff', '#8338ec', '#ff5fa2', '#6b4226', '#9aa0a6',
  // Skin tones, light to deep.
  '#ffe0c7', '#f1c27d', '#d4a373', '#a86b45', '#6f4329', '#3d2416',
  '#ffffff',
];
const WIDTHS = [4, 10, 22];
const FILL_TOLERANCE = 60; // how different a pixel can be and still get filled

// A finger-painting canvas with colors, brush sizes, a paint bucket, undo
// and clear. Finished strokes and fills are baked into a backing canvas so
// drawing stays smooth no matter how many there are.
export function drawingPad() {
  const canvas = h('canvas', { class: 'pad', width: SIZE, height: SIZE });
  const g = canvas.getContext('2d');
  const base = document.createElement('canvas');
  base.width = base.height = SIZE;
  const bg = base.getContext('2d', { willReadFrequently: true });
  const ops = []; // { type: 'stroke', color, width, points } | { type: 'fill', color, x, y }
  let current = null;
  let color = COLORS[0];
  let width = WIDTHS[1];
  let tool = 'brush';

  const clearBase = () => {
    bg.fillStyle = '#fff';
    bg.fillRect(0, 0, SIZE, SIZE);
  };
  const apply = (op) => (op.type === 'fill' ? floodFill(bg, op.x, op.y, op.color) : drawStroke(bg, op));
  const rebuild = () => {
    clearBase();
    ops.forEach(apply);
  };
  const show = () => {
    g.drawImage(base, 0, 0);
    if (current) drawStroke(g, current);
  };

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE];
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (tool === 'fill') {
      const [x, y] = pos(e).map(Math.floor);
      const op = { type: 'fill', color, x, y };
      ops.push(op);
      apply(op);
      show();
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    current = { type: 'stroke', color, width, points: [pos(e)] };
    show();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) current.points.push(pos(ev));
    show();
  });
  const end = () => {
    if (!current) return;
    ops.push(current);
    apply(current);
    current = null;
    show();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  const pickOne = (list, el) => {
    list.forEach((s) => s.classList.remove('on'));
    el.classList.add('on');
  };
  const swatches = COLORS.map((c) =>
    h('button', {
      class: `swatch ${c === color ? 'on' : ''}`,
      style: { background: c },
      'aria-label': c === '#ffffff' ? 'White (eraser)' : `Color ${c}`,
      onclick: (e) => {
        color = c;
        pickOne(swatches, e.currentTarget);
      },
    }),
  );
  const brushBtn = h('button', { class: 'tool-btn on', 'aria-label': 'Brush', onclick: (e) => ((tool = 'brush'), pickOne(toolBtns, e.currentTarget)) }, '✏️');
  const fillBtn = h('button', { class: 'tool-btn', 'aria-label': 'Paint bucket', onclick: (e) => ((tool = 'fill'), pickOne(toolBtns, e.currentTarget)) }, '🪣');
  const toolBtns = [brushBtn, fillBtn];
  const sizes = WIDTHS.map((w) =>
    h(
      'button',
      {
        class: `size-btn ${w === width ? 'on' : ''}`,
        'aria-label': `Brush size ${w}`,
        onclick: (e) => {
          width = w;
          tool = 'brush';
          pickOne(toolBtns, brushBtn);
          pickOne(sizes, e.currentTarget);
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
      { class: 'row tool-row' },
      toolBtns,
      sizes,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small', onclick: () => ops.length && (ops.pop(), rebuild(), show()) }, '↶'),
      h('button', { class: 'btn small ghost', onclick: () => ops.length && ((ops.length = 0), rebuild(), show()) }, 'Clear'),
    ),
  );
  clearBase();
  show();

  return {
    el: h('div', { class: 'pad-wrap' }, canvas, tools),
    isEmpty: () => ops.length === 0,
    toDataUrl: () => base.toDataURL('image/jpeg', 0.7),
  };
}

function drawStroke(g, s) {
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
}

// Scanline flood fill. Pixels close to the starting color get painted, which
// also swallows the soft anti-aliased edge just inside a line.
export function floodFill(g, x, y, hex) {
  const { width: w, height: hgt } = g.canvas;
  if (x < 0 || y < 0 || x >= w || y >= hgt) return;
  const img = g.getImageData(0, 0, w, hgt);
  const d = img.data;
  const fill = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const start = (y * w + x) * 4;
  const target = [d[start], d[start + 1], d[start + 2]];
  if (Math.abs(target[0] - fill[0]) + Math.abs(target[1] - fill[1]) + Math.abs(target[2] - fill[2]) < 8) return;
  const matches = (i) => Math.abs(d[i] - target[0]) + Math.abs(d[i + 1] - target[1]) + Math.abs(d[i + 2] - target[2]) <= FILL_TOLERANCE;
  const seen = new Uint8Array(w * hgt);
  const stack = [[x, y]];
  while (stack.length) {
    let [cx, cy] = stack.pop();
    let i = cy * w + cx;
    while (cx >= 0 && !seen[i] && matches(i * 4)) {
      cx--;
      i--;
    }
    cx++;
    i++;
    let up = false;
    let down = false;
    while (cx < w && !seen[i] && matches(i * 4)) {
      seen[i] = 1;
      const p = i * 4;
      d[p] = fill[0];
      d[p + 1] = fill[1];
      d[p + 2] = fill[2];
      d[p + 3] = 255;
      if (cy > 0) {
        const ok = !seen[i - w] && matches((i - w) * 4);
        if (ok && !up) stack.push([cx, cy - 1]);
        up = ok;
      }
      if (cy < hgt - 1) {
        const ok = !seen[i + w] && matches((i + w) * 4);
        if (ok && !down) stack.push([cx, cy + 1]);
        down = ok;
      }
      cx++;
      i++;
    }
  }
  g.putImageData(img, 0, 0);
}
