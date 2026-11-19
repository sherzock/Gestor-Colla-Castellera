// Assistència d'una sessió (administració): filtres de la taula, qui falta per contestar i qui ha vingut sense apuntar-se.
import { api, attempt, closeModal, copyText, esc, fmtDeadline, fmtLong, fullName, icon, modalHead, norm, openModal, pagedList, qs, qsa, render, shortName, statusPill, t, tn, toast, todayIso } from './core.js';
import { bindCompanions, companionsInput, fieldInput, readCompanions, readExtra } from './event-fields.js';

export const NAMES_PREVIEW = 20;

// Filtres de la taula d'assistència: abans de la sessió, per resposta; el dia i després, per qui ha vingut.
export const attKeys = (a) => ['all', a.status || 'none', a.present ? 'present' : 'absent'];
export function attFilters(passList, attendance) {
  const n = (k) => attendance.filter((a) => attKeys(a).includes(k)).length;
  const list = passList
    ? [['all', t('Tothom')], ['present', t('Han vingut')], ['absent', t('No han vingut')]]
    : [['all', t('Tothom')], ['si', t('Vénen')], ['no', t('No vénen')], ['none', t('Sense resposta')]];
  return list.map(([k, l]) => [k, l, n(k)]).filter(([k, , c]) => k === 'all' || c);
}

// El filtre es recorda mentre no es canvia de sessió, perquè cada canvi torna a pintar la pàgina.
export let attView = { id: null, f: 'all' };

export function bindAttendanceTable(event, attendance, fields, reload) {
  if (attView.id !== event.id) attView = { id: event.id, f: 'all' };
  const search = qs('#att-search');
  const chips = qsa('#att-filter .chip');
  if (!chips.some((c) => c.dataset.f === attView.f)) attView.f = 'all';
  const list = pagedList(qs('#att-table tbody'), 'att');
  const apply = () => {
    const q = norm(search.value.trim());
    chips.forEach((c) => c.classList.toggle('on', c.dataset.f === attView.f));
    list.apply((tr) => (!q || tr.dataset.name.includes(q)) && tr.dataset.f.split(' ').includes(attView.f), !!q);
  };
  chips.forEach((c) => (c.onclick = () => { attView.f = c.dataset.f; list.reset(); apply(); }));
  search.oninput = apply;
  apply();
  qsa('#att-table tbody tr[data-id]').forEach((tr) => {
    const pid = tr.dataset.id;
    const a = attendance.find((x) => String(x.id) === pid);
    qs('[data-act=status]', tr).onchange = async (e) => {
      if (await attempt(() => api('PUT', `/events/${event.id}/attendance/${pid}`, { status: e.target.value || null }))) reload();
    };
    qs('[data-act=came]', tr)?.addEventListener('click', async () => {
      // Només es guarda l'excepció: si coincideix amb la confirmació, es torna a deixar per defecte.
      const next = !a.present;
      const came = next === (a.status === 'si') ? null : next;
      if (await attempt(() => api('PUT', `/events/${event.id}/attendance/${pid}`, { came }))) {
        toast(next ? t('{name}: ha vingut', { name: shortName(a) }) : t('{name}: no ha vingut', { name: shortName(a) }));
        reload();
      }
    });
    qs('.lead', tr).style.cursor = 'pointer';
    qs('.lead', tr).onclick = () => {
      openModal(`${modalHead(esc(fullName(a)))}
        <form id="att-edit" class="stack">
          ${event.ask_companions && a.status === 'si' ? companionsInput(a.companions.map((n) => (/^Acompanyant d(e |')/.test(n) ? '' : n))) : ''}
          ${fields.map((f) => fieldInput(f, a.extra?.[f.id])).join('') || (event.ask_companions && a.status === 'si' ? '' : `<p class="muted">${t('Aquesta sessió no té camps extra.')}</p>`)}
          ${event.escoleta ? `<label class="field">${t('Escoleta')}<select name="escoleta"><option value="">—</option>
            <option value="1" ${a.escoleta === true ? 'selected' : ''}>${t('Hi vindrà')}</option><option value="0" ${a.escoleta === false ? 'selected' : ''}>${t('No hi vindrà')}</option></select></label>` : ''}
          <label class="field">${t('Comentari')}<input name="comment" maxlength="300" value="${esc(a.comment)}"></label>
          <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${t('Desa')}</button></div>
        </form>`, (m) => {
        bindCompanions(m);
        qs('#att-edit', m).onsubmit = async (e) => {
          e.preventDefault();
          const body = { extra: readExtra(e.target, fields), comment: e.target.elements.comment.value };
          if (qs('[data-companions]', m)) body.companions = readCompanions(e.target);
          if (event.escoleta) body.escoleta = e.target.elements.escoleta.value === '' ? null : e.target.elements.escoleta.value === '1';
          if (await attempt(() => api('PUT', `/events/${event.id}/attendance/${pid}`, body))) { closeModal(); reload(); }
        };
      });
    };
  });
}

// ---------- Respostes: data límit i qui falta per contestar (administració) ----------
export function pendingPeople(event, attendance) {
  return attendance.filter((a) => !a.status && (event.type !== 'musics' || a.instrument))
    .sort((a, b) => shortName(a).localeCompare(shortName(b)));
}

