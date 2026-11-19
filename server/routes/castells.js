import net from 'node:net';
import { castellName, configFromName, positionOf, structureOf } from '../../public/castell.js';
import { db, transaction } from '../../db.js';
import { ADMIN_ONLY_CASTELL, LIMITS, atMost, bool, can, castellInput, fail, getCastell, getEvent, insertRow, publicName, updateRow, visibleCastell } from '../util.js';
import { route } from '../router.js';
import { EFFECTIVE_STATUS_SQL } from '../sql.js';
import { planClashes } from './events.js';
import { guestsOf } from './guests.js';

// ---------- Rutes: castells i posicions ----------
// ---------- Omplir un castell com un d'anterior ----------
// Els últims castells del mateix tipus («3d7») fets fins a la data d'aquesta sessió, amb gent col·locada,
// per copiar-ne l'alineació tal qual.
export const SOURCES_LIMIT = 6;
route('GET', '/api/events/:id/castell-sources', ({ params, query }) => {
  const event = getEvent(params.id);
  const name = String(query.get('name') || '');
  const config = configFromName(name);
  if (!config) fail(400, 'Castell no vàlid');
  const exclude = Number(query.get('exclude')) || 0;
  const placed = db.prepare('SELECT COUNT(*) AS n FROM castell_positions WHERE castell_id = ?');
  const out = [];
  // L'amplada i l'alçada es filtren a la consulta; la resta del nom (folre, agulla…) es mira amb castellName.
  for (const c of db.prepare(`SELECT c.*, e.title AS event_title, e.date AS event_date, e.type AS event_type FROM castells c
      JOIN events e ON e.id = c.event_id WHERE e.date <= ? AND c.id != ? AND c.width = ? AND c.height = ?
      ORDER BY e.date DESC, e.start_time DESC, c.position DESC, c.id DESC`).all(event.date, exclude, config.width, config.height)) {
    if (castellName(c) !== name) continue;
    const n = placed.get(c.id).n;
    if (!n) continue;
    out.push({ id: c.id, event_id: c.event_id, event_title: c.event_title, event_date: c.event_date, event_type: c.event_type, label: c.label,
      result: c.result, placed: n, cordons: c.cordons, taps: c.taps, gralles: c.gralles, timbals: c.timbals, from_level: c.from_level, to_level: c.to_level });
    if (out.length >= SOURCES_LIMIT) break;
  }
  return out;
}, 'castells');

// Substitueix l'alineació del castell per la d'un altre del mateix tipus. Només es copien les posicions que aquest
// castell té i la gent activa; les persones temporals, només si són de la mateixa sessió.
export function copyLineup(target, sourceId) {
  const source = getCastell(sourceId);
  if (castellName(source) !== castellName(target)) fail(400, 'Només es pot copiar un castell del mateix tipus');
  const sameEvent = source.event_id === target.event_id;
  const rows = db.prepare(`SELECT cp.* FROM castell_positions cp LEFT JOIN people p ON p.id = cp.person_id
    WHERE cp.castell_id = ? AND (p.active = 1 OR (cp.person_id IS NULL AND ? = 1))`).all(source.id, sameEvent ? 1 : 0);
  db.prepare('DELETE FROM castell_positions WHERE castell_id = ?').run(target.id);
  const ins = db.prepare('INSERT INTO castell_positions (castell_id, pos_key, person_id, guest_name, guest_id) VALUES (?, ?, ?, ?, ?)');
  for (const r of rows) if (positionOf(target, r.pos_key)) ins.run(target.id, r.pos_key, r.person_id, r.guest_name, r.guest_id);
}

route('POST', '/api/events/:id/castells', ({ params, body }) => {
  if (getEvent(params.id).type === 'musics') fail(400, 'Els assajos de músics no tenen castells');
  atMost(LIMITS.castellsPerEvent, 'Com a molt {n} castells per sessió', 'SELECT COUNT(*) AS n FROM castells WHERE event_id = ?', params.id);
  const position = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM castells WHERE event_id = ?').get(params.id).p;
  return transaction(() => {
    // Es crea ocult, si no es diu el contrari: els membres no el veuen fins que està a punt.
    const id = insertRow('castells', { event_id: Number(params.id), position, ...castellInput(body), hidden: 'hidden' in body ? bool(body.hidden) : 1 });
    if (body.copy_from) copyLineup(getCastell(id), Number(body.copy_from));
    return getCastell(id);
  });
}, 'castells');

