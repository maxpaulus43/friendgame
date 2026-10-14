import { h, replace, card } from '../ui.js';
import * as sensors from '../sensors.js';

const BALL_R = 0.1;
const TILT_RANGE = 22; // degrees of tilt to reach the edge

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default {
  mount(el, c) {
    let view = c.round.view;
    let ball = { x: 0, y: 0 };
    let goal = { x: 0, y: 0 };
    let gotTilt = false;
    let inZone = false;
    let lastSent = 0;
    let raf = 0;
    const startedAt = Date.now();

    const stopTilt = sensors.onTilt(({ beta, gamma }) => {
      gotTilt = true;
      goal = { x: clamp(gamma / TILT_RANGE, -1, 1), y: clamp(beta / TILT_RANGE, -1, 1) };
    });

    const arena = h('div', { class: 'arena' });
    const ring = h('div', { class: 'ring' });
    const ballEl = h('div', { class: 'ball' });
    arena.append(ring, ballEl);

    // Fallback for phones without a gyroscope (and laptops): drag the ball.
    const drag = (e) => {
      if (gotTilt) return;
      const t = e.touches?.[0] ?? e;
      const r = arena.getBoundingClientRect();
      goal = { x: clamp(((t.clientX - r.left) / r.width) * 2 - 1, -1, 1), y: clamp(((t.clientY - r.top) / r.height) * 2 - 1, -1, 1) };
      e.preventDefault();
    };
    arena.addEventListener('touchmove', drag, { passive: false });
    arena.addEventListener('pointermove', (e) => e.buttons && drag(e));

    const top = h('div', { class: 'bomb-top' });
    const hold = h('div', { class: 'bar hold' }, h('div', { class: 'fill' }));
    const team = h('div', { class: 'team-status' });
    const hint = h('p', { class: 'small muted center' });
    replace(el, top, arena, hold, team, hint);

    const targetPos = () => {
      const t = view.target;
      if (!t) return null;
      if (!t.drift) return t;
      const s = c.now() / 1000;
      return { ...t, x: clamp(t.x + t.drift * Math.sin(s * 1.1 + t.seed), -0.75, 0.75), y: clamp(t.y + t.drift * Math.cos(s * 0.8 + t.seed), -0.75, 0.75) };
    };

    const loop = () => {
      ball.x += (goal.x - ball.x) * 0.25;
      ball.y += (goal.y - ball.y) * 0.25;
      const t = targetPos();
      const toPct = (v) => `${((v + 1) / 2) * 100}%`;
      ballEl.style.left = toPct(ball.x);
      ballEl.style.top = toPct(ball.y);
      if (t) {
        ring.style.left = toPct(t.x);
        ring.style.top = toPct(t.y);
        ring.style.width = ring.style.height = `${t.r * 100}%`;
        const d = Math.hypot(ball.x - t.x, ball.y - t.y);
        const now = inZone ? d < t.r : d < t.r - BALL_R;
        if (now !== inZone) {
          inZone = now;
          sensors.buzz(inZone ? 20 : 0);
          lastSent = 0;
        }
        ring.classList.toggle('in', inZone);
        if (Date.now() - lastSent > 500) {
          lastSent = Date.now();
          c.send('zone', { stage: view.stage, in: inZone });
        }
      }
      hint.textContent = gotTilt || Date.now() - startedAt < 1500 ? 'Tilt to roll the ball into the ring. Then hold still!' : 'No tilt sensor found — drag the ball with your finger.';
      raf = requestAnimationFrame(loop);
    };
    loop();

    return {
      update(v, c2) {
        if (v.stage !== view.stage) {
          inZone = false;
          lastSent = 0;
          sensors.buzz([60, 40, 60]);
        }
        view = v;
        replace(top, h('div', { class: 'wires' }, Array.from({ length: v.stages }, (_, i) => h('span', { class: `wire ${i < v.stage ? 'cut' : i === v.stage ? 'live' : ''}` }, i < v.stage ? '✂️' : '🧨'))), h('div', { class: 'muted small' }, `Wire ${Math.min(v.stage + 1, v.stages)} of ${v.stages}`));
        hold.firstChild.style.width = `${(v.holdMs / v.needMs) * 100}%`;
        replace(
          team,
          c2.round.participants.map((id) => {
            const p = c2.player(id);
            const ok = v.status[id];
            return h('span', { class: `team-chip ${ok ? 'ok' : 'bad'} ${p?.connected === false ? 'offline' : ''}` }, p?.avatar ?? '❓', ' ', p?.name ?? '?', ok ? ' ✓' : ' ✗');
          }),
        );
      },
      unmount() {
        cancelAnimationFrame(raf);
        stopTilt();
      },
    };
  },
  results(view) {
    return card(
      h('div', { class: 'center' }, view.outcome === 'defused' ? [h('div', { class: 'intro-emoji' }, '😅'), h('h2', {}, 'Bomb defused!'), h('p', {}, 'Teamwork makes the dream work. +250 each.')] : [h('div', { class: 'intro-emoji boom' }, '💥'), h('h2', {}, 'BOOM.'), h('p', {}, `You cut ${view.stage} of ${view.stages} wires. Someone wasn't holding still.`)]),
    );
  },
};
