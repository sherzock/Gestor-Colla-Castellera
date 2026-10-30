// Formulari per crear o editar un castell.
import { RESULTS, WIDTHS, buildStructure, castellName, levelNames, levelRange, templateOf, templateRings } from '../castell.js';
import { api, attempt, closeModal, day, esc, fmt, formData, icon, modalHead, openModal, qs, render, resultLabel, t } from './core.js';

// ---------- Formulari de castell ----------
export function castellModal(eventId, castell, onLost) {
  const c = castell || { width: 3, height: 7, agulla: 0, folre: 0, manilles: 0, cordons: 4, gralles: 0, timbals: 0, result: 'previst', hidden: 1 };
  openModal(`${modalHead(castell ? t('Edita el castell') : t('Nou castell'))}
    <form id="castell-form">
      <div class="castell-title" id="cname" style="text-align:center;margin-bottom:12px">${castellName(c)}</div>
      <div class="copy-from hidden" id="copy-wrap">
        <label class="field">${t('Omple-ho com un castell anterior')}<select name="copy_from"></select></label>
        <p class="small muted" style="margin:0" id="copy-note">${castell ? t("Es substituirà l'alineació actual per la del castell triat.") : t("Es copiaran les persones de cada posició, els cordons i la música.")}</p>
      </div>
      <div class="form-grid">
        <label class="field">${t('Persones per pis')}<select name="width">${WIDTHS.map((w) => `<option value="${w.value}" ${Number(c.width) === w.value ? 'selected' : ''}>${w.label}</option>`).join('')}</select></label>
        <label class="field">${t('Pisos')}<input name="height" type="number" min="3" max="11" value="${c.height}" required></label>
        <label class="field">${t('Cordons (persones per línia)')}<input name="cordons" type="number" min="0" max="8" value="${c.cordons}"><span class="small muted hidden" id="cordons-tpl"></span></label>
        <label class="check" id="ag-wrap"><input type="checkbox" name="agulla" ${c.agulla ? 'checked' : ''}> ${t('Amb agulla (pilar central)')}</label>
        <label class="check"><input type="checkbox" name="folre" ${c.folre ? 'checked' : ''}> ${t('Folre')}</label>
        <label class="check"><input type="checkbox" name="manilles" ${c.manilles ? 'checked' : ''}> ${t('Manilles')}</label>
        <label class="check"><input type="checkbox" name="puntals" ${c.puntals ? 'checked' : ''}> ${t('Puntals')}</label>
        <label class="check"><input type="checkbox" name="sota" ${c.sota ? 'checked' : ''}> ${t('Aixecat per sota')}</label>
      </div>
      <fieldset style="margin-top:14px"><legend>${t('Prova')}</legend>
        <p class="small muted" style="margin:-4px 0 8px">${t('Als assajos: castell net (el tronc aguanta sol, sense pinya) o només una part del castell.')}</p>
        <div class="form-grid">
          <label class="check"><input type="checkbox" name="net" ${c.net ? 'checked' : ''}> ${t('Net (sense pinya)')}</label>
          <label class="check"><input type="checkbox" name="partial" ${levelRange(c).partial ? 'checked' : ''}> ${t('Parcial (només alguns pisos)')}</label>
        </div>
        <div class="form-grid partial-range" id="partial-range">
          <label class="field">${t('Des del pis')}<select name="from_level"></select></label>
          <label class="field">${t('Fins al pis')}<select name="to_level"></select></label>
          <p class="small muted full" style="margin:0">${t('El nom del castell no canvia. Només es treuen pisos del tronc: la pinya, el folre i les manilles hi són igual.')}</p>
        </div>
      </fieldset>
      <fieldset style="margin-top:14px"><legend>${icon.music} ${t('Música')}</legend>
        <p class="small muted" style="margin:-4px 0 8px">${t('Músics que toquen durant el castell (normalment a les diades).')}</p>
        <div class="form-grid">
          <label class="field">${t('Gralles')}<input name="gralles" type="number" min="0" max="12" value="${c.gralles || 0}"></label>
          <label class="field">${t('Timbals')}<input name="timbals" type="number" min="0" max="12" value="${c.timbals || 0}"></label>
        </div>
      </fieldset>
      <div class="form-grid" style="margin-top:14px">
        <label class="field full">${t('Etiqueta (opcional)')}<input name="label" maxlength="60" value="${esc(c.label)}" placeholder="${t('1a ronda, prova de tronc…')}"></label>
        ${castell ? `<label class="field">${t('Resultat')}<select name="result">${Object.keys(RESULTS).map((v) => `<option value="${v}" ${c.result === v ? 'selected' : ''}>${resultLabel(v)}</option>`).join('')}</select></label>` : ''}
        <label class="field full">${t('Notes')}<textarea name="notes" maxlength="2000">${esc(c.notes)}</textarea></label>
        <label class="check full"><input type="checkbox" name="hidden" ${c.hidden ? 'checked' : ''}> ${icon.eyeOff} ${t('Ocult per als membres (el pots mostrar quan estigui a punt)')}</label>
      </div>
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${castell ? t('Desa') : t('Crea')}</button></div>
    </form>`, (m) => {
    const form = qs('#castell-form', m);
    const read = () => {
      const d = formData(form);
      for (const k of ['width', 'height', 'cordons', 'gralles', 'timbals']) d[k] = Number(d[k]);
      d.from_level = d.partial ? Number(d.from_level) || range.from : 1;
      d.to_level = d.partial ? Number(d.to_level) || range.to : 0;
      if (d.to_level >= d.height) d.to_level = 0;
      if (d.width < 3) d.agulla = false;
      if (d.net) d.folre = false;
      if (!d.folre) d.manilles = false;
      if (!d.manilles) d.puntals = false;
      return d;
    };
    // Llistes de pisos: es refan quan canvia l'amplada o l'alçada, mantenint la tria si encara existeix.
    const range = levelRange(c);
    let levelsKey = '';
    const syncLevels = (d) => {
      const fromSel = form.elements.from_level, toSel = form.elements.to_level;
      const key = `${d.width}|${d.height}`;
      if (key !== levelsKey) {
        const first = !toSel.options.length;
        const wasTop = first ? range.to >= Number(c.height) : toSel.selectedIndex === toSel.options.length - 1;
        const prevFrom = Number(fromSel.value) || range.from, prevTo = Number(toSel.value) || range.to;
        levelsKey = key;
        const names = levelNames(d);
        const html = names.map((n) => `<option value="${n.level}">${esc(n.label)}</option>`).join('');
        fromSel.innerHTML = html;
        toSel.innerHTML = html;
        const has = (L) => names.some((n) => n.level === L);
        fromSel.value = String(has(prevFrom) ? prevFrom : 1);
        toSel.value = String(wasTop || !has(prevTo) ? d.height : prevTo);
      }
      [...toSel.options].forEach((o) => { o.disabled = Number(o.value) < Number(fromSel.value); });
      [...fromSel.options].forEach((o) => { o.disabled = Number(o.value) > Number(toSel.value); });
      qs('#partial-range', m).classList.toggle('hidden', !form.elements.partial.checked);
    };
    // El que vol qui omple el formulari: la plantilla el pot limitar, però no se li ha de perdre si canvia de castell.
    let wantedCordons = Number(c.cordons);
    let cordonsTouched = !!castell;
    form.elements.cordons.addEventListener('input', (e) => { wantedCordons = Number(e.target.value); cordonsTouched = true; });
    const sync = () => {
      syncLevels(formData(form));
      const d = read();
      qs('#ag-wrap', m).classList.toggle('hidden', d.width < 3);
      form.elements.folre.disabled = d.net;
      form.elements.manilles.disabled = !d.folre;
      form.elements.puntals.disabled = !d.manilles;
      // Si la colla té plantilla per a aquest castell, n'hi ha fins als cordons que dibuixa; aquest castell en tria quants.
      const tpl = d.net ? null : templateOf(d);
      const rings = templateRings(tpl);
      const input = form.elements.cordons;
      input.disabled = d.net;
      // Sense cap cordó dibuixat no hi ha res a triar. Només de lectura (no desactivat): així es conserva el valor.
      input.readOnly = !!tpl && !rings;
      input.max = rings || 8;
      // Un castell nou comença amb tota la pinya de la plantilla, fins que algú en digui quants en vol.
      const shown = rings ? (cordonsTouched ? Math.min(wantedCordons, rings) : rings) : wantedCordons;
      // Si ja hi diu això no es toca: es podria estar escrivint (el camp buit val 0).
      if (Number(input.value) !== shown) input.value = shown;
      const hint = qs('#cordons-tpl', m);
      hint.classList.toggle('hidden', !tpl);
      hint.textContent = rings ? t('La pinya de la colla en dibuixa fins a {n}', { n: rings }) : t('La pinya de la colla no en dibuixa cap');
      form.elements.height.min = d.width === 1 ? 3 : 4;
      qs('#cname', m).textContent = castellName(d);
    };
    // Castells anteriors del mateix tipus per copiar-ne l'alineació (els més recents).
    const sourceCache = new Map();
    let sources = [];
    const copySel = form.elements.copy_from;
    const loadSources = async () => {
      const name = castellName(read());
      if (!sourceCache.has(name)) {
        sourceCache.set(name, api('GET', `/events/${castell?.event_id ?? eventId}/castell-sources?name=${encodeURIComponent(name)}${castell ? `&exclude=${castell.id}` : ''}`).catch(() => []));
      }
      const list = await sourceCache.get(name);
      if (castellName(read()) !== name) return; // ha canviat mentre es carregava
      const keep = copySel.value;
      sources = list;
      copySel.innerHTML = `<option value="">${t('No, deixa-ho com està')}</option>` + list.map((x) => `<option value="${x.id}">${esc([
        fmt(x.event_date, { day: 'numeric', month: 'short', year: 'numeric' }), x.event_title, x.label, resultLabel(x.result), t('{n} persones', { n: x.placed }),
      ].filter(Boolean).join(' · '))}</option>`).join('');
      copySel.value = list.some((x) => String(x.id) === keep) ? keep : '';
      qs('#copy-wrap', m).classList.toggle('hidden', !list.length);
    };
    // En triar-ne un, el formulari agafa els cordons, la música i els pisos d'aquell castell.
    copySel.onchange = () => {
      const x = sources.find((y) => String(y.id) === copySel.value);
      if (!x) return;
      form.elements.cordons.value = x.cordons;
      wantedCordons = Number(x.cordons);
      cordonsTouched = true;
      form.elements.gralles.value = x.gralles || 0;
      form.elements.timbals.value = x.timbals || 0;
      const partial = (x.from_level || 1) > 1 || !!x.to_level;
      form.elements.partial.checked = partial;
      levelsKey = '';
      syncLevels(formData(form));
      if (partial) {
        form.elements.from_level.value = String(x.from_level || 1);
        form.elements.to_level.value = String(x.to_level || Number(form.elements.height.value));
      }
      sync();
    };
    let lastName = '';
    form.oninput = (e) => {
      sync();
      const name = castellName(read());
      if (e?.target !== copySel && name !== lastName) { lastName = name; loadSources(); }
    };
    sync();
    lastName = castellName(read());
    loadSources();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const d = read();
      if (copySel.value) {
        d.copy_from = Number(copySel.value);
        if (castell && !confirm(t("Es substituirà l'alineació actual d'aquest castell per la del castell triat. Continuar?"))) return;
      }
      if (castell) {
        const keys = [...buildStructure(d).positions.keys()];
        const lost = d.copy_from ? 0 : onLost?.(new Set(keys)) || 0;
        if (lost && !confirm(t('Amb aquest canvi es perdran {n} persones assignades a posicions que ja no existeixen. Continuar?', { n: lost }))) return;
        d.validKeys = keys;
      }
      const saved = await attempt(() => api(castell ? 'PUT' : 'POST', castell ? `/castells/${castell.id}` : `/events/${eventId}/castells`, d));
      if (!saved) return;
      closeModal();
      if (castell) render({ keepScroll: true }); else location.hash = `#/castell/${saved.id}`;
    };
  });
}
