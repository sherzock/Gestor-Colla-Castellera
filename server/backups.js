import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import { DB_PATH, db } from '../db.js';
import { encryptBackup, offsiteConfig, uploadOffsite } from '../backup.js';
import { DEMO } from './config.js';
import { nowLocal, nowUtc } from './util.js';
import { route } from './router.js';
import { logError } from './errors.js';

// ---------- Còpies de seguretat ----------
// Una còpia diària de la base de dades a BACKUP_DIR (es guarden les últimes BACKUP_KEEP), i els administradors en
// poden baixar una en qualsevol moment per guardar-la fora del servidor. Les sessions obertes (de membre i
// d'administració), els mòbils coneguts dels administradors i els avisos encara per recollir no es copien: qui
// restauri una còpia només haurà de tornar a entrar, i amb la còpia a la mà no s'entra enlloc.
export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
export const BACKUP_KEEP = Math.max(1, Math.min(365, Number(process.env.BACKUP_KEEP) || 14));
export const BACKUP_AUTO = !DEMO || !!process.env.BACKUP_DIR; // a la demo les dades es reinicien: no cal
export const BACKUP_FILE = /^colla-\d{4}-\d{2}-\d{2}\.db$/;
export function writeBackup(file) {
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const copy = new DatabaseSync(file);
  copy.exec('DELETE FROM auth_tokens; DELETE FROM admin_tokens; DELETE FROM admin_devices; DELETE FROM push_inbox; VACUUM;');
  copy.close();
  fs.chmodSync(file, 0o600);
}
export const backupList = () => (fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter((f) => BACKUP_FILE.test(f)).sort() : []);
export function dailyBackup() {
  try {
    const name = `colla-${nowLocal().slice(0, 10)}.db`;
    if (backupList().includes(name)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
    const tmp = path.join(BACKUP_DIR, `.${name}.tmp`);
    fs.rmSync(tmp, { force: true });
    writeBackup(tmp);
    fs.renameSync(tmp, path.join(BACKUP_DIR, name));
    for (const old of backupList().slice(0, -BACKUP_KEEP)) fs.rmSync(path.join(BACKUP_DIR, old));
  } catch (err) {
    console.error('No s\'ha pogut fer la còpia de seguretat:', err.message);
    logError('server', `Còpia de seguretat: ${err.message}`);
  }
}

// Còpia fora del servidor: l'última còpia diària, xifrada, un cop al dia. Si falla, es torna a provar cada hora.
// Sense BACKUP_KEY no s'envia res: les dades personals no surten mai del servidor sense xifrar.
export const OFFSITE = offsiteConfig();
export const offsiteState = () => JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'backup_offsite'").get()?.value || '{}');
export const setOffsiteState = (v) => db.prepare("INSERT INTO settings (key, value) VALUES ('backup_offsite', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
  .run(JSON.stringify(v));
export let offsiteRunning = null;
export function offsiteBackup() {
  const latest = backupList().at(-1);
  if (!OFFSITE || !latest || offsiteRunning || offsiteState().file === latest) return offsiteRunning;
  offsiteRunning = (async () => {
    try {
      if (!OFFSITE.passphrase || OFFSITE.passphrase.length < 12) throw new Error('Falta BACKUP_KEY (almenys 12 caràcters) per xifrar-la');
      await uploadOffsite(OFFSITE, `${latest}.enc`, encryptBackup(fs.readFileSync(path.join(BACKUP_DIR, latest)), OFFSITE.passphrase));
      setOffsiteState({ file: latest, at: nowUtc() });
    } catch (err) {
      setOffsiteState({ ...offsiteState(), error: err.message, error_at: nowUtc() });
      logError('server', `Còpia fora del servidor: ${err.message}`);
    } finally { offsiteRunning = null; }
  })();
  return offsiteRunning;
}
if (BACKUP_AUTO) {
  dailyBackup();
  offsiteBackup();
  setInterval(() => { dailyBackup(); offsiteBackup(); }, Number(process.env.BACKUP_EVERY_MS) || 60 * 60 * 1000).unref();
}

route('GET', '/api/backup/status', () => {
  const list = backupList();
  const off = offsiteState();
  return { auto: BACKUP_AUTO, keep: BACKUP_KEEP, count: list.length, last: list.at(-1)?.slice(6, 16) ?? null,
    offsite: OFFSITE ? { last: off.file?.slice(6, 16) ?? null, error: off.error_at > (off.at || '') ? off.error : null } : null };
}, 'admin');

route('GET', '/api/backup', ({ res }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colla-backup-'));
  try {
    const file = path.join(dir, 'colla.db');
    writeBackup(file);
    const data = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.sqlite3',
      'Content-Disposition': `attachment; filename="colla-${nowLocal().slice(0, 10)}.db"`,
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return undefined;
}, 'admin');
