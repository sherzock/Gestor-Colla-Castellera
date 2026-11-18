// Preguntes i pagaments de l'altaveu: el que veu cada membre sota el missatge (respondre i, si cal, com pagar), el
// que posa la junta en escriure'l i la pàgina amb totes les respostes. L'app no mou diners: ensenya on i quant
// pagar, el membre avisa que ho ha fet i la junta apunta quan ho ha rebut.
import { amountOf, euros, groupIban, hasPrices, parseEuros } from '../forms.js';
import { download, fileSafe, xlsx } from '../export.js';
import { $app, api, attempt, copyText, esc, fmt, fullName, icon, isAdmin, lang, me, qs, qsa, render, shortName, t, toast } from './core.js';

const money = (cents) => euros(cents, lang);
const until = (d) => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
const optionText = (o) => `${esc(o.text)}${o.price ? ` <span class="poll-price">${money(o.price)}</span>` : ''}`;

// ---------- Sota el missatge ----------
export function pollCard(a) {
  const f = a.form;
  if (!f) return '';
  const head = `<div class="poll-head"><h3>${hasPrices(f.questions) ? t('Inscripció') : t('Enquesta')}</h3>
    <span class="small muted">${f.open ? (f.closes_on ? t('Es pot respondre fins al {date}', { date: until(f.closes_on) }) : '') : t('Ja no es pot respondre')}</span></div>`;
  if (isAdmin()) {
    const s = f.summary;
    return `<section class="poll">${head}
      <p class="small" style="margin:0">${t('{n} respostes', { n: f.answered })}${f.pay && s ? ` · ${t('Rebut: {a} de {b}', { a: money(s.received), b: money(s.total) })}` : ''}
        ${s?.to_check ? ` · <span class="status potser">${t('{n} per comprovar', { n: s.to_check })}</span>` : ''}</p>
      <div class="form-actions" style="justify-content:flex-start"><a class="btn sm" href="#/altaveu/${a.id}">${t('Mira les respostes')}</a></div></section>`;
  }
  const mine = f.mine;
  const chosen = (q, o) => mine?.answers?.[q.id]?.includes(o.id);
  const locked = !f.open;
  const count = (o) => (f.counts ? ` <span class="poll-count">${t('{n} vots', { n: f.counts[o.id] || 0 })}</span>` : '');
  return `<section class="poll" id="poll-${a.id}">${head}
    <form class="stack" data-poll-form="${a.id}">
      ${f.questions.map((q) => `<fieldset class="poll-q" ${locked ? 'disabled' : ''}>
        <legend>${esc(q.text)}${q.multiple ? ` <span class="small muted">${t("(pots triar-ne més d'una)")}</span>` : ''}</legend>
        ${q.options.map((o) => `<label class="poll-opt"><input type="${q.multiple ? 'checkbox' : 'radio'}" name="${esc(q.id)}" value="${esc(o.id)}" ${chosen(q, o) ? 'checked' : ''}>
          <span>${optionText(o)}${count(o)}</span></label>`).join('')}
      </fieldset>`).join('')}
      ${f.pay ? `<p class="small muted poll-total" aria-live="polite"></p>` : ''}
      ${locked ? '' : `<div class="form-actions" style="justify-content:flex-start">
        <button class="btn primary">${mine ? t('Desa els canvis') : t('Envia la resposta')}</button>
        ${mine && !mine.received_at ? `<button type="button" class="btn ghost" data-poll-clear="${a.id}">${t('Esborra la resposta')}</button>` : ''}</div>`}
    </form>
    ${mine ? `<p class="small poll-done">${icon.check} ${t('Has respost')}</p>` : ''}
    ${mine?.amount && f.pay ? payBox(a, mine) : ''}
  </section>`;
}

