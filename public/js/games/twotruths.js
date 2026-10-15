import { h, replace, card, doneRow, toast } from '../ui.js';

const name = (c, pid) => `${c.player(pid)?.avatar ?? '❓'} ${c.player(pid)?.name ?? '?'}`;
const LETTERS = ['A', 'B', 'C'];

export default {
  mount(el, c) {
    const step = c.round.step;
    const v = c.round.view;

    if (step === 'write') {
      let lie = null;
      const inputs = [0, 1, 2].map((i) => h('textarea', { class: 'input', id: `tt-${i}`, rows: 2, maxLength: 120, placeholder: ['I once met a famous chef', 'I\'ve never seen Star Wars', 'I can juggle'][i] }));
      const lieBtns = [0, 1, 2].map((i) =>
        h('button', {
          class: 'btn small lie-btn',
          onclick: () => {
            lie = i;
            lieBtns.forEach((b, j) => {
              b.classList.toggle('on', j === i);
              b.textContent = j === i ? '🤥 The lie' : 'Mark as lie';
            });
          },
        }, 'Mark as lie'),
      );
      const form = h(
        'div',
        { class: 'card tt-form' },
        h('h3', {}, 'Two truths and a lie about you'),
        inputs.map((inp, i) => h('div', { class: 'tt-row' }, inp, lieBtns[i])),
      );
      const sendBtn = h('button', {
        class: 'btn primary huge wide',
        onclick: () => {
          const statements = inputs.map((x) => x.value.trim());
          if (statements.some((x) => !x)) return toast('Fill in all three.');
          if (lie === null) return toast('Mark which one is the lie.');
          c.send('submit', { statements, lie });
        },
      }, '🚀 Lock in');
      const waiting = h('div', { class: 'card center hidden' }, h('div', { class: 'intro-emoji' }, '😇'), h('p', {}, 'Locked in. Practice your poker face.'));
      const status = h('div');
      replace(el, form, sendBtn, waiting, status);
      return {
        update(view, c2) {
          form.classList.toggle('hidden', view.submitted);
          sendBtn.classList.toggle('hidden', view.submitted);
          waiting.classList.toggle('hidden', !view.submitted);
          replace(status, doneRow(c2, view.done, 'Written'));
        },
      };
    }

    const head = h('div', { class: 'card center' }, h('div', { class: 'muted small' }, `Player ${v.qi + 1} of ${v.total}`), h('h2', {}, `${name(c, v.author)}`), h('div', { class: 'muted' }, 'Which one is the lie?'));

    if (step === 'guess') {
      const isAuthor = v.author === c.me;
      const buttons = v.statements.map((s, i) =>
        h('button', { class: 'statement', disabled: isAuthor, onclick: () => c.send('guess', { i }) }, h('b', {}, LETTERS[i]), h('span', {}, s)),
      );
      const status = h('div');
      replace(
        el,
        head,
        isAuthor ? h('div', { class: 'card callout' }, h('p', {}, '🔥 You\'re in the hot seat. They can ask you anything. Keep a straight face.')) : h('p', { class: 'center muted small' }, 'Grill them on the call, then tap the lie.'),
        h('div', { class: 'statements' }, buttons),
        status,
      );
      return {
        update(view, c2) {
          buttons.forEach((b, i) => b.classList.toggle('on', view.myGuess === i));
          replace(status, doneRow({ ...c2, round: { ...c2.round, participants: c2.round.participants.filter((id) => id !== view.author) } }, view.done, 'Guessed'));
        },
      };
    }

    if (step === 'reveal') {
      const byChoice = [[], [], []];
      for (const [pid, i] of Object.entries(v.guesses)) byChoice[i].push(pid);
      replace(
        el,
        head,
        h(
          'div',
          { class: 'statements' },
          v.statements.map((s, i) =>
            h(
              'div',
              { class: `statement ${i === v.lie ? 'lie' : 'truth'}` },
              h('b', {}, i === v.lie ? '🤥' : '✅'),
              h('span', {}, s, h('div', { class: 'small muted' }, byChoice[i].length ? `Picked by ${byChoice[i].map((id) => c.player(id)?.avatar ?? '❓').join(' ')}` : '')),
            ),
          ),
        ),
      );
      return {};
    }
    return {};
  },
  results(view, c) {
    const fooled = Object.entries(view.fooled || {}).sort((a, b) => b[1] - a[1]);
    return card(
      fooled.length
        ? [h('h3', {}, '🤥 Best liars'), fooled.map(([pid, n]) => h('div', { class: 'player-row' }, h('span', { class: 'name' }, name(c, pid)), h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, `fooled ${n}`)))]
        : h('p', { class: 'center' }, '🕵️ Nobody fooled anybody. You know each other too well.'),
    );
  },
};
