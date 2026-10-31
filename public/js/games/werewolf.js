import { h, replace, card, doneRow } from '../ui.js';

const name = (c, pid) => `${c.player(pid)?.avatar ?? '❓'} ${c.player(pid)?.name ?? '?'}`;
const roleLabel = (roles, id) => `${roles[id].emoji} ${roles[id].name}`;

function roleCard(v, title = 'Your card') {
  const r = v.roles[v.role];
  return h(
    'div',
    { class: `card center ww-role team-${r.team}` },
    h('div', { class: 'muted small' }, title),
    h('div', { class: 'ww-emoji' }, r.emoji),
    h('h2', {}, r.name),
    h('p', { class: 'small' }, r.text),
  );
}

function infoCard(v) {
  if (!v.info.length) return null;
  return card(h('h3', {}, '🤫 What you know'), h('ul', { class: 'ww-info' }, v.info.map((line) => h('li', {}, line))));
}

// The cards in this game (everyone knows the mix, not who has what).
function deckCard(v) {
  const counts = {};
  for (const id of v.deck) counts[id] = (counts[id] || 0) + 1;
  return card(
    h('h3', {}, 'Cards in play'),
    h('div', { class: 'chips' }, Object.entries(counts).map(([id, n]) => h('span', { class: `chip ww-chip team-${v.roles[id].team}` }, `${roleLabel(v.roles, id)}${n > 1 ? ` ×${n}` : ''}`))),
    h('p', { class: 'small muted' }, `${v.deck.length} cards: one per player, 3 face down in the center.`),
  );
}

// Pick-some-things UI used by the night actions.
function picker(options, { count = 1, confirm, skip }) {
  const chosen = [];
  const buttons = options.map((o) =>
    h(
      'button',
      {
        class: 'btn ww-pick',
        onclick: (e) => {
          const i = chosen.indexOf(o.value);
          if (i >= 0) chosen.splice(i, 1);
          else {
            if (chosen.length >= count) chosen.shift();
            chosen.push(o.value);
          }
          buttons.forEach((b, j) => b.classList.toggle('on', chosen.includes(options[j].value)));
          go.disabled = chosen.length !== count;
          e.currentTarget.blur();
        },
      },
      o.label,
    ),
  );
  const go = h('button', { class: 'btn primary wide', disabled: true, onclick: () => confirm(count === 1 ? chosen[0] : [...chosen]) }, count === 1 ? 'Do it' : `Choose these ${count}`);
  return h('div', { class: 'ww-picker' }, h('div', { class: 'ww-options' }, buttons), go, skip ? h('button', { class: 'btn ghost wide', onclick: skip }, skip.label ?? 'Skip') : null);
}

function nightAction(v, c) {
  const send = (data) => c.send('night', data);
  const others = v.players.filter((id) => id !== c.me).map((id) => ({ value: id, label: name(c, id) }));
  const centers = [0, 1, 2].map((i) => ({ value: i, label: `🂠 Center ${i + 1}` }));
  const skipBtn = (label) => Object.assign(() => send({ skip: true }), { label });
  switch (v.role) {
    case 'werewolf':
      if (v.loneWolf) return [h('h3', {}, 'Peek at one center card?'), picker(centers, { confirm: (i) => send({ center: i }), skip: skipBtn('Don\'t peek') })];
      break;
    case 'seer':
      return [
        h('h3', {}, 'Look at one player\'s card…'),
        picker(others, { confirm: (id) => send({ player: id }) }),
        h('h3', {}, '…or two center cards'),
        picker(centers, { count: 2, confirm: (ids) => send({ centers: ids }), skip: skipBtn('Don\'t look at anything') }),
      ];
    case 'robber':
      return [h('h3', {}, 'Rob someone?'), h('p', { class: 'small muted' }, 'You swap cards with them and see what you got.'), picker(others, { confirm: (id) => send({ player: id }), skip: skipBtn('Don\'t rob anyone') })];
    case 'troublemaker':
      if (others.length >= 2) return [h('h3', {}, 'Swap two other players\' cards?'), picker(others, { count: 2, confirm: (ids) => send({ players: ids }), skip: skipBtn('Leave them alone') })];
      break;
    case 'drunk':
      return [h('h3', {}, 'Pick a center card to swap with'), h('p', { class: 'small muted' }, 'You won\'t see what you got.'), picker(centers, { confirm: (i) => send({ center: i }) })];
  }
  return [h('button', { class: 'btn primary huge wide', onclick: () => send({}) }, '😴 Got it. Go to sleep.')];
}

