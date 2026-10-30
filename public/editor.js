// Editor visual de plantilles de pinya: cada caixa es pot arrossegar, girar, reanomenar, duplicar o treure.
// Treballa sobre una còpia de les capes ({ pinya: [...], folre: [...] }) i avisa amb onChange a cada canvi.
import { BOX, LAYER_PREFIX, kindCat, overlaps } from './castell.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const MARGIN = 140;
const SNAP = 2;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const DEG = Math.PI / 180;
// Com a molt tantes caixes per capa (el servidor tampoc n'accepta més): una pinya de debò en té menys de cent.
export const MAX_BOXES = 200;

// Text de la caixa: el tipus i el cordó (com a la vista de pinya) o el nom si és una posició pròpia.
export const KIND_SHORT = { base: 'Baix', contrafort: 'Contrafort', agulla: 'Agulla', crossa: 'Crossa', mans: 'Mans', vent: 'Vent', lateral: 'Lateral', altre: '' };
export const boxShort = (item) => (item.kind === 'altre' ? item.role : `${KIND_SHORT[item.kind]}${item.ring ? ` ${item.ring}` : ''}`);
export const autoRole = (kind, ring) => kindCat('pinya', kind, ring, '');

// Passa una capa generada (castell.js) al format de plantilla.
export function layerToTemplate(layer) {
  return layer.items.map((i) => {
    const box = { x: i.x, y: i.y, w: i.w, h: i.h, rot: i.rot };
    if (i.shared) return { base: i.key.startsWith('ag') ? 'c' : Number(i.key.split('-')[1]), ...box };
    return { key: i.key, role: i.role, kind: i.kind, ...box, ...(i.ring ? { ring: i.ring } : {}) };
  });
}

// ---------- Encaix ----------
const GAP = 2;          // el mateix aire que deixa la pinya generada entre dues caixes
const SNAP_RANGE = 7;   // a quina distància (en unitats del dibuix) l'encaix «estira» la caixa
const norm90 = (rot) => { const d = ((rot / DEG) % 90 + 90) % 90; return Math.min(d, 90 - d); };

// On ha d'anar una caixa que s'arrossega fins a (x, y) perquè encaixi amb les altres. Es treballa en els eixos de la
// mateixa caixa (u: llargada, v: amplada), així també val per a les línies girades:
//  - amb les caixes igual de girades: a tocar pel costat o per dalt i baix, o en línia amb el seu centre;
//  - amb el centre del dibuix: en línia, per fer línies que surten del mig.
// Cada eix encaixa pel seu compte. Torna la posició i les guies per dibuixar: { x, y, guides: [{ x1, y1, x2, y2 }] }.
export function snapBox(item, others, x, y, range = SNAP_RANGE) {
  const u = { x: Math.cos(item.rot), y: Math.sin(item.rot) }, v = { x: -u.y, y: u.x };
  const local = (px, py) => ({ u: px * u.x + py * u.y, v: px * v.x + py * v.y });
  const at = local(x, y);
  const targets = { u: [{ to: 0, line: true }], v: [{ to: 0, line: true }] };
  for (const o of others) {
    if (norm90(o.rot - item.rot) > 0.5) continue;
    // Si l'altra està girada 90°, la seva llargada queda sobre l'altre eix.
    const swapped = Math.abs(Math.sin(o.rot - item.rot)) > 0.5;
    const ou = (swapped ? o.h : o.w) / 2, ov = (swapped ? o.w : o.h) / 2;
    const c = local(o.x, o.y);
    const su = item.w / 2 + ou + GAP, sv = item.h / 2 + ov + GAP;
    targets.u.push({ to: c.u, line: true });
    targets.v.push({ to: c.v, line: true });
    // A tocar només si realment queda al costat, no a l'altra punta del dibuix.
    if (Math.abs(at.v - c.v) < sv + range) targets.u.push({ to: c.u - su }, { to: c.u + su });
    if (Math.abs(at.u - c.u) < su + range) targets.v.push({ to: c.v - sv }, { to: c.v + sv });
  }
  const best = (axis, value) => {
    let found = null;
    for (const t of targets[axis]) {
      const d = Math.abs(t.to - value);
      if (d <= range && (!found || d < Math.abs(found.to - value))) found = t;
    }
    return found;
  };
  const bu = best('u', at.u), bv = best('v', at.v);
  const su = bu ? bu.to : at.u, sv = bv ? bv.to : at.v;
  const guides = [];
  const LONG = 3000;
  // Una guia per cada eix on s'ha encaixat en línia: passa pel centre de la caixa.
  if (bu?.line) guides.push({ x1: su * u.x + (sv - LONG) * v.x, y1: su * u.y + (sv - LONG) * v.y, x2: su * u.x + (sv + LONG) * v.x, y2: su * u.y + (sv + LONG) * v.y });
  if (bv?.line) guides.push({ x1: (su - LONG) * u.x + sv * v.x, y1: (su - LONG) * u.y + sv * v.y, x2: (su + LONG) * u.x + sv * v.x, y2: (su + LONG) * u.y + sv * v.y });
  const round = (n) => Math.round(n * 10) / 10;
  return { x: round(su * u.x + sv * v.x), y: round(su * u.y + sv * v.y), snapped: !!(bu || bv), guides };
}

