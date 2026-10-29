// Robustesa: totes les rutes reben de tot (adreces, consultes i cossos mal fets o d'un tipus que no toca) i mai peten
// (cap error 500, el servidor segueix bé); les traduccions tenen els mateixos buits que el text original; l'estructura
// de qualsevol castell és coherent; i el muntador respecta sempre les normes (un cop cadascú, canalla on toca, músics
// al seu instrument, qui ja hi és no es mou).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, client, sessions, routes } from './helpers.js';
import { DICTS } from '../public/i18n.js';
import { buildStructure, castellName, configFromName, levelNames, WIDTHS } from '../public/castell.js';
import { proposeLineup } from '../public/muntador.js';

const ROOT = path.join(import.meta.dirname, '..');
const SERVER_SRC = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

let server, s;
before(async () => { server = await startServer(); s = await sessions(server); });
after(() => server.stop());

// Totes les rutes (menys les que tancarien la sessió de la prova) amb qui hi pot entrar.
const targets = () => routes().filter((r) => !['/api/logout', '/api/mode'].includes(r.path))
  .flatMap((r) => (r.auth === 'admin' ? [[r, s.admin]] : r.auth === 'user' ? [[r, s.admin], [r, s.member]] : [[r, client(`${server.url}/api`)]]));
const call = (who, method, url, body) => who(method, url.replace(/^\/api/, ''), body);
const broken = async (list) => list.filter((r) => r.s >= 500).map((r) => `${r.what} → ${r.s} ${r.text.slice(0, 80)}`);

test('adreces amb valors estranys (lletres, negatius, enormes, caràcters de control, SQL…) → mai un error intern', async () => {
  const BAD = ['abc', '-1', '0', '1.5', '1e3', '99999999999999999999999', '%00', '%27%20OR%201%3D1--', 'null', '__proto__', 'constructor', '%F0%9F%8F%B0', 'x'.repeat(300)];
  const out = [];
  for (const [r, who] of targets()) {
    if (!r.path.includes(':')) continue;
    for (const bad of BAD) {
      const url = r.path.replace(/:\w+/g, bad);
      const res = await call(who, r.method, url, r.method === 'GET' ? undefined : {});
      out.push({ ...res, what: `${r.method} ${url}` });
    }
  }
  assert.ok(out.length > 300, `${out.length} peticions`);
  assert.deepEqual(await broken(out), []);
});

