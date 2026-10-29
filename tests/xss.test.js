// XSS: cada text que escriu algú (noms, malnoms, títols, comentaris, camps extra, persones temporals, acompanyants,
// missatges de l'Altaveu, notes…) porta codi HTML, i es pinten totes les pantalles de l'app (com a administració i com
// a membre) amb un navegador de mentida. Cap tros d'aquest codi pot arribar a la pàgina sense escapar.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sessions } from './helpers.js';
import { install, written, select, remember } from './fakedom.js';

// Tanca cometes dobles i simples i obre una etiqueta: si arriba tal qual, dins o fora d'un atribut, es veu «<img src=x data-xss».
const X = `"'><img src=x data-xss>`;
const LEAK = /<img src=x data-xss/;
let server, s, who = 'admin', ui, ids = {};
const jar = () => Object.entries((who === 'admin' ? s.admin : s.member).jar).map(([k, v]) => `${k}=${v}`).join('; ');

before(async () => {
  server = await startServer();
  s = await sessions(server);
  install({ base: server.url, cookies: jar });
  const A = s.admin;
  const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  ids.person = (await A('POST', '/people', { name: `Xènia ${X}`, alias: `X${X}`.slice(0, 30), notes: X })).d.id;
  ids.event = (await A('POST', '/events', { type: 'diada', title: `Diada ${X}`, date, location: X, description: X, ask_companions: true })).d.id;
  const text = (await A('POST', `/events/${ids.event}/fields`, { label: `Text ${X}`, kind: 'text' })).d.at(-1);
  const sel = (await A('POST', `/events/${ids.event}/fields`, { label: `Llista ${X}`, kind: 'select', options: [`a${X}`, 'b'] })).d.at(-1);
  ids.castell = (await A('POST', `/events/${ids.event}/castells`, { width: 3, height: 7, label: X, notes: X })).d.id;
  await A('PUT', `/castells/${ids.castell}`, { tech_notes: X });
  const guest = (await A('POST', `/events/${ids.event}/guests`, { name: `Convidat ${X}`, colla: X })).d;
  await A('PUT', `/castells/${ids.castell}/positions/t1-0`, { person_id: ids.person });
  await A('PUT', `/castells/${ids.castell}/positions/t2-0`, { guest_id: guest.id });
  await A('PUT', `/castells/${ids.castell}/positions/t2-1`, { person_id: s.personId });
  await A('PUT', `/events/${ids.event}/attendance/${ids.person}`, { status: 'si', comment: X, extra: { [text.id]: X } });
  const m = await s.member('PUT', `/events/${ids.event}/attendance`, { status: 'si', comment: X, companions: [`Amic ${X}`],
    extra: { [text.id]: X, [sel.id]: `a${X}` } });
  assert.equal(m.s, 200, JSON.stringify(m.d));
  // També al passat, perquè surti a l'historial i a les estadístiques.
  await A('PUT', `/castells/${s.pastCastell.id}/positions/t1-1`, { person_id: ids.person });
  await A('PUT', `/castells/${s.pastCastell.id}`, { tech_notes: X, result: 'intent', fail_level: 3, fail_cause: 'obert' });
  await A('POST', '/announcements', { title: X, body: `Mira http://example.com/${X} i ${X}`, notify: false });
  await A('PUT', '/me', { name: `Junta ${X}`.slice(0, 60) });
  // Una plantilla de pinya pròpia amb un nom de posició amb codi (els castells 3d7 la faran servir).
  const tpl = await A('PUT', '/templates/3d7', { layers: { pinya: [{ key: 'pxss', role: X, kind: 'altre', x: 0, y: 240, w: 60, h: 30, rot: 0 }] } });
  assert.equal(tpl.s, 200, JSON.stringify(tpl.d));
  ui = async (file, tag = '') => import(`../public/ui/${file}.js${tag}`);
});
after(() => server.stop());

// Pinta una pantalla i torna tot l'HTML que ha escrit (també el de les finestres que s'obren prement botons).
async function paint(fn, buttons = []) {
  written.length = 0;
  await fn();
  for (const b of buttons) {
    const el = select(b);
    await (el.onclick || el.onsubmit)?.({ preventDefault() {}, target: el });
  }
  await new Promise((r) => setTimeout(r, 60));
  return written.join('\n');
}

async function as(role) {
  who = role;
  const core = await ui('core');
  core.setRenderer(() => {});
  core.setConfig(await core.api('GET', '/config'));
  core.setMe(await core.api('GET', '/me'));
  return core;
}

