import { shuffle } from '../util.js';

const POINT_MS = 75_000;
const TARGETS = 3;
const EARTH_MI = 3958.8;

const LANDMARKS = [
  { label: 'the Eiffel Tower', lat: 48.8584, lon: 2.2945 },
  { label: 'the Statue of Liberty', lat: 40.6892, lon: -74.0445 },
  { label: 'the Great Pyramid of Giza', lat: 29.9792, lon: 31.1342 },
  { label: 'the Sydney Opera House', lat: -33.8568, lon: 151.2153 },
  { label: 'the North Pole', lat: 90, lon: 0 },
  { label: 'Mount Everest', lat: 27.9881, lon: 86.925 },
  { label: 'the Golden Gate Bridge', lat: 37.8199, lon: -122.4783 },
  { label: 'the Taj Mahal', lat: 27.1751, lon: 78.0421 },
  { label: 'Machu Picchu', lat: -13.1631, lon: -72.545 },
  { label: 'the White House', lat: 38.8977, lon: -77.0365 },
  { label: 'Walt Disney World', lat: 28.3772, lon: -81.5707 },
  { label: 'the Las Vegas Strip', lat: 36.1147, lon: -115.1728 },
  { label: 'the Grand Canyon', lat: 36.1069, lon: -112.1129 },
  { label: 'Tokyo Tower', lat: 35.6586, lon: 139.7454 },
  { label: 'Stonehenge', lat: 51.1789, lon: -1.8262 },
  { label: 'Mount Rushmore', lat: 43.8791, lon: -103.4591 },
];

const CARDINALS = [
  { label: 'North', bearing: 0 },
  { label: 'East', bearing: 90 },
  { label: 'South', bearing: 180 },
  { label: 'West', bearing: 270 },
];

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function bearing(a, b) {
  const φ1 = rad(a.lat);
  const φ2 = rad(b.lat);
  const Δλ = rad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function distanceMi(a, b) {
  const dφ = rad(b.lat - a.lat);
  const dλ = rad(b.lon - a.lon);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const angleBetween = (a, b) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
};

const scoreFor = (err) => Math.max(0, Math.round(100 * (1 - err / 90)));

function targetsFor(r, pid) {
  const me = r.player(pid).loc;
  if (!me) return shuffle(CARDINALS).slice(0, TARGETS).map((c) => ({ ...c, kind: 'cardinal' }));
  const friends = shuffle(
    r.playerIds()
      .filter((id) => id !== pid && r.player(id).loc)
      .map((id) => ({ id, loc: r.player(id).loc }))
      .filter((f) => distanceMi(me, f.loc) >= 5),
  )
    .slice(0, TARGETS - 1)
    .map((f) => ({
      kind: 'player',
      pid: f.id,
      label: r.player(f.id).name,
      bearing: bearing(me, f.loc),
      distMi: distanceMi(me, f.loc),
    }));
  const places = shuffle(LANDMARKS)
    .slice(0, TARGETS - friends.length)
    .map((l) => ({ kind: 'place', label: l.label, bearing: bearing(me, l), distMi: distanceMi(me, l) }));
  return [...friends, ...places];
}

export default {
  id: 'homing',
  name: 'Homing Pigeon',
  emoji: '🧭',
  tags: ['compete', 'laugh'],
  sensors: ['compass', 'location'],
  needs: ['orientation', 'geo'],
  blurb: 'Point your phone at your friends\' houses across the state (and a few world landmarks). No map allowed.',
  howTo: [
    'Share your rough location (rounded to ~1 km, only used for this game).',
    'Hold your phone flat like a compass, top edge aimed at the target, and lock it in.',
    'Closer aim = more points. We\'ll tell you exactly how many miles you would have missed by.',
  ],
  minPlayers: 1,
  start(r) {
    const targets = new Map(r.playerIds().map((pid) => [pid, targetsFor(r, pid)]));
    r.data = { targets, answers: new Map() };
    r.setStep('point', POINT_MS, () => finishUp(r));
  },
  action(r, pid, msg) {
    if (msg.a === 'loc') {
      const lat = Number(msg.lat);
      const lon = Number(msg.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        r.player(pid).loc = { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
      }
      return;
    }
    if (r.step !== 'point' || msg.a !== 'lock' || !r.isIn(pid)) return;
    const targets = r.data.targets.get(pid);
    if (!targets) return;
    const answers = r.data.answers.get(pid) ?? [];
    if (answers.length >= targets.length) return;
    // null = "my compass isn't working", which scores zero for that target.
    const heading = msg.heading === null ? null : Number(msg.heading);
    if (heading !== null && !Number.isFinite(heading)) return;
    answers.push(heading === null ? null : ((heading % 360) + 360) % 360);
    r.data.answers.set(pid, answers);
    r.touch();
    this.check(r);
  },
  check(r) {
    if (r.step !== 'point') return;
    const done = (id) => (r.data.answers.get(id)?.length ?? 0) >= (r.data.targets.get(id)?.length ?? 0);
    if (r.activeIds().every(done)) finishUp(r);
  },
  view(r, pid) {
    const d = r.data;
    if (r.step === 'point') {
      const mine = d.targets.get(pid) ?? [];
      return {
        targets: mine.map((t) => ({ label: t.label, kind: t.kind, distMi: t.distMi ? Math.round(t.distMi) : null })),
        locked: d.answers.get(pid)?.length ?? 0,
        progress: Object.fromEntries(r.playerIds().map((id) => [id, d.answers.get(id)?.length ?? 0])),
      };
    }
    if (r.step === 'results') return { rows: d.rows };
    return {};
  },
};

function finishUp(r) {
  const points = {};
  const rows = [];
  for (const pid of r.playerIds()) {
    const targets = r.data.targets.get(pid) ?? [];
    const answers = r.data.answers.get(pid) ?? [];
    const shots = targets.map((t, i) => {
      if (answers[i] === undefined || answers[i] === null) return { label: t.label, kind: t.kind, err: null, pts: 0 };
      const err = angleBetween(answers[i], t.bearing);
      const missMi = t.distMi && err < 90 ? Math.round(t.distMi * Math.sin(rad(err))) : null;
      return { label: t.label, kind: t.kind, err: Math.round(err), pts: scoreFor(err), distMi: t.distMi ? Math.round(t.distMi) : null, missMi };
    });
    points[pid] = shots.reduce((s, x) => s + x.pts, 0);
    rows.push({ pid, shots, total: points[pid] });
  }
  rows.sort((a, b) => b.total - a.total);
  r.data.rows = rows;
  r.finish(points);
}
