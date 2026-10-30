// Seguretat: permisos de totes les rutes, CSRF, fitxers, capçaleres, sessions, límits d'intents i la demo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { startServer, client, sessions, routes } from './helpers.js';

let server, s;
before(async () => { server = await startServer(); s = await sessions(server); });
after(() => server.stop());

test('les rutes es llegeixen del codi (cap ruta nova queda fora)', () => {
  const list = routes();
  assert.ok(list.length > 50, `${list.length} rutes`);
  assert.ok(list.filter((r) => r.auth === 'admin').length > 35);
  assert.deepEqual(list.filter((r) => r.auth === 'public').map((r) => r.path).sort(),
    ['/api/calendar.ics', '/api/config', '/api/directory', '/api/identify', '/api/login', '/api/push/inbox', '/api/push/unsubscribe']);
  assert.ok(list.some((r) => r.path.includes('castell-sources') && r.auth === 'admin'));
});

test('sense sessió, totes les rutes no públiques → 401', async () => {
  const anon = client(server.url);
  const bad = [];
  for (const r of routes().filter((x) => x.auth !== 'public')) {
    const res = await anon(r.method, r.sample, r.method === 'GET' ? undefined : {});
    if (res.s !== 401) bad.push(`${r.method} ${r.path} → ${res.s}`);
  }
  assert.deepEqual(bad, []);
});

test("com a membre, totes les rutes d'administració → 403", async () => {
  const member = client(server.url, s.member.jar);
  const bad = [];
  for (const r of routes().filter((x) => x.auth === 'admin')) {
    const res = await member(r.method, r.sample, r.method === 'GET' ? undefined : {});
    if (res.s !== 403) bad.push(`${r.method} ${r.path} → ${res.s}`);
  }
  assert.deepEqual(bad, []);
});

test("una galeta mode=admin inventada no dona permisos d'administració", async () => {
  const forged = client(`${server.url}/api`, { ...s.member.jar, mode: 'admin' });
  assert.equal((await forged('GET', '/me')).d.role, 'member');
  assert.equal((await forged('GET', '/people')).s, 403);
});

test('només se serveixen els fitxers de public/', async () => {
  const anon = client(server.url);
  for (const u of ['/../server.js', '/..%2fserver.js', '/%2e%2e/server.js', '/..%2f..%2fdata%2fcolla.db', '/../data/colla.db',
    '/%2e%2e%2fpackage.json', '/.env', '/.git/config']) {
    const r = await anon('GET', u);
    assert.ok(!r.text.includes("from './db.js'") && !r.text.includes('SQLite format') && !r.text.includes('"scripts"'), u);
  }
  assert.equal((await anon('GET', '/%E0%A4%A')).s, 400);
  assert.equal((await anon('GET', '/api/config')).s, 200, 'el servidor segueix viu');
});

test('CSRF: peticions des d\'una altra web o que no són JSON es rebutgen', async () => {
  const url = `/events/${s.pastEvent.id}/rsvp`;
  assert.equal((await s.admin('POST', url, { open: true }, { origin: 'https://dolenta.example' })).s, 403);
  assert.equal((await s.admin('POST', url, { open: true }, { 'sec-fetch-site': 'cross-site' })).s, 403);
  assert.equal((await s.admin('POST', url, 'open=1', { 'content-type': 'text/plain' })).s, 415);
  for (const body of ['[]', 'null', '"text"', '42', '{trencat']) assert.equal((await s.admin('POST', '/people', body)).s, 400, body);
});

test('capçaleres de seguretat', async () => {
  const r = await fetch(`${server.url}/`);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('permissions-policy'), /camera=\(\)/);
});

test('el directori només dona id i nom públic', async () => {
  const list = (await client(`${server.url}/api`)('POST', '/directory', {})).d;
  assert.ok(list.length > 50);
  for (const p of list) assert.deepEqual(Object.keys(p).sort(), ['alias', 'id', 'name']);
  assert.ok(list.every((p) => p.alias === null));
});

