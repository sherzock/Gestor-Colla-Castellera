import { buildStructure, castellName, levelNames, levelRange, inTroncView, WIDTHS, RESULTS, LEVEL_PLURAL } from './castell.js';
import { proposeLineup } from './muntador.js';
import { translate, LANGS } from './i18n.js';
import { openZoom } from './zoom.js';

const $app = document.getElementById('app');
let me = null;
let config = { collaName: 'Colla' };

// ---------- Preferències del dispositiu ----------
const store = {
  get(k, fallback) { try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sense emmagatzematge */ } },
};

// Idioma de la interfície. Els noms tècnics castellers (baix, pinya, enxaneta…) es mantenen en català.
let lang = LANGS[store.get('lang', '')] ? store.get('lang', '') : 'ca';
const t = (key, params) => translate(lang, key, params);
const tn = (n, one, many) => t(n === 1 ? one : many, { n });
const LOCALE = { ca: 'ca', es: 'es', en: 'en-GB' };
document.documentElement.lang = lang;

// Tema: automàtic (segons el sistema), clar o fosc.
let theme = store.get('theme', 'auto');
function applyTheme() {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
applyTheme();

// ---------- Utilitats ----------
async function api(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'X-Lang': lang, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (res.status === 401 && url !== '/login') {
    me = null;
    location.hash = '#/login';
    throw new Error(t('Cal iniciar sessió'));
  }
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isAdmin = () => me?.mode === 'admin';
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

function toast(msg, bad = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.className = 'toast'; }, 2600);
}

async function attempt(fn) {
  try { return await fn(); } catch (err) { toast(err.message, true); return undefined; }
}

