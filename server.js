import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, hashPassword, verifyPassword, transaction } from './db.js';
import { buildStructure, castellName, levelRange, positionOf } from './public/castell.js';
import { translate } from './public/i18n.js';

const PORT = Number(process.env.PORT) || 3000;
const COLLA_NAME = process.env.COLLA_NAME || 'La meva colla';
const PUBLIC_DIR = path.join(import.meta.dirname, 'public');
const COLLA_CODE = process.env.COLLA_CODE || '';
// Mode demostració: la pantalla d'entrada explica com provar l'app (les dades es tornen a crear a cada arrencada amb «npm run demo»).
const DEMO = process.env.DEMO === '1';
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
const MEMBER_TTL_MS = 365 * 24 * 3600 * 1000;

// ---------- Primer arrencada: crear un administrador si no n'hi ha cap ----------
if (!db.prepare("SELECT 1 FROM people WHERE role = 'admin'").get()) {
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  db.prepare("INSERT INTO people (username, password_hash, role, name) VALUES ('admin', ?, 'admin', 'Administrador')")
    .run(hashPassword(password));
  console.log(`\n  Usuari administrador creat → usuari: admin · contrasenya: ${password}\n  (canvia-la des del teu perfil)\n`);
}
db.prepare('DELETE FROM auth_tokens WHERE expires_at < ?').run(Date.now());

// ---------- Utilitats ----------
// Els missatges d'error es tradueixen a l'idioma de l'usuari (capçalera X-Lang).
class HttpError extends Error {
  constructor(status, message, params) { super(message); this.status = status; this.params = params; }
}
const fail = (status, message, params) => { throw new HttpError(status, message, params); };

const EVENT_TYPES = ['assaig', 'diada', 'esdeveniment', 'musics'];
const INSTRUMENTS = ['gralla', 'timbal'];
const FIELD_KINDS = ['number', 'text', 'bool', 'select'];
const STATUSES = ['si', 'no', 'potser'];
const WIDTHS = [1, 2, 3, 4, 5, 7, 9];
const RESULTS = ['previst', 'descarregat', 'carregat', 'intent', 'intent desfet'];
const NUMERIC_PERSON_FIELDS = ['height_cm', 'shoulder_height_cm', 'shoulder_width_cm', 'weight_kg'];
const PROFILE_FIELDS = ['name', 'alias', 'email', 'phone', 'birthdate', ...NUMERIC_PERSON_FIELDS, 'notes', 'instrument'];

function str(value, max = 500) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().slice(0, max);
  return s === '' ? null : s;
}
function num(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) fail(400, 'Valor numèric no vàlid');
  return n;
}
function int(value, min, max, fallback) {
  const n = value === undefined || value === null || value === '' ? fallback : Math.round(Number(value));
  if (!Number.isInteger(n) || n < min || n > max) fail(400, 'Valor fora de rang ({min}-{max})', { min, max });
  return n;
}
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v) => v == null || v === '' || (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v));

// Els membres entren sense contrasenya (qualsevol pot triar qualsevol nom), així que de la gent només veuen
// el malnom; si algú no en té, «Nom I.». Les dades personals només les veuen els administradors.
const publicName = (p) => p.alias || String(p.name || '').replace(/^(\S+)\s+(\S).*$/, '$1 $2.');
const publicPerson = (p) => ({ id: p.id, name: publicName(p), alias: null });

function personRow(p, { full }) {
  if (!p) return null;
  const { password_hash, ...rest } = p;
  if (full) return rest;
  return { id: p.id, name: p.name, alias: p.alias };
}

function pickPersonFields(body, fields) {
  const out = {};
  for (const f of fields) {
    if (!(f in body)) continue;
    if (NUMERIC_PERSON_FIELDS.includes(f)) out[f] = num(body[f]);
    else if (f === 'birthdate') {
      const v = str(body[f], 10);
      if (v && !isDate(v)) fail(400, 'Data de naixement no vàlida');
      out[f] = v;
    } else if (f === 'role') {
      if (!['member', 'admin'].includes(body.role)) fail(400, 'Rol no vàlid');
      out.role = body.role;
    } else if (f === 'instrument') {
      if (body.instrument && !INSTRUMENTS.includes(body.instrument)) fail(400, 'Instrument no vàlid');
      out.instrument = body.instrument || null;
    } else if (f === 'active') out.active = bool(body.active);
    else if (f === 'username') {
      const v = str(body.username, 60);
      out.username = v ? v.toLowerCase() : null;
    } else out[f] = str(body[f], f === 'notes' ? 2000 : 200);
  }
  if ('name' in out && !out.name) fail(400, 'El nom és obligatori');
  return out;
}

// El malnom serveix per distingir persones amb el mateix nom: no es pot repetir.
const normName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
function checkAliasUnique(alias, excludeId = null) {
  if (!alias) return;
  const taken = db.prepare('SELECT id, name, alias FROM people WHERE alias IS NOT NULL').all()
    .find((p) => p.id !== excludeId && normName(p.alias) === normName(alias));
  if (taken) fail(400, 'El malnom «{alias}» ja el fa servir {name}', { alias, name: taken.name });
}

function updateRow(table, id, data) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...keys.map((k) => data[k]), id);
}

function insertRow(table, data) {
  const keys = Object.keys(data);
  return Number(db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
    .run(...keys.map((k) => data[k])).lastInsertRowid);
}

