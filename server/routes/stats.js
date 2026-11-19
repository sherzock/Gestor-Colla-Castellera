import net from 'node:net';
import { db } from '../../db.js';
import { castellName, levelRange } from '../../public/castell.js';
import { fail, publicPerson, seesHidden } from '../util.js';
import { route } from '../router.js';
import { CAME_SQL } from '../sql.js';
import { castellKey, memo } from '../cache.js';
import { historyRows } from '../history.js';

// ---------- Estadístiques ----------
// Una temporada és un any natural (2025, 2026…). Només compten les sessions passades (fins avui inclòs).
export const STATS_RESULTS = ['descarregat', 'carregat', 'intent', 'intent desfet', 'previst'];
export const emptyResults = () => Object.fromEntries(STATS_RESULTS.map((r) => [r, 0]));
export const resultOf = (r) => (STATS_RESULTS.includes(r.result) ? r.result : 'previst');

// Filtre comú: temporada (any) i tipus de sessió (diades o assajos).
export function statsFilter(query, { visibleOnly = false } = {}) {
  const where = ["e.date <= date('now','localtime')"];
  if (visibleOnly) where.push('e.hidden = 0');
  const args = [];
  const season = query?.get('season') || '';
  const kind = query?.get('kind');
  if (/^\d{4}$/.test(season)) { where.push("strftime('%Y', e.date) = ?"); args.push(season); }
  if (kind === 'diades') where.push("e.type IN ('diada', 'esdeveniment')");
  else if (kind === 'assajos') where.push("e.type = 'assaig'");
  return { where, args };
}

export function seasons() {
  const years = db.prepare("SELECT DISTINCT strftime('%Y', date) AS y FROM events WHERE date <= date('now','localtime') ORDER BY y DESC")
    .all().map((r) => r.y);
  const now = String(new Date().getFullYear());
  if (!years.includes(now)) years.unshift(now);
  return years;
}

// Sessions on la persona ha vingut, per tipus.
export function sessionsCame(query, personId = null, visibleOnly = false) {
  const { where, args } = statsFilter(query, { visibleOnly });
  if (personId) { where.push('a.person_id = ?'); args.push(personId); }
  return db.prepare(`SELECT a.person_id, e.type, COUNT(*) AS n FROM attendance a JOIN events e ON e.id = a.event_id
    WHERE ${CAME_SQL} AND ${where.join(' AND ')} GROUP BY a.person_id, e.type`).all(...args);
}

export const byCount = (a, b) => b.n - a.n || String(a.castell ?? a.cat).localeCompare(String(b.castell ?? b.cat));

export function personStats(personId, query, visibleOnly) {
  const rows = historyRows({ personId, query, visibleOnly });
  const results = emptyResults();
  const byCastell = new Map();
  const byPosition = new Map();
  for (const r of rows) {
    const res = resultOf(r);
    const { cat, castell: name } = r;
    results[res]++;
    const c = byCastell.get(name) || { castell: name, n: 0, partial: 0, results: emptyResults(), positions: new Map() };
    c.n++;
    c.results[res]++;
    if (levelRange(r).partial) c.partial++;
    c.positions.set(cat, (c.positions.get(cat) || 0) + 1);
    byCastell.set(name, c);
    const p = byPosition.get(cat) || { cat, n: 0, results: emptyResults() };
    p.n++;
    p.results[res]++;
    byPosition.set(cat, p);
  }
  const sessions = {};
  for (const r of sessionsCame(query, personId, visibleOnly)) sessions[r.type] = r.n;
  return {
    total: rows.length,
    results,
    sessions,
    byCastell: [...byCastell.values()].map((c) => ({ ...c, positions: [...c.positions].map(([cat, n]) => ({ cat, n })).sort(byCount) })).sort(byCount),
    byPosition: [...byPosition.values()].sort(byCount),
    recent: rows.slice(0, 15).map((r) => ({
      date: r.date, title: r.title, type: r.type, castell_id: r.castell_id, result: r.result, partial: levelRange(r).partial,
      castell: r.castell, role: r.role,
    })),
  };
}

route('GET', '/api/stats/people/:id', ({ params, user, query }) => {
  const personId = Number(params.id);
  if (user.role !== 'admin' && user.id !== personId) fail(403, 'Només pots veure les teves estadístiques');
  const person = db.prepare('SELECT id, name, alias, instrument FROM people WHERE id = ?').get(personId);
  if (!person) fail(404, 'Persona no trobada');
  return { person: user.role === 'admin' ? person : publicPerson(person), seasons: seasons(), ...personStats(personId, query, !seesHidden(user)) };
});

route('GET', '/api/stats/people', memo('people', ({ query }) => {
  const people = new Map(db.prepare('SELECT id, name, alias, instrument, active FROM people WHERE erased_at IS NULL').all()
    .map((p) => [p.id, { ...p, castells: 0, sessions: 0, results: emptyResults(), cats: new Map() }]));
  for (const r of historyRows({ query })) {
    const p = people.get(r.person_id);
    if (!p) continue;
    p.castells++;
    p.results[resultOf(r)]++;
    p.cats.set(r.cat, (p.cats.get(r.cat) || 0) + 1);
  }
  for (const r of sessionsCame(query)) {
    const p = people.get(r.person_id);
    if (p) p.sessions += r.n;
  }
  const list = [...people.values()]
    .filter((p) => p.active || p.castells || p.sessions)
    .map(({ cats, ...p }) => {
      const [top] = [...cats].sort((a, b) => b[1] - a[1]);
      return { ...p, top: top ? { cat: top[0], n: top[1] } : null };
    })
    .sort((a, b) => b.castells - a.castells || b.sessions - a.sessions || a.name.localeCompare(b.name));
  return { seasons: seasons(), people: list };
}), 'staff');

