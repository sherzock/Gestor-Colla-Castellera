// Horari de l'assaig i sessions i castells que es creen ocults.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, sessions } from './helpers.js';
import { nextPlanTime, planLayout } from '../public/planning.js';

const event = { start_time: '20:00', end_time: '22:00' };
const c = (id, plan_time, plan_minutes, net = 0) => ({ id, position: id, plan_time, plan_minutes, net });

test('horari: el que es fa alhora es posa de costat, sigui net o no', () => {
  const plan = planLayout([c(1, '20:15', 20), c(2, '20:25', 20), c(3, '20:45', 20, 1), c(4, '20:50', 20), c(5, null)], event);
  assert.deepEqual([plan.from, plan.to], [20 * 60, 22 * 60]);
  assert.deepEqual(plan.blocks.map((b) => [b.c.id, b.col, b.cols]), [[1, 0, 2], [2, 1, 2], [3, 0, 2], [4, 1, 2]]);
  assert.deepEqual(plan.unscheduled.map((x) => x.id), [5]);
  assert.deepEqual(planLayout([c(1, '20:00', 20), c(2, '20:20', 20, 1)], event).blocks.map((b) => [b.col, b.cols]), [[0, 1], [0, 1]], 'un darrere l\'altre, cadascun sencer');
});

test('horari: el marge s\'amplia si un castell surt de les hores de la sessió, arrodonit a mitges hores', () => {
  const plan = planLayout([c(1, '19:40', 20), c(2, '22:10', 25)], event);
  assert.deepEqual([plan.from, plan.to], [19 * 60 + 30, 23 * 60]);
  assert.equal(planLayout([c(1, '20:00')], event).blocks[0].end, 20 * 60 + 20, 'sense minuts, els de per defecte');
});

test('horari: l\'hora proposada continua després de l\'últim castell, net o no', () => {
  const list = [c(1, '20:15', 25), c(2, null), c(3, '20:40', 20, 1), c(4, null, null, 1)];
  assert.equal(nextPlanTime(list[1], list, event), '21:00');
  assert.equal(nextPlanTime(list[3], list, event), '21:00');
  assert.equal(nextPlanTime(c(9), [], event), '20:00');
});

let server, s, junta, tecnica;
before(async () => {
  server = await startServer({ DEMO: '0' });
  s = await sessions(server);
  junta = client(`${server.url}/api`);
  tecnica = client(`${server.url}/api`);
  assert.equal((await junta('POST', '/login', { username: 'junta', password: 'junta1234' })).s, 200);
  assert.equal((await tecnica('POST', '/login', { username: 'tecnica', password: 'tecnica1234' })).s, 200);
});
after(() => server.stop());

const date = () => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

test('una sessió i un castell nous no els veuen els membres fins que es mostren', async () => {
  const A = s.admin;
  const ev = (await A('POST', '/events', { type: 'assaig', title: 'Nou', date: date() })).d;
  assert.equal(ev.hidden, 1);
  assert.equal((await s.member('GET', `/events/${ev.id}`)).s, 404);
  assert.ok(!(await s.member('GET', '/events')).d.some((e) => e.id === ev.id));

  const castell = (await A('POST', `/events/${ev.id}/castells`, { width: 3, height: 7 })).d;
  assert.equal(castell.hidden, 1);
  // Es pot demanar explícitament que es vegi.
  const open = (await A('POST', `/events/${ev.id}/castells`, { width: 4, height: 7, hidden: false })).d;
  assert.equal(open.hidden, 0);

  // Mostrar la sessió no mostra els castells, si no es demana.
  await A('PUT', `/events/${ev.id}/hidden`, { hidden: false });
  assert.deepEqual((await s.member('GET', `/events/${ev.id}`)).d.castells.map((x) => x.id), [open.id]);
  await A('PUT', `/events/${ev.id}/hidden`, { hidden: true });
  await A('PUT', `/events/${ev.id}/hidden`, { hidden: false, castells: true });
  assert.equal((await s.member('GET', `/events/${ev.id}`)).d.castells.length, 2);

  // Un duplicat és un castell nou.
  const copy = (await A('POST', `/castells/${open.id}/duplicate`, {})).d;
  assert.equal((await A('GET', `/castells/${copy.id}`)).d.castell.hidden, 1);
});

test('la junta mostra la sessió, però els castells els mostra qui en porta el permís', async () => {
  const ev = (await s.admin('POST', '/events', { type: 'assaig', title: 'Permisos', date: date() })).d;
  await s.admin('POST', `/events/${ev.id}/castells`, { width: 3, height: 7 });
  assert.equal((await junta('PUT', `/events/${ev.id}/hidden`, { hidden: false, castells: true })).s, 200);
  assert.equal((await s.member('GET', `/events/${ev.id}`)).d.castells.length, 0);
});

test('l\'horari: el posa la tècnica, el veu la junta i no arriba als membres', async () => {
  const ev = (await s.admin('POST', '/events', { type: 'assaig', title: 'Horari', date: date(), hidden: false })).d;
  const id = (await s.admin('POST', `/events/${ev.id}/castells`, { width: 3, height: 7, hidden: false })).d.id;

  assert.equal((await junta('PUT', `/castells/${id}`, { plan_time: '20:30' })).s, 403);
  assert.equal((await tecnica('PUT', `/castells/${id}`, { plan_time: '25:00' })).s, 400);
  assert.equal((await tecnica('PUT', `/castells/${id}`, { plan_time: '20:30', plan_minutes: 1 })).s, 400);
  const saved = (await tecnica('PUT', `/castells/${id}`, { plan_time: '20:30', plan_minutes: 25 })).d;
  assert.deepEqual([saved.plan_time, saved.plan_minutes, saved.width, saved.hidden], ['20:30', 25, 3, 0], 'no toca la resta');

  assert.equal((await junta('GET', `/events/${ev.id}`)).d.castells[0].plan_time, '20:30');
  assert.equal((await junta('GET', `/castells/${id}`)).d.castell.plan_minutes, 25);

  const member = (await s.member('GET', `/events/${ev.id}`)).d.castells[0];
  assert.ok(!('plan_time' in member) && !('plan_minutes' in member));
  const mine = (await s.member('GET', `/castells/${id}`)).d.castell;
  assert.ok(!('plan_time' in mine) && !('plan_minutes' in mine));

  const cleared = (await tecnica('PUT', `/castells/${id}`, { plan_time: null, plan_minutes: null })).d;
  assert.deepEqual([cleared.plan_time, cleared.plan_minutes], [null, null]);
});
