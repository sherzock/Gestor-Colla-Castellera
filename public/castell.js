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
// Cada persona és una caixa (BOX_W × BOX_H píxels), vista des de dalt, com als esquemes de pinya habituals:
//  - cada baix té l'agulla al davant (cap a dins), el contrafort al darrere i una crossa a cada costat;
//  - darrere el contrafort hi ha la línia de mans (primeres, segones…) i, a cada costat d'aquesta línia,
//    una línia de laterals (entregirats), que treballen sobre una sola cama del segon;
//  - pel buit entre dos baixos hi va la línia de vents (daus), que treballen sobre dos segons;
//  - cada línia té tantes posicions com cordons.
// El pilar no porta crosses: té l'agulla a un costat, el contrafort a l'altre, mans pels dos costats i vents
// als laterals. La torre té una sola agulla. Els castells compostos són la unió de castells simples
// (5 = tres i torre, 7 = quatre i tres, 9 = tres i tres torres): els baixos de dins tenen el braç cap enfora
// passant entre els de fora, i les posicions que no caben a prop del centre se situen més enllà.
const BOX_W = 78;
const BOX_H = 30;
const STEP = BOX_H + 2;
const SIDE = BOX_W + 4;
const DEG = Math.PI / 180;

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

// Distància del centre als baixos d'un castell simple: prou gran perquè hi càpiguen agulles i crosses.
function baseDistance(width) {
  if (width === 2) return 2 * STEP;
  return Math.max(STEP + 47 + 41 / Math.tan(Math.PI / width), (150 * width) / (2 * Math.PI) - 16);
}

// On és cada baix (x, y), cap on va el seu braç (dir: contrafort i mans) i entre quins baixos hi ha vents.
// L'índex de cada baix és la columna del tronc (0 = rengla).
function pinyaPlan(width) {
  const polar = (r, a, dir = a) => ({ x: r * Math.cos(a), y: r * Math.sin(a), dir });
  const up = -Math.PI / 2;
  if (width === 1) return { baixos: [{ x: 0, y: 0, dir: up }], gaps: [{ a: 0, b: 0, dir: 0 }, { a: 0, b: 0, dir: Math.PI }], pilar: true };
  if (width <= 4) {
    const R = baseDistance(width);
    const baixos = Array.from({ length: width }, (_, i) => polar(R, up + (i * 2 * Math.PI) / width));
    return { baixos, gaps: baixos.map((b, i) => ({ a: i, b: (i + 1) % width, dir: b.dir + Math.PI / width })) };
  }
  if (width === 5) {
    // Tres i torre: la rengla del tres és al mig i el seu braç passa entre els dos baixos de la torre (a dalt).
    // Els altres dos baixos del tres queden a sota, amb els braços sortint del centre del tres.
    const tres = { x: 0, y: 103 };
    const of = (x, y, c) => ({ x, y, dir: Math.atan2(y - c.y, x - c.x) });
    return {
      baixos: [{ x: 0, y: 0, dir: up }, of(-105, -165, { x: 0, y: 0 }), of(105, -165, { x: 0, y: 0 }), of(89, 154, tres), of(-89, 154, tres)],
      gaps: [[2, 3], [3, 4], [4, 1]],
    };
  }
  if (width === 7) {
    // Quatre i tres: un baix al mig, amb el braç cap amunt entre els dos baixos de dalt, i sis al voltant.
    const at = (x, y, dir) => ({ x, y, dir });
    return {
      baixos: [at(0, 0, up), at(-175, -150, up), at(175, -150, up), at(330, 0, 0), at(175, 150, -up), at(-175, 150, -up), at(-330, 0, Math.PI)],
      gaps: [[2, 3], [3, 4], [4, 5], [5, 6], [6, 1]],
    };
  }
  // Nou: un tres al mig i una torre davant de cada baix del tres; el braç de cada baix del tres passa
  // entre els dos baixos de la seva torre.
  const baixos = [];
  for (let k = 0; k < 3; k++) {
    const A = up + k * 120 * DEG;
    baixos.push(polar(95, A), polar(265, A - 20 * DEG, A - 65 * DEG), polar(265, A + 20 * DEG, A + 65 * DEG));
  }
  return { baixos, gaps: [[2, 4], [5, 7], [8, 1]] };
}