test('consultes (?season=…, ?scope=…) amb valors estranys → mai un error intern', async () => {
  const keys = [...new Set([...SERVER_SRC.matchAll(/query\.get\('(\w+)'\)/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 3, keys.join());
  const out = [];
  for (const bad of ['', 'abc', '-1', '0', '99999999999999', '2024-13-45', '%00', '<b>', '1,2,3', 'all']) {
    const qs = keys.map((k) => `${k}=${bad}`).join('&');
    for (const [r, who] of targets().filter(([x]) => x.method === 'GET')) {
      const url = `${r.sample}?${qs}`;
      out.push({ ...(await call(who, 'GET', url)), what: `GET ${url}` });
    }
  }
  assert.deepEqual(await broken(out), []);
});

test('cossos amb cada camp d\'un tipus que no toca (null, llistes, objectes, textos llarguíssims, nombres enormes…) → mai un error intern', async () => {
  // Tots els camps que el servidor llegeix del cos d'alguna petició.
  const keys = [...new Set([...SERVER_SRC.matchAll(/body\.(\w+)/g), ...SERVER_SRC.matchAll(/'(\w+)' in body/g)].map((m) => m[1]))];
  assert.ok(keys.length > 40, `${keys.length} camps`);
  const VALUES = [null, [], {}, true, -1, 1e308, 'x'.repeat(5000), '<b>"\'', [1, 'a', null], { a: { b: { c: [] } } }];
  const out = [];
  for (const value of VALUES) {
    const body = Object.fromEntries(keys.map((k) => [k, value]));
    for (const [r, who] of targets().filter(([x]) => x.method !== 'GET')) {
      out.push({ ...(await call(who, r.method, r.sample, body)), what: `${r.method} ${r.sample} amb ${JSON.stringify(value).slice(0, 20)}` });
    }
  }
  // I un sol camp estrany cada cop, perquè els altres no facin fallar abans la petició.
  for (const [r, who] of targets().filter(([x]) => x.method !== 'GET')) {
    for (const k of keys) {
      for (const value of [null, [], { x: 1 }, -1]) {
        out.push({ ...(await call(who, r.method, r.sample, { [k]: value })), what: `${r.method} ${r.sample} amb ${k}=${JSON.stringify(value)}` });
      }
    }
  }
  assert.deepEqual(await broken(out), []);
});

test('després de tot això el servidor segueix bé i el registre no té cap error', async () => {
  assert.equal((await client(`${server.url}/api`)('GET', '/config')).s, 200);
  assert.equal((await s.admin('GET', '/events')).s, 200);
  assert.equal((await s.member('GET', '/me')).s, 200);
  // Tants intents d'entrar amb dades dolentes han activat el límit (com ha de ser).
  assert.equal((await client(`${server.url}/api`)('POST', '/login', { username: 'admin', password: 'admin1234' })).s, 429);
  assert.doesNotMatch(server.log(), /Error|\n\s+at /);
});

// ---------- Traduccions ----------
test('traduccions: cap de buida i amb els mateixos buits ({n}, {title}…) que el text original', () => {
  const holes = (str) => [...String(str).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const bad = [];
  for (const [lang, dict] of Object.entries(DICTS)) {
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== 'string' || !value.trim()) bad.push(`${lang}: «${key}» buida`);
      else if (holes(key).join() !== holes(value).join()) bad.push(`${lang}: «${key}» → «${value}»`);
    }
  }
  assert.deepEqual(bad, []);
  assert.deepEqual(Object.keys(DICTS.es).sort(), Object.keys(DICTS.en).sort(), 'el castellà i l\'anglès tenen els mateixos textos');
});

// ---------- Estructura dels castells ----------
// Totes les configuracions amb nom vàlid: amples, alçades, folre, manilles, puntals, agulla, net i per sota.
function* configs() {
  for (const { value: width } of WIDTHS) {
    for (let height = 3; height <= 12; height++) {
      for (const [folre, manilles, puntals] of [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]]) {
        for (const agulla of [0, 1]) for (const net of [0, 1]) for (const sota of [0, 1]) {
          const c = { width, height, folre, manilles, puntals, agulla, net, sota, cordons: 3 };
          if (configFromName(castellName(c))) yield c;
        }
      }
    }
  }
}

test('castells: cada posició té una clau única i vàlida, i el nom i la configuració es corresponen', () => {
  const bad = [];
  let n = 0;
  for (const c of configs()) {
    n++;
    const name = castellName(c);
    const back = configFromName(name);
    if (castellName(back) !== name) bad.push(`${name}: el nom no torna`);
    const st = buildStructure({ ...c, gralles: 2, timbals: 1 }, { ignoreTemplate: true });
    const listed = [...st.levels.flatMap((l) => l.cells), ...st.agulla, ...st.musica, ...st.layers.flatMap((l) => l.items.filter((i) => !i.shared))];
    const keys = listed.map((p) => p.key);
    if (new Set(keys).size !== keys.length) bad.push(`${name}: claus repetides`);
    if (keys.length !== st.positions.size) bad.push(`${name}: ${keys.length} posicions però ${st.positions.size} claus`);
    for (const k of keys) if (!/^[a-z][a-z0-9-]{0,23}$/.test(k)) bad.push(`${name}: clau «${k}»`);
    // Les caixes de la pinya que són del tronc apunten a una posició que existeix (o estan marcades com a buides).
    for (const l of st.layers) for (const i of l.items.filter((x) => x.shared)) if (!st.positions.has(i.key) && !i.off) bad.push(`${name}: ${l.id} → ${i.key}`);
    // Un pis per cada nivell, de baix a dalt, i amb el mateix nom que a la llista per triar proves parcials.
    if (st.levels.length !== c.height) bad.push(`${name}: ${st.levels.length} pisos`);
    if (levelNames(c).map((l) => l.level).join() !== st.levels.map((l) => l.level).join()) bad.push(`${name}: pisos diferents`);
    if (c.net && st.layers.length) bad.push(`${name}: net amb pinya`);
  }
  assert.ok(n > 100, `${n} castells`);
  assert.deepEqual(bad, []);
});

test('proves parcials: només hi ha els pisos que es fan', () => {
  for (const c of [{ width: 3, height: 8, folre: 1 }, { width: 4, height: 7 }, { width: 1, height: 5 }, { width: 3, height: 7, agulla: 1 }]) {
    for (let from = 1; from <= c.height; from++) {
      for (let to = from; to <= c.height; to++) {
        const st = buildStructure({ ...c, from_level: from, to_level: to }, { ignoreTemplate: true });
        const levels = st.levels.map((l) => l.level);
        assert.deepEqual(levels, Array.from({ length: to - from + 1 }, (_, i) => from + i), `${castellName(c)} ${from}-${to}`);
        for (const p of st.positions.values()) if (p.level && !p.of) assert.ok(p.level >= from && p.level <= to, `${p.key} ${from}-${to}`);
      }
    }
  }
});

// ---------- Muntador ----------
const year = new Date().getFullYear();
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const person = (id, extra = {}) => ({ id, name: `P${id}`, status: 'si', birthdate: `${year - 30}-01-01`,
  shoulder_height_cm: 125 + Math.round(rand() * 40), weight_kg: 50 + Math.round(rand() * 45), ...extra });
const crowd = [
  ...Array.from({ length: 120 }, (_, i) => person(i + 1)),
  ...Array.from({ length: 8 }, (_, i) => person(200 + i, { birthdate: `${year - 7 - i}-01-01`, shoulder_height_cm: 90 + i * 3, weight_kg: 20 + i * 3 })),
  ...Array.from({ length: 4 }, (_, i) => person(300 + i, { instrument: i < 3 ? 'gralla' : 'timbal' })),
  ...Array.from({ length: 10 }, (_, i) => person(400 + i, { status: i % 2 ? 'no' : null })),
];
const KID_GROUPS = ['pom', 'musica', 'agulla'];
const isKid = (p) => year - Number(p.birthdate.slice(0, 4)) <= 13;

test('muntador: cadascú un sol cop, només qui ve, canalla només a dalt, i cada instrument al seu lloc', () => {
  for (const c of [{ width: 3, height: 7 }, { width: 4, height: 8, folre: 1 }, { width: 3, height: 9, folre: 1, manilles: 1 }, { width: 2, height: 6 },
    { width: 1, height: 5 }, { width: 3, height: 8, agulla: 1 }, { width: 5, height: 7 }, { width: 9, height: 5 }]) {
    const st = buildStructure({ ...c, gralles: 3, timbals: 1, cordons: 3 }, { ignoreTemplate: true });
    const r = proposeLineup({ structure: st, candidates: crowd, current: new Map(), exact: new Map(),
      options: { tronc: true, pinya: true, musica: true, reliefs: true } });
    const name = castellName(c);
    const used = [...r.map.values()].filter(Boolean).map((a) => a.person.id);
    assert.equal(new Set(used).size, used.length, `${name}: algú hi és dos cops`);
    for (const rel of r.reliefs.values()) assert.ok(!used.includes(rel.person.id), `${name}: un relleu ja és a l'alineació`);
    for (const [key, a] of r.map) {
      if (!a) continue;
      const pos = st.positions.get(key);
      assert.ok(pos, `${name}: ${key} no existeix`);
      assert.equal(a.person.status, 'si', `${name}: ${key} a qui no ve`);
      if (isKid(a.person)) assert.ok(KID_GROUPS.includes(pos.group), `${name}: canalla a ${key} (${pos.group})`);
      if (pos.group === 'musica') assert.equal(a.person.instrument, pos.kind, `${name}: ${key}`);
    }
  }
});

test('muntador: «mantenir el que hi ha» no mou ningú ni el torna a fer servir', () => {
  const st = buildStructure({ width: 3, height: 7, cordons: 3 }, { ignoreTemplate: true });
  const current = new Map([['t1-0', { person_id: 1, ...crowd[0] }], ['t2-1', { person_id: 2, ...crowd[1] }], ['enx', { person_id: 200, ...crowd[120] }]]);
  const r = proposeLineup({ structure: st, candidates: crowd, current, exact: new Map(), options: { tronc: true, pinya: true, keep: true } });
  for (const key of current.keys()) assert.ok(!r.map.get(key), `${key} no es toca`);
  const used = [...r.map.values()].filter(Boolean).map((a) => a.person.id);
  for (const { person_id } of current.values()) assert.ok(!used.includes(person_id), `${person_id} ja hi és`);
});

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
