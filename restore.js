// Restaura una còpia de seguretat: la desxifra si cal (amb BACKUP_KEY), comprova que és una base de dades sencera de
// l'app i la deixa a un fitxer nou. No toca mai la base de dades que s'està fent servir: per posar-la en marxa, atura
// el servidor i substitueix el fitxer (o arrenca'l amb DB_PATH apuntant a la còpia restaurada).
//
//   node restore.js <còpia.db o còpia.db.enc> [fitxer-de-sortida]
//   BACKUP_KEY='la clau' node restore.js colla-2026-11-18.db.enc data/restaurada.db
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { decryptBackup, isEncryptedBackup } from './backup.js';

const TABLES = ['people', 'events', 'attendance', 'castells', 'castell_positions', 'admins'];

export function restoreBackup(input, output, passphrase = process.env.BACKUP_KEY) {
  if (fs.existsSync(output)) throw new Error(`${output} ja existeix: no el sobreescric. Tria un altre nom.`);
  let data = fs.readFileSync(input);
  if (isEncryptedBackup(data)) {
    if (!passphrase) throw new Error('La còpia està xifrada: posa la clau a BACKUP_KEY.');
    data = decryptBackup(data, passphrase);
  }
  if (!data.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) throw new Error('El fitxer no és una base de dades');
  fs.writeFileSync(output, data, { mode: 0o600 });
  try {
    const db = new DatabaseSync(output);
    try {
      const check = db.prepare('PRAGMA integrity_check').get();
      if (Object.values(check)[0] !== 'ok') throw new Error('La base de dades està malmesa');
      const have = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
      const missing = TABLES.filter((t) => !have.has(t));
      if (missing.length) throw new Error(`No és una còpia de l'app (falten taules: ${missing.join(', ')})`);
      return Object.fromEntries(TABLES.map((t) => [t, db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));
    } finally { db.close(); }
  } catch (err) {
    fs.rmSync(output, { force: true });
    throw err;
  }
}

if (process.argv[1] && import.meta.filename === fs.realpathSync(process.argv[1])) {
  const [input, output = `colla-restaurada-${new Date().toISOString().slice(0, 10)}.db`] = process.argv.slice(2);
  if (!input) {
    console.error('Ús: node restore.js <còpia.db o còpia.db.enc> [fitxer-de-sortida]');
    process.exit(1);
  }
  try {
    const counts = restoreBackup(input, output);
    console.log(`Còpia restaurada a ${output}`);
    for (const [table, n] of Object.entries(counts)) console.log(`  ${table}: ${n}`);
    console.log("Per fer-la servir: atura el servidor i arrenca'l amb DB_PATH apuntant a aquest fitxer.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
