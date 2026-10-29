// Calendari mensual i subscripció al calendari del mòbil.
import { $app, LOCALE, TYPES, api, config, copyText, day, esc, fmt, icon, isAdmin, lang, me, modalHead, openModal,
  qs, qsa, statusPill, store, t, todayIso, typeBadge } from './core.js';
import { eventModal } from './sessions.js';

// ---------- Calendari (admins) ----------
// Vista mensual de totes les sessions. Tocar un dia buit obre «Nova sessió» amb aquella data.
let calMonth = todayIso().slice(0, 7);
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); return isoOf(new Date(y, m - 1 + n, 1)).slice(0, 7); };

export async function pageCalendar(ym) {
  if (ym) calMonth = ym;
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  // Setmanes de dilluns a diumenge.
  const start = new Date(y, m - 1, 1 - ((first.getDay() + 6) % 7));
  const end = new Date(y, m - 1, last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  const events = await api('GET', `/events?from=${isoOf(start)}&to=${isoOf(end)}`);
  const byDay = {};
  for (const e of events) (byDay[e.date] ??= []).push(e);
  const days = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(isoOf(d));
  const today = todayIso();
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(LOCALE[lang], { weekday: 'short' }));
  const monthName = first.toLocaleDateString(LOCALE[lang], { month: 'long', year: 'numeric' });
  const title = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const monthEvents = events.filter((e) => e.date.startsWith(calMonth));

  $app.innerHTML = `
    <div class="page-head"><h1>${t('Calendari')}</h1>
      <div class="actions"><button class="btn" id="cal-subscribe">${icon.calAdd}${t('Al meu calendari')}</button>${isAdmin() ? `<button class="btn primary" id="new-event">${icon.plus}${t('Nova sessió')}</button>` : ''}</div></div>
    <div class="cal-head">
      <button class="btn sm" id="cal-prev" aria-label="${t('Mes anterior')}">‹</button>
      <h2 class="cal-title">${esc(title)}</h2>
      <button class="btn sm" id="cal-next" aria-label="${t('Mes següent')}">›</button>
      <button class="btn sm ghost" id="cal-today">${t('Avui')}</button>
      <div class="cal-legend">${TYPES.map(typeBadge).join('')}</div>
    </div>
    <div class="card cal">
      <div class="cal-grid">
        ${weekdays.map((w) => `<div class="cal-wd">${esc(w)}</div>`).join('')}
        ${days.map((d) => `<div class="cal-day ${isAdmin() ? 'add' : ''} ${d.startsWith(calMonth) ? '' : 'out'} ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}" data-date="${d}">
          <span class="cal-n">${Number(d.slice(8))}</span>
          ${(byDay[d] || []).map((e) => `<a class="cal-ev ${e.type} ${e.date >= today && !e.my_status ? 'pending' : ''}" href="#/sessio/${e.id}" title="${esc(`${e.start_time || ''} ${e.title}`)}">${e.start_time ? `<b>${e.start_time}</b> ` : ''}${esc(e.title)}</a>`).join('')}
        </div>`).join('')}
      </div>
      ${isAdmin() ? `<p class="small muted" style="margin:10px 0 0">${t('Toca un dia buit per crear-hi una sessió.')}</p>` : ''}
    </div>
    <div class="card cal-agenda">
      <h2 style="margin-bottom:10px">${t('Aquest mes')}</h2>
      ${monthEvents.length ? `<ul class="recent">${monthEvents.map((e) => `<li><a href="#/sessio/${e.id}">${typeBadge(e.type)} ${esc(e.title)}</a>
        <span class="small muted">${fmt(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}${e.start_time ? ` · ${e.start_time}` : ''}${e.location ? ` · ${esc(e.location)}` : ''}</span>
        ${e.date >= today ? `<span>${statusPill(e.my_status)}</span>` : ''}</li>`).join('')}</ul>`
        : `<p class="muted" style="margin:0">${t('No hi ha sessions aquest mes.')}</p>`}
    </div>`;

  qs('#cal-prev').onclick = () => { location.hash = `#/calendari/${shiftMonth(calMonth, -1)}`; };
  qs('#cal-next').onclick = () => { location.hash = `#/calendari/${shiftMonth(calMonth, 1)}`; };
  qs('#cal-today').onclick = () => { location.hash = `#/calendari/${today.slice(0, 7)}`; };
  qs('#cal-subscribe').onclick = calendarModal;
  if (!isAdmin()) return;
  qs('#new-event').onclick = () => eventModal(null, { date: calMonth === today.slice(0, 7) ? today : `${calMonth}-01` });
  qsa('.cal-day').forEach((cell) => (cell.onclick = (e) => { if (!e.target.closest('a')) eventModal(null, { date: cell.dataset.date }); }));
}

// Subscripció al calendari del mòbil: l'app de calendari llegeix sola les sessions i les manté al dia.
export const calendarCode = (sep) => (config.needsCode && store.get('collaCode', '') ? `${sep}code=${encodeURIComponent(store.get('collaCode', ''))}` : '');
function calendarModal() {
  const musics = isAdmin() || me.instrument ? 'musics=1' : '';
  const query = [musics, calendarCode('').slice(0)].filter(Boolean).join('&');
  const url = `${location.origin}/api/calendar.ics${query ? `?${query}` : ''}`;
  const webcal = url.replace(/^https?:/, 'webcal:');
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  openModal(`${modalHead(t('Les sessions al teu calendari'))}
    <p class="muted" style="margin-top:0">${t("Les sessions de la colla sortiran al calendari del teu mòbil, i s'actualitzaran soles quan se n'afegeixin o canviïn.")}</p>
    <div class="stack">
      <a class="btn primary block" href="${esc(webcal)}">${icon.calAdd}${t('iPhone, iPad o Mac')}</a>
      <a class="btn primary block" href="${esc(google)}" target="_blank" rel="noopener">${icon.calAdd}${t('Android o Google Calendar')}</a>
      <button class="btn block" id="copy-cal">${icon.copy}${t("Copia l'enllaç (altres calendaris)")}</button>
    </div>
    <p class="small muted" style="margin-bottom:0">${t("A l'iPhone, toca «Subscriure't». A Google, toca «Afegeix»: els canvis poden trigar unes hores a arribar-hi.")}</p>`, (m) => {
    qs('#copy-cal', m).onclick = () => copyText(url);
  });
}
