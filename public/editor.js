// Editor visual de plantilles de pinya: cada caixa es pot arrossegar, girar, reanomenar, duplicar o treure.
// Treballa sobre una còpia de les capes ({ pinya: [...], folre: [...] }) i avisa amb onChange a cada canvi.
import { BOX, LAYER_PREFIX, kindCat } from './castell.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const MARGIN = 140;
const SNAP = 2;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const DEG = Math.PI / 180;

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

export function createEditor(root, { layers, baseLabel, usage, t, onChange, onSelect }) {
  let layerId = Object.keys(layers)[0];
  let selected = null;
  let view = null;
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
    return `<g class="box ed ${selected === idx ? 'sel' : ''} ${base ? 'fixed' : ''}" data-i="${idx}" style="--c:${KIND_VAR[kind] || 'var(--ink-3)'}"
      transform="translate(${item.x.toFixed(1)} ${item.y.toFixed(1)}) rotate(${((item.rot * 180) / Math.PI).toFixed(1)})">
      <title>${esc(base ? top : item.role)}${n ? ` · ${esc(t('{n} cops a l\'historial', { n }))}` : ''}</title>
      <rect x="${-item.w / 2}" y="${-item.h / 2}" width="${item.w}" height="${item.h}" rx="5"/>
      <g transform="rotate(${(textDeg(item.rot) - (item.rot * 180) / Math.PI).toFixed(1)})">
        <text class="${bottom ? 'r' : 'n'}" y="${bottom ? -4.5 : 4}" text-anchor="middle">${esc(top.length > 16 ? top.slice(0, 15) + '…' : top)}</text>
        ${bottom ? `<text class="n" y="9" text-anchor="middle">${esc(bottom.length > 14 ? bottom.slice(0, 13) + '…' : bottom)}</text>` : ''}
      </g>
    </g>`;
  };
  const draw = () => {
    // La caixa seleccionada es dibuixa l'última perquè quedi per sobre de les altres.
    const html = items().map(boxHtml);
    if (selected !== null && html[selected]) html.push(html.splice(selected, 1)[0]);
    svg.innerHTML = `<g class="ed-origin"><line x1="-8" y1="0" x2="8" y2="0"/><line x1="0" y1="-8" x2="0" y2="8"/></g>${html.join('')}`;
  };
  const changed = () => { draw(); onChange?.(); };
  const select = (idx) => { selected = idx; draw(); onSelect?.(idx === null ? null : items()[idx]); };

  // Arrossegar: pointer events (ratolí i dit). La caixa es mou amb el punter i s'ajusta a una graella de 2 px.
  const toSvg = (e) => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('g.box');
    if (!g) { select(null); return; }
    const idx = Number(g.dataset.i);
    if (selected !== idx) select(idx);
    const p = toSvg(e);
    const item = items()[idx];
    drag = { idx, dx: item.x - p.x, dy: item.y - p.y, moved: false, id: e.pointerId };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = toSvg(e);
    const item = items()[drag.idx];
    item.x = snap(p.x + drag.dx);
    item.y = snap(p.y + drag.dy);
    drag.moved = true;
    const g = svg.querySelector(`g.box[data-i="${drag.idx}"]`);
    g?.setAttribute('transform', `translate(${item.x.toFixed(1)} ${item.y.toFixed(1)}) rotate(${((item.rot * 180) / Math.PI).toFixed(1)})`);
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    if (moved) { fitView(); changed(); onSelect?.(items()[selected]); }
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  // Als mòbils, «touch-action» no sempre val dins d'un SVG (Safari l'ignora): si el dit comença sobre una caixa, el
  // navegador encara faria scroll alhora. Aturant l'esdeveniment tàctil, el dit només mou la caixa; al fons es desplaça.
  const noScroll = (e) => { if (e.target.closest?.('g.box') || drag) e.preventDefault(); };
  svg.addEventListener('touchstart', noScroll, { passive: false });
  svg.addEventListener('touchmove', noScroll, { passive: false });

  const nextKey = () => {
    const prefix = `${LAYER_PREFIX[layerId]}n`;
    let max = 0;
    for (const list of Object.values(layers)) {
      for (const i of list) if (i.key?.startsWith(prefix)) max = Math.max(max, Number(i.key.slice(prefix.length)) || 0);
    }
    return `${prefix}${max + 1}`;
  };

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
    get selected() { return selected === null ? null : items()[selected]; },
    setLayer(id) { layerId = id; selected = null; fitView(); draw(); onSelect?.(null); },
    // Canvis a la caixa seleccionada (nom, tipus, cordó).
    update(patch) {
      const item = items()[selected];
      if (!item) return;
      if ('kind' in patch || 'ring' in patch) {
        // Si el nom era l'automàtic, segueix el tipus nou.
        const wasAuto = item.role === autoRole(item.kind, item.ring);
        Object.assign(item, patch);
        if (!['mans', 'vent', 'lateral'].includes(item.kind)) delete item.ring;
        else if (!item.ring) item.ring = 1;
        if (wasAuto && item.kind !== 'altre') item.role = autoRole(item.kind, item.ring);
      } else Object.assign(item, patch);
      changed();
    },
    rotate(deg) {
      const item = items()[selected];
      if (!item) return;
      item.rot = ((item.rot + deg * DEG) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      changed();
    },
    nudge(dx, dy) {
      const item = items()[selected];
      if (!item) return;
      item.x += dx; item.y += dy;
      fitView(); changed();
    },
    add(kind) {
      const from = items()[selected];
      const ring = ['mans', 'vent', 'lateral'].includes(kind) ? 1 : undefined;
      const item = {
        key: nextKey(), kind, role: kind === 'altre' ? t('Posició nova') : autoRole(kind, ring),
        x: from ? snap(from.x + 24) : 0, y: from ? snap(from.y + 24) : snap(view.y + MARGIN / 2), w: BOX.w, h: BOX.h, rot: from?.rot ?? 0,
        ...(ring ? { ring } : {}),
      };
      items().push(item);
      selected = items().length - 1;
      fitView(); changed(); onSelect?.(item);
    },
    duplicate() {
      const from = items()[selected];
      if (!from || from.base !== undefined) return;
      items().push({ ...from, key: nextKey(), x: snap(from.x + 24), y: snap(from.y + 24) });
      selected = items().length - 1;
      fitView(); changed(); onSelect?.(items()[selected]);
    },
    remove() {
      const item = items()[selected];
      if (!item || item.base !== undefined) return;
      items().splice(selected, 1);
      selected = null;
      changed(); onSelect?.(null);
    },
    replace(newLayers) {
      for (const k of Object.keys(layers)) delete layers[k];
      Object.assign(layers, newLayers);
      if (!layers[layerId]) layerId = Object.keys(layers)[0];
      selected = null; fitView(); changed(); onSelect?.(null);
    },
  };
}
