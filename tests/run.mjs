import assert from 'node:assert/strict';
import { evaluateAnswer, normalizeAnswer } from '../src/services/answerEvaluationService.js';
import { createVocabulary, DIRECTIONS } from '../src/domain/vocabulary.js';
import { migrateVocabulary } from '../src/domain/migrations.js';
import { updateProgress, priorityScore, selectNextVocabulary } from '../src/services/learningEngine.js';
import { buildChoices } from '../src/services/multipleChoiceService.js';
import { parseVocabularyCsv, mergeRepositoryVocabulary } from '../src/services/csvVocabularyService.js';

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
  const v = createVocabulary({ id: 'v001', english: 'house', german: 'Haus' });
  const updated = updateProgress(v, DIRECTIONS.EN_DE, 'correct', new Date('2026-09-16T12:00:00Z'));
  assert.equal(updated.learning[DIRECTIONS.EN_DE].attempts, 1);
  assert.equal(updated.learning[DIRECTIONS.DE_EN].attempts, 0);
});

test('wrong answer is scheduled sooner than correct answer', () => {
  const v = createVocabulary({ id: 'v001', english: 'house', german: 'Haus' });
  const now = new Date('2026-09-16T12:00:00Z');
  const wrong = updateProgress(v, DIRECTIONS.EN_DE, 'wrong', now);
  const correct = updateProgress(v, DIRECTIONS.EN_DE, 'correct', now);
  assert.ok(new Date(wrong.learning[DIRECTIONS.EN_DE].nextDueAt) < new Date(correct.learning[DIRECTIONS.EN_DE].nextDueAt));
});

test('new vocabulary has higher priority', () => {
  const now = new Date('2026-09-16T12:00:00Z');
  const fresh = createVocabulary({ id: 'v002', english: 'book', german: 'Buch' });
  const practiced = updateProgress(createVocabulary({ id: 'v001', english: 'house', german: 'Haus' }), DIRECTIONS.EN_DE, 'correct', now);
  assert.ok(priorityScore(fresh, DIRECTIONS.EN_DE, now) > priorityScore(practiced, DIRECTIONS.EN_DE, now));
  assert.equal(selectNextVocabulary([practiced, fresh], DIRECTIONS.EN_DE, now).id, fresh.id);
});

test('multiple choice contains exactly one correct answer', () => {
  const rows = [
    createVocabulary({ id: 'v001', english: 'house', german: 'Haus' }),
    createVocabulary({ id: 'v002', english: 'school', german: 'Schule' }),
    createVocabulary({ id: 'v003', english: 'book', german: 'Buch' }),
    createVocabulary({ id: 'v004', english: 'dog', german: 'Hund' })
  ];
  const choices = buildChoices(rows[0], rows, DIRECTIONS.EN_DE);
  assert.equal(choices.filter(x => x === 'Haus').length, 1);
  assert.equal(choices.length, 4);
});

test('parses repository CSV including quoted comma and alternatives', () => {
  const csv = 'id,english,german,english_alternatives,german_alternatives\n' +
    'v001,"hello, there",Hallo,hi|hello,Guten Tag|Hallo\n';
  const [v] = parseVocabularyCsv(csv);
  assert.equal(v.id, 'v001');
  assert.equal(v.english, 'hello, there');
  assert.deepEqual(v.alternatives.english, ['hi', 'hello']);
  assert.deepEqual(v.alternatives.german, ['Guten Tag', 'Hallo']);
  assert.equal(v.provenance.input, 'repository-csv');
});

test('rejects duplicate repository IDs', () => {
  const csv = 'id,english,german\nv001,house,Haus\nv001,school,Schule\n';
  assert.throws(() => parseVocabularyCsv(csv), /Doppelte ID/);
});

test('repository update preserves learning but replaces vocabulary text', () => {
  const cached = updateProgress(
    createVocabulary({ id: 'v001', english: 'house', german: 'Haus' }),
    DIRECTIONS.EN_DE,
    'correct',
    new Date('2026-09-16T12:00:00Z')
  );
  const source = parseVocabularyCsv('id,english,german,english_alternatives,german_alternatives\nv001,the house,das Haus,,Gebäude\n');
  const [merged] = mergeRepositoryVocabulary(source, [cached]);
  assert.equal(merged.english, 'the house');
  assert.deepEqual(merged.alternatives.german, ['Gebäude']);
  assert.equal(merged.learning[DIRECTIONS.EN_DE].attempts, 1);
  assert.equal(merged.history.length, 1);
});

test('repository removal does not retain obsolete cached vocabulary', () => {
  const cached = [
    createVocabulary({ id: 'v001', english: 'house', german: 'Haus' }),
    createVocabulary({ id: 'v002', english: 'book', german: 'Buch' })
  ];
  const source = parseVocabularyCsv('id,english,german\nv001,house,Haus\n');
  const merged = mergeRepositoryVocabulary(source, cached);
  assert.deepEqual(merged.map(v => v.id), ['v001']);
});

test('migrates legacy version 0', () => {
  const migrated = migrateVocabulary({ id: 'legacy', en: 'cat', de: 'Katze', alternatives: ['Kater'] });
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.alternatives.german[0], 'Kater');
});

let passed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} tests passed`);
