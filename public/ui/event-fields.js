// Preguntes d'una sessió i acompanyants: els camps del formulari, com es llegeixen i com es mostren.
import { esc, qs, t } from './core.js';
import { priceHint } from './pay.js';

export function fieldInput(f, value, prefix = 'x') {
  const name = `${prefix}${f.id}`;
  const req = f.required ? ' *' : '';
  if (f.kind === 'bool') return `<label class="check"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}> ${esc(f.label)}${req}${priceHint.bool(f)}</label>`;
  if (f.kind === 'select') {
    return `<label class="field">${esc(f.label)}${req}<select name="${name}"><option value="">—</option>${f.options.map((o, i) => `<option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(o)}${priceHint.option(f, i)}</option>`).join('')}</select></label>`;
  }
  const type = f.kind === 'number' ? 'number" min="0" max="100000" step="1" inputmode="numeric' : 'text" maxlength="300';
  return `<label class="field"><span>${esc(f.label)}${req}${f.kind === 'number' ? priceHint.number(f) : ''}</span><input type="${type}" name="${name}" value="${esc(value)}"></label>`;
}
export function readExtra(form, fields, prefix = 'x') {
  const out = {};
  for (const f of fields) {
    const el = form.elements[`${prefix}${f.id}`];
    out[f.id] = f.kind === 'bool' ? el.checked : el.value;
  }
  return out;
}
// Acompanyants: quants i el nom de cadascun (a la pinya s'han de poder reconèixer). El màxim és el del servidor.
export const MAX_COMPANIONS = 6;
export function companionsInput(list = []) {
  return `<div class="companions" data-companions>
    <label class="field">${t('Acompanyants')}<input type="number" name="companions_n" min="0" max="${MAX_COMPANIONS}" step="1" inputmode="numeric" value="${list.length}"></label>
    <div class="comp-names">${list.map((name, i) => companionName(name, i)).join('')}</div>
    <p class="small muted" style="margin:0">${t('Posa el nom de cadascun: la tècnica els podrà col·locar als castells.')}</p>
  </div>`;
}
export const companionName = (name, i) => `<input name="comp${i}" maxlength="60" required value="${esc(name)}" placeholder="${t('Nom de l\'acompanyant {n}', { n: i + 1 })}" aria-label="${t('Nom de l\'acompanyant {n}', { n: i + 1 })}">`;
export function bindCompanions(root) {
  const box = qs('[data-companions]', root);
  if (!box) return;
  const n = box.querySelector('[name=companions_n]');
  n.oninput = () => {
    const want = Math.max(0, Math.min(MAX_COMPANIONS, Math.floor(Number(n.value) || 0)));
    const names = qs('.comp-names', box);
    const now = [...names.children];
    for (let i = now.length; i < want; i++) names.insertAdjacentHTML('beforeend', companionName('', i));
    now.slice(want).forEach((el) => el.remove());
  };
}
export const readCompanions = (form) => [...form.querySelectorAll('.comp-names input')].map((el) => el.value.trim());
// Els noms automàtics d'abans («Acompanyant de …») no es mostren a la casella: cal posar-hi el nom de debò.
export const ownCompanionNames = (list) => list.filter((g) => !g.dropped).map((g) => (/^Acompanyant d(e |')/.test(g.name) ? '' : g.name));

export function extraValue(f, v) {
  if (v === null || v === undefined || v === '') return '';
  if (f.kind === 'bool') return v ? t('Sí') : t('No');
  return esc(v);
}

// Excel de la sessió: una pestanya amb l'assistència (les mateixes columnes que el CSV) i una per castell, amb qui hi
// ha a cada posició i la imatge del castell (tronc, pom de dalt i pinya).
