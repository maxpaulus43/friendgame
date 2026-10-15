import { h, replace, card, doneRow } from '../ui.js';

const name = (c, pid) => `${c.player(pid)?.avatar ?? '❓'} ${c.player(pid)?.name ?? '?'}`;

function secretCard(v) {
  return h(
    'div',
    { class: `card center secret ${v.isImposter ? 'imposter' : ''}` },
    h('div', { class: 'muted small' }, 'Category'),
    h('h3', {}, v.category),
    v.isImposter
      ? [h('div', { class: 'intro-emoji' }, '🕵️'), h('h2', {}, 'You\'re the imposter!'), h('p', { class: 'muted' }, 'You don\'t know the word. Listen to the others and blend in.')]
      : [h('div', { class: 'muted small' }, 'The secret word'), h('div', { class: 'secret-word' }, v.word), h('p', { class: 'muted small' }, 'One person doesn\'t know this. Don\'t make it too easy for them.')],
  );
}

export default {
  mount(el, c) {
    const step = c.round.step;
    const v = c.round.view;

    if (step === 'clues') {
      const doneBtn = h('button', { class: 'btn primary wide', onclick: () => c.send('done') }, '✅ I\'ve said my word');
      const status = h('div');
      replace(
        el,
        secretCard(v),
        card(
          h('h3', {}, 'Say ONE word each, in this order'),
          h('ol', { class: 'order-list' }, v.order.map((id) => h('li', {}, name(c, id), id === c.me ? h('span', { class: 'muted' }, ' (you)') : null))),
          h('p', { class: 'muted small' }, 'Go around twice if nobody\'s sure yet.'),
        ),
        doneBtn,
        status,
      );
      return {
        update(view, c2) {
          const mine = view.talked.includes(c2.me);
          doneBtn.disabled = mine;
          doneBtn.textContent = mine ? 'Waiting for the others…' : '✅ I\'ve said my word';
          replace(status, doneRow(c2, view.talked, 'Ready to vote'));
        },
      };
    }

    if (step === 'vote') {
      const buttons = new Map();
      const grid = h(
        'div',
        { class: 'vote-grid' },
        c.round.participants
          .filter((id) => id !== c.me)
          .map((id) => {
            const b = h('button', { class: 'vote-person', onclick: () => c.send('vote', { pid: id }) }, h('span', { class: 'face' }, c.player(id)?.avatar ?? '❓'), h('span', { class: 'name' }, c.player(id)?.name ?? '?'));
            buttons.set(id, b);
            return b;
          }),
      );
      const status = h('div');
      replace(el, h('div', { class: 'card prompt' }, h('div', { class: 'muted small' }, v.isImposter ? 'Pin it on someone else' : 'Who doesn\'t know the word?'), h('h2', {}, 'Vote for the imposter')), grid, status);
      return {
        update(view, c2) {
          for (const [id, b] of buttons) b.classList.toggle('on', view.myVote === id);
          replace(status, doneRow(c2, view.done, 'Voted'));
        },
      };
    }

    if (step === 'reveal' || step === 'guess') {
      const rows = Object.entries(v.tally).sort((a, b) => b[1].length - a[1].length);
      const parts = [
        h(
          'div',
          { class: `card center reveal ${v.caught ? '' : 'callout'}` },
          h('div', { class: 'muted small' }, 'The imposter was'),
          h('div', { class: 'champ-face' }, c.player(v.imposter)?.avatar ?? '❓'),
          h('h2', {}, c.player(v.imposter)?.name ?? '?'),
          h('p', {}, v.caught ? '🚨 Caught! …but they can still steal it by guessing the word.' : '😈 Got away with it!'),
          v.word ? h('p', { class: 'muted' }, `The word was "${v.word}".`) : null,
        ),
        card(
          h('h3', {}, 'Votes'),
          rows.length ? rows.map(([pid, voters]) => h('div', { class: 'player-row' }, h('span', { class: 'name' }, name(c, pid)), h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, voters.map((id) => c.player(id)?.avatar ?? '❓').join(' ')), h('span', { class: 'score' }, voters.length))) : h('p', { class: 'muted' }, 'Nobody voted.'),
        ),
      ];
      if (step === 'guess') {
        parts.unshift(
          v.words
            ? card(h('h3', {}, 'Last chance: what was the word?'), h('div', { class: 'word-grid' }, v.words.map((w) => h('button', { class: 'btn', onclick: () => c.send('guess', { word: w }) }, w))))
            : card(h('p', { class: 'center' }, `${name(c, v.imposter)} is guessing the word…`)),
        );
      }
      replace(el, ...parts);
      return {};
    }
    return {};
  },
  results(view, c) {
    const who = name(c, view.imposter);
    const text = {
      escaped: `${who} fooled everyone. The word was "${view.word}".`,
      stole: `${who} got caught, then guessed "${view.word}" and stole the win!`,
      caught: `${who} got caught and guessed "${view.guess ?? 'nothing'}". The word was "${view.word}".`,
    }[view.outcome];
    return card(h('div', { class: 'center' }, h('div', { class: 'intro-emoji' }, view.outcome === 'caught' ? '🚨' : '😈'), h('p', {}, text)));
  },
};
