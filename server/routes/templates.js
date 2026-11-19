import { LAYER_PREFIX, TEMPLATE_KINDS, buildStructure, castellName, configFromName, setTemplates, templateOf, templateRings } from '../../public/castell.js';
import { db, transaction } from '../../db.js';
import { LIMITS, fail, int, str } from '../util.js';
import { route } from '../router.js';

// ---------- Plantilles de pinya ----------
// Cada colla dibuixa la pinya de cada tipus de castell a la seva manera. Les plantilles valen per a tots els castells
// d'aquell nom (passats i futurs): les posicions que es conserven mantenen la clau i, per tant, l'historial.
export const loadTemplates = () => setTemplates(db.prepare('SELECT name, layers FROM castell_templates').all()
  .map((r) => ({ name: r.name, layers: JSON.parse(r.layers) })));
loadTemplates();
// Abans, una plantilla ensenyava sempre tots els seus cordons, fos quin fos el número del castell. Ara el número mana:
// els castells que ja hi havia passen a tenir els de la seva plantilla, perquè no se'ls amagui cap posició.
if (!db.prepare("SELECT 1 FROM settings WHERE key = 'cordons_plantilla'").get()) {
  transaction(() => {
    for (const c of db.prepare('SELECT * FROM castells').all()) {
      const rings = templateRings(templateOf(c));
      if (rings && c.cordons !== rings) db.prepare('UPDATE castells SET cordons = ? WHERE id = ?').run(rings, c.id);
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('cordons_plantilla', '1')").run();
  });
}

export function templateInput(name, body) {
  const config = configFromName(name);
  if (!config) fail(400, 'Castell no vàlid');
  const def = buildStructure(config, { ignoreTemplate: true });
  if (!body.layers || typeof body.layers !== 'object' || Array.isArray(body.layers)) fail(400, 'Plantilla no vàlida');
  const coord = (v, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) fail(400, 'Plantilla no vàlida');
    return Math.round(n * 10) / 10;
  };
  const out = {};
  const keys = new Set();
  for (const [id, items] of Object.entries(body.layers)) {
    const layer = def.layers.find((l) => l.id === id);
    if (!layer || !Array.isArray(items)) fail(400, 'Plantilla no vàlida');
    if (items.length > LIMITS.templateBoxes) fail(400, 'Com a molt {n} caixes per capa', { n: LIMITS.templateBoxes });
    const bases = new Set();
    out[id] = items.map((it) => {
      if (!it || typeof it !== 'object') fail(400, 'Plantilla no vàlida');
      const box = { x: coord(it.x, -3000, 3000), y: coord(it.y, -3000, 3000), w: coord(it.w, 20, 300), h: coord(it.h, 14, 200),
        rot: Math.round((((Number(it.rot) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) * 1e4) / 1e4 };
      if (!Number.isFinite(box.rot)) fail(400, 'Plantilla no vàlida');
      if (it.base !== undefined) {
        // Les caixes del tronc que la capa envolta: una per columna (i el pilar central, si n'hi ha).
        const base = it.base === 'c' ? 'c' : Number(it.base);
        if (base === 'c' ? !layer.items.some((x) => x.shared && x.key.startsWith('ag')) : !(Number.isInteger(base) && base >= 0 && base < config.width)) fail(400, 'Plantilla no vàlida');
        if (bases.has(base)) fail(400, 'Plantilla no vàlida');
        bases.add(base);
        return { base, ...box };
      }
      const key = String(it.key || '');
      // Cada capa té les seves claus (p…, f…, m…, u…); mai les del tronc, el pilar o la música.
      if (!/^[a-z][a-z0-9-]{0,23}$/.test(key) || !key.startsWith(LAYER_PREFIX[id]) || /^m[gt]\d/.test(key) || keys.has(key)) fail(400, 'Plantilla no vàlida');
      keys.add(key);
      const kind = TEMPLATE_KINDS.includes(it.kind) ? it.kind : fail(400, 'Plantilla no vàlida');
      const role = str(it.role, 30) || fail(400, 'Cada posició necessita un nom');
      const ring = int(it.ring, 0, 8, 0);
      return { key, role, kind, ...box, ...(ring ? { ring } : {}) };
    });
  }
  return out;
}

route('GET', '/api/templates', () => db.prepare('SELECT name, layers, updated_at FROM castell_templates ORDER BY name').all()
  .map((r) => ({ name: r.name, layers: JSON.parse(r.layers), updated_at: r.updated_at })));

// Tipus de castell que la colla ja ha fet o té previstos (amb pinya), per triar quina plantilla editar.
route('GET', '/api/templates/types', () => {
  const out = new Map();
  for (const c of db.prepare('SELECT * FROM castells WHERE net = 0').all()) {
    const name = castellName(c);
    out.set(name, (out.get(name) || 0) + 1);
  }
  return [...out].map(([name, castells]) => ({ name, castells })).sort((a, b) => b.castells - a.castells || a.name.localeCompare(b.name));
}, 'staff');

// Quants cops s'ha fet servir cada posició en castells d'aquest tipus (per avisar abans de treure'n una).
route('GET', '/api/templates/:name/usage', ({ params }) => {
  const config = configFromName(params.name);
  if (!config) fail(400, 'Castell no vàlid');
  const list = db.prepare('SELECT * FROM castells WHERE width = ? AND height = ?').all(config.width, config.height)
    .filter((c) => castellName(c) === params.name);
  const ids = list.map((c) => c.id);
  // Els cordons més habituals d'aquest castell: és la pinya estàndard de partida a l'editor.
  const byCordons = new Map();
  for (const c of list) byCordons.set(c.cordons, (byCordons.get(c.cordons) || 0) + 1);
  const cordons = [...byCordons].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 3;
  const out = {};
  for (const r of db.prepare('SELECT pos_key, COUNT(*) AS n FROM castell_positions WHERE castell_id IN (SELECT value FROM json_each(?)) GROUP BY pos_key')
    .all(JSON.stringify(ids))) out[r.pos_key] = r.n;
  return { castells: ids.length, cordons, usage: out };
}, 'staff');

route('PUT', '/api/templates/:name', ({ params, body }) => {
  const layers = templateInput(params.name, body);
  db.prepare(`INSERT INTO castell_templates (name, layers, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(name) DO UPDATE SET layers = excluded.layers, updated_at = excluded.updated_at`).run(params.name, JSON.stringify(layers));
  loadTemplates();
  return { name: params.name, layers };
}, 'castells');

route('DELETE', '/api/templates/:name', ({ params }) => {
  db.prepare('DELETE FROM castell_templates WHERE name = ?').run(params.name);
  loadTemplates();
  return { ok: true };
}, 'castells');
