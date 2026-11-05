import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateAnswer, normalizeAnswer } from '../src/services/answerEvaluationService.js';
import { createVocabulary, DIRECTIONS } from '../src/domain/vocabulary.js';
import { migrateVocabulary } from '../src/domain/migrations.js';
import { updateProgress, priorityScore, noveltyBonus, selectNextVocabulary, resolveQuestionDirection, RANDOM_DIRECTION } from '../src/services/learningEngine.js';
import { buildChoices } from '../src/services/multipleChoiceService.js';
import { ORAL_ROUND_SIZE, startOralSession, answerOralQuestion, continueOralSession, oralRoundSummary } from '../src/services/oralQuizService.js';
import { parseVocabularyCsv, mergeRepositoryVocabulary } from '../src/services/csvVocabularyService.js';
import { createProgressBackup, applyProgressBackup } from '../src/services/progressBackupService.js';

if (!globalThis.crypto?.randomUUID) {
  const { randomUUID } = await import('node:crypto');
  globalThis.crypto = { randomUUID };
}

import { buildClozeQuestion, clozeVocabulary, clozeWeight, selectNextClozeVocabulary } from '../src/services/clozeService.js';

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
  assert.match(source, /\['random', 'Zufällig'/);
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
  assert.equal(selectNextVocabulary([practiced, fresh], DIRECTIONS.EN_DE, now, null, () => 0.99).id, fresh.id);
});

test('addition date survives CSV import and merge', () => {
  const source = parseVocabularyCsv('id,english,german,added_at\nv1,house,Haus,2026-11-05');
  assert.equal(source[0].addedAt, '2026-11-05');
  assert.equal(mergeRepositoryVocabulary(source, [createVocabulary({ id: 'v1', english: 'house', german: 'Haus' })])[0].addedAt, '2026-11-05');
});

