// Pagaments d'una sessió: el que veu qui ha dit «Vinc» (quant, on i amb quin concepte), la configuració i el resum
// de la junta, i els preus de les preguntes. L'app no mou diners: el membre avisa que ha pagat i la junta ho marca
// com a rebut quan ho veu al banc.
import { euros, fieldHasPrice, groupIban, parseEuros } from '../forms.js';
import { api, attempt, can, closeModal, copyText, esc, fmt, fullName, icon, lang, me, modalHead, openModal, qs, qsa, render, shortName, t,
  toast } from './core.js';

export const money = (cents) => euros(cents, lang);
const dueText = (date) => fmt(date, { weekday: 'long', day: 'numeric', month: 'long' });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const euroText = (cents) => (cents ? (cents / 100).toFixed(cents % 100 ? 2 : 0).replace('.', lang === 'en' ? '.' : ',') : '');
// Llegeix un preu escrit en euros; si no és correcte, ho diu i atura el que s'estava fent.
function readPrice(input) {
  const cents = parseEuros(input.value);
  if (Number.isNaN(cents)) { toast(t('El preu «{price}» no és correcte', { price: input.value }), true); input.focus(); throw new Error('cancel'); }
  return cents;
}

// El preu que es veu al costat de cada pregunta i opció, en respondre.
export const priceHint = {
  bool: (f) => (f.price ? ` <span class="price-tag">${money(f.price)}</span>` : ''),
  number: (f) => (f.price ? ` <span class="price-tag">${t('{price} cadascun', { price: money(f.price) })}</span>` : ''),
  option: (f, i) => (f.option_prices?.[i] ? ` · ${money(f.option_prices[i])}` : ''),
};
// Resum dels preus d'una pregunta, per a la llista de la junta.
export function priceSummary(f) {
  if (!fieldHasPrice(f)) return '';
  if (f.kind === 'select') return f.options.map((o, i) => (f.option_prices?.[i] ? `${o}: ${money(f.option_prices[i])}` : null)).filter(Boolean).join(' · ');
  return f.kind === 'number' ? t('{price} cadascun', { price: money(f.price) }) : t('{price} si diu que sí', { price: money(f.price) });
}

// ---------- Qui ha dit «Vinc» ----------
export function payCard(event, mine, payment) {
  if (!payment || !mine?.amount) return '';
  const concept = `${payment.concept} - ${shortName(me || {})}`.slice(0, 60);
  const line = (label, value, copy) => `<div class="pay-line"><span class="muted">${label}</span><strong>${esc(value)}</strong>
    ${copy ? `<button type="button" class="btn sm ghost" data-copy="${esc(copy)}" aria-label="${t('Copia {what}', { what: label })}">${icon.copy}</button>` : ''}</div>`;
  const late = payment.due_date && !mine.paid_at && !mine.received_at && payment.due_date < today();
  const status = mine.received_at ? `<span class="status si">${mine.received_cash ? t('Rebut en efectiu') : t('Pagament rebut')}</span>`
    : mine.paid_at ? `<span class="status potser">${t('Pendent que la junta ho comprovi')}</span>`
      : `<span class="status none">${t('Pendent de pagar')}</span>`;
  const how = payment.iban && payment.bizum ? t('Fes una transferència o un Bizum amb aquest concepte i després avisa aquí.')
    : payment.iban ? t('Fes una transferència amb aquest concepte i després avisa aquí.') : t('Fes un Bizum amb aquest concepte i després avisa aquí.');
  return `<div class="card pay-card" id="pay-card">
    <h2>${t('Pagament')}</h2>
    <div class="pay-amount"><span>${t('A pagar')}</span><strong>${money(mine.amount)}</strong>${status}</div>
    ${mine.received_at ? `<p class="small muted" style="margin:6px 0 0">${t('La junta ja ho ha rebut. Si canvies la resposta i canvia el preu, parla-ho amb la junta.')}</p>` : `
      <div class="pay-lines">
        ${payment.iban ? `${payment.holder ? line(t('Titular'), payment.holder) : ''}${line('IBAN', groupIban(payment.iban), payment.iban)}` : ''}
        ${line(t('Import'), money(mine.amount), euroText(mine.amount))}
        ${line(t('Concepte'), concept, concept)}
        ${payment.bizum ? line('Bizum', payment.bizum, payment.bizum) : ''}
      </div>
      <p class="small muted" style="margin:6px 0 0">${how}</p>
      ${payment.due_date ? `<p class="small ${late ? 'warn-text' : 'muted'}" style="margin:4px 0 0">${late
        ? t('El termini per pagar era el {date}. Paga com més aviat millor.', { date: `<strong>${esc(dueText(payment.due_date))}</strong>` })
        : t('Paga abans del {date}.', { date: `<strong>${esc(dueText(payment.due_date))}</strong>` })}</p>` : ''}
      <div class="form-actions" style="justify-content:flex-start">
        <button type="button" class="btn ${mine.paid_at ? '' : 'primary'}" id="pay-done" data-paid="${mine.paid_at ? '0' : '1'}">${mine.paid_at ? t('Encara no he pagat') : t('Ja he pagat')}</button></div>`}
  </div>`;
}

