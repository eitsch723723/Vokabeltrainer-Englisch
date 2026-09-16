import { CURRENT_SCHEMA_VERSION } from '../domain/vocabulary.js';
import { migrateVocabulary } from '../domain/migrations.js';

export const BACKUP_FORMAT_VERSION = 1;

export function createBackup(vocabularies, settings = {}) {
  return {
    app: 'Vokabeltrainer-Englisch',
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    dataSchemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    vocabularies
  };
}

export function validateBackup(input) {
  if (!input || input.app !== 'Vokabeltrainer-Englisch') throw new Error('Die Datei ist kein gültiges Vokabeltrainer-Backup.');
  if (Number(input.backupFormatVersion) !== BACKUP_FORMAT_VERSION) throw new Error('Diese Backup-Version wird nicht unterstützt.');
  if (!Array.isArray(input.vocabularies)) throw new Error('Im Backup fehlt die Vokabelliste.');
  return { ...input, vocabularies: input.vocabularies.map(migrateVocabulary) };
}