// El lloc de la sessió obre Google Maps (al mòbil, l'app de mapes si la té) buscant el text tal com està escrit.
export const mapsUrl = (place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

// Missatge per enganxar al grup de WhatsApp: un recordatori general, sense dir qui falta (ningú queda assenyalat
// davant de tot el grup; la llista de qui falta només la veu l'administració).
export function reminderText(event) {
  const when = `${fmtLong(event.date)}${event.start_time ? ` · ${event.start_time}` : ''}`;
  return [
    `📣 ${event.title} · ${when}`,
    event.location ? `📍 ${event.location}` : null,
    t("Si encara no heu dit si veniu, digueu-ho a l'app:"),
    `${location.origin}/#/sessio/${event.id}`,
    event.rsvp_until ? t('Podeu respondre fins al {when}.', { when: fmtDeadline(event.rsvp_until) }) : null,
    t('Gràcies!'),
  ].filter(Boolean).join('\n');
}

export function answersCard(event, attendance) {
  if (event.date < todayIso()) return '';
  const pending = pendingPeople(event, attendance);
  const state = !event.rsvp_open ? `<span class="status no">${icon.lock}${t('Tancades')}</span>`
    : event.rsvp_until ? `<span class="status si">${t('Obertes fins al {when}', { when: fmtDeadline(event.rsvp_until) })}</span>`
      : `<span class="status si">${t('Obertes fins al dia de la sessió')}</span>`;
  return `<div class="card answers-card">
    <div class="card-head"><h2>${t('Respostes')}</h2>
      <div class="actions"><button class="btn sm" id="toggle-rsvp">${event.rsvp_open ? `${icon.lock}${t('Tanca-les ara')}` : t('Torna-les a obrir')}</button></div></div>
    <div class="counts" style="margin-bottom:12px">${state}</div>
    ${pending.length ? `<h3 class="instr-h">${tn(pending.length, 'Falta {n} persona per contestar', 'Falten {n} persones per contestar')}</h3>
      <div class="names" data-more="pending">${pending.map((a) => `<span>${esc(shortName(a))}</span>`).join('')}</div>
      ${event.hidden ? `<p class="small muted" style="margin:8px 0 0">${t('Quan la mostris als membres, podràs enviar el recordatori per WhatsApp.')}</p>` : `<div class="share-row">
        <a class="btn sm primary" id="wa-send" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(reminderText(event))}">${icon.share}${t('Envia per WhatsApp')}</a>
        <button class="btn sm" id="copy-reminder">${icon.copy}${t('Copia el missatge')}</button>
      </div>
      <p class="small muted" style="margin:8px 0 0">${t('El missatge és un recordatori general per al grup, sense noms, amb l\'enllaç a la sessió.')}</p>`}`
    : `<div class="all-answered" style="margin:0">${icon.check}${t('Tothom ha contestat.')}</div>`}
  </div>`;
}

export function bindAnswersCard(event, attendance) {
  qs('#copy-reminder')?.addEventListener('click', () => copyText(reminderText(event)));
  qs('#toggle-rsvp')?.addEventListener('click', async () => {
    if (event.rsvp_open && !confirm(t('Tancar les respostes? Els membres ja no podran canviar si vénen o no.'))) return;
    if (await attempt(() => api('POST', `/events/${event.id}/rsvp`, { open: !event.rsvp_open }))) {
      toast(event.rsvp_open ? t('Respostes tancades') : t('Respostes obertes'));
      render({ keepScroll: true });
    }
  });
}

export function walkinModal(event, attendance, reload) {
  const absent = attendance.filter((a) => !a.present).sort((a, b) => shortName(a).localeCompare(shortName(b)));
  const mark = async (personId, name) => {
    if (await attempt(() => api('PUT', `/events/${event.id}/attendance/${personId}`, { came: true }))) {
      toast(t('{name}: ha vingut', { name }));
      return true;
    }
    return false;
  };
  openModal(`${modalHead(t('Afegeix qui ha vingut'))}
    <p class="muted" style="margin:-6px 0 10px">${t("Toca les persones que han vingut tot i no estar apuntades. Es poden col·locar als castells d'aquesta sessió.")}</p>
    <input type="search" id="walk-q" placeholder="${t('Cerca per nom o malnom…')}" aria-label="${t('Cerca per nom o malnom…')}" autocomplete="off">
    <div class="people-pick" id="walk-list">${absent.map((a) => `<button data-pid="${a.id}" data-name="${esc(norm(a.name + ' ' + (a.alias || '')))}">
      <span class="nm">${esc(fullName(a))}</span>${statusPill(a.status)}</button>`).join('') || `<p class="muted">${t('Tothom ja consta com a present.')}</p>`}</div>
    <form id="walk-new" class="pick-bar">
      <input name="name" maxlength="60" placeholder="${t("No és a l'app? Escriu nom i cognoms")}" aria-label="${t("No és a l'app? Escriu nom i cognoms")}" autocomplete="off">
      <button class="btn">${t('Crea i afegeix')}</button>
    </form>
    <div class="form-actions"><button class="btn primary" data-close>${t('Fet')}</button></div>`, (m) => {
    const q = qs('#walk-q', m);
    q.oninput = () => {
      const v = norm(q.value.trim());
      qsa('#walk-list button', m).forEach((b) => b.classList.toggle('hidden', v && !b.dataset.name.includes(v)));
      qs('#walk-new', m).elements.name.value = q.value;
    };
    qs('#walk-list', m).onclick = async (e) => {
      const b = e.target.closest('[data-pid]');
      if (!b || b.disabled) return;
      const a = absent.find((x) => String(x.id) === b.dataset.pid);
      if (await mark(a.id, shortName(a))) {
        reload();
        b.disabled = true;
        b.classList.add('done');
        b.querySelector('.status').outerHTML = `<span class="status si">✓ ${t('Ha vingut')}</span>`;
      }
    };
    qs('#walk-new', m).onsubmit = async (e) => {
      e.preventDefault();
      const name = e.target.elements.name.value.trim();
      if (!name) return;
      const person = await attempt(() => api('POST', '/people', { name }));
      if (person && await mark(person.id, shortName(person))) { closeModal(); reload(); }
    };
  });
}
