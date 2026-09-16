import { IndexedDbVocabularyRepository } from './repository/indexedDbVocabularyRepository.js';
import { createVocabulary, DIRECTIONS, mergeVocabularyPreservingLearning, uniqueTerms } from './domain/vocabulary.js';
import { evaluateAnswer, normalizeAnswer } from './services/answerEvaluationService.js';
import { selectNextVocabulary, updateProgress, masteryLevel } from './services/learningEngine.js';
import { findDuplicateCandidates } from './services/duplicateService.js';
import { suggestTranslation } from './services/translationService.js';
import { speakEnglish } from './services/speechService.js';
import { buildChoices } from './services/multipleChoiceService.js';
import { createBackup, validateBackup } from './services/backupService.js';
import { recognizeVocabularyImage } from './services/importService.js';

const repo = new IndexedDbVocabularyRepository();
const app = document.querySelector('#app');

const state = {
  view: 'learn',
  vocabularies: [],
  search: '',
  addTab: 'manual',
  editingId: null,
  suggestion: null,
  message: null,
  learning: { active: false, mode: 'input', direction: DIRECTIONS.EN_DE, currentId: null, feedback: null },
  ocr: { file: null, processing: false, progress: 0, rows: [], error: null, rawText: '' },
  pendingBackup: null
};

init().catch(showFatal);

async function init() {
  if (!('indexedDB' in window)) throw new Error('Dieser Browser unterstützt IndexedDB nicht. Die App kann Daten daher nicht sicher lokal speichern.');
  state.vocabularies = await repo.list();
  render();
  registerServiceWorker();
}

