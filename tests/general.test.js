// Comprovacions generals: les pantalles responen amb les dades de demostració, desar el que ja hi ha no falla, i
// tots els textos de l'app i del servidor estan traduïts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, sessions } from './helpers.js';
import { DICTS } from '../public/i18n.js';

let server, s;
before(async () => { server = await startServer(); s = await sessions(server); });
after(() => server.stop());

test('totes les rutes de lectura responen 200', async () => {
  const ev = s.pastEvent.id, c = s.pastCastell.id, pid = s.personId;
  const admin = ['/events', '/events?scope=past', `/events/${ev}`, `/castells/${c}`, `/castells/${c}/history`, `/castells/${c}/prep`,
    '/stats/tecnica', '/stats/people', '/stats/castells', '/stats/season?season=all', `/stats/people/${pid}`, '/people', `/people/${pid}/history`,
    '/templates', '/templates/types', '/templates/3d7/usage', `/events/${ev}/castell-sources?name=3d7`, '/announcements', '/admins', '/me'];
  const member = ['/events', `/events/${ev}`, `/castells/${c}`, '/stats/season?season=all', `/stats/people/${pid}`, `/people/${pid}/history`,
    '/announcements', '/templates', '/me'];
  const bad = [];
  for (const u of admin) { const r = await s.admin('GET', u); if (r.s !== 200) bad.push(`admin ${u} ${r.s}`); }
  for (const u of member) { const r = await s.member('GET', u); if (r.s !== 200) bad.push(`membre ${u} ${r.s}`); }
  assert.deepEqual(bad, []);
});

test('desar sense canvis el que ja hi ha (com fan els formularis) → 200', async () => {
  const cd = (await s.admin('GET', `/castells/${s.pastCastell.id}`)).d;
  assert.equal((await s.admin('PUT', `/castells/${s.pastCastell.id}`, cd.castell)).s, 200, 'castell');
  const future = (await s.admin('GET', '/events')).d[0];
  const e0 = (await s.admin('GET', `/events/${future.id}`)).d.event;
  assert.equal((await s.admin('PUT', `/events/${e0.id}`, e0)).s, 200, 'sessió');
  const fails = [];
  for (const p of (await s.admin('GET', '/people')).d.people) {
    const r = await s.admin('PUT', `/people/${p.id}`, p);
    if (r.s !== 200) fails.push(`${p.id}: ${r.d.error}`);
  }
  assert.deepEqual(fails, [], 'persones');
  const assignments = cd.positions.filter((p) => p.person_id).map((p) => ({ pos_key: p.pos_key, person_id: p.person_id }));
  assert.equal((await s.admin('PUT', `/castells/${s.pastCastell.id}/positions`, { assignments })).s, 200, 'alineació sencera');
});

test('tots els textos tenen traducció al castellà i a l\'anglès', () => {
  const ROOT = path.join(import.meta.dirname, '..');
  const keys = new Set();
  const unq = (str) => str.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
  const STR = String.raw`('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`;
  const ui = fs.readdirSync(path.join(ROOT, 'public/ui')).filter((f) => f.endsWith('.js')).map((f) => `public/ui/${f}`);
  for (const f of ['public/app.js', ...ui, 'public/editor.js', 'public/castell.js', 'public/export.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(new RegExp(String.raw`\bt\(\s*${STR}`, 'g'))) keys.add(unq(m[1]));
    for (const m of src.matchAll(new RegExp(String.raw`\btn\(\s*[^,]+,\s*${STR}\s*,\s*${STR}`, 'g'))) { keys.add(unq(m[1])); keys.add(unq(m[2])); }
  }
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  for (const m of server.matchAll(new RegExp(String.raw`(?:fail|new HttpError)\(\s*\d+\s*,\s*${STR}`, 'g'))) keys.add(unq(m[1]));
  for (const m of server.matchAll(new RegExp(String.raw`atMost\([^,]+,\s*${STR}`, 'g'))) keys.add(unq(m[1]));
  const missing = [...keys].filter((k) => !(k in DICTS.es) || !(k in DICTS.en));
  assert.ok(keys.size > 300, `${keys.size} textos`);
  assert.deepEqual(missing, []);
});

test('cada pantalla importa les funcions dels altres fitxers que crida', () => {
  const ROOT = path.join(import.meta.dirname, '..', 'public');
  const all = ['', 'ui/'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js') && f !== 'sw.js').map((f) => d + f));
  const DECL = /^(?:export )?(?:async function|function|const|let|class) ([A-Za-z_$][\w$]*)/gm;
  const owner = new Map();
  for (const f of all) for (const [, n] of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(DECL)) if (!owner.has(n)) owner.set(n, f);
  const missing = [];
  for (const f of all.filter((x) => x.startsWith('ui/') || x === 'app.js')) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const known = new Set([...src.matchAll(/import \{([^}]*)\}/g)].flatMap((m) => m[1].split(',').map((x) => x.trim())));
    for (const [, n] of src.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) known.add(n);
    // Crides (també darrere de «...»), sense comptar comentaris ni el text de les cadenes entre cometes.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
    for (const [, n] of code.matchAll(/(?:^|[^\w$.]|\.\.\.)([A-Za-z_$][\w$]*)\(/g)) {
      if (owner.has(n) && owner.get(n) !== f && !known.has(n)) missing.push(`${f}: ${n}`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('app instal·lable: manifest amb el nom de la colla, icones i tots els fitxers per obrir-la sense connexió', async () => {
  const ROOT = path.join(import.meta.dirname, '..');
  const m = await fetch(`${server.url}/manifest.webmanifest`);
  assert.match(m.headers.get('content-type'), /manifest\+json/);
  const manifest = await m.json();
  assert.equal(manifest.name, (await s.admin('GET', '/config')).d.collaName);
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.equal((await fetch(server.url + icon.src)).headers.get('content-type'), 'image/png', icon.src);
  assert.match(fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'), /rel="manifest" href="\/manifest.webmanifest"/);
  // Cada fitxer de l'app és a la llista del service worker, i cada fitxer de la llista existeix de debò.
  const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
  const files = JSON.parse(sw.match(/const FILES = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const js = ['', 'ui/'].flatMap((d) => fs.readdirSync(path.join(ROOT, 'public', d)).filter((f) => /\.(js|css)$/.test(f) && f !== 'sw.js').map((f) => `/${d}${f}`));
  assert.deepEqual(js.filter((f) => !files.includes(f)), []);
  for (const f of files.filter((x) => x !== '/' && x !== '/manifest.webmanifest')) {
    assert.ok(fs.existsSync(path.join(ROOT, 'public', f)), f);
  }
  assert.equal((await fetch(`${server.url}/sw.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
});

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
