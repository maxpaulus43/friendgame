import { shuffle } from '../util.js';
import snap from './snap.js';
import sound from './sound.js';
import shake from './shake.js';
import homing from './homing.js';
import bomb from './bomb.js';
import hottakes from './hottakes.js';
import mostlikely from './mostlikely.js';
import pitch, { siren } from './pitch.js';
import countup from './countup.js';
import imposter from './imposter.js';
import twotruths from './twotruths.js';
import spectrum from './spectrum.js';
import telephone from './telephone.js';

const all = [imposter, snap, shake, spectrum, telephone, hottakes, bomb, twotruths, sound, homing, mostlikely, pitch, siren, countup];

export const GAMES = Object.fromEntries(all.map((g) => [g.id, g]));

export const catalog = all.map(({ id, name, emoji, tags, sensors, needs, blurb, howTo, minPlayers }) => ({
  id,
  name,
  emoji,
  tags,
  sensors,
  needs: needs ?? [],
  blurb,
  howTo,
  minPlayers,
}));

// How many rounds of each game a night includes, until the host changes it.
// 0 = left out of the night (still playable on its own from the lobby).
const DEFAULT_ROUNDS = {
  snap: 1,
  shake: 1,
  hottakes: 1,
  bomb: 1,
  sound: 0,
  homing: 0,
  mostlikely: 1,
  pitch: 0,
  siren: 1,
  countup: 0,
  imposter: 2,
  twotruths: 1,
  spectrum: 1,
  telephone: 1,
};

export const MAX_ROUNDS = 3;

export function defaultRounds() {
  return Object.fromEntries(all.map((g) => [g.id, DEFAULT_ROUNDS[g.id] ?? 1]));
}

export function cleanRounds(input) {
  const out = defaultRounds();
  for (const id of Object.keys(out)) {
    const n = Number(input?.[id]);
    if (Number.isFinite(n)) out[id] = Math.max(0, Math.min(MAX_ROUNDS, Math.round(n)));
  }
  return out;
}

// A full Wednesday: the games with rounds turned on, alternating between
// laughing, competing, teaming up and arguing. Repeats play back to back.
const VIBES = ['compete', 'laugh', 'team', 'argue'];

export function buildNight(playerCount, rounds = defaultRounds()) {
  const pool = shuffle(all.filter((g) => g.minPlayers <= playerCount && (rounds[g.id] ?? 0) > 0));
  // Spread each vibe evenly across the night: a vibe with k games puts them
  // at roughly 1/2k, 3/2k, 5/2k… of the way through, with a little jitter.
  const placed = [];
  for (const v of [...VIBES, null]) {
    const games = pool.filter((g) => (v ? g.tags[0] === v : !VIBES.includes(g.tags[0])));
    games.forEach((g, j) => placed.push({ g, at: (j + 0.5) / games.length + (Math.random() - 0.5) * 0.15 }));
  }
  const order = placed.sort((a, b) => a.at - b.at).map((x) => x.g);
  return order.flatMap((g) => Array(rounds[g.id]).fill(g.id));
}
