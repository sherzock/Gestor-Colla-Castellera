// Els recorreguts principals, al navegador i a mida de mòbil: com ho faria una persona de la colla o de la junta.
// Les dades són les de demostració (seed.js) en un servidor propi; cada prova té les seves galetes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { startServer, sessions } from '../tests/helpers.js';
import { launchBrowser, skip } from './browser.js';

let server, s, browser;
before(async () => {
  if (skip) return;
  server = await startServer();
  s = await sessions(server);
  browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.stop(); });

// Obre una pàgina neta. En acabar, la tanca; si la prova falla, en deixa una captura i diu on és.
async function withPage(t, fn, opts) {
  const page = await browser.newPage(opts);
  try {
    await fn(page);
    assert.deepEqual(page.errors, [], "L'app ha llançat errors a la consola");
  } catch (err) {
    const file = path.join(os.tmpdir(), `e2e-${t.name.replace(/\W+/g, '-').slice(0, 60)}.png`);
    await page.screenshot(file).catch(() => {});
    err.message += `\n(captura: ${file})`;
    throw err;
  } finally {
    await page.close();
  }
}
const asAdmin = async (page) => {
  await page.goto(`${server.url}/#/admin`);
  await page.type('#login-form [name=username]', 'admin');
  await page.type('#login-form [name=password]', 'admin1234');
  await page.click('#login-form button.primary');
  await page.see('#me-chip', 'Administració');
};

test('membre: entra triant el seu nom i diu que ve a una sessió', { skip }, (t) => withPage(t, async (page) => {
  const person = (await s.admin('GET', '/people')).d.people.find((p) => p.active && !p.instrument && p.alias);
  const event = (await s.admin('GET', '/events')).d.find((e) => e.rsvp_open && e.type === 'assaig' && !e.hidden);
  await page.goto(`${server.url}/#/login`);
  await page.type('#who-q', person.alias);
  await page.click('#who-list button', person.alias);
  await page.see('#me-chip');
  await page.click(`a.event-link[href="#/sessio/${event.id}"]`);
  // Si ja havia dit que sí, primer diu que no: així es veu que es desa el canvi.
  const before = (await s.admin('GET', `/events/${event.id}`)).d.attendance.find((a) => a.id === person.id)?.status;
  const want = before === 'si' ? 'no' : 'si';
  await page.click(`#rsvp-main button[data-v="${want}"]`);
  await page.see('#rsvp-state', 'Desat');
  const after = (await s.admin('GET', `/events/${event.id}`)).d.attendance.find((a) => a.id === person.id).status;
  assert.equal(after, want);
  await page.evaluate('location.reload()');
  await page.see(`#rsvp-main button.on[data-v="${want}"]`);
}));

test('administració: entra amb usuari i contrasenya i passa llista', { skip }, (t) => withPage(t, async (page) => {
  await asAdmin(page);
  const event = s.pastEvent;
  await page.goto(`${server.url}/#/sessio/${event.id}`);
  await page.see('#att-filter .chip.on', 'Tothom');
  await page.click('#att-filter .chip', 'Han vingut');
  const row = await page.evaluate(`[...document.querySelectorAll('#att-table tbody tr[data-id]')].find((r) => !r.classList.contains('hidden')).dataset.id`);
  await page.click(`#att-table tr[data-id="${row}"] [data-act=came]`);
  // Amb el filtre «Han vingut», qui ja no hi és desapareix de la llista.
  await page.waitFor(`document.querySelector('#att-table tr[data-id="${row}"]').classList.contains('hidden')`, { what: 'que surti del filtre' });
  const a = (await s.admin('GET', `/events/${event.id}`)).d.attendance.find((x) => String(x.id) === row);
  assert.equal(a.present, false);
  // El filtre es manté després de tornar a pintar la pàgina, i la llista es talla a 20.
  await page.see('#att-filter .chip.on', 'Han vingut');
  assert.ok(await page.evaluate(`[...document.querySelectorAll('#att-table tbody tr[data-id]')].filter((r) => !r.classList.contains('hidden')).length <= 20`));
}));