route('GET', '/api/castells/:id', ({ params, user }) => {
  const castell = visibleCastell(params.id, user);
  const isAdmin = user.role === 'admin';
  const event = getEvent(castell.event_id);
  const measures = 'p.birthdate, p.height_cm, p.shoulder_height_cm, p.shoulder_width_cm, p.weight_kg';
  // De les persones temporals, l'alçada d'espatlles i el pes (si s'han posat) serveixen per revisar l'alineació.
  // La junta veu l'alineació, però les mides, els candidats i les notes només els fa servir la tècnica.
  const tech = can(user, 'castells');
  const positions = db.prepare(`SELECT cp.pos_key, cp.person_id, cp.guest_id, COALESCE(g.name, cp.guest_name) AS guest_name, p.name, p.alias${tech
      ? ', p.birthdate, p.height_cm, p.shoulder_width_cm, COALESCE(p.shoulder_height_cm, g.shoulder_height_cm) AS shoulder_height_cm, COALESCE(p.weight_kg, g.weight_kg) AS weight_kg'
      : ''}
    FROM castell_positions cp LEFT JOIN people p ON p.id = cp.person_id LEFT JOIN event_guests g ON g.id = cp.guest_id
    WHERE cp.castell_id = ?`).all(castell.id);
  const siblings = db.prepare(`SELECT id, width, height, agulla, folre, manilles, puntals, sota, gralles, timbals, net, from_level, to_level,
    label, result, hidden FROM castells WHERE event_id = ?${isAdmin ? '' : ' AND hidden = 0'} ORDER BY position, id`).all(event.id);
  // Les notes de la tècnica no les veuen els membres.
  const result = { castell: tech ? castell : isAdmin ? { ...castell, tech_notes: undefined } : { ...castell, ...ADMIN_ONLY_CASTELL }, event, siblings,
    positions: isAdmin ? positions : positions.map(({ name, alias, ...p }) => (p.person_id ? { ...p, name: publicName({ name, alias }), alias: null }
      : { ...p, guest_name: p.guest_name ? publicName({ name: p.guest_name }) : null })) };
  if (isAdmin) result.plan_clashes = planClashes(event.id).filter((x) => x.a === castell.id || x.b === castell.id);
  if (tech) {
    result.candidates = db.prepare(`SELECT p.id, p.name, p.alias, p.instrument, ${measures}, ${EFFECTIVE_STATUS_SQL} AS status
      FROM people p LEFT JOIN attendance a ON a.person_id = p.id AND a.event_id = ?
      WHERE p.active = 1 ORDER BY p.name COLLATE NOCASE`).all(event.id);
    result.guests = guestsOf(event.id);
    result.events = db.prepare(`SELECT id, title, date, type FROM events
      WHERE date >= date('now','localtime', '-30 days') ORDER BY date LIMIT 100`).all();
  }
  return result;
});

route('PUT', '/api/castells/:id', ({ params, body }) => {
  const castell = getCastell(params.id);
  const data = castellInput(body, castell);
  transaction(() => {
    updateRow('castells', castell.id, data);
    if (Array.isArray(body.validKeys)) {
      const keep = new Set(body.validKeys.map(String));
      for (const { pos_key } of db.prepare('SELECT pos_key FROM castell_positions WHERE castell_id = ?').all(castell.id)) {
        if (!keep.has(pos_key)) db.prepare('DELETE FROM castell_positions WHERE castell_id = ? AND pos_key = ?').run(castell.id, pos_key);
      }
    }
    if (body.copy_from) copyLineup(getCastell(castell.id), Number(body.copy_from));
  });
  return getCastell(castell.id);
}, 'castells');

route('DELETE', '/api/castells/:id', ({ params }) => {
  db.prepare('DELETE FROM castells WHERE id = ?').run(params.id);
  return { ok: true };
}, 'castells');

