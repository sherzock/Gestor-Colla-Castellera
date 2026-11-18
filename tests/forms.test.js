// Preguntes i pagaments de l'altaveu: preguntes, respostes de cada membre, imports, «Ja he pagat» i «Rebut».
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { amountOf, euros, groupIban, ibanValid, parseEuros, phoneValid } from '../public/forms.js';
import { startServer, client, sessions } from './helpers.js';

let server, s;
before(async () => { server = await startServer(); s = await sessions(server); });
after(() => server.stop());

const IBAN = 'ES91 2100 0418 4502 0005 1332';
const trip = (extra = {}) => ({
  pay_holder: 'Colla', pay_iban: IBAN, pay_concept: 'Viatge',
  questions: [
    { text: 'Véns al viatge?', options: [{ text: 'Sí, amb bus', price: 2500 }, { text: 'Sí, pel meu compte' }, { text: 'No' }] },
    { text: 'Què sopes?', multiple: true, options: [{ text: 'Sopar', price: 1550 }, { text: 'Samarreta', price: 1000 }] },
  ],
  ...extra,
});
async function publish(form, title = 'Viatge a Tarragona') {
  const r = await s.admin('POST', '/announcements', { title, notify: false, form });
  assert.equal(r.s, 200, JSON.stringify(r.d));
  const a = (await s.member('GET', '/announcements')).d.find((x) => x.id === r.d.id);
  return a;
}
const ids = (a) => a.form.questions.map((q) => q.options.map((o) => o.id));

test('IBAN, Bizum i euros', () => {
  assert.ok(ibanValid(IBAN));
  assert.ok(!ibanValid('ES91 2100 0418 4502 0005 1333'));
  assert.ok(!ibanValid('hola'));
  assert.equal(groupIban('es9121000418450200051332'), 'ES91 2100 0418 4502 0005 1332');
  assert.ok(phoneValid('+34 612 345 678'));
  assert.ok(!phoneValid('912345678'));
  assert.equal(parseEuros('12,5'), 1250);
  assert.equal(parseEuros('12 €'), 1200);
  assert.equal(parseEuros(''), null);
  assert.ok(Number.isNaN(parseEuros('12,555')));
  assert.equal(euros(1250, 'ca').replace(/\s/g, ' '), '12,50 €');
  const qs = [{ id: 'q1', options: [{ id: 'a', price: 100 }, { id: 'b', price: 250 }] }];
  assert.equal(amountOf(qs, { q1: ['a', 'b'] }), 350);
  assert.equal(amountOf(qs, {}), 0);
});

test("per cobrar cal un IBAN o un Bizum vàlids", async () => {
  const bad = async (form) => (await s.admin('POST', '/announcements', { title: 'x', notify: false, form })).s;
  assert.equal(await bad(trip({ pay_iban: '' })), 400);
  assert.equal(await bad(trip({ pay_iban: 'ES91 2100 0418 4502 0005 1333' })), 400);
  assert.equal(await bad(trip({ pay_iban: '', pay_bizum: '912345678' })), 400);
  assert.equal(await bad({ questions: [] }), 400);
  assert.equal(await bad({ questions: [{ text: 'Q', options: [] }] }), 400);
  // Una enquesta sense preus no necessita on pagar.
  assert.equal(await bad({ questions: [{ text: 'Color?', options: [{ text: 'Vermell' }, { text: 'Blau' }] }] }), 200);
});

