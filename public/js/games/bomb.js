import { h, replace, card } from '../ui.js';
import * as sensors from '../sensors.js';

const BALL_R = 0.1;
const TILT_RANGE = 25; // degrees of tilt for full push
const ACCEL = 3.2; // arena units / s² at full tilt
const FRICTION = 1.1; // per second; low = slidey
const JITTER = 0.9; // random nudges so it never sits perfectly still
const SPARK_R = 0.07;
const ZAP_MS = 900;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default {
  mount(el, c) {
    let view = c.round.view;
    const ball = { x: 0, y: 0, vx: 0, vy: 0 };
    let tilt = { x: 0, y: 0 };
    let drag = null;
    let gotTilt = false;
    let inZone = false;
    let lastSent = 0;
    let zappedUntil = 0;
    let sparks = [];
    let raf = 0;
    let last = performance.now();
    const startedAt = Date.now();

    const stopTilt = sensors.onTilt(({ beta, gamma }) => {
      gotTilt = true;
      tilt = { x: clamp(gamma / TILT_RANGE, -1.4, 1.4), y: clamp(beta / TILT_RANGE, -1.4, 1.4) };
    });

    const arena = h('div', { class: 'arena' });
    const ring = h('div', { class: 'ring' });
    const ballEl = h('div', { class: 'ball' });
    const sparkLayer = h('div');
    arena.append(ring, sparkLayer, ballEl);

    // Fallback for phones without a gyroscope (and laptops): drag the ball.
    const onDrag = (e) => {
      if (gotTilt) return;
      const t = e.touches?.[0] ?? e;
      const r = arena.getBoundingClientRect();
      drag = { x: clamp(((t.clientX - r.left) / r.width) * 2 - 1, -1, 1), y: clamp(((t.clientY - r.top) / r.height) * 2 - 1, -1, 1) };
      e.preventDefault();
    };
    arena.addEventListener('touchmove', onDrag, { passive: false });
    arena.addEventListener('pointermove', (e) => e.buttons && onDrag(e));

    const top = h('div', { class: 'bomb-top' });
    const hold = h('div', { class: 'bar hold' }, h('div', { class: 'fill' }));
    const team = h('div', { class: 'team-status' });
    const hint = h('p', { class: 'small muted center' });
    replace(el, top, arena, hold, team, hint);

    const makeSparks = (n) => {
      sparkLayer.replaceChildren();
      sparks = Array.from({ length: n }, () => {
        const a = Math.random() * Math.PI * 2;
        const speed = 0.55 + Math.random() * 0.35;
        const s = { x: Math.cos(a) * 0.7, y: Math.sin(a) * 0.7, vx: -Math.cos(a + 0.6) * speed, vy: -Math.sin(a + 0.6) * speed, el: h('div', { class: 'spark' }, '⚡') };
        sparkLayer.append(s.el);
        return s;
      });
    };
    makeSparks(view.target?.sparks ?? 0);

    const targetPos = () => {
      const t = view.target;
      if (!t) return null;
      if (!t.drift) return t;
      const s = (c.now() / 1000) * (t.speed || 1);
      return { ...t, x: clamp(t.x + t.drift * Math.sin(s * 1.1 + t.seed), -0.72, 0.72), y: clamp(t.y + t.drift * Math.cos(s * 0.8 + t.seed * 1.3), -0.72, 0.72) };
    };

    // Keep a body inside the round arena, bouncing off the rim.
    const contain = (b, r) => {
      const d = Math.hypot(b.x, b.y);
      const max = 1 - r;
      if (d > max) {
        const nx = b.x / d;
        const ny = b.y / d;
        b.x = nx * max;
        b.y = ny * max;
        const dot = b.vx * nx + b.vy * ny;
        if (dot > 0) {
          b.vx -= 1.6 * dot * nx;
          b.vy -= 1.6 * dot * ny;
        }
      }
    };

    const pct = (v) => `${((v + 1) / 2) * 100}%`;

    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const zapped = Date.now() < zappedUntil;

      if (drag && !gotTilt) {
        // Finger mode: spring toward the finger.
        ball.vx += (drag.x - ball.x) * 18 * dt;
        ball.vy += (drag.y - ball.y) * 18 * dt;
        ball.vx *= 1 - 6 * dt;
        ball.vy *= 1 - 6 * dt;
      } else {
        ball.vx += (tilt.x * ACCEL + (Math.random() - 0.5) * JITTER) * dt;
        ball.vy += (tilt.y * ACCEL + (Math.random() - 0.5) * JITTER) * dt;
        ball.vx *= 1 - FRICTION * dt;
        ball.vy *= 1 - FRICTION * dt;
      }
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      contain(ball, BALL_R);

      for (const s of sparks) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        contain(s, SPARK_R);
        s.el.style.left = pct(s.x);
        s.el.style.top = pct(s.y);
        if (!zapped && Math.hypot(s.x - ball.x, s.y - ball.y) < BALL_R + SPARK_R) {
          // Zap: knock the ball away from the spark.
          const d = Math.hypot(ball.x - s.x, ball.y - s.y) || 1;
          ball.vx += ((ball.x - s.x) / d) * 2.2;
          ball.vy += ((ball.y - s.y) / d) * 2.2;
          zappedUntil = Date.now() + ZAP_MS;
          sensors.buzz([40, 30, 40]);
        }
      }

      ballEl.style.left = pct(ball.x);
      ballEl.style.top = pct(ball.y);
      ballEl.classList.toggle('zapped', zapped);

      const t = targetPos();
      if (t) {
        ring.style.left = pct(t.x);
        ring.style.top = pct(t.y);
        ring.style.width = ring.style.height = `${t.r * 100}%`;
        const d = Math.hypot(ball.x - t.x, ball.y - t.y);
        const now2 = !zapped && (inZone ? d < t.r : d < t.r - BALL_R);
        if (now2 !== inZone) {
          inZone = now2;
          if (inZone) sensors.buzz(20);
          lastSent = 0;
        }
        ring.classList.toggle('in', inZone);
        if (Date.now() - lastSent > 400) {
          lastSent = Date.now();
          c.send('zone', { stage: view.stage, in: inZone });
        }
      }
      hint.textContent = zapped
        ? '⚡ Zapped!'
        : gotTilt || Date.now() - startedAt < 1500
          ? 'Tilt gently. The ball slides. Hold it in the ring.'
          : 'No tilt sensor found. Drag the ball with your finger.';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return {
      update(v, c2) {
        if (v.stage !== view.stage) {
          inZone = false;
          lastSent = 0;
          sensors.buzz([60, 40, 60]);
          view = v;
          makeSparks(v.target?.sparks ?? 0);
        }
        view = v;
        replace(
          top,
          h('div', { class: 'wires' }, Array.from({ length: v.stages }, (_, i) => h('span', { class: `wire ${i < v.stage ? 'cut' : i === v.stage ? 'live' : ''}` }, i < v.stage ? '✂️' : '🧨'))),
          h('div', { class: 'muted small' }, `Wire ${Math.min(v.stage + 1, v.stages)} of ${v.stages}`),
        );
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
      h(
        'div',
        { class: 'center' },
        view.outcome === 'defused'
          ? [h('div', { class: 'intro-emoji' }, '😅'), h('h2', {}, 'Bomb defused!'), h('p', {}, 'All four wires. Teamwork makes the dream work. +300 each.')]
          : [h('div', { class: 'intro-emoji boom' }, '💥'), h('h2', {}, 'BOOM.'), h('p', {}, `You cut ${view.stage} of ${view.stages} wires. Someone wasn't holding still.`)],
      ),
    );
  },
};