route('POST', '/api/castells/:id/duplicate', ({ params, body }) => {
  const castell = getCastell(params.id);
  const target = getEvent(body.event_id ?? castell.event_id);
  if (target.type === 'musics') fail(400, 'Els assajos de músics no tenen castells');
  atMost(LIMITS.castellsPerEvent, 'Com a molt {n} castells per sessió', 'SELECT COUNT(*) AS n FROM castells WHERE event_id = ?', target.id);
  return transaction(() => {
    const { id, event_id, position, ...rest } = castell;
    const nextPos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM castells WHERE event_id = ?').get(target.id).p;
    const newId = insertRow('castells', { ...rest, result: 'previst', tech_notes: null, fail_level: 0, fail_cause: null, hidden: 1, plan_time: null, event_id: target.id, position: nextPos });
    // Les persones temporals són d'una sessió: només es copien si el castell queda a la mateixa sessió.
    db.prepare(`INSERT INTO castell_positions (castell_id, pos_key, person_id, guest_name, guest_id)
      SELECT ?, pos_key, person_id, guest_name, guest_id FROM castell_positions
      WHERE castell_id = ? AND (person_id IS NOT NULL OR ? = 1)`).run(newId, castell.id, target.id === castell.event_id ? 1 : 0);
    return getCastell(newId);
  });
}, 'castells');

route('PUT', '/api/castells/:id/positions/:key', ({ params, body }) => {
  const castell = getCastell(params.id);
  let key = '';
  try { key = decodeURIComponent(params.key); } catch { /* mal codificada: no és cap posició */ }
  if (!/^[\w-]{1,40}$/.test(key)) fail(400, 'Posició no vàlida');
  const personId = body.person_id ? Number(body.person_id) : null;
  const guestId = !personId && body.guest_id ? Number(body.guest_id) : null;
  // Es pot buidar qualsevol clau (p. ex. una que la plantilla ha tret), però només es pot posar gent a les del castell.
  if ((personId || guestId) && !positionOf(castell, key)) fail(400, 'Posició no vàlida');
  if (personId && !db.prepare('SELECT 1 FROM people WHERE id = ?').get(personId)) fail(404, 'Persona no trobada');
  const guest = guestId ? db.prepare('SELECT * FROM event_guests WHERE id = ? AND event_id = ?').get(guestId, castell.event_id) : null;
  if (guestId && !guest) fail(404, 'Persona temporal no trobada');
  transaction(() => {
    db.prepare('DELETE FROM castell_positions WHERE castell_id = ? AND pos_key = ?').run(castell.id, key);
    // Una persona (o una persona temporal) només pot ocupar una posició dins del mateix castell: la movem.
    if (personId) db.prepare('DELETE FROM castell_positions WHERE castell_id = ? AND person_id = ?').run(castell.id, personId);
    if (guest) db.prepare('DELETE FROM castell_positions WHERE castell_id = ? AND guest_id = ?').run(castell.id, guest.id);
    if (personId || guest) {
      db.prepare('INSERT INTO castell_positions (castell_id, pos_key, person_id, guest_id, guest_name) VALUES (?, ?, ?, ?, ?)')
        .run(castell.id, key, personId, guest?.id ?? null, guest?.name ?? null);
    }
  });
  return { ok: true };
}, 'castells');

route('PUT', '/api/castells/:id/positions', ({ params, body }) => {
  const castell = getCastell(params.id);
  if (!Array.isArray(body.assignments)) fail(400, 'Falten les assignacions');
  const positions = structureOf(castell).positions;
  if (body.assignments.length > positions.size + 50) fail(400, 'Posició no vàlida');
  const list = body.assignments.map((a) => {
    const key = String(a?.pos_key || '');
    const personId = a?.person_id ? Number(a.person_id) : null;
    if (!/^[\w-]{1,40}$/.test(key) || (personId && !positions.has(key))) fail(400, 'Posició no vàlida');
    return { key, personId };
  });
  transaction(() => {
    const del = db.prepare('DELETE FROM castell_positions WHERE castell_id = ? AND pos_key = ?');
    const delPerson = db.prepare('DELETE FROM castell_positions WHERE castell_id = ? AND person_id = ?');
    const ins = db.prepare('INSERT INTO castell_positions (castell_id, pos_key, person_id) VALUES (?, ?, ?)');
    for (const a of list) del.run(castell.id, a.key);
    for (const a of list) {
      if (!a.personId) continue;
      delPerson.run(castell.id, a.personId);
      ins.run(castell.id, a.key, a.personId);
    }
  });
  return { ok: true, count: list.length };
}, 'castells');
