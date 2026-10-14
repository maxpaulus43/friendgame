import { mediaVoteGame } from './mediavote.js';

const prompts = [
  { text: 'A dial-up modem having an emotional breakdown' },
  { text: 'Your phone\'s ringtone if it secretly hated you' },
  { text: 'A dolphin ordering at a drive-thru' },
  { text: 'The sound your back makes getting out of bed' },
  { text: 'A movie trailer voice-over for your Wednesday' },
  { text: 'A cat that just discovered a cucumber' },
  { text: 'A printer that is judging you' },
  { text: 'The national anthem of your kitchen' },
  { text: 'An old car trying to start on a cold morning' },
  { text: 'A sports commentator calling the last second of a sandwich being made' },
  { text: 'A computer startup sound, with only your mouth' },
  { text: 'A pirate who just stepped on a Lego' },
  { text: 'The noise you make when you see a really good dog' },
  { text: 'A haunted house that\'s mostly just tired' },
  { text: 'Your best evil villain laugh, but you\'re very sleepy' },
  { text: 'A nature documentary narrator describing your couch' },
  { text: 'An airline captain announcing something deeply personal' },
  { text: 'A goose that wants to speak to the manager' },
];

export default mediaVoteGame({
  id: 'sound',
  name: 'Sound Off',
  emoji: '🎙️',
  tags: ['laugh'],
  sensors: ['mic'],
  blurb: 'Record a 6-second sound effect for a ridiculous prompt. Everyone listens and votes.',
  howTo: [
    'You get up to 6 seconds of microphone time. Commit to the bit.',
    'Listen back, re-record if you need to, then send it.',
    'Play everyone\'s clips and vote for the best (not your own).',
  ],
  kind: 'audio',
  captureMs: 90_000,
  voteMs: 75_000,
  prompts,
  maxBytes: 1_500_000,
  mimes: ['audio/', 'video/mp4', 'video/webm'],
});
