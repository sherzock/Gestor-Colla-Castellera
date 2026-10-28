// Casos extrems: el servidor rebutja (o talla) el que no té sentit i accepta el que és normal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, sessions, long } from './helpers.js';

let server, s;
before(async () => { server = await startServer(); s = await sessions(server); });
after(() => server.stop());

const base = { type: 'assaig', title: 'Prova', date: '2026-12-01', start_time: '19:00', end_time: '21:30' };
const statuses = (list) => list.map((r) => r.s);

test('persones: textos tallats, mides possibles i dates reals', async () => {
  const p = (await s.admin('POST', '/people', { name: 'Prova Límits', alias: long(100), phone: long(100), height_cm: 180, weight_kg: 70.25 })).d;
  assert.equal(p.alias.length, 40);
  assert.equal(p.phone.length, 30);
  assert.equal(p.weight_kg, 70.3);
  const bad = await Promise.all([{ height_cm: 2000 }, { weight_kg: -5 }, { shoulder_width_cm: 500 }, { height_cm: 'Infinity' },
    { birthdate: '2026-02-31' }, { birthdate: '1800-01-01' }, { birthdate: '2999-01-01' }].map((x) => s.admin('PUT', `/people/${p.id}`, x)));
  assert.deepEqual(statuses(bad), Array(7).fill(400));
  assert.equal((await s.admin('PUT', `/people/${p.id}`, { height_cm: '', birthdate: '2010-06-15', shoulder_height_cm: 120 })).s, 200);
});

test('sessions: dates i hores impossibles → 400; títol i lloc tallats', async () => {
  const bad = await Promise.all([{ date: '2026-13-01' }, { date: '1999-12-31' }, { date: '2200-01-01' }, { start_time: '25:00' }, { end_time: '19:61' },
    { rsvp_until: '2026-11-31T10:00' }, { rsvp_until: '2026-11-30T24:00' }].map((x) => s.admin('POST', '/events', { ...base, ...x })));
  assert.deepEqual(statuses(bad), Array(7).fill(400));
  const ev = (await s.admin('POST', '/events', { ...base, title: long(500), location: long(500) })).d;
  assert.equal(ev.title.length, 120);
  assert.equal(ev.location.length, 150);
});

test('camps extra: 15 per sessió, 20 opcions sense repetir', async () => {
  const ev = (await s.admin('POST', '/events', base)).d;
  let last;
  for (let i = 0; i < 15; i++) last = await s.admin('POST', `/events/${ev.id}/fields`, { label: `Camp ${i}`, kind: 'text' });
  assert.equal(last.s, 200);
  assert.equal((await s.admin('POST', `/events/${ev.id}/fields`, { label: 'Un de massa', kind: 'text' })).s, 400);
  const ev2 = (await s.admin('POST', '/events', base)).d;
  const opts = await Promise.all([
    s.admin('POST', `/events/${ev2.id}/fields`, { label: 'Menú', kind: 'select', options: Array.from({ length: 21 }, (_, i) => `o${i}`) }),
    s.admin('POST', `/events/${ev2.id}/fields`, { label: 'Menú', kind: 'select', options: ['Carn', 'Carn'] }),
  ]);
  assert.deepEqual(statuses(opts), [400, 400]);
});

test('respostes d\'un membre: comentari i textos tallats a 300, com a molt 6 acompanyants', async () => {
  const ev = (await s.admin('POST', '/events', { ...base, ask_companions: 1 })).d;
  await s.admin('POST', `/events/${ev.id}/fields`, { label: 'Quants', kind: 'number' });
  await s.admin('POST', `/events/${ev.id}/fields`, { label: 'Què', kind: 'text' });
  const { fields } = (await s.admin('GET', `/events/${ev.id}`)).d;
  const num = fields.find((f) => f.kind === 'number').id, text = fields.find((f) => f.kind === 'text').id;
  const att = (body) => s.member('PUT', `/events/${ev.id}/attendance`, { status: 'si', ...body });
  assert.equal((await att({ comment: long(1000), extra: { [num]: 5, [text]: long(1000) }, companions: Array(6).fill('') })).s, 200);
  const { mine } = (await s.member('GET', `/events/${ev.id}`)).d;
  assert.equal(mine.comment.length, 300);
  assert.equal(mine.extra[text].length, 300);
  assert.equal(mine.companions.length, 6);
  assert.equal((await att({ companions: Array(7).fill('') })).s, 400);
  assert.equal((await att({ extra: { [num]: 1e12 } })).s, 400);
});

