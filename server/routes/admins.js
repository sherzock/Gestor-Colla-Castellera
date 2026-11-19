import { db } from '../../db.js';
import { DEMO } from '../config.js';
import { ACCOUNT_ROLES, LIMITS, atMost, fail, insertRow, str, updateRow } from '../util.js';
import { confirmPassword, newPassword, route } from '../router.js';
import { NO_SECOND_FACTOR } from './two-factor.js';

// ---------- Rutes: comptes d'administració ----------
export const adminRow = (a) => ({ id: a.id, username: a.username, name: a.name, roles: a.roles.split(','), created_at: a.created_at, two_factor: !!a.totp_secret });
export const ADMIN_ACCOUNTS_SQL = "SELECT COUNT(*) AS n FROM admins WHERE ',' || roles || ',' LIKE '%,admin,%'";
// «admin» ja ho inclou tot: no es combina amb els altres. Sense dir res, un compte nou és d'administració, com abans.
export function rolesInput(value) {
  const list = Array.isArray(value) ? value : ['admin'];
  if (!list.length || !list.every((r) => ACCOUNT_ROLES.includes(r))) fail(400, 'Tria què pot fer aquest compte');
  return list.includes('admin') ? 'admin' : ACCOUNT_ROLES.filter((r) => list.includes(r)).join(',');
}
export function adminInput(body, existing = null) {
  const out = {};
  if ('roles' in body || !existing) out.roles = rolesInput(body.roles);
  if ('name' in body || !existing) {
    out.name = str(body.name, 60);
    if (!out.name) fail(400, 'El nom és obligatori');
  }
  if ('username' in body || !existing) {
    out.username = String(str(body.username, 60) || '').toLowerCase();
    if (!/^[a-z0-9._-]{3,}$/.test(out.username)) fail(400, "L'usuari ha de tenir almenys 3 lletres o números, sense espais");
    if (db.prepare('SELECT 1 FROM admins WHERE username = ? AND id != ?').get(out.username, existing?.id ?? 0)) fail(400, "Aquest nom d'usuari ja existeix");
  }
  if (body.password || !existing) out.password_hash = newPassword(body.password, out.username ?? existing.username);
  return out;
}

route('GET', '/api/admins', () => db.prepare('SELECT * FROM admins ORDER BY name COLLATE NOCASE').all().map(adminRow), 'admin');

// A la versió de prova tothom entra amb el mateix compte: si algú li canviés la contrasenya o l'esborrés, els altres
// ja no hi podrien entrar fins que es tornessin a crear les dades.
export const DEMO_ACCOUNTS = "A la versió de prova no es poden canviar els comptes d'administració";
export const noDemoAccounts = () => { if (DEMO) fail(403, DEMO_ACCOUNTS); };

// Crear, canviar o esborrar comptes d'administració demana la contrasenya de qui ho fa.
route('POST', '/api/admins', async ({ body, user, req }) => {
  noDemoAccounts();
  await confirmPassword(req, user, body.currentPassword);
  atMost(LIMITS.admins, "Com a molt {n} comptes d'administració", 'SELECT COUNT(*) AS n FROM admins');
  const data = adminInput(body);
  const id = insertRow('admins', data);
  return adminRow(db.prepare('SELECT * FROM admins WHERE id = ?').get(id));
}, 'admin');

route('PUT', '/api/admins/:id', async ({ params, body, user, req }) => {
  noDemoAccounts();
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(params.id) || fail(404, 'Compte no trobat');
  await confirmPassword(req, user, body.currentPassword);
  const data = adminInput(body, admin);
  // Si algú perd el mòbil, l'administració li pot treure el segon factor (i el torna a activar ell mateix).
  if (body.disable_2fa) Object.assign(data, NO_SECOND_FACTOR);
  if (data.roles && data.roles !== 'admin' && admin.roles === 'admin' && db.prepare(ADMIN_ACCOUNTS_SQL).get().n <= 1) {
    fail(400, "Ha de quedar almenys un compte d'administració");
  }
  updateRow('admins', admin.id, data);
  // Amb una contrasenya nova, totes les sessions i mòbils coneguts d'aquell compte s'han de tornar a fer.
  if (data.password_hash) {
    db.prepare('DELETE FROM admin_tokens WHERE admin_id = ? AND token != ?').run(admin.id, user.tokenHash);
    db.prepare('DELETE FROM admin_devices WHERE admin_id = ?').run(admin.id);
  }
  return adminRow(db.prepare('SELECT * FROM admins WHERE id = ?').get(admin.id));
}, 'admin');

route('DELETE', '/api/admins/:id', async ({ params, user, body, req }) => {
  noDemoAccounts();
  if (Number(params.id) === user.admin_id) fail(400, 'No pots esborrar el compte amb què has entrat');
  await confirmPassword(req, user, body.currentPassword);
  const target = db.prepare('SELECT roles FROM admins WHERE id = ?').get(params.id);
  if (target?.roles === 'admin' && db.prepare(ADMIN_ACCOUNTS_SQL).get().n <= 1) fail(400, "Ha de quedar almenys un compte d'administració");
  db.prepare('DELETE FROM admins WHERE id = ?').run(params.id);
  return { ok: true };
}, 'admin');
