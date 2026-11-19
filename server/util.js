import net from 'node:net';
import { db } from '../db.js';
import { buildStructure } from '../public/castell.js';

// ---------- Utilitats ----------
// Els missatges d'error es tradueixen a l'idioma de l'usuari (capçalera X-Lang).
// «extra»: dades que acompanyen el missatge d'error (p. ex. que l'entrada demana el codi del segon factor).
export class HttpError extends Error {
  constructor(status, message, params, extra) { super(message); this.status = status; this.params = params; this.extra = extra; }
}
export const fail = (status, message, params, extra) => { throw new HttpError(status, message, params, extra); };

export const EVENT_TYPES = ['assaig', 'diada', 'esdeveniment', 'musics'];
export const INSTRUMENTS = ['gralla', 'timbal'];
// Grup de cada persona dins la colla (un de sol), per veure qui hi va per grups. Els músics van a part, per l'instrument.
export const SECTIONS = ['canalla', 'tecnica', 'junta'];
// Rols dels comptes i què permet cadascun. «admin» ho pot fer tot, també el que només és seu (la capacitat 'admin').
// El «Grup» de la fitxa d'una persona no dona cap permís: els membres entren sense contrasenya.
export const ACCOUNT_ROLES = ['admin', 'junta', 'tecnica'];
export const ROLE_CAPS = {
  junta: ['staff', 'sessions', 'news', 'attendance', 'people', 'import', 'contact'],
  tecnica: ['staff', 'castells', 'news', 'attendance', 'people', 'measures'],
};
export const can = (user, cap) => user?.role === 'admin' && (user.roles.includes('admin') || user.roles.some((r) => ROLE_CAPS[r]?.includes(cap)));
export const capsOf = (user) => [...new Set(user.roles.includes('admin')
  ? ['admin', ...Object.values(ROLE_CAPS).flat()] : user.roles.flatMap((r) => ROLE_CAPS[r] || []))];
export const FIELD_KINDS = ['number', 'text', 'bool', 'select'];
export const STATUSES = ['si', 'no'];
export const WIDTHS = [1, 2, 3, 4, 5, 7, 9];
export const RESULTS = ['previst', 'descarregat', 'carregat', 'intent', 'intent desfet'];
// Què va passar quan un castell no es va descarregar.
export const FAIL_CAUSES = ['obert', 'decantat', 'cedit', 'altre'];
// El que només veuen els administradors d'un castell: les notes i on va fallar podrien assenyalar algú.
export const ADMIN_ONLY_CASTELL = { tech_notes: undefined, fail_level: undefined, fail_cause: undefined, plan_time: undefined, plan_minutes: undefined };
export const NUMERIC_PERSON_FIELDS = ['height_cm', 'shoulder_height_cm', 'shoulder_width_cm', 'weight_kg'];
export const PROFILE_FIELDS = ['name', 'alias', 'email', 'phone', 'birthdate', 'guardian_consent', ...NUMERIC_PERSON_FIELDS, 'notes', 'instrument', 'section'];

