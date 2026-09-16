import { IndexedDbVocabularyRepository } from './repository/indexedDbVocabularyRepository.js';
import { DIRECTIONS } from './domain/vocabulary.js';
import { evaluateAnswer, normalizeAnswer } from './services/answerEvaluationService.js';
import { selectNextVocabulary, updateProgress, masteryLevel } from './services/learningEngine.js';
import { speakEnglish } from './services/speechService.js';
import { buildChoices } from './services/multipleChoiceService.js';
import { fetchVocabularyCsv, mergeRepositoryVocabulary } from './services/csvVocabularyService.js';

const CSV_URL = './data/vocabulary.csv';
const repo = new IndexedDbVocabularyRepository();
const app = document.querySelector('#app');

const state = {
  view: 'learn',
  vocabularies: [],
  search: '',
  message: null,
  sourceStatus: 'loading',
  learning: {
    active: false,
    mode: 'input',
    direction: DIRECTIONS.EN_DE,
    currentId: null,
    feedback: null
  }
};

init().catch(showFatal);

async function init() {
  if (!('indexedDB' in window)) {
    throw new Error('Dieser Browser unterstützt IndexedDB nicht. Der Lernstand kann daher nicht sicher gespeichert werden.');
  }

  const cached = await repo.list();
  try {
    await syncVocabulary(cached);
  } catch (error) {
    if (!cached.length) throw error;
    state.vocabularies = cached;
    state.sourceStatus = 'cache';
    state.message = {
      kind: 'info',
      text: 'Die Vokabelliste aus dem Repository konnte nicht aktualisiert werden. Es wird die zuletzt gespeicherte lokale Kopie verwendet.'
    };
  }

  render();
  registerServiceWorker();
}

async function syncVocabulary(cached = state.vocabularies) {
  const source = await fetchVocabularyCsv(CSV_URL);
  const merged = mergeRepositoryVocabulary(source, cached);
  await repo.replaceAll(merged);
  state.vocabularies = sortVocabulary(merged);
  state.sourceStatus = 'repository';

  if (state.learning.currentId && !state.vocabularies.some(v => v.id === state.learning.currentId)) {
    state.learning.active = false;
    state.learning.currentId = null;
    state.learning.feedback = null;
  }
}

function render() {
  app.innerHTML = `
    <header class="topbar">
      <h1>Vokabeltrainer</h1>
      <span class="local-badge">${state.sourceStatus === 'cache' ? 'Offline-Kopie' : 'Vokabeln aus Repository'}</span>
    </header>
    <main class="main"><div class="content">${renderMessage()}${renderView()}</div></main>
    ${renderNav()}`;
  bindCommonEvents();
  bindViewEvents();
}

function renderMessage() {
  if (!state.message) return '';
  const kind = state.message.kind === 'error' ? 'error' : state.message.kind === 'success' ? 'success' : '';
  return `<div class="notice ${kind}" role="status">${escapeHtml(state.message.text)}</div><div style="height:12px"></div>`;
}

function renderView() {
  if (state.view === 'learn') return renderLearn();
  if (state.view === 'vocab') return renderVocabularyList();
  if (state.view === 'progress') return renderProgress();
  return '';
}

function renderNav() {
  const items = [['learn', 'Lernen'], ['vocab', 'Vokabeln'], ['progress', 'Fortschritt']];
  return `<nav class="nav" aria-label="Hauptnavigation">${items.map(([id, label]) => `
    <button data-nav="${id}" class="${state.view === id ? 'active' : ''}" aria-current="${state.view === id ? 'page' : 'false'}">${label}</button>`).join('')}</nav>`;
}

