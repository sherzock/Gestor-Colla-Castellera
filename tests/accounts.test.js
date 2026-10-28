// Fora de la demo, amb codi de la colla i darrere d'un proxy: comptes d'administració, codi i límits d'intents.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client } from './helpers.js';

const CODE = 'pinya2026';
let server, api;
before(async () => {
  server = await startServer({ DEMO: '0', COLLA_CODE: CODE, TRUST_PROXY: '1' });
  api = `${server.url}/api`;
});
after(() => server.stop());

const from = (ip) => ({ 'x-forwarded-for': ip });

test('comptes: crear, canviar i esborrar demanen la contrasenya de qui ho fa', async () => {
  const admin = client(api);
  assert.equal((await admin('POST', '/login', { username: 'admin', password: 'admin1234' }, from('10.0.0.1'))).s, 200);
  const data = { name: 'Marta', username: 'marta', password: 'castells-de-nou-2026' };
  assert.notEqual((await admin('POST', '/admins', data)).s, 200, 'sense contrasenya');
  assert.notEqual((await admin('POST', '/admins', { ...data, currentPassword: 'dolenta' })).s, 200, 'contrasenya equivocada');
  const created = await admin('POST', '/admins', { ...data, currentPassword: 'admin1234' });
  assert.equal(created.s, 200);
  assert.notEqual((await admin('PUT', `/admins/${created.d.id}`, { username: 'altra' })).s, 200);
  assert.notEqual((await admin('DELETE', `/admins/${created.d.id}`, {})).s, 200);
  assert.equal((await admin('DELETE', `/admins/${created.d.id}`, { currentPassword: 'admin1234' })).s, 200);
  for (const password of ['12345678', 'contrasenya', 'x'.repeat(300)]) {
    assert.equal((await admin('POST', '/admins', { ...data, password, currentPassword: 'admin1234' })).s, 400, password);
  }
});

test('codi de la colla: endevinar-lo es bloqueja per adreça, i el calendari també el demana', async () => {
  const anon = client(api);
  let last;
  for (let i = 0; i < 21; i++) last = await anon('POST', '/directory', { code: `prova${i}` }, from('10.1.1.1'));
  assert.equal(last.s, 429);
  assert.equal((await anon('POST', '/directory', { code: CODE }, from('10.1.1.1'))).s, 429, 'ni amb el codi bo mentre dura');
  assert.equal((await anon('POST', '/directory', { code: CODE }, from('10.2.2.2'))).s, 200, 'des d\'una altra adreça, sí');
  // L'adreça que compta és l'última (la que hi posa el proxy); les anteriors les pot inventar qualsevol.
  assert.equal((await anon('POST', '/directory', { code: CODE }, { 'x-forwarded-for': '1.2.3.4, 10.1.1.1' })).s, 429);
  assert.equal((await anon('GET', '/calendar.ics?code=dolent', undefined, from('10.3.3.3'))).s, 401);
  assert.equal((await anon('GET', `/calendar.ics?code=${CODE}`, undefined, from('10.3.3.3'))).s, 200);
});

test('IPv6: canviar d\'adreça dins del mateix bloc /64 no salta el límit', async () => {
  const anon = client(api);
  for (let i = 0; i < 20; i++) await anon('POST', '/directory', { code: 'x' }, from(`2001:db8:1:2::${i.toString(16)}`));
  assert.equal((await anon('POST', '/directory', { code: CODE }, from('2001:db8:1:2:ffff:1:2:3'))).s, 429);
});

test("contrasenya d'administració: 10 errors per adreça i es bloqueja", async () => {
  const anon = client(api);
  let last;
  for (let i = 0; i < 11; i++) last = await anon('POST', '/login', { username: 'admin', password: `dolenta${i}` }, from('10.9.9.9'));
  assert.equal(last.s, 429);
  assert.equal((await anon('POST', '/login', { username: 'admin', password: 'admin1234' }, from('10.9.9.8'))).s, 200);
});

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