export function bindPayCard(event) {
  qsa('#pay-card [data-copy]').forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
  const done = qs('#pay-done');
  if (done) done.onclick = async () => {
    const paid = done.dataset.paid === '1';
    if (await attempt(() => api('PUT', `/events/${event.id}/paid`, { paid }))) {
      toast(paid ? t('Avisat: la junta ho comprovarà') : t('Fet'));
      render({ keepScroll: true });
    }
  };
}

// ---------- Junta ----------
const STATE = {
  received: (a) => `<span class="status si">${a.received_cash ? t('Rebut en efectiu') : t('Rebut')}</span>`,
  paid: () => `<span class="status potser">${t('Diu que ha pagat')}</span>`,
  unpaid: (a) => (a.late ? `<span class="status no">${t('Fora de termini')}</span>` : `<span class="status none">${t('Sense pagar')}</span>`),
};
export const payState = (a) => (!a.amount ? null : a.received_at ? 'received' : a.paid_at ? 'paid' : 'unpaid');
export const payCell = (a) => {
  const state = payState(a);
  if (!state) return '';
  const pick = can('sessions') && !a.received_at
    ? `<input type="checkbox" class="pay-pick" data-pay-pick="${a.id}" aria-label="${t('Tria {name}', { name: esc(fullName(a)) })}"> ` : '';
  return `${pick}<strong>${money(a.amount)}</strong> ${STATE[state](a)}${can('sessions')
    ? ` <button type="button" class="btn sm ${a.received_at ? 'ghost' : ''}" data-received="${a.id}" data-v="${a.received_at ? '0' : '1'}">${a.received_at ? t('Desfés') : t('Marca rebut')}</button>` : ''}`;
};

export function paymentAdminCard(event, payment, payments, attendance, fields) {
  if (!can('sessions')) return '';
  const priced = fields.some(fieldHasPrice);
  if (!payment) {
    return `<div class="card">
      <div class="card-head"><h2>${t('Pagament')}</h2></div>
      <p class="small muted" style="margin-top:-6px">${t("Si cal pagar (viatge, dinar, samarreta…), posa on es paga i els preus: qui digui «Vinc» veurà quant ha de pagar, l'IBAN o el Bizum i un concepte amb el seu nom. L'app no fa cap cobrament.")}</p>
      ${priced ? `<p class="small warn-text">${t('Hi ha preguntes amb preu, però encara no has posat on es paga.')}</p>` : ''}
      <button type="button" class="btn sm" id="pay-setup">${icon.plus}${t('Afegeix un pagament')}</button>
    </div>`;
  }
  const check = attendance.filter((a) => payState(a) === 'paid');
  const late = attendance.filter((a) => a.late);
  const p = payments;
  return `<div class="card" id="pay-admin">
    <div class="card-head"><h2>${t('Pagament')}</h2><div class="actions"><button type="button" class="btn sm" id="pay-setup">${t('Edita')}</button></div></div>
    <div class="stat-tiles">
      <div class="stat-tile"><strong>${money(p.total)}</strong><span>${t('A cobrar')}</span></div>
      <div class="stat-tile"><strong>${money(p.received)}</strong><span>${t('Rebut')}</span><small>${t('Falten {amount}', { amount: money(p.total - p.received) })}</small></div>
      <div class="stat-tile"><strong>${p.to_check}</strong><span>${t('Per comprovar')}</span><small>${t('{n} sense pagar', { n: p.unpaid })}${p.late ? ` · ${t('{n} fora de termini', { n: p.late })}` : ''}</small></div>
    </div>
    <p class="small muted" style="margin:10px 0 0">${[
      payment.price ? t('{price} per persona', { price: money(payment.price) }) : '',
      payment.companion_price ? t('{price} per acompanyant', { price: money(payment.companion_price) }) : '',
      payment.iban ? `IBAN ${esc(groupIban(payment.iban))}` : '', payment.bizum ? `Bizum ${esc(payment.bizum)}` : '',
      `${t('Concepte')}: ${esc(payment.concept)}`,
      payment.due_date ? t('Data límit: {date}', { date: esc(dueText(payment.due_date)) }) : ''].filter(Boolean).join(' · ')}</p>
    ${check.length ? `<div class="card-head" style="margin-top:12px"><h3 class="instr-h" style="margin:0">${t('Diuen que han pagat: comprova-ho al banc')}</h3>
      ${check.length > 1 ? `<div class="actions"><button type="button" class="btn sm" data-received-all="${check.map((a) => a.id).join(',')}">${t('Marca-ho tot rebut')}</button></div>` : ''}</div>
      <div class="field-list">${check.map((a) => `<div class="field-row"><div><div>${esc(fullName(a))}</div><div class="k">${money(a.amount)}</div></div>
        <button type="button" class="btn sm" style="margin-left:auto" data-received="${a.id}" data-v="1">${t('Marca rebut')}</button></div>`).join('')}</div>` : ''}
    ${late.length ? `<h3 class="instr-h">${t("Fora de termini: encara no han pagat")}</h3>
      <p class="small muted" style="margin:0 0 6px">${late.map((a) => `${esc(fullName(a))} (${money(a.amount)})`).join(' · ')}</p>` : ''}
  </div>`;
}

