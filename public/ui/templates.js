// Pinyes de la colla: editor de plantilles.
import { TEMPLATE_KINDS, buildStructure, configFromName, setTemplates } from '../castell.js';
import { MAX_BOXES, RING_KINDS, createEditor, layerToTemplate, maxRing } from '../editor.js';
import { $app, api, attempt, can, config, esc, icon, qs, qsa, render, store, t, tn, toast } from './core.js';

// ---------- Pinyes de la colla (plantilles) ----------
// Cada colla fa la pinya a la seva manera: aquí es redibuixa la de cada tipus de castell i val per a tots els castells
// d'aquell nom. Les posicions que es mantenen conserven l'historial; les que es treuen deixen de sortir però no s'esborren.
const KIND_NAMES = { contrafort: 'Contrafort', agulla: 'Agulla', crossa: 'Crossa', mans: 'Mans', vent: 'Vent', lateral: 'Lateral', tap: 'Tap', tapatap: 'Tapa-tap', altre: 'Una altra' };
const MAX_RINGS = 8;
// L'editor escolta el teclat a tot el document: si la pàgina es torna a pintar, l'anterior ha de deixar d'escoltar.
let stopKeys = null;

export async function pageTemplates() {
  if (!can('castells')) { location.hash = '#/'; return; }
  const [list, types] = await Promise.all([api('GET', '/templates'), api('GET', '/templates/types')]);
  setTemplates(list);
  const saved = new Map(list.map((x) => [x.name, x]));
  const rows = [...types];
  for (const x of list) if (!rows.some((r) => r.name === x.name)) rows.push({ name: x.name, castells: 0 });
  $app.innerHTML = `
    <a class="back" href="#/comptes">${icon.back}${can('admin') ? t('Comptes') : t('El meu compte')}</a>
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
  if (!can('castells')) { location.hash = '#/'; return; }
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
  stopKeys?.();
  // Hi ha canvis per desar si el dibuix no és el que hi ha desat: si es desfà tot, ja no n'hi ha.
  let savedJson = JSON.stringify(layers);
  let dirty = false;

  $app.innerHTML = `
    <a class="back" href="#/plantilles" id="tpl-back">${icon.back}${t('Pinyes de la colla')}</a>
    <div class="page-head">
      <div><h1>${t('Pinya del {castell}', { castell: esc(name) })}</h1>
        <div class="muted small"><span id="tpl-origin">${saved ? t('Plantilla de la colla') : t("Estàndard de l'app")}</span> · ${tn(castells, '{n} castell d\'aquest tipus', '{n} castells d\'aquest tipus')}</div></div>
      <div class="actions">
        <button class="btn primary" id="tpl-save" disabled>${t('Desa')}</button>
        <button class="btn danger ${saved ? '' : 'hidden'}" id="tpl-delete">${t('Esborra la plantilla')}</button>
      </div>
    </div>
    <div class="card tpl-card">
      <div class="card-head">
        ${Object.keys(layers).length > 1 ? `<div class="tabs" id="tpl-layers">${Object.keys(layers).map((id, i) => `<button data-v="${id}" class="${i ? '' : 'on'}">${esc(labels[id])}</button>`).join('')}</div>` : `<h2>${esc(labels.pinya)}</h2>`}
        <span class="muted small" id="tpl-count"></span>
      </div>
      <div class="tpl-toolbar">
        <button class="btn sm" id="tpl-undo" disabled aria-label="${t('Desfés')}" title="${t('Desfés')} (Ctrl+Z)">↶</button>
        <button class="btn sm" id="tpl-redo" disabled aria-label="${t('Refés')}" title="${t('Refés')} (Ctrl+Y)">↷</button>
        <button class="btn sm tpl-toggle" id="tpl-snap" aria-pressed="false" title="${t("Les caixes s'enganxen a les altres i al centre. Mantén Alt per moure'n una lliurement.")}">${t('Encaix')}</button>
        <button class="btn sm tpl-toggle" id="tpl-multi" aria-pressed="false" title="${t('Cada caixa que toquis se suma a la selecció. Amb el ratolí també pots fer servir Maj+clic o arrossegar pel fons.')}">${t('Tria diverses')}</button>
      </div>
      <div class="tpl-toolbar">
        <span class="small muted">${t('Afegeix')}</span>
        ${TEMPLATE_KINDS.map((k) => `<button class="btn sm" data-add="${k}">${icon.plus}${t(KIND_NAMES[k])}</button>`).join('')}
      </div>
      <div class="tpl-canvas" id="tpl-canvas"></div>
      <div class="tpl-zoombar"><button class="btn sm" id="tpl-zoom-out" aria-label="${t('Redueix')}">−</button><button class="btn sm" id="tpl-zoom-in" aria-label="${t('Amplia')}">+</button></div>
      <div class="tpl-panel" id="tpl-panel"></div>
      <div class="tpl-reset">
        <div class="tpl-rings" id="tpl-rings">
          <span class="small muted" id="tpl-rings-n"></span>
          <button class="btn sm" id="tpl-ring-add">${t('Afegeix un cordó')}</button>
          <button class="btn sm" id="tpl-ring-del">${t("Treu l'últim")}</button>
        </div>
        <button class="btn sm" id="tpl-standard">${t("Torna a l'estàndard")}</button>
      </div>
    </div>
    <p class="small muted">${t("Arrossega les caixes per moure-les. Toca'n una per canviar-ne el nom, el tipus o girar-la. Les posicions que es treuen deixen de sortir als castells, però les alineacions guardades no s'esborren: si es tornen a posar, tornen a sortir.")}</p>
    <p class="small muted tpl-keys">${t('La plantilla dibuixa els cordons que vulguis, i cada castell ensenya els que té al seu formulari.')}</p>
    <p class="small muted tpl-keys">${t('Amb teclat: Ctrl+Z desfà, Ctrl+Y refà, Ctrl+A ho tria tot, Ctrl+D duplica, R gira 15°, les fletxes mouen (amb Maj, més de pressa), Supr treu i Esc deixa de triar.')}</p>`;

  const panel = qs('#tpl-panel');
  const refresh = () => {
    dirty = JSON.stringify(layers) !== savedJson;
    qs('#tpl-save').disabled = !dirty;
    qs('#tpl-undo').disabled = !editor.canUndo;
    qs('#tpl-redo').disabled = !editor.canRedo;
    const n = layers[editor.layer].filter((i) => i.base === undefined).length;
    const clash = editor.clashCount;
    qs('#tpl-count').innerHTML = `${tn(n, '{n} posició', '{n} posicions')}${clash ? ` · <span class="tpl-clash">${tn(clash, '{n} caixa solapada', '{n} caixes solapades')}</span>` : ''}`;
    const rings = maxRing(layers.pinya || []);
    qs('#tpl-rings').classList.toggle('hidden', editor.layer !== 'pinya');
    qs('#tpl-rings-n').textContent = t('Cordons: {n}', { n: rings });
    qs('#tpl-ring-add').disabled = rings >= MAX_RINGS;
    qs('#tpl-ring-del').disabled = !rings;
  };
  const full = () => toast(t('Com a molt {n} caixes per capa', { n: MAX_BOXES }), true);
  // El que surt a l'historial no es perd, però deixa de comptar: millor que ho sàpiguen abans de treure-ho.
  const confirmRemove = (list) => {
    const used = list.reduce((sum, i) => sum + (usage[i.key] || 0), 0);
    if (!used) return true;
    return confirm(list.length > 1
      ? t("Aquestes posicions surten {n} cops a l'historial. Si les treus, deixaran de sortir als castells i a les estadístiques (no s'esborra res: si les tornes a posar, tornen). Continuar?", { n: used })
      : t("Aquesta posició surt {n} cops a l'historial. Si la treus, deixarà de sortir als castells i a les estadístiques (no s'esborra res: si la tornes a posar, torna). Continuar?", { n: used }));
  };
  const showPanel = (item, n = item ? 1 : 0) => {
    if (!n) { panel.innerHTML = `<span class="small muted">${t('Toca una caixa per editar-la.')}</span>`; return; }
    const rotate = `<div class="tpl-rot"><button class="btn sm" data-rot="-15">↺ 15°</button><button class="btn sm" data-rot="15">↻ 15°</button><button class="btn sm" data-rot="90">↻ 90°</button></div>`;
    const actions = `<div class="tpl-rot"><button class="btn sm" id="tpl-dup">${t('Duplica')}</button><button class="btn sm" id="tpl-mirror" title="${t("Fa una còpia a l'altra banda de l'eix vertical.")}">${t('Mirall')}</button><button class="btn sm danger" id="tpl-del">${t('Treu')}</button></div>`;
    if (n > 1) {
      panel.innerHTML = `<div class="tpl-fields"><strong>${t('{n} caixes triades', { n })}</strong></div>${rotate}${actions}`;
    } else if (item.base !== undefined) {
      panel.innerHTML = `<div class="tpl-fields"><strong>${esc(baseLabel(item.base, editor.layer))}</strong><span class="small muted">${t('És del tronc: es pot moure però no treure.')}</span></div>${rotate}`;
    } else {
      const used = usage[item.key] || 0;
      panel.innerHTML = `<div class="tpl-fields">
          <label class="field">${t('Nom')}<input id="tpl-role" maxlength="30" value="${esc(item.role)}"></label>
          <label class="field">${t('Tipus')}<select id="tpl-kind">${TEMPLATE_KINDS.map((k) => `<option value="${k}" ${k === item.kind ? 'selected' : ''}>${t(KIND_NAMES[k])}</option>`).join('')}</select></label>
          ${RING_KINDS.includes(item.kind) ? `<label class="field">${t('Cordó')}<input id="tpl-ring" type="number" min="1" max="${MAX_RINGS}" value="${item.ring || 1}"></label>` : ''}
        </div>
        ${rotate}
        ${actions}
        ${item.ring ? `<div class="tpl-rot"><button class="btn sm" id="tpl-pick-ring">${t('Tria tot el cordó')}</button></div>` : ''}
        ${used ? `<p class="small muted" style="margin:0">${tn(used, "Surt {n} cop a l'historial.", "Surt {n} cops a l'historial.")}</p>` : ''}`;
      qs('#tpl-role').oninput = (e) => { if (e.target.value.trim()) editor.update({ role: e.target.value.trim() }); };
      qs('#tpl-kind').onchange = (e) => { editor.update({ kind: e.target.value }); showPanel(editor.selected); };
      const ring = qs('#tpl-ring');
      if (ring) ring.onchange = (e) => { editor.update({ ring: Math.max(1, Math.min(MAX_RINGS, Number(e.target.value) || 1)) }); showPanel(editor.selected); };
      const pick = qs('#tpl-pick-ring');
      if (pick) pick.onclick = () => editor.selectRing(item.ring);
    }
    const dup = qs('#tpl-dup');
    if (dup) {
      dup.onclick = () => { if (editor.duplicate() === false) full(); };
      qs('#tpl-mirror').onclick = () => { if (editor.mirror() === false) full(); };
      qs('#tpl-del').onclick = () => { if (confirmRemove(editor.selection)) editor.remove(); };
    }
    qsa('[data-rot]', panel).forEach((b) => (b.onclick = () => editor.rotate(Number(b.dataset.rot))));
  };
  const showLayer = (id) => qsa('#tpl-layers button').forEach((x) => x.classList.toggle('on', x.dataset.v === id));
  let snapOn = store.get('tplSnap', '1') !== '0';
  const editor = createEditor(qs('#tpl-canvas'), {
    layers, usage, t, baseLabel, snapOn,
    onChange: refresh, onSelect: showPanel, onLayer: showLayer,
  });
  showPanel(null);
  refresh();

  const toggle = (button, on) => { button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on)); };
  toggle(qs('#tpl-snap'), snapOn);
  qs('#tpl-snap').onclick = (e) => {
    snapOn = !snapOn;
    editor.snapping = snapOn;
    store.set('tplSnap', snapOn ? '1' : '0');
    toggle(e.currentTarget, snapOn);
  };
  qs('#tpl-multi').onclick = (e) => { editor.multi = !editor.multi; toggle(e.currentTarget, editor.multi); };
  qs('#tpl-undo').onclick = () => editor.undo();
  qs('#tpl-redo').onclick = () => editor.redo();
  qsa('#tpl-layers button').forEach((b) => (b.onclick = () => {
    showLayer(b.dataset.v);
    editor.setLayer(b.dataset.v);
    refresh();
  }));
  qsa('[data-add]').forEach((b) => (b.onclick = () => { if (editor.add(b.dataset.add) === false) full(); }));
  qs('#tpl-zoom-in').onclick = () => editor.zoomBy(1.4);
  qs('#tpl-zoom-out').onclick = () => editor.zoomBy(1 / 1.4);
  qs('#tpl-ring-add').onclick = () => {
    // Si encara no n'hi ha cap, el primer és el de la pinya estàndard.
    if (editor.addRing(() => standard(1).pinya.filter((i) => i.ring === 1)) === false) full();
  };
  qs('#tpl-ring-del').onclick = () => {
    const last = editor.rings;
    if (confirmRemove(layers.pinya.filter((i) => i.ring === last))) editor.removeRing();
  };
  // Es pot desfer, o sigui que no cal demanar confirmació. Es queda amb els cordons que hi ha dibuixats.
  qs('#tpl-standard').onclick = () => editor.replace(standard(maxRing(layers.pinya || []) || cordons));
  const onKey = (e) => {
    // Dins d'un camp, Ctrl+Z i les fletxes són les del camp.
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      const action = { z: e.shiftKey ? editor.redo : editor.undo, y: editor.redo, a: editor.selectAll, d: () => qs('#tpl-dup')?.click() }[k];
      if (action) { e.preventDefault(); action(); }
      return;
    }
    if (k === 'escape') { editor.clearSelection(); return; }
    if (!editor.selection.length) return;
    // Fletxes del teclat: mouen les caixes seleccionades (Maj: més de pressa).
    const d = e.shiftKey ? 10 : 2;
    const move = { arrowleft: [-d, 0], arrowright: [d, 0], arrowup: [0, -d], arrowdown: [0, d] }[k];
    if (move) { e.preventDefault(); editor.nudge(...move); }
    if (k === 'r') editor.rotate(e.shiftKey ? -15 : 15);
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); qs('#tpl-del')?.click(); }
  };
  document.addEventListener('keydown', onKey);
  stopKeys = () => { document.removeEventListener('keydown', onKey); stopKeys = null; };
  window.addEventListener('hashchange', () => stopKeys?.(), { once: true });
  window.onbeforeunload = () => (dirty ? true : undefined);
  window.addEventListener('hashchange', () => { window.onbeforeunload = null; }, { once: true });
  qs('#tpl-back').onclick = (e) => { if (dirty && !confirm(t('Hi ha canvis sense desar. Sortir igualment?'))) e.preventDefault(); };

  // Desar no torna a pintar la pàgina: així es pot continuar desfent després de desar.
  qs('#tpl-save').onclick = async () => {
    const result = await attempt(() => api('PUT', `/templates/${name}`, { layers }));
    if (!result) return;
    savedJson = JSON.stringify(layers);
    qs('#tpl-origin').textContent = t('Plantilla de la colla');
    qs('#tpl-delete').classList.remove('hidden');
    refresh();
    setTemplates(await api('GET', '/templates'));
    toast(t('Pinya desada'));
  };
  qs('#tpl-delete').onclick = async () => {
    if (!confirm(t("Esborrar la plantilla del {castell}? Els castells d'aquest tipus tornaran a tenir la pinya estàndard.", { castell: name }))) return;
    if (!(await attempt(() => api('DELETE', `/templates/${name}`)))) return;
    dirty = false;
    setTemplates(await api('GET', '/templates'));
    toast(t('Plantilla esborrada'));
    render();
  };
}
