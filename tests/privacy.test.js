// Privadesa: què veu un membre (noms públics, res de dades personals), sessions i castells ocults, i els drets de
// cada persona: saber què se'n guarda (la descàrrega) i que, si se l'esborra, no en quedi res.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { startServer, client, sessions } from './helpers.js';

let server, s;
before(async () => { server = await startServer(); s = await sessions(server); });
after(() => server.stop());

const PRIVATE = ['email', 'phone', 'birthdate', 'height_cm', 'shoulder_height_cm', 'shoulder_width_cm', 'weight_kg', 'notes', 'tech_notes', 'comment', 'extra', 'author'];
// Busca claus privades a tota la resposta (excepte la pròpia resposta del membre, «mine»).
function privateKeys(value, path = '') {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => (k === 'mine' ? [] : [
    ...(PRIVATE.includes(k) && v !== null && v !== undefined ? [`${path}${k}`] : []), ...privateKeys(v, `${path}${k}.`)]));
}
const future = (days = 6) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const fullNames = async () => new Set((await s.admin('GET', '/people')).d.people.filter((p) => /\s/.test(p.name)).map((p) => p.name));

test('un membre no rep cap dada personal ni noms sencers', async () => {
  const names = await fullNames();
  const future = (await s.member('GET', '/events')).d;
  const urls = ['/events', '/events?scope=past', `/events/${s.pastEvent.id}`, `/events/${future[0].id}`, `/castells/${s.pastCastell.id}`,
    '/stats/season?season=all', `/stats/people/${s.personId}`, `/people/${s.personId}/history`, '/announcements', '/me'];
  for (const u of urls) {
    const r = await s.member('GET', u);
    assert.equal(r.s, 200, u);
    assert.deepEqual(privateKeys(r.d), [], u);
    const leaked = [...names].filter((n) => r.text.includes(`"${n}"`));
    assert.deepEqual(leaked, [], `${u}: noms sencers`);
  }
});

test('als castells, la gent surt amb el malnom o «Nom I.»', async () => {
  const { positions } = (await s.member('GET', `/castells/${s.pastCastell.id}`)).d;
  for (const p of positions.filter((x) => x.person_id)) assert.match(p.name, /^(\S+ \S\.|[^\s]+)$/u, p.name);
});

test("un membre no veu les dades d'un altre ni hi pot respondre", async () => {
  const other = (await s.admin('GET', '/people')).d.people.find((p) => p.id !== s.personId && p.active).id;
  assert.equal((await s.member('GET', `/stats/people/${other}`)).s, 403);
  assert.equal((await s.member('GET', `/people/${other}/history`)).s, 403);
  const future = (await s.member('GET', '/events')).d.find((e) => e.rsvp_open);
  assert.equal((await s.member('PUT', `/events/${future.id}/attendance/${other}`, { status: 'si' })).s, 403);
});

