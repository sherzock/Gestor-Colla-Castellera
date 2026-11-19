import { db, transaction } from '../../db.js';
import { eventAmount } from '../../public/forms.js';
import { LIMITS, fail, getEvent, insertRow, loadFields, parseJSON, rsvpOpen, str, visibleEvent } from '../util.js';
import { route } from '../router.js';
import { CAME_SQL } from '../sql.js';
import { attendancePatch, upsertAttendance } from '../attendance.js';
import { amountOf, checkPayment, paymentLate, paymentOf, paymentState } from './payments.js';

// ---------- Acompanyants ----------
// Si la sessió pregunta pels acompanyants, cada acompanyant és una persona temporal de la sessió i la tècnica la pot
// col·locar als castells. La llista es manté sola amb la resposta: si en diu menys o ja no ve, els que encara no
// són a cap castell s'esborren; els que ja hi són es queden marcats perquè l'administració ho vegi.
export const MAX_COMPANIONS = LIMITS.companions;
export function companionNames(body) {
  if (!('companions' in body)) return undefined;
  if (!Array.isArray(body.companions) || body.companions.length > MAX_COMPANIONS) fail(400, 'Com a molt {n} acompanyants', { n: MAX_COMPANIONS });
  // A la pinya s'han de poder reconèixer: cada acompanyant porta el seu nom.
  const names = body.companions.map((n) => (typeof n === 'string' ? str(n, 60) : null));
  if (names.some((n) => !n)) fail(400, 'Posa el nom de cada acompanyant');
  return names;
}
export function syncCompanions(event, personId, names) {
  if (!event.ask_companions) return;
  const status = db.prepare('SELECT status FROM attendance WHERE event_id = ? AND person_id = ?').get(event.id, personId)?.status;
  // Qui no ve no porta ningú; si diu que ve sense dir res dels acompanyants, es deixen com estaven.
  if (status !== 'si') names = [];
  else if (names === undefined) return;
  const list = db.prepare(`SELECT g.*, (SELECT COUNT(*) FROM castell_positions WHERE guest_id = g.id) AS placed
    FROM event_guests g WHERE g.event_id = ? AND g.companion_of = ? ORDER BY g.companion_dropped, placed DESC, g.id`).all(event.id, personId);
  const rename = db.prepare('UPDATE event_guests SET name = ?, companion_dropped = 0 WHERE id = ?');
  const renamePlaced = db.prepare('UPDATE castell_positions SET guest_name = ? WHERE guest_id = ?');
  names.forEach((name, i) => {
    const g = list[i];
    if (g) { rename.run(name, g.id); renamePlaced.run(name, g.id); }
    else insertRow('event_guests', { event_id: event.id, name, companion_of: personId });
  });
  for (const g of list.slice(names.length)) {
    if (g.placed) db.prepare('UPDATE event_guests SET companion_dropped = 1 WHERE id = ?').run(g.id);
    else db.prepare('DELETE FROM event_guests WHERE id = ?').run(g.id);
  }
}
export const companionsOf = (eventId, personId) => db.prepare(`SELECT g.name, g.companion_dropped AS dropped,
    (SELECT COUNT(*) FROM castell_positions WHERE guest_id = g.id) AS placed
  FROM event_guests g WHERE g.event_id = ? AND g.companion_of = ? ORDER BY g.companion_dropped, g.id`).all(eventId, personId);

route('PUT', '/api/events/:id/attendance', ({ params, body, user }) => {
  const event = visibleEvent(params.id, user);
  if (user.mode === 'admin') fail(403, 'Per respondre, canvia a la teva fitxa de membre');
  if (!rsvpOpen(event)) fail(400, "Ja no es pot respondre a aquesta sessió. Si hi ha cap canvi, digues-ho a un administrador.");
  const names = companionNames(body);
  transaction(() => {
    const before = amountOf(event.id, user.id);
    upsertAttendance(event.id, user.id, attendancePatch(event, body, { admin: false }));
    syncCompanions(event, user.id, names);
    checkPayment(event.id, user.id, before, { member: true });
  });
  return { ok: true };
});

