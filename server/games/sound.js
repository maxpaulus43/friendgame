import { mediaVoteGame } from './mediavote.js';
import prompts from '../prompts/sound.js';

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
