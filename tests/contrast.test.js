// Accessibilitat: el text ha de tenir prou contrast (WCAG AA, 4,5:1) amb el fons, en el tema clar i en el fosc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.join(import.meta.dirname, '../public/style.css'), 'utf8');
const tokens = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(([, k, v]) => [k, v]));
const light = tokens(css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {'))));
const darkStart = css.indexOf(':root[data-theme="dark"] {');
const dark = { ...light, ...tokens(css.slice(darkStart, css.indexOf('}', darkStart))) };

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [text, fons]: el que de debò surt junt a l'app.
const PAIRS = [
  ...['ink', 'ink-2', 'ink-3', 'accent', 'ok', 'warn', 'bad'].flatMap((fg) => ['bg', 'surface', 'surface-2'].map((bg) => [fg, bg])),
  ['accent-ink', 'accent'], ['accent', 'accent-soft'], ['ok', 'ok-soft'], ['warn', 'warn-soft'], ['bad', 'bad-soft'],
];

for (const [name, theme] of [['clar', light], ['fosc', dark]]) {
  test(`contrast del text, tema ${name}`, () => {
    const bad = PAIRS.map(([fg, bg]) => [fg, bg, contrast(theme[fg], theme[bg])]).filter(([, , c]) => c < 4.5);
    assert.deepEqual(bad.map(([fg, bg, c]) => `${fg} sobre ${bg}: ${c.toFixed(2)}`), []);
  });
}

test('els elements que es poden fer servir amb el teclat es veuen quan tenen el focus', () => {
  // Si es treu el contorn, cal posar-n'hi un altre (com a .event-card:has(...)).
  for (const m of css.matchAll(/([^{}]+):focus-visible\s*\{[^}]*outline:\s*none/g)) {
    const sel = m[1].trim();
    assert.match(css, new RegExp(`:has\\(${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:focus-visible\\)\\s*\\{[^}]*outline:\\s*2px`), sel);
  }
  assert.doesNotMatch(css, /(^|[,{]\s*)(\*|button|a|input|select|textarea)\s*(:focus)?\s*\{[^}]*outline:\s*(none|0)/m, 'no es pot treure el contorn a tot arreu');
});
