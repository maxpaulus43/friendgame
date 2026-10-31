// Rules tests for One Night Werewolf with a fixed deal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import werewolf, { _internals, deckFor } from '../server/games/werewolf.js';

// A stand-in for the server's Round with the cards dealt the way we want.
function fakeRound(deal, center) {
  const players = Object.keys(deal);
  const r = {
    step: 'night',
    room: {},
    points: null,
    data: {
      players,
      deck: [...Object.values(deal), ...center],
      original: new Map(Object.entries(deal)),
      center,
      cards: null,
      finalCenter: null,
      actions: new Map(),
      done: new Set(),
      info: new Map(players.map((p) => [p, []])),
      ready: new Set(),
      votes: new Map(),
      result: null,
    },
    player: (id) => ({ name: id, connected: true }),
    playerIds: () => players,
    activeIds: () => players,
    setStep(name) {
      r.step = name;
    },
    touch() {},
    finish(points) {
      r.points = points;
      r.step = 'results';
    },
  };
  for (const p of players) r.data.info.get(p).push(..._internals.knowledge(r, p));
  return r;
}

const act = (r, pid, msg) => werewolf.action(r, pid, { a: 'night', ...msg });

test('deck sizes: players + 3, masons come in pairs', () => {
  for (let n = 3; n <= 16; n++) {
    const deck = deckFor(n);
    assert.equal(deck.length, n + 3);
    assert.notEqual(deck.filter((x) => x === 'mason').length, 1);
  }
});

test('swaps resolve Robber → Troublemaker, and the Insomniac sees the result', () => {
  const r = fakeRound({ A: 'werewolf', B: 'robber', C: 'troublemaker', D: 'seer', E: 'insomniac' }, ['werewolf', 'villager', 'drunk']);
  assert.match(r.data.info.get('A')[0], /only werewolf/);
  act(r, 'A', { center: 0 });
  act(r, 'B', { player: 'A' });
  act(r, 'C', { players: ['A', 'E'] });
  act(r, 'D', { player: 'A' });
  act(r, 'E', {});
  assert.equal(r.step, 'day');
  assert.match(r.data.info.get('A').at(-1), /Center card 1 is the 🐺 Werewolf/);
  // The Robber sees the card they took (A's original), the Seer sees A's original too.
  assert.match(r.data.info.get('B').at(-1), /now the 🐺 Werewolf/);
  assert.match(r.data.info.get('D').at(-1), /A is the 🐺 Werewolf/);
  // After Robber (B↔A) then Troublemaker (A↔E): A=insomniac, B=werewolf, E=robber.
  assert.equal(r.data.cards.get('A'), 'insomniac');
  assert.equal(r.data.cards.get('B'), 'werewolf');
  assert.equal(r.data.cards.get('E'), 'robber');
  assert.match(r.data.info.get('E').at(-1), /you're the 🦝 Robber/);

  for (const p of ['A', 'C', 'D', 'E']) r.data.votes.set(p, 'B');
  r.data.votes.set('B', 'C');
  _internals.finishUp(r);
  assert.match(r.data.result.headline, /village wins/);
  assert.equal(r.points.A, 300);
  assert.equal(r.points.B, 0);
  assert.deepEqual(r.data.result.players.filter((p) => p.died).map((p) => p.pid), ['B']);
});

test('the Drunk swaps blind, even if they fall asleep without choosing', () => {
  const r = fakeRound({ A: 'drunk', B: 'villager', C: 'werewolf' }, ['seer', 'werewolf', 'robber']);
  act(r, 'B', {});
  act(r, 'C', { center: 2 });
  _internals.dawn(r);
  assert.ok(['seer', 'werewolf', 'robber'].includes(r.data.cards.get('A')));
  assert.ok(r.data.finalCenter.includes('drunk'));
});

test('nobody dies without at least two votes; with a werewolf alive, wolves win', () => {
  const r = fakeRound({ A: 'werewolf', B: 'villager', C: 'seer' }, ['werewolf', 'robber', 'troublemaker']);
  for (const p of ['A', 'B', 'C']) act(r, p, { skip: true });
  r.data.votes.set('A', 'B');
  r.data.votes.set('B', 'C');
  r.data.votes.set('C', 'A');
  _internals.finishUp(r);
  assert.equal(r.data.result.players.filter((p) => p.died).length, 0);
  assert.match(r.data.result.headline, /werewolves win/);
  assert.equal(r.points.A, 250);
  assert.equal(r.points.C, 50);
});

test('the Tanner wins by dying, and that stops the werewolves winning', () => {
  const r = fakeRound({ A: 'werewolf', B: 'tanner', C: 'villager', D: 'minion' }, ['seer', 'robber', 'drunk']);
  for (const p of ['A', 'B', 'C', 'D']) act(r, p, {});
  assert.match(r.data.info.get('D')[0], /werewolves are: A/);
  for (const p of ['A', 'C', 'D']) r.data.votes.set(p, 'B');
  r.data.votes.set('B', 'A');
  _internals.finishUp(r);
  assert.match(r.data.result.headline, /Tanner/);
  // The Tanner won (+250) and also voted for the werewolf (+50).
  assert.equal(r.points.B, 300);
  assert.equal(r.points.A, 0);
  assert.equal(r.points.D, 0);
});

test('no werewolves among the players: village wins only if nobody dies', () => {
  const r = fakeRound({ A: 'villager', B: 'seer', C: 'robber' }, ['werewolf', 'werewolf', 'troublemaker']);
  for (const p of ['A', 'B', 'C']) act(r, p, { skip: true });
  r.data.votes.set('A', 'B');
  r.data.votes.set('B', 'C');
  r.data.votes.set('C', 'A');
  _internals.finishUp(r);
  assert.match(r.data.result.headline, /No werewolves/);
  assert.equal(r.points.A, 250);
});

test('invalid night actions are refused so the player can try again', () => {
  const r = fakeRound({ A: 'robber', B: 'villager', C: 'werewolf' }, ['seer', 'werewolf', 'drunk']);
  act(r, 'A', { player: 'A' });
  assert.equal(r.data.done.has('A'), false);
  act(r, 'A', { player: 'B' });
  assert.equal(r.data.done.has('A'), true);
});