route('GET', '/api/stats/castells', memo('castells', ({ query }) => {
  const { where, args } = statsFilter(query);
  const rows = db.prepare(`SELECT c.id, c.width, c.height, c.agulla, c.folre, c.manilles, c.puntals, c.sota, c.net, c.from_level, c.to_level,
      c.result, c.label, e.id AS event_id, e.date, e.title, e.type
    FROM castells c JOIN events e ON e.id = c.event_id
    WHERE ${where.join(' AND ')} ORDER BY e.date DESC, c.position`).all(...args);
  const totals = emptyResults();
  const types = new Map();
  for (const r of rows) {
    const res = resultOf(r);
    const partial = levelRange(r).partial;
    const name = castellName(r);
    totals[res]++;
    const c = types.get(name) || { castell: name, n: 0, partial: 0, assajos: 0, diades: 0, results: emptyResults(), firstDescarregat: null, attempts: [] };
    c.n++;
    c.results[res]++;
    if (partial) c.partial++;
    if (r.type === 'assaig') c.assajos++; else c.diades++;
    // El primer descarregat és el primer castell sencer descarregat (les proves parcials no compten).
    if (res === 'descarregat' && !partial) c.firstDescarregat = r.date;
    c.attempts.push({ castell_id: r.id, date: r.date, title: r.title, type: r.type, result: r.result, partial, label: r.label });
    types.set(name, c);
  }
  return { seasons: seasons(), total: rows.length, results: totals, castells: [...types.values()].sort(byCount) };
}, { keyOf: castellKey }), 'staff');

// Resum de temporada: castells i sessions, sense dades de ningú (el veu tothom).
// Dificultat aproximada per trobar el millor castell: mana l'alçada; a igual alçada, com més estret, més difícil.
export const WIDTH_DIFFICULTY = { 1: 6, 2: 5, 9: 4, 7: 3.5, 5: 3, 3: 2, 4: 1 };
export const difficulty = (c) => c.height * 10 + (WIDTH_DIFFICULTY[c.width] || 0) + (c.agulla ? 0.5 : 0) + (c.net ? 0.3 : 0);

route('GET', '/api/stats/season', memo('season', ({ query, user }) => {
  const visibleOnly = !seesHidden(user);
  const { where, args } = statsFilter(query, { visibleOnly });
  const rows = db.prepare(`SELECT c.id, c.width, c.height, c.agulla, c.folre, c.manilles, c.puntals, c.sota, c.net, c.from_level, c.to_level,
      c.result, e.id AS event_id, e.date, e.title, e.type
    FROM castells c JOIN events e ON e.id = c.event_id WHERE ${where.join(' AND ')}${visibleOnly ? ' AND c.hidden = 0' : ''}
    ORDER BY e.date, c.position`).all(...args);
  const sessions = db.prepare(`SELECT e.id, e.type, e.date, e.title,
      (SELECT COUNT(*) FROM attendance a WHERE a.event_id = e.id AND ${CAME_SQL}) AS came
    FROM events e WHERE ${where.join(' AND ')} AND e.type != 'musics' ORDER BY e.date`).all(...args);

  const results = emptyResults();
  const best = { descarregat: new Map(), carregat: new Map() };
  const diades = new Map();
  for (const r of rows) {
    const res = resultOf(r);
    results[res]++;
    const partial = levelRange(r).partial;
    const name = castellName(r);
    // Les proves parcials no compten per al millor castell.
    if (!partial && best[res] && !best[res].has(name)) best[res].set(name, { castell: name, castell_id: r.id, date: r.date, title: r.title, score: difficulty(r) });
    if (r.type !== 'assaig') {
      const d = diades.get(r.event_id) || { id: r.event_id, date: r.date, title: r.title, castells: [] };
      d.castells.push({ id: r.id, castell: name, result: r.result, partial });
      diades.set(r.event_id, d);
    }
  }
  const top = (m) => [...m.values()].sort((a, b) => b.score - a.score || a.date.localeCompare(b.date)).map(({ score, ...c }) => c);
  const attendance = {};
  for (const type of ['assaig', 'diada', 'esdeveniment']) {
    const list = sessions.filter((x) => x.type === type);
    const withPeople = list.filter((x) => x.came > 0);
    const max = withPeople.reduce((m, x) => (x.came > (m?.came ?? -1) ? x : m), null);
    attendance[type] = {
      sessions: list.length,
      average: withPeople.length ? Math.round(withPeople.reduce((sum, x) => sum + x.came, 0) / withPeople.length) : 0,
      max: max ? { n: max.came, date: max.date, title: max.title, id: max.id } : null,
    };
  }
  return {
    seasons: seasons(), total: rows.length, results, attendance,
    descarregats: top(best.descarregat), carregats: top(best.carregat),
    diades: [...diades.values()].reverse(),
  };
}, { variant: ({ user }) => (seesHidden(user) ? 'tot' : 'visible') }));