// Barra per marcar com a rebuts (pel banc o en efectiu) tots els que s'han triat a la taula d'assistència.
export function payBulkBar() {
  if (!can('sessions')) return '';
  return `<div class="pay-bulk" id="pay-bulk" hidden>
    <span id="pay-bulk-n"></span>
    <button type="button" class="btn sm primary" data-bulk-cash="0">${t('Marca rebut')}</button>
    <button type="button" class="btn sm" data-bulk-cash="1">${t('Rebut en efectiu')}</button>
    <button type="button" class="btn sm ghost" id="pay-bulk-clear">${t('Desfés la tria')}</button>
  </div>`;
}

export function bindPaymentAdmin(event, payment, reload) {
  qsa('[data-received]').forEach((b) => (b.onclick = async () => {
    if (await attempt(() => api('PUT', `/events/${event.id}/payments/${b.dataset.received}`, { received: b.dataset.v === '1' }))) reload();
  }));
  const bulk = async (ids, cash) => {
    if (await attempt(() => api('PUT', `/events/${event.id}/payments`, { person_ids: ids, received: true, cash }))) {
      toast(t('{n} marcats com a rebuts', { n: ids.length }));
      reload();
    }
  };
  qsa('[data-received-all]').forEach((b) => (b.onclick = () => bulk(b.dataset.receivedAll.split(',').map(Number), false)));
  const bar = qs('#pay-bulk');
  if (bar) {
    const picked = () => qsa('[data-pay-pick]').filter((c) => c.checked).map((c) => Number(c.dataset.payPick));
    const update = () => {
      const n = picked().length;
      bar.hidden = !n;
      qs('#pay-bulk-n').textContent = t('{n} triats', { n });
    };
    qsa('[data-pay-pick]').forEach((c) => {
      c.onchange = update;
      c.onclick = (e) => e.stopPropagation();
    });
    qsa('[data-bulk-cash]', bar).forEach((b) => (b.onclick = () => bulk(picked(), b.dataset.bulkCash === '1')));
    qs('#pay-bulk-clear').onclick = () => { qsa('[data-pay-pick]').forEach((c) => (c.checked = false)); update(); };
  }
  qs('#pay-setup')?.addEventListener('click', () => paymentModal(event, payment, reload));
}

