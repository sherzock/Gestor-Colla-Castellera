import { db } from '../../db.js';
import { VERSION } from '../config.js';
import { fail, nowUtc, str } from '../util.js';
import { RateLimit, clientIp, route } from '../router.js';
import { placeOf, sendAlert } from '../errors.js';

// ---------- Suggeriments i errors ----------
// Qualsevol persona que ha entrat pot enviar una idea o dir que alguna cosa no va. És anònim: no es guarda qui ho
// envia (ni la seva adreça), només el text, la pantalla on era (sense números) i la versió de l'app. Ho veu
// l'administració a «Comptes». Se'n guarden com a molt FEEDBACK_KEEP i, si està configurat, arriba un avís sense el text.
export const FEEDBACK_KEEP = 300;
export const feedbackByIp = new RateLimit(10, 60 * 60 * 1000);

route('POST', '/api/feedback', ({ body, req }) => {
  const ip = clientIp(req);
  if (feedbackByIp.blocked(ip)) fail(429, "Massa intents. Torna-ho a provar d'aquí a una estona.");
  const kind = body.kind === 'error' ? 'error' : body.kind === 'idea' ? 'idea' : fail(400, 'Dades no vàlides');
  const message = (typeof body.message === 'string' && str(body.message, 1000)) || fail(400, 'Escriu què vols dir');
  feedbackByIp.add(ip);
  const place = typeof body.place === 'string' ? placeOf(body.place.replace(/[^\w/#:-]/g, '')) : '';
  db.prepare('INSERT INTO feedback (kind, message, place, version, created_at) VALUES (?, ?, ?, ?, ?)').run(kind, message, place, VERSION, nowUtc());
  db.prepare(`DELETE FROM feedback WHERE id NOT IN (SELECT id FROM feedback ORDER BY id DESC LIMIT ${FEEDBACK_KEEP})`).run();
  sendAlert(kind === 'error' ? "Algú ha avisat d'un error a l'app" : "Hi ha un suggeriment nou a l'app");
  return { ok: true };
});

// Els suggeriments de fa més d'un any s'esborren sols (poden portar algun nom, i ja no serveixen).
export function pruneFeedback() { db.prepare("DELETE FROM feedback WHERE created_at < datetime('now', '-365 days')").run(); }
pruneFeedback();
setInterval(pruneFeedback, 24 * 60 * 60 * 1000).unref();

route('GET', '/api/feedback', () => db.prepare('SELECT * FROM feedback ORDER BY done, id DESC').all(), 'admin');

route('PUT', '/api/feedback/:id', ({ params, body }) => {
  const done = body.done ? 1 : 0;
  if (!db.prepare('UPDATE feedback SET done = ? WHERE id = ?').run(done, params.id).changes) fail(404, 'No trobat');
  return { ok: true };
}, 'admin');

route('DELETE', '/api/feedback/:id', ({ params }) => {
  db.prepare('DELETE FROM feedback WHERE id = ?').run(params.id);
  return { ok: true };
}, 'admin');
