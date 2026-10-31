import { shuffle } from '../util.js';

const NIGHT_MS = 75_000;
const DAY_MS = 5 * 60_000;
const VOTE_MS = 45_000;
const WIN_POINTS = 250;
const GOOD_VOTE_POINTS = 50;

export const ROLES = {
  werewolf: { name: 'Werewolf', emoji: '🐺', team: 'wolf', text: 'You and any other werewolf see each other. If you\'re the only one, you may peek at a center card. Don\'t get voted out.' },
  minion: { name: 'Minion', emoji: '🦹', team: 'wolf', text: 'You see who the werewolves are (they don\'t know you). You win if they survive, even if you die.' },
  seer: { name: 'Seer', emoji: '🔮', team: 'village', text: 'Look at one player\'s card, or two of the three center cards.' },
  robber: { name: 'Robber', emoji: '🦝', team: 'village', text: 'You may swap your card with another player\'s, then see your new card. You\'re now on its team.' },
  troublemaker: { name: 'Troublemaker', emoji: '😈', team: 'village', text: 'You may swap two other players\' cards without looking at them.' },
  drunk: { name: 'Drunk', emoji: '🍺', team: 'village', text: 'You must swap your card with a center card, and you don\'t get to see your new one.' },
  insomniac: { name: 'Insomniac', emoji: '🥱', team: 'village', text: 'At dawn you check your card to see whether anyone swapped it.' },
  mason: { name: 'Mason', emoji: '🧱', team: 'village', text: 'You see the other Mason.' },
  villager: { name: 'Villager', emoji: '🧑‍🌾', team: 'village', text: 'No special power. Use your wits.' },
  tanner: { name: 'Tanner', emoji: '🪢', team: 'tanner', text: 'You hate your job. You win only if YOU get voted out.' },
};

const BASE_DECK = ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager', 'drunk', 'insomniac', 'minion', 'tanner'];

// Players + 3 cards; the 3 extra go face down in the center.
export function deckFor(players) {
  const need = players + 3;
  const deck = BASE_DECK.slice(0, need);
  if (need - deck.length >= 2) deck.push('mason', 'mason');
  while (deck.length < need) deck.push('villager');
  return deck;
}

const roleName = (role) => `${ROLES[role].emoji} ${ROLES[role].name}`;

export default {
  id: 'werewolf',
  name: 'One Night Werewolf',
  emoji: '🐺',
  tags: ['argue', 'laugh'],
  sensors: [],
  blurb: 'Secret roles, one night of sneaky swaps, then one vote. Find a werewolf before it\'s too late.',
  howTo: [
    'You get a secret card. Keep your screen to yourself! At night, everyone does their role\'s action at the same time.',
    'Cards may get swapped in the dark, so you might not be what you started as. Then the day: talk it all out on the call.',
    'Everyone votes. If a werewolf dies, the village wins. If not, the werewolves win. (Watch out for the Tanner.)',
  ],
  minPlayers: 3,
  start(r) {
    const players = shuffle(r.playerIds());
    const deck = shuffle(deckFor(players.length));
    const original = new Map(players.map((pid, i) => [pid, deck[i]]));
    const center = deck.slice(players.length);
    r.data = {
      players,
      deck: deckFor(players.length),
      original,
      center,
      cards: null,
      finalCenter: null,
      actions: new Map(),
      done: new Set(),
      info: new Map(players.map((pid) => [pid, []])),
      ready: new Set(),
      votes: new Map(),
      result: null,
    };
    for (const pid of players) r.data.info.get(pid).push(...knowledge(r, pid));
    r.setStep('night', NIGHT_MS, () => dawn(r));
  },
  action(r, pid, msg) {
    const d = r.data;
    if (!d.players.includes(pid)) return;
    if (r.step === 'night' && msg.a === 'night' && !d.done.has(pid)) {
      if (nightAction(r, pid, msg) === false) return;
      d.done.add(pid);
      r.touch();
      this.check(r);
    } else if (r.step === 'day' && msg.a === 'ready') {
      d.ready.add(pid);
      r.touch();
      this.check(r);
    } else if (r.step === 'vote' && msg.a === 'vote' && msg.pid !== pid && d.players.includes(msg.pid)) {
      d.votes.set(pid, msg.pid);
      r.touch();
      this.check(r);
    }
  },
  check(r) {
    const d = r.data;
    const active = r.activeIds().filter((id) => d.players.includes(id));
    if (r.step === 'night' && active.every((id) => d.done.has(id))) dawn(r);
    else if (r.step === 'day' && active.every((id) => d.ready.has(id))) toVote(r);
    else if (r.step === 'vote' && active.every((id) => d.votes.has(id))) finishUp(r);
  },
  view(r, pid) {
    const d = r.data;
    const deck = d.deck;
    if (r.step === 'results') return { roles: ROLES, deck, result: d.result };
    if (!d.players.includes(pid)) return { roles: ROLES, deck, spectator: true };
    const role = d.original.get(pid);
    const base = { roles: ROLES, deck, role, info: d.info.get(pid), players: d.players };
    if (r.step === 'night') {
      const wolves = d.players.filter((id) => d.original.get(id) === 'werewolf');
      return { ...base, done: d.done.has(pid), loneWolf: role === 'werewolf' && wolves.length === 1, doneIds: [...d.done] };
    }
    if (r.step === 'day') return { ...base, ready: [...d.ready] };
    if (r.step === 'vote') return { ...base, myVote: d.votes.get(pid) ?? null, voted: [...d.votes.keys()] };
    return base;
  },
};

