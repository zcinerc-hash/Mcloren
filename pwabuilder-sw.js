// ─── McLaren Service Worker com suporte offline e preload ───

const CACHE = "mclaren-cache-v3"; // incrementa versão para invalidar cache antigo
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
  self.skipWaiting();
});

// ─── Ativa e assume controle dos clientes ───
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (self.registration && self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }

    // limpa todos os caches antigos
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));

    await self.clients.claim();
  })());
});

// ─── Intercepta navegações (network-first sem cache de HTML) ───
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
      return; // deixa o navegador lidar normalmente
    }

    event.respondWith((async () => {
      try {
        const preloadResp = await event.preloadResponse;
        if (preloadResp) return preloadResp;

        // busca sempre da rede primeiro, sem cachear HTML
        return await fetch(event.request);
      } catch (error) {
        console.warn('[SW] Network failed, showing offline page:', error);
        const cache = await caches.open(CACHE);
        const cachedResp = await cache.match(offlineFallbackPage);
        if (cachedResp) return cachedResp;

        return new Response(`
          <!DOCTYPE html>
          <html lang="pt-PT">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>McLaren Capital - Offline</title>
            <style>
              body { font-family: sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; background:#2a5298; }
              .container { background:white; padding:30px; border-radius:12px; text-align:center; }
              h1 { color:#1B3A6B; margin-bottom:10px; }
              p { color:#666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Você está offline</h1>
              <p>Verifique sua conexão e tente novamente.</p>
            </div>
          </body>
          </html>
        `, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
  }
});
