// Comptes d'administració: segon factor, registre de canvis i contrasenya nova des del servidor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { codeAt, counterAt, verifyCode } from '../totp.js';
import { client, startServer } from './helpers.js';

let server, api;
// Codis de recuperació de l'admin: els codis de l'app no es poden repetir i en una prova tan ràpida s'acabarien.
let recovery = [];
before(async () => { server = await startServer({ DEMO: '0' }); api = `${server.url}/api`; });
after(() => server.stop());
const login = async (username, password, code) => {
  const c = client(api);
  const r = await c('POST', '/login', { username, password, ...(code ? { code } : {}) });
  return { c, r };
};

test('codis: els de l\'exemple de l\'RFC 6238, amb marge d\'un pas i sense repetir-ne cap', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // «12345678901234567890»
  assert.equal(codeAt(secret, 1), '287082');
  assert.equal(codeAt(secret, Math.floor(1111111109 / 30)), '081804');
  const now = 1_700_000_000_000, c = counterAt(now);
  assert.equal(verifyCode(secret, codeAt(secret, c), -1, now), c);
  assert.equal(verifyCode(secret, codeAt(secret, c + 1), -1, now), c + 1);
  assert.equal(verifyCode(secret, codeAt(secret, c + 2), -1, now), null);
  assert.equal(verifyCode(secret, codeAt(secret, c), c, now), null, 'ja fet servir');
  assert.equal(verifyCode(secret, '12345', -1, now), null);
});

test('segon factor: es prepara, s\'activa amb un codi bo i després l\'entrada el demana', async () => {
  const { c: admin } = await login('admin', 'admin1234');
  assert.equal((await admin('POST', '/me/2fa/setup', { currentPassword: 'dolenta1' })).s, 400);
  const { secret, url } = (await admin('POST', '/me/2fa/setup', { currentPassword: 'admin1234' })).d;
  assert.match(url, /^otpauth:\/\/totp\/.+secret=[A-Z2-7]+/);
  assert.equal((await admin('POST', '/me/2fa/enable', { code: '000000' })).s, 400);
  const now = counterAt();
  const { recoveryCodes } = (await admin('POST', '/me/2fa/enable', { code: codeAt(secret, now) })).d;
  assert.equal(recoveryCodes.length, 8);
  recovery = recoveryCodes.slice(1);
  assert.equal((await admin('GET', '/me')).d.twoFactor, true);

  const noCode = await login('admin', 'admin1234');
  assert.equal(noCode.r.s, 401);
  assert.equal(noCode.r.d.needsCode, true);
  assert.equal((await noCode.c('GET', '/me')).s, 401, 'sense codi no s\'entra');
  const wrong = await login('admin', 'admin1234', '000000');
  assert.equal(wrong.r.s, 401);
  assert.equal((await login('admin', 'admin1234', codeAt(secret, now))).r.s, 401, 'el mateix codi no val dos cops');
  assert.equal((await login('admin', 'admin1234', codeAt(secret, now + 1))).r.s, 200);
  // Un codi de recuperació val un sol cop (s'hi poden posar minúscules i sense guió).
  const rc = recoveryCodes[0].toLowerCase().replace('-', '');
  assert.equal((await login('admin', 'admin1234', rc)).r.s, 200);
  assert.equal((await login('admin', 'admin1234', rc)).r.s, 401);
  const accounts = (await admin('GET', '/admins')).d;
  assert.equal(accounts.find((a) => a.username === 'admin').two_factor, true);
});

test('l\'administració pot treure el segon factor d\'un altre compte (si perd el mòbil)', async () => {
  const { c: junta } = await login('junta', 'junta1234');
  const { secret } = (await junta('POST', '/me/2fa/setup', { currentPassword: 'junta1234' })).d;
  await junta('POST', '/me/2fa/enable', { code: codeAt(secret, counterAt()) });
  assert.equal((await login('junta', 'junta1234')).r.d.needsCode, true);
  const { c: admin } = await login('admin', 'admin1234', recovery.pop());
  const id = (await admin('GET', '/admins')).d.find((a) => a.username === 'junta').id;
  assert.equal((await admin('PUT', `/admins/${id}`, { disable_2fa: true, currentPassword: 'admin1234' })).s, 200);
  assert.equal((await login('junta', 'junta1234')).r.s, 200);
});

test('registre de canvis: qui ha fet què (també el que s\'ha esborrat), i només el veu l\'administració', async () => {
  const { c: admin } = await login('admin', 'admin1234', recovery.pop());
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const ev = (await admin('POST', '/events', { type: 'assaig', title: 'Assaig del registre', date })).d.id;
  assert.equal((await admin('DELETE', `/events/${ev}`)).s, 200);
  const log = (await admin('GET', '/audit')).d;
  const [del, create] = log;
  assert.deepEqual([del.action, del.target], ['DELETE /api/events/:id', `Assaig del registre (${date})`]);
  assert.deepEqual([create.action, create.target], ['POST /api/events', 'Assaig del registre']);
  assert.ok(log.every((r) => r.account));
  for (const action of ['login', 'login-failed', 'POST /api/me/2fa/enable', 'PUT /api/admins/:id']) assert.ok(log.some((r) => r.action === action), action);
  assert.ok(!log.some((r) => r.action.includes('/2fa/setup')));
  const { c: junta } = await login('junta', 'junta1234');
  assert.equal((await junta('GET', '/audit')).s, 403);
  assert.equal((await admin('GET', `/audit?before=${log.at(-1).id}`)).d.every((r) => r.id < log.at(-1).id), true);
});

test('contrasenya nova des del servidor: treu el segon factor i tanca les sessions', async () => {
  const { c: before } = await login('admin', 'admin1234', recovery.pop());
  const out = execFileSync(process.execPath, ['reset-password.js', 'admin'], { cwd: path.join(import.meta.dirname, '..'), env: { ...process.env, DB_PATH: server.dbPath }, encoding: 'utf8' });
  const password = out.match(/: (\S+)\n/)[1];
  assert.equal((await before('GET', '/me')).s, 401, 'la sessió d\'abans ja no val');
  assert.equal((await login('admin', 'admin1234')).r.s, 401);
  const { c, r } = await login('admin', password);
  assert.equal(r.s, 200);
  assert.equal((await c('GET', '/me')).d.twoFactor, false);
  assert.ok((await c('GET', '/audit')).d.some((x) => x.action === 'reset-password'));
});
