import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db, hashPassword } from '../db.js';

// Les dates i hores de les sessions són hora d'aquí, encara que el servidor sigui en un altre lloc.
process.env.TZ ||= 'Europe/Madrid';
export const PORT = Number(process.env.PORT) || 3000;
export const COLLA_NAME = process.env.COLLA_NAME || 'La meva colla';
export const PUBLIC_DIR = path.join(path.join(import.meta.dirname, '..'), 'public');
export const COLLA_CODE = process.env.COLLA_CODE || '';
// Mode demostració: la pantalla d'entrada explica com provar l'app (les dades es tornen a crear a cada arrencada amb «npm run demo»).
export const DEMO = process.env.DEMO === '1';
export const VERSION = JSON.parse(fs.readFileSync(path.join(path.join(import.meta.dirname, '..'), 'package.json'), 'utf8')).version;
// Adreça (o nom) a qui es pot escriure per les dades personals: surt a la nota de privadesa.
export const PRIVACY_CONTACT = String(process.env.PRIVACY_CONTACT || '').trim().slice(0, 200);
// Només darrere d'un proxy (Render el posa sol) es pot fer cas de X-Forwarded-For; si no, el client se la pot inventar.
export const TRUST_PROXY = process.env.TRUST_PROXY === '1' || !!process.env.RENDER;
export const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
export const MEMBER_TTL_MS = 365 * 24 * 3600 * 1000;
export const DEVICE_TTL_MS = 365 * 24 * 3600 * 1000;

// ---------- Primer arrencada: crear un compte d'administració si no n'hi ha cap ----------
if (!db.prepare('SELECT 1 FROM admins').get()) {
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  db.prepare("INSERT INTO admins (username, password_hash, name) VALUES ('admin', ?, 'Administració')").run(hashPassword(password));
  console.log(`\n  Compte d'administració creat → usuari: admin · contrasenya: ${password}\n  (canvia-la des de «Comptes»)\n`);
}
export const purgeTokens = () => {
  db.prepare('DELETE FROM auth_tokens WHERE expires_at < ?').run(Date.now());
  db.prepare('DELETE FROM admin_tokens WHERE expires_at < ?').run(Date.now());
  db.prepare('DELETE FROM admin_devices WHERE expires_at < ?').run(Date.now());
};
purgeTokens();
setInterval(purgeTokens, 6 * 3600 * 1000).unref();
