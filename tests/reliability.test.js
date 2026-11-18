// Fiabilitat: còpies xifrades fora del servidor (i com es restauren), comprovació de salut i registre d'errors.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { decryptBackup, encryptBackup, signV4 } from '../backup.js';
import { restoreBackup } from '../restore.js';
import { client, sessions, startServer } from './helpers.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { for (let i = 0; i < ms / 50 && !(await fn()); i++) await wait(50); };
const servers = [];
after(async () => { for (const s of servers) await (s.stop?.() ?? new Promise((r) => s.close(r))); });

// Un emmagatzematge S3 de mentida: guarda el que li arriba.
async function fakeStorage() {
  const got = [];
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { got.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.end(); });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  servers.push(srv);
  return { got, url: `http://127.0.0.1:${srv.address().port}` };
}

test('la signatura de les peticions és la de l\'exemple oficial d\'AWS', () => {
  const h = signV4({ method: 'GET', url: 'https://example.amazonaws.com/', headers: { host: 'example.amazonaws.com' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', region: 'us-east-1', service: 'service',
    keyId: 'AKIDEXAMPLE', secret: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', date: new Date('2015-08-30T12:36:00Z') });
  assert.match(h.Authorization, /Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31$/);
});

test('xifrat: només es recupera amb la mateixa clau', () => {
  const data = Buffer.from('dades de la colla');
  const enc = encryptBackup(data, 'una clau prou llarga');
  assert.ok(!enc.includes(data), 'no es veu el contingut');
  assert.deepEqual(decryptBackup(enc, 'una clau prou llarga'), data);
  assert.throws(() => decryptBackup(enc, 'una altra clau qualsevol'), /clau no és correcta/);
});

test('còpia fora del servidor: xifrada, signada, i es pot restaurar', async () => {
  const storage = await fakeStorage();
  const backups = fs.mkdtempSync(path.join(os.tmpdir(), 'colla-backups-'));
  const s = await startServer({ BACKUP_DIR: backups, BACKUP_S3_ENDPOINT: storage.url, BACKUP_S3_BUCKET: 'colla', BACKUP_S3_PREFIX: 'copies',
    BACKUP_S3_KEY_ID: 'clau', BACKUP_S3_SECRET: 'secret', BACKUP_KEY: 'la clau de la colla', BACKUP_EVERY_MS: '200' });
  servers.push(s);
  await until(() => storage.got.length > 0);
  const [put] = storage.got;
  assert.equal(put.method, 'PUT');
  assert.match(put.url, /^\/colla\/copies\/colla-\d{4}-\d{2}-\d{2}\.db\.enc$/);
  assert.match(put.headers.authorization, /^AWS4-HMAC-SHA256 Credential=clau\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  assert.ok(!put.body.includes(Buffer.from('SQLite format 3')), 'surt xifrada');
  // Un cop al dia: la següent volta no la torna a enviar.
  await wait(600);
  assert.equal(storage.got.length, 1);
  const { s: status, d } = await (await sessions(s)).admin('GET', '/backup/status');
  assert.equal(status, 200);
  assert.ok(d.offsite.last);
  assert.equal(d.offsite.error, null);
  // Restaurar-la: amb la clau surt una base de dades sencera; sense, no.
  const file = path.join(backups, 'baixada.db.enc');
  fs.writeFileSync(file, put.body);
  assert.throws(() => restoreBackup(file, path.join(backups, 'x.db'), ''), /BACKUP_KEY/);
  const counts = restoreBackup(file, path.join(backups, 'restaurada.db'), 'la clau de la colla');
  assert.ok(counts.people > 10 && counts.events > 0);
  assert.throws(() => restoreBackup(file, path.join(backups, 'restaurada.db'), 'la clau de la colla'), /ja existeix/);
  fs.rmSync(backups, { recursive: true, force: true });
});

test('sense BACKUP_KEY no s\'envia res, i l\'error queda apuntat', async () => {
  const storage = await fakeStorage();
  const backups = fs.mkdtempSync(path.join(os.tmpdir(), 'colla-backups-'));
  const s = await startServer({ BACKUP_DIR: backups, BACKUP_S3_ENDPOINT: storage.url, BACKUP_S3_BUCKET: 'colla', BACKUP_S3_KEY_ID: 'k', BACKUP_S3_SECRET: 's' });
  servers.push(s);
  const { admin } = await sessions(s);
  await until(async () => (await admin('GET', '/errors')).d.length > 0);
  assert.equal(storage.got.length, 0);
  assert.match((await admin('GET', '/errors')).d[0].message, /BACKUP_KEY/);
  assert.match((await admin('GET', '/backup/status')).d.offsite.error, /BACKUP_KEY/);
  fs.rmSync(backups, { recursive: true, force: true });
});

test('salut i errors dels mòbils: agrupats, sense números i només per a l\'administració; el primer avisa', async () => {
  const hook = await fakeStorage();
  const s = await startServer({ ALERT_WEBHOOK: `${hook.url}/avisos` });
  servers.push(s);
  const anon = client(`${s.url}/api`);
  assert.deepEqual((await anon('GET', '/health')).d.ok, true);
  for (let i = 0; i < 2; i++) assert.equal((await anon('POST', '/client-errors', { message: 'x is undefined', place: '#/castell/123', stack: 'at f' })).s, 200);
  assert.equal((await anon('POST', '/client-errors', {})).s, 400);
  const { admin, member } = await sessions(s);
  const [row] = (await admin('GET', '/errors')).d;
  assert.equal(row.message, 'x is undefined');
  assert.equal(row.place, '#/castell/:id');
  assert.equal(row.count, 2);
  assert.equal((await member('GET', '/errors')).s, 403);
  await until(() => hook.got.length > 0);
  assert.equal(hook.got.length, 1, 'un sol avís per error nou');
  assert.match(hook.got[0].body.toString(), /Error en un mòbil: x is undefined/);
  assert.equal((await admin('DELETE', '/errors')).s, 200);
  assert.deepEqual((await admin('GET', '/errors')).d, []);
});
