import assert from 'node:assert/strict';
import { evaluateAnswer, normalizeAnswer } from '../src/services/answerEvaluationService.js';
import { createVocabulary, DIRECTIONS } from '../src/domain/vocabulary.js';
import { migrateVocabulary } from '../src/domain/migrations.js';
import { updateProgress, priorityScore, selectNextVocabulary } from '../src/services/learningEngine.js';
import { findDuplicateCandidates } from '../src/services/duplicateService.js';
import { buildChoices } from '../src/services/multipleChoiceService.js';
import { createBackup, validateBackup } from '../src/services/backupService.js';
import { parseOcrData } from '../src/services/importService.js';

if (!globalThis.crypto?.randomUUID) {
  const { randomUUID } = await import('node:crypto');
  globalThis.crypto = { randomUUID };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('normalizes case and spaces', () => assert.equal(normalizeAnswer('  House   '), 'house'));
test('accepts exact answer ignoring case', () => assert.equal(evaluateAnswer('HOUSE', ['house']).result, 'correct'));
test('accepts alternative translation', () => assert.equal(evaluateAnswer('beginnen', ['anfangen', 'beginnen']).result, 'correct'));
test('marks one-character typo as near', () => assert.equal(evaluateAnswer('becaus', ['because']).result, 'near'));
test('does not over-tolerate short words', () => assert.equal(evaluateAnswer('in', ['on']).result, 'wrong'));

test('tracks directions separately', () => {
  const v = createVocabulary({ english: 'house', german: 'Haus' });
  const updated = updateProgress(v, DIRECTIONS.EN_DE, 'correct', new Date('2026-09-16T12:00:00Z'));
  assert.equal(updated.learning[DIRECTIONS.EN_DE].attempts, 1);
  assert.equal(updated.learning[DIRECTIONS.DE_EN].attempts, 0);
});

test('wrong answer is scheduled sooner than correct answer', () => {
  const v = createVocabulary({ english: 'house', german: 'Haus' });
  const now = new Date('2026-09-16T12:00:00Z');
  const wrong = updateProgress(v, DIRECTIONS.EN_DE, 'wrong', now);
  const correct = updateProgress(v, DIRECTIONS.EN_DE, 'correct', now);
  assert.ok(new Date(wrong.learning[DIRECTIONS.EN_DE].nextDueAt) < new Date(correct.learning[DIRECTIONS.EN_DE].nextDueAt));
});

test('new vocabulary has higher priority', () => {
  const now = new Date('2026-09-16T12:00:00Z');
  const fresh = createVocabulary({ english: 'book', german: 'Buch' });
  const practiced = updateProgress(createVocabulary({ english: 'house', german: 'Haus' }), DIRECTIONS.EN_DE, 'correct', now);
  assert.ok(priorityScore(fresh, DIRECTIONS.EN_DE, now) > priorityScore(practiced, DIRECTIONS.EN_DE, now));
  assert.equal(selectNextVocabulary([practiced, fresh], DIRECTIONS.EN_DE, now).id, fresh.id);
});

test('detects duplicate by matching English term', () => {
  const existing = createVocabulary({ english: 'house', german: 'Haus' });
  const candidates = findDuplicateCandidates({ english: 'House', german: 'Gebäude' }, [existing]);
  assert.equal(candidates[0].existing.id, existing.id);
});

test('multiple choice contains exactly one correct answer when enough words exist', () => {
  const rows = [
    createVocabulary({ english: 'house', german: 'Haus' }),
    createVocabulary({ english: 'school', german: 'Schule' }),
    createVocabulary({ english: 'book', german: 'Buch' }),
    createVocabulary({ english: 'dog', german: 'Hund' })
  ];
  const choices = buildChoices(rows[0], rows, DIRECTIONS.EN_DE);
  assert.equal(choices.filter(x => x === 'Haus').length, 1);
  assert.equal(choices.length, 4);
});

test('multiple choice never duplicates the correct answer via a synonym entry', () => {
  const rows = [
    createVocabulary({ english: 'begin', german: 'beginnen' }),
    createVocabulary({ english: 'start', german: 'beginnen' }),
    createVocabulary({ english: 'finish', german: 'beenden' })
  ];
  const choices = buildChoices(rows[0], rows, DIRECTIONS.EN_DE);
  assert.equal(choices.filter(x => x === 'beginnen').length, 1);
});

test('parses a simple OCR table pair and marks confident rows', () => {
  const parsed = parseOcrData({ confidence: 91, text: 'English  Deutsch\nhouse  Haus\nschool | Schule' });
  assert.deepEqual(parsed.rows.map(r => [r.english, r.german]), [['house', 'Haus'], ['school', 'Schule']]);
  assert.equal(parsed.rows[0].uncertain, false);
});

test('migrates legacy version 0', () => {
  const migrated = migrateVocabulary({ id: 'legacy', en: 'cat', de: 'Katze', alternatives: ['Kater'] });
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.alternatives.german[0], 'Kater');
});

test('backup validates and preserves vocabularies', () => {
  const vocab = createVocabulary({ english: 'house', german: 'Haus' });
  const backup = createBackup([vocab]);
  const validated = validateBackup(backup);
  assert.equal(validated.vocabularies[0].id, vocab.id);
});

let passed = 0;
for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); console.error(error); process.exitCode = 1; }
}
console.log(`\n${passed}/${tests.length} tests passed`);
