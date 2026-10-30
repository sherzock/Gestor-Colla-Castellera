// Service worker: l'app s'instal·la al mòbil i, sense connexió, mostra l'últim que s'hi ha vist (sessions, castells i
// alineacions). Sempre es prova primer la xarxa: amb connexió no es veu mai res antic.
// En sortir o canviar de persona, l'app esborra les dades desades (OFFLINE_DATA) d'aquest dispositiu.
// També rep els avisos al mòbil: l'avís arriba buit i el text es demana a l'app (veure push.js).
const VERSION = 2;
const SHELL = `colla-app-${VERSION}`;
const DATA = 'colla-dades';

// Tot el que cal per obrir l'app sense connexió (una prova comprova que no en falta cap fitxer).
const FILES = ['/', '/index.html', '/style.css', '/theme.js', '/app.js', '/castell.js', '/editor.js', '/export.js',
  '/i18n.js', '/import.js', '/muntador.js', '/planning.js', '/privacy.js', '/zoom.js', '/ui/accounts.js', '/ui/calendar.js',
  '/ui/castell-form.js', '/ui/core.js', '/ui/event.js', '/ui/login.js', '/ui/news.js', '/ui/notifications.js',
  '/ui/people.js', '/ui/sessions.js', '/ui/shell.js', '/ui/stats.js', '/ui/templates.js', '/ui/timeline.js', '/ui/viewer.js',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon.svg', '/icons/mark.svg'];

// Només es desen les respostes que calen per veure sessions i castells; mai còpies de seguretat, calendaris, etc.
const SAVED_API = /^\/api\/(config|me|events|events\/\d+|castells\/\d+(\/history|\/prep)?|templates|announcements)$/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('colla-app-') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Xarxa primer; si no n'hi ha, el que hi hagi desat. Les respostes desades porten l'hora en què es van desar.
async function networkFirst(request, cacheName, { stamp = false, fallback = null } = {}) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const copy = res.clone();
      if (stamp) {
        const headers = new Headers(copy.headers);
        headers.set('X-Saved-At', new Date().toISOString());
        const body = await copy.blob();
        (await caches.open(cacheName)).put(request, new Response(body, { status: copy.status, headers }));
      } else (await caches.open(cacheName)).put(request, copy);
    }
    return res;
  } catch (err) {
    const saved = (await caches.match(request, { cacheName })) || (fallback && (await caches.match(fallback, { cacheName })));
    if (saved) return saved;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (SAVED_API.test(url.pathname)) e.respondWith(networkFirst(req, DATA, { stamp: true }));
    return;
  }
  // Les adreces de l'app tornen sempre la pàgina principal.
  e.respondWith(networkFirst(req, SHELL, { fallback: req.mode === 'navigate' ? '/' : null }));
});

// Avís al mòbil: es recullen els missatges de la bústia d'aquest mòbil i es mostren. Si no n'hi ha cap (ja s'havien
// recollit), se'n mostra un de general: els navegadors obliguen a ensenyar alguna cosa per cada avís.
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    const sub = await self.registration.pushManager.getSubscription();
    let messages = [];
    try {
      const res = await fetch('/api/push/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub?.endpoint }) });
      messages = (await res.json()).messages || [];
    } catch { /* sense connexió */ }
    if (!messages.length) {
      const name = await fetch('/api/config').then((r) => r.json()).then((c) => c.collaName).catch(() => null);
      messages = [{ title: name || 'Colla', body: null, url: '' }];
    }
    await Promise.all(messages.map((m) => self.registration.showNotification(m.title, {
      body: m.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: m.url || 'colla', data: { url: m.url || '' },
    })));
  })());
});

// En tocar l'avís s'obre l'app on toca (o es fa servir la finestra que ja hi havia oberta).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(`/${e.notification.data?.url || ''}`, self.location.origin).href;
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = open.find((c) => new URL(c.url).origin === self.location.origin);
    if (win) { await win.focus(); return win.navigate(target).catch(() => {}); }
    return self.clients.openWindow(target);
  })());
});
