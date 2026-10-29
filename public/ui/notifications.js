// Avisos al mòbil: activar-los o desactivar-los als ajustos, i tornar a lligar el mòbil a qui hi ha entrat cada cop
// que algú entra, surt o canvia de persona (core.js avisa amb l'esdeveniment «colla:auth»).
import { api, t, toast } from './core.js';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// A l'iPhone i l'iPad només n'hi ha si l'app s'ha afegit a la pantalla d'inici.
const iosBrowser = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;
const subscription = async () => (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription() ?? null;

// La clau pública arriba en base64url; el navegador la vol en bytes.
const keyBytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function pushState() {
  if (iosBrowser() && !supported()) return 'ios';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return (await subscription()) ? 'on' : 'off';
}

export async function enablePush() {
  if ((await Notification.requestPermission()) !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api('GET', '/push/key');
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await api('POST', '/push/subscribe', { endpoint: sub.endpoint });
  return true;
}

export async function disablePush() {
  const sub = await subscription();
  if (!sub) return;
  await api('POST', '/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

// Ajustos: un paràgraf amb l'estat i el botó per canviar-lo.
export async function pushControls(root, refresh) {
  const box = root.querySelector('#push-box');
  if (!box) return;
  const state = await pushState();
  const text = {
    on: t('Reps avisos dels missatges nous i recordatoris per respondre les sessions.'),
    off: t('Rep un avís quan hi hagi missatges nous i un recordatori si no has respost una sessió.'),
    blocked: t("Els avisos estan bloquejats per a aquesta web: es poden permetre a la configuració del navegador."),
    ios: t("A l'iPhone, primer afegeix l'app a la pantalla d'inici (Comparteix → Afegeix a la pantalla d'inici) i obre-la des d'allà."),
    unsupported: t('Aquest navegador no pot rebre avisos.'),
  }[state];
  box.innerHTML = `<p class="small muted" style="margin:0 0 8px">${text}</p>${state === 'on' || state === 'off'
    ? `<button type="button" class="btn block" id="push-toggle">${state === 'on' ? t('Desactiva els avisos') : t('Activa els avisos')}</button>` : ''}`;
  const btn = box.querySelector('#push-toggle');
  if (btn) btn.onclick = async () => {
    btn.disabled = true;
    try {
      if (state === 'on') { await disablePush(); toast(t('Avisos desactivats')); }
      else if (await enablePush()) toast(t('Avisos activats'));
    } catch (err) {
      toast(err.message || t("No s'han pogut activar els avisos"), true);
    }
    refresh();
  };
}

// Qui fa servir el mòbil ha canviat: els avisos passen a ser de qui hi ha ara, i si ja no hi ha ningú, es donen de baixa.
window.addEventListener('colla:auth', async () => {
  if (!supported()) return;
  const sub = await subscription().catch(() => null);
  if (!sub) return;
  try { await api('POST', '/push/subscribe', { endpoint: sub.endpoint }); } catch { await disablePush().catch(() => {}); }
});
