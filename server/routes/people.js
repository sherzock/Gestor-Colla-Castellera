import { db, transaction } from '../../db.js';
import { castellName, positionOf } from '../../public/castell.js';
import { translate } from '../../public/i18n.js';
import { COLLA_NAME, PRIVACY_CONTACT } from '../config.js';
import { HttpError, LIMITS, PROFILE_FIELDS, atMost, checkAliasUnique, editableFields, fail, insertRow, normName, nowLocal, nowUtc, parseJSON, personFor, pickPersonFields, updateRow } from '../util.js';
import { route } from '../router.js';
import { CAME_SQL } from '../sql.js';
import { amountOf, paymentOf } from './payments.js';

// ---------- Rutes: persones (administradors) ----------
// L'assistència de la llista de persones és la de la temporada (l'any natural), fins avui.
// Els assajos de músics no hi compten: la majoria de gent no hi ha d'anar i li baixaria el percentatge.
export const SEASON_SQL = "e.date >= strftime('%Y-01-01','now','localtime') AND e.date <= date('now','localtime') AND e.type != 'musics'";
route('GET', '/api/people', ({ user }) => {
  // Es compta d'un sol cop per a tothom (sessions de la temporada → assistència), no persona per persona.
  const people = db.prepare(`SELECT p.*, COALESCE(s.attended, 0) AS attended, COALESCE(s.confirmed, 0) AS confirmed
    FROM people p LEFT JOIN (SELECT a.person_id, SUM(${CAME_SQL}) AS attended, SUM(a.status = 'si') AS confirmed
        FROM events e JOIN attendance a ON a.event_id = e.id WHERE ${SEASON_SQL} GROUP BY a.person_id) s ON s.person_id = p.id
    WHERE p.erased_at IS NULL
    ORDER BY p.active DESC, p.name COLLATE NOCASE`).all();
  const pastEvents = db.prepare(`SELECT COUNT(*) AS n FROM events e WHERE ${SEASON_SQL}`).get().n;
  return { people: people.map((p) => personFor(user, p)), pastEvents, season: String(new Date().getFullYear()) };
}, 'staff');

route('POST', '/api/people', ({ body, user }) => {
  atMost(LIMITS.people, 'Com a molt {n} persones', 'SELECT COUNT(*) AS n FROM people');
  const data = pickPersonFields(body, editableFields(user));
  if (!data.name) fail(400, 'El nom és obligatori');
  checkAliasUnique(data.alias);
  const id = insertRow('people', data);
  return personFor(user, db.prepare('SELECT * FROM people WHERE id = ?').get(id));
}, 'people');

route('PUT', '/api/people/:id', ({ params, body, user }) => {
  const person = db.prepare('SELECT * FROM people WHERE id = ? AND erased_at IS NULL').get(params.id) || fail(404, 'Persona no trobada');
  const data = pickPersonFields(body, [...editableFields(user), 'active']);
  checkAliasUnique(data.alias, person.id);
  updateRow('people', person.id, data);
  // Qui es dona de baixa perd les sessions i deixa de rebre avisos al mòbil (si hi havia entrat també un compte
  // d'administració, el mòbil continua lligat a aquest compte).
  if (data.active === 0) {
    db.prepare('DELETE FROM auth_tokens WHERE person_id = ?').run(person.id);
    db.prepare('DELETE FROM push_subscriptions WHERE person_id = ? AND admin_id IS NULL').run(person.id);
    db.prepare('UPDATE push_subscriptions SET person_id = NULL WHERE person_id = ?').run(person.id);
  }
  return personFor(user, db.prepare('SELECT * FROM people WHERE id = ?').get(person.id));
}, 'people');

