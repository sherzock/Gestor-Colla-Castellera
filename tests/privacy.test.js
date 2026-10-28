// Privadesa: què veu un membre (noms públics, res de dades personals) i sessions i castells ocults.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
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

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
