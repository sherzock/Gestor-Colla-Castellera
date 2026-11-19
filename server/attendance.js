import { db } from '../db.js';
import { structureOf } from '../public/castell.js';
import { STATUSES, bool, cleanExtra, fail, loadFields, localStamp, nowLocal, str } from './util.js';
import { CAME_SQL } from './sql.js';

// Previsió d'assistència d'una sessió que encara no s'ha fet. Per a cada persona: com de sovint ha vingut l'últim any
// a sessions del mateix tipus quan havia dit que sí, que no o quan no havia respost. Amb poca història, la seva xifra
// s'acosta a la de tota la colla. Només es dona el total (amb un marge): cap nom ni cap xifra per persona.
export const FORECAST_DAYS = 365, FORECAST_MIN = 4, FORECAST_PRIOR = 3;
export function attendanceForecast(event, castells) {
  const today = nowLocal().slice(0, 10);
  if (event.date < today) return null;
  const since = new Date(); since.setDate(since.getDate() - FORECAST_DAYS);
  const past = (types) => db.prepare(`SELECT id FROM events WHERE type IN (SELECT value FROM json_each(?)) AND hidden = 0
    AND date >= ? AND date < ? ORDER BY date`).all(JSON.stringify(types), localStamp(since).slice(0, 10), today).map((e) => e.id);
  const musics = event.type === 'musics';
  let ids = past([event.type]);
  if (ids.length < FORECAST_MIN && !musics) ids = past(['assaig', 'diada', 'esdeveniment']);
  if (ids.length < FORECAST_MIN) return { basis: ids.length, enough: false };

  // Respostes i assistència de cada persona a les sessions passades (des de la primera en què consta).
  const tally = () => ({ si: [0, 0], no: [0, 0], none: [0, 0] });
  const byPerson = new Map(), all = tally(), first = new Map();
  const rows = db.prepare(`SELECT a.person_id, a.event_id, a.status, ${CAME_SQL} AS came FROM attendance a
    WHERE a.event_id IN (SELECT value FROM json_each(?))`).all(JSON.stringify(ids));
  const order = new Map(ids.map((id, i) => [id, i]));
  const seen = new Map();
  for (const r of rows) {
    seen.set(`${r.person_id}|${r.event_id}`, r);
    first.set(r.person_id, Math.min(first.get(r.person_id) ?? Infinity, order.get(r.event_id)));
  }
  const people = db.prepare(`SELECT p.id, a.status FROM people p LEFT JOIN attendance a ON a.person_id = p.id AND a.event_id = ?
    WHERE p.active = 1${musics ? ' AND p.instrument IS NOT NULL' : ''}`).all(event.id);
  for (const p of people) {
    const t = tally();
    for (let i = first.get(p.id) ?? ids.length; i < ids.length; i++) {
      const r = seen.get(`${p.id}|${ids[i]}`);
      const cat = r?.status === 'si' ? 'si' : r?.status === 'no' ? 'no' : 'none';
      for (const x of [t[cat], all[cat]]) { x[0]++; x[1] += r?.came ? 1 : 0; }
    }
    byPerson.set(p.id, t);
  }
  const prior = (cat) => (all[cat][1] + 1) / (all[cat][0] + 2);
  const chance = (id, cat) => { const [n, c] = byPerson.get(id)[cat]; return (c + FORECAST_PRIOR * prior(cat)) / (n + FORECAST_PRIOR); };

  const groups = { si: { n: 0, e: 0 }, no: { n: 0, e: 0 }, none: { n: 0, e: 0 } };
  let variance = 0;
  for (const p of people) {
    const cat = p.status === 'si' ? 'si' : p.status === 'no' ? 'no' : 'none';
    const q = chance(p.id, cat);
    groups[cat].n++; groups[cat].e += q; variance += q * (1 - q);
  }
  // Les persones temporals i els acompanyants ja apuntats es compten com a segurs.
  const guests = db.prepare('SELECT COUNT(*) AS n FROM event_guests WHERE event_id = ? AND companion_dropped = 0').get(event.id).n;
  const expected = groups.si.e + groups.no.e + groups.none.e + guests;
  const margin = 1.645 * Math.sqrt(variance); // ~90 %
  // El castell més gran de la sessió: quanta gent cal per fer-lo sencer (sense comptar la música).
  const needed = Math.max(0, ...castells.map((c) => [...structureOf(c).positions.values()].filter((p) => p.group !== 'musica').length));
  return {
    enough: true, basis: ids.length,
    expected: Math.round(expected), low: Math.max(0, Math.floor(expected - margin)), high: Math.ceil(expected + margin),
    yes: groups.si.n, yesExpected: Math.round(groups.si.e),
    unanswered: groups.none.n, unansweredExpected: Math.round(groups.none.e),
    no: groups.no.n, guests, needed: needed || null,
  };
}

export function upsertAttendance(eventId, personId, patch) {
  const current = db.prepare('SELECT * FROM attendance WHERE event_id = ? AND person_id = ?').get(eventId, personId);
  const pick = (k, fallback = null) => (k in patch ? patch[k] : current?.[k] ?? fallback);
  const row = {
    status: pick('status'), came: pick('came'), escoleta: pick('escoleta'),
    extra: 'extra' in patch ? JSON.stringify(patch.extra) : current?.extra ?? null,
    comment: pick('comment'),
  };
  db.prepare(`INSERT INTO attendance (event_id, person_id, status, came, escoleta, extra, comment, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (event_id, person_id) DO UPDATE SET status = excluded.status, came = excluded.came, escoleta = excluded.escoleta,
      extra = excluded.extra, comment = excluded.comment, updated_at = CURRENT_TIMESTAMP`)
    .run(eventId, personId, row.status, row.came, row.escoleta, row.extra, row.comment);
}

export function attendancePatch(event, body, { admin }) {
  const patch = {};
  if ('status' in body) {
    if (body.status !== null && !STATUSES.includes(body.status)) fail(400, 'Estat no vàlid');
    patch.status = body.status;
  }
  if ('extra' in body) patch.extra = cleanExtra(loadFields(event.id), body.extra, !admin && body.status === 'si');
  if ('comment' in body) patch.comment = str(body.comment, 300);
  const tri = (v) => (v === null || v === undefined || v === '' ? null : bool(v));
  if ('escoleta' in body) patch.escoleta = tri(body.escoleta);
  if (admin && 'came' in body) patch.came = tri(body.came);
  return patch;
}
