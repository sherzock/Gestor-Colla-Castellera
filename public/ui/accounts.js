// Comptes d'administració, còpies de seguretat i protecció de dades.
import { $app, accountLabel, api, attempt, can, closeModal, config, day, esc, fmt, formData, icon, initial, isAdmin, me, modalHead,
  openModal, qs, qsa, render, setMe, t, toast } from './core.js';

const passwordCard = () => `<form class="card stack" id="pw-form">
          <h2>${t('Canvia la meva contrasenya')}</h2>
          <p class="small muted" style="margin:0">${t('Usuari')}: <strong>${esc(me.username)}</strong></p>
          <label class="field">${t('Contrasenya actual')}<input name="currentPassword" type="password" autocomplete="current-password" required></label>
          <label class="field">${t('Nova contrasenya')}<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="200" required></label>
          <div class="form-actions"><button class="btn">${t('Canvia')}</button></div>
        </form>`;
const bindPassword = () => {
  qs('#pw-form').onsubmit = async (e) => {
    e.preventDefault();
    if (await attempt(() => api('PUT', '/me', formData(e.target)))) { e.target.reset(); toast(t('Contrasenya canviada')); }
  };
};
const templatesCard = () => `<div class="card stack">
          <h2>${t('Pinyes de la colla')}</h2>
          <p class="small muted" style="margin:0">${t('Redibuixa la pinya de cada castell a la manera de la colla: mou, afegeix o treu posicions.')}</p>
          <div class="form-actions"><a class="btn" href="#/plantilles">${t('Obre l\'editor de pinyes')}</a></div>
        </div>`;

// Els comptes de junta i tècnica només hi veuen el que és seu; els comptes els gestiona l'administració.
function pageMyAccount() {
  $app.innerHTML = `
    <div class="page-head"><h1>${t('El meu compte')}</h1></div>
    <p class="muted" style="margin-top:0">${t('Compte de {what}. Per canviar què pot fer, parla amb l\'administració.', { what: `<strong>${esc(accountLabel(me.roles))}</strong>` })}</p>
    <div class="grid-2"><div class="stack">${passwordCard()}</div><div class="stack">${can('castells') ? templatesCard() : ''}</div></div>`;
  bindPassword();
}

// Només serveixen per editar. No són persones de la colla: qui també fa castells respon amb la seva fitxa de membre.
export async function pageAccounts() {
  if (!isAdmin()) { location.hash = '#/perfil'; return; }
  if (!can('admin')) { pageMyAccount(); return; }
  const [admins, backup] = await Promise.all([api('GET', '/admins'), api('GET', '/backup/status')]);
  $app.innerHTML = `
    <div class="page-head"><h1>${t("Comptes d'administració")}</h1>
      <div class="actions"><button class="btn primary" id="new-admin">${icon.plus}${t('Nou compte')}</button></div></div>
    ${config.demo ? `<div class="demo-note">${t("A la versió de prova no es poden canviar els comptes d'administració")}.</div>` : ''}
    <p class="muted" style="margin-top:0">${t("Aquests comptes només serveixen per editar: sessions, castells i persones. No surten a les llistes ni responen a les sessions. Qui també fa castells respon amb la seva fitxa de membre (des d'«Ajustos» → «Respon com a…»).")}</p>
    <div class="grid-2">
      <div class="stack">
        <div class="card">
          <h2 style="margin-bottom:12px">${t('Comptes')}</h2>
          <ul class="account-list">${admins.map((a) => `<li>
            <span class="avatar admin">${esc(initial(a))}</span>
            <div class="who"><strong>${esc(a.name)}</strong><span class="small muted">${t('Usuari')}: ${esc(a.username)} · ${esc(accountLabel(a.roles))}${a.id === me.admin_id ? ` · ${t('ets tu')}` : ''}</span></div>
            <button class="btn sm" data-edit="${a.id}">${t('Edita')}</button></li>`).join('')}</ul>
        </div>
        <div class="card stack">
          <h2>${t('Còpia de seguretat')}</h2>
          <p class="small muted" style="margin:0">${backup.auto
            ? (backup.last ? t('Cada dia es fa una còpia al servidor i se\'n guarden les últimes {n}. Última: {date}.', { n: backup.keep, date: fmt(backup.last, { day: 'numeric', month: 'long', year: 'numeric' }) })
              : t('Cada dia es fa una còpia al servidor i se\'n guarden les últimes {n}.', { n: backup.keep }))
            : t('A la versió de prova no es fan còpies automàtiques.')}
            ${t("Per si el servidor es perd, baixa'n una de tant en tant i guarda-la fora (en un lloc segur: té dades personals).")}</p>
          <div class="form-actions"><a class="btn" href="/api/backup" download>${t('Descarrega una còpia')}</a></div>
        </div>
        <div class="card stack">
          <h2>${t('Protecció de dades')}</h2>
          <p class="small muted" style="margin:0">${t("Nota per als membres: què es guarda, per a què i qui ho veu. També es pot imprimir per signar-la a paper (els menors de 14 anys, amb la signatura del pare, mare o tutor/a). És un model: reviseu-la a la junta.")}</p>
          ${config.privacyContact ? '' : `<p class="small" style="margin:0">${t('Falta el contacte: poseu-lo a la variable PRIVACY_CONTACT del servidor (p. ex. el correu de la junta).')}</p>`}
          <div class="form-actions"><a class="btn" href="#/privadesa">${t('Obre la nota')}</a></div>
        </div>
      </div>
      <div class="stack">
        ${passwordCard()}
        ${templatesCard()}
      </div>
    </div>`;
  qs('#new-admin').onclick = () => adminModal();
  qsa('[data-edit]').forEach((b) => (b.onclick = () => adminModal(admins.find((a) => String(a.id) === b.dataset.edit))));
  bindPassword();
}

