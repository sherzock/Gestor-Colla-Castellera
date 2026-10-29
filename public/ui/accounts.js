// Comptes d'administració, còpies de seguretat i protecció de dades.
import { $app, api, attempt, closeModal, config, day, esc, fmt, formData, icon, initial, isAdmin, me, modalHead,
  openModal, qs, qsa, render, setMe, t, toast } from './core.js';

// Només serveixen per editar. No són persones de la colla: qui també fa castells respon amb la seva fitxa de membre.
export async function pageAccounts() {
  if (!isAdmin()) { location.hash = '#/perfil'; return; }
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
            <div class="who"><strong>${esc(a.name)}</strong><span class="small muted">${t('Usuari')}: ${esc(a.username)}${a.id === me.admin_id ? ` · ${t('ets tu')}` : ''}</span></div>
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
        <form class="card stack" id="pw-form">
          <h2>${t('Canvia la meva contrasenya')}</h2>
          <p class="small muted" style="margin:0">${t('Usuari')}: <strong>${esc(me.username)}</strong></p>
          <label class="field">${t('Contrasenya actual')}<input name="currentPassword" type="password" autocomplete="current-password" required></label>
          <label class="field">${t('Nova contrasenya')}<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="200" required></label>
          <div class="form-actions"><button class="btn">${t('Canvia')}</button></div>
        </form>
        <div class="card stack">
          <h2>${t('Pinyes de la colla')}</h2>
          <p class="small muted" style="margin:0">${t('Redibuixa la pinya de cada castell a la manera de la colla: mou, afegeix o treu posicions.')}</p>
          <div class="form-actions"><a class="btn" href="#/plantilles">${t('Obre l\'editor de pinyes')}</a></div>
        </div>
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
      <label class="field">${t('Nom')}<input name="name" required maxlength="60" value="${esc(account?.name)}" placeholder="${t('p. ex. Junta tècnica, Marta…')}"></label>
      <label class="field">${t('Usuari')}<input name="username" required maxlength="60" autocapitalize="none" autocomplete="off" value="${esc(account?.username)}"></label>
      <label class="field">${account ? t('Nova contrasenya') : t('Contrasenya')}<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="200" ${account ? '' : 'required'} placeholder="${account ? t('Deixa-ho buit per no canviar') : t('Mínim 8 caràcters')}"></label>
      <label class="field">${t('La teva contrasenya')}<input name="currentPassword" type="password" autocomplete="current-password" required>
        <span class="small muted">${t('Per seguretat, crear, canviar o esborrar comptes demana la teva contrasenya.')}</span></label>
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
