// ponytail: só rede com fallback pro cache; offline de verdade vem na Fase 2
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone()
    caches.open('frango').then(c => c.put(e.request, copy))
    return r
  }).catch(() => caches.match(e.request)))
})