// Esborrar una persona (dret de supressió): no es treu la fila, sinó tot el que la identifica. Així els castells
// passats es veuen sencers («Persona esborrada» a la seva posició) i els totals d'assistència i de pagaments no
// canvien. Es treuen el nom, el contacte, les mides, les notes, els comentaris i les respostes de text lliure, els
// noms dels acompanyants, els encàrrecs, les sessions obertes i els mòbils amb avisos.
export const ERASED_NAME = 'Persona esborrada';
export const PERSON_WIPE = PROFILE_FIELDS.filter((f) => f !== 'name');
route('DELETE', '/api/people/:id', ({ params }) => {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(params.id) || fail(404, 'Persona no trobada');
  transaction(() => {
    db.prepare(`UPDATE people SET name = ?, ${PERSON_WIPE.map((f) => `${f} = NULL`).join(', ')}, active = 0,
      erased_at = ? WHERE id = ?`).run(ERASED_NAME, nowUtc(), person.id);
    const textFields = new Set(db.prepare("SELECT id FROM event_fields WHERE kind = 'text'").all().map((f) => String(f.id)));
    for (const a of db.prepare('SELECT event_id, extra FROM attendance WHERE person_id = ?').all(person.id)) {
      let extra = null;
      try { extra = JSON.parse(a.extra || 'null'); } catch { /* malmès: es treu */ }
      const kept = extra && typeof extra === 'object'
        ? Object.fromEntries(Object.entries(extra).filter(([k]) => !textFields.has(String(k)))) : null;
      db.prepare('UPDATE attendance SET comment = NULL, extra = ? WHERE event_id = ? AND person_id = ?')
        .run(kept && Object.keys(kept).length ? JSON.stringify(kept) : null, a.event_id, person.id);
    }
    const companion = `Acompanyant de ${ERASED_NAME}`;
    db.prepare('UPDATE event_guests SET name = ?, colla = NULL WHERE companion_of = ?').run(companion, person.id);
    db.prepare('UPDATE castell_positions SET guest_name = ? WHERE guest_id IN (SELECT id FROM event_guests WHERE companion_of = ?)')
      .run(companion, person.id);
    for (const t of ['event_roles', 'auth_tokens', 'push_reminders']) db.prepare(`DELETE FROM ${t} WHERE person_id = ?`).run(person.id);
    db.prepare('DELETE FROM push_subscriptions WHERE person_id = ? AND admin_id IS NULL').run(person.id);
    db.prepare('UPDATE push_subscriptions SET person_id = NULL WHERE person_id = ?').run(person.id);
  });
  // El diari de canvis (WAL) encara té les pàgines d'abans d'esborrar-la: es passa al fitxer (ja amb zeros, veure
  // secure_delete a db.js) i es buida, perquè no en quedi res llegible.
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  return { ok: true };
}, 'admin');

