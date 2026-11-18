// Registre de canvis: què ha fet cada compte d'administració (l'últim any). Només el veu l'administració.
import { $app, api, can, esc, icon, qs, t } from './core.js';
import { when } from './accounts.js';

// Cada acció és «MÈTODE /ruta» (o una paraula per a les entrades): aquí es diu en paraules.
const ACTIONS = {
  login: () => t('Ha entrat'),
  'login-failed': () => t('Ha fallat en entrar (contrasenya o codi)'),
  'reset-password': () => t('Contrasenya nova des del servidor'),
  'PUT /api/me': () => t('Ha canviat el seu nom o la contrasenya'),
  'POST /api/me/2fa/enable': () => t('Ha activat el segon factor'),
  'POST /api/me/2fa/disable': () => t('Ha desactivat el segon factor'),
  'POST /api/admins': () => t('Ha creat un compte'),
  'PUT /api/admins/:id': () => t('Ha canviat un compte'),
  'DELETE /api/admins/:id': () => t('Ha esborrat un compte'),
  'POST /api/people': () => t('Ha afegit una persona'),
  'PUT /api/people/:id': () => t('Ha canviat una persona'),
  'DELETE /api/people/:id': () => t('Ha esborrat una persona'),
  'POST /api/people/import': () => t('Ha importat persones'),
  'POST /api/events': () => t('Ha creat una sessió'),
  'PUT /api/events/:id': () => t('Ha canviat una sessió'),
  'DELETE /api/events/:id': () => t('Ha esborrat una sessió'),
  'PUT /api/events/:id/hidden': () => t('Ha mostrat o amagat una sessió'),
  'POST /api/events/:id/rsvp': () => t('Ha obert o tancat les respostes'),
  'POST /api/events/:id/roles': () => t('Ha afegit un encarregat'),
  'DELETE /api/events/:id/roles/:roleId': () => t('Ha tret un encarregat'),
  'PUT /api/events/:id/attendance': () => t("Ha canviat l'assistència"),
  'PUT /api/events/:id/attendance/:personId': () => t("Ha canviat l'assistència"),
  'POST /api/events/:id/fields': () => t('Ha afegit una pregunta'),
  'DELETE /api/fields/:id': () => t('Ha tret una pregunta'),
  'POST /api/events/:id/guests': () => t('Ha afegit una persona temporal'),
  'PUT /api/guests/:id': () => t('Ha canviat una persona temporal'),
  'DELETE /api/guests/:id': () => t('Ha tret una persona temporal'),
  'POST /api/events/:id/castells': () => t('Ha creat un castell'),
  'PUT /api/castells/:id': () => t('Ha canviat un castell'),
  'DELETE /api/castells/:id': () => t('Ha esborrat un castell'),
  'POST /api/castells/:id/duplicate': () => t('Ha duplicat un castell'),
  'PUT /api/castells/:id/hidden': () => t('Ha mostrat o amagat un castell'),
  'PUT /api/castells/:id/positions/:key': () => t("Ha canviat una posició d'un castell"),
  'PUT /api/castells/:id/positions': () => t("Ha desat l'alineació d'un castell"),
  'POST /api/announcements': () => t("Ha publicat un missatge a l'altaveu"),
  'PUT /api/announcements/:id': () => t("Ha editat un missatge de l'altaveu"),
  'DELETE /api/announcements/:id': () => t("Ha esborrat un missatge de l'altaveu"),
  'PUT /api/templates/:name': () => t('Ha desat una pinya de la colla'),
  'DELETE /api/templates/:name': () => t("Ha tornat una pinya a l'estàndard"),
  'DELETE /api/errors': () => t("Ha buidat la llista d'errors"),
};
export const actionLabel = (action) => ACTIONS[action]?.() ?? action;

export async function pageAudit() {
  if (!can('admin')) { location.hash = '#/'; return; }
  // De les persones només es guarda el número: el nom es posa ara, si encara hi són.
  const [rows, people] = await Promise.all([api('GET', '/audit'), api('GET', '/people').then((r) => r.people).catch(() => [])]);
  const names = new Map(people.map((p) => [`#${p.id}`, p.alias || p.name]));
  const targetOf = (r) => (r.target?.startsWith('#') ? names.get(r.target) ?? t('persona esborrada') : r.target);
  const row = (r) => `<li class="${r.action === 'login-failed' ? 'failed' : ''}">
    <span class="small muted audit-when">${esc(when(r.at))}</span>
    <span><strong>${esc(r.account)}</strong> · ${esc(actionLabel(r.action))}${targetOf(r) ? `<span class="muted"> · ${esc(targetOf(r))}</span>` : ''}</span></li>`;
  $app.innerHTML = `
    <a class="back" href="#/comptes">${icon.back}${t('Comptes')}</a>
    <div class="page-head"><h1>${t('Registre de canvis')}</h1></div>
    <p class="muted" style="margin-top:0">${t("Què ha fet cada compte d'administració l'últim any. Els membres que responen a les sessions no hi surten.")}</p>
    <div class="card">${rows.length ? `<ul class="audit-list" id="audit-list">${rows.map(row).join('')}</ul>
      ${rows.length === 200 ? `<div class="form-actions"><button class="btn" id="audit-more">${t("Carrega'n més")}</button></div>` : ''}`
      : `<p class="muted">${t('Encara no hi ha res.')}</p>`}</div>`;
  let last = rows.at(-1)?.id;
  const more = qs('#audit-more');
  if (more) more.onclick = async () => {
    const next = await api('GET', `/audit?before=${last}`);
    qs('#audit-list').insertAdjacentHTML('beforeend', next.map(row).join(''));
    last = next.at(-1)?.id ?? last;
    if (next.length < 200) more.remove();
  };
}
