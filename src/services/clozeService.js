import { normalizeAnswer } from './answerEvaluationService.js';

// Only matching, current repository entries are used. {} marks the single gap.
const templates = new Map();
function add(words, sentence) {
  for (const word of words.split('|')) templates.set(word, sentence);
}
add('dog|cat|bird|butterfly|bee|horse', 'Look! I can see a {}.');
add('boat|flower|tree|bike|book|house|pen|pencil|ruler|schoolbag|rubber|marker|pencil case|crayon|sharpener|bed', 'This is my {}.');
add('mother|father|sister|brother|friend|teacher', 'My {} is here with me.');
add('black|blue|brown|green|grey|orange|pink|purple|red|white|yellow', 'My bike is {}.');
add('happy|sad|angry|surprised|nervous|bored', 'I am {} today.');
add('new|big|great|good|ugly', 'This is a {} house.');
add('funny|boring|silly|crazy', 'This game is {}.');
add('jeans|shorts|green trousers|white trainers|a red T-shirt|a helmet', 'I am wearing {} today.');
add('a dog on a leash|a parrot|a pigeon|a river|a merry-go-round|Big Ben|the London Eye|a football|a skateboard|a food truck|a plane|a ship|a baby|a man|a woman', 'Look! I can see {}.');
add('have a snack|eat pizza|eat a sandwich|eat a banana|play football|play with friends|read a book|read comics|ride a bike|talk to friends|meet friends|sit on a bench', 'We can {} together.');
add('to read|to play|to cook|to sing|to dance|to draw|to take photos', 'I like {} with my friends.');
add('one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve', 'The number on my shirt is {}.');
add('football|netball', 'We can play {}.');
add('food|ice cream', 'I like this {}.');
add('under|in front of|on', 'My schoolbag is {} the bed.');
add('here|over there|home', 'My friends are going {}.');
add('today|tomorrow', 'We can play football {}.');
add('I', '{} can speak English.');
add('we', '{} can dance together.');
add('you', '{} can come with me.');
add('he|she|they', '{} can ride a bike.');
add("we're", '{} friends.');
add("he's|you're", '{} my best friend.');
add('please', '{}, come with me.');
add('yes', '{}, I can speak English.');
add('Hello.|Hi.', '{} My name is Ruby.');
add('Thanks.', '{} This is great!');
add('Come on!', '{} We can play together.');
add("Don't worry!", '{} We can help you.');
add('Look!', '{} A bird is in the tree.');
add('and|or', 'You can read {} play.');
add('but', "I can read, {} I can't sing.");

function accepted(v) {
  return [v.english, ...(v.alternatives?.english ?? [])].map(normalizeAnswer);
}

function distractors(current, all) {
  const correct = new Set(accepted(current));
  const meanings = new Set([current.german, ...(current.alternatives?.german ?? [])].map(normalizeAnswer));
  const seen = new Set();
  return all.filter(v => {
    const key = normalizeAnswer(v.english);
    if (!key || seen.has(key) || accepted(v).some(a => correct.has(a)) ||
        [v.german, ...(v.alternatives?.german ?? [])].some(a => meanings.has(normalizeAnswer(a)))) return false;
    seen.add(key);
    return true;
  }).map(v => v.english);
}

export function clozeVocabulary(all) {
  return all.filter(v => templates.has(v.english) && distractors(v, all).length >= 3);
}

function shuffle(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function buildClozeQuestion(current, all, random = Math.random) {
  const template = templates.get(current.english);
  const alternatives = distractors(current, all);
  if (!template || alternatives.length < 3) return null;
  const [before, after] = template.split('{}');
  const answer = current.english;
  const displayAnswer = before ? answer : answer[0].toLocaleUpperCase('en') + answer.slice(1);
  return {
    before, after, answer, hint: current.german,
    completed: before + displayAnswer + after,
    choices: shuffle([answer, ...shuffle(alternatives, random).slice(0, 3)], random)
  };
}