test('sessions i castells ocults: per als membres no existeixen, per a l\'administració sí', async () => {
  const future = (await s.admin('GET', '/events')).d.filter((e) => e.type !== 'musics');
  const hiddenEvent = future[0];
  const otherEvent = future.find((e) => e.id !== hiddenEvent.id && e.castells);
  const hiddenCastell = (await s.admin('GET', `/events/${otherEvent.id}`)).d.castells[0];
  const histBefore = (await s.member('GET', `/people/${s.personId}/history`)).d.total;
  const seasonBefore = (await s.member('GET', '/stats/season?season=all')).d.total;

  await s.admin('PUT', `/events/${hiddenEvent.id}/hidden`, { hidden: true });
  await s.admin('PUT', `/castells/${hiddenCastell.id}/hidden`, { hidden: true });
  await s.admin('PUT', `/castells/${s.pastCastell.id}/hidden`, { hidden: true });

  assert.equal((await s.member('GET', `/events/${hiddenEvent.id}`)).s, 404);
  assert.equal((await s.member('PUT', `/events/${hiddenEvent.id}/attendance`, { status: 'si' })).s, 404);
  assert.ok(!(await s.member('GET', '/events')).d.some((e) => e.id === hiddenEvent.id));
  assert.equal((await s.member('GET', `/castells/${hiddenCastell.id}`)).s, 404);
  assert.ok(!(await s.member('GET', `/events/${otherEvent.id}`)).d.castells.some((c) => c.id === hiddenCastell.id));
  assert.ok(!(await client(server.url)('GET', '/api/calendar.ics')).text.includes(`/sessio/${hiddenEvent.id}`));
  // Un castell passat ocult tampoc compta a l'historial ni al resum dels membres (i l'administració sí que el veu).
  assert.ok((await s.member('GET', `/people/${s.personId}/history`)).d.total < histBefore);
  const adminSeason = (await s.admin('GET', '/stats/season?season=all')).d.total;
  const memberSeason = (await s.member('GET', '/stats/season?season=all')).d.total;
  assert.equal(adminSeason, seasonBefore);
  assert.equal(memberSeason, seasonBefore - 1, 'el membre no rep la versió de l\'administració guardada a la memòria');
  assert.equal((await s.admin('GET', `/castells/${hiddenCastell.id}`)).s, 200);

  for (const [u, b] of [[`/events/${hiddenEvent.id}/hidden`, 0], [`/castells/${hiddenCastell.id}/hidden`, 0], [`/castells/${s.pastCastell.id}/hidden`, 0]]) {
    await s.admin('PUT', u, { hidden: b });
  }
  assert.equal((await s.member('GET', `/people/${s.personId}/history`)).d.total, histBefore);
});

test("l'altaveu no diu als membres qui ha escrit cada missatge", async () => {
  await s.admin('POST', '/announcements', { title: 'Prova' });
  const list = (await s.member('GET', '/announcements')).d;
  assert.ok(list.length && list.every((a) => a.author === undefined));
  assert.ok((await s.admin('GET', '/announcements')).d[0].author);
});

test('les persones temporals surten als membres com «Nom I.», i qui diu que no ve no surt enlloc', async () => {
  const ev = (await s.admin('POST', '/events', { hidden: false, type: 'diada', title: 'Temporals', date: future() })).d;
  const c = (await s.admin('POST', `/events/${ev.id}/castells`, { hidden: false, width: 3, height: 7 })).d;
  const g = (await s.admin('POST', `/events/${ev.id}/guests`, { name: 'Pere Martí Soler', colla: 'Castellers de Prova' })).d;
  await s.admin('PUT', `/castells/${c.id}/positions/t1-0`, { guest_id: g.id });
  const seen = (await s.member('GET', `/castells/${c.id}`)).d.positions.find((p) => p.pos_key === 't1-0');
  assert.equal(seen.guest_name, 'Pere M.');
  assert.ok(!(await s.member('GET', `/castells/${c.id}`)).text.includes('Martí'));
  // Qui diu que no ve: els altres no ho saben (només surt qui ve).
  assert.equal((await s.member('PUT', `/events/${ev.id}/attendance`, { status: 'no', comment: 'Tinc un casament' })).s, 200);
  const other = client(`${server.url}/api`);
  const someone = (await s.admin('GET', '/people')).d.people.find((p) => p.id !== s.personId && p.active);
  await other('POST', '/identify', { person_id: someone.id });
  const view = (await other('GET', `/events/${ev.id}`)).d;
  assert.ok(!view.attendance.some((a) => a.id === s.personId));
  assert.ok(view.attendance.every((a) => a.present));
  assert.ok(!JSON.stringify(view).includes('casament'));
  await s.admin('DELETE', `/events/${ev.id}`);
});

