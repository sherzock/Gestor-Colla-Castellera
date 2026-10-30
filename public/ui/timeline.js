// Línia de temps de l'assaig, per a qui l'organitza: la tècnica hi posa les hores i la junta les consulta.
import { castellName } from '../castell.js';
import { PLAN_MINUTES, nextPlanTime, planLayout, toTime } from '../planning.js';
import { api, attempt, can, closeModal, esc, formData, modalHead, openModal, qs, qsa, render, t, toast } from './core.js';

const PX = 2.4;
const MIN_HEIGHT = 34;

function item(c, cls, style, body) {
  const hidden = c.hidden ? 'is-hidden' : '';
  return can('castells')
    ? `<button type="button" class="${cls} ${hidden}" style="${style}" data-plan="${c.id}">${body}</button>`
    : `<a class="${cls} ${hidden}" style="${style}" href="#/castell/${c.id}">${body}</a>`;
}

const lane = (blocks, from) => blocks.map(({ c, start, end, col, cols }) => {
  const style = `top:${(start - from) * PX}px;height:${Math.max((end - start) * PX, MIN_HEIGHT)}px;left:${(col / cols) * 100}%;width:${100 / cols}%`;
  return item(c, 'tl-block', style, `<strong>${castellName(c)}</strong><span>${toTime(start)}–${toTime(end)}</span>${c.label ? `<span>${esc(c.label)}</span>` : ''}`);
}).join('');

export function timelineCard(event, castells) {
  if (!castells.length) return '';
  const plan = planLayout(castells, event);
  const scheduled = plan.normal.length + plan.net.length > 0;
  const ticks = [];
  if (scheduled) for (let m = plan.from; m <= plan.to; m += 30) ticks.push(`<span class="tl-tick" style="top:${(m - plan.from) * PX}px">${toTime(m)}</span>`);
  const height = (plan.to - plan.from) * PX;
  return `<div class="card">
    <div class="card-head"><h2>${t("Horari de l'assaig")}</h2><span class="muted small">${t('Només el veuen la tècnica i la junta')}</span></div>
    ${scheduled ? `<div class="tl">
      <div class="tl-axis-head"></div><div class="tl-head">${t('Castells')}</div><div class="tl-head">${t('Castells nets')}</div>
      <div class="tl-axis" style="height:${height}px">${ticks.join('')}</div>
      <div class="tl-lane" style="height:${height}px">${lane(plan.normal, plan.from)}</div>
      <div class="tl-lane" style="height:${height}px">${lane(plan.net, plan.from)}</div>
    </div>` : ''}
    ${plan.unscheduled.length ? `<div class="tl-none">
      <span class="small muted">${t('Sense hora')}</span>
      ${plan.unscheduled.map((c) => item(c, 'btn sm', '', castellName(c))).join('')}
    </div>
    ${can('castells') ? `<p class="small muted" style="margin:8px 0 0">${t('Toca un castell per posar-li hora.')}</p>` : ''}` : ''}
  </div>`;
}

export function bindTimeline(event, castells) {
  qsa('[data-plan]').forEach((b) => (b.onclick = () => planModal(event, castells, castells.find((c) => c.id === Number(b.dataset.plan)))));
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
