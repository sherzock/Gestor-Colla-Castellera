// Comptes d'administració, còpies de seguretat i protecció de dades.
import { download } from '../export.js';
import { $app, accountLabel, api, attempt, can, closeModal, config, copyText, day, esc, fmt, formData, icon, initial, isAdmin, lang, me, modalHead,
  openModal, qs, qsa, render, setMe, t, tn, toast } from './core.js';

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
// ---------- Segon factor ----------
// A més de la contrasenya, un codi de 6 números de l'app d'autenticació del mòbil.
const twoFactorCard = () => `<div class="card stack">
          <h2>${t('Segon factor')} ${me.twoFactor ? `<span class="badge ok-badge">${t('Activat')}</span>` : ''}</h2>
          <p class="small muted" style="margin:0">${me.twoFactor
            ? t("En entrar, a més de la contrasenya, cal el codi de 6 números de l'app d'autenticació del mòbil.")
            : t("Afegeix a la contrasenya un codi que només surt al teu mòbil: si algú l'endevina, igualment no podrà entrar. Molt recomanat per als comptes d'administració.")}</p>
          <div class="form-actions"><button class="btn" id="tfa-toggle" ${config.demo ? 'disabled' : ''}>${me.twoFactor ? t('Desactiva el segon factor') : t('Activa el segon factor')}</button></div>
        </div>`;
const bindTwoFactor = () => { qs('#tfa-toggle').onclick = () => (me.twoFactor ? twoFactorOffModal() : twoFactorSetupModal()); };
const refreshMe = async () => { setMe(await api('GET', '/me')); render({ keepScroll: true }); };

function twoFactorSetupModal() {
  openModal(`${modalHead(t('Activa el segon factor'))}
    <form id="tfa-pw" class="stack">
      <label class="field">${t('La teva contrasenya')}<input name="currentPassword" type="password" autocomplete="current-password" required></label>
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${t('Continua')}</button></div>
    </form>`, (m) => {
    qs('#tfa-pw', m).onsubmit = async (e) => {
      e.preventDefault();
      const setup = await attempt(() => api('POST', '/me/2fa/setup', formData(e.target)));
      if (setup) twoFactorCodeModal(setup);
    };
  });
}

function twoFactorCodeModal({ secret, url }) {
  const grouped = secret.match(/.{1,4}/g).join(' ');
  openModal(`${modalHead(t('Activa el segon factor'))}
    <form id="tfa-code" class="stack">
      <p style="margin:0">${t("1. Obre una app d'autenticació (Google Authenticator, Microsoft Authenticator, Aegis, 2FAS, o Contrasenyes a l'iPhone) i afegeix-hi un compte amb aquesta clau:")}</p>
      <code class="tfa-secret">${esc(grouped)}</code>
      <div class="form-actions" style="justify-content:flex-start"><button type="button" class="btn sm" id="tfa-copy">${t('Copia la clau')}</button>
        <a class="btn sm" href="${esc(url)}">${t("Obre-la a l'app del mòbil")}</a></div>
      <label class="field">${t("2. Escriu el codi de 6 números que surt a l'app")}<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required></label>
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${t('Activa el segon factor')}</button></div>
    </form>`, (m) => {
    qs('#tfa-copy', m).onclick = () => copyText(secret);
    qs('#tfa-code', m).onsubmit = async (e) => {
      e.preventDefault();
      const done = await attempt(() => api('POST', '/me/2fa/enable', formData(e.target)));
      if (done) recoveryCodesModal(done.recoveryCodes);
    };
  });
}

// Es mostren un sol cop: si es perd el mòbil, cadascun serveix per entrar una vegada.
function recoveryCodesModal(codes) {
  const text = `${t('Codis de recuperació')} · ${config.collaName} · ${me.username}\n\n${codes.join('\n')}\n`;
  openModal(`${modalHead(t('Codis de recuperació'))}
    <div class="stack">
      <p style="margin:0">${t("El segon factor ja està activat. Guarda aquests codis en un lloc segur (no al mateix mòbil): si perds el mòbil, cadascun et deixa entrar un cop en lloc del codi de l'app.")}</p>
      <ul class="tfa-codes">${codes.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}</ul>
      <div class="form-actions"><button type="button" class="btn" id="rc-copy">${t('Copia')}</button><button type="button" class="btn" id="rc-save">${t('Descarrega')}</button>
        <button type="button" class="btn primary" id="rc-done">${t('Ja els he guardat')}</button></div>
    </div>`, (m) => {
    qs('#rc-copy', m).onclick = () => copyText(text);
    qs('#rc-save', m).onclick = () => download(new Blob([text], { type: 'text/plain' }), `codis-recuperacio-${me.username}.txt`);
    qs('#rc-done', m).onclick = () => { closeModal(); refreshMe(); };
  });
}

