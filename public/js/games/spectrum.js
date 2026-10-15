import { h, replace, card, doneRow, toast } from '../ui.js';

const name = (c, pid) => `${c.player(pid)?.avatar ?? '❓'} ${c.player(pid)?.name ?? '?'}`;

// The scale: left label ↔ right label, with optional target band and markers.
function scale(v, { target, markers = [], dial } = {}) {
  return h(
    'div',
    { class: 'spec' },
    h('div', { class: 'spec-labels' }, h('span', {}, `← ${v.left}`), h('span', {}, `${v.right} →`)),
    h(
      'div',
      { class: 'spec-track' },
      target !== undefined && target !== null
        ? [
            h('div', { class: 'spec-band b30', style: { left: `${target - 20}%`, width: '40%' } }),
            h('div', { class: 'spec-band b60', style: { left: `${target - 12}%`, width: '24%' } }),
            h('div', { class: 'spec-band b100', style: { left: `${target - 5}%`, width: '10%' } }),
          ]
        : null,
      markers.map((m) => h('div', { class: 'spec-marker', style: { left: `${m.v}%` } }, m.label)),
      dial,
    ),
  );
}

export default {
  mount(el, c) {
    const step = c.round.step;
    const v = c.round.view;
    const head = h('div', { class: 'small muted center' }, `Turn ${v.turn + 1} of ${v.total} · clue-giver: ${name(c, v.giver)}`);

    if (step === 'clue') {
      if (v.isGiver) {
        const input = h('input', { class: 'input', id: 'spec-clue', maxLength: 80, placeholder: 'Your clue', autocomplete: 'off' });
        replace(
          el,
          head,
          card(
            h('h3', {}, 'Your secret target is in the bright zone'),
            scale(v, { target: v.target }),
            h('p', { class: 'muted small' }, 'Give a clue that sits right there on this scale. A thing, a person, a place: anything. No numbers!'),
            input,
          ),
          h('button', { class: 'btn primary huge wide', onclick: () => (input.value.trim() ? c.send('clue', { clue: input.value.trim() }) : toast('Type a clue first.')) }, '🚀 Give clue'),
        );
      } else {
        replace(el, head, card(h('div', { class: 'center' }, h('div', { class: 'intro-emoji bounce' }, '🤔'), h('p', {}, `${name(c, v.giver)} is thinking of a clue…`)), scale(v)));
      }
      return {};
    }

    if (step === 'guess') {
      const clueCard = h('div', { class: 'card prompt center' }, h('div', { class: 'muted small' }, 'The clue'), h('h2', {}, `“${v.clue}”`));
      const status = h('div');
      if (v.isGiver) {
        replace(el, head, clueCard, card(scale(v, { target: v.target })), h('p', { class: 'center muted' }, 'No hints! Just watch them argue.'), status);
        return {
          update(view, c2) {
            replace(status, doneRow({ ...c2, round: { ...c2.round, participants: c2.round.participants.filter((id) => id !== view.giver) } }, view.done, 'Locked in'));
          },
        };
      }
      let value = v.myGuess ?? 50;
      const dial = h('input', { type: 'range', min: 0, max: 100, step: 1, value, class: 'spec-dial', id: 'spec-dial', oninput: (e) => (value = Number(e.target.value)), 'aria-label': `Between ${v.left} and ${v.right}` });
      const btn = h('button', { class: 'btn primary huge wide', onclick: () => c.send('guess', { v: value }) }, '🔒 Lock in');
      replace(el, head, clueCard, card(scale(v, { dial })), h('p', { class: 'center muted small' }, 'Talk it out, then drag the dial and lock in. You can change it until everyone\'s in.'), btn, status);
      return {
        update(view, c2) {
          btn.textContent = view.myGuess !== null ? (view.myGuess === value ? '🔒 Locked in' : '🔒 Update guess') : '🔒 Lock in';
          replace(status, doneRow({ ...c2, round: { ...c2.round, participants: c2.round.participants.filter((id) => id !== view.giver) } }, view.done, 'Locked in'));
        },
      };
    }

    if (step === 'reveal') {
      const markers = Object.entries(v.guesses).map(([pid, g]) => ({ v: g, label: c.player(pid)?.avatar ?? '❓' }));
      replace(
        el,
        head,
        h('div', { class: 'card prompt center' }, h('div', { class: 'muted small' }, 'The clue'), h('h2', {}, `“${v.clue}”`)),
        card(scale(v, { target: v.target, markers })),
        card(
          Object.entries(v.points)
            .sort((a, b) => b[1] - a[1])
            .map(([pid, p]) => h('div', { class: 'player-row' }, h('span', { class: 'name' }, name(c, pid), pid === v.giver ? h('span', { class: 'muted small' }, ' (clue)') : null), h('span', { class: 'spacer' }), h('span', { class: 'plus' }, `+${p}`))),
        ),
      );
      return {};
    }
    return {};
  },
  results(view, c) {
    return card(
      h('h3', {}, 'The clues'),
      (view.turns || []).map((t) => h('div', { class: 'shot' }, h('div', { class: 'small muted' }, `${t.left} ↔ ${t.right} · ${name(c, t.giver)}`), h('b', {}, `“${t.clue ?? '…'}”`), h('span', { class: 'muted small' }, ` → ${t.target}`))),
    );
  },
};