function parseJSON(text, fallback) {
  try { return text ? JSON.parse(text) : fallback; } catch { return fallback; }
}

function loadFields(eventId) {
  return db.prepare('SELECT * FROM event_fields WHERE event_id = ? ORDER BY position, id').all(eventId)
    .map((f) => ({ ...f, options: parseJSON(f.options, []), required: !!f.required }));
}

function cleanExtra(fields, extra, enforceRequired) {
  const out = {};
  extra = extra && typeof extra === 'object' ? extra : {};
  for (const f of fields) {
    let v = extra[f.id];
    if (v === undefined || v === null || v === '') v = null;
    else if (f.kind === 'number') v = num(v);
    else if (f.kind === 'bool') v = !!bool(v);
    else if (f.kind === 'select') { if (!f.options.includes(v)) fail(400, 'Opció no vàlida per a «{label}»', { label: f.label }); }
    else v = str(v, 500);
    if (enforceRequired && f.required && v === null) fail(400, 'Cal omplir «{label}»', { label: f.label });
    out[f.id] = v;
  }
  return out;
}

function getEvent(id) {
  return db.prepare('SELECT * FROM events WHERE id = ?').get(id) || fail(404, 'Sessió no trobada');
}
function getCastell(id) {
  return db.prepare('SELECT * FROM castells WHERE id = ?').get(id) || fail(404, 'Castell no trobat');
}

function castellInput(body, existing = {}) {
  const merged = { ...existing, ...body };
  const width = Number(merged.width);
  if (!WIDTHS.includes(width)) fail(400, 'Amplada de castell no vàlida');
  const height = int(merged.height, width === 1 ? 3 : 4, 11, null);
  const net = bool(merged.net);
  const folre = net ? 0 : bool(merged.folre);
  const out = {
    width, height,
    agulla: width >= 3 ? bool(merged.agulla) : 0,
    folre,
    manilles: folre ? bool(merged.manilles) : 0,
    puntals: folre && bool(merged.manilles) ? bool(merged.puntals) : 0,
    sota: bool(merged.sota),
    net,
    from_level: int(merged.from_level, 1, 11, 1),
    to_level: int(merged.to_level, 0, 11, 0),
    cordons: int(merged.cordons, 0, 12, 4),
    gralles: int(merged.gralles, 0, 12, 0),
    timbals: int(merged.timbals, 0, 12, 0),
    label: str(merged.label, 100),
    notes: str(merged.notes, 2000),
    result: RESULTS.includes(merged.result) ? merged.result : 'previst',
  };
  if (out.folre && height < 6) fail(400, 'El folre necessita un castell de 6 pisos o més');
  if (out.puntals && height < (width === 1 ? 8 : 9)) fail(400, 'Els puntals necessiten un castell més alt');
  // Prova parcial: el pis final 0 vol dir «fins a dalt».
  if (out.to_level >= height) out.to_level = 0;
  if (out.from_level > height) fail(400, 'El pis inicial no pot ser més amunt que el castell');
  if (out.to_level && out.to_level < out.from_level) fail(400, 'El pis final ha de ser igual o més amunt que el pis inicial');
  if (!buildStructure(out).positions.size) fail(400, 'Aquest castell no té cap posició');
  return out;
}

// ---------- Router ----------
const routes = [];
function route(method, pattern, handler, auth = 'user') {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, auth });
}

function currentUser(req) {
  const cookie = req.headers.cookie || '';
  const token = cookie.split(/;\s*/).find((c) => c.startsWith('token='))?.slice(6);
  if (!token) return null;
  const row = db.prepare(`SELECT p.*, t.mode FROM auth_tokens t JOIN people p ON p.id = t.person_id
    WHERE t.token = ? AND t.expires_at > ? AND p.active = 1`).get(token, Date.now());
  if (!row) return null;
  // Els permisos d'administració només s'obtenen entrant amb credencials.
  return { ...row, role: row.mode === 'admin' && row.role === 'admin' ? 'admin' : 'member', token };
}

