// Ajuda i novetats. Cadascú veu els apartats que li toquen: els membres, com fer servir l'app; els comptes, també
// com gestionar-la; l'administració, també com posar-la en marxa i mantenir-la.
import { CHANGELOG } from '../changelog.js';
import { HELP } from '../help.js';
import { $app, can, config, esc, fmt, icon, isAdmin, lang, me, t } from './core.js';

const back = () => `<a class="back" href="${isAdmin() ? '#/comptes' : '#/perfil'}">${icon.back}${isAdmin() ? (can('admin') ? t('Comptes') : t('El meu compte')) : t('El meu perfil')}</a>`;

export function pageHelp(section) {
  const sees = (who) => who === 'all' || (who === 'staff' && isAdmin()) || (who === 'admin' && can('admin'));
  const list = (HELP[lang] || HELP.ca).filter((s) => sees(s.who));
  $app.innerHTML = `${me ? back() : ''}
    <div class="page-head"><h1>${t('Ajuda')}</h1></div>
    <nav class="help-toc card">${list.map((s) => `<a href="#/ajuda/${s.id}">${esc(s.title)}</a>`).join('')}</nav>
    ${list.map((s) => `<section class="card help-section" id="help-${s.id}"><h2>${esc(s.title)}</h2>${s.body}</section>`).join('')}
    <p class="small muted">Appinya't ${esc(config.version || '')} · <a href="#/novetats">${t('Novetats')}</a></p>`;
  // Sense salts de pàgina: l'apartat demanat queda a dalt (el router torna a dalt de tot després de pintar).
  if (section) requestAnimationFrame(() => document.getElementById(`help-${section}`)?.scrollIntoView());
}

export function pageChangelog() {
  $app.innerHTML = `${me ? back() : ''}
    <div class="page-head"><h1>${t('Novetats')}</h1></div>
    ${CHANGELOG.map((v) => `<section class="card help-section">
      <h2>${esc(v.version)} <span class="small muted">${esc(fmt(v.date, { day: 'numeric', month: 'long', year: 'numeric' }))}</span></h2>
      <ul>${(v[lang] || v.ca).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
    </section>`).join('')}`;
}
