import { migrateVocabulary } from '../domain/migrations.js';

const DB_NAME = 'vokabeltrainer-englisch';
const DB_VERSION = 1;
const VOCAB_STORE = 'vocabularies';
const META_STORE = 'meta';

export class IndexedDbVocabularyRepository {
  constructor() {
    this.dbPromise = null;
  }

  open() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(VOCAB_STORE)) db.createObjectStore(VOCAB_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB konnte nicht geöffnet werden.'));
    });
    return this.dbPromise;
  }

  async list() {
    const db = await this.open();
    const rows = await requestResult(db.transaction(VOCAB_STORE).objectStore(VOCAB_STORE).getAll());
    return rows.map(migrateVocabulary).sort((a, b) => a.english.localeCompare(b.english, 'en'));
  }

  async get(id) {
    const db = await this.open();
    const row = await requestResult(db.transaction(VOCAB_STORE).objectStore(VOCAB_STORE).get(id));
    return row ? migrateVocabulary(row) : null;
  }

  async put(vocabulary) {
    const db = await this.open();
    await transactionDone(db.transaction(VOCAB_STORE, 'readwrite'), store => store.put(vocabulary));
    return vocabulary;
  }

  async putMany(vocabularies) {
    const db = await this.open();
    const tx = db.transaction(VOCAB_STORE, 'readwrite');
    const store = tx.objectStore(VOCAB_STORE);
    vocabularies.forEach(v => store.put(v));
    await transactionCompletion(tx);
  }

  async delete(id) {
    const db = await this.open();
    await transactionDone(db.transaction(VOCAB_STORE, 'readwrite'), store => store.delete(id));
  }

  async replaceAll(vocabularies) {
    const db = await this.open();
    const tx = db.transaction(VOCAB_STORE, 'readwrite');
    const store = tx.objectStore(VOCAB_STORE);
    store.clear();
    vocabularies.forEach(v => store.put(v));
    await transactionCompletion(tx);
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Datenbankzugriff fehlgeschlagen.'));
  });
}

function transactionDone(tx, action) {
  return new Promise((resolve, reject) => {
    action(tx.objectStore(VOCAB_STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Datenbanktransaktion fehlgeschlagen.'));
    tx.onabort = () => reject(tx.error ?? new Error('Datenbanktransaktion wurde abgebrochen.'));
  });
}

function transactionCompletion(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Datenbanktransaktion fehlgeschlagen.'));
    tx.onabort = () => reject(tx.error ?? new Error('Datenbanktransaktion wurde abgebrochen.'));
  });
}
