// sw.js — Service Worker para cache offline (PWA)
const CACHE_NAME = 'central-v3-cache-v3';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './persistence.js',
    './ui.js',
    './demands.js',
    './report.js',
    './workload.js',
    './webhooks.js',
    './queue.js',
    './manifest.json',
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Cache first para assets locais, network first para Supabase
self.addEventListener('fetch', (e) => {
    if (e.request.url.includes('supabase.co')) {
        // Supabase: tenta rede, sem cache
        e.respondWith(fetch(e.request).catch(() => new Response('{"error":"offline"}', { headers: { 'Content-Type': 'application/json' } })));
        return;
    }
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});
