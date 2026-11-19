// Punt d'entrada de l'app: rutes, render de cada pàgina i arrencada. Cada pantalla és a public/ui/.
import { pageAccounts } from './ui/accounts.js';
import { pageAudit } from './ui/audit.js';
import { pageCalendar } from './ui/calendar.js';
import { setTemplates } from './castell.js';
import { $app, api, closeModal, config, esc, me, pageLongLists, render, setConfig, setMe, setRenderer, t } from './ui/core.js';
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

// Quan la mateixa pàgina es torna a pintar (en triar una pestanya, desar…), el focus del teclat torna al mateix botó.
function focusKey(el) {
  if (!el || el === document.body || !$app.contains(el)) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const box = el.parentElement?.closest('[id]');
  const data = [...el.attributes].filter((x) => x.name.startsWith('data-')).map((x) => `[${x.name}="${CSS.escape(x.value)}"]`).join('');
  return box && data ? `#${CSS.escape(box.id)} ${el.tagName.toLowerCase()}${data}` : null;
}

async function renderPage({ keepScroll = false } = {}) {
  const scroll = window.scrollY;
  const refocus = focusKey(document.activeElement);
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
    pageLongLists($app);
    // Cada pàgina té el seu títol (el que es llegeix en canviar de pàgina i surt a la pestanya i a l'historial).
    const h1 = $app.querySelector('h1')?.textContent.trim();
    document.title = h1 && h1 !== config.collaName ? `${h1} · ${config.collaName}` : `${config.collaName} · Appinya't`;
  } catch (err) {
    if (!err.fromApi) reportError(err.message, err.stack);
    $app.innerHTML = `<div class="empty"><h2>${t("No s'ha pogut carregar")}</h2><p>${esc(err.message)}</p><a class="btn" href="#/">${t("Torna a l'inici")}</a></div>`;
  }
  window.scrollTo(0, keepScroll ? scroll : 0);
  // En canviar de pàgina, el focus va al principi del contingut nou (el lector de pantalla no es queda al menú).
  if (moved && !document.querySelector('.modal-back')) { moved = false; $app.focus({ preventScroll: true }); }
  else if (refocus && !document.querySelector('.modal-back')) $app.querySelector(refocus)?.focus({ preventScroll: true });
  markTabs();
}
setRenderer(renderPage);
let moved = false;
window.addEventListener('hashchange', () => { moved = true; closeModal({ restore: false }); render(); });

// Les pestanyes i els selectors (botons amb la classe «on») diuen quin està triat als lectors de pantalla.
function markTabs(root = $app) {
  for (const b of root.querySelectorAll('.tabs > button')) b.setAttribute('aria-pressed', b.classList.contains('on'));
}
new MutationObserver((list) => {
  for (const m of list) if (m.target.matches?.('.tabs > button')) m.target.setAttribute('aria-pressed', m.target.classList.contains('on'));
    else if (m.type === 'childList') for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches('.tabs, .tabs > button') || n.querySelector('.tabs'))) markTabs(n.parentElement || n);
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

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
