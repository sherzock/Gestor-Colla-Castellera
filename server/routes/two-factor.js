import { newRecoveryCodes, newSecret, normalizeRecovery, otpauthUrl, verifyCode } from '../../totp.js';
import { db, hashToken } from '../../db.js';
import { COLLA_NAME } from '../config.js';
import { fail, updateRow } from '../util.js';
import { confirmPassword, route } from '../router.js';
import { noDemoAccounts } from './admins.js';

// ---------- Segon factor ----------
// El codi de l'app d'autenticació (que no s'hagi fet servir abans) o un dels codis de recuperació, que només valen un cop.
export function useSecondFactor(admin, code) {
  const step = verifyCode(admin.totp_secret, code, admin.totp_last ?? -1);
  if (step !== null) {
    db.prepare('UPDATE admins SET totp_last = ? WHERE id = ?').run(step, admin.id);
    return true;
  }
  const hashes = JSON.parse(admin.recovery_codes || '[]');
  const i = hashes.indexOf(hashToken(normalizeRecovery(code)));
  if (i < 0 || !normalizeRecovery(code)) return false;
  hashes.splice(i, 1);
  db.prepare('UPDATE admins SET recovery_codes = ? WHERE id = ?').run(JSON.stringify(hashes), admin.id);
  return true;
}
export const NO_SECOND_FACTOR = { totp_secret: null, totp_pending: null, totp_last: null, recovery_codes: null };
export const adminOf = (user) => db.prepare('SELECT * FROM admins WHERE id = ?').get(user.admin_id);

// Primer es prepara (amb la contrasenya) i només queda activat quan el mòbil ja genera bé els codis.
route('POST', '/api/me/2fa/setup', async ({ user, body, req }) => {
  noDemoAccounts();
  await confirmPassword(req, user, body.currentPassword);
  const secret = newSecret();
  db.prepare('UPDATE admins SET totp_pending = ? WHERE id = ?').run(secret, user.admin_id);
  return { secret, url: otpauthUrl(secret, user.username, `Appinya't ${COLLA_NAME}`) };
}, 'staff');

route('POST', '/api/me/2fa/enable', ({ user, body }) => {
  noDemoAccounts();
  const admin = adminOf(user);
  if (!admin.totp_pending) fail(400, 'Primer cal preparar el segon factor');
  const step = verifyCode(admin.totp_pending, body.code);
  if (step === null) fail(400, 'El codi de verificació no és correcte');
  const codes = newRecoveryCodes();
  updateRow('admins', admin.id, { totp_secret: admin.totp_pending, totp_pending: null, totp_last: step,
    recovery_codes: JSON.stringify(codes.map((c) => hashToken(normalizeRecovery(c)))) });
  return { recoveryCodes: codes };
}, 'staff');

route('POST', '/api/me/2fa/disable', async ({ user, body, req }) => {
  noDemoAccounts();
  await confirmPassword(req, user, body.currentPassword);
  const admin = adminOf(user);
  if (admin.totp_secret && !useSecondFactor(admin, body.code)) fail(400, 'El codi de verificació no és correcte');
  updateRow('admins', admin.id, NO_SECOND_FACTOR);
  return { ok: true };
}, 'staff');