const day = (d) => new Date(d + 'T12:00:00');
const fmt = (d, opts) => day(d).toLocaleDateString(LOCALE[lang], opts);
const fmtLong = (d) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const time = (e) => [e.start_time, e.end_time].filter(Boolean).join('–');
const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function age(birthdate) {
  if (!birthdate) return null;
  const b = day(birthdate), now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

const TYPES = ['assaig', 'diada', 'esdeveniment', 'musics'];
const typeLabel = (k) => ({ assaig: t('Assaig'), diada: t('Diada'), esdeveniment: t('Esdeveniment'), musics: t('Assaig de músics') }[k]);
const typePlural = (k) => ({ tots: t('Totes'), assaig: t('Assajos'), diada: t('Diades'), esdeveniment: t('Esdeveniments'), musics: t('Músics') }[k]);
const statusLabel = (s) => ({ si: t('Vinc'), potser: t('Potser'), no: t('No vinc') }[s]);
const statusPill = (s) => `<span class="status ${s || 'none'}">${s ? statusLabel(s) : t('Sense resposta')}</span>`;
const typeBadge = (type) => `<span class="badge ${type}">${typeLabel(type)}</span>`;
const INSTRUMENTS = { gralla: 'Gralla', timbal: 'Timbal' };
// Nom curt per a la pinya i llistes: el malnom; si no en té, «Nom I.» per evitar confusions.
const shortName = (p) => p.alias || p.name?.replace(/^(\S+)\s+(\S).*$/, '$1 $2.') || '';
const fullName = (p) => (p.alias ? `${p.name} «${p.alias}»` : p.name);
const initial = (p) => (shortName(p)[0] || '?').toUpperCase();
// «2026-11-07T20:00» → «dv. 7 de nov. a les 20:00»
const fmtDeadline = (v) => t('{date} a les {time}', { date: fmt(v.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' }), time: v.slice(11, 16) });

async function copyText(text) {
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
const icon = {
  month: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>'),
  alert: svg('<circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 17h.01"/>', 2.2),
  check: svg('<path d="M20 6 9 17l-5-5"/>', 2.4),
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
  pin: svg('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
  clock: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 2.4),
  expand: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  chevron: svg('<path d="M6 9l6 6 6-6"/>'),
  music: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
};

// ---------- Modal ----------
function openModal(html, onMount) {
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
function closeModal() {
  document.querySelector('.modal-back')?.remove();
  document.removeEventListener('keydown', escClose);
}
function escClose(e) { if (e.key === 'Escape') closeModal(); }
const modalHead = (title) => `<div class="modal-head"><h2>${title}</h2><button class="btn ghost sm x" data-close aria-label="${t('Tanca')}">✕</button></div>`;

function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}

// ---------- Ajustos: persona, idioma i tema ----------
// Membre: «No sóc jo» torna a «Qui ets?». Administració: tanca només el compte d'administració.
async function switchPerson() {
  closeModal();
  await attempt(() => api('POST', '/logout'));
  me = null;
  location.hash = '#/login';
}

// Al mateix mòbil es pot tenir obert el compte d'administració i la fitxa de membre, i passar d'un a l'altre.
async function switchMode(mode) {
  closeModal();
  if (!(await attempt(() => api('POST', '/mode', { mode })))) return;
  me = await api('GET', '/me');
  toast(mode === 'admin' ? t('Mode administració') : t('Hola, {name}!', { name: shortName(me) }));
  if (location.hash === '#/' || !location.hash) render(); else location.hash = '#/';
}

async function adminLogout() {
  closeModal();
  if (!(await attempt(() => api('POST', '/logout')))) return;
  me = null;
  try { me = await api('GET', '/me'); location.hash = '#/'; render(); } catch { /* sense fitxa de membre: va a «Qui ets?» */ }
}

function settingsControls() {
  const seg = (name, options, current) => `<div class="tabs seg" data-seg="${name}">${options.map(([v, l]) =>
    `<button type="button" data-v="${v}" class="${v === current ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  return `<div class="set-group"><h3>${t('Idioma')}</h3>${seg('lang', Object.entries(LANGS), lang)}</div>
    <div class="set-group"><h3>${t('Aparença')}</h3>${seg('theme', [['auto', t('Automàtic')], ['light', t('Clar')], ['dark', t('Fosc')]], theme)}</div>`;
}
function bindSettings(root, onLang) {
  qsa('[data-seg] button', root).forEach((b) => (b.onclick = () => {
    const kind = b.parentElement.dataset.seg;
    qsa('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b));
    if (kind === 'theme') { theme = b.dataset.v; store.set('theme', theme); applyTheme(); return; }
    lang = b.dataset.v;
    store.set('lang', lang);
    document.documentElement.lang = lang;
    onLang();
  }));
}

function settingsModal() {
  const member = me.sessions?.member;
  const adminOpen = me.sessions?.admin;
  openModal(`${modalHead(t('Ajustos'))}
    <div class="me-card">
      <span class="avatar lg ${isAdmin() ? 'admin' : ''}">${esc(initial(me))}</span>
      <div><div class="nm">${esc(isAdmin() ? me.name : shortName(me))}</div>
        <div class="small muted">${isAdmin() ? t("Compte d'administració · per editar") : t('Has entrat com a membre')}</div></div>
    </div>
    <div class="stack">
      ${isAdmin()
        ? `${member
            ? `<button class="btn primary block" data-mode="member">${icon.user}${t('Respon com a {name}', { name: esc(shortName(member)) })}</button>`
            : `<a class="btn primary block" href="#/login">${icon.user}${t('Entra com a membre per respondre')}</a>`}
           <button class="btn block" id="admin-logout">${icon.logout}${t("Tanca el compte d'administració")}</button>`
        : `<button class="btn primary block" id="switch-person">${icon.swap}${t('No sóc jo · Canvia de persona')}</button>
           ${adminOpen
             ? `<button class="btn block" data-mode="admin">${icon.lock}${t('Passa al mode administració')}</button>`
             : `<a class="btn ghost block" href="#/admin">${t('Entrar com a administrador/a')}</a>`}`}
    </div>
    ${settingsControls()}`, (m) => {
    qs('#switch-person', m)?.addEventListener('click', switchPerson);
    qs('#admin-logout', m)?.addEventListener('click', adminLogout);
    qsa('[data-mode]', m).forEach((b) => (b.onclick = () => switchMode(b.dataset.mode)));
    bindSettings(m, () => { closeModal(); render({ keepScroll: true }); settingsModal(); });
  });
}

// ---------- Navegació ----------
function renderNav() {
  const topbar = document.getElementById('topbar');
  topbar.hidden = !me;
  document.getElementById('brand-name').textContent = config.collaName;
  if (!me) return;
  const path = location.hash || '#/';
  const link = (href, ic, label, match) => `<a href="${href}" class="${match ? 'active' : ''}">${icon[ic]}<span>${label}</span></a>`;
  document.getElementById('nav').innerHTML = [
    link('#/', 'calendar', t('Sessions'), path === '#/' || path.startsWith('#/sessio') || path.startsWith('#/castell')),
    link('#/calendari', 'month', t('Calendari'), path.startsWith('#/calendari')),
    isAdmin() ? link('#/persones', 'users', t('Persones'), path.startsWith('#/persones')) : '',
    link('#/estadistiques', 'chart', t('Estadístiques'), path.startsWith('#/estadistiques')),
    isAdmin() ? link('#/comptes', 'lock', t('Comptes'), path.startsWith('#/comptes')) : link('#/perfil', 'user', t('Perfil'), path.startsWith('#/perfil')),
  ].join('');
  document.body.classList.toggle('admin-mode', isAdmin());
  const chip = document.getElementById('me-chip');
  chip.title = t('Ajustos i canvi de persona');
  chip.setAttribute('aria-label', chip.title);
  chip.innerHTML = isAdmin()
    ? `<span class="avatar admin">${icon.lock}</span><span class="nm">${t('Administració')}</span>${icon.chevron}`
    : `<span class="avatar">${esc(initial(me))}</span><span class="nm">${esc(shortName(me))}</span>${icon.chevron}`;
}
document.getElementById('me-chip').onclick = () => settingsModal();

const PUBLIC_ROUTES = ['#/login', '#/admin'];
const routes = [
  [/^#\/login$/, pageIdentify],
  [/^#\/admin$/, pageAdminLogin],
  [/^#\/?$/, pageHome],
  [/^#\/sessio\/(\d+)$/, pageEvent],
  [/^#\/castell\/(\d+)$/, pageCastell],
  [/^#\/persones$/, pagePeople],
  [/^#\/perfil$/, pageProfile],
  [/^#\/comptes$/, pageAccounts],
  [/^#\/calendari(?:\/(\d{4}-\d{2}))?$/, pageCalendar],
  [/^#\/estadistiques$/, pageStats],
  [/^#\/estadistiques\/persona\/(\d+)$/, pagePersonStats],
];

async function render({ keepScroll = false } = {}) {
  const scroll = window.scrollY;
  const hash = location.hash || '#/';
  if (!me && !PUBLIC_ROUTES.includes(hash)) {
    try { me = await api('GET', '/me'); } catch { return; }
  }
  renderNav();
  const [re, page] = routes.find(([r]) => r.test(hash)) || routes[2];
  const args = hash.match(re)?.slice(1) || [];
  try {
    await page(...args);
    document.title = `${config.collaName}`;
  } catch (err) {
    $app.innerHTML = `<div class="empty"><h2>${t("No s'ha pogut carregar")}</h2><p>${esc(err.message)}</p><a class="btn" href="#/">${t("Torna a l'inici")}</a></div>`;
  }
  window.scrollTo(0, keepScroll ? scroll : 0);
}
window.addEventListener('hashchange', () => { closeModal(); render(); });

// ---------- Entrada de membres: «Qui ets?» ----------
// Els membres no tenen contrasenya: només trien el seu nom perquè l'app sàpiga
// qui confirma l'assistència i on ressaltar-los als castells.
async function pageIdentify() {
  let code = store.get('collaCode', '');
  const shell = (inner) => `
    <div class="login"><div class="card stack identify">
      <span class="brand-mark" aria-hidden="true"></span>
      <h1>${esc(config.collaName)}</h1>
      ${config.demo ? `<div class="demo-note">${t('Versió de prova: tria qualsevol nom per entrar com a membre, o entra com a administrador/a amb {user} / {pass}. Les dades són inventades i es reinicien de tant en tant.', { user: '<b>admin</b>', pass: '<b>admin1234</b>' })}</div>` : ''}
      ${inner}
      <a href="#/admin" class="small" style="display:block;text-align:center">${t('Entrar com a administrador/a')}</a>
      <div class="login-settings">${settingsControls()}</div>
    </div></div>`;
  const bind = (rerun) => bindSettings($app, rerun);

  const askCode = (error = '') => {
    $app.innerHTML = shell(`
      <p class="muted" style="text-align:center;margin:0">${t('Escriu el codi de la colla per entrar')}</p>
      <form id="code-form" class="stack"><input name="code" autocomplete="off" required placeholder="${t('Codi de la colla')}">
        <div class="error">${esc(error)}</div><button class="btn primary">${t('Continua')}</button></form>`);
    qs('#code-form').onsubmit = (e) => { e.preventDefault(); code = e.target.elements.code.value.trim(); store.set('collaCode', code); load(); };
    bind(() => askCode(error));
  };

  const load = async () => {
    let people;
    try {
      people = await api('POST', '/directory', { code });
    } catch (err) {
      askCode(code ? err.message : '');
      return;
    }
    const draw = () => {
      const item = (p) => `<button data-id="${p.id}" data-name="${esc(norm(`${p.name} ${p.alias || ''}`))}">
        <strong>${esc(p.alias || p.name)}</strong>${p.alias ? `<span class="muted small">${esc(p.name)}</span>` : ''}</button>`;
      $app.innerHTML = shell(`
        <p class="muted" style="text-align:center;margin:0">${t("Qui ets? Tria el teu nom per confirmar l'assistència i trobar-te als castells.")}</p>
        <input type="search" id="who-q" placeholder="${t('Busca el teu nom o malnom…')}" autocomplete="off">
        <div class="who-list" id="who-list">${people.map(item).join('')}</div>`);
      const q = qs('#who-q');
      q.focus();
      q.oninput = () => {
        const v = norm(q.value.trim());
        qsa('#who-list button').forEach((b) => b.classList.toggle('hidden', v && !b.dataset.name.includes(v)));
      };
      qs('#who-list').onclick = async (e) => {
        const b = e.target.closest('[data-id]');
        if (!b) return;
        const person = await attempt(() => api('POST', '/identify', { person_id: Number(b.dataset.id), code }));
        if (person) { me = person; location.hash = '#/'; toast(t('Hola, {name}!', { name: shortName(person) })); }
      };
      bind(draw);
    };
    draw();
  };

  if (config.needsCode && !code) askCode(); else await load();
}

// ---------- Entrada d'administradors ----------
async function pageAdminLogin() {
  if (isAdmin()) { location.hash = '#/'; return; }
  $app.innerHTML = `
    <div class="login"><form class="card stack" id="login-form">
      <span class="brand-mark" aria-hidden="true"></span>
      <h1>${t('Administració')}</h1>
      <p class="muted" style="text-align:center;margin:0">${t("Entra amb el teu usuari d'administrador/a")}</p>
      <label class="field">${t('Usuari')}<input name="username" autocomplete="username" autocapitalize="none" required></label>
      <label class="field">${t('Contrasenya')}<input name="password" type="password" autocomplete="current-password" required></label>
      <div class="error" id="login-error"></div>
      <button class="btn primary" style="width:100%">${t('Entra')}</button>
      <p class="small muted" style="text-align:center;margin:0">${t("El compte d'administració només serveix per editar. Per dir si vens a les sessions, entra com a membre amb el teu nom.")}</p>
      <a href="${me ? '#/' : '#/login'}" class="small" style="display:block;text-align:center">${me ? t("Tornar a l'aplicació") : t('Tornar a «Qui ets?»')}</a>
    </form></div>`;
  qs('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      me = await api('POST', '/login', formData(e.target));
      location.hash = '#/';
      toast(t('Mode administració'));
    } catch (err) {
      qs('#login-error').textContent = err.message;
    }
  };
}

// ---------- Sessions ----------
let homeScope = 'upcoming';
let homeType = store.get('homeType', 'tots');

// Prova parcial i resultat d'un castell (els noms castellers es mantenen en català).
// El nom no canvia en una prova parcial: només es diu de quin pis a quin pis es fa.
function partialLabel(c) {
  const { from, to, partial } = levelRange(c);
  if (!partial) return '';
  const names = levelNames(c);
  const name = (L) => names.find((n) => n.level === L)?.label || L;
  return t('Prova parcial: de {from} a {to}', { from: name(from), to: name(to) });
}
const resultLabel = (r) => (r === 'previst' ? t('Previst') : RESULTS[r] || r);
const resultClass = (r) => `r-${String(r || 'previst').replace(' ', '-')}`;
const resultPill = (r) => (r && r !== 'previst' ? `<span class="result ${resultClass(r)}">${resultLabel(r)}</span>` : '');

function castellTags(summary) {
  if (!summary) return '';
  return summary.split(';').map((s) => {
    const f = s.split('|');
    const [width, height, agulla, folre, manilles, puntals, sota, net] = f.slice(0, 8).map(Number);
    const result = f[8];
    const c = { width, height, agulla, folre, manilles, puntals, sota, net };
    return `<span class="castell-tag ${resultClass(result)}" title="${resultLabel(result)}">${esc(castellName(c))}</span>`;
  }).join('');
}

async function pageHome() {
  const events = await api('GET', `/events?scope=${homeScope}`);
  const showMusics = isAdmin() || !!me.instrument;
  const types = ['tots', ...TYPES.filter((x) => x !== 'musics' || showMusics)];
  if (!types.includes(homeType)) homeType = 'tots';
  const list = events.filter((e) => homeType === 'tots' || e.type === homeType);
  // Els comptes d'administració no responen: només els membres veuen què tenen pendent.
  const answering = homeScope === 'upcoming' && !isAdmin();
  const pending = answering ? list.filter((e) => !e.my_status && e.rsvp_open).length : 0;
  let lastMonth = '';
  const items = list.map((e) => {
    const month = fmt(e.date, { month: 'long', year: 'numeric' });
    const header = month !== lastMonth ? `<div class="month">${month}</div>` : '';
    lastMonth = month;
    // A les properes, es veu d'un cop d'ull què has respost: franja de color i, si encara no has dit res, un avís.
    const waiting = answering && !e.my_status && e.rsvp_open;
    const answer = answering && (e.my_status || waiting) ? `ans-${e.my_status || 'none'}` : '';
    return `${header}<a class="card event-card ${e.type} ${answer}" href="#/sessio/${e.id}" ${waiting ? 'data-pending' : ''}>
      <div class="date-block"><div class="d">${day(e.date).getDate()}</div><div class="w">${fmt(e.date, { weekday: 'short' })}</div></div>
      <div class="event-main">
        ${typeBadge(e.type)}${e.escoleta ? ` <span class="badge escoleta">${t('Escoleta')}</span>` : ''}
        <div class="title">${esc(e.title)}</div>
        <div class="event-meta">
          ${time(e) ? `<span>${time(e)}</span>` : ''}${e.location ? `<span>${esc(e.location)}</span>` : ''}
          <span>✓ ${e.count_si}${e.count_potser ? ` · ? ${e.count_potser}` : ''}</span>
        </div>
        ${e.castells ? `<div class="event-castells">${castellTags(e.castells)}</div>` : ''}
      </div>
      <div class="event-side">${isAdmin() ? ''
        : waiting ? `<span class="status pending">${icon.alert}${t('Respon')}</span>`
        : !e.my_status && answering ? `<span class="status none">${t('Tancat')}</span>`
        : statusPill(e.my_status)}</div>
    </a>`;
  }).join('');

  $app.innerHTML = `
    ${isAdmin() ? '' : `<div class="hello card">
      <span class="avatar">${esc(initial(me))}</span>
      <span>${t('Hola, {name}!', { name: `<strong>${esc(shortName(me))}</strong>` })} <span class="muted">${t('No ets tu?')}</span></span>
      <button class="btn sm" id="hello-switch">${icon.swap}${t('Canvia de persona')}</button>
    </div>`}
    <div class="page-head"><h1>${t('Sessions')}</h1>
      <div class="actions">${isAdmin() ? `<button class="btn primary" id="new-event">${icon.plus}${t('Nova sessió')}</button>` : ''}</div>
    </div>
    <div class="toolbar">
      <div class="tabs" id="scope">
        <button data-v="upcoming" class="${homeScope === 'upcoming' ? 'on' : ''}">${t('Properes')}</button>
        <button data-v="past" class="${homeScope === 'past' ? 'on' : ''}">${t('Passades')}</button>
      </div>
      <div class="chips" id="types">
        ${types.map((x) => `<button class="chip ${homeType === x ? 'on' : ''}" data-v="${x}">${typePlural(x)}</button>`).join('')}
      </div>
    </div>
    ${pending ? `<button class="pending-banner" id="go-pending">${icon.alert}<span>${tn(pending, 'Tens {n} sessió sense respondre', 'Tens {n} sessions sense respondre')}</span><b>${t('Respon ara')}</b></button>`
      : answering && list.length ? `<div class="all-answered">${icon.check}${t('Has respost totes les properes sessions.')}</div>` : ''}
    <div class="events">${items || `<div class="empty card">${homeScope === 'upcoming' ? t('No hi ha sessions programades.') : t('No hi ha sessions passades.')}</div>`}</div>`;

  qs('#hello-switch')?.addEventListener('click', switchPerson);
  qs('#go-pending')?.addEventListener('click', () => qs('[data-pending]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  qsa('#scope button').forEach((b) => (b.onclick = () => { homeScope = b.dataset.v; render(); }));
  qsa('#types button').forEach((b) => (b.onclick = () => { homeType = b.dataset.v; store.set('homeType', homeType); render(); }));
  qs('#new-event')?.addEventListener('click', () => eventModal());
}

function eventModal(event, defaults = {}) {
  const e = event || { type: 'assaig', date: todayIso(), start_time: '20:00', end_time: '22:30', escoleta: 0, escoleta_time: '19:00', ...defaults };
  openModal(`${modalHead(event ? t('Edita la sessió') : t('Nova sessió'))}
    <form id="event-form">
      <div class="form-grid">
        <label class="field">${t('Tipus')}<select name="type">${TYPES.map((v) => `<option value="${v}" ${e.type === v ? 'selected' : ''}>${typeLabel(v)}</option>`).join('')}</select></label>
        <label class="field full">${t('Títol')}<input name="title" required value="${esc(e.title)}" placeholder="${t('p. ex. Assaig general, Diada de la Mercè…')}"></label>
        <label class="field">${t('Data')}<input name="date" type="date" required value="${esc(e.date)}"></label>
        <label class="field">${t('Inici')}<input name="start_time" type="time" value="${esc(e.start_time)}"></label>
        <label class="field">${t('Final')}<input name="end_time" type="time" value="${esc(e.end_time)}"></label>
        <label class="field full">${t('Lloc')}<input name="location" value="${esc(e.location)}" placeholder="${t('Local, plaça…')}"></label>
        <div class="full escoleta-opt" id="esc-wrap">
          <label class="check"><input type="checkbox" name="escoleta" ${e.escoleta ? 'checked' : ''}> ${t("Hi ha escoleta abans de l'assaig")}</label>
          <label class="field" id="esc-time">${t("Hora de l'escoleta")}<input name="escoleta_time" type="time" value="${esc(e.escoleta_time || '19:00')}"></label>
        </div>
        <label class="field full">${t('Descripció')}<textarea name="description">${esc(e.description)}</textarea></label>
        <label class="field full">${t('Data límit per respondre (opcional)')}<input name="rsvp_until" type="datetime-local" value="${esc(e.rsvp_until || '')}">
          <span class="small muted">${t('Després ja no es podrà canviar la resposta. Si no en poses, es pot respondre fins al mateix dia.')}</span></label>
      </div>
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${event ? t('Desa') : t('Crea')}</button></div>
    </form>`, (m) => {
    const form = qs('#event-form', m);
    const title = form.elements.title;
    const sync = () => {
      qs('#esc-wrap', m).classList.toggle('hidden', form.elements.type.value !== 'assaig' && !form.elements.escoleta.checked);
      qs('#esc-time', m).classList.toggle('hidden', !form.elements.escoleta.checked);
    };
    form.onchange = sync;
    sync();
    if (!event) {
      title.value = typeLabel('assaig');
      form.elements.type.addEventListener('change', (ev) => {
        if (!title.value || TYPES.map(typeLabel).includes(title.value)) title.value = typeLabel(ev.target.value);
      });
    }
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const saved = await attempt(() => api(event ? 'PUT' : 'POST', event ? `/events/${event.id}` : '/events', formData(ev.target)));
      if (!saved) return;
      closeModal();
      toast(event ? t('Sessió desada') : t('Sessió creada'));
      if (event) render({ keepScroll: true }); else location.hash = `#/sessio/${saved.id}`;
    };
  });
}

// ---------- Detall de sessió ----------
function fieldInput(f, value, prefix = 'x') {
  const name = `${prefix}${f.id}`;
  const req = f.required ? ' *' : '';
  if (f.kind === 'bool') return `<label class="check"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}> ${esc(f.label)}${req}</label>`;
  if (f.kind === 'select') {
    return `<label class="field">${esc(f.label)}${req}<select name="${name}"><option value="">—</option>${f.options.map((o) => `<option ${value === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  }
  const type = f.kind === 'number' ? 'number" min="0" step="1" inputmode="numeric' : 'text';
  return `<label class="field">${esc(f.label)}${req}<input type="${type}" name="${name}" value="${esc(value)}"></label>`;
}
function readExtra(form, fields, prefix = 'x') {
  const out = {};
  for (const f of fields) {
    const el = form.elements[`${prefix}${f.id}`];
    out[f.id] = f.kind === 'bool' ? el.checked : el.value;
  }
  return out;
}
function extraValue(f, v) {
  if (v === null || v === undefined || v === '') return '';
  if (f.kind === 'bool') return v ? t('Sí') : t('No');
  return esc(v);
}

async function pageEvent(id) {
  const { event, fields, castells, mine, attendance, counts } = await api('GET', `/events/${id}`);
  const admin = isAdmin();
  let status = mine?.status ?? null;
  let escoleta = mine?.escoleta ?? null;
  // Es passa llista el mateix dia i després: per defecte, qui havia dit «Vinc» compta com a present.
  const passList = event.date <= todayIso();
  const escTime = event.escoleta_time ? ` · ${event.escoleta_time}` : '';
  // Als assajos de músics no hi ha castells: només interessa qui hi va i què toca.
  const isMusics = event.type === 'musics';
  const going = attendance.filter((a) => (passList ? a.present : a.status === 'si'));
  const instrumentCounts = isMusics
    ? Object.entries(INSTRUMENTS).map(([k, l]) => `<span class="status none">${icon.music} ${l}: ${going.filter((a) => a.instrument === k).length}</span>`).join('')
    : '';
  const namesByInstrument = (list) => {
    const chip = (a) => `<span class="${a.id === me.id ? 'me' : ''}">${esc(shortName(a))}</span>`;
    const groups = [...Object.entries(INSTRUMENTS), [null, t('Altres')]]
      .map(([k, l]) => [l, list.filter((a) => (a.instrument || null) === k)])
      .filter(([, xs]) => xs.length);
    return groups.map(([l, xs]) => `<h3 class="instr-h">${l} · ${xs.length}</h3><div class="names">${xs.map(chip).join('')}</div>`).join('');
  };

  const castellCards = castells.map((c) => {
    const total = buildStructure(c).positions.size;
    const pct = Math.round((c.assigned_count / total) * 100);
    return `<a class="castell-card" href="#/castell/${c.id}">
      <div class="name">${castellName(c)}</div>
      <div class="sub">${esc(c.label || '')} ${resultPill(c.result)}</div>
      <div class="meter" title="${c.assigned_count} / ${total}"><div style="width:${pct}%"></div></div>
      <div class="small muted" style="margin-top:4px">${t('{a}/{b} posicions', { a: c.assigned_count, b: total })}</div>
    </a>`;
  }).join('');

  const confirmed = attendance.filter((a) => a.status === 'si');
  const totals = fields.filter((f) => f.kind === 'number' || f.kind === 'bool').map((f) => {
    const sum = confirmed.reduce((acc, a) => acc + (f.kind === 'number' ? Number(a.extra?.[f.id] || 0) : a.extra?.[f.id] ? 1 : 0), 0);
    return { f, sum };
  });

  const cameCell = (a) => {
    if (!passList) return '';
    const label = a.present ? t('Ha vingut') : t('No ha vingut');
    const cls = a.present ? (a.came && a.status !== 'si' ? 'came walkin' : 'came') : a.status === 'si' ? 'came absent' : 'came off';
    return `<td data-l="${t('Ha vingut')}"><button class="${cls}" data-act="came" title="${t('Toca per canviar-ho')}">${a.present ? '✓ ' : ''}${label}${a.came && a.status !== 'si' ? ` · ${t('sense apuntar-se')}` : ''}</button></td>`;
  };
  const escValue = (v) => (v === true ? `<span class="status si">${t('Sí')}</span>` : v === false ? `<span class="status no">${t('No')}</span>` : '');
  const sortedAttendance = [...attendance].sort((a, b) => (b.present - a.present) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));

  const adminTable = admin ? `
    <div class="card">
      <div class="card-head"><h2>${passList ? t('Passar llista') : t('Assistència')}</h2>
        <div class="actions">
          ${passList ? `<button class="btn sm primary" id="add-walkin">${icon.plus}${t('Afegeix qui ha vingut')}</button>` : ''}
          <a class="btn sm" href="/api/events/${event.id}/attendance.csv">${t('Exporta CSV')}</a>
        </div>
      </div>
      <div class="counts" style="margin-bottom:10px">
        ${passList ? `<span class="status si strong">${t('{n} han vingut', { n: counts.present })}</span>` : ''}
        <span class="status si">${t('{n} vénen', { n: counts.si })}</span><span class="status potser">${t('{n} potser', { n: counts.potser })}</span>
        <span class="status no">${t('{n} no', { n: counts.no })}</span>
        ${passList && counts.absent ? `<span class="status no">${t('{n} apuntats que no han vingut', { n: counts.absent })}</span>` : ''}
        ${passList && counts.walkins ? `<span class="status none">${t('{n} sense apuntar-se', { n: counts.walkins })}</span>` : ''}
        ${event.escoleta ? `<span class="status none">${t('Escoleta: {n}', { n: counts.escoleta })}</span>` : ''}
        ${instrumentCounts}
        ${totals.map((x) => `<span class="status none">${esc(x.f.label)}: ${x.sum}</span>`).join('')}
      </div>
      ${passList ? `<p class="small muted" style="margin:0 0 8px">${t('Qui havia dit «Vinc» compta com a present. Toca «Ha vingut» per marcar qui no ha vingut, o afegeix qui ha vingut sense apuntar-se.')}</p>` : ''}
      <input type="search" id="att-search" placeholder="${t('Cerca persona…')}" style="margin-bottom:6px">
      <div class="table-wrap"><table class="responsive" id="att-table">
        <thead><tr><th>${t('Nom')}</th><th>${t('Estat')}</th>${passList ? `<th>${t('Ha vingut')}</th>` : ''}${event.escoleta ? `<th>${t('Escoleta')}</th>` : ''}${fields.map((f) => `<th>${esc(f.label)}</th>`).join('')}<th>${t('Comentari')}</th></tr></thead>
        <tbody>${sortedAttendance.map((a) => `<tr data-id="${a.id}" data-name="${esc(norm(a.name + ' ' + (a.alias || '')))}" class="${passList && !a.present ? 'not-present' : ''}">
          <td class="lead">${esc(fullName(a))}${a.instrument ? ` <span class="badge musics">${INSTRUMENTS[a.instrument]}</span>` : ''}</td>
          <td><select data-act="status" aria-label="${t('Estat')}">${['', 'si', 'potser', 'no'].map((s) => `<option value="${s}" ${(a.status || '') === s ? 'selected' : ''}>${s ? statusLabel(s) : '—'}</option>`).join('')}</select></td>
          ${cameCell(a)}
          ${event.escoleta ? `<td data-l="${t('Escoleta')}">${escValue(a.escoleta)}</td>` : ''}
          ${fields.map((f) => `<td data-l="${esc(f.label)}">${extraValue(f, a.extra?.[f.id])}</td>`).join('')}
          <td data-l="${t('Comentari')}" class="small">${esc(a.comment)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <p class="small muted">${t("Toca el nom d'una persona per editar els seus camps extra.")}</p>
    </div>` : `
    <div class="card">
      <h2>${passList ? t('Qui ha vingut') : t('Qui hi va')}</h2>
      <div class="counts" style="margin-top:10px">${passList
        ? `<span class="status si">${t('{n} han vingut', { n: counts.present })}</span>`
        : `<span class="status si">${t('{n} vénen', { n: counts.si })}</span><span class="status potser">${t('{n} potser', { n: counts.potser })}</span>`}
        ${event.escoleta ? `<span class="status none">${t('Escoleta: {n}', { n: counts.escoleta })}</span>` : ''}${instrumentCounts}</div>
      ${!attendance.length ? `<div class="names"><span class="muted">${t('Encara ningú')}</span></div>`
        : isMusics ? namesByInstrument(attendance)
        : `<div class="names">${attendance.map((a) => `<span class="${a.id === me.id ? 'me' : ''}">${esc(shortName(a))}</span>`).join('')}</div>`}
    </div>`;

  const fieldsCard = admin ? `
    <div class="card">
      <div class="card-head"><h2>${t('Camps extra')}</h2></div>
      <p class="small muted" style="margin-top:-6px">${t('Preguntes addicionals que cada persona respon en confirmar (acompanyants, dinar, autocar…).')}</p>
      <div class="field-list">${fields.map((f) => `<div class="field-row"><div><div>${esc(f.label)}${f.required ? ' *' : ''}</div>
        <div class="k">${{ number: t('Número'), text: t('Text'), bool: t('Sí / No'), select: t('Llista') + ': ' + esc(f.options.join(', ')) }[f.kind]}</div></div>
        <button class="btn ghost sm danger" style="margin-left:auto" data-del-field="${f.id}">${t('Esborra')}</button></div>`).join('') || `<div class="muted small">${t('Cap camp extra.')}</div>`}</div>
      <form id="field-form" class="form-grid">
        <label class="field">${t('Nom del camp')}<input name="label" placeholder="${t('Acompanyants')}" required></label>
        <label class="field">${t('Tipus')}<select name="kind"><option value="number">${t('Número')}</option><option value="bool">${t('Sí / No')}</option><option value="text">${t('Text')}</option><option value="select">${t("Llista d'opcions")}</option></select></label>
        <label class="field full hidden" id="opts">${t('Opcions (separades per comes)')}<input name="options" placeholder="${t('Carn, Peix, Vegetarià')}"></label>
        <label class="check"><input type="checkbox" name="required"> ${t('Obligatori')}</label>
        <div class="full"><button class="btn sm">${icon.plus}${t('Afegeix camp')}</button></div>
      </form>
    </div>` : '';

  $app.innerHTML = `
    <a class="back" href="#/">${icon.back}${t('Sessions')}</a>
    <div class="page-head"><div class="event-hero">
        <div>${typeBadge(event.type)}</div>
        <h1>${esc(event.title)}</h1>
        <div class="meta"><span>${icon.calendar}${fmtLong(event.date)}</span>${time(event) ? `<span>${icon.clock}${time(event)}</span>` : ''}${event.location ? `<span>${icon.pin}${esc(event.location)}</span>` : ''}${event.escoleta ? `<span class="badge escoleta">${t('Escoleta')}${escTime}</span>` : ''}</div>
      </div>
      <div class="actions">
        ${event.date >= todayIso() ? `<a class="btn sm" href="/api/calendar.ics?event=${event.id}${calendarCode('&')}" download>${icon.calAdd}${t('Al meu calendari')}</a>` : ''}
        ${admin ? `<button class="btn sm" id="edit-event">${t('Edita')}</button><button class="btn sm danger" id="del-event">${t('Esborra')}</button>` : ''}
      </div>
    </div>
    ${event.description ? `<div class="card description">${esc(event.description)}</div>` : ''}
    <div class="grid-2" style="margin-top:14px">
      <div class="stack">
        ${admin ? '' : `<form class="card ${event.rsvp_open ? '' : 'closed'}" id="rsvp-form">
          <h2 style="margin-bottom:12px">${t('La meva assistència')}</h2>
          ${!event.rsvp_open ? `<div class="rsvp-note closed">${icon.lock}<span>${status
              ? t('Les respostes ja estan tancades. Si hi ha cap canvi, digues-ho a un administrador.')
              : t('Les respostes ja estan tancades i no vas respondre. Si véns, digues-ho a un administrador.')}</span></div>`
            : event.rsvp_until ? `<div class="rsvp-note">${icon.clock}<span>${t('Pots respondre fins al {when}.', { when: `<strong>${fmtDeadline(event.rsvp_until)}</strong>` })}</span></div>` : ''}
          ${isMusics ? `<p class="small muted" style="margin:-6px 0 12px">${me.instrument
            ? t('Hi vas com a: {instrument}', { instrument: `<strong>${INSTRUMENTS[me.instrument]}</strong>` })
            : t('No consta que toquis cap instrument. Demana a un administrador que ho afegeixi a la teva fitxa.')}</p>` : ''}
          <div class="rsvp" id="rsvp-main">${['si', 'potser', 'no'].map((s) => `<button type="button" data-v="${s}" class="${status === s ? 'on' : ''}">${statusLabel(s)}</button>`).join('')}</div>
          ${event.escoleta ? `<div class="escoleta-q">
            <div><strong>${t('Escoleta')}</strong>${escTime ? `<span class="muted">${escTime}</span>` : ''}
              <div class="small muted">${t("Vindràs a l'escoleta abans de l'assaig?")}</div></div>
            <div class="rsvp two" id="rsvp-esc">
              <button type="button" data-v="si" class="${escoleta === true ? 'on' : ''}">${t('Hi vindré')}</button>
              <button type="button" data-v="no" class="${escoleta === false ? 'on' : ''}">${t('No hi vindré')}</button>
            </div></div>` : ''}
          <div id="extras" class="stack ${status === 'no' || !status ? 'hidden' : ''}" style="margin-top:14px">
            ${fields.map((f) => fieldInput(f, mine?.extra?.[f.id])).join('')}
          </div>
          <label class="field" style="margin-top:14px">${t('Comentari (opcional)')}<input name="comment" value="${esc(mine?.comment)}" placeholder="${t('Arribaré tard, porto la canalla…')}"></label>
          ${event.rsvp_open ? `<div class="form-actions"><button class="btn primary" ${status || escoleta !== null ? '' : 'disabled'} id="rsvp-save">${t('Desa')}</button></div>` : ''}
        </form>`}
        ${isMusics ? '' : `<div class="card">
          <div class="card-head"><h2>${t('Castells')}</h2>
            ${admin ? `<div class="actions"><button class="btn sm primary" id="add-castell">${icon.plus}${t('Afegeix castell')}</button></div>` : ''}
          </div>
          ${castells.length ? `<div class="castell-list">${castellCards}</div>` : `<p class="muted small">${t('Encara no hi ha castells programats.')}</p>`}
        </div>`}
        ${fieldsCard}
      </div>
      <div class="stack">${admin ? answersCard(event, attendance) : ''}${adminTable}</div>
    </div>`;

  // Confirmació pròpia
  const form = qs('#rsvp-form');
  if (form && !event.rsvp_open) qsa('input, select, textarea, button', form).forEach((el) => (el.disabled = true));
  if (form && event.rsvp_open) {
  qsa('#rsvp-main button', form).forEach((b) => (b.onclick = () => {
    status = b.dataset.v;
    qsa('#rsvp-main button', form).forEach((x) => x.classList.toggle('on', x === b));
    qs('#extras').classList.toggle('hidden', status === 'no');
    qs('#rsvp-save').disabled = false;
  }));
  qsa('#rsvp-esc button', form).forEach((b) => (b.onclick = () => {
    escoleta = b.dataset.v === 'si';
    qsa('#rsvp-esc button', form).forEach((x) => x.classList.toggle('on', x === b));
    qs('#rsvp-save').disabled = false;
  }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = { comment: form.elements.comment.value };
    if (status) { body.status = status; body.extra = status === 'no' ? {} : readExtra(form, fields); }
    if (event.escoleta) body.escoleta = escoleta;
    if (await attempt(() => api('PUT', `/events/${event.id}/attendance`, body))) {
      toast(t('Assistència desada'));
      render({ keepScroll: true });
    }
  };
  }

  if (!admin) return;
  bindAnswersCard(event, attendance);
  const reload = () => render({ keepScroll: true });
  qs('#edit-event').onclick = () => eventModal(event);
  qs('#del-event').onclick = async () => {
    if (!confirm(t("Segur que vols esborrar «{title}» amb els seus castells i l'assistència?", { title: event.title }))) return;
    if (await attempt(() => api('DELETE', `/events/${event.id}`))) { toast(t('Sessió esborrada')); location.hash = '#/'; }
  };
  qs('#add-castell')?.addEventListener('click', () => castellModal(event.id));
  qs('#add-walkin')?.addEventListener('click', () => walkinModal(event, attendance, reload));

  const ff = qs('#field-form');
  ff.elements.kind.onchange = () => qs('#opts').classList.toggle('hidden', ff.elements.kind.value !== 'select');
  ff.onsubmit = async (e) => {
    e.preventDefault();
    if (await attempt(() => api('POST', `/events/${event.id}/fields`, formData(ff)))) { toast(t('Camp afegit')); reload(); }
  };
  qsa('[data-del-field]').forEach((b) => (b.onclick = async () => {
    if (!confirm(t('Esborrar aquest camp? Les respostes ja donades deixaran de mostrar-se.'))) return;
    if (await attempt(() => api('DELETE', `/fields/${b.dataset.delField}`))) reload();
  }));

  qs('#att-search').oninput = (e) => {
    const q = norm(e.target.value.trim());
    qsa('#att-table tbody tr').forEach((tr) => tr.classList.toggle('hidden', q && !tr.dataset.name.includes(q)));
  };
  qsa('#att-table tbody tr').forEach((tr) => {
    const pid = tr.dataset.id;
    const a = attendance.find((x) => String(x.id) === pid);
    qs('[data-act=status]', tr).onchange = async (e) => {
      if (await attempt(() => api('PUT', `/events/${event.id}/attendance/${pid}`, { status: e.target.value || null }))) reload();
    };
    qs('[data-act=came]', tr)?.addEventListener('click', async () => {
      // Només es guarda l'excepció: si coincideix amb la confirmació, es torna a deixar per defecte.
      const next = !a.present;
      const came = next === (a.status === 'si') ? null : next;
      if (await attempt(() => api('PUT', `/events/${event.id}/attendance/${pid}`, { came }))) {
        toast(next ? t('{name}: ha vingut', { name: shortName(a) }) : t('{name}: no ha vingut', { name: shortName(a) }));
        reload();
      }
    });
    qs('.lead', tr).style.cursor = 'pointer';
    qs('.lead', tr).onclick = () => {
      openModal(`${modalHead(esc(fullName(a)))}
        <form id="att-edit" class="stack">
          ${fields.map((f) => fieldInput(f, a.extra?.[f.id])).join('') || `<p class="muted">${t('Aquesta sessió no té camps extra.')}</p>`}
          ${event.escoleta ? `<label class="field">${t('Escoleta')}<select name="escoleta"><option value="">—</option>
            <option value="1" ${a.escoleta === true ? 'selected' : ''}>${t('Hi vindrà')}</option><option value="0" ${a.escoleta === false ? 'selected' : ''}>${t('No hi vindrà')}</option></select></label>` : ''}
          <label class="field">${t('Comentari')}<input name="comment" value="${esc(a.comment)}"></label>
          <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${t('Desa')}</button></div>
        </form>`, (m) => {
        qs('#att-edit', m).onsubmit = async (e) => {
          e.preventDefault();
          const body = { extra: readExtra(e.target, fields), comment: e.target.elements.comment.value };
          if (event.escoleta) body.escoleta = e.target.elements.escoleta.value === '' ? null : e.target.elements.escoleta.value === '1';
          if (await attempt(() => api('PUT', `/events/${event.id}/attendance/${pid}`, body))) { closeModal(); reload(); }
        };
      });
    };
  });
}

// ---------- Respostes: data límit i qui falta per contestar (administració) ----------
function pendingPeople(event, attendance) {
  return attendance.filter((a) => !a.status && (event.type !== 'musics' || a.instrument))
    .sort((a, b) => shortName(a).localeCompare(shortName(b)));
}

// Missatge per enganxar al grup de WhatsApp: només malnoms, com a la resta de l'app.
function reminderText(event, pending) {
  const when = `${fmtLong(event.date)}${event.start_time ? ` · ${event.start_time}` : ''}`;
  return [
    `📣 ${event.title} · ${when}`,
    t('Encara no heu contestat: {names}.', { names: pending.map(shortName).join(', ') }),
    event.rsvp_until ? t('Podeu respondre fins al {when}.', { when: fmtDeadline(event.rsvp_until) }) : null,
    t("Entreu a {url} i digueu si veniu. Gràcies!", { url: `${location.origin}/#/sessio/${event.id}` }),
  ].filter(Boolean).join('\n');
}

function answersCard(event, attendance) {
  if (event.date < todayIso()) return '';
  const pending = pendingPeople(event, attendance);
  const state = !event.rsvp_open ? `<span class="status no">${icon.lock}${t('Tancades')}</span>`
    : event.rsvp_until ? `<span class="status si">${t('Obertes fins al {when}', { when: fmtDeadline(event.rsvp_until) })}</span>`
      : `<span class="status si">${t('Obertes fins al dia de la sessió')}</span>`;
  return `<div class="card answers-card">
    <div class="card-head"><h2>${t('Respostes')}</h2>
      <div class="actions"><button class="btn sm" id="toggle-rsvp">${event.rsvp_open ? `${icon.lock}${t('Tanca-les ara')}` : t('Torna-les a obrir')}</button></div></div>
    <div class="counts" style="margin-bottom:12px">${state}</div>
    ${pending.length ? `<h3 class="instr-h">${tn(pending.length, 'Falta {n} persona per contestar', 'Falten {n} persones per contestar')}</h3>
      <div class="names">${pending.map((a) => `<span>${esc(shortName(a))}</span>`).join('')}</div>
      <div class="share-row">
        <a class="btn sm primary" id="wa-send" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(reminderText(event, pending))}">${icon.share}${t('Envia per WhatsApp')}</a>
        <button class="btn sm" id="copy-reminder">${icon.copy}${t('Copia el missatge')}</button>
      </div>
      <p class="small muted" style="margin:8px 0 0">${t('El missatge porta la llista de malnoms i l\'enllaç a la sessió, per enviar-lo al grup.')}</p>`
    : `<div class="all-answered" style="margin:0">${icon.check}${t('Tothom ha contestat.')}</div>`}
  </div>`;
}

function bindAnswersCard(event, attendance) {
  qs('#copy-reminder')?.addEventListener('click', () => copyText(reminderText(event, pendingPeople(event, attendance))));
  qs('#toggle-rsvp')?.addEventListener('click', async () => {
    if (event.rsvp_open && !confirm(t('Tancar les respostes? Els membres ja no podran canviar si vénen o no.'))) return;
    if (await attempt(() => api('POST', `/events/${event.id}/rsvp`, { open: !event.rsvp_open }))) {
      toast(event.rsvp_open ? t('Respostes tancades') : t('Respostes obertes'));
      render({ keepScroll: true });
    }
  });
}

// Afegir a la llista algú que ha vingut sense apuntar-se (o que encara no és a l'app).
function walkinModal(event, attendance, reload) {
  const absent = attendance.filter((a) => !a.present).sort((a, b) => shortName(a).localeCompare(shortName(b)));
  const mark = async (personId, name) => {
    if (await attempt(() => api('PUT', `/events/${event.id}/attendance/${personId}`, { came: true }))) {
      toast(t('{name}: ha vingut', { name }));
      return true;
    }
    return false;
  };
  openModal(`${modalHead(t('Afegeix qui ha vingut'))}
    <p class="muted" style="margin:-6px 0 10px">${t("Toca les persones que han vingut tot i no estar apuntades. Es poden col·locar als castells d'aquesta sessió.")}</p>
    <input type="search" id="walk-q" placeholder="${t('Cerca per nom o malnom…')}" autocomplete="off">
    <div class="people-pick" id="walk-list">${absent.map((a) => `<button data-pid="${a.id}" data-name="${esc(norm(a.name + ' ' + (a.alias || '')))}">
      <span class="nm">${esc(fullName(a))}</span>${statusPill(a.status)}</button>`).join('') || `<p class="muted">${t('Tothom ja consta com a present.')}</p>`}</div>
    <form id="walk-new" class="pick-bar">
      <input name="name" placeholder="${t("No és a l'app? Escriu nom i cognoms")}" autocomplete="off">
      <button class="btn">${t('Crea i afegeix')}</button>
    </form>
    <div class="form-actions"><button class="btn primary" data-close>${t('Fet')}</button></div>`, (m) => {
    const q = qs('#walk-q', m);
    q.oninput = () => {
      const v = norm(q.value.trim());
      qsa('#walk-list button', m).forEach((b) => b.classList.toggle('hidden', v && !b.dataset.name.includes(v)));
      qs('#walk-new', m).elements.name.value = q.value;
    };
    qs('#walk-list', m).onclick = async (e) => {
      const b = e.target.closest('[data-pid]');
      if (!b || b.disabled) return;
      const a = absent.find((x) => String(x.id) === b.dataset.pid);
      if (await mark(a.id, shortName(a))) {
        reload();
        b.disabled = true;
        b.classList.add('done');
        b.querySelector('.status').outerHTML = `<span class="status si">✓ ${t('Ha vingut')}</span>`;
      }
    };
    qs('#walk-new', m).onsubmit = async (e) => {
      e.preventDefault();
      const name = e.target.elements.name.value.trim();
      if (!name) return;
      const person = await attempt(() => api('POST', '/people', { name }));
      if (person && await mark(person.id, shortName(person))) { closeModal(); reload(); }
    };
  });
}

// ---------- Formulari de castell ----------
function castellModal(eventId, castell, onLost) {
  const c = castell || { width: 3, height: 7, agulla: 0, folre: 0, manilles: 0, cordons: 4, gralles: 0, timbals: 0, result: 'previst' };
  openModal(`${modalHead(castell ? t('Edita el castell') : t('Nou castell'))}
    <form id="castell-form">
      <div class="castell-title" id="cname" style="text-align:center;margin-bottom:12px">${castellName(c)}</div>
      <div class="form-grid">
        <label class="field">${t('Persones per pis')}<select name="width">${WIDTHS.map((w) => `<option value="${w.value}" ${Number(c.width) === w.value ? 'selected' : ''}>${w.label}</option>`).join('')}</select></label>
        <label class="field">${t('Pisos')}<input name="height" type="number" min="3" max="11" value="${c.height}" required></label>
        <label class="field">${t('Cordons (persones per línia)')}<input name="cordons" type="number" min="0" max="12" value="${c.cordons}"></label>
        <label class="check" id="ag-wrap"><input type="checkbox" name="agulla" ${c.agulla ? 'checked' : ''}> ${t('Amb agulla (pilar central)')}</label>
        <label class="check"><input type="checkbox" name="folre" ${c.folre ? 'checked' : ''}> ${t('Folre')}</label>
        <label class="check"><input type="checkbox" name="manilles" ${c.manilles ? 'checked' : ''}> ${t('Manilles')}</label>
        <label class="check"><input type="checkbox" name="puntals" ${c.puntals ? 'checked' : ''}> ${t('Puntals')}</label>
        <label class="check"><input type="checkbox" name="sota" ${c.sota ? 'checked' : ''}> ${t('Aixecat per sota')}</label>
      </div>
      <fieldset style="margin-top:14px"><legend>${t('Prova')}</legend>
        <p class="small muted" style="margin:-4px 0 8px">${t('Als assajos: castell net (el tronc aguanta sol, sense pinya) o només una part del castell.')}</p>
        <div class="form-grid">
          <label class="check"><input type="checkbox" name="net" ${c.net ? 'checked' : ''}> ${t('Net (sense pinya)')}</label>
          <label class="check"><input type="checkbox" name="partial" ${levelRange(c).partial ? 'checked' : ''}> ${t('Parcial (només alguns pisos)')}</label>
        </div>
        <div class="form-grid partial-range" id="partial-range">
          <label class="field">${t('Des del pis')}<select name="from_level"></select></label>
          <label class="field">${t('Fins al pis')}<select name="to_level"></select></label>
          <p class="small muted full" style="margin:0">${t('El nom del castell no canvia. Només es treuen pisos del tronc: la pinya, el folre i les manilles hi són igual.')}</p>
        </div>
      </fieldset>
      <fieldset style="margin-top:14px"><legend>${icon.music} ${t('Música')}</legend>
        <p class="small muted" style="margin:-4px 0 8px">${t('Músics que toquen durant el castell (normalment a les diades).')}</p>
        <div class="form-grid">
          <label class="field">${t('Gralles')}<input name="gralles" type="number" min="0" max="12" value="${c.gralles || 0}"></label>
          <label class="field">${t('Timbals')}<input name="timbals" type="number" min="0" max="12" value="${c.timbals || 0}"></label>
        </div>
      </fieldset>
      <div class="form-grid" style="margin-top:14px">
        <label class="field full">${t('Etiqueta (opcional)')}<input name="label" value="${esc(c.label)}" placeholder="${t('1a ronda, prova de tronc…')}"></label>
        ${castell ? `<label class="field">${t('Resultat')}<select name="result">${Object.keys(RESULTS).map((v) => `<option value="${v}" ${c.result === v ? 'selected' : ''}>${resultLabel(v)}</option>`).join('')}</select></label>` : ''}
        <label class="field full">${t('Notes')}<textarea name="notes">${esc(c.notes)}</textarea></label>
      </div>
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${castell ? t('Desa') : t('Crea')}</button></div>
    </form>`, (m) => {
    const form = qs('#castell-form', m);
    const read = () => {
      const d = formData(form);
      for (const k of ['width', 'height', 'cordons', 'gralles', 'timbals']) d[k] = Number(d[k]);
      d.from_level = d.partial ? Number(d.from_level) || range.from : 1;
      d.to_level = d.partial ? Number(d.to_level) || range.to : 0;
      if (d.to_level >= d.height) d.to_level = 0;
      if (d.width < 3) d.agulla = false;
      if (d.net) d.folre = false;
      if (!d.folre) d.manilles = false;
      if (!d.manilles) d.puntals = false;
      return d;
    };
    // Llistes de pisos: es refan quan canvia l'amplada o l'alçada, mantenint la tria si encara existeix.
    const range = levelRange(c);
    let levelsKey = '';
    const syncLevels = (d) => {
      const fromSel = form.elements.from_level, toSel = form.elements.to_level;
      const key = `${d.width}|${d.height}`;
      if (key !== levelsKey) {
        const first = !toSel.options.length;
        const wasTop = first ? range.to >= Number(c.height) : toSel.selectedIndex === toSel.options.length - 1;
        const prevFrom = Number(fromSel.value) || range.from, prevTo = Number(toSel.value) || range.to;
        levelsKey = key;
        const names = levelNames(d);
        const html = names.map((n) => `<option value="${n.level}">${esc(n.label)}</option>`).join('');
        fromSel.innerHTML = html;
        toSel.innerHTML = html;
        const has = (L) => names.some((n) => n.level === L);
        fromSel.value = String(has(prevFrom) ? prevFrom : 1);
        toSel.value = String(wasTop || !has(prevTo) ? d.height : prevTo);
      }
      [...toSel.options].forEach((o) => { o.disabled = Number(o.value) < Number(fromSel.value); });
      [...fromSel.options].forEach((o) => { o.disabled = Number(o.value) > Number(toSel.value); });
      qs('#partial-range', m).classList.toggle('hidden', !form.elements.partial.checked);
    };
    const sync = () => {
      syncLevels(formData(form));
      const d = read();
      qs('#ag-wrap', m).classList.toggle('hidden', d.width < 3);
      form.elements.folre.disabled = d.net;
      form.elements.manilles.disabled = !d.folre;
      form.elements.puntals.disabled = !d.manilles;
      form.elements.cordons.disabled = d.net;
      form.elements.height.min = d.width === 1 ? 3 : 4;
      qs('#cname', m).textContent = castellName(d);
    };
    form.oninput = sync;
    sync();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const d = read();
      if (castell) {
        const keys = [...buildStructure(d).positions.keys()];
        const lost = onLost?.(new Set(keys)) || 0;
        if (lost && !confirm(t('Amb aquest canvi es perdran {n} persones assignades a posicions que ja no existeixen. Continuar?', { n: lost }))) return;
        d.validKeys = keys;
      }
      const saved = await attempt(() => api(castell ? 'PUT' : 'POST', castell ? `/castells/${castell.id}` : `/events/${eventId}/castells`, d));
      if (!saved) return;
      closeModal();
      if (castell) render({ keepScroll: true }); else location.hash = `#/castell/${saved.id}`;
    };
  });
}

