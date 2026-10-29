// Dades de la colla: importar persones d'un full de càlcul, còpies de seguretat (i restaurar-ne una) i la nota de
// privadesa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer, client, sessions } from './helpers.js';
import { parseCsv, guessField, normDate, normNumber, rowsToPeople } from '../public/import.js';

let server, s;
before(async () => { server = await startServer({ PRIVACY_CONTACT: 'junta@colla.cat' }); s = await sessions(server); });
after(() => server.stop());

const count = async () => (await s.admin('GET', '/people')).d.people.length;

// ---------- Lectura del fitxer (a l'app) ----------
test('CSV: separadors, cometes, salts de línia i la marca d\'Excel', () => {
  assert.deepEqual(parseCsv('﻿Nom;Notes\r\nAnna;"Diu ""hola""; i\nmarxa"\r\n'), [['Nom', 'Notes'], ['Anna', 'Diu "hola"; i\nmarxa']]);
  assert.deepEqual(parseCsv('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('columnes: es reconeixen en català, castellà i anglès', () => {
  const headers = ['Nom', 'Cognoms', 'Malnom', 'Correu electrònic', 'Mòbil', 'Data de naixement', 'Alçada (cm)', "Alçada d'espatlles",
    'Amplada espatlles', 'Pes (kg)', 'Observacions', 'Apellidos', 'Altura hombros', 'Shoulder width', 'Weight', 'Fecha de nacimiento', 'Columna rara'];
  assert.deepEqual(headers.map(guessField), ['name', 'surname', 'alias', 'email', 'phone', 'birthdate', 'height_cm', 'shoulder_height_cm',
    'shoulder_width_cm', 'weight_kg', 'notes', 'surname', 'shoulder_height_cm', 'shoulder_width_cm', 'weight_kg', 'birthdate', '']);
});

test('valors: dates i mides escrites de maneres diferents', () => {
  assert.equal(normDate('15/06/2010'), '2010-06-15');
  assert.equal(normDate('5-6-10'), '2010-06-05');
  assert.equal(normDate('2010-6-5'), '2010-06-05');
  assert.equal(normDate('40344'), '2010-06-15', 'número de dies d\'Excel');
  assert.equal(normNumber('1,62', 'height_cm'), 162, 'metres → cm');
  assert.equal(normNumber('70,5 kg', 'weight_kg'), 70.5);
  assert.deepEqual(rowsToPeople([['Maria', 'Puig Soler', '', 'Gralla']], ['name', 'surname', 'alias', 'instrument']),
    [{ name: 'Maria Puig Soler', instrument: 'gralla' }], 'les cel·les buides no s\'envien');
});

// ---------- Importar ----------
test('importar: primer es comprova, i després es crea tot', async () => {
  const n0 = await count();
  const people = [{ name: 'Importada U', alias: 'Provatura', height_cm: 170, birthdate: '1990-01-02' }, { name: 'Importada Dos' }];
  const check = (await s.admin('POST', '/people/import', { people, check: true })).d;
  assert.deepEqual([check.create, check.update, check.skip, check.errorCount, check.done], [2, 0, 0, 0, undefined]);
  assert.equal(await count(), n0, 'comprovar no crea res');
  const done = (await s.admin('POST', '/people/import', { people })).d;
  assert.ok(done.done);
  assert.equal(await count(), n0 + 2);
  const p = (await s.admin('GET', '/people')).d.people.find((x) => x.alias === 'Provatura');
  assert.equal(p.height_cm, 170);
  assert.equal(p.active, 1);
});

test('importar: qui ja hi és no es toca, tret que es demani actualitzar-ho (i les cel·les buides no esborren res)', async () => {
  const n0 = await count();
  const again = (await s.admin('POST', '/people/import', { people: [{ name: 'importada u', weight_kg: 60 }] })).d;
  assert.deepEqual([again.create, again.skip], [0, 1]);
  const upd = (await s.admin('POST', '/people/import', { people: [{ name: 'Importada U', weight_kg: 60 }], update: true })).d;
  assert.equal(upd.update, 1);
  const p = (await s.admin('GET', '/people')).d.people.find((x) => x.alias === 'Provatura');
  assert.equal(p.weight_kg, 60);
  assert.equal(p.height_cm, 170, 'el que no venia al fitxer es manté');
  assert.equal(await count(), n0);
});

test('importar: tot o res, amb la llista de files que fallen', async () => {
  const n0 = await count();
  const people = [{ name: 'Bona' }, { name: '' }, { name: 'Alta', height_cm: 900 }, { name: 'Repetida' }, { name: 'repetida' },
    { name: 'Malnom pres', alias: 'provatura' }, { name: 'Mal dia', birthdate: '31/02/2000' }, ['no', 'és', 'una', 'persona']];
  const r = (await s.admin('POST', '/people/import', { people })).d;
  assert.equal(r.done, undefined);
  assert.deepEqual(r.errors.map((e) => e.index), [1, 2, 4, 5, 6, 7]);
  assert.match(r.errors.find((e) => e.index === 4).error, /més d'un cop/);
  assert.match(r.errors.find((e) => e.index === 2).error, /^Alçada: /, 'diu a quina columna és');
  assert.match(r.errors.find((e) => e.index === 5).error, /Importada U/);
  assert.equal(await count(), n0, 'no s\'ha importat ni la fila bona');
  const es = await s.admin('POST', '/people/import', { people: [{ name: 'X', height_cm: 900 }] }, { 'x-lang': 'es' });
  assert.notEqual(es.d.errors[0].error, r.errors.find((e) => e.index === 2).error, 'els errors surten en l\'idioma de qui importa');
});

test('importar: límits i dades que no són persones', async () => {
  assert.equal((await s.admin('POST', '/people/import', { people: [] })).s, 400);
  assert.equal((await s.admin('POST', '/people/import', { people: 'Maria' })).s, 400);
  assert.equal((await s.admin('POST', '/people/import', { people: Array.from({ length: 2001 }, (_, i) => ({ name: `P ${i}` })) })).s, 400);
  const n = await count();
  const r = await s.admin('POST', '/people/import', { people: Array.from({ length: 2000 - n + 1 }, (_, i) => ({ name: `Persona ${i}` })) });
  assert.equal(r.s, 400, 'no es pot passar de 2000 persones en total');
  assert.equal((await s.member('POST', '/people/import', { people: [{ name: 'Intrús' }] })).s, 403);
});

// ---------- Còpies de seguretat ----------
test('descarregar una còpia: és la base de dades sencera, sense sessions obertes, i se\'n pot arrencar', async () => {
  const r = await fetch(`${server.url}/api/backup`, { headers: { cookie: Object.entries(s.admin.jar).map(([k, v]) => `${k}=${v}`).join('; ') } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="colla-\d{4}-\d{2}-\d{2}\.db"/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colla-copia-'));
  const file = path.join(dir, 'copia.db');
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  const copy = new DatabaseSync(file, { readOnly: true });
  assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM auth_tokens').get().n, 0);
  assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM people').get().n, await count());
  copy.close();
  // Restaurar-la: el servidor arrenca amb la còpia, hi ha la mateixa gent i es pot entrar.
  const restored = await startServer({}, { from: file });
  try {
    const admin = client(`${restored.url}/api`);
    assert.equal((await admin('POST', '/login', { username: 'admin', password: 'admin1234' })).s, 200);
    assert.equal((await admin('GET', '/people')).d.people.length, await count());
    assert.equal((await s.member('GET', '/me')).s, 200, 'les sessions del servidor original segueixen bé');
  } finally {
    await restored.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal((await client(server.url)('GET', '/api/backup')).s, 401);
  assert.equal((await s.member('GET', '/backup')).s, 403);
});

test('còpia diària: es fa en arrencar, és privada i només se\'n guarden les últimes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colla-copies-'));
  for (let d = 1; d <= 9; d++) fs.writeFileSync(path.join(dir, `colla-2020-01-0${d}.db`), 'vella');
  fs.writeFileSync(path.join(dir, 'una-altra-cosa.txt'), 'no es toca');
  const srv = await startServer({ BACKUP_DIR: dir, BACKUP_KEEP: '3' });
  try {
    const files = fs.readdirSync(dir).sort();
    assert.equal(files.length, 4, files.join(', '));
    assert.ok(files.includes('una-altra-cosa.txt'));
    assert.deepEqual(files.filter((f) => f.startsWith('colla-2020')), ['colla-2020-01-08.db', 'colla-2020-01-09.db']);
    const today = files.find((f) => !f.startsWith('colla-2020') && f.endsWith('.db'));
    assert.equal(fs.statSync(path.join(dir, today)).mode & 0o777, 0o600);
    const admin = client(`${srv.url}/api`);
    await admin('POST', '/login', { username: 'admin', password: 'admin1234' });
    const st = (await admin('GET', '/backup/status')).d;
    assert.deepEqual([st.auto, st.keep, st.count, st.last], [true, 3, 3, today.slice(6, 16)]);
  } finally {
    await srv.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal((await s.admin('GET', '/backup/status')).d.auto, false, 'a la demo no se\'n fan si no es demana');
});

// ---------- Dades d'una persona ----------
test('descarregar les dades d\'una persona: fitxa, assistència, posicions i acompanyants, només per a la tècnica', async () => {
  const r = await fetch(`${server.url}/api/people/${s.personId}/export`, { headers: { cookie: Object.entries(s.admin.jar).map(([k, v]) => `${k}=${v}`).join('; ') } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="dades-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.json"/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const d = await r.json();
  const p = (await s.admin('GET', '/people')).d.people.find((x) => x.id === s.personId);
  assert.equal(d.persona.nom, p.name);
  assert.equal(d.persona.pes_kg, p.weight_kg);
  assert.equal(d.contacte, 'junta@colla.cat');
  assert.ok(d.assistencia.length > 0 && d.assistencia.every((a) => a.data && a.sessio));
  const history = (await s.admin('GET', `/people/${s.personId}/history`)).d;
  assert.ok(d.posicions.length >= history.total, 'també les dels castells que encara no s\'han fet');
  assert.ok(d.posicions.every((x) => x.castell && x.posicio && !x.posicio.includes('-')), 'el nom de la posició, no la clau');
  assert.ok(Array.isArray(d.acompanyants) && Array.isArray(d.mobils_amb_avisos));
  assert.ok(!JSON.stringify(d).includes('password'), 'res de contrasenyes');
  assert.equal((await s.member('GET', `/people/${s.personId}/export`)).s, 403, 'tampoc les pròpies: els membres entren sense contrasenya');
  assert.equal((await s.admin('GET', '/people/999999/export')).s, 404);
});

// ---------- Privadesa ----------
test('la nota de privadesa té el contacte de la colla, i tothom la pot llegir', async () => {
  assert.equal((await client(server.url)('GET', '/api/config')).d.privacyContact, 'junta@colla.cat');
  const { PRIVACY } = await import('../public/privacy.js');
  for (const lang of ['ca', 'es', 'en']) {
    const text = PRIVACY[lang]({ colla: 'La Colla', contact: 'junta@colla.cat' });
    assert.equal(text.sections.length, 8, lang);
    assert.ok(text.sections.some(([, body]) => body.includes('junta@colla.cat')), lang);
  }
});

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
