// Generador de l'estructura d'un castell a partir de la seva configuració.
// Cada posició té una clau estable (p. ex. "t2-0" = segon de la columna 0) que és
// la que es guarda a la base de dades amb la persona assignada.

export const LEVEL_NAMES = ['Baix', 'Segon', 'Terç', 'Quart', 'Quint', 'Sisè', 'Setè', 'Vuitè', 'Novè', 'Desè'];
export const LEVEL_PLURAL = ['Baixos', 'Segons', 'Terços', 'Quarts', 'Quints', 'Sisens', 'Setens', 'Vuitens', 'Novens', 'Desens'];
const ORDINAL_F = ['Primeres', 'Segones', 'Terceres', 'Quartes', 'Cinquenes', 'Sisenes', 'Setenes', 'Vuitenes', 'Novenes', 'Desenes', 'Onzenes', 'Dotzenes'];
const ORDINAL_M = ['Primer', 'Segon', 'Tercer', 'Quart', 'Cinquè', 'Sisè', 'Setè', 'Vuitè', 'Novè', 'Desè', 'Onzè', 'Dotzè'];
const ordinal = (n, fem) => (fem ? ORDINAL_F : ORDINAL_M)[n - 1] ?? `${n}${fem ? 'es' : 'è'}`;

export const WIDTHS = [
  { value: 1, label: 'Pilar (1)' },
  { value: 2, label: 'Torre (2)' },
  { value: 3, label: 'Tres (3)' },
  { value: 4, label: 'Quatre (4)' },
  { value: 5, label: 'Cinc (5)' },
  { value: 7, label: 'Set (7)' },
  { value: 9, label: 'Nou (9)' },
];

export const RESULTS = {
  previst: 'Previst',
  descarregat: 'Descarregat',
  carregat: 'Carregat',
  intent: 'Intent',
  'intent desfet': 'Intent desfet',
};

// Nomenclatura: 3d6, 4d7a, 3d9fm, 3d6n (net, sense pinya), pd4ps (per sota).
export function castellName(c) {
  const suffix = (c.folre && !c.net ? 'f' + (c.manilles ? 'm' + (c.puntals ? 'p' : '') : '') : '')
    + (c.agulla && c.width >= 3 ? 'a' : '') + (c.net ? 'n' : '') + (c.sota ? 'ps' : '');
  return c.width === 1 ? `pd${c.height}${suffix}` : `${c.width}d${c.height}${suffix}`;
}

// Pisos d'un castell, de baix a dalt (1 = baixos … height = enxaneta), per triar una prova parcial.
export function levelNames(c) {
  const width = Number(c.width), height = Number(c.height);
  const tronc = width === 1 ? height - 1 : height - 3;
  const out = [];
  for (let L = 1; L <= tronc; L++) out.push({ level: L, label: LEVEL_PLURAL[L - 1] });
  if (width !== 1) out.push({ level: height - 2, label: 'Dosos' }, { level: height - 1, label: 'Acotxador' });
  out.push({ level: height, label: 'Enxaneta' });
  return out;
}

// Prova parcial (assajos): només es fan els pisos entre from_level i to_level (0 = fins a dalt).
// El nom del castell no canvia: un 3d6 sense pom de dalt continua sent un 3d6.
export function levelRange(c) {
  const height = Number(c.height);
  const from = Math.max(1, Number(c.from_level) || 1);
  const to = Math.min(height, Number(c.to_level) || height);
  return { from, to, partial: from > 1 || to < height };
}

function columnName(width, i) {
  if (width === 3) return ['Rengla', 'Plena', 'Buida'][i];
  if (width === 1) return '';
  return String(i + 1);
}

// ---------- Pinya en planta ----------
// Cada persona és una caixa (BOX_W × BOX_H píxels). La pinya s'organitza en línies que surten
// del centre, com als esquemes de pinya habituals:
//  - per cada baix: agulla (cap a dins), baix, contrafort, dues crosses als costats, i la línia de
//    mans darrere del contrafort, amb una línia de laterals de mans a cada costat;
//  - pel buit entre dos baixos: la línia de vents, amb una línia de laterals a cada costat.
// Cada línia té tantes posicions com cordons. Si una caixa toparia amb una altra ja col·locada
// (a prop del centre no hi ha lloc), aquella línia comença una mica més enfora.
const BOX_W = 78;
const BOX_H = 30;
const STEP = BOX_H + 2;
const SIDE = BOX_W + 4;

function overlaps(a, b) {
  for (const t of [a.rot, a.rot + Math.PI / 2, b.rot, b.rot + Math.PI / 2]) {
    const ax = Math.cos(t), ay = Math.sin(t);
    const span = (r) => {
      const c = r.x * ax + r.y * ay;
      const e = Math.abs((r.w / 2) * (Math.cos(r.rot) * ax + Math.sin(r.rot) * ay))
        + Math.abs((r.h / 2) * (-Math.sin(r.rot) * ax + Math.cos(r.rot) * ay));
      return [c - e, c + e];
    };
    const [a0, a1] = span(a), [b0, b1] = span(b);
    if (a1 + 1.5 <= b0 || b1 + 1.5 <= a0) return false;
  }
  return true;
}