// On i quant pagar, amb botons per copiar cada dada tal com s'ha d'enganxar a l'app del banc.
function payBox(a, mine) {
  const p = a.form.pay;
  const concept = `${p.concept} - ${shortName(me || {})}`.slice(0, 60);
  const line = (label, value, copy) => `<div class="pay-line"><span class="muted">${label}</span><strong>${esc(value)}</strong>
    ${copy ? `<button type="button" class="btn sm ghost" data-copy="${esc(copy)}" aria-label="${t('Copia {what}', { what: label })}">${icon.copy}</button>` : ''}</div>`;
  const status = mine.received_at ? `<span class="status si">${t('Pagament rebut')}</span>`
    : mine.paid_at ? `<span class="status potser">${t('Pendent que la junta ho comprovi')}</span>`
      : `<span class="status none">${t('Pendent de pagar')}</span>`;
  return `<div class="pay-box">
    <div class="pay-amount"><span>${t('A pagar')}</span><strong>${money(mine.amount)}</strong>${status}</div>
    ${mine.received_at ? '' : `
      ${p.iban ? `${p.holder ? line(t('Titular'), p.holder) : ''}${line('IBAN', groupIban(p.iban), p.iban)}` : ''}
      ${line(t('Import'), money(mine.amount), (mine.amount / 100).toFixed(2).replace('.', lang === 'en' ? '.' : ','))}
      ${line(t('Concepte'), concept, concept)}
      ${p.bizum ? line('Bizum', p.bizum, p.bizum) : ''}
      <p class="small muted" style="margin:6px 0 0">${p.iban && p.bizum ? t('Fes una transferència o un Bizum amb aquest concepte i després avisa aquí.') : p.iban ? t('Fes una transferència amb aquest concepte i després avisa aquí.') : t('Fes un Bizum amb aquest concepte i després avisa aquí.')}</p>
      <div class="form-actions" style="justify-content:flex-start">
        <button type="button" class="btn ${mine.paid_at ? '' : 'primary'}" data-poll-paid="${a.id}" data-paid="${mine.paid_at ? '0' : '1'}">${mine.paid_at ? t('Encara no he pagat') : t('Ja he pagat')}</button></div>`}
  </div>`;
}

export function bindPolls(list) {
  qsa('[data-copy]').forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
  qsa('[data-poll-form]').forEach((form) => {
    const a = list.find((x) => String(x.id) === form.dataset.pollForm);
    const read = () => Object.fromEntries(a.form.questions.map((q) => [q.id, qsa(`input[name="${CSS.escape(q.id)}"]:checked`, form).map((i) => i.value)]));
    const total = qs('.poll-total', form);
    const showTotal = () => { if (total) total.textContent = t('Total: {amount}', { amount: money(amountOf(a.form.questions, read())) }); };
    showTotal();
    form.onchange = showTotal;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const answers = read();
      if (Object.values(answers).some((ids) => !ids.length)) { toast(t('Respon totes les preguntes'), true); return; }
      if (await attempt(() => api('PUT', `/announcements/${a.id}/answer`, { answers }))) { toast(t('Resposta desada')); render({ keepScroll: true }); }
    };
  });
  qsa('[data-poll-clear]').forEach((b) => (b.onclick = async () => {
    if (!confirm(t('Esborrar la teva resposta?'))) return;
    if (await attempt(() => api('DELETE', `/announcements/${b.dataset.pollClear}/answer`))) { toast(t('Resposta esborrada')); render({ keepScroll: true }); }
  }));
  qsa('[data-poll-paid]').forEach((b) => (b.onclick = async () => {
    const paid = b.dataset.paid === '1';
    if (await attempt(() => api('PUT', `/announcements/${b.dataset.pollPaid}/answer/paid`, { paid }))) {
      toast(paid ? t('Avisat: la junta ho comprovarà') : t('Fet'));
      render({ keepScroll: true });
    }
  }));
}

// ---------- En escriure el missatge ----------
const blankOption = () => ({ text: '', price: null });
const blankQuestion = () => ({ text: '', multiple: false, options: [blankOption(), blankOption()] });
const priceText = (cents) => (cents ? (cents / 100).toFixed(cents % 100 ? 2 : 0).replace('.', lang === 'en' ? '.' : ',') : '');

