import { DIRECTIONS } from '../domain/vocabulary.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const RANDOM_DIRECTION = 'random';

function intervalFor(result, previous) {
  if (result === 'wrong') return 2 / 24;
  if (result === 'near') return 0.5;
  if (previous.streak <= 0) return 1;
  if (previous.streak === 1) return 3;
  return Math.min(30, Math.max(5, (previous.intervalDays || 3) * 2));
}

export function resolveQuestionDirection(selection, randomValue = Math.random()) {
  if (selection === RANDOM_DIRECTION) {
    return randomValue < 0.5 ? DIRECTIONS.EN_DE : DIRECTIONS.DE_EN;
  }
  if ([DIRECTIONS.EN_DE, DIRECTIONS.DE_EN].includes(selection)) return selection;
  throw new Error('Ungültige Lernrichtung.');
}

export function updateProgress(vocabulary, direction, result, now = new Date()) {
  if (![DIRECTIONS.EN_DE, DIRECTIONS.DE_EN].includes(direction)) throw new Error('Ungültige Lernrichtung.');
  if (!['correct', 'near', 'wrong'].includes(result)) throw new Error('Ungültiges Lernergebnis.');
  const previous = vocabulary.learning[direction];
  const intervalDays = intervalFor(result, previous);
  const current = {
    ...previous,
    attempts: previous.attempts + 1,
    correct: previous.correct + (result === 'correct' ? 1 : 0),
    near: previous.near + (result === 'near' ? 1 : 0),
    wrong: previous.wrong + (result === 'wrong' ? 1 : 0),
    streak: result === 'correct' ? previous.streak + 1 : 0,
    lastAskedAt: now.toISOString(),
    nextDueAt: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
    intervalDays
  };
  return {
    ...vocabulary,
    learning: { ...vocabulary.learning, [direction]: current },
    history: [...(vocabulary.history ?? []), { direction, result, answeredAt: now.toISOString() }].slice(-200),
    updatedAt: now.toISOString()
  };
}

export function masteryLevel(progress) {
  if (!progress.attempts) return 'new';
  const score = (progress.correct + progress.near * 0.5) / progress.attempts;
  if (progress.attempts >= 4 && score >= 0.85 && progress.streak >= 2) return 'good';
  if (score < 0.6 || progress.wrong >= progress.correct) return 'difficult';
  return 'learning';
}

export function priorityScore(vocabulary, direction, now = new Date()) {
  const p = vocabulary.learning[direction];
  if (!p.attempts) return 100000;
  const dueAt = p.nextDueAt ? new Date(p.nextDueAt).getTime() : 0;
  const overdueHours = Math.max(0, (now.getTime() - dueAt) / 3600000);
  const accuracy = (p.correct + p.near * 0.5) / p.attempts;
  const weakness = (1 - accuracy) * 100;
  const dueBoost = dueAt <= now.getTime() ? 500 + Math.min(200, overdueHours) : 0;
  const maintenance = p.streak >= 4 ? 5 : 20;
  return dueBoost + weakness + maintenance;
}

export function selectNextVocabulary(vocabularies, direction, now = new Date(), excludeId = null) {
  return [...vocabularies]
    .filter(v => v.id !== excludeId)
    .sort((a, b) => {
      const scoreDiff = priorityScore(b, direction, now) - priorityScore(a, direction, now);
      if (scoreDiff) return scoreDiff;
      return String(a.id).localeCompare(String(b.id));
    })[0] ?? null;
}
