// Base de l'app: estat compartit (qui ha entrat, configuració, idioma, tema), preferències del dispositiu, crides a
// l'API, utilitats, icones, finestres modals i etiquetes que fan servir totes les pantalles.
import { RESULTS, castellName, levelNames, levelRange } from '../castell.js';
import { LANGS, translate } from '../i18n.js';

export const $app = document.getElementById('app');
export let me = null;
export let config = { collaName: 'Colla' };

// ---------- Preferències del dispositiu ----------
export const store = {
  get(k, fallback) { try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sense emmagatzematge */ } },
};

// Idioma de la interfície. Els noms tècnics castellers (baix, pinya, enxaneta…) es mantenen en català.
export let lang = LANGS[store.get('lang', '')] ? store.get('lang', '') : 'ca';
export const t = (key, params) => translate(lang, key, params);
export const tn = (n, one, many) => t(n === 1 ? one : many, { n });
export const LOCALE = { ca: 'ca', es: 'es', en: 'en-GB' };
document.documentElement.lang = lang;

// Tema: automàtic (segons el sistema), clar o fosc.
export let theme = store.get('theme', 'auto');
export function applyTheme() {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
applyTheme();

// ---------- Utilitats ----------
// Sense connexió, el service worker (sw.js) torna l'últim que s'ha vist i diu de quan és (X-Saved-At).
const OFFLINE_DATA = 'colla-dades';
// Quan algú surt o canvia de persona, el que s'havia desat en aquest dispositiu ja no és seu.
export const clearOfflineData = () => window.caches?.delete(OFFLINE_DATA).catch(() => {});
const AUTH_URLS = ['/login', '/logout', '/identify', '/mode'];
function showOffline(savedAt) {
  const bar = document.getElementById('offline');
  if (!bar) return;
  bar.hidden = !savedAt;
  if (savedAt) {
    const when = new Date(savedAt).toLocaleString(LOCALE[lang], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    bar.textContent = t('Sense connexió: es mostra el que es va veure el {when}', { when });
  }
}

export async function api(method, url, body) {
  let res;
  try {
    res = await fetch('/api' + url, {
      method,
      headers: { 'X-Lang': lang, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(t('Sense connexió. Torna-ho a provar quan en tinguis.'));
  }
  if (method === 'GET') showOffline(res.headers.get('X-Saved-At'));
  if (res.ok && AUTH_URLS.includes(url)) { clearOfflineData(); window.dispatchEvent(new Event('colla:auth')); }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (res.status === 401 && url !== '/login') {
    clearOfflineData();
    me = null;
    location.hash = '#/login';
    throw new Error(t('Cal iniciar sessió'));
  }
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data;
}

// Sessions i castells ocults: només els veuen els administradors (els membres no en saben res).
export const hiddenBadge = (label) => `<span class="badge hidden-badge">${icon.eyeOff}${label}</span>`;
export const hiddenToggle = (hidden, id) => `<button class="btn sm" id="${id}">${hidden ? `${icon.eye}${t('Mostra als membres')}` : `${icon.eyeOff}${t('Oculta als membres')}`}</button>`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const isAdmin = () => me?.mode === 'admin';
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, bad = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.className = 'toast'; }, 2600);
}

export async function attempt(fn) {
  try { return await fn(); } catch (err) { toast(err.message, true); return undefined; }
}

export const day = (d) => new Date(d + 'T12:00:00');
export const fmt = (d, opts) => day(d).toLocaleDateString(LOCALE[lang], opts);
export const fmtLong = (d) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const time = (e) => [e.start_time, e.end_time].filter(Boolean).join('–');
// Mides possibles (cm i kg), les mateixes que accepta el servidor.
export const MEASURES = { height_cm: [50, 230], shoulder_height_cm: [30, 200], shoulder_width_cm: [15, 80], weight_kg: [10, 200] };
export const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

export function age(birthdate) {
  if (!birthdate) return null;
  const b = day(birthdate), now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

export const TYPES = ['assaig', 'diada', 'esdeveniment', 'musics'];
export const typeLabel = (k) => ({ assaig: t('Assaig'), diada: t('Diada'), esdeveniment: t('Esdeveniment'), musics: t('Assaig de músics') }[k]);
export const typePlural = (k) => ({ tots: t('Totes'), assaig: t('Assajos'), diada: t('Diades'), esdeveniment: t('Esdeveniments'), musics: t('Músics') }[k]);
export const statusLabel = (s) => ({ si: t('Vinc'), no: t('No vinc') }[s]);
export const statusPill = (s) => `<span class="status ${s || 'none'}">${s ? statusLabel(s) : t('Sense resposta')}</span>`;
export const typeBadge = (type) => `<span class="badge ${type}">${typeLabel(type)}</span>`;
export const INSTRUMENTS = { gralla: 'Gralla', timbal: 'Timbal' };
// Grup de cada persona dins la colla (un de sol). L'ordre és el de les llistes de «Qui hi va».
export const SECTIONS = ['canalla', 'tecnica', 'junta'];
export const sectionLabel = (k) => ({ canalla: t('Canalla'), tecnica: t('Tècnica'), junta: t('Junta') }[k] || t('Altres'));
// Nom curt per a la pinya i llistes: el malnom; si no en té, «Nom I.» per evitar confusions.
export const shortName = (p) => p.alias || p.name?.replace(/^(\S+)\s+(\S).*$/, '$1 $2.') || '';
export const fullName = (p) => (p.alias ? `${p.name} «${p.alias}»` : p.name);
export const initial = (p) => (shortName(p)[0] || '?').toUpperCase();
// «2026-11-07T20:00» → «dv. 7 de nov. a les 20:00»
export const fmtDeadline = (v) => t('{date} a les {time}', { date: fmt(v.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' }), time: v.slice(11, 16) });

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const area = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast(t('Copiat'));
}

const svg = (path, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
export const icon = {
  month: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>'),
  alert: svg('<circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 17h.01"/>', 2.2),
  check: svg('<path d="M20 6 9 17l-5-5"/>', 2.4),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.4 3.3M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/>'),
  chart: svg('<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  users: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  user: svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'),
  calAdd: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v5M9.5 16.5h5"/>'),
  logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  swap: svg('<path d="M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12"/>'),
  megaphone: svg('<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8.5a4 4 0 0 1 0 7M18 5.5a8 8 0 0 1 0 13"/>'),
  pin: svg('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
  clock: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 2.4),
  expand: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  chevron: svg('<path d="M6 9l6 6 6-6"/>'),
  music: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
};

// ---------- Modal ----------
export function openModal(html, onMount) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(back);
  document.addEventListener('keydown', escClose);
  onMount?.(back.firstElementChild);
  back.querySelector('input:not([type=checkbox]), select, textarea')?.focus({ preventScroll: true });
  return back.firstElementChild;
}
export function closeModal() {
  document.querySelector('.modal-back')?.remove();
  document.removeEventListener('keydown', escClose);
}
function escClose(e) { if (e.key === 'Escape') closeModal(); }
export const modalHead = (title) => `<div class="modal-head"><h2>${title}</h2><button class="btn ghost sm x" data-close aria-label="${t('Tanca')}">✕</button></div>`;

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}

// Prova parcial i resultat d'un castell (els noms castellers es mantenen en català).
// El nom no canvia en una prova parcial: només es diu de quin pis a quin pis es fa.
export function partialLabel(c) {
  const { from, to, partial } = levelRange(c);
  if (!partial) return '';
  const names = levelNames(c);
  const name = (L) => names.find((n) => n.level === L)?.label || L;
  return t('Prova parcial: de {from} a {to}', { from: name(from), to: name(to) });
}
export const resultLabel = (r) => (r === 'previst' ? t('Previst') : RESULTS[r] || r);
export const resultClass = (r) => `r-${String(r || 'previst').replace(' ', '-')}`;
// Què va passar quan un castell no es va descarregar (els mateixos valors que al servidor).
export const FAIL_CAUSES = ['obert', 'decantat', 'cedit', 'altre'];
export const failCauseLabel = (c) => ({ obert: t('Es va obrir'), decantat: t('Es va decantar'), cedit: t('Va cedir un pis'), altre: t('Una altra cosa') })[c] || '';
export const resultPill = (r) => (r && r !== 'previst' ? `<span class="result ${resultClass(r)}">${resultLabel(r)}</span>` : '');

export function castellTags(summary) {
  if (!summary) return '';
  return summary.split(';').map((s) => {
    const f = s.split('|');
    const [width, height, agulla, folre, manilles, puntals, sota, net] = f.slice(0, 8).map(Number);
    const result = f[8];
    const c = { width, height, agulla, folre, manilles, puntals, sota, net };
    return `<span class="castell-tag ${resultClass(result)}" title="${resultLabel(result)}">${esc(castellName(c))}</span>`;
  }).join('');
}

// El router és a app.js. Les pàgines tornen a pintar la pantalla amb render() sense importar-lo d'allà.
let renderer = () => {};
export const setRenderer = (fn) => { renderer = fn; };
export const render = (opts) => renderer(opts);

// Estat compartit: els altres fitxers el llegeixen directament i el canvien amb aquestes funcions.
export const setMe = (value) => { me = value; };
export const setConfig = (value) => { config = value; };
export const setLang = (value) => { lang = value; };
export const setTheme = (value) => { theme = value; };
