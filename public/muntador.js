// Muntador automàtic: proposa qui va a cada posició d'un castell a partir de
// qui ha confirmat, les mides de cada persona i l'historial de posicions.
// És una heurística «golosa»: omple primer les posicions més delicades (pom de dalt,
// tronc de dalt a baix, pilar central), després el folre/manilles i finalment la pinya
// de dins cap a fora, escollint cada vegada la persona amb millor puntuació.
// Si el castell té gralles o timbals, els músics hi van primer (i ja no es fan servir a la pinya).
// Al tronc vigila que cada pis quedi anivellat d'espatlles i que ningú pesi més que qui el porta (comptant també qui
// ja hi és), i al final pot proposar un relleu per a cada posició del tronc amb la gent que ha quedat lliure.
import { SHOULDER_GAP_CM, WEIGHT_GAP_KG, inTroncView } from './castell.js';

const KID_MAX_AGE = 13;

function ageOf(birthdate) {
  if (!birthdate) return null;
  const b = new Date(birthdate + 'T12:00:00'), now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

// target: pes relatiu desitjat (0 = la persona més lleugera disponible, 1 = la més pesant).
function profileOf(pos, s) {
  switch (pos.group) {
    case 'musica':
      return { target: 0.5, order: -1, kids: true, music: pos.kind };
    case 'pom':
      return { target: pos.key === 'enx' ? 0 : pos.key === 'acot' ? 0.03 : 0.1, order: 0, kids: true, core: true };
    case 'tronc':
    case 'baixos': {
      const top = s.troncLevels;
      return { target: 1 - ((pos.level - 1) / Math.max(top, 2)) * 0.8, order: 1 + (top - pos.level) * 0.01, kids: false, core: true, level: pos.level };
    }
    case 'agulla': {
      const f = pos.level / pos.of;
      return { target: 0.85 * (1 - f) + 0.05, order: 1.5, kids: f >= 0.75, core: true };
    }
    case 'puntals': return { target: 0.6, order: 2.2, kids: false };
    case 'manilles': return { target: 0.65, order: 2.3, kids: false };
    case 'folre': return { target: 0.7, order: 2.4 + (pos.ring ? 0.05 : 0), kids: false };
    default: {
      const target = { crossa: 0.6, contrafort: 0.8, agulla: 0.65, vent: 0.55, mans: 0.5, lateral: 0.4, latmans: 0.4, tap: 0.45, tapatap: 0.4 }[pos.kind] ?? 0.5;
      // Primer el nucli (contraforts, crosses, agulles) i després cordó a cordó: mans, vents i laterals.
      const inner = { contrafort: 0, crossa: 0.01, agulla: 0.02 }[pos.kind];
      const inRing = { mans: 0, vent: 0.02, lateral: 0.05, latmans: 0.06, tap: 0.07, tapatap: 0.08 }[pos.kind] ?? 0.05;
      return { target, order: inner !== undefined ? 3 + inner : 3 + pos.ring * 0.1 + inRing, kids: false };
    }
  }
}

/**
 * @param structure  resultat de buildStructure()
 * @param candidates persones actives amb status, mides i data de naixement
 * @param current    Map pos_key → assignació actual
 * @param exact      Map "pos_key|person_id" → cops que ha fet aquesta posició en castells iguals (mateix nom: 3d7, 4d7a…)
 * @param byCat      { person_id: { categoria: cops } }
 * @param options    { tronc, pinya, musica, keep, reliefs }
 * @returns { map: Map pos_key → { person, exact, cat } | null, reliefs: Map pos_key → { person, exact, cat }, filled, empty, unused }
 */
export function proposeLineup({ structure: s, candidates, current, exact, byCat = {}, options }) {
  const inScope = (pos) => (pos.group === 'musica' ? options.musica !== false : inTroncView(pos) ? options.tronc : options.pinya);
  const targets = [...s.positions.values()].filter(inScope);

  // Qui ja està col·locat i no es mourà.
  const locked = new Set();
  for (const [key, a] of current) {
    const pos = s.positions.get(key);
    if (!pos || !a.person_id) continue;
    if (!inScope(pos) || options.keep) locked.add(a.person_id);
  }

  const pool = candidates
    .filter((p) => p.status === 'si' && !locked.has(p.id))
    .map((p) => ({ ...p, age: ageOf(p.birthdate) }));

  // Percentil de pes dins del grup disponible (sense dada → al mig).
  const weights = pool.map((p) => p.weight_kg).filter((w) => w != null).sort((a, b) => a - b);
  const median = weights.length ? weights[Math.floor(weights.length / 2)] : 70;
  const sorted = [...pool].sort((a, b) => (a.weight_kg ?? median) - (b.weight_kg ?? median));
  const wp = new Map(sorted.map((p, i) => [p.id, sorted.length > 1 ? i / (sorted.length - 1) : 0.5]));

  const open = targets
    .filter((pos) => !(options.keep && current.has(pos.key)))
    .map((pos) => ({ pos, prof: profileOf(pos, s) }))
    .sort((a, b) => a.prof.order - b.prof.order);

  // Experiència d'una persona en una posició, i la millor que té en qualsevol posició oberta.
  // Així el muntador evita gastar algú que és clau en una altra posició (cost d'oportunitat).
  const expScore = (p, pos) => Math.min(exact.get(`${pos.key}|${p.id}`) || 0, 6) * 3 + Math.min(byCat[p.id]?.[pos.cat] || 0, 10) * 1.2;
  const bestExp = new Map(pool.map((p) => [p.id, Math.max(0, ...open.map(({ pos }) => expScore(p, pos)))]));

  // Qui hi ha a cada posició mentre es munta: el que ja hi era (i es manté) i el que es va proposant.
  const placed = new Map();
  for (const [key, a] of current) {
    const pos = s.positions.get(key);
    if (pos && (a.person_id || a.guest_id || a.guest_name) && (!inScope(pos) || options.keep)) placed.set(key, a);
  }
  // Espatlles dels altres del mateix pis del tronc (els baixos no compten: van a terra).
  const levelMates = (pos) => [...placed].filter(([k]) => k !== pos.key && /^t\d+-/.test(k) && s.positions.get(k)?.level === pos.level)
    .map(([, a]) => a.shoulder_height_cm).filter(Boolean);
  // Qui té a sobre i a sota a la mateixa columna (tronc o pilar central).
  const neighbours = (pos) => {
    const m = pos.key.match(/^(t|ag)(\d+)(-\d+)?$/);
    if (!m) return {};
    const at = (L) => placed.get(`${m[1]}${L}${m[3] || ''}`);
    return { above: at(Number(m[2]) + 1), below: at(Number(m[2]) - 1) };
  };

  function score(p, pos, prof) {
    const ex = exact.get(`${pos.key}|${p.id}`) || 0;
    const cat = byCat[p.id]?.[pos.cat] || 0;
    const xp = expScore(p, pos);
    let sc = prof.music ? xp : -Math.abs(wp.get(p.id) - prof.target) * 10 + xp;
    sc -= Math.max(0, bestExp.get(p.id) - xp) * 0.7;
    if (prof.core && ex + cat === 0) sc -= 6;
    if (pos.group === 'pom' && (p.age ?? 30) >= 16) sc -= 12;
    if (pos.group === 'tronc' && p.shoulder_height_cm) {
      const hs = levelMates(pos);
      if (hs.length) {
        sc -= Math.abs(hs.reduce((a, b) => a + b, 0) / hs.length - p.shoulder_height_cm) / 3;
        const gap = Math.max(...hs, p.shoulder_height_cm) - Math.min(...hs, p.shoulder_height_cm);
        if (gap > SHOULDER_GAP_CM) sc -= 3 + (gap - SHOULDER_GAP_CM) * 1.5;
      }
    }
    if (p.weight_kg) {
      const { above, below } = neighbours(pos);
      const over = (up, down) => (up && down ? up - down - WEIGHT_GAP_KG : 0);
      for (const diff of [over(above?.weight_kg, p.weight_kg), over(p.weight_kg, below?.weight_kg)]) if (diff > 0) sc -= 15 + diff * 1.5;
    }
    return { sc, ex, cat };
  }

  const used = new Set();
  const map = new Map();
  const pick = (pos, prof, isFree) => {
    let best = null;
    for (const p of pool) {
      if (!isFree(p)) continue;
      const isKid = p.age != null && p.age <= KID_MAX_AGE;
      if (isKid && !prof.kids) continue;
      if (prof.music && p.instrument !== prof.music) continue;
      const { sc, ex, cat } = score(p, pos, prof);
      if (!best || sc > best.score) best = { person: p, score: sc, exact: ex, cat };
    }
    return best;
  };

  for (const { pos, prof } of open) {
    const best = pick(pos, prof, (p) => !used.has(p.id));
    if (best) {
      used.add(best.person.id);
      placed.set(pos.key, best.person);
      map.set(pos.key, { person: best.person, exact: best.exact, cat: best.cat });
    } else {
      map.set(pos.key, null);
    }
  }

  // Omplint d'un en un, l'últim pis (segons) pot quedar desnivellat o amb pesos invertits. Es prova d'intercanviar
  // cada persona del tronc amb una altra del tronc, de la pinya o de les lliures, mentre el conjunt millori. Només es
  // torna a puntuar el que canvia: el tronc sencer (els veïns també hi surten) i, si ve de la pinya, la seva posició.
  const fits = (p, prof) => (prof.kids || !(p.age != null && p.age <= KID_MAX_AGE)) && (!prof.music || p.instrument === prof.music);
  const tronc = open.filter(({ pos }) => ['tronc', 'baixos', 'agulla'].includes(pos.group) && map.get(pos.key));
  const others = open.filter((o) => !tronc.includes(o) && map.get(o.pos.key) && !o.prof.music);
  const troncScore = () => tronc.reduce((sum, { pos, prof }) => sum + score(placed.get(pos.key), pos, prof).sc, 0);
  const put = (pos, p) => { placed.set(pos.key, p); map.set(pos.key, { person: p, exact: exact.get(`${pos.key}|${p.id}`) || 0, cat: byCat[p.id]?.[pos.cat] || 0 }); };
  let base = troncScore();
  for (let round = 0, better = true; better && round < 6; round++) {
    better = false;
    for (const a of tronc) {
      const pa = placed.get(a.pos.key);
      const options = [...tronc.filter((b) => b !== a), ...others].map((b) => ({ b, p: placed.get(b.pos.key) }))
        .concat(pool.filter((p) => !used.has(p.id)).map((p) => ({ p })));
      for (const { b, p } of options) {
        if (!fits(p, a.prof) || (b && !fits(pa, b.prof))) continue;
        const outside = b && !tronc.includes(b);
        const before = base + (outside ? score(p, b.pos, b.prof).sc : 0);
        put(a.pos, p);
        if (b) put(b.pos, pa);
        const now = troncScore();
        if (now + (outside ? score(pa, b.pos, b.prof).sc : 0) > before + 0.01) {
          base = now;
          better = true;
          if (!b) { used.delete(pa.id); used.add(p.id); }
          break;
        }
        put(a.pos, pa);
        if (b) put(b.pos, p);
      }
    }
  }

  // Relleus: per a cada posició del tronc, del pom i del pilar, la millor persona de les que han quedat lliures
  // (cadascú com a molt un cop). Es mira com si ocupés aquella posició amb els mateixos companys.
  const reliefs = new Map();
  if (options.reliefs) {
    const spare = new Set();
    for (const { pos, prof } of open) {
      if (!prof.core || !map.get(pos.key)) continue;
      const holder = placed.get(pos.key);
      placed.delete(pos.key);
      const best = pick(pos, prof, (p) => !used.has(p.id) && !spare.has(p.id));
      placed.set(pos.key, holder);
      if (best) { spare.add(best.person.id); reliefs.set(pos.key, { person: best.person, exact: best.exact, cat: best.cat }); }
    }
  }

  const filled = [...map.values()].filter(Boolean).length;
  return { map, reliefs, filled, empty: map.size - filled, unused: pool.filter((p) => !used.has(p.id)) };
}