export default {
  mount(el, c) {
    const step = c.round.step;
    const v = c.round.view;
    if (v.spectator) {
      replace(el, card(h('p', { class: 'center' }, 'You joined mid-game. Watch the chaos and jump in next round.')));
      return {};
    }

    if (step === 'night') {
      const actionBox = h('div', { class: 'card' });
      const infoBox = h('div');
      const status = h('div');
      replace(el, h('div', { class: 'ww-night center' }, '🌙 Night falls. Keep your screen to yourself.'), roleCard(v), infoBox, actionBox, status);
      let drawnDone = null;
      return {
        update(view, c2) {
          replace(infoBox, infoCard(view));
          if (drawnDone !== view.done) {
            drawnDone = view.done;
            if (view.done) replace(actionBox, h('div', { class: 'center' }, h('div', { class: 'intro-emoji' }, '😴'), h('p', {}, 'Sleeping… waiting for everyone else to finish.')));
            else replace(actionBox, ...nightAction(view, c2));
          }
          replace(status, doneRow(c2, view.doneIds, 'Asleep'));
        },
      };
    }

    if (step === 'day') {
      const readyBtn = h('button', { class: 'btn primary wide', onclick: () => c.send('ready') }, '🗳️ Ready to vote');
      const status = h('div');
      replace(
        el,
        h('div', { class: 'ww-day center' }, '🌞 Morning! Talk it out on the call. Who\'s the werewolf?'),
        roleCard(v, 'You started as'),
        infoCard(v),
        deckCard(v),
        h('p', { class: 'small muted center' }, 'Your card may have been swapped in the night. You can claim anything. Others can lie too.'),
        readyBtn,
        status,
      );
      return {
        update(view, c2) {
          const mine = view.ready.includes(c2.me);
          readyBtn.disabled = mine;
          readyBtn.textContent = mine ? 'Waiting for the others…' : '🗳️ Ready to vote';
          replace(status, doneRow(c2, view.ready, 'Ready to vote'));
        },
      };
    }

    if (step === 'vote') {
      const buttons = new Map();
      const grid = h(
        'div',
        { class: 'vote-grid' },
        v.players
          .filter((id) => id !== c.me)
          .map((id) => {
            const b = h('button', { class: 'vote-person', onclick: () => c.send('vote', { pid: id }) }, h('span', { class: 'face' }, c.player(id)?.avatar ?? '❓'), h('span', { class: 'name' }, c.player(id)?.name ?? '?'));
            buttons.set(id, b);
            return b;
          }),
      );
      const status = h('div');
      replace(
        el,
        h('div', { class: 'card prompt' }, h('div', { class: 'muted small' }, 'Whoever gets the most votes (at least 2) is out'), h('h2', {}, 'Vote someone out')),
        grid,
        infoCard(v),
        status,
      );
      return {
        update(view, c2) {
          for (const [id, b] of buttons) b.classList.toggle('on', view.myVote === id);
          replace(status, doneRow(c2, view.voted, 'Voted'));
        },
      };
    }
    return {};
  },
  results(view, c) {
    const res = view.result;
    if (!res) return null;
    const roles = view.roles;
    return h(
      'div',
      {},
      h('div', { class: 'card center callout' }, h('h2', {}, res.headline)),
      card(
        h('h3', {}, 'Who was who'),
        res.players.map((p) =>
          h(
            'div',
            { class: `ww-row ${p.won ? 'won' : ''}` },
            h('div', { class: 'ww-who' }, name(c, p.pid), p.died ? ' 💀' : '', p.won ? h('span', { class: 'ww-win' }, ' won') : null),
            h(
              'div',
              { class: 'small' },
              p.original === p.final ? roleLabel(roles, p.final) : [h('span', { class: 'muted' }, roleLabel(roles, p.original)), ' → ', h('b', {}, roleLabel(roles, p.final))],
              h('span', { class: 'muted' }, ` · ${p.votes} vote${p.votes === 1 ? '' : 's'}${p.votedFor ? ` · voted ${c.player(p.votedFor)?.name ?? '?'}` : ''}`),
            ),
          ),
        ),
      ),
      card(h('h3', {}, '🌙 What happened in the night'), h('ul', { class: 'ww-info' }, res.log.map((l) => h('li', {}, l)))),
      card(
        h('h3', {}, 'The center cards'),
        h(
          'div',
          { class: 'small' },
          res.finalCenter.map((id, i) => h('div', {}, `Center ${i + 1}: `, res.center[i] === id ? roleLabel(roles, id) : [h('span', { class: 'muted' }, roleLabel(roles, res.center[i])), ' → ', roleLabel(roles, id)])),
        ),
      ),
    );
  },
};
