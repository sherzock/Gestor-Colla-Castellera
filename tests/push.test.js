// Avisos al mòbil: subscriure's, l'avís (buit i signat) que rep el servei de notificacions, la bústia d'on el mòbil
// recull el text, els recordatoris de respondre i qui deixa de rebre'n. El servei de notificacions és un de fals, local.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { startServer, client, sessions } from './helpers.js';
import { validEndpoint } from '../push.js';

let server, s, service, hits = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
before(async () => {
  // Respon 201 com un servei de debò, i 410 a /gone (un mòbil que ja no existeix).
  service = http.createServer((req, res) => {
    let size = 0;
    req.on('data', (c) => { size += c.length; });
    req.on('end', () => { hits.push({ path: req.url, auth: req.headers.authorization, ttl: req.headers.ttl, size }); res.writeHead(req.url === '/gone' ? 410 : 201).end(); });
  });
  await new Promise((r) => service.listen(0, '127.0.0.1', r));
  server = await startServer({ PUSH_EXTRA_HOSTS: `127.0.0.1:${service.address().port}`, PUSH_REMINDER_MS: '150' });
  s = await sessions(server);
});
after(async () => { await server.stop(); service.close(); });

const endpoint = (name) => `http://127.0.0.1:${service.address().port}/${name}`;
const inbox = async (name) => (await client(`${server.url}/api`)('POST', '/push/inbox', { endpoint: endpoint(name) })).d.messages;
const until = async (fn) => { for (let i = 0; i < 40 && !fn(); i++) await wait(50); };

