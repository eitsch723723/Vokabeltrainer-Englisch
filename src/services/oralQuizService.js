import { vocabularyWeight, resolveQuestionDirection, RANDOM_DIRECTION } from './learningEngine.js';

export const ORAL_ROUND_SIZE = 10;

// Session data is deliberately ephemeral. The existing persistent learning model is untouched.
// Derive completed vocabulary and round statistics from history, not parallel counters.
export function startOralSession(vocabularies, now = new Date(), random = Math.random) {
  return nextQuestion({ phase: 'question', history: [], roundStart: 0, current: null }, vocabularies, now, random);
}

export function answerOralQuestion(session, result, vocabularies, now = new Date(), random = Math.random) {
  if (session?.phase !== 'question' || !session.current) throw new Error('Keine offene mündliche Frage.');
  if (result !== 'correct' && result !== 'wrong') throw new Error('Ungültige mündliche Bewertung.');

  const history = [...session.history, { ...session.current, result }];
  const updated = { ...session, history, current: null };

  // Never automatically advance into the next batch after the tenth answer.
  if (history.length - session.roundStart === ORAL_ROUND_SIZE) {
    return { ...updated, phase: 'round-complete' };
  }
  return nextQuestion(updated, vocabularies, now, random);
}

export function continueOralSession(session, vocabularies, now = new Date(), random = Math.random) {
  if (session?.phase !== 'round-complete') throw new Error('Die Abfragerunde ist noch nicht beendet.');
  return nextQuestion({ ...session, phase: 'question', roundStart: session.history.length, current: null }, vocabularies, now, random);
}

export function oralRoundSummary(session) {
  const answers = session.history.slice(session.roundStart);
  return {
    number: Math.floor(session.roundStart / ORAL_ROUND_SIZE) + 1,
    answered: answers.length,
    correct: answers.filter(entry => entry.result === 'correct').length,
    wrong: answers.filter(entry => entry.result === 'wrong').length,
    mastered: new Set(session.history.filter(entry => entry.result === 'correct').map(entry => entry.id)).size
  };
}

function nextQuestion(session, vocabularies, now, random) {
  const masteredIds = new Set(session.history.filter(entry => entry.result === 'correct').map(entry => entry.id));
  const remaining = vocabularies.filter(vocabulary => !masteredIds.has(vocabulary.id));
  if (!remaining.length) return { ...session, phase: 'finished', current: null };

  // Use different vocabulary within the current ten-question batch whenever possible.
  const askedThisRound = new Set(session.history.slice(session.roundStart).map(entry => entry.id));
  const unasked = remaining.filter(vocabulary => !askedThisRound.has(vocabulary.id));
  let candidates = unasked.length ? unasked : remaining;
  const previousId = session.history.at(-1)?.id;
  const withoutPrevious = candidates.filter(vocabulary => vocabulary.id !== previousId);
  if (withoutPrevious.length) candidates = withoutPrevious;

  const direction = resolveQuestionDirection(RANDOM_DIRECTION, random());
  const outstandingMistakes = new Set(session.history.filter(entry => entry.result === 'wrong' && !masteredIds.has(entry.id)).map(entry => entry.id));
  const weights = candidates.map(vocabulary => {
    const base = vocabularyWeight(vocabulary, direction, now);
    return base + (outstandingMistakes.has(vocabulary.id) ? Math.max(250, base * 0.7) : 0);
  });
  let ticket = Math.max(0, Math.min(1 - Number.EPSILON, random())) * weights.reduce((sum, weight) => sum + weight, 0);
  let selected = candidates[candidates.length - 1];
  for (let i = 0; i < candidates.length; i++) {
    ticket -= weights[i];
    if (ticket < 0) { selected = candidates[i]; break; }
  }
  return { ...session, phase: 'question', current: { id: selected.id, direction } };
}
