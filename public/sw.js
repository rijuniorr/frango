// Só guarda os arquivos do PRÓPRIO app (pra abrir rápido/sem rede). Supabase e fotos nunca passam por aqui.
const CACHE = 'frango-v7'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k) // limpa caches antigos (inclusive o que guardava fotos)
  await self.clients.claim()
})()))
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  // rede primeiro (sempre a versão nova), cache só se estiver sem internet
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)) }
    return r
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./'))))
})