function paymentModal(event, payment, reload) {
  const p = payment || {};
  openModal(`${modalHead(t('Pagament de la sessió'))}
    <form id="pay-form" class="stack">
      <p class="small muted" style="margin:0">${t("Qui digui «Vinc» pagarà el preu per persona, més el de les respostes amb preu (es posen a «Camps extra»). L'app només ho ensenya: no fa cap cobrament.")}</p>
      <div class="form-grid">
        <label class="field">${t('Preu per persona (€)')}<input name="price" inputmode="decimal" maxlength="9" value="${euroText(p.price)}" placeholder="0"></label>
        ${event.ask_companions ? `<label class="field">${t('Preu per acompanyant (€)')}<input name="companion_price" inputmode="decimal" maxlength="9" value="${euroText(p.companion_price)}" placeholder="0"></label>` : ''}
      </div>
      <label class="field">${t('Data límit per pagar')}<input type="date" name="due_date" value="${esc(p.due_date || '')}">
        <span class="small muted">${t("Opcional. Tres dies abans, qui encara no hagi pagat rebrà un recordatori al mòbil (o abans de la sessió, si no n'hi poses).")}</span></label>
      <label class="field">${t('Titular del compte')}<input name="holder" maxlength="80" value="${esc(p.holder || '')}"></label>
      <label class="field">IBAN<input name="iban" maxlength="60" autocomplete="off" spellcheck="false" value="${esc(p.iban ? groupIban(p.iban) : '')}" placeholder="ES00 0000 0000 0000 0000 0000"></label>
      <label class="field">${t('Mòbil per al Bizum')}<input name="bizum" maxlength="20" inputmode="tel" value="${esc(p.bizum || '')}"></label>
      <label class="field">${t('Concepte')}<input name="concept" maxlength="40" value="${esc(p.concept && p.concept !== event.title ? p.concept : '')}" placeholder="${esc(event.title.slice(0, 40))}">
        <span class="small muted">${t('Cadascú hi veurà el seu nom al darrere, perquè el trobeu al banc.')}</span></label>
      <div class="form-actions">
        ${payment ? `<button type="button" class="btn danger" id="pay-remove" style="margin-right:auto">${t('Treu el pagament')}</button>` : ''}
        <button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${t('Desa')}</button></div>
    </form>`, (m) => {
    const form = qs('#pay-form', m);
    // La primera vegada, les dades de la colla de l'última sessió que es va pagar.
    if (!payment) api('GET', '/pay-defaults').then((d) => {
      for (const k of ['holder', 'iban', 'bizum']) if (d[k] && !form.elements[k].value) form.elements[k].value = k === 'iban' ? groupIban(d[k]) : d[k];
    }).catch(() => {});
    form.onsubmit = async (e) => {
      e.preventDefault();
      const el = form.elements;
      let body;
      try {
        body = { price: readPrice(el.price), companion_price: el.companion_price ? readPrice(el.companion_price) : p.companion_price ?? null,
          holder: el.holder.value, iban: el.iban.value, bizum: el.bizum.value, concept: el.concept.value, due_date: el.due_date.value };
      } catch { return; }
      if (await attempt(() => api('PUT', `/events/${event.id}/payment`, body))) { closeModal(); toast(t('Pagament desat')); reload(); }
    };
    qs('#pay-remove', m)?.addEventListener('click', async () => {
      if (!confirm(t("Treure el pagament? Es perdrà qui ha dit que ha pagat i què s'ha rebut."))) return;
      if (await attempt(() => api('DELETE', `/events/${event.id}/payment`))) { closeModal(); reload(); }
    });
  });
}

// Preus d'una pregunta de la sessió: un per a sí/no i número; un per opció en una llista.
export function fieldPriceModal(f, reload) {
  const input = (name, value, label) => `<label class="field">${label}<input name="${name}" inputmode="decimal" maxlength="9" value="${euroText(value)}" placeholder="0"></label>`;
  openModal(`${modalHead(t('Preu de «{label}»', { label: esc(f.label) }))}
    <form id="fprice-form" class="stack">
      <p class="small muted" style="margin:0">${{ bool: t('Ho paga qui hi digui que sí.'), number: t('Es multiplica pel número que hi posi cadascú.'), select: t("Cada opció pot tenir el seu preu; deixa'l buit si no costa res.") }[f.kind]}</p>
      ${f.kind === 'select' ? f.options.map((o, i) => input(`o${i}`, f.option_prices?.[i], `${esc(o)} (€)`)).join('') : input('price', f.price, t('Preu (€)'))}
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${t('Desa')}</button></div>
    </form>`, (m) => {
    const form = qs('#fprice-form', m);
    form.onsubmit = async (e) => {
      e.preventDefault();
      let body;
      try {
        body = f.kind === 'select' ? { option_prices: f.options.map((_, i) => readPrice(form.elements[`o${i}`])) } : { price: readPrice(form.elements.price) };
      } catch { return; }
      if (await attempt(() => api('PUT', `/fields/${f.id}`, body))) { closeModal(); reload(); }
    };
  });
}