export function str(value, max = 500) {
  if (value === undefined || value === null) return null;
  // Si el tall cau enmig d'un emoji (ocupa dos caràcters), el treu sencer.
  const s = String(value).trim().slice(0, max).replace(/[\uD800-\uDBFF]$/, '');
  return s === '' ? null : s;
}
export function num(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) fail(400, 'Valor numèric no vàlid');
  return n;
}
export function int(value, min, max, fallback) {
  const n = value === undefined || value === null || value === '' ? fallback : Math.round(Number(value));
  if (!Number.isInteger(n) || n < min || n > max) fail(400, 'Valor fora de rang ({min}-{max})', { min, max });
  return n;
}
export const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
// Una data que existeix de debò (res de «2026-02-31») i una hora del dia.
export const isDate = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
};
export const isTime = (v) => v == null || v === '' || (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
// Un número dins d'un marge raonable (amb un decimal com a molt), o res.
export function inRange(value, min, max) {
  const n = num(value);
  if (n === null) return null;
  if (n < min || n > max) fail(400, 'Valor fora de rang ({min}-{max})', { min, max });
  return Math.round(n * 10) / 10;
}
// Quantes coses hi pot haver com a molt: res d'això té sentit a milers (i la pàgina no ho podria mostrar).
// Imatges de l'altaveu: l'app les redueix abans de pujar-les, i en base64 ocupen un terç més.
export const NEWS_IMAGES_PER_MESSAGE = 4;
export const NEWS_IMAGE_BYTES = 1024 * 1024;
export const NEWS_IMAGE_BODY = Math.ceil(NEWS_IMAGE_BYTES * 4 / 3) + 1024;
export const LIMITS = {
  people: 2000, events: 5000, admins: 25, announcements: 50, newsImages: 220, castellsPerEvent: 30, fieldsPerEvent: 15, fieldOptions: 20,
  guestsPerEvent: 200, companions: 6, templateBoxes: 200, rolesPerEvent: 20,
};
// Mides humanes possibles (en cm i kg): un valor fora d'aquí és un error en escriure'l.
export const MEASURES = { height_cm: [50, 230], shoulder_height_cm: [30, 200], shoulder_width_cm: [15, 80], weight_kg: [10, 200] };
export function atMost(max, message, sql, ...args) {
  if (db.prepare(sql).get(...args).n >= max) fail(400, message, { n: max });
}
export const pad = (n) => String(n).padStart(2, '0');
export const localStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const nowLocal = () => localStamp(new Date());
export const nowUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
// Es pot respondre fins a la data límit o, si la sessió no en té, fins al mateix dia de la sessió.
export const rsvpOpen = (e) => (e.rsvp_until ? nowLocal() < e.rsvp_until : nowLocal().slice(0, 10) <= e.date);

// Els membres entren sense contrasenya (qualsevol pot triar qualsevol nom), així que de la gent només veuen
// el malnom; si algú no en té, «Nom I.». Les dades personals només les veuen els administradors.
export const publicName = (p) => p.alias || String(p.name || '').replace(/^(\S+)\s+(\S).*$/, '$1 $2.');
export const publicPerson = (p) => ({ id: p.id, name: publicName(p), alias: null });

export function personRow(p) {
  if (!p) return null;
  // username, password_hash i role són d'una versió anterior (ara els comptes d'administració són a part).
  const { password_hash, username, role, ...rest } = p;
  return rest;
}

// Dades de la fitxa que només veu i edita qui les necessita: el contacte, la junta; les mides i les notes, la tècnica.
// El consentiment dels menors el gestiona la junta, com el contacte (és qui parla amb les famílies).
export const CONTACT_FIELDS = ['email', 'phone', 'guardian_consent'];
export const MEASURE_FIELDS = [...NUMERIC_PERSON_FIELDS, 'notes'];
export const hiddenFieldsFor = (user) => [...(can(user, 'contact') ? [] : CONTACT_FIELDS), ...(can(user, 'measures') ? [] : MEASURE_FIELDS)];
export const editableFields = (user) => PROFILE_FIELDS.filter((f) => !hiddenFieldsFor(user).includes(f));
export function personFor(user, p) {
  const out = personRow(p);
  for (const f of hiddenFieldsFor(user)) delete out[f];
  return out;
}
export const PERSON_TEXT = { name: 100, alias: 40, email: 120, phone: 30, notes: 2000 };
export function pickPersonFields(body, fields) {
  const out = {};
  for (const f of fields) {
    if (!(f in body)) continue;
    // L'error recorda el camp (en importar un fitxer es diu a quina columna és).
    try { pickPersonField(body, f, out); } catch (err) { err.field = f; throw err; }
  }
  if ('name' in out && !out.name) fail(400, 'El nom és obligatori');
  return out;
}
export function pickPersonField(body, f, out) {
  if (NUMERIC_PERSON_FIELDS.includes(f)) out[f] = inRange(body[f], ...MEASURES[f]);
  else if (f === 'birthdate' || f === 'guardian_consent') {
    const v = str(body[f], 10);
    if (v && (!isDate(v) || v < '1900-01-01' || v > nowLocal().slice(0, 10))) fail(400, f === 'birthdate' ? 'Data de naixement no vàlida' : 'Data no vàlida');
    out[f] = v;
  } else if (f === 'instrument') {
    if (body.instrument && !INSTRUMENTS.includes(body.instrument)) fail(400, 'Instrument no vàlid');
    out.instrument = body.instrument || null;
  } else if (f === 'section') {
    if (body.section && !SECTIONS.includes(body.section)) fail(400, 'Grup no vàlid');
    out.section = body.section || null;
  } else if (f === 'active') out.active = bool(body.active);
  else out[f] = str(body[f], PERSON_TEXT[f] ?? 200);
}

// El malnom serveix per distingir persones amb el mateix nom: no es pot repetir.
export const normName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export function checkAliasUnique(alias, excludeId = null) {
  if (!alias) return;
  const taken = db.prepare('SELECT id, name, alias FROM people WHERE alias IS NOT NULL').all()
    .find((p) => p.id !== excludeId && normName(p.alias) === normName(alias));
  if (taken) fail(400, 'El malnom «{alias}» ja el fa servir {name}', { alias, name: taken.name });
}

export function updateRow(table, id, data) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...keys.map((k) => data[k]), id);
}

export function insertRow(table, data) {
  const keys = Object.keys(data);
  return Number(db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
    .run(...keys.map((k) => data[k])).lastInsertRowid);
}

