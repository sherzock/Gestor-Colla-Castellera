import { db } from '../../db.js';
import { COLLA_CODE, COLLA_NAME, DEMO, PRIVACY_CONTACT, VERSION } from '../config.js';
import { route } from '../router.js';

// ---------- Rutes: autenticació i perfil ----------
route('GET', '/api/config', () => ({ collaName: COLLA_NAME, needsCode: !!COLLA_CODE, demo: DEMO, privacyContact: PRIVACY_CONTACT, version: VERSION }), 'public');

// Per als serveis que vigilen si l'app respon (UptimeRobot, Better Stack…): 200 si la base de dades contesta.
route('GET', '/api/health', ({ res }) => {
  try { db.prepare('SELECT 1').get(); } catch { res.writeHead(503, { 'Content-Type': 'application/json' }).end('{"ok":false}'); return undefined; }
  return { ok: true, version: VERSION };
}, 'public');
