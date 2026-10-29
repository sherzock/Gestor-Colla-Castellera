// Pinyes de la colla: editor de plantilles.
import { TEMPLATE_KINDS, buildStructure, configFromName, setTemplates } from '../castell.js';
import { MAX_BOXES, createEditor, layerToTemplate } from '../editor.js';
import { $app, api, attempt, config, esc, icon, isAdmin, qs, qsa, render, t, tn, toast } from './core.js';

// ---------- Pinyes de la colla (plantilles) ----------
// Cada colla fa la pinya a la seva manera: aquí es redibuixa la de cada tipus de castell i val per a tots els castells
// d'aquell nom. Les posicions que es mantenen conserven l'historial; les que es treuen deixen de sortir però no s'esborren.
const KIND_NAMES = { contrafort: 'Contrafort', agulla: 'Agulla', crossa: 'Crossa', mans: 'Mans', vent: 'Vent', lateral: 'Lateral', altre: 'Una altra' };

export async function pageTemplates() {
  if (!isAdmin()) { location.hash = '#/'; return; }
  const [list, types] = await Promise.all([api('GET', '/templates'), api('GET', '/templates/types')]);
  setTemplates(list);
  const saved = new Map(list.map((x) => [x.name, x]));
  const rows = [...types];
  for (const x of list) if (!rows.some((r) => r.name === x.name)) rows.push({ name: x.name, castells: 0 });
  $app.innerHTML = `
    <a class="back" href="#/comptes">${icon.back}${t('Comptes')}</a>
    <div class="page-head"><h1>${t('Pinyes de la colla')}</h1></div>
    <p class="muted" style="margin-top:0">${t("Tria un castell per redibuixar-ne la pinya a la manera de la colla. Els canvis valen per a tots els castells d'aquest tipus, també els que ja s'han fet.")}</p>
    <div class="card">
      <ul class="tpl-list">${rows.map((r) => `<li><a href="#/plantilla/${r.name}"><strong>${esc(r.name)}</strong>
        <span class="small muted">${tn(r.castells, '{n} castell', '{n} castells')}</span>
        ${saved.has(r.name) ? `<span class="tpl-tag">${t('Plantilla de la colla')}</span>` : `<span class="small muted">${t('Estàndard')}</span>`}</a></li>`).join('')
        || `<li class="muted small">${t('Encara no hi ha cap castell amb pinya.')}</li>`}</ul>
      <form id="tpl-new" class="tpl-new">
        <label class="field">${t('Un altre castell')}<input name="name" placeholder="3d8, 4d9f, pd5…" maxlength="12" autocomplete="off" required></label>
        <button class="btn">${t('Obre')}</button>
      </form>
    </div>`;
  qs('#tpl-new').onsubmit = (e) => {
    e.preventDefault();
    const name = e.target.elements.name.value.trim().toLowerCase();
    const c = configFromName(name);
    if (!c) { toast(t('Castell no vàlid'), true); return; }
    if (c.net || !buildStructure(c, { ignoreTemplate: true }).layers.length) { toast(t('Aquest castell no té pinya'), true); return; }
    location.hash = `#/plantilla/${name}`;
  };
}