function cookieHeader(req, token, maxAgeSec) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`;
}

// ---------- Rutes: autenticació i perfil ----------
route('GET', '/api/config', () => ({ collaName: COLLA_NAME, needsCode: !!COLLA_CODE, demo: DEMO }), 'public');

function checkCollaCode(code) {
  if (COLLA_CODE && String(code || '').trim() !== COLLA_CODE) fail(401, 'El codi de la colla no és correcte');
}

// Entrada de membres: sense contrasenya, només triant qui ets.
route('POST', '/api/directory', ({ body }) => {
  checkCollaCode(body.code);
  return db.prepare('SELECT id, name, alias FROM people WHERE active = 1').all().map(publicPerson)
    .sort((a, b) => a.name.localeCompare(b.name, 'ca'));
}, 'public');

route('POST', '/api/identify', ({ body, req, res }) => {
  checkCollaCode(body.code);
  const person = db.prepare('SELECT * FROM people WHERE id = ? AND active = 1').get(Number(body.person_id)) || fail(404, 'Persona no trobada');
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO auth_tokens (token, person_id, expires_at, mode) VALUES (?, ?, ?, 'member')").run(token, person.id, Date.now() + MEMBER_TTL_MS);
  res.setHeader('Set-Cookie', cookieHeader(req, token, MEMBER_TTL_MS / 1000));
  return { ...publicPerson(person), alias: person.alias, instrument: person.instrument, role: 'member', mode: 'member' };
}, 'public');

route('POST', '/api/login', ({ body, req, res }) => {
  const username = String(body.username || '').trim().toLowerCase();
  const person = db.prepare('SELECT * FROM people WHERE username = ? AND active = 1').get(username);
  if (!person || !verifyPassword(String(body.password || ''), person.password_hash)) fail(401, 'Usuari o contrasenya incorrectes');
  if (person.role !== 'admin') fail(401, 'Aquest usuari no és administrador');
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO auth_tokens (token, person_id, expires_at, mode) VALUES (?, ?, ?, 'admin')").run(token, person.id, Date.now() + TOKEN_TTL_MS);
  res.setHeader('Set-Cookie', cookieHeader(req, token, TOKEN_TTL_MS / 1000));
  return { ...personRow(person, { full: true }), mode: 'admin' };
}, 'public');

route('POST', '/api/logout', ({ user, req, res }) => {
  db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(user.token);
  res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
  return { ok: true };
});

route('GET', '/api/me', ({ user }) => {
  if (user.role !== 'admin') return { ...publicPerson(user), alias: user.alias, instrument: user.instrument, role: 'member', mode: 'member' };
  const { token, ...rest } = personRow(user, { full: true });
  return rest;
});

route('PUT', '/api/me', ({ user, body }) => {
  const data = pickPersonFields(body, PROFILE_FIELDS);
  checkAliasUnique(data.alias, user.id);
  updateRow('people', user.id, data);
  if (body.newPassword) {
    if (!verifyPassword(String(body.currentPassword || ''), user.password_hash)) fail(400, 'La contrasenya actual no és correcta');
    if (String(body.newPassword).length < 8) fail(400, 'La nova contrasenya ha de tenir almenys 8 caràcters');
    db.prepare('UPDATE people SET password_hash = ? WHERE id = ?').run(hashPassword(String(body.newPassword)), user.id);
    db.prepare('DELETE FROM auth_tokens WHERE person_id = ? AND token != ?').run(user.id, user.token);
  }
  return personRow(db.prepare('SELECT * FROM people WHERE id = ?').get(user.id), { full: true });
}, 'admin');

// Qui ha vingut de debò: el que hagi marcat l'admin o, si no ha marcat res, qui havia dit «Vinc».
const CAME_SQL = "COALESCE(a.came, a.status = 'si', 0) = 1";
// Estat «efectiu» per muntar castells: qui no ha vingut no compta i qui ha vingut sense apuntar-se, sí.
const EFFECTIVE_STATUS_SQL = "CASE WHEN a.came = 0 THEN 'no' WHEN a.came = 1 THEN 'si' ELSE a.status END";

// ---------- Rutes: persones (administradors) ----------
route('GET', '/api/people', () => {
  const people = db.prepare(`SELECT p.*,
      (SELECT COUNT(*) FROM attendance a JOIN events e ON e.id = a.event_id
        WHERE a.person_id = p.id AND ${CAME_SQL} AND e.date <= date('now','localtime')) AS attended,
      (SELECT COUNT(*) FROM attendance a JOIN events e ON e.id = a.event_id
        WHERE a.person_id = p.id AND a.status = 'si' AND e.date <= date('now','localtime')) AS confirmed
    FROM people p ORDER BY p.active DESC, p.name COLLATE NOCASE`).all();
  const pastEvents = db.prepare("SELECT COUNT(*) AS n FROM events WHERE date <= date('now','localtime')").get().n;
  return { people: people.map((p) => personRow(p, { full: true })), pastEvents };
}, 'admin');

route('POST', '/api/people', ({ body }) => {
  const data = pickPersonFields(body, [...PROFILE_FIELDS, 'username', 'role']);
  if (!data.name) fail(400, 'El nom és obligatori');
  checkAliasUnique(data.alias);
  if (data.role === 'admin' && !data.username) fail(400, 'Un administrador necessita usuari i contrasenya');
  if (data.username) {
    if (db.prepare('SELECT 1 FROM people WHERE username = ?').get(data.username)) fail(400, "Aquest nom d'usuari ja existeix");
    if (!body.password || String(body.password).length < 8) fail(400, 'La contrasenya ha de tenir almenys 8 caràcters');
    data.password_hash = hashPassword(String(body.password));
  }
  const id = insertRow('people', data);
  return personRow(db.prepare('SELECT * FROM people WHERE id = ?').get(id), { full: true });
}, 'admin');

route('PUT', '/api/people/:id', ({ params, body, user }) => {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(params.id) || fail(404, 'Persona no trobada');
  const data = pickPersonFields(body, [...PROFILE_FIELDS, 'username', 'role', 'active']);
  if (person.id === user.id && (data.role === 'member' || data.active === 0)) fail(400, 'No et pots treure els permisos a tu mateix');
  checkAliasUnique(data.alias, person.id);
  if ((data.role ?? person.role) === 'admin' && !(data.username ?? person.username)) fail(400, 'Un administrador necessita usuari i contrasenya');
  if (data.username && data.username !== person.username &&
      db.prepare('SELECT 1 FROM people WHERE username = ?').get(data.username)) fail(400, "Aquest nom d'usuari ja existeix");
  if (body.password) {
    if (String(body.password).length < 8) fail(400, 'La contrasenya ha de tenir almenys 8 caràcters');
    data.password_hash = hashPassword(String(body.password));
  }
  if ((data.username ?? person.username) && !(data.password_hash || person.password_hash)) fail(400, 'Cal una contrasenya per poder entrar');
  updateRow('people', person.id, data);
  if (data.active === 0 || data.password_hash) db.prepare('DELETE FROM auth_tokens WHERE person_id = ?').run(person.id);
  return personRow(db.prepare('SELECT * FROM people WHERE id = ?').get(person.id), { full: true });
}, 'admin');

route('DELETE', '/api/people/:id', ({ params, user }) => {
  if (Number(params.id) === user.id) fail(400, 'No et pots esborrar a tu mateix');
  db.prepare('DELETE FROM people WHERE id = ?').run(params.id);
  return { ok: true };
}, 'admin');

// ---------- Rutes: sessions (assajos, diades, esdeveniments) ----------
route('GET', '/api/events', ({ user, query }) => {
  const past = query.get('scope') === 'past';
  // Amb «from» i «to» (calendari) es tornen totes les sessions d'aquell interval, passades o futures.
  const from = query.get('from'), to = query.get('to');
  const range = isDate(from) && isDate(to);
  const when = range ? 'e.date BETWEEN ? AND ?' : past ? "e.date < date('now','localtime')" : "e.date >= date('now','localtime')";
  // Els assajos de músics només els veuen els músics (i els administradors).
  const hideMusics = user.role !== 'admin' && !user.instrument;
  return db.prepare(`SELECT e.*, a.status AS my_status,
      (SELECT COUNT(*) FROM attendance WHERE event_id = e.id AND status = 'si') AS count_si,
      (SELECT COUNT(*) FROM attendance WHERE event_id = e.id AND status = 'potser') AS count_potser,
      (SELECT COUNT(*) FROM attendance WHERE event_id = e.id AND status = 'no') AS count_no,
      (SELECT GROUP_CONCAT(width || '|' || height || '|' || agulla || '|' || folre || '|' || manilles || '|' || puntals || '|' || sota
          || '|' || net || '|' || result, ';')
         FROM (SELECT * FROM castells WHERE event_id = e.id ORDER BY position, id)) AS castells
    FROM events e LEFT JOIN attendance a ON a.event_id = e.id AND a.person_id = ?
    WHERE ${when}${hideMusics ? " AND e.type != 'musics'" : ''}
    ORDER BY e.date ${past && !range ? 'DESC' : 'ASC'}, e.start_time ${past && !range ? 'DESC' : 'ASC'}
    LIMIT 200`).all(user.id, ...(range ? [from, to] : []));
});

function eventInput(body) {
  if (!EVENT_TYPES.includes(body.type)) fail(400, 'Tipus de sessió no vàlid');
  if (!isDate(body.date)) fail(400, 'Data no vàlida');
  if (!isTime(body.start_time) || !isTime(body.end_time)) fail(400, 'Hora no vàlida');
  const title = str(body.title, 150);
  if (!title) fail(400, 'El títol és obligatori');
  if (!isTime(body.escoleta_time)) fail(400, 'Hora no vàlida');
  const escoleta = bool(body.escoleta);
  return {
    type: body.type, title, date: body.date,
    start_time: str(body.start_time, 5), end_time: str(body.end_time, 5),
    location: str(body.location, 200), description: str(body.description, 4000),
    escoleta, escoleta_time: escoleta ? str(body.escoleta_time, 5) : null,
  };
}

route('POST', '/api/events', ({ body }) => {
  const id = insertRow('events', eventInput(body));
  return getEvent(id);
}, 'admin');

route('PUT', '/api/events/:id', ({ params, body }) => {
  getEvent(params.id);
  if (body.type === 'musics' && db.prepare('SELECT 1 FROM castells WHERE event_id = ?').get(params.id)) {
    fail(400, 'Els assajos de músics no tenen castells');
  }
  updateRow('events', params.id, eventInput(body));
  return getEvent(params.id);
}, 'admin');

route('DELETE', '/api/events/:id', ({ params }) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(params.id);
  return { ok: true };
}, 'admin');

route('GET', '/api/events/:id', ({ params, user }) => {
  const event = getEvent(params.id);
  const isAdmin = user.role === 'admin';
  const fields = loadFields(event.id);
  const mine = db.prepare('SELECT * FROM attendance WHERE event_id = ? AND person_id = ?').get(event.id, user.id);
  const castells = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM castell_positions WHERE castell_id = c.id) AS assigned_count
    FROM castells c WHERE c.event_id = ? ORDER BY c.position, c.id`).all(event.id);
  const rows = db.prepare(`SELECT p.id, p.name, p.alias, p.instrument, a.status, a.came, a.escoleta, a.extra, a.comment, a.updated_at,
      ${CAME_SQL} AS present
    FROM people p LEFT JOIN attendance a ON a.person_id = p.id AND a.event_id = ?
    WHERE p.active = 1 OR a.status IS NOT NULL OR a.came IS NOT NULL ORDER BY p.name COLLATE NOCASE`).all(event.id);
  const flag = (v) => (v === null || v === undefined ? null : !!v);
  const attendance = rows.map((r) => isAdmin
    ? { ...r, present: !!r.present, came: flag(r.came), escoleta: flag(r.escoleta), extra: parseJSON(r.extra, {}) }
    : { ...publicPerson(r), instrument: r.instrument, status: r.status, present: !!r.present, escoleta: flag(r.escoleta) });
  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  counts.present = rows.filter((r) => r.present).length;
  counts.walkins = rows.filter((r) => r.came === 1 && r.status !== 'si').length;
  counts.absent = rows.filter((r) => r.came === 0 && r.status === 'si').length;
  counts.escoleta = rows.filter((r) => r.escoleta === 1).length;
  return {
    event, fields, castells, counts,
    mine: mine ? { ...mine, came: flag(mine.came), escoleta: flag(mine.escoleta), extra: parseJSON(mine.extra, {}) } : null,
    attendance: isAdmin ? attendance : attendance.filter((a) => a.present),
  };
});

