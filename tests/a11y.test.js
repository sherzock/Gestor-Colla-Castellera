// Accessibilitat que es pot comprovar sense navegador: cada camp té nom, les imatges tenen text alternatiu,
// les icones no es llegeixen i la pàgina té un enllaç per saltar el menú.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '../public');
const files = ['ui', '.'].flatMap((d) => fs.readdirSync(path.join(dir, d)).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, d, f)));
const code = Object.fromEntries(files.map((f) => [path.relative(dir, f), fs.readFileSync(f, 'utf8')]));

test('els camps de text sense etiqueta visible tenen aria-label', () => {
  const bad = [];
  for (const [file, src] of Object.entries(code)) {
    for (const m of src.matchAll(/<(input|textarea)\b[^>]*placeholder=[^>]*>/g)) {
      const before = src.slice(Math.max(0, m.index - 300), m.index);
      const inLabel = before.lastIndexOf('<label') > before.lastIndexOf('</label>');
      if (!inLabel && !/aria-label/.test(m[0])) bad.push(`${file}: ${m[0].slice(0, 70)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('les imatges tenen text alternatiu', () => {
  const bad = Object.entries(code).flatMap(([file, src]) => [...src.matchAll(/<img\b[^>]*>/g)].filter((m) => !/\balt=/.test(m[0])).map((m) => `${file}: ${m[0].slice(0, 70)}`));
  assert.deepEqual(bad, []);
});

test('les icones no les llegeix el lector de pantalla', () => {
  const core = code['ui/core.js'];
  for (const m of core.slice(core.indexOf('const svg ='), core.indexOf('// ---------- Modal')).matchAll(/<svg\b[^>]*>/g)) assert.match(m[0], /aria-hidden="true"/);
});

test('la pàgina té idioma, enllaç per saltar el menú i finestres amb títol', () => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /<html lang="ca">/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<main id="app"[^>]*tabindex="-1"/);
  assert.match(code['ui/core.js'], /aria-labelledby/);
  assert.match(code['ui/core.js'], /setAttribute\('inert'/);
});
