// Segon factor: codis de 6 xifres que canvien cada 30 segons (RFC 6238), com els de Google Authenticator, Aegis o
// l'app de contrasenyes del mòbil. Sense dependències.
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;

export function base32(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function fromBase32(text) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of String(text).toUpperCase().replace(/[\s=-]/g, '')) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Clau no vàlida');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32(crypto.randomBytes(20));

export function codeAt(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', fromBase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

export const counterAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);

// Accepta el codi d'ara i el d'un pas abans o després (rellotges que no van exactes). Torna el pas que ha valgut, o
// null. Un codi ja fet servir (pas <= «last») no torna a valer: algú que el vegi per sobre l'espatlla no pot entrar.
export function verifyCode(secret, code, last = -1, now = Date.now()) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const c = counterAt(now);
  for (const step of [c - 1, c, c + 1]) {
    if (step > last && crypto.timingSafeEqual(Buffer.from(codeAt(secret, step)), Buffer.from(clean))) return step;
  }
  return null;
}

// Adreça que les apps d'autenticació entenen (al mòbil, tocar-la obre l'app).
export const otpauthUrl = (secret, account, issuer) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;

// Codis de recuperació, per si es perd el mòbil: 10 lletres i números, en dos grups de 5.
export const newRecoveryCodes = (n = 8) => Array.from({ length: n }, () => base32(crypto.randomBytes(7)).slice(0, 10).replace(/(.{5})/, '$1-'));
export const normalizeRecovery = (code) => String(code || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