function adminModal(account) {
  const self = account?.id === me.admin_id;
  const roles = account?.roles || ['junta'];
  openModal(`${modalHead(account ? esc(account.name) : t('Nou compte'))}
    <form id="admin-form" class="stack">
      <label class="field">${t('Nom')}<input name="name" required maxlength="60" value="${esc(account?.name)}" placeholder="${t('p. ex. Junta tècnica, Marta…')}"></label>
      <label class="field">${t('Usuari')}<input name="username" required maxlength="60" autocapitalize="none" autocomplete="off" value="${esc(account?.username)}"></label>
      <label class="field">${account ? t('Nova contrasenya') : t('Contrasenya')}<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="200" ${account ? '' : 'required'} placeholder="${account ? t('Deixa-ho buit per no canviar') : t('Mínim 8 caràcters')}"></label>
      <fieldset><legend>${t('Què pot fer')}</legend><div class="stack" id="account-roles">
        <label class="check top"><input type="checkbox" name="role_admin" ${roles.includes('admin') ? 'checked' : ''}><span>${t('Administració')}
          <span class="small muted block">${t('Tot, també esborrar persones, els comptes i les còpies de seguretat.')}</span></span></label>
        <label class="check top"><input type="checkbox" name="role_junta" ${roles.includes('junta') ? 'checked' : ''}><span>${t('Junta')}
          <span class="small muted block">${t('Sessions, altaveu, assistència i persones (amb el contacte, sense les mides ni les notes).')}</span></span></label>
        <label class="check top"><input type="checkbox" name="role_tecnica" ${roles.includes('tecnica') ? 'checked' : ''}><span>${t('Tècnica')}
          <span class="small muted block">${t('Castells, pinyes, altaveu, assistència i persones (amb les mides i les notes, sense el contacte).')}</span></span></label>
      </div></fieldset>
      <label class="field">${t('La teva contrasenya')}<input name="currentPassword" type="password" autocomplete="current-password" required>
        <span class="small muted">${t('Per seguretat, crear, canviar o esborrar comptes demana la teva contrasenya.')}</span></label>
      <div class="form-actions">${account && !self ? `<button type="button" class="btn danger" id="del-admin" style="margin-right:auto">${t('Esborra')}</button>` : ''}
        <button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${account ? t('Desa') : t('Crea')}</button></div>
    </form>`, (m) => {
    const form = qs('#admin-form', m);
    const syncRoles = () => {
      const all = form.elements.role_admin.checked;
      for (const name of ['role_junta', 'role_tecnica']) form.elements[name].disabled = all;
    };
    qs('#account-roles', m).onchange = syncRoles;
    syncRoles();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const { role_admin, role_junta, role_tecnica, ...d } = formData(e.target);
      d.roles = role_admin ? ['admin'] : [role_junta && 'junta', role_tecnica && 'tecnica'].filter(Boolean);
      if (!d.password) delete d.password;
      if (await attempt(() => api(account ? 'PUT' : 'POST', account ? `/admins/${account.id}` : '/admins', d))) {
        closeModal();
        toast(account ? t('Desat') : t('Compte creat'));
        if (self) setMe(await api('GET', '/me'));
        render({ keepScroll: true });
      }
    };
    qs('#del-admin', m)?.addEventListener('click', async () => {
      const current = qs('#admin-form', m).elements.currentPassword;
      if (!current.reportValidity()) return;
      if (!confirm(t('Esborrar el compte «{name}»? Ja no podrà entrar com a administrador/a.', { name: account.name }))) return;
      if (await attempt(() => api('DELETE', `/admins/${account.id}`, { currentPassword: current.value }))) { closeModal(); render(); }
    });
  });
}
