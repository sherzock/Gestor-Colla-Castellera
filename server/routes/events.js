import net from 'node:net';
import { db } from '../../db.js';
import { overlappingPairs } from '../../public/planning.js';
import { positionOf } from '../../public/castell.js';
import { eventAmount } from '../../public/forms.js';
import { ADMIN_ONLY_CASTELL, EVENT_TYPES, LIMITS, STATUSES, atMost, bool, can, fail, getCastell, getEvent, insertRow, isDate, isTime, loadFields, nowLocal, parseJSON, publicPerson, rsvpOpen, seesHidden, str, updateRow, visibleEvent } from '../util.js';
import { route } from '../router.js';
import { CAME_SQL } from '../sql.js';
import { rolesOf } from './roles.js';
import { attendanceForecast } from '../attendance.js';
import { amountOf, paymentLate, paymentOf } from './payments.js';
import { companionsOf } from './attendance.js';
import { guestsOf } from './guests.js';
import { announceEvent, notify } from '../notifications.js';

// ---------- Rutes: sessions (assajos, diades, esdeveniments) ----------
route('GET', '/api/events', ({ user, query }) => {
  const past = query.get('scope') === 'past';
  // Amb «from» i «to» (calendari) es tornen totes les sessions d'aquell interval, passades o futures.
  const from = query.get('from'), to = query.get('to');
  const range = isDate(from) && isDate(to);
  const when = range ? 'e.date BETWEEN ? AND ?' : past ? "e.date < date('now','localtime')" : "e.date >= date('now','localtime')";
  // Els assajos de músics només els veuen els músics (i els administradors).
  const hideMusics = user.role !== 'admin' && !user.instrument;
  const hidden = !seesHidden(user);
  return db.prepare(`SELECT e.*, a.status AS my_status,
      (SELECT COUNT(*) FROM attendance WHERE event_id = e.id AND status = 'si') AS count_si,
      (SELECT COUNT(*) FROM attendance WHERE event_id = e.id AND status = 'no') AS count_no,
      (SELECT COUNT(*) FROM event_fields WHERE event_id = e.id AND required = 1) AS required_fields,
      (SELECT GROUP_CONCAT(width || '|' || height || '|' || agulla || '|' || folre || '|' || manilles || '|' || puntals || '|' || sota
          || '|' || net || '|' || result, ';')
         FROM (SELECT * FROM castells WHERE event_id = e.id${hidden ? ' AND hidden = 0' : ''} ORDER BY position, id)) AS castells
    FROM events e LEFT JOIN attendance a ON a.event_id = e.id AND a.person_id = ?
    WHERE ${when}${hideMusics ? " AND e.type != 'musics'" : ''}${hidden ? ' AND e.hidden = 0' : ''}
    ORDER BY e.date ${past && !range ? 'DESC' : 'ASC'}, e.start_time ${past && !range ? 'DESC' : 'ASC'}
    LIMIT 200`).all(user.id, ...(range ? [from, to] : [])).map((e) => ({ ...e, rsvp_open: rsvpOpen(e) }));
});

export function eventInput(body) {
  if (!EVENT_TYPES.includes(body.type)) fail(400, 'Tipus de sessió no vàlid');
  if (!isDate(body.date) || body.date < '2000-01-01' || body.date > '2100-12-31') fail(400, 'Data no vàlida');
  if (!isTime(body.start_time) || !isTime(body.end_time)) fail(400, 'Hora no vàlida');
  const title = str(body.title, 120);
  if (!title) fail(400, 'El títol és obligatori');
  if (!isTime(body.escoleta_time)) fail(400, 'Hora no vàlida');
  const escoleta = bool(body.escoleta);
  const until = body.rsvp_until ? String(body.rsvp_until).slice(0, 16) : null;
  if (until && !(isDate(until.slice(0, 10)) && until[10] === 'T' && isTime(until.slice(11)))) fail(400, 'Data límit no vàlida');
  return {
    rsvp_until: until,
    type: body.type, title, date: body.date,
    start_time: str(body.start_time, 5), end_time: str(body.end_time, 5),
    location: str(body.location, 150), description: str(body.description, 4000),
    escoleta, escoleta_time: escoleta ? str(body.escoleta_time, 5) : null,
    ...('hidden' in body ? { hidden: bool(body.hidden) } : {}),
    ...('ask_companions' in body ? { ask_companions: bool(body.ask_companions) } : {}),
    ...('address' in body ? { address: str(body.address, 200) } : {}),
  };
}