test('només es fan servir serveis de notificacions coneguts', () => {
  assert.ok(validEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(validEndpoint('https://web.push.apple.com/QGx'));
  assert.ok(validEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'));
  for (const bad of ['http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://evil.com/fcm.googleapis.com',
    'http://169.254.169.254/latest', 'https://localhost/x', 'https://fcm.googleapis.com:8443/x', 'no és una adreça', 42]) {
    assert.ok(!validEndpoint(bad), String(bad));
  }
});

test('subscriure\'s: cal haver entrat, i l\'adreça ha de ser d\'un servei d\'avisos', async () => {
  assert.equal((await client(`${server.url}/api`)('POST', '/push/subscribe', { endpoint: endpoint('m1') })).s, 401);
  assert.equal((await s.member('POST', '/push/subscribe', { endpoint: 'http://169.254.169.254/latest' })).s, 400);
  assert.equal((await s.member('POST', '/push/subscribe', { endpoint: endpoint('m1') })).s, 200);
  assert.equal((await s.admin('POST', '/push/subscribe', { endpoint: endpoint('a1') })).s, 200);
  assert.equal((await s.member('POST', '/push/subscribe', { endpoint: endpoint('gone') })).s, 200);
  assert.match((await s.member('GET', '/push/key')).d.key, /^[A-Za-z0-9_-]{87}$/);
});

test('un missatge a l\'Altaveu: avís buit i signat a cada mòbil, i el text a la bústia', async () => {
  hits = [];
  await s.admin('POST', '/announcements', { title: 'Assaig canviat', body: 'Divendres a les 8' });
  await until(() => hits.length >= 3);
  assert.deepEqual(hits.map((h) => h.path).sort(), ['/a1', '/gone', '/m1']);
  const key = (await s.member('GET', '/push/key')).d.key;
  for (const h of hits) {
    assert.equal(h.size, 0, 'cap text passa pel servei de notificacions');
    assert.equal(h.ttl, '86400');
    const [, jwt, k] = h.auth.match(/^vapid t=([^,]+), k=(.+)$/);
    assert.equal(k, key);
    const [head, claims, sig] = jwt.split('.');
    const pub = Buffer.from(key, 'base64url');
    const verifier = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
    assert.ok(crypto.verify('sha256', Buffer.from(`${head}.${claims}`), { key: verifier, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
    assert.equal(JSON.parse(Buffer.from(claims, 'base64url')).aud, `http://127.0.0.1:${service.address().port}`);
  }
  const got = await inbox('m1');
  assert.deepEqual(got, [{ title: 'Altaveu: Assaig canviat', body: 'Divendres a les 8', url: '#/altaveu' }]);
  assert.deepEqual(await inbox('m1'), [], 'es recull un sol cop');
  assert.deepEqual(await inbox('ningu'), []);
  // El servei ha dit que «gone» ja no existeix: s'ha esborrat i no rep res més.
  hits = [];
  await s.admin('POST', '/announcements', { title: 'Sense avís', notify: false });
  await s.admin('POST', '/announcements', { title: 'Un altre' });
  await until(() => hits.length >= 2);
  await wait(100);
  assert.deepEqual(hits.map((h) => h.path).sort(), ['/a1', '/m1']);
  assert.deepEqual((await inbox('m1')).map((m) => m.title), ['Altaveu: Un altre']);
});

test('recordatori: a qui no ha respost, un sol cop, i no a qui ja ha dit que sí', async () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const later = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const ev = (await s.admin('POST', '/events', { hidden: false, type: 'assaig', title: 'Assaig de demà', date: tomorrow })).d;
  const far = (await s.admin('POST', '/events', { hidden: false, type: 'assaig', title: 'Assaig llunyà', date: later })).d;
  const answered = (await s.admin('POST', '/events', { hidden: false, type: 'assaig', title: 'Ja respost', date: tomorrow })).d;
  await s.member('PUT', `/events/${answered.id}/attendance`, { status: 'si' });
  // Amb data límit d'aquí a poc: també toca recordar-ho, encara que la sessió sigui més endavant.
  const soon = new Date(Date.now() + 3 * 3600000);
  const pad = (n) => String(n).padStart(2, '0');
  const until_ = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
  const deadline = (await s.admin('POST', '/events', { hidden: false, type: 'diada', title: 'Diada amb límit', date: later, rsvp_until: until_ })).d;
  let titles = [];
  for (let i = 0; i < 30 && titles.length < 2; i++) { await wait(100); titles.push(...(await inbox('m1')).map((m) => m.title)); }
  await wait(400);
  titles.push(...(await inbox('m1')).map((m) => m.title));
  assert.deepEqual(titles.sort(), ['Vens a Assaig de demà?', 'Vens a Diada amb límit?']);
  assert.deepEqual((await inbox('a1')).filter((m) => m.title.startsWith('Vens')), [], 'un compte d\'administració no respon sessions');
  for (const e of [ev, far, answered, deadline]) await s.admin('DELETE', `/events/${e.id}`);
});

test('qui surt o es dona de baixa deixa de rebre avisos', async () => {
  await s.member('POST', '/push/unsubscribe', { endpoint: endpoint('m1') });
  hits = [];
  await s.admin('POST', '/announcements', { title: 'Últim' });
  await until(() => hits.length >= 1);
  await wait(100);
  assert.deepEqual(hits.map((h) => h.path), ['/a1']);
  // Tornar-se a subscriure sense haver entrat no es pot; i amb una sessió de membre, queda lligat a aquella persona.
  const other = client(`${server.url}/api`);
  assert.equal((await other('POST', '/push/subscribe', { endpoint: endpoint('a1') })).s, 401);
});

test('qui es dona de baixa de la colla deixa de rebre els missatges al mòbil', async () => {
  const id = (await s.admin('POST', '/people', { name: 'Baixa Avisos' })).d.id;
  const m = client(`${server.url}/api`);
  await m('POST', '/identify', { person_id: id });
  assert.equal((await m('POST', '/push/subscribe', { endpoint: endpoint('baixa') })).s, 200);
  await s.admin('PUT', `/people/${id}`, { active: false });
  hits = [];
  await s.admin('POST', '/announcements', { title: 'Només per a la colla' });
  await until(() => hits.length >= 1);
  await wait(100);
  assert.ok(!hits.some((h) => h.path === '/baixa'), 'no rep l\'avís');
  assert.deepEqual(await inbox('baixa'), [], 'ni el text a la bústia');
  await s.admin('DELETE', `/people/${id}`);
});

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
