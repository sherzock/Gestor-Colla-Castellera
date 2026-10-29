// Grups de la colla (tècnica, canalla, tronc, pinya) a «Qui hi va», i resposta ràpida des de la llista de sessions.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sessions } from './helpers.js';
import { install, written } from './fakedom.js';

let server, s, ui, ids = {};
before(async () => {
  server = await startServer();
  s = await sessions(server);
  install({ base: server.url, cookies: () => Object.entries(s.member.jar).map(([k, v]) => `${k}=${v}`).join('; ') });
  const A = s.admin;
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  ids.open = (await A('POST', '/events', { type: 'assaig', title: 'Assaig obert', date })).d.id;
  ids.required = (await A('POST', '/events', { type: 'diada', title: 'Diada amb dinar', date })).d.id;
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
async function asMember() {
  const core = await ui('core');
  core.setRenderer(() => {});
  core.setConfig(await core.api('GET', '/config'));
  core.setMe(await core.api('GET', '/me'));
  return core;
}

test('el grup de cada persona: només els valors de la llista, i la persona el veu a la seva fitxa', async () => {
  const A = s.admin;
  assert.equal((await A('PUT', `/people/${s.personId}`, { section: 'cap-de-colla' })).s, 400);
  assert.equal((await A('PUT', `/people/${s.personId}`, { section: 'canalla' })).d.section, 'canalla');
  assert.equal((await s.member('GET', '/me')).d.section, 'canalla');
  assert.equal((await A('PUT', `/people/${s.personId}`, { section: '' })).d.section, null);
});

test('«Qui hi va» es separa per grups, amb els músics a part', async () => {
  const A = s.admin;
  const people = (await A('GET', '/people')).d.people.filter((p) => p.active && !p.instrument).slice(0, 4);
  const [tecnica, canalla, sense] = people;
  await A('PUT', `/people/${tecnica.id}`, { section: 'tecnica' });
  await A('PUT', `/people/${canalla.id}`, { section: 'canalla' });
  const musician = (await A('GET', '/people')).d.people.find((p) => p.active && p.instrument);
  for (const p of [tecnica, canalla, sense, musician]) await A('PUT', `/events/${ids.open}/attendance/${p.id}`, { status: 'si' });
  const ev = (await s.member('GET', `/events/${ids.open}`)).d;
  assert.equal(ev.attendance.find((a) => a.id === canalla.id).section, 'canalla');
  // El membre no veu cap altra dada de la fitxa.
  assert.deepEqual(Object.keys(ev.attendance[0]).sort(), ['alias', 'id', 'instrument', 'name', 'present', 'section', 'status']);

  await asMember();
  const html = await paint(async () => (await ui('event')).pageEvent(ids.open));
  const heads = [...html.matchAll(/<h3 class="instr-h">([^<]+)<\/h3>/g)].map((m) => m[1].replace(/ · \d+$/, ''));
  assert.deepEqual(heads, ['Tècnica', 'Canalla', 'Música', 'Altres']);
});

test('des de la llista de sessions es pot dir «Vinc» o «No vinc»', async () => {
  await asMember();
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

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
