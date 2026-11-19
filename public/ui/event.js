// Detall d'una sessió: respostes, assistència, persones temporals, acompanyants i exportació.
import { buildStructure, castellName } from '../castell.js';
import { calendarCode } from './calendar.js';
import { castellModal } from './castell-form.js';
import { $app, api, attempt, can, closeModal, esc, fmtDeadline, fmtLong, formData, fullName, hiddenBadge, hiddenToggle, icon, INSTRUMENTS, isAdmin, me, MEASURES, modalHead, norm, openModal, qs, qsa, render, resultPill, sectionLabel, SECTIONS, shortName, statusLabel, t, time, tn, toast, todayIso, typeBadge } from './core.js';
import { eventAmount } from '../forms.js';
import { nextPlanTime } from '../planning.js';
import { bindPayCard, bindPaymentAdmin, fieldPriceModal, money, payBulkBar, payCard, payCell, paymentAdminCard, priceSummary } from './pay.js';
import { eventModal } from './sessions.js';
import { bindTimeline, timelineCard } from './timeline.js';
import { STATUS_ORDER } from './viewer.js';
import { answersCard, attFilters, attKeys, bindAnswersCard, bindAttendanceTable, mapsUrl, NAMES_PREVIEW, walkinModal } from './attendance.js';
import { bindCompanions, companionsInput, extraValue, fieldInput, ownCompanionNames, readCompanions, readExtra } from './event-fields.js';
import { exportSession } from './event-export.js';

