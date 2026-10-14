import { shuffle } from '../util.js';
import snap from './snap.js';
import sound from './sound.js';
import shake from './shake.js';
import homing from './homing.js';
import bomb from './bomb.js';
import hottakes from './hottakes.js';
import mostlikely from './mostlikely.js';
import pitch from './pitch.js';
import countup from './countup.js';

const all = [snap, shake, hottakes, bomb, sound, homing, mostlikely, pitch, countup];

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

// A full Wednesday: a mix of laughing, competing, arguing and teaming up.
const NIGHT_SHAPE = ['compete', 'laugh', 'team', 'argue', 'compete', 'laugh', 'argue', 'team'];

export function buildNight(playerCount) {
  const pool = shuffle(all.filter((g) => g.minPlayers <= playerCount));
  const list = [];
  for (const vibe of NIGHT_SHAPE) {
    const g = pool.find((x) => !list.includes(x.id) && x.tags[0] === vibe) ?? pool.find((x) => !list.includes(x.id) && x.tags.includes(vibe));
    if (g) list.push(g.id);
  }
  for (const g of pool) if (list.length < 7 && !list.includes(g.id)) list.push(g.id);
  return list.slice(0, 7);
}
