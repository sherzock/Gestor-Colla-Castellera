// Muntador automàtic: al tronc, pisos anivellats d'espatlles, ningú que pesi més que qui el porta, i relleus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStructure, levelGaps, weightInversions, SHOULDER_GAP_CM } from '../public/castell.js';
import { proposeLineup } from '../public/muntador.js';

// Gent de proves sense historial: adults d'espatlles i pesos variats (no sempre lligats) i canalla per al pom.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const year = new Date().getFullYear();
const adults = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1, name: `Persona ${i + 1}`, status: 'si', birthdate: `${year - 30}-01-01`,
  shoulder_height_cm: 125 + Math.round(rand() * 40), weight_kg: 50 + Math.round(rand() * 45),
}));
const kids = Array.from({ length: 6 }, (_, i) => ({
  id: 100 + i, name: `Canalla ${i + 1}`, status: 'si', birthdate: `${year - 8 - i}-01-01`, shoulder_height_cm: 90 + i * 4, weight_kg: 22 + i * 3,
}));
const candidates = [...adults, ...kids];
const byId = new Map(candidates.map((p) => [p.id, p]));
const run = (castell, opts = {}, current = new Map()) => {
  const s = buildStructure(castell);
  const r = proposeLineup({ structure: s, candidates, current, exact: new Map(), options: { tronc: true, pinya: false, musica: false, ...opts } });
  const at = (k) => r.map.get(k)?.person ?? (current.get(k) && byId.get(current.get(k).person_id));
  return { s, r, at };
};

for (const castell of [{ width: 3, height: 7 }, { width: 4, height: 8 }, { width: 2, height: 7 }, { width: 3, height: 8, agulla: 1 }]) {
  test(`tronc del ${castell.width}d${castell.height}${castell.agulla ? 'a' : ''}: cada pis anivellat i ningú pesa més que qui el porta`, () => {
    const { s, at } = run(castell);
    assert.deepEqual(levelGaps(s, at).filter((g) => g.gap > SHOULDER_GAP_CM), []);
    assert.deepEqual(weightInversions(s, at), []);
  });
}

test('qui ja hi és compta: el pis es fa a la seva alçada', () => {
  const fixed = adults.find((p) => p.shoulder_height_cm >= 158);
  const current = new Map([['t3-0', { pos_key: 't3-0', person_id: fixed.id, ...fixed }]]);
  const { s, r, at } = run({ width: 3, height: 7 }, { keep: true }, current);
  assert.ok(!r.map.has('t3-0'), 'no es toca');
  assert.ok(![...r.map.values()].some((v) => v?.person.id === fixed.id), 'no es fa servir enlloc més');
  const gap = levelGaps(s, at).find((g) => g.level === 3);
  assert.ok(gap.gap <= SHOULDER_GAP_CM, `${gap.gap} cm`);
});

test('relleus: un per posició del tronc, gent que no surt a l\'alineació i cadascú un sol cop', () => {
  const { r } = run({ width: 3, height: 7 }, { reliefs: true });
  const core = [...r.map.keys()].filter((k) => /^(t\d|dos|acot|enx)/.test(k) && r.map.get(k));
  const ids = [...r.reliefs.values()].map((v) => v.person.id);
  assert.ok(r.reliefs.size >= core.length - 3, `${r.reliefs.size} de ${core.length}`); // pot faltar canalla per al pom
  assert.equal(new Set(ids).size, ids.length);
  const inLineup = new Set([...r.map.values()].filter(Boolean).map((v) => v.person.id));
  assert.ok(ids.every((id) => !inLineup.has(id)));
  assert.ok([...r.reliefs.keys()].every((k) => core.includes(k)));
  assert.equal(run({ width: 3, height: 7 }).r.reliefs.size, 0, 'només si es demana');
});
