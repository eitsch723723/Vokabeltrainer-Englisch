import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateAnswer, normalizeAnswer } from '../src/services/answerEvaluationService.js';
import { createVocabulary, DIRECTIONS } from '../src/domain/vocabulary.js';
import { migrateVocabulary } from '../src/domain/migrations.js';
import { updateProgress, priorityScore, selectNextVocabulary, resolveQuestionDirection, RANDOM_DIRECTION } from '../src/services/learningEngine.js';
import { buildChoices } from '../src/services/multipleChoiceService.js';
import { parseVocabularyCsv, mergeRepositoryVocabulary } from '../src/services/csvVocabularyService.js';
import { createProgressBackup, applyProgressBackup } from '../src/services/progressBackupService.js';

if (!globalThis.crypto?.randomUUID) {
  const { randomUUID } = await import('node:crypto');
  globalThis.crypto = { randomUUID };
}

import { buildClozeQuestion, clozeVocabulary } from '../src/services/clozeService.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('normalizes case and spaces', () => assert.equal(normalizeAnswer('  House   '), 'house'));
test('ignores sentence punctuation', () => assert.equal(evaluateAnswer('No, I am not', ['No, I am not.']).result, 'correct'));
test('accepts omitted apostrophes', () => assert.equal(evaluateAnswer('dont', ["don't"]).result, 'correct'));
test('accepts exact answer ignoring case', () => assert.equal(evaluateAnswer('HOUSE', ['house']).result, 'correct'));
test('accepts alternative translation', () => assert.equal(evaluateAnswer('beginnen', ['anfangen', 'beginnen']).result, 'correct'));
test('marks one-character typo as near', () => assert.equal(evaluateAnswer('becaus', ['because']).result, 'near'));
test('marks adjacent transposition as near', () => assert.equal(evaluateAnswer('freind', ['friend']).result, 'near'));
test('allows two minor edits in medium-length words', () => assert.equal(evaluateAnswer('becuase', ['because']).result, 'near'));
test('does not over-tolerate short words', () => assert.equal(evaluateAnswer('in', ['on']).result, 'wrong'));

test('random direction can resolve to English to German', () => {
  assert.equal(resolveQuestionDirection(RANDOM_DIRECTION, 0.1), DIRECTIONS.EN_DE);
});

test('random direction can resolve to German to English', () => {
  assert.equal(resolveQuestionDirection(RANDOM_DIRECTION, 0.9), DIRECTIONS.DE_EN);
});

test('fixed learning direction remains unchanged', () => {
  assert.equal(resolveQuestionDirection(DIRECTIONS.EN_DE, 0.9), DIRECTIONS.EN_DE);
  assert.equal(resolveQuestionDirection(DIRECTIONS.DE_EN, 0.1), DIRECTIONS.DE_EN);
});

test('learning UI defaults to random direction and multiple choice', async () => {
  const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /mode:\s*'choice'/);
  assert.match(source, /directionSelection:\s*RANDOM_DIRECTION/);
  assert.match(source, />Zufällig<\/option>/);
});

test('layout keeps navigation visible while main content scrolls', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.app-shell\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
  assert.match(styles, /\.main\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
});

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

test('progress backup restores learning without changing repository vocabulary text', () => {
  const learned = updateProgress(
    createVocabulary({ id: 'v001', english: 'house', german: 'Haus' }),
    DIRECTIONS.EN_DE,
    'correct',
    new Date('2026-09-16T12:00:00Z')
  );
  const backup = createProgressBackup([learned]);
  const current = [createVocabulary({ id: 'v001', english: 'the house', german: 'das Haus' })];
  const result = applyProgressBackup(current, backup);
  assert.equal(result.vocabularies[0].english, 'the house');
  assert.equal(result.vocabularies[0].german, 'das Haus');
  assert.equal(result.vocabularies[0].learning[DIRECTIONS.EN_DE].attempts, 1);
  assert.equal(result.restored, 1);
});

test('migrates legacy version 0', () => {
  const migrated = migrateVocabulary({ id: 'legacy', en: 'cat', de: 'Katze', alternatives: ['Kater'] });
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.alternatives.german[0], 'Kater');
});

test('cloze questions use current vocabulary, four unique choices and all gap positions', async () => {
  const rows = parseVocabularyCsv(await readFile(new URL('../data/vocabulary.csv', import.meta.url), 'utf8'));
  const eligible = clozeVocabulary(rows);
  assert.ok(eligible.length > 100);
  const positions = new Set();
  for (const row of eligible) {
    const q = buildClozeQuestion(row, rows, () => 0.4);
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices.map(normalizeAnswer)).size, 4);
    assert.equal(q.choices.filter(a => a === row.english).length, 1);
    assert.equal(q.hint, row.german);
    assert.ok(q.choices.every(a => rows.some(v => v.english === a)));
    assert.ok(!q.completed.includes('{}'));
    positions.add(!q.before ? 'start' : /^\W*$/.test(q.after) ? 'end' : 'middle');
  }
  assert.deepEqual([...positions].sort(), ['end', 'middle', 'start']);
});

test('cloze excludes synonyms, duplicate answers and equal German meanings', () => {
  const rows = [
    { id: '1', english: 'good', german: 'gut', alternatives: { english: ['fine'] } },
    { id: '2', english: 'fine', german: 'gut' },
    { id: '3', english: 'GOOD', german: 'prima' },
    { id: '4', english: 'nice', german: 'nett', alternatives: { english: ['good'] } },
    { id: '5', english: 'cat', german: 'Katze' },
    { id: '6', english: 'dog', german: 'Hund' },
    { id: '7', english: 'bird', german: 'Vogel' }
  ];
  const q = buildClozeQuestion(rows[0], rows, () => 0.5);
  assert.deepEqual([...q.choices].sort(), ['bird', 'cat', 'dog', 'good']);
  assert.equal(buildClozeQuestion(rows[0], rows.slice(0, 6)), null);
  assert.equal(buildClozeQuestion({ english: 'unknown' }, rows), null);
});

test('cloze choice order varies and updated vocabulary controls availability', () => {
  const rows = ['cat', 'dog', 'bird', 'house'].map((english, i) => ({ id: String(i), english, german: String(i) }));
  assert.notDeepEqual(buildClozeQuestion(rows[0], rows, () => 0).choices, buildClozeQuestion(rows[0], rows, () => 0.99).choices);
  assert.equal(clozeVocabulary(rows.slice(0, 3)).length, 0);
  assert.ok(!clozeVocabulary([{ ...rows[0], english: 'new untemplated word' }, ...rows.slice(1)]).some(v => v.id === '0'));
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