// Totes les dades d'una persona en un fitxer (dret d'accés i de portabilitat del RGPD): el que diu la nota de
// privadesa que es guarda. Només ho poden fer els administradors: els membres entren sense contrasenya.
route('GET', '/api/people/:id/export', ({ params, res }) => {
  const p = db.prepare('SELECT * FROM people WHERE id = ?').get(params.id) || fail(404, 'Persona no trobada');
  const labels = new Map(db.prepare(`SELECT f.id, f.label FROM event_fields f JOIN attendance a ON a.event_id = f.event_id
    WHERE a.person_id = ?`).all(p.id).map((f) => [String(f.id), f.label]));
  const yesNo = (v) => (v === null || v === undefined ? null : !!v);
  const attendance = db.prepare(`SELECT e.date, e.title, e.type, a.event_id, a.status, a.came, a.escoleta, a.extra, a.comment, a.updated_at,
      a.paid_at, a.received_at, a.received_cash, a.pay_reminded_at
    FROM attendance a JOIN events e ON e.id = a.event_id WHERE a.person_id = ? ORDER BY e.date, e.start_time`).all(p.id)
    .map((r) => {
      // Si la sessió es pagava: quant, si va dir que havia pagat i si la junta ho va rebre.
      const payment = paymentOf(r.event_id);
      return { data: r.date, sessio: r.title, tipus: r.type, resposta: r.status, ha_vingut: yesNo(r.came), escoleta: yesNo(r.escoleta),
        camps: Object.fromEntries(Object.entries(parseJSON(r.extra, {})).map(([k, v]) => [labels.get(k) || k, v])), comentari: r.comment,
        actualitzat: r.updated_at,
        import_euros: payment ? amountOf(r.event_id, p.id, payment) / 100 : null, diu_que_ha_pagat: r.paid_at, pagament_rebut: r.received_at,
        pagat_en_efectiu: yesNo(r.received_cash), recordatori_de_pagament: r.pay_reminded_at };
    });
  const positions = db.prepare(`SELECT c.*, cp.pos_key, e.date, e.title FROM castell_positions cp JOIN castells c ON c.id = cp.castell_id
    JOIN events e ON e.id = c.event_id WHERE cp.person_id = ? ORDER BY e.date, c.position`).all(p.id)
    .map((r) => ({ data: r.date, sessio: r.title, castell: castellName(r), posicio: positionOf(r, r.pos_key)?.role || r.pos_key,
      resultat: r.result }));
  const companions = db.prepare(`SELECT e.date, e.title, g.name FROM event_guests g JOIN events e ON e.id = g.event_id
    WHERE g.companion_of = ? ORDER BY e.date`).all(p.id).map((r) => ({ data: r.date, sessio: r.title, acompanyant: r.name }));
  const devices = db.prepare('SELECT endpoint, lang, created_at FROM push_subscriptions WHERE person_id = ?').all(p.id)
    .map((d) => ({ servei: new URL(d.endpoint).hostname, idioma: d.lang, des_de: d.created_at }));
  const reminders = db.prepare(`SELECT e.date, e.title FROM push_reminders r JOIN events e ON e.id = r.event_id
    WHERE r.person_id = ? ORDER BY e.date`).all(p.id).map((r) => ({ data: r.date, sessio: r.title }));
  const roles = db.prepare(`SELECT e.date, e.title, r.label FROM event_roles r JOIN events e ON e.id = r.event_id
    WHERE r.person_id = ? ORDER BY e.date`).all(p.id).map((r) => ({ data: r.date, sessio: r.title, encarrec: r.label }));
  const out = {
    colla: COLLA_NAME, contacte: PRIVACY_CONTACT || null, generat: nowLocal(),
    persona: { nom: p.name, malnom: p.alias, correu: p.email, telefon: p.phone, data_naixement: p.birthdate, alcada_cm: p.height_cm,
      alcada_espatlles_cm: p.shoulder_height_cm, amplada_espatlles_cm: p.shoulder_width_cm, pes_kg: p.weight_kg, notes: p.notes,
      instrument: p.instrument, grup: p.section, activa: !!p.active, alta: p.created_at, consentiment_tutor: p.guardian_consent },
    assistencia: attendance,
    posicions: positions,
    acompanyants: companions,
    mobils_amb_avisos: devices,
    recordatoris: reminders,
    encarrecs: roles,
    sessions_obertes: db.prepare('SELECT COUNT(*) AS n FROM auth_tokens WHERE person_id = ? AND expires_at > ?').get(p.id, Date.now()).n,
  };
  const slug = String(p.alias || p.name).normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'persona';
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="dades-${slug}-${nowLocal().slice(0, 10)}.json"` });
  res.end(JSON.stringify(out, null, 2));
}, 'admin');

// Importar persones d'un full de càlcul. L'app llegeix el fitxer i envia cada fila amb els camps ja triats.
// És tot o res: si una fila té un error no s'importa cap, i es diu quines fallen. Amb «check» només es comprova.
// Una persona que ja hi és (mateix nom) no es toca, tret que es demani «update»: llavors s'hi posen les dades del fitxer.
export const IMPORT_ERRORS = 50;
// Per dir a quina columna és l'error (són els mateixos noms que a la fitxa de l'app).
export const IMPORT_LABELS = { alias: 'Malnom', email: 'Correu', phone: 'Telèfon', birthdate: 'Data de naixement', height_cm: 'Alçada',
  shoulder_height_cm: "Alçada d'espatlles", shoulder_width_cm: "Amplada d'espatlles", weight_kg: 'Pes', instrument: 'Músic/a', section: 'Grup' };
route('POST', '/api/people/import', ({ req, body, user }) => {
  const rows = Array.isArray(body.people) ? body.people : fail(400, 'Dades no vàlides');
  if (!rows.length) fail(400, 'El fitxer no té cap persona');
  if (rows.length > LIMITS.people) fail(400, 'Com a molt {n} persones', { n: LIMITS.people });
  const lang = ['es', 'en'].includes(req.headers['x-lang']) ? req.headers['x-lang'] : 'ca';
  const existing = db.prepare('SELECT id, name, alias FROM people WHERE erased_at IS NULL').all();
  const byName = new Map(existing.map((p) => [normName(p.name), p]));
  const byAlias = new Map(existing.filter((p) => p.alias).map((p) => [normName(p.alias), p]));
  const seen = new Set();
  const create = [], update = [], errors = [];
  let skip = 0;
  rows.forEach((row, index) => {
    try {
      if (!row || typeof row !== 'object' || Array.isArray(row)) fail(400, 'Dades no vàlides');
      const data = pickPersonFields(row, editableFields(user));
      if (!data.name) fail(400, 'El nom és obligatori');
      const key = normName(data.name);
      if (seen.has(key)) fail(400, '«{name}» surt més d\'un cop al fitxer', { name: data.name });
      seen.add(key);
      const match = byName.get(key);
      const self = match || { name: data.name };
      if (data.alias) {
        const owner = byAlias.get(normName(data.alias));
        if (owner && owner !== self) fail(400, 'El malnom «{alias}» ja el fa servir {name}', { alias: data.alias, name: owner.name });
        byAlias.set(normName(data.alias), self);
      }
      if (!match) create.push(data);
      else if (body.update) update.push([match.id, data]);
      else skip++;
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      const message = translate(lang, err.message, err.params);
      const label = err.field && IMPORT_LABELS[err.field] ? translate(lang, IMPORT_LABELS[err.field]) : '';
      errors.push({ index, error: label && !message.includes(label) ? `${label}: ${message}` : message });
    }
  });
  if (existing.length + create.length > LIMITS.people) fail(400, 'Com a molt {n} persones', { n: LIMITS.people });
  const summary = { create: create.length, update: update.length, skip, errorCount: errors.length, errors: errors.slice(0, IMPORT_ERRORS) };
  if (body.check || errors.length) return summary;
  transaction(() => {
    for (const data of create) insertRow('people', data);
    for (const [id, data] of update) updateRow('people', id, data);
  });
  return { ...summary, done: true };
}, 'import');