test('les sessions es guarden resumides i el fitxer de la base de dades és privat', async () => {
  const db = new DatabaseSync(server.dbPath, { readOnly: true });
  const stored = db.prepare('SELECT token FROM auth_tokens').all().map((r) => r.token);
  db.close();
  assert.ok(stored.length && !stored.includes(s.member.jar.token));
  assert.equal(fs.statSync(server.dbPath).mode & 0o777, 0o600);
});

test('cada persona té com a molt 20 sessions obertes', async () => {
  for (let i = 0; i < 25; i++) await client(`${server.url}/api`)('POST', '/identify', { person_id: s.personId });
  const db = new DatabaseSync(server.dbPath, { readOnly: true });
  const n = db.prepare('SELECT COUNT(*) AS n FROM auth_tokens WHERE person_id = ?').get(s.personId).n;
  db.close();
  assert.ok(n <= 20, `${n}`);
});

test('CSV: no es guarda a la memòria cau i el text no es pot executar com a fórmula', async () => {
  const future = (await s.admin('GET', '/events')).d.find((e) => e.rsvp_open && e.type !== 'musics');
  const member = client(`${server.url}/api`);
  await member('POST', '/identify', { person_id: s.personId });
  assert.equal((await member('PUT', `/events/${future.id}/attendance`, { status: 'si', comment: '=HYPERLINK("http://x")' })).s, 200);
  const r = await s.admin('GET', `/events/${future.id}/attendance.csv`);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.ok(r.text.includes(`"'=HYPERLINK`));
});

test('calendari: el títol no pot afegir línies', async () => {
  const ev = (await s.admin('POST', '/events', { hidden: false, type: 'assaig', title: 'Assaig\r\nATTENDEE:mailto:x@y', date: '2026-12-20' })).d;
  const ics = (await client(server.url)('GET', `/api/calendar.ics?event=${ev.id}`)).text;
  assert.ok(!/\r\nATTENDEE/.test(ics));
});

test('posicions i adreces mal formades → 400, no error intern', async () => {
  assert.equal((await s.admin('PUT', `/castells/${s.pastCastell.id}/positions/%E0%A4%A`, { person_id: null })).s, 400);
  assert.equal((await s.admin('PUT', `/castells/${s.pastCastell.id}/positions/a%20b`, { person_id: null })).s, 400);
});

test("el resum de temporada no guarda una variant per cada valor inventat (no s'omple la memòria)", async () => {
  const all = await s.member('GET', '/stats/season');
  assert.equal((await s.member('GET', '/stats/season?season=xx%27&kind=<b>')).text, all.text);
  const statusFile = `/proc/${server.pid}/status`;
  if (!fs.existsSync(statusFile)) return;
  const rss = () => Number(fs.readFileSync(statusFile, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) / 1024;
  const before = rss();
  for (let i = 0; i < 1500; i++) await s.member('GET', `/stats/season?season=x${i}&kind=k${i}`);
  for (let i = 0; i < 300; i++) await s.member('GET', `/stats/season?season=${1000 + i}`);
  assert.ok(rss() - before < 40, `${before.toFixed(0)} → ${rss().toFixed(0)} MB`);
});

test('demo: ningú pot deixar els altres sense entrar', async () => {
  const pw = { currentPassword: 'admin1234' };
  const results = [
    await s.admin('PUT', '/me', { ...pw, newPassword: 'unaaltramoltllarga123' }),
    await s.admin('POST', '/admins', { ...pw, name: 'Intrús', username: 'intrus', password: 'unaaltramoltllarga123' }),
    await s.admin('PUT', '/admins/1', { ...pw, password: 'unaaltramoltllarga123' }),
    await s.admin('DELETE', '/admins/1', pw),
  ];
  assert.deepEqual(results.map((r) => r.s), [403, 403, 403, 403]);
  assert.equal((await client(`${server.url}/api`)('POST', '/login', { username: 'admin', password: 'admin1234' })).s, 200);
  assert.equal((await s.admin('PUT', '/me', { name: 'Junta tècnica' })).s, 200);
});

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'), server.log().split('\n').filter((l) => l.includes('NODE22')).join('\n'));
});
