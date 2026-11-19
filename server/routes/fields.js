import { db } from '../../db.js';
import { FIELD_KINDS, LIMITS, atMost, bool, fail, getEvent, insertRow, loadFieldById, loadFields, priceIn, str } from '../util.js';
import { route } from '../router.js';

// ---------- Rutes: camps extra ----------
export function fieldInput(body) {
  const label = str(body.label, 60);
  if (!label) fail(400, 'El camp necessita un nom');
  if (!FIELD_KINDS.includes(body.kind)) fail(400, 'Tipus de camp no vàlid');
  let options = null;
  if (body.kind === 'select') {
    const list = (Array.isArray(body.options) ? body.options : String(body.options || '').split(','))
      .map((o) => String(o).trim().slice(0, 40)).filter(Boolean);
    if (list.length < 2) fail(400, 'Una llista necessita almenys dues opcions');
    if (list.length > LIMITS.fieldOptions) fail(400, 'Com a molt {n} opcions', { n: LIMITS.fieldOptions });
    if (new Set(list).size !== list.length) fail(400, 'Hi ha opcions repetides');
    options = JSON.stringify(list);
  }
  return { label, kind: body.kind, options, required: bool(body.required), ...fieldPrices(body.kind, options && JSON.parse(options), body) };
}
// Preu d'una pregunta: sí/no i número en tenen un (si diu que sí; per unitat); una llista, un per opció.
export function fieldPrices(kind, options, body) {
  if (kind === 'bool' || kind === 'number') return { price: priceIn(body.price), option_prices: null };
  if (kind === 'select' && Array.isArray(body.option_prices)) {
    if (body.option_prices.length !== options.length) fail(400, 'Preu no vàlid');
    const list = body.option_prices.map(priceIn);
    return { price: null, option_prices: list.some(Boolean) ? JSON.stringify(list) : null };
  }
  return { price: null, option_prices: null };
}

route('POST', '/api/events/:id/fields', ({ params, body }) => {
  getEvent(params.id);
  atMost(LIMITS.fieldsPerEvent, 'Com a molt {n} camps per sessió', 'SELECT COUNT(*) AS n FROM event_fields WHERE event_id = ?', params.id);
  const position = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM event_fields WHERE event_id = ?').get(params.id).p;
  insertRow('event_fields', { event_id: Number(params.id), position, ...fieldInput(body) });
  return loadFields(params.id);
}, 'sessions');

// Canviar els preus d'una pregunta (el que ja s'ha respost no canvia; l'import de cadascú, sí).
route('PUT', '/api/fields/:id', ({ params, body }) => {
  const f = loadFieldById(params.id);
  db.prepare('UPDATE event_fields SET price = ?, option_prices = ? WHERE id = ?').run(...Object.values(fieldPrices(f.kind, f.options, body)), f.id);
  return loadFields(f.event_id);
}, 'sessions');

route('DELETE', '/api/fields/:id', ({ params }) => {
  db.prepare('DELETE FROM event_fields WHERE id = ?').run(params.id);
  return { ok: true };
}, 'sessions');
