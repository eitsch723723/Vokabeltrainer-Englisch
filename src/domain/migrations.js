import { CURRENT_SCHEMA_VERSION, DIRECTIONS, createDirectionProgress, cleanTerm, uniqueTerms, validateVocabulary } from './vocabulary.js';

export function migrateVocabulary(input) {
  if (!input || typeof input !== 'object') throw new Error('Ungültige Vokabeldaten.');
  const version = Number(input.schemaVersion ?? 0);
  if (version > CURRENT_SCHEMA_VERSION) throw new Error(`Nicht unterstützte Datenversion ${version}.`);
  if (version === CURRENT_SCHEMA_VERSION) return validateVocabulary(input);

  if (version === 0) {
    const now = new Date().toISOString();
    return validateVocabulary({
      schemaVersion: 1,
      id: input.id || crypto.randomUUID(),
      english: cleanTerm(input.english ?? input.en),
      german: cleanTerm(input.german ?? input.de),
      alternatives: {
        english: uniqueTerms(input.alternatives?.english ?? []),
        german: uniqueTerms(input.alternatives?.german ?? input.alternatives ?? [])
      },
      provenance: input.provenance ?? {
        input: 'manual',
        translation: 'manual',
        confirmedByUser: true,
        confirmedAt: input.updatedAt ?? now
      },
      learning: input.learning ?? {
        [DIRECTIONS.EN_DE]: createDirectionProgress(),
        [DIRECTIONS.DE_EN]: createDirectionProgress()
      },
      history: Array.isArray(input.history) ? input.history : [],
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now
    });
  }

  throw new Error(`Migration von Datenversion ${version} ist nicht definiert.`);
}
