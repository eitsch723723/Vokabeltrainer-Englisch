import { createVocabulary, DIRECTIONS } from '../domain/vocabulary.js';

const REQUIRED_COLUMNS = ['id', 'english', 'german'];

export function parseVocabularyCsv(text) {
  const rows = parseCsvRows(String(text ?? '').replace(/^\uFEFF/, ''));
  if (!rows.length) throw new Error('Die Vokabeldatei ist leer.');

  const header = rows[0].map(value => value.trim().toLowerCase());
  for (const required of REQUIRED_COLUMNS) {
    if (!header.includes(required)) throw new Error(`CSV-Spalte "${required}" fehlt.`);
  }

  const column = name => header.indexOf(name);
  const seenIds = new Set();
  const vocabularies = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (row.every(cell => !cell.trim())) continue;

    const id = cell(row, column('id'));
    const english = cell(row, column('english'));
    const german = cell(row, column('german'));

    if (!id) throw new Error(`Zeile ${rowIndex + 1}: ID fehlt.`);
    if (!english) throw new Error(`Zeile ${rowIndex + 1}: Englischer Begriff fehlt.`);
    if (!german) throw new Error(`Zeile ${rowIndex + 1}: Deutsche Übersetzung fehlt.`);
    if (seenIds.has(id)) throw new Error(`Zeile ${rowIndex + 1}: Doppelte ID "${id}".`);
    seenIds.add(id);

    vocabularies.push(createVocabulary({
      id,
      english,
      german,
      alternatives: {
        english: splitAlternatives(cell(row, column('english_alternatives'))),
        german: splitAlternatives(cell(row, column('german_alternatives')))
      },
      provenance: {
        input: 'repository-csv',
        translation: 'repository-csv',
        confirmedByUser: true
      }
    }));
  }

  return vocabularies;
}

export function mergeRepositoryVocabulary(source, cached) {
  const cachedById = new Map((cached ?? []).map(vocabulary => [vocabulary.id, vocabulary]));

  return source.map(incoming => {
    const existing = cachedById.get(incoming.id);
    if (!existing) return incoming;

    return {
      ...incoming,
      learning: {
        [DIRECTIONS.EN_DE]: existing.learning[DIRECTIONS.EN_DE],
        [DIRECTIONS.DE_EN]: existing.learning[DIRECTIONS.DE_EN]
      },
      history: existing.history ?? [],
      createdAt: existing.createdAt ?? incoming.createdAt,
      updatedAt: incoming.updatedAt
    };
  });
}

export async function fetchVocabularyCsv(url, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch ist nicht verfügbar.');
  const response = await fetchImpl(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Vokabeldatei konnte nicht geladen werden (HTTP ${response.status}).`);
  return parseVocabularyCsv(await response.text());
}

function splitAlternatives(value) {
  return String(value ?? '').split('|').map(item => item.trim()).filter(Boolean);
}

function cell(row, index) {
  return index < 0 ? '' : String(row[index] ?? '').trim();
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error('CSV enthält ein nicht geschlossenes Anführungszeichen.');
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}
