// Grups de la colla (canalla, tècnica, junta) a «Qui hi va», resposta ràpida des de la llista de sessions i encarregats.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sessions } from './helpers.js';
import { install, written } from './fakedom.js';

let server, s, ui, ids = {}, who = 'member';
before(async () => {
  server = await startServer();
  s = await sessions(server);
  install({ base: server.url, cookies: () => Object.entries(s[who].jar).map(([k, v]) => `${k}=${v}`).join('; ') });
  const A = s.admin;
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  ids.open = (await A('POST', '/events', { hidden: false, type: 'assaig', title: 'Assaig obert', date })).d.id;
  ids.required = (await A('POST', '/events', { hidden: false, type: 'diada', title: 'Diada amb dinar', date })).d.id;
  await A('POST', `/events/${ids.required}/fields`, { label: 'Dinar', kind: 'bool', required: true });
  ui = async (file) => import(`../public/ui/${file}.js`);
});
after(() => server.stop());

async function paint(fn) {
  written.length = 0;
  await fn();
  await new Promise((r) => setTimeout(r, 60));
  return written.join('\n');
}
async function as(role) {
  who = role;
  const core = await ui('core');
  core.setRenderer(() => {});
  core.setConfig(await core.api('GET', '/config'));
  core.setMe(await core.api('GET', '/me'));
  return core;
}

test('el grup de cada persona: només els valors de la llista, i la persona el veu a la seva fitxa', async () => {
  const A = s.admin;
  assert.equal((await A('PUT', `/people/${s.personId}`, { section: 'cap-de-colla' })).s, 400);
  // Tronc i pinya ja no són grups.
  assert.equal((await A('PUT', `/people/${s.personId}`, { section: 'pinya' })).s, 400);
  assert.equal((await A('PUT', `/people/${s.personId}`, { section: 'canalla' })).d.section, 'canalla');
  assert.equal((await s.member('GET', '/me')).d.section, 'canalla');
  assert.equal((await A('PUT', `/people/${s.personId}`, { section: '' })).d.section, null);
});

