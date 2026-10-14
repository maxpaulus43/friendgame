import { h, replace, card } from '../ui.js';
import * as sensors from '../sensors.js';

export default {
  mount(el, c) {
    let seenCollisions = c.round.view.totalCollisions;
    const num = h('div', { class: 'count-progress' });
    const btn = h('button', { class: 'count-btn', onclick: () => c.send('tap') });
    const msg = h('div', { class: 'count-msg' });
    const bar = h('div', { class: 'bar' }, h('div', { class: 'fill' }));
    replace(el, num, bar, btn, msg, h('p', { class: 'small muted center' }, 'Anyone can tap. Nobody twice in a row. Two taps at once = back to zero. 🤫 No planning out loud.'));
    return {
      update(v, c2) {
        num.textContent = `${v.n} / ${v.target}`;
        bar.firstChild.style.width = `${(v.n / v.target) * 100}%`;
        const mineLast = v.lastPid === c2.me;
        btn.textContent = mineLast ? 'Not you!' : String(v.n + 1);
        btn.disabled = mineLast;
        if (v.totalCollisions > seenCollisions) {
          seenCollisions = v.totalCollisions;
          const last = v.collisions[v.collisions.length - 1];
          const a = c2.player(last.a);
          const b = c2.player(last.b);
          el.classList.remove('flash');
          void el.offsetWidth;
          el.classList.add('flash');
          sensors.buzz([80, 40, 80]);
          replace(msg, h('div', { class: 'collision' }, `💥 ${a?.avatar ?? ''} ${a?.name ?? '?'} and ${b?.avatar ?? ''} ${b?.name ?? '?'} collided at ${last.at + 1}! Back to zero.`));
        } else if (v.lastPid && !mineLast) {
          const p = c2.player(v.lastPid);
          replace(msg, h('div', { class: 'muted' }, `${p?.avatar ?? ''} ${p?.name ?? '?'} said ${v.n}`));
        }
      },
    };
  },
  results(view) {
    return card(
      h(
        'div',
        { class: 'center' },
        view.outcome === 'win'
          ? [h('div', { class: 'intro-emoji' }, '🧠'), h('h2', {}, `Hive mind! Made it to ${view.target}.`), h('p', {}, `${view.totalCollisions} collision${view.totalCollisions === 1 ? '' : 's'} along the way.`)]
          : [h('div', { class: 'intro-emoji' }, '🫠'), h('h2', {}, `Best run: ${view.best} of ${view.target}`), h('p', {}, `${view.totalCollisions} collisions. Telepathy is hard.`)],
      ),
    );
  },
};
