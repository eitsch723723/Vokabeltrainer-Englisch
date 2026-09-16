export const CURRENT_SCHEMA_VERSION = 1;
export const DIRECTIONS = Object.freeze({ EN_DE: 'en-de', DE_EN: 'de-en' });

export function createDirectionProgress() {
  return {
    attempts: 0,
    correct: 0,
    near: 0,
    wrong: 0,
    streak: 0,
    lastAskedAt: null,
    nextDueAt: null,
    intervalDays: 0
  };
}

export function createVocabulary({
  id = crypto.randomUUID(),
  english,
  german,
  alternatives = { english: [], german: [] },
  provenance = { input: 'manual', translation: 'manual', confirmedByUser: true },
  createdAt = new Date().toISOString()
}) {
  const now = createdAt;
  return validateVocabulary({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    english: cleanTerm(english),
    german: cleanTerm(german),
    alternatives: {
      english: uniqueTerms(alternatives.english ?? []),
      german: uniqueTerms(alternatives.german ?? [])
    },
    provenance: {
      input: provenance.input ?? 'manual',
      translation: provenance.translation ?? 'manual',
      confirmedByUser: provenance.confirmedByUser !== false,
      confirmedAt: provenance.confirmedByUser === false ? null : (provenance.confirmedAt ?? now)
    },
    learning: {
      [DIRECTIONS.EN_DE]: createDirectionProgress(),
      [DIRECTIONS.DE_EN]: createDirectionProgress()
    },
    history: [],
    createdAt: now,
    updatedAt: now
  });
}

export function cleanTerm(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function uniqueTerms(values) {
  const seen = new Set();
  return values.map(cleanTerm).filter(Boolean).filter(value => {
    const key = value.toLocaleLowerCase('de-DE');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function validateVocabulary(vocabulary) {
  if (!vocabulary || typeof vocabulary !== 'object') throw new Error('Ungültiger Vokabeleintrag.');
  if (!vocabulary.id) throw new Error('Vokabel-ID fehlt.');
  if (!cleanTerm(vocabulary.english)) throw new Error('Englischer Begriff fehlt.');
  if (!cleanTerm(vocabulary.german)) throw new Error('Deutsche Übersetzung fehlt.');
  if (!vocabulary.learning?.[DIRECTIONS.EN_DE] || !vocabulary.learning?.[DIRECTIONS.DE_EN]) {
    throw new Error('Lernstand ist unvollständig.');
  }
  return vocabulary;
}

export function mergeVocabularyPreservingLearning(existing, incoming) {
  const now = new Date().toISOString();
  return validateVocabulary({
    ...existing,
    english: cleanTerm(incoming.english),
    german: cleanTerm(incoming.german),
    alternatives: {
      english: uniqueTerms([...(existing.alternatives?.english ?? []), ...(incoming.alternatives?.english ?? [])]),
      german: uniqueTerms([...(existing.alternatives?.german ?? []), ...(incoming.alternatives?.german ?? [])])
    },
    provenance: {
      ...incoming.provenance,
      confirmedByUser: true,
      confirmedAt: now
    },
    learning: existing.learning,
    history: existing.history ?? [],
    createdAt: existing.createdAt,
    updatedAt: now,
    schemaVersion: CURRENT_SCHEMA_VERSION
  });
}