// ---------- Visualitzador de castell ----------
const KIND_LABEL = { base: 'Baix', crossa: 'Crossa', contrafort: 'Contrafort', agulla: 'Agulla', vent: 'Vents', mans: 'Mans', lateral: 'Laterals', latmans: 'Laterals de mans' };
let castellView = store.get('castellView', 'tronc');
let selectedPerson = null;
let searchQuery = '';
let pendingFocus = null;
let proposal = null;
let lastCastellId = null;

const namesAttr = (...people) => esc(norm(people.filter(Boolean).map((p) => [p.name, p.alias, p.guest_name].join(' ')).join(' ')));

function assignedName(a, short = false) {
  if (!a) return '';
  if (a.guest_name) return short ? a.guest_name : t('{name} (temporal)', { name: a.guest_name });
  return short ? shortName(a) : (a.alias || a.name);
}
const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function proposalMeta(a, p) {
  if (a.exact) return `<span class="meta">${t('{n}× aquí', { n: a.exact })}</span>`;
  if (a.cat) return `<span class="meta">${a.cat}× ${esc(p.cat)}</span>`;
  return `<span class="meta warn">${t('sense experiència')}</span>`;
}

function posCell(p, byKey, ctx) {
  const a = byKey.get(p.key);
  const mine = a && a.person_id === me.id;
  let meta = '';
  if (a?.proposed) meta = proposalMeta(a, p);
  else if (ctx.admin && a && !a.guest_name && (a.shoulder_height_cm || a.height_cm)) {
    meta = `<span class="meta">${a.shoulder_height_cm ? `esp. ${a.shoulder_height_cm}` : ''}${a.shoulder_height_cm && a.height_cm ? ' · ' : ''}${a.height_cm ? `${a.height_cm} cm` : ''}</span>`;
  }
  return `<button class="pos g-${p.group} ${p.kind ? `k-${p.kind}` : ''} ${a ? '' : 'empty'} ${a?.proposed ? 'proposed' : ''} ${ctx.admin ? 'editable' : ''} ${mine ? 'mine' : ''}" data-key="${p.key}" data-names="${namesAttr(a)}">
    <span class="role">${esc(p.role)}</span><span class="who">${a ? esc(assignedName(a)) : '—'}</span>${meta}</button>`;
}