test('castells: 30 per sessió (ni duplicant), cordons possibles, persones temporals amb mides reals', async () => {
  const ev = (await s.admin('POST', '/events', base)).d;
  assert.equal((await s.admin('POST', `/events/${ev.id}/guests`, { name: 'Visitant', shoulder_height_cm: 900 })).s, 400);
  let last;
  for (let i = 0; i < 30; i++) last = await s.admin('POST', `/events/${ev.id}/castells`, { width: 3, height: 6, cordons: 3 });
  assert.equal(last.s, 200);
  assert.equal((await s.admin('POST', `/events/${ev.id}/castells`, { width: 3, height: 6 })).s, 400);
  assert.equal((await s.admin('POST', `/castells/${last.d.id}/duplicate`, {})).s, 400);
  const ev2 = (await s.admin('POST', '/events', base)).d;
  assert.equal((await s.admin('POST', `/events/${ev2.id}/castells`, { width: 3, height: 6, cordons: 9 })).s, 400);
});

test('posicions: només les del castell, i no milers alhora', async () => {
  const ev = (await s.admin('POST', '/events', base)).d;
  const c = (await s.admin('POST', `/events/${ev.id}/castells`, { width: 3, height: 6 })).d.id;
  const bad = await Promise.all([
    s.admin('PUT', `/castells/${c}/positions/zz-inventada`, { person_id: s.personId }),
    s.admin('PUT', `/castells/${c}/positions`, { assignments: Array.from({ length: 5000 }, (_, i) => ({ pos_key: `k${i}`, person_id: null })) }),
    s.admin('PUT', `/castells/${c}/positions`, { assignments: [{ pos_key: 'zz-inventada', person_id: s.personId }] }),
  ]);
  assert.deepEqual(statuses(bad), [400, 400, 400]);
  assert.equal((await s.admin('PUT', `/castells/${c}/positions/t1-0`, { person_id: s.personId })).s, 200);
  assert.equal((await s.admin('PUT', `/castells/${c}/positions/zz-inventada`, { person_id: null })).s, 200, 'buidar-ne qualsevol, sí');
});

test('plantilles: com a molt 200 caixes per capa; el nom de cada caixa es talla a 30', async () => {
  const box = (i) => ({ key: `pn${i}`, role: long(80), kind: 'altre', x: i, y: 0, w: 60, h: 30, rot: 0 });
  assert.equal((await s.admin('PUT', '/templates/3d6', { layers: { pinya: Array.from({ length: 201 }, (_, i) => box(i + 1)) } })).s, 400);
  assert.equal((await s.admin('PUT', '/templates/3d6', { layers: { pinya: [box(1)] } })).s, 200);
  const role = (await s.admin('GET', '/templates')).d.find((x) => x.name === '3d6').layers.pinya[0].role;
  assert.equal(role.length, 30);
  await s.admin('DELETE', '/templates/3d6');
});

test('altaveu: títol (120) i missatge (4000) tallats', async () => {
  const a = (await s.admin('POST', '/announcements', { title: long(500), body: long(10000) })).d;
  assert.equal(a.title.length, 120);
  assert.equal(a.body.length, 4000);
});

test('després de tot això el servidor segueix bé', async () => {
  assert.equal((await s.admin('GET', '/people')).s, 200);
  assert.equal((await s.member('GET', '/events')).s, 200);
  assert.equal((await client(server.url)('GET', '/api/config')).s, 200);
  assert.ok(!server.log().includes('NODE22'));
});
