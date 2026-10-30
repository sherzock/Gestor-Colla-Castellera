// Editor de plantilles (encaix, desfer, cordons) i com els cordons d'un castell manen sobre la plantilla.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer, sessions } from './helpers.js';
import { buildStructure, configFromName, overlaps, setTemplates, structureOf, templateRings } from '../public/castell.js';
import { createHistory, layerToTemplate, maxRing, nextRing, snapBox } from '../public/editor.js';

const box = (x, y, rot = 0, extra = {}) => ({ x, y, rot, w: 78, h: 30, ...extra });
const pinyaOf = (name, cordons) => layerToTemplate(buildStructure({ ...configFromName(name), cordons }, { ignoreTemplate: true }).layers.find((l) => l.id === 'pinya'));

test('encaix: a tocar d\'una altra caixa, deixant el mateix aire que la pinya generada', () => {
  const other = box(200, 100);
  // Al costat (eix llarg): 78 + 2 de separació, i en línia amb el centre de l'altra.
  const fit = snapBox(box(0, 0), [other], 124, 104);
  assert.deepEqual([fit.x, fit.y], [120, 100]);
  assert.ok(fit.snapped);
  assert.equal(fit.guides.length, 1, 'només la línia de centres es dibuixa');
  assert.ok(!overlaps({ ...box(fit.x, fit.y) }, other), 'encaixades no compten com a solapades');
});

test('encaix: en línia amb el centre del dibuix, i res si queda lluny', () => {
  const fit = snapBox(box(0, 0), [], 3, 300);
  assert.deepEqual([fit.x, fit.y], [0, 300]);
  assert.equal(fit.guides.length, 1);
  const free = snapBox(box(0, 0), [box(400, 400)], 100, 200);
  assert.equal(free.snapped, false);
});

test('encaix: funciona als eixos de la caixa si està girada, i ignora les que tenen un altre angle', () => {
  const a = Math.PI / 4;
  const other = box(100, 100, a);
  const near = { x: 100 + Math.cos(a) * 83, y: 100 + Math.sin(a) * 83 };
  const fit = snapBox(box(0, 0, a), [other], near.x, near.y);
  assert.ok(Math.abs(Math.hypot(fit.x - 100, fit.y - 100) - 80) < 0.2, 'a 78 + 2 de l\'altra, seguint la línia');
  const crooked = snapBox(box(0, 0, 0.3), [box(100, 100, 0.9)], 105, 103);
  assert.ok(!crooked.guides.length || Math.hypot(crooked.x, crooked.y) < 20 || crooked.x !== 100, 'no s\'alinea amb l\'altra');
  // Girada 90°: la llargada de l'altra compta a l'altre eix.
  const turned = snapBox(box(0, 0), [box(100, 0, Math.PI / 2)], 45, 0);
  assert.equal(turned.x, 100 - 39 - 15 - 2);
});

test('desfer: torna enrere i endavant, agrupa els canvis seguits del mateix tipus i té un límit', () => {
  let clock = 0;
  const h = createHistory({ data: '0', layer: 'pinya' }, { limit: 3, mergeMs: 800, now: () => clock });
  assert.equal(h.canUndo, false);
  h.record({ data: '1', layer: 'pinya' });
  h.record({ data: '1', layer: 'pinya' });
  assert.equal(h.undo().data, '0');
  assert.equal(h.canUndo, false);
  assert.equal(h.redo().data, '1');
  // Escriure un nom: tot d'un sol cop, si no es para gaire.
  h.record({ data: '1a', layer: 'pinya' }, 'name');
  clock += 100;
  h.record({ data: '1ab', layer: 'pinya' }, 'name');
  clock += 2000;
  h.record({ data: '1abc', layer: 'pinya' }, 'name');
  assert.equal(h.undo().data, '1ab');
  assert.equal(h.undo().data, '1');
  // Un canvi nou esborra el que es podia refer.
  h.record({ data: '2', layer: 'pinya' });
  assert.equal(h.canRedo, false);
  for (const d of ['3', '4', '5', '6']) h.record({ data: d, layer: 'pinya' });
  let steps = 0;
  while (h.undo()) steps++;
  assert.equal(steps, 3, 'com a molt el límit');
});

test('un cordó més queda on el posaria la pinya estàndard, seguint cada línia', () => {
  for (const name of ['2d7', '3d7', '4d7', '3d7a', '4d8a']) {
    for (const rings of [1, 2, 3, 4]) {
      const list = pinyaOf(name, rings);
      let n = 0;
      const extra = nextRing(list, () => `xn${++n}`);
      assert.ok(extra.every((i) => i.ring === rings + 1 && i.key.startsWith('xn')));
      assert.equal(new Set(extra.map((i) => i.key)).size, extra.length);
      const std = pinyaOf(name, rings + 1).filter((i) => i.ring === rings + 1);
      assert.equal(extra.length, std.length, `${name}: tantes caixes com l'estàndard`);
      for (const e of extra) assert.ok(Math.min(...std.map((c) => Math.hypot(c.x - e.x, c.y - e.y))) < 1, `${name}: ${e.role}`);
      assert.ok(!extra.some((e) => [...list, ...extra].some((o) => o !== e && overlaps(e, o))), name);
      assert.equal(maxRing([...list, ...extra]), rings + 1);
    }
  }
  // Els noms automàtics pugen de número; els propis es queden.
  const list = pinyaOf('3d7', 1);
  const custom = list.find((i) => i.kind === 'mans');
  custom.role = 'Mans del Pere';
  assert.ok(nextRing(list, () => 'k').some((i) => i.role === 'Mans del Pere'));
  assert.ok(nextRing(list, () => 'k').some((i) => i.role === 'Lateral 2'));
  assert.ok(nextRing(list, () => 'k').some((i) => i.role === 'Segon vent'));
});