export function pollEditorHtml(a) {
  const f = a?.form;
  return `<label class="check"><input type="checkbox" id="poll-on" ${f ? 'checked' : ''}> ${t('Afegeix preguntes (enquesta, inscripció o pagament)')}</label>
    <div class="poll-editor stack ${f ? '' : 'hidden'}" id="poll-editor">
      <div id="poll-questions" class="stack"></div>
      <button type="button" class="btn sm" id="poll-add-q">${icon.plus}${t('Afegeix una pregunta')}</button>
      <label class="field">${t('Es pot respondre fins al')}<input type="date" name="poll_closes" value="${esc(f?.closes_on || '')}"></label>
      <label class="check"><input type="checkbox" name="poll_public" ${f?.results_public ? 'checked' : ''}> ${t('Els membres veuen quanta gent ha triat cada opció (sense noms)')}</label>
      <fieldset class="poll-pay">
        <legend>${t('On es paga')}</legend>
        <p class="small muted" style="margin-top:0">${t("Només cal si alguna opció té preu. Cada membre veurà quant ha de pagar, aquestes dades i un concepte amb el seu nom; l'app no fa cap cobrament.")}</p>
        <label class="field">${t('Titular del compte')}<input name="pay_holder" maxlength="80" value="${esc(f?.pay?.holder || '')}"></label>
        <label class="field">IBAN<input name="pay_iban" maxlength="60" autocomplete="off" spellcheck="false" value="${esc(f?.pay?.iban ? groupIban(f.pay.iban) : '')}" placeholder="ES00 0000 0000 0000 0000 0000"></label>
        <label class="field">${t('Mòbil per al Bizum')}<input name="pay_bizum" maxlength="20" inputmode="tel" value="${esc(f?.pay?.bizum || '')}"></label>
        <label class="field">${t('Concepte')}<input name="pay_concept" maxlength="40" value="${esc(f?.pay && f.pay.concept !== a.title ? f.pay.concept : '')}" placeholder="${t('El títol del missatge')}"></label>
      </fieldset>
    </div>`;
}

// Prepara l'editor dins del formulari; torna una funció que dona el que s'ha d'enviar (undefined: res a canviar).
export function bindPollEditor(m, a) {
  const f = a?.form;
  let questions = f ? structuredClone(f.questions) : [blankQuestion()];
  const box = qs('#poll-questions', m);
  // Del que hi ha escrit cap al model, abans de redibuixar o d'enviar.
  const sync = () => qsa('[data-q]', box).forEach((el) => {
    const q = questions[Number(el.dataset.q)];
    q.text = qs('[data-q-text]', el).value;
    q.multiple = qs('[data-q-multiple]', el).checked;
    qsa('[data-o]', el).forEach((row) => {
      const o = q.options[Number(row.dataset.o)];
      o.text = qs('[data-o-text]', row).value;
      o.priceText = qs('[data-o-price]', row).value;
    });
  });
  const draw = () => {
    box.innerHTML = questions.map((q, qi) => `<fieldset class="poll-edit-q" data-q="${qi}">
      <legend>${t('Pregunta {n}', { n: qi + 1 })}</legend>
      <label class="field"><span class="sr-only">${t('Pregunta {n}', { n: qi + 1 })}</span><input data-q-text maxlength="200" value="${esc(q.text)}" placeholder="${t("p. ex. Véns al viatge?")}"></label>
      ${q.options.map((o, oi) => `<div class="poll-edit-o" data-o="${oi}">
        <input data-o-text maxlength="120" value="${esc(o.text)}" aria-label="${t('Opció {n}', { n: oi + 1 })}" placeholder="${t('Opció {n}', { n: oi + 1 })}">
        <span class="poll-edit-price"><input data-o-price inputmode="decimal" maxlength="9" value="${esc(o.priceText ?? priceText(o.price))}" aria-label="${t('Preu de l\'opció {n}, en euros', { n: oi + 1 })}" placeholder="${t('Preu')}"><span aria-hidden="true">€</span></span>
        <button type="button" class="btn ghost sm x" data-del-o="${qi}:${oi}" aria-label="${t('Treu l\'opció {n}', { n: oi + 1 })}" ${q.options.length < 2 ? 'disabled' : ''}>×</button>
      </div>`).join('')}
      <div class="news-tools">
        <button type="button" class="btn sm" data-add-o="${qi}" ${q.options.length >= 12 ? 'disabled' : ''}>${icon.plus}${t('Afegeix una opció')}</button>
        <label class="check"><input type="checkbox" data-q-multiple ${q.multiple ? 'checked' : ''}> ${t("Se'n poden triar diverses")}</label>
        ${questions.length > 1 ? `<button type="button" class="btn sm ghost danger" data-del-q="${qi}">${t('Treu la pregunta')}</button>` : ''}
      </div>
    </fieldset>`).join('');
    qs('#poll-add-q', m).classList.toggle('hidden', questions.length >= 6);
    qsa('[data-add-o]', box).forEach((b) => (b.onclick = () => { sync(); questions[Number(b.dataset.addO)].options.push(blankOption()); draw(); }));
    qsa('[data-del-o]', box).forEach((b) => (b.onclick = () => { sync(); const [qi, oi] = b.dataset.delO.split(':').map(Number); questions[qi].options.splice(oi, 1); draw(); }));
    qsa('[data-del-q]', box).forEach((b) => (b.onclick = () => { sync(); questions.splice(Number(b.dataset.delQ), 1); draw(); }));
  };
  draw();
  qs('#poll-add-q', m).onclick = () => { sync(); questions.push(blankQuestion()); draw(); qsa('[data-q-text]', box).at(-1).focus(); };
  const on = qs('#poll-on', m);
  on.onchange = () => qs('#poll-editor', m).classList.toggle('hidden', !on.checked);
  // Un missatge nou fa servir les dades de pagament de l'última vegada.
  if (!f?.pay) api('GET', '/pay-defaults').then((d) => {
    for (const k of ['pay_holder', 'pay_iban', 'pay_bizum']) {
      const input = qs(`[name="${k}"]`, m);
      if (input && !input.value && d[k]) input.value = k === 'pay_iban' ? groupIban(d[k]) : d[k];
    }
  }).catch(() => {});

  return () => {
    if (!on.checked) {
      if (!f) return undefined;
      if (f.answered && !confirm(t("Treure les preguntes esborrarà les {n} respostes. Continuar?", { n: f.answered }))) throw new Error('cancel');
      return null;
    }
    sync();
    const out = questions.map((q) => ({
      id: q.id, text: q.text.trim(), multiple: q.multiple,
      options: q.options.filter((o) => o.text.trim() || (o.priceText ?? '').trim()).map((o) => {
        const price = parseEuros(o.priceText ?? priceText(o.price));
        if (Number.isNaN(price)) { toast(t('El preu «{price}» no és correcte', { price: o.priceText }), true); throw new Error('cancel'); }
        return { id: o.id, text: o.text.trim(), price };
      }),
    }));
    const val = (n) => qs(`[name="${n}"]`, m).value.trim();
    return {
      questions: out, closes_on: val('poll_closes') || null, results_public: qs('[name="poll_public"]', m).checked,
      pay_holder: val('pay_holder'), pay_iban: val('pay_iban'), pay_bizum: val('pay_bizum'), pay_concept: val('pay_concept'),
    };
  };
}

