// Persones (administració), importar-ne d'un full de càlcul i perfil del membre.
import { download } from '../export.js';
import { IMPORT_FIELDS, guessField, readSpreadsheet, rowsToPeople } from '../import.js';
import { $app, INSTRUMENTS, MEASURES, SECTIONS, sectionLabel, age, api, attempt, can, canField, closeModal, esc, formData, fullName, icon, isAdmin, me,
  modalHead, norm, openModal, qs, qsa, render, setMe, shortName, store, t, tn, toast, todayIso } from './core.js';
import { switchPerson } from './shell.js';
import { personHistoryHtml } from './viewer.js';

// ---------- Persones ----------
function personFields(p = {}, { admin = false, isNew = false } = {}) {
  const n = (name, label, unit, step = '1') => `<label class="field">${label} (${unit})<input name="${name}" type="number" min="${MEASURES[name][0]}" max="${MEASURES[name][1]}" step="${step}" inputmode="decimal" value="${p[name] ?? ''}"></label>`;
  return `<div class="form-grid">
    <label class="field full">${t('Nom i cognoms')}<input name="name" required maxlength="100" value="${esc(p.name)}"></label>
    <p class="small muted full" style="margin:-4px 0 0">${t('El malnom és el que surt a la pinya i al tronc, i no es pot repetir. Si no en té, es mostra el nom i la inicial del cognom.')}</p>
    <label class="field">${t('Malnom')}<input name="alias" maxlength="40" value="${esc(p.alias)}" placeholder="${t('Com et coneixen a la colla')}"></label>
    <label class="field">${t('Data de naixement')}<input name="birthdate" type="date" min="1900-01-01" max="${todayIso()}" value="${esc(p.birthdate)}"></label>
    ${canField('phone') ? `<label class="field">${t('Telèfon')}<input name="phone" type="tel" maxlength="30" value="${esc(p.phone)}"></label>
    <label class="field">${t('Correu')}<input name="email" type="email" maxlength="120" value="${esc(p.email)}"></label>` : ''}
    <label class="field">${t('Músic/a')}<select name="instrument"><option value="">${t('No toca')}</option>${Object.entries(INSTRUMENTS).map(([v, l]) => `<option value="${v}" ${p.instrument === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field">${t('Grup')}<select name="section"><option value="">${t('Cap')}</option>${SECTIONS.map((v) => `<option value="${v}" ${p.section === v ? 'selected' : ''}>${sectionLabel(v)}</option>`).join('')}</select></label>
  </div>
  ${canField('weight_kg') ? `<fieldset style="margin-top:16px"><legend>${t('Mides')}</legend><div class="form-grid">
    ${n('height_cm', t('Alçada'), 'cm')}
    ${n('shoulder_height_cm', t("Alçada d'espatlles"), 'cm')}
    ${n('shoulder_width_cm', t("Amplada d'espatlles"), 'cm')}
    ${n('weight_kg', t('Pes'), 'kg', '0.1')}
  </div></fieldset>
  <label class="field" style="margin-top:12px">${t('Notes')}<textarea name="notes" maxlength="2000" placeholder="${t('Posicions habituals, lesions…')}">${esc(p.notes)}</textarea></label>` : ''}
  ${admin && !isNew ? `<label class="check" style="margin-top:12px"><input type="checkbox" name="active" ${p.active !== 0 ? 'checked' : ''}> ${t('Activa (desmarca-ho si ha deixat la colla)')}</label>` : ''}`;
}

let peopleSort = store.get('peopleSort', 'name');
const sectionOrder = (p) => (p.section ? SECTIONS.indexOf(p.section) : SECTIONS.length);

export async function pagePeople() {
  if (!isAdmin()) { location.hash = '#/'; return; }
  const { people, pastEvents, season } = await api('GET', '/people');
  const sorters = {
    name: (a, b) => b.active - a.active || a.name.localeCompare(b.name),
    height: (a, b) => (b.height_cm ?? -1) - (a.height_cm ?? -1),
    shoulder: (a, b) => (b.shoulder_height_cm ?? -1) - (a.shoulder_height_cm ?? -1),
    weight: (a, b) => (b.weight_kg ?? -1) - (a.weight_kg ?? -1),
    age: (a, b) => (age(b.birthdate) ?? -1) - (age(a.birthdate) ?? -1),
    attendance: (a, b) => b.attended - a.attended,
    music: (a, b) => (b.instrument || '').localeCompare(a.instrument || '') || a.name.localeCompare(b.name),
    section: (a, b) => sectionOrder(a) - sectionOrder(b) || a.name.localeCompare(b.name),
  };
  const sorted = [...people].sort(sorters[peopleSort] || sorters.name);
  const v = (x, unit = '') => (x != null ? `${x}${unit}` : '<span class="muted">—</span>');
  const measures = canField('weight_kg');

  $app.innerHTML = `
    <div class="page-head"><h1>${t('Persones')}</h1>
      <div class="actions">${can('import') ? `<button class="btn" id="import-people">${t('Importa des d\'un Excel')}</button>` : ''}<button class="btn primary" id="new-person">${icon.plus}${t('Nova persona')}</button></div></div>
    <div class="toolbar">
      <input type="search" id="people-q" placeholder="${t('Cerca…')}" style="max-width:280px">
      <label class="check small" style="margin-left:auto">${t('Ordena per')}
        <select id="people-sort" style="width:auto">
          <option value="name">${t('Nom')}</option>${measures ? `<option value="height">${t('Alçada')}</option><option value="shoulder">${t('Alçada espatlles')}</option>
          <option value="weight">${t('Pes')}</option>` : ''}<option value="age">${t('Edat')}</option><option value="attendance">${t('Assistència')}</option><option value="music">${t('Música')}</option><option value="section">${t('Grup')}</option>
        </select></label>
    </div>
    <div class="card"><div class="table-wrap"><table class="responsive" id="people-table">
      <thead><tr><th>${t('Malnom · Nom')}</th><th class="num">${t('Edat')}</th>${measures ? `<th class="num">${t('Alçada')}</th><th class="num">${t('Alç. esp.')}</th><th class="num">${t('Ampl. esp.')}</th><th class="num">${t('Pes')}</th>` : ''}<th class="num">${t('Assistència {year}', { year: season })}</th></tr></thead>
      <tbody>${sorted.map((p) => `<tr class="clickable ${p.active ? '' : 'inactive'}" data-id="${p.id}" data-name="${esc(norm(p.name + ' ' + (p.alias || '')))}">
        <td class="lead">${p.alias ? `<strong>${esc(p.alias)}</strong> <span class="muted">· ${esc(p.name)}</span>` : esc(p.name)}${p.instrument ? ` <span class="badge musics">${INSTRUMENTS[p.instrument]}</span>` : ''}${p.section ? ` <span class="badge section">${sectionLabel(p.section)}</span>` : ''}${p.active ? '' : ` <span class="small">(${t('inactiva')})</span>`}</td>
        <td class="num" data-l="${t('Edat')}">${v(age(p.birthdate))}</td>
        ${measures ? `<td class="num" data-l="${t('Alçada')}">${v(p.height_cm, ' cm')}</td>
        <td class="num" data-l="${t('Alç. esp.')}">${v(p.shoulder_height_cm, ' cm')}</td>
        <td class="num" data-l="${t('Ampl. esp.')}">${v(p.shoulder_width_cm, ' cm')}</td>
        <td class="num" data-l="${t('Pes')}">${v(p.weight_kg, ' kg')}</td>` : ''}
        <td class="num" data-l="${t('Assistència')}">${p.attended}${pastEvents ? ` <span class="muted small">(${Math.round((p.attended / pastEvents) * 100)}%)</span>` : ''}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted">${t("{n} persones actives. L'assistència és de la temporada {year}: sessions fins avui on la persona ha vingut, de {total}.", { n: people.filter((p) => p.active).length, year: season, total: pastEvents })}</p></div>`;

  const sort = qs('#people-sort');
  sort.value = peopleSort;
  if (!sort.value) sort.value = 'name';
  sort.onchange = () => { peopleSort = sort.value; store.set('peopleSort', peopleSort); render(); };
  qs('#people-q').oninput = (e) => {
    const q = norm(e.target.value.trim());
    qsa('#people-table tbody tr').forEach((tr) => tr.classList.toggle('hidden', q && !tr.dataset.name.includes(q)));
  };
  qs('#new-person').onclick = () => personModal();
  qs('#import-people')?.addEventListener('click', () => importModal());
  qsa('#people-table tbody tr').forEach((tr) => (tr.onclick = () => personModal(people.find((p) => String(p.id) === tr.dataset.id))));
}

// ---------- Importar persones d'un full de càlcul ----------
const importFieldLabel = (f) => ({
  name: t('Nom i cognoms'), surname: t('Cognoms'), alias: t('Malnom'), email: t('Correu'), phone: t('Telèfon'),
  birthdate: t('Data de naixement'), height_cm: t('Alçada'), shoulder_height_cm: t("Alçada d'espatlles"),
  shoulder_width_cm: t("Amplada d'espatlles"), weight_kg: t('Pes'), notes: t('Notes'), instrument: t('Músic/a'),
}[f]);

function importModal() {
  let rows = null, fields = [], fileName = '';
  const template = () => {
    const header = ['Nom', 'Cognoms', 'Malnom', 'Correu', 'Telèfon', 'Data de naixement', 'Alçada', "Alçada d'espatlles", "Amplada d'espatlles", 'Pes', 'Notes'];
    const example = ['Maria', 'Puig Soler', 'Pruna', 'maria@exemple.cat', '600000000', '15/06/1990', '165', '138', '40', '58', ''];
    // Les mides i les notes (les darreres columnes) només es demanen a qui les pot desar.
    const columns = canField('weight_kg') ? header.length : header.indexOf('Alçada');
    download(new Blob(['\uFEFF' + [header, example].map((r) => r.slice(0, columns).map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\r\n')], { type: 'text/csv' }), 'persones.csv');
  };
  const draw = (m) => {
    const body = qs('#import-body', m);
    if (!rows) {
      body.innerHTML = `<p class="muted" style="margin-top:0">${t("Tria un fitxer d'Excel (.xlsx) o CSV amb una persona per fila. La primera fila han de ser els títols de les columnes (Nom, Cognoms, Malnom, Alçada…).")}</p>
        <label class="field">${t('Fitxer')}<input type="file" id="import-file" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
        <p class="small muted">${t('Pots començar per la plantilla:')} <button type="button" class="btn sm" id="import-template">${t('Descarrega la plantilla')}</button></p>
        <div class="error" id="import-error"></div>`;
      qs('#import-template', m).onclick = template;
      qs('#import-file', m).onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const all = await readSpreadsheet(file);
          if (all.length < 2) throw new Error(t('El fitxer no té cap persona'));
          fileName = file.name;
          fields = all[0].map(guessField);
          // Una columna per camp: si dues s'assemblen al mateix, la segona no s'importa (tret de nom i cognoms).
          fields = fields.map((f, i) => (f && f !== 'surname' && fields.indexOf(f) !== i ? '' : f));
          rows = all;
          draw(m);
        } catch (err) {
          qs('#import-error', m).textContent = err.message && !['zip', 'xlsx'].includes(err.message) ? err.message : t("No s'ha pogut llegir el fitxer. Desa'l com a Excel (.xlsx) o CSV.");
        }
      };
      return;
    }
    const [header, ...data] = rows;
    const options = (sel) => `<option value="">${t('No importar')}</option>${IMPORT_FIELDS.filter((f) => f === 'surname' || canField(f)).map((f) => `<option value="${f}" ${f === sel ? 'selected' : ''}>${importFieldLabel(f)}</option>`).join('')}`;
    body.innerHTML = `<p class="muted" style="margin-top:0"><strong>${esc(fileName)}</strong> · ${tn(data.length, '{n} persona', '{n} persones')}. ${t('Comprova quin camp és cada columna.')}</p>
      <div class="table-wrap"><table class="import-map"><thead><tr><th>${t('Columna')}</th><th>${t('Exemple')}</th><th>${t('Camp')}</th></tr></thead>
        <tbody>${header.map((h, i) => `<tr><td>${esc(h) || `<span class="muted">${i + 1}</span>`}</td>
          <td class="muted small">${esc(data.find((r) => r[i])?.[i] ?? '')}</td>
          <td><select data-col="${i}">${options(fields[i])}</select></td></tr>`).join('')}</tbody></table></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="import-update"> ${t('Si una persona ja hi és (mateix nom), actualitza-la amb les dades del fitxer')}</label>
      <div id="import-result" style="margin-top:12px"></div>
      <div class="form-actions"><button type="button" class="btn" id="import-again" style="margin-right:auto">${t('Un altre fitxer')}</button>
        <button type="button" class="btn" data-close>${t('Cancel·la')}</button><button type="button" class="btn primary" id="import-go">${t('Comprova')}</button></div>`;
    let checked = null;
    const reset = () => { checked = null; qs('#import-go', m).textContent = t('Comprova'); qs('#import-result', m).innerHTML = ''; };
    qsa('select[data-col]', m).forEach((s) => (s.onchange = () => { fields[Number(s.dataset.col)] = s.value; reset(); }));
    qs('#import-update', m).onchange = reset;
    qs('#import-again', m).onclick = () => { rows = null; draw(m); };
    qs('#import-go', m).onclick = async () => {
      if (!fields.includes('name')) { toast(t('Tria quina columna és el nom'), true); return; }
      const people = rowsToPeople(data, fields);
      const update = qs('#import-update', m).checked;
      const go = qs('#import-go', m);
      go.disabled = true;
      const r = await attempt(() => api('POST', '/people/import', { people, update, check: !checked }));
      go.disabled = false;
      if (!r) return;
      if (r.done) {
        closeModal();
        toast(t('Importat: {a} noves, {b} actualitzades', { a: r.create, b: r.update }));
        render();
        return;
      }
      const out = qs('#import-result', m);
      if (r.errorCount) {
        out.innerHTML = `<div class="import-errors"><strong>${tn(r.errorCount, '{n} fila té errors. Corregeix el fitxer i torna-ho a provar:', '{n} files tenen errors. Corregeix el fitxer i torna-ho a provar:')}</strong>
          <ul>${r.errors.map((e) => `<li>${t('Fila {n}', { n: e.index + 2 })}: ${esc(e.error)}</li>`).join('')}</ul>
          ${r.errorCount > r.errors.length ? `<p class="small muted">${t('+{n} més', { n: r.errorCount - r.errors.length })}</p>` : ''}</div>`;
        return;
      }
      checked = r;
      out.innerHTML = `<div class="import-ok">${[tn(r.create, "S'afegirà {n} persona nova", "S'afegiran {n} persones noves"),
        r.update ? tn(r.update, "s'actualitzarà {n} que ja hi era", "s'actualitzaran {n} que ja hi eren") : '',
        r.skip ? tn(r.skip, '{n} ja hi era i no es toca', '{n} ja hi eren i no es toquen') : ''].filter(Boolean).join(' · ')}</div>`;
      go.textContent = r.create + r.update ? t('Importa') : t('Tanca');
      if (!(r.create + r.update)) go.onclick = closeModal;
    };
  };
  openModal(`${modalHead(t('Importa persones'))}<div id="import-body"></div>`, draw);
}

function personModal(person) {
  openModal(`${modalHead(person ? esc(fullName(person)) : t('Nova persona'))}
    <form id="person-form">${personFields(person, { admin: true, isNew: !person })}
      <div class="form-actions">${person && can('admin') ? `<button type="button" class="btn danger" id="del-person" style="margin-right:auto">${t('Esborra')}</button>` : ''}
        <button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${person ? t('Desa') : t('Crea')}</button></div>
    </form>
    ${person ? `<fieldset style="margin-top:18px"><legend>${t('Historial de posicions')}</legend><div id="person-history" class="muted small">${t('Carregant…')}</div>
      <a class="btn sm" href="#/estadistiques/persona/${person.id}" style="margin-top:12px">${icon.chart}${t('Estadístiques')}</a></fieldset>
      ${can('admin') ? `<fieldset style="margin-top:12px"><legend>${t('Protecció de dades')}</legend>
        <p class="small muted" style="margin:0 0 8px">${t("Si ho demana, pots donar-li totes les seves dades en un fitxer: fitxa, assistència, respostes, posicions i acompanyants.")}</p>
        <a class="btn sm" href="/api/people/${person.id}/export" download>${t('Descarrega les seves dades')}</a></fieldset>` : ''}` : ''}`, (m) => {
    if (person) {
      api('GET', `/people/${person.id}/history`)
        .then((h) => { const el = qs('#person-history', m); if (el) { el.className = ''; el.innerHTML = personHistoryHtml(h); } })
        .catch(() => {});
    }
    qs('#person-form', m).onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (await attempt(() => api(person ? 'PUT' : 'POST', person ? `/people/${person.id}` : '/people', d))) {
        closeModal(); toast(person ? t('Desat') : t('Persona creada')); render({ keepScroll: true });
      }
    };
    qs('#del-person', m)?.addEventListener('click', async () => {
      if (!confirm(t("Esborrar definitivament {name}? Es perdrà el seu historial d'assistència i les posicions. (Si només ha deixat la colla, millor desmarca «Activa».)", { name: person.name }))) return;
      if (await attempt(() => api('DELETE', `/people/${person.id}`))) { closeModal(); render(); }
    });
  });
}

// ---------- Perfil ----------
export async function pageProfile() {
  if (isAdmin()) { location.hash = '#/comptes'; return; }
  setMe(await api('GET', '/me'));
  const history = await api('GET', `/people/${me.id}/history`);
  const historyCard = `<div class="card">
        <h2 style="margin-bottom:12px">${t('El meu historial de posicions')}</h2>
        ${personHistoryHtml(history)}
        <a class="btn sm" href="#/estadistiques/persona/${me.id}" style="margin-top:12px">${icon.chart}${t('Les meves estadístiques')}</a>
      </div>`;

  // Els membres entren sense contrasenya: per privacitat, aquí no hi surt cap dada personal.
  $app.innerHTML = `
    <div class="page-head"><h1>${esc(shortName(me))}</h1>
      <div class="actions"><button class="btn sm" id="not-me">${icon.swap}${t('No sóc jo')}</button></div></div>
    <div class="grid-2">
      <div class="card">
        <h2 style="margin-bottom:12px">${t('El meu perfil')}</h2>
        <div class="data-row"><span class="muted">${t('Com et veuen els altres')}</span><strong>${esc(shortName(me))}</strong></div>
        ${me.instrument ? `<div class="data-row"><span class="muted">${t('Músic/a')}</span><strong>${INSTRUMENTS[me.instrument]}</strong></div>` : ''}
        ${me.section ? `<div class="data-row"><span class="muted">${t('Grup')}</span><strong>${sectionLabel(me.section)}</strong></div>` : ''}
        <p class="small muted" style="margin-bottom:0">${t("Per privacitat, a l'app només es veuen els malnoms. Les dades personals (nom, mides, contacte…) només les veuen els administradors; si cal canviar-ne alguna, demana-ho a un administrador.")}</p>
      </div>
      ${historyCard}
    </div>`;
  qs('#not-me').onclick = switchPerson;
}
