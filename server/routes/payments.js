import { db, transaction } from '../../db.js';
import { eventAmount, ibanValid, normalizeIban, normalizePhone, phoneValid } from '../../public/forms.js';
import { bool, fail, getEvent, loadFields, nowLocal, nowUtc, parseJSON, priceIn, str, visibleEvent } from '../util.js';
import { route } from '../router.js';

// ---------- Pagaments de les sessions ----------
// Una sessió pot tenir on pagar (IBAN o Bizum de la colla) i preus: per persona, per acompanyant i a les preguntes
// de la sessió. Qui diu «Vinc» veu quant ha de pagar i amb quin concepte, i avisa quan ho ha fet; la junta comprova
// el banc i ho marca com a rebut. L'app no mou ni guarda diners.
export const paymentOf = (eventId) => db.prepare('SELECT * FROM event_payments WHERE event_id = ?').get(eventId) || null;
export const companionCount = (eventId, personId) => db.prepare(`SELECT COUNT(*) AS n FROM event_guests
  WHERE event_id = ? AND companion_of = ? AND companion_dropped = 0`).get(eventId, personId).n;
// Quant ha de pagar una persona per la sessió, amb el que hi ha respost ara.
export function amountOf(eventId, personId, payment = paymentOf(eventId), fields = loadFields(eventId)) {
  const a = db.prepare('SELECT status, extra FROM attendance WHERE event_id = ? AND person_id = ?').get(eventId, personId);
  if (!a || !payment) return 0;
  return eventAmount(payment, fields, { status: a.status, extra: parseJSON(a.extra, {}), companions: companionCount(eventId, personId) });
}
export const LOCKED_PAYMENT = "Ja t'han confirmat el pagament: per canviar-ho, parla amb la junta";
// Després de canviar una resposta: si l'import ja no és el mateix, l'avís «Ja he pagat» deixa de valer; si la junta ja
// l'havia rebut, el membre no ho pot canviar (ho ha de parlar amb la junta, que sí que pot).
export function checkPayment(eventId, personId, before, { member }) {
  const payment = paymentOf(eventId);
  if (!payment) return;
  const row = db.prepare('SELECT paid_at, received_at FROM attendance WHERE event_id = ? AND person_id = ?').get(eventId, personId);
  if (!row || amountOf(eventId, personId, payment) === before) return;
  if (row.received_at) { if (member) fail(400, LOCKED_PAYMENT); return; }
  if (row.paid_at) db.prepare('UPDATE attendance SET paid_at = NULL WHERE event_id = ? AND person_id = ?').run(eventId, personId);
}
export const paymentState = (amount, r) => (!amount ? null : r.received_at ? 'received' : r.paid_at ? 'paid' : 'unpaid');
// Encara no ha pagat (ni ho ha dit) i la data límit ja ha passat.
export const paymentLate = (payment, amount, r) => !!(payment?.due_date && amount && !r.paid_at && !r.received_at && payment.due_date < nowLocal().slice(0, 10));

export function paymentInput(body) {
  const out = { price: priceIn(body.price), companion_price: priceIn(body.companion_price), holder: str(body.holder, 80),
    iban: str(body.iban, 60), bizum: str(body.bizum, 20), concept: str(body.concept, 40), due_date: str(body.due_date, 10) };
  if (out.due_date && (!/^\d{4}-\d{2}-\d{2}$/.test(out.due_date) || Number.isNaN(Date.parse(out.due_date)))) fail(400, 'La data límit no és correcta');
  if (out.iban) { if (!ibanValid(out.iban)) fail(400, "L'IBAN no és correcte"); out.iban = normalizeIban(out.iban); }
  if (out.bizum) { if (!phoneValid(out.bizum)) fail(400, 'El número de Bizum no és correcte'); out.bizum = normalizePhone(out.bizum); }
  if (!out.iban && !out.bizum) fail(400, 'Per cobrar, posa un IBAN o un número de Bizum');
  return out;
}

