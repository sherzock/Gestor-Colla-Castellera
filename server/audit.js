import { db } from '../db.js';
import { castellName } from '../public/castell.js';
import { COLLA_CODE, DEMO, PRIVACY_CONTACT } from './config.js';
import { nowUtc } from './util.js';
import { route } from './router.js';
import { ALERT_WEBHOOK } from './errors.js';
import { OFFSITE } from './backups.js';
import { minorsWithoutConsent } from './sql.js';

// ---------- Registre de canvis ----------
// Què ha fet cada compte d'administració, amb una etiqueta llegible de l'element (la sessió, el castell…) que es
// calcula abans del canvi: així també es veu què s'ha esborrat. Es guarda un any.
export const AUDIT_SKIP = new Set(['/api/logout', '/api/mode', '/api/push/subscribe', '/api/push/unsubscribe', '/api/push/inbox', '/api/client-errors',
  '/api/announcements/images', '/api/directory', '/api/identify', '/api/login', '/api/me/2fa/setup']);
export const AUDIT_DAYS = 365;
export function audit(account, action, target = null) {
  try {
    db.prepare('INSERT INTO audit_log (at, admin_id, account, action, target) VALUES (?, ?, ?, ?, ?)')
      .run(nowUtc(), account.admin_id ?? null, String(account.name || '').slice(0, 60), action, target ? String(target).slice(0, 120) : null);
  } catch (err) { console.error('No s\'ha pogut apuntar al registre:', err.message); }
}
export function pruneAudit() {
  db.prepare(`DELETE FROM audit_log WHERE at < datetime('now', '-${AUDIT_DAYS} days')`).run();
}
pruneAudit();
setInterval(pruneAudit, 24 * 60 * 60 * 1000).unref();
// Etiqueta de l'element que es toca, a partir de la ruta. De les persones no es guarda el nom: el registre es queda
// un any i qui demana que l'esborrin no hi ha de continuar sortint (l'app el mostra mentre la persona existeixi).
export const PEOPLE_ROUTE = /^\/api\/people(\/|$)/;
export function auditTarget(pattern, params) {
  try { return auditLabel(pattern, params); } catch { return null; }
}
export function auditLabel(pattern, params) {
  const one = (sql, id) => (id == null ? undefined : db.prepare(sql).get(id));
  const eventLabel = (id) => { const e = one('SELECT title, date FROM events WHERE id = ?', id); return e ? `${e.title} (${e.date})` : null; };
  if (params.id && pattern.startsWith('/api/events/')) return eventLabel(params.id);
  if (params.id && pattern.startsWith('/api/castells/')) {
    const c = one('SELECT * FROM castells WHERE id = ?', params.id);
    return c ? `${castellName(c)} · ${eventLabel(c.event_id)}` : null;
  }
  if (PEOPLE_ROUTE.test(pattern)) return Number.isInteger(Number(params.id)) && params.id ? `#${Number(params.id)}` : null;
  if (params.id && pattern.startsWith('/api/admins/')) return one('SELECT name FROM admins WHERE id = ?', params.id)?.name ?? null;
  if (params.id && pattern.startsWith('/api/announcements/')) return one('SELECT title FROM announcements WHERE id = ?', params.id)?.title ?? null;
  if (params.id && pattern.startsWith('/api/guests/')) return eventLabel(one('SELECT event_id FROM event_guests WHERE id = ?', params.id)?.event_id);
  if (params.id && pattern.startsWith('/api/fields/')) return eventLabel(one('SELECT event_id FROM event_fields WHERE id = ?', params.id)?.event_id);
  if (params.name) return params.name;
  return null;
}

// Què falta per tenir l'app a punt (per a la llista «Primers passos» de l'administració).
route('GET', '/api/setup-status', () => {
  const admins = db.prepare('SELECT roles, totp_secret FROM admins').all();
  return {
    people: db.prepare('SELECT COUNT(*) AS n FROM people WHERE active = 1').get().n,
    accounts: admins.length,
    adminsWithout2fa: admins.filter((a) => a.roles.split(',').includes('admin') && !a.totp_secret).length,
    collaCode: !!COLLA_CODE, privacyContact: !!PRIVACY_CONTACT, offsite: !!OFFSITE, alerts: !!ALERT_WEBHOOK, demo: DEMO,
    minorsWithoutConsent: minorsWithoutConsent(),
  };
}, 'admin');

route('GET', '/api/audit', ({ query }) => {
  const before = Number(query.get('before')) || Number.MAX_SAFE_INTEGER;
  return db.prepare('SELECT id, at, account, action, target FROM audit_log WHERE id < ? ORDER BY id DESC LIMIT 200').all(before);
}, 'admin');
