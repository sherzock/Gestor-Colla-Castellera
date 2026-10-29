// Detall d'una sessió: respostes, assistència, persones temporals, acompanyants i exportació.
import { buildStructure, castellName } from '../castell.js';
import { boxShort } from '../editor.js';
import { castellPng, download, fileSafe, xlsx } from '../export.js';
import { calendarCode } from './calendar.js';
import { castellModal } from './castell-form.js';
import { $app, INSTRUMENTS, MEASURES, api, attempt, closeModal, copyText, esc, fmtDeadline, fmtLong, formData,
  fullName, hiddenBadge, hiddenToggle, icon, isAdmin, lang, me, modalHead, norm, openModal, partialLabel, qs, qsa,
  render, resultLabel, resultPill, shortName, statusLabel, statusPill, t, time, tn, toast, todayIso, typeBadge } from './core.js';
import { eventModal } from './sessions.js';
import { STATUS_ORDER, assignedName } from './viewer.js';

// ---------- Detall de sessió ----------
function fieldInput(f, value, prefix = 'x') {
  const name = `${prefix}${f.id}`;
  const req = f.required ? ' *' : '';
  if (f.kind === 'bool') return `<label class="check"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}> ${esc(f.label)}${req}</label>`;
  if (f.kind === 'select') {
    return `<label class="field">${esc(f.label)}${req}<select name="${name}"><option value="">—</option>${f.options.map((o) => `<option ${value === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  }
  const type = f.kind === 'number' ? 'number" min="0" max="100000" step="1" inputmode="numeric' : 'text" maxlength="300';
  return `<label class="field">${esc(f.label)}${req}<input type="${type}" name="${name}" value="${esc(value)}"></label>`;
}
function readExtra(form, fields, prefix = 'x') {
  const out = {};
  for (const f of fields) {
    const el = form.elements[`${prefix}${f.id}`];
    out[f.id] = f.kind === 'bool' ? el.checked : el.value;
  }
  return out;
}
// Acompanyants: quants i, si es vol, el nom de cadascun (si no, «Acompanyant de …»). El màxim és el del servidor.
const MAX_COMPANIONS = 6;
function companionsInput(list = []) {
  return `<div class="companions" data-companions>
    <label class="field">${t('Acompanyants')}<input type="number" name="companions_n" min="0" max="${MAX_COMPANIONS}" step="1" inputmode="numeric" value="${list.length}"></label>
    <div class="comp-names">${list.map((name, i) => companionName(name, i)).join('')}</div>
    <p class="small muted" style="margin:0">${t('La tècnica els podrà col·locar als castells. El nom és opcional.')}</p>
  </div>`;
}
const companionName = (name, i) => `<input name="comp${i}" maxlength="60" value="${esc(name)}" placeholder="${t('Nom de l\'acompanyant {n} (opcional)', { n: i + 1 })}">`;
function bindCompanions(root) {
  const box = qs('[data-companions]', root);
  if (!box) return;
  const n = box.querySelector('[name=companions_n]');
  n.oninput = () => {
    const want = Math.max(0, Math.min(MAX_COMPANIONS, Math.floor(Number(n.value) || 0)));
    const names = qs('.comp-names', box);
    const now = [...names.children];
    for (let i = now.length; i < want; i++) names.insertAdjacentHTML('beforeend', companionName('', i));
    now.slice(want).forEach((el) => el.remove());
  };
}
const readCompanions = (form) => [...form.querySelectorAll('.comp-names input')].map((el) => el.value.trim());
// Els noms automàtics («Acompanyant de …») no es tornen a mostrar a la casella: el nom és opcional.
const ownCompanionNames = (list) => list.filter((g) => !g.dropped).map((g) => (/^Acompanyant d(e |')/.test(g.name) ? '' : g.name));

function extraValue(f, v) {
  if (v === null || v === undefined || v === '') return '';
  if (f.kind === 'bool') return v ? t('Sí') : t('No');
  return esc(v);
}

// Excel de la sessió: una pestanya amb l'assistència (les mateixes columnes que el CSV) i una per castell, amb qui hi
// ha a cada posició i la imatge del castell (tronc, pom de dalt i pinya).
async function exportSession(event, castells, button) {
  button.disabled = true;
  const label = button.textContent;
  button.textContent = t('Preparant…');
  try {
    // L'assistència i les alineacions es demanen alhora; les imatges es dibuixen després, una rere l'altra.
    const [table, details] = await Promise.all([
      api('GET', `/events/${event.id}/attendance`),
      Promise.all(castells.map((c) => api('GET', `/castells/${c.id}`))),
    ]);
    const sheets = [{ name: t('Assistència'), rows: [table.columns, ...table.rows], header: true }];
    for (const [i, { castell, positions }] of details.entries()) {
      const s = buildStructure(castell);
      const byKey = new Map(positions.filter((p) => s.positions.has(p.pos_key)).map((p) => [p.pos_key, p]));
      const extra = [castell.label, partialLabel(castell), resultLabel(castell.result)].filter(Boolean).join(' · ');
      const title = `${s.name}${castell.label ? ` · ${castell.label}` : ''}`;
      const subtitle = `${event.title} · ${fmtLong(event.date)}${extra ? ` · ${extra}` : ''} · ${t('{a}/{b} posicions cobertes', { a: byKey.size, b: s.positions.size })}`;
      const image = await castellPng({ s, byKey, nameOf: assignedName, title, subtitle,
        labels: { tronc: t('Tronc i pom de dalt'), musica: t('Música'), short: boxShort } });
      // Qui hi ha a cada posició, de baix a dalt i després la música i la pinya (per buscar-hi o imprimir-ho).
      const who = (key) => (byKey.has(key) ? assignedName(byKey.get(key), false) : '');
      const list = [
        ...s.levels.flatMap((l) => l.cells), ...s.agulla, ...s.musica,
      ].map((p) => [p.role, who(p.key)]);
      for (const layer of s.layers) {
        for (const item of layer.items.filter((x) => !x.shared && !x.off)) list.push([`${layer.label} · ${item.role}`, who(item.key)]);
      }
      sheets.push({
        name: `${i + 1} ${s.name}${castell.label ? ` ${castell.label}` : ''}`,
        rows: [[title], [subtitle], [], [t('Posició'), t('Persona')], ...list],
        bold: [0, 3], widths: [30, 28, 3],
        image: { data: image, col: 3, row: 0, maxWidth: 1000 },
      });
    }
    download(xlsx(sheets), `sessio-${event.date}-${fileSafe(event.title)}.xlsx`);
  } catch (err) {
    toast(err.message, true);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

export async function pageEvent(id) {
  const { event, fields, castells, mine, attendance, counts, guests = [], forecast } = await api('GET', `/events/${id}`);
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
    const chip = (a) => `<span class="${a.id === me.id ? 'me' : ''}">${esc(shortName(a))}</span>`;
    const groups = [...Object.entries(INSTRUMENTS), [null, t('Altres')]]
      .map(([k, l]) => [l, list.filter((a) => (a.instrument || null) === k)])
      .filter(([, xs]) => xs.length);
    return groups.map(([l, xs]) => `<h3 class="instr-h">${l} · ${xs.length}</h3><div class="names">${xs.map(chip).join('')}</div>`).join('');
  };

  const castellCards = castells.map((c) => {
    const total = buildStructure(c).positions.size;
    const pct = Math.round((c.assigned_count / total) * 100);
    return `<a class="castell-card ${c.hidden ? 'is-hidden' : ''}" href="#/castell/${c.id}">
      <div class="name">${castellName(c)}${c.hidden ? ` ${hiddenBadge(t('Ocult'))}` : ''}</div>
      <div class="sub">${esc(c.label || '')} ${resultPill(c.result)}</div>
      <div class="meter" title="${c.assigned_count} / ${total}"><div style="width:${pct}%"></div></div>
      <div class="small muted" style="margin-top:4px">${t('{a}/{b} posicions', { a: c.assigned_count, b: total })}</div>
    </a>`;
  }).join('');

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
        ${instrumentCounts}
        ${totals.map((x) => `<span class="status none">${esc(x.f.label)}: ${x.sum}</span>`).join('')}
      </div>
      ${passList ? `<p class="small muted" style="margin:0 0 8px">${t('Qui havia dit «Vinc» compta com a present. Toca «Ha vingut» per marcar qui no ha vingut, o afegeix qui ha vingut sense apuntar-se.')}</p>` : ''}
      <input type="search" id="att-search" placeholder="${t('Cerca persona…')}" style="margin-bottom:6px">
      <div class="table-wrap"><table class="responsive" id="att-table">
        <thead><tr><th>${t('Nom')}</th><th>${t('Estat')}</th>${passList ? `<th>${t('Ha vingut')}</th>` : ''}${event.escoleta ? `<th>${t('Escoleta')}</th>` : ''}${event.ask_companions ? `<th>${t('Acompanyants')}</th>` : ''}${fields.map((f) => `<th>${esc(f.label)}</th>`).join('')}<th>${t('Comentari')}</th></tr></thead>
        <tbody>${sortedAttendance.map((a) => `<tr data-id="${a.id}" data-name="${esc(norm(a.name + ' ' + (a.alias || '')))}" class="${passList && !a.present ? 'not-present' : ''}">
          <td class="lead">${esc(fullName(a))}${a.instrument ? ` <span class="badge musics">${INSTRUMENTS[a.instrument]}</span>` : ''}</td>
          <td><select data-act="status" aria-label="${t('Estat')}">${['', 'si', 'no'].map((s) => `<option value="${s}" ${(a.status || '') === s ? 'selected' : ''}>${s ? statusLabel(s) : '—'}</option>`).join('')}</select></td>
          ${cameCell(a)}
          ${event.escoleta ? `<td data-l="${t('Escoleta')}">${escValue(a.escoleta)}</td>` : ''}
          ${event.ask_companions ? `<td data-l="${t('Acompanyants')}" class="small">${a.companions.length ? `<strong>${a.companions.length}</strong> · ${esc(a.companions.join(', '))}` : ''}</td>` : ''}
          ${fields.map((f) => `<td data-l="${esc(f.label)}">${extraValue(f, a.extra?.[f.id])}</td>`).join('')}
          <td data-l="${t('Comentari')}" class="small">${esc(a.comment)}</td>
        </tr>`).join('')}</tbody>
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
        : isMusics ? namesByInstrument(attendance)
        : `<div class="names">${attendance.map((a) => `<span class="${a.id === me.id ? 'me' : ''}">${esc(shortName(a))}</span>`).join('')}</div>`}
    </div>`;

  const guestsCard = admin && !isMusics ? `
    <div class="card">
      <div class="card-head"><h2>${t('Persones temporals')}</h2>
        <div class="actions"><button class="btn sm" id="add-guest">${icon.plus}${t('Afegeix')}</button></div></div>
      <p class="small muted" style="margin-top:-6px">${t("Gent que no és de la colla (d'una altra colla, de prova…). Es poden col·locar a qualsevol castell d'aquesta sessió i no compten a l'historial ni a les estadístiques.")}</p>
      <div class="field-list">${guests.map((g) => `<div class="field-row"><div>
          <div>${esc(g.name)}${g.colla ? ` <span class="muted small">· ${esc(g.colla)}</span>` : ''}${g.companion_of && !/^Acompanyant d(e |')/.test(g.name) ? ` <span class="muted small">· ${t('acompanya {name}', { name: esc(g.companion_of_name) })}</span>` : ''}${g.companion_dropped ? ` <span class="status no">${t('Ja no ve')}</span>` : ''}</div>
          <div class="k">${[g.shoulder_height_cm ? `${t('esp.')} ${g.shoulder_height_cm} cm` : null, g.weight_kg ? `${g.weight_kg} kg` : null,
            g.placed ? tn(g.placed, 'A {n} castell', 'A {n} castells') : t('Encara sense posició')].filter(Boolean).join(' · ')}</div></div>
        <button class="btn ghost sm" style="margin-left:auto" data-edit-guest="${g.id}">${t('Edita')}</button></div>`).join('')
        || `<div class="muted small">${t('Cap persona temporal.')}</div>`}</div>
    </div>` : '';

  const fieldsCard = admin ? `
    <div class="card">
      <div class="card-head"><h2>${t('Camps extra')}</h2></div>
      <p class="small muted" style="margin-top:-6px">${t('Preguntes addicionals que cada persona respon en confirmar (acompanyants, dinar, autocar…).')}</p>
      <div class="field-list">${fields.map((f) => `<div class="field-row"><div><div>${esc(f.label)}${f.required ? ' *' : ''}</div>
        <div class="k">${{ number: t('Número'), text: t('Text'), bool: t('Sí / No'), select: t('Llista') + ': ' + esc(f.options.join(', ')) }[f.kind]}</div></div>
        <button class="btn ghost sm danger" style="margin-left:auto" data-del-field="${f.id}">${t('Esborra')}</button></div>`).join('') || `<div class="muted small">${t('Cap camp extra.')}</div>`}</div>
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
        <div class="meta"><span>${icon.calendar}${fmtLong(event.date)}</span>${time(event) ? `<span>${icon.clock}${time(event)}</span>` : ''}${event.location ? `<span>${icon.pin}${esc(event.location)}</span>` : ''}${event.escoleta ? `<span class="badge escoleta">${t('Escoleta')}${escTime}</span>` : ''}</div>
      </div>
      <div class="actions">
        ${event.date >= todayIso() && !event.hidden ? `<a class="btn sm" href="/api/calendar.ics?event=${event.id}${calendarCode('&')}" download>${icon.calAdd}${t('Al meu calendari')}</a>` : ''}
        ${admin ? `${hiddenToggle(event.hidden, 'hide-event')}<button class="btn sm" id="edit-event">${t('Edita')}</button><button class="btn sm danger" id="del-event">${t('Esborra')}</button>` : ''}
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
          </div>
          <label class="field" style="margin-top:14px">${t('Comentari (opcional)')}<input name="comment" maxlength="300" value="${esc(mine?.comment)}" placeholder="${t('Arribaré tard, porto la canalla…')}"></label>
          ${event.rsvp_open ? `<div class="form-actions"><button class="btn primary" ${status || escoleta !== null ? '' : 'disabled'} id="rsvp-save">${t('Desa')}</button></div>` : ''}
        </form>`}
        ${isMusics ? '' : `<div class="card">
          <div class="card-head"><h2>${t('Castells')}</h2>
            ${admin ? `<div class="actions"><button class="btn sm primary" id="add-castell">${icon.plus}${t('Afegeix castell')}</button></div>` : ''}
          </div>
          ${castells.length ? `<div class="castell-list">${castellCards}</div>` : `<p class="muted small">${t('Encara no hi ha castells programats.')}</p>`}
        </div>`}
        ${guestsCard}
        ${fieldsCard}
      </div>
      <div class="stack">${forecastCard}${admin ? answersCard(event, attendance) : ''}${adminTable}</div>
    </div>`;

  // Confirmació pròpia
  const form = qs('#rsvp-form');
  if (form && !event.rsvp_open) qsa('input, select, textarea, button', form).forEach((el) => (el.disabled = true));
  if (form && event.rsvp_open) {
  bindCompanions(form);
  qsa('#rsvp-main button', form).forEach((b) => (b.onclick = () => {
    status = b.dataset.v;
    qsa('#rsvp-main button', form).forEach((x) => x.classList.toggle('on', x === b));
    qs('#extras').classList.toggle('hidden', status === 'no');
    qs('#rsvp-save').disabled = false;
  }));
  qsa('#rsvp-esc button', form).forEach((b) => (b.onclick = () => {
    escoleta = b.dataset.v === 'si';
    qsa('#rsvp-esc button', form).forEach((x) => x.classList.toggle('on', x === b));
    qs('#rsvp-save').disabled = false;
  }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = { comment: form.elements.comment.value };
    if (status) { body.status = status; body.extra = status === 'no' ? {} : readExtra(form, fields); }
    if (event.ask_companions && status === 'si') body.companions = readCompanions(form);
    if (event.escoleta) body.escoleta = escoleta;
    if (await attempt(() => api('PUT', `/events/${event.id}/attendance`, body))) {
      toast(t('Assistència desada'));
      render({ keepScroll: true });
    }
  };
  }

  if (!admin) return;
  bindAnswersCard(event, attendance);
  qs('#add-guest')?.addEventListener('click', () => guestModal(event.id, null, () => render({ keepScroll: true })));
  qsa('[data-edit-guest]').forEach((b) => (b.onclick = () => guestModal(event.id, guests.find((g) => String(g.id) === b.dataset.editGuest), () => render({ keepScroll: true }))));
  const reload = () => render({ keepScroll: true });
  qs('#edit-event').onclick = () => eventModal(event);
  qs('#hide-event').onclick = async () => {
    if (await attempt(() => api('PUT', `/events/${event.id}/hidden`, { hidden: !event.hidden }))) {
      toast(event.hidden ? t('Ara els membres ja la veuen') : t('Sessió oculta als membres'));
      reload();
    }
  };
  qs('#del-event').onclick = async () => {
    if (!confirm(t("Segur que vols esborrar «{title}» amb els seus castells i l'assistència?", { title: event.title }))) return;
    if (await attempt(() => api('DELETE', `/events/${event.id}`))) { toast(t('Sessió esborrada')); location.hash = '#/'; }
  };
  qs('#add-castell')?.addEventListener('click', () => castellModal(event.id));
  qs('#add-walkin')?.addEventListener('click', () => walkinModal(event, attendance, reload));
  qs('#export-xlsx')?.addEventListener('click', (e) => exportSession(event, castells, e.currentTarget));

  const ff = qs('#field-form');
  ff.elements.kind.onchange = () => qs('#opts').classList.toggle('hidden', ff.elements.kind.value !== 'select');
  ff.onsubmit = async (e) => {
    e.preventDefault();
    if (await attempt(() => api('POST', `/events/${event.id}/fields`, formData(ff)))) { toast(t('Camp afegit')); reload(); }
  };
  qsa('[data-del-field]').forEach((b) => (b.onclick = async () => {
    if (!confirm(t('Esborrar aquest camp? Les respostes ja donades deixaran de mostrar-se.'))) return;
    if (await attempt(() => api('DELETE', `/fields/${b.dataset.delField}`))) reload();
  }));

  qs('#att-search').oninput = (e) => {
    const q = norm(e.target.value.trim());
    qsa('#att-table tbody tr').forEach((tr) => tr.classList.toggle('hidden', q && !tr.dataset.name.includes(q)));
  };
  qsa('#att-table tbody tr').forEach((tr) => {
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
function pendingPeople(event, attendance) {
  return attendance.filter((a) => !a.status && (event.type !== 'musics' || a.instrument))
    .sort((a, b) => shortName(a).localeCompare(shortName(b)));
}

// Missatge per enganxar al grup de WhatsApp: un recordatori general, sense dir qui falta (ningú queda assenyalat
// davant de tot el grup; la llista de qui falta només la veu l'administració).
function reminderText(event) {
  const when = `${fmtLong(event.date)}${event.start_time ? ` · ${event.start_time}` : ''}`;
  return [
    `📣 ${event.title} · ${when}`,
    t("Si encara no heu dit si veniu, digueu-ho a l'app:"),
    `${location.origin}/#/sessio/${event.id}`,
    event.rsvp_until ? t('Podeu respondre fins al {when}.', { when: fmtDeadline(event.rsvp_until) }) : null,
    t('Gràcies!'),
  ].filter(Boolean).join('\n');
}

function answersCard(event, attendance) {
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
      <div class="names">${pending.map((a) => `<span>${esc(shortName(a))}</span>`).join('')}</div>
      ${event.hidden ? `<p class="small muted" style="margin:8px 0 0">${t('Quan la mostris als membres, podràs enviar el recordatori per WhatsApp.')}</p>` : `<div class="share-row">
        <a class="btn sm primary" id="wa-send" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(reminderText(event))}">${icon.share}${t('Envia per WhatsApp')}</a>
        <button class="btn sm" id="copy-reminder">${icon.copy}${t('Copia el missatge')}</button>
      </div>
      <p class="small muted" style="margin:8px 0 0">${t('El missatge és un recordatori general per al grup, sense noms, amb l\'enllaç a la sessió.')}</p>`}`
    : `<div class="all-answered" style="margin:0">${icon.check}${t('Tothom ha contestat.')}</div>`}
  </div>`;
}

function bindAnswersCard(event, attendance) {
  qs('#copy-reminder')?.addEventListener('click', () => copyText(reminderText(event)));
  qs('#toggle-rsvp')?.addEventListener('click', async () => {
    if (event.rsvp_open && !confirm(t('Tancar les respostes? Els membres ja no podran canviar si vénen o no.'))) return;
    if (await attempt(() => api('POST', `/events/${event.id}/rsvp`, { open: !event.rsvp_open }))) {
      toast(event.rsvp_open ? t('Respostes tancades') : t('Respostes obertes'));
      render({ keepScroll: true });
    }
  });
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
function walkinModal(event, attendance, reload) {
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
    <input type="search" id="walk-q" placeholder="${t('Cerca per nom o malnom…')}" autocomplete="off">
    <div class="people-pick" id="walk-list">${absent.map((a) => `<button data-pid="${a.id}" data-name="${esc(norm(a.name + ' ' + (a.alias || '')))}">
      <span class="nm">${esc(fullName(a))}</span>${statusPill(a.status)}</button>`).join('') || `<p class="muted">${t('Tothom ja consta com a present.')}</p>`}</div>
    <form id="walk-new" class="pick-bar">
      <input name="name" maxlength="60" placeholder="${t("No és a l'app? Escriu nom i cognoms")}" autocomplete="off">
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
