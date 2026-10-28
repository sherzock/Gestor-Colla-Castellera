// Funcionalitats: acompanyants, plantilles de pinya, altaveu, copiar una alineació i memòries del servidor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sessions } from './helpers.js';
import { buildStructure, configFromName } from '../public/castell.js';
import { layerToTemplate } from '../public/editor.js';

let server, s;
before(async () => { server = await startServer(); s = await sessions(server); });
after(() => server.stop());

const futureEvent = async () => (await s.admin('GET', '/events')).d.find((e) => e.rsvp_open && e.type === 'assaig');

// ---------- Acompanyants ----------
test('acompanyants: es creen com a persones temporals, amb nom o «Acompanyant de …»', async () => {
  const ev = await futureEvent();
  await s.admin('PUT', `/events/${ev.id}`, { ...ev, ask_companions: 1 });
  assert.equal((await s.member('PUT', `/events/${ev.id}/attendance`, { status: 'si', companions: ['Laia', ''] })).s, 200);
  const mine = (await s.member('GET', `/events/${ev.id}`)).d.mine.companions;
  assert.equal(mine.length, 2);
  assert.equal(mine[0].name, 'Laia');
  assert.match(mine[1].name, /^Acompanyant d(e |')/);
  const guests = (await s.admin('GET', `/events/${ev.id}`)).d.guests.filter((g) => g.companion_of === s.personId);
  assert.equal(guests.length, 2);
  const csv = (await s.admin('GET', `/events/${ev.id}/attendance.csv`)).text;
  assert.ok(csv.includes('Acompanyants') && csv.includes('Laia'));
});

test('acompanyants: si en diu menys o ja no ve, els col·locats es queden marcats i els altres s\'esborren', async () => {
  const ev = await futureEvent();
  const castell = (await s.admin('POST', `/events/${ev.id}/castells`, { width: 3, height: 6 })).d;
  const laia = (await s.admin('GET', `/events/${ev.id}`)).d.guests.find((g) => g.name === 'Laia');
  assert.equal((await s.admin('PUT', `/castells/${castell.id}/positions/t1-0`, { guest_id: laia.id })).s, 200);
  await s.member('PUT', `/events/${ev.id}/attendance`, { status: 'no' });
  let guests = (await s.admin('GET', `/events/${ev.id}`)).d.guests.filter((g) => g.companion_of === s.personId);
  assert.equal(guests.length, 1, 'el no col·locat s\'esborra');
  assert.ok(guests[0].companion_dropped && guests[0].name === 'Laia', 'la col·locada es queda marcada');
  await s.member('PUT', `/events/${ev.id}/attendance`, { status: 'si', companions: ['Laia'] });
  guests = (await s.admin('GET', `/events/${ev.id}`)).d.guests.filter((g) => g.companion_of === s.personId);
  assert.equal(guests.length, 1);
  assert.ok(!guests[0].companion_dropped && guests[0].id === laia.id, 'si torna, es reaprofita');
  const seen = (await s.member('GET', `/castells/${castell.id}`)).d.positions.find((p) => p.pos_key === 't1-0');
  assert.equal(seen.guest_name, 'Laia');
});

test('acompanyants: si la sessió no ho pregunta, no se\'n crea cap', async () => {
  const ev = (await s.admin('GET', '/events')).d.filter((e) => e.rsvp_open && e.type === 'assaig')[1];
  await s.admin('PUT', `/events/${ev.id}`, { ...ev, ask_companions: 0 });
  await s.member('PUT', `/events/${ev.id}/attendance`, { status: 'si', companions: ['Pere'] });
  assert.ok(!(await s.admin('GET', `/events/${ev.id}`)).d.guests.some((g) => g.companion_of));
});

// ---------- Plantilles ----------
const templateOf3d7 = () => {
  const s3d7 = buildStructure(configFromName('3d7'), { ignoreTemplate: true });
  return Object.fromEntries(s3d7.layers.map((l) => [l.id, layerToTemplate(l)]));
};

test('plantilles: es desen, les veu tothom i les posicions noves es poden ocupar', async () => {
  const layers = templateOf3d7();
  const removed = layers.pinya.find((i) => i.key);
  layers.pinya = layers.pinya.filter((i) => i !== removed);
  layers.pinya.push({ key: 'pn1', role: 'Posició nova', kind: 'altre', x: 0, y: 300, w: 60, h: 30, rot: 0 });
  assert.equal((await s.admin('PUT', '/templates/3d7', { layers })).s, 200);
  assert.ok((await s.member('GET', '/templates')).d.some((t) => t.name === '3d7'));
  const ev = await futureEvent();
  const c = (await s.admin('POST', `/events/${ev.id}/castells`, { width: 3, height: 7 })).d;
  assert.equal((await s.admin('PUT', `/castells/${c.id}/positions/pn1`, { person_id: s.personId })).s, 200);
  assert.equal((await s.admin('PUT', `/castells/${c.id}/positions/${removed.key}`, { person_id: s.personId })).s, 400, 'una posició que la plantilla ha tret');
  const usage = (await s.admin('GET', '/templates/3d7/usage')).d;
  assert.ok(usage.castells > 0 && usage.usage.pn1 === 1);
  assert.equal((await s.admin('DELETE', '/templates/3d7')).s, 200);
  assert.ok(!(await s.member('GET', '/templates')).d.some((t) => t.name === '3d7'));
});

test('plantilles: es rebutgen les que no tenen sentit', async () => {
  const good = templateOf3d7();
  const box = { key: 'pn1', role: 'X', kind: 'altre', x: 0, y: 0, w: 60, h: 30, rot: 0 };
  const cases = {
    'capa inexistent': { ...good, inventada: [] },
    'clau d\'una altra capa': { pinya: [{ ...box, key: 'fn1' }] },
    'clau del tronc': { pinya: [{ ...box, key: 't1-0' }] },
    'claus repetides': { pinya: [box, box] },
    'coordenades absurdes': { pinya: [{ ...box, x: 1e9 }] },
    'sense nom': { pinya: [{ ...box, role: '' }] },
    'tipus inventat': { pinya: [{ ...box, kind: 'drac' }] },
  };
  for (const [name, layers] of Object.entries(cases)) assert.equal((await s.admin('PUT', '/templates/3d7', { layers })).s, 400, name);
  assert.equal((await s.admin('PUT', '/templates/9d99', { layers: good })).s, 400, 'castell inexistent');
});

// ---------- Altaveu ----------
test('altaveu: crear, fixar, editar i esborrar; els membres ho veuen i saben que hi ha novetats', async () => {
  const before = (await s.member('GET', '/me')).d.latestNews;
  const a = (await s.admin('POST', '/announcements', { title: 'Assaig a la plaça', body: 'Més info a https://example.org' })).d;
  const pinned = (await s.admin('POST', '/announcements', { title: 'Important', pinned: true })).d;
  const list = (await s.member('GET', '/announcements')).d;
  assert.equal(list[0].id, pinned.id, 'els fixats surten primer');
  assert.ok(list.some((x) => x.id === a.id && x.body.includes('https://example.org')));
  assert.notEqual((await s.member('GET', '/me')).d.latestNews, before ?? 'res');
  assert.equal((await s.admin('PUT', `/announcements/${a.id}`, { title: 'Assaig al local' })).d.title, 'Assaig al local');
  assert.equal((await s.admin('POST', '/announcements', { title: '' })).s, 400);
  assert.equal((await s.member('POST', '/announcements', { title: 'Hola' })).s, 403);
  await s.admin('DELETE', `/announcements/${a.id}`);
  assert.ok(!(await s.member('GET', '/announcements')).d.some((x) => x.id === a.id));
});

// ---------- Copiar una alineació ----------
test('copiar: castells anteriors del mateix tipus i còpia de les posicions', async () => {
  const past = (await s.admin('GET', '/events?scope=past')).d.filter((e) => e.type === 'diada');
  let source;
  for (const e of past) { source = (await s.admin('GET', `/events/${e.id}`)).d.castells.find((c) => c.assigned_count > 5); if (source) break; }
  const sc = (await s.admin('GET', `/castells/${source.id}`)).d;
  const name = sc.event && buildStructure(sc.castell).name;
  const ev = await futureEvent();
  const list = (await s.admin('GET', `/events/${ev.id}/castell-sources?name=${name}`)).d;
  assert.ok(list.length >= 1 && list.length <= 6);
  assert.ok(list.every((x, i) => i === 0 || list[i - 1].event_date >= x.event_date), 'del més recent al més antic');
  assert.ok(list.some((x) => x.id === source.id), 'el castell d\'origen hi surt');
  const c = (await s.admin('POST', `/events/${ev.id}/castells`, { ...sc.castell, copy_from: source.id })).d;
  const copied = (await s.admin('GET', `/castells/${c.id}`)).d.positions.filter((p) => p.person_id || p.guest_id);
  assert.ok(copied.length > 5, `${copied.length} posicions copiades`);
  assert.ok(copied.every((p) => p.person_id), 'les persones temporals d\'una altra sessió no es copien');
  const other = name === '3d7' ? '4d7' : '3d7';
  const wrong = (await s.admin('GET', `/events/${ev.id}/castell-sources?name=${other}`)).d[0];
  if (wrong) assert.equal((await s.admin('POST', `/events/${ev.id}/castells`, { ...sc.castell, copy_from: wrong.id })).s, 400, 'un altre tipus de castell');
});

// ---------- Memòries del servidor ----------
test('memòries: cada canvi refà el que en depèn', async () => {
  const sessionsOf = async () => (await s.admin('GET', '/stats/people?season=all')).d.people.find((p) => p.id === s.personId)?.sessions ?? 0;
  const s0 = await sessionsOf();
  await s.admin('PUT', `/events/${s.pastEvent.id}/attendance/${s.personId}`, { came: false });
  assert.ok((await sessionsOf()) < s0, 'l\'assistència canvia les estadístiques de persones');
  await s.admin('PUT', `/events/${s.pastEvent.id}/attendance/${s.personId}`, { came: true });
  assert.equal(await sessionsOf(), s0);

  const pos = (await s.admin('GET', `/castells/${s.pastCastell.id}`)).d.positions.find((p) => p.person_id === s.personId);
  const h0 = (await s.member('GET', `/people/${s.personId}/history`)).d.total;
  const castellHistory = (await s.admin('GET', `/castells/${s.pastCastell.id}/history`)).text;
  await s.admin('PUT', `/castells/${s.pastCastell.id}/positions/${pos.pos_key}`, { person_id: null });
  assert.equal((await s.member('GET', `/people/${s.personId}/history`)).d.total, h0 - 1, 'treure algú d\'un castell passat canvia el seu historial');
  await s.admin('PUT', `/castells/${s.pastCastell.id}/positions/${pos.pos_key}`, { person_id: s.personId });
  assert.equal((await s.member('GET', `/people/${s.personId}/history`)).d.total, h0);
  assert.equal((await s.admin('GET', `/castells/${s.pastCastell.id}/history`)).text, castellHistory);

  const t0 = (await s.admin('GET', '/stats/castells?season=all')).d.total;
  await s.admin('POST', `/events/${s.pastEvent.id}/castells`, { width: 2, height: 6, result: 'descarregat' });
  assert.equal((await s.admin('GET', '/stats/castells?season=all')).d.total, t0 + 1, 'un castell nou en una sessió passada compta');
});

test('estructures: un pilar per sota i un de normal no es confonen', () => {
  assert.equal(buildStructure({ width: 1, height: 4, cordons: 3 }).name, 'pd4');
  assert.equal(buildStructure({ width: 1, height: 4, cordons: 3, sota: 1 }).name, 'pd4ps');
});

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
