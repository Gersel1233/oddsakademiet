/* ============================================================
   Spiis Admin – service worker
   Modtager push-beskeder og åbner admin ved tryk.

   OM CACHING: admin skal ALTID køre nyeste udgave – derfor spørger
   vi altid nettet FØRST. Men falder wifi'et ud i køkkenet midt i en
   vagt, må skærmen ikke bare blive hvid. Derfor gemmer vi en kopi af
   selve siden, og bruger den KUN når nettet ikke svarer. Data hentes
   aldrig fra kopien – dem henter appen selv, og siger tydeligt fra,
   hvis den er offline.
   ============================================================ */

const SKAL = 'spiis-skal-v1';
const SKALFILER = [
  '/admin.html', '/css/admin.css', '/js/store.js', '/js/admin.js',
  '/js/config.js', '/assets/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SKAL)
      .then((c) => c.addAll(SKALFILER))
      .catch(() => { /* kan den ikke hentes nu, prøver vi igen ved næste besøg */ })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((navne) => Promise.all(navne.filter((n) => n !== SKAL).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

/* Nettet først – altid. Kopien er kun et sikkerhedsnet. */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* kun vores egne filer – aldrig databasen, den skal appen selv styre */
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) return;

  e.respondWith(
    fetch(req)
      .then((svar) => {
        if (svar && svar.ok && SKALFILER.some((f) => url.pathname.endsWith(f.replace('/', '')))) {
          const kopi = svar.clone();
          caches.open(SKAL).then((c) => c.put(req, kopi)).catch(() => { /* fyldt disk */ });
        }
        return svar;
      })
      .catch(() => caches.match(req).then((fundet) => fundet
        || caches.match('/admin.html')
        || Response.error())),
  );
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { /* tom besked */ }
  const title = data.title || 'Spiis Admin';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'Der er nyt i jeres overblik.',
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    tag: data.tag || undefined,
    vibrate: [180, 60, 180],
    data: { url: '/admin.html' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.includes('/admin')) return c.focus();
    }
    return self.clients.openWindow('/admin.html');
  }));
});