route('PUT', '/api/events/:id/attendance/:personId', ({ params, body }) => {
  const event = getEvent(params.id);
  if (!db.prepare('SELECT 1 FROM people WHERE id = ?').get(params.personId)) fail(404, 'Persona no trobada');
  const names = companionNames(body);
  transaction(() => {
    const before = amountOf(event.id, Number(params.personId));
    upsertAttendance(event.id, Number(params.personId), attendancePatch(event, body, { admin: true }));
    syncCompanions(event, Number(params.personId), names);
    checkPayment(event.id, Number(params.personId), before, { member: false });
  });
  return { ok: true };
}, 'attendance');

// Taula d'assistència d'una sessió (la mateixa per al CSV i per a l'Excel que es fa a l'app): capçalera i files de text.
export function attendanceTable(event) {
  const fields = loadFields(event.id);
  const rows = db.prepare(`SELECT p.id, p.name, p.alias, a.status, a.escoleta, a.extra, a.comment, a.paid_at, a.received_at, a.received_cash, ${CAME_SQL} AS present
    FROM attendance a JOIN people p ON p.id = a.person_id WHERE a.event_id = ? ORDER BY p.name COLLATE NOCASE`).all(event.id);
  const yesNo = (v) => (v ? 'sí' : v === 0 ? 'no' : '');
  const companionsBy = new Map();
  if (event.ask_companions) {
    for (const g of db.prepare(`SELECT companion_of, name FROM event_guests WHERE event_id = ? AND companion_of IS NOT NULL AND companion_dropped = 0
      ORDER BY id`).all(event.id)) companionsBy.set(g.companion_of, [...(companionsBy.get(g.companion_of) || []), g.name]);
  }
  const companions = (id) => (event.ask_companions ? [(companionsBy.get(id) || []).join(', ')] : []);
  const payment = paymentOf(event.id);
  const columns = ['Nom', 'Malnom', 'Estat', 'Ha vingut', ...(event.escoleta ? ['Escoleta'] : []), ...(event.ask_companions ? ['Acompanyants'] : []),
    ...fields.map((f) => f.label), ...(payment ? ['Import (€)', 'Pagament'] : []), 'Comentari'];
  const STATE = { received: 'rebut', paid: 'diu que ha pagat', unpaid: 'sense pagar' };
  const pay = (r, extra) => {
    if (!payment) return [];
    const amount = eventAmount(payment, fields, { status: r.status, extra, companions: (companionsBy.get(r.id) || []).length });
    const state = paymentState(amount, r);
    return [amount ? (amount / 100).toFixed(2) : '', state === 'received' && r.received_cash ? 'rebut en efectiu'
      : paymentLate(payment, amount, r) ? 'sense pagar (fora de termini)' : STATE[state] || ''];
  };
  return {
    columns,
    rows: rows.map((r) => {
      const extra = parseJSON(r.extra, {});
      return [r.name, r.alias, r.status, r.present ? 'sí' : 'no', ...(event.escoleta ? [yesNo(r.escoleta)] : []), ...companions(r.id),
        ...fields.map((f) => (f.kind === 'bool' ? (extra[f.id] ? 'sí' : extra[f.id] === false ? 'no' : '') : extra[f.id])),
        ...pay(r, extra), r.comment].map((v) => (v === null || v === undefined ? '' : String(v)));
    }),
  };
}

route('GET', '/api/events/:id/attendance.csv', ({ params, res }) => {
  const event = getEvent(params.id);
  const { columns, rows } = attendanceTable(event);
  // Els comentaris els escriu qualsevol: es neutralitza el que un full de càlcul llegiria com a fórmula.
  const cell = (v) => `"${String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const lines = [columns, ...rows].map((r) => r.map(cell).join(';'));
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="assistencia-${event.date}.csv"`,
    'Cache-Control': 'no-store',
  });
  res.end('﻿' + lines.join('\r\n'));
  return undefined;
}, 'attendance');

// La mateixa taula en JSON, per a l'Excel de la sessió (a l'Excel, el text no es pot llegir com a fórmula).
route('GET', '/api/events/:id/attendance', ({ params }) => attendanceTable(getEvent(params.id)), 'attendance');
