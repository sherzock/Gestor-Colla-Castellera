// Pagaments de les sessions: el que fan servir igual el servidor i l'app.

// Quant // Preu d'una resposta a una pregunta de la sessió (en cèntims): sí/no, si diu que sí; número, per unitat; llista, el
// de l'opció triada.
export function fieldAmount(f, value) {
  if (value === null || value === undefined || value === '') return 0;
  if (f.kind === 'bool') return value ? f.price || 0 : 0;
  if (f.kind === 'number') return Math.max(0, Math.round(Number(value) || 0)) * (f.price || 0);
  if (f.kind === 'select') return f.option_prices?.[f.options.indexOf(value)] || 0;
  return 0;
}
// Quant ha de pagar algú per la sessió: només qui diu «Vinc», i només si la sessió té on pagar.
export function eventAmount(payment, fields, { status, extra, companions = 0 }) {
  if (!payment || status !== 'si') return 0;
  return (payment.price || 0) + companions * (payment.companion_price || 0)
    + (fields || []).reduce((sum, f) => sum + fieldAmount(f, extra?.[f.id]), 0);
}
export const fieldHasPrice = (f) => !!(f.price || f.option_prices?.some((p) => p));

// IBAN: sense espais i en majúscules, amb el dígit de control comprovat (ISO 13616: mòdul 97).
export const normalizeIban = (v) => String(v || '').replace(/[\s-]/g, '').toUpperCase();
export function ibanValid(v) {
  const iban = normalizeIban(v);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}
// De quatre en quatre, com surt als papers del banc.
export const groupIban = (v) => normalizeIban(v).replace(/(.{4})/g, '$1 ').trim();

// Bizum: un mòbil d'Espanya (9 xifres, començat per 6 o 7), amb el +34 o sense.
export const normalizePhone = (v) => String(v || '').replace(/[\s.-]/g, '').replace(/^(\+34|0034)/, '');
export const phoneValid = (v) => /^[67]\d{8}$/.test(normalizePhone(v));

// Cèntims ↔ text: «12,50 €» (o «12.50» en anglès), sense decimals si són zero.
export function euros(cents, lang = 'ca') {
  const n = (cents || 0) / 100;
  return n.toLocaleString(lang === 'en' ? 'en-GB' : lang, { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 });
}
// Del que s'escriu al formulari («12,5», «12.50», «12 €») a cèntims; buit → null; no vàlid → NaN.
export function parseEuros(text) {
  const s = String(text ?? '').replace(/€|\s/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}
