import { DIRECTIONS } from '../domain/vocabulary.js';

const FORMAT = 'vokabeltrainer-learning-progress';
const VERSION = 1;

export function createProgressBackup(vocabularies) {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    progress: vocabularies.map(vocabulary => ({
      id: vocabulary.id,
      learning: structuredCloneSafe(vocabulary.learning),
      history: structuredCloneSafe(vocabulary.history ?? [])
    }))
  };
}

export function validateProgressBackup(value) {
  if (!value || typeof value !== 'object') throw new Error('Ungültige Sicherungsdatei.');
  if (value.format !== FORMAT) throw new Error('Diese Datei ist keine Lernstand-Sicherung dieser App.');
  if (value.version !== VERSION) throw new Error(`Nicht unterstützte Sicherungsversion: ${value.version}.`);
  if (!Array.isArray(value.progress)) throw new Error('Lernstände fehlen in der Sicherung.');

  const seen = new Set();
  for (const item of value.progress) {
    if (!item?.id || typeof item.id !== 'string') throw new Error('Eine Vokabel-ID in der Sicherung ist ungültig.');
    if (seen.has(item.id)) throw new Error(`Doppelte Vokabel-ID in der Sicherung: ${item.id}.`);
    seen.add(item.id);
    validateDirection(item.learning?.[DIRECTIONS.EN_DE]);
    validateDirection(item.learning?.[DIRECTIONS.DE_EN]);
    validateHistory(item.history, item.id);
  }
  return value;
}

export function applyProgressBackup(vocabularies, backup) {
  const valid = validateProgressBackup(backup);
  const progressById = new Map(valid.progress.map(item => [item.id, item]));
  let restored = 0;

  const merged = vocabularies.map(vocabulary => {
    const saved = progressById.get(vocabulary.id);
    if (!saved) return vocabulary;
    restored++;
    return {
      ...vocabulary,
      learning: structuredCloneSafe(saved.learning),
      history: structuredCloneSafe(saved.history),
      updatedAt: new Date().toISOString()
    };
  });

  return {
    vocabularies: merged,
    restored,
    unmatched: valid.progress.length - restored
  };
}

function validateDirection(progress) {
  const counters = ['attempts', 'correct', 'near', 'wrong', 'streak'];
  if (!progress || typeof progress !== 'object') throw new Error('Ein Lernstand ist unvollständig.');
  for (const key of counters) {
    if (!Number.isInteger(progress[key]) || progress[key] < 0) {
      throw new Error(`Ungültiger Lernstandswert: ${key}.`);
    }
  }

  if (progress.correct + progress.near + progress.wrong !== progress.attempts) {
    throw new Error('Die Antwortzähler passen nicht zur Anzahl der Versuche.');
  }
  if (progress.streak > progress.correct) {
    throw new Error('Die richtige Serie ist größer als die Zahl richtiger Antworten.');
  }
  if (typeof progress.intervalDays !== 'number' || !Number.isFinite(progress.intervalDays) || progress.intervalDays < 0) {
    throw new Error('Ungültiger Lernstandswert: intervalDays.');
  }

  for (const key of ['lastAskedAt', 'nextDueAt']) {
    if (!isValidTimestamp(progress[key])) throw new Error(`Ungültiger Zeitwert: ${key}.`);
  }
}

function validateHistory(history, vocabularyId) {
  if (!Array.isArray(history)) throw new Error(`Lernhistorie für ${vocabularyId} ist ungültig.`);
  for (const entry of history) {
    if (!entry || typeof entry !== 'object'
      || ![DIRECTIONS.EN_DE, DIRECTIONS.DE_EN].includes(entry.direction)
      || !['correct', 'near', 'wrong'].includes(entry.result)
      || !isValidTimestamp(entry.answeredAt)
      || entry.answeredAt === null) {
      throw new Error(`Ein Verlaufseintrag für ${vocabularyId} ist ungültig.`);
    }
  }
}

function isValidTimestamp(value) {
  return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
