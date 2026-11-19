import crypto from 'node:crypto';
import { db, transaction } from '../../db.js';
import { translate } from '../../public/i18n.js';
import { LIMITS, NEWS_IMAGES_PER_MESSAGE, NEWS_IMAGE_BYTES, atMost, bool, fail, getEvent, insertRow, int, nowUtc, seesHidden, str, updateRow } from '../util.js';
import { route } from '../router.js';
import { notify } from '../notifications.js';

// ---------- Altaveu ----------
// Missatges d'informació de l'administració per a tota la colla. Els membres no veuen qui els ha escrit
// (els comptes d'administració poden dur el nom complet d'una persona).
export function announcementInput(body) {
  const title = str(body.title, 120);
  if (!title) fail(400, 'El títol és obligatori');
  const out = { title, body: str(body.body, 4000), pinned: bool(body.pinned) };
  // La sessió on porta el botó del missatge (per apuntar-s'hi i, si cal, pagar).
  if ('event_id' in body) out.event_id = body.event_id === null || body.event_id === '' ? null : getEvent(int(body.event_id, 1, 2 ** 31)).id;
  return out;
}
export const getAnnouncement = (id) => db.prepare('SELECT * FROM announcements WHERE id = ?').get(id) || fail(404, 'Missatge no trobat');
// La sessió enllaçada, si qui mira la pot veure (una sessió oculta, per als membres, és com si no existís).
export function withEvent(a, user) {
  const e = a.event_id && db.prepare('SELECT id, title, date, hidden FROM events WHERE id = ?').get(a.event_id);
  return { ...a, event_id: undefined, event: e && (seesHidden(user) || !e.hidden) ? { id: e.id, title: e.title, date: e.date, hidden: !!e.hidden } : null };
}
export const withImages = (a) => ({ ...a, images: db.prepare('SELECT id FROM announcement_images WHERE announcement_id = ? ORDER BY position').all(a.id).map((i) => i.id) });

// Què és una imatge ho diuen els seus primers bytes, no el que digui qui la puja (i un SVG podria dur codi: no se n'accepten).
export function imageMime(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
// Les imatges d'un missatge passen a ser les d'aquesta llista, en aquest ordre; les que en surten s'esborren.
export function setImages(announcementId, ids) {
  if (!Array.isArray(ids)) fail(400, 'Imatge no vàlida');
  if (ids.length > NEWS_IMAGES_PER_MESSAGE) fail(400, 'Com a molt {n} imatges per missatge', { n: NEWS_IMAGES_PER_MESSAGE });
  const own = db.prepare('SELECT 1 FROM announcement_images WHERE id = ? AND (announcement_id IS NULL OR announcement_id = ?)');
  for (const id of ids) if (typeof id !== 'string' || !own.get(id, announcementId)) fail(400, 'Imatge no vàlida');
  db.prepare('DELETE FROM announcement_images WHERE announcement_id = ? AND id NOT IN (SELECT value FROM json_each(?))').run(announcementId, JSON.stringify(ids));
  const link = db.prepare('UPDATE announcement_images SET announcement_id = ?, position = ? WHERE id = ?');
  ids.forEach((id, i) => link.run(announcementId, i, id));
}

route('GET', '/api/announcements', ({ user }) => db.prepare(`SELECT * FROM announcements
  ORDER BY pinned DESC, created_at DESC, id DESC LIMIT 200`).all().map(withImages).map((a) => withEvent(a, user))
  .map((a) => (user.role === 'admin' ? a : { ...a, author: undefined })));

route('POST', '/api/announcements/images', ({ body }) => {
  // Les que es van pujar però mai es van arribar a publicar.
  db.prepare("DELETE FROM announcement_images WHERE announcement_id IS NULL AND created_at < datetime('now', '-1 day')").run();
  atMost(LIMITS.newsImages, "Com a molt {n} imatges: esborra algun missatge antic", 'SELECT COUNT(*) AS n FROM announcement_images');
  if (typeof body.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) fail(400, 'Imatge no vàlida');
  const data = Buffer.from(body.data, 'base64');
  if (data.length > NEWS_IMAGE_BYTES) fail(413, 'Petició massa gran');
  const mime = imageMime(data) || fail(400, 'Imatge no vàlida');
  // A l'atzar: el navegador les guarda molt de temps, i una altra imatge mai no pot tornar a tenir la mateixa adreça.
  const id = crypto.randomBytes(12).toString('hex');
  db.prepare('INSERT INTO announcement_images (id, mime, data) VALUES (?, ?, ?)').run(id, mime, data);
  return { id };
}, 'news');

route('GET', '/api/announcements/images/:id', ({ params, res }) => {
  const image = db.prepare('SELECT mime, data FROM announcement_images WHERE id = ?').get(params.id) || fail(404, 'Imatge no trobada');
  res.writeHead(200, { 'Content-Type': image.mime, 'Content-Length': image.data.length, 'Cache-Control': 'private, max-age=31536000, immutable' });
  res.end(image.data);
  return undefined;
});

route('POST', '/api/announcements', ({ body, user }) => {
  atMost(LIMITS.announcements, "Com a molt {n} missatges: esborra'n algun d'antic", 'SELECT COUNT(*) AS n FROM announcements');
  const a = transaction(() => {
    const id = insertRow('announcements', { ...announcementInput(body), author: user.name, created_at: nowUtc() });
    if (body.image_ids) setImages(id, body.image_ids);
    return withEvent(withImages(getAnnouncement(id)), { role: 'admin' });
  });
  if (body.notify !== false) {
    // Només als mòbils d'algú de la colla que encara hi és, o d'un compte d'administració.
    notify(db.prepare(`SELECT s.* FROM push_subscriptions s LEFT JOIN people p ON p.id = s.person_id
      WHERE s.admin_id IS NOT NULL OR p.active = 1`).all(),
      (lang) => ({ title: translate(lang, 'Altaveu: {title}', { title: a.title }), body: a.body, url: a.event_id ? `#/sessio/${a.event_id}` : '#/altaveu' }));
  }
  return a;
}, 'news');

route('PUT', '/api/announcements/:id', ({ params, body }) => {
  getAnnouncement(params.id);
  transaction(() => {
    updateRow('announcements', params.id, { ...announcementInput(body), updated_at: nowUtc() });
    if (body.image_ids) setImages(params.id, body.image_ids);
  });
  return withEvent(withImages(getAnnouncement(params.id)), { role: 'admin' });
}, 'news');

route('DELETE', '/api/announcements/:id', ({ params }) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(params.id);
  return { ok: true };
}, 'news');