function render() {
  app.innerHTML = `
    <header class="topbar"><h1>Vokabeltrainer</h1><span class="local-badge">Nur lokal gespeichert</span></header>
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
  if (state.view === 'add') return renderAdd();
  if (state.view === 'progress') return renderProgress();
  return '';
}

function renderNav() {
  const items = [['learn', 'Lernen'], ['vocab', 'Vokabeln'], ['add', 'Hinzufügen'], ['progress', 'Fortschritt']];
  return `<nav class="nav" aria-label="Hauptnavigation">${items.map(([id, label]) => `
    <button data-nav="${id}" class="${state.view === id ? 'active' : ''}" aria-current="${state.view === id ? 'page' : 'false'}">${label}</button>`).join('')}</nav>`;
}

function renderLearn() {
  if (!state.vocabularies.length) {
    return `<section class="learning-shell"><div class="card"><h2>Noch keine Vokabeln</h2><p class="muted">Füge zuerst Vokabeln hinzu oder importiere eine Liste.</p><button class="button" data-go-add>Vokabel hinzufügen</button></div></section>`;
  }
  if (!state.learning.active) {
    return `<section class="learning-shell"><div class="card stack">
      <div><h2>Lernen</h2><p class="muted">Wähle Lernmodus und Richtung. Der Lernstand wird für beide Richtungen getrennt gespeichert.</p></div>
      <label>Lernmodus<select id="learning-mode"><option value="input" ${state.learning.mode === 'input' ? 'selected' : ''}>Übersetzung eingeben</option><option value="choice" ${state.learning.mode === 'choice' ? 'selected' : ''}>Multiple Choice</option></select></label>
      <label>Lernrichtung<select id="learning-direction"><option value="en-de" ${state.learning.direction === 'en-de' ? 'selected' : ''}>Englisch → Deutsch</option><option value="de-en" ${state.learning.direction === 'de-en' ? 'selected' : ''}>Deutsch → Englisch</option></select></label>
      ${state.vocabularies.length < 3 ? '<p class="small muted">Für sinnvolles Multiple Choice werden mindestens 3 Vokabeln benötigt.</p>' : ''}
      <button class="button" id="start-learning">Lernen starten</button>
    </div></section>`;
  }
  const current = currentVocabulary();
  if (!current) { state.learning.active = false; return renderLearn(); }
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
  if (state.learning.mode === 'input') return `<form id="answer-form" class="answer-form"><label class="small">Deine Antwort<input id="answer-input" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="done" required autofocus></label><button class="button" type="submit">Prüfen</button></form>`;
  const choices = buildChoices(current, state.vocabularies, state.learning.direction, 4);
  return `<div class="mc-grid">${choices.map(choice => `<button class="button secondary" data-choice="${escapeAttribute(choice)}">${escapeHtml(choice)}</button>`).join('')}</div>`;
}

function renderFeedback(feedback, correctAnswer) {
  const labels = { correct: ['Richtig', 'correct'], near: ['Fast richtig', 'near'], wrong: ['Noch nicht richtig', 'wrong'] };
  const [title, cls] = labels[feedback.result];
  return `<div class="stack"><div class="feedback ${cls}" role="status"><div>${title}</div>${feedback.result !== 'correct' ? `<div class="small" style="margin-top:6px">Richtige Antwort: ${escapeHtml(correctAnswer)}</div>` : ''}</div><button class="button" id="next-question">Nächste Vokabel</button></div>`;
}

function renderVocabularyList() {
  const q = normalizeAnswer(state.search);
  const rows = state.vocabularies.filter(v => !q || normalizeAnswer(v.english).includes(q) || normalizeAnswer(v.german).includes(q));
  return `<section class="stack"><div class="row spread"><div><h2>Vokabeln</h2><div class="muted small">${state.vocabularies.length} gespeichert</div></div><button class="button" data-go-add>Neu</button></div><input id="vocab-search" type="search" placeholder="Englisch oder Deutsch suchen" value="${escapeAttribute(state.search)}" aria-label="Vokabeln durchsuchen"><div class="vocab-list">${rows.length ? rows.map(renderVocabularyItem).join('') : '<div class="card muted">Keine passenden Vokabeln gefunden.</div>'}</div></section>`;
}

function renderVocabularyItem(v) {
  const en = masteryLevel(v.learning[DIRECTIONS.EN_DE]);
  const de = masteryLevel(v.learning[DIRECTIONS.DE_EN]);
  return `<article class="vocab-item"><div class="vocab-pair"><strong>${escapeHtml(v.english)}</strong><span>${escapeHtml(v.german)}</span>${v.alternatives?.german?.length || v.alternatives?.english?.length ? `<div class="small muted">Alternativen: ${escapeHtml([...v.alternatives.german, ...v.alternatives.english].join(', '))}</div>` : ''}<div class="badges"><span class="badge ${en}">E→D: ${masteryLabel(en)}</span><span class="badge ${de}">D→E: ${masteryLabel(de)}</span></div></div><div class="row"><button class="icon-button" data-speak="${v.id}" aria-label="${escapeAttribute(v.english)} vorlesen">▶</button><button class="button secondary" data-edit="${v.id}">Bearbeiten</button><button class="button secondary" data-delete="${v.id}">Löschen</button></div></article>`;
}

function renderAdd() {
  return `<section class="stack"><div><h2>${state.editingId ? 'Vokabel bearbeiten' : 'Hinzufügen / Import'}</h2><p class="muted">Automatische Vorschläge werden nie ohne deine Bestätigung gespeichert.</p></div>${state.editingId ? '' : `<div class="segmented"><button data-add-tab="manual" class="${state.addTab === 'manual' ? 'active' : ''}">Manuell</button><button data-add-tab="photo" class="${state.addTab === 'photo' ? 'active' : ''}">Fotoimport</button></div>`}${state.editingId || state.addTab === 'manual' ? renderManualForm() : renderPhotoImport()}</section>`;
}

function renderManualForm() {
  const existing = state.editingId ? state.vocabularies.find(v => v.id === state.editingId) : null;
  const enAlts = existing?.alternatives?.english?.join(', ') ?? '';
  const deAlts = existing?.alternatives?.german?.join(', ') ?? '';
  return `<div class="card stack">
    <label>Ausgangssprache für Vorschläge<select id="source-language"><option value="english">Englisch</option><option value="german">Deutsch</option></select></label>
    <label>Englisch<input id="manual-english" value="${escapeAttribute(existing?.english ?? '')}" autocomplete="off">${state.suggestion?.field === 'english' ? '<span class="badge auto">Automatisch vorgeschlagen – bitte prüfen</span>' : ''}</label>
    <label>Deutsch<input id="manual-german" value="${escapeAttribute(existing?.german ?? '')}" autocomplete="off">${state.suggestion?.field === 'german' ? '<span class="badge auto">Automatisch vorgeschlagen – bitte prüfen</span>' : ''}</label>
    <button class="button secondary" type="button" id="suggest-translation">Übersetzung vorschlagen</button>
    <div class="grid-2"><label>Weitere englische Antworten<input id="manual-alt-en" value="${escapeAttribute(enAlts)}" placeholder="z. B. start, commence"></label><label>Weitere deutsche Antworten<input id="manual-alt-de" value="${escapeAttribute(deAlts)}" placeholder="z. B. anfangen, beginnen"></label></div>
    <div class="row"><button class="button" id="save-manual">${existing ? 'Änderungen speichern' : 'Vokabel speichern'}</button>${existing ? '<button class="button secondary" id="cancel-edit">Abbrechen</button>' : ''}</div>
    <p class="small muted">Lokale Übersetzungsvorschläge decken bewusst nur einen begrenzten Grundwortschatz ab. Unbekannte Begriffe müssen manuell bestätigt bzw. ergänzt werden.</p>
  </div>`;
}

function renderPhotoImport() {
  const ocr = state.ocr;
  return `<div class="card stack"><div><h3>Foto oder Screenshot</h3><p class="muted small">Die Texterkennung läuft im Browser. Dafür wird Tesseract.js beim ersten Einsatz aus einem CDN geladen. Es wird kein geheimer API-Schlüssel verwendet.</p></div><input id="ocr-file" type="file" accept="image/*" capture="environment"><div class="row"><button class="button" id="run-ocr" ${ocr.processing ? 'disabled' : ''}>${ocr.processing ? 'Bild wird gelesen …' : 'Bild analysieren'}</button><button class="button secondary" id="open-empty-review" ${ocr.processing ? 'disabled' : ''}>Leere Prüftabelle</button></div>${ocr.processing ? `<div><div class="small muted">OCR ${ocr.progress}%</div><div class="progressbar"><div style="width:${ocr.progress}%"></div></div></div>` : ''}${ocr.error ? `<div class="notice error">${escapeHtml(ocr.error)}</div>` : ''}${ocr.rows.length ? renderOcrReview() : ''}</div>`;
}

function renderOcrReview() {
  return `<div class="stack"><div class="notice">Bitte jede Zuordnung prüfen. Gelb markierte Zeilen waren unsicher oder unvollständig.</div><div id="ocr-rows" class="stack">${state.ocr.rows.map((row, index) => `<div class="ocr-row ${row.uncertain ? 'uncertain' : ''}" data-ocr-row="${index}"><label>Englisch<input data-ocr-en value="${escapeAttribute(row.english)}"></label><label>Deutsch<input data-ocr-de value="${escapeAttribute(row.german)}"></label><button class="button secondary" data-remove-ocr="${index}">Entfernen</button></div>`).join('')}</div><div class="row"><button class="button secondary" id="add-ocr-row">Zeile hinzufügen</button><button class="button" id="confirm-ocr-import">Geprüfte Vokabeln übernehmen</button></div></div>`;
}

function renderProgress() {
  const counts = { new: 0, difficult: 0, learning: 0, good: 0 };
  for (const v of state.vocabularies) {
    const a = masteryLevel(v.learning[DIRECTIONS.EN_DE]); const b = masteryLevel(v.learning[DIRECTIONS.DE_EN]);
    let overall = 'learning';
    if (a === 'new' && b === 'new') overall = 'new'; else if (a === 'difficult' || b === 'difficult') overall = 'difficult'; else if (a === 'good' && b === 'good') overall = 'good';
    counts[overall]++;
  }
  const today = new Date().toDateString();
  const todayActivity = state.vocabularies.reduce((sum, v) => sum + (v.history ?? []).filter(h => new Date(h.answeredAt).toDateString() === today).length, 0);
  return `<section class="stack"><div><h2>Fortschritt</h2><p class="muted">Übersicht ohne technische Detailwerte.</p></div><div class="grid-4">${stat(state.vocabularies.length, 'Vokabeln')}${stat(counts.new, 'Neu')}${stat(counts.difficult, 'Schwieriger')}${stat(counts.good, 'Gut beherrscht')}</div><div class="card"><div class="stat-number">${todayActivity}</div><div class="stat-label">Abfragen heute</div></div><div class="card stack"><div><h3>Datensicherung</h3><p class="muted small">Das Backup enthält Vokabeln, Alternativen und Lernstände in einem versionierten JSON-Format.</p></div><div class="row"><button class="button" id="export-backup">Backup exportieren</button><label class="button secondary" style="display:inline-flex;align-items:center;cursor:pointer">Backup-Datei wählen<input id="backup-file" type="file" accept="application/json,.json" class="hidden"></label></div>${state.pendingBackup ? `<div class="notice">Backup geprüft: ${state.pendingBackup.vocabularies.length} Vokabeln. Standardmäßig werden nur noch nicht vorhandene IDs ergänzt.</div><div class="row"><button class="button" id="merge-backup">Sicher zusammenführen</button><button class="button danger" id="replace-backup">Alle lokalen Daten durch Backup ersetzen</button></div>` : ''}</div></section>`;
}

function stat(number, label) { return `<div class="stat"><div class="stat-number">${number}</div><div class="stat-label">${label}</div></div>`; }

function bindCommonEvents() {
  document.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.nav; state.message = null; if (state.view !== 'add') state.editingId = null; render(); }));
  document.querySelectorAll('[data-go-add]').forEach(button => button.addEventListener('click', () => { state.view = 'add'; state.addTab = 'manual'; state.editingId = null; state.message = null; render(); }));
}

function bindViewEvents() {
  if (state.view === 'learn') bindLearnEvents();
  if (state.view === 'vocab') bindVocabularyEvents();
  if (state.view === 'add') bindAddEvents();
  if (state.view === 'progress') bindProgressEvents();
}

function bindLearnEvents() {
  const mode = document.querySelector('#learning-mode'); const direction = document.querySelector('#learning-direction');
  mode?.addEventListener('change', () => state.learning.mode = mode.value); direction?.addEventListener('change', () => state.learning.direction = direction.value);
  document.querySelector('#start-learning')?.addEventListener('click', () => {
    if (state.learning.mode === 'choice' && state.vocabularies.length < 3) { setMessage('error', 'Für Multiple Choice werden mindestens 3 Vokabeln benötigt.'); return; }
    const next = selectNextVocabulary(state.vocabularies, state.learning.direction, new Date()); state.learning.active = true; state.learning.currentId = next?.id ?? null; state.learning.feedback = null; state.message = null; render();
  });
  document.querySelector('#stop-learning')?.addEventListener('click', () => { state.learning.active = false; state.learning.feedback = null; render(); });
  document.querySelector('#answer-form')?.addEventListener('submit', async event => { event.preventDefault(); await answerCurrent(document.querySelector('#answer-input').value); });
  document.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => answerCurrent(button.dataset.choice)));
  document.querySelector('#next-question')?.addEventListener('click', () => { const next = selectNextVocabulary(state.vocabularies, state.learning.direction, new Date(), state.learning.currentId) ?? selectNextVocabulary(state.vocabularies, state.learning.direction, new Date()); state.learning.currentId = next?.id ?? null; state.learning.feedback = null; render(); });
  document.querySelector('#speak-current')?.addEventListener('click', () => { const result = speakEnglish(currentVocabulary()?.english ?? ''); if (!result.ok) setMessage('error', 'Aussprache ist in diesem Browser derzeit nicht verfügbar.'); });
}

async function answerCurrent(answer) {
  const current = currentVocabulary(); if (!current || state.learning.feedback) return;
  const evaluation = evaluateAnswer(answer, acceptedAnswers(current, state.learning.direction));
  const updated = updateProgress(current, state.learning.direction, evaluation.result, new Date());
  await repo.put(updated); replaceLocalVocabulary(updated); state.learning.feedback = evaluation; render();
}

function bindVocabularyEvents() {
  const search = document.querySelector('#vocab-search');
  search?.addEventListener('input', () => { state.search = search.value; render(); requestAnimationFrame(() => document.querySelector('#vocab-search')?.focus()); });
  document.querySelectorAll('[data-speak]').forEach(button => button.addEventListener('click', () => { const v = state.vocabularies.find(item => item.id === button.dataset.speak); const result = speakEnglish(v?.english ?? ''); if (!result.ok) setMessage('error', 'Aussprache ist in diesem Browser derzeit nicht verfügbar.'); }));
  document.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => { state.editingId = button.dataset.edit; state.view = 'add'; state.addTab = 'manual'; state.suggestion = null; render(); }));
  document.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', async () => { const v = state.vocabularies.find(item => item.id === button.dataset.delete); if (!window.confirm(`„${v.english} – ${v.german}“ wirklich löschen? Der Lernstand dieser Vokabel wird ebenfalls gelöscht.`)) return; await repo.delete(v.id); state.vocabularies = state.vocabularies.filter(item => item.id !== v.id); setMessage('success', 'Vokabel gelöscht.'); }));
}

function bindAddEvents() {
  document.querySelectorAll('[data-add-tab]').forEach(button => button.addEventListener('click', () => { state.addTab = button.dataset.addTab; state.suggestion = null; state.message = null; render(); }));
  document.querySelector('#suggest-translation')?.addEventListener('click', () => {
    const sourceLanguage = document.querySelector('#source-language').value;
    const sourceInput = document.querySelector(sourceLanguage === 'english' ? '#manual-english' : '#manual-german');
    const targetInput = document.querySelector(sourceLanguage === 'english' ? '#manual-german' : '#manual-english');
    const suggestion = suggestTranslation(sourceInput.value, sourceLanguage, state.vocabularies);
    if (!suggestion) { state.message = { kind: 'info', text: 'Für diesen Begriff gibt es keinen lokalen Vorschlag. Bitte Übersetzung manuell eintragen.' }; render(); return; }
    targetInput.value = suggestion.text; state.suggestion = { field: sourceLanguage === 'english' ? 'german' : 'english', text: suggestion.text, source: suggestion.source }; state.message = { kind: 'info', text: 'Vorschlag eingetragen. Bitte vor dem Speichern prüfen und bei Bedarf ändern.' }; renderWithManualValues(sourceLanguage, sourceInput.value, targetInput.value);
  });
  document.querySelector('#save-manual')?.addEventListener('click', saveManualVocabulary);
  document.querySelector('#cancel-edit')?.addEventListener('click', () => { state.editingId = null; state.view = 'vocab'; state.suggestion = null; render(); });
  const fileInput = document.querySelector('#ocr-file'); fileInput?.addEventListener('change', () => { state.ocr.file = fileInput.files?.[0] ?? null; });
  document.querySelector('#run-ocr')?.addEventListener('click', runOcr);
  document.querySelector('#open-empty-review')?.addEventListener('click', () => { state.ocr.rows = [{ english: '', german: '', confidence: 0, uncertain: true }]; state.ocr.error = null; render(); });
  document.querySelector('#add-ocr-row')?.addEventListener('click', () => { syncOcrRowsFromDom(); state.ocr.rows.push({ english: '', german: '', confidence: 100, uncertain: false }); render(); });
  document.querySelectorAll('[data-remove-ocr]').forEach(button => button.addEventListener('click', () => { syncOcrRowsFromDom(); state.ocr.rows.splice(Number(button.dataset.removeOcr), 1); render(); }));
  document.querySelector('#confirm-ocr-import')?.addEventListener('click', confirmOcrImport);
}

function renderWithManualValues(sourceLanguage, sourceValue, targetValue) {
  const editing = state.editingId ? state.vocabularies.find(v => v.id === state.editingId) : null; render();
  document.querySelector('#source-language').value = sourceLanguage;
  document.querySelector('#manual-english').value = sourceLanguage === 'english' ? sourceValue : targetValue;
  document.querySelector('#manual-german').value = sourceLanguage === 'german' ? sourceValue : targetValue;
  if (editing) { document.querySelector('#manual-alt-en').value = editing.alternatives?.english?.join(', ') ?? ''; document.querySelector('#manual-alt-de').value = editing.alternatives?.german?.join(', ') ?? ''; }
}

async function saveManualVocabulary() {
  const english = document.querySelector('#manual-english').value.trim(); const german = document.querySelector('#manual-german').value.trim();
  if (!english || !german) { setMessage('error', 'Englischer und deutscher Begriff müssen ausgefüllt sein.'); return; }
  const alternatives = { english: parseAlternatives(document.querySelector('#manual-alt-en').value), german: parseAlternatives(document.querySelector('#manual-alt-de').value) };
  const suggestionStillUsed = state.suggestion && normalizeAnswer(state.suggestion.text) === normalizeAnswer(state.suggestion.field === 'english' ? english : german);
  const candidate = createVocabulary({ english, german, alternatives, provenance: { input: 'manual', translation: suggestionStillUsed ? 'suggested' : 'manual', confirmedByUser: true } });
  if (state.editingId) {
    const existing = state.vocabularies.find(v => v.id === state.editingId); candidate.id = existing.id;
    const duplicate = findDuplicateCandidates(candidate, state.vocabularies.filter(v => v.id !== existing.id))[0];
    if (duplicate) {
      const action = await duplicateChoice(duplicate.existing, candidate); if (action === 'cancel' || action === 'keep') return;
      if (action === 'update') { const merged = mergeVocabularyPreservingLearning(duplicate.existing, candidate); await repo.put(merged); await repo.delete(existing.id); state.vocabularies = state.vocabularies.filter(v => v.id !== existing.id && v.id !== merged.id).concat(merged); }
      else { const updated = mergeVocabularyPreservingLearning(existing, candidate); await repo.put(updated); replaceLocalVocabulary(updated); }
    } else { const updated = mergeVocabularyPreservingLearning(existing, candidate); await repo.put(updated); replaceLocalVocabulary(updated); }
    state.editingId = null; state.suggestion = null; state.view = 'vocab'; setMessage('success', 'Vokabel aktualisiert.'); return;
  }
  const duplicate = findDuplicateCandidates(candidate, state.vocabularies)[0];
  if (duplicate) {
    const action = await duplicateChoice(duplicate.existing, candidate); if (action === 'cancel' || action === 'keep') return;
    if (action === 'update') { const merged = mergeVocabularyPreservingLearning(duplicate.existing, candidate); await repo.put(merged); replaceLocalVocabulary(merged); }
    else { await repo.put(candidate); state.vocabularies.push(candidate); }
  } else { await repo.put(candidate); state.vocabularies.push(candidate); }
  state.vocabularies.sort((a, b) => a.english.localeCompare(b.english, 'en')); state.suggestion = null; setMessage('success', 'Vokabel gespeichert.');
}

async function runOcr() {
  if (!state.ocr.file) { setMessage('error', 'Bitte zuerst ein Foto oder Bild auswählen.'); return; }
  state.ocr.processing = true; state.ocr.progress = 0; state.ocr.error = null; state.message = null; render();
  try {
    const result = await recognizeVocabularyImage(state.ocr.file, progress => { state.ocr.progress = progress; const bar = document.querySelector('.progressbar > div'); if (bar) bar.style.width = `${progress}%`; const label = document.querySelector('.progressbar')?.previousElementSibling; if (label) label.textContent = `OCR ${progress}%`; });
    state.ocr.rows = result.rows; state.ocr.rawText = result.rawText;
    if (!result.rows.length) state.ocr.error = 'Es wurden keine verwertbaren Zeilen erkannt. Öffne die Prüftabelle und trage die Werte manuell ein.';
  } catch (error) { state.ocr.error = `OCR konnte nicht ausgeführt werden: ${error.message}. Du kannst die Prüftabelle stattdessen manuell ausfüllen.`; }
  finally { state.ocr.processing = false; render(); }
}

function syncOcrRowsFromDom() {
  document.querySelectorAll('[data-ocr-row]').forEach(node => { const index = Number(node.dataset.ocrRow); state.ocr.rows[index].english = node.querySelector('[data-ocr-en]').value.trim(); state.ocr.rows[index].german = node.querySelector('[data-ocr-de]').value.trim(); });
}

async function confirmOcrImport() {
  syncOcrRowsFromDom(); const validRows = state.ocr.rows.filter(r => r.english && r.german);
  if (!validRows.length) { setMessage('error', 'Es gibt keine vollständig ausgefüllten Zeilen zum Importieren.'); return; }
  let added = 0, updated = 0, skipped = 0;
  for (const row of validRows) {
    const candidate = createVocabulary({ english: row.english, german: row.german, provenance: { input: 'photo', translation: 'photo', confirmedByUser: true } });
    const duplicate = findDuplicateCandidates(candidate, state.vocabularies)[0];
    if (duplicate) { const action = await duplicateChoice(duplicate.existing, candidate); if (action === 'cancel' || action === 'keep') { skipped++; continue; } if (action === 'update') { const merged = mergeVocabularyPreservingLearning(duplicate.existing, candidate); await repo.put(merged); replaceLocalVocabulary(merged); updated++; continue; } }
    await repo.put(candidate); state.vocabularies.push(candidate); added++;
  }
  state.vocabularies.sort((a, b) => a.english.localeCompare(b.english, 'en')); state.ocr = { file: null, processing: false, progress: 0, rows: [], error: null, rawText: '' }; setMessage('success', `${added} Vokabeln hinzugefügt, ${updated} aktualisiert, ${skipped} übersprungen.`);
}

function bindProgressEvents() {
  document.querySelector('#export-backup')?.addEventListener('click', () => { const backup = createBackup(state.vocabularies, {}); const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `vokabeltrainer-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  document.querySelector('#backup-file')?.addEventListener('change', async event => { try { const file = event.target.files?.[0]; if (!file) return; state.pendingBackup = validateBackup(JSON.parse(await file.text())); state.message = null; render(); } catch (error) { state.pendingBackup = null; setMessage('error', `Backup abgelehnt: ${error.message}`); } });
  document.querySelector('#merge-backup')?.addEventListener('click', async () => { const existingIds = new Set(state.vocabularies.map(v => v.id)); const additions = state.pendingBackup.vocabularies.filter(v => !existingIds.has(v.id)); await repo.putMany(additions); state.vocabularies.push(...additions); state.vocabularies.sort((a, b) => a.english.localeCompare(b.english, 'en')); state.pendingBackup = null; setMessage('success', `${additions.length} neue Vokabeln ergänzt. Bestehende lokale Einträge wurden nicht überschrieben.`); });
  document.querySelector('#replace-backup')?.addEventListener('click', async () => { const action = await replaceBackupChoice(state.vocabularies.length, state.pendingBackup.vocabularies.length); if (action !== 'replace') return; await repo.replaceAll(state.pendingBackup.vocabularies); state.vocabularies = [...state.pendingBackup.vocabularies]; state.pendingBackup = null; setMessage('success', 'Lokale Daten wurden durch das bestätigte Backup ersetzt.'); });
}

