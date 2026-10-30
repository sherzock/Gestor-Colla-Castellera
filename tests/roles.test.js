// Rols dels comptes: administració (tot), junta i tècnica. Cada ruta es prova amb cada rol, i també què veu cadascú de
// les dades personals: el contacte és de la junta; les mides, el pes i les notes, de la tècnica.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sessions, client, routes } from './helpers.js';
import { install, written } from './fakedom.js';

let server, s, junta, tecnica, ui, who = 'admin', castell;
const jars = {};
const CONTACT = ['email', 'phone'], MEASURES = ['height_cm', 'shoulder_height_cm', 'shoulder_width_cm', 'weight_kg', 'notes'];
// El que s'ha acordat, escrit a part del codi: si algú canvia un permís, aquesta prova ho ha de notar.
const ALLOWED = {
  junta: ['staff', 'sessions', 'news', 'attendance', 'people', 'import'],
  tecnica: ['staff', 'castells', 'news', 'attendance', 'people'],
};

before(async () => {
  server = await startServer({ DEMO: '0' }); // a la versió de prova no es poden canviar els comptes
  s = await sessions(server);
  const api = `${server.url}/api`;
  junta = client(api); tecnica = client(api);
  assert.equal((await junta('POST', '/login', { username: 'junta', password: 'junta1234' })).s, 200);
  assert.equal((await tecnica('POST', '/login', { username: 'tecnica', password: 'tecnica1234' })).s, 200);
  Object.assign(jars, { admin: s.admin.jar, junta: junta.jar, tecnica: tecnica.jar });
  install({ base: server.url, cookies: () => Object.entries(jars[who]).map(([k, v]) => `${k}=${v}`).join('; ') });
  ui = async (file) => import(`../public/ui/${file}.js`);
  castell = s.pastCastell;
  await s.admin('PUT', `/castells/${castell.id}`, { tech_notes: 'Nota de prova de la tècnica' });
  await s.admin('PUT', `/people/${s.personId}`, { phone: '600111222', email: 'a@exemple.cat', weight_kg: 60, notes: 'Lesió de prova' });
});
after(() => server.stop());

test('cada rol pot fer només el que li toca, ruta per ruta', async () => {
  const bad = [];
  // Identificadors que no existeixen: així les rutes permeses no esborren res de les dades de prova.
  const missing = (path) => path.replace(/\/1(?=\/|$)/g, '/999999');
  for (const [role, call] of [['junta', junta], ['tecnica', tecnica]]) {
    const api = client(server.url, call.jar);
    for (const r of routes().filter((x) => x.cap)) {
      const res = await api(r.method, missing(r.sample), r.method === 'GET' ? undefined : {});
      const allowed = ALLOWED[role].includes(r.cap);
      if (allowed !== (res.s !== 403)) bad.push(`${role} ${r.method} ${r.path} → ${res.s}`);
    }
  }
  assert.deepEqual(bad, []);
  // Les decisions que no es poden perdre, escrites amb nom i cognoms.
  const capOf = (m, p) => routes().find((r) => r.method === m && r.path === p).cap;
  assert.equal(capOf('DELETE', '/api/people/:id'), 'admin');
  assert.equal(capOf('GET', '/api/backup'), 'admin');
  assert.equal(capOf('GET', '/api/people/:id/export'), 'admin');
  assert.equal(capOf('POST', '/api/admins'), 'admin');
  assert.equal(capOf('PUT', '/api/castells/:id/positions/:key'), 'castells');
  assert.equal(capOf('POST', '/api/events'), 'sessions');
  assert.equal(capOf('POST', '/api/people/import'), 'import');
  assert.equal(capOf('POST', '/api/announcements'), 'news');
});

test('el grup de la fitxa no dona cap permís', async () => {
  await s.admin('PUT', `/people/${s.personId}`, { section: 'junta' });
  assert.equal((await s.member('GET', '/people')).s, 403);
  assert.equal((await s.member('POST', '/events', { hidden: false,})).s, 403);
  await s.admin('PUT', `/people/${s.personId}`, { section: '' });
});

