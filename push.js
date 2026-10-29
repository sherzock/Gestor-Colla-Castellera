// Avisos al mòbil (Web Push) sense dependències. L'avís que s'envia al servei de notificacions del mòbil (Google,
// Apple, Mozilla, Microsoft) va buit: només diu «hi ha alguna cosa». El service worker de l'app demana llavors el text
// al nostre servidor (POST /api/push/inbox), així que cap text de la colla passa per aquests serveis.
// L'app s'identifica davant del servei amb una clau VAPID (RFC 8292): un JWT signat amb ES256.
import crypto from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// Les claus es generen la primera vegada i es guarden a la base de dades (load/save): si canviessin, tots els mòbils
// s'haurien de tornar a subscriure.
export function vapidKeys(load, save) {
  let jwk = load();
  if (!jwk) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    jwk = JSON.stringify(privateKey.export({ format: 'jwk' }));
    save(jwk);
  }
  const key = JSON.parse(jwk);
  return {
    privateKey: crypto.createPrivateKey({ key, format: 'jwk' }),
    // La clau pública que el navegador necessita per subscriure's: el punt sense comprimir (0x04 ‖ x ‖ y).
    publicKey: b64url(Buffer.concat([Buffer.from([4]), Buffer.from(key.x, 'base64url'), Buffer.from(key.y, 'base64url')])),
  };
}

// Serveis de notificacions coneguts. Només s'envia a aquests: l'adreça la dona el mòbil i, sense aquesta llista,
// algú podria fer que el servidor fes peticions a qualsevol lloc (també a la xarxa interna).
const PUSH_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
export function validEndpoint(endpoint, extraHosts = []) {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  let url;
  try { url = new URL(endpoint); } catch { return false; }
  if (extraHosts.includes(url.host)) return url.protocol === 'https:' || url.protocol === 'http:';
  return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
}

function vapidJwt(audience, keys, subject) {
  const head = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const signature = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${head}.${claims}.${b64url(signature)}`;
}

// Torna l'estat de la resposta (201 = enviat; 404 o 410 = el mòbil ja no hi és i cal esborrar-lo) o 0 si no s'hi arriba.
export async function sendPush(endpoint, keys, subject) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { TTL: String(24 * 3600), Urgency: 'normal', 'Content-Length': '0',
        Authorization: `vapid t=${vapidJwt(new URL(endpoint).origin, keys, subject)}, k=${keys.publicKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    return res.status;
  } catch {
    return 0;
  }
}
