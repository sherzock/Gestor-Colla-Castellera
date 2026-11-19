import { db } from '../../db.js';
import { LIMITS, MEASURES, atMost, fail, getEvent, inRange, insertRow, str, updateRow } from '../util.js';
import { route } from '../router.js';

// ---------- Rutes: persones temporals d'una sessió ----------
export function guestInput(body) {
  const name = str(body.name, 60);
  if (!name) fail(400, 'El nom és obligatori');
  return { name, colla: str(body.colla, 80), shoulder_height_cm: inRange(body.shoulder_height_cm, ...MEASURES.shoulder_height_cm),
    weight_kg: inRange(body.weight_kg, ...MEASURES.weight_kg) };
}
export const guestsOf = (eventId) => db.prepare(`SELECT g.*, (SELECT COUNT(*) FROM castell_positions WHERE guest_id = g.id) AS placed,
    COALESCE(p.alias, p.name) AS companion_of_name
  FROM event_guests g LEFT JOIN people p ON p.id = g.companion_of WHERE g.event_id = ? ORDER BY g.name COLLATE NOCASE`).all(eventId);

route('POST', '/api/events/:id/guests', ({ params, body }) => {
  const event = getEvent(params.id);
  atMost(LIMITS.guestsPerEvent, 'Com a molt {n} persones temporals per sessió', 'SELECT COUNT(*) AS n FROM event_guests WHERE event_id = ?', event.id);
  const id = insertRow('event_guests', { event_id: event.id, ...guestInput(body) });
  return db.prepare('SELECT * FROM event_guests WHERE id = ?').get(id);
}, 'castells');

route('PUT', '/api/guests/:id', ({ params, body }) => {
  const guest = db.prepare('SELECT * FROM event_guests WHERE id = ?').get(params.id) || fail(404, 'Persona temporal no trobada');
  const data = guestInput(body);
  updateRow('event_guests', guest.id, data);
  db.prepare('UPDATE castell_positions SET guest_name = ? WHERE guest_id = ?').run(data.name, guest.id);
  return db.prepare('SELECT * FROM event_guests WHERE id = ?').get(guest.id);
}, 'castells');

route('DELETE', '/api/guests/:id', ({ params }) => {
  db.prepare('DELETE FROM event_guests WHERE id = ?').run(params.id);
  return { ok: true };
}, 'castells');
