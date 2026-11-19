import { db } from '../../db.js';
import { SHOULDER_GAP_CM, castellName, levelGaps, levelNames, levelRange, structureOf, weightInversions } from '../../public/castell.js';
import { can, getCastell, publicName } from '../util.js';
import { route } from '../router.js';
import { CAME_SQL } from '../sql.js';
import { memo } from '../cache.js';
import { historyIndex, historyRows, pastRows } from '../history.js';
import { seasons, statsFilter } from './stats.js';

// ---------- Estadístiques per a la tècnica ----------
// Un castell és cosa de tota la colla: aquí no es mira qui ha fallat, sinó què acompanya els bons resultats
// (tronc estable, experiència a cada posició, pinya plena), com progressa cada castell, qui pot fer de recanvi
// i com està preparat el tronc de les properes diades.
export const TRONC_GROUPS = ['baixos', 'tronc', 'pom', 'agulla'];
export const outcomeOf = (r) => (r === 'descarregat' ? 'descarregat' : r === 'carregat' ? 'carregat' : 'caigut');
export const emptyOutcome = () => ({ n: 0, descarregat: 0, carregat: 0, caigut: 0 });
export const STABLE = 0.75, EXPERIENCED = 0.75, FULL_PINYA = 0.9;

// Recanvis: per a cada castell, qui ha fet cada posició del tronc en aquell mateix castell.
// Una mateixa posició no és igual en un 3de7 que en un 4de8, per això no es barregen castells diferents.
export const MIN_PEOPLE = 2, MIN_TIMES = 2, SHOULDER_GAP = 4, WEIGHT_GAP = 10;
export const median = (list) => { const v = list.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
export function reserves(query) {
  const people = db.prepare('SELECT id, name, alias, active, shoulder_height_cm, weight_kg FROM people').all();
  const byId = new Map(people.map((p) => [p.id, p]));
  const rows = historyRows({ query }).filter((r) => r.result !== 'previst');
  const types = new Map();
  const catCount = new Map(); // persona → categoria (Baixos, Segons…) → vegades, en qualsevol castell
  for (const r of rows) {
    if (!TRONC_GROUPS.includes(r.group)) continue;
    const cats = catCount.get(r.person_id) || new Map();
    cats.set(r.cat, (cats.get(r.cat) || 0) + 1);
    catCount.set(r.person_id, cats);
    const name = r.castell;
    const t = types.get(name) || { castell: name, sample: r, attempts: new Set(), pos: new Map() };
    t.attempts.add(r.castell_id);
    const m = t.pos.get(r.pos_key) || new Map();
    m.set(r.person_id, (m.get(r.person_id) || 0) + 1);
    t.pos.set(r.pos_key, m);
    types.set(name, t);
  }
  return [...types.values()].sort((a, b) => b.attempts.size - a.attempts.size).map((t) => {
    const s = structureOf(t.sample);
    const positions = [...s.positions.values()].filter((p) => TRONC_GROUPS.includes(p.group)).map((p) => {
      const done = [...(t.pos.get(p.key) || [])].filter(([id]) => byId.get(id)?.active)
        .map(([id, n]) => ({ id, name: publicName(byId.get(id)), n })).sort((a, b) => b.n - a.n);
      const few = done.filter((d) => d.n >= MIN_TIMES).length < MIN_PEOPLE;
      let suggest = [];
      if (few) {
        // Gent amb mides semblants a les de qui ja l'ha fet, i amb experiència al mateix pis en altres castells.
        const sh = median(done.map((d) => byId.get(d.id).shoulder_height_cm));
        const wt = median(done.map((d) => byId.get(d.id).weight_kg));
        const taken = new Set(done.map((d) => d.id));
        suggest = people.filter((x) => x.active && !taken.has(x.id) && (sh != null || wt != null)
            && (sh == null || (x.shoulder_height_cm != null && Math.abs(x.shoulder_height_cm - sh) <= SHOULDER_GAP))
            && (wt == null || (x.weight_kg != null && Math.abs(x.weight_kg - wt) <= WEIGHT_GAP)))
          .map((x) => ({ id: x.id, name: publicName(x), n: catCount.get(x.id)?.get(p.cat) || 0 }))
          .sort((a, b) => b.n - a.n || (a.name || '').localeCompare(b.name || '')).slice(0, 4);
      }
      return { key: p.key, role: p.role, cat: p.cat, people: done, few, suggest };
    });
    return { castell: t.castell, attempts: t.attempts.size, positions };
  });
}

// Preparació del tronc d'un castell: qui l'ha assajat abans (mateix castell, mateixa posició).
export const PREP_DAYS = 42;
export function troncPrep(castell) {
  const s = structureOf(castell);
  const keys = [...s.positions.values()].filter((p) => TRONC_GROUPS.includes(p.group));
  const placedRows = new Map(db.prepare('SELECT pos_key, person_id, guest_id FROM castell_positions WHERE castell_id = ?')
    .all(castell.id).map((r) => [r.pos_key, r]));
  const date = castell.date || db.prepare('SELECT date FROM events WHERE id = ?').get(castell.event_id)?.date;
  const since = new Date(`${date}T12:00:00`); since.setDate(since.getDate() - PREP_DAYS);
  const sinceIso = since.toISOString().slice(0, 10);
  const past = (historyIndex().byName.get(castellName(castell)) || []).filter((r) => r.castell_id !== castell.id && r.date < date);
  // Relleus: altres persones actives que ja han fet bé (descarregat o carregat) aquesta posició en aquest castell.
  const active = new Set(db.prepare('SELECT id FROM people WHERE active = 1').all().map((r) => r.id));
  const good = new Map();
  for (const x of past) {
    if ((x.result !== 'descarregat' && x.result !== 'carregat') || !active.has(x.person_id)) continue;
    if (!good.has(x.pos_key)) good.set(x.pos_key, new Set());
    good.get(x.pos_key).add(x.person_id);
  }
  const rate = attendanceRate(date);
  return keys.map((p) => {
    const r = placedRows.get(p.key);
    const mine = r?.person_id ? past.filter((x) => x.pos_key === p.key && x.person_id === r.person_id) : [];
    const others = [...(good.get(p.key) || [])].filter((id) => id !== r?.person_id);
    return { key: p.key, role: p.role, person_id: r?.person_id || null, guest: !!r?.guest_id,
      recent: mine.filter((x) => x.type === 'assaig' && x.date >= sinceIso).length,
      ever: mine.length, last: mine.map((x) => x.date).sort().pop() || null,
      reliefs: others.length, attendance: r?.person_id ? rate.get(r.person_id) ?? null : null };
  });
}

// Percentatge de sessions (assajos i diades) dels últims 3 mesos a què ha vingut cada persona, abans d'una data.
export const RATE_DAYS = 90, RATE_MIN_SESSIONS = 4;
export function attendanceRate(date) {
  const since = new Date(`${date}T12:00:00`); since.setDate(since.getDate() - RATE_DAYS);
  const events = db.prepare(`SELECT COUNT(*) AS n FROM events WHERE type IN ('assaig','diada') AND date >= ? AND date < ?
    AND date < date('now','localtime')`).get(since.toISOString().slice(0, 10), date).n;
  const out = new Map();
  if (events < RATE_MIN_SESSIONS) return out;
  for (const r of db.prepare(`SELECT a.person_id, COUNT(*) AS n FROM attendance a JOIN events e ON e.id = a.event_id
      WHERE e.type IN ('assaig','diada') AND e.date >= ? AND e.date < ? AND e.date < date('now','localtime') AND ${CAME_SQL}
      GROUP BY a.person_id`).all(since.toISOString().slice(0, 10), date)) out.set(r.person_id, Math.round((r.n / events) * 100));
  return out;
}

route('GET', '/api/castells/:id/prep', ({ params }) => ({ days: PREP_DAYS, positions: troncPrep(getCastell(params.id)) }), 'staff');

// Posicions del tronc i de la pinya de cada estructura (les estructures són compartides: es calcula un sol cop).
export const partsCache = new WeakMap();
export function keysByPart(s) {
  if (!partsCache.has(s)) {
    const positions = [...s.positions.values()];
    partsCache.set(s, {
      troncKeys: positions.filter((p) => TRONC_GROUPS.includes(p.group)).map((p) => p.key),
      pinyaKeys: positions.filter((p) => !TRONC_GROUPS.includes(p.group) && p.group !== 'musica').map((p) => p.key),
    });
  }
  return partsCache.get(s);
}

// On falla un castell: per a cada pis, quants intents no descarregats hi van fallar i per què (de dalt a baix).
export function failPoints(attempts) {
  const failed = attempts.filter((a) => a.result !== 'descarregat' && a.result !== 'previst');
  const levels = new Map();
  const causes = {};
  for (const a of failed) {
    if (a.fail?.cause) causes[a.fail.cause] = (causes[a.fail.cause] || 0) + 1;
    if (!a.fail?.level) continue;
    const l = levels.get(a.fail.level) || { level: a.fail.level, label: a.fail.label, n: 0, causes: {} };
    l.n++;
    if (a.fail.cause) l.causes[a.fail.cause] = (l.causes[a.fail.cause] || 0) + 1;
    levels.set(a.fail.level, l);
  }
  const located = [...levels.values()].reduce((sum, l) => sum + l.n, 0);
  return { failed: failed.length, unknown: failed.length - located, causes, levels: [...levels.values()].sort((a, b) => b.level - a.level) };
}

route('GET', '/api/stats/tecnica', memo('tecnica', ({ query, user }) => {
  const { where, args } = statsFilter(query);
  const inFilter = new Set(db.prepare(`SELECT c.id FROM castells c JOIN events e ON e.id = c.event_id WHERE ${where.join(' AND ')}`)
    .all(...args).map((r) => r.id));
  // L'estabilitat i l'experiència es calculen amb tota la història anterior, encara que es miri una sola temporada.
  const all = db.prepare(`SELECT c.*, e.date, e.title, e.type FROM castells c JOIN events e ON e.id = c.event_id
    WHERE e.date <= date('now','localtime') ORDER BY e.date, e.start_time, c.position, c.id`).all();
  // Qui hi havia a cada posició: la gent surt de l'historial (ja calculat) i les persones temporals, d'una consulta a part.
  const placed = new Map();
  const fill = (castellId, key, personId) => {
    if (!placed.has(castellId)) placed.set(castellId, new Map());
    placed.get(castellId).set(key, personId);
  };
  for (const r of pastRows().rows) fill(r.castell_id, r.pos_key, r.person_id);
  const byId = new Map(all.map((c) => [c.id, c]));
  for (const r of db.prepare('SELECT castell_id, pos_key FROM castell_positions WHERE person_id IS NULL').all()) {
    const c = byId.get(r.castell_id);
    if (c && structureOf(c).positions.has(r.pos_key)) fill(r.castell_id, r.pos_key, null);
  }

  const factors = {
    stability: { high: emptyOutcome(), low: emptyOutcome() },
    experience: { high: emptyOutcome(), low: emptyOutcome() },
    pinya: { high: emptyOutcome(), low: emptyOutcome() },
    level: { high: emptyOutcome(), low: emptyOutcome() },
    weight: { high: emptyOutcome(), low: emptyOutcome() },
  };
  // Les mides són les d'ara de cada persona (no es guarda com eren el dia del castell).
  const measures = new Map(db.prepare('SELECT id, shoulder_height_cm, weight_kg FROM people').all().map((p) => [p.id, p]));
  const add = (bucket, res) => { bucket.n++; bucket[outcomeOf(res)]++; };
  const done = new Map();       // «amplada|posició|persona» → vegades que l'ha fet abans
  const lastTronc = new Map();  // nom del castell → tronc de l'últim cop (posició → persona)
  const types = new Map();

  for (const c of all) {
    if (c.result === 'previst') continue; // no consta que s'hagi fet
    const filled = placed.get(c.id) || new Map();
    const { troncKeys, pinyaKeys } = keysByPart(structureOf(c));
    const troncPeople = troncKeys.filter((k) => filled.get(k));
    const name = castellName(c);
    const { partial } = levelRange(c);

    if (inFilter.has(c.id) && troncPeople.length) {
      const prev = lastTronc.get(name);
      const common = prev ? troncKeys.filter((k) => prev.has(k)) : [];
      if (common.length) add(factors.stability[common.filter((k) => prev.get(k) === filled.get(k)).length / common.length >= STABLE ? 'high' : 'low'], c.result);
      const expert = troncPeople.filter((k) => done.get(`${c.width}|${k}|${filled.get(k)}`)).length / troncPeople.length;
      add(factors.experience[expert >= EXPERIENCED ? 'high' : 'low'], c.result);
      if (pinyaKeys.length) add(factors.pinya[pinyaKeys.filter((k) => filled.has(k)).length / pinyaKeys.length >= FULL_PINYA ? 'high' : 'low'], c.result);
      const s = structureOf(c);
      const get = (k) => measures.get(filled.get(k));
      const gaps = levelGaps(s, get);
      if (gaps.length) add(factors.level[gaps.every((g) => g.gap <= SHOULDER_GAP_CM) ? 'high' : 'low'], c.result);
      // Només compta si se sap el pes de, com a mínim, la meitat del tronc.
      if (troncPeople.filter((k) => get(k)?.weight_kg).length * 2 >= troncPeople.length) {
        add(factors.weight[weightInversions(s, get).length ? 'low' : 'high'], c.result);
      }
    }
    if (inFilter.has(c.id)) {
      const t = types.get(name) || { castell: name, attempts: [] };
      const levels = levelNames(c);
      const { from, to } = levelRange(c);
      const label = (L) => levels.find((l) => l.level === L)?.label;
      t.attempts.push({ castell_id: c.id, date: c.date, title: c.title, type: c.type, result: c.result, partial,
        range: partial ? `${label(from)} – ${label(to)}` : null, notes: (!user || can(user, 'castells')) && c.tech_notes || null,
        fail: c.fail_level || c.fail_cause ? { level: c.fail_level, label: label(c.fail_level) || null, cause: c.fail_cause } : null });
      types.set(name, t);
    }
    // Després de comptar-lo, aquest castell passa a ser experiència i «l'últim tronc» per als següents.
    for (const k of troncPeople) done.set(`${c.width}|${k}|${filled.get(k)}`, (done.get(`${c.width}|${k}|${filled.get(k)}`) || 0) + 1);
    if (troncPeople.length) lastTronc.set(name, new Map(troncPeople.map((k) => [k, filled.get(k)])));
  }

  const rate = (list) => (list.length ? Math.round((list.filter((a) => a.result === 'descarregat').length / list.length) * 100) : null);
  const castells = [...types.values()].map((t) => {
    const full = t.attempts.filter((a) => !a.partial);
    const first = full.findIndex((a) => a.result === 'descarregat');
    return {
      ...t,
      full: full.length,
      partials: t.attempts.length - full.length,
      tilFirst: first >= 0 ? first + 1 : null,
      assajos: rate(full.filter((a) => a.type === 'assaig')),
      diades: rate(full.filter((a) => a.type !== 'assaig')),
      notes: t.attempts.filter((a) => a.notes).slice(-9).reverse(),
      fails: failPoints(t.attempts),
    };
  }).sort((a, b) => b.attempts.length - a.attempts.length);

  const upcoming = db.prepare(`SELECT c.*, e.date, e.title, e.type FROM castells c JOIN events e ON e.id = c.event_id
    WHERE e.date >= date('now','localtime') AND e.type != 'assaig' ORDER BY e.date, e.start_time, c.position, c.id`).all();
  return {
    seasons: seasons(),
    factors,
    castells,
    reserves: reserves(query),
    prep: upcoming.map((c) => {
      const rows = troncPrep(c);
      return { castell_id: c.id, event_id: c.event_id, date: c.date, title: c.title, castell: castellName(c),
        total: rows.length, placed: rows.filter((r) => r.person_id).length, rehearsed: rows.filter((r) => r.recent).length,
        noRelief: rows.filter((r) => r.person_id && !r.reliefs).length };
    }).filter((c) => c.placed),
  };
}, { variant: ({ user }) => (!user || can(user, 'castells') ? '' : 'sense-notes') }), 'staff');
