import { h, replace, fmt, card } from '../ui.js';
import * as sensors from '../sensors.js';

const TAP_VALUE = 45;

export default {
  mount(el, c) {
    let total = 0;
    let last = null;
    let gotMotion = false;
    let lastSent = 0;
    let raf = 0;
    let view = c.round.view;

    const inWindow = () => {
      const now = c.now();
      return now >= view.startAt && now <= view.endAt;
    };

    const stopMotion = sensors.onMotion((e) => {
      const a = e.accelerationIncludingGravity || e.acceleration;
      if (!a || a.x === null) return;
      gotMotion = true;
      if (last && inWindow()) total += Math.abs(a.x - last.x) + Math.abs(a.y - last.y) + Math.abs(a.z - last.z);
      last = { x: a.x, y: a.y, z: a.z };
    });

    const big = h('div', { class: 'shake-big' });
    const mine = h('div', { class: 'shake-mine' });
    const tapBtn = h('button', { class: 'btn primary huge wide hidden', onclick: () => inWindow() && (total += TAP_VALUE) }, 'TAP TAP TAP');
    const bars = h('div', { class: 'card bars' });
    replace(el, big, mine, tapBtn, bars);

    const send = (force) => {
      const now = Date.now();
      if (force || now - lastSent > 200) {
        lastSent = now;
        c.send('shake', { value: Math.round(total) });
      }
    };

    let finalSent = false;
    const loop = () => {
      const now = c.now();
      if (now < view.startAt) {
        const n = Math.ceil((view.startAt - now) / 1000);
        big.textContent = n > 3 ? 'Get a grip…' : String(n);
        big.className = 'shake-big count';
      } else if (now <= view.endAt) {
        big.textContent = 'SHAKE!';
        big.className = 'shake-big go';
        send(false);
        if (!gotMotion && now - view.startAt > 1200) tapBtn.classList.remove('hidden');
      } else {
        big.textContent = 'TIME!';
        big.className = 'shake-big done';
        if (!finalSent) {
          finalSent = true;
          send(true);
        }
      }
      mine.textContent = `${fmt(total)} jiggles`;
      raf = requestAnimationFrame(loop);
    };
    loop();

    return {
      update(v, c2) {
        view = v;
        const scores = { ...v.scores, [c2.me]: Math.max(total, v.scores[c2.me] || 0) };
        const max = Math.max(1, ...Object.values(scores));
        const ids = [...c2.round.participants].sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
        replace(
          bars,
          ids.map((id) => {
            const p = c2.player(id);
            const val = scores[id] || 0;
            return h(
              'div',
              { class: `bar-row ${id === c2.me ? 'me' : ''}` },
              h('span', { class: 'face' }, p?.avatar ?? '❓'),
              h('div', { class: 'bar' }, h('div', { class: 'fill', style: { width: `${(val / max) * 100}%` } })),
              h('span', { class: 'val' }, fmt(val)),
            );
          }),
        );
      },
      unmount() {
        cancelAnimationFrame(raf);
        stopMotion();
      },
    };
  },
  results(view, c) {
    const rows = Object.entries(view.scores || {}).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return card(h('p', { class: 'center muted' }, 'Nobody shook anything. Suspicious.'));
    const [winId, winScore] = rows[0];
    const cats = Math.max(1, Math.round(winScore / 900));
    return card(
      h('p', { class: 'center' }, `${c.player(winId)?.avatar ?? ''} ${c.player(winId)?.name ?? '?'} shook with the force of ${cats} startled cat${cats === 1 ? '' : 's'}.`),
      rows.map(([pid, v], i) => h('div', { class: 'player-row' }, h('span', { class: 'rank' }, `${i + 1}.`), h('span', { class: 'face' }, c.player(pid)?.avatar ?? '❓'), h('span', { class: 'name' }, c.player(pid)?.name ?? '?'), h('span', { class: 'spacer' }), h('span', { class: 'score' }, `${fmt(v)} jiggles`))),
    );
  },
};