test('les dades personals: cada rol només veu i edita les seves', async () => {
  const see = async (call) => (await call('GET', '/people')).d.people.find((p) => p.id === s.personId);
  const j = await see(junta), te = await see(tecnica), a = await see(s.admin);
  assert.equal(j.phone, '600111222');
  for (const f of MEASURES) assert.ok(!(f in j), `junta: ${f}`);
  assert.equal(te.weight_kg, 60);
  assert.equal(te.notes, 'Lesió de prova');
  for (const f of CONTACT) assert.ok(!(f in te), `tècnica: ${f}`);
  assert.ok(te.birthdate && j.birthdate, 'la data de naixement la veuen tots dos (el muntador la necessita)');
  assert.equal(a.phone, '600111222');
  assert.equal(a.weight_kg, 60);

  // El que no pot veure tampoc ho pot canviar, i la resposta no ho revela.
  const putJ = await junta('PUT', `/people/${s.personId}`, { weight_kg: 99, notes: 'canvi', phone: '600333444' });
  assert.equal(putJ.s, 200);
  assert.ok(!('weight_kg' in putJ.d));
  const putT = await tecnica('PUT', `/people/${s.personId}`, { phone: '999', email: 'b@exemple.cat', weight_kg: 61 });
  assert.equal(putT.s, 200);
  assert.ok(!('phone' in putT.d));
  const after = await see(s.admin);
  assert.deepEqual([after.phone, after.email, after.weight_kg, after.notes], ['600333444', 'a@exemple.cat', 61, 'Lesió de prova']);

  // Importar (junta): les mides del fitxer no es desen.
  const imp = await junta('POST', '/people/import', { people: [{ name: 'Importada Proves', weight_kg: 50, phone: '600' }] });
  assert.equal(imp.d.done, true);
  const created = (await s.admin('GET', '/people')).d.people.find((p) => p.name === 'Importada Proves');
  assert.equal(created.weight_kg, null);
  assert.equal(created.phone, '600');
});

test('la junta veu els castells, però sense mides, candidats ni notes de la tècnica', async () => {
  const j = (await junta('GET', `/castells/${castell.id}`)).d;
  assert.equal(j.castell.tech_notes, undefined);
  assert.equal(j.candidates, undefined);
  assert.ok(j.positions.length);
  for (const f of ['weight_kg', 'height_cm', 'shoulder_height_cm', 'birthdate']) assert.ok(j.positions.every((p) => !(f in p)), f);
  const t = (await tecnica('GET', `/castells/${castell.id}`)).d;
  assert.equal(t.castell.tech_notes, 'Nota de prova de la tècnica');
  assert.ok(t.candidates.length);
  const ev = s.pastEvent.id;
  assert.ok((await junta('GET', `/events/${ev}`)).d.castells.every((c) => !c.tech_notes));
  assert.equal((await junta('GET', `/events/${ev}`)).d.guests, undefined);

  // Les estadístiques les veuen tots, però les notes es queden a la tècnica (encara que la resposta es guardi).
  const notes = (r) => r.d.castells.flatMap((c) => [...c.notes, ...c.attempts]).filter((a) => a.notes);
  assert.ok(notes(await tecnica('GET', '/stats/tecnica')).length);
  assert.deepEqual(notes(await junta('GET', '/stats/tecnica')), []);
  assert.ok(notes(await s.admin('GET', '/stats/tecnica')).length);
});

