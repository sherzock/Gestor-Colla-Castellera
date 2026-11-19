// Suggeriments i errors: qualsevol persona els pot enviar (anònims) i l'administració els veu a «Comptes».
import { api, attempt, closeModal, esc, modalHead, openModal, qs, qsa, render, t, toast } from './core.js';
import { when } from './accounts.js';

export function feedbackModal() {
  // On era (sense números): ajuda a trobar què falla i no diu de quina sessió o persona es tracta.
  const place = location.hash.replace(/\/\d+(?=\/|$)/g, '/:id');
  openModal(`${modalHead(t('Suggeriments i errors'))}
    <form id="feedback-form" class="stack">
      <div class="tabs seg" data-kind><button type="button" data-v="idea" class="on">${t('Una idea')}</button><button type="button" data-v="error">${t('Alguna cosa no va')}</button></div>
      <label class="field"><span id="feedback-label">${t("Què milloraries o què t'agradaria que fes l'app?")}</span>
        <textarea name="message" rows="5" maxlength="1000" required></textarea></label>
      <p class="small muted" style="margin:0">${t("És anònim: no es guarda qui l'envia. Si vols resposta, posa-hi el teu nom o digues-ho a la junta. No hi escriguis dades d'altres persones.")}</p>
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${t('Envia')}</button></div>
    </form>`, (m) => {
    let kind = 'idea';
    qsa('[data-kind] button', m).forEach((b) => (b.onclick = () => {
      kind = b.dataset.v;
      qsa('[data-kind] button', m).forEach((x) => x.classList.toggle('on', x === b));
      qs('#feedback-label', m).textContent = kind === 'error' ? t('Què no va? Explica què feies i què ha passat.') : t("Què milloraries o què t'agradaria que fes l'app?");
    }));
    qs('#feedback-form', m).onsubmit = async (e) => {
      e.preventDefault();
      const message = e.target.elements.message.value;
      if (await attempt(() => api('POST', '/feedback', { kind, message, place }))) { closeModal(); toast(t('Gràcies! Ho llegirà l\'administració.')); }
    };
  });
}

// Llista per a l'administració.
export const feedbackCard = (list) => `<div class="card stack">
  <h2>${t('Suggeriments i errors')}</h2>
  <p class="small muted" style="margin:0">${t("El que la gent envia des de l'app («Ajustos» → «Suggeriments i errors»). És anònim.")}</p>
  ${list.length ? `<ul class="feedback-list" data-more="feedback">${list.map((f) => `<li class="${f.done ? 'done' : ''}">
      <div><span class="status ${f.kind === 'error' ? 'no' : 'none'}">${f.kind === 'error' ? t('Error') : t('Idea')}</span>
        <span class="small muted">${esc(when(f.created_at))}${f.place ? ` · ${esc(f.place)}` : ''}${f.version ? ` · ${esc(f.version)}` : ''}</span></div>
      <p class="feedback-msg">${esc(f.message)}</p>
      <div class="actions"><button class="btn sm" data-fb-done="${f.id}" data-v="${f.done ? 0 : 1}">${f.done ? t('Torna a obrir') : t('Fet')}</button>
        <button class="btn sm ghost danger" data-fb-del="${f.id}">${t('Esborra')}</button></div></li>`).join('')}</ul>`
    : `<p class="small muted" style="margin:0">${t('Encara no ha arribat res.')}</p>`}
</div>`;

export function bindFeedbackCard() {
  qsa('[data-fb-done]').forEach((b) => (b.onclick = async () => {
    if (await attempt(() => api('PUT', `/feedback/${b.dataset.fbDone}`, { done: b.dataset.v === '1' }))) render({ keepScroll: true });
  }));
  qsa('[data-fb-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm(t('Esborrar aquest missatge?'))) return;
    if (await attempt(() => api('DELETE', `/feedback/${b.dataset.fbDel}`))) render({ keepScroll: true });
  }));
}