export function parseJSON(text, fallback) {
  try { return text ? JSON.parse(text) : fallback; } catch { return fallback; }
}

export function loadFields(eventId) {
  return db.prepare('SELECT * FROM event_fields WHERE event_id = ? ORDER BY position, id').all(eventId)
    .map((f) => ({ ...f, options: parseJSON(f.options, []), required: !!f.required, option_prices: parseJSON(f.option_prices, null) }));
}

export function loadFieldById(id) {
  const f = db.prepare('SELECT * FROM event_fields WHERE id = ?').get(id) || fail(404, 'Camp no trobat');
  return { ...f, options: parseJSON(f.options, []) };
}
export const PRICE_MAX = 1_000_000;
export const priceIn = (v) => (v === null || v === undefined || v === '' || v === 0 ? null : int(v, 0, PRICE_MAX) || null);

export function cleanExtra(fields, extra, enforceRequired) {
  const out = {};
  extra = extra && typeof extra === 'object' ? extra : {};
  for (const f of fields) {
    let v = extra[f.id];
    if (v === undefined || v === null || v === '') v = null;
    else if (f.kind === 'number') v = inRange(v, -100000, 100000);
    else if (f.kind === 'bool') v = !!bool(v);
    else if (f.kind === 'select') { if (!f.options.includes(v)) fail(400, 'Opció no vàlida per a «{label}»', { label: f.label }); }
    else v = str(v, 300);
    if (enforceRequired && f.required && v === null) fail(400, 'Cal omplir «{label}»', { label: f.label });
    out[f.id] = v;
  }
  return out;
}

export function getEvent(id) {
  return db.prepare('SELECT * FROM events WHERE id = ?').get(id) || fail(404, 'Sessió no trobada');
}
export function getCastell(id) {
  return db.prepare('SELECT * FROM castells WHERE id = ?').get(id) || fail(404, 'Castell no trobat');
}
// Les sessions i els castells ocults, per als membres, és com si no existissin.
export const seesHidden = (user) => user?.role === 'admin';
export function visibleEvent(id, user) {
  const event = getEvent(id);
  if (event.hidden && !seesHidden(user)) fail(404, 'Sessió no trobada');
  return event;
}
export function visibleCastell(id, user) {
  const castell = getCastell(id);
  if (!seesHidden(user) && (castell.hidden || db.prepare('SELECT hidden FROM events WHERE id = ?').get(castell.event_id)?.hidden)) {
    fail(404, 'Castell no trobat');
  }
  return castell;
}

export function castellInput(body, existing = {}) {
  const merged = { ...existing, ...body };
  const width = Number(merged.width);
  if (!WIDTHS.includes(width)) fail(400, 'Amplada de castell no vàlida');
  const height = int(merged.height, width === 1 ? 3 : 4, 11, null);
  const net = bool(merged.net);
  const folre = net ? 0 : bool(merged.folre);
  if (!isTime(merged.plan_time)) fail(400, 'Hora no vàlida');
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
    cordons: int(merged.cordons, 0, 8, 4),
    taps: width <= 4 ? bool(merged.taps) : 0,
    gralles: int(merged.gralles, 0, 12, 0),
    timbals: int(merged.timbals, 0, 12, 0),
    label: str(merged.label, 60),
    notes: str(merged.notes, 2000),
    result: RESULTS.includes(merged.result) ? merged.result : 'previst',
    tech_notes: str(merged.tech_notes, 1000),
    fail_level: int(merged.fail_level, 0, 11, 0),
    fail_cause: FAIL_CAUSES.includes(merged.fail_cause) ? merged.fail_cause : null,
    hidden: bool(merged.hidden),
    plan_time: merged.plan_time || null,
    plan_minutes: merged.plan_minutes ? int(merged.plan_minutes, 5, 240, 20) : null,
  };
  if (out.folre && height < 6) fail(400, 'El folre necessita un castell de 6 pisos o més');
  if (out.puntals && height < (width === 1 ? 8 : 9)) fail(400, 'Els puntals necessiten un castell més alt');
  // Prova parcial: el pis final 0 vol dir «fins a dalt».
  if (out.to_level >= height) out.to_level = 0;
  if (out.from_level > height) fail(400, 'El pis inicial no pot ser més amunt que el castell');
  if (out.to_level && out.to_level < out.from_level) fail(400, 'El pis final ha de ser igual o més amunt que el pis inicial');
  // Un castell descarregat (o que encara no s'ha fet) no ha fallat enlloc.
  if (out.result === 'previst' || out.result === 'descarregat') { out.fail_level = 0; out.fail_cause = null; }
  if (out.fail_level > out.height) fail(400, 'Aquest castell no té aquest pis');
  if (!buildStructure(out).positions.size) fail(400, 'Aquest castell no té cap posició');
  return out;
}
