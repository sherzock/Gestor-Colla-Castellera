// Appinya't: servidor. Cada secció és a server/ (utilitats, router, rutes…); aquí només es serveix per HTTP.
import './server/routes/app.js';
import './server/backups.js';
import './server/routes/auth.js';
import './server/routes/two-factor.js';
import './server/routes/admins.js';
import './server/sql.js';
import './server/routes/people.js';
import './server/routes/events.js';
import './server/routes/roles.js';
import './server/attendance.js';
import './server/routes/payments.js';
import './server/routes/attendance.js';
import './server/routes/fields.js';
import './server/routes/guests.js';
import './server/routes/castells.js';
import './server/routes/news.js';
import './server/notifications.js';
import './server/routes/templates.js';
import './server/history.js';
import './server/routes/stats.js';
import './server/routes/tecnica.js';
import './server/routes/calendar.js';
import './server/routes/feedback.js';
import http from 'node:http';
import { translate } from './public/i18n.js';
import { COLLA_NAME, PORT } from './server/config.js';
import { MIME, sendBody, serveStatic } from './server/static.js';
import { HttpError, NEWS_IMAGE_BODY, can, fail } from './server/util.js';
import { currentUser, routes } from './server/router.js';
import { logError } from './server/errors.js';
import { AUDIT_READS, AUDIT_SKIP, PEOPLE_ROUTE, audit, auditTarget } from './server/audit.js';
import { NO_DATA_CHANGE, dataChanged, encodedMemo, warmCaches } from './server/cache.js';

// ---------- Servidor HTTP ----------
// Capçaleres de seguretat per a totes les respostes: res de fora, ni scripts ni marcs d'altres webs.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
// Per instal·lar l'app al mòbil: porta el nom de la colla, per això no és un fitxer.
function sendManifest(req, res) {
  const icon = (src, size, purpose = 'any') => ({ src, sizes: `${size}x${size}`, type: 'image/png', purpose });
  sendBody(req, res, 200, { 'Content-Type': MIME['.webmanifest'], 'Cache-Control': 'no-cache' }, JSON.stringify({
    name: `${COLLA_NAME} · Appinya't`, short_name: COLLA_NAME, lang: 'ca', start_url: '/', scope: '/', display: 'standalone',
    background_color: '#f6f5f3', theme_color: '#9b1c2c',
    icons: [icon('/icons/icon-192.png', 192), icon('/icons/icon-512.png', 512), icon('/icons/icon-maskable-512.png', 512, 'maskable')],
  }));
}

// Una petició massa gran es llegeix fins al final sense guardar-la i es respon 413: si es tallés la connexió, l'app
// diria «Sense connexió» en lloc de dir què passa. Si és enorme, sí que es talla.
const BODY_MAX = 1_000_000;
function readBody(req, max = BODY_MAX) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 20 * max) { reject(new HttpError(413, 'Petició massa gran')); req.destroy(); return; }
      if (size <= max) chunks.push(c);
    });
    req.on('end', () => {
      if (size > max) return reject(new HttpError(413, 'Petició massa gran'));
      if (!chunks.length) return resolve({});
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* es rebutja a sota */ }
      // L'app sempre envia un objecte: res de llistes, textos ni «null» (petarien les rutes).
      if (body && typeof body === 'object' && !Array.isArray(body)) resolve(body);
      else reject(new HttpError(400, 'JSON no vàlid'));
    });
    req.on('error', reject);
  });
}

// Una connexió que envia la petició a poc a poc no pot quedar oberta indefinidament.
const server = http.createServer({ headersTimeout: 15_000, requestTimeout: 30_000, connectionsCheckingInterval: 5_000 }, async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400).end(); return; }
  if (url.pathname === '/manifest.webmanifest') return sendManifest(req, res);
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

  const send = (status, data) => {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    const encoded = encodedMemo.get(data);
    if (encoded) sendBody(req, res, status, headers, (encoded.json ??= Buffer.from(JSON.stringify(data))), encoded);
    else sendBody(req, res, status, headers, JSON.stringify(data));
  };
  try {
    const match = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!match) fail(404, 'Ruta no trobada');
    // Les peticions que canvien dades només poden venir de la mateixa app (no d'una altra web).
    if (req.method !== 'GET') {
      if (req.headers.origin) {
        let host = '';
        try { host = new URL(req.headers.origin).host; } catch { /* origen no vàlid */ }
        if (host !== req.headers.host) fail(403, 'Petició no permesa');
      }
      // Els navegadors diuen d'on ve la petició; i l'app sempre envia JSON (un formulari d'una altra web no pot).
      if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Petició no permesa');
      if (req.headers['content-length'] !== '0' && (req.headers['content-length'] || req.headers['transfer-encoding'])
        && !String(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Petició no permesa');
    }
    const values = url.pathname.match(match.re).slice(1);
    const params = Object.fromEntries(match.keys.map((k, i) => [k, values[i]]));
    const user = currentUser(req);
    if (match.auth !== 'public' && !user) fail(401, 'Cal iniciar sessió');
    if (match.auth !== 'public' && match.auth !== 'user' && !can(user, match.auth)) {
      fail(403, user.role === 'admin' ? 'El teu compte no té permís per fer això' : 'Només per a administradors');
    }
    // Només les imatges de l'altaveu passen d'aquí, i la ruta ja ha comprovat qui les envia.
    const body = req.method === 'GET' ? {} : await readBody(req, url.pathname === '/api/announcements/images' ? NEWS_IMAGE_BODY : BODY_MAX);
    // Abans del canvi: si s'esborra, després ja no se'n sabria el nom.
    const audited = user?.mode === 'admin' && (req.method === 'GET' ? AUDIT_READS.has(match.pattern) : !AUDIT_SKIP.has(match.pattern));
    const target = audited ? auditTarget(match.pattern, params) : null;
    let result;
    try { result = await match.handler({ req, res, params, body, user, query: url.searchParams }); }
    finally { if (req.method !== 'GET' && !NO_DATA_CHANGE.has(url.pathname)) { dataChanged(url.pathname); warmCaches(); } }
    if (audited) audit(user, `${req.method} ${match.pattern}`, target ?? (PEOPLE_ROUTE.test(match.pattern) ? (result?.id ? `#${result.id}` : null) : result?.title ?? result?.name ?? null));
    if (result !== undefined) send(200, result);
  } catch (err) {
    const lang = ['es', 'en'].includes(req.headers['x-lang']) ? req.headers['x-lang'] : 'ca';
    if (err instanceof HttpError) send(err.status, { error: translate(lang, err.message, err.params), ...err.extra });
    else if (String(err.message).includes('constraint')) send(400, { error: translate(lang, 'Dades no vàlides') });
    else {
      console.error(err);
      logError('server', err.message, err.stack, `${req.method} ${url.pathname}`);
      send(500, { error: translate(lang, 'Error intern del servidor') });
    }
  }
});

server.listen(PORT, () => {
  console.log(`${COLLA_NAME} → http://localhost:${PORT}`);
  warmCaches(0);
});
