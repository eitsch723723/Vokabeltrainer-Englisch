const CACHE = 'vokabeltrainer-v1';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest', './icon.svg',
  './src/app.js', './src/domain/vocabulary.js', './src/domain/migrations.js',
  './src/repository/indexedDbVocabularyRepository.js',
  './src/services/answerEvaluationService.js', './src/services/learningEngine.js',
  './src/services/duplicateService.js', './src/services/translationService.js',
  './src/services/speechService.js', './src/services/multipleChoiceService.js',
  './src/services/backupService.js', './src/services/importService.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
