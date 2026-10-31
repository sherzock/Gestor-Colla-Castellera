// Línia de temps de l'assaig, per a qui l'organitza: la tècnica hi posa les hores i la junta les consulta.
import { castellName } from '../castell.js';
import { PLAN_MINUTES, dragStart, nextPlanTime, planLayout, toTime } from '../planning.js';
import { api, attempt, can, closeModal, esc, formData, icon, modalHead, openModal, qs, qsa, render, t, toast } from './core.js';
import { assignedName } from './viewer.js';

const PX = 2.4;
const MIN_HEIGHT = 34;

function item(c, cls, style, body) {
  const hidden = c.hidden ? 'is-hidden' : '';
  return can('castells')
    ? `<button type="button" class="${cls} ${hidden}" style="${style}" data-plan="${c.id}">${body}</button>`
    : `<a class="${cls} ${hidden}" style="${style}" href="#/castell/${c.id}">${body}</a>`;
}

// Amb el dit, per arrossegar cal agafar la nansa: així la resta del bloc deixa moure la pàgina.
const blocksHtml = (blocks, from, clashing) => blocks.map(({ c, start, end, col, cols }) => {
  const style = `top:${(start - from) * PX}px;height:${Math.max((end - start) * PX, MIN_HEIGHT)}px;left:${(col / cols) * 100}%;width:${100 / cols}%`;
  return item(c, `tl-block ${c.net ? 'net' : ''} ${clashing.has(c.id) ? 'clash' : ''}`, style, `<strong>${castellName(c)}</strong><span class="tl-when">${toTime(start)}–${toTime(end)}</span>${c.label ? `<span>${esc(c.label)}</span>` : ''}${can('castells') ? '<i class="tl-grip" aria-hidden="true"></i>' : ''}`);
}).join('');

const MAX_NAMES = 6;
function clashesHtml(clashes, castells) {
  const nameOf = (id) => castellName(castells.find((c) => c.id === id));
  return `<ul class="tl-clashes">${clashes.map((x) => {
    const names = x.people.slice(0, MAX_NAMES).map((p) => assignedName(p, true)).join(', ') + (x.people.length > MAX_NAMES ? ` +${x.people.length - MAX_NAMES}` : '');
    return `<li>${icon.alert}<a href="#/castell/${x.a}">${esc(t('{a} i {b} es fan alhora i tots dos tenen: {names}', { a: nameOf(x.a), b: nameOf(x.b), names }))}</a></li>`;
  }).join('')}</ul>`;
}

export function timelineCard(event, castells, clashes = []) {
  if (!castells.length) return '';
  const plan = planLayout(castells, event);
  const clashing = new Set(clashes.flatMap((x) => [x.a, x.b]));
  const scheduled = plan.blocks.length > 0;
  const ticks = [];
  if (scheduled) for (let m = plan.from; m <= plan.to; m += 30) ticks.push(`<span class="tl-tick" style="top:${(m - plan.from) * PX}px">${toTime(m)}</span>`);
  const height = (plan.to - plan.from) * PX;
  return `<div class="card">
    <div class="card-head"><h2>${t("Horari de l'assaig")}</h2><span class="muted small">${t('Només el veuen la tècnica i la junta')}</span></div>
    ${scheduled ? `<div class="tl">
      <div class="tl-axis" style="height:${height}px">${ticks.join('')}</div>
      <div class="tl-lane" style="height:${height}px">${blocksHtml(plan.blocks, plan.from, clashing)}</div>
    </div>
    ${clashes.length ? clashesHtml(clashes, castells) : ''}
    ${can('castells') ? `<p class="small muted" style="margin:8px 0 0">${t('Arrossega un castell per canviar-li l\'hora, o toca\'l per ajustar-la.')}</p>` : ''}
    ${plan.blocks.some((b) => b.c.net) ? `<div class="legend"><span><i class="tl-net-mark"></i>${t('Castells nets')}</span></div>` : ''}` : ''}
    ${plan.unscheduled.length ? `<div class="tl-none">
      <span class="small muted">${t('Sense hora')}</span>
      ${plan.unscheduled.map((c) => item(c, 'btn sm', '', castellName(c))).join('')}
    </div>
    ${can('castells') ? `<p class="small muted" style="margin:8px 0 0">${t('Toca un castell per posar-li hora.')}</p>` : ''}` : ''}
  </div>`;
}

