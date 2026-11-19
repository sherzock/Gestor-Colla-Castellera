import crypto from 'node:crypto';
import { db, hashToken } from '../../db.js';
import { COLLA_CODE, MEMBER_TTL_MS, TOKEN_TTL_MS } from '../config.js';
import { fail, publicPerson, str } from '../util.js';
import { TOO_MANY, adminSession, checkPassword, clientIp, codeByIp, confirmPassword, cookieHeader, cookies, deviceCookie, identifyByIp, loginByIp, loginByUser, meResponse, memberSession, modeCookie, newPassword, newToken, route } from '../router.js';
import { useSecondFactor } from './two-factor.js';
import { audit } from '../audit.js';
import { noDemoAccounts } from './admins.js';

// Es compara en temps constant (pels resums, que tenen la mateixa llargada) i amb límit d'errors.
export function checkCollaCode(req, code) {
  if (!COLLA_CODE) return;
  const ip = clientIp(req);
  if (codeByIp.blocked(ip)) fail(429, TOO_MANY);
  if (!crypto.timingSafeEqual(Buffer.from(hashToken(String(code || '').trim())), Buffer.from(hashToken(COLLA_CODE)))) {
    codeByIp.add(ip);
    fail(401, 'El codi de la colla no és correcte');
  }
}

// Entrada de membres: sense contrasenya, només triant qui ets.
route('POST', '/api/directory', ({ body, req }) => {
  checkCollaCode(req, body.code);
  return db.prepare('SELECT id, name, alias FROM people WHERE active = 1').all().map(publicPerson)
    .sort((a, b) => a.name.localeCompare(b.name, 'ca'));
}, 'public');

route('POST', '/api/identify', ({ body, req, res }) => {
  const ip = clientIp(req);
  if (identifyByIp.blocked(ip)) fail(429, TOO_MANY);
  identifyByIp.add(ip);
  checkCollaCode(req, body.code);
  const person = db.prepare('SELECT * FROM people WHERE id = ? AND active = 1').get(Number(body.person_id)) || fail(404, 'Persona no trobada');
  // Si en aquest mòbil ja hi havia algú, la seva sessió s'acaba (no en queden de penjades).
  const old = cookies(req).token;
  if (old) db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(hashToken(old));
  const token = newToken('auth_tokens', 'person_id', person.id, MEMBER_TTL_MS, { mode: 'member' });
  res.setHeader('Set-Cookie', [cookieHeader(req, 'token', token, MEMBER_TTL_MS / 1000), modeCookie(req, 'member')]);
  const admin = adminSession(cookies(req).atoken);
  return meResponse({ ...person, role: 'member', mode: 'member', sessions: { member: publicPerson(person), admin: !!admin } });
}, 'public');

route('POST', '/api/login', async ({ body, req, res }) => {
  const username = String(body.username || '').trim().toLowerCase().slice(0, 60);
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!(await checkPassword(req, username, admin, body.password))) {
    if (admin) audit({ admin_id: admin.id, name: admin.name }, 'login-failed');
    fail(401, 'Usuari o contrasenya incorrectes');
  }
  if (admin.totp_secret) {
    if (!String(body.code || '').trim()) fail(401, 'Escriu el codi de verificació', undefined, { needsCode: true });
    if (!useSecondFactor(admin, body.code)) {
      loginByIp.add(clientIp(req));
      loginByUser.add(username);
      audit({ admin_id: admin.id, name: admin.name }, 'login-failed');
      fail(401, 'El codi de verificació no és correcte', undefined, { needsCode: true });
    }
  }
  audit({ admin_id: admin.id, name: admin.name }, 'login');
  const old = cookies(req).atoken;
  if (old) db.prepare('DELETE FROM admin_tokens WHERE token = ?').run(hashToken(old));
  const token = newToken('admin_tokens', 'admin_id', admin.id, TOKEN_TTL_MS);
  res.setHeader('Set-Cookie', [cookieHeader(req, 'atoken', token, TOKEN_TTL_MS / 1000), modeCookie(req, 'admin'), ...deviceCookie(req, admin.id)]);
  const member = memberSession(cookies(req).token);
  return meResponse({ ...adminSession(token), sessions: { member: member ? publicPerson(member) : null, admin: true } });
}, 'public');

// Surt de l'entrada que s'està fent servir ara (la de membre o la d'administració); l'altra, si n'hi ha, es manté.
route('POST', '/api/logout', ({ user, req, res }) => {
  if (user.mode === 'admin') {
    db.prepare('DELETE FROM admin_tokens WHERE token = ?').run(user.tokenHash);
    res.setHeader('Set-Cookie', [cookieHeader(req, 'atoken', '', 0), modeCookie(req, 'member')]);
  } else {
    db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(user.tokenHash);
    res.setHeader('Set-Cookie', cookieHeader(req, 'token', '', 0));
  }
  return { ok: true };
});

// Canvia entre «membre» i «administració» sense tornar a entrar.
route('POST', '/api/mode', ({ user, body, req, res }) => {
  const mode = body.mode === 'admin' ? 'admin' : 'member';
  if (mode === 'admin' ? !user.sessions.admin : !user.sessions.member) fail(400, 'Primer has d\'entrar-hi');
  res.setHeader('Set-Cookie', modeCookie(req, mode));
  return { ok: true };
});

route('GET', '/api/me', ({ user, req, res }) => {
  // Els administradors que ja tenien la sessió oberta d'abans també queden com a mòbil conegut.
  if (user.mode === 'admin') res.setHeader('Set-Cookie', deviceCookie(req, user.admin_id));
  return meResponse(user);
});

// Els administradors poden canviar el nom i la contrasenya del seu compte.
route('PUT', '/api/me', async ({ user, body, req }) => {
  const name = 'name' in body ? str(body.name, 60) : user.name;
  if (!name) fail(400, 'El nom és obligatori');
  if (body.newPassword) {
    noDemoAccounts();
    await confirmPassword(req, user, body.currentPassword);
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newPassword(body.newPassword, user.username), user.admin_id);
    // Les altres sessions i els altres mòbils coneguts s'han de tornar a fer (com quan es canvia la d'un altre compte).
    db.prepare('DELETE FROM admin_tokens WHERE admin_id = ? AND token != ?').run(user.admin_id, user.tokenHash);
    db.prepare('DELETE FROM admin_devices WHERE admin_id = ? AND token != ?').run(user.admin_id, hashToken(cookies(req).adev || ''));
  }
  db.prepare('UPDATE admins SET name = ? WHERE id = ?').run(name, user.admin_id);
  return { ok: true, name };
}, 'staff');