function renderLearn() {
  if (!state.vocabularies.length) {
    return `<section class="learning-shell"><div class="card stack">
      <div><h2>Noch keine Vokabeln</h2><p class="muted">Die App lädt ihre Vokabeln aus <code>data/vocabulary.csv</code> im GitHub-Repository. Sobald dort Vokabeln eingetragen sind, erscheinen sie hier automatisch.</p></div>
      <button class="button secondary" id="refresh-vocabulary">Vokabeln aktualisieren</button>
    </div></section>`;
  }

  if (!state.learning.active) {
    return `<section class="learning-shell"><div class="card stack">
      <div><h2>Lernen</h2><p class="muted">Wähle Lernmodus und Richtung. Der Lernstand wird für beide Richtungen getrennt lokal gespeichert.</p></div>
      <label>Lernmodus<select id="learning-mode"><option value="input" ${state.learning.mode === 'input' ? 'selected' : ''}>Übersetzung eingeben</option><option value="choice" ${state.learning.mode === 'choice' ? 'selected' : ''}>Multiple Choice</option></select></label>
      <label>Lernrichtung<select id="learning-direction"><option value="en-de" ${state.learning.direction === 'en-de' ? 'selected' : ''}>Englisch → Deutsch</option><option value="de-en" ${state.learning.direction === 'de-en' ? 'selected' : ''}>Deutsch → Englisch</option></select></label>
      ${state.vocabularies.length < 3 ? '<p class="small muted">Für sinnvolles Multiple Choice werden mindestens 3 Vokabeln benötigt.</p>' : ''}
      <button class="button" id="start-learning">Lernen starten</button>
    </div></section>`;
  }

  const current = currentVocabulary();
  if (!current) {
    state.learning.active = false;
    return renderLearn();
  }

  const direction = state.learning.direction;
  const question = direction === DIRECTIONS.EN_DE ? current.english : current.german;
  const correct = acceptedAnswers(current, direction)[0];
  const showSpeech = direction === DIRECTIONS.EN_DE || state.learning.feedback;

  return `<section class="learning-shell"><div class="card stack">
    <div class="row spread"><span class="badge">${state.learning.mode === 'input' ? 'Eingabe' : 'Multiple Choice'}</span><button class="button ghost" id="stop-learning">Beenden</button></div>
    <div class="question"><div class="question-label">${direction === DIRECTIONS.EN_DE ? 'Übersetze ins Deutsche' : 'Übersetze ins Englische'}</div><div class="question-word">${escapeHtml(question)}</div>${showSpeech ? '<button class="icon-button" id="speak-current" aria-label="Englisches Wort vorlesen" title="Vorlesen">▶</button>' : ''}</div>
    ${state.learning.feedback ? renderFeedback(state.learning.feedback, correct) : renderAnswerControls(current)}
  </div></section>`;
}

function renderAnswerControls(current) {
  if (state.learning.mode === 'input') {
    return `<form id="answer-form" class="answer-form"><label class="small">Deine Antwort<input id="answer-input" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="done" required></label><button class="button" type="submit">Prüfen</button></form>`;
  }

  const choices = buildChoices(current, state.vocabularies, state.learning.direction, 4);
  return `<div class="mc-grid">${choices.map(choice => `<button class="button secondary" data-choice="${escapeAttribute(choice)}">${escapeHtml(choice)}</button>`).join('')}</div>`;
}

function renderFeedback(feedback, correctAnswer) {
  const labels = {
    correct: ['Richtig', 'correct'],
    near: ['Fast richtig', 'near'],
    wrong: ['Noch nicht richtig', 'wrong']
  };
  const [title, cls] = labels[feedback.result];
  return `<div class="stack"><div class="feedback ${cls}" role="status"><div>${title}</div>${feedback.result !== 'correct' ? `<div class="small" style="margin-top:6px">Richtige Antwort: ${escapeHtml(correctAnswer)}</div>` : ''}</div><button class="button" id="next-question">Nächste Vokabel</button></div>`;
}