export function bindTimeline(event, castells) {
  const plan = planLayout(castells, event);
  // En acabar d'arrossegar el navegador també envia un clic, que no ha d'obrir el formulari.
  let justDragged = false;
  qsa('[data-plan]').forEach((b) => {
    const c = castells.find((x) => x.id === Number(b.dataset.plan));
    b.onclick = () => {
      if (justDragged) { justDragged = false; return; }
      planModal(event, castells, c);
    };
    if (c.plan_time && b.classList.contains('tl-block')) bindDrag(b, c, plan, () => { justDragged = true; });
  });
}

function bindDrag(block, c, plan, onDragged) {
  const { start, end } = plan.blocks.find((x) => x.c.id === c.id);
  const minutes = end - start;
  block.onpointerdown = (down) => {
    if (down.button) return;
    if (down.pointerType === 'touch' && !down.target.closest('.tl-grip')) return;
    let dragging = false;
    let at = start;
    const when = qs('.tl-when', block);
    block.setPointerCapture(down.pointerId);
    block.onpointermove = (e) => {
      const dy = e.clientY - down.clientY;
      if (!dragging && Math.abs(dy) < 5) return;
      dragging = true;
      block.classList.add('dragging');
      at = dragStart(start, minutes, dy / PX, plan.from, plan.to);
      block.style.top = `${(at - plan.from) * PX}px`;
      when.textContent = `${toTime(at)}–${toTime(at + minutes)}`;
    };
    block.onpointercancel = () => {
      block.onpointermove = block.onpointerup = null;
      block.classList.remove('dragging');
      block.style.top = `${(start - plan.from) * PX}px`;
      when.textContent = `${toTime(start)}–${toTime(end)}`;
    };
    block.onpointerup = async () => {
      block.onpointermove = block.onpointerup = null;
      if (!dragging) return;
      onDragged();
      block.classList.remove('dragging');
      if (at === start) return;
      await attempt(() => api('PUT', `/castells/${c.id}`, { plan_time: toTime(at) }));
      render({ keepScroll: true });
    };
  };
}

function planModal(event, castells, c) {
  openModal(`${modalHead(castellName(c))}
    <form id="plan-form">
      <div class="form-grid">
        <label class="field">${t('Hora')}<input name="plan_time" type="time" required value="${esc(c.plan_time || nextPlanTime(c, castells, event))}"></label>
        <label class="field">${t('Minuts')}<input name="plan_minutes" type="number" min="5" max="240" step="5" required value="${c.plan_minutes || PLAN_MINUTES}"></label>
      </div>
      <div class="form-actions">
        <a class="btn" href="#/castell/${c.id}" data-close>${t('Obre el castell')}</a>
        ${c.plan_time ? `<button type="button" class="btn" id="plan-clear">${t("Treu l'hora")}</button>` : ''}
        <button class="btn primary">${t('Desa')}</button>
      </div>
    </form>`, (m) => {
    const save = async (data) => {
      if (!(await attempt(() => api('PUT', `/castells/${c.id}`, data)))) return;
      closeModal();
      toast(t('Horari desat'));
      render({ keepScroll: true });
    };
    qs('#plan-form', m).onsubmit = (e) => { e.preventDefault(); save(formData(e.target)); };
    const clear = qs('#plan-clear', m);
    if (clear) clear.onclick = () => save({ plan_time: null, plan_minutes: null });
  });
}
