import { db } from '../db.js';
import { COLLA_NAME } from './config.js';
import { fail, nowUtc } from './util.js';
import { RateLimit, clientIp, route } from './router.js';

// ---------- Errors ----------
// Es guarden agrupats (mateix missatge al mateix lloc = una línia amb un comptador) i, si hi ha ALERT_WEBHOOK, el primer
// cop que surt un error nou s'avisa (com a molt un avís cada 10 minuts). El text va en pla: va bé amb ntfy.sh.
export const ERRORS_KEEP = 200;
export const ALERT_WEBHOOK = process.env.ALERT_WEBHOOK || '';
export const ALERT_EVERY_MS = 10 * 60 * 1000;
export let lastAlert = 0;
// Els números dels camins (/api/castells/12) no diuen res i farien una línia per a cada castell.
export const placeOf = (p) => String(p || '').replace(/\/\d+(?=\/|$)/g, '/:id').slice(0, 120);
export function logError(kind, message, detail = null, place = '') {
  try {
    const msg = String(message || 'Error').slice(0, 300);
    const at = nowUtc();
    const known = db.prepare('SELECT id FROM error_log WHERE kind = ? AND message = ? AND place = ?').get(kind, msg, placeOf(place));
    if (known) db.prepare('UPDATE error_log SET count = count + 1, last_at = ?, detail = COALESCE(?, detail) WHERE id = ?').run(at, detail ? String(detail).slice(0, 2000) : null, known.id);
    else {
      db.prepare('INSERT INTO error_log (kind, message, place, detail, first_at, last_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(kind, msg, placeOf(place), detail ? String(detail).slice(0, 2000) : null, at, at);
      db.prepare(`DELETE FROM error_log WHERE id NOT IN (SELECT id FROM error_log ORDER BY last_at DESC LIMIT ${ERRORS_KEEP})`).run();
      sendAlert(`${kind === 'client' ? 'Error en un mòbil' : 'Error al servidor'}: ${msg}${place ? ` (${placeOf(place)})` : ''}`);
    }
  } catch (err) { console.error('No s\'ha pogut desar l\'error:', err.message); }
}
export function sendAlert(text) {
  if (!ALERT_WEBHOOK || Date.now() - lastAlert < ALERT_EVERY_MS) return;
  lastAlert = Date.now();
  fetch(ALERT_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8', Title: `Appinya't · ${COLLA_NAME}`.replace(/[^\x20-\x7e]/g, '') },
    body: `${COLLA_NAME}: ${text}`, signal: AbortSignal.timeout(10_000) }).catch((err) => console.error('No s\'ha pogut avisar:', err.message));
}
process.on('unhandledRejection', (err) => { console.error(err); logError('server', err?.message || String(err), err?.stack); });

// Errors que es veuen als mòbils (els envia l'app tota sola). Sense identificar ningú, i amb límit per adreça.
export const clientErrorsByIp = new RateLimit(30, 15 * 60 * 1000);
route('POST', '/api/client-errors', ({ body, req }) => {
  const ip = clientIp(req);
  if (clientErrorsByIp.blocked(ip)) return { ok: true };
  clientErrorsByIp.add(ip);
  if (typeof body.message !== 'string' || !body.message.trim()) fail(400, 'Dades no vàlides');
  logError('client', body.message, typeof body.stack === 'string' ? body.stack : null, typeof body.place === 'string' ? body.place.replace(/[^\w/#:-]/g, '') : '');
  return { ok: true };
}, 'public');

route('GET', '/api/errors', () => db.prepare('SELECT * FROM error_log ORDER BY last_at DESC').all(), 'admin');
route('DELETE', '/api/errors', () => { db.prepare('DELETE FROM error_log').run(); return { ok: true }; }, 'admin');
