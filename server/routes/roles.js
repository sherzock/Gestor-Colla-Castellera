import { db } from '../../db.js';
import { LIMITS, atMost, fail, getEvent, insertRow, publicName, str } from '../util.js';
import { route } from '../router.js';

// ---------- Encarregats ----------
// Els membres en veuen el nom curt, com a tot arreu.
export const rolesOf = (eventId, isAdmin) => db.prepare(`SELECT r.id, r.label, p.id AS person_id, p.name, p.alias FROM event_roles r
  JOIN people p ON p.id = r.person_id WHERE r.event_id = ? ORDER BY r.label COLLATE NOCASE, r.id`).all(eventId)
  .map((r) => (isAdmin ? r : { id: r.id, label: r.label, person_id: r.person_id, name: publicName(r), alias: null }));

route('POST', '/api/events/:id/roles', ({ params, body }) => {
  const event = getEvent(params.id);
  const label = str(body.label, 60) || fail(400, "Cal dir de què s'encarrega");
  if (!db.prepare('SELECT 1 FROM people WHERE id = ? AND active = 1').get(body.person_id)) fail(404, 'Persona no trobada');
  if (db.prepare('SELECT 1 FROM event_roles WHERE event_id = ? AND label = ? AND person_id = ?').get(event.id, label, body.person_id)) {
    fail(400, 'Aquesta persona ja en té l\'encàrrec');
  }
  atMost(LIMITS.rolesPerEvent, 'Com a molt {n} encarregats per sessió', 'SELECT COUNT(*) AS n FROM event_roles WHERE event_id = ?', event.id);
  insertRow('event_roles', { event_id: event.id, label, person_id: Number(body.person_id) });
  return rolesOf(event.id, true);
}, 'sessions');

route('DELETE', '/api/events/:id/roles/:roleId', ({ params }) => {
  const event = getEvent(params.id);
  db.prepare('DELETE FROM event_roles WHERE id = ? AND event_id = ?').run(params.roleId, event.id);
  return rolesOf(event.id, true);
}, 'sessions');
