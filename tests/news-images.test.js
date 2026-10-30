// Imatges i emojis als missatges de l'altaveu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, sessions } from './helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64');
const b64 = (b) => b.toString('base64');
let server, s;
before(async () => { server = await startServer(); s = await sessions(server); });
after(() => server.stop());
const upload = async () => (await s.admin('POST', '/announcements/images', { data: b64(PNG) })).d.id;

test('els emojis es guarden sencers, també si el tall del límit cau a sobre d\'un', async () => {
  const title = '🎉 Diada ❤️ 🏰';
  const a = (await s.admin('POST', '/announcements', { title, body: 'Som-hi 💪', notify: false })).d;
  assert.equal(a.title, title);
  assert.equal(a.body, 'Som-hi 💪');
  const cut = (await s.admin('POST', '/announcements', { title: `${'x'.repeat(119)}🎉`, notify: false })).d;
  assert.equal(cut.title, 'x'.repeat(119));
  await s.admin('DELETE', `/announcements/${a.id}`);
  await s.admin('DELETE', `/announcements/${cut.id}`);
});

test('una imatge es puja, es publica amb el missatge i la veu qui ha entrat', async () => {
  const id = await upload();
  const a = (await s.admin('POST', '/announcements', { title: 'Amb foto', image_ids: [id], notify: false })).d;
  assert.deepEqual(a.images, [id]);
  assert.deepEqual((await s.member('GET', '/announcements')).d.find((x) => x.id === a.id).images, [id]);

  const url = `${server.url}/api/announcements/images/${id}`;
  const cookie = Object.entries(s.member.jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const r = await fetch(url, { headers: { cookie } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await client(`${server.url}/api`)('GET', `/announcements/images/${id}`)).s, 401);
  assert.equal((await s.member('GET', '/announcements/images/noexisteix')).s, 404);
  await s.admin('DELETE', `/announcements/${a.id}`);
  assert.equal((await s.member('GET', `/announcements/images/${id}`)).s, 404, 'en esborrar el missatge, se n\'esborra la imatge');
});

test('només accepta imatges de debò, de qui pot publicar i de mida raonable', async () => {
  const A = s.admin;
  assert.equal((await s.member('POST', '/announcements/images', { data: b64(PNG) })).s, 403);
  assert.equal((await A('POST', '/announcements/images', { data: b64(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')) })).s, 400);
  assert.equal((await A('POST', '/announcements/images', { data: '%%%' })).s, 400);
  assert.equal((await A('POST', '/announcements/images', {})).s, 400);
  const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
  assert.equal((await A('POST', '/announcements/images', { data: b64(big) })).s, 413);
  // Aquesta mida només val per a les imatges: la resta de rutes mantenen el seu límit.
  assert.equal((await A('POST', '/announcements', { title: 'x', body: 'y'.repeat(1024 * 1024) })).s, 413);
});

test('editar: es poden treure i afegir imatges, i si no se\'n parla no canvien', async () => {
  const A = s.admin;
  const [one, two, three] = [await upload(), await upload(), await upload()];
  const a = (await A('POST', '/announcements', { title: 'Editar', image_ids: [one, two], notify: false })).d;
  assert.deepEqual((await A('PUT', `/announcements/${a.id}`, { title: 'Només el títol' })).d.images, [one, two]);
  assert.deepEqual((await A('PUT', `/announcements/${a.id}`, { title: 'Canvi', image_ids: [three, two] })).d.images, [three, two]);
  assert.equal((await A('GET', `/announcements/images/${one}`)).s, 404, 'la que es treu s\'esborra');

  // No es pot robar la imatge d'un altre missatge, ni passar del màxim, ni posar-ne una que no existeix.
  const other = (await A('POST', '/announcements', { title: 'Altre', notify: false })).d;
  assert.equal((await A('PUT', `/announcements/${other.id}`, { title: 'Altre', image_ids: [two] })).s, 400);
  assert.equal((await A('PUT', `/announcements/${other.id}`, { title: 'Altre', image_ids: ['res'] })).s, 400);
  assert.equal((await A('PUT', `/announcements/${other.id}`, { title: 'Altre', image_ids: 'res' })).s, 400);
  const many = [await upload(), await upload(), await upload(), await upload(), await upload()];
  assert.equal((await A('POST', '/announcements', { title: 'Massa', image_ids: many, notify: false })).s, 400);
  assert.equal((await A('GET', '/announcements')).d.filter((x) => x.title === 'Massa').length, 0, 'si falla, no queda el missatge a mitges');
});

test('la demo porta imatges d\'exemple, i són imatges de debò', async () => {
  const list = (await s.member('GET', '/announcements')).d;
  const seeded = list.find((a) => a.title === 'Fotos de la darrera diada');
  assert.equal(seeded.images.length, 2);
  const r = await s.member('GET', `/announcements/images/${seeded.images[0]}`);
  assert.equal(r.s, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
});

test('com a molt 50 missatges: en arribar-hi no se\'n publiquen més, fins que se n\'esborra algun', async () => {
  const A = s.admin;
  const now = (await A('GET', '/announcements')).d.length;
  const made = [];
  for (let i = now; i < 50; i++) made.push((await A('POST', '/announcements', { title: `M${i}`, notify: false })).d.id);
  const full = await A('POST', '/announcements', { title: 'Un de més', notify: false });
  assert.equal(full.s, 400);
  assert.match(full.d.error, /50/);
  await A('DELETE', `/announcements/${made[0]}`);
  assert.equal((await A('POST', '/announcements', { title: 'Ara sí', notify: false })).s, 200);
});
