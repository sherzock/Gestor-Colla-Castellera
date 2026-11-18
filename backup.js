// Còpies de seguretat fora del servidor: xifrades aquí mateix i enviades a un emmagatzematge compatible amb S3
// (Backblaze B2, Cloudflare R2, Scaleway, AWS…). Sense dependències: el xifratge és AES-256-GCM amb una clau que surt
// de la contrasenya BACKUP_KEY (scrypt), i la petició es signa amb AWS Signature V4.
import crypto from 'node:crypto';

// Format del fitxer xifrat: «APYB1», sal (16), iv (12), etiqueta (16) i el contingut.
const MAGIC = Buffer.from('APYB1');
const keyOf = (passphrase, salt) => crypto.scryptSync(String(passphrase), salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export function encryptBackup(data, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyOf(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export const isEncryptedBackup = (data) => data.subarray(0, MAGIC.length).equals(MAGIC);

export function decryptBackup(data, passphrase) {
  if (!isEncryptedBackup(data)) throw new Error('Aquest fitxer no és una còpia xifrada');
  let at = MAGIC.length;
  const take = (n) => data.subarray(at, (at += n));
  const salt = take(16), iv = take(12), tag = take(16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyOf(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(data.subarray(at)), decipher.final()]);
  } catch {
    throw new Error('La clau no és correcta o el fitxer està malmès');
  }
}

// ---------- AWS Signature V4 ----------
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const encodePath = (p) => p.split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');

// Retorna les capçaleres que cal afegir (Authorization i x-amz-date). «headers» ha d'incloure host.
export function signV4({ method, url, headers, payloadHash, region, service, keyId, secret, date = new Date() }) {
  const u = new URL(url);
  const amzDate = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const all = { ...headers, 'x-amz-date': amzDate };
  const names = Object.keys(all).map((k) => k.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const query = [...u.searchParams].map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join('&');
  const canonical = [method, encodePath(decodeURIComponent(u.pathname)) || '/', query,
    names.map((n) => `${n}:${lower[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  return { 'x-amz-date': amzDate, Authorization: `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

// Configuració de l'emmagatzematge a partir de les variables d'entorn (o null si no n'hi ha).
export function offsiteConfig(env = process.env) {
  const { BACKUP_S3_ENDPOINT: endpoint, BACKUP_S3_BUCKET: bucket, BACKUP_S3_KEY_ID: keyId, BACKUP_S3_SECRET: secret, BACKUP_KEY: passphrase } = env;
  if (!endpoint || !bucket || !keyId || !secret) return null;
  return { endpoint: endpoint.replace(/\/+$/, ''), bucket, keyId, secret, passphrase, region: env.BACKUP_S3_REGION || 'us-east-1',
    prefix: (env.BACKUP_S3_PREFIX || '').replace(/^\/+|\/+$/g, '') };
}

// Puja un fitxer (ja xifrat) i torna el codi HTTP. Adreça amb el bucket al camí, que és la que accepten tots.
export async function uploadOffsite(cfg, name, body) {
  const url = `${cfg.endpoint}/${cfg.bucket}/${cfg.prefix ? `${cfg.prefix}/` : ''}${name}`;
  const payloadHash = sha256(body);
  const headers = { host: new URL(url).host, 'x-amz-content-sha256': payloadHash, 'content-type': 'application/octet-stream' };
  const auth = signV4({ method: 'PUT', url, headers, payloadHash, region: cfg.region, service: 's3', keyId: cfg.keyId, secret: cfg.secret });
  const { host, ...rest } = headers;
  const res = await fetch(url, { method: 'PUT', headers: { ...rest, ...auth }, body, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`L'emmagatzematge ha respost ${res.status}`);
  return res.status;
}
