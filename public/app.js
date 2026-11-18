// Punt d'entrada de l'app: rutes, render de cada pàgina i arrencada. Cada pantalla és a public/ui/.
import { pageAccounts } from './ui/accounts.js';
import { pageAudit } from './ui/audit.js';
import { pageCalendar } from './ui/calendar.js';
import { setTemplates } from './castell.js';
import { $app, api, closeModal, config, esc, me, render, setConfig, setMe, setRenderer, t } from './ui/core.js';
import { pageEvent } from './ui/event.js';
import { pageAdminLogin, pageIdentify, pagePrivacy } from './ui/login.js';
import { pageChangelog, pageHelp } from './ui/help.js';
import { pageNews } from './ui/news.js';
import { pagePeople, pageProfile } from './ui/people.js';
import { pageHome } from './ui/sessions.js';
import { renderNav } from './ui/shell.js';
import { pagePersonStats, pageStats } from './ui/stats.js';
import { pageTemplate, pageTemplates } from './ui/templates.js';
import { pageCastell } from './ui/viewer.js';

const PUBLIC_ROUTES = ['#/login', '#/admin', '#/privadesa'];
let templatesLoaded = false;
const routes = [
  [/^#\/login$/, pageIdentify],
  [/^#\/admin$/, pageAdminLogin],
  [/^#\/privadesa$/, pagePrivacy],
  [/^#\/?$/, pageHome],
  [/^#\/sessio\/(\d+)$/, pageEvent],
  [/^#\/castell\/(\d+)$/, pageCastell],
  [/^#\/persones$/, pagePeople],
  [/^#\/perfil$/, pageProfile],
  [/^#\/comptes$/, pageAccounts],
  [/^#\/calendari(?:\/(\d{4}-\d{2}))?$/, pageCalendar],
  [/^#\/estadistiques$/, pageStats],
  [/^#\/estadistiques\/persona\/(\d+)$/, pagePersonStats],
  [/^#\/plantilles$/, pageTemplates],
  [/^#\/altaveu$/, pageNews],
  [/^#\/plantilla\/([a-z0-9]{2,12})$/, pageTemplate],
  [/^#\/registre$/, pageAudit],
  [/^#\/ajuda(?:\/([a-z]+))?$/, pageHelp],
  [/^#\/novetats$/, pageChangelog],
];

async function renderPage({ keepScroll = false } = {}) {
  const scroll = window.scrollY;
  const hash = location.hash || '#/';
  if (!me && !PUBLIC_ROUTES.includes(hash)) {
    try { setMe(await api('GET', '/me')); } catch { return; }
  }
  // Les plantilles de pinya de la colla canvien com es dibuixen els castells: s'han de tenir abans de cap pàgina.
  if (me && !templatesLoaded) {
    try { setTemplates(await api('GET', '/templates')); templatesLoaded = true; } catch { /* es dibuixa l'estàndard */ }
  }
  renderNav();
  const [re, page] = routes.find(([r]) => r.test(hash)) || [/^/, pageHome];
  const args = hash.match(re)?.slice(1) || [];
  try {
    await page(...args);
    document.title = `${config.collaName} · Appinya't`;
  } catch (err) {
    if (!err.fromApi) reportError(err.message, err.stack);
    $app.innerHTML = `<div class="empty"><h2>${t("No s'ha pogut carregar")}</h2><p>${esc(err.message)}</p><a class="btn" href="#/">${t("Torna a l'inici")}</a></div>`;
  }
  window.scrollTo(0, keepScroll ? scroll : 0);
}
setRenderer(renderPage);
window.addEventListener('hashchange', () => { closeModal(); render(); });

// ---------- Errors ----------
// Els errors de l'app (no els que diu el servidor ni els de connexió) s'envien perquè l'administració els vegi.
// Sense dir qui era: el missatge, on ha passat (sense números) i la traça. Com a molt 10 per pàgina carregada.
const reported = new Set();
function reportError(message, stack) {
  message = String(message || '').slice(0, 300);
  if (!message || reported.has(message) || reported.size >= 10) return;
  reported.add(message);
  fetch('/api/client-errors', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, stack: String(stack || '').slice(0, 2000), place: (location.hash || '#/').replace(/\d+/g, ':id') }) }).catch(() => {});
}
window.addEventListener('error', (e) => { if (e.error || e.message) reportError(e.message, e.error?.stack); });
window.addEventListener('unhandledrejection', (e) => { if (!e.reason?.fromApi) reportError(e.reason?.message || String(e.reason), e.reason?.stack); });

// ---------- Inici ----------
// Per instal·lar-la al mòbil i veure-la sense connexió.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
(async () => {
  setConfig(await api('GET', '/config').catch(() => config));
  render();
})();