test('novelty bonus expires after fourteen days', () => {
  const v = createVocabulary({ id: 'v1', english: 'house', german: 'Haus', addedAt: '2026-11-05' });
  assert.ok(noveltyBonus(v, new Date('2026-11-05T12:00:00Z')) > 0);
  assert.equal(noveltyBonus(v, new Date('2026-11-19T00:00:00Z')), 0);
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
    if (q.category === 'vocabulary') assert.equal(q.hint, row.german);
    else assert.ok(q.explanation);
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

test('grammar covers pronouns, singular/plural statements and questions with four relevant choices', async () => {
  const rows = parseVocabularyCsv(await readFile(new URL('../data/vocabulary.csv', import.meta.url), 'utf8'));
  for (const english of ['I', 'you', 'he', 'she', 'it', 'we', 'they', 'there is', 'there are', 'is there', 'are there']) {
    const current = rows.find(v => v.english === english);
    const first = buildClozeQuestion(current, rows, () => 0);
    const second = buildClozeQuestion(current, rows, () => 0.99);
    assert.equal(first.category, 'grammar');
    assert.equal(first.choices.length, 4);
    assert.notEqual(first.completed, second.completed);
    assert.ok(first.explanation);
    if (english.includes('there')) {
      assert.deepEqual([...first.choices].sort(), ['are there', 'is there', 'there are', 'there is']);
      assert.equal(first.completed.endsWith('?'), english.endsWith('there'));
    } else {
      assert.ok(first.choices.every(a => ['I', 'you', 'he', 'she', 'it', 'we', 'they'].includes(a)));
    }
  }
  const he = buildClozeQuestion(rows.find(v => v.english === 'he'), rows, () => 0);
  assert.equal(he.completed, 'Ben is my brother. He is ten.');
});

test('cloze keeps a two-to-one grammar mix and avoids immediate repetition', async () => {
  const rows = parseVocabularyCsv(await readFile(new URL('../data/vocabulary.csv', import.meta.url), 'utf8'));
  let previous = null;
  for (let i = 0; i < 12; i++) {
    const next = selectNextClozeVocabulary(rows, i, previous, new Date(), () => 0.2);
    assert.notEqual(next.id, previous);
    assert.equal(buildClozeQuestion(next, rows).category, i % 3 === 2 ? 'vocabulary' : 'grammar');
    previous = next.id;
  }
  const vocabularyOnly = rows.filter(v => ['cat', 'dog', 'bird', 'house'].includes(v.english));
  assert.ok(selectNextClozeVocabulary(vocabularyOnly, 0));
  assert.equal(selectNextClozeVocabulary([], 0), null);
});

test('weak cloze concepts get more practice than new or mastered concepts and recover after success', () => {
  const now = new Date('2026-09-17T12:00:00Z');
  const rows = ['he', 'she', 'it', 'we'].map((english, i) => createVocabulary({ id: String(i), english, german: String(i) }));
  rows[0] = updateProgress(rows[0], DIRECTIONS.DE_EN, 'wrong', now);
  for (let i = 0; i < 4; i++) rows[1] = updateProgress(rows[1], DIRECTIONS.DE_EN, 'correct', now);
  assert.ok(clozeWeight(rows[0], now) > clozeWeight(rows[2], now));
  assert.ok(clozeWeight(rows[2], now) > clozeWeight(rows[1], now));
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 1000; i++) counts[Number(selectNextClozeVocabulary(rows, 0, null, now, () => i / 1000).id)]++;
  assert.ok(counts[0] > counts[2] * 2);
  assert.ok(counts[2] > counts[1]);
  const recovered = updateProgress(rows[0], DIRECTIONS.DE_EN, 'correct', now);
  assert.ok(clozeWeight(recovered, now) < clozeWeight(rows[0], now));
  const backup = createProgressBackup(rows);
  const restored = applyProgressBackup(rows.map(v => createVocabulary(v)), backup).vocabularies;
  assert.equal(clozeWeight(restored[0], now), clozeWeight(rows[0], now));
});


const oralFixture = (count = 25) => Array.from({ length: count }, (_, i) =>
  createVocabulary({ id: 'oral-' + i, english: 'word' + i, german: 'Wort' + i, addedAt: i === 0 ? '2026-11-05' : null })
);

test('oral quiz pauses exactly after ten answers and offers a next batch', () => {
  const words = oralFixture();
  let session = startOralSession(words, new Date('2026-11-05T12:00:00Z'), () => 0);
  const ids = new Set();
  assert.equal(ORAL_ROUND_SIZE, 10);
  for (let i = 0; i < ORAL_ROUND_SIZE; i++) {
    assert.equal(session.phase, 'question');
    assert.equal(oralRoundSummary(session).answered, i);
    ids.add(session.current.id);
    session = answerOralQuestion(session, 'correct', words, new Date('2026-11-05T12:00:00Z'), () => 0);
  }
  assert.equal(ids.size, 10);
  assert.equal(session.phase, 'round-complete');
  assert.equal(session.current, null);
  assert.equal(oralRoundSummary(session).correct, 10);
  assert.throws(() => answerOralQuestion(session, 'correct', words), /Keine offene/);
  session = continueOralSession(session, words, new Date('2026-11-05T12:00:00Z'), () => 0);
  assert.equal(session.phase, 'question');
  assert.equal(oralRoundSummary(session).number, 2);
  assert.equal(oralRoundSummary(session).answered, 0);
  assert.ok(!ids.has(session.current.id), 'previously mastered vocabulary must not return');
});

test('oral quiz retries wrong words only in a later batch when enough words exist', () => {
  const words = oralFixture(20);
  let session = startOralSession(words, new Date('2026-11-05T12:00:00Z'), () => 0);
  const asked = [];
  for (let i = 0; i < 10; i++) {
    asked.push(session.current.id);
    session = answerOralQuestion(session, 'wrong', words, new Date('2026-11-05T12:00:00Z'), () => 0);
  }
  assert.equal(new Set(asked).size, 10);
  assert.equal(oralRoundSummary(session).wrong, 10);
  session = continueOralSession(session, words, new Date('2026-11-05T12:00:00Z'), () => 0);
  assert.ok(asked.includes(session.current.id), 'an unmastered word can return');
  assert.notEqual(session.current.id, asked.at(-1), 'never directly repeat the previous word when alternatives exist');
});

test('oral quiz ratings are session-only and do not mutate persistent learning data', () => {
  const words = oralFixture();
  const before = JSON.stringify(words);
  let session = startOralSession(words, new Date('2026-11-05T12:00:00Z'), () => 0);
  session = answerOralQuestion(session, 'wrong', words, new Date('2026-11-05T12:00:00Z'), () => 0);
  session = answerOralQuestion(session, 'correct', words, new Date('2026-11-05T12:00:00Z'), () => 0);
  assert.equal(JSON.stringify(words), before);
  assert.equal(oralRoundSummary(session).answered, 2);
  assert.equal(oralRoundSummary(session).mastered, 1);
  assert.equal(oralRoundSummary(session).wrong, 1);
});

test('oral quiz uses both translation directions', () => {
  const words = oralFixture();
  const randomValues = [0.1, 0, 0.9, 0];
  const random = () => randomValues.shift() ?? 0;
  let session = startOralSession(words, new Date('2026-11-05T12:00:00Z'), random);
  assert.equal(session.current.direction, DIRECTIONS.EN_DE);
  session = answerOralQuestion(session, 'wrong', words, new Date('2026-11-05T12:00:00Z'), random);
  assert.equal(session.current.direction, DIRECTIONS.DE_EN);
});

test('oral quiz ends if every vocabulary is mastered before ten questions', () => {
  const words = oralFixture(2);
  let session = startOralSession(words, new Date('2026-11-05T12:00:00Z'), () => 0);
  session = answerOralQuestion(session, 'correct', words, new Date('2026-11-05T12:00:00Z'), () => 0);
  session = answerOralQuestion(session, 'correct', words, new Date('2026-11-05T12:00:00Z'), () => 0);
  assert.equal(session.phase, 'finished');
  assert.equal(oralRoundSummary(session).answered, 2);
});

test('oral quiz rejects invalid result and premature continuation', () => {
  const words = oralFixture();
  const session = startOralSession(words);
  assert.throws(() => answerOralQuestion(session, 'near', words), /Ungültige mündliche Bewertung/);
  assert.throws(() => continueOralSession(session, words), /noch nicht beendet/);
  assert.equal(startOralSession([]).phase, 'finished');
});

test('old vocabulary receives no addition-date bonus while dated additions do', () => {
  const words = oralFixture(2);
  const now = new Date('2026-11-05T12:00:00Z');
  assert.equal(noveltyBonus(words[1], now), 0);
  assert.ok(noveltyBonus(words[0], now) > noveltyBonus(words[1], now));
});

test('navigation declares four balanced tabs', async () => {
  const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(appSource, /\['oral', 'Abfragen'\]/);
  assert.match(css, /\.nav\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
});

test('preview PWA cache is isolated from production', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const repository = await readFile(new URL('../src/repository/indexedDbVocabularyRepository.js', import.meta.url), 'utf8');
  assert.match(sw, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.match(repository, /vokabeltrainer-englisch-test/);
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
