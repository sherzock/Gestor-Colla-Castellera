// Altaveu: missatges de l'administració per a tota la colla.
import { $app, LOCALE, api, attempt, closeModal, day, esc, formData, icon, isAdmin, lang, me, modalHead, openModal,
  qs, qsa, render, store, t, toast } from './core.js';
import { renderNav } from './shell.js';

// ---------- Altaveu ----------
// Missatges d'informació de l'administració per a tota la colla. Cada mòbil recorda fins on ha llegit (només per
// marcar la pestanya quan n'hi ha de nous).
export const newsUnread = () => !!me?.latestNews && me.latestNews > store.get('newsSeen', '');
const newsDate = (at) => new Date(`${at.replace(' ', 'T')}Z`);
// Text pla amb salts de línia; les adreces web es converteixen en enllaços (només http i https).
const richText = (text) => esc(text || '').replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);

export async function pageNews() {
  const list = await api('GET', '/announcements');
  const admin = isAdmin();
  const latest = list.reduce((m, a) => (a.created_at > m ? a.created_at : m), '');
  const seen = store.get('newsSeen', '');
  if (latest) store.set('newsSeen', latest);
  if (me) me.latestNews = latest || me.latestNews;
  renderNav();
  const when = (a) => newsDate(a.created_at).toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'long', year: 'numeric' });
  $app.innerHTML = `
    <div class="page-head"><h1>${t('Altaveu')}</h1>
      <div class="actions">${admin ? `<button class="btn primary" id="new-news">${icon.plus}${t('Nou missatge')}</button>` : ''}</div></div>
    <p class="muted" style="margin-top:0">${admin ? t('Missatges per a tota la colla. Els membres els veuen aquí i la pestanya es marca quan n\'hi ha de nous.') : t("Informació de l'administració per a tota la colla.")}</p>
    <div class="news-list">${list.map((a) => `<article class="card news ${a.pinned ? 'pinned' : ''} ${!admin && a.created_at > seen && seen ? 'new' : ''}">
      <div class="news-head">
        <div><h2>${esc(a.title)}</h2>
          <div class="small muted">${a.pinned ? `<span class="news-tag">${t('Fixat')}</span> ` : ''}${when(a)}${admin && a.author ? ` · ${esc(a.author)}` : ''}${a.updated_at ? ` · ${t('editat')}` : ''}</div></div>
        ${admin ? `<div class="actions"><button class="btn sm" data-edit-news="${a.id}">${t('Edita')}</button><button class="btn sm danger" data-del-news="${a.id}">${t('Esborra')}</button></div>` : ''}
      </div>
      ${a.body ? `<div class="news-body">${richText(a.body)}</div>` : ''}
    </article>`).join('') || `<div class="empty">${icon.megaphone}<p>${t('Encara no hi ha cap missatge.')}</p></div>`}</div>`;
  if (!admin) return;
  qs('#new-news').onclick = () => newsModal();
  qsa('[data-edit-news]').forEach((b) => (b.onclick = () => newsModal(list.find((a) => String(a.id) === b.dataset.editNews))));
  qsa('[data-del-news]').forEach((b) => (b.onclick = async () => {
    const a = list.find((x) => String(x.id) === b.dataset.delNews);
    if (!confirm(t('Esborrar el missatge «{title}»?', { title: a.title }))) return;
    if (await attempt(() => api('DELETE', `/announcements/${a.id}`))) { toast(t('Missatge esborrat')); render({ keepScroll: true }); }
  }));
}

function newsModal(a) {
  openModal(`${modalHead(a ? t('Edita el missatge') : t('Nou missatge'))}
    <form id="news-form" class="stack">
      <label class="field">${t('Títol')}<input name="title" required maxlength="120" value="${esc(a?.title)}" placeholder="${t('p. ex. Canvi d\'hora de l\'assaig')}"></label>
      <label class="field">${t('Missatge')}<textarea name="body" rows="7" maxlength="4000" placeholder="${t('Les adreces web es converteixen en enllaços.')}">${esc(a?.body)}</textarea></label>
      <label class="check"><input type="checkbox" name="pinned" ${a?.pinned ? 'checked' : ''}> ${t('Fixa-ho a dalt de tot')}</label>
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${a ? t('Desa') : t('Publica')}</button></div>
    </form>`, (m) => {
    qs('#news-form', m).onsubmit = async (e) => {
      e.preventDefault();
      const saved = await attempt(() => api(a ? 'PUT' : 'POST', a ? `/announcements/${a.id}` : '/announcements', formData(e.target)));
      if (!saved) return;
      closeModal();
      toast(a ? t('Missatge desat') : t('Missatge publicat'));
      render({ keepScroll: true });
    };
  });
}