function acceptedAnswers(vocabulary, direction) { return direction === DIRECTIONS.EN_DE ? [vocabulary.german, ...(vocabulary.alternatives?.german ?? [])] : [vocabulary.english, ...(vocabulary.alternatives?.english ?? [])]; }
function currentVocabulary() { return state.vocabularies.find(v => v.id === state.learning.currentId) ?? null; }
function replaceLocalVocabulary(updated) { const index = state.vocabularies.findIndex(v => v.id === updated.id); if (index >= 0) state.vocabularies[index] = updated; else state.vocabularies.push(updated); }
function parseAlternatives(text) { return uniqueTerms(String(text ?? '').split(/[,;\n]/)); }
function masteryLabel(value) { return ({ new: 'Neu', learning: 'Lernen', difficult: 'Schwierig', good: 'Sicher' })[value] ?? value; }
function setMessage(kind, text) { state.message = { kind, text }; render(); }

function duplicateChoice(existing, incoming) {
  return showChoiceDialog({ title: 'Mögliches Duplikat', text: 'Eine ähnliche Vokabel ist bereits gespeichert. Wie möchtest du fortfahren?', details: `<strong>Vorhanden:</strong> ${escapeHtml(existing.english)} – ${escapeHtml(existing.german)}<br><strong>Neu:</strong> ${escapeHtml(incoming.english)} – ${escapeHtml(incoming.german)}`, visible: ['cancel', 'keep', 'update', 'new'] });
}
function replaceBackupChoice(currentCount, backupCount) { return showChoiceDialog({ title: 'Lokale Daten ersetzen?', text: 'Dieser Schritt löscht die aktuell lokal gespeicherte Sammlung und ersetzt sie vollständig durch das ausgewählte Backup.', details: `Aktuell: <strong>${currentCount}</strong> Vokabeln · Backup: <strong>${backupCount}</strong> Vokabeln`, visible: ['cancel', 'replace'] }); }

