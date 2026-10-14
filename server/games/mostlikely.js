const VOTE_MS = 25_000;
const REVEAL_MS = 12_000;
const QUESTIONS = 3;
const MAJORITY_POINTS = 60;
const TITLE_POINTS = 20;

const prompts = [
  'survive the longest in a zombie apocalypse',
  'accidentally join a cult',
  'become famous for something embarrassing',
  'cry at a car commercial',
  'get lost in their own neighborhood',
  'win a hot dog eating contest',
  'secretly be a millionaire',
  'text the wrong person something terrible',
  'fight a goose and lose',
  'start a podcast nobody asked for',
  'get banned from a Costco',
  'still be awake at 4am tonight',
  'talk their way out of a speeding ticket',
  'come home with six cats',
  'die first in a horror movie',
  'reply-all to the entire company',
  'eat something off the floor at a restaurant',
  'become a reality TV villain',
  'show up to the wrong wedding',
  'fake their own death to get out of a group chat',
  'adopt a hobby, buy all the gear, quit in a week',
  'befriend a raccoon',
  'be late to their own funeral',
  'go viral for a bad review',
  'have a secret talent nobody knows about',
  'cause a scene at a kid\'s birthday party',
];

export default {
  id: 'mostlikely',
  name: 'Most Likely To',
  emoji: '👉',
  tags: ['argue', 'laugh'],
  sensors: [],
  blurb: 'Who\'s most likely to...? Everyone votes. Then everyone argues about it.',
  howTo: [
    'Three questions. Vote for the player who fits best (yourself included, if you\'re honest).',
    'Votes are revealed with names attached. Defend your choices.',
    'You get points for voting with the crowd.',
  ],
  minPlayers: 3,
  start(r) {
    const qs = r.room.freshPrompts('mostlikely', prompts, QUESTIONS);
    r.data = { qs, qi: 0, votes: qs.map(() => new Map()) };
    ask(r);
  },
  action(r, pid, msg) {
    if (r.step !== 'vote' || msg.a !== 'vote' || !r.isIn(pid) || !r.isIn(msg.pid)) return;
    r.data.votes[r.data.qi].set(pid, msg.pid);
    r.touch();
    this.check(r);
  },
  check(r) {
    if (r.step !== 'vote') return;
    const votes = r.data.votes[r.data.qi];
    if (r.activeIds().every((id) => votes.has(id))) reveal(r);
  },
  view(r, pid) {
    const d = r.data;
    const q = d.qs?.[d.qi];
    const votes = d.votes?.[d.qi];
    if (r.step === 'vote') return { q, qi: d.qi, total: d.qs.length, myVote: votes.get(pid) ?? null, done: [...votes.keys()] };
    if (r.step === 'reveal') return { q, qi: d.qi, total: d.qs.length, ...tally(votes) };
    if (r.step === 'results') return { summary: d.qs.map((text, i) => ({ q: text, winners: tally(d.votes[i]).winners })) };
    return {};
  },
};

function tally(votes) {
  const counts = {};
  for (const [voter, target] of votes) (counts[target] ??= []).push(voter);
  const rows = Object.entries(counts)
    .map(([pid, voters]) => ({ pid, voters }))
    .sort((a, b) => b.voters.length - a.voters.length);
  const best = rows[0]?.voters.length ?? 0;
  return { rows, winners: rows.filter((x) => x.voters.length === best && best > 0).map((x) => x.pid) };
}

function ask(r) {
  r.setStep('vote', VOTE_MS, () => reveal(r));
}

function reveal(r) {
  r.setStep('reveal', REVEAL_MS, () => {
    if (r.data.qi + 1 < r.data.qs.length) {
      r.data.qi++;
      ask(r);
    } else finishUp(r);
  });
}

function finishUp(r) {
  const points = {};
  for (const votes of r.data.votes) {
    const { winners } = tally(votes);
    for (const [voter, target] of votes) if (winners.includes(target)) points[voter] = (points[voter] || 0) + MAJORITY_POINTS;
    for (const w of winners) points[w] = (points[w] || 0) + TITLE_POINTS;
  }
  r.finish(points);
}