// Cel·la de la vista d'historial: qui ha fet aquesta posició i quants cops.
function histCell(p, ctx) {
  const list = ctx.hist.byPos.get(p.key) || [];
  return `<button class="pos hist g-${p.group}" data-key="${p.key}" data-names="${namesAttr(...list)}">
    <span class="role">${esc(p.role)}</span>
    ${list.length ? list.slice(0, 3).map((h) => `<span class="h"><b>${esc(shortName(h))}</b><span>×${h.n}</span></span>`).join('') : '<span class="who">—</span>'}
    ${list.length > 3 ? `<span class="meta">${t('+{n} més', { n: list.length - 3 })}</span>` : ''}
  </button>`;
}

function troncView(s, cell) {
  const agByLevel = new Map(s.agulla.map((a) => [a.level, a]));
  const n = Math.max(...s.levels.map((l) => l.cells.length));
  const rowClass = `t-row${s.agulla.length ? ' ag' : ''}`;
  const rows = [...s.levels].reverse().map((row) => `
    <div class="${rowClass}">
      <div class="t-label">${row.label}${row.tags.map((x) => `<span class="tag">+ ${x}</span>`).join('')}</div>
      <div class="t-cells">${row.cells.map(cell).join('')}</div>
      ${s.agulla.length ? `<div class="t-cells">${agByLevel.has(row.level) ? cell(agByLevel.get(row.level)) : ''}</div>` : ''}
    </div>`).join('');
  const music = s.musica.length ? `<div class="music-block">
      <div class="t-label">${t('Música')}</div>
      <div class="music-cells">${s.musica.map(cell).join('')}</div>
    </div>` : '';
  return `<div class="scroll-x"><div class="tronc zoomable" style="--n:${n}">
    ${s.agulla.length ? `<div class="${rowClass}"><div></div><div class="t-label" style="text-align:center">Tronc</div><div class="t-label" style="text-align:center">Pilar central</div></div>` : ''}
    ${rows}${music}</div></div>
    <div class="legend"><span><i style="background:var(--k-pom)"></i>Pom de dalt</span><span><i style="background:var(--k-tronc)"></i>Tronc</span>${s.levels.some((l) => l.level === 1) ? '<span><i style="background:var(--k-baix)"></i>Baixos</span>' : ''}${s.agulla.length ? '<span><i style="background:var(--k-agulla)"></i>Agulla</span>' : ''}${s.musica.length ? `<span><i style="background:var(--k-musica)"></i>${t('Música')}</span>` : ''}</div>`;
}

// Color del contorn de cada tipus de posició (variables CSS, s'adapten al mode fosc).
const KIND_VAR = {
  base: 'var(--k-baix)', contrafort: 'var(--k-contrafort)', agulla: 'var(--k-agulla)', crossa: 'var(--k-crossa)',
  mans: 'var(--k-mans)', vent: 'var(--k-vent)', lateral: 'var(--k-lateral)', latmans: 'var(--k-latmans)',
};
const KIND_SHORT = { base: 'Baix', contrafort: 'Contrafort', agulla: 'Agulla', crossa: 'Crossa', mans: 'Mans', vent: 'Vent', lateral: 'Lateral', latmans: 'Lat. mans' };

function layerSvg(layer, s, byKey, ctx) {
  const pad = 12;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const i of layer.items) {
    const r = Math.hypot(i.w, i.h) / 2;
    minX = Math.min(minX, i.x - r); maxX = Math.max(maxX, i.x + r);
    minY = Math.min(minY, i.y - r); maxY = Math.max(maxY, i.y + r);
  }
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const boxes = layer.items.map((item) => {
    const a = byKey.get(item.key);
    const mine = a && a.person_id === me.id;
    const role = item.shared ? s.positions.get(item.key)?.role || item.role : item.role;
    // El text segueix la caixa però mai queda cap per avall.
    let deg = (item.rot * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    if (deg > 90 && deg <= 270) deg -= 180;
    const name = a ? truncate(assignedName(a, true), item.w > 70 ? 12 : 9) : '—';
    const short = item.shared ? role?.split(' · ')[0] : `${KIND_SHORT[item.kind]}${item.ring ? ` ${item.ring}` : ''}`;
    if (item.off) {
      return `<g class="box off" transform="translate(${item.x.toFixed(1)} ${item.y.toFixed(1)}) rotate(${deg.toFixed(1)})">
      <title>${esc(t('{level}: no es fa en aquesta prova', { level: role }))}</title>
      <rect x="${-item.w / 2}" y="${-item.h / 2}" width="${item.w}" height="${item.h}" rx="3"/>
      <text class="r" y="3" text-anchor="middle">${esc(role)}</text>
    </g>`;
    }
    return `<g class="box ${a ? '' : 'empty'} ${a?.proposed ? 'proposed' : ''} ${ctx.admin ? 'editable' : ''} ${mine ? 'mine' : ''}" data-key="${item.key}" data-names="${namesAttr(a)}" transform="translate(${item.x.toFixed(1)} ${item.y.toFixed(1)}) rotate(${deg.toFixed(1)})">
      <title>${esc(role + (a ? ': ' + assignedName(a) : ''))}</title>
      <rect x="${-item.w / 2}" y="${-item.h / 2}" width="${item.w}" height="${item.h}" rx="3" style="stroke:${KIND_VAR[item.kind]}"/>
      <text class="r" y="-5" text-anchor="middle">${esc(short)}</text>
      <text class="n" y="9" text-anchor="middle">${esc(name)}</text>
    </g>`;
  }).join('');
  const w = maxX - minX, h = maxY - minY;
  return `<svg class="plan" viewBox="${minX.toFixed(0)} ${minY.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" role="img" aria-label="${esc(layer.label)}">${boxes}</svg>`;
}

function pinyaView(s, byKey, ctx) {
  const kinds = ['base', 'contrafort', 'agulla', 'crossa', 'mans', 'vent', 'lateral'];
  return s.layers.map((layer, i) => {
    const filled = layer.items.filter((x) => !x.shared && byKey.has(x.key)).length;
    const total = layer.items.filter((x) => !x.shared).length;
    return `<div class="layer">
      <div class="card-head"><h2>${layer.label}</h2><span class="muted small">${t('{a}/{b} posicions', { a: filled, b: total })}</span>
        <div class="actions"><button class="btn sm" data-zoom-layer="${i}">${icon.expand}${t('Amplia')}</button></div></div>
      <div class="plan-wrap" data-zoom-layer="${i}">${layerSvg(layer, s, byKey, ctx)}</div>
    </div>`;
  }).join('') + `<div class="legend">${kinds.map((k) => `<span><i style="background:${KIND_VAR[k]}"></i>${KIND_LABEL[k]}</span>`).join('')}</div>
    <p class="small muted">${t("Planta vista des de dalt. La rengla (primer baix) queda a dalt. Toca una caixa per veure'n la posició.")}</p>`;
}

function listSections(s) {
  const sections = [{ id: 'tronc', title: 'Tronc i pom de dalt', items: [...s.levels].reverse().flatMap((l) => l.cells) }];
  if (s.agulla.length) sections.push({ id: 'agulla', title: 'Pilar central (agulla)', items: [...s.agulla].reverse() });
  if (s.musica.length) sections.push({ id: 'musica', title: t('Música'), items: s.musica });
  for (const layer of s.layers) sections.push({ id: layer.id, title: layer.label, items: layer.items.filter((i) => !i.shared) });
  return sections;
}

function listView(s, byKey, ctx) {
  const li = (p) => {
    const a = byKey.get(p.key);
    const mine = a && a.person_id === me.id;
    return `<li class="${a ? '' : 'empty'} ${a?.proposed ? 'proposed' : ''} ${ctx.admin ? 'editable' : ''} ${mine ? 'mine' : ''}" data-key="${p.key}" data-names="${namesAttr(a)}"><span class="r">${esc(p.role)}</span><span class="n">${a ? esc(assignedName(a)) : '—'}</span></li>`;
  };
  return `<div class="pos-list">${listSections(s).map(({ title, items }) => `<h3>${esc(title)}</h3><ul>${items.map(li).join('')}</ul>`).join('')}</div>`;
}

function historyView(s, ctx) {
  const { hist } = ctx;
  if (!hist.castellsCount) {
    return `<div class="empty">${s.width === 1 ? t('Encara no hi ha pilars en sessions passades.') : t('Encara no hi ha castells de {w} en sessions passades.', { w: s.width })}<br>
      <span class="small">${t("L'historial es construeix sol amb les alineacions dels castells que ja s'han fet.")}</span></div>`;
  }
  const cell = (p) => histCell(p, ctx);
  const pinyaSections = listSections(s).filter(({ id }) => !['tronc', 'agulla', 'musica'].includes(id));
  return `<p class="small muted" style="margin-top:0">${t("Qui ha fet cada posició en els {n} castells anteriors de la mateixa amplada, i quants cops. Toca una posició per veure'n la llista completa.", { n: hist.castellsCount })}</p>
    ${troncView(s, cell)}
    ${pinyaSections.map(({ title, items }) => `<h3 style="margin:20px 0 8px">${esc(title)}</h3><div class="hist-grid">${items.map(cell).join('')}</div>`).join('')}`;
}

