// Ajuda comuna de les proves: un servidor de veritat amb les dades de demostració, en una base de dades temporal i un
// port lliure (cada fitxer de proves té el seu, i es poden passar alhora), i un client que guarda les galetes.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
// Amb Node 22 (el de Render), node:sqlite no accepta certs valors que les versions noves sí: es comproven igualment.
const NODE22 = path.join(import.meta.dirname, 'node22.js');

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

// Amb «from» s'arrenca amb aquesta base de dades (p. ex. una còpia de seguretat) en lloc de les dades de demostració.
export async function startServer(env = {}, { from } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colla-test-'));
  const dbPath = path.join(dir, 'colla.db');
  if (from) fs.copyFileSync(from, dbPath);
  else execFileSync(process.execPath, ['--import', NODE22, 'seed.js'], { cwd: ROOT, env: { ...process.env, DB_PATH: dbPath }, stdio: 'ignore' });
  const port = await freePort();
  let log = '';
  const child = spawn(process.execPath, ['--import', NODE22, 'server.js'], {
    cwd: ROOT, env: { ...process.env, DB_PATH: dbPath, PORT: String(port), DEMO: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${url}/api/config`)).ok) break; } catch { /* encara arrenca */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    url, port, dir, dbPath, pid: child.pid,
    log: () => log,
    async stop() {
      child.kill();
      await new Promise((r) => child.once('exit', r));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

// Client amb galetes. call(mètode, ruta, cos, capçaleres) → { s: estat, d: JSON o text, text, headers }.
export function client(base, cookies = {}) {
  const jar = { ...cookies };
  const call = async (method, url, body, headers = {}) => {
    const r = await fetch(base + url, {
      method,
      headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const v = kv.slice(i + 1);
      if (v) jar[kv.slice(0, i)] = v; else delete jar[kv.slice(0, i)];
    }
    const text = await r.text();
    let d = text;
    try { d = JSON.parse(text); } catch { /* no és JSON */ }
    return { s: r.status, d, text, headers: r.headers };
  };
  call.jar = jar;
  return call;
}

// Un administrador i un membre (la persona que surt al primer castell d'una diada passada).
export async function sessions(server) {
  const api = `${server.url}/api`;
  const admin = client(api);
  await admin('POST', '/login', { username: 'admin', password: 'admin1234' });
  const pastEvent = (await admin('GET', '/events?scope=past')).d.find((e) => e.type === 'diada');
  const pastCastell = (await admin('GET', `/events/${pastEvent.id}`)).d.castells[0];
  const personId = (await admin('GET', `/castells/${pastCastell.id}`)).d.positions.find((p) => p.person_id).person_id;
  const member = client(api);
  await member('POST', '/identify', { person_id: personId });
  return { api, admin, member, personId, pastEvent, pastCastell };
}

// Totes les rutes de server.js amb el seu nivell de permís: una ruta nova no pot quedar fora de les proves.
export function routes() {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const starts = [...src.matchAll(/^route\('(\w+)', '([^']+)'/gm)];
  return starts.map((m, i) => {
    const chunk = src.slice(m.index, starts[i + 1]?.index ?? src.length);
    const first = chunk.split('\n')[0];
    const end = chunk.search(/^\}.*\);\s*$/m);
    const body = !/\);\s*$/.test(first) && end >= 0 ? chunk.slice(0, chunk.indexOf('\n', end) + 1) : first;
    const auth = /,\s*'admin'\);\s*$/m.test(body) ? 'admin' : /,\s*'public'\);\s*$/m.test(body) ? 'public' : 'user';
    const sample = m[2].replace(/:(\w+)/g, (_, k) => (k === 'key' ? 't1-0' : k === 'name' ? '3d7' : '1'));
    return { method: m[1], path: m[2], sample, auth };
  });
}

export const long = (n) => 'x'.repeat(n);
