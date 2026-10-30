// Ajustos (persona, idioma, tema) i barra de navegació.
import { LANGS } from '../i18n.js';
import { accountLabel, api, applyTheme, attempt, can, closeModal, config, esc, icon, initial, isAdmin, lang, me, modalHead, openModal,
  qs, qsa, render, setLang, setMe, setTheme, shortName, store, t, theme, toast } from './core.js';
import { newsUnread } from './news.js';
import { pushControls } from './notifications.js';

// ---------- Ajustos: persona, idioma i tema ----------
// Membre: «No sóc jo» torna a «Qui ets?». Administració: tanca només el compte d'administració.
export async function switchPerson() {
  closeModal();
  await attempt(() => api('POST', '/logout'));
  setMe(null);
  location.hash = '#/login';
}

// Al mateix mòbil es pot tenir obert el compte d'administració i la fitxa de membre, i passar d'un a l'altre.
async function switchMode(mode) {
  closeModal();
  if (!(await attempt(() => api('POST', '/mode', { mode })))) return;
  setMe(await api('GET', '/me'));
  toast(mode === 'admin' ? t('Mode administració') : t('Hola, {name}!', { name: shortName(me) }));
  if (location.hash === '#/' || !location.hash) render(); else location.hash = '#/';
}

async function adminLogout() {
  closeModal();
  if (!(await attempt(() => api('POST', '/logout')))) return;
  setMe(null);
  try { setMe(await api('GET', '/me')); location.hash = '#/'; render(); } catch { /* sense fitxa de membre: va a «Qui ets?» */ }
}

export function settingsControls() {
  const seg = (name, options, current) => `<div class="tabs seg" data-seg="${name}">${options.map(([v, l]) =>
    `<button type="button" data-v="${v}" class="${v === current ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  return `<div class="set-group"><h3>${t('Idioma')}</h3>${seg('lang', Object.entries(LANGS), lang)}</div>
    <div class="set-group"><h3>${t('Aparença')}</h3>${seg('theme', [['auto', t('Automàtic')], ['light', t('Clar')], ['dark', t('Fosc')]], theme)}</div>`;
}
export function bindSettings(root, onLang) {
  qsa('[data-seg] button', root).forEach((b) => (b.onclick = () => {
    const kind = b.parentElement.dataset.seg;
    qsa('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b));
    if (kind === 'theme') { setTheme(b.dataset.v); store.set('theme', theme); applyTheme(); return; }
    setLang(b.dataset.v);
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
        <div class="small muted">${isAdmin() ? t('Compte de {what} · per editar', { what: accountLabel(me.roles) }) : t('Has entrat com a membre')}</div></div>
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
    ${settingsControls()}
    <div class="set-group"><h3>${t('Avisos al mòbil')}</h3><div id="push-box"></div></div>
    <a href="#/privadesa" class="small muted" style="display:block;text-align:center;margin-top:14px">${t('Protecció de dades')}</a>`, (m) => {
    qs('#switch-person', m)?.addEventListener('click', switchPerson);
    qs('#admin-logout', m)?.addEventListener('click', adminLogout);
    qsa('[data-mode]', m).forEach((b) => (b.onclick = () => switchMode(b.dataset.mode)));
    bindSettings(m, () => { closeModal(); render({ keepScroll: true }); settingsModal(); });
    const refreshPush = () => pushControls(m, refreshPush);
    refreshPush();
  });
}

// ---------- Navegació ----------
export function renderNav() {
  const topbar = document.getElementById('topbar');
  topbar.hidden = !me;
  document.getElementById('brand-name').textContent = config.collaName;
  if (!me) return;
  const path = location.hash || '#/';
  const link = (href, ic, label, match, dot = false) => `<a href="${href}" class="${match ? 'active' : ''}">${icon[ic]}<span>${label}</span>${dot ? `<i class="nav-dot" title="${t('Hi ha missatges nous')}"></i>` : ''}</a>`;
  document.getElementById('nav').innerHTML = [
    link('#/', 'calendar', t('Sessions'), path === '#/' || path.startsWith('#/sessio') || path.startsWith('#/castell')),
    link('#/altaveu', 'megaphone', t('Altaveu'), path.startsWith('#/altaveu'), !isAdmin() && newsUnread()),
    link('#/calendari', 'month', t('Calendari'), path.startsWith('#/calendari')),
    isAdmin() ? link('#/persones', 'users', t('Persones'), path.startsWith('#/persones')) : '',
    link('#/estadistiques', 'chart', t('Estadístiques'), path.startsWith('#/estadistiques')),
    isAdmin() ? link('#/comptes', 'lock', can('admin') ? t('Comptes') : t('El meu compte'), path.startsWith('#/comptes')) : link('#/perfil', 'user', t('Perfil'), path.startsWith('#/perfil')),
  ].join('');
  document.body.classList.toggle('admin-mode', isAdmin());
  const chip = document.getElementById('me-chip');
  chip.title = t('Ajustos i canvi de persona');
  chip.setAttribute('aria-label', chip.title);
  chip.innerHTML = isAdmin()
    ? `<span class="avatar admin">${icon.lock}</span><span class="nm">${esc(accountLabel(me.roles))}</span>${icon.chevron}`
    : `<span class="avatar">${esc(initial(me))}</span><span class="nm">${esc(shortName(me))}</span>${icon.chevron}`;
}
document.getElementById('me-chip').onclick = () => settingsModal();