export async function pageTemplate(name) {
  if (!isAdmin()) { location.hash = '#/'; return; }
  const config = configFromName(name);
  if (!config || config.net) throw new Error(t('Castell no vàlid'));
  const [list, { usage, castells, cordons }] = await Promise.all([api('GET', '/templates'), api('GET', `/templates/${name}/usage`)]);
  setTemplates(list);
  const saved = list.find((x) => x.name === name);
  const standardStructure = (cordons) => buildStructure({ ...config, cordons }, { ignoreTemplate: true });
  const standard = (cordons) => Object.fromEntries(standardStructure(cordons).layers.map((l) => [l.id, layerToTemplate(l)]));
  const ref = standardStructure(cordons);
  if (!ref.layers.length) throw new Error(t('Aquest castell no té pinya'));
  const labels = Object.fromEntries(ref.layers.map((l) => [l.id, l.label]));
  // Les capes que la plantilla no té (p. ex. s'hi ha afegit el folre després) surten com l'estàndard.
  const layers = { ...standard(cordons), ...(saved ? structuredClone(saved.layers) : {}) };
  for (const id of Object.keys(layers)) if (!labels[id]) delete layers[id];
  const level = { pinya: 1, folre: 2, manilles: 3, puntals: 4 };
  const baseLabel = (base, layerId) => (base === 'c' ? t('Pilar central') : ref.positions.get(`t${level[layerId]}-${base}`)?.role || t('Baix'));
  let dirty = false;

  $app.innerHTML = `
    <a class="back" href="#/plantilles" id="tpl-back">${icon.back}${t('Pinyes de la colla')}</a>
    <div class="page-head">
      <div><h1>${t('Pinya del {castell}', { castell: esc(name) })}</h1>
        <div class="muted small">${saved ? t('Plantilla de la colla') : t("Estàndard de l'app")} · ${tn(castells, '{n} castell d\'aquest tipus', '{n} castells d\'aquest tipus')}</div></div>
      <div class="actions">
        <button class="btn primary" id="tpl-save" disabled>${t('Desa')}</button>
        ${saved ? `<button class="btn danger" id="tpl-delete">${t('Esborra la plantilla')}</button>` : ''}
      </div>
    </div>
    <div class="card tpl-card">
      <div class="card-head">
        ${Object.keys(layers).length > 1 ? `<div class="tabs" id="tpl-layers">${Object.keys(layers).map((id, i) => `<button data-v="${id}" class="${i ? '' : 'on'}">${esc(labels[id])}</button>`).join('')}</div>` : `<h2>${esc(labels.pinya)}</h2>`}
        <span class="muted small" id="tpl-count"></span>
      </div>
      <div class="tpl-toolbar">
        <span class="small muted">${t('Afegeix')}</span>
        ${TEMPLATE_KINDS.map((k) => `<button class="btn sm" data-add="${k}">${icon.plus}${t(KIND_NAMES[k])}</button>`).join('')}
      </div>
      <div class="tpl-canvas" id="tpl-canvas"></div>
      <div class="tpl-zoombar"><button class="btn sm" id="tpl-zoom-out" aria-label="${t('Redueix')}">−</button><button class="btn sm" id="tpl-zoom-in" aria-label="${t('Amplia')}">+</button></div>
      <div class="tpl-panel" id="tpl-panel"></div>
      <div class="tpl-reset">
        <label class="small muted">${t('Cordons')} <input id="tpl-cordons" type="number" min="0" max="12" value="${cordons}"></label>
        <button class="btn sm" id="tpl-standard">${t("Torna a l'estàndard")}</button>
      </div>
    </div>
    <p class="small muted">${t("Arrossega les caixes per moure-les. Toca'n una per canviar-ne el nom, el tipus o girar-la. Les posicions que es treuen deixen de sortir als castells, però les alineacions guardades no s'esborren: si es tornen a posar, tornen a sortir.")}</p>`;

  const panel = qs('#tpl-panel');
  const markDirty = () => {
    dirty = true;
    qs('#tpl-save').disabled = false;
    count();
  };
  const count = () => {
    const n = layers[editor.layer].filter((i) => i.base === undefined).length;
    qs('#tpl-count').textContent = tn(n, '{n} posició', '{n} posicions');
  };
  const showPanel = (item) => {
    if (!item) { panel.innerHTML = `<span class="small muted">${t('Toca una caixa per editar-la.')}</span>`; return; }
    const rotate = `<div class="tpl-rot"><button class="btn sm" data-rot="-15">↺ 15°</button><button class="btn sm" data-rot="15">↻ 15°</button><button class="btn sm" data-rot="90">↻ 90°</button></div>`;
    if (item.base !== undefined) {
      panel.innerHTML = `<div class="tpl-fields"><strong>${esc(baseLabel(item.base, editor.layer))}</strong><span class="small muted">${t('És del tronc: es pot moure però no treure.')}</span></div>${rotate}`;
    } else {
      const used = usage[item.key] || 0;
      panel.innerHTML = `<div class="tpl-fields">
          <label class="field">${t('Nom')}<input id="tpl-role" maxlength="30" value="${esc(item.role)}"></label>
          <label class="field">${t('Tipus')}<select id="tpl-kind">${TEMPLATE_KINDS.map((k) => `<option value="${k}" ${k === item.kind ? 'selected' : ''}>${t(KIND_NAMES[k])}</option>`).join('')}</select></label>
          ${['mans', 'vent', 'lateral'].includes(item.kind) ? `<label class="field">${t('Cordó')}<input id="tpl-ring" type="number" min="1" max="8" value="${item.ring || 1}"></label>` : ''}
        </div>
        ${rotate}
        <div class="tpl-rot"><button class="btn sm" id="tpl-dup">${t('Duplica')}</button><button class="btn sm danger" id="tpl-del">${t('Treu')}</button></div>
        ${used ? `<p class="small muted" style="margin:0">${tn(used, "Surt {n} cop a l'historial.", "Surt {n} cops a l'historial.")}</p>` : ''}`;
      qs('#tpl-role').oninput = (e) => { if (e.target.value.trim()) editor.update({ role: e.target.value.trim() }); };
      qs('#tpl-kind').onchange = (e) => { editor.update({ kind: e.target.value }); showPanel(editor.selected); };
      const ring = qs('#tpl-ring');
      if (ring) ring.onchange = (e) => { editor.update({ ring: Math.max(1, Math.min(12, Number(e.target.value) || 1)) }); showPanel(editor.selected); };
      qs('#tpl-dup').onclick = () => { if (editor.duplicate() === false) toast(t('Com a molt {n} caixes per capa', { n: MAX_BOXES }), true); };
      qs('#tpl-del').onclick = () => {
        if (used && !confirm(t("Aquesta posició surt {n} cops a l'historial. Si la treus, deixarà de sortir als castells i a les estadístiques (no s'esborra res: si la tornes a posar, torna). Continuar?", { n: used }))) return;
        editor.remove();
      };
    }
    qsa('[data-rot]', panel).forEach((b) => (b.onclick = () => editor.rotate(Number(b.dataset.rot))));
  };
  const editor = createEditor(qs('#tpl-canvas'), {
    layers, usage, t, baseLabel,
    onChange: markDirty, onSelect: showPanel,
  });
  showPanel(null);
  count();

  qsa('#tpl-layers button').forEach((b) => (b.onclick = () => {
    qsa('#tpl-layers button').forEach((x) => x.classList.toggle('on', x === b));
    editor.setLayer(b.dataset.v);
    count();
  }));
  qsa('[data-add]').forEach((b) => (b.onclick = () => { if (editor.add(b.dataset.add) === false) toast(t('Com a molt {n} caixes per capa', { n: MAX_BOXES }), true); }));
  qs('#tpl-zoom-in').onclick = () => editor.zoomBy(1.4);
  qs('#tpl-zoom-out').onclick = () => editor.zoomBy(1 / 1.4);
  qs('#tpl-standard').onclick = () => {
    if (!confirm(t("Tornar a la pinya estàndard? Es perdran els canvis que no hagis desat (la plantilla desada no canvia fins que desis).") )) return;
    const n = Math.max(0, Math.min(12, Number(qs('#tpl-cordons').value) || 0));
    editor.replace(standard(n));
  };
  // Fletxes del teclat: mouen la caixa seleccionada (Maj: més de pressa).
  const onKey = (e) => {
    if (!editor.selected || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const d = e.shiftKey ? 10 : 2;
    const move = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (move) { e.preventDefault(); editor.nudge(...move); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selected.base === undefined) { e.preventDefault(); qs('#tpl-del')?.click(); }
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => document.removeEventListener('keydown', onKey), { once: true });
  window.onbeforeunload = () => (dirty ? true : undefined);
  window.addEventListener('hashchange', () => { window.onbeforeunload = null; }, { once: true });
  qs('#tpl-back').onclick = (e) => { if (dirty && !confirm(t('Hi ha canvis sense desar. Sortir igualment?'))) e.preventDefault(); };

  qs('#tpl-save').onclick = async () => {
    const result = await attempt(() => api('PUT', `/templates/${name}`, { layers }));
    if (!result) return;
    dirty = false;
    setTemplates(await api('GET', '/templates'));
    toast(t('Pinya desada'));
    render({ keepScroll: true });
  };
  const del = qs('#tpl-delete');
  if (del) del.onclick = async () => {
    if (!confirm(t("Esborrar la plantilla del {castell}? Els castells d'aquest tipus tornaran a tenir la pinya estàndard.", { castell: name }))) return;
    if (!(await attempt(() => api('DELETE', `/templates/${name}`)))) return;
    dirty = false;
    setTemplates(await api('GET', '/templates'));
    toast(t('Plantilla esborrada'));
    render();
  };
}