// ---------- Detall de sessió ----------
export async function pageEvent(id) {
  const { event, fields, castells, mine, attendance, counts, guests = [], forecast, roles = [], roleLabels = [], plan_clashes: clashes = [], payment, payments } = await api('GET', `/events/${id}`);
  const admin = isAdmin();
  let status = mine?.status ?? null;
  let escoleta = mine?.escoleta ?? null;
  // Es passa llista el mateix dia i després: per defecte, qui havia dit «Vinc» compta com a present.
  const passList = event.date <= todayIso();
  const escTime = event.escoleta_time ? ` · ${event.escoleta_time}` : '';
  // Als assajos de músics no hi ha castells: només interessa qui hi va i què toca.
  const isMusics = event.type === 'musics';
  const going = attendance.filter((a) => (passList ? a.present : a.status === 'si'));
  const instrumentCounts = isMusics
    ? Object.entries(INSTRUMENTS).map(([k, l]) => `<span class="status none">${icon.music} ${l}: ${going.filter((a) => a.instrument === k).length}</span>`).join('')
    : '';
  const namesByInstrument = (list) => {
    const chip = (a) => `<span class="${a.id === me.id ? 'me' : ''}" data-n="${esc(norm(shortName(a)))}">${esc(shortName(a))}</span>`;
    const groups = [...Object.entries(INSTRUMENTS), [null, t('Altres')]]
      .map(([k, l]) => [l, list.filter((a) => (a.instrument || null) === k)])
      .filter(([, xs]) => xs.length);
    return groups.map(([l, xs]) => `<h3 class="instr-h">${l} · ${xs.length}</h3><div class="names">${xs.map(chip).join('')}</div>`).join('');
  };
  // Qui hi va, per grups (canalla, tècnica, junta); els músics van a part i qui no té grup, al final.
  const groupOf = (a) => (a.instrument ? 'musica' : a.section || null);
  const groupLabel = (k) => (k === 'musica' ? t('Músics') : sectionLabel(k));
  const byGroup = (list) => [...SECTIONS, 'musica', null].map((k) => [k, list.filter((a) => groupOf(a) === k)]).filter(([, xs]) => xs.length);
  const namesByGroup = (list) => {
    const chip = (a) => `<span class="${a.id === me.id ? 'me' : ''}" data-n="${esc(norm(shortName(a)))}">${esc(shortName(a))}</span>`;
    const groups = byGroup(list);
    if (groups.length === 1 && !groups[0][0]) return `<div class="names">${list.map(chip).join('')}</div>`;
    return groups.map(([k, xs]) => `<h3 class="instr-h">${groupLabel(k)} · ${xs.length}</h3><div class="names">${xs.map(chip).join('')}</div>`).join('');
  };
  // Si hi va molta gent, a la pàgina només se'n veu un tros (tu primer) i la resta, en una finestra amb cercador.
  const namesPreview = (list) => {
    const first = [...list].sort((a, b) => (b.id === me.id) - (a.id === me.id) || shortName(a).localeCompare(shortName(b))).slice(0, NAMES_PREVIEW);
    return `<div class="names">${first.map((a) => `<span class="${a.id === me.id ? 'me' : ''}">${esc(shortName(a))}</span>`).join('')}</div>
      <button type="button" class="btn sm more-btn" id="names-all">${t('Mostra-ho tot · {n}', { n: list.length })}</button>`;
  };
  const namesModal = () => openModal(`${modalHead(passList ? t('Qui ha vingut') : t('Qui hi va'))}
      <input type="search" id="names-search" placeholder="${t('Cerca persona…')}" aria-label="${t('Cerca persona…')}">
      <div id="names-full">${isMusics ? namesByInstrument(attendance) : namesByGroup(attendance)}</div>`, (m) => {
    qs('#names-search', m).oninput = (e) => {
      const q = norm(e.target.value.trim());
      qsa('#names-full .names', m).forEach((box) => {
        let shown = 0;
        qsa('span[data-n]', box).forEach((sp) => { const hide = q && !sp.dataset.n.includes(q); sp.classList.toggle('hidden', hide); if (!hide) shown++; });
        box.classList.toggle('hidden', !shown);
        if (box.previousElementSibling?.matches('h3')) box.previousElementSibling.classList.toggle('hidden', !shown);
      });
    };
  });
  // A la taula de l'administració, una fila de capçalera per grup amb quants en vénen.
  const columns = 3 + passList + !!event.escoleta + !!event.ask_companions + fields.length + !!payment;
  const tableGroups = (list, row) => {
    const groups = isMusics ? [[null, list]] : byGroup(list);
    if (groups.length === 1 && !groups[0][0]) return list.map(row).join('');
    return groups.map(([k, xs]) => `<tr class="group-row"><th colspan="${columns}">${groupLabel(k)}
        <span>${passList ? t('{n} han vingut', { n: xs.filter((a) => a.present).length }) : t('{n} vénen', { n: xs.filter((a) => a.status === 'si').length })} · ${xs.length}</span></th></tr>
      ${xs.map(row).join('')}`).join('');
  };
  const groupCounts = isMusics ? '' : byGroup(going).filter(([k]) => k)
    .map(([k, xs]) => `<span class="status none">${groupLabel(k)}: ${xs.length}</span>`).join('');

  const castellCard = (c) => {
    const total = buildStructure(c).positions.size;
    const pct = Math.round((c.assigned_count / total) * 100);
    return `<a class="castell-card ${c.hidden ? 'is-hidden' : ''}" href="#/castell/${c.id}">
      <div class="name">${castellName(c)}${c.hidden ? ` ${hiddenBadge(t('Ocult'))}` : ''}</div>
      <div class="sub">${esc(c.label || '')} ${resultPill(c.result)}</div>
      <div class="meter" title="${c.assigned_count} / ${total}"><div style="width:${pct}%"></div></div>
      <div class="small muted" style="margin-top:4px">${t('{a}/{b} posicions', { a: c.assigned_count, b: total })}</div>
    </a>`;
  };
  // Els nets (sense pinya) a part dels castells normals.
  const nets = castells.filter((c) => c.net), normals = castells.filter((c) => !c.net);
  const castellCards = [[t('Castells'), normals], [t('Castells nets'), nets]].filter(([, list]) => list.length)
    .map(([title, list]) => `<div class="castell-group">${nets.length ? `<h3 class="instr-h">${title}</h3>` : ''}<div class="castell-list">${list.map(castellCard).join('')}</div></div>`).join('');

  const confirmed = attendance.filter((a) => a.status === 'si');
  const totals = fields.filter((f) => f.kind === 'number' || f.kind === 'bool').map((f) => {
    const sum = confirmed.reduce((acc, a) => acc + (f.kind === 'number' ? Number(a.extra?.[f.id] || 0) : a.extra?.[f.id] ? 1 : 0), 0);
    return { f, sum };
  });

  const cameCell = (a) => {
    if (!passList) return '';
    const label = a.present ? t('Ha vingut') : t('No ha vingut');
    const cls = a.present ? (a.came && a.status !== 'si' ? 'came walkin' : 'came') : a.status === 'si' ? 'came absent' : 'came off';
    return `<td data-l="${t('Ha vingut')}"><button class="${cls}" data-act="came" title="${t('Toca per canviar-ho')}">${a.present ? '✓ ' : ''}${label}${a.came && a.status !== 'si' ? ` · ${t('sense apuntar-se')}` : ''}</button></td>`;
  };
  const escValue = (v) => (v === true ? `<span class="status si">${t('Sí')}</span>` : v === false ? `<span class="status no">${t('No')}</span>` : '');
  const sortedAttendance = [...attendance].sort((a, b) => (b.present - a.present) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));

  // Previsió d'assistència (només administradors, només sessions que encara no s'han fet).
  const fc = forecast;
  const enoughFor = (n) => (fc.high < n ? ['bad', t("Probablement no n'hi haurà prou")] : fc.low < n ? ['warn', t('Pot anar just')] : ['ok', t("N'hi hauria d'haver prou")]);
  const forecastCard = admin && fc ? `<div class="card forecast">
      <h2>${t("Previsió d'assistència")}</h2>
      ${fc.enough ? `<div class="forecast-main"><strong>${t('Unes {n} persones', { n: fc.expected })}</strong>
          <span class="muted">${t('entre {low} i {high}', { low: fc.low, high: fc.high })}</span></div>
        <p class="small" style="margin:6px 0">${t("{yes} han dit que vénen; de les {u} que encara no han respost, en solen venir unes {x}.", { yes: fc.yes, u: fc.unanswered, x: fc.unansweredExpected })}${fc.guests ? ` ${tn(fc.guests, 'A més, {n} persona temporal o acompanyant.', 'A més, {n} persones temporals o acompanyants.')}` : ''}</p>
        ${fc.needed ? `<p class="small forecast-need ${enoughFor(fc.needed)[0]}" style="margin:6px 0">${t('El castell més gran en necessita {n}', { n: fc.needed })} · <strong>${enoughFor(fc.needed)[1]}</strong></p>` : ''}
        <p class="small muted" style="margin:6px 0 0">${t("Segons qui ha vingut a les últimes {n} sessions quan havia dit que sí o quan no havia respost.", { n: fc.basis })}</p>`
      : `<p class="small muted" style="margin:0">${t("Encara no hi ha prou sessions passades per fer una previsió.")}</p>`}
    </div>` : '';

  const adminTable = admin ? `
    <div class="card">
      <div class="card-head"><h2>${passList ? t('Passar llista') : t('Assistència')}</h2>
        <div class="actions">
          ${passList ? `<button class="btn sm primary" id="add-walkin">${icon.plus}${t('Afegeix qui ha vingut')}</button>` : ''}
          <a class="btn sm" href="/api/events/${event.id}/attendance.csv">${t('Exporta CSV')}</a>
          ${castells.length ? `<button class="btn sm" id="export-xlsx" title="${t("L'assistència i cada castell amb la seva imatge, en un full de càlcul")}">${t('Excel amb castells')}</button>` : ''}
        </div>
      </div>
      <div class="counts" style="margin-bottom:10px">
        ${passList ? `<span class="status si strong">${t('{n} han vingut', { n: counts.present })}</span>` : ''}
        <span class="status si">${t('{n} vénen', { n: counts.si })}${counts.companions ? ` ${t('+ {n} acompanyants', { n: counts.companions })}` : ''}</span>
        <span class="status no">${t('{n} no', { n: counts.no })}</span>
        ${passList && counts.absent ? `<span class="status no">${t('{n} apuntats que no han vingut', { n: counts.absent })}</span>` : ''}
        ${passList && counts.walkins ? `<span class="status none">${t('{n} sense apuntar-se', { n: counts.walkins })}</span>` : ''}
        ${event.escoleta ? `<span class="status none">${t('Escoleta: {n}', { n: counts.escoleta })}</span>` : ''}
        ${instrumentCounts}${groupCounts}
        ${totals.map((x) => `<span class="status none">${esc(x.f.label)}: ${x.sum}</span>`).join('')}
      </div>
      ${passList ? `<p class="small muted" style="margin:0 0 8px">${t('Qui havia dit «Vinc» compta com a present. Toca «Ha vingut» per marcar qui no ha vingut, o afegeix qui ha vingut sense apuntar-se.')}</p>` : ''}
      <div class="att-tools">
        <div class="chips" id="att-filter">${attFilters(passList, attendance).map(([k, l, n]) => `<button type="button" class="chip" data-f="${k}">${l} · ${n}</button>`).join('')}</div>
        <input type="search" id="att-search" placeholder="${t('Cerca persona…')}" aria-label="${t('Cerca persona…')}">
      </div>
      ${payment ? payBulkBar() : ''}
      <div class="table-wrap"><table class="responsive" id="att-table">
        <thead><tr><th>${t('Nom')}</th><th>${t('Estat')}</th>${passList ? `<th>${t('Ha vingut')}</th>` : ''}${event.escoleta ? `<th>${t('Escoleta')}</th>` : ''}${event.ask_companions ? `<th>${t('Acompanyants')}</th>` : ''}${fields.map((f) => `<th>${esc(f.label)}</th>`).join('')}${payment ? `<th>${t('Pagament')}</th>` : ''}<th>${t('Comentari')}</th></tr></thead>
        <tbody>${tableGroups(sortedAttendance, (a) => `<tr data-id="${a.id}" data-name="${esc(norm(a.name + ' ' + (a.alias || '')))}" data-f="${attKeys(a).join(' ')}" class="${passList && !a.present ? 'not-present' : ''}">
          <td class="lead">${esc(fullName(a))}${a.instrument ? ` <span class="badge musics">${INSTRUMENTS[a.instrument]}</span>` : ''}</td>
          <td class="st"><select data-act="status" aria-label="${t('Estat')}">${['', 'si', 'no'].map((s) => `<option value="${s}" ${(a.status || '') === s ? 'selected' : ''}>${s ? statusLabel(s) : '—'}</option>`).join('')}</select></td>
          ${cameCell(a)}
          ${event.escoleta ? `<td data-l="${t('Escoleta')}">${escValue(a.escoleta)}</td>` : ''}
          ${event.ask_companions ? `<td data-l="${t('Acompanyants')}" class="small">${a.companions.length ? `<strong>${a.companions.length}</strong> · ${esc(a.companions.join(', '))}` : ''}</td>` : ''}
          ${fields.map((f) => `<td data-l="${esc(f.label)}">${extraValue(f, a.extra?.[f.id])}</td>`).join('')}
          ${payment ? `<td data-l="${t('Pagament')}" class="pay-cell">${payCell(a)}</td>` : ''}
          <td data-l="${t('Comentari')}" class="small">${esc(a.comment)}</td>
        </tr>`)}</tbody>
      </table></div>
      <p class="small muted">${t("Toca el nom d'una persona per editar els seus camps extra.")}</p>
    </div>` : `
    <div class="card">
      <h2>${passList ? t('Qui ha vingut') : t('Qui hi va')}</h2>
      <div class="counts" style="margin-top:10px">${passList
        ? `<span class="status si">${t('{n} han vingut', { n: counts.present })}</span>`
        : `<span class="status si">${t('{n} vénen', { n: counts.si })}${counts.companions ? ` ${t('+ {n} acompanyants', { n: counts.companions })}` : ''}</span>`}
        ${event.escoleta ? `<span class="status none">${t('Escoleta: {n}', { n: counts.escoleta })}</span>` : ''}${instrumentCounts}</div>
      ${!attendance.length ? `<div class="names"><span class="muted">${t('Encara ningú')}</span></div>`
        : attendance.length > NAMES_PREVIEW ? namesPreview(attendance)
        : isMusics ? namesByInstrument(attendance)
        : namesByGroup(attendance)}
    </div>`;

  const guestsCard = can('castells') && !isMusics ? `
    <div class="card">
      <div class="card-head"><h2>${t('Persones temporals')}</h2>
        <div class="actions"><button class="btn sm" id="add-guest">${icon.plus}${t('Afegeix')}</button></div></div>
      <p class="small muted" style="margin-top:-6px">${t("Gent que no és de la colla (d'una altra colla, de prova…). Es poden col·locar a qualsevol castell d'aquesta sessió i no compten a l'historial ni a les estadístiques.")}</p>
      <div class="field-list" data-more="guests">${guests.map((g) => `<div class="field-row"><div>
          <div>${esc(g.name)}${g.colla ? ` <span class="muted small">· ${esc(g.colla)}</span>` : ''}${g.companion_of && !/^Acompanyant d(e |')/.test(g.name) ? ` <span class="muted small">· ${t('acompanya {name}', { name: esc(g.companion_of_name) })}</span>` : ''}${g.companion_dropped ? ` <span class="status no">${t('Ja no ve')}</span>` : ''}</div>
          <div class="k">${[g.shoulder_height_cm ? `${t('esp.')} ${g.shoulder_height_cm} cm` : null, g.weight_kg ? `${g.weight_kg} kg` : null,
            g.placed ? tn(g.placed, 'A {n} castell', 'A {n} castells') : t('Encara sense posició')].filter(Boolean).join(' · ')}</div></div>
        <button class="btn ghost sm" style="margin-left:auto" data-edit-guest="${g.id}">${t('Edita')}</button></div>`).join('')
        || `<div class="muted small">${t('Cap persona temporal.')}</div>`}</div>
    </div>` : '';

  // Encarregats de la sessió (material, farmaciola…): l'administració els posa i tothom els veu.
  const myRoles = roles.filter((r) => r.person_id === me.id).map((r) => r.label);
  const roleNames = [...new Set(roles.map((r) => r.label))].map((label) => [label, roles.filter((r) => r.label === label)]);
  const roleSuggestions = [...new Set([...roleLabels, t('Material'), t('Farmaciola'), t('Aigua'), t('Fotos')])];
  const rolesCard = can('sessions') ? `
    <div class="card">
      <div class="card-head"><h2>${t('Encarregats')}</h2></div>
      <p class="small muted" style="margin-top:-6px">${t("Qui s'encarrega de què en aquesta sessió (material, farmaciola…). Ho veu tothom.")}</p>
      <div class="field-list" data-more="roles">${roles.map((r) => `<div class="field-row"><div><div>${esc(r.label)}</div><div class="k">${esc(fullName(r))}</div></div>
        <button class="btn ghost sm danger" style="margin-left:auto" data-del-role="${r.id}">${t('Treu')}</button></div>`).join('')
        || `<div class="muted small">${t('Cap encarregat.')}</div>`}</div>
      <form id="role-form" class="form-grid">
        <label class="field">${t('Encàrrec')}<input name="label" list="role-labels" maxlength="60" required placeholder="${t('Material')}"></label>
        <datalist id="role-labels">${roleSuggestions.map((l) => `<option value="${esc(l)}"></option>`).join('')}</datalist>
        <label class="field">${t('Persona')}<select name="person_id" required><option value="">—</option>${[...attendance]
          .sort((a, b) => shortName(a).localeCompare(shortName(b))).map((a) => `<option value="${a.id}">${esc(shortName(a))}${a.alias ? ` · ${esc(a.name)}` : ''}</option>`).join('')}</select></label>
        <div class="full"><button class="btn sm">${icon.plus}${t('Afegeix encarregat')}</button></div>
      </form>
    </div>` : roles.length ? `
    <div class="card">
      <h2>${t('Encarregats')}</h2>
      <div class="roles-list">${roleNames.map(([label, rs]) => `<div class="data-row"><span class="muted">${esc(label)}</span>
        <span>${rs.map((r) => `<strong class="${r.person_id === me.id ? 'me' : ''}">${esc(shortName(r))}</strong>`).join(', ')}</span></div>`).join('')}</div>
    </div>` : '';

  const fieldsCard = can('sessions') ? `
    <div class="card">
      <div class="card-head"><h2>${t('Camps extra')}</h2></div>
      <p class="small muted" style="margin-top:-6px">${t('Preguntes addicionals que cada persona respon en confirmar (acompanyants, dinar, autocar…).')} ${t('Amb «Preu», la resposta es cobra (cal posar on es paga a «Pagament»).')}</p>
      <div class="field-list">${fields.map((f) => `<div class="field-row"><div><div>${esc(f.label)}${f.required ? ' *' : ''}</div>
        <div class="k">${{ number: t('Número'), text: t('Text'), bool: t('Sí / No'), select: t('Llista') + ': ' + esc(f.options.join(', ')) }[f.kind]}</div>
        ${priceSummary(f) ? `<div class="k price-k">${esc(priceSummary(f))}</div>` : ''}</div>
        ${f.kind === 'text' ? '' : `<button class="btn ghost sm" style="margin-left:auto" data-price-field="${f.id}">${t('Preu')}</button>`}
        <button class="btn ghost sm danger" ${f.kind === 'text' ? 'style="margin-left:auto"' : ''} data-del-field="${f.id}">${t('Esborra')}</button></div>`).join('') || `<div class="muted small">${t('Cap camp extra.')}</div>`}</div>
      <form id="field-form" class="form-grid">
        <label class="field">${t('Nom del camp')}<input name="label" maxlength="60" placeholder="${t('Acompanyants')}" required></label>
        <label class="field">${t('Tipus')}<select name="kind"><option value="number">${t('Número')}</option><option value="bool">${t('Sí / No')}</option><option value="text">${t('Text')}</option><option value="select">${t("Llista d'opcions")}</option></select></label>
        <label class="field full hidden" id="opts">${t('Opcions (separades per comes)')}<input name="options" maxlength="800" placeholder="${t('Carn, Peix, Vegetarià')}"></label>
        <label class="check"><input type="checkbox" name="required"> ${t('Obligatori')}</label>
        <div class="full"><button class="btn sm">${icon.plus}${t('Afegeix camp')}</button></div>
      </form>
    </div>` : '';

  $app.innerHTML = `
    <a class="back" href="#/">${icon.back}${t('Sessions')}</a>
    <div class="page-head"><div class="event-hero">
        <div>${typeBadge(event.type)}${event.hidden ? ` ${hiddenBadge(t('Oculta'))}` : ''}</div>
        <h1>${esc(event.title)}</h1>
        <div class="meta"><span>${icon.calendar}${fmtLong(event.date)}</span>${time(event) ? `<span>${icon.clock}${time(event)}</span>` : ''}${event.location ? `<a class="map-link" href="${esc(mapsUrl(event.address || event.location))}" target="_blank" rel="noopener noreferrer" title="${esc(event.address || t('Obre-ho al mapa'))}">${icon.pin}${esc(event.location)}</a>` : ''}${event.escoleta ? `<span class="badge escoleta">${t('Escoleta')}${escTime}</span>` : ''}</div>
      </div>
      <div class="actions">
        ${event.date >= todayIso() && !event.hidden ? `<a class="btn sm" href="/api/calendar.ics?event=${event.id}${calendarCode('&')}" download>${icon.calAdd}${t('Al meu calendari')}</a>` : ''}
        ${can('sessions') ? `${hiddenToggle(event.hidden, 'hide-event')}<button class="btn sm" id="edit-event">${t('Edita')}</button><button class="btn sm danger" id="del-event">${t('Esborra')}</button>` : ''}
      </div>
    </div>
    ${event.hidden ? `<div class="hidden-note">${icon.eyeOff}<span>${t("Aquesta sessió està oculta: els membres no la veuen ni hi poden respondre, ni veuen els seus castells.")}</span></div>` : ''}
    ${event.description ? `<div class="card description">${esc(event.description)}</div>` : ''}
    <div class="grid-2" style="margin-top:14px">
      <div class="stack">
        ${admin ? '' : `<form class="card ${event.rsvp_open ? '' : 'closed'}" id="rsvp-form">
          <h2 style="margin-bottom:12px">${t('La meva assistència')}</h2>
          ${!event.rsvp_open ? `<div class="rsvp-note closed">${icon.lock}<span>${status
              ? t('Les respostes ja estan tancades. Si hi ha cap canvi, digues-ho a un administrador.')
              : t('Les respostes ja estan tancades i no vas respondre. Si véns, digues-ho a un administrador.')}</span></div>`
            : event.rsvp_until ? `<div class="rsvp-note">${icon.clock}<span>${t('Pots respondre fins al {when}.', { when: `<strong>${fmtDeadline(event.rsvp_until)}</strong>` })}</span></div>` : ''}
          ${isMusics ? `<p class="small muted" style="margin:-6px 0 12px">${me.instrument
            ? t('Hi vas com a: {instrument}', { instrument: `<strong>${INSTRUMENTS[me.instrument]}</strong>` })
            : t('No consta que toquis cap instrument. Demana a un administrador que ho afegeixi a la teva fitxa.')}</p>` : ''}
          ${myRoles.length ? `<div class="rsvp-note role">${icon.check}<span>${t("T'encarregues de: {what}", { what: `<strong>${esc(myRoles.join(', '))}</strong>` })}</span></div>` : ''}
          <div class="rsvp two" id="rsvp-main">${['si', 'no'].map((s) => `<button type="button" data-v="${s}" class="${status === s ? 'on' : ''}">${statusLabel(s)}</button>`).join('')}</div>
          ${event.escoleta ? `<div class="escoleta-q">
            <div><strong>${t('Escoleta')}</strong>${escTime ? `<span class="muted">${escTime}</span>` : ''}
              <div class="small muted">${t("Vindràs a l'escoleta abans de l'assaig?")}</div></div>
            <div class="rsvp two" id="rsvp-esc">
              <button type="button" data-v="si" class="${escoleta === true ? 'on' : ''}">${t('Hi vindré')}</button>
              <button type="button" data-v="no" class="${escoleta === false ? 'on' : ''}">${t('No hi vindré')}</button>
            </div></div>` : ''}
          <div id="extras" class="stack ${status === 'no' || !status ? 'hidden' : ''}" style="margin-top:14px">
            ${event.ask_companions ? companionsInput(ownCompanionNames(mine?.companions || [])) : ''}
            ${mine?.companions?.some((g) => g.dropped) ? `<p class="small muted" style="margin:0">${t("Algun acompanyant que has tret ja era en un castell: la tècnica ho veurà.")}</p>` : ''}
            ${fields.map((f) => fieldInput(f, mine?.extra?.[f.id])).join('')}
            ${payment ? `<p class="small rsvp-total" id="rsvp-total" aria-live="polite"></p>` : ''}
          </div>
          <label class="field" style="margin-top:14px">${t('Comentari (opcional)')}<input name="comment" maxlength="300" value="${esc(mine?.comment)}" placeholder="${t('Arribaré tard, porto la canalla…')}"></label>
          ${event.rsvp_open ? `<p class="small save-state" id="rsvp-state" aria-live="polite"></p>` : ''}
        </form>`}
        ${admin ? '' : `<div id="pay-slot" style="display:contents">${payCard(event, mine, payment)}</div>`}
        ${admin ? '' : rolesCard}
        ${isMusics ? '' : `<div class="card">
          <div class="card-head"><h2>${t('Castells')}</h2>
            ${can('castells') ? `<div class="actions"><button class="btn sm primary" id="add-castell">${icon.plus}${t('Afegeix castell')}</button></div>` : ''}
          </div>
          ${castellCards || `<p class="muted small">${t('Encara no hi ha castells programats.')}</p>`}
        </div>`}
        ${event.type === 'assaig' && can('staff') ? timelineCard(event, castells, clashes) : ''}
        ${admin ? rolesCard : ''}
        ${guestsCard}
        ${admin ? paymentAdminCard(event, payment, payments, attendance, fields) : ''}
        ${fieldsCard}
      </div>
      <div class="stack">${forecastCard}${admin ? answersCard(event, attendance) : ''}${adminTable}</div>
    </div>`;

  // Confirmació pròpia
  const form = qs('#rsvp-form');
  if (form && !event.rsvp_open) qsa('input, select, textarea, button', form).forEach((el) => (el.disabled = true));
  if (form && event.rsvp_open) {
  bindCompanions(form);
  // Mentre respon, quant li costarà (el preu de la sessió més el de les respostes amb preu).
  const total = qs('#rsvp-total');
  const showTotal = () => {
    if (!total) return;
    const companions = Number(form.elements.companions_n?.value) || 0;
    const amount = eventAmount(payment, fields, { status: 'si', extra: readExtra(form, fields), companions });
    total.textContent = amount ? t('Total a pagar: {amount}', { amount: money(amount) }) : '';
  };
  showTotal();
  form.addEventListener('input', showTotal);
  form.addEventListener('change', showTotal);
  // Les respostes es desen soles: «Vinc», «No» i l'escoleta en tocar-los; la resta en canviar-la o quan es deixa
  // d'escriure un moment. No cal cap botó de desar (i ningú se n'oblida).
  const state = qs('#rsvp-state');
  // Les preguntes obligatòries s'han de respondre per dir que vens (el servidor no ho desa sense).
  const missing = () => (status === 'si' ? [...fields.filter((f) => f.required && f.kind !== 'bool' && !String(readExtra(form, fields)[f.id] ?? '').trim()).map((f) => f.label),
    ...(event.ask_companions && readCompanions(form).some((n) => !n) ? [t("el nom dels acompanyants")] : [])] : []);
  const showState = (kind) => {
    const need = missing();
    state.className = `small save-state ${kind === 'error' || need.length ? 'warn-text' : ''}`;
    state.innerHTML = kind === 'saving' ? t('Desant…')
      : kind === 'error' ? t("No s'ha pogut desar. Torna-ho a provar.")
        : need.length ? t('Respon «{what}» perquè quedi desat que vens.', { what: esc(need.join('», «')) })
          : !status && escoleta === null ? t('Tria si vens: es desa sol, no cal cap botó.')
            : `${icon.check}${t('Desat')}`;
  };
  showState();
  let saving = null, again = false, timer = null;
  const body = () => {
    const b = { comment: form.elements.comment.value };
    if (status) { b.status = status; b.extra = status === 'no' ? {} : readExtra(form, fields); }
    if (event.ask_companions && status === 'si') b.companions = readCompanions(form);
    if (event.escoleta) b.escoleta = escoleta;
    return b;
  };
  // Un sol desat alhora; si mentrestant hi ha canvis, es torna a desar en acabar.
  const save = async () => {
    clearTimeout(timer);
    if (!status && escoleta === null) return true;
    if (missing().length) { showState(); return 'missing'; }
    if (saving) { again = true; return saving; }
    showState('saving');
    saving = (async () => {
      let ok;
      do {
        again = false;
        try { await api('PUT', `/events/${event.id}/attendance`, body()); ok = true; } catch (err) {
          ok = false;
          toast(err.message, true);
          // El servidor no ho accepta (p. ex. un pagament ja rebut): es torna a ensenyar el que hi ha desat. Si és
          // que no hi ha connexió, el que hi ha escrit es queda a la pantalla per tornar-ho a provar.
          if (err.status) render({ keepScroll: true });
        }
      } while (ok && again);
      saving = null;
      return ok;
    })();
    const ok = await saving;
    if (!ok) { showState('error'); return false; }
    showState();
    return true;
  };
  // Després de canviar una resposta, només s'actualitza el pagament (perquè no es perdi on s'estava escrivint).
  const refreshPay = async () => {
    const slot = qs('#pay-slot');
    if (!slot || !payment) return;
    const d = await api('GET', `/events/${event.id}`).catch(() => null);
    if (!d) return;
    slot.innerHTML = payCard(d.event, d.mine, d.payment);
    bindPayCard(event);
  };
  // Si no s'ha pogut desar, el que hi ha escrit es queda a la pantalla (i es pot tornar a provar).
  const saveAndRefresh = async () => { if (await save() === true) refreshPay(); };
  // En triar «Vinc», «No» o l'escoleta es torna a dibuixar tota la sessió (comptes, pagament…), i si no s'ha pogut
  // desar, torna a ensenyar el que hi ha desat.
  const choose = async () => { if (await save() !== 'missing') render({ keepScroll: true }); };
  qsa('#rsvp-main button', form).forEach((b) => (b.onclick = () => {
    if (status === b.dataset.v) return;
    status = b.dataset.v;
    qsa('#rsvp-main button', form).forEach((x) => x.classList.toggle('on', x === b));
    qs('#extras').classList.toggle('hidden', status === 'no');
    choose();
  }));
  qsa('#rsvp-esc button', form).forEach((b) => (b.onclick = () => {
    if (escoleta === (b.dataset.v === 'si')) return;
    escoleta = b.dataset.v === 'si';
    qsa('#rsvp-esc button', form).forEach((x) => x.classList.toggle('on', x === b));
    choose();
  }));
  // Caselles i llistes: de seguida. Text i números: quan es deixa d'escriure un moment o se surt de la casella.
  form.addEventListener('change', () => saveAndRefresh());
  form.addEventListener('input', (e) => {
    if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') return;
    clearTimeout(timer);
    state.textContent = '';
    timer = setTimeout(saveAndRefresh, 900);
  });
  form.onsubmit = (e) => { e.preventDefault(); saveAndRefresh(); };
  // Si se'n va de la pàgina amb alguna cosa escrita a mitges, es desa igualment.
  const flush = () => { if (timer) { clearTimeout(timer); timer = null; save(); } };
  window.addEventListener('hashchange', flush, { once: true });
  window.addEventListener('pagehide', flush, { once: true });
  }

  bindPayCard(event);
  qs('#names-all')?.addEventListener('click', namesModal);
  if (!admin) return;
  bindAnswersCard(event, attendance);
  qs('#add-guest')?.addEventListener('click', () => guestModal(event.id, null, () => render({ keepScroll: true })));
  qsa('[data-edit-guest]').forEach((b) => (b.onclick = () => guestModal(event.id, guests.find((g) => String(g.id) === b.dataset.editGuest), () => render({ keepScroll: true }))));
  const reload = () => render({ keepScroll: true });
  qs('#add-castell')?.addEventListener('click', () => castellModal(event.id, null, null, event.type === 'assaig' ? { time: nextPlanTime({}, castells, event) } : null));
  bindTimeline(event, castells);
  qs('#add-walkin')?.addEventListener('click', () => walkinModal(event, attendance, reload));
  qs('#export-xlsx')?.addEventListener('click', (e) => exportSession(event, castells, e.currentTarget));
  bindSessionEditing(event, reload, castells);
  bindAttendanceTable(event, attendance, fields, reload);
  bindPaymentAdmin(event, payment, reload);
  qsa('[data-price-field]').forEach((b) => (b.onclick = () => fieldPriceModal(fields.find((f) => String(f.id) === b.dataset.priceField), reload)));
}

// Els castells es creen ocults: en mostrar la sessió, millor preguntar-ho que deixar-la buida sense voler.
export function revealModal(event, castells, reload) {
  const pending = can('castells') ? castells.filter((c) => c.hidden).length : 0;
  openModal(`${modalHead(t('Mostra la sessió als membres'))}
    <form id="reveal-form">
      ${pending ? `<label class="check"><input type="checkbox" name="castells" checked> ${tn(pending, 'Mostra també el {n} castell ocult', 'Mostra també els {n} castells ocults')}</label>` : ''}
      <label class="check"><input type="checkbox" name="notify" ${event.announced_at ? '' : 'checked'}> ${t('Envia un avís al mòbil de tothom que els té activats')}</label>
      ${event.announced_at ? `<p class="small muted" style="margin:6px 0 0">${t("D'aquesta sessió ja se n'ha enviat un.")}</p>` : ''}
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${t('Mostra')}</button></div>
    </form>`, (m) => {
    qs('#reveal-form', m).onsubmit = async (e) => {
      e.preventDefault();
      const { castells: also, notify } = e.target.elements;
      if (!(await attempt(() => api('PUT', `/events/${event.id}/hidden`, { hidden: false, castells: !!also?.checked, notify: notify.checked })))) return;
      closeModal();
      toast(notify.checked ? t('Ara els membres ja la veuen, i els hem avisat') : t('Ara els membres ja la veuen'));
      reload();
    };
  });
}

// Editar la sessió és de la junta (i de l'administració): sense permís, aquests botons i formularis no hi són.
export function bindSessionEditing(event, reload, castells) {
  if (!can('sessions')) return;
  qs('#edit-event').onclick = () => eventModal(event);
  qs('#hide-event').onclick = async () => {
    if (event.hidden) { revealModal(event, castells, reload); return; }
    if (await attempt(() => api('PUT', `/events/${event.id}/hidden`, { hidden: true }))) {
      toast(t('Sessió oculta als membres'));
      reload();
    }
  };
  qs('#del-event').onclick = async () => {
    if (!confirm(t("Segur que vols esborrar «{title}» amb els seus castells i l'assistència?", { title: event.title }))) return;
    if (await attempt(() => api('DELETE', `/events/${event.id}`))) { toast(t('Sessió esborrada')); location.hash = '#/'; }
  };

  const ff = qs('#field-form');
  ff.elements.kind.onchange = () => qs('#opts').classList.toggle('hidden', ff.elements.kind.value !== 'select');
  ff.onsubmit = async (e) => {
    e.preventDefault();
    if (await attempt(() => api('POST', `/events/${event.id}/fields`, formData(ff)))) { toast(t('Camp afegit')); reload(); }
  };
  qs('#role-form').onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (await attempt(() => api('POST', `/events/${event.id}/roles`, { label: d.label, person_id: Number(d.person_id) }))) reload();
  };
  qsa('[data-del-role]').forEach((b) => (b.onclick = async () => {
    if (await attempt(() => api('DELETE', `/events/${event.id}/roles/${b.dataset.delRole}`))) reload();
  }));
  qsa('[data-del-field]').forEach((b) => (b.onclick = async () => {
    if (!confirm(t('Esborrar aquest camp? Les respostes ja donades deixaran de mostrar-se.'))) return;
    if (await attempt(() => api('DELETE', `/fields/${b.dataset.delField}`))) reload();
  }));
}

// Persona temporal d'una sessió: només el nom és obligatori; les mides ajuden a revisar l'alineació.
export function guestModal(eventId, guest, onSaved) {
  const n = (name, label, unit, step = '1') => `<label class="field">${label} (${unit})<input name="${name}" type="number" min="${MEASURES[name][0]}" max="${MEASURES[name][1]}" step="${step}" inputmode="decimal" value="${guest?.[name] ?? ''}"></label>`;
  openModal(`${modalHead(guest ? esc(guest.name) : t('Nova persona temporal'))}
    <form id="guest-edit" class="stack">
      <label class="field">${t('Nom o malnom')}<input name="name" required maxlength="60" value="${esc(guest?.name)}" autocomplete="off"></label>
      <label class="field">${t('Colla (opcional)')}<input name="colla" maxlength="80" value="${esc(guest?.colla)}" placeholder="${t("p. ex. Castellers d'una altra vila")}"></label>
      <div class="form-grid">${n('shoulder_height_cm', t("Alçada d'espatlles"), 'cm')}${n('weight_kg', t('Pes'), 'kg', '0.1')}</div>
      <p class="small muted" style="margin:0">${t("Només es fa servir en aquesta sessió. No surt a la llista de persones ni compta a l'historial.")}</p>
      <div class="form-actions">${guest ? `<button type="button" class="btn danger" id="del-guest" style="margin-right:auto">${t('Esborra')}</button>` : ''}
        <button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${guest ? t('Desa') : t('Afegeix')}</button></div>
    </form>`, (m) => {
    qs('#guest-edit', m).onsubmit = async (e) => {
      e.preventDefault();
      const saved = await attempt(() => api(guest ? 'PUT' : 'POST', guest ? `/guests/${guest.id}` : `/events/${eventId}/guests`, formData(e.target)));
      if (saved) { closeModal(); onSaved(saved); }
    };
    qs('#del-guest', m)?.addEventListener('click', async () => {
      if (!confirm(t('Esborrar {name}? Es traurà de tots els castells d\'aquesta sessió.', { name: guest.name }))) return;
      if (await attempt(() => api('DELETE', `/guests/${guest.id}`))) { closeModal(); onSaved(null); }
    });
  });
}

// Afegir a la llista algú que ha vingut sense apuntar-se (o que encara no és a l'app).