// What each role learns just by waking up.
function knowledge(r, pid) {
  const d = r.data;
  const role = d.original.get(pid);
  const name = (id) => r.player(id)?.name ?? '?';
  const others = (want) => d.players.filter((id) => id !== pid && d.original.get(id) === want);
  if (role === 'werewolf') {
    const pack = others('werewolf');
    return pack.length ? [`🐺 Your fellow werewolf: ${pack.map(name).join(', ')}.`] : ['🐺 You\'re the only werewolf among the players.'];
  }
  if (role === 'minion') {
    const wolves = d.players.filter((id) => d.original.get(id) === 'werewolf');
    return wolves.length ? [`🐺 The werewolves are: ${wolves.map(name).join(', ')}.`] : ['🐺 No werewolves among the players! They\'re all in the center.'];
  }
  if (role === 'mason') {
    const m = others('mason');
    return m.length ? [`🧱 The other Mason is ${m.map(name).join(', ')}.`] : ['🧱 The other Mason card is in the center.'];
  }
  return [];
}

// Returns false if the action isn't valid (so the player can try again).
function nightAction(r, pid, msg) {
  const d = r.data;
  const role = d.original.get(pid);
  const info = d.info.get(pid);
  const name = (id) => r.player(id)?.name ?? '?';
  const isOther = (id) => id !== pid && d.players.includes(id);
  const isCenter = (i) => Number.isInteger(i) && i >= 0 && i < 3;
  const wolves = d.players.filter((id) => d.original.get(id) === 'werewolf');

  if (role === 'werewolf' && wolves.length === 1 && isCenter(msg.center)) {
    info.push(`👀 Center card ${msg.center + 1} is the ${roleName(d.center[msg.center])}.`);
    d.actions.set(pid, { role, center: msg.center });
  } else if (role === 'seer') {
    if (isOther(msg.player)) {
      info.push(`🔮 ${name(msg.player)} is the ${roleName(d.original.get(msg.player))}.`);
      d.actions.set(pid, { role, player: msg.player });
    } else if (Array.isArray(msg.centers) && msg.centers.length === 2 && msg.centers.every(isCenter) && msg.centers[0] !== msg.centers[1]) {
      for (const i of msg.centers) info.push(`🔮 Center card ${i + 1} is the ${roleName(d.center[i])}.`);
      d.actions.set(pid, { role, centers: msg.centers });
    } else if (!msg.skip) return false;
  } else if (role === 'robber') {
    if (isOther(msg.player)) {
      // The Robber goes before anyone else who swaps, so this is their original card.
      info.push(`🦝 You robbed ${name(msg.player)}. You're now the ${roleName(d.original.get(msg.player))}.`);
      d.actions.set(pid, { role, player: msg.player });
    } else if (!msg.skip) return false;
  } else if (role === 'troublemaker') {
    const [a, b] = Array.isArray(msg.players) ? msg.players : [];
    if (isOther(a) && isOther(b) && a !== b) {
      info.push(`😈 You swapped ${name(a)}'s and ${name(b)}'s cards.`);
      d.actions.set(pid, { role, players: [a, b] });
    } else if (!msg.skip) return false;
  } else if (role === 'drunk') {
    if (!isCenter(msg.center)) return false;
    info.push(`🍺 You swapped with center card ${msg.center + 1}. You have no idea what you are now.`);
    d.actions.set(pid, { role, center: msg.center });
  }
  return true;
}

// Swaps happen in the classic order: Robber, then Troublemaker, then Drunk.
function dawn(r) {
  const d = r.data;
  const cards = new Map(d.original);
  const center = [...d.center];
  const by = (role) => [...d.actions].filter(([, a]) => a.role === role);
  for (const [pid, a] of by('robber')) {
    const mine = cards.get(pid);
    cards.set(pid, cards.get(a.player));
    cards.set(a.player, mine);
  }
  for (const [, a] of by('troublemaker')) {
    const [x, y] = a.players;
    const cx = cards.get(x);
    cards.set(x, cards.get(y));
    cards.set(y, cx);
  }
  for (const [pid, a] of by('drunk')) {
    const mine = cards.get(pid);
    cards.set(pid, center[a.center]);
    center[a.center] = mine;
  }
  // A Drunk who fell asleep without choosing still has to swap.
  for (const pid of d.players) {
    if (d.original.get(pid) === 'drunk' && !d.actions.has(pid)) {
      const i = Math.floor(Math.random() * 3);
      const mine = cards.get(pid);
      cards.set(pid, center[i]);
      center[i] = mine;
      d.actions.set(pid, { role: 'drunk', center: i, auto: true });
      d.info.get(pid).push(`🍺 You stumbled into center card ${i + 1}. You have no idea what you are now.`);
    }
  }
  for (const pid of d.players) {
    if (d.original.get(pid) === 'insomniac') d.info.get(pid).push(`🥱 At dawn you check your card: you're the ${roleName(cards.get(pid))}.`);
  }
  d.cards = cards;
  d.finalCenter = center;
  r.setStep('day', DAY_MS, () => toVote(r));
}

