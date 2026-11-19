import { db } from '../db.js';
import { nowLocal } from './util.js';
import { historyIndex } from './history.js';

// ---------- Memòria de càlculs ----------
// Les estadístiques i els historials llegeixen milers de posicions: es calculen un sol cop i es reaprofiten fins
// que algú canvia alguna dada de la qual depenen (amb cada petició que no és GET) o canvia el dia.
// És només una memòria del servidor: cada ruta continua comprovant abans qui pot veure què.
// Hi ha tres nivells, perquè el canvi més freqüent (algú respon si ve) no obligui a refer-ho tot:
//  - dataVersion: qualsevol canvi (el que depèn de l'assistència: estadístiques de persones, resum de temporada);
//  - castellVersion: canvis que no són només d'assistència (sessions, castells, posicions, persones, plantilles);
//  - historyVersion: com castellVersion, menys col·locar gent en castells futurs (l'historial només mira el passat).
export let dataVersion = 0, castellVersion = 0, historyVersion = 0;
export const today = () => nowLocal().slice(0, 10);
export const versionKey = () => `${dataVersion}|${today()}`;
export const castellKey = () => `${castellVersion}|${today()}`;
export const historyKey = () => `${historyVersion}|${today()}`;
// Peticions que no són GET però no toquen cap dada de sessions, castells ni persones.
export const NO_DATA_CHANGE = new Set(['/api/client-errors', '/api/feedback', '/api/me/2fa/setup', '/api/me/2fa/enable', '/api/me/2fa/disable', '/api/directory', '/api/identify', '/api/login', '/api/logout', '/api/mode', '/api/me',
  '/api/push/subscribe', '/api/push/unsubscribe', '/api/push/inbox']);
// Peticions que només toquen l'assistència, els camps extra, l'altaveu o els comptes d'administració.
export const ATTENDANCE_ONLY = [/^\/api\/events\/\d+\/(attendance(\/\d+)?|paid|payment|payments(\/\d+)?)$/, /^\/api\/events\/\d+\/rsvp$/, /^\/api\/events\/\d+\/fields$/,
  /^\/api\/fields\/\d+$/, /^\/api\/announcements(\/\d+|\/images)?$/, /^\/api\/admins(\/\d+)?$/];
export const POSITIONS_ROUTE = /^\/api\/castells\/(\d+)\/positions(\/[^/]+)?$/;
export function dataChanged(pathname) {
  dataVersion++;
  if (ATTENDANCE_ONLY.some((re) => re.test(pathname))) return;
  castellVersion++;
  // Col·locar gent en un castell d'una sessió futura no canvia l'historial (que és dels castells fins avui).
  const m = POSITIONS_ROUTE.exec(pathname);
  if (m && db.prepare('SELECT e.date FROM castells c JOIN events e ON e.id = c.event_id WHERE c.id = ?').get(m[1])?.date > today()) return;
  historyVersion++;
}
// Per a rutes que només depenen de les dades i dels filtres (temporada i tipus de sessió). keyOf: el nivell de
// canvis del qual depenen; variant: una altra cosa que canvia la resposta (p. ex. si qui la demana veu els ocults).
export const memoized = new Map();
// Són les respostes més grans i es demanen sovint: el JSON i la versió comprimida també es guarden.
export const encodedMemo = new WeakMap();
// La clau només té els valors que canvien la resposta (una temporada o res, un tipus conegut o res) i se'n guarden
// poques: la temporada també la pot demanar un membre, i amb valors inventats podria omplir la memòria del servidor.
export const MEMO_ENTRIES = 40;
export const memo = (name, handler, { keyOf = versionKey, variant = () => '' } = {}) => {
  let cache = { key: null, map: new Map() };
  const wrapped = (ctx) => {
    if (cache.key !== keyOf()) cache = { key: keyOf(), map: new Map() };
    const season = ctx.query.get('season') || '', kind = ctx.query.get('kind') || '';
    const key = `${/^\d{4}$/.test(season) ? season : ''}|${['diades', 'assajos'].includes(kind) ? kind : ''}|${variant(ctx)}`;
    if (!cache.map.has(key)) {
      const result = handler(ctx);
      encodedMemo.set(result, {});
      if (cache.map.size >= MEMO_ENTRIES) cache.map.delete(cache.map.keys().next().value);
      cache.map.set(key, result);
    }
    return cache.map.get(key);
  };
  memoized.set(name, wrapped);
  return wrapped;
};
// Uns segons després de l'últim canvi (i en arrencar) es deixa calculat el que s'obre més sovint (la temporada
// actual, com ho demana l'app), perquè la primera persona que hi entri no s'hagi d'esperar.
export let warmTimer = null;
export function warmCaches(delayMs = 3000) {
  clearTimeout(warmTimer);
  warmTimer = setTimeout(() => {
    try {
      historyIndex();
      const query = new URLSearchParams({ season: String(new Date().getFullYear()), kind: 'all' });
      for (const name of ['tecnica', 'people']) memoized.get(name)({ query });
    } catch (err) { console.error(err); }
  }, delayMs);
  warmTimer.unref();
}
