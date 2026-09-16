const CACHE = 'vokabeltrainer-v3';
const VOCABULARY_PATH = new URL('./data/vocabulary.csv', self.registration.scope).pathname;
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest', './icon.svg',
  './data/vocabulary.csv',
  './src/app.js', './src/domain/vocabulary.js', './src/domain/migrations.js',
  './src/repository/indexedDbVocabularyRepository.js',
  './src/services/answerEvaluationService.js', './src/services/learningEngine.js',
  './src/services/speechService.js', './src/services/multipleChoiceService.js',
  './src/services/csvVocabularyService.js', './src/services/progressBackupService.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === VOCABULARY_PATH) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match('./index.html'))));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}