// ---------- Cordons ----------
export const RING_KINDS = ['mans', 'vent', 'lateral'];
export const maxRing = (list) => Math.max(0, ...list.map((i) => i.ring || 0));
// Les caixes d'un cordó més, seguint cada línia: cada caixa de l'últim cordó es repeteix a la mateixa distància de
// l'anterior de la seva línia. Si encara no hi ha anterior, les mans segueixen el contrafort, i la resta se separen
// del centre del dibuix per l'eix de la caixa que hi queda més a prop.
export function nextRing(list, newKey) {
  const R = maxRing(list);
  const nearest = (a, candidates) => candidates.reduce((best, c) => (!best || Math.hypot(c.x - a.x, c.y - a.y) < Math.hypot(best.x - a.x, best.y - a.y) ? c : best), null);
  return list.filter((a) => a.ring === R).map((a) => {
    const before = list.filter((c) => c.kind === a.kind && c.ring === R - 1);
    const prev = nearest(a, before.length ? before : a.kind === 'mans' ? list.filter((c) => c.kind === 'contrafort') : []);
    let dx, dy;
    if (prev) { dx = a.x - prev.x; dy = a.y - prev.y; } else {
      const len = Math.hypot(a.x, a.y) || 1, ox = a.x / len, oy = a.y / len;
      const u = { x: Math.cos(a.rot), y: Math.sin(a.rot), size: a.w }, v = { x: -Math.sin(a.rot), y: Math.cos(a.rot), size: a.h };
      const axis = Math.abs(u.x * ox + u.y * oy) > Math.abs(v.x * ox + v.y * oy) ? u : v;
      const sign = axis.x * ox + axis.y * oy >= 0 ? 1 : -1;
      dx = sign * axis.x * (axis.size + GAP); dy = sign * axis.y * (axis.size + GAP);
    }
    // Si el nom era l'automàtic, puja de número; si és propi, es queda. Els laterals estàndard es diuen «Lateral 3».
    const role = a.role === `Lateral ${R}` ? `Lateral ${R + 1}` : a.role === autoRole(a.kind, R) ? autoRole(a.kind, R + 1) : a.role;
    return { ...a, key: newKey(), ring: R + 1, role, x: Math.round((a.x + dx) * 10) / 10, y: Math.round((a.y + dy) * 10) / 10 };
  });
}

// ---------- Desfer ----------
// Guarda estats sencers: una pinya són poques dades i així no cal saber desfer cada mena de canvi.
// «tag»: canvis seguits del mateix tipus (escriure un nom, moure amb les fletxes) es desfan d'un sol cop.
export function createHistory(initial, { limit = 100, mergeMs = 800, now = Date.now } = {}) {
  let current = initial, undone = [], done = [], lastTag = null, lastAt = 0;
  return {
    get current() { return current; },
    get canUndo() { return done.length > 0; },
    get canRedo() { return undone.length > 0; },
    patchCurrent(patch) { current = { ...current, ...patch }; },
    record(state, tag = null) {
      if (state.data === current.data) return false;
      const merge = tag && tag === lastTag && now() - lastAt < mergeMs;
      if (!merge) { done.push(current); if (done.length > limit) done.shift(); }
      current = state; undone = []; lastTag = tag; lastAt = now();
      return true;
    },
    undo() { if (!done.length) return null; undone.push(current); current = done.pop(); lastTag = null; return current; },
    redo() { if (!undone.length) return null; done.push(current); current = undone.pop(); lastTag = null; return current; },
  };
}

