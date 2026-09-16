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
    if (!Array.isArray(item.history)) throw new Error(`Lernhistorie für ${item.id} ist ungültig.`);
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
  const numeric = ['attempts', 'correct', 'near', 'wrong', 'streak', 'intervalDays'];
  if (!progress || typeof progress !== 'object') throw new Error('Ein Lernstand ist unvollständig.');
  for (const key of numeric) {
    if (typeof progress[key] !== 'number' || !Number.isFinite(progress[key]) || progress[key] < 0) {
      throw new Error(`Ungültiger Lernstandswert: ${key}.`);
    }
  }
  for (const key of ['lastAskedAt', 'nextDueAt']) {
    if (progress[key] !== null && typeof progress[key] !== 'string') throw new Error(`Ungültiger Zeitwert: ${key}.`);
  }
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
