import { h, replace, card, doneRow } from '../ui.js';

export default {
  mount(el, c) {
    const step = c.round.step;
    const v = c.round.view;
    const head = h('div', { class: 'card prompt' }, h('div', { class: 'muted small' }, `Question ${v.qi + 1} of ${v.total}`), h('div', { class: 'muted' }, 'Who\'s most likely to…'), h('h2', {}, `${v.q}?`));
    if (step === 'vote') {
      const buttons = new Map();
      const grid = h(
        'div',
        { class: 'vote-grid' },
        c.round.participants.map((id) => {
          const p = c.player(id);
          const b = h('button', { class: 'vote-person', onclick: () => c.send('vote', { pid: id }) }, h('span', { class: 'face' }, p?.avatar ?? '❓'), h('span', { class: 'name' }, p?.name ?? '?', id === c.me ? ' (you)' : ''));
          buttons.set(id, b);
          return b;
        }),
      );
      const status = h('div');
      replace(el, head, grid, status);
      return {
        update(view, c2) {
          for (const [id, b] of buttons) b.classList.toggle('on', view.myVote === id);
          replace(status, doneRow(c2, view.done, 'Voted'));
        },
      };
    }
    if (step === 'reveal') {
      const winners = v.winners.map((id) => c.player(id)).filter(Boolean);
      replace(
        el,
        head,
        h(
          'div',
          { class: 'card center reveal' },
          winners.length
            ? [h('div', { class: 'champ-face' }, winners.map((p) => p.avatar).join(' ')), h('h2', {}, winners.map((p) => p.name).join(' & ')), h('div', { class: 'muted' }, winners.length > 1 ? 'It\'s a tie. Settle it.' : 'The people have spoken.')]
            : h('p', {}, 'Nobody voted. Cowards.'),
        ),
        card(
          v.rows.map((row) =>
            h(
              'div',
              { class: 'player-row' },
              h('span', { class: 'face' }, c.player(row.pid)?.avatar ?? '❓'),
              h('span', { class: 'name' }, c.player(row.pid)?.name ?? '?'),
              h('span', { class: 'spacer' }),
              h('span', { class: 'small muted' }, 'from ', row.voters.map((id) => c.player(id)?.avatar ?? '❓').join(' ')),
              h('span', { class: 'score' }, row.voters.length),
            ),
          ),
        ),
        h('p', { class: 'center muted small' }, 'Disagree? Say so. Loudly.'),
      );
      return {};
    }
    return {};
  },
  results(view, c) {
    return card(
      h('h3', {}, 'Tonight\'s titles'),
      (view.summary || []).map((s) => h('div', { class: 'shot' }, h('div', { class: 'small muted' }, `Most likely to ${s.q}`), h('b', {}, s.winners.length ? s.winners.map((id) => `${c.player(id)?.avatar ?? ''} ${c.player(id)?.name ?? '?'}`).join(' & ') : 'Nobody'))),
      h('p', { class: 'small muted' }, '+60 for each time you voted with the crowd, +20 for each title you "won".'),
    );
  },
};