route('PUT', '/api/events/:id/payment', ({ params, body }) => {
  const event = getEvent(params.id);
  const p = paymentInput(body);
  const old = paymentOf(event.id);
  db.prepare(`INSERT INTO event_payments (event_id, price, companion_price, holder, iban, bizum, concept, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (event_id) DO UPDATE SET price = excluded.price, companion_price = excluded.companion_price, holder = excluded.holder,
      iban = excluded.iban, bizum = excluded.bizum, concept = excluded.concept, due_date = excluded.due_date`)
    .run(event.id, p.price, p.companion_price, p.holder, p.iban, p.bizum, p.concept, p.due_date);
  // Si canvia la data límit, el recordatori es pot tornar a enviar.
  if ((old?.due_date || null) !== p.due_date) db.prepare('UPDATE attendance SET pay_reminded_at = NULL WHERE event_id = ?').run(event.id);
  // Les dades de la colla es recorden per a la propera sessió.
  db.prepare("INSERT INTO settings (key, value) VALUES ('pay_defaults', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ holder: p.holder, iban: p.iban, bizum: p.bizum }));
  return paymentOf(event.id);
}, 'sessions');

route('DELETE', '/api/events/:id/payment', ({ params }) => {
  const event = getEvent(params.id);
  transaction(() => {
    db.prepare('DELETE FROM event_payments WHERE event_id = ?').run(event.id);
    db.prepare('UPDATE attendance SET paid_at = NULL, received_at = NULL, received_cash = NULL, pay_reminded_at = NULL WHERE event_id = ?').run(event.id);
  });
  return { ok: true };
}, 'sessions');

route('GET', '/api/pay-defaults', () => parseJSON(db.prepare("SELECT value FROM settings WHERE key = 'pay_defaults'").get()?.value, {}), 'sessions');

// «Ja he pagat»: només un avís perquè la junta ho comprovi al banc.
route('PUT', '/api/events/:id/paid', ({ params, body, user }) => {
  const event = visibleEvent(params.id, user);
  if (user.mode === 'admin') fail(403, 'Per respondre, canvia a la teva fitxa de membre');
  const row = db.prepare('SELECT received_at FROM attendance WHERE event_id = ? AND person_id = ?').get(event.id, user.id);
  if (!amountOf(event.id, user.id)) fail(400, 'No has de pagar res');
  if (row.received_at) fail(400, LOCKED_PAYMENT);
  db.prepare('UPDATE attendance SET paid_at = ? WHERE event_id = ? AND person_id = ?').run(bool(body.paid) ? nowUtc() : null, event.id, user.id);
  return { ok: true };
});

// La junta ho ha vist al banc o li han pagat en mà (o ho desfà): d'una persona o de diverses alhora.
export function markReceived(eventId, ids, body) {
  const received = bool(body.received), cash = received && bool(body.cash) ? 1 : null;
  const payment = paymentOf(eventId), fields = loadFields(eventId);
  const set = db.prepare('UPDATE attendance SET received_at = ?, received_cash = ? WHERE event_id = ? AND person_id = ?');
  transaction(() => {
    for (const id of ids) {
      if (!amountOf(eventId, id, payment, fields)) fail(400, 'Aquesta persona no ha de pagar res');
      set.run(received ? nowUtc() : null, cash, eventId, id);
    }
  });
  return { ok: true };
}

route('PUT', '/api/events/:id/payments/:personId', ({ params, body }) => markReceived(getEvent(params.id).id, [Number(params.personId)], body), 'sessions');

route('PUT', '/api/events/:id/payments', ({ params, body }) => {
  const event = getEvent(params.id);
  const ids = Array.isArray(body.person_ids) ? [...new Set(body.person_ids.map(Number))] : [];
  if (!ids.length || ids.length > 1000 || ids.some((id) => !Number.isInteger(id))) fail(400, 'Tria a qui');
  return markReceived(event.id, ids, body);
}, 'sessions');
