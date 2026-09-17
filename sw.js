const CACHE = 'vokabeltrainer-v6';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest', './icon.svg',
  './data/vocabulary.csv',
  './src/app.js', './src/domain/vocabulary.js', './src/domain/migrations.js',
  './src/repository/indexedDbVocabularyRepository.js',
  './src/services/answerEvaluationService.js', './src/services/learningEngine.js',
  './src/services/clozeService.js', './src/services/speechService.js', './src/services/multipleChoiceService.js',
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

  // Use network-first for both vocabulary data and the app shell. This avoids
  // serving an old cached app.js after a deployment while preserving offline use.
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      const cache = await caches.open(CACHE);
      await cache.put(request, copy);
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw error;
  }
}
