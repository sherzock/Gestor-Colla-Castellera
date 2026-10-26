import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || path.join(import.meta.dirname, 'data', 'colla.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

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

db.exec(`CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_castells_event ON castells(event_id);`);

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
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