route('POST', '/api/events', ({ body }) => {
  atMost(LIMITS.events, 'Com a molt {n} sessions', 'SELECT COUNT(*) AS n FROM events');
  // Es crea oculta, si no es diu el contrari: els membres no la veuen fins que està a punt.
  const data = { hidden: 1, ...eventInput(body) };
  // Una sessió nova al mateix lloc que una d'anterior en recorda l'adreça del mapa, si no se n'hi posa cap.
  if (data.location && !data.address) {
    data.address = db.prepare(`SELECT address FROM events WHERE location = ? AND address IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1`)
      .get(data.location)?.address ?? null;
  }
  const id = insertRow('events', data);
  return getEvent(id);
}, 'sessions');

route('PUT', '/api/events/:id', ({ params, body }) => {
  getEvent(params.id);
  if (body.type === 'musics' && db.prepare('SELECT 1 FROM castells WHERE event_id = ?').get(params.id)) {
    fail(400, 'Els assajos de músics no tenen castells');
  }
  updateRow('events', params.id, eventInput(body));
  return getEvent(params.id);
}, 'sessions');

// Tancar les respostes ara mateix (o tornar-les a obrir, sense data límit).
route('POST', '/api/events/:id/rsvp', ({ params, body }) => {
  getEvent(params.id);
  db.prepare('UPDATE events SET rsvp_until = ? WHERE id = ?').run(body.open ? null : nowLocal(), params.id);
  const event = getEvent(params.id);
  return { ...event, rsvp_open: rsvpOpen(event) };
}, 'attendance');

// Ocultar o tornar a mostrar una sessió o un castell als membres.
route('PUT', '/api/events/:id/hidden', ({ params, body, user }) => {
  const before = getEvent(params.id);
  db.prepare('UPDATE events SET hidden = ? WHERE id = ?').run(bool(body.hidden), params.id);
  // Els castells es creen ocults: qui en porta el permís els pot mostrar d'un cop amb la sessió.
  if (body.castells && !bool(body.hidden) && can(user, 'castells')) db.prepare('UPDATE castells SET hidden = 0 WHERE event_id = ?').run(params.id);
  if (body.notify && before.hidden && !bool(body.hidden)) announceEvent(before);
  return getEvent(params.id);
}, 'sessions');
route('PUT', '/api/castells/:id/hidden', ({ params, body }) => {
  getCastell(params.id);
  db.prepare('UPDATE castells SET hidden = ? WHERE id = ?').run(bool(body.hidden), params.id);
  return getCastell(params.id);
}, 'castells');

route('DELETE', '/api/events/:id', ({ params }) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(params.id);
  return { ok: true };
}, 'sessions');

// Qui surt en dos castells que es fan alhora, parella a parella (només ho veuen els comptes d'administració).
export function planClashes(eventId) {
  const castells = db.prepare('SELECT * FROM castells WHERE event_id = ? AND plan_time IS NOT NULL ORDER BY position, id').all(eventId);
  const pairs = overlappingPairs(castells);
  if (!pairs.length) return [];
  const rows = db.prepare(`SELECT cp.pos_key, cp.person_id, cp.guest_id, COALESCE(g.name, cp.guest_name) AS guest_name, p.name, p.alias
    FROM castell_positions cp LEFT JOIN people p ON p.id = cp.person_id LEFT JOIN event_guests g ON g.id = cp.guest_id WHERE cp.castell_id = ?`);
  const placed = new Map(castells.map((c) => [c.id, rows.all(c.id).filter((r) => (r.person_id || r.guest_id) && positionOf(c, r.pos_key))]));
  const who = (r) => (r.person_id ? `p${r.person_id}` : `g${r.guest_id}`);
  return pairs.map(([a, b]) => {
    const inB = new Map(placed.get(b.id).map((r) => [who(r), r.pos_key]));
    const people = placed.get(a.id).filter((r) => inB.has(who(r))).map((r) => ({ name: r.name, alias: r.alias, guest_name: r.guest_name,
      keys: { [a.id]: r.pos_key, [b.id]: inB.get(who(r)) } }));
    return { a: a.id, b: b.id, people };
  }).filter((x) => x.people.length);
}

