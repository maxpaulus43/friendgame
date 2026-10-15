import { shuffle, pick } from '../util.js';

const CLUE_MS_PER_PLAYER = 20_000;
const VOTE_MS = 40_000;
const REVEAL_MS = 12_000;
const GUESS_MS = 30_000;

// Everyone sees the category. Everyone but the imposter sees the secret word.
const categories = [
  { name: 'Pizza toppings', words: ['Pepperoni', 'Pineapple', 'Mushroom', 'Olives', 'Sausage', 'Anchovies', 'Jalapeño', 'Onion'] },
  { name: 'Zoo animals', words: ['Giraffe', 'Penguin', 'Gorilla', 'Flamingo', 'Lion', 'Elephant', 'Zebra', 'Hippo'] },
  { name: 'Things in a kitchen', words: ['Toaster', 'Blender', 'Spatula', 'Fridge', 'Microwave', 'Kettle', 'Colander', 'Oven mitt'] },
  { name: 'Sports', words: ['Golf', 'Hockey', 'Tennis', 'Surfing', 'Bowling', 'Boxing', 'Baseball', 'Curling'] },
  { name: 'Jobs', words: ['Dentist', 'Pilot', 'Firefighter', 'Librarian', 'Chef', 'Plumber', 'Lifeguard', 'Magician'] },
  { name: 'Vacation spots', words: ['Beach', 'Ski resort', 'Cruise ship', 'Camping', 'Las Vegas', 'Disneyland', 'Paris', 'Road trip'] },
  { name: 'Things at a wedding', words: ['Cake', 'Bouquet', 'Ring', 'DJ', 'Veil', 'Toast', 'Limo', 'Open bar'] },
  { name: 'Board games', words: ['Monopoly', 'Chess', 'Scrabble', 'Clue', 'Jenga', 'Risk', 'Catan', 'Twister'] },
  { name: 'Breakfast foods', words: ['Pancakes', 'Bacon', 'Oatmeal', 'Waffles', 'Burrito', 'Bagel', 'Cereal', 'Omelette'] },
  { name: 'Things in a bathroom', words: ['Toothbrush', 'Plunger', 'Bathtub', 'Mirror', 'Shower curtain', 'Scale', 'Hair dryer', 'Rubber duck'] },
  { name: 'Superpowers', words: ['Flying', 'Invisibility', 'Time travel', 'Mind reading', 'Teleporting', 'Super strength', 'Healing', 'Shapeshifting'] },
  { name: 'Things you take camping', words: ['Tent', 'Flashlight', 'Marshmallows', 'Bug spray', 'Sleeping bag', 'Cooler', 'Hatchet', 'Lantern'] },
  { name: 'Halloween costumes', words: ['Vampire', 'Pirate', 'Witch', 'Zombie', 'Ghost', 'Mummy', 'Skeleton', 'Werewolf'] },
  { name: 'Musical instruments', words: ['Guitar', 'Drums', 'Violin', 'Tuba', 'Piano', 'Harmonica', 'Banjo', 'Saxophone'] },
  { name: 'Things in an office', words: ['Stapler', 'Printer', 'Whiteboard', 'Coffee machine', 'Swivel chair', 'Paper clip', 'Cubicle', 'Water cooler'] },
  { name: 'Fast food orders', words: ['Burger', 'Fries', 'Milkshake', 'Chicken nuggets', 'Taco', 'Hot dog', 'Onion rings', 'Soda'] },
  { name: 'Weather', words: ['Tornado', 'Snowstorm', 'Heat wave', 'Fog', 'Hail', 'Thunderstorm', 'Drizzle', 'Rainbow'] },
  { name: 'Things at the beach', words: ['Sunscreen', 'Seagull', 'Sandcastle', 'Umbrella', 'Surfboard', 'Crab', 'Lifeguard tower', 'Volleyball'] },
];

