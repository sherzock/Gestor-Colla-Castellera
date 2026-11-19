import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import { DB_PATH, db } from '../db.js';
import { decryptBackup, encryptBackup, offsiteConfig, uploadOffsite } from '../backup.js';
import { checkBackup } from '../restore.js';
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
    verifyBackup(name);
  } catch (err) {
    console.error('No s\'ha pogut fer la còpia de seguretat:', err.message);
    logError('server', `Còpia de seguretat: ${err.message}`);
  }
}

// Restauració de prova de cada còpia nova: es restaura en una carpeta temporal, es comprova que està sencera i que
// hi ha les mateixes persones i sessions que a la base de dades. Si no, error i avís (ALERT_WEBHOOK).
export const backupCheck = () => JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'backup_check'").get()?.value || '{}');
const setBackupCheck = (v) => db.prepare("INSERT INTO settings (key, value) VALUES ('backup_check', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
  .run(JSON.stringify(v));
export function verifyBackup(name) {
  try {
    const counts = checkBackup(path.join(BACKUP_DIR, name));
    for (const table of ['people', 'events']) {
      const live = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      if (counts[table] !== live) throw new Error(`a la còpia hi ha ${counts[table]} files de ${table} i a l'app ${live}`);
    }
    setBackupCheck({ file: name, at: nowUtc(), ok: true });
  } catch (err) {
    setBackupCheck({ file: name, at: nowUtc(), ok: false, error: err.message });
    logError('server', `Comprovació de la còpia: ${err.message}`);
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
      const plain = fs.readFileSync(path.join(BACKUP_DIR, latest));
      const sealed = encryptBackup(plain, OFFSITE.passphrase);
      // Abans d'enviar-la, es comprova que amb la clau es torna a obrir igual: una còpia que no es pot desxifrar no serveix.
      if (!decryptBackup(sealed, OFFSITE.passphrase).equals(plain)) throw new Error('La còpia xifrada no es torna a obrir igual');
      await uploadOffsite(OFFSITE, `${latest}.enc`, sealed);
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
    offsite: OFFSITE ? { last: off.file?.slice(6, 16) ?? null, error: off.error_at > (off.at || '') ? off.error : null } : null,
    check: BACKUP_AUTO && backupCheck().at ? { date: backupCheck().file?.slice(6, 16) ?? null, ok: !!backupCheck().ok, error: backupCheck().error || null } : null };
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
