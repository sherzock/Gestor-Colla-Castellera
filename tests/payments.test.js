// Pagaments de les sessions: preus, quant ha de pagar cadascú, «Ja he pagat», «Rebut» i el botó de l'altaveu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eventAmount, euros, fieldAmount, groupIban, ibanValid, parseEuros, phoneValid } from '../public/forms.js';
import { startServer, client, sessions } from './helpers.js';

let server, s;
before(async () => { server = await startServer(); s = await sessions(server); });
after(() => server.stop());

const IBAN = 'ES91 2100 0418 4502 0005 1332';
const future = (days = 9) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

// Una sessió visible amb: autocar (sí/no, 12 €), dinars (número, 15 € cadascun) i menú (llista: només el peix es paga).
async function tripEvent(title = 'Viatge') {
  const ev = (await s.admin('POST', '/events', { hidden: false, type: 'esdeveniment', title, date: future(), ask_companions: true })).d;
  const add = async (body) => (await s.admin('POST', `/events/${ev.id}/fields`, body)).d.at(-1);
  const bus = await add({ label: 'Autocar', kind: 'bool', price: 1200 });
  const meals = await add({ label: 'Dinars', kind: 'number', price: 1500 });
  const menu = await add({ label: 'Menú', kind: 'select', options: 'Carn, Peix' });
  assert.equal((await s.admin('PUT', `/fields/${menu.id}`, { option_prices: [null, 300] })).s, 200);
  return { ev, bus, meals, menu };
}

test('IBAN, Bizum, euros i imports', () => {
  assert.ok(ibanValid(IBAN));
  assert.ok(!ibanValid('ES91 2100 0418 4502 0005 1333'));
  assert.equal(groupIban('es9121000418450200051332'), IBAN);
  assert.ok(phoneValid('+34 612 345 678'));
  assert.ok(!phoneValid('912345678'));
  assert.equal(parseEuros('12,5'), 1250);
  assert.equal(parseEuros(''), null);
  assert.ok(Number.isNaN(parseEuros('12,555')));
  assert.equal(euros(1250, 'ca').replace(/\s/g, ' '), '12,50 €');
  const fields = [{ id: 1, kind: 'bool', price: 1200 }, { id: 2, kind: 'number', price: 1500 }, { id: 3, kind: 'select', options: ['Carn', 'Peix'], option_prices: [null, 300] }];
  assert.equal(fieldAmount(fields[2], 'Peix'), 300);
  const pay = { price: 1000, companion_price: 500 };
  assert.equal(eventAmount(pay, fields, { status: 'si', extra: { 1: true, 2: '2', 3: 'Peix' }, companions: 2 }), 1000 + 1000 + 1200 + 3000 + 300);
  assert.equal(eventAmount(pay, fields, { status: 'no', extra: { 1: true } }), 0, 'qui no ve no paga');
  assert.equal(eventAmount(null, fields, { status: 'si', extra: { 1: true } }), 0, 'sense on pagar, res');
});

test('per cobrar cal un IBAN o un Bizum vàlids', async () => {
  const { ev } = await tripEvent('Validació');
  const put = async (body) => (await s.admin('PUT', `/events/${ev.id}/payment`, body)).s;
  assert.equal(await put({ price: 1000 }), 400);
  assert.equal(await put({ price: 1000, iban: 'ES91 2100 0418 4502 0005 1333' }), 400);
  assert.equal(await put({ price: 1000, bizum: '912345678' }), 400);
  assert.equal(await put({ price: -5, iban: IBAN }), 400);
  assert.equal(await put({ price: 1000, bizum: '612 345 678' }), 200);
  assert.equal((await s.member('PUT', `/events/${ev.id}/payment`, { price: 0, iban: IBAN })).s, 403);
});

