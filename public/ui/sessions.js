// Llista de sessions (inici) i formulari de sessió.
import { $app, TYPES, api, attempt, castellTags, closeModal, day, esc, fmt, formData, hiddenBadge, icon, initial,
  isAdmin, me, modalHead, openModal, qs, qsa, render, shortName, statusPill, store, t, time, tn, toast, todayIso,
  typeBadge, typeLabel, typePlural } from './core.js';
import { newsUnread } from './news.js';
import { switchPerson } from './shell.js';

// ---------- Sessions ----------
let homeScope = 'upcoming';
let homeType = store.get('homeType', 'tots');

export async function pageHome() {
  const events = await api('GET', `/events?scope=${homeScope}`);
  const showMusics = isAdmin() || !!me.instrument;
  const types = ['tots', ...TYPES.filter((x) => x !== 'musics' || showMusics)];
  if (!types.includes(homeType)) homeType = 'tots';
  const list = events.filter((e) => homeType === 'tots' || e.type === homeType);
  // Els comptes d'administració no responen: només els membres veuen què tenen pendent.
  const answering = homeScope === 'upcoming' && !isAdmin();
  const pending = answering ? list.filter((e) => !e.my_status && e.rsvp_open).length : 0;
  let lastMonth = '';
  const items = list.map((e) => {
    const month = fmt(e.date, { month: 'long', year: 'numeric' });
    const header = month !== lastMonth ? `<div class="month">${month}</div>` : '';
    lastMonth = month;
    // A les properes, es veu d'un cop d'ull què has respost: franja de color i, si encara no has dit res, un avís.
    const waiting = answering && !e.my_status && e.rsvp_open;
    const answer = answering && (e.my_status || waiting) ? `ans-${e.my_status || 'none'}` : '';
    return `${header}<a class="card event-card ${e.type} ${answer} ${e.hidden ? 'is-hidden' : ''}" href="#/sessio/${e.id}" ${waiting ? 'data-pending' : ''}>
      <div class="date-block"><div class="d">${day(e.date).getDate()}</div><div class="w">${fmt(e.date, { weekday: 'short' })}</div></div>
      <div class="event-main">
        ${typeBadge(e.type)}${e.escoleta ? ` <span class="badge escoleta">${t('Escoleta')}</span>` : ''}${e.hidden ? ` ${hiddenBadge(t('Oculta'))}` : ''}
        <div class="title">${esc(e.title)}</div>
        <div class="event-meta">
          ${time(e) ? `<span>${time(e)}</span>` : ''}${e.location ? `<span>${esc(e.location)}</span>` : ''}
          <span>✓ ${e.count_si}</span>
        </div>
        ${e.castells ? `<div class="event-castells">${castellTags(e.castells)}</div>` : ''}
      </div>
      <div class="event-side">${isAdmin() ? ''
        : waiting ? `<span class="status pending">${icon.alert}${t('Respon')}</span>`
        : !e.my_status && answering ? `<span class="status none">${t('Tancat')}</span>`
        : statusPill(e.my_status)}</div>
    </a>`;
  }).join('');

  $app.innerHTML = `
    ${isAdmin() ? '' : `<div class="hello card">
      <span class="avatar">${esc(initial(me))}</span>
      <span>${t('Hola, {name}!', { name: `<strong>${esc(shortName(me))}</strong>` })} <span class="muted">${t('No ets tu?')}</span></span>
      <button class="btn sm" id="hello-switch">${icon.swap}${t('Canvia de persona')}</button>
    </div>`}
    ${!isAdmin() && newsUnread() ? `<a class="card news-banner" href="#/altaveu">${icon.megaphone}<span>${t("Hi ha missatges nous a l'altaveu")}</span>${icon.chevron}</a>` : ''}
    <div class="page-head"><h1>${t('Sessions')}</h1>
      <div class="actions">${isAdmin() ? `<button class="btn primary" id="new-event">${icon.plus}${t('Nova sessió')}</button>` : ''}</div>
    </div>
    <div class="toolbar">
      <div class="tabs" id="scope">
        <button data-v="upcoming" class="${homeScope === 'upcoming' ? 'on' : ''}">${t('Properes')}</button>
        <button data-v="past" class="${homeScope === 'past' ? 'on' : ''}">${t('Passades')}</button>
      </div>
      <div class="chips" id="types">
        ${types.map((x) => `<button class="chip ${homeType === x ? 'on' : ''}" data-v="${x}">${typePlural(x)}</button>`).join('')}
      </div>
    </div>
    ${pending ? `<button class="pending-banner" id="go-pending">${icon.alert}<span>${tn(pending, 'Tens {n} sessió sense respondre', 'Tens {n} sessions sense respondre')}</span><b>${t('Respon ara')}</b></button>`
      : answering && list.length ? `<div class="all-answered">${icon.check}${t('Has respost totes les properes sessions.')}</div>` : ''}
    <div class="events">${items || `<div class="empty card">${homeScope === 'upcoming' ? t('No hi ha sessions programades.') : t('No hi ha sessions passades.')}</div>`}</div>`;

  qs('#hello-switch')?.addEventListener('click', switchPerson);
  qs('#go-pending')?.addEventListener('click', () => qs('[data-pending]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  qsa('#scope button').forEach((b) => (b.onclick = () => { homeScope = b.dataset.v; render(); }));
  qsa('#types button').forEach((b) => (b.onclick = () => { homeType = b.dataset.v; store.set('homeType', homeType); render(); }));
  qs('#new-event')?.addEventListener('click', () => eventModal());
}

export function eventModal(event, defaults = {}) {
  const e = event || { type: 'assaig', date: todayIso(), start_time: '20:00', end_time: '22:30', escoleta: 0, escoleta_time: '19:00', ...defaults };
  openModal(`${modalHead(event ? t('Edita la sessió') : t('Nova sessió'))}
    <form id="event-form">
      <div class="form-grid">
        <label class="field">${t('Tipus')}<select name="type">${TYPES.map((v) => `<option value="${v}" ${e.type === v ? 'selected' : ''}>${typeLabel(v)}</option>`).join('')}</select></label>
        <label class="field full">${t('Títol')}<input name="title" required maxlength="120" value="${esc(e.title)}" placeholder="${t('p. ex. Assaig general, Diada de la Mercè…')}"></label>
        <label class="field">${t('Data')}<input name="date" type="date" required min="2000-01-01" max="2100-12-31" value="${esc(e.date)}"></label>
        <label class="field">${t('Inici')}<input name="start_time" type="time" value="${esc(e.start_time)}"></label>
        <label class="field">${t('Final')}<input name="end_time" type="time" value="${esc(e.end_time)}"></label>
        <label class="field full">${t('Lloc')}<input name="location" maxlength="150" value="${esc(e.location)}" placeholder="${t('Local, plaça…')}"></label>
        <div class="full escoleta-opt" id="esc-wrap">
          <label class="check"><input type="checkbox" name="escoleta" ${e.escoleta ? 'checked' : ''}> ${t("Hi ha escoleta abans de l'assaig")}</label>
          <label class="field" id="esc-time">${t("Hora de l'escoleta")}<input name="escoleta_time" type="time" value="${esc(e.escoleta_time || '19:00')}"></label>
        </div>
        <label class="field full">${t('Descripció')}<textarea name="description" maxlength="4000">${esc(e.description)}</textarea></label>
        <label class="field full">${t('Data límit per respondre (opcional)')}<input name="rsvp_until" type="datetime-local" value="${esc(e.rsvp_until || '')}">
          <span class="small muted">${t('Després ja no es podrà canviar la resposta. Si no en poses, es pot respondre fins al mateix dia.')}</span></label>
        <label class="check full top"><input type="checkbox" name="ask_companions" ${e.ask_companions ? 'checked' : ''}><span>${t('Pregunta si vindran acompanyats')}
          <span class="small muted block">${t('Cada acompanyant es crea com a persona temporal de la sessió i es pot col·locar als castells.')}</span></span></label>
        <label class="check full"><input type="checkbox" name="hidden" ${e.hidden ? 'checked' : ''}> ${icon.eyeOff} ${t('Oculta per als membres (la pots mostrar quan estigui a punt)')}</label>
      </div>
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${event ? t('Desa') : t('Crea')}</button></div>
    </form>`, (m) => {
    const form = qs('#event-form', m);
    const title = form.elements.title;
    const sync = () => {
      qs('#esc-wrap', m).classList.toggle('hidden', form.elements.type.value !== 'assaig' && !form.elements.escoleta.checked);
      qs('#esc-time', m).classList.toggle('hidden', !form.elements.escoleta.checked);
    };
    form.onchange = sync;
    sync();
    if (!event) {
      title.value = typeLabel('assaig');
      form.elements.type.addEventListener('change', (ev) => {
        if (!title.value || TYPES.map(typeLabel).includes(title.value)) title.value = typeLabel(ev.target.value);
      });
    }
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const saved = await attempt(() => api(event ? 'PUT' : 'POST', event ? `/events/${event.id}` : '/events', formData(ev.target)));
      if (!saved) return;
      closeModal();
      toast(event ? t('Sessió desada') : t('Sessió creada'));
      if (event) render({ keepScroll: true }); else location.hash = `#/sessio/${saved.id}`;
    };
  });
}