export default {
  id: 'imposter',
  name: 'Imposter',
  emoji: '🕵️',
  tags: ['argue', 'laugh'],
  sensors: [],
  blurb: 'Everyone knows the secret word except one person. Give clues, find the faker.',
  howTo: [
    'Everyone sees a category. All but one of you also see the secret word. The imposter doesn\'t.',
    'Go around in the order shown and say ONE word on the call that proves you know it. Not too obvious!',
    'Vote for the imposter. If they\'re caught, they can still win by guessing the word.',
  ],
  minPlayers: 3,
  start(r) {
    const cat = r.freshPrompt(categories);
    const ids = r.playerIds();
    r.data = {
      category: cat.name,
      words: cat.words,
      word: pick(cat.words),
      imposter: pick(ids),
      order: shuffle(ids),
      votes: new Map(),
      talked: new Set(),
      guess: null,
      caught: false,
    };
    r.setStep('clues', Math.max(60_000, ids.length * CLUE_MS_PER_PLAYER), () => toVote(r));
  },
  action(r, pid, msg) {
    if (!r.isIn(pid)) return;
    const d = r.data;
    if (r.step === 'clues' && msg.a === 'done') {
      d.talked.add(pid);
      r.touch();
      this.check(r);
    } else if (r.step === 'vote' && msg.a === 'vote' && r.isIn(msg.pid) && msg.pid !== pid) {
      d.votes.set(pid, msg.pid);
      r.touch();
      this.check(r);
    } else if (r.step === 'guess' && msg.a === 'guess' && pid === d.imposter && d.words.includes(msg.word)) {
      d.guess = msg.word;
      finishUp(r);
    }
  },
  check(r) {
    if (r.step === 'clues' && r.activeIds().every((id) => r.data.talked.has(id))) toVote(r);
    else if (r.step === 'vote' && r.activeIds().every((id) => r.data.votes.has(id))) reveal(r);
  },
  view(r, pid) {
    const d = r.data;
    const isImposter = pid === d.imposter;
    const base = { category: d.category, order: d.order, isImposter, word: isImposter ? null : d.word };
    if (r.step === 'clues') return { ...base, talked: [...d.talked] };
    if (r.step === 'vote') return { ...base, myVote: d.votes.get(pid) ?? null, done: [...d.votes.keys()] };
    const tally = {};
    for (const [voter, target] of d.votes) (tally[target] ??= []).push(voter);
    // A caught imposter still gets to guess, so they can't see the word until it's over.
    const hideWord = isImposter && d.caught && r.step !== 'results';
    const revealed = { ...base, word: hideWord ? null : d.word, imposter: d.imposter, tally, caught: d.caught };
    if (r.step === 'reveal') return revealed;
    if (r.step === 'guess') return { ...revealed, words: isImposter ? d.words : null };
    return { ...revealed, guess: d.guess, outcome: d.outcome };
  },
};

function toVote(r) {
  r.setStep('vote', VOTE_MS, () => reveal(r));
}

function reveal(r) {
  const d = r.data;
  const counts = {};
  for (const target of d.votes.values()) counts[target] = (counts[target] || 0) + 1;
  const top = Math.max(0, ...Object.values(counts));
  const leaders = Object.keys(counts).filter((id) => counts[id] === top);
  // Caught only if the imposter alone got the most votes.
  d.caught = top > 0 && leaders.length === 1 && leaders[0] === d.imposter;
  r.setStep('reveal', REVEAL_MS, () => (d.caught && r.player(d.imposter)?.connected ? r.setStep('guess', GUESS_MS, () => finishUp(r)) : finishUp(r)));
}

function finishUp(r) {
  const d = r.data;
  const points = {};
  const others = r.playerIds().filter((id) => id !== d.imposter);
  if (!d.caught) {
    d.outcome = 'escaped';
    points[d.imposter] = 300;
  } else if (d.guess === d.word) {
    d.outcome = 'stole';
    points[d.imposter] = 200;
    for (const id of others) points[id] = 50;
  } else {
    d.outcome = 'caught';
    for (const id of others) points[id] = 150 + (d.votes.get(id) === d.imposter ? 50 : 0);
  }
  r.finish(points);
}