test('administració: cap text de la gent arriba a la pàgina sense escapar', async () => {
  await as('admin');
  const [sessionsUi, event, people, news, calendar, templates, accounts, shell] = await Promise.all(
    ['sessions', 'event', 'people', 'news', 'calendar', 'templates', 'accounts', 'shell'].map((f) => ui(f)));
  const pages = {
    nav: () => paint(() => shell.renderNav(), ['me-chip']),
    inici: () => paint(() => sessionsUi.pageHome(), ['#new-event']),
    sessio: () => paint(() => event.pageEvent(ids.event), ['#edit-event', '#add-guest']),
    'sessió passada': () => paint(() => event.pageEvent(s.pastEvent.id)),
    persones: () => paint(() => people.pagePeople(), ['#new-person', '#import-people']),
    altaveu: () => paint(() => news.pageNews(), ['#new-news']),
    calendari: () => paint(() => calendar.pageCalendar(), ['#cal-subscribe']),
    plantilles: () => paint(() => templates.pageTemplates()),
    plantilla: () => paint(() => templates.pageTemplate('3d7')),
    comptes: () => paint(() => accounts.pageAccounts(), ['#new-admin']),
  };
  for (const view of ['tronc', 'pinya', 'llista', 'mides', 'historial']) {
    remember('castellView', view);
    const viewer = await ui('viewer', `?${view}`);
    pages[`castell (${view})`] = () => paint(() => viewer.pageCastell(ids.castell), ['#edit-castell', '#auto-build', '#new-guest']);
    pages[`castell passat (${view})`] = () => paint(() => viewer.pageCastell(s.pastCastell.id));
  }
  for (const tab of ['temporada', 'tecnica', 'castells', 'persones']) {
    remember('statsTab', tab);
    const stats = await ui('stats', `?${tab}`);
    pages[`estadístiques (${tab})`] = () => paint(() => stats.pageStats());
    pages['estadístiques d\'una persona'] = () => paint(() => stats.pagePersonStats(ids.person));
  }
  const leaks = [], empty = [];
  for (const [name, run] of Object.entries(pages)) {
    const html = await run();
    if (LEAK.test(html)) leaks.push(`${name}: …${html.slice(Math.max(0, html.search(LEAK) - 120), html.search(LEAK) + 30)}…`);
    if (html.length < 200) empty.push(name);
  }
  assert.deepEqual(empty, [], 'pantalles que no s\'han arribat a pintar');
  assert.deepEqual(leaks, []);
});

test('membre: cap text de la gent arriba a la pàgina sense escapar', async () => {
  await as('member');
  const [sessionsUi, event, people, news, calendar, login, shell] = await Promise.all(
    ['sessions', 'event', 'people', 'news', 'calendar', 'login', 'shell'].map((f) => ui(f)));
  const pages = {
    nav: () => paint(() => shell.renderNav(), ['me-chip']),
    inici: () => paint(() => sessionsUi.pageHome()),
    sessio: () => paint(() => event.pageEvent(ids.event)),
    perfil: () => paint(() => people.pageProfile()),
    altaveu: () => paint(() => news.pageNews()),
    calendari: () => paint(() => calendar.pageCalendar()),
    'qui ets': () => paint(() => login.pageIdentify()),
  };
  for (const view of ['tronc', 'pinya', 'llista']) {
    remember('castellView', view);
    const viewer = await ui('viewer', `?m-${view}`);
    pages[`castell (${view})`] = () => paint(() => viewer.pageCastell(ids.castell));
  }
  for (const tab of ['temporada', 'meves']) {
    remember('statsTab', tab);
    const stats = await ui('stats', `?m-${tab}`);
    pages[`estadístiques (${tab})`] = () => paint(() => stats.pageStats());
  }
  const leaks = [], empty = [];
  for (const [name, run] of Object.entries(pages)) {
    const html = await run();
    if (LEAK.test(html)) leaks.push(`${name}: …${html.slice(Math.max(0, html.search(LEAK) - 120), html.search(LEAK) + 30)}…`);
    if (html.length < 200) empty.push(name);
  }
  assert.deepEqual(empty, [], 'pantalles que no s\'han arribat a pintar');
  assert.deepEqual(leaks, []);
});

test('els enllaços dels missatges només poden ser http o https', async () => {
  await as('member');
  const news = await ui('news');
  const html = await paint(() => news.pageNews());
  assert.ok(html.includes('href="http://example.com/'), 'els enllaços es fan');
  assert.ok(!/href="(?!https?:)/i.test(html.replace(/href="#\/[^"]*"/g, '')), 'cap enllaç javascript: ni data:');
});

test('el recordatori per WhatsApp és general: no diu el nom de ningú', async () => {
  await as('admin');
  const event = await ui('event');
  const html = await paint(() => event.pageEvent(ids.event));
  const href = html.match(/href="https:\/\/wa\.me\/\?text=([^"]+)"/);
  assert.ok(href, 'hi ha el botó de WhatsApp (falta gent per contestar)');
  const text = decodeURIComponent(href[1]);
  assert.match(text, new RegExp(`/#/sessio/${ids.event}`));
  const people = (await s.admin('GET', '/people')).d.people;
  const names = people.flatMap((p) => [p.name, p.alias, p.name.replace(/^(\S+)\s+(\S).*$/, '$1 $2.')]).filter((n) => n && n.length > 3);
  assert.deepEqual(names.filter((n) => text.includes(n)), []);
});

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