// ---------- Totes les respostes (junta i administració) ----------
const STATES = {
  all: () => t('Tothom'),
  check: () => t('Per comprovar'),
  unpaid: () => t('Sense pagar'),
  received: () => t('Rebut'),
};
const stateOf = (r) => (!r.amount ? 'free' : r.received_at ? 'received' : r.paid_at ? 'check' : 'unpaid');

// El filtre triat es manté quan la pàgina es torna a pintar (en marcar un pagament com a rebut, per exemple).
const filters = new Map();

export async function pageAnswers(id) {
  if (!isAdmin()) { location.hash = '#/altaveu'; return; }
  const data = await api('GET', `/announcements/${id}/answers`);
  const { form, rows, pending } = data;
  const priced = !!form.pay;
  let filter = filters.get(id) || 'all';
  const optionsOf = (q, r) => q.options.filter((o) => r.answers[q.id]?.includes(o.id)).map((o) => o.text).join(', ') || '—';
  const draw = () => {
    const shown = rows.filter((r) => filter === 'all' || stateOf(r) === filter);
    const s = form.summary;
    $app.innerHTML = `
      <a class="back" href="#/altaveu">${icon.back}${t('Altaveu')}</a>
      <div class="page-head"><h1>${esc(data.announcement.title)}</h1>
        <div class="actions"><button class="btn" id="answers-xlsx">${t('Exporta a Excel')}</button></div></div>
      <div class="stat-tiles">
        <div class="stat-tile"><strong>${rows.length}</strong><span>${t('Han respost')}</span><small>${t('{n} encara no', { n: pending.length })}</small></div>
        ${priced ? `<div class="stat-tile"><strong>${money(s.total)}</strong><span>${t('A cobrar')}</span></div>
          <div class="stat-tile"><strong>${money(s.received)}</strong><span>${t('Rebut')}</span><small>${t('Falten {amount}', { amount: money(s.total - s.received) })}</small></div>
          <div class="stat-tile"><strong>${s.to_check}</strong><span>${t('Per comprovar')}</span><small>${t('Diuen que han pagat')}</small></div>` : ''}
      </div>
      <div class="grid-2 poll-results">${form.questions.map((q) => {
        const max = Math.max(1, ...q.options.map((o) => form.counts[o.id] || 0));
        return `<section class="card"><h2>${esc(q.text)}</h2>${q.options.map((o) => `<div class="bar-row">
          <span class="nm">${optionText(o)}</span><div class="bar"><div style="width:${((form.counts[o.id] || 0) / max) * 100}%;height:100%;background:var(--accent)"></div></div>
          <strong>${form.counts[o.id] || 0}</strong><span></span></div>`).join('')}</section>`;
      }).join('')}</div>
      <section class="card">
        <div class="page-head" style="margin:0 0 10px"><h2 style="margin:0">${t('Respostes')}</h2>
          ${priced ? `<div class="tabs" role="group" aria-label="${t('Filtra')}">${Object.entries(STATES).map(([k, label]) => `<button type="button" data-filter="${k}" class="${filter === k ? 'on' : ''}" aria-pressed="${filter === k}">${label()}</button>`).join('')}</div>` : ''}</div>
        ${shown.length ? `<div class="table-wrap"><table class="responsive"><thead><tr><th>${t('Persona')}</th>${form.questions.map((q) => `<th>${esc(q.text)}</th>`).join('')}
          ${priced ? `<th class="num">${t('Import')}</th><th>${t('Pagament')}</th><th></th>` : ''}</tr></thead>
          <tbody>${shown.map((r) => `<tr>
            <td class="lead">${esc(fullName(r))}</td>
            ${form.questions.map((q) => `<td data-l="${esc(q.text)}">${esc(optionsOf(q, r))}</td>`).join('')}
            ${priced ? `<td class="num" data-l="${t('Import')}">${r.amount ? money(r.amount) : '—'}</td>
              <td>${{ free: '', received: `<span class="status si">${t('Rebut')}</span>`, check: `<span class="status potser">${t('Diu que ha pagat')}</span>`, unpaid: `<span class="status none">${t('Sense pagar')}</span>` }[stateOf(r)]}</td>
              <td>${r.amount ? `<button class="btn sm ${r.received_at ? 'ghost' : ''}" data-received="${r.person_id}" data-v="${r.received_at ? '0' : '1'}">${r.received_at ? t('Desfés') : t('Marca rebut')}</button>` : ''}</td>` : ''}
          </tr>`).join('')}</tbody></table></div>` : `<p class="muted">${t('No hi ha ningú en aquesta llista.')}</p>`}
      </section>
      ${pending.length ? `<section class="card"><h2>${t('Encara no han respost ({n})', { n: pending.length })}</h2>
        <p class="small" style="margin:0">${pending.map((p) => esc(fullName(p))).join(' · ')}</p></section>` : ''}`;
    qsa('[data-filter]').forEach((b) => (b.onclick = () => { filter = b.dataset.filter; filters.set(id, filter); draw(); qs(`[data-filter="${filter}"]`)?.focus(); }));
    qsa('[data-received]').forEach((b) => (b.onclick = async () => {
      if (await attempt(() => api('PUT', `/announcements/${id}/answers/${b.dataset.received}`, { received: b.dataset.v === '1' }))) render({ keepScroll: true });
    }));
    qs('#answers-xlsx').onclick = () => {
      const header = [t('Persona'), ...form.questions.map((q) => q.text), ...(priced ? [t('Import (€)'), t('Pagament')] : []), t('Data de resposta')];
      const state = { free: '', received: t('Rebut'), check: t('Diu que ha pagat'), unpaid: t('Sense pagar') };
      const body = rows.map((r) => [fullName(r), ...form.questions.map((q) => optionsOf(q, r)),
        ...(priced ? [(r.amount / 100).toFixed(2), state[stateOf(r)]] : []), r.answered_at.slice(0, 16)]);
      const sheets = [{ name: t('Respostes'), rows: [header, ...body], header: true }];
      if (pending.length) sheets.push({ name: t('Sense resposta'), rows: [[t('Persona')], ...pending.map((p) => [fullName(p)])], header: true });
      download(xlsx(sheets), `respostes-${fileSafe(data.announcement.title)}.xlsx`);
    };
  };
  draw();
}
