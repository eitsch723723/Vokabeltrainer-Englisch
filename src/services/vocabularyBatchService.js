// A batch is one photo upload in ChatGPT. IDs are sortable YYYY-MM-DD-NN values.
// This is repository metadata, not browser state or learning history.
export const ORAL_SCOPES = Object.freeze({ ALL: 'all', LATEST: 'latest', DATE: 'date' });

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function availableVocabularyDates(vocabularies) {
  const counts = new Map();
  for (const vocabulary of vocabularies) {
    if (isValidDate(vocabulary.addedAt)) {
      counts.set(vocabulary.addedAt, (counts.get(vocabulary.addedAt) ?? 0) + 1);
    }
  }
  return [...counts].sort(([left], [right]) => right.localeCompare(left))
    .map(([date, count]) => ({ date, count }));
}

export function latestVocabularyBatchId(vocabularies) {
  // New uploads must receive a unique sortable ID, including a sequence for
  // multiple uploads on the same day.
  const ids = new Set(vocabularies
    .filter(v => typeof v.batchId === 'string' && /^\d{4}-\d{2}-\d{2}-\d{2}$/.test(v.batchId)
      && v.batchId.startsWith(v.addedAt + '-'))
    .map(v => v.batchId));
  return [...ids].sort().at(-1) ?? null;
}

export function selectOralVocabulary(vocabularies, scope = ORAL_SCOPES.ALL, date = '') {
  if (scope === ORAL_SCOPES.ALL) return [...vocabularies];
  if (scope === ORAL_SCOPES.DATE) {
    return isValidDate(date) ? vocabularies.filter(v => v.addedAt === date) : [];
  }
  if (scope === ORAL_SCOPES.LATEST) {
    const batchId = latestVocabularyBatchId(vocabularies);
    if (batchId) return vocabularies.filter(v => v.batchId === batchId);
    // Read-only fallback for an older offline cache predating batch IDs.
    const mostRecentDate = availableVocabularyDates(vocabularies)[0]?.date;
    return mostRecentDate ? vocabularies.filter(v => v.addedAt === mostRecentDate) : [];
  }
  throw new Error('Ungültige Vokabelauswahl.');
}
