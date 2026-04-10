// ─────────────────────────────────────────────────────────────────────────────
// SignFlow — Service Worker para Display (Raspberry Pi)
// Cache de mídia (vídeos, banners, logo) e dados da API para performance
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_VERSION = "signflow-v2";
const API_CACHE = "signflow-api-v2";
const MEDIA_CACHE = "signflow-media-v2";

// Padrões de URL para cache
const API_PATTERNS = ["/api/v1/display/", "/api/v1/weather/", "/api/v1/rss/"];
const MEDIA_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".webp",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".svg",
];

// ── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[SW] Instalado", CACHE_VERSION);
  self.skipWaiting();
});

// ── Activate — limpa caches antigos ─────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (k) => k !== CACHE_VERSION && k !== API_CACHE && k !== MEDIA_CACHE
          )
          .map((k) => {
            console.log("[SW] Removendo cache antigo:", k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
  console.log("[SW] Ativado", CACHE_VERSION);
});

// ── Fetch — estratégias de cache ────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // Apenas GET
  if (event.request.method !== "GET") return;

  // 1. Mídia (vídeos, imagens) → Cache-First (download uma vez, serve local)
  if (isMediaUrl(url)) {
    event.respondWith(cacheFirst(event.request, MEDIA_CACHE));
    return;
  }

  // 2. API display/weather → Stale-While-Revalidate (serve cache, atualiza em bg)
  if (isApiUrl(path)) {
    event.respondWith(staleWhileRevalidate(event.request, API_CACHE));
    return;
  }

  // 3. Assets estáticos Next.js (_next/static) → Cache-First
  if (path.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(event.request, CACHE_VERSION));
    return;
  }
});

// ── Mensagens do client (invalidação de cache via WebSocket) ────────────────
self.addEventListener("message", (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case "INVALIDATE_API":
      // Limpa cache da API para forçar refetch
      caches.open(API_CACHE).then((cache) => {
        cache.keys().then((keys) => {
          const toDelete = payload?.pattern
            ? keys.filter((k) => k.url.includes(payload.pattern))
            : keys;
          toDelete.forEach((k) => cache.delete(k));
          console.log("[SW] API cache invalidado:", toDelete.length, "entries");
        });
      });
      break;

    case "INVALIDATE_MEDIA":
      // Limpa cache de mídia (quando conteúdo muda)
      caches.delete(MEDIA_CACHE).then(() => {
        console.log("[SW] Media cache limpo");
      });
      break;

    case "PRECACHE_MEDIA":
      // Pré-download de mídias (vídeos e banners)
      if (payload?.urls?.length) {
        event.waitUntil(precacheMedia(payload.urls));
      }
      break;

    case "CACHE_STATUS":
      // Responde com status do cache
      event.waitUntil(
        getCacheStatus().then((status) => {
          event.source.postMessage({ type: "CACHE_STATUS_RESPONSE", payload: status });
        })
      );
      break;
  }
});

// ── Estratégias ─────────────────────────────────────────────────────────────

// Cache-First: serve do cache, fallback para rede
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      // Clone e cache
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline e sem cache → erro genérico
    return new Response("Offline", { status: 503 });
  }
}

// Stale-While-Revalidate: serve cache imediato, atualiza em background
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Sempre tenta atualizar em background
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Se tem cache, retorna imediato
  if (cached) {
    return cached;
  }

  // Se não tem cache, espera a rede
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return new Response('{"error":"offline"}', {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

// Pré-cacheia lista de URLs de mídia
async function precacheMedia(urls) {
  const cache = await caches.open(MEDIA_CACHE);
  let cached = 0;
  let downloaded = 0;

  for (const url of urls) {
    try {
      const existing = await cache.match(url);
      if (existing) {
        cached++;
        continue;
      }

      const response = await fetch(url, { mode: "cors" });
      if (response.ok) {
        await cache.put(url, response);
        downloaded++;
        console.log("[SW] Pre-cached:", url.split("/").pop());
      }
    } catch (err) {
      console.warn("[SW] Falha ao pre-cachear:", url.split("/").pop());
    }
  }

  console.log(
    `[SW] Pre-cache completo: ${downloaded} baixados, ${cached} já em cache de ${urls.length} total`
  );

  // Notifica clients
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({
      type: "PRECACHE_COMPLETE",
      payload: { downloaded, cached, total: urls.length },
    });
  });
}

// Status do cache
async function getCacheStatus() {
  const result = {};
  for (const name of [CACHE_VERSION, API_CACHE, MEDIA_CACHE]) {
    try {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      result[name] = keys.length;
    } catch {
      result[name] = 0;
    }
  }
  return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isMediaUrl(url) {
  const path = url.pathname.toLowerCase();
  // MinIO / S3 media files
  if (url.pathname.includes("signflow-media")) return true;
  // Extensões de mídia
  return MEDIA_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function isApiUrl(path) {
  return API_PATTERNS.some((p) => path.includes(p));
}