test('comptes: es poden combinar junta i tècnica, i sempre queda un administrador', async () => {
  const A = s.admin, currentPassword = 'admin1234';
  const base = { name: 'Doble', username: 'doble', password: 'contrasenya-llarga', currentPassword };
  assert.equal((await A('POST', '/admins', { ...base, roles: [] })).s, 400);
  assert.equal((await A('POST', '/admins', { ...base, roles: ['cap'] })).s, 400);
  const made = await A('POST', '/admins', { ...base, roles: ['tecnica', 'junta'] });
  assert.deepEqual(made.d.roles, ['junta', 'tecnica']);
  const both = client(`${server.url}/api`);
  await both('POST', '/login', { username: 'doble', password: 'contrasenya-llarga' });
  const me = (await both('GET', '/me')).d;
  assert.deepEqual(me.roles, ['junta', 'tecnica']);
  assert.ok(me.can.includes('sessions') && me.can.includes('castells') && !me.can.includes('admin'));
  const seen = (await both('GET', '/people')).d.people.find((p) => p.id === s.personId);
  assert.ok('phone' in seen && 'weight_kg' in seen);

  // Un canvi de rol té efecte de seguida, sense tornar a entrar.
  await A('PUT', `/admins/${made.d.id}`, { roles: ['junta'], currentPassword });
  assert.equal((await both('POST', `/events/999999/castells`, {})).s, 403);
  // «admin» ja ho inclou tot.
  assert.deepEqual((await A('PUT', `/admins/${made.d.id}`, { roles: ['admin', 'junta'], currentPassword })).d.roles, ['admin']);
  await A('PUT', `/admins/${made.d.id}`, { roles: ['junta'], currentPassword });

  // L'únic administrador no es pot treure el rol ni l'esborra ningú.
  const accounts = (await A('GET', '/admins')).d;
  const admin = accounts.find((a) => a.roles.includes('admin'));
  assert.equal(accounts.filter((a) => a.roles.includes('admin')).length, 1);
  assert.equal((await A('PUT', `/admins/${admin.id}`, { roles: ['junta'], currentPassword })).s, 400);
  assert.equal((await A('DELETE', `/admins/${made.d.id}`, { currentPassword })).s, 200);
  // Els comptes sense permís no veuen ni la llista.
  assert.equal((await junta('GET', '/admins')).s, 403);
  // Un compte que no és d'administració sí que es pot canviar la seva contrasenya.
  assert.notEqual((await junta('PUT', '/me', { name: 'Junta' })).s, 403);
});

async function paint(role, fn) {
  who = role;
  const core = await ui('core');
  core.setRenderer(() => {});
  core.setConfig(await core.api('GET', '/config'));
  core.setMe(await core.api('GET', '/me'));
  written.length = 0;
  await fn();
  await new Promise((r) => setTimeout(r, 60));
  return written.join('\n');
}

test('les pantalles només ensenyen el que cada rol pot fer', async () => {
  const event = await ui('event'), people = await ui('people'), sessionsUi = await ui('sessions'), accounts = await ui('accounts');
  const page = (role, id = s.pastEvent.id) => paint(role, () => event.pageEvent(id));
  const j = await page('junta'), te = await page('tecnica'), a = await page('admin');
  for (const html of [j, a]) { assert.match(html, /id="edit-event"/); assert.match(html, /id="field-form"/); assert.match(html, /id="role-form"/); }
  assert.doesNotMatch(te, /id="edit-event"|id="del-event"|id="field-form"|id="role-form"/);
  for (const html of [te, a]) { assert.match(html, /id="add-castell"/); assert.match(html, /id="add-guest"/); }
  assert.doesNotMatch(j, /id="add-castell"|id="add-guest"/);
  // Passar llista, tots.
  for (const html of [j, te, a]) assert.match(html, /id="att-table"/);

  assert.doesNotMatch(await paint('tecnica', () => sessionsUi.pageHome()), /id="new-event"/);
  assert.match(await paint('junta', () => sessionsUi.pageHome()), /id="new-event"/);

  const listJ = await paint('junta', () => people.pagePeople()), listT = await paint('tecnica', () => people.pagePeople());
  assert.match(listJ, /id="import-people"/);
  assert.doesNotMatch(listT, /id="import-people"/);
  assert.doesNotMatch(listJ, /Alç\. esp\./);
  assert.match(listT, /Alç\. esp\./);

  const mine = await paint('junta', () => accounts.pageAccounts());
  assert.match(mine, /id="pw-form"/);
  assert.doesNotMatch(mine, /id="new-admin"|\/api\/backup/);
  assert.match(await paint('admin', () => accounts.pageAccounts()), /id="new-admin"/);
});

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