// Distància del centre als baixos: prou gran perquè hi càpiguen agulles i crosses.
function baseDistance(width) {
  if (width === 1) return 0;
  if (width === 2) return 2 * STEP;
  return Math.max(STEP + 47 + 41 / Math.tan(Math.PI / width), (150 * width) / (2 * Math.PI) - 16);
}

function buildLayer({ id, label, width, prefix, baseKey, rings, vents, agulles, add }) {
  const items = [];
  const placed = [];
  // «cat» és la categoria comparable entre castells diferents (per a l'historial).
  const catPrefix = id === 'pinya' ? '' : `${label} · `;
  const put = (key, role, kind, box, extra = {}, shared = false) => {
    placed.push(box);
    items.push(shared ? { key, role, kind, ...box, shared }
      : add(key, role, id, { kind, ...box, cat: catPrefix + (extra.cat || role), ...extra }));
  };
  const point = (phi, d, o = 0) => ({ x: d * Math.cos(phi) - o * Math.sin(phi), y: d * Math.sin(phi) + o * Math.cos(phi) });
  const across = (phi, d, o = 0) => ({ ...point(phi, d, o), w: BOX_W, h: BOX_H, rot: phi + Math.PI / 2 });
  // Una línia és contínua: es busca la primera distància on hi caben totes les caixes seguides.
  const line = (count, phi, o, startD, make) => {
    if (count <= 0) return;
    for (let d = startD, guard = 0; guard < 300; d += STEP / 2, guard++) {
      const boxes = Array.from({ length: count }, (_, n) => across(phi, d + n * STEP, o));
      if (boxes.some((box) => placed.some((p) => overlaps(p, box)))) continue;
      boxes.forEach((box, n) => make(n + 1, box));
      return;
    }
  };

  const Rb = baseDistance(width);
  // El primer baix (la rengla) queda a dalt.
  const arms = Array.from({ length: width }, (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / width);
  const gaps = arms.map((phi) => phi + Math.PI / width);

  // Nucli: agulla, baix, contrafort i crosses de cada baix.
  arms.forEach((phi, i) => {
    if (agulles) put(`${prefix}a${i}`, 'Agulla', 'agulla', across(phi, Rb - STEP));
    put(baseKey(i), null, 'base', across(phi, Rb), {}, true);
    put(`${prefix}c${i}`, 'Contrafort', 'contrafort', across(phi, Rb + STEP));
    const crossOffset = BOX_W / 2 + BOX_H / 2 + 2;
    for (const [side, o] of [['e', crossOffset], ['d', -crossOffset]]) {
      put(`${prefix}x${side}${i}`, 'Crossa', 'crossa', { ...point(phi, Rb + STEP / 2, o), w: 2 * STEP, h: BOX_H, rot: phi });
    }
  });

  arms.forEach((phi, i) => line(rings, phi, 0, Rb + 2 * STEP, (n, box) =>
    put(`${prefix}m${n}-${i}`, `${ordinal(n, true)} mans`, 'mans', box, { ring: n })));
  if (vents) {
    gaps.forEach((phi, i) => line(rings, phi, 0, width === 1 ? 2 * STEP : STEP / 2, (n, box) =>
      put(`${prefix}v${n}-${i}`, `${ordinal(n, false)} vent`, 'vent', box, { ring: n })));
    gaps.forEach((phi, i) => {
      for (const [side, o] of [['e', SIDE], ['d', -SIDE]]) {
        line(rings, phi, o, STEP / 2, (n, box) =>
          put(`${prefix}lv${n}-${i}-${side}`, `Lateral ${n}`, 'lateral', box, { ring: n, cat: 'Lateral' }));
      }
    });
  }
  if (rings > 1) {
    arms.forEach((phi, i) => {
      for (const [side, o] of [['e', SIDE], ['d', -SIDE]]) {
        line(rings - 1, phi, o, Rb + 2 * STEP, (n, box) =>
          put(`${prefix}lm${n}-${i}-${side}`, `Lateral de mans ${n}`, 'latmans', box, { ring: n + 1, cat: 'Lateral de mans' }));
      }
    });
  }
  return { id, label, items };
}

export function buildStructure(c) {
  const width = Number(c.width);
  const height = Number(c.height);
  const positions = new Map();
  const folre = !!c.folre && !c.net;
  const { from, to } = levelRange(c);
  const inRange = (L) => L >= from && L <= to;
  const add = (key, role, group, extra = {}) => {
    const pos = { key, role, group, ...extra };
    positions.set(key, pos);
    return pos;
  };

  // Tronc i pom de dalt, de baix a dalt.
  const levels = [];
  const troncLevels = width === 1 ? height - 1 : height - 3;
  for (let L = from; L <= Math.min(troncLevels, to); L++) {
    const cells = [];
    for (let i = 0; i < width; i++) {
      const col = columnName(width, i);
      cells.push(add(`t${L}-${i}`, col ? `${LEVEL_NAMES[L - 1]} · ${col}` : LEVEL_NAMES[L - 1], L === 1 ? 'baixos' : 'tronc', { level: L, col: i, cat: LEVEL_NAMES[L - 1] }));
    }
    const tags = [];
    if (L === 2 && folre) tags.push('Folre');
    if (L === 3 && folre && c.manilles) tags.push('Manilles');
    if (L === 4 && folre && c.manilles && c.puntals) tags.push('Puntals');
    levels.push({ level: L, label: LEVEL_PLURAL[L - 1], cells, tags });
  }
  if (width === 1) {
    if (inRange(height)) levels.push({ level: height, label: 'Enxaneta', cells: [add('enx', 'Enxaneta', 'pom', { level: height, cat: 'Enxaneta' })], tags: [] });
  } else {
    if (inRange(height - 2)) levels.push({ level: height - 2, label: 'Dosos', cells: [add('dos1', 'Dosos', 'pom', { level: height - 2, cat: 'Dosos' }), add('dos2', 'Dosos', 'pom', { level: height - 2, cat: 'Dosos' })], tags: [] });
    if (inRange(height - 1)) levels.push({ level: height - 1, label: 'Acotxador', cells: [add('acot', 'Acotxador', 'pom', { level: height - 1, cat: 'Acotxador' })], tags: [] });
    if (inRange(height)) levels.push({ level: height, label: 'Enxaneta', cells: [add('enx', 'Enxaneta', 'pom', { level: height, cat: 'Enxaneta' })], tags: [] });
  }

  // Agulla: pilar central dins del castell.
  const agulla = [];
  if (c.agulla && width >= 3) {
    const h = height - 2;
    for (let L = from; L <= Math.min(h, to); L++) {
      agulla.push(add(`ag${L}`, L === h ? 'Enxaneta del pilar' : `${LEVEL_NAMES[L - 1]} del pilar`, 'agulla', { level: L, of: h, cat: 'Pilar central' }));
    }
  }

  // Música: gralles i timbals que toquen durant el castell.
  const musica = [];
  for (let i = 1; i <= Number(c.gralles || 0); i++) musica.push(add(`mg${i}`, `Gralla ${i}`, 'musica', { kind: 'gralla', cat: 'Gralla' }));
  for (let i = 1; i <= Number(c.timbals || 0); i++) musica.push(add(`mt${i}`, `Timbal ${i}`, 'musica', { kind: 'timbal', cat: 'Timbal' }));

  // Pinya, folre i manilles (vistes en planta). Un castell net no en té: el tronc aguanta sol.
  // En una prova parcial hi són igual: només es treuen pisos del tronc, i el pis més baix que es fa
  // ocupa el lloc dels baixos a la pinya.
  const layers = [];
  if (!c.net) {
    layers.push(buildLayer({ id: 'pinya', label: 'Pinya', width, prefix: 'p', baseKey: (i) => `t${from}-${i}`,
      rings: Number(c.cordons ?? 3), vents: true, agulles: true, add }));
  }
  if (folre && troncLevels >= 2) {
    layers.push(buildLayer({ id: 'folre', label: 'Folre', width, prefix: 'f', baseKey: (i) => `t2-${i}`,
      rings: 1, vents: true, agulles: false, add }));
  }
  if (folre && c.manilles && troncLevels >= 3) {
    layers.push(buildLayer({ id: 'manilles', label: 'Manilles', width, prefix: 'm', baseKey: (i) => `t3-${i}`,
      rings: 0, vents: false, agulles: false, add }));
  }
  if (folre && c.manilles && c.puntals && troncLevels >= 4) {
    layers.push(buildLayer({ id: 'puntals', label: 'Puntals', width, prefix: 'u', baseKey: (i) => `t4-${i}`,
      rings: 0, vents: false, agulles: false, add }));
  }
  // Si el pis del tronc que envolta una capa no es fa, la seva caixa central queda buida i sense persona.
  const names = levelNames(c);
  for (const layer of layers) {
    for (const item of layer.items) {
      if (item.shared && !positions.has(item.key)) {
        const L = Number(item.key.slice(1).split('-')[0]);
        Object.assign(item, { off: true, role: L <= troncLevels ? LEVEL_NAMES[L - 1] : names.find((n) => n.level === L)?.label });
      }
    }
  }

  return { name: castellName(c), width, troncLevels, levels, agulla, musica, layers, positions };
}

// Posicions que es veuen a la vista de tronc (la resta només a la pinya).
export const inTroncView = (pos) => ['tronc', 'baixos', 'pom', 'agulla', 'musica'].includes(pos.group);

// Cache de categories per configuració, útil per calcular l'historial de molts castells.
const structureCache = new Map();
export function positionOf(c, key) {
  const id = [c.width, c.height, c.agulla ? 1 : 0, c.folre ? 1 : 0, c.manilles ? 1 : 0, c.puntals ? 1 : 0, c.cordons ?? 3, c.gralles || 0, c.timbals || 0,
    c.net ? 1 : 0, c.from_level || 1, c.to_level || 0].join('|');
  if (!structureCache.has(id)) structureCache.set(id, buildStructure(c).positions);
  return structureCache.get(id).get(key) ?? null;
}