test('el membre respon, veu quant ha de pagar i on, i la junta marca el pagament', async () => {
  const a = await publish(trip());
  assert.equal(a.form.pay.iban, IBAN.replace(/\s/g, ''));
  assert.equal(a.form.counts, undefined, 'sense resultats públics, el membre no veu els vots');
  assert.equal(a.form.mine, null);
  const [[bus, , no], [dinner, shirt]] = ids(a);
  const [q1, q2] = a.form.questions.map((q) => q.id);
  const answer = (answers) => s.member('PUT', `/announcements/${a.id}/answer`, { answers });

  assert.equal((await answer({ [q1]: [bus] })).s, 400, 'cal respondre-ho tot');
  assert.equal((await answer({ [q1]: [bus, no], [q2]: [dinner] })).s, 400, 'una sola opció');
  assert.equal((await answer({ [q1]: ['zzz'], [q2]: [dinner] })).s, 400, 'opció inventada');
  const r = await answer({ [q1]: [bus], [q2]: [dinner, shirt] });
  assert.equal(r.s, 200);
  assert.equal(r.d.amount, 2500 + 1550 + 1000);

  const mine = (await s.member('GET', '/announcements')).d.find((x) => x.id === a.id).form.mine;
  assert.equal(mine.amount, 5050);
  assert.equal(mine.paid_at, null);

  assert.equal((await s.member('PUT', `/announcements/${a.id}/answer/paid`, { paid: true })).s, 200);
  let staff = (await s.admin('GET', `/announcements/${a.id}/answers`)).d;
  const row = staff.rows.find((x) => x.person_id === s.personId);
  assert.ok(row.paid_at && !row.received_at);
  assert.equal(staff.form.summary.to_check, 1);
  assert.equal(staff.form.counts[bus], 1);
  assert.ok(!staff.pending.some((p) => p.id === s.personId));

  // Si canvia l'import, l'avís de pagament ja no val.
  await answer({ [q1]: [bus], [q2]: [dinner] });
  assert.equal((await s.admin('GET', `/announcements/${a.id}/answers`)).d.rows.find((x) => x.person_id === s.personId).paid_at, null);
  await s.member('PUT', `/announcements/${a.id}/answer/paid`, { paid: true });

  assert.equal((await s.admin('PUT', `/announcements/${a.id}/answers/${s.personId}`, { received: true })).s, 200);
  staff = (await s.admin('GET', `/announcements/${a.id}/answers`)).d;
  assert.equal(staff.form.summary.received, 4050);
  // Un cop rebut, el membre ja no pot canviar l'import ni esborrar la resposta.
  assert.equal((await answer({ [q1]: [no], [q2]: [shirt] })).s, 400);
  assert.equal((await s.member('DELETE', `/announcements/${a.id}/answer`)).s, 400);
  assert.equal((await s.member('PUT', `/announcements/${a.id}/answer/paid`, { paid: false })).s, 400);
  assert.equal((await answer({ [q1]: [bus], [q2]: [dinner] })).s, 200, 'el mateix import sí');
});

test("només els membres responen i només la junta veu les respostes amb noms", async () => {
  const a = await publish(trip(), 'Sopar');
  const answers = Object.fromEntries(a.form.questions.map((q) => [q.id, [q.options[0].id]]));
  assert.equal((await s.admin('PUT', `/announcements/${a.id}/answer`, { answers })).s, 403);
  assert.equal((await s.member('GET', `/announcements/${a.id}/answers`)).s, 403);
  assert.equal((await s.member('PUT', `/announcements/${a.id}/answers/${s.personId}`, { received: true })).s, 403);
  const anon = client(s.api);
  assert.equal((await anon('PUT', `/announcements/${a.id}/answer`, { answers })).s, 401);
  assert.equal((await s.member('PUT', `/announcements/999999/answer`, { answers })).s, 404);
});

test('resultats públics: el membre veu els vots, sense noms', async () => {
  const a = await publish({ results_public: true, questions: [{ text: 'Samarreta?', options: [{ text: 'S' }, { text: 'M' }] }] }, 'Talles');
  const [[small]] = ids(a);
  await s.member('PUT', `/announcements/${a.id}/answer`, { answers: { [a.form.questions[0].id]: [small] } });
  const seen = (await s.member('GET', '/announcements')).d.find((x) => x.id === a.id).form;
  assert.equal(seen.counts[small], 1);
  assert.equal(seen.summary, undefined);
  assert.equal(seen.pay, null);
});

test("passada la data límit ja no es pot respondre; editar conserva les respostes", async () => {
  const yesterday = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const a = await publish({ questions: [{ text: 'Vens?', options: [{ text: 'Sí' }, { text: 'No' }] }] }, 'Tancada');
  const q = a.form.questions[0];
  assert.equal((await s.member('PUT', `/announcements/${a.id}/answer`, { answers: { [q.id]: [q.options[0].id] } })).s, 200);
  // La junta afegeix una opció: les de abans mantenen l'identificador i la resposta continua valent.
  const edited = { closes_on: yesterday, questions: [{ ...q, options: [...q.options, { text: 'Potser' }] }] };
  assert.equal((await s.admin('PUT', `/announcements/${a.id}`, { title: 'Tancada', form: edited })).s, 200);
  const now = (await s.member('GET', '/announcements')).d.find((x) => x.id === a.id).form;
  assert.equal(now.open, false);
  assert.deepEqual(now.mine.answers[q.id], [q.options[0].id]);
  assert.equal(now.questions[0].options.length, 3);
  assert.equal((await s.member('PUT', `/announcements/${a.id}/answer`, { answers: { [q.id]: [q.options[1].id] } })).s, 400);
  // Treure les preguntes esborra les respostes.
  assert.equal((await s.admin('PUT', `/announcements/${a.id}`, { title: 'Tancada', form: null })).s, 200);
  assert.equal((await s.member('GET', '/announcements')).d.find((x) => x.id === a.id).form, undefined);
});

test("les dades de pagament es recorden per al proper missatge", async () => {
  await publish(trip({ pay_bizum: '612 345 678' }), 'Recordar');
  const d = (await s.admin('GET', '/pay-defaults')).d;
  assert.equal(d.pay_iban, IBAN.replace(/\s/g, ''));
  assert.equal(d.pay_bizum, '612345678');
  assert.equal((await s.member('GET', '/pay-defaults')).s, 403);
});
