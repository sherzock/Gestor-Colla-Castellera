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

const imageUrl = (id) => `/api/announcements/images/${encodeURIComponent(id)}`;
// Els mateixos límits que el servidor.
const MAX_MESSAGES = 50;
const MAX_IMAGES = 4;
const MAX_SIDE = 1280;
const MAX_BYTES = 900 * 1024;
const EMOJIS = ['😀', '😂', '😉', '😍', '🥳', '🤔', '😢', '🙏', '👏', '🙌', '💪', '👍', '👎', '❤️', '🔥', '🎉', '🏆', '📢', '📅', '⏰', '📍', '⚠️', '❗', '✅', '❌', '🚌', '🍽️', '🍻', '🎂', '📸', '🎶', '🥁', '☀️', '🌧️', '👶', '🏰'];

const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(blob);
});
// Abans de pujar-la, la foto es redueix i es torna a dibuixar: ocupa molt menys i ja no porta les dades de la càmera
// (on es va fer, per exemple). Un GIF petit es deixa tal com és, perquè no perdi el moviment.
async function prepareImage(file) {
  const original = await readAsDataUrl(file);
  if (file.type === 'image/gif' && file.size <= MAX_BYTES) return original;
  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = original; });
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  // El JPEG no té transparència: el que era transparent queda blanc, no negre.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.82, 0.65, 0.45]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && (blob.size <= MAX_BYTES || quality === 0.45)) return readAsDataUrl(blob);
  }
  throw new Error('no image');
}

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
      <div class="actions">${admin ? `<span class="small muted">${t('{a} de {b} missatges', { a: list.length, b: MAX_MESSAGES })}</span><button class="btn primary" id="new-news" ${list.length >= MAX_MESSAGES ? 'disabled' : ''}>${icon.plus}${t('Nou missatge')}</button>` : ''}</div></div>
    ${admin && list.length >= MAX_MESSAGES ? `<p class="small" style="margin-top:0">${t("Ja n'hi ha el màxim: esborra'n algun d'antic per publicar-ne un de nou.")}</p>` : ''}
    <p class="muted" style="margin-top:0">${admin ? t('Missatges per a tota la colla. Els membres els veuen aquí i la pestanya es marca quan n\'hi ha de nous.') : t("Informació de l'administració per a tota la colla.")}</p>
    <div class="news-list">${list.map((a) => `<article class="card news ${a.pinned ? 'pinned' : ''} ${!admin && a.created_at > seen && seen ? 'new' : ''}">
      <div class="news-head">
        <div><h2>${esc(a.title)}</h2>
          <div class="small muted">${a.pinned ? `<span class="news-tag">${t('Fixat')}</span> ` : ''}${when(a)}${admin && a.author ? ` · ${esc(a.author)}` : ''}${a.updated_at ? ` · ${t('editat')}` : ''}</div></div>
        ${admin ? `<div class="actions"><button class="btn sm" data-edit-news="${a.id}">${t('Edita')}</button><button class="btn sm danger" data-del-news="${a.id}">${t('Esborra')}</button></div>` : ''}
      </div>
      ${a.body ? `<div class="news-body">${richText(a.body)}</div>` : ''}
      ${a.images?.length ? `<div class="news-images ${a.images.length === 1 ? 'one' : ''}">${a.images.map((id) => `<button type="button" data-photo="${esc(id)}" aria-label="${t('Amplia la imatge')}"><img src="${imageUrl(id)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    </article>`).join('') || `<div class="empty">${icon.megaphone}<p>${t('Encara no hi ha cap missatge.')}</p></div>`}</div>`;
  qsa('[data-photo]').forEach((b) => (b.onclick = () => openModal(`${modalHead(t('Imatge'))}<img class="news-photo" src="${imageUrl(b.dataset.photo)}" alt="">`)));
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
      <div class="news-tools">
        <button type="button" class="btn sm" id="news-emoji" aria-expanded="false">😀 ${t('Emojis')}</button>
        <label class="btn sm" id="news-add-image">${icon.plus}${t('Afegeix imatges')}<input type="file" id="news-files" accept="image/*" multiple hidden></label>
      </div>
      <div class="emoji-grid hidden" id="news-emojis">${EMOJIS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div>
      <div class="news-picks" id="news-picks"></div>
      <label class="check"><input type="checkbox" name="pinned" ${a?.pinned ? 'checked' : ''}> ${t('Fixa-ho a dalt de tot')}</label>
      ${a ? '' : `<label class="check"><input type="checkbox" name="notify" checked> ${t('Envia un avís al mòbil de tothom que els té activats')}</label>`}
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${a ? t('Desa') : t('Publica')}</button></div>
    </form>`, (m) => {
    const form = qs('#news-form', m);
    // Les imatges del missatge, en ordre: les que ja hi eren ({ id }) i les noves ({ data }), que es pugen en publicar.
    let picks = (a?.images || []).map((id) => ({ id }));
    const showPicks = () => {
      qs('#news-picks', m).innerHTML = picks.map((p, i) => `<div class="news-pick"><img src="${p.id ? imageUrl(p.id) : p.data}" alt=""><button type="button" data-unpick="${i}" aria-label="${t('Treu la imatge')}">×</button></div>`).join('');
      qs('#news-add-image', m).classList.toggle('hidden', picks.length >= MAX_IMAGES);
      qsa('[data-unpick]', m).forEach((b) => (b.onclick = () => { picks.splice(Number(b.dataset.unpick), 1); showPicks(); }));
    };
    showPicks();
    qs('#news-files', m).onchange = async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (picks.length + files.length > MAX_IMAGES) toast(t('Com a molt {n} imatges per missatge', { n: MAX_IMAGES }), true);
      for (const file of files.slice(0, MAX_IMAGES - picks.length)) {
        try { picks.push({ data: await prepareImage(file) }); } catch { toast(t('Aquesta imatge no es pot llegir'), true); }
      }
      showPicks();
    };
    // Els emojis van on hi havia el cursor, al títol o al missatge.
    let target = form.elements.body;
    form.elements.title.onfocus = form.elements.body.onfocus = (e) => { target = e.target; };
    qs('#news-emoji', m).onclick = (e) => {
      const open = qs('#news-emojis', m).classList.toggle('hidden') === false;
      e.currentTarget.setAttribute('aria-expanded', String(open));
    };
    qsa('[data-emoji]', m).forEach((b) => (b.onclick = () => {
      if (target.value.length + b.dataset.emoji.length > target.maxLength) return;
      target.setRangeText(b.dataset.emoji, target.selectionStart, target.selectionEnd, 'end');
      target.focus();
    }));
    let sending = false;
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (sending) return;
      sending = true;
      const data = formData(e.target);
      const saved = await attempt(async () => {
        // Primer les imatges: així, quan arriba l'avís al mòbil, el missatge ja és sencer.
        for (const p of picks) if (!p.id) p.id = (await api('POST', '/announcements/images', { data: p.data.slice(p.data.indexOf(',') + 1) })).id;
        return api(a ? 'PUT' : 'POST', a ? `/announcements/${a.id}` : '/announcements', { ...data, image_ids: picks.map((p) => p.id) });
      });
      sending = false;
      if (!saved) return;
      closeModal();
      toast(a ? t('Missatge desat') : t('Missatge publicat'));
      render({ keepScroll: true });
    };
  });
}
