// Seguretat de les sessions i de les dades que arriben al servidor: galetes, sortir, sessions caducades, baixes, camps
// que no es poden tocar des de fora, peticions massa grans o estranyes, respostes que no porten res secret i un
// registre del servidor net.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { startServer, client, sessions, routes } from './helpers.js';

let server, s, api;
before(async () => { server = await startServer(); s = await sessions(server); api = `${server.url}/api`; });
after(() => server.stop());

const sql = (fn) => { const db = new DatabaseSync(server.dbPath); try { return fn(db); } finally { db.close(); } };
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const future = (days = 6) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const member = async (id) => {
  const m = client(api);
  assert.equal((await m('POST', '/identify', { person_id: id })).s, 200);
  return m;
};
const admin = async () => {
  const a = client(api);
  assert.equal((await a('POST', '/login', { username: 'admin', password: 'admin1234' })).s, 200);
  return a;
};

test('galetes: la pàgina no les pot llegir, no van a altres webs i amb https només viatgen xifrades', async () => {
  const login = (headers = {}) => fetch(`${api}/login`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ username: 'admin', password: 'admin1234' }) });
  const plain = await login();
  const cookies = plain.headers.getSetCookie();
  assert.ok(cookies.some((c) => c.startsWith('atoken=')));
  for (const c of cookies) {
    for (const flag of [/; HttpOnly/, /; SameSite=Lax/, /; Path=\//, /; Max-Age=\d+/]) assert.match(c, flag, c);
    assert.doesNotMatch(c, /Secure/, 'sense https no es pot posar Secure (no funcionaria en local)');
  }
  assert.equal(plain.headers.get('strict-transport-security'), null);
  // La sessió només va a la galeta: ni a la resposta ni enlloc on el codi de la pàgina la pugui llegir.
  const token = cookies.find((c) => c.startsWith('atoken=')).split(';')[0].slice('atoken='.length);
  assert.ok(!(await plain.text()).includes(token));
  // Darrere d'un proxy amb https (Render): Secure i HSTS.
  const secure = await login({ 'x-forwarded-proto': 'https' });
  for (const c of secure.headers.getSetCookie()) assert.match(c, /; Secure$/, c);
  assert.match(secure.headers.get('strict-transport-security'), /^max-age=\d{7,}/);
});

test('sortir acaba la sessió també al servidor: una còpia de la galeta ja no serveix', async () => {
  const m = await member(s.personId);
  const copied = { ...m.jar };
  assert.equal((await m('POST', '/logout')).s, 200);
  assert.equal((await client(api, copied)('GET', '/me')).s, 401);
  const a = await admin();
  const copiedAdmin = { ...a.jar };
  assert.equal((await a('POST', '/logout')).s, 200);
  assert.equal((await client(api, copiedAdmin)('GET', '/people')).s, 401);
});

test('una sessió caducada no serveix (ni de membre ni d\'administració)', async () => {
  const m = await member(s.personId);
  const a = await admin();
  sql((db) => {
    db.prepare('UPDATE auth_tokens SET expires_at = ? WHERE token = ?').run(Date.now() - 1000, sha(m.jar.token));
    db.prepare('UPDATE admin_tokens SET expires_at = ? WHERE token = ?').run(Date.now() - 1000, sha(a.jar.atoken));
  });
  assert.equal((await m('GET', '/me')).s, 401);
  assert.equal((await a('GET', '/people')).s, 401);
});

test('qui es dona de baixa perd la sessió, no surt a la llista per triar i no pot tornar a entrar', async () => {
  const id = (await s.admin('POST', '/people', { name: 'Baixa Prova' })).d.id;
  const m = await member(id);
  await s.admin('PUT', `/people/${id}`, { active: false });
  assert.equal((await m('GET', '/me')).s, 401);
  assert.equal(sql((db) => db.prepare('SELECT COUNT(*) AS n FROM auth_tokens WHERE person_id = ?').get(id).n), 0);
  assert.ok(!(await client(api)('POST', '/directory', {})).d.some((p) => p.id === id));
  assert.equal((await client(api)('POST', '/identify', { person_id: id })).s, 404);
  await s.admin('DELETE', `/people/${id}`);
});

test('entrar: el mateix error tant si l\'usuari no existeix com si la contrasenya és dolenta', async () => {
  const c = client(api);
  const wrongPassword = await c('POST', '/login', { username: 'admin', password: 'dolenta-1234' });
  const noUser = await c('POST', '/login', { username: 'ningu-no-existeix', password: 'dolenta-1234' });
  assert.equal(wrongPassword.s, 401);
  assert.equal(noUser.s, wrongPassword.s);
  assert.deepEqual(noUser.d, wrongPassword.d);
  await admin(); // un intent bo torna a posar el comptador d'errors a zero
});