test('qui ve veu quant ha de pagar i on, avisa que ha pagat i la junta ho marca com a rebut', async () => {
  const { ev, bus, meals, menu } = await tripEvent();
  assert.equal((await s.admin('PUT', `/events/${ev.id}/payment`, { price: 1000, companion_price: 500, holder: 'Colla', iban: IBAN, concept: 'Viatge' })).s, 200);
  const answer = (body) => s.member('PUT', `/events/${ev.id}/attendance`, body);
  assert.equal((await answer({ status: 'si', extra: { [bus.id]: true, [meals.id]: 2, [menu.id]: 'Peix' }, companions: ['', ''] })).s, 200);
  let d = (await s.member('GET', `/events/${ev.id}`)).d;
  assert.equal(d.payment.iban, IBAN.replace(/\s/g, ''));
  assert.equal(d.payment.concept, 'Viatge');
  assert.equal(d.mine.amount, 1000 + 2 * 500 + 1200 + 2 * 1500 + 300);
  assert.equal(d.payments, undefined, 'el membre no veu el resum de la junta');

  assert.equal((await s.member('PUT', `/events/${ev.id}/paid`, { paid: true })).s, 200);
  let staff = (await s.admin('GET', `/events/${ev.id}`)).d;
  const row = staff.attendance.find((a) => a.id === s.personId);
  assert.equal(row.amount, 6500);
  assert.ok(row.paid_at && !row.received_at);
  assert.equal(staff.payments.to_check, 1);
  assert.equal(staff.payments.total, 6500);

  // Si canvia l'import, l'avís de pagament ja no val.
  await answer({ status: 'si', extra: { [bus.id]: false, [meals.id]: 2, [menu.id]: 'Peix' } });
  d = (await s.member('GET', `/events/${ev.id}`)).d;
  assert.equal(d.mine.amount, 5300);
  assert.equal(d.mine.paid_at, null);
  await s.member('PUT', `/events/${ev.id}/paid`, { paid: true });

  assert.equal((await s.admin('PUT', `/events/${ev.id}/payments/${s.personId}`, { received: true })).s, 200);
  staff = (await s.admin('GET', `/events/${ev.id}`)).d;
  assert.equal(staff.payments.received, 5300);
  assert.equal(staff.payments.to_check, 0);
  // Un cop rebut, el membre ja no pot canviar l'import (ni dir que no ve), però sí el comentari.
  assert.equal((await answer({ status: 'no', extra: {} })).s, 400);
  assert.equal((await answer({ status: 'si', extra: { [bus.id]: true, [meals.id]: 2, [menu.id]: 'Peix' } })).s, 400);
  assert.equal((await answer({ comment: 'arribo tard' })).s, 200);
  assert.equal((await s.member('PUT', `/events/${ev.id}/paid`, { paid: false })).s, 400);
  // La junta sí que ho pot canviar.
  assert.equal((await s.admin('PUT', `/events/${ev.id}/attendance/${s.personId}`, { status: 'no' })).s, 200);

  // L'Excel/CSV de la sessió porta l'import i l'estat.
  const table = (await s.admin('GET', `/events/${ev.id}/attendance`)).d;
  assert.ok(table.columns.includes('Import (€)') && table.columns.includes('Pagament'));
});

test('permisos: el membre no marca rebuts i la junta no respon per ell', async () => {
  const { ev } = await tripEvent('Permisos');
  await s.admin('PUT', `/events/${ev.id}/payment`, { price: 1000, iban: IBAN });
  assert.equal((await s.member('PUT', `/events/${ev.id}/payments/${s.personId}`, { received: true })).s, 403);
  assert.equal((await s.admin('PUT', `/events/${ev.id}/paid`, { paid: true })).s, 403);
  assert.equal((await s.member('PUT', `/events/${ev.id}/paid`, { paid: true })).s, 400, 'encara no ha dit que ve');
  assert.equal((await s.member('GET', '/pay-defaults')).s, 403);
  const anon = client(s.api);
  assert.equal((await anon('PUT', `/events/${ev.id}/paid`, { paid: true })).s, 401);
});

test('treure el pagament esborra els avisos i les dades es recorden per a la propera sessió', async () => {
  const { ev } = await tripEvent('Treure');
  await s.admin('PUT', `/events/${ev.id}/payment`, { price: 800, holder: 'Colla', iban: IBAN, bizum: '612345678' });
  const d = (await s.admin('GET', '/pay-defaults')).d;
  assert.equal(d.iban, IBAN.replace(/\s/g, ''));
  assert.equal(d.bizum, '612345678');
  await s.member('PUT', `/events/${ev.id}/attendance`, { status: 'si' });
  await s.member('PUT', `/events/${ev.id}/paid`, { paid: true });
  assert.equal((await s.admin('DELETE', `/events/${ev.id}/payment`)).s, 200);
  const mine = (await s.member('GET', `/events/${ev.id}`)).d;
  assert.equal(mine.payment, null);
  assert.equal(mine.mine.amount, 0);
  assert.equal(mine.mine.paid_at, null);
});

