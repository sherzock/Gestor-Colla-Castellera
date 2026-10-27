import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const DB_PATH = process.env.DB_PATH || path.join(import.meta.dirname, 'data', 'colla.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
// Hi ha dades personals: només l'usuari que fa anar el servidor pot llegir la base de dades.
for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) try { fs.chmodSync(f, 0o600); } catch { /* no existeix o no es pot */ }

db.exec(`
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  name TEXT NOT NULL,
  alias TEXT,
  email TEXT,
  phone TEXT,
  birthdate TEXT,
  height_cm REAL,
  shoulder_height_cm REAL,
  shoulder_width_cm REAL,
  weight_kg REAL,
  notes TEXT,
  instrument TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  location TEXT,
  description TEXT,
  escoleta INTEGER NOT NULL DEFAULT 0,
  escoleta_time TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_fields (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('number','text','bool','select')),
  options TEXT,
  required INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attendance (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('si','no','potser')),
  present INTEGER NOT NULL DEFAULT 0,
  came INTEGER,
  escoleta INTEGER,
  extra TEXT,
  comment TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, person_id)
);

CREATE TABLE IF NOT EXISTS castells (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  agulla INTEGER NOT NULL DEFAULT 0,
  folre INTEGER NOT NULL DEFAULT 0,
  manilles INTEGER NOT NULL DEFAULT 0,
  cordons INTEGER NOT NULL DEFAULT 3,
  label TEXT,
  notes TEXT,
  result TEXT NOT NULL DEFAULT 'previst',
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS castell_positions (
  castell_id INTEGER NOT NULL REFERENCES castells(id) ON DELETE CASCADE,
  pos_key TEXT NOT NULL,
  person_id INTEGER REFERENCES people(id) ON DELETE CASCADE,
  guest_name TEXT,
  PRIMARY KEY (castell_id, pos_key)
);
`);