export function createEditor(root, { layers, baseLabel, usage, t, onChange, onSelect, onLayer, snapOn = true }) {
  let layerId = Object.keys(layers)[0];
  // Les caixes seleccionades (poden ser més d'una). «selection» en guarda els objectes, no les posicions a la llista.
  let selection = [];
  let view = null;
  let snapping = snapOn;
  let multi = false;
  const history = createHistory({ data: JSON.stringify(layers), layer: layerId });
  // Zoom: píxels de pantalla per unitat del dibuix respecte a «tot el dibuix cap a l'amplada». En un mòbil comença
  // ampliat perquè les caixes es puguin agafar amb el dit; tocant el fons es desplaça.
  let zoom = null;
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'plan editor-plan');
  root.replaceChildren(svg);

  const items = () => layers[layerId];
  const fitView = () => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const i of items()) {
      const r = Math.hypot(i.w, i.h) / 2;
      minX = Math.min(minX, i.x - r); maxX = Math.max(maxX, i.x + r);
      minY = Math.min(minY, i.y - r); maxY = Math.max(maxY, i.y + r);
    }
    if (!Number.isFinite(minX)) { minX = minY = -200; maxX = maxY = 200; }
    view = { x: minX - MARGIN, y: minY - MARGIN, w: maxX - minX + 2 * MARGIN, h: maxY - minY + 2 * MARGIN };
    svg.setAttribute('viewBox', `${view.x.toFixed(0)} ${view.y.toFixed(0)} ${view.w.toFixed(0)} ${view.h.toFixed(0)}`);
    applyZoom();
  };
  const applyZoom = () => {
    const cw = root.clientWidth || view.w;
    if (zoom === null) zoom = Math.min(4, Math.max(1, (0.8 * view.w) / cw));
    svg.style.width = `${Math.round(cw * zoom)}px`;
    svg.style.height = `${Math.round((cw * zoom * view.h) / view.w)}px`;
  };

  const textDeg = (rot) => {
    let deg = ((((rot * 180) / Math.PI) % 360) + 360) % 360;
    if (deg > 90 && deg <= 270) deg -= 180;
    return deg;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KIND_VAR = {
    base: 'var(--k-baix)', contrafort: 'var(--k-contrafort)', agulla: 'var(--k-agulla)', crossa: 'var(--k-crossa)',
    mans: 'var(--k-mans)', vent: 'var(--k-vent)', lateral: 'var(--k-lateral)', altre: 'var(--accent)',
  };
  const boxHtml = (item, idx) => {
    const base = item.base !== undefined;
    const kind = base ? 'base' : item.kind;
    const top = base ? baseLabel(item.base, layerId) : boxShort(item);
    const bottom = base || item.kind === 'altre' || item.role === top ? '' : item.role;
    const n = usage?.[item.key] || 0;
    return `<g class="box ed ${selection.includes(item) ? 'sel' : ''} ${base ? 'fixed' : ''} ${clashes.has(item) ? 'clash' : ''}" data-i="${idx}" style="--c:${KIND_VAR[kind] || 'var(--ink-3)'}"
      transform="translate(${item.x.toFixed(1)} ${item.y.toFixed(1)}) rotate(${((item.rot * 180) / Math.PI).toFixed(1)})">
      <title>${esc(base ? top : item.role)}${n ? ` · ${esc(t('{n} cops a l\'historial', { n }))}` : ''}</title>
      <rect x="${-item.w / 2}" y="${-item.h / 2}" width="${item.w}" height="${item.h}" rx="5"/>
      <g transform="rotate(${(textDeg(item.rot) - (item.rot * 180) / Math.PI).toFixed(1)})">
        <text class="${bottom ? 'r' : 'n'}" y="${bottom ? -4.5 : 4}" text-anchor="middle">${esc(top.length > 16 ? top.slice(0, 15) + '…' : top)}</text>
        ${bottom ? `<text class="n" y="9" text-anchor="middle">${esc(bottom.length > 14 ? bottom.slice(0, 13) + '…' : bottom)}</text>` : ''}
      </g>
    </g>`;
  };
  // Caixes que se solapen: es marquen perquè es vegi d'un cop d'ull (a una persona no hi cap a sobre d'una altra).
  let clashes = new Set();
  const findClashes = () => {
    clashes = new Set();
    const list = items();
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (Math.hypot(list[a].x - list[b].x, list[a].y - list[b].y) < (Math.hypot(list[a].w, list[a].h) + Math.hypot(list[b].w, list[b].h)) / 2
          && overlaps(list[a], list[b])) { clashes.add(list[a]); clashes.add(list[b]); }
      }
    }
  };
  const draw = () => {
    findClashes();
    // Les caixes seleccionades es dibuixen les últimes perquè quedin per sobre de les altres.
    const list = items().map((item, idx) => [item, idx]);
    const html = [...list.filter(([i]) => !selection.includes(i)), ...list.filter(([i]) => selection.includes(i))].map(([i, idx]) => boxHtml(i, idx));
    svg.innerHTML = `<g class="ed-origin"><line x1="-8" y1="0" x2="8" y2="0"/><line x1="0" y1="-8" x2="0" y2="8"/></g>${html.join('')}<g class="ed-guides"></g><rect class="ed-band" visibility="hidden"/>`;
  };
  const changed = (tag) => {
    draw();
    history.record({ data: JSON.stringify(layers), layer: layerId }, tag);
    onChange?.();
  };
  const notify = () => onSelect?.(selection.length === 1 ? selection[0] : null, selection.length);
  const select = (list) => { selection = list; draw(); notify(); };
  const boxId = (i) => i.key ?? `base:${i.base}`;
  const restore = (state) => {
    if (!state) return false;
    const ids = selection.map(boxId);
    for (const k of Object.keys(layers)) delete layers[k];
    Object.assign(layers, JSON.parse(state.data));
    const switched = state.layer !== layerId;
    layerId = state.layer;
    selection = items().filter((i) => ids.includes(boxId(i)));
    fitView(); draw();
    if (switched) onLayer?.(layerId);
    onChange?.(); notify();
    return true;
  };

  // Arrossegar: pointer events (ratolí i dit). La caixa es mou amb el punter i s'ajusta a una graella de 2 px.
  const toSvg = (e) => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  let drag = null, band = null;
  const place = (item) => svg.querySelector(`g.box[data-i="${items().indexOf(item)}"]`)
    ?.setAttribute('transform', `translate(${item.x.toFixed(1)} ${item.y.toFixed(1)}) rotate(${((item.rot * 180) / Math.PI).toFixed(1)})`);
  const showGuides = (guides) => {
    svg.querySelector('.ed-guides').innerHTML = guides.map((g) => `<line x1="${g.x1.toFixed(1)}" y1="${g.y1.toFixed(1)}" x2="${g.x2.toFixed(1)}" y2="${g.y2.toFixed(1)}"/>`).join('');
  };
  svg.addEventListener('pointerdown', (e) => {
    // Si es tenia el cursor al nom, deixa'l: si no, les fletxes i Ctrl+Z no arribarien a l'editor.
    if (document.activeElement?.closest?.('.tpl-panel')) document.activeElement.blur();
    const g = e.target.closest('g.box');
    const adding = e.shiftKey || e.ctrlKey || e.metaKey || multi;
    if (!g) {
      // Amb el ratolí, arrossegar pel fons selecciona totes les caixes del requadre. Al mòbil, el fons desplaça.
      if (e.pointerType === 'mouse') {
        const p = toSvg(e);
        band = { x: p.x, y: p.y, id: e.pointerId, keep: adding ? selection : [] };
        svg.setPointerCapture(e.pointerId);
      }
      if (!adding) select([]);
      return;
    }
    const item = items()[Number(g.dataset.i)];
    if (adding) {
      select(selection.includes(item) ? selection.filter((i) => i !== item) : [...selection, item]);
      if (!selection.includes(item)) { e.preventDefault(); return; }
    } else if (!selection.includes(item)) select([item]);
    const p = toSvg(e);
    drag = { item, dx: item.x - p.x, dy: item.y - p.y, moved: false, id: e.pointerId, from: selection.map((i) => ({ i, x: i.x, y: i.y })), startX: item.x, startY: item.y };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (band && e.pointerId === band.id) {
      const p = toSvg(e);
      const r = svg.querySelector('.ed-band');
      band.x2 = p.x; band.y2 = p.y;
      r.setAttribute('x', Math.min(band.x, p.x)); r.setAttribute('y', Math.min(band.y, p.y));
      r.setAttribute('width', Math.abs(band.x - p.x)); r.setAttribute('height', Math.abs(band.y - p.y));
      r.setAttribute('visibility', 'visible');
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const p = toSvg(e);
    const { item } = drag;
    // L'encaix es calcula amb la caixa que s'agafa; les altres de la selecció la segueixen. Alt: sense encaix.
    let x = snap(p.x + drag.dx), y = snap(p.y + drag.dy), guides = [];
    if (snapping && !e.altKey) {
      const rest = items().filter((i) => !selection.includes(i));
      const fit = snapBox(item, rest, p.x + drag.dx, p.y + drag.dy);
      if (fit.snapped) ({ x, y, guides } = fit);
    }
    for (const f of drag.from) {
      f.i.x = Math.round((f.x + x - drag.startX) * 10) / 10;
      f.i.y = Math.round((f.y + y - drag.startY) * 10) / 10;
      place(f.i);
    }
    showGuides(guides);
    drag.moved = true;
  });
  const endDrag = (e) => {
    if (band && e.pointerId === band.id) {
      const { x, y, x2, y2, keep } = band;
      band = null;
      svg.querySelector('.ed-band').setAttribute('visibility', 'hidden');
      if (x2 === undefined) return;
      const inside = items().filter((i) => i.x >= Math.min(x, x2) && i.x <= Math.max(x, x2) && i.y >= Math.min(y, y2) && i.y <= Math.max(y, y2));
      select([...new Set([...keep, ...inside])]);
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    if (moved) { fitView(); changed(); notify(); }
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  // Als mòbils, «touch-action» no sempre val dins d'un SVG (Safari l'ignora): si el dit comença sobre una caixa, el
  // navegador encara faria scroll alhora. Aturant l'esdeveniment tàctil, el dit només mou la caixa; al fons es desplaça.
  const noScroll = (e) => { if (e.target.closest?.('g.box') || drag) e.preventDefault(); };
  svg.addEventListener('touchstart', noScroll, { passive: false });
  svg.addEventListener('touchmove', noScroll, { passive: false });

  // Per fer-ne diverses de cop abans d'afegir-les a la capa.
  const keyMaker = () => {
    const prefix = `${LAYER_PREFIX[layerId]}n`;
    let max = 0;
    for (const list of Object.values(layers)) {
      for (const i of list) if (i.key?.startsWith(prefix)) max = Math.max(max, Number(i.key.slice(prefix.length)) || 0);
    }
    return () => `${prefix}${++max}`;
  };
  const nextKey = () => keyMaker()();

  fitView();
  draw();
  root.scrollLeft = (root.scrollWidth - root.clientWidth) / 2;
  root.scrollTop = (root.scrollHeight - root.clientHeight) / 2;
  return {
    zoomBy(f) {
      // Manté el centre del que es veu.
      const cx = (root.scrollLeft + root.clientWidth / 2) / root.scrollWidth, cy = (root.scrollTop + root.clientHeight / 2) / root.scrollHeight;
      zoom = Math.min(6, Math.max(1, zoom * f));
      applyZoom();
      root.scrollLeft = cx * root.scrollWidth - root.clientWidth / 2;
      root.scrollTop = cy * root.scrollHeight - root.clientHeight / 2;
    },
    get layer() { return layerId; },
    get selected() { return selection.length === 1 ? selection[0] : null; },
    get selection() { return selection; },
    get canUndo() { return history.canUndo; },
    get canRedo() { return history.canRedo; },
    get clashCount() { return clashes.size; },
    undo: () => restore(history.undo()),
    redo: () => restore(history.redo()),
    set snapping(on) { snapping = on; },
    get multi() { return multi; },
    set multi(on) { multi = on; },
    setLayer(id) { layerId = id; selection = []; history.patchCurrent({ layer: id }); fitView(); draw(); notify(); },
    selectAll() { select([...items()]); },
    selectRing(ring) { select(items().filter((i) => i.ring === ring)); },
    clearSelection() { select([]); },
    // Canvis a la caixa seleccionada (nom, tipus, cordó).
    update(patch) {
      const item = selection.length === 1 ? selection[0] : null;
      if (!item) return;
      if ('kind' in patch || 'ring' in patch) {
        // Si el nom era l'automàtic, segueix el tipus nou.
        const wasAuto = item.role === autoRole(item.kind, item.ring);
        Object.assign(item, patch);
        if (!RING_KINDS.includes(item.kind)) delete item.ring;
        else if (!item.ring) item.ring = 1;
        if (wasAuto && item.kind !== 'altre') item.role = autoRole(item.kind, item.ring);
      } else Object.assign(item, patch);
      changed('role' in patch ? 'name' : null);
    },
    // Si n'hi ha més d'una, giren totes juntes al voltant del seu centre.
    rotate(deg) {
      if (!selection.length) return;
      const a = deg * DEG, n = selection.length;
      const cx = selection.reduce((sum, i) => sum + i.x, 0) / n, cy = selection.reduce((sum, i) => sum + i.y, 0) / n;
      for (const item of selection) {
        item.rot = ((item.rot + a) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        if (n > 1) {
          const dx = item.x - cx, dy = item.y - cy;
          item.x = Math.round((cx + dx * Math.cos(a) - dy * Math.sin(a)) * 10) / 10;
          item.y = Math.round((cy + dx * Math.sin(a) + dy * Math.cos(a)) * 10) / 10;
        }
      }
      fitView(); changed(); notify();
    },
    nudge(dx, dy) {
      if (!selection.length) return;
      for (const item of selection) { item.x = Math.round((item.x + dx) * 10) / 10; item.y = Math.round((item.y + dy) * 10) / 10; }
      fitView(); changed('nudge');
    },
    // Tornen false si la capa ja és plena.
    add(kind) {
      if (items().length >= MAX_BOXES) return false;
      const from = selection.at(-1);
      const ring = RING_KINDS.includes(kind) ? 1 : undefined;
      const item = {
        key: nextKey(), kind, role: kind === 'altre' ? t('Posició nova') : autoRole(kind, ring),
        x: from ? snap(from.x + 24) : 0, y: from ? snap(from.y + 24) : snap(view.y + MARGIN / 2), w: BOX.w, h: BOX.h, rot: from?.rot ?? 0,
        ...(ring ? { ring } : {}),
      };
      items().push(item);
      selection = [item];
      fitView(); changed(); notify();
    },
    // Les caixes del tronc no es dupliquen ni es treuen: es queden a la capa.
    duplicate() {
      const from = selection.filter((i) => i.base === undefined);
      if (!from.length) return;
      if (items().length + from.length > MAX_BOXES) return false;
      selection = from.map((f) => {
        const copy = { ...f, key: nextKey(), x: snap(f.x + 24), y: snap(f.y + 24) };
        items().push(copy);
        return copy;
      });
      fitView(); changed(); notify();
    },
    // Una còpia de la selecció a l'altra banda de l'eix vertical: la meitat d'una pinya simètrica ja fa l'altra.
    mirror() {
      const from = selection.filter((i) => i.base === undefined);
      if (!from.length) return;
      if (items().length + from.length > MAX_BOXES) return false;
      selection = from.map((f) => {
        const copy = { ...f, key: nextKey(), x: -f.x, rot: ((2 * Math.PI - f.rot) % (2 * Math.PI)) };
        items().push(copy);
        return copy;
      });
      fitView(); changed(); notify();
    },
    remove() {
      const gone = selection.filter((i) => i.base === undefined);
      if (!gone.length) return;
      layers[layerId] = items().filter((i) => !gone.includes(i));
      selection = selection.filter((i) => !gone.includes(i));
      changed(); notify();
    },
    // Cordons de la capa: un més seguint cada línia, o fora l'últim. «first» són les caixes del primer, si encara no n'hi ha.
    get rings() { return maxRing(items()); },
    addRing(first) {
      const extra = maxRing(items()) ? nextRing(items(), keyMaker()) : first();
      if (items().length + extra.length > MAX_BOXES) return false;
      items().push(...extra);
      selection = extra;
      fitView(); changed(); notify();
    },
    removeRing() {
      const R = maxRing(items());
      if (!R) return;
      layers[layerId] = items().filter((i) => i.ring !== R);
      selection = [];
      fitView(); changed(); notify();
    },
    replace(newLayers) {
      for (const k of Object.keys(layers)) delete layers[k];
      Object.assign(layers, newLayers);
      if (!layers[layerId]) layerId = Object.keys(layers)[0];
      selection = []; fitView(); changed(); notify();
    },
  };
}
