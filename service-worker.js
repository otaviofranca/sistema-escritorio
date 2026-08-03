// Service Worker simples — cacheia os arquivos da interface para abrir mais rápido
// e permitir instalação como app. Os DADOS (consultas, login) sempre vêm da rede,
// nunca do cache, para garantir que a agenda mostrada esteja sempre atualizada.

const CACHE_NAME = 'agenda-consultorio-v1';
const ARQUIVOS_ESTATICOS = [
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './manifest.json',
  './logo.png',
  './favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_ESTATICOS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c !== CACHE_NAME).map((c) => caches.delete(c)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear chamadas à API (Apps Script) — dados sempre atualizados.
  if (url.hostname.includes('script.google.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((resposta) => resposta || fetch(event.request))
  );
});
