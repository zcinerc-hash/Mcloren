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
  self.skipWaiting();
});

// ─── Ativa e assume controle dos clientes ───
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (self.registration && self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    
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
      // ✅ BUSCA NORMALMENTE (não bloqueia)
      return event.respondWith(fetch(event.request));
    }

    event.respondWith((async () => {
      try {
        const preloadResp = await event.preloadResponse;
        if (preloadResp) return preloadResp;

        return await fetch(event.request);
      } catch (error) {
        console.warn('[SW] Fetch failed, showing offline page:', error);
        const cache = await caches.open(CACHE);
        const cachedResp = await cache.match(offlineFallbackPage);
        
        if (cachedResp) return cachedResp;

        // ✅ Fallback completo com HTML
        return new Response(`
          <!DOCTYPE html>
          <html lang="pt-PT">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>McLaren Capital - Offline</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100vh; 
                background: linear-gradient(135deg, #1B3A6B 0%, #2a5298 100%);
              }
              .container { 
                text-align: center; 
                background: white; 
                padding: 50px 30px; 
                border-radius: 12px; 
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                max-width: 400px;
              }
              h1 { color: #1B3A6B; font-size: 28px; margin-bottom: 15px; }
              p { color: #666; font-size: 16px; line-height: 1.6; }
              .icon { font-size: 64px; margin-bottom: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="icon">📵</div>
              <h1>Você está offline</h1>
              <p>Verifique sua conexão com a internet e tente novamente.</p>
            </div>
          </body>
          </html>
        `, { 
          status: 503, 
          headers: { 'Content-Type': 'text/html; charset=utf-8' } 
        });
      }
    })());
  }
});