test('camps que no es poden canviar des de fora: rol, usuari, contrasenya, id, data d\'alta, sessió d\'un castell', async () => {
  const hack = { id: 1, role: 'admin', username: 'hack', password_hash: 'x', created_at: '2000-01-01' };
  const before1 = sql((db) => db.prepare('SELECT * FROM people WHERE id = 1').get());
  const p = (await s.admin('POST', '/people', { name: 'Camps Prova', ...hack })).d;
  assert.notEqual(p.id, 1);
  await s.admin('PUT', `/people/${p.id}`, { ...hack, name: 'Camps Prova 2' });
  const row = sql((db) => db.prepare('SELECT * FROM people WHERE id = ?').get(p.id));
  assert.equal(row.name, 'Camps Prova 2');
  assert.equal(row.role, 'member');
  assert.equal(row.username, null);
  assert.equal(row.password_hash, null);
  assert.notEqual(row.created_at, '2000-01-01');
  assert.deepEqual(sql((db) => db.prepare('SELECT * FROM people WHERE id = 1').get()), before1, 'la persona 1 no s\'ha tocat');
  assert.ok(!('password_hash' in p) && !('username' in p) && !('role' in p), 'tampoc surten a la resposta');
  await s.admin('DELETE', `/people/${p.id}`);
  // Un castell no es pot moure a una altra sessió dient-ho al cos de la petició.
  const other = (await s.admin('POST', '/events', { hidden: false, type: 'assaig', title: 'Una altra', date: future() })).d;
  await s.admin('PUT', `/castells/${s.pastCastell.id}`, { event_id: other.id, id: 999999 });
  assert.equal(sql((db) => db.prepare('SELECT event_id FROM castells WHERE id = ?').get(s.pastCastell.id)).event_id, s.pastEvent.id);
  // Un membre no es pot marcar com a vingut, ni respondre per algú altre ni a una altra sessió.
  const someone = (await s.admin('GET', '/people')).d.people.find((x) => x.id !== s.personId && x.active).id;
  assert.equal((await s.member('PUT', `/events/${other.id}/attendance`, { status: 'si', came: 1, present: 1, person_id: someone, event_id: s.pastEvent.id })).s, 200);
  const rows = sql((db) => db.prepare('SELECT * FROM attendance WHERE event_id = ?').all(other.id));
  assert.deepEqual(rows.map((r) => [r.person_id, r.status, r.came, r.present]), [[s.personId, 'si', null, 0]]);
  await s.admin('DELETE', `/events/${other.id}`);
});

test('amb les respostes tancades (o la sessió passada) un membre ja no pot canviar la seva; i l\'administració no respon per ningú', async () => {
  const ev = (await s.admin('POST', '/events', { hidden: false, type: 'assaig', title: 'Tancada', date: future() })).d;
  assert.equal((await s.member('PUT', `/events/${ev.id}/attendance`, { status: 'si' })).s, 200);
  await s.admin('POST', `/events/${ev.id}/rsvp`, { open: false });
  assert.equal((await s.member('PUT', `/events/${ev.id}/attendance`, { status: 'no' })).s, 400);
  assert.equal(sql((db) => db.prepare('SELECT status FROM attendance WHERE event_id = ? AND person_id = ?').get(ev.id, s.personId)).status, 'si');
  assert.equal((await s.member('PUT', `/events/${s.pastEvent.id}/attendance`, { status: 'no' })).s, 400);
  assert.equal((await s.admin('PUT', `/events/${ev.id}/attendance`, { status: 'no' })).s, 403);
  await s.admin('DELETE', `/events/${ev.id}`);
});

test('respostes de l\'API: JSON que no es guarda enlloc; una ruta que no existeix és un 404 en JSON', async () => {
  for (const [who, path] of [[client(api), '/config'], [s.member, '/me'], [s.admin, '/people'], [s.member, '/events']]) {
    const r = await who('GET', path);
    assert.equal(r.s, 200, path);
    assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8', path);
    assert.equal(r.headers.get('cache-control'), 'no-store', path);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', path);
  }
  for (const [method, path] of [['GET', '/no-existeix'], ['PATCH', '/people'], ['GET', '/people/abc'], ['DELETE', '/config']]) {
    const r = await s.admin(method, path);
    assert.equal(r.s, 404, `${method} ${path}`);
    assert.equal(typeof r.d.error, 'string');
  }
});

