/*
 * Service worker d'Isaac Codex (application installable).
 * - Pages : réseau d'abord, puis la coquille index.html en cache (fonctionne hors ligne).
 * - Ressources versionnées (/assets, /game-assets, /icons) : cache d'abord.
 * - API de consultation (GET) : réseau d'abord, réponse en cache si hors ligne.
 * - Profils (/api/profiles) : jamais mis en cache (données personnelles, toujours à jour).
 */
const VERSION = 'v1';
const SHELL = `isaac-codex-shell-${VERSION}`;
const STATIC = `isaac-codex-static-${VERSION}`;
const API = `isaac-codex-api-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('isaac-codex-') && ![SHELL, STATIC, API].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackUrl ?? request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(fallbackUrl ?? request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL, '/'));
  } else if (url.pathname.startsWith('/api/')) {
    if (url.pathname.startsWith('/api/profiles') || url.pathname === '/api/health' || request.headers.has('Authorization')) return;
    event.respondWith(networkFirst(request, API));
  } else if (/^\/(assets|game-assets|icons)\//.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
