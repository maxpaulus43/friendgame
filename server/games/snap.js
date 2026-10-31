import { mediaVoteGame } from './mediavote.js';
import prompts from '../prompts/snap.js';

export default mediaVoteGame({
  id: 'snap',
  name: 'Snap Judgment',
  emoji: '📸',
  tags: ['laugh', 'compete'],
  sensors: ['camera'],
  blurb: 'Everyone gets the same prompt. Snap a photo, then vote for the best one.',
  howTo: [
    'Read the prompt and take a photo with your camera.',
    'Photos are anonymous until the votes are in.',
    'Vote for your favorite (not your own). 100 pts per vote, +50 for the winner.',
  ],
  kind: 'photo',
  captureMs: 90_000,
  voteMs: 60_000,
  prompts,
  maxBytes: 2_500_000,
  mimes: ['image/'],
});
