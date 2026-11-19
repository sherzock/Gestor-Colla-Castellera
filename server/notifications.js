import { sendPush, validEndpoint, vapidKeys } from '../push.js';
import { db, transaction } from '../db.js';
import { translate } from '../public/i18n.js';
import { euros } from '../public/forms.js';
import { PRIVACY_CONTACT } from './config.js';
import { atMost, fail, localStamp, nowLocal, nowUtc, rsvpOpen } from './util.js';
import { adminSession, cookies, memberSession, route } from './router.js';
import { amountOf } from './routes/payments.js';

// ---------- Avisos al mòbil ----------
// Missatges nous de l'Altaveu (a tothom que els ha activat) i recordatoris de respondre una sessió (a qui encara no
// ho ha fet). Veure push.js: el text es queda aquí, a la bústia de cada mòbil, fins que el mòbil el ve a buscar.
export const PUSH_EXTRA_HOSTS = String(process.env.PUSH_EXTRA_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean);
// Els serveis d'avisos volen saber a qui escriure si hi ha cap problema: el contacte de la colla, si és un correu.
export const contactEmail = PRIVACY_CONTACT.match(/[^\s<>()]+@[^\s<>()]+/)?.[0];
export const PUSH_SUBJECT = process.env.PUSH_SUBJECT || (contactEmail ? `mailto:${contactEmail}` : 'https://github.com/sherzock/Gestor-Colla-Castellera');
export const VAPID = vapidKeys(() => db.prepare("SELECT value FROM settings WHERE key = 'vapid'").get()?.value,
  (value) => db.prepare("INSERT INTO settings (key, value) VALUES ('vapid', ?)").run(value));
export const PUSH_MAX_SUBSCRIPTIONS = 5000;
export const PUSH_INBOX_MAX = 20;

// Deixa el missatge (en l'idioma de cada mòbil) a la seva bústia i l'avisa. No s'espera la resposta del servei: si
// triga, l'acció de qui ha escrit el missatge no es queda aturada. Els mòbils que ja no existeixen s'esborren.
export function notify(subs, message) {
  const add = db.prepare('INSERT INTO push_inbox (subscription_id, title, body, url) VALUES (?, ?, ?, ?)');
  const trim = db.prepare(`DELETE FROM push_inbox WHERE subscription_id = ? AND id NOT IN
    (SELECT id FROM push_inbox WHERE subscription_id = ? ORDER BY id DESC LIMIT ${PUSH_INBOX_MAX})`);
  for (const sub of subs) {
    const m = message(sub.lang);
    add.run(sub.id, String(m.title).slice(0, 120), m.body ? String(m.body).slice(0, 300) : null, m.url || null);
    trim.run(sub.id, sub.id);
    sendPush(sub.endpoint, VAPID, PUSH_SUBJECT).then((status) => {
      if (status === 404 || status === 410) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
    });
  }
}

route('GET', '/api/push/key', () => ({ key: VAPID.publicKey }));

// El mòbil queda lligat a qui hi ha entrat ara (membre i/o compte d'administració). L'app ho torna a enviar cada cop que
// algú entra, surt o canvia de persona, perquè els recordatoris no arribin a qui ja no fa servir aquell mòbil.
route('POST', '/api/push/subscribe', ({ req, body }) => {
  if (!validEndpoint(body.endpoint, PUSH_EXTRA_HOSTS)) fail(400, "Adreça d'avisos no vàlida");
  const c = cookies(req);
  const member = memberSession(c.token), admin = adminSession(c.atoken);
  const lang = ['es', 'en'].includes(req.headers['x-lang']) ? req.headers['x-lang'] : 'ca';
  if (!db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ?').get(body.endpoint)) {
    atMost(PUSH_MAX_SUBSCRIPTIONS, 'Com a molt {n} mòbils amb avisos', 'SELECT COUNT(*) AS n FROM push_subscriptions');
  }
  db.prepare(`INSERT INTO push_subscriptions (endpoint, person_id, admin_id, lang) VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET person_id = excluded.person_id, admin_id = excluded.admin_id, lang = excluded.lang`)
    .run(body.endpoint, member?.id ?? null, admin?.admin_id ?? null, lang);
  return { ok: true };
});

// L'adreça del mòbil és secreta (només la saben el mòbil i el servei d'avisos): amb ella es pot donar de baixa i
// recollir els missatges, encara que ningú hi tingui la sessió oberta.
route('POST', '/api/push/unsubscribe', ({ body }) => {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(String(body.endpoint || ''));
  return { ok: true };
}, 'public');

route('POST', '/api/push/inbox', ({ body }) => {
  const sub = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(String(body.endpoint || ''));
  if (!sub) return { messages: [] };
  return transaction(() => {
    const messages = db.prepare('SELECT title, body, url FROM push_inbox WHERE subscription_id = ? ORDER BY id').all(sub.id);
    db.prepare('DELETE FROM push_inbox WHERE subscription_id = ?').run(sub.id);
    return { messages };
  });
}, 'public');