function upsertAttendance(eventId, personId, patch) {
  const current = db.prepare('SELECT * FROM attendance WHERE event_id = ? AND person_id = ?').get(eventId, personId);
  const pick = (k, fallback = null) => (k in patch ? patch[k] : current?.[k] ?? fallback);
  const row = {
    status: pick('status'), came: pick('came'), escoleta: pick('escoleta'),
    extra: 'extra' in patch ? JSON.stringify(patch.extra) : current?.extra ?? null,
    comment: pick('comment'),
  };
  db.prepare(`INSERT INTO attendance (event_id, person_id, status, came, escoleta, extra, comment, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (event_id, person_id) DO UPDATE SET status = excluded.status, came = excluded.came, escoleta = excluded.escoleta,
      extra = excluded.extra, comment = excluded.comment, updated_at = CURRENT_TIMESTAMP`)
    .run(eventId, personId, row.status, row.came, row.escoleta, row.extra, row.comment);
}

function attendancePatch(event, body, { admin }) {
  const patch = {};
  if ('status' in body) {
    if (body.status !== null && !STATUSES.includes(body.status)) fail(400, 'Estat no vàlid');
    patch.status = body.status;
  }
  if ('extra' in body) patch.extra = cleanExtra(loadFields(event.id), body.extra, !admin && body.status === 'si');
  if ('comment' in body) patch.comment = str(body.comment, 500);
  const tri = (v) => (v === null || v === undefined || v === '' ? null : bool(v));
  if ('escoleta' in body) patch.escoleta = tri(body.escoleta);
  if (admin && 'came' in body) patch.came = tri(body.came);
  return patch;
}