function renderVocabularyList() {
  const q = normalizeAnswer(state.search);
  const rows = state.vocabularies.filter(v => !q || normalizeAnswer(v.english).includes(q) || normalizeAnswer(v.german).includes(q));

  return `<section class="stack">
    <div class="row spread"><div><h2>Vokabeln</h2><div class="muted small">${state.vocabularies.length} aus dem Repository</div></div><button class="button secondary" id="refresh-vocabulary">Aktualisieren</button></div>
    <input id="vocab-search" type="search" placeholder="Englisch oder Deutsch suchen" value="${escapeAttribute(state.search)}" aria-label="Vokabeln durchsuchen">
    <div class="vocab-list">${rows.length ? rows.map(renderVocabularyItem).join('') : '<div class="card muted">Keine passenden Vokabeln gefunden.</div>'}</div>
  </section>`;
}

function renderVocabularyItem(v) {
  const en = masteryLevel(v.learning[DIRECTIONS.EN_DE]);
  const de = masteryLevel(v.learning[DIRECTIONS.DE_EN]);
  const alternatives = [...(v.alternatives?.german ?? []), ...(v.alternatives?.english ?? [])];

  return `<article class="vocab-item">
    <div class="vocab-pair"><strong>${escapeHtml(v.english)}</strong><span>${escapeHtml(v.german)}</span>${alternatives.length ? `<div class="small muted">Alternativen: ${escapeHtml(alternatives.join(', '))}</div>` : ''}<div class="badges"><span class="badge ${en}">E→D: ${masteryLabel(en)}</span><span class="badge ${de}">D→E: ${masteryLabel(de)}</span></div></div>
    <div class="row"><button class="icon-button" data-speak="${escapeAttribute(v.id)}" aria-label="${escapeAttribute(v.english)} vorlesen">▶</button></div>
  </article>`;
}

function renderProgress() {
  const counts = { new: 0, difficult: 0, learning: 0, good: 0 };

  for (const v of state.vocabularies) {
    const a = masteryLevel(v.learning[DIRECTIONS.EN_DE]);
    const b = masteryLevel(v.learning[DIRECTIONS.DE_EN]);
    let overall = 'learning';
    if (a === 'new' && b === 'new') overall = 'new';
    else if (a === 'difficult' || b === 'difficult') overall = 'difficult';
    else if (a === 'good' && b === 'good') overall = 'good';
    counts[overall]++;
  }

  const today = new Date().toDateString();
  const todayActivity = state.vocabularies.reduce((sum, v) => sum + (v.history ?? []).filter(h => new Date(h.answeredAt).toDateString() === today).length, 0);

  return `<section class="stack">
    <div><h2>Fortschritt</h2><p class="muted">Der Lernstand wird ausschließlich lokal in diesem Browser gespeichert. Die Vokabeltexte selbst kommen aus dem Repository.</p></div>
    <div class="grid-4">${stat(state.vocabularies.length, 'Vokabeln')}${stat(counts.new, 'Neu')}${stat(counts.difficult, 'Schwieriger')}${stat(counts.good, 'Gut beherrscht')}</div>
    <div class="card"><div class="stat-number">${todayActivity}</div><div class="stat-label">Abfragen heute</div></div>
  </section>`;
}

function bindCommonEvents() {
  document.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.nav;
    state.message = null;
    render();
  }));
}

function bindViewEvents() {
  document.querySelectorAll('#refresh-vocabulary').forEach(button => button.addEventListener('click', refreshVocabulary));

  if (state.view === 'learn') bindLearnEvents();
  if (state.view === 'vocab') bindVocabularyEvents();
}