function twoFactorOffModal() {
  openModal(`${modalHead(t('Desactiva el segon factor'))}
    <form id="tfa-off" class="stack">
      <label class="field">${t('La teva contrasenya')}<input name="currentPassword" type="password" autocomplete="current-password" required></label>
      <label class="field">${t("Codi de l'app o de recuperació")}<input name="code" autocomplete="one-time-code" maxlength="12" required></label>
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn danger">${t('Desactiva el segon factor')}</button></div>
    </form>`, (m) => {
    qs('#tfa-off', m).onsubmit = async (e) => {
      e.preventDefault();
      if (await attempt(() => api('POST', '/me/2fa/disable', formData(e.target)))) { closeModal(); toast(t('Segon factor desactivat')); refreshMe(); }
    };
  });
}

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
    <div class="grid-2"><div class="stack">${passwordCard()}${twoFactorCard()}</div><div class="stack">${can('castells') ? templatesCard() : ''}${helpCard()}</div></div>`;
  bindPassword();
  bindTwoFactor();
}

const helpCard = () => `<div class="card stack">
          <h2>${t('Ajuda')}</h2>
          <p class="small muted" style="margin:0">${t("Com funciona cada part de l'app, i què hi ha de nou a cada versió.")}</p>
          <div class="form-actions"><a class="btn" href="#/ajuda">${t('Obre l\'ajuda')}</a><a class="btn" href="#/novetats">${t('Novetats')}</a></div>
          <p class="small muted" style="margin:0">Appinya't ${esc(config.version || '')}</p>
        </div>`;

// ---------- Primers passos ----------
// El que cal tenir a punt abans de fer servir l'app amb la colla. Desapareix quan tot està fet.
function setupCard(st, backup) {
  const items = [
    [st.people >= 5, t('Persones de la colla'), t("Importa-les d'un Excel a Persones."), '#/persones'],
    [st.accounts > 1, t('Comptes per a la junta i la tècnica'), t('Un compte per a cada persona que edita, amb el que necessita.'), null],
    [st.collaCode, t('Codi de la colla'), t('Perquè només la gent de la colla pugui entrar (variable COLLA_CODE del servidor).'), '#/ajuda/servidor'],
    [st.privacyContact, t('Contacte de protecció de dades'), t('El correu de la junta a la variable PRIVACY_CONTACT del servidor.'), '#/ajuda/servidor'],
    [!st.minorsWithoutConsent, t('Consentiment dels menors de 14 anys'), tn(st.minorsWithoutConsent, 'Falta el de {n} persona.', 'Falta el de {n} persones.'), '#/persones'],
    [!st.adminsWithout2fa, t("Segon factor als comptes d'administració"), tn(st.adminsWithout2fa, '{n} compte encara no el té.', '{n} comptes encara no el tenen.'), null],
    [st.offsite && !backup.offsite?.error, t('Còpia fora del servidor'), t('Xifrada, cada dia, a un emmagatzematge a part.'), '#/ajuda/copies'],
    [st.alerts, t("Avisos quan l'app falla"), t('Al teu mòbil, amb ntfy o un servei semblant (variable ALERT_WEBHOOK).'), '#/ajuda/errors'],
  ];
  const pending = items.filter(([ok]) => !ok);
  if (!pending.length || st.demo) return '';
  return `<div class="card stack setup-card">
    <h2>${t('Primers passos')} <span class="small muted">${t('{a} de {b}', { a: items.length - pending.length, b: items.length })}</span></h2>
    <ul class="setup-list">${items.map(([ok, title, hint, href]) => `<li class="${ok ? 'done' : ''}">${ok ? icon.check : '<i class="todo-dot" aria-hidden="true"></i>'}
      <span><strong>${href && !ok ? `<a href="${href}">${title}</a>` : title}</strong>${ok ? '' : `<span class="small muted block">${hint}</span>`}</span></li>`).join('')}</ul>
  </div>`;
}

// Data i hora (guardades en UTC) a l'hora del mòbil.
export const when = (utc) => new Date(`${utc.replace(' ', 'T')}Z`).toLocaleString(lang === 'en' ? 'en-GB' : lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const errorsCard = (errors) => `<div class="card stack">
          <h2>${t("Errors de l'app")}</h2>
          ${errors.length ? `<ul class="error-list">${errors.slice(0, 6).map((e) => `<li><span class="err-msg">${esc(e.message)}</span>
            <span class="small muted">${e.kind === 'client' ? t('Mòbil') : t('Servidor')}${e.place ? ` · ${esc(e.place)}` : ''} · ${tn(e.count, '{n} cop', '{n} cops')} · ${esc(when(e.last_at))}</span></li>`).join('')}</ul>
            ${errors.length > 6 ? `<p class="small muted" style="margin:0">${tn(errors.length - 6, 'I {n} més.', 'I {n} més.')}</p>` : ''}
            <div class="form-actions"><button class="btn sm" id="errors-clear">${t('Buida la llista')}</button></div>`
          : `<p class="small muted" style="margin:0">${t("Cap error. Si n'hi ha, surten aquí (sense dir de qui eren) i, si està configurat, t'arriba un avís.")}</p>`}
        </div>`;

// Només serveixen per editar. No són persones de la colla: qui també fa castells respon amb la seva fitxa de membre.
export async function pageAccounts() {
  if (!isAdmin()) { location.hash = '#/perfil'; return; }
  if (!can('admin')) { pageMyAccount(); return; }
  const [admins, backup, errors, setup] = await Promise.all([api('GET', '/admins'), api('GET', '/backup/status'), api('GET', '/errors'), api('GET', '/setup-status')]);
  $app.innerHTML = `
    <div class="page-head"><h1>${t("Comptes d'administració")}</h1>
      <div class="actions"><button class="btn primary" id="new-admin">${icon.plus}${t('Nou compte')}</button></div></div>
    ${config.demo ? `<div class="demo-note">${t("A la versió de prova no es poden canviar els comptes d'administració")}.</div>` : ''}
    <p class="muted" style="margin-top:0">${t("Aquests comptes només serveixen per editar: sessions, castells i persones. No surten a les llistes ni responen a les sessions. Qui també fa castells respon amb la seva fitxa de membre (des d'«Ajustos» → «Respon com a…»).")}</p>
    ${setupCard(setup, backup)}
    <div class="grid-2">
      <div class="stack">
        <div class="card">
          <h2 style="margin-bottom:12px">${t('Comptes')}</h2>
          <ul class="account-list">${admins.map((a) => `<li>
            <span class="avatar admin">${esc(initial(a))}</span>
            <div class="who"><strong>${esc(a.name)}</strong><span class="small muted">${t('Usuari')}: ${esc(a.username)} · ${esc(accountLabel(a.roles))}${a.id === me.admin_id ? ` · ${t('ets tu')}` : ''} · ${a.two_factor ? t('amb segon factor') : t('sense segon factor')}</span></div>
            <button class="btn sm" data-edit="${a.id}">${t('Edita')}</button></li>`).join('')}</ul>
        </div>
        <div class="card stack">
          <h2>${t('Còpia de seguretat')}</h2>
          <p class="small muted" style="margin:0">${backup.auto
            ? (backup.last ? t('Cada dia es fa una còpia al servidor i se\'n guarden les últimes {n}. Última: {date}.', { n: backup.keep, date: fmt(backup.last, { day: 'numeric', month: 'long', year: 'numeric' }) })
              : t('Cada dia es fa una còpia al servidor i se\'n guarden les últimes {n}.', { n: backup.keep }))
            : t('A la versió de prova no es fan còpies automàtiques.')}
            ${t("Per si el servidor es perd, baixa'n una de tant en tant i guarda-la fora (en un lloc segur: té dades personals).")}</p>
          ${backup.offsite ? `<p class="small" style="margin:0">${backup.offsite.error
            ? `<span class="err-msg">${t('La còpia fora del servidor ha fallat: {error}', { error: esc(backup.offsite.error) })}</span>`
            : backup.offsite.last ? t('Fora del servidor (xifrada): l\'última és del {date}.', { date: fmt(backup.offsite.last, { day: 'numeric', month: 'long' }) })
              : t('Fora del servidor (xifrada): encara no se n\'ha enviat cap.')}</p>`
            : backup.auto ? `<p class="small" style="margin:0">${t('Encara no es fa cap còpia fora del servidor.')} <a href="#/ajuda/copies">${t('Com configurar-la')}</a></p>` : ''}
          <div class="form-actions"><a class="btn" href="/api/backup" download>${t('Descarrega una còpia')}</a></div>
        </div>
        ${errorsCard(errors)}
        <div class="card stack">
          <h2>${t('Registre de canvis')}</h2>
          <p class="small muted" style="margin:0">${t("Què ha fet cada compte d'administració l'últim any: entrades, sessions, castells, persones… Els membres que responen no hi surten.")}</p>
          <div class="form-actions"><a class="btn" href="#/registre">${t('Obre el registre')}</a></div>
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
        ${twoFactorCard()}
        ${templatesCard()}
        ${helpCard()}
      </div>
    </div>`;
  qs('#new-admin').onclick = () => adminModal();
  qsa('[data-edit]').forEach((b) => (b.onclick = () => adminModal(admins.find((a) => String(a.id) === b.dataset.edit))));
  qs('#errors-clear')?.addEventListener('click', async () => { if (await attempt(() => api('DELETE', '/errors'))) render({ keepScroll: true }); });
  bindPassword();
  bindTwoFactor();
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
      ${account?.two_factor && !self ? `<label class="check top"><input type="checkbox" name="disable_2fa"><span>${t('Treu-li el segon factor')}
          <span class="small muted block">${t("Si ha perdut el mòbil i els codis de recuperació. Després el pot tornar a activar.")}</span></span></label>` : ''}
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
      d.disable_2fa = !!d.disable_2fa;
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
