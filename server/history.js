import { db } from '../db.js';
import { castellName, structureOf } from '../public/castell.js';
import { fail, getCastell, seesHidden } from './util.js';
import { route } from './router.js';
import { historyKey } from './cache.js';

// ---------- Historial de posicions ----------
// L'historial surt dels castells de sessions passades (fins avui inclòs). Les files són compartides: no es modifiquen.
export let pastCache = null;
// Una fila per persona i posició de cada castell passat, amb les dades del castell i de la sessió, i la categoria,
// el nom i el grup de la posició ja calculats. Es construeixen a mà (no amb un JOIN) perquè amb anys d'historial
// són més de cent mil files i llegir-les així és molt més ràpid.
export function HistoryRow(c, pos_key, person_id, pos, castell) {
  this.pos_key = pos_key; this.person_id = person_id; this.cat = pos.cat; this.role = pos.role; this.group = pos.group; this.castell = castell;
  this.castell_id = c.castell_id; this.width = c.width; this.height = c.height; this.agulla = c.agulla; this.folre = c.folre;
  this.manilles = c.manilles; this.puntals = c.puntals; this.sota = c.sota; this.gralles = c.gralles; this.timbals = c.timbals; this.net = c.net;
  this.from_level = c.from_level; this.to_level = c.to_level; this.cordons = c.cordons; this.taps = c.taps; this.result = c.result;
  this.event_id = c.event_id; this.date = c.date; this.title = c.title; this.type = c.type; this.hidden = c.hidden;
}
export function pastRows() {
  if (pastCache?.key !== historyKey()) {
    const castells = db.prepare(`SELECT c.id AS castell_id, c.width, c.height, c.agulla, c.folre, c.manilles, c.puntals, c.sota, c.gralles,
        c.timbals, c.net, c.from_level, c.to_level, c.cordons, c.taps, c.result, e.id AS event_id, e.date, e.title, e.type, MAX(c.hidden, e.hidden) AS hidden
      FROM castells c JOIN events e ON e.id = c.event_id WHERE e.date <= date('now','localtime') ORDER BY e.date DESC, c.position`).all();
    const byCastell = new Map();
    for (const p of db.prepare('SELECT castell_id, pos_key, person_id FROM castell_positions WHERE person_id IS NOT NULL').all()) {
      let list = byCastell.get(p.castell_id);
      if (!list) byCastell.set(p.castell_id, (list = []));
      list.push(p);
    }
    const rows = [];
    const byPerson = new Map();
    for (const c of castells) {
      const s = structureOf(c);
      const name = castellName(c);
      for (const p of byCastell.get(c.castell_id) || []) {
        const pos = s.positions.get(p.pos_key);
        // Una posició que la plantilla de la colla ha tret no compta (la fila es conserva per si es torna a posar).
        if (!pos) continue;
        const row = new HistoryRow(c, p.pos_key, p.person_id, pos, name);
        rows.push(row);
        let mine = byPerson.get(p.person_id);
        if (!mine) byPerson.set(p.person_id, (mine = []));
        mine.push(row);
      }
    }
    pastCache = { key: historyKey(), rows, byPerson };
  }
  return pastCache;
}
// Els mateixos filtres que statsFilter, però sobre les files ja llegides.
// visibleOnly: el que pot veure un membre (sense sessions ni castells ocults).
export function historyRows({ personId, excludeCastell, query, visibleOnly = false } = {}) {
  const season = query?.get('season') || '';
  const kind = query?.get('kind');
  const year = /^\d{4}$/.test(season) ? season : null;
  const types = kind === 'diades' ? ['diada', 'esdeveniment'] : kind === 'assajos' ? ['assaig'] : null;
  const person = personId ? Number(personId) : null;
  const exclude = excludeCastell ? Number(excludeCastell) : null;
  const past = pastRows();
  return (person ? past.byPerson.get(person) || [] : past.rows).filter((r) => (!exclude || r.castell_id !== exclude) && !(visibleOnly && r.hidden)
    && (!year || r.date.startsWith(year)) && (!types || types.includes(r.type)));
}

// Índex de totes les posicions dels castells passats, per a l'historial i la preparació de cada castell.
// Llegir-les totes (milers de files) és el que fa lenta la pàgina d'un castell: es llegeixen un sol cop i es
// reaprofiten fins al següent canvi (vegeu «Memòria de càlculs»).
export let historyCache = null;
export function historyIndex() {
  const key = historyKey();
  if (historyCache?.key === key) return historyCache;
  const byName = new Map();     // «3d7» → files de castells fets (no previstos)
  const byCat = {};             // persona → { categoria de posició: vegades }
  const catsByCastell = new Map(); // castell → [[persona, categoria]], per poder-ne treure un
  for (const r of historyRows()) {
    if (r.result !== 'previst') {
      if (!byName.has(r.castell)) byName.set(r.castell, []);
      byName.get(r.castell).push({ castell_id: r.castell_id, pos_key: r.pos_key, person_id: r.person_id, date: r.date, type: r.type, result: r.result });
    }
    const { cat } = r;
    (byCat[r.person_id] ??= {})[cat] = (byCat[r.person_id][cat] || 0) + 1;
    if (!catsByCastell.has(r.castell_id)) catsByCastell.set(r.castell_id, []);
    catsByCastell.get(r.castell_id).push([r.person_id, cat]);
  }
  historyCache = { key, byName, byCat, catsByCastell };
  return historyCache;
}

route('GET', '/api/castells/:id/history', ({ params, user }) => {
  const castell = getCastell(params.id);
  const index = historyIndex();
  const exact = new Map();
  // Una mateixa posició no és igual en castells diferents: només compta el mateix castell (un 3d7 amb altres 3d7).
  const same = new Set();
  for (const r of index.byName.get(castellName(castell)) || []) {
    if (r.castell_id === castell.id) continue;
    same.add(r.castell_id);
    const k = `${r.pos_key}|${r.person_id}`;
    const e = exact.get(k) || { pos_key: r.pos_key, person_id: r.person_id, n: 0, last: r.date };
    e.n++;
    exact.set(k, e);
  }
  // L'experiència per tipus de posició, sense comptar aquest mateix castell.
  const byCat = structuredClone(index.byCat);
  for (const [person, cat] of index.catsByCastell.get(castell.id) || []) {
    if (--byCat[person][cat] === 0) delete byCat[person][cat];
    if (!Object.keys(byCat[person]).length) delete byCat[person];
  }
  const people = new Map(db.prepare('SELECT id, name, alias FROM people').all().map((p) => [p.id, p]));
  return {
    castellsCount: same.size,
    exact: [...exact.values()].map((e) => ({ ...e, name: people.get(e.person_id)?.name, alias: people.get(e.person_id)?.alias })),
    byCat: user.role === 'admin' ? byCat : undefined,
  };
}, 'staff');

route('GET', '/api/people/:id/history', ({ params, user }) => {
  const personId = Number(params.id);
  if (user.role !== 'admin' && user.id !== personId) fail(403, 'Només pots veure el teu historial');
  const rows = historyRows({ personId, visibleOnly: !seesHidden(user) });
  const cats = new Map();
  for (const { cat, date } of rows) {
    const c = cats.get(cat) || { cat, n: 0, last: date };
    c.n++;
    cats.set(cat, c);
  }
  return {
    total: rows.length,
    byCat: [...cats.values()].sort((a, b) => b.n - a.n),
    recent: rows.slice(0, 20).map((r) => ({
      date: r.date, title: r.title, type: r.type, event_id: r.event_id, castell_id: r.castell_id, result: r.result,
      castell: r.castell, role: r.role,
    })),
  };
});
