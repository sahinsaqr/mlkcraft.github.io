// Torna Hesap service worker. Kapsamı yalnızca /araclar/torna/ — sitenin geri kalanına dokunmaz.
const VERSION = 'v1';
const CACHE = 'torna-hesap-' + VERSION;
const BASE = '/araclar/torna/';
const PRECACHE = [BASE, BASE + 'manifest.json', BASE + 'icon-180.png', BASE + 'icon-192.png', BASE + 'icon-512.png'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@500;600;700&display=swap';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

async function precacheFonts(cache) {
  const res = await fetch(FONT_CSS);
  if (!res.ok) return;
  await cache.put(FONT_CSS, res.clone());
  const css = await res.text();
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);
  await Promise.all(urls.map(u => fetch(u).then(r => r.ok && cache.put(u, r)).catch(() => {})));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map(u => new Request(u, {cache: 'reload'})));
    await precacheFonts(cache).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('torna-hesap-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: önbellekten ver, yoksa indirip sakla.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, {ignoreVary: true});
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Yalnızca bu aracın kendi dosyaları; diğer her istek tarayıcıya bırakılır.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // Ağ öncelikli: çevrimiçiyken her zaman en yeni sürüm gelir, çevrimdışıyken önbellek kullanılır.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const isPage = req.mode === 'navigate';
    const key = isPage ? BASE : req;
    try {
      const res = await fetch(req, {cache: 'no-cache'});
      if (res.ok) cache.put(key, res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(key, {ignoreSearch: isPage});
      if (hit) return hit;
      throw e;
    }
  })());
});
