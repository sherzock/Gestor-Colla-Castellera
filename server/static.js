import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PUBLIC_DIR } from './config.js';

// ---------- Fitxers de l'app i compressió ----------
export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest']);

// Brotli si el navegador el sap llegir (tots els d'ara: ocupa un 15-20 % menys que gzip), si no gzip.
export function encodingFor(req) {
  const accept = req.headers['accept-encoding'] || '';
  return /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
}
const HEADER = { br: 'br', gzip: 'gzip' };
// Les respostes de l'API canvien a cada petició: compressió ràpida (Brotli 4 és tan ràpid com gzip i comprimeix més).
const compressFast = (enc, data) => (enc === 'br'
  ? zlib.brotliCompressSync(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length } })
  : zlib.gzipSync(data));

// Comprimeix les respostes de text si el navegador ho accepta (l'historial d'un castell passa de ~200 KB a ~20 KB).
// No hi ha secrets dins les respostes que puguin barrejar-se amb text d'un atacant (BREACH): les sessions van en cookies.
// encoded: on es guarda la versió comprimida d'una resposta que es reaprofita.
export function sendBody(req, res, status, headers, body, encoded = null) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const enc = data.length > 1024 ? encodingFor(req) : null;
  if (enc) {
    const packed = encoded ? (encoded[enc] ??= compressFast(enc, data)) : compressFast(enc, data);
    res.writeHead(status, { ...headers, 'Content-Encoding': HEADER[enc], Vary: 'Accept-Encoding' }).end(packed);
  } else res.writeHead(status, headers).end(data);
}

// Els fitxers de l'app es llegeixen i es comprimeixen (al màxim, un sol cop i sense aturar el servidor) la primera
// vegada que es demanen, i es guarden a la memòria (en total, uns centenars de KB). Si el fitxer canvia, es torna a fer.
const files = new Map();
const brotliMax = (data) => new Promise((resolve, reject) => zlib.brotliCompress(data, {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length } }, (e, r) => (e ? reject(e) : resolve(r))));
const gzipMax = (data) => new Promise((resolve, reject) => zlib.gzip(data, { level: 9 }, (e, r) => (e ? reject(e) : resolve(r))));
async function loadFile(file, st) {
  // El service worker porta la versió de l'app: canvia (i els mòbils s'actualitzen) quan canvia qualsevol fitxer.
  const build = file === SW_FILE ? buildId() : null;
  const etag = build ? `"sw-${build}"` : `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
  const cached = files.get(file);
  if (cached?.etag === etag) return cached;
  let raw = await fs.promises.readFile(file);
  if (build) raw = Buffer.from(raw.toString('utf8').replace(/^const VERSION = [^;]*;/m, `const VERSION = '${build}';`));
  const entry = { etag, raw, type: MIME[path.extname(file)] || 'application/octet-stream' };
  if (COMPRESSIBLE.has(path.extname(file)) && raw.length > 1024) [entry.br, entry.gzip] = await Promise.all([brotliMax(raw), gzipMax(raw)]);
  files.set(file, entry);
  return entry;
}

// ---------- Versió de l'app ----------
// Un resum del contingut de tots els fitxers de public/. Es recalcula només si n'ha canviat algun (mida o data).
const SW_FILE = path.join(PUBLIC_DIR, 'sw.js');
let build = { signature: null, id: null };
export function buildId() {
  const list = fs.readdirSync(PUBLIC_DIR, { recursive: true }).map(String).filter((f) => !f.split(path.sep).some((p) => p.startsWith('.'))).sort();
  const parts = [];
  for (const f of list) {
    const st = fs.statSync(path.join(PUBLIC_DIR, f));
    if (st.isFile()) parts.push(`${f}:${st.size}:${st.mtimeMs}`);
  }
  const signature = parts.join('|');
  if (build.signature !== signature) {
    const hash = crypto.createHash('sha256');
    for (const p of parts) {
      const f = p.slice(0, p.indexOf(':'));
      hash.update(f).update('\0').update(fs.readFileSync(path.join(PUBLIC_DIR, f)));
    }
    build = { signature, id: hash.digest('hex').slice(0, 16) };
  }
  return build.id;
}

export function serveStatic(req, res, pathname) {
  let decoded;
  // Una adreça mal codificada (p. ex. «/%E0%A4%A») no pot tombar el servidor.
  try { decoded = decodeURIComponent(pathname); } catch { res.writeHead(400).end(); return; }
  const file = path.normalize(path.join(PUBLIC_DIR, decoded === '/' ? 'index.html' : decoded));
  // Ha de quedar dins de public/ (amb la barra: «public-altra/» no hi compta) i no es serveixen fitxers ocults.
  if (!file.startsWith(PUBLIC_DIR + path.sep) || file.includes(`${path.sep}.`)) { res.writeHead(403).end(); return; }
  const send = (f) => fs.stat(f, async (err, st) => {
    if (err || !st.isFile()) {
      // Les adreces de l'app (#/…) i les que no existeixen tornen la pàgina principal.
      if (f !== INDEX_FILE) send(INDEX_FILE); else res.writeHead(404).end('No trobat');
      return;
    }
    let entry;
    try { entry = await loadFile(f, st); } catch { res.writeHead(404).end('No trobat'); return; }
    // «no-cache» vol dir que el navegador el guarda però pregunta si ha canviat: si no, respon 304 sense tornar-lo a enviar.
    const headers = { 'Content-Type': entry.type, 'Cache-Control': 'no-cache', ETag: entry.etag };
    if (entry.br) headers.Vary = 'Accept-Encoding';
    if (req.headers['if-none-match'] === entry.etag) { res.writeHead(304, headers).end(); return; }
    const enc = entry.br ? encodingFor(req) : null;
    if (enc) res.writeHead(200, { ...headers, 'Content-Encoding': HEADER[enc], 'Content-Length': entry[enc].length }).end(entry[enc]);
    else res.writeHead(200, { ...headers, 'Content-Length': entry.raw.length }).end(entry.raw);
  });
  send(file);
}