function showChoiceDialog({ title, text, details, visible }) {
  const dialog = document.querySelector('#choice-dialog'); document.querySelector('#choice-dialog-title').textContent = title; document.querySelector('#choice-dialog-text').textContent = text; document.querySelector('#choice-dialog-details').innerHTML = details;
  const map = { cancel: dialog.querySelector('button[value="cancel"]'), keep: document.querySelector('#dialog-keep'), update: document.querySelector('#dialog-update'), new: document.querySelector('#dialog-new'), replace: document.querySelector('#dialog-replace') };
  Object.entries(map).forEach(([key, button]) => button.classList.toggle('hidden', !visible.includes(key)));
  return new Promise(resolve => { const onClose = () => { dialog.removeEventListener('close', onClose); resolve(dialog.returnValue || 'cancel'); }; dialog.addEventListener('close', onClose); if (typeof dialog.showModal === 'function') dialog.showModal(); else resolve(window.confirm(text) ? (visible.includes('replace') ? 'replace' : 'update') : 'cancel'); });
}

function showFatal(error) { app.innerHTML = `<main class="main"><div class="content"><div class="card"><h1>Vokabeltrainer</h1><div class="notice error">${escapeHtml(error.message)}</div></div></div></main>`; }
function registerServiceWorker() { if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {}); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function escapeAttribute(value) { return escapeHtml(value); }
