import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import zlib from 'node:zlib';
import { db, hashPassword, hashToken, verifyPassword, transaction } from './db.js';
import { buildStructure, castellName, levelNames, levelRange, positionOf, structureOf } from './public/castell.js';
import { translate } from './public/i18n.js';

// Les dates i hores de les sessions són hora d'aquí, encara que el servidor sigui en un altre lloc.
process.env.TZ ||= 'Europe/Madrid';
const PORT = Number(process.env.PORT) || 3000;
const COLLA_NAME = process.env.COLLA_NAME || 'La meva colla';
const PUBLIC_DIR = path.join(import.meta.dirname, 'public');
const COLLA_CODE = process.env.COLLA_CODE || '';
// Mode demostració: la pantalla d'entrada explica com provar l'app (les dades es tornen a crear a cada arrencada amb «npm run demo»).
const DEMO = process.env.DEMO === '1';
// Només darrere d'un proxy (Render el posa sol) es pot fer cas de X-Forwarded-For; si no, el client se la pot inventar.
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || !!process.env.RENDER;
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
const MEMBER_TTL_MS = 365 * 24 * 3600 * 1000;
const DEVICE_TTL_MS = 365 * 24 * 3600 * 1000;

// ---------- Primer arrencada: crear un compte d'administració si no n'hi ha cap ----------
if (!db.prepare('SELECT 1 FROM admins').get()) {
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  db.prepare("INSERT INTO admins (username, password_hash, name) VALUES ('admin', ?, 'Administració')").run(hashPassword(password));
  console.log(`\n  Compte d'administració creat → usuari: admin · contrasenya: ${password}\n  (canvia-la des de «Comptes»)\n`);
}
const purgeTokens = () => {
  db.prepare('DELETE FROM auth_tokens WHERE expires_at < ?').run(Date.now());
  db.prepare('DELETE FROM admin_tokens WHERE expires_at < ?').run(Date.now());
  db.prepare('DELETE FROM admin_devices WHERE expires_at < ?').run(Date.now());
};
purgeTokens();
setInterval(purgeTokens, 6 * 3600 * 1000).unref();

// ---------- Utilitats ----------
// Els missatges d'error es tradueixen a l'idioma de l'usuari (capçalera X-Lang).
class HttpError extends Error {
  constructor(status, message, params) { super(message); this.status = status; this.params = params; }
}
const fail = (status, message, params) => { throw new HttpError(status, message, params); };

const EVENT_TYPES = ['assaig', 'diada', 'esdeveniment', 'musics'];
const INSTRUMENTS = ['gralla', 'timbal'];
const FIELD_KINDS = ['number', 'text', 'bool', 'select'];
const STATUSES = ['si', 'no'];
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
const pad = (n) => String(n).padStart(2, '0');
const localStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const nowLocal = () => localStamp(new Date());
// Es pot respondre fins a la data límit o, si la sessió no en té, fins al mateix dia de la sessió.
const rsvpOpen = (e) => (e.rsvp_until ? nowLocal() < e.rsvp_until : nowLocal().slice(0, 10) <= e.date);

// Els membres entren sense contrasenya (qualsevol pot triar qualsevol nom), així que de la gent només veuen
// el malnom; si algú no en té, «Nom I.». Les dades personals només les veuen els administradors.
const publicName = (p) => p.alias || String(p.name || '').replace(/^(\S+)\s+(\S).*$/, '$1 $2.');
const publicPerson = (p) => ({ id: p.id, name: publicName(p), alias: null });

function personRow(p) {
  if (!p) return null;
  // username, password_hash i role són d'una versió anterior (ara els comptes d'administració són a part).
  const { password_hash, username, role, ...rest } = p;
  return rest;
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
    } else if (f === 'instrument') {
      if (body.instrument && !INSTRUMENTS.includes(body.instrument)) fail(400, 'Instrument no vàlid');
      out.instrument = body.instrument || null;
    } else if (f === 'active') out.active = bool(body.active);
    else out[f] = str(body[f], f === 'notes' ? 2000 : 200);
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
    tech_notes: str(merged.tech_notes, 1000),
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

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

// A la base de dades només hi ha el resum de cada sessió (hashToken): el valor de la cookie no es guarda enlloc.
function memberSession(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = db.prepare(`SELECT p.* FROM auth_tokens t JOIN people p ON p.id = t.person_id
    WHERE t.token = ? AND t.mode = 'member' AND t.expires_at > ? AND p.active = 1`).get(tokenHash, Date.now());
  return row ? { ...row, role: 'member', mode: 'member', tokenHash } : null;
}

function adminSession(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = db.prepare(`SELECT a.* FROM admin_tokens t JOIN admins a ON a.id = t.admin_id
    WHERE t.token = ? AND t.expires_at > ?`).get(tokenHash, Date.now());
  // Un compte d'administració no és cap persona de la colla: no té assistència ni posicions (id null).
  return row ? { id: null, admin_id: row.id, name: row.name, username: row.username, password_hash: row.password_hash, role: 'admin', mode: 'admin', tokenHash } : null;
}

// Crea una sessió (o una marca de mòbil conegut) i en torna el valor per a la cookie.
// Com a molt 20 per persona o compte: que no es pugui omplir la base de dades.
function newToken(table, owner, id, ttlMs, extra = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  insertRow(table, { token: hashToken(token), [owner]: id, expires_at: Date.now() + ttlMs, ...extra });
  db.prepare(`DELETE FROM ${table} WHERE ${owner} = ? AND token NOT IN
    (SELECT token FROM ${table} WHERE ${owner} = ? ORDER BY expires_at DESC LIMIT 20)`).run(id, id);
  return token;
}

// Al mateix mòbil hi pot haver oberta l'entrada de membre i la d'administració alhora;
// la cookie «mode» diu amb quina s'està treballant ara (es canvia des dels ajustos).
function currentUser(req) {
  const c = cookies(req);
  const member = memberSession(c.token);
  const admin = adminSession(c.atoken);
  const user = (c.mode === 'admin' && admin) || member || admin;
  if (user) user.sessions = { member: member ? publicPerson(member) : null, admin: !!admin };
  return user;
}

function cookieHeader(req, name, value, maxAgeSec) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`;
}
const modeCookie = (req, mode) => cookieHeader(req, 'mode', mode, MEMBER_TTL_MS / 1000);

// D'on ve la petició, per comptar-ne els intents.
function clientIp(req) {
  // Darrere del proxy (Render), l'última adreça és la que hi afegeix el proxy: les anteriors les pot inventar el client.
  const forwarded = TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() : '';
  const ip = forwarded || req.socket.remoteAddress || '';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (net.isIP(ip) !== 6) return ip;
  // Amb IPv6, cada casa o mòbil té milions d'adreces (un bloc /64): es compta el bloc sencer, o canviar d'adreça saltaria el límit.
  const [head, tail = ''] = ip.split('%')[0].split('::');
  const a = head ? head.split(':') : [], b = tail ? tail.split(':') : [];
  const groups = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

// Comptadors per finestra de temps (en memòria): intents fallits d'entrar, entrades de membres…
class RateLimit {
  constructor(max, windowMs) { this.max = max; this.windowMs = windowMs; this.hits = new Map(); }
  blocked(key) { const h = this.hits.get(key); return !!h && h.until > Date.now() && h.n >= this.max; }
  add(key) {
    const h = this.hits.get(key);
    this.hits.set(key, h && h.until > Date.now() ? { n: h.n + 1, until: h.until } : { n: 1, until: Date.now() + this.windowMs });
    // Que no creixi sense límit si algú prova des de moltes adreces: fora els caducats i, si encara n'hi ha massa, els més antics.
    if (this.hits.size > 10000) {
      for (const [k, v] of this.hits) if (v.until <= Date.now()) this.hits.delete(k);
      for (const k of this.hits.keys()) { if (this.hits.size <= 9000) break; this.hits.delete(k); }
    }
  }
  reset(key) { this.hits.delete(key); }
}
const TOO_MANY = "Massa intents. Torna-ho a provar d'aquí a una estona.";
// Contrasenyes d'administració: 10 errors per adreça i, des de qualsevol lloc, 50 per compte cada 15 minuts.
const loginByIp = new RateLimit(10, 15 * 60 * 1000);
const loginByUser = new RateLimit(50, 15 * 60 * 1000);
// Entrar com a membre és lliure, però sense inundar la base de dades de sessions (tota la colla pot ser a la mateixa wifi).
const identifyByIp = new RateLimit(150, 10 * 60 * 1000);
// Codi de la colla: 20 errors per adreça cada 15 minuts (que no es pugui endevinar provant).
const codeByIp = new RateLimit(20, 15 * 60 * 1000);
// Per comparar el mateix temps tant si l'usuari existeix com si no (que no es pugui endevinar qui és administrador).
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

// Un mòbil on aquest compte ja ha entrat bé abans.
function knownDevice(req, adminId) {
  const token = cookies(req).adev;
  return !!token && !!db.prepare('SELECT 1 FROM admin_devices WHERE token = ? AND admin_id = ? AND expires_at > ?')
    .get(hashToken(token), adminId, Date.now());
}
const deviceCookie = (req, adminId) => (knownDevice(req, adminId) ? []
  : [cookieHeader(req, 'adev', newToken('admin_devices', 'admin_id', adminId, DEVICE_TTL_MS), DEVICE_TTL_MS / 1000)]);

// Comprova la contrasenya d'un compte (per entrar o per confirmar un canvi), comptant-ne els errors.
// Des d'un mòbil conegut del compte no hi ha bloqueig per compte: si no, qualsevol podria deixar fora l'administració
// provant contrasenyes dolentes; el límit per adreça sí que hi és sempre.
async function checkPassword(req, username, admin, password) {
  const ip = clientIp(req);
  const trusted = knownDevice(req, admin?.id ?? 0);
  if (loginByIp.blocked(ip) || (!trusted && loginByUser.blocked(username))) fail(429, TOO_MANY);
  const valid = await verifyPassword(String(password || '').slice(0, 200), admin?.password_hash ?? DUMMY_HASH);
  if (admin && valid) { loginByIp.reset(ip); return true; }
  loginByIp.add(ip);
  if (!trusted) loginByUser.add(username);
  return false;
}
// Amb una sessió d'administració oberta (o robada) no es pot canviar cap contrasenya ni cap compte sense saber la pròpia.
async function confirmPassword(req, user, password) {
  if (!(await checkPassword(req, user.username, { id: user.admin_id, password_hash: user.password_hash }, password))) {
    fail(400, 'La contrasenya actual no és correcta');
  }
}

const COMMON_PASSWORDS = new Set(['12345678', '123456789', '1234567890', '87654321', '12341234', '11223344', 'abcd1234', 'abc12345',
  'password', 'password1', 'contrasenya', 'contraseña', 'qwertyui', 'qwertyuiop', 'qwerty123', 'admin123', 'admin1234', 'administrador',
  'iloveyou', 'castells', 'castellers', 'castellera']);
function newPassword(password, username) {
  const p = String(password || '');
  if (p.length < 8) fail(400, 'La contrasenya ha de tenir almenys 8 caràcters');
  if (p.length > 200) fail(400, 'La contrasenya pot tenir com a molt 200 caràcters');
  const low = p.toLowerCase();
  if (low === username || /^(.)\1*$/.test(p) || COMMON_PASSWORDS.has(low)) fail(400, "Aquesta contrasenya és massa fàcil d'endevinar");
  return hashPassword(p);
}

const meResponse = (user) => (user.mode === 'admin'
  ? { id: null, admin_id: user.admin_id, name: user.name, username: user.username, role: 'admin', mode: 'admin', sessions: user.sessions }
  : { ...publicPerson(user), alias: user.alias, instrument: user.instrument, role: 'member', mode: 'member', sessions: user.sessions });

// ---------- Rutes: autenticació i perfil ----------
route('GET', '/api/config', () => ({ collaName: COLLA_NAME, needsCode: !!COLLA_CODE, demo: DEMO }), 'public');

// Es compara en temps constant (pels resums, que tenen la mateixa llargada) i amb límit d'errors.
function checkCollaCode(req, code) {
  if (!COLLA_CODE) return;
  const ip = clientIp(req);
  if (codeByIp.blocked(ip)) fail(429, TOO_MANY);
  if (!crypto.timingSafeEqual(Buffer.from(hashToken(String(code || '').trim())), Buffer.from(hashToken(COLLA_CODE)))) {
    codeByIp.add(ip);
    fail(401, 'El codi de la colla no és correcte');
  }
}

// Entrada de membres: sense contrasenya, només triant qui ets.
route('POST', '/api/directory', ({ body, req }) => {
  checkCollaCode(req, body.code);
  return db.prepare('SELECT id, name, alias FROM people WHERE active = 1').all().map(publicPerson)
    .sort((a, b) => a.name.localeCompare(b.name, 'ca'));
}, 'public');

route('POST', '/api/identify', ({ body, req, res }) => {
  const ip = clientIp(req);
  if (identifyByIp.blocked(ip)) fail(429, TOO_MANY);
  identifyByIp.add(ip);
  checkCollaCode(req, body.code);
  const person = db.prepare('SELECT * FROM people WHERE id = ? AND active = 1').get(Number(body.person_id)) || fail(404, 'Persona no trobada');
  // Si en aquest mòbil ja hi havia algú, la seva sessió s'acaba (no en queden de penjades).
  const old = cookies(req).token;
  if (old) db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(hashToken(old));
  const token = newToken('auth_tokens', 'person_id', person.id, MEMBER_TTL_MS, { mode: 'member' });
  res.setHeader('Set-Cookie', [cookieHeader(req, 'token', token, MEMBER_TTL_MS / 1000), modeCookie(req, 'member')]);
  const admin = adminSession(cookies(req).atoken);
  return meResponse({ ...person, role: 'member', mode: 'member', sessions: { member: publicPerson(person), admin: !!admin } });
}, 'public');

route('POST', '/api/login', async ({ body, req, res }) => {
  const username = String(body.username || '').trim().toLowerCase().slice(0, 60);
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!(await checkPassword(req, username, admin, body.password))) fail(401, 'Usuari o contrasenya incorrectes');
  const old = cookies(req).atoken;
  if (old) db.prepare('DELETE FROM admin_tokens WHERE token = ?').run(hashToken(old));
  const token = newToken('admin_tokens', 'admin_id', admin.id, TOKEN_TTL_MS);
  res.setHeader('Set-Cookie', [cookieHeader(req, 'atoken', token, TOKEN_TTL_MS / 1000), modeCookie(req, 'admin'), ...deviceCookie(req, admin.id)]);
  const member = memberSession(cookies(req).token);
  return meResponse({ ...adminSession(token), sessions: { member: member ? publicPerson(member) : null, admin: true } });
}, 'public');

// Surt de l'entrada que s'està fent servir ara (la de membre o la d'administració); l'altra, si n'hi ha, es manté.
route('POST', '/api/logout', ({ user, req, res }) => {
  if (user.mode === 'admin') {
    db.prepare('DELETE FROM admin_tokens WHERE token = ?').run(user.tokenHash);
    res.setHeader('Set-Cookie', [cookieHeader(req, 'atoken', '', 0), modeCookie(req, 'member')]);
  } else {
    db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(user.tokenHash);
    res.setHeader('Set-Cookie', cookieHeader(req, 'token', '', 0));
  }
  return { ok: true };
});

// Canvia entre «membre» i «administració» sense tornar a entrar.
route('POST', '/api/mode', ({ user, body, req, res }) => {
  const mode = body.mode === 'admin' ? 'admin' : 'member';
  if (mode === 'admin' ? !user.sessions.admin : !user.sessions.member) fail(400, 'Primer has d\'entrar-hi');
  res.setHeader('Set-Cookie', modeCookie(req, mode));
  return { ok: true };
});

route('GET', '/api/me', ({ user, req, res }) => {
  // Els administradors que ja tenien la sessió oberta d'abans també queden com a mòbil conegut.
  if (user.mode === 'admin') res.setHeader('Set-Cookie', deviceCookie(req, user.admin_id));
  return meResponse(user);
});

// Els administradors poden canviar el nom i la contrasenya del seu compte.
route('PUT', '/api/me', async ({ user, body, req }) => {
  const name = 'name' in body ? str(body.name, 100) : user.name;
  if (!name) fail(400, 'El nom és obligatori');
  if (body.newPassword) {
    await confirmPassword(req, user, body.currentPassword);
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newPassword(body.newPassword, user.username), user.admin_id);
    db.prepare('DELETE FROM admin_tokens WHERE admin_id = ? AND token != ?').run(user.admin_id, user.tokenHash);
  }
  db.prepare('UPDATE admins SET name = ? WHERE id = ?').run(name, user.admin_id);
  return { ok: true, name };
}, 'admin');

// ---------- Rutes: comptes d'administració ----------
const adminRow = (a) => ({ id: a.id, username: a.username, name: a.name, created_at: a.created_at });
function adminInput(body, existing = null) {
  const out = {};
  if ('name' in body || !existing) {
    out.name = str(body.name, 100);
    if (!out.name) fail(400, 'El nom és obligatori');
  }
  if ('username' in body || !existing) {
    out.username = String(str(body.username, 60) || '').toLowerCase();
    if (!/^[a-z0-9._-]{3,}$/.test(out.username)) fail(400, "L'usuari ha de tenir almenys 3 lletres o números, sense espais");
    if (db.prepare('SELECT 1 FROM admins WHERE username = ? AND id != ?').get(out.username, existing?.id ?? 0)) fail(400, "Aquest nom d'usuari ja existeix");
  }
  if (body.password || !existing) out.password_hash = newPassword(body.password, out.username ?? existing.username);
  return out;
}

route('GET', '/api/admins', () => db.prepare('SELECT * FROM admins ORDER BY name COLLATE NOCASE').all().map(adminRow), 'admin');

// Crear, canviar o esborrar comptes d'administració demana la contrasenya de qui ho fa.
route('POST', '/api/admins', async ({ body, user, req }) => {
  await confirmPassword(req, user, body.currentPassword);
  const data = adminInput(body);
  const id = insertRow('admins', data);
  return adminRow(db.prepare('SELECT * FROM admins WHERE id = ?').get(id));
}, 'admin');

route('PUT', '/api/admins/:id', async ({ params, body, user, req }) => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(params.id) || fail(404, 'Compte no trobat');
  await confirmPassword(req, user, body.currentPassword);
  const data = adminInput(body, admin);
  updateRow('admins', admin.id, data);
  // Amb una contrasenya nova, totes les sessions i mòbils coneguts d'aquell compte s'han de tornar a fer.
  if (data.password_hash) {
    db.prepare('DELETE FROM admin_tokens WHERE admin_id = ? AND token != ?').run(admin.id, user.tokenHash);
    db.prepare('DELETE FROM admin_devices WHERE admin_id = ?').run(admin.id);
  }
  return adminRow(db.prepare('SELECT * FROM admins WHERE id = ?').get(admin.id));
}, 'admin');

route('DELETE', '/api/admins/:id', async ({ params, user, body, req }) => {
  if (Number(params.id) === user.admin_id) fail(400, 'No pots esborrar el compte amb què has entrat');
  await confirmPassword(req, user, body.currentPassword);
  if (db.prepare('SELECT COUNT(*) AS n FROM admins').get().n <= 1) fail(400, "Ha de quedar almenys un compte d'administració");
  db.prepare('DELETE FROM admins WHERE id = ?').run(params.id);
  return { ok: true };
}, 'admin');

// Qui ha vingut de debò: el que hagi marcat l'admin o, si no ha marcat res, qui havia dit «Vinc».
const CAME_SQL = "COALESCE(a.came, a.status = 'si', 0) = 1";
// Estat «efectiu» per muntar castells: qui no ha vingut no compta i qui ha vingut sense apuntar-se, sí.
const EFFECTIVE_STATUS_SQL = "CASE WHEN a.came = 0 THEN 'no' WHEN a.came = 1 THEN 'si' ELSE a.status END";

// ---------- Rutes: persones (administradors) ----------
// L'assistència de la llista de persones és la de la temporada (l'any natural), fins avui.
// Els assajos de músics no hi compten: la majoria de gent no hi ha d'anar i li baixaria el percentatge.
const SEASON_SQL = "e.date >= strftime('%Y-01-01','now','localtime') AND e.date <= date('now','localtime') AND e.type != 'musics'";
route('GET', '/api/people', () => {
  const people = db.prepare(`SELECT p.*,
      (SELECT COUNT(*) FROM attendance a JOIN events e ON e.id = a.event_id
        WHERE a.person_id = p.id AND ${CAME_SQL} AND ${SEASON_SQL}) AS attended,
      (SELECT COUNT(*) FROM attendance a JOIN events e ON e.id = a.event_id
        WHERE a.person_id = p.id AND a.status = 'si' AND ${SEASON_SQL}) AS confirmed
    FROM people p ORDER BY p.active DESC, p.name COLLATE NOCASE`).all();
  const pastEvents = db.prepare(`SELECT COUNT(*) AS n FROM events e WHERE ${SEASON_SQL}`).get().n;
  return { people: people.map(personRow), pastEvents, season: String(new Date().getFullYear()) };
}, 'admin');

route('POST', '/api/people', ({ body }) => {
  const data = pickPersonFields(body, PROFILE_FIELDS);
  if (!data.name) fail(400, 'El nom és obligatori');
  checkAliasUnique(data.alias);
  const id = insertRow('people', data);
  return personRow(db.prepare('SELECT * FROM people WHERE id = ?').get(id));
}, 'admin');

route('PUT', '/api/people/:id', ({ params, body }) => {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(params.id) || fail(404, 'Persona no trobada');
  const data = pickPersonFields(body, [...PROFILE_FIELDS, 'active']);
  checkAliasUnique(data.alias, person.id);
  updateRow('people', person.id, data);
  if (data.active === 0) db.prepare('DELETE FROM auth_tokens WHERE person_id = ?').run(person.id);
  return personRow(db.prepare('SELECT * FROM people WHERE id = ?').get(person.id));
}, 'admin');

route('DELETE', '/api/people/:id', ({ params }) => {
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
      (SELECT COUNT(*) FROM attendance WHERE event_id = e.id AND status = 'no') AS count_no,
      (SELECT GROUP_CONCAT(width || '|' || height || '|' || agulla || '|' || folre || '|' || manilles || '|' || puntals || '|' || sota
          || '|' || net || '|' || result, ';')
         FROM (SELECT * FROM castells WHERE event_id = e.id ORDER BY position, id)) AS castells
    FROM events e LEFT JOIN attendance a ON a.event_id = e.id AND a.person_id = ?
    WHERE ${when}${hideMusics ? " AND e.type != 'musics'" : ''}
    ORDER BY e.date ${past && !range ? 'DESC' : 'ASC'}, e.start_time ${past && !range ? 'DESC' : 'ASC'}
    LIMIT 200`).all(user.id, ...(range ? [from, to] : [])).map((e) => ({ ...e, rsvp_open: rsvpOpen(e) }));
});

function eventInput(body) {
  if (!EVENT_TYPES.includes(body.type)) fail(400, 'Tipus de sessió no vàlid');
  if (!isDate(body.date)) fail(400, 'Data no vàlida');
  if (!isTime(body.start_time) || !isTime(body.end_time)) fail(400, 'Hora no vàlida');
  const title = str(body.title, 150);
  if (!title) fail(400, 'El títol és obligatori');
  if (!isTime(body.escoleta_time)) fail(400, 'Hora no vàlida');
  const escoleta = bool(body.escoleta);
  const until = body.rsvp_until ? String(body.rsvp_until).slice(0, 16) : null;
  if (until && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(until)) fail(400, 'Data límit no vàlida');
  return {
    rsvp_until: until,
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

// Tancar les respostes ara mateix (o tornar-les a obrir, sense data límit).
route('POST', '/api/events/:id/rsvp', ({ params, body }) => {
  getEvent(params.id);
  db.prepare('UPDATE events SET rsvp_until = ? WHERE id = ?').run(body.open ? null : nowLocal(), params.id);
  const event = getEvent(params.id);
  return { ...event, rsvp_open: rsvpOpen(event) };
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
    FROM castells c WHERE c.event_id = ? ORDER BY c.position, c.id`).all(event.id)
    .map((c) => (isAdmin ? c : { ...c, tech_notes: undefined }));
  const rows = db.prepare(`SELECT p.id, p.name, p.alias, p.instrument, a.status, a.came, a.escoleta, a.extra, a.comment, a.updated_at,
      ${CAME_SQL} AS present
    FROM people p LEFT JOIN attendance a ON a.person_id = p.id AND a.event_id = ?
    WHERE p.active = 1 OR a.status IS NOT NULL OR a.came IS NOT NULL ORDER BY p.name COLLATE NOCASE`).all(event.id);
  const flag = (v) => (v === null || v === undefined ? null : !!v);
  const attendance = rows.map((r) => isAdmin
    ? { ...r, present: !!r.present, came: flag(r.came), escoleta: flag(r.escoleta), extra: parseJSON(r.extra, {}) }
    : { ...publicPerson(r), instrument: r.instrument, status: r.status, present: !!r.present });
  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  counts.present = rows.filter((r) => r.present).length;
  counts.walkins = rows.filter((r) => r.came === 1 && r.status !== 'si').length;
  counts.absent = rows.filter((r) => r.came === 0 && r.status === 'si').length;
  counts.escoleta = rows.filter((r) => r.escoleta === 1).length;
  return {
    event: { ...event, rsvp_open: rsvpOpen(event) }, fields, castells, counts,
    guests: isAdmin ? guestsOf(event.id) : undefined,
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
  if (user.mode === 'admin') fail(403, 'Per respondre, canvia a la teva fitxa de membre');
  if (!rsvpOpen(event)) fail(400, "Ja no es pot respondre a aquesta sessió. Si hi ha cap canvi, digues-ho a un administrador.");
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
  // Els comentaris els escriu qualsevol: es neutralitza el que un full de càlcul llegiria com a fórmula.
  const cell = (v) => `"${String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`;
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
    'Cache-Control': 'no-store',
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

// ---------- Rutes: persones temporals d'una sessió ----------
function guestInput(body) {
  const name = str(body.name, 80);
  if (!name) fail(400, 'El nom és obligatori');
  return { name, colla: str(body.colla, 80), shoulder_height_cm: num(body.shoulder_height_cm), weight_kg: num(body.weight_kg) };
}
const guestsOf = (eventId) => db.prepare(`SELECT g.*, (SELECT COUNT(*) FROM castell_positions WHERE guest_id = g.id) AS placed
  FROM event_guests g WHERE g.event_id = ? ORDER BY g.name COLLATE NOCASE`).all(eventId);

route('POST', '/api/events/:id/guests', ({ params, body }) => {
  const event = getEvent(params.id);
  const id = insertRow('event_guests', { event_id: event.id, ...guestInput(body) });
  return db.prepare('SELECT * FROM event_guests WHERE id = ?').get(id);
}, 'admin');

route('PUT', '/api/guests/:id', ({ params, body }) => {
  const guest = db.prepare('SELECT * FROM event_guests WHERE id = ?').get(params.id) || fail(404, 'Persona temporal no trobada');
  const data = guestInput(body);
  updateRow('event_guests', guest.id, data);
  db.prepare('UPDATE castell_positions SET guest_name = ? WHERE guest_id = ?').run(data.name, guest.id);
  return db.prepare('SELECT * FROM event_guests WHERE id = ?').get(guest.id);
}, 'admin');

route('DELETE', '/api/guests/:id', ({ params }) => {
  db.prepare('DELETE FROM event_guests WHERE id = ?').run(params.id);
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
  // De les persones temporals, l'alçada d'espatlles i el pes (si s'han posat) serveixen per revisar l'alineació.
  const positions = db.prepare(`SELECT cp.pos_key, cp.person_id, cp.guest_id, COALESCE(g.name, cp.guest_name) AS guest_name, p.name, p.alias${isAdmin
      ? ', p.birthdate, p.height_cm, p.shoulder_width_cm, COALESCE(p.shoulder_height_cm, g.shoulder_height_cm) AS shoulder_height_cm, COALESCE(p.weight_kg, g.weight_kg) AS weight_kg'
      : ''}
    FROM castell_positions cp LEFT JOIN people p ON p.id = cp.person_id LEFT JOIN event_guests g ON g.id = cp.guest_id
    WHERE cp.castell_id = ?`).all(castell.id);
  const siblings = db.prepare('SELECT id, width, height, agulla, folre, manilles, puntals, sota, gralles, timbals, net, from_level, to_level, label, result FROM castells WHERE event_id = ? ORDER BY position, id').all(event.id);
  // Les notes de la tècnica no les veuen els membres.
  const result = { castell: isAdmin ? castell : { ...castell, tech_notes: undefined }, event, siblings,
    positions: isAdmin ? positions : positions.map(({ name, alias, ...p }) => (p.person_id ? { ...p, name: publicName({ name, alias }), alias: null }
      : { ...p, guest_name: p.guest_name ? publicName({ name: p.guest_name }) : null })) };
  if (isAdmin) {
    result.candidates = db.prepare(`SELECT p.id, p.name, p.alias, p.instrument, ${measures}, ${EFFECTIVE_STATUS_SQL} AS status
      FROM people p LEFT JOIN attendance a ON a.person_id = p.id AND a.event_id = ?
      WHERE p.active = 1 ORDER BY p.name COLLATE NOCASE`).all(event.id);
    result.guests = db.prepare('SELECT * FROM event_guests WHERE event_id = ? ORDER BY name COLLATE NOCASE').all(event.id);
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
    const newId = insertRow('castells', { ...rest, result: 'previst', tech_notes: null, event_id: target.id, position: nextPos });
    // Les persones temporals són d'una sessió: només es copien si el castell queda a la mateixa sessió.
    db.prepare(`INSERT INTO castell_positions (castell_id, pos_key, person_id, guest_name, guest_id)
      SELECT ?, pos_key, person_id, guest_name, guest_id FROM castell_positions
      WHERE castell_id = ? AND (person_id IS NOT NULL OR ? = 1)`).run(newId, castell.id, target.id === castell.event_id ? 1 : 0);
    return getCastell(newId);
  });
}, 'admin');

route('PUT', '/api/castells/:id/positions/:key', ({ params, body }) => {
  const castell = getCastell(params.id);
  let key = '';
  try { key = decodeURIComponent(params.key); } catch { /* mal codificada: no és cap posició */ }
  if (!/^[\w-]{1,40}$/.test(key)) fail(400, 'Posició no vàlida');
  const personId = body.person_id ? Number(body.person_id) : null;
  const guestId = !personId && body.guest_id ? Number(body.guest_id) : null;
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

// ---------- Memòria de càlculs ----------
// Les estadístiques i els historials llegeixen milers de posicions: es calculen un sol cop i es reaprofiten fins
// que algú canvia qualsevol dada (dataVersion puja amb cada petició que no és GET) o canvia el dia.
// És només una memòria del servidor: cada ruta continua comprovant abans qui pot veure què.
let dataVersion = 0;
const versionKey = () => `${dataVersion}|${nowLocal().slice(0, 10)}`;
let responseCache = { key: null, map: new Map() };
// Per a rutes d'administració que només depenen de les dades i dels filtres (temporada i tipus de sessió).
// Peticions que no són GET però no toquen cap dada de sessions, castells ni persones.
const NO_DATA_CHANGE = new Set(['/api/directory', '/api/identify', '/api/login', '/api/logout', '/api/mode', '/api/me']);
const memoized = new Map();
const memo = (name, handler) => {
  const wrapped = (ctx) => {
    if (responseCache.key !== versionKey()) responseCache = { key: versionKey(), map: new Map() };
    const key = `${name}|${ctx.query.get('season') || ''}|${ctx.query.get('kind') || ''}`;
    if (!responseCache.map.has(key)) responseCache.map.set(key, handler(ctx));
    return responseCache.map.get(key);
  };
  memoized.set(name, wrapped);
  return wrapped;
};
// Uns segons després de l'últim canvi (i en arrencar) es deixa calculat el que s'obre més sovint (la temporada
// actual, com ho demana l'app), perquè la primera persona que hi entri no s'hagi d'esperar.
let warmTimer = null;
function warmCaches(delayMs = 3000) {
  clearTimeout(warmTimer);
  warmTimer = setTimeout(() => {
    try {
      historyIndex();
      const query = new URLSearchParams({ season: String(new Date().getFullYear()), kind: 'all' });
      for (const name of ['tecnica', 'people']) memoized.get(name)({ query });
    } catch (err) { console.error(err); }
  }, delayMs);
  warmTimer.unref();
}

// ---------- Historial de posicions ----------
// L'historial surt dels castells de sessions passades (fins avui inclòs). Les files són compartides: no es modifiquen.
let pastCache = null;
function pastRows() {
  if (pastCache?.key !== versionKey()) {
    pastCache = { key: versionKey(), rows: db.prepare(`SELECT cp.pos_key, cp.person_id, c.id AS castell_id, c.width, c.height, c.agulla, c.folre,
        c.manilles, c.puntals, c.sota, c.gralles, c.timbals, c.net, c.from_level, c.to_level, c.cordons, c.result,
        e.id AS event_id, e.date, e.title, e.type
      FROM castell_positions cp JOIN castells c ON c.id = cp.castell_id JOIN events e ON e.id = c.event_id
      WHERE e.date <= date('now','localtime') AND cp.person_id IS NOT NULL ORDER BY e.date DESC, c.position`).all() };
  }
  return pastCache.rows;
}
// Els mateixos filtres que statsFilter, però sobre les files ja llegides.
function historyRows({ personId, excludeCastell, query } = {}) {
  const season = query?.get('season') || '';
  const kind = query?.get('kind');
  const year = /^\d{4}$/.test(season) ? season : null;
  const types = kind === 'diades' ? ['diada', 'esdeveniment'] : kind === 'assajos' ? ['assaig'] : null;
  const person = personId ? Number(personId) : null;
  const exclude = excludeCastell ? Number(excludeCastell) : null;
  return pastRows().filter((r) => (!person || r.person_id === person) && (!exclude || r.castell_id !== exclude)
    && (!year || r.date.startsWith(year)) && (!types || types.includes(r.type)));
}

// Índex de totes les posicions dels castells passats, per a l'historial i la preparació de cada castell.
// Llegir-les totes (milers de files) és el que fa lenta la pàgina d'un castell: es llegeixen un sol cop i es
// reaprofiten fins al següent canvi (vegeu «Memòria de càlculs»).
let historyCache = null;
function historyIndex() {
  const key = versionKey();
  if (historyCache?.key === key) return historyCache;
  const byName = new Map();     // «3d7» → files de castells fets (no previstos)
  const byCat = {};             // persona → { categoria de posició: vegades }
  const catsByCastell = new Map(); // castell → [[persona, categoria]], per poder-ne treure un
  for (const r of historyRows()) {
    if (r.result !== 'previst') {
      const name = castellName(r);
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push({ castell_id: r.castell_id, pos_key: r.pos_key, person_id: r.person_id, date: r.date, type: r.type });
    }
    const cat = positionOf(r, r.pos_key)?.cat;
    if (!cat) continue;
    (byCat[r.person_id] ??= {})[cat] = (byCat[r.person_id][cat] || 0) + 1;
    if (!catsByCastell.has(r.castell_id)) catsByCastell.set(r.castell_id, []);
    catsByCastell.get(r.castell_id).push([r.person_id, cat]);
  }
  historyCache = { key, byName, byCat, catsByCastell };
  return historyCache;
}

route('GET', '/api/castells/:id/history', ({ params, user }) => {
  const castell = getCastell(params.id);
  const index = historyIndex();
  const exact = new Map();
  // Una mateixa posició no és igual en castells diferents: només compta el mateix castell (un 3d7 amb altres 3d7).
  const same = new Set();
  for (const r of index.byName.get(castellName(castell)) || []) {
    if (r.castell_id === castell.id) continue;
    same.add(r.castell_id);
    const k = `${r.pos_key}|${r.person_id}`;
    const e = exact.get(k) || { pos_key: r.pos_key, person_id: r.person_id, n: 0, last: r.date };
    e.n++;
    exact.set(k, e);
  }
  // L'experiència per tipus de posició, sense comptar aquest mateix castell.
  const byCat = structuredClone(index.byCat);
  for (const [person, cat] of index.catsByCastell.get(castell.id) || []) {
    if (--byCat[person][cat] === 0) delete byCat[person][cat];
    if (!Object.keys(byCat[person]).length) delete byCat[person];
  }
  const people = new Map(db.prepare('SELECT id, name, alias FROM people').all().map((p) => [p.id, p]));
  return {
    castellsCount: same.size,
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

route('GET', '/api/stats/people', memo('people', ({ query }) => {
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
}), 'admin');

route('GET', '/api/stats/castells', memo('castells', ({ query }) => {
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
}), 'admin');

// Resum de temporada: castells i sessions, sense dades de ningú (el veu tothom).
// Dificultat aproximada per trobar el millor castell: mana l'alçada; a igual alçada, com més estret, més difícil.
const WIDTH_DIFFICULTY = { 1: 6, 2: 5, 9: 4, 7: 3.5, 5: 3, 3: 2, 4: 1 };
const difficulty = (c) => c.height * 10 + (WIDTH_DIFFICULTY[c.width] || 0) + (c.agulla ? 0.5 : 0) + (c.net ? 0.3 : 0);

route('GET', '/api/stats/season', ({ query }) => {
  const { where, args } = statsFilter(query);
  const rows = db.prepare(`SELECT c.id, c.width, c.height, c.agulla, c.folre, c.manilles, c.puntals, c.sota, c.net, c.from_level, c.to_level,
      c.result, e.id AS event_id, e.date, e.title, e.type
    FROM castells c JOIN events e ON e.id = c.event_id WHERE ${where.join(' AND ')} ORDER BY e.date, c.position`).all(...args);
  const sessions = db.prepare(`SELECT e.id, e.type, e.date, e.title,
      (SELECT COUNT(*) FROM attendance a WHERE a.event_id = e.id AND ${CAME_SQL}) AS came
    FROM events e WHERE ${where.join(' AND ')} AND e.type != 'musics' ORDER BY e.date`).all(...args);

  const results = emptyResults();
  const best = { descarregat: new Map(), carregat: new Map() };
  const diades = new Map();
  for (const r of rows) {
    const res = resultOf(r);
    results[res]++;
    const partial = levelRange(r).partial;
    const name = castellName(r);
    // Les proves parcials no compten per al millor castell.
    if (!partial && best[res] && !best[res].has(name)) best[res].set(name, { castell: name, castell_id: r.id, date: r.date, title: r.title, score: difficulty(r) });
    if (r.type !== 'assaig') {
      const d = diades.get(r.event_id) || { id: r.event_id, date: r.date, title: r.title, castells: [] };
      d.castells.push({ id: r.id, castell: name, result: r.result, partial });
      diades.set(r.event_id, d);
    }
  }
  const top = (m) => [...m.values()].sort((a, b) => b.score - a.score || a.date.localeCompare(b.date)).map(({ score, ...c }) => c);
  const attendance = {};
  for (const type of ['assaig', 'diada', 'esdeveniment']) {
    const list = sessions.filter((x) => x.type === type);
    const withPeople = list.filter((x) => x.came > 0);
    const max = withPeople.reduce((m, x) => (x.came > (m?.came ?? -1) ? x : m), null);
    attendance[type] = {
      sessions: list.length,
      average: withPeople.length ? Math.round(withPeople.reduce((sum, x) => sum + x.came, 0) / withPeople.length) : 0,
      max: max ? { n: max.came, date: max.date, title: max.title, id: max.id } : null,
    };
  }
  return {
    seasons: seasons(), total: rows.length, results, attendance,
    descarregats: top(best.descarregat), carregats: top(best.carregat),
    diades: [...diades.values()].reverse(),
  };
});

// ---------- Estadístiques per a la tècnica ----------
// Un castell és cosa de tota la colla: aquí no es mira qui ha fallat, sinó què acompanya els bons resultats
// (tronc estable, experiència a cada posició, pinya plena), com progressa cada castell, qui pot fer de recanvi
// i com està preparat el tronc de les properes diades.
const TRONC_GROUPS = ['baixos', 'tronc', 'pom', 'agulla'];
const outcomeOf = (r) => (r === 'descarregat' ? 'descarregat' : r === 'carregat' ? 'carregat' : 'caigut');
const emptyOutcome = () => ({ n: 0, descarregat: 0, carregat: 0, caigut: 0 });
const STABLE = 0.75, EXPERIENCED = 0.75, FULL_PINYA = 0.9;

// Recanvis: per a cada castell, qui ha fet cada posició del tronc en aquell mateix castell.
// Una mateixa posició no és igual en un 3de7 que en un 4de8, per això no es barregen castells diferents.
const MIN_PEOPLE = 2, MIN_TIMES = 2, SHOULDER_GAP = 4, WEIGHT_GAP = 10;
const median = (list) => { const v = list.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
function reserves(query) {
  const people = db.prepare('SELECT id, name, alias, active, shoulder_height_cm, weight_kg FROM people').all();
  const byId = new Map(people.map((p) => [p.id, p]));
  const rows = historyRows({ query }).filter((r) => r.result !== 'previst');
  const types = new Map();
  const catCount = new Map(); // persona → categoria (Baixos, Segons…) → vegades, en qualsevol castell
  for (const r of rows) {
    const pos = positionOf(r, r.pos_key);
    if (!pos || !TRONC_GROUPS.includes(pos.group)) continue;
    const cats = catCount.get(r.person_id) || new Map();
    cats.set(pos.cat, (cats.get(pos.cat) || 0) + 1);
    catCount.set(r.person_id, cats);
    const name = castellName(r);
    const t = types.get(name) || { castell: name, sample: r, attempts: new Set(), pos: new Map() };
    t.attempts.add(r.castell_id);
    const m = t.pos.get(r.pos_key) || new Map();
    m.set(r.person_id, (m.get(r.person_id) || 0) + 1);
    t.pos.set(r.pos_key, m);
    types.set(name, t);
  }
  return [...types.values()].sort((a, b) => b.attempts.size - a.attempts.size).map((t) => {
    const s = structureOf(t.sample);
    const positions = [...s.positions.values()].filter((p) => TRONC_GROUPS.includes(p.group)).map((p) => {
      const done = [...(t.pos.get(p.key) || [])].filter(([id]) => byId.get(id)?.active)
        .map(([id, n]) => ({ id, name: publicName(byId.get(id)), n })).sort((a, b) => b.n - a.n);
      const few = done.filter((d) => d.n >= MIN_TIMES).length < MIN_PEOPLE;
      let suggest = [];
      if (few) {
        // Gent amb mides semblants a les de qui ja l'ha fet, i amb experiència al mateix pis en altres castells.
        const sh = median(done.map((d) => byId.get(d.id).shoulder_height_cm));
        const wt = median(done.map((d) => byId.get(d.id).weight_kg));
        const taken = new Set(done.map((d) => d.id));
        suggest = people.filter((x) => x.active && !taken.has(x.id) && (sh != null || wt != null)
            && (sh == null || (x.shoulder_height_cm != null && Math.abs(x.shoulder_height_cm - sh) <= SHOULDER_GAP))
            && (wt == null || (x.weight_kg != null && Math.abs(x.weight_kg - wt) <= WEIGHT_GAP)))
          .map((x) => ({ id: x.id, name: publicName(x), n: catCount.get(x.id)?.get(p.cat) || 0 }))
          .sort((a, b) => b.n - a.n || (a.name || '').localeCompare(b.name || '')).slice(0, 4);
      }
      return { key: p.key, role: p.role, cat: p.cat, people: done, few, suggest };
    });
    return { castell: t.castell, attempts: t.attempts.size, positions };
  });
}

// Preparació del tronc d'un castell: qui l'ha assajat abans (mateix castell, mateixa posició).
const PREP_DAYS = 42;
function troncPrep(castell) {
  const s = structureOf(castell);
  const keys = [...s.positions.values()].filter((p) => TRONC_GROUPS.includes(p.group));
  const placedRows = new Map(db.prepare('SELECT pos_key, person_id, guest_id FROM castell_positions WHERE castell_id = ?')
    .all(castell.id).map((r) => [r.pos_key, r]));
  const date = castell.date || db.prepare('SELECT date FROM events WHERE id = ?').get(castell.event_id)?.date;
  const since = new Date(`${date}T12:00:00`); since.setDate(since.getDate() - PREP_DAYS);
  const sinceIso = since.toISOString().slice(0, 10);
  const past = (historyIndex().byName.get(castellName(castell)) || []).filter((r) => r.castell_id !== castell.id && r.date < date);
  return keys.map((p) => {
    const r = placedRows.get(p.key);
    const mine = r?.person_id ? past.filter((x) => x.pos_key === p.key && x.person_id === r.person_id) : [];
    return { key: p.key, role: p.role, person_id: r?.person_id || null, guest: !!r?.guest_id,
      recent: mine.filter((x) => x.type === 'assaig' && x.date >= sinceIso).length,
      ever: mine.length, last: mine.map((x) => x.date).sort().pop() || null };
  });
}

route('GET', '/api/castells/:id/prep', ({ params }) => ({ days: PREP_DAYS, positions: troncPrep(getCastell(params.id)) }), 'admin');

route('GET', '/api/stats/tecnica', memo('tecnica', ({ query }) => {
  const { where, args } = statsFilter(query);
  const inFilter = new Set(db.prepare(`SELECT c.id FROM castells c JOIN events e ON e.id = c.event_id WHERE ${where.join(' AND ')}`)
    .all(...args).map((r) => r.id));
  // L'estabilitat i l'experiència es calculen amb tota la història anterior, encara que es miri una sola temporada.
  const all = db.prepare(`SELECT c.*, e.date, e.title, e.type FROM castells c JOIN events e ON e.id = c.event_id
    WHERE e.date <= date('now','localtime') ORDER BY e.date, e.start_time, c.position, c.id`).all();
  const placed = new Map();
  for (const r of db.prepare('SELECT castell_id, pos_key, person_id FROM castell_positions').all()) {
    if (!placed.has(r.castell_id)) placed.set(r.castell_id, new Map());
    placed.get(r.castell_id).set(r.pos_key, r.person_id);
  }

  const factors = {
    stability: { high: emptyOutcome(), low: emptyOutcome() },
    experience: { high: emptyOutcome(), low: emptyOutcome() },
    pinya: { high: emptyOutcome(), low: emptyOutcome() },
  };
  const add = (bucket, res) => { bucket.n++; bucket[outcomeOf(res)]++; };
  const done = new Map();       // «amplada|posició|persona» → vegades que l'ha fet abans
  const lastTronc = new Map();  // nom del castell → tronc de l'últim cop (posició → persona)
  const types = new Map();

  for (const c of all) {
    if (c.result === 'previst') continue; // no consta que s'hagi fet
    const s = structureOf(c);
    const filled = placed.get(c.id) || new Map();
    const positions = [...s.positions.values()];
    const troncKeys = positions.filter((p) => TRONC_GROUPS.includes(p.group)).map((p) => p.key);
    const pinyaKeys = positions.filter((p) => !TRONC_GROUPS.includes(p.group) && p.group !== 'musica').map((p) => p.key);
    const troncPeople = troncKeys.filter((k) => filled.get(k));
    const name = castellName(c);
    const { partial } = levelRange(c);

    if (inFilter.has(c.id) && troncPeople.length) {
      const prev = lastTronc.get(name);
      const common = prev ? troncKeys.filter((k) => prev.has(k)) : [];
      if (common.length) add(factors.stability[common.filter((k) => prev.get(k) === filled.get(k)).length / common.length >= STABLE ? 'high' : 'low'], c.result);
      const expert = troncPeople.filter((k) => done.get(`${c.width}|${k}|${filled.get(k)}`)).length / troncPeople.length;
      add(factors.experience[expert >= EXPERIENCED ? 'high' : 'low'], c.result);
      if (pinyaKeys.length) add(factors.pinya[pinyaKeys.filter((k) => filled.has(k)).length / pinyaKeys.length >= FULL_PINYA ? 'high' : 'low'], c.result);
    }
    if (inFilter.has(c.id)) {
      const t = types.get(name) || { castell: name, attempts: [] };
      const levels = levelNames(c);
      const { from, to } = levelRange(c);
      const label = (L) => levels.find((l) => l.level === L)?.label;
      t.attempts.push({ castell_id: c.id, date: c.date, title: c.title, type: c.type, result: c.result, partial,
        range: partial ? `${label(from)} – ${label(to)}` : null, notes: c.tech_notes || null });
      types.set(name, t);
    }
    // Després de comptar-lo, aquest castell passa a ser experiència i «l'últim tronc» per als següents.
    for (const k of troncPeople) done.set(`${c.width}|${k}|${filled.get(k)}`, (done.get(`${c.width}|${k}|${filled.get(k)}`) || 0) + 1);
    if (troncPeople.length) lastTronc.set(name, new Map(troncPeople.map((k) => [k, filled.get(k)])));
  }

  const rate = (list) => (list.length ? Math.round((list.filter((a) => a.result === 'descarregat').length / list.length) * 100) : null);
  const castells = [...types.values()].map((t) => {
    const full = t.attempts.filter((a) => !a.partial);
    const first = full.findIndex((a) => a.result === 'descarregat');
    return {
      ...t,
      full: full.length,
      partials: t.attempts.length - full.length,
      tilFirst: first >= 0 ? first + 1 : null,
      assajos: rate(full.filter((a) => a.type === 'assaig')),
      diades: rate(full.filter((a) => a.type !== 'assaig')),
      notes: t.attempts.filter((a) => a.notes).slice(-9).reverse(),
    };
  }).sort((a, b) => b.attempts.length - a.attempts.length);

  const upcoming = db.prepare(`SELECT c.*, e.date, e.title, e.type FROM castells c JOIN events e ON e.id = c.event_id
    WHERE e.date >= date('now','localtime') AND e.type != 'assaig' ORDER BY e.date, e.start_time, c.position, c.id`).all();
  return {
    seasons: seasons(),
    factors,
    castells,
    reserves: reserves(query),
    prep: upcoming.map((c) => {
      const rows = troncPrep(c);
      return { castell_id: c.id, event_id: c.event_id, date: c.date, title: c.title, castell: castellName(c),
        total: rows.length, placed: rows.filter((r) => r.person_id).length, rehearsed: rows.filter((r) => r.recent).length };
    }).filter((c) => c.placed),
  };
}), 'admin');

// ---------- Calendari per subscriure-s'hi (Google Calendar, iPhone…) ----------
// És públic perquè les apps de calendari no poden identificar-se: només hi surten les sessions, cap persona.
const ICS_TYPES = { assaig: 'Assaig', diada: 'Diada', esdeveniment: 'Esdeveniment', musics: 'Assaig de músics' };
const ICS_TZ = ['BEGIN:VTIMEZONE', 'TZID:Europe/Madrid',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'];
const icsText = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[,;]/g, '\\$&');
// Les línies d'un .ics no poden passar de 75 bytes: les llargues es parteixen.
function icsFold(line) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 74) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}
const icsStamp = (local) => local.replace(/[-:]/g, '') + '00';
function icsEvent(e, origin) {
  const lines = ['BEGIN:VEVENT', `UID:sessio-${e.id}@${new URL(origin).host}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`];
  if (e.start_time) {
    const start = new Date(`${e.date}T${e.start_time}:00`);
    let end = e.end_time ? new Date(`${e.date}T${e.end_time}:00`) : null;
    if (!end || end <= start) end = new Date(start.getTime() + 2 * 3600 * 1000);
    lines.push(`DTSTART;TZID=Europe/Madrid:${icsStamp(localStamp(start))}`, `DTEND;TZID=Europe/Madrid:${icsStamp(localStamp(end))}`);
  } else {
    const next = new Date(`${e.date}T12:00:00`);
    next.setDate(next.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${e.date.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${localStamp(next).slice(0, 10).replaceAll('-', '')}`);
  }
  const notes = [ICS_TYPES[e.type], e.escoleta ? `Escoleta${e.escoleta_time ? ` a les ${e.escoleta_time}` : ''}` : null, e.description, `${origin}/#/sessio/${e.id}`];
  lines.push(`SUMMARY:${icsText(e.title)}`, `CATEGORIES:${icsText(ICS_TYPES[e.type])}`, `DESCRIPTION:${icsText(notes.filter(Boolean).join('\n'))}`,
    `URL:${origin}/#/sessio/${e.id}`);
  if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
  lines.push('END:VEVENT');
  return lines;
}

route('GET', '/api/calendar.ics', ({ req, res, query }) => {
  checkCollaCode(req, query.get('code'));
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const origin = `${proto}://${req.headers.host}`;
  const one = Number(query.get('event')) || null;
  const events = one ? [getEvent(one)]
    : db.prepare(`SELECT * FROM events WHERE date >= date('now','localtime','-90 days')${query.get('musics') === '1' ? '' : " AND type != 'musics'"}
        ORDER BY date, start_time`).all();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Colla castellera//CA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(COLLA_NAME)}`, 'X-WR-TIMEZONE:Europe/Madrid', ...ICS_TZ, ...events.flatMap((e) => icsEvent(e, origin)), 'END:VCALENDAR'];
  res.writeHead(200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'no-cache',
    ...(one ? { 'Content-Disposition': `attachment; filename="sessio-${events[0].date}.ics"` } : {}),
  });
  res.end(lines.map(icsFold).join('\r\n') + '\r\n');
}, 'public');

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
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

// Comprimeix les respostes de text si el navegador ho accepta (l'historial d'un castell passa de ~200 KB a ~20 KB).
// No hi ha secrets dins les respostes que puguin barrejar-se amb text d'un atacant (BREACH): les sessions van en cookies.
function sendBody(req, res, status, headers, body) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (data.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }).end(zlib.gzipSync(data));
  } else res.writeHead(status, headers).end(data);
}

function serveStatic(req, res, pathname) {
  let decoded;
  // Una adreça mal codificada (p. ex. «/%E0%A4%A») no pot tombar el servidor.
  try { decoded = decodeURIComponent(pathname); } catch { res.writeHead(400).end(); return; }
  const file = path.normalize(path.join(PUBLIC_DIR, decoded === '/' ? 'index.html' : decoded));
  // Ha de quedar dins de public/ (amb la barra: «public-altra/» no hi compta) i no es serveixen fitxers ocults.
  if (!file.startsWith(PUBLIC_DIR + path.sep) || file.includes(`${path.sep}.`)) { res.writeHead(403).end(); return; }
  const send = (f) => fs.stat(f, (err, st) => {
    if (err || !st.isFile()) {
      // Les adreces de l'app (#/…) i les que no existeixen tornen la pàgina principal.
      if (f !== INDEX_FILE) send(INDEX_FILE); else res.writeHead(404).end('No trobat');
      return;
    }
    // «no-cache» vol dir que el navegador el guarda però pregunta si ha canviat: si no, respon 304 sense tornar-lo a enviar.
    const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
    const headers = { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return; }
    fs.readFile(f, (e2, data) => (e2 ? res.writeHead(404).end('No trobat') : sendBody(req, res, 200, headers, data)));
  });
  send(file);
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
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

  const send = (status, data) => sendBody(req, res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify(data));
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
    if (match.auth === 'admin' && user.role !== 'admin') fail(403, 'Només per a administradors');
    const body = req.method === 'GET' ? {} : await readBody(req);
    let result;
    try { result = await match.handler({ req, res, params, body, user, query: url.searchParams }); }
    finally { if (req.method !== 'GET' && !NO_DATA_CHANGE.has(url.pathname)) { dataVersion++; warmCaches(); } }
    if (result !== undefined) send(200, result);
  } catch (err) {
    const lang = ['es', 'en'].includes(req.headers['x-lang']) ? req.headers['x-lang'] : 'ca';
    if (err instanceof HttpError) send(err.status, { error: translate(lang, err.message, err.params) });
    else if (String(err.message).includes('constraint')) send(400, { error: translate(lang, 'Dades no vàlides') });
    else { console.error(err); send(500, { error: translate(lang, 'Error intern del servidor') }); }
  }
});

server.listen(PORT, () => {
  console.log(`${COLLA_NAME} → http://localhost:${PORT}`);
  warmCaches(0);
});