test('administració: marca com a rebut un pagament que algú diu que ha fet', { skip }, (t) => withPage(t, async (page) => {
  const event = (await s.admin('GET', '/events')).d.find((e) => e.rsvp_open && e.type === 'assaig' && !e.hidden);
  await s.admin('PUT', `/events/${event.id}/payment`, { price: 1500, bizum: '600000000', concept: 'Prova' });
  await s.member('PUT', `/events/${event.id}/attendance`, { status: 'si' });
  assert.equal((await s.member('PUT', `/events/${event.id}/paid`, { paid: true })).s, 200);
  await asAdmin(page);
  await page.goto(`${server.url}/#/sessio/${event.id}`);
  await page.see('#pay-admin', 'Diuen que han pagat');
  await page.click(`#pay-admin [data-received="${s.personId}"]`);
  await page.waitFor(`!document.querySelector('#pay-admin [data-more="pay-check"] [data-received="${s.personId}"]')`, { what: 'que surti de la llista' });
  const mine = (await s.member('GET', `/events/${event.id}`)).d.mine;
  assert.ok(mine.received_at);
}));

test('tècnica: col·loca una persona en una posició buida d\'un castell', { skip }, (t) => withPage(t, async (page) => {
  const event = (await s.admin('GET', '/events')).d.find((e) => e.rsvp_open && e.type === 'assaig' && !e.hidden);
  const castell = (await s.admin('GET', `/events/${event.id}`)).d.castells[0];

  await asAdmin(page);
  await page.goto(`${server.url}/#/castell/${castell.id}`);
  await page.click('#views button[data-v="llista"]');
  const key = await page.waitFor(`document.querySelector('#viewer li.empty[data-key]')?.dataset.key`, { what: 'una posició buida' });
  await page.click(`#viewer li[data-key="${key}"]`);
  await page.see('#pick-list [data-pid]');
  const pid = await page.evaluate(`document.querySelector('#pick-list [data-pid]').dataset.pid`);
  await page.click(`#pick-list [data-pid="${pid}"]`);
  await page.waitFor(`!document.querySelector('.modal-back')`, { what: 'que es tanqui la finestra' });
  const pos = (await s.admin('GET', `/castells/${castell.id}`)).d.positions.find((p) => p.pos_key === key);
  assert.equal(String(pos?.person_id), pid);
}));

test('membre: envia un suggeriment i l\'administració el rep', { skip }, (t) => withPage(t, async (page) => {
  await page.goto(`${server.url}/#/login`);
  await page.click('#who-list button');
  await page.click('#me-chip');
  await page.click('#feedback-open');
  await page.type('#feedback-form textarea', 'Prova al navegador: estaria bé veure el mapa del local');
  await page.click('#feedback-form button.primary');
  await page.waitFor(`!document.querySelector('#feedback-form')`, { what: 'que es tanqui el formulari' });
  const list = (await s.admin('GET', '/feedback')).d;
  assert.ok(list.some((f) => f.message === 'Prova al navegador: estaria bé veure el mapa del local' && f.kind === 'idea'));
}));

test('mòbil: cap pantalla principal surt pels costats', { skip }, (t) => withPage(t, async (page) => {
  await asAdmin(page);
  const castell = s.pastCastell;
  for (const hash of ['#/', `#/sessio/${s.pastEvent.id}`, `#/castell/${castell.id}`, '#/persones', '#/estadistiques', '#/calendari', '#/altaveu', '#/comptes']) {
    await page.goto(`${server.url}/${hash}`);
    await page.waitFor(`document.querySelector('#app h1, #app h2')`, { what: `carregar ${hash}` });
    assert.ok(await page.overflowX() <= 0, `${hash} surt pels costats`);
  }
}, { width: 360, height: 780 }));