function buildLayer({ id, label, width, prefix, baseKey, centerKey, rings, vents, agulles, add }) {
  const items = [];
  const placed = [];
  // «cat» és la categoria comparable entre castells diferents (per a l'historial).
  const catPrefix = id === 'pinya' ? '' : `${label} · `;
  const put = (key, role, kind, box, extra = {}, shared = false) => {
    placed.push(box);
    items.push(shared ? { key, role, kind, ...box, shared }
      : add(key, role, id, { kind, ...box, cat: catPrefix + (extra.cat || role), ...extra }));
  };
  const free = (box) => !placed.some((p) => overlaps(p, box));
  // Caixa travessada respecte a una direcció (com un baix mirant cap al centre), a distància d i desplaçada o.
  const across = (from, dir, d, o = 0) => ({
    x: from.x + d * Math.cos(dir) - o * Math.sin(dir), y: from.y + d * Math.sin(dir) + o * Math.cos(dir),
    w: BOX_W, h: BOX_H, rot: dir + Math.PI / 2,
  });
  // Primera caixa lliure seguint una línia, a partir de la distància d.
  const nextFree = (from, dir, o, d) => {
    for (let guard = 0; guard < 400; d += STEP / 2, guard++) {
      const box = across(from, dir, d, o);
      if (free(box)) return { box, d };
    }
    return null;
  };

  const plan = pinyaPlan(width);
  const simple = width <= 4;
  // Als castells compostos, l'agulla o una crossa que no hi càpiga a prop del centre no hi va.
  const maybe = (box, fn) => { if (simple || free(box)) fn(box); };

  if (centerKey) put(centerKey, null, 'base', { x: 0, y: 0, w: BOX_W, h: BOX_H, rot: 0 }, {}, true);
  plan.baixos.forEach((b, i) => put(baseKey(i), null, 'base', across(b, b.dir, 0), {}, true));
  plan.baixos.forEach((b, i) => {
    put(`${prefix}c${i}`, 'Contrafort', 'contrafort', across(b, b.dir, STEP));
    // La torre té una sola agulla; el pilar la té al costat contrari del contrafort.
    if (agulles && (width !== 2 || i === 0)) maybe(across(b, b.dir, -STEP), (box) => put(`${prefix}a${i}`, 'Agulla', 'agulla', box));
    if (!plan.pilar) {
      const off = BOX_W / 2 + BOX_H / 2 + 2;
      for (const [side, o] of [['e', off], ['d', -off]]) {
        const p = across(b, b.dir, STEP / 2, o);
        maybe({ ...p, w: 2 * STEP, h: BOX_H, rot: b.dir }, (box) => put(`${prefix}x${side}${i}`, 'Crossa', 'crossa', box));
      }
    }
  });

  // Braços amb línia de mans: un per baix (i el pilar en té un altre darrere l'agulla).
  const arms = plan.baixos.map((b, i) => ({ b, i, dir: b.dir, key: i, mans: '' }));
  if (plan.pilar) arms.push({ b: plan.baixos[0], i: 1, dir: plan.baixos[0].dir + Math.PI, key: 1, mans: " de l'agulla" });
  const cursor = new Map();
  // maxJump: si la línia hauria de saltar més enllà d'això per trobar lloc, s'acaba (no hi cap).
  const step = (k, from, dir, o, start, maxJump = Infinity) => {
    const at = cursor.get(k) ?? start;
    if (at === Infinity) return null;
    const found = nextFree(from, dir, o, at);
    if (!found || found.d - at > maxJump) { cursor.set(k, Infinity); return null; }
    cursor.set(k, found.d + STEP);
    return found.box;
  };
  // Cordó a cordó, perquè cada cordó ocupi el lloc més proper al centre que li quedi.
  for (let n = 1; n <= rings; n++) {
    for (const arm of arms) {
      const box = step(`m${arm.key}`, arm.b, arm.dir, 0, 2 * STEP);
      if (box) put(`${prefix}m${n}-${arm.key}`, `${ordinal(n, true)} mans${arm.mans}`, 'mans', box, { ring: n, cat: `${ordinal(n, true)} mans` });
    }
    if (!vents) continue;
    plan.gaps.forEach((g, gi) => {
      const [a, b] = Array.isArray(g) ? g : [g.a, g.b];
      const A = plan.baixos[a], B = plan.baixos[b];
      const dir = g.dir ?? Math.atan2(Math.sin(Math.atan2(A.y, A.x)) + Math.sin(Math.atan2(B.y, B.x)), Math.cos(Math.atan2(A.y, A.x)) + Math.cos(Math.atan2(B.y, B.x)));
      const box = step(`v${gi}`, { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, dir, 0, STEP / 2);
      if (box) put(`${prefix}v${n}-${gi}`, `${ordinal(n, false)} vent`, 'vent', box, { ring: n });
    });
    for (const arm of arms) {
      for (const [side, o] of [['e', SIDE], ['d', -SIDE]]) {
        const box = step(`l${arm.key}${side}`, arm.b, arm.dir, o, STEP, simple ? Infinity : 2 * STEP);
        if (box) put(`${prefix}l${n}-${arm.key}-${side}`, `Lateral ${n}`, 'lateral', box, { ring: n, cat: 'Lateral' });
      }
    }
  }
  return { id, label, items };
}

// ---------- Plantilles de la colla ----------
// Cada colla pot redibuixar la pinya (i el folre, les manilles i els puntals) d'un tipus de castell («3d7», «4d8a»…):
// moure, girar, reanomenar, afegir i treure posicions. Una plantilla substitueix la capa generada sencera.
// Les posicions que ja existien conserven la clau, i així l'historial i les estadístiques no es perden.
// Cada element de la capa és { key, role, kind, x, y, w, h, rot, ring? } o, per a les caixes del tronc que
// la capa envolta, { base: columna | 'c' (pilar central), x, y, w, h, rot }.
export const LAYER_IDS = ['pinya', 'folre', 'manilles', 'puntals'];
export const LAYER_PREFIX = { pinya: 'p', folre: 'f', manilles: 'm', puntals: 'u' };
export const TEMPLATE_KINDS = ['contrafort', 'agulla', 'crossa', 'mans', 'vent', 'lateral', 'altre'];
export const BOX = { w: BOX_W, h: BOX_H };
let templates = new Map();
export function setTemplates(list) {
  templates = new Map((list || []).map((t) => [t.name, t]));
  structureCache.clear();
}
export const templateOf = (c) => templates.get(castellName(c)) ?? null;

// Categoria comparable entre castells (la mateixa que fa servir la capa generada).
export function kindCat(layerId, kind, ring, role) {
  const base = kind === 'mans' ? `${ordinal(ring || 1, true)} mans` : kind === 'vent' ? `${ordinal(ring || 1, false)} vent`
    : kind === 'altre' ? role : { contrafort: 'Contrafort', agulla: 'Agulla', crossa: 'Crossa', lateral: 'Lateral' }[kind];
  return layerId === 'pinya' ? base : `${LAYER_LABEL[layerId]} · ${base}`;
}
const LAYER_LABEL = { pinya: 'Pinya', folre: 'Folre', manilles: 'Manilles', puntals: 'Puntals' };

function templateLayer({ id, label, baseKey, centerKey, add }, items) {
  const out = [];
  for (const it of items) {
    const box = { x: it.x, y: it.y, w: it.w, h: it.h, rot: it.rot };
    if (it.base !== undefined) {
      const key = it.base === 'c' ? centerKey : baseKey(it.base);
      if (key) out.push({ key, role: null, kind: 'base', ...box, shared: true });
      continue;
    }
    out.push(add(it.key, it.role, id, { kind: it.kind, ...box, cat: kindCat(id, it.kind, it.ring, it.role), ...(it.ring ? { ring: it.ring } : {}) }));
  }
  return { id, label, items: out };
}

// Configuració mínima a partir del nom («3d7fm» → tres de set amb folre i manilles), per a l'editor de plantilles.
export function configFromName(name) {
  const m = /^(?:pd|([2-579])d)(\d{1,2})(f(m(p)?)?)?(a)?(n)?(ps)?$/.exec(String(name));
  if (!m) return null;
  const c = { width: m[1] ? Number(m[1]) : 1, height: Number(m[2]), folre: m[3] ? 1 : 0, manilles: m[4] ? 1 : 0, puntals: m[5] ? 1 : 0,
    agulla: m[6] ? 1 : 0, net: m[7] ? 1 : 0, sota: m[8] ? 1 : 0, cordons: 3 };
  if (c.height < 3 || c.height > 12 || castellName(c) !== name) return null;
  return c;
}

export function buildStructure(c, { ignoreTemplate = false } = {}) {
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
  const template = ignoreTemplate ? null : templates.get(castellName(c));
  const layer = (spec) => (template?.layers?.[spec.id] ? templateLayer(spec, template.layers[spec.id]) : buildLayer(spec));
  // Als castells amb agulla (pilar al mig), el baix del pilar queda al centre de la pinya.
  const center = (L) => (positions.has(`ag${L}`) ? `ag${L}` : null);
  if (!c.net) {
    layers.push(layer({ id: 'pinya', label: 'Pinya', width, prefix: 'p', baseKey: (i) => `t${from}-${i}`, centerKey: center(from),
      rings: Number(c.cordons ?? 3), vents: true, agulles: true, add }));
  }
  if (folre && troncLevels >= 2) {
    layers.push(layer({ id: 'folre', label: 'Folre', width, prefix: 'f', baseKey: (i) => `t2-${i}`, centerKey: center(2),
      rings: 1, vents: true, agulles: false, add }));
  }
  if (folre && c.manilles && troncLevels >= 3) {
    layers.push(layer({ id: 'manilles', label: 'Manilles', width, prefix: 'm', baseKey: (i) => `t3-${i}`,
      rings: 0, vents: false, agulles: false, add }));
  }
  if (folre && c.manilles && c.puntals && troncLevels >= 4) {
    layers.push(layer({ id: 'puntals', label: 'Puntals', width, prefix: 'u', baseKey: (i) => `t4-${i}`,
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
// L'estructura que torna no s'ha de modificar (és compartida).
const structureCache = new Map();
export function structureOf(c) {
  const id = [c.width, c.height, c.agulla ? 1 : 0, c.folre ? 1 : 0, c.manilles ? 1 : 0, c.puntals ? 1 : 0, c.cordons ?? 3, c.gralles || 0, c.timbals || 0,
    c.net ? 1 : 0, c.from_level || 1, c.to_level || 0].join('|');
  if (!structureCache.has(id)) structureCache.set(id, buildStructure(c));
  return structureCache.get(id);
}
export function positionOf(c, key) {
  return structureOf(c).positions.get(key) ?? null;
}