test('«Qui hi va» es separa per grups, amb els músics a part', async () => {
  const A = s.admin;
  const people = (await A('GET', '/people')).d.people.filter((p) => p.active && !p.instrument).slice(0, 4);
  const [tecnica, canalla, sense, junta] = people;
  await A('PUT', `/people/${tecnica.id}`, { section: 'tecnica' });
  await A('PUT', `/people/${junta.id}`, { section: 'junta' });
  await A('PUT', `/people/${canalla.id}`, { section: 'canalla' });
  const musician = (await A('GET', '/people')).d.people.find((p) => p.active && p.instrument);
  for (const p of [tecnica, canalla, sense, musician]) await A('PUT', `/events/${ids.open}/attendance/${p.id}`, { status: 'si' });
  const ev = (await s.member('GET', `/events/${ids.open}`)).d;
  assert.equal(ev.attendance.find((a) => a.id === canalla.id).section, 'canalla');
  // El membre no veu cap altra dada de la fitxa.
  assert.deepEqual(Object.keys(ev.attendance[0]).sort(), ['alias', 'id', 'instrument', 'name', 'present', 'section', 'status']);

  await as('member');
  const html = await paint(async () => (await ui('event')).pageEvent(ids.open));
  const heads = [...html.matchAll(/<h3 class="instr-h">([^<]+)<\/h3>/g)].map((m) => m[1].replace(/ · \d+$/, ''));
  assert.deepEqual(heads, ['Canalla', 'Tècnica', 'Músics', 'Altres']);

  // L'administració ho veu separat a la taula d'assistència, amb tothom (també qui no ha respost).
  await as('admin');
  const admin = await paint(async () => (await ui('event')).pageEvent(ids.open));
  const rows = [...admin.matchAll(/<tr class="group-row"><th colspan="\d+">([^<]+?)\s*<span>([^<]+)<\/span>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(rows.map(([g]) => g), ['Canalla', 'Tècnica', 'Junta', 'Músics', 'Altres']);
  assert.match(rows[0][1], /^1 vénen · \d+$/);
  assert.match(rows[2][1], /^0 vénen · 1$/);
});

test('des de la llista de sessions es pot dir «Vinc» o «No vinc»', async () => {
  await as('member');
  const sessionsUi = await ui('sessions');
  let html = await paint(() => sessionsUi.pageHome());
  assert.match(html, new RegExp(`data-quick="si" data-id="${ids.open}"`));
  assert.ok(!/<a [^>]*class="card event-card/.test(html), 'la targeta no és un enllaç que contingui botons');

  // Una sessió sense preguntes obligatòries es desa directament (el que fa el botó).
  let list = (await s.member('GET', '/events')).d;
  await sessionsUi.quickAnswer(list.find((e) => e.id === ids.open), 'no');
  assert.equal((await s.member('GET', `/events/${ids.open}`)).d.mine.status, 'no');
  html = await paint(() => sessionsUi.pageHome());
  assert.match(html, new RegExp(`data-quick="no" data-id="${ids.open}" class="on"`));

  // Amb preguntes obligatòries, «Vinc» porta a la sessió i no desa res.
  list = (await s.member('GET', '/events')).d;
  assert.equal(list.find((e) => e.id === ids.open).required_fields, 0);
  const required = list.find((e) => e.id === ids.required);
  assert.equal(required.required_fields, 1);
  await sessionsUi.quickAnswer(required, 'si');
  assert.equal(location.hash, `#/sessio/${ids.required}`);
  assert.equal((await s.member('GET', `/events/${ids.required}`)).d.mine, null);
  // Però «No vinc» sí que es pot dir des de la llista.
  await sessionsUi.quickAnswer(required, 'no');
  assert.equal((await s.member('GET', `/events/${ids.required}`)).d.mine.status, 'no');
});

test('encarregats: els posa l\'administració, i tothom veu de què s\'encarrega cadascú (pel nom curt)', async () => {
  const A = s.admin;
  const person = (await A('GET', '/people')).d.people.find((p) => p.id === s.personId);
  assert.equal((await s.member('POST', `/events/${ids.open}/roles`, { label: 'Material', person_id: s.personId })).s, 403);
  assert.equal((await A('POST', `/events/${ids.open}/roles`, { label: ' ', person_id: s.personId })).s, 400);
  assert.equal((await A('POST', `/events/${ids.open}/roles`, { label: 'Material', person_id: 999999 })).s, 404);
  const roles = (await A('POST', `/events/${ids.open}/roles`, { label: 'Material', person_id: s.personId })).d;
  assert.equal(roles.length, 1);
  assert.equal((await A('POST', `/events/${ids.open}/roles`, { label: 'Material', person_id: s.personId })).s, 400, 'no es repeteix');

  const seen = (await s.member('GET', `/events/${ids.open}`)).d.roles;
  assert.deepEqual(seen, [{ id: roles[0].id, label: 'Material', person_id: s.personId, name: person.alias || person.name.replace(/^(\S+)\s+(\S).*$/, '$1 $2.'), alias: null }]);
  assert.equal((await s.member('GET', `/events/${ids.open}`)).d.roleLabels, undefined);
  assert.deepEqual((await A('GET', `/events/${ids.required}`)).d.roleLabels, ['Material']);

  // La persona ho veu a la seva resposta, i surt a la descàrrega de les seves dades.
  await as('member');
  const html = await paint(async () => (await ui('event')).pageEvent(ids.open));
  assert.match(html, /T'encarregues de: <strong>Material<\/strong>/);
  const data = (await A('GET', `/people/${s.personId}/export`)).d;
  assert.ok(data.encarrecs.some((r) => r.encarrec === 'Material'));

  assert.deepEqual((await A('DELETE', `/events/${ids.open}/roles/${roles[0].id}`)).d, []);
});

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