function bindLearnEvents() {
  const start = document.querySelector('#start-learning');
  if (start) start.addEventListener('click', () => {
    const mode = document.querySelector('#learning-mode').value;
    const direction = document.querySelector('#learning-direction').value;

    if (mode === 'choice' && state.vocabularies.length < 3) {
      state.message = { kind: 'error', text: 'Für Multiple Choice werden mindestens 3 Vokabeln benötigt.' };
      render();
      return;
    }

    state.learning.mode = mode;
    state.learning.direction = direction;
    state.learning.active = true;
    state.learning.feedback = null;
    state.learning.currentId = selectNextVocabulary(state.vocabularies, direction)?.id ?? null;
    state.message = null;
    render();
  });

  document.querySelector('#stop-learning')?.addEventListener('click', () => {
    state.learning.active = false;
    state.learning.feedback = null;
    render();
  });

  document.querySelector('#speak-current')?.addEventListener('click', () => {
    const current = currentVocabulary();
    if (current) speakEnglish(current.english);
  });

  const form = document.querySelector('#answer-form');
  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const input = document.querySelector('#answer-input').value;
      await evaluateCurrentAnswer(input);
    });
  }

  document.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', async () => {
    await evaluateCurrentAnswer(button.dataset.choice);
  }));

  document.querySelector('#next-question')?.addEventListener('click', () => {
    const next = selectNextVocabulary(state.vocabularies, state.learning.direction, new Date(), state.learning.currentId)
      ?? selectNextVocabulary(state.vocabularies, state.learning.direction);
    state.learning.currentId = next?.id ?? null;
    state.learning.feedback = null;
    render();
  });
}

function bindVocabularyEvents() {
  const search = document.querySelector('#vocab-search');
  if (search) search.addEventListener('input', event => {
    state.search = event.target.value;
    render();
    const nextSearch = document.querySelector('#vocab-search');
    nextSearch?.focus();
    nextSearch?.setSelectionRange(state.search.length, state.search.length);
  });

  document.querySelectorAll('[data-speak]').forEach(button => button.addEventListener('click', () => {
    const vocabulary = state.vocabularies.find(v => v.id === button.dataset.speak);
    if (vocabulary) speakEnglish(vocabulary.english);
  }));
}

async function evaluateCurrentAnswer(answer) {
  const current = currentVocabulary();
  if (!current || state.learning.feedback) return;

  const evaluation = evaluateAnswer(answer, acceptedAnswers(current, state.learning.direction));
  const updated = updateProgress(current, state.learning.direction, evaluation.result);
  await repo.put(updated);
  state.vocabularies = state.vocabularies.map(v => v.id === updated.id ? updated : v);
  state.learning.feedback = evaluation;
  render();
}

async function refreshVocabulary() {
  const button = document.querySelector('#refresh-vocabulary');
  if (button) button.disabled = true;

  try {
    await syncVocabulary(state.vocabularies);
    state.message = { kind: 'success', text: `${state.vocabularies.length} Vokabeln aus dem Repository aktualisiert.` };
  } catch (error) {
    state.message = { kind: 'error', text: `Aktualisierung fehlgeschlagen: ${error.message}` };
  }
  render();
}

function currentVocabulary() {
  return state.vocabularies.find(v => v.id === state.learning.currentId) ?? null;
}

function acceptedAnswers(vocabulary, direction) {
  if (direction === DIRECTIONS.EN_DE) {
    return [vocabulary.german, ...(vocabulary.alternatives?.german ?? [])];
  }
  return [vocabulary.english, ...(vocabulary.alternatives?.english ?? [])];
}

function masteryLabel(level) {
  return { new: 'Neu', difficult: 'Schwieriger', learning: 'In Übung', good: 'Gut' }[level] ?? level;
}

function stat(value, label) {
  return `<div class="stat"><div class="stat-number">${value}</div><div class="stat-label">${escapeHtml(label)}</div></div>`;
}

function sortVocabulary(vocabularies) {
  return [...vocabularies].sort((a, b) => a.english.localeCompare(b.english, 'en'));
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function showFatal(error) {
  console.error(error);
  app.innerHTML = `<main class="main"><div class="content"><div class="notice error"><strong>Die App konnte nicht gestartet werden.</strong><br>${escapeHtml(error?.message ?? 'Unbekannter Fehler')}</div></div></main>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
