// Muntador automàtic: proposa qui va a cada posició d'un castell a partir de
// qui ha confirmat, les mides de cada persona i l'historial de posicions.
// És una heurística «golosa»: omple primer les posicions més delicades (pom de dalt,
// tronc de dalt a baix, pilar central), després el folre/manilles i finalment la pinya
// de dins cap a fora, escollint cada vegada la persona amb millor puntuació.
// Si el castell té gralles o timbals, els músics hi van primer (i ja no es fan servir a la pinya).
import { inTroncView } from './castell.js';

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
      const target = { crossa: 0.6, contrafort: 0.8, agulla: 0.65, vent: 0.55, mans: 0.5, lateral: 0.4, latmans: 0.4 }[pos.kind] ?? 0.5;
      // Primer el nucli (contraforts, crosses, agulles) i després cordó a cordó: mans, vents i laterals.
      const inner = { contrafort: 0, crossa: 0.01, agulla: 0.02 }[pos.kind];
      const inRing = { mans: 0, vent: 0.02, lateral: 0.05, latmans: 0.06 }[pos.kind] ?? 0.05;
      return { target, order: inner !== undefined ? 3 + inner : 3 + pos.ring * 0.1 + inRing, kids: false };
    }
  }
}

/**
 * @param structure  resultat de buildStructure()
 * @param candidates persones actives amb status, mides i data de naixement
 * @param current    Map pos_key → assignació actual
 * @param exact      Map "pos_key|person_id" → cops que ha fet aquesta posició en castells de la mateixa amplada
 * @param byCat      { person_id: { categoria: cops } }
 * @param options    { tronc, pinya, musica, keep, maybe }
 * @returns { map: Map pos_key → { person, exact, cat } | null, filled, empty, unused }
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

  const statuses = options.maybe ? ['si', 'potser'] : ['si'];
  const pool = candidates
    .filter((p) => statuses.includes(p.status) && !locked.has(p.id))
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

  const levelShoulders = new Map();
  const used = new Set();
  const map = new Map();

  for (const { pos, prof } of open) {
    let best = null;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const isKid = p.age != null && p.age <= KID_MAX_AGE;
      if (isKid && !prof.kids) continue;
      if (prof.music && p.instrument !== prof.music) continue;
      const ex = exact.get(`${pos.key}|${p.id}`) || 0;
      const cat = byCat[p.id]?.[pos.cat] || 0;
      const xp = expScore(p, pos);
      let score = prof.music ? xp : -Math.abs(wp.get(p.id) - prof.target) * 10 + xp;
      score -= Math.max(0, bestExp.get(p.id) - xp) * 0.7;
      if (prof.core && ex + cat === 0) score -= 6;
      if (pos.group === 'pom' && (p.age ?? 30) >= 16) score -= 12;
      if (prof.level && p.shoulder_height_cm) {
        const sh = levelShoulders.get(prof.level);
        if (sh?.length) score -= Math.abs(sh.reduce((a, b) => a + b, 0) / sh.length - p.shoulder_height_cm) / 3;
      }
      if (!best || score > best.score) best = { person: p, score, exact: ex, cat };
    }
    if (best) {
      used.add(best.person.id);
      if (prof.level && best.person.shoulder_height_cm) {
        levelShoulders.set(prof.level, [...(levelShoulders.get(prof.level) || []), best.person.shoulder_height_cm]);
      }
      map.set(pos.key, { person: best.person, exact: best.exact, cat: best.cat });
    } else {
      map.set(pos.key, null);
    }
  }

  const filled = [...map.values()].filter(Boolean).length;
  return { map, filled, empty: map.size - filled, unused: pool.filter((p) => !used.has(p.id)) };
}
