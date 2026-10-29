// Entrada: «Qui ets?» dels membres, nota de protecció de dades i entrada d'administradors.
import { PRIVACY } from '../privacy.js';
import { $app, api, attempt, config, esc, formData, icon, isAdmin, lang, me, norm, qs, qsa, setMe, shortName, store,
  t, toast } from './core.js';
import { bindSettings, settingsControls } from './shell.js';

// ---------- Entrada de membres: «Qui ets?» ----------
// Els membres no tenen contrasenya: només trien el seu nom perquè l'app sàpiga
// qui confirma l'assistència i on ressaltar-los als castells.
// El nom de l'app (és un nom propi: no es tradueix).
const MADE_WITH = '<div class="made-with"><span class="brand-mark" aria-hidden="true"></span>Appinya\'t</div>';

export async function pageIdentify() {
  let code = store.get('collaCode', '');
  const shell = (inner) => `
    <div class="login"><div class="card stack identify">
      <span class="brand-mark" aria-hidden="true"></span>
      <h1>${esc(config.collaName)}</h1>
      ${config.demo ? `<div class="demo-note">${t('Versió de prova: tria qualsevol nom per entrar com a membre, o entra com a administrador/a amb {user} / {pass}. Les dades són inventades i es reinicien de tant en tant.', { user: '<b>admin</b>', pass: '<b>admin1234</b>' })}</div>` : ''}
      ${inner}
      <a href="#/admin" class="small" style="display:block;text-align:center">${t('Entrar com a administrador/a')}</a>
      <a href="#/privadesa" class="small muted" style="display:block;text-align:center">${t('Protecció de dades')}</a>
      <div class="login-settings">${settingsControls()}</div>
      ${MADE_WITH}
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
        if (person) { setMe(person); location.hash = '#/'; toast(t('Hola, {name}!', { name: shortName(person) })); }
      };
      bind(draw);
    };
    draw();
  };

  if (config.needsCode && !code) askCode(); else await load();
}

// ---------- Protecció de dades ----------
// La pot llegir tothom (també abans d'entrar) i es pot imprimir per signar-la a paper.
export async function pagePrivacy() {
  const p = PRIVACY[lang] || PRIVACY.ca;
  const contact = config.privacyContact ? `<strong>${esc(config.privacyContact)}</strong>` : t('la junta de la colla');
  const text = p({ colla: `<strong>${esc(config.collaName)}</strong>`, contact });
  $app.innerHTML = `
    ${me ? '' : `<a class="back no-print" href="#/login">${icon.back}${esc(config.collaName)}</a>`}
    <article class="card privacy">
      <div class="page-head"><h1>${text.title}</h1><div class="actions no-print"><button class="btn sm" id="print-privacy">${text.print}</button></div></div>
      <p>${text.intro}</p>
      ${text.sections.map(([h, body]) => `<h2>${h}</h2><p>${body}</p>`).join('')}
      <section class="privacy-sign">
        <h2>${text.paper}</h2>
        <p>${text.paperText}</p>
        ${text.sign.map((l) => `<div class="sign-line"><span>${l}</span></div>`).join('')}
      </section>
    </article>`;
  qs('#print-privacy').onclick = () => window.print();
}

// ---------- Entrada d'administradors ----------
export async function pageAdminLogin() {
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
      ${MADE_WITH}
    </form></div>`;
  qs('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      setMe(await api('POST', '/login', formData(e.target)));
      location.hash = '#/';
      toast(t('Mode administració'));
    } catch (err) {
      qs('#login-error').textContent = err.message;
    }
  };
}