route('GET', '/api/events/:id', ({ params, user }) => {
  const event = visibleEvent(params.id, user);
  const isAdmin = user.role === 'admin';
  const fields = loadFields(event.id);
  const mine = db.prepare('SELECT * FROM attendance WHERE event_id = ? AND person_id = ?').get(event.id, user.id);
  // Posicions ocupades: només les que el castell té ara (una plantilla pot haver-ne tret alguna).
  const keysOf = db.prepare('SELECT pos_key FROM castell_positions WHERE castell_id = ?');
  const castells = db.prepare(`SELECT c.* FROM castells c WHERE c.event_id = ?${isAdmin ? '' : ' AND c.hidden = 0'} ORDER BY c.position, c.id`).all(event.id)
    .map((c) => ({ ...c, assigned_count: keysOf.all(c.id).filter((r) => positionOf(c, r.pos_key)).length, ...(isAdmin ? {} : ADMIN_ONLY_CASTELL), ...(can(user, 'castells') ? {} : { tech_notes: undefined }) }));
  const rows = db.prepare(`SELECT p.id, p.name, p.alias, p.instrument, p.section, a.status, a.came, a.escoleta, a.extra, a.comment, a.updated_at,
      a.paid_at, a.received_at, a.received_cash, ${CAME_SQL} AS present
    FROM people p LEFT JOIN attendance a ON a.person_id = p.id AND a.event_id = ?
    WHERE p.active = 1 OR a.status IS NOT NULL OR a.came IS NOT NULL ORDER BY p.name COLLATE NOCASE`).all(event.id);
  const flag = (v) => (v === null || v === undefined ? null : !!v);
  const attendance = rows.map((r) => isAdmin
    ? { ...r, present: !!r.present, came: flag(r.came), escoleta: flag(r.escoleta), extra: parseJSON(r.extra, {}) }
    : { ...publicPerson(r), instrument: r.instrument, section: r.section, status: r.status, present: !!r.present });
  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  counts.present = rows.filter((r) => r.present).length;
  counts.walkins = rows.filter((r) => r.came === 1 && r.status !== 'si').length;
  counts.absent = rows.filter((r) => r.came === 0 && r.status === 'si').length;
  counts.escoleta = rows.filter((r) => r.escoleta === 1).length;
  // Acompanyants de qui ve (els marcats com que ja no vénen no compten).
  const companionRows = event.ask_companions ? db.prepare(`SELECT companion_of, name FROM event_guests
    WHERE event_id = ? AND companion_of IS NOT NULL AND companion_dropped = 0 ORDER BY id`).all(event.id) : [];
  const companionsBy = new Map();
  for (const g of companionRows) companionsBy.set(g.companion_of, [...(companionsBy.get(g.companion_of) || []), g.name]);
  counts.companions = companionRows.length;
  // Pagaments: quant ha de pagar cadascú (per a la junta) i el resum del que s'ha de cobrar i del que ja s'ha rebut.
  const payment = paymentOf(event.id);
  const amountOfRow = (r) => eventAmount(payment, fields, { status: r.status, extra: parseJSON(r.extra, {}), companions: (companionsBy.get(r.id) || []).length });
  const amounts = payment && isAdmin ? new Map(rows.map((r) => [r.id, amountOfRow(r)])) : new Map();
  const payments = payment && isAdmin ? {
    total: rows.reduce((s, r) => s + amounts.get(r.id), 0),
    received: rows.filter((r) => r.received_at).reduce((s, r) => s + amounts.get(r.id), 0),
    to_check: rows.filter((r) => amounts.get(r.id) && r.paid_at && !r.received_at).length,
    unpaid: rows.filter((r) => amounts.get(r.id) && !r.paid_at && !r.received_at).length,
    late: rows.filter((r) => paymentLate(payment, amounts.get(r.id), r)).length,
  } : undefined;
  return {
    payment: payment && { ...payment, event_id: undefined, concept: payment.concept || event.title }, payments,
    event: { ...event, rsvp_open: rsvpOpen(event) }, fields, castells, counts,
    guests: can(user, 'castells') ? guestsOf(event.id) : undefined,
    mine: mine ? { ...mine, came: flag(mine.came), escoleta: flag(mine.escoleta), extra: parseJSON(mine.extra, {}),
      companions: event.ask_companions ? companionsOf(event.id, user.id) : [], amount: amountOf(event.id, user.id, payment, fields) } : null,
    attendance: isAdmin ? attendance.map((a) => ({ ...a, companions: companionsBy.get(a.id) || [], amount: amounts.get(a.id) || 0,
      late: paymentLate(payment, amounts.get(a.id), a) }))
      : attendance.filter((a) => a.present),
    forecast: isAdmin ? attendanceForecast(event, castells) : undefined,
    plan_clashes: isAdmin ? planClashes(event.id) : undefined,
    roles: rolesOf(event.id, isAdmin),
    roleLabels: isAdmin ? db.prepare('SELECT label FROM event_roles GROUP BY label ORDER BY COUNT(*) DESC, label LIMIT 30').all().map((r) => r.label) : undefined,
  };
});