test("un missatge de l'altaveu porta a una sessió (si el membre la pot veure)", async () => {
  const shown = (await s.admin('POST', '/events', { hidden: false, type: 'esdeveniment', title: 'Sopar', date: future() })).d;
  const hidden = (await s.admin('POST', '/events', { type: 'esdeveniment', title: 'Secret', date: future() })).d;
  const a1 = (await s.admin('POST', '/announcements', { title: 'Apunta-t\'hi', notify: false, event_id: shown.id })).d;
  const a2 = (await s.admin('POST', '/announcements', { title: 'Encara no', notify: false, event_id: hidden.id })).d;
  assert.equal(a1.event.id, shown.id);
  assert.equal((await s.admin('POST', '/announcements', { title: 'x', notify: false, event_id: 999999 })).s, 404);
  const list = (await s.member('GET', '/announcements')).d;
  assert.equal(list.find((a) => a.id === a1.id).event.title, 'Sopar');
  assert.equal(list.find((a) => a.id === a2.id).event, null, 'una sessió oculta no surt');
  // Treure l'enllaç, i esborrar la sessió deixa el missatge sense botó.
  assert.equal((await s.admin('PUT', `/announcements/${a2.id}`, { title: 'Encara no', event_id: null })).d.event, null);
  await s.admin('DELETE', `/events/${shown.id}`);
  assert.equal((await s.admin('GET', '/announcements')).d.find((a) => a.id === a1.id).event, null);
});

test('data límit, qui va tard, i marcar rebuts de diverses persones alhora (pel banc o en efectiu)', async () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { ev } = await tripEvent('Termini');
  assert.equal((await s.admin('PUT', `/events/${ev.id}/payment`, { price: 1000, iban: IBAN, due_date: 'demà' })).s, 400);
  assert.equal((await s.admin('PUT', `/events/${ev.id}/payment`, { price: 1000, iban: IBAN, due_date: yesterday })).s, 200);
  const people = (await s.admin('GET', '/people')).d.people.filter((p) => p.active && p.id !== s.personId).slice(0, 2);
  await s.member('PUT', `/events/${ev.id}/attendance`, { status: 'si' });
  for (const p of people) await s.admin('PUT', `/events/${ev.id}/attendance/${p.id}`, { status: 'si' });
  let d = (await s.admin('GET', `/events/${ev.id}`)).d;
  assert.equal(d.payment.due_date, yesterday);
  assert.equal(d.payments.late, 3);
  assert.ok(d.attendance.find((a) => a.id === s.personId).late);
  // Dir «Ja he pagat» treu de la llista dels que van tard.
  await s.member('PUT', `/events/${ev.id}/paid`, { paid: true });
  assert.equal((await s.admin('GET', `/events/${ev.id}`)).d.payments.late, 2);

  const put = (body) => s.admin('PUT', `/events/${ev.id}/payments`, body);
  assert.equal((await put({ person_ids: [], received: true })).s, 400);
  assert.equal((await s.member('PUT', `/events/${ev.id}/payments`, { person_ids: [s.personId], received: true })).s, 403);
  // Si algú de la tria no ha de pagar, no es marca ningú.
  const nobody = (await s.admin('GET', '/people')).d.people.find((p) => p.active && ![s.personId, ...people.map((x) => x.id)].includes(p.id));
  assert.equal((await put({ person_ids: [people[0].id, nobody.id], received: true })).s, 400);
  assert.equal((await s.admin('GET', `/events/${ev.id}`)).d.payments.received, 0);

  assert.equal((await put({ person_ids: people.map((p) => p.id), received: true, cash: true })).s, 200);
  assert.equal((await put({ person_ids: [s.personId], received: true })).s, 200);
  d = (await s.admin('GET', `/events/${ev.id}`)).d;
  assert.equal(d.payments.received, 3000);
  assert.equal(d.payments.late, 0);
  assert.ok(d.attendance.find((a) => a.id === people[0].id).received_cash);
  assert.ok(!d.attendance.find((a) => a.id === s.personId).received_cash);
  const mine = (await s.member('GET', `/events/${ev.id}`)).d.mine;
  assert.ok(mine.received_at && !mine.received_cash);
  const table = (await s.admin('GET', `/events/${ev.id}/attendance`)).d;
  assert.ok(table.rows.some((r) => r.includes('rebut en efectiu')));
  // Desfer-ho també treu l'«en efectiu».
  await s.admin('PUT', `/events/${ev.id}/payments/${people[0].id}`, { received: false });
  assert.equal((await s.admin('GET', `/events/${ev.id}`)).d.attendance.find((a) => a.id === people[0].id).received_cash, null);
});
