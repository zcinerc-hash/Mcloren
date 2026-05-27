// ─── McLaren Service Worker com suporte offline e preload ───

const CACHE = "mclaren-cache-v1";
const offlineFallbackPage = "/offline.html";

// ─── Mensagem para ativar imediatamente ───
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ─── Instala e adiciona a página offline ao cache ───
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.add(offlineFallbackPage))
      .catch((error) => {
        console.warn('[SW] Offline page failed to cache:', error);
      })
  );
  self.skipWaiting(); // ativação mais rápida
});

// ─── Ativa e assume controle dos clientes ───
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // habilita navigation preload
    if (self.registration && self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    
    // limpa caches antigos
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name !== CACHE)
        .map(name => caches.delete(name))
    );
    
    await self.clients.claim();
  })());
});

// ─── Intercepta navegações ───
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    const url = new URL(event.request.url);

    // ⚠️ Não intercepta login nem chamadas externas
    if (
      url.pathname.includes('/auth.html') ||
      url.hostname.includes('firebaseapp.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com')
    ) {
      return;
    }

    event.respondWith((async () => {
      try {
        // espera o preloadResponse corretamente
        const preloadResp = await event.preloadResponse;
        if (preloadResp) return preloadResp;

        // tenta buscar da rede
        return await fetch(event.request);
      } catch (error) {
        // fallback offline
        console.warn('[SW] Fetch failed, showing offline page:', error);
        const cache = await caches.open(CACHE);
        const cachedResp = await cache.match(offlineFallbackPage);
        return cachedResp || new Response('Offline', { status: 503 });
      }
    })());
  }
});