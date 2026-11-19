import crypto from 'node:crypto';
import net from 'node:net';
import { db, hashPassword, hashToken, verifyPassword } from '../db.js';
import { DEVICE_TTL_MS, MEMBER_TTL_MS, TRUST_PROXY } from './config.js';
import { capsOf, editableFields, fail, insertRow, publicPerson } from './util.js';

// ---------- Router ----------
export const routes = [];
export function route(method, pattern, handler, auth = 'user') {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, pattern, re, keys, handler, auth });
}

export function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

// A la base de dades només hi ha el resum de cada sessió (hashToken): el valor de la cookie no es guarda enlloc.
export function memberSession(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = db.prepare(`SELECT p.* FROM auth_tokens t JOIN people p ON p.id = t.person_id
    WHERE t.token = ? AND t.mode = 'member' AND t.expires_at > ? AND p.active = 1`).get(tokenHash, Date.now());
  return row ? { ...row, role: 'member', mode: 'member', tokenHash } : null;
}

export function adminSession(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = db.prepare(`SELECT a.* FROM admin_tokens t JOIN admins a ON a.id = t.admin_id
    WHERE t.token = ? AND t.expires_at > ?`).get(tokenHash, Date.now());
  // Un compte d'administració no és cap persona de la colla: no té assistència ni posicions (id null).
  return row ? { id: null, admin_id: row.id, name: row.name, username: row.username, password_hash: row.password_hash, role: 'admin', roles: row.roles.split(','), mode: 'admin', tokenHash, twoFactor: !!row.totp_secret } : null;
}

// Crea una sessió (o una marca de mòbil conegut) i en torna el valor per a la cookie.
// Com a molt 20 per persona o compte: que no es pugui omplir la base de dades.
export function newToken(table, owner, id, ttlMs, extra = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  insertRow(table, { token: hashToken(token), [owner]: id, expires_at: Date.now() + ttlMs, ...extra });
  db.prepare(`DELETE FROM ${table} WHERE ${owner} = ? AND token NOT IN
    (SELECT token FROM ${table} WHERE ${owner} = ? ORDER BY expires_at DESC LIMIT 20)`).run(id, id);
  return token;
}

// Al mateix mòbil hi pot haver oberta l'entrada de membre i la d'administració alhora;
// la cookie «mode» diu amb quina s'està treballant ara (es canvia des dels ajustos).
export function currentUser(req) {
  const c = cookies(req);
  const member = memberSession(c.token);
  const admin = adminSession(c.atoken);
  const user = (c.mode === 'admin' && admin) || member || admin;
  if (user) user.sessions = { member: member ? publicPerson(member) : null, admin: !!admin };
  return user;
}

export function cookieHeader(req, name, value, maxAgeSec) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`;
}
export const modeCookie = (req, mode) => cookieHeader(req, 'mode', mode, MEMBER_TTL_MS / 1000);

// D'on ve la petició, per comptar-ne els intents.
export function clientIp(req) {
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
export class RateLimit {
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
export const TOO_MANY = "Massa intents. Torna-ho a provar d'aquí a una estona.";
// Contrasenyes d'administració: 10 errors per adreça i, des de qualsevol lloc, 50 per compte cada 15 minuts.
export const loginByIp = new RateLimit(10, 15 * 60 * 1000);
export const loginByUser = new RateLimit(50, 15 * 60 * 1000);
// Entrar com a membre és lliure, però sense inundar la base de dades de sessions (tota la colla pot ser a la mateixa wifi).
export const identifyByIp = new RateLimit(150, 10 * 60 * 1000);
// Codi de la colla: 20 errors per adreça cada 15 minuts (que no es pugui endevinar provant).
export const codeByIp = new RateLimit(20, 15 * 60 * 1000);
// Per comparar el mateix temps tant si l'usuari existeix com si no (que no es pugui endevinar qui és administrador).
export const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

// Un mòbil on aquest compte ja ha entrat bé abans.
export function knownDevice(req, adminId) {
  const token = cookies(req).adev;
  return !!token && !!db.prepare('SELECT 1 FROM admin_devices WHERE token = ? AND admin_id = ? AND expires_at > ?')
    .get(hashToken(token), adminId, Date.now());
}
export const deviceCookie = (req, adminId) => (knownDevice(req, adminId) ? []
  : [cookieHeader(req, 'adev', newToken('admin_devices', 'admin_id', adminId, DEVICE_TTL_MS), DEVICE_TTL_MS / 1000)]);

// Comprova la contrasenya d'un compte (per entrar o per confirmar un canvi), comptant-ne els errors.
// Des d'un mòbil conegut del compte no hi ha bloqueig per compte: si no, qualsevol podria deixar fora l'administració
// provant contrasenyes dolentes; el límit per adreça sí que hi és sempre.
export async function checkPassword(req, username, admin, password) {
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
export async function confirmPassword(req, user, password) {
  if (!(await checkPassword(req, user.username, { id: user.admin_id, password_hash: user.password_hash }, password))) {
    fail(400, 'La contrasenya actual no és correcta');
  }
}

export const COMMON_PASSWORDS = new Set(['12345678', '123456789', '1234567890', '87654321', '12341234', '11223344', 'abcd1234', 'abc12345',
  'password', 'password1', 'contrasenya', 'contraseña', 'qwertyui', 'qwertyuiop', 'qwerty123', 'admin123', 'admin1234', 'administrador',
  'iloveyou', 'castells', 'castellers', 'castellera']);
export function newPassword(password, username) {
  const p = String(password || '');
  if (p.length < 8) fail(400, 'La contrasenya ha de tenir almenys 8 caràcters');
  if (p.length > 200) fail(400, 'La contrasenya pot tenir com a molt 200 caràcters');
  const low = p.toLowerCase();
  if (low === username || /^(.)\1*$/.test(p) || COMMON_PASSWORDS.has(low)) fail(400, "Aquesta contrasenya és massa fàcil d'endevinar");
  return hashPassword(p);
}

// latestNews: quan es va publicar l'últim missatge de l'altaveu (per marcar la pestanya si n'hi ha de nous).
export const latestNews = () => db.prepare('SELECT MAX(created_at) AS at FROM announcements').get().at;
export const meResponse = (user) => (user.mode === 'admin'
  ? { id: null, admin_id: user.admin_id, name: user.name, username: user.username, role: 'admin', roles: user.roles, can: capsOf(user), personFields: editableFields(user), mode: 'admin', twoFactor: !!user.twoFactor, sessions: user.sessions, latestNews: latestNews() }
  : { ...publicPerson(user), alias: user.alias, instrument: user.instrument, section: user.section, role: 'member', mode: 'member', sessions: user.sessions, latestNews: latestNews() });