test('les pinyes estàndard no surten marcades com a solapades', () => {
  for (const name of ['2d7', '3d7', '4d7', '5d7', '3d7a', '4d8a', '3d9f']) {
    const list = pinyaOf(name, 4);
    const bad = [];
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) if (overlaps(list[a], list[b])) bad.push(`${list[a].key ?? list[a].base}/${list[b].key ?? list[b].base}`);
    assert.deepEqual(bad, [], name);
  }
});

test('els cordons del castell manen: la plantilla en dibuixa fins a un màxim', () => {
  const layers = { pinya: pinyaOf('3d7', 5) };
  assert.equal(templateRings({ layers }), 5);
  assert.equal(templateRings(null), 0);
  setTemplates([{ name: '3d7', layers }]);
  try {
    const rings = (cordons) => maxRing(structureOf({ ...configFromName('3d7'), cordons }).layers.find((l) => l.id === 'pinya').items);
    assert.equal(rings(2), 2);
    assert.equal(rings(5), 5);
    assert.equal(rings(8), 5, 'si en demana més dels que hi ha, surten tots');
    assert.equal(rings(0), 0);
    const items = structureOf({ ...configFromName('3d7'), cordons: 0 }).layers.find((l) => l.id === 'pinya').items;
    assert.ok(items.some((i) => i.kind === 'contrafort'), 'el que no és de cap cordó sempre hi és');
  } finally { setTemplates([]); }
});

let server, s;
before(async () => { server = await startServer(); s = await sessions(server); });
after(() => server.stop());

test('al servidor: el mateix dibuix serveix per a castells amb cordons diferents', async () => {
  const A = s.admin;
  assert.equal((await A('PUT', '/templates/3d6', { layers: { pinya: pinyaOf('3d6', 5) } })).s, 200);
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const ev = (await A('POST', '/events', { type: 'assaig', title: 'Cordons', date })).d.id;
  const post = async (cordons) => (await A('POST', `/events/${ev}/castells`, { width: 3, height: 6, cordons })).d;
  const [small, big] = [await post(2), await post(5)];
  assert.equal(small.cordons, 2, 'no es toca el que ha demanat');
  assert.equal(big.cordons, 5);
  assert.equal((await A('DELETE', '/templates/3d6')).s, 200);
});

async function copyOf(srv, admin) {
  const r = await fetch(`${srv.url}/api/backup`, { headers: { cookie: Object.entries(admin.jar).map(([k, v]) => `${k}=${v}`).join('; ') } });
  assert.equal(r.status, 200);
  const file = join(mkdtempSync(join(tmpdir(), 'colla-migr-')), 'copia.db');
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return file;
}

test('en actualitzar, els castells amb plantilla passen als cordons que dibuixa: no se\'ls amaga res', async () => {
  const A = s.admin;
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const ev = (await A('POST', '/events', { type: 'assaig', title: 'Migració', date })).d.id;
  const withTpl = (await A('POST', `/events/${ev}/castells`, { width: 3, height: 8, cordons: 2 })).d.id;
  const noTpl = (await A('POST', `/events/${ev}/castells`, { width: 4, height: 8, cordons: 2 })).d.id;
  assert.equal((await A('PUT', '/templates/3d8', { layers: { pinya: pinyaOf('3d8', 4) } })).s, 200);

  const file = await copyOf(server, A);
  const raw = new DatabaseSync(file);
  raw.prepare("DELETE FROM settings WHERE key = 'cordons_plantilla'").run();
  raw.close();

  const next = await startServer({}, { from: file });
  try {
    const n = await sessions(next);
    const cordons = async (id) => (await n.admin('GET', `/castells/${id}`)).d.castell.cordons;
    assert.equal(await cordons(withTpl), 4);
    assert.equal(await cordons(noTpl), 2);
    // Només una vegada: si després se'n demanen menys, en tornar a arrencar es respecta.
    assert.equal((await n.admin('PUT', `/castells/${withTpl}`, { cordons: 3 })).s, 200);
    const third = await startServer({}, { from: await copyOf(next, n.admin) });
    try {
      const t = await sessions(third);
      assert.equal((await t.admin('GET', `/castells/${withTpl}`)).d.castell.cordons, 3);
    } finally { await third.stop(); }
  } finally { await next.stop(); }
  assert.equal((await A('DELETE', '/templates/3d8')).s, 200);
});
