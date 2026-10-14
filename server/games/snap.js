import { mediaVoteGame } from './mediavote.js';

// face: which camera the prompt wants ('user' = selfie, 'environment' = rear)
const prompts = [
  { text: 'Your face when someone says "quick question"', face: 'user' },
  { text: 'The most suspicious object within arm\'s reach', face: 'environment' },
  { text: 'Something that has a face but shouldn\'t', face: 'environment' },
  { text: 'The saddest thing in your fridge', face: 'environment' },
  { text: 'Your villain origin story, in one selfie', face: 'user' },
  { text: 'A photo that would confuse archaeologists in the year 3000', face: 'environment' },
  { text: 'The most "Wednesday" thing you can find', face: 'environment' },
  { text: 'Your best "I just hit reply-all" panic face', face: 'user' },
  { text: 'Recreate a famous painting with whatever is around you', face: 'user' },
  { text: 'Something you own that you should probably throw away', face: 'environment' },
  { text: 'Your face after reading the group chat', face: 'user' },
  { text: 'The weirdest texture you can find in 60 seconds', face: 'environment' },
  { text: 'An album cover for your debut mixtape', face: 'user' },
  { text: 'Something that perfectly sums up your week', face: 'environment' },
  { text: 'Your best impression of someone else in this game', face: 'user' },
  { text: 'A very dramatic close-up of a household object', face: 'environment' },
  { text: 'Your face as a stock photo titled "Man Discovers Taxes"', face: 'user' },
  { text: 'The ugliest mug, cup, or glass in your home', face: 'environment' },
  { text: 'Your LinkedIn profile picture, but cursed', face: 'user' },
  { text: 'Build a tiny sculpture out of snacks', face: 'environment' },
];

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