test('una petició massa gran es rebutja (413) sense guardar res, i el servidor segueix funcionant', async () => {
  const r = await s.admin('POST', '/people', JSON.stringify({ name: 'Gran', notes: 'x'.repeat(2_000_000) }));
  assert.equal(r.s, 413);
  assert.match(r.d.error, /massa gran/);
  const people = await s.admin('GET', '/people');
  assert.equal(people.s, 200);
  assert.ok(!people.d.people.some((p) => p.name === 'Gran'));
});

test('JSON estrany («__proto__», «constructor», llistes, «null», a mitges…) no fa res ni trenca res', async () => {
  for (const body of ['{"__proto__":{"role":"admin"}}', '{"constructor":{"prototype":{"role":"admin"}}}', '[]', '[{"name":"A"}]',
    'null', '"text"', '12', '{"name":', '{"name":"A",}', '\u0000']) {
    const r = await s.admin('POST', '/people', body);
    assert.equal(r.s, 400, `${body} → ${r.s}`);
  }
  // Dins dels camps que es guarden com a JSON (respostes a preguntes de la sessió), les claus estranyes es descarten.
  const ev = (await s.admin('POST', '/events', { hidden: false, type: 'assaig', title: 'JSON', date: future() })).d;
  const field = (await s.admin('POST', `/events/${ev.id}/fields`, { label: 'Samarreta', kind: 'text' })).d.at(-1);
  const r = await s.member('PUT', `/events/${ev.id}/attendance`,
    `{"status":"si","extra":{"__proto__":{"role":"admin"},"constructor":"x","toString":"x","${field.id}":"M"}}`);
  assert.equal(r.s, 200);
  const extra = JSON.parse(sql((db) => db.prepare('SELECT extra FROM attendance WHERE event_id = ? AND person_id = ?').get(ev.id, s.personId)).extra);
  assert.deepEqual(extra, { [field.id]: 'M' });
  // I res d'això no ha donat permisos a ningú.
  assert.equal((await s.member('GET', '/me')).d.role, 'member');
  assert.equal((await s.member('GET', '/people')).s, 403);
  await s.admin('DELETE', `/events/${ev.id}`);
});

test('cap resposta porta contrasenyes, sessions ni la clau privada dels avisos', async () => {
  const a = await admin();
  await member(s.personId);
  await a('GET', '/push/key'); // crea les claus si encara no hi són
  const secrets = sql((db) => [
    ...db.prepare('SELECT password_hash AS v FROM admins').all(), ...db.prepare('SELECT token AS v FROM auth_tokens').all(),
    ...db.prepare('SELECT token AS v FROM admin_tokens').all(), ...db.prepare('SELECT token AS v FROM admin_devices').all(),
    { v: JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'vapid'").get().value).d },
  ].map((r) => r.v).filter(Boolean));
  assert.ok(secrets.length > 5);
  const seen = [];
  for (const r of routes().filter((x) => x.method === 'GET' && !x.path.includes('/backup'))) {
    for (const who of [a, s.member]) {
      const res = await who('GET', r.sample.replace(/^\/api/, ''));
      for (const secret of secrets) if (res.text.includes(secret)) seen.push(r.path);
      if (/password|"token"/.test(res.text)) seen.push(`${r.path}: ${res.text.match(/.{0,40}(password|"token").{0,40}/)[0]}`);
    }
  }
  assert.deepEqual(seen, []);
});

test('fitxers de l\'app: el navegador pregunta si han canviat (ETag) i mai es queda amb una versió vella', async () => {
  for (const f of ['/', '/sw.js', '/app.js', '/ui/core.js', '/style.css', '/manifest.webmanifest']) {
    const r = await fetch(server.url + f);
    assert.equal(r.status, 200, f);
    assert.equal(r.headers.get('cache-control'), 'no-cache', f);
    const etag = r.headers.get('etag');
    if (f === '/manifest.webmanifest') continue;
    assert.ok(etag, f);
    assert.equal((await fetch(server.url + f, { headers: { 'if-none-match': etag } })).status, 304, f);
  }
});

test('el registre del servidor no porta sessions, contrasenyes ni errors interns', () => {
  const log = server.log();
  for (const value of [...Object.values(s.admin.jar), ...Object.values(s.member.jar)].filter((v) => v.length > 20)) {
    assert.ok(!log.includes(value), 'una galeta ha anat a parar al registre');
  }
  assert.ok(!log.includes('admin1234'));
  assert.doesNotMatch(log, /Error|\n\s+at /, log);
});

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