test('una sessió oculta i una que no existeix responen igual (no es pot saber que hi és)', async () => {
  const ev = (await s.admin('POST', '/events', { hidden: false, type: 'assaig', title: 'Secreta', date: future() })).d;
  await s.admin('PUT', `/events/${ev.id}/hidden`, { hidden: true });
  const hidden = await s.member('GET', `/events/${ev.id}`);
  const none = await s.member('GET', '/events/99999999');
  assert.equal(hidden.s, none.s);
  assert.deepEqual(hidden.d, none.d);
  await s.admin('DELETE', `/events/${ev.id}`);
});

test('el calendari (que és públic) no porta el nom de ningú', async () => {
  const people = (await s.admin('GET', '/people')).d.people;
  const ics = (await client(server.url)('GET', '/api/calendar.ics')).text;
  assert.match(ics, /BEGIN:VEVENT/);
  const words = new Set(ics.split(/[^\p{L}]+/u));
  const found = people.flatMap((p) => [p.name, p.alias].filter((v) => v && (/\s/.test(v) ? ics.includes(v) : words.has(v))));
  assert.deepEqual(found, []);
});

// ---------- Drets de cada persona ----------
// Quines columnes de la base de dades surten a la descàrrega de les dades d'una persona (i amb quin nom). Si s'afegeix
// una columna o una taula amb dades de la gent, aquesta prova falla fins que no surti també a la descàrrega.
const PERSON_EXPORT = { name: 'nom', alias: 'malnom', email: 'correu', phone: 'telefon', birthdate: 'data_naixement',
  height_cm: 'alcada_cm', shoulder_height_cm: 'alcada_espatlles_cm', shoulder_width_cm: 'amplada_espatlles_cm', weight_kg: 'pes_kg',
  notes: 'notes', instrument: 'instrument', section: 'grup', active: 'activa', created_at: 'alta' };
// id; i usuari, contrasenya i rol de quan els administradors eren persones (ara sempre buits: veure db.js).
const PERSON_NOT_DATA = ['id', 'username', 'password_hash', 'role'];
const ATTENDANCE_EXPORT = { status: 'resposta', came: 'ha_vingut', escoleta: 'escoleta', extra: 'camps', comment: 'comentari', updated_at: 'actualitzat' };
// «present» és d'una versió antiga (ara es calcula, veure CAME_SQL).
const ATTENDANCE_NOT_DATA = ['event_id', 'person_id', 'present'];
// Cada taula que guarda alguna cosa d'una persona i on surt a la descàrrega.
const PERSON_TABLES = { attendance: 'assistencia', castell_positions: 'posicions', event_guests: 'acompanyants',
  push_subscriptions: 'mobils_amb_avisos', push_reminders: 'recordatoris', auth_tokens: 'sessions_obertes', event_roles: 'encarrecs' };

test('la descàrrega de les dades d\'una persona porta tot el que se\'n guarda', async () => {
  const db = new DatabaseSync(server.dbPath, { readOnly: true });
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name).sort();
  assert.deepEqual(cols('people'), [...Object.keys(PERSON_EXPORT), ...PERSON_NOT_DATA].sort());
  assert.deepEqual(cols('attendance'), [...Object.keys(ATTENDANCE_EXPORT), ...ATTENDANCE_NOT_DATA].sort());
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name)
    .filter((t) => t !== 'people' && db.prepare(`PRAGMA foreign_key_list(${t})`).all().some((f) => f.table === 'people'));
  db.close();
  assert.deepEqual(tables.sort(), Object.keys(PERSON_TABLES).sort());
  const r = await s.admin('GET', `/people/${s.personId}/export`);
  assert.deepEqual(Object.keys(r.d.persona).sort(), Object.values(PERSON_EXPORT).sort());
  for (const key of Object.values(PERSON_TABLES)) assert.ok(key in r.d, key);
  assert.ok(r.d.assistencia.length);
  for (const a of r.d.assistencia) for (const key of Object.values(ATTENDANCE_EXPORT)) assert.ok(key in a, key);
});

