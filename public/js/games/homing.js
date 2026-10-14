import { h, replace, card, doneRow } from '../ui.js';
import * as sensors from '../sensors.js';

const verdict = (err) => {
  if (err === null) return '🤷 No compass';
  if (err < 5) return '🎯 Bullseye!';
  if (err < 15) return '🐦 Homing pigeon';
  if (err < 35) return '👍 Close-ish';
  if (err < 70) return '😬 Vibes only';
  if (err < 120) return '🙃 Wrong direction';
  return '🔄 Literally backwards';
};

export default {
  // Runs after the "I'm ready" tap has asked for location & compass access.
  prepare(c) {
    const loc = sensors.location();
    if (loc) c.send('loc', { lat: loc.lat, lon: loc.lon });
  },
  mount(el, c) {
    let heading = null;
    let accuracy = null;
    let lastHeadingAt = 0;
    let pending = -1;
    let view = c.round.view;
    const startedAt = Date.now();

    const stop = sensors.onHeading((e) => {
      heading = e.heading;
      accuracy = e.accuracy;
      lastHeadingAt = Date.now();
    });

    const body = h('div');
    const status = h('div');
    const warn = h('div');
    replace(el, body, warn, status);

    const lock = () => {
      if (pending === view.locked) return;
      pending = view.locked;
      const fresh = Date.now() - lastHeadingAt < 2000;
      c.send('lock', { heading: fresh ? Math.round(heading * 10) / 10 : null });
      sensors.buzz(40);
    };

    const draw = () => {
      const t = view.targets?.[view.locked];
      if (!t) {
        replace(body, card(h('div', { class: 'center' }, h('div', { class: 'intro-emoji' }, '🕊️'), h('h2', {}, 'All locked in!'), h('p', { class: 'muted' }, 'Waiting for everyone else to find north.'))));
        return;
      }
      const label =
        t.kind === 'player' ? [h('span', { class: 'big-face' }, '🏠'), `${t.label}'s place`] : t.kind === 'place' ? [h('span', { class: 'big-face' }, '🗺️'), t.label] : [h('span', { class: 'big-face' }, '🧭'), `Due ${t.label}`];
      replace(
        body,
        h(
          'div',
          { class: 'card center target' },
          h('div', { class: 'muted small' }, `Target ${view.locked + 1} of ${view.targets.length}`),
          h('div', { class: 'muted' }, 'Point your phone at'),
          h('h1', {}, label),
          t.distMi ? h('div', { class: 'muted' }, `about ${t.distMi.toLocaleString()} miles away`) : null,
          h('div', { class: 'pigeon' }, '🐦'),
          h('p', { class: 'small muted' }, 'Hold it flat like a compass. Top edge points at the target.'),
        ),
        h('button', { class: 'btn primary huge wide', onclick: lock, disabled: pending === view.locked }, '🎯 Lock it in'),
      );
    };

    const warnTimer = setInterval(() => {
      const stale = Date.now() - lastHeadingAt > 2000;
      if (stale && Date.now() - startedAt > 2500) {
        replace(
          warn,
          card(
            h('p', { class: 'small' }, '⚠️ No compass reading from this phone.'),
            h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => sensors.prepare(['orientation']) }, 'Enable compass'), h('button', { class: 'btn small ghost', onclick: lock }, 'Skip this one (0 pts)')),
          ),
        );
      } else if (accuracy !== null && (accuracy < 0 || accuracy > 25)) {
        replace(warn, h('p', { class: 'small center muted' }, '🌀 Compass is fuzzy — wave your phone in a figure-8 to calibrate.'));
      } else replace(warn);
    }, 700);

    draw();
    return {
      update(v, c2) {
        const changed = v.locked !== view.locked;
        view = v;
        if (changed || pending === -1) draw();
        const total = v.targets.length;
        replace(status, doneRow(c2, Object.entries(v.progress).filter(([, n]) => n >= total).map(([id]) => id), 'Locked in'));
      },
      unmount() {
        stop();
        clearInterval(warnTimer);
      },
    };
  },
  results(view, c) {
    return h(
      'div',
      {},
      (view.rows || []).map((row) => {
        const p = c.player(row.pid);
        return card(
          h('div', { class: 'entry-head' }, h('span', { class: 'face' }, p?.avatar ?? '❓'), h('b', {}, p?.name ?? '?'), h('span', { class: 'spacer' }), h('span', { class: 'score' }, `${row.total} pts`)),
          row.shots.map((s) =>
            h(
              'div',
              { class: 'shot' },
              h('div', {}, h('b', {}, s.kind === 'player' ? `${s.label}'s place` : s.kind === 'cardinal' ? `Due ${s.label}` : s.label), s.distMi ? h('span', { class: 'muted small' }, ` · ${s.distMi.toLocaleString()} mi`) : null),
              h(
                'div',
                { class: 'small' },
                verdict(s.err),
                s.err !== null ? ` ${s.err}° off · +${s.pts}` : '',
                s.missMi !== null && s.missMi !== undefined && s.err !== null ? h('span', { class: 'muted' }, ` · would miss by ${s.missMi.toLocaleString()} mi`) : null,
              ),
            ),
          ),
        );
      }),
    );
  },
};