function toVote(r) {
  r.setStep('vote', VOTE_MS, () => finishUp(r));
}

function finishUp(r) {
  const d = r.data;
  const name = (id) => r.player(id)?.name ?? '?';
  const final = (id) => d.cards.get(id);
  const counts = {};
  for (const target of d.votes.values()) counts[target] = (counts[target] || 0) + 1;
  const top = Math.max(0, ...Object.values(counts));
  // Nobody dies unless someone gets at least two votes; ties all die.
  const dead = top >= 2 ? Object.keys(counts).filter((id) => counts[id] === top) : [];
  const wolvesIn = d.players.filter((id) => final(id) === 'werewolf');
  const minions = d.players.filter((id) => final(id) === 'minion');
  const wolfDied = dead.some((id) => final(id) === 'werewolf');
  const tannerDied = dead.some((id) => final(id) === 'tanner');

  let villageWins;
  let wolvesWin;
  if (wolvesIn.length) {
    villageWins = wolfDied;
    wolvesWin = !wolfDied && !tannerDied;
  } else {
    villageWins = dead.length === 0;
    // With no werewolves out here, the Minion wins if someone else dies.
    wolvesWin = minions.length > 0 && dead.some((id) => !minions.includes(id)) && !tannerDied;
  }

  const winners = new Set();
  for (const id of d.players) {
    const team = ROLES[final(id)].team;
    if ((team === 'village' && villageWins) || (team === 'wolf' && wolvesWin) || (final(id) === 'tanner' && dead.includes(id))) winners.add(id);
  }

  let headline;
  if (tannerDied) headline = `🪢 ${dead.filter((id) => final(id) === 'tanner').map(name).join(' & ')} was the Tanner and got exactly what they wanted.`;
  else if (wolfDied) headline = `🌞 The village wins! They got the werewolf${dead.filter((id) => final(id) === 'werewolf').length > 1 ? 'ves' : ''}.`;
  else if (wolvesIn.length) headline = `🐺 The werewolves win! ${wolvesIn.map(name).join(' & ')} got away with it.`;
  else if (villageWins) headline = '🌞 No werewolves among you, and nobody died. The village wins!';
  else headline = '💀 There were no werewolves, but you killed someone anyway.';

  const points = {};
  for (const id of d.players) {
    points[id] = (winners.has(id) ? WIN_POINTS : 0) + (final(d.votes.get(id)) === 'werewolf' ? GOOD_VOTE_POINTS : 0);
  }

  d.result = {
    headline,
    players: d.players.map((id) => ({
      pid: id,
      original: d.original.get(id),
      final: final(id),
      died: dead.includes(id),
      won: winners.has(id),
      votes: counts[id] || 0,
      votedFor: d.votes.get(id) ?? null,
    })),
    center: d.center,
    finalCenter: d.finalCenter,
    log: nightLog(r),
  };
  r.finish(points);
}

// What actually happened in the dark, told after the game.
function nightLog(r) {
  const d = r.data;
  const name = (id) => r.player(id)?.name ?? '?';
  const order = ['werewolf', 'seer', 'robber', 'troublemaker', 'drunk'];
  const lines = [];
  for (const role of order) {
    for (const [pid, a] of d.actions) {
      if (a.role !== role) continue;
      const who = `${ROLES[role].emoji} ${name(pid)}`;
      if (role === 'werewolf') lines.push(`${who} peeked at center card ${a.center + 1}.`);
      if (role === 'seer') lines.push(a.player ? `${who} looked at ${name(a.player)}'s card.` : `${who} looked at center cards ${a.centers.map((i) => i + 1).join(' & ')}.`);
      if (role === 'robber') lines.push(`${who} robbed ${name(a.player)}.`);
      if (role === 'troublemaker') lines.push(`${who} swapped ${name(a.players[0])} and ${name(a.players[1])}.`);
      if (role === 'drunk') lines.push(`${who} ${a.auto ? 'fell asleep and got swapped with' : 'swapped with'} center card ${a.center + 1}.`);
    }
  }
  return lines.length ? lines : ['A quiet night. Nobody swapped anything.'];
}

// Exposed for tests.
export const _internals = { nightAction, dawn, finishUp, knowledge };