route('PUT', '/api/events/:id/attendance', ({ params, body, user }) => {
  const event = getEvent(params.id);
  upsertAttendance(event.id, user.id, attendancePatch(event, body, { admin: false }));
  return { ok: true };
});

route('PUT', '/api/events/:id/attendance/:personId', ({ params, body }) => {
  const event = getEvent(params.id);
  if (!db.prepare('SELECT 1 FROM people WHERE id = ?').get(params.personId)) fail(404, 'Persona no trobada');
  upsertAttendance(event.id, Number(params.personId), attendancePatch(event, body, { admin: true }));
  return { ok: true };
}, 'admin');

route('GET', '/api/events/:id/attendance.csv', ({ params, res }) => {
  const event = getEvent(params.id);
  const fields = loadFields(event.id);
  const rows = db.prepare(`SELECT p.name, p.alias, a.status, a.escoleta, a.extra, a.comment, ${CAME_SQL} AS present
    FROM attendance a JOIN people p ON p.id = a.person_id WHERE a.event_id = ? ORDER BY p.name COLLATE NOCASE`).all(event.id);
  const cell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const yesNo = (v) => (v ? 'sí' : v === 0 ? 'no' : '');
  const lines = [['Nom', 'Malnom', 'Estat', 'Ha vingut', ...(event.escoleta ? ['Escoleta'] : []), ...fields.map((f) => f.label), 'Comentari'].map(cell).join(';')];
  for (const r of rows) {
    const extra = parseJSON(r.extra, {});
    lines.push([r.name, r.alias, r.status, r.present ? 'sí' : 'no', ...(event.escoleta ? [yesNo(r.escoleta)] : []),
      ...fields.map((f) => (f.kind === 'bool' ? (extra[f.id] ? 'sí' : extra[f.id] === false ? 'no' : '') : extra[f.id])),
      r.comment].map(cell).join(';'));
  }
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="assistencia-${event.date}.csv"`,
  });
  res.end('﻿' + lines.join('\r\n'));
  return undefined;
}, 'admin');

// ---------- Rutes: camps extra ----------
function fieldInput(body) {
  const label = str(body.label, 100);
  if (!label) fail(400, 'El camp necessita un nom');
  if (!FIELD_KINDS.includes(body.kind)) fail(400, 'Tipus de camp no vàlid');
  let options = null;
  if (body.kind === 'select') {
    const list = (Array.isArray(body.options) ? body.options : String(body.options || '').split(','))
      .map((o) => String(o).trim()).filter(Boolean);
    if (list.length < 2) fail(400, 'Una llista necessita almenys dues opcions');
    options = JSON.stringify(list);
  }
  return { label, kind: body.kind, options, required: bool(body.required) };
}

route('POST', '/api/events/:id/fields', ({ params, body }) => {
  getEvent(params.id);
  const position = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM event_fields WHERE event_id = ?').get(params.id).p;
  insertRow('event_fields', { event_id: Number(params.id), position, ...fieldInput(body) });
  return loadFields(params.id);
}, 'admin');

route('DELETE', '/api/fields/:id', ({ params }) => {
  db.prepare('DELETE FROM event_fields WHERE id = ?').run(params.id);
  return { ok: true };
}, 'admin');

// ---------- Rutes: castells i posicions ----------
route('POST', '/api/events/:id/castells', ({ params, body }) => {
  if (getEvent(params.id).type === 'musics') fail(400, 'Els assajos de músics no tenen castells');
  const position = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM castells WHERE event_id = ?').get(params.id).p;
  const id = insertRow('castells', { event_id: Number(params.id), position, ...castellInput(body) });
  return getCastell(id);
}, 'admin');

route('GET', '/api/castells/:id', ({ params, user }) => {
  const castell = getCastell(params.id);
  const isAdmin = user.role === 'admin';
  const event = getEvent(castell.event_id);
  const measures = 'p.birthdate, p.height_cm, p.shoulder_height_cm, p.shoulder_width_cm, p.weight_kg';
  const positions = db.prepare(`SELECT cp.pos_key, cp.person_id, cp.guest_name, p.name, p.alias${isAdmin ? ', ' + measures : ''}
    FROM castell_positions cp LEFT JOIN people p ON p.id = cp.person_id WHERE cp.castell_id = ?`).all(castell.id);
  const siblings = db.prepare('SELECT id, width, height, agulla, folre, manilles, puntals, sota, gralles, timbals, net, from_level, to_level, label, result FROM castells WHERE event_id = ? ORDER BY position, id').all(event.id);
  const result = { castell, event, siblings,
    positions: isAdmin ? positions : positions.map(({ name, alias, ...p }) => (p.person_id ? { ...p, name: publicName({ name, alias }), alias: null } : p)) };
  if (isAdmin) {
    result.candidates = db.prepare(`SELECT p.id, p.name, p.alias, p.instrument, ${measures}, ${EFFECTIVE_STATUS_SQL} AS status
      FROM people p LEFT JOIN attendance a ON a.person_id = p.id AND a.event_id = ?
      WHERE p.active = 1 ORDER BY p.name COLLATE NOCASE`).all(event.id);
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
  });
  return getCastell(castell.id);
}, 'admin');

route('DELETE', '/api/castells/:id', ({ params }) => {
  db.prepare('DELETE FROM castells WHERE id = ?').run(params.id);
  return { ok: true };
}, 'admin');

route('POST', '/api/castells/:id/duplicate', ({ params, body }) => {
  const castell = getCastell(params.id);
  const target = getEvent(body.event_id ?? castell.event_id);
  if (target.type === 'musics') fail(400, 'Els assajos de músics no tenen castells');
  return transaction(() => {
    const { id, event_id, position, ...rest } = castell;
    const nextPos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM castells WHERE event_id = ?').get(target.id).p;
    const newId = insertRow('castells', { ...rest, result: 'previst', event_id: target.id, position: nextPos });
    db.prepare(`INSERT INTO castell_positions (castell_id, pos_key, person_id, guest_name)
      SELECT ?, pos_key, person_id, guest_name FROM castell_positions WHERE castell_id = ?`).run(newId, castell.id);
    return getCastell(newId);
  });
}, 'admin');

route('PUT', '/api/castells/:id/positions/:key', ({ params, body }) => {
  const castell = getCastell(params.id);
  const key = decodeURIComponent(params.key);
  if (!/^[\w-]{1,40}$/.test(key)) fail(400, 'Posició no vàlida');
  const personId = body.person_id ? Number(body.person_id) : null;
  const guest = personId ? null : str(body.guest_name, 80);
  if (personId && !db.prepare('SELECT 1 FROM people WHERE id = ?').get(personId)) fail(404, 'Persona no trobada');
  transaction(() => {
    db.prepare('DELETE FROM castell_positions WHERE castell_id = ? AND pos_key = ?').run(castell.id, key);
    if (personId) {
      // Una persona només pot ocupar una posició dins del mateix castell: la movem.
      db.prepare('DELETE FROM castell_positions WHERE castell_id = ? AND person_id = ?').run(castell.id, personId);
    }
    if (personId || guest) {
      db.prepare('INSERT INTO castell_positions (castell_id, pos_key, person_id, guest_name) VALUES (?, ?, ?, ?)')
        .run(castell.id, key, personId, guest);
    }
  });
  return { ok: true };
}, 'admin');

route('PUT', '/api/castells/:id/positions', ({ params, body }) => {
  const castell = getCastell(params.id);
  if (!Array.isArray(body.assignments)) fail(400, 'Falten les assignacions');
  const list = body.assignments.map((a) => {
    const key = String(a.pos_key || '');
    if (!/^[\w-]{1,40}$/.test(key)) fail(400, 'Posició no vàlida');
    return { key, personId: a.person_id ? Number(a.person_id) : null };
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
}, 'admin');

// ---------- Historial de posicions ----------
// L'historial surt dels castells de sessions passades (fins avui inclòs).
function historyRows({ personId, excludeCastell, query } = {}) {
  const { where, args } = statsFilter(query);
  where.push('cp.person_id IS NOT NULL');
  if (personId) { where.push('cp.person_id = ?'); args.push(personId); }
  if (excludeCastell) { where.push('c.id != ?'); args.push(excludeCastell); }
  return db.prepare(`SELECT cp.pos_key, cp.person_id, c.id AS castell_id, c.width, c.height, c.agulla, c.folre, c.manilles, c.puntals, c.sota,
      c.gralles, c.timbals, c.net, c.from_level, c.to_level, c.cordons, c.result, e.id AS event_id, e.date, e.title, e.type
    FROM castell_positions cp JOIN castells c ON c.id = cp.castell_id JOIN events e ON e.id = c.event_id
    WHERE ${where.join(' AND ')} ORDER BY e.date DESC, c.position`).all(...args);
}

route('GET', '/api/castells/:id/history', ({ params, user }) => {
  const castell = getCastell(params.id);
  const rows = historyRows({ excludeCastell: castell.id });
  const exact = new Map();
  const byCat = {};
  const sameWidth = new Set();
  for (const r of rows) {
    if (r.width === castell.width) {
      sameWidth.add(r.castell_id);
      const k = `${r.pos_key}|${r.person_id}`;
      const e = exact.get(k) || { pos_key: r.pos_key, person_id: r.person_id, n: 0, last: r.date };
      e.n++;
      exact.set(k, e);
    }
    const cat = positionOf(r, r.pos_key)?.cat;
    if (cat) (byCat[r.person_id] ??= {})[cat] = (byCat[r.person_id][cat] || 0) + 1;
  }
  const people = new Map(db.prepare('SELECT id, name, alias FROM people').all().map((p) => [p.id, p]));
  return {
    castellsCount: sameWidth.size,
    exact: [...exact.values()].map((e) => ({ ...e, name: people.get(e.person_id)?.name, alias: people.get(e.person_id)?.alias })),
    byCat: user.role === 'admin' ? byCat : undefined,
  };
}, 'admin');

route('GET', '/api/people/:id/history', ({ params, user }) => {
  const personId = Number(params.id);
  if (user.role !== 'admin' && user.id !== personId) fail(403, 'Només pots veure el teu historial');
  const rows = historyRows({ personId });
  const cats = new Map();
  for (const r of rows) {
    const cat = positionOf(r, r.pos_key)?.cat;
    if (!cat) continue;
    const c = cats.get(cat) || { cat, n: 0, last: r.date };
    c.n++;
    cats.set(cat, c);
  }
  return {
    total: rows.length,
    byCat: [...cats.values()].sort((a, b) => b.n - a.n),
    recent: rows.slice(0, 20).map((r) => ({
      date: r.date, title: r.title, type: r.type, event_id: r.event_id, castell_id: r.castell_id, result: r.result,
      castell: castellName(r), role: positionOf(r, r.pos_key)?.role ?? r.pos_key,
    })),
  };
});

// ---------- Estadístiques ----------
// Una temporada és un any natural (2025, 2026…). Només compten les sessions passades (fins avui inclòs).
const STATS_RESULTS = ['descarregat', 'carregat', 'intent', 'intent desfet', 'previst'];
const emptyResults = () => Object.fromEntries(STATS_RESULTS.map((r) => [r, 0]));
const resultOf = (r) => (STATS_RESULTS.includes(r.result) ? r.result : 'previst');

// Filtre comú: temporada (any) i tipus de sessió (diades o assajos).
function statsFilter(query) {
  const where = ["e.date <= date('now','localtime')"];
  const args = [];
  const season = query?.get('season') || '';
  const kind = query?.get('kind');
  if (/^\d{4}$/.test(season)) { where.push("strftime('%Y', e.date) = ?"); args.push(season); }
  if (kind === 'diades') where.push("e.type IN ('diada', 'esdeveniment')");
  else if (kind === 'assajos') where.push("e.type = 'assaig'");
  return { where, args };
}

function seasons() {
  const years = db.prepare("SELECT DISTINCT strftime('%Y', date) AS y FROM events WHERE date <= date('now','localtime') ORDER BY y DESC")
    .all().map((r) => r.y);
  const now = String(new Date().getFullYear());
  if (!years.includes(now)) years.unshift(now);
  return years;
}

// Sessions on la persona ha vingut, per tipus.
function sessionsCame(query, personId = null) {
  const { where, args } = statsFilter(query);
  if (personId) { where.push('a.person_id = ?'); args.push(personId); }
  return db.prepare(`SELECT a.person_id, e.type, COUNT(*) AS n FROM attendance a JOIN events e ON e.id = a.event_id
    WHERE ${CAME_SQL} AND ${where.join(' AND ')} GROUP BY a.person_id, e.type`).all(...args);
}

const byCount = (a, b) => b.n - a.n || String(a.castell ?? a.cat).localeCompare(String(b.castell ?? b.cat));

function personStats(personId, query) {
  const rows = historyRows({ personId, query });
  const results = emptyResults();
  const byCastell = new Map();
  const byPosition = new Map();
  for (const r of rows) {
    const res = resultOf(r);
    const cat = positionOf(r, r.pos_key)?.cat ?? r.pos_key;
    const name = castellName(r);
    results[res]++;
    const c = byCastell.get(name) || { castell: name, n: 0, partial: 0, results: emptyResults(), positions: new Map() };
    c.n++;
    c.results[res]++;
    if (levelRange(r).partial) c.partial++;
    c.positions.set(cat, (c.positions.get(cat) || 0) + 1);
    byCastell.set(name, c);
    const p = byPosition.get(cat) || { cat, n: 0, results: emptyResults() };
    p.n++;
    p.results[res]++;
    byPosition.set(cat, p);
  }
  const sessions = {};
  for (const r of sessionsCame(query, personId)) sessions[r.type] = r.n;
  return {
    total: rows.length,
    results,
    sessions,
    byCastell: [...byCastell.values()].map((c) => ({ ...c, positions: [...c.positions].map(([cat, n]) => ({ cat, n })).sort(byCount) })).sort(byCount),
    byPosition: [...byPosition.values()].sort(byCount),
    recent: rows.slice(0, 15).map((r) => ({
      date: r.date, title: r.title, type: r.type, castell_id: r.castell_id, result: r.result, partial: levelRange(r).partial,
      castell: castellName(r), role: positionOf(r, r.pos_key)?.role ?? r.pos_key,
    })),
  };
}

route('GET', '/api/stats/people/:id', ({ params, user, query }) => {
  const personId = Number(params.id);
  if (user.role !== 'admin' && user.id !== personId) fail(403, 'Només pots veure les teves estadístiques');
  const person = db.prepare('SELECT id, name, alias, instrument FROM people WHERE id = ?').get(personId);
  if (!person) fail(404, 'Persona no trobada');
  return { person: user.role === 'admin' ? person : publicPerson(person), seasons: seasons(), ...personStats(personId, query) };
});

route('GET', '/api/stats/people', ({ query }) => {
  const people = new Map(db.prepare('SELECT id, name, alias, instrument, active FROM people').all()
    .map((p) => [p.id, { ...p, castells: 0, sessions: 0, results: emptyResults(), cats: new Map() }]));
  for (const r of historyRows({ query })) {
    const p = people.get(r.person_id);
    if (!p) continue;
    p.castells++;
    p.results[resultOf(r)]++;
    const cat = positionOf(r, r.pos_key)?.cat ?? r.pos_key;
    p.cats.set(cat, (p.cats.get(cat) || 0) + 1);
  }
  for (const r of sessionsCame(query)) {
    const p = people.get(r.person_id);
    if (p) p.sessions += r.n;
  }
  const list = [...people.values()]
    .filter((p) => p.active || p.castells || p.sessions)
    .map(({ cats, ...p }) => {
      const [top] = [...cats].sort((a, b) => b[1] - a[1]);
      return { ...p, top: top ? { cat: top[0], n: top[1] } : null };
    })
    .sort((a, b) => b.castells - a.castells || b.sessions - a.sessions || a.name.localeCompare(b.name));
  return { seasons: seasons(), people: list };
}, 'admin');

route('GET', '/api/stats/castells', ({ query }) => {
  const { where, args } = statsFilter(query);
  const rows = db.prepare(`SELECT c.id, c.width, c.height, c.agulla, c.folre, c.manilles, c.puntals, c.sota, c.net, c.from_level, c.to_level,
      c.result, c.label, e.id AS event_id, e.date, e.title, e.type
    FROM castells c JOIN events e ON e.id = c.event_id
    WHERE ${where.join(' AND ')} ORDER BY e.date DESC, c.position`).all(...args);
  const totals = emptyResults();
  const types = new Map();
  for (const r of rows) {
    const res = resultOf(r);
    const partial = levelRange(r).partial;
    const name = castellName(r);
    totals[res]++;
    const c = types.get(name) || { castell: name, n: 0, partial: 0, assajos: 0, diades: 0, results: emptyResults(), firstDescarregat: null, attempts: [] };
    c.n++;
    c.results[res]++;
    if (partial) c.partial++;
    if (r.type === 'assaig') c.assajos++; else c.diades++;
    // El primer descarregat és el primer castell sencer descarregat (les proves parcials no compten).
    if (res === 'descarregat' && !partial) c.firstDescarregat = r.date;
    c.attempts.push({ castell_id: r.id, date: r.date, title: r.title, type: r.type, result: r.result, partial, label: r.label });
    types.set(name, c);
  }
  return { seasons: seasons(), total: rows.length, results: totals, castells: [...types.values()].sort(byCount) };
}, 'admin');

// ---------- Servidor HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, pathname) {
  const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404).end('No trobat'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(html);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) { reject(new HttpError(413, 'Petició massa gran')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'JSON no vàlid')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, decodeURIComponent(url.pathname));

  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  try {
    const match = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!match) fail(404, 'Ruta no trobada');
    const values = url.pathname.match(match.re).slice(1);
    const params = Object.fromEntries(match.keys.map((k, i) => [k, values[i]]));
    const user = currentUser(req);
    if (match.auth !== 'public' && !user) fail(401, 'Cal iniciar sessió');
    if (match.auth === 'admin' && user.role !== 'admin') fail(403, 'Només per a administradors');
    const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
    const result = await match.handler({ req, res, params, body, user, query: url.searchParams });
    if (result !== undefined) send(200, result);
  } catch (err) {
    const lang = String(req.headers['x-lang'] || 'ca');
    if (err instanceof HttpError) send(err.status, { error: translate(lang, err.message, err.params) });
    else if (String(err.message).includes('constraint')) send(400, { error: translate(lang, 'Dades no vàlides') });
    else { console.error(err); send(500, { error: translate(lang, 'Error intern del servidor') }); }
  }
});

server.listen(PORT, () => console.log(`${COLLA_NAME} → http://localhost:${PORT}`));