export const longDate = (date, lang) => new Date(`${date}T12:00:00`).toLocaleDateString({ ca: 'ca', es: 'es', en: 'en-GB' }[lang], { weekday: 'long', day: 'numeric', month: 'long' });

// La sessió que estava oculta ja es pot veure: a qui hi pot anar (i als comptes d'administració).
export function announceEvent(event) {
  db.prepare('UPDATE events SET announced_at = ? WHERE id = ?').run(nowUtc(), event.id);
  notify(db.prepare(`SELECT s.* FROM push_subscriptions s LEFT JOIN people p ON p.id = s.person_id
    WHERE s.admin_id IS NOT NULL OR (p.active = 1 AND (? != 'musics' OR p.instrument IS NOT NULL))`).all(event.type),
    (lang) => ({ title: translate(lang, 'Nova sessió: {title}', { title: event.title }), body: longDate(event.date, lang), url: `#/sessio/${event.id}` }));
}

// Recordatori de respondre: a qui té els avisos activats i encara no ha dit si va a una sessió, un sol cop, 24 hores
// abans de la data límit o, si no n'hi ha, el dia abans de la sessió.
export function sendReminders() {
  db.prepare("DELETE FROM push_inbox WHERE created_at < datetime('now', '-3 days')").run();
  const today = nowLocal().slice(0, 10);
  const soon = localStamp(new Date(Date.now() + 24 * 3600 * 1000));
  const rows = db.prepare(`SELECT e.id AS event_id, e.title, e.date, e.rsvp_until, p.id AS person_id
    FROM events e JOIN people p ON p.active = 1 AND (e.type != 'musics' OR p.instrument IS NOT NULL)
    LEFT JOIN attendance a ON a.event_id = e.id AND a.person_id = p.id
    WHERE e.hidden = 0 AND e.date >= ? AND e.date <= date(?, '+30 days') AND a.status IS NULL
      AND p.id IN (SELECT person_id FROM push_subscriptions WHERE person_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM push_reminders r WHERE r.event_id = e.id AND r.person_id = p.id)`).all(today, today);
  const subsOf = db.prepare('SELECT * FROM push_subscriptions WHERE person_id = ?');
  const done = db.prepare('INSERT OR IGNORE INTO push_reminders (event_id, person_id) VALUES (?, ?)');
  for (const r of rows) {
    if (!rsvpOpen(r) || (r.rsvp_until ? r.rsvp_until > soon : r.date > soon.slice(0, 10))) continue;
    done.run(r.event_id, r.person_id);
    notify(subsOf.all(r.person_id), (lang) => ({
      title: translate(lang, 'Vens a {title}?', { title: r.title }),
      body: translate(lang, "{date}: encara no has dit si vens. Toca aquí per respondre.", {
        date: longDate(r.date, lang) }),
      url: `#/sessio/${r.event_id}`,
    }));
  }
}

// Recordatori de pagar: un sol cop, 3 dies abans de la data límit del pagament (o de la sessió, si no n'hi ha), a qui
// ha dit que ve, ha de pagar i encara no ha dit que ho ha fet.
export function sendPayReminders() {
  const today = nowLocal().slice(0, 10);
  const rows = db.prepare(`SELECT e.id AS event_id, e.title, e.date, pay.due_date, a.person_id, a.paid_at, a.received_at
    FROM event_payments pay JOIN events e ON e.id = pay.event_id
    JOIN attendance a ON a.event_id = e.id AND a.status = 'si' AND a.paid_at IS NULL AND a.received_at IS NULL AND a.pay_reminded_at IS NULL
    WHERE e.hidden = 0 AND COALESCE(pay.due_date, e.date) >= ? AND COALESCE(pay.due_date, e.date) <= date(?, '+3 days')
      AND a.person_id IN (SELECT person_id FROM push_subscriptions WHERE person_id IS NOT NULL)`).all(today, today);
  const subsOf = db.prepare('SELECT * FROM push_subscriptions WHERE person_id = ?');
  const done = db.prepare('UPDATE attendance SET pay_reminded_at = ? WHERE event_id = ? AND person_id = ?');
  for (const r of rows) {
    const amount = amountOf(r.event_id, r.person_id);
    if (!amount) continue;
    done.run(nowUtc(), r.event_id, r.person_id);
    notify(subsOf.all(r.person_id), (lang) => ({
      title: translate(lang, 'Recorda pagar: {title}', { title: r.title }),
      body: translate(lang, r.due_date ? '{amount} abans del {date}. Toca aquí per veure on pagar.' : '{amount} abans de la sessió ({date}). Toca aquí per veure on pagar.', {
        amount: euros(amount, lang), date: longDate(r.due_date || r.date, lang) }),
      url: `#/sessio/${r.event_id}`,
    }));
  }
}
setInterval(() => { sendReminders(); sendPayReminders(); }, Number(process.env.PUSH_REMINDER_MS) || 15 * 60 * 1000).unref();