// Migracions: columnes afegides després de la primera versió.
const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
const addColumn = (table, col, def) => {
  if (columns(table).includes(col)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  return true;
};
// mode = 'member' (s'ha identificat triant el seu nom) o 'admin' (ha entrat amb usuari i contrasenya).
addColumn('auth_tokens', 'mode', "TEXT NOT NULL DEFAULT 'admin'");
// net = sense pinya; from_level / to_level = pisos que es fan en una prova parcial (to_level 0 = fins a dalt).
for (const col of ['puntals', 'sota', 'gralles', 'timbals', 'net', 'to_level']) addColumn('castells', col, 'INTEGER NOT NULL DEFAULT 0');
addColumn('castells', 'from_level', 'INTEGER NOT NULL DEFAULT 1');
// Una versió anterior guardava les proves parcials com «sense baixos» i «part de dalt»: es passen a pisos.
if (columns('castells').includes('top_off')) {
  db.exec(`UPDATE castells SET from_level = CASE WHEN base_off = 1 THEN 2 ELSE 1 END,
      to_level = CASE WHEN top_off > 0 THEN height - top_off ELSE 0 END;
    ALTER TABLE castells DROP COLUMN base_off;
    ALTER TABLE castells DROP COLUMN top_off;`);
}
db.exec("UPDATE castells SET result = 'intent desfet' WHERE result = 'intent desmuntat'");

// Pinya: els laterals passen a ser de cada baix (una línia a cada costat de les seves mans). Abans n'hi havia
// a banda i banda dels vents («plv…») i uns «laterals de mans» («plm…»): es mouen a la posició nova equivalent.
const oldLaterals = db.prepare(`SELECT cp.castell_id, cp.pos_key, c.width FROM castell_positions cp
  JOIN castells c ON c.id = cp.castell_id WHERE cp.pos_key GLOB '[pf]lv*' OR cp.pos_key GLOB '[pf]lm*'`).all();
if (oldLaterals.length) {
  const move = db.prepare('UPDATE OR IGNORE castell_positions SET pos_key = ? WHERE castell_id = ? AND pos_key = ?');
  db.exec('BEGIN');
  for (const r of oldLaterals) {
    const m = r.pos_key.match(/^([pf])(lv|lm)(\d+)-(\d+)-([ed])$/);
    if (!m) continue;
    const [, pre, kind, n, i, side] = m;
    let key = null;
    // El lateral d'un costat del vent i és del baix que té a tocar (i o i + 1).
    if (kind === 'lv' && r.width >= 2 && r.width <= 4) key = side === 'e' ? `${pre}l${n}-${(Number(i) + 1) % r.width}-d` : `${pre}l${n}-${i}-e`;
    else if (kind === 'lm') key = `${pre}l${Number(n) + 1}-${i}-${side}`;
    if (key) move.run(key, r.castell_id, r.pos_key);
  }
  db.exec("DELETE FROM castell_positions WHERE pos_key GLOB '[pf]lv*' OR pos_key GLOB '[pf]lm*'");
  db.exec('COMMIT');
}
addColumn('people', 'instrument', 'TEXT');

// La primera versió limitava els tipus de sessió amb un CHECK: es refà la taula per poder afegir-ne.
if (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'events'").get().sql.includes('CHECK')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`BEGIN;
    CREATE TABLE events_new (id INTEGER PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, date TEXT NOT NULL,
      start_time TEXT, end_time TEXT, location TEXT, description TEXT,
      escoleta INTEGER NOT NULL DEFAULT 0, escoleta_time TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO events_new (id, type, title, date, start_time, end_time, location, description, created_at)
      SELECT id, type, title, date, start_time, end_time, location, description, created_at FROM events;
    DROP TABLE events;
    ALTER TABLE events_new RENAME TO events;
    COMMIT;`);
  db.exec('PRAGMA foreign_keys = ON');
}

// came: NULL = el que digui la confirmació (qui ha dit «Vinc» compta com a present),
// 0 = no ha vingut, 1 = ha vingut (encara que no s'hagués apuntat).
if (addColumn('attendance', 'came', 'INTEGER')) {
  db.exec(`UPDATE attendance SET came = 1 WHERE present = 1;
    UPDATE attendance SET came = 0 WHERE present = 0 AND status = 'si'
      AND event_id IN (SELECT event_id FROM attendance WHERE present = 1)`);
}
addColumn('attendance', 'escoleta', 'INTEGER');

// Data i hora límit per respondre (AAAA-MM-DDTHH:MM). Sense límit, es pot respondre fins al mateix dia de la sessió.
addColumn('events', 'rsvp_until', 'TEXT');
// Ja no hi ha «Potser»: només sí o no. Qui havia dit «Potser» queda sense resposta, perquè triï.
db.exec("UPDATE attendance SET status = NULL WHERE status = 'potser'");

// Comptes d'administració: separats de les persones de la colla. Només serveixen per editar;
// qui és administrador i també fa castells té, a més, la seva fitxa de membre com tothom.
db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_tokens (
  token TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
`);
// Abans, els administradors eren persones amb usuari i contrasenya: es passen a comptes d'administració
// i la persona queda com a membre. La fitxa «Administrador» que es creava sola, si no s'ha fet servir, s'esborra.
const oldAdmins = db.prepare("SELECT * FROM people WHERE role = 'admin' OR username IS NOT NULL").all();
if (oldAdmins.length) {
  transaction(() => {
    for (const p of oldAdmins) {
      if (p.username && p.password_hash) {
        db.prepare('INSERT OR IGNORE INTO admins (username, password_hash, name) VALUES (?, ?, ?)').run(p.username, p.password_hash, p.name);
      }
      const used = db.prepare(`SELECT (SELECT COUNT(*) FROM attendance WHERE person_id = ?) + (SELECT COUNT(*) FROM castell_positions WHERE person_id = ?) AS n`).get(p.id, p.id).n;
      if (p.name === 'Administrador' && !used) db.prepare('DELETE FROM people WHERE id = ?').run(p.id);
      else db.prepare("UPDATE people SET role = 'member', username = NULL, password_hash = NULL WHERE id = ?").run(p.id);
    }
    db.exec("DELETE FROM auth_tokens WHERE mode = 'admin'");
  });
}

// Persones temporals d'una sessió (d'una altra colla, de prova…): no són de la colla ni compten a l'historial,
// però es poden col·locar a qualsevol castell d'aquella sessió.
db.exec(`CREATE TABLE IF NOT EXISTS event_guests (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  colla TEXT,
  shoulder_height_cm REAL,
  weight_kg REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
addColumn('castell_positions', 'guest_id', 'INTEGER REFERENCES event_guests(id) ON DELETE CASCADE');
// Nota de la tècnica sobre com ha anat l'intent (només la veuen els administradors).
addColumn('castells', 'tech_notes', 'TEXT');
// Una versió anterior guardava «on ha fallat»: es va treure perquè sovint no es pot saber.
if (columns('castells').includes('fail_point')) db.exec('ALTER TABLE castells DROP COLUMN fail_point');

// Mòbils on un compte d'administració ha entrat bé: no queden bloquejats si algú altre prova contrasenyes del compte.
db.exec(`CREATE TABLE IF NOT EXISTS admin_devices (
  token TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
)`);
// Les sessions es guarden com a resum (SHA-256) i no tal com són: amb una còpia de la base de dades no es pot entrar.
if (db.prepare('PRAGMA user_version').get().user_version < 1) {
  transaction(() => {
    for (const table of ['auth_tokens', 'admin_tokens']) {
      const update = db.prepare(`UPDATE ${table} SET token = ? WHERE token = ?`);
      for (const { token } of db.prepare(`SELECT token FROM ${table}`).all()) update.run(hashToken(token), token);
    }
    db.exec('PRAGMA user_version = 1');
  });
}

db.exec(`CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_castells_event ON castells(event_id);`);

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

// Sense bloquejar el servidor mentre es comprova (scrypt triga uns quants mil·lisegons).
const scrypt = promisify(crypto.scrypt);
export async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