// ---------- Revisió de l'alineació (administració) ----------
// Avisos per detectar errors abans de la sessió: gent col·locada que no ve, forats al tronc,
// espatlles desiguals en un mateix pis i algú que pesa més que qui el porta.
const SHOULDER_GAP_CM = 5;
const WEIGHT_GAP_KG = 3;
function lineupWarnings(s, byKey, candidates, event) {
  const out = [];
  const status = new Map(candidates.map((c) => [c.id, c.status]));
  const role = (key) => s.positions.get(key)?.role || key;
  const who = (a) => assignedName(a, true);
  // Cada avís és una línia amb les posicions afectades com a botons per anar-hi.
  const chip = (a) => ({ key: a.pos_key, label: `${who(a)} · ${role(a.pos_key)}` });
  if (event.date >= todayIso()) {
    const placed = [...byKey.values()].filter((a) => a.person_id);
    const group = (level, text, list) => { if (list.length) out.push({ level, text, items: list.map(chip) }); };
    group('bad', t('Han dit que no vénen'), placed.filter((a) => status.get(a.person_id) === 'no'));
    group('warn', t('Han dit «potser»'), placed.filter((a) => status.get(a.person_id) === 'potser'));
    group('warn', t('Encara no han contestat'), placed.filter((a) => !status.get(a.person_id)));
  }
  const tronc = [...s.positions.values()].filter((p) => ['baixos', 'tronc', 'pom', 'agulla'].includes(p.group));
  const empty = tronc.filter((p) => !byKey.has(p.key));
  if (empty.length) out.push({ level: 'bad', text: tn(empty.length, 'Falta {n} posició al tronc', 'Falten {n} posicions al tronc'), items: empty.map((p) => ({ key: p.key, label: p.role })) });

  // Mateix pis: les espatlles han de quedar a la mateixa alçada.
  const byLevel = new Map();
  for (const p of tronc) if (p.key.startsWith('t') && p.level > 1) byLevel.set(p.level, [...(byLevel.get(p.level) || []), p]);
  for (const [level, list] of byLevel) {
    const people = list.map((p) => byKey.get(p.key)).filter((a) => a?.shoulder_height_cm);
    if (people.length < 2) continue;
    const hs = people.map((a) => a.shoulder_height_cm);
    const gap = Math.round(Math.max(...hs) - Math.min(...hs));
    if (gap > SHOULDER_GAP_CM) {
      out.push({ level: 'warn', text: t("{level}: {n} cm de diferència d'alçada d'espatlles", { level: LEVEL_PLURAL[level - 1], n: gap }),
        items: people.sort((a, b) => b.shoulder_height_cm - a.shoulder_height_cm).map((a) => ({ key: a.pos_key, label: `${who(a)} · ${a.shoulder_height_cm} cm` })) });
    }
  }
  // Qui puja no hauria de pesar més que qui el porta (mateixa columna, un pis més avall).
  for (const p of tronc) {
    const m = p.key.match(/^(t|ag)(\d+)(-\d+)?$/);
    if (!m || Number(m[2]) < 2) continue;
    const below = `${m[1]}${Number(m[2]) - 1}${m[3] || ''}`;
    const up = byKey.get(p.key), down = byKey.get(below);
    if (up?.weight_kg && down?.weight_kg && up.weight_kg - down.weight_kg > WEIGHT_GAP_KG) {
      out.push({ level: 'warn', text: t('{up} pesa {n} kg més que {down}, que el porta', { up: who(up), n: Math.round(up.weight_kg - down.weight_kg), down: who(down) }),
        items: [chip(up), chip(down)] });
    }
  }
  const order = { bad: 0, warn: 1 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

function warningsCard(warnings) {
  if (!warnings.length) return `<div class="lineup-ok">${icon.check}${t("Revisió de l'alineació: tot correcte")}</div>`;
  return `<details class="card lineup-warnings" open>
    <summary>${icon.alert}<strong>${tn(warnings.length, '{n} avís a revisar', '{n} avisos a revisar')}</strong>
      <span class="small muted">${t('Toca un nom per veure la posició')}</span></summary>
    <ul>${warnings.map((w) => `<li class="${w.level}"><span class="w-text">${esc(w.text)}</span>
      <span class="w-items">${w.items.map((i) => `<button data-warn="${i.key}">${esc(i.label)}</button>`).join('')}</span></li>`).join('')}</ul>
  </details>`;
}

function focusKey(key, s) {
  const el = qs(`#viewer [data-key="${key}"]`);
  if (!el || el.getClientRects().length === 0) {
    const pos = s.positions.get(key);
    castellView = castellView === 'historial' ? 'historial' : pos && inTroncView(pos) ? 'tronc' : 'pinya';
    if (castellView !== 'historial') store.set('castellView', castellView);
    pendingFocus = key;
    render({ keepScroll: true });
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  el.classList.remove('flash'); void el.getBoundingClientRect(); el.classList.add('flash');
}

const zoomLabels = () => ({
  in: t('Amplia'), out: t('Redueix'), fit: t('Ajusta a la pantalla'), close: t('Tanca'),
  hint: t('Pinça o fes servir + i − per ampliar. Arrossega per moure. Toca una posició per veure qui hi ha.'),
});

async function pageCastell(id) {
  // L'historial de posicions només el veuen els administradors.
  const [data, history] = await Promise.all([
    api('GET', `/castells/${id}`),
    isAdmin() ? api('GET', `/castells/${id}/history`) : { castellsCount: 0, exact: [] },
  ]);
  const { castell, event, positions, siblings, candidates = [], events = [] } = data;
  const admin = isAdmin();
  const s = buildStructure(castell);
  const saved = new Map(positions.filter((p) => s.positions.has(p.pos_key)).map((p) => [p.pos_key, p]));
  if (proposal && proposal.castellId !== castell.id) proposal = null;

  // Si hi ha una proposta del muntador, es mostra a sobre de l'alineació desada.
  const byKey = new Map(saved);
  if (proposal) {
    for (const [key, val] of proposal.map) {
      if (val) byKey.set(key, { pos_key: key, person_id: val.person.id, ...val.person, proposed: true, exact: val.exact, cat: val.cat });
      else byKey.delete(key);
    }
  }
  const keyByPerson = new Map([...byKey.values()].filter((p) => p.person_id).map((p) => [p.person_id, p.pos_key]));

  const exact = new Map(history.exact.map((h) => [`${h.pos_key}|${h.person_id}`, h.n]));
  const byPos = new Map();
  for (const h of history.exact) byPos.set(h.pos_key, [...(byPos.get(h.pos_key) || []), h]);
  for (const list of byPos.values()) list.sort((a, b) => b.n - a.n || b.last.localeCompare(a.last));
  const hist = { ...history, exactMap: exact, byPos };

  const ctx = { admin, hist };
  const mineKey = keyByPerson.get(me.id);
  if (selectedPerson && keyByPerson.has(selectedPerson.id)) selectedPerson = null;

  // La primera vegada que un membre obre un castell on surt, se li ensenya la vista on és.
  if (castell.id !== lastCastellId) {
    lastCastellId = castell.id;
    if (!admin && mineKey) castellView = inTroncView(s.positions.get(mineKey)) ? 'tronc' : 'pinya';
  }

  const views = { tronc: 'Tronc', ...(s.layers.length ? { pinya: 'Pinya' } : {}), llista: t('Llista'), ...(admin ? { historial: t('Historial') } : {}) };
  if (!views[castellView]) castellView = 'tronc';
  const body = {
    pinya: () => pinyaView(s, byKey, ctx),
    llista: () => listView(s, byKey, ctx),
    historial: () => historyView(s, ctx),
  }[castellView]?.() ?? troncView(s, (p) => posCell(p, byKey, ctx));
  const confirmed = candidates.filter((c) => c.status === 'si');
  const unplaced = confirmed.filter((c) => !keyByPerson.has(c.id));
  const guests = [...saved.values()].filter((p) => p.guest_name);
  const canZoom = castellView !== 'llista';
  const warnings = admin ? lineupWarnings(s, byKey, candidates, event) : [];

  $app.innerHTML = `
    <a class="back" href="#/sessio/${event.id}">${icon.back}${esc(event.title)} · ${fmt(event.date, { day: 'numeric', month: 'short' })}</a>
    ${siblings.length > 1 ? `<nav class="sibling-nav">${siblings.map((c) => `<a href="#/castell/${c.id}" class="${c.id === castell.id ? 'on' : ''}">${castellName(c)}${c.label ? ` · ${esc(c.label)}` : ''}</a>`).join('')}</nav>` : ''}
    <div class="page-head">
      <div>
        <div class="castell-title">${s.name}</div>
        ${partialLabel(castell) ? `<div class="parts big">${partialLabel(castell)}</div>` : ''}
        <div class="muted">${castell.net ? `<span class="result">${t('Net: sense pinya')}</span> ` : ''}${castell.sota ? '<span class="result">Aixecat per sota</span> ' : ''}${esc(castell.label || '')} ${resultPill(castell.result)}</div>
      </div>
      <div class="actions">
        ${mineKey && !proposal ? `<button class="btn sm" id="find-me">${t('On sóc?')}</button>` : ''}
        ${admin ? `<button class="btn sm primary" id="auto-build">${t('Munta automàticament')}</button><button class="btn sm" id="edit-castell">${t('Edita')}</button><button class="btn sm" id="dup-castell">${t('Duplica')}</button><button class="btn sm danger" id="del-castell">${t('Esborra')}</button>` : ''}
      </div>
    </div>
    ${admin ? `<div class="result-bar"><span class="small muted">${t('Com ha acabat?')}</span>
      <div class="tabs seg" id="result-seg">${Object.keys(RESULTS).map((r) => `<button type="button" data-v="${r}" class="${resultClass(r)} ${castell.result === r ? 'on' : ''}">${resultLabel(r)}</button>`).join('')}</div>
    </div>` : ''}
    ${!admin && mineKey ? `<div class="card my-pos"><span class="small muted">${t('La teva posició')}</span><strong>${esc(s.positions.get(mineKey).role)}</strong></div>` : ''}
    ${castell.notes ? `<div class="card description" style="margin-bottom:14px">${esc(castell.notes)}</div>` : ''}
    ${proposal ? `<div class="card proposal-bar">
      <div><strong>${t('Proposta automàtica')}</strong> · ${t('{n} posicions omplertes', { n: proposal.filled })}${proposal.empty ? `, ${t('{n} sense cobrir', { n: proposal.empty })}` : ''}${proposal.unused.length ? ` · ${tn(proposal.unused.length, '{n} persona sense posició', '{n} persones sense posició')}` : ''}
        <div class="small muted">${t('Encara no està desada. Les posicions proposades es marquen amb línia discontínua.')}</div></div>
      <div class="actions"><button class="btn sm primary" id="prop-apply">${t('Aplica')}</button><button class="btn sm" id="prop-again">${t('Torna a generar')}</button><button class="btn sm ghost" id="prop-discard">${t('Descarta')}</button></div>
    </div>` : ''}
    ${selectedPerson ? `<div class="card" style="margin-bottom:14px;border-color:var(--accent)">${t("{name} seleccionat/da: toca una posició per col·locar-l'hi.", { name: `<strong>${esc(fullName(selectedPerson))}</strong>` })} <button class="btn sm ghost" id="cancel-sel">${t('Cancel·la')}</button></div>` : ''}
    ${admin ? warningsCard(warnings) : ''}
    <div class="viewer-layout ${admin ? 'with-side' : ''}">
      <div class="card">
        <div class="card-head">
          <div class="tabs" id="views">${Object.entries(views).map(([k, l]) => `<button data-v="${k}" class="${castellView === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <span class="muted small">${t('{a}/{b} posicions cobertes', { a: byKey.size, b: s.positions.size })}</span>
          ${canZoom ? `<button class="btn sm zoom-btn" id="zoom-all">${icon.expand}<span>${t('Pantalla completa')}</span></button>` : ''}
        </div>
        <div class="search-row">
          <input type="search" id="pos-search" placeholder="${castellView === 'historial' ? t('Cerca qui ha fet cada posició…') : t('Cerca una persona al castell…')}" value="${esc(searchQuery)}" autocomplete="off">
          <div class="hits" id="search-hits"></div>
        </div>
        <div id="viewer" class="view-${castellView}">${body}</div>
      </div>
      ${admin ? `<aside class="stack">
        <div class="card">
          <h3>${t('Confirmats sense posició')}</h3>
          <p class="small muted" style="margin:4px 0 10px">${t('{a} de {b} confirmats. Toca un nom i després una posició.', { a: unplaced.length, b: confirmed.length })}</p>
          <div class="side-list">${unplaced.map((c) => `<button data-pick="${c.id}" class="${selectedPerson?.id === c.id ? 'assigned' : ''}">${esc(shortName(c))}${c.instrument ? ` ${icon.music}` : ''}${c.shoulder_height_cm ? ` <span class="muted small">${c.shoulder_height_cm}</span>` : ''}</button>`).join('') || `<span class="muted small">${t('Tothom col·locat 👌')}</span>`}</div>
        </div>
        <div class="card">
          <h3>${t('Persones temporals')}</h3>
          <p class="small muted" style="margin:4px 0 10px">${t("Gent que no és a l'aplicació (d'una altra colla, de prova…). Només es guarda en aquest castell i no compta a l'historial.")}</p>
          <form id="temp-form" class="pick-bar"><input name="temp" placeholder="${t('Nom o malnom')}" autocomplete="off"><button class="btn sm">${t('Col·loca')}</button></form>
          ${guests.length ? `<div class="side-list" style="margin-top:10px">${guests.map((g) => `<button data-hit="${g.pos_key}" title="${t('Mostra al castell')}">${esc(g.guest_name)} <span class="muted small">${esc(s.positions.get(g.pos_key)?.role || '')}</span></button>`).join('')}</div>` : ''}
        </div>
      </aside>` : ''}
    </div>`;

  // ----- Cercador -----
  const applySearch = () => {
    const q = norm(searchQuery.trim());
    const viewer = qs('#viewer');
    viewer.classList.toggle('searching', !!q);
    qsa('[data-key]', viewer).forEach((el) => el.classList.toggle('hit', !!q && el.dataset.names.includes(q)));
    let hits = [];
    if (q && castellView === 'historial') {
      const people = new Map();
      for (const h of history.exact) {
        if (!norm(`${h.name} ${h.alias || ''}`).includes(q)) continue;
        const pos = s.positions.get(h.pos_key);
        if (!pos) continue;
        const entry = people.get(h.person_id) || { name: h.alias || h.name, items: [] };
        entry.items.push({ key: h.pos_key, label: `${pos.role} ×${h.n}`, n: h.n });
        people.set(h.person_id, entry);
      }
      hits = [...people.values()].flatMap((p) => p.items.sort((a, b) => b.n - a.n).slice(0, 4).map((i) => ({ key: i.key, label: `${p.name}: ${i.label}` })));
    } else if (q) {
      hits = [...byKey.values()]
        .filter((a) => norm(`${a.name || ''} ${a.alias || ''} ${a.guest_name || ''}`).includes(q))
        .map((a) => ({ key: a.pos_key, label: `${assignedName(a)}: ${s.positions.get(a.pos_key)?.role}` }));
    }
    qs('#search-hits').innerHTML = !q ? ''
      : hits.length ? hits.slice(0, 12).map((h) => `<button data-hit="${h.key}">${esc(h.label)}</button>`).join('') + (hits.length > 12 ? `<span class="muted small">+${hits.length - 12}</span>` : '')
        : `<span class="muted small">${castellView === 'historial' ? t('Cap historial per a aquesta cerca') : t('No és en aquest castell')}</span>`;
  };
  const search = qs('#pos-search');
  search.oninput = () => { searchQuery = search.value; applySearch(); };
  search.onkeydown = (e) => { if (e.key === 'Enter') qs('#search-hits [data-hit]')?.click(); };
  qs('#search-hits').onclick = (e) => { const b = e.target.closest('[data-hit]'); if (b) focusKey(b.dataset.hit, s); };
  qsa('[data-warn]').forEach((b) => (b.onclick = () => focusKey(b.dataset.warn, s)));
  applySearch();

  qsa('#views button').forEach((b) => (b.onclick = () => { castellView = b.dataset.v; store.set('castellView', castellView); render({ keepScroll: true }); }));
  qsa('#viewer .scroll-x').forEach((el) => { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; });

  // Informació d'una posició (per a membres, o tocant dins del visor ampliat).
  const showPos = (key) => {
    const pos = s.positions.get(key);
    const a = byKey.get(key);
    toast(`${pos.role}: ${a ? (a.guest_name ? assignedName(a) : fullName(a)) : t('buida')}${a?.person_id === me.id ? ` · ${t('ets tu!')}` : ''}`);
  };
  // ----- Pantalla completa -----
  const zoom = (layerIndex) => {
    let content;
    if (castellView === 'pinya') {
      content = document.createElement('div');
      content.className = 'zoom-pinya';
      const idx = layerIndex === undefined ? s.layers.map((_, i) => i) : [layerIndex];
      content.innerHTML = idx.map((i) => `<div class="zoom-layer">${s.layers.length > 1 ? `<h3>${esc(s.layers[i].label)}</h3>` : ''}${layerSvg(s.layers[i], s, byKey, ctx)}</div>`).join('');
    } else {
      content = qs('#viewer .tronc').cloneNode(true);
    }
    if (searchQuery.trim()) qsa('[data-key]', content).forEach((el) => el.classList.toggle('hit', el.dataset.names.includes(norm(searchQuery.trim()))));
    const title = `${s.name}${layerIndex !== undefined ? ` · ${s.layers[layerIndex].label}` : ''}`;
    openZoom({ content, title, focus: mineKey ? `[data-key="${mineKey}"]` : null, labels: zoomLabels(), onTap: (key) => {
      if (castellView === 'historial') { const list = byPos.get(key) || []; toast(`${s.positions.get(key).role}: ${list.slice(0, 4).map((h) => `${shortName(h)} ×${h.n}`).join(', ') || '—'}`); return; }
      showPos(key);
    } });
  };
  qs('#zoom-all')?.addEventListener('click', () => zoom());
  qsa('button[data-zoom-layer]').forEach((b) => (b.onclick = () => zoom(Number(b.dataset.zoomLayer))));

  qs('#find-me')?.addEventListener('click', () => {
    focusKey(mineKey, s);
    toast(t('Ets a: {role}', { role: s.positions.get(mineKey).role }));
  });
  if (pendingFocus) { const key = pendingFocus; pendingFocus = null; requestAnimationFrame(() => focusKey(key, s)); }

  const reload = () => render({ keepScroll: true });
  qs('#viewer').addEventListener('click', async (e) => {
    const el = e.target.closest('[data-key]');
    if (!el) return;
    const key = el.dataset.key;
    const pos = s.positions.get(key);
    if (castellView === 'historial') { historyModal(castell, pos, byPos.get(key) || [], saved.get(key), admin, reload); return; }
    if (!admin) {
      // A la pinya en un mòbil les caixes són petites: tocar-ne una obre el visor ampliat.
      if (castellView === 'pinya' && el.closest('.plan')?.getBoundingClientRect().width < 600) {
        zoom(Number(el.closest('[data-zoom-layer]').dataset.zoomLayer));
        return;
      }
      showPos(key);
      return;
    }
    if (proposal) { toast(t("Aplica o descarta la proposta abans d'editar posicions"), true); return; }
    if (selectedPerson) {
      const person = selectedPerson;
      selectedPerson = null;
      const body = person.guest ? { guest_name: person.name } : { person_id: person.id };
      if (await attempt(() => api('PUT', `/castells/${castell.id}/positions/${key}`, body))) reload();
      return;
    }
    assignModal(castell, pos, byKey.get(key), candidates, keyByPerson, s, hist, reload);
  });

  if (!admin) return;
  qsa('#result-seg button').forEach((b) => (b.onclick = async () => {
    if (await attempt(() => api('PUT', `/castells/${castell.id}`, { result: b.dataset.v }))) { toast(t('Resultat desat')); reload(); }
  }));
  qs('#cancel-sel')?.addEventListener('click', () => { selectedPerson = null; reload(); });
  qs('#temp-form').onsubmit = (e) => {
    e.preventDefault();
    const name = e.target.elements.temp.value.trim();
    if (!name) return;
    selectedPerson = { guest: true, name };
    reload();
  };
  qsa('aside [data-hit]').forEach((b) => (b.onclick = () => focusKey(b.dataset.hit, s)));
  qsa('[data-pick]').forEach((b) => (b.onclick = () => {
    const p = candidates.find((c) => String(c.id) === b.dataset.pick);
    selectedPerson = selectedPerson?.id === p.id ? null : p;
    reload();
  }));

  // ----- Muntador automàtic -----
  const openBuilder = () => autoBuildModal({ castell, s, candidates, saved, hist, onPropose: (result) => {
    proposal = { castellId: castell.id, ...result };
    if (castellView === 'historial') castellView = 'tronc';
    reload();
  } });
  qs('#auto-build').onclick = openBuilder;
  qs('#prop-again')?.addEventListener('click', openBuilder);
  qs('#prop-discard')?.addEventListener('click', () => { proposal = null; reload(); });
  qs('#prop-apply')?.addEventListener('click', async () => {
    const assignments = [...proposal.map].map(([key, val]) => ({ pos_key: key, person_id: val ? val.person.id : null }));
    if (await attempt(() => api('PUT', `/castells/${castell.id}/positions`, { assignments }))) {
      proposal = null;
      toast(t('Alineació desada'));
      reload();
    }
  });

  qs('#edit-castell').onclick = () => castellModal(event.id, castell, (keep) => [...positions].filter((p) => !keep.has(p.pos_key)).length);
  qs('#del-castell').onclick = async () => {
    if (!confirm(t('Esborrar el {name} i totes les posicions assignades?', { name: s.name }))) return;
    if (await attempt(() => api('DELETE', `/castells/${castell.id}`))) location.hash = `#/sessio/${event.id}`;
  };
  qs('#dup-castell').onclick = () => {
    const opts = events.some((e) => e.id === event.id) ? events : [event, ...events];
    openModal(`${modalHead(t('Duplica el {name}', { name: s.name }))}
      <form id="dup-form" class="stack">
        <p class="muted" style="margin:0">${t('Es copiarà el castell amb totes les persones a les mateixes posicions.')}</p>
        <label class="field">${t('Sessió de destinació')}<select name="event_id">${opts.map((e) => `<option value="${e.id}" ${e.id === event.id ? 'selected' : ''}>${fmt(e.date, { day: 'numeric', month: 'short' })} · ${esc(e.title)}</option>`).join('')}</select></label>
        <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${t('Duplica')}</button></div>
      </form>`, (m) => {
      qs('#dup-form', m).onsubmit = async (e) => {
        e.preventDefault();
        const copy = await attempt(() => api('POST', `/castells/${castell.id}/duplicate`, { event_id: Number(e.target.elements.event_id.value) }));
        if (copy) { closeModal(); toast(t('Castell duplicat')); location.hash = `#/castell/${copy.id}`; }
      };
    });
  };
}

function historyModal(castell, pos, list, current, admin, reload) {
  const max = list[0]?.n || 1;
  openModal(`${modalHead(esc(pos.role))}
    <p class="muted" style="margin:-6px 0 12px">${t('Qui l\'ha fet en castells anteriors de la mateixa amplada.')}${current ? ` ${t('Ara: {name}.', { name: `<strong>${esc(assignedName(current))}</strong>` })}` : ''}</p>
    ${list.length ? `<div class="bars">${list.map((h) => `<div class="bar-row">
        <span class="nm">${esc(fullName(h))}</span>
        <span class="bar"><i style="width:${(h.n / max) * 100}%"></i></span>
        <span class="num">${h.n}×</span>
        ${admin ? `<button class="btn sm" data-place="${h.person_id}">${t('Col·loca')}</button>` : ''}
        <span class="last small muted">${t('Última: {date}', { date: fmt(h.last, { day: 'numeric', month: 'short', year: 'numeric' }) })}</span>
      </div>`).join('')}</div>` : `<p class="muted">${t('Ningú ha fet encara aquesta posició.')}</p>`}
    <div class="form-actions"><button class="btn" data-close>${t('Tanca')}</button></div>`, (m) => {
    m.onclick = async (e) => {
      const b = e.target.closest('[data-place]');
      if (!b) return;
      if (await attempt(() => api('PUT', `/castells/${castell.id}/positions/${pos.key}`, { person_id: Number(b.dataset.place) }))) {
        closeModal(); toast(t('Col·locat')); reload();
      }
    };
  });
}

function autoBuildModal({ castell, s, candidates, saved, hist, onPropose }) {
  const count = (statuses) => candidates.filter((c) => statuses.includes(c.status)).length;
  const opts = { tronc: true, pinya: true, musica: true, keep: saved.size > 0, maybe: false, ...JSON.parse(store.get('autoBuildOpts', '{}')) };
  const musicians = candidates.filter((c) => c.instrument && c.status === 'si').length;
  openModal(`${modalHead(t('Muntador automàtic'))}
    <form id="auto-form" class="stack">
      <p class="muted" style="margin:0">${t("Proposa una alineació amb la gent que ha confirmat, segons el pes, l'alçada d'espatlles, l'edat i l'historial de qui ha fet cada posició ({n} castells anteriors de la mateixa amplada). Primer veuràs la proposta i després decideixes si l'apliques.", { n: hist.castellsCount })}</p>
      <fieldset class="stack"><legend>${t('Què vols muntar?')}</legend>
        <label class="check"><input type="checkbox" name="tronc" ${opts.tronc ? 'checked' : ''}> ${t('Tronc i pom de dalt')}${s.agulla.length ? ` + ${t('pilar central')}` : ''}</label>
        ${s.layers.length ? `<label class="check"><input type="checkbox" name="pinya" ${opts.pinya ? 'checked' : ''}> Pinya${s.layers.length > 1 ? ', folre, manilles' : ''}</label>` : ''}
        ${s.musica.length ? `<label class="check"><input type="checkbox" name="musica" ${opts.musica ? 'checked' : ''}> ${t('Música (gralles i timbals)')} <span class="muted small">· ${t('{n} músics confirmats', { n: musicians })}</span></label>` : ''}
      </fieldset>
      <fieldset class="stack"><legend>${t('Opcions')}</legend>
        <label class="check"><input type="checkbox" name="keep" ${opts.keep ? 'checked' : ''}> ${t('Mantén les posicions que ja estan assignades ({n})', { n: saved.size })}</label>
        <label class="check"><input type="checkbox" name="maybe" ${opts.maybe ? 'checked' : ''}> ${t('Compta també qui ha dit «Potser»')}</label>
      </fieldset>
      <p class="small muted" style="margin:0" id="auto-pool"></p>
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${t('Genera la proposta')}</button></div>
    </form>`, (m) => {
    const form = qs('#auto-form', m);
    const sync = () => {
      const d = formData(form);
      qs('#auto-pool', m).textContent = t('Persones disponibles: {n}.', { n: count(d.maybe ? ['si', 'potser'] : ['si']) });
    };
    form.onchange = sync;
    sync();
    form.onsubmit = (e) => {
      e.preventDefault();
      const options = { musica: false, pinya: false, ...formData(form) };
      if (!options.tronc && !options.pinya && !options.musica) { toast(t('Tria què vols muntar'), true); return; }
      store.set('autoBuildOpts', JSON.stringify(options));
      const result = proposeLineup({ structure: s, candidates, current: saved, exact: hist.exactMap, byCat: hist.byCat, options });
      if (!result.filled && !result.map.size) { toast(t('No hi ha cap posició per omplir'), true); return; }
      closeModal();
      onPropose(result);
    };
  });
}

const STATUS_ORDER = { si: 0, potser: 1, null: 2, undefined: 2, no: 3 };
let assignSort = store.get('assignSort', 'status');

function assignModal(castell, pos, current, candidates, keyByPerson, s, hist, reload) {
  const expOf = (p) => ({ exact: hist.exactMap.get(`${pos.key}|${p.id}`) || 0, cat: hist.byCat?.[p.id]?.[pos.cat] || 0 });
  const sorters = {
    status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name),
    experience: (a, b) => { const x = expOf(a), y = expOf(b); return (y.exact * 3 + y.cat) - (x.exact * 3 + x.cat) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status]; },
    shoulder: (a, b) => (b.shoulder_height_cm ?? -1) - (a.shoulder_height_cm ?? -1),
    height: (a, b) => (b.height_cm ?? -1) - (a.height_cm ?? -1),
    weight: (a, b) => (a.weight_kg ?? 999) - (b.weight_kg ?? 999),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  // A una posició de música, primer els qui toquen aquell instrument.
  const musicFirst = (a, b) => (pos.kind && pos.group === 'musica' ? (b.instrument === pos.kind) - (a.instrument === pos.kind) : 0);
  const measures = (p) => [
    p.instrument ? INSTRUMENTS[p.instrument] : null,
    age(p.birthdate) != null ? t('{n} anys', { n: age(p.birthdate) }) : null,
    p.height_cm ? `${p.height_cm} cm` : null,
    p.shoulder_height_cm ? `esp. ${p.shoulder_height_cm} cm` : null,
    p.shoulder_width_cm ? `ampl. ${p.shoulder_width_cm} cm` : null,
    p.weight_kg ? `${p.weight_kg} kg` : null,
  ].filter(Boolean).join(' · ') || t('Sense mides');
  const experience = (p) => {
    const { exact, cat } = expOf(p);
    if (!exact && !cat) return '';
    return `<span class="xp">${[exact ? t('{n}× aquesta posició', { n: exact }) : null, cat ? `${cat}× ${esc(pos.cat)}` : null].filter(Boolean).join(' · ')}</span>`;
  };

  const listHtml = (q) => [...candidates]
    .filter((p) => !q || norm(`${p.name} ${p.alias || ''}`).includes(q))
    .sort((a, b) => musicFirst(a, b) || (sorters[assignSort] || sorters.status)(a, b))
    .map((p) => {
      const where = keyByPerson.get(p.id);
      const isCurrent = current?.person_id === p.id;
      return `<button data-pid="${p.id}" class="${isCurrent ? 'current' : ''}">
        <span class="nm">${esc(fullName(p))}</span>${statusPill(p.status)}
        <span class="ms">${measures(p)}</span>
        ${experience(p)}
        ${where && !isCurrent ? `<span class="where">${t('Ara a: {role} (es mourà)', { role: esc(s.positions.get(where)?.role || where) })}</span>` : ''}
      </button>`;
    }).join('') || `<p class="muted">${t('Cap persona coincideix.')}</p>`;

  openModal(`${modalHead(esc(pos.role))}
    ${current ? `<p style="margin:-6px 0 10px">${t('Ara: {name}.', { name: `<strong>${esc(assignedName(current))}</strong>` })}</p>` : ''}
    <div class="pick-bar">
      <input type="search" id="pick-q" placeholder="${t('Cerca per nom o malnom…')}">
      <select id="pick-sort" aria-label="${t('Ordena')}">
        <option value="status">${t('Disponibilitat')}</option><option value="experience">${t('Experiència')}</option><option value="shoulder">${t('Alçada espatlles')}</option>
        <option value="height">${t('Alçada')}</option><option value="weight">${t('Pes (lleuger primer)')}</option><option value="name">${t('Nom')}</option>
      </select>
    </div>
    <div class="people-pick" id="pick-list">${listHtml('')}</div>
    <form id="guest-form" style="display:flex;gap:8px">
      <input name="guest" placeholder="${t("Persona temporal (no es guarda a l'app)")}" value="${esc(current?.guest_name)}">
      <button class="btn">${t('Assigna')}</button>
    </form>
    <div class="form-actions">${current ? `<button class="btn danger" id="clear-pos">${t('Buida la posició')}</button>` : ''}<button class="btn" data-close>${t('Tanca')}</button></div>`, (m) => {
    const save = async (body) => {
      if (await attempt(() => api('PUT', `/castells/${castell.id}/positions/${pos.key}`, body))) { closeModal(); reload(); }
    };
    const q = qs('#pick-q', m), list = qs('#pick-list', m), sort = qs('#pick-sort', m);
    sort.value = assignSort;
    const refresh = () => { list.innerHTML = listHtml(norm(q.value.trim())); };
    q.oninput = refresh;
    sort.onchange = () => { assignSort = sort.value; store.set('assignSort', assignSort); refresh(); };
    list.onclick = (e) => { const b = e.target.closest('[data-pid]'); if (b) save({ person_id: Number(b.dataset.pid) }); };
    qs('#guest-form', m).onsubmit = (e) => { e.preventDefault(); const g = e.target.elements.guest.value.trim(); if (g) save({ guest_name: g }); };
    qs('#clear-pos', m)?.addEventListener('click', () => save({ person_id: null, guest_name: null }));
  });
}

// Historial d'una persona (fitxa i perfil).
function personHistoryHtml(h) {
  if (!h.total) return `<p class="muted small">${t('Encara no consta en cap castell de sessions passades.')}</p>`;
  const max = h.byCat[0]?.n || 1;
  return `<p class="small muted" style="margin:0 0 10px">${t('{n} castells en sessions passades.', { n: h.total })}</p>
    <div class="bars">${h.byCat.map((c) => `<div class="bar-row"><span class="nm">${esc(c.cat)}</span><span class="bar"><i style="width:${(c.n / max) * 100}%"></i></span><span class="num">${c.n}×</span></div>`).join('')}</div>
    <h3 style="margin:16px 0 6px">${t('Últims castells')}</h3>
    <ul class="recent">${h.recent.map((r) => `<li><a href="#/castell/${r.castell_id}"><span class="castell-tag ${resultClass(r.result)}">${esc(r.castell)}</span> ${esc(r.role)}</a>
      <span class="small muted">${fmt(r.date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${esc(r.title)}</span></li>`).join('')}</ul>`;
}

// ---------- Persones ----------
function personFields(p = {}, { admin = false, isNew = false } = {}) {
  const n = (name, label, unit, step = '1') => `<label class="field">${label} (${unit})<input name="${name}" type="number" min="0" step="${step}" inputmode="decimal" value="${p[name] ?? ''}"></label>`;
  return `<div class="form-grid">
    <label class="field full">${t('Nom i cognoms')}<input name="name" required value="${esc(p.name)}"></label>
    <p class="small muted full" style="margin:-4px 0 0">${t('El malnom és el que surt a la pinya i al tronc, i no es pot repetir. Si no en té, es mostra el nom i la inicial del cognom.')}</p>
    <label class="field">${t('Malnom')}<input name="alias" value="${esc(p.alias)}" placeholder="${t('Com et coneixen a la colla')}"></label>
    <label class="field">${t('Data de naixement')}<input name="birthdate" type="date" value="${esc(p.birthdate)}"></label>
    <label class="field">${t('Telèfon')}<input name="phone" type="tel" value="${esc(p.phone)}"></label>
    <label class="field">${t('Correu')}<input name="email" type="email" value="${esc(p.email)}"></label>
    <label class="field">${t('Músic/a')}<select name="instrument"><option value="">${t('No toca')}</option>${Object.entries(INSTRUMENTS).map(([v, l]) => `<option value="${v}" ${p.instrument === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
  </div>
  <fieldset style="margin-top:16px"><legend>${t('Mides')}</legend><div class="form-grid">
    ${n('height_cm', t('Alçada'), 'cm')}
    ${n('shoulder_height_cm', t("Alçada d'espatlles"), 'cm')}
    ${n('shoulder_width_cm', t("Amplada d'espatlles"), 'cm')}
    ${n('weight_kg', t('Pes'), 'kg', '0.1')}
  </div></fieldset>
  <label class="field" style="margin-top:12px">${t('Notes')}<textarea name="notes" placeholder="${t('Posicions habituals, lesions…')}">${esc(p.notes)}</textarea></label>
  ${admin && !isNew ? `<label class="check" style="margin-top:12px"><input type="checkbox" name="active" ${p.active !== 0 ? 'checked' : ''}> ${t('Activa (desmarca-ho si ha deixat la colla)')}</label>` : ''}`;
}

let peopleSort = store.get('peopleSort', 'name');

async function pagePeople() {
  if (!isAdmin()) { location.hash = '#/'; return; }
  const { people, pastEvents } = await api('GET', '/people');
  const sorters = {
    name: (a, b) => b.active - a.active || a.name.localeCompare(b.name),
    height: (a, b) => (b.height_cm ?? -1) - (a.height_cm ?? -1),
    shoulder: (a, b) => (b.shoulder_height_cm ?? -1) - (a.shoulder_height_cm ?? -1),
    weight: (a, b) => (b.weight_kg ?? -1) - (a.weight_kg ?? -1),
    age: (a, b) => (age(b.birthdate) ?? -1) - (age(a.birthdate) ?? -1),
    attendance: (a, b) => b.attended - a.attended,
    music: (a, b) => (b.instrument || '').localeCompare(a.instrument || '') || a.name.localeCompare(b.name),
  };
  const sorted = [...people].sort(sorters[peopleSort] || sorters.name);
  const v = (x, unit = '') => (x != null ? `${x}${unit}` : '<span class="muted">—</span>');

  $app.innerHTML = `
    <div class="page-head"><h1>${t('Persones')}</h1>
      <div class="actions"><button class="btn primary" id="new-person">${icon.plus}${t('Nova persona')}</button></div></div>
    <div class="toolbar">
      <input type="search" id="people-q" placeholder="${t('Cerca…')}" style="max-width:280px">
      <label class="check small" style="margin-left:auto">${t('Ordena per')}
        <select id="people-sort" style="width:auto">
          <option value="name">${t('Nom')}</option><option value="height">${t('Alçada')}</option><option value="shoulder">${t('Alçada espatlles')}</option>
          <option value="weight">${t('Pes')}</option><option value="age">${t('Edat')}</option><option value="attendance">${t('Assistència')}</option><option value="music">${t('Música')}</option>
        </select></label>
    </div>
    <div class="card"><div class="table-wrap"><table class="responsive" id="people-table">
      <thead><tr><th>${t('Malnom · Nom')}</th><th class="num">${t('Edat')}</th><th class="num">${t('Alçada')}</th><th class="num">${t('Alç. esp.')}</th><th class="num">${t('Ampl. esp.')}</th><th class="num">${t('Pes')}</th><th class="num">${t('Assistència')}</th></tr></thead>
      <tbody>${sorted.map((p) => `<tr class="clickable ${p.active ? '' : 'inactive'}" data-id="${p.id}" data-name="${esc(norm(p.name + ' ' + (p.alias || '')))}">
        <td class="lead">${p.alias ? `<strong>${esc(p.alias)}</strong> <span class="muted">· ${esc(p.name)}</span>` : esc(p.name)}${p.instrument ? ` <span class="badge musics">${INSTRUMENTS[p.instrument]}</span>` : ''}${p.active ? '' : ` <span class="small">(${t('inactiva')})</span>`}</td>
        <td class="num" data-l="${t('Edat')}">${v(age(p.birthdate))}</td>
        <td class="num" data-l="${t('Alçada')}">${v(p.height_cm, ' cm')}</td>
        <td class="num" data-l="${t('Alç. esp.')}">${v(p.shoulder_height_cm, ' cm')}</td>
        <td class="num" data-l="${t('Ampl. esp.')}">${v(p.shoulder_width_cm, ' cm')}</td>
        <td class="num" data-l="${t('Pes')}">${v(p.weight_kg, ' kg')}</td>
        <td class="num" data-l="${t('Assistència')}">${p.attended}${pastEvents ? ` <span class="muted small">(${Math.round((p.attended / pastEvents) * 100)}%)</span>` : ''}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted">${t('{n} persones actives. L\'assistència compta les sessions passades on la persona ha vingut.', { n: people.filter((p) => p.active).length })}</p></div>`;

  const sort = qs('#people-sort');
  sort.value = peopleSort;
  sort.onchange = () => { peopleSort = sort.value; store.set('peopleSort', peopleSort); render(); };
  qs('#people-q').oninput = (e) => {
    const q = norm(e.target.value.trim());
    qsa('#people-table tbody tr').forEach((tr) => tr.classList.toggle('hidden', q && !tr.dataset.name.includes(q)));
  };
  qs('#new-person').onclick = () => personModal();
  qsa('#people-table tbody tr').forEach((tr) => (tr.onclick = () => personModal(people.find((p) => String(p.id) === tr.dataset.id))));
}

function personModal(person) {
  openModal(`${modalHead(person ? esc(fullName(person)) : t('Nova persona'))}
    <form id="person-form">${personFields(person, { admin: true, isNew: !person })}
      <div class="form-actions">${person ? `<button type="button" class="btn danger" id="del-person" style="margin-right:auto">${t('Esborra')}</button>` : ''}
        <button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${person ? t('Desa') : t('Crea')}</button></div>
    </form>
    ${person ? `<fieldset style="margin-top:18px"><legend>${t('Historial de posicions')}</legend><div id="person-history" class="muted small">${t('Carregant…')}</div>
      <a class="btn sm" href="#/estadistiques/persona/${person.id}" style="margin-top:12px">${icon.chart}${t('Estadístiques')}</a></fieldset>` : ''}`, (m) => {
    if (person) {
      api('GET', `/people/${person.id}/history`)
        .then((h) => { const el = qs('#person-history', m); if (el) { el.className = ''; el.innerHTML = personHistoryHtml(h); } })
        .catch(() => {});
    }
    qs('#person-form', m).onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (await attempt(() => api(person ? 'PUT' : 'POST', person ? `/people/${person.id}` : '/people', d))) {
        closeModal(); toast(person ? t('Desat') : t('Persona creada')); render({ keepScroll: true });
      }
    };
    qs('#del-person', m)?.addEventListener('click', async () => {
      if (!confirm(t("Esborrar definitivament {name}? Es perdrà el seu historial d'assistència i les posicions. (Si només ha deixat la colla, millor desmarca «Activa».)", { name: person.name }))) return;
      if (await attempt(() => api('DELETE', `/people/${person.id}`))) { closeModal(); render(); }
    });
  });
}

// ---------- Perfil ----------
async function pageProfile() {
  if (isAdmin()) { location.hash = '#/comptes'; return; }
  me = await api('GET', '/me');
  const history = await api('GET', `/people/${me.id}/history`);
  const historyCard = `<div class="card">
        <h2 style="margin-bottom:12px">${t('El meu historial de posicions')}</h2>
        ${personHistoryHtml(history)}
        <a class="btn sm" href="#/estadistiques/persona/${me.id}" style="margin-top:12px">${icon.chart}${t('Les meves estadístiques')}</a>
      </div>`;

  // Els membres entren sense contrasenya: per privacitat, aquí no hi surt cap dada personal.
  $app.innerHTML = `
    <div class="page-head"><h1>${esc(shortName(me))}</h1>
      <div class="actions"><button class="btn sm" id="not-me">${icon.swap}${t('No sóc jo')}</button></div></div>
    <div class="grid-2">
      <div class="card">
        <h2 style="margin-bottom:12px">${t('El meu perfil')}</h2>
        <div class="data-row"><span class="muted">${t('Com et veuen els altres')}</span><strong>${esc(shortName(me))}</strong></div>
        ${me.instrument ? `<div class="data-row"><span class="muted">${t('Músic/a')}</span><strong>${INSTRUMENTS[me.instrument]}</strong></div>` : ''}
        <p class="small muted" style="margin-bottom:0">${t("Per privacitat, a l'app només es veuen els malnoms. Les dades personals (nom, mides, contacte…) només les veuen els administradors; si cal canviar-ne alguna, demana-ho a un administrador.")}</p>
      </div>
      ${historyCard}
    </div>`;
  qs('#not-me').onclick = switchPerson;
}

// ---------- Comptes d'administració ----------
// Només serveixen per editar. No són persones de la colla: qui també fa castells respon amb la seva fitxa de membre.
async function pageAccounts() {
  if (!isAdmin()) { location.hash = '#/perfil'; return; }
  const admins = await api('GET', '/admins');
  $app.innerHTML = `
    <div class="page-head"><h1>${t("Comptes d'administració")}</h1>
      <div class="actions"><button class="btn primary" id="new-admin">${icon.plus}${t('Nou compte')}</button></div></div>
    <p class="muted" style="margin-top:0">${t("Aquests comptes només serveixen per editar: sessions, castells i persones. No surten a les llistes ni responen a les sessions. Qui també fa castells respon amb la seva fitxa de membre (des d'«Ajustos» → «Respon com a…»).")}</p>
    <div class="grid-2">
      <div class="card">
        <h2 style="margin-bottom:12px">${t('Comptes')}</h2>
        <ul class="account-list">${admins.map((a) => `<li>
          <span class="avatar admin">${esc(initial(a))}</span>
          <div class="who"><strong>${esc(a.name)}</strong><span class="small muted">${t('Usuari')}: ${esc(a.username)}${a.id === me.admin_id ? ` · ${t('ets tu')}` : ''}</span></div>
          <button class="btn sm" data-edit="${a.id}">${t('Edita')}</button></li>`).join('')}</ul>
      </div>
      <div class="stack">
        <form class="card stack" id="pw-form">
          <h2>${t('Canvia la meva contrasenya')}</h2>
          <p class="small muted" style="margin:0">${t('Usuari')}: <strong>${esc(me.username)}</strong></p>
          <label class="field">${t('Contrasenya actual')}<input name="currentPassword" type="password" autocomplete="current-password" required></label>
          <label class="field">${t('Nova contrasenya')}<input name="newPassword" type="password" autocomplete="new-password" minlength="8" required></label>
          <div class="form-actions"><button class="btn">${t('Canvia')}</button></div>
        </form>
      </div>
    </div>`;
  qs('#new-admin').onclick = () => adminModal();
  qsa('[data-edit]').forEach((b) => (b.onclick = () => adminModal(admins.find((a) => String(a.id) === b.dataset.edit))));
  qs('#pw-form').onsubmit = async (e) => {
    e.preventDefault();
    if (await attempt(() => api('PUT', '/me', formData(e.target)))) { e.target.reset(); toast(t('Contrasenya canviada')); }
  };
}

function adminModal(account) {
  const self = account?.id === me.admin_id;
  openModal(`${modalHead(account ? esc(account.name) : t('Nou compte'))}
    <form id="admin-form" class="stack">
      <label class="field">${t('Nom')}<input name="name" required value="${esc(account?.name)}" placeholder="${t('p. ex. Junta tècnica, Marta…')}"></label>
      <label class="field">${t('Usuari')}<input name="username" required autocapitalize="none" autocomplete="off" value="${esc(account?.username)}"></label>
      <label class="field">${account ? t('Nova contrasenya') : t('Contrasenya')}<input name="password" type="password" autocomplete="new-password" minlength="8" ${account ? '' : 'required'} placeholder="${account ? t('Deixa-ho buit per no canviar') : t('Mínim 8 caràcters')}"></label>
      <div class="form-actions">${account && !self ? `<button type="button" class="btn danger" id="del-admin" style="margin-right:auto">${t('Esborra')}</button>` : ''}
        <button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${account ? t('Desa') : t('Crea')}</button></div>
    </form>`, (m) => {
    qs('#admin-form', m).onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (!d.password) delete d.password;
      if (await attempt(() => api(account ? 'PUT' : 'POST', account ? `/admins/${account.id}` : '/admins', d))) {
        closeModal();
        toast(account ? t('Desat') : t('Compte creat'));
        if (self) me = await api('GET', '/me');
        render({ keepScroll: true });
      }
    };
    qs('#del-admin', m)?.addEventListener('click', async () => {
      if (!confirm(t('Esborrar el compte «{name}»? Ja no podrà entrar com a administrador/a.', { name: account.name }))) return;
      if (await attempt(() => api('DELETE', `/admins/${account.id}`))) { closeModal(); render(); }
    });
  });
}

// ---------- Calendari (admins) ----------
// Vista mensual de totes les sessions. Tocar un dia buit obre «Nova sessió» amb aquella data.
let calMonth = todayIso().slice(0, 7);
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); return isoOf(new Date(y, m - 1 + n, 1)).slice(0, 7); };

async function pageCalendar(ym) {
  if (ym) calMonth = ym;
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  // Setmanes de dilluns a diumenge.
  const start = new Date(y, m - 1, 1 - ((first.getDay() + 6) % 7));
  const end = new Date(y, m - 1, last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  const events = await api('GET', `/events?from=${isoOf(start)}&to=${isoOf(end)}`);
  const byDay = {};
  for (const e of events) (byDay[e.date] ??= []).push(e);
  const days = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(isoOf(d));
  const today = todayIso();
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(LOCALE[lang], { weekday: 'short' }));
  const monthName = first.toLocaleDateString(LOCALE[lang], { month: 'long', year: 'numeric' });
  const title = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const monthEvents = events.filter((e) => e.date.startsWith(calMonth));

  $app.innerHTML = `
    <div class="page-head"><h1>${t('Calendari')}</h1>
      <div class="actions"><button class="btn" id="cal-subscribe">${icon.calAdd}${t('Al meu calendari')}</button>${isAdmin() ? `<button class="btn primary" id="new-event">${icon.plus}${t('Nova sessió')}</button>` : ''}</div></div>
    <div class="cal-head">
      <button class="btn sm" id="cal-prev" aria-label="${t('Mes anterior')}">‹</button>
      <h2 class="cal-title">${esc(title)}</h2>
      <button class="btn sm" id="cal-next" aria-label="${t('Mes següent')}">›</button>
      <button class="btn sm ghost" id="cal-today">${t('Avui')}</button>
      <div class="cal-legend">${TYPES.map(typeBadge).join('')}</div>
    </div>
    <div class="card cal">
      <div class="cal-grid">
        ${weekdays.map((w) => `<div class="cal-wd">${esc(w)}</div>`).join('')}
        ${days.map((d) => `<div class="cal-day ${isAdmin() ? 'add' : ''} ${d.startsWith(calMonth) ? '' : 'out'} ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}" data-date="${d}">
          <span class="cal-n">${Number(d.slice(8))}</span>
          ${(byDay[d] || []).map((e) => `<a class="cal-ev ${e.type} ${e.date >= today && !e.my_status ? 'pending' : ''}" href="#/sessio/${e.id}" title="${esc(`${e.start_time || ''} ${e.title}`)}">${e.start_time ? `<b>${e.start_time}</b> ` : ''}${esc(e.title)}</a>`).join('')}
        </div>`).join('')}
      </div>
      ${isAdmin() ? `<p class="small muted" style="margin:10px 0 0">${t('Toca un dia buit per crear-hi una sessió.')}</p>` : ''}
    </div>
    <div class="card cal-agenda">
      <h2 style="margin-bottom:10px">${t('Aquest mes')}</h2>
      ${monthEvents.length ? `<ul class="recent">${monthEvents.map((e) => `<li><a href="#/sessio/${e.id}">${typeBadge(e.type)} ${esc(e.title)}</a>
        <span class="small muted">${fmt(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}${e.start_time ? ` · ${e.start_time}` : ''}${e.location ? ` · ${esc(e.location)}` : ''}</span>
        ${e.date >= today ? `<span>${statusPill(e.my_status)}</span>` : ''}</li>`).join('')}</ul>`
        : `<p class="muted" style="margin:0">${t('No hi ha sessions aquest mes.')}</p>`}
    </div>`;

  qs('#cal-prev').onclick = () => { location.hash = `#/calendari/${shiftMonth(calMonth, -1)}`; };
  qs('#cal-next').onclick = () => { location.hash = `#/calendari/${shiftMonth(calMonth, 1)}`; };
  qs('#cal-today').onclick = () => { location.hash = `#/calendari/${today.slice(0, 7)}`; };
  qs('#cal-subscribe').onclick = calendarModal;
  if (!isAdmin()) return;
  qs('#new-event').onclick = () => eventModal(null, { date: calMonth === today.slice(0, 7) ? today : `${calMonth}-01` });
  qsa('.cal-day').forEach((cell) => (cell.onclick = (e) => { if (!e.target.closest('a')) eventModal(null, { date: cell.dataset.date }); }));
}

// Subscripció al calendari del mòbil: l'app de calendari llegeix sola les sessions i les manté al dia.
const calendarCode = (sep) => (config.needsCode && store.get('collaCode', '') ? `${sep}code=${encodeURIComponent(store.get('collaCode', ''))}` : '');
function calendarModal() {
  const musics = isAdmin() || me.instrument ? 'musics=1' : '';
  const query = [musics, calendarCode('').slice(0)].filter(Boolean).join('&');
  const url = `${location.origin}/api/calendar.ics${query ? `?${query}` : ''}`;
  const webcal = url.replace(/^https?:/, 'webcal:');
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  openModal(`${modalHead(t('Les sessions al teu calendari'))}
    <p class="muted" style="margin-top:0">${t("Les sessions de la colla sortiran al calendari del teu mòbil, i s'actualitzaran soles quan se n'afegeixin o canviïn.")}</p>
    <div class="stack">
      <a class="btn primary block" href="${esc(webcal)}">${icon.calAdd}${t('iPhone, iPad o Mac')}</a>
      <a class="btn primary block" href="${esc(google)}" target="_blank" rel="noopener">${icon.calAdd}${t('Android o Google Calendar')}</a>
      <button class="btn block" id="copy-cal">${icon.copy}${t("Copia l'enllaç (altres calendaris)")}</button>
    </div>
    <p class="small muted" style="margin-bottom:0">${t("A l'iPhone, toca «Subscriure't». A Google, toca «Afegeix»: els canvis poden trigar unes hores a arribar-hi.")}</p>`, (m) => {
    qs('#copy-cal', m).onclick = () => copyText(url);
  });
}

// ---------- Estadístiques ----------
// Per temporades (cada any natural) o de tota la història, i de totes les sessions, només diades o només assajos.
let statsSeason = String(new Date().getFullYear());
let statsKind = 'all';
let statsTab = store.get('statsTab', 'temporada');
const RESULT_ORDER = ['descarregat', 'carregat', 'intent', 'intent desfet', 'previst'];
const resultName = (r) => (r === 'previst' ? t('Sense resultat') : RESULTS[r]);
const statsQuery = () => `season=${encodeURIComponent(statsSeason)}&kind=${statsKind}`;

function statsFilters(seasons, { kinds: showKinds = true } = {}) {
  const kinds = showKinds ? [['all', t('Tot')], ['diades', t('Diades')], ['assajos', t('Assajos')]] : [];
  return `<div class="toolbar">
    <select id="st-season" style="width:auto" aria-label="${t('Temporada')}">
      ${seasons.map((y) => `<option value="${y}" ${statsSeason === y ? 'selected' : ''}>${t('Temporada {y}', { y })}</option>`).join('')}
      <option value="all" ${statsSeason === 'all' ? 'selected' : ''}>${t('Totes les temporades')}</option>
    </select>
    <div class="tabs seg ${kinds.length ? '' : 'hidden'}" id="st-kind">${kinds.map(([k, l]) => `<button data-k="${k}" class="${statsKind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  </div>`;
}

function bindStatsFilters() {
  qs('#st-season').onchange = (e) => { statsSeason = e.target.value; render({ keepScroll: true }); };
  qsa('#st-kind button').forEach((b) => (b.onclick = () => { statsKind = b.dataset.k; render({ keepScroll: true }); }));
}

// Barra apilada amb la proporció de cada resultat.
function resultsBar(results, scale = null) {
  const total = RESULT_ORDER.reduce((sum, r) => sum + (results[r] || 0), 0);
  if (!total) return '<span class="sbar"></span>';
  const base = scale || total;
  return `<span class="sbar">${RESULT_ORDER.filter((r) => results[r]).map((r) =>
    `<i class="${resultClass(r)}" style="width:${(results[r] / base) * 100}%" title="${esc(resultName(r))}: ${results[r]}"></i>`).join('')}</span>`;
}

const resultsPills = (results) => RESULT_ORDER.filter((r) => results[r])
  .map((r) => `<span class="result ${resultClass(r)}">${esc(resultName(r))} ${results[r]}</span>`).join(' ');

const statTile = (n, label, cls = '', sub = '') =>
  `<div class="stat-tile ${cls}"><strong>${n}</strong><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;

function resultTiles(total, results, extra = '') {
  return `<div class="stat-tiles">
    ${statTile(total, t('Castells'))}
    ${statTile(results.descarregat, RESULTS.descarregat, 'r-descarregat')}
    ${statTile(results.carregat, RESULTS.carregat, 'r-carregat')}
    ${statTile(results.intent + results['intent desfet'], t('Intents'), 'r-intent', results['intent desfet'] ? t('{n} desfets', { n: results['intent desfet'] }) : '')}
    ${extra}
  </div>
  ${total ? `<div class="card results-summary">${resultsBar(results)}<div class="pills">${resultsPills(results)}</div></div>` : ''}`;
}

function personStatsHtml(st) {
  const sessions = Object.values(st.sessions).reduce((a, b) => a + b, 0);
  const sessionsSub = TYPES.filter((k) => st.sessions[k]).map((k) => `${typeLabel(k)} ${st.sessions[k]}`).join(' · ');
  const head = resultTiles(st.total, st.results, statTile(sessions, t('Sessions'), '', sessionsSub));
  if (!st.total) return `${head}<div class="card"><p class="muted" style="margin:0">${t('No hi ha castells en aquest període.')}</p></div>`;
  const maxPos = st.byPosition[0]?.n || 1;
  return `${head}
    <div class="grid-2">
      <div class="card">
        <h2 style="margin-bottom:12px">${t('Per castell')}</h2>
        <div class="table-wrap"><table class="responsive stats-table">
          <thead><tr><th>${t('Castell')}</th><th class="num">${t('Vegades')}</th><th>${t('Posicions')}</th><th>${t('Com han acabat')}</th></tr></thead>
          <tbody>${st.byCastell.map((c) => `<tr>
            <td class="lead"><span class="castell-tag">${esc(c.castell)}</span>${c.partial ? `<span class="sub">${tn(c.partial, '{n} parcial', '{n} parcials')}</span>` : ''}</td>
            <td class="num" data-l="${t('Vegades')}">${c.n}</td>
            <td data-l="${t('Posicions')}"><ul class="pos-lines">${c.positions.map((p) => `<li>${esc(p.cat)} <span class="muted">×${p.n}</span></li>`).join('')}</ul></td>
            <td data-l="${t('Com han acabat')}"><div class="pills">${resultsPills(c.results)}</div></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card">
        <h2 style="margin-bottom:12px">${t('Per posició')}</h2>
        <div class="bars">${st.byPosition.map((p) => `<div class="bar-row">
          <span class="nm">${esc(p.cat)}</span>${resultsBar(p.results, maxPos)}<span class="num">${p.n}×</span><span></span>
        </div>`).join('')}</div>
        <p class="small muted" style="margin:10px 0 0">${t('El color de cada barra mostra com van acabar els castells en aquella posició.')}</p>
      </div>
    </div>
    <div class="card">
      <h2 style="margin-bottom:12px">${t('Últims castells')}</h2>
      <ul class="recent">${st.recent.map((r) => `<li><a href="#/castell/${r.castell_id}"><span class="castell-tag ${resultClass(r.result)}">${esc(r.castell)}</span> ${esc(r.role)}</a>
        <span class="small muted">${fmt(r.date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${esc(r.title)}${r.result !== 'previst' ? ` · ${esc(resultName(r.result))}` : ''}${r.partial ? ` · ${t('parcial')}` : ''}</span></li>`).join('')}</ul>
    </div>`;
}

function statsTabs() {
  const tabs = isAdmin()
    ? [['temporada', t('Temporada')], ['castells', t('Castells')], ['persones', t('Persones')]]
    : [['temporada', t('Temporada')], ['meves', t('Les meves')]];
  if (!tabs.some(([k]) => k === statsTab)) statsTab = 'temporada';
  return `<div class="tabs" id="st-tab">${tabs.map(([k, l]) => `<button data-t="${k}" class="${statsTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
const bindStatsTabs = () => qsa('#st-tab button').forEach((b) => (b.onclick = () => { statsTab = b.dataset.t; store.set('statsTab', statsTab); render(); }));

async function pageStats() {
  const tabs = statsTabs();
  if (statsTab === 'meves') return pagePersonStats(me.id, tabs);
  if (statsTab === 'temporada') return pageSeason(tabs);
  const people = statsTab === 'persones';
  const data = await api('GET', `/stats/${people ? 'people' : 'castells'}?${statsQuery()}`);
  $app.innerHTML = `
    <div class="page-head"><h1>${t('Estadístiques')}</h1><div class="actions">${tabs}</div></div>
    ${statsFilters(data.seasons)}
    <div class="stats-body">${people ? peopleStatsHtml(data) : castellStatsHtml(data)}</div>`;
  bindStatsFilters();
  bindStatsTabs();

  if (people) {
    qs('#st-q').oninput = (e) => {
      const q = norm(e.target.value.trim());
      qsa('#st-people tbody tr').forEach((tr) => tr.classList.toggle('hidden', q && !tr.dataset.name.includes(q)));
    };
    qsa('#st-people tbody tr').forEach((tr) => (tr.onclick = () => { location.hash = `#/estadistiques/persona/${tr.dataset.id}`; }));
  } else {
    qsa('#st-castells tbody tr').forEach((tr) => (tr.onclick = () => attemptsModal(data.castells[Number(tr.dataset.i)])));
  }
}

// Resum de temporada: el veu tothom, perquè només parla de castells i sessions (cap dada de ningú).
async function pageSeason(tabs) {
  const st = await api('GET', `/stats/season?season=${encodeURIComponent(statsSeason)}`);
  const att = st.attendance;
  const short = (d) => fmt(d, { day: 'numeric', month: 'short' });
  const castellLink = (c, cls) => `<li><a href="#/castell/${c.castell_id}"><span class="castell-tag ${cls}">${esc(c.castell)}</span></a>
    <span class="small muted">${t('Primer cop: {date}', { date: `${short(c.date)} · ${esc(c.title)}` })}</span></li>`;
  const attTile = (type, label) => att[type].sessions
    ? statTile(att[type].average, label, '', `${tn(att[type].sessions, '{n} sessió', '{n} sessions')}${att[type].max ? ` · ${t('màx. {n}', { n: att[type].max.n })}` : ''}`)
    : '';
  const best = st.descarregats[0];
  $app.innerHTML = `
    <div class="page-head"><h1>${t('Estadístiques')}</h1><div class="actions">${tabs}</div></div>
    ${statsFilters(st.seasons, { kinds: false })}
    <div class="stats-body">
      ${best ? `<div class="card season-hero">
        <span class="small muted">${statsSeason === 'all' ? t('Millor castell de la història') : t('Millor castell de la temporada')}</span>
        <a href="#/castell/${best.castell_id}" class="big-castell r-descarregat">${esc(best.castell)}</a>
        <span class="muted">${RESULTS.descarregat} · ${short(best.date)} · ${esc(best.title)}</span>
      </div>` : ''}
      ${resultTiles(st.total, st.results)}
      ${att.assaig.sessions || att.diada.sessions || att.esdeveniment.sessions ? `<div>
        <h2 class="section-h">${t('Mitjana de gent per sessió')}</h2>
        <div class="stat-tiles">${attTile('assaig', t('Assajos'))}${attTile('diada', t('Diades'))}${attTile('esdeveniment', t('Esdeveniments'))}</div>
      </div>` : ''}
      ${st.total ? `<div class="grid-2">
        <div class="card">
          <h2 style="margin-bottom:12px">${t('Castells descarregats')} <span class="muted small">${st.descarregats.length}</span></h2>
          ${st.descarregats.length ? `<ul class="recent">${st.descarregats.map((c) => castellLink(c, 'r-descarregat')).join('')}</ul>` : `<p class="muted small">${t('Encara cap aquesta temporada.')}</p>`}
          ${st.carregats.filter((c) => !st.descarregats.some((d) => d.castell === c.castell)).length ? `<h3 class="instr-h" style="margin-top:14px">${t('Només carregats')}</h3>
            <ul class="recent">${st.carregats.filter((c) => !st.descarregats.some((d) => d.castell === c.castell)).map((c) => castellLink(c, 'r-carregat')).join('')}</ul>` : ''}
        </div>
        <div class="card">
          <h2 style="margin-bottom:12px">${t('Diades')}</h2>
          ${st.diades.length ? `<ul class="diada-list">${st.diades.map((d) => `<li>
            <a href="#/sessio/${d.id}"><strong>${esc(d.title)}</strong></a><span class="small muted">${fmt(d.date, { day: 'numeric', month: 'long' })}</span>
            <div class="event-castells">${d.castells.map((c) => `<a href="#/castell/${c.id}" class="castell-tag ${resultClass(c.result)}" title="${esc(resultName(c.result))}">${esc(c.castell)}${c.partial ? '*' : ''}</a>`).join('')}</div>
          </li>`).join('')}</ul>` : `<p class="muted small">${t('Cap diada amb castells aquesta temporada.')}</p>`}
        </div>
      </div>` : `<div class="card"><p class="muted" style="margin:0">${t('No hi ha castells en aquest període.')}</p></div>`}
    </div>`;
  bindStatsFilters();
  bindStatsTabs();
}

function castellStatsHtml(data) {
  if (!data.total) return `${resultTiles(0, data.results)}<div class="card"><p class="muted" style="margin:0">${t('No hi ha castells en aquest període.')}</p></div>`;
  const cell = (n, l) => `<td class="num" data-l="${l}">${n || '<span class="muted">—</span>'}</td>`;
  // «Sense resultat» només surt si hi ha algun castell passat que no s'ha marcat.
  const cols = RESULT_ORDER.filter((r) => r !== 'previst' || data.results.previst);
  return `${resultTiles(data.total, data.results)}
    <div class="card"><div class="table-wrap"><table class="responsive stats-table" id="st-castells">
      <thead><tr><th>${t('Castell')}</th><th class="num">${t('Total')}</th>${cols.map((r) => `<th class="num">${esc(resultName(r))}</th>`).join('')}
        <th class="num">${t('Diades')}</th><th class="num">${t('Assajos')}</th><th>${t('Primer descarregat')}</th></tr></thead>
      <tbody>${data.castells.map((c, i) => `<tr class="clickable" data-i="${i}">
        <td class="lead"><span class="castell-tag">${esc(c.castell)}</span>${c.partial ? `<span class="sub">${tn(c.partial, '{n} parcial', '{n} parcials')}</span>` : ''}${resultsBar(c.results)}</td>
        ${cell(c.n, t('Total'))}${cols.map((r) => cell(c.results[r], esc(resultName(r)))).join('')}
        ${cell(c.diades, t('Diades'))}${cell(c.assajos, t('Assajos'))}
        <td data-l="${t('Primer descarregat')}">${c.firstDescarregat ? fmt(c.firstDescarregat, { day: 'numeric', month: 'short', year: 'numeric' }) : '<span class="muted">—</span>'}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted">${t('Toca un castell per veure cada vegada que s\'ha fet. Les proves parcials compten, però no per al primer descarregat.')}</p></div>`;
}

function attemptsModal(c) {
  openModal(`${modalHead(esc(c.castell))}
    <div class="pills" style="margin-bottom:12px">${resultsPills(c.results)}</div>
    <ul class="recent">${c.attempts.map((a) => `<li><a href="#/castell/${a.castell_id}"><span class="castell-tag ${resultClass(a.result)}">${esc(c.castell)}</span> ${esc(resultName(a.result))}${a.partial ? ` · ${t('parcial')}` : ''}</a>
      <span class="small muted">${fmt(a.date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${esc(a.title)}${a.label ? ` · ${esc(a.label)}` : ''}</span></li>`).join('')}</ul>`);
}

function peopleStatsHtml(data) {
  const cell = (n, l) => `<td class="num" data-l="${l}">${n || '<span class="muted">—</span>'}</td>`;
  return `<div class="card">
    <input type="search" id="st-q" placeholder="${t('Cerca…')}" style="max-width:280px;margin-bottom:12px">
    <div class="table-wrap"><table class="responsive stats-table" id="st-people">
      <thead><tr><th>${t('Persona')}</th><th class="num">${t('Castells')}</th><th class="num">${RESULTS.descarregat}</th><th class="num">${RESULTS.carregat}</th>
        <th class="num">${t('Intents')}</th><th class="num">${t('Sessions')}</th><th>${t('Posició més feta')}</th></tr></thead>
      <tbody>${data.people.map((p) => `<tr class="clickable ${p.active ? '' : 'inactive'}" data-id="${p.id}" data-name="${esc(norm(p.name + ' ' + (p.alias || '')))}">
        <td class="lead">${p.alias ? `<strong>${esc(p.alias)}</strong> <span class="muted">· ${esc(p.name)}</span>` : esc(p.name)}</td>
        ${cell(p.castells, t('Castells'))}${cell(p.results.descarregat, RESULTS.descarregat)}${cell(p.results.carregat, RESULTS.carregat)}
        ${cell(p.results.intent + p.results['intent desfet'], t('Intents'))}${cell(p.sessions, t('Sessions'))}
        <td data-l="${t('Posició més feta')}">${p.top ? `${esc(p.top.cat)} <span class="muted">×${p.top.n}</span>` : '<span class="muted">—</span>'}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted">${t('Toca una persona per veure les seves estadístiques. «Sessions» compta les sessions on ha vingut.')}</p></div>`;
}

async function pagePersonStats(id, tabs = '') {
  id = Number(id);
  if (!isAdmin() && id !== me.id) { location.hash = '#/estadistiques'; return; }
  const st = await api('GET', `/stats/people/${id}?${statsQuery()}`);
  const own = id === me.id;
  $app.innerHTML = `
    ${isAdmin() ? `<a class="back" href="#/estadistiques">${icon.back}${t('Estadístiques')}</a>` : ''}
    <div class="page-head"><h1>${tabs ? t('Estadístiques') : own ? t('Les meves estadístiques') : esc(fullName(st.person))}</h1>${tabs ? `<div class="actions">${tabs}</div>` : ''}</div>
    ${statsFilters(st.seasons)}
    <div class="stats-body">${personStatsHtml(st)}</div>`;
  bindStatsFilters();
  bindStatsTabs();
}

// ---------- Inici ----------
(async () => {
  config = await api('GET', '/config').catch(() => config);
  render();
})();