test('esborrar una persona no en deixa cap rastre: ni a la base de dades, ni dins del fitxer, ni a les respostes', async () => {
  const A = s.admin;
  const p = (await A('POST', '/people', { name: 'Zeldaesborrable Puig', alias: 'zeldaesb', email: 'zelda@esborra.cat', phone: '600111999',
    notes: 'notaesborrable', birthdate: '1990-05-05', height_cm: 170 })).d;
  const ev = (await A('POST', '/events', { hidden: false, type: 'diada', title: 'Esborrar', date: future(), ask_companions: true })).d;
  const field = (await A('POST', `/events/${ev.id}/fields`, { label: 'Talla', kind: 'text' })).d.at(-1);
  const c = (await A('POST', `/events/${ev.id}/castells`, { hidden: false, width: 3, height: 7 })).d;
  const m = client(`${server.url}/api`);
  await m('POST', '/identify', { person_id: p.id });
  assert.equal((await m('PUT', `/events/${ev.id}/attendance`, { status: 'si', comment: 'comentariesborrable',
    companions: ['Acompesborrable Roca'], extra: { [field.id]: 'tallaesborrable' } })).s, 200);
  const companion = (await A('GET', `/events/${ev.id}`)).d.guests.find((g) => g.companion_of === p.id);
  await A('PUT', `/castells/${c.id}/positions/t1-0`, { person_id: p.id });
  await A('PUT', `/castells/${c.id}/positions/t2-0`, { guest_id: companion.id });
  // Un mòbil amb avisos, un missatge per recollir i un recordatori enviat (directament: cap avís surt cap a fora).
  const live = new DatabaseSync(server.dbPath);
  const sub = live.prepare("INSERT INTO push_subscriptions (endpoint, person_id) VALUES ('https://fcm.googleapis.com/fcm/send/esborrable', ?)").run(p.id);
  live.prepare("INSERT INTO push_inbox (subscription_id, title) VALUES (?, 'avisesborrable')").run(sub.lastInsertRowid);
  live.prepare('INSERT INTO push_reminders (event_id, person_id) VALUES (?, ?)').run(ev.id, p.id);
  live.close();
  assert.ok((await A('GET', '/stats/people?season=all')).text.includes('Zeldaesborrable'), 'abans hi era');

  assert.equal((await A('DELETE', `/people/${p.id}`)).s, 200);
  const needles = ['Zeldaesborrable', 'zeldaesb', 'zelda@esborra.cat', '600111999', 'notaesborrable', 'comentariesborrable',
    'Acompesborrable', 'tallaesborrable', 'fcm/send/esborrable', 'avisesborrable'];
  const found = [];
  const db = new DatabaseSync(server.dbPath, { readOnly: true });
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
    const refs = db.prepare(`PRAGMA foreign_key_list(${name})`).all().filter((f) => f.table === 'people').map((f) => f.from);
    for (const row of db.prepare(`SELECT * FROM ${name}`).all()) {
      const text = JSON.stringify(row);
      for (const n of needles) if (text.includes(n)) found.push(`${name}: ${n}`);
      for (const col of refs) if (row[col] === p.id) found.push(`${name}.${col}`);
    }
  }
  db.close();
  // Tampoc als bytes del fitxer (el que s'esborra no es pot quedar a l'espai lliure ni al diari de canvis).
  for (const f of [server.dbPath, `${server.dbPath}-wal`]) {
    if (!fs.existsSync(f)) continue;
    const bytes = fs.readFileSync(f);
    for (const n of needles) if (bytes.includes(n)) found.push(`fitxer ${f.split('/').pop()}: ${n}`);
  }
  for (const u of ['/people', `/events/${ev.id}`, `/castells/${c.id}`, '/stats/season?season=all', '/stats/tecnica?season=all',
    '/stats/people?season=all', '/stats/castells?season=all', '/announcements']) {
    const r = await A('GET', u);
    for (const n of needles) if (r.text.includes(n)) found.push(`${u}: ${n}`);
  }
  assert.deepEqual(found, []);
  assert.equal((await m('GET', '/me')).s, 401);
  await A('DELETE', `/events/${ev.id}`);
});

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
