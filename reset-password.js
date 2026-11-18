// Per si l'únic compte d'administració perd la contrasenya o el mòbil del segon factor: des del servidor (on hi ha la
// base de dades), posa una contrasenya nova a l'atzar, treu el segon factor i tanca totes les sessions d'aquell compte.
// Si hi ha un altre compte d'administració, és més senzill que ho faci des de l'app (Comptes → Edita).
//
//   node reset-password.js            → llista els comptes
//   node reset-password.js <usuari>   → contrasenya nova per a aquest compte
import crypto from 'node:crypto';
import { db, hashPassword } from './db.js';

const username = process.argv[2]?.trim().toLowerCase();
if (!username) {
  console.log('Comptes d\'administració:');
  for (const a of db.prepare('SELECT username, name, roles FROM admins ORDER BY username').all()) console.log(`  ${a.username} (${a.name}, ${a.roles})`);
  console.log('\nÚs: node reset-password.js <usuari>');
  process.exit(0);
}
const admin = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
if (!admin) {
  console.error(`No hi ha cap compte «${username}». Executa-ho sense res per veure'n la llista.`);
  process.exit(1);
}
// 16 caràcters sense els que es confonen (0/O, 1/l/I).
const password = Array.from(crypto.randomBytes(16), (b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 54]).join('');
db.prepare(`UPDATE admins SET password_hash = ?, totp_secret = NULL, totp_pending = NULL, totp_last = NULL, recovery_codes = NULL
  WHERE id = ?`).run(hashPassword(password), admin.id);
db.prepare('DELETE FROM admin_tokens WHERE admin_id = ?').run(admin.id);
db.prepare('DELETE FROM admin_devices WHERE admin_id = ?').run(admin.id);
db.prepare("INSERT INTO audit_log (at, admin_id, account, action) VALUES (datetime('now'), ?, '(servidor)', 'reset-password')").run(admin.id);
console.log(`Contrasenya nova per a «${username}»: ${password}`);
console.log("S'ha tret el segon factor i s'han tancat les sessions. Canvia-la en entrar (El meu compte).");
