// Estadístiques: temporada, tècnica, castells i persones.
import { RESULTS } from '../castell.js';
import { $app, TYPES, api, day, esc, failCauseLabel, fmt, fullName, icon, isAdmin, me, modalHead, norm, openModal, qs, qsa,
  render, resultClass, resultPill, store, t, tn, todayIso, typeLabel } from './core.js';

// ---------- Estadístiques ----------
// Per temporades (cada any natural) o de tota la història, i de totes les sessions, només diades o només assajos.
let statsSeason = String(new Date().getFullYear());
let statsKind = 'all';
let statsTab = store.get('statsTab', 'temporada');
const RESULT_ORDER = ['descarregat', 'carregat', 'intent', 'intent desfet', 'previst'];
const resultName = (r) => (r === 'previst' ? t('Sense resultat') : RESULTS[r]);
const statsQuery = () => `season=${encodeURIComponent(statsSeason)}&kind=${statsKind}`;

function statsFilters(seasons, { kinds: showKinds = true } = {}) {
  const kinds = showKinds ? [['all', t('Tot')], ['diades', t('Diades')], ['assajos', t('Assajos')]] : [];
  return `<div class="toolbar">
    <select id="st-season" style="width:auto" aria-label="${t('Temporada')}">
      ${seasons.map((y) => `<option value="${y}" ${statsSeason === y ? 'selected' : ''}>${t('Temporada {y}', { y })}</option>`).join('')}
      <option value="all" ${statsSeason === 'all' ? 'selected' : ''}>${t('Totes les temporades')}</option>
    </select>
    <div class="tabs seg ${kinds.length ? '' : 'hidden'}" id="st-kind">${kinds.map(([k, l]) => `<button data-k="${k}" class="${statsKind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  </div>`;
}

function bindStatsFilters() {
  qs('#st-season').onchange = (e) => { statsSeason = e.target.value; render({ keepScroll: true }); };
  qsa('#st-kind button').forEach((b) => (b.onclick = () => { statsKind = b.dataset.k; render({ keepScroll: true }); }));
}

// Barra apilada amb la proporció de cada resultat.
function resultsBar(results, scale = null) {
  const total = RESULT_ORDER.reduce((sum, r) => sum + (results[r] || 0), 0);
  if (!total) return '<span class="sbar"></span>';
  const base = scale || total;
  return `<span class="sbar">${RESULT_ORDER.filter((r) => results[r]).map((r) =>
    `<i class="${resultClass(r)}" style="width:${(results[r] / base) * 100}%" title="${esc(resultName(r))}: ${results[r]}"></i>`).join('')}</span>`;
}

const resultsPills = (results) => RESULT_ORDER.filter((r) => results[r])
  .map((r) => `<span class="result ${resultClass(r)}">${esc(resultName(r))} ${results[r]}</span>`).join(' ');

const statTile = (n, label, cls = '', sub = '') =>
  `<div class="stat-tile ${cls}"><strong>${n}</strong><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;

function resultTiles(total, results, extra = '', note = '') {
  return `<div class="stat-tiles">
    ${statTile(total, t('Castells'))}
    ${statTile(results.descarregat, RESULTS.descarregat, 'r-descarregat')}
    ${statTile(results.carregat, RESULTS.carregat, 'r-carregat')}
    ${statTile(results.intent + results['intent desfet'], t('Intents'), 'r-intent', results['intent desfet'] ? t('{n} desfets', { n: results['intent desfet'] }) : '')}
    ${extra}
  </div>
  ${total ? `<div class="card results-summary">${resultsBar(results)}<div class="pills">${resultsPills(results)}</div>${note ? `<p class="small muted" style="margin:8px 0 0">${note}</p>` : ''}</div>` : ''}`;
}

function personStatsHtml(st) {
  const sessions = Object.values(st.sessions).reduce((a, b) => a + b, 0);
  const sessionsSub = TYPES.filter((k) => st.sessions[k]).map((k) => `${typeLabel(k)} ${st.sessions[k]}`).join(' · ');
  const head = resultTiles(st.total, st.results, statTile(sessions, t('Sessions'), '', sessionsSub),
    t('Com han acabat els castells on has estat. El resultat és de tota la colla, no de cada persona.'));
  if (!st.total) return `${head}<div class="card"><p class="muted" style="margin:0">${t('No hi ha castells en aquest període.')}</p></div>`;
  const maxPos = st.byPosition[0]?.n || 1;
  return `${head}
    <div class="grid-2">
      <div class="card">
        <h2 style="margin-bottom:12px">${t('Per castell')}</h2>
        <div class="table-wrap"><table class="responsive stats-table">
          <thead><tr><th>${t('Castell')}</th><th class="num">${t('Vegades')}</th><th>${t('Posicions')}</th><th>${t('Com han acabat')}</th></tr></thead>
          <tbody>${st.byCastell.map((c) => `<tr>
            <td class="lead"><span class="castell-tag">${esc(c.castell)}</span>${c.partial ? `<span class="sub">${tn(c.partial, '{n} parcial', '{n} parcials')}</span>` : ''}</td>
            <td class="num" data-l="${t('Vegades')}">${c.n}</td>
            <td data-l="${t('Posicions')}"><ul class="pos-lines">${c.positions.map((p) => `<li>${esc(p.cat)} <span class="muted">×${p.n}</span></li>`).join('')}</ul></td>
            <td data-l="${t('Com han acabat')}"><div class="pills">${resultsPills(c.results)}</div></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card">
        <h2 style="margin-bottom:12px">${t('Per posició')}</h2>
        <div class="bars">${st.byPosition.map((p) => `<div class="bar-row">
          <span class="nm">${esc(p.cat)}</span>${resultsBar(p.results, maxPos)}<span class="num">${p.n}×</span><span></span>
        </div>`).join('')}</div>
        <p class="small muted" style="margin:10px 0 0">${t('El color de cada barra mostra com van acabar els castells en aquella posició.')}</p>
      </div>
    </div>
    <div class="card">
      <h2 style="margin-bottom:12px">${t('Últims castells')}</h2>
      <ul class="recent">${st.recent.map((r) => `<li><a href="#/castell/${r.castell_id}"><span class="castell-tag ${resultClass(r.result)}">${esc(r.castell)}</span> ${esc(r.role)}</a>
        <span class="small muted">${fmt(r.date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${esc(r.title)}${r.result !== 'previst' ? ` · ${esc(resultName(r.result))}` : ''}${r.partial ? ` · ${t('parcial')}` : ''}</span></li>`).join('')}</ul>
    </div>`;
}

function statsTabs() {
  const tabs = isAdmin()
    ? [['temporada', t('Temporada')], ['tecnica', t('Tècnica')], ['castells', t('Castells')], ['persones', t('Persones')]]
    : [['temporada', t('Temporada')], ['meves', t('Les meves')]];
  if (!tabs.some(([k]) => k === statsTab)) statsTab = 'temporada';
  return `<div class="tabs" id="st-tab">${tabs.map(([k, l]) => `<button data-t="${k}" class="${statsTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
const bindStatsTabs = () => qsa('#st-tab button').forEach((b) => (b.onclick = () => { statsTab = b.dataset.t; store.set('statsTab', statsTab); render(); }));

export async function pageStats() {
  const tabs = statsTabs();
  if (statsTab === 'meves') return pagePersonStats(me.id, tabs);
  if (statsTab === 'temporada') return pageSeason(tabs);
  if (statsTab === 'tecnica') return pageTecnica(tabs);
  const people = statsTab === 'persones';
  const data = await api('GET', `/stats/${people ? 'people' : 'castells'}?${statsQuery()}`);
  $app.innerHTML = `
    <div class="page-head"><h1>${t('Estadístiques')}</h1><div class="actions">${tabs}</div></div>
    ${statsFilters(data.seasons)}
    <div class="stats-body">${people ? peopleStatsHtml(data) : castellStatsHtml(data)}</div>`;
  bindStatsFilters();
  bindStatsTabs();

  if (people) {
    qs('#st-q').oninput = (e) => {
      const q = norm(e.target.value.trim());
      qsa('#st-people tbody tr').forEach((tr) => tr.classList.toggle('hidden', q && !tr.dataset.name.includes(q)));
    };
    qsa('#st-people tbody tr').forEach((tr) => (tr.onclick = () => { location.hash = `#/estadistiques/persona/${tr.dataset.id}`; }));
  } else {
    qsa('#st-castells tbody tr').forEach((tr) => (tr.onclick = () => attemptsModal(data.castells[Number(tr.dataset.i)])));
  }
}

// Estadístiques per a la tècnica. Un castell és de tota la colla: no es mira qui ha fallat,
// sinó què acompanya els bons resultats, com progressa cada castell, on falla i quanta gent sap fer cada posició.
const outcomeBar = (b) => resultsBar({ descarregat: b.descarregat, carregat: b.carregat, intent: b.caigut });
const FEW_ATTEMPTS = 5;

let reserveCastell = null;
let progressCastell = null;
async function pageTecnica(tabs) {
  const st = await api('GET', `/stats/tecnica?${statsQuery()}`);
  const pct = (b) => (b.n ? `${Math.round((b.descarregat / b.n) * 100)}%` : '—');
  const factorRows = (label, b) => `<div class="factor-row">
    <span class="lbl">${label}</span>
    ${b.n ? outcomeBar(b) : '<span class="sbar"></span>'}
    <span class="num"><strong>${pct(b)}</strong> <span class="muted small">${tn(b.n, '{n} intent', '{n} intents')}</span></span>
  </div>`;
  const FACTORS = [
    ['stability', t('Tronc'), t("Repetit (com a mínim 3 de cada 4 posicions, igual que l'últim cop)"), t('Amb canvis')],
    ['experience', t('Experiència'), t('Gairebé tot el tronc ja havia fet la seva posició'), t('Amb gent nova a la seva posició')],
    ['pinya', 'Pinya', t('Plena (90% o més)'), t('Incompleta')],
    ['level', t('Espatlles'), t('Cada pis anivellat (5 cm o menys de diferència)'), t('Algun pis desnivellat')],
    ['weight', t('Pes'), t('Ningú pesa més que qui el porta'), t('Algú pesa més que qui el porta')],
  ];
  const factorCards = FACTORS.map(([k, title, hi, lo]) => {
    const f = st.factors[k];
    const few = f.high.n + f.low.n > 0 && (f.high.n < FEW_ATTEMPTS || f.low.n < FEW_ATTEMPTS);
    return `<div class="card factor">
      <h3>${title}</h3>
      ${factorRows(hi, f.high)}${factorRows(lo, f.low)}
      ${few ? `<p class="small muted" style="margin:6px 0 0">${t('Encara hi ha pocs intents: pot ser casualitat.')}</p>` : ''}
    </div>`;
  }).join('');

  // Una columna per mes amb quants intents n'hi ha de cada resultat.
  const monthColumns = (attempts) => {
    const months = new Map();
    for (const a of attempts) {
      const m = months.get(a.date.slice(0, 7)) || { ok: 0, warn: 0, bad: 0, partial: 0, diades: 0 };
      m[a.result === 'descarregat' ? 'ok' : a.result === 'carregat' ? 'warn' : 'bad']++;
      if (a.partial) m.partial++;
      if (a.type !== 'assaig') m.diades++;
      months.set(a.date.slice(0, 7), m);
    }
    // Petit gràfic de columnes: totes comparteixen la base i els anys van agrupats a sobre.
    const BAR_H = 150;
    const max = Math.max(...[...months.values()].map((m) => m.ok + m.warn + m.bad));
    const byYear = new Map();
    for (const [k, m] of months) byYear.set(k.slice(0, 4), [...(byYear.get(k.slice(0, 4)) || []), [k, m]]);
    // Cada tram porta el seu número quan hi cap.
    const seg = (cls, n) => {
      if (!n) return '';
      return `<i class="${cls}" style="flex:${n}">${(n / max) * (BAR_H - 16) >= 15 ? n : ''}</i>`;
    };
    const col = ([k, m]) => {
      const n = m.ok + m.warn + m.bad;
      const date = `${k}-15`;
      const tip = [fmt(date, { month: 'long', year: 'numeric' }), tn(n, '{n} intent', '{n} intents'),
        m.ok ? tn(m.ok, '{n} descarregat', '{n} descarregats') : null, m.warn ? tn(m.warn, '{n} carregat', '{n} carregats') : null,
        m.bad ? tn(m.bad, '{n} caigut', '{n} caiguts') : null, m.partial ? tn(m.partial, '{n} parcial', '{n} parcials') : null,
        m.diades ? tn(m.diades, '{n} a diada', '{n} a diades') : null].filter(Boolean).join(' · ');
      return `<div class="tl-col ${m.diades ? 'has-diada' : ''}" title="${esc(tip)}">
        <div class="tl-bar-area" style="height:${BAR_H}px"><span class="tl-total">${n}</span>
          <span class="tl-bar" style="height:${Math.max(6, (n / max) * (BAR_H - 16))}px">${seg('bad', m.bad)}${seg('warn', m.warn)}${seg('ok', m.ok)}</span></div>
        <span class="tl-m">${fmt(date, { month: 'short' }).replace('.', '')}</span>
      </div>`;
    };
    return `<div class="tl-chart">${[...byYear].map(([y, list]) => `<div class="tl-year" style="flex:${list.length}">
      ${byYear.size > 1 ? `<div class="tl-year-label">${y}</div>` : ''}<div class="tl-cols">${list.map(col).join('')}</div></div>`).join('')}</div>`;
  };
  // On falla: a quin pis van fallar els intents no descarregats, de dalt a baix, i què hi va passar.
  const failText = (f) => [f.label, failCauseLabel(f.cause)].filter(Boolean).join(', ');
  const failBody = (f) => {
    if (!f?.failed) return '';
    const max = Math.max(1, ...f.levels.map((l) => l.n));
    const causes = (c) => Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${failCauseLabel(k)} ${n}`).join(' · ');
    return `<h3 style="margin:16px 0 6px">${t('On falla')}</h3>
      ${f.levels.length ? `<div class="bars">${f.levels.map((l) => `<div class="bar-row">
        <span class="nm">${esc(l.label || String(l.level))}</span><span class="bar"><i style="width:${(l.n / max) * 100}%;background:var(--c-bad)"></i></span><span class="num">${l.n}×</span><span></span>
        ${Object.keys(l.causes).length ? `<span class="small muted last">${causes(l.causes)}</span>` : ''}
      </div>`).join('')}</div>` : ''}
      <p class="small muted" style="margin:8px 0 0">${tn(f.failed, '{n} intent no descarregat', '{n} intents no descarregats')}${f.unknown ? ` · ${t('a {n} no consta on va fallar', { n: f.unknown })}` : ''}</p>`;
  };
  // Com avança un castell concret (es tria al desplegable).
  if (!st.castells.some((c) => c.castell === progressCastell)) progressCastell = st.castells[0]?.castell;
  const prog = st.castells.find((c) => c.castell === progressCastell);
  const pctOrDash = (n) => (n != null ? `${n}%` : '—');
  // Els últims intents ja porten la seva nota; a sota només les notes d'intents més antics.
  const recent = prog ? prog.attempts.slice(-6).reverse() : [];
  const olderNotes = prog ? prog.notes.filter((n) => !recent.some((a) => a.castell_id === n.castell_id)).slice(0, 3) : [];
  const progressBody = prog ? `
    <select id="progress-castell" style="margin-bottom:12px">${st.castells.map((c) => `<option value="${esc(c.castell)}" ${c.castell === progressCastell ? 'selected' : ''}>${esc(c.castell)} · ${tn(c.attempts.length, '{n} intent', '{n} intents')}</option>`).join('')}</select>
    <div class="stat-tiles prog-tiles">
      ${statTile(prog.full, t('Intents sencers'), '', prog.partials ? tn(prog.partials, '+ {n} prova parcial', '+ {n} proves parcials') : '')}
      ${statTile(prog.tilFirst ?? '—', t('Fins al primer descarregat'), '', !prog.tilFirst && prog.full ? t('encara sense descarregar') : '')}
      ${statTile(pctOrDash(prog.assajos), t('Descarregats a assajos'), 'r-descarregat')}
      ${statTile(pctOrDash(prog.diades), t('Descarregats a diades'), 'r-descarregat')}
    </div>
    ${monthColumns(prog.attempts)}
    <div class="legend"><span><i style="background:var(--c-ok)"></i>${t('Descarregat')}</span><span><i style="background:var(--c-warn)"></i>${t('Carregat')}</span><span><i style="background:var(--c-bad)"></i>${t('Caigut')}</span><span><i style="background:transparent;outline:2px solid var(--ink-3);outline-offset:1px"></i>${t('Mes amb diada')}</span></div>
    ${failBody(prog.fails)}
    <h3 style="margin:16px 0 6px">${t('Últims intents')}</h3>
    <ul class="recent-attempts">${recent.map((a) => `<li><a href="#/castell/${a.castell_id}">
      <span class="small muted">${fmt(a.date, a.date.slice(0, 4) === todayIso().slice(0, 4) ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: '2-digit' })}</span>
      <span>${esc(a.title)}${a.range ? ` <span class="small muted">· ${esc(a.range)}</span>` : ''}${a.fail && a.result !== 'descarregat' ? ` <span class="small muted">· ${esc(failText(a.fail))}</span>` : ''}</span>${resultPill(a.result)}</a>
      ${a.notes ? `<div class="small muted">${esc(a.notes)}</div>` : ''}</li>`).join('')}</ul>
    ${olderNotes.length ? `<h3 style="margin:16px 0 6px">${t('Notes anteriors')}</h3>
      <ul class="tech-note-list">${olderNotes.map((a) => `<li><a href="#/castell/${a.castell_id}" class="muted">${fmt(a.date, { day: 'numeric', month: 'short' })}</a> ${esc(a.notes)}</li>`).join('')}</ul>` : ''}` : '';

  // Recanvis d'un castell concret: la mateixa posició no és igual en castells diferents.
  if (!st.reserves.some((r) => r.castell === reserveCastell)) reserveCastell = st.reserves[0]?.castell;
  const res = st.reserves.find((r) => r.castell === reserveCastell);
  const who = (list) => list.map((p) => `<a href="#/estadistiques/persona/${p.id}">${esc(p.name)} <span class="muted">×${p.n}</span></a>`).join('');
  const reserveRows = res ? res.positions.map((p) => `<li class="${p.few ? 'risk' : ''}">
      <div class="prog-head"><strong>${esc(p.role)}</strong>
        <span class="small muted">${tn(p.people.length, '{n} persona', '{n} persones')}</span>
        ${p.few ? `<span class="status no">${t('Poca gent')}</span>` : ''}</div>
      <div class="names">${p.people.length ? who(p.people.slice(0, 8)) : `<span class="muted small">${t('Ningú encara')}</span>`}${p.people.length > 8 ? `<span class="muted small">+${p.people.length - 8}</span>` : ''}</div>
      ${p.suggest.length ? `<div class="suggest small"><span class="muted">${t('Es podria preparar:')}</span> ${p.suggest.map((x) => `<a href="#/estadistiques/persona/${x.id}">${esc(x.name)}${x.n ? ` <span class="muted">${x.n === 1 ? t('{n} cop a {cat}', { n: 1, cat: esc(p.cat) }) : t('{n} cops a {cat}', { n: x.n, cat: esc(p.cat) })}</span>` : ''}</a>`).join('')}</div>` : ''}
    </li>`).join('') : '';

  const prepRows = st.prep.map((c) => {
    const pctR = c.placed ? Math.round((c.rehearsed / c.placed) * 100) : 0;
    return `<li><a href="#/castell/${c.castell_id}" class="prep-row">
      <span class="castell-tag">${esc(c.castell)}</span>
      <span class="small muted">${fmt(c.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${esc(c.title)}</span>
      <span class="prep-bar"><i class="${pctR >= 75 ? 'ok' : pctR >= 50 ? 'warn' : 'bad'}" style="width:${pctR}%"></i></span>
      <span class="small"><strong>${c.rehearsed}/${c.placed}</strong> ${t("l'han assajat")}${c.placed < c.total ? ` · ${t('{n} sense posar', { n: c.total - c.placed })}` : ''}${c.noRelief ? ` · <span class="bad-text">${tn(c.noRelief, '{n} sense relleu', '{n} sense relleu')}</span>` : ''}</span>
    </a></li>`;
  }).join('');

  $app.innerHTML = `
    <div class="page-head"><h1>${t('Estadístiques')}</h1><div class="actions">${tabs}</div></div>
    ${statsFilters(st.seasons)}
    <div class="stats-body">
      ${prepRows ? `<div class="card">
        <h2 style="margin-bottom:6px">${t('Preparació de les properes diades')}</h2>
        <p class="small muted" style="margin:0 0 12px">${t("Quanta gent del tronc ha assajat la seva posició d'aquest castell les últimes 6 setmanes.")}</p>
        <ul class="prep-list">${prepRows}</ul>
      </div>` : ''}
      <div>
        <h2 class="section-h">${t('Què acompanya els castells descarregats')}</h2>
        <div class="factor-grid">${factorCards}</div>
        <p class="small muted" style="margin:8px 0 0">${t('El percentatge és de castells descarregats. Verd: descarregat · groc: carregat · vermell: caigut.')} ${t("Espatlles i pes es miren amb les mides actuals de cada persona.")}</p>
      </div>
      <div class="grid-2">
        <div class="card">
          <h2 style="margin-bottom:6px">${t('Com avança cada castell')}</h2>
          <p class="small muted" style="margin:0 0 12px">${t("Tria un castell. Cada columna és un mes i diu quants intents n'hi ha hagut de cada resultat.")}</p>
          ${progressBody || `<p class="muted small">${t('No hi ha castells en aquest període.')}</p>`}
        </div>
        <div class="card">
          <h2 style="margin-bottom:6px">${t('Recanvis per a cada castell')}</h2>
          <p class="small muted" style="margin:0 0 10px">${t("Qui ha fet cada posició del tronc en aquest castell. Si poca gent ho ha fet sovint, un dia que falti costarà cobrir-ho. Les propostes són persones d'alçada d'espatlles i pes semblants.")}</p>
          ${st.reserves.length ? `<select id="reserve-castell" style="margin-bottom:12px">${st.reserves.map((r) => `<option value="${esc(r.castell)}" ${r.castell === reserveCastell ? 'selected' : ''}>${esc(r.castell)} · ${tn(r.attempts, '{n} intent', '{n} intents')}</option>`).join('')}</select>
            <ul class="prog-list">${reserveRows}</ul>` : `<p class="muted small">${t('No hi ha castells en aquest període.')}</p>`}
        </div>
      </div>
    </div>`;
  bindStatsFilters();
  bindStatsTabs();
  // Si el gràfic per mesos no hi cap (mòbil), comença pels mesos més recents.
  qsa('.tl-chart').forEach((el) => { el.scrollLeft = el.scrollWidth; });
  qs('#progress-castell')?.addEventListener('change', (e) => { progressCastell = e.target.value; render({ keepScroll: true }); });
  qs('#reserve-castell')?.addEventListener('change', (e) => { reserveCastell = e.target.value; render({ keepScroll: true }); });
}

// Resum de temporada: el veu tothom, perquè només parla de castells i sessions (cap dada de ningú).
async function pageSeason(tabs) {
  const st = await api('GET', `/stats/season?season=${encodeURIComponent(statsSeason)}`);
  const att = st.attendance;
  const short = (d) => fmt(d, { day: 'numeric', month: 'short' });
  const castellLink = (c, cls) => `<li><a href="#/castell/${c.castell_id}"><span class="castell-tag ${cls}">${esc(c.castell)}</span></a>
    <span class="small muted">${t('Primer cop: {date}', { date: `${short(c.date)} · ${esc(c.title)}` })}</span></li>`;
  const attTile = (type, label) => att[type].sessions
    ? statTile(att[type].average, label, '', `${tn(att[type].sessions, '{n} sessió', '{n} sessions')}${att[type].max ? ` · ${t('màx. {n}', { n: att[type].max.n })}` : ''}`)
    : '';
  const best = st.descarregats[0];
  $app.innerHTML = `
    <div class="page-head"><h1>${t('Estadístiques')}</h1><div class="actions">${tabs}</div></div>
    ${statsFilters(st.seasons, { kinds: false })}
    <div class="stats-body">
      ${best ? `<div class="card season-hero">
        <span class="small muted">${statsSeason === 'all' ? t('Millor castell de la història') : t('Millor castell de la temporada')}</span>
        <a href="#/castell/${best.castell_id}" class="big-castell r-descarregat">${esc(best.castell)}</a>
        <span class="muted">${RESULTS.descarregat} · ${short(best.date)} · ${esc(best.title)}</span>
      </div>` : ''}
      ${resultTiles(st.total, st.results)}
      ${att.assaig.sessions || att.diada.sessions || att.esdeveniment.sessions ? `<div>
        <h2 class="section-h">${t('Mitjana de gent per sessió')}</h2>
        <div class="stat-tiles">${attTile('assaig', t('Assajos'))}${attTile('diada', t('Diades'))}${attTile('esdeveniment', t('Esdeveniments'))}</div>
      </div>` : ''}
      ${st.total ? `<div class="grid-2">
        <div class="card">
          <h2 style="margin-bottom:12px">${t('Castells descarregats')} <span class="muted small">${st.descarregats.length}</span></h2>
          ${st.descarregats.length ? `<ul class="recent">${st.descarregats.map((c) => castellLink(c, 'r-descarregat')).join('')}</ul>` : `<p class="muted small">${t('Encara cap aquesta temporada.')}</p>`}
          ${st.carregats.filter((c) => !st.descarregats.some((d) => d.castell === c.castell)).length ? `<h3 class="instr-h" style="margin-top:14px">${t('Només carregats')}</h3>
            <ul class="recent">${st.carregats.filter((c) => !st.descarregats.some((d) => d.castell === c.castell)).map((c) => castellLink(c, 'r-carregat')).join('')}</ul>` : ''}
        </div>
        <div class="card">
          <h2 style="margin-bottom:12px">${t('Diades')}</h2>
          ${st.diades.length ? `<ul class="diada-list">${st.diades.map((d) => `<li>
            <a href="#/sessio/${d.id}"><strong>${esc(d.title)}</strong></a><span class="small muted">${fmt(d.date, { day: 'numeric', month: 'long' })}</span>
            <div class="event-castells">${d.castells.map((c) => `<a href="#/castell/${c.id}" class="castell-tag ${resultClass(c.result)}" title="${esc(resultName(c.result))}">${esc(c.castell)}${c.partial ? '*' : ''}</a>`).join('')}</div>
          </li>`).join('')}</ul>` : `<p class="muted small">${t('Cap diada amb castells aquesta temporada.')}</p>`}
        </div>
      </div>` : `<div class="card"><p class="muted" style="margin:0">${t('No hi ha castells en aquest període.')}</p></div>`}
    </div>`;
  bindStatsFilters();
  bindStatsTabs();
}

function castellStatsHtml(data) {
  if (!data.total) return `${resultTiles(0, data.results)}<div class="card"><p class="muted" style="margin:0">${t('No hi ha castells en aquest període.')}</p></div>`;
  const cell = (n, l) => `<td class="num" data-l="${l}">${n || '<span class="muted">—</span>'}</td>`;
  // «Sense resultat» només surt si hi ha algun castell passat que no s'ha marcat.
  const cols = RESULT_ORDER.filter((r) => r !== 'previst' || data.results.previst);
  return `${resultTiles(data.total, data.results)}
    <div class="card"><div class="table-wrap"><table class="responsive stats-table" id="st-castells">
      <thead><tr><th>${t('Castell')}</th><th class="num">${t('Total')}</th>${cols.map((r) => `<th class="num">${esc(resultName(r))}</th>`).join('')}
        <th class="num">${t('Diades')}</th><th class="num">${t('Assajos')}</th><th>${t('Primer descarregat')}</th></tr></thead>
      <tbody>${data.castells.map((c, i) => `<tr class="clickable" data-i="${i}">
        <td class="lead"><span class="castell-tag">${esc(c.castell)}</span>${c.partial ? `<span class="sub">${tn(c.partial, '{n} parcial', '{n} parcials')}</span>` : ''}${resultsBar(c.results)}</td>
        ${cell(c.n, t('Total'))}${cols.map((r) => cell(c.results[r], esc(resultName(r)))).join('')}
        ${cell(c.diades, t('Diades'))}${cell(c.assajos, t('Assajos'))}
        <td data-l="${t('Primer descarregat')}">${c.firstDescarregat ? fmt(c.firstDescarregat, { day: 'numeric', month: 'short', year: 'numeric' }) : '<span class="muted">—</span>'}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted">${t('Toca un castell per veure cada vegada que s\'ha fet. Les proves parcials compten, però no per al primer descarregat.')}</p></div>`;
}

function attemptsModal(c) {
  openModal(`${modalHead(esc(c.castell))}
    <div class="pills" style="margin-bottom:12px">${resultsPills(c.results)}</div>
    <ul class="recent">${c.attempts.map((a) => `<li><a href="#/castell/${a.castell_id}"><span class="castell-tag ${resultClass(a.result)}">${esc(c.castell)}</span> ${esc(resultName(a.result))}${a.partial ? ` · ${t('parcial')}` : ''}</a>
      <span class="small muted">${fmt(a.date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${esc(a.title)}${a.label ? ` · ${esc(a.label)}` : ''}</span></li>`).join('')}</ul>`);
}

function peopleStatsHtml(data) {
  const cell = (n, l) => `<td class="num" data-l="${l}">${n || '<span class="muted">—</span>'}</td>`;
  return `<div class="card">
    <input type="search" id="st-q" placeholder="${t('Cerca…')}" style="max-width:280px;margin-bottom:12px">
    <div class="table-wrap"><table class="responsive stats-table" id="st-people">
      <thead><tr><th>${t('Persona')}</th><th class="num">${t('Castells')}</th><th class="num">${RESULTS.descarregat}</th><th class="num">${RESULTS.carregat}</th>
        <th class="num">${t('Intents')}</th><th class="num">${t('Sessions')}</th><th>${t('Posició més feta')}</th></tr></thead>
      <tbody>${data.people.map((p) => `<tr class="clickable ${p.active ? '' : 'inactive'}" data-id="${p.id}" data-name="${esc(norm(p.name + ' ' + (p.alias || '')))}">
        <td class="lead">${p.alias ? `<strong>${esc(p.alias)}</strong> <span class="muted">· ${esc(p.name)}</span>` : esc(p.name)}</td>
        ${cell(p.castells, t('Castells'))}${cell(p.results.descarregat, RESULTS.descarregat)}${cell(p.results.carregat, RESULTS.carregat)}
        ${cell(p.results.intent + p.results['intent desfet'], t('Intents'))}${cell(p.sessions, t('Sessions'))}
        <td data-l="${t('Posició més feta')}">${p.top ? `${esc(p.top.cat)} <span class="muted">×${p.top.n}</span>` : '<span class="muted">—</span>'}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted">${t('Toca una persona per veure les seves estadístiques. «Sessions» compta les sessions on ha vingut.')}</p></div>`;
}

export async function pagePersonStats(id, tabs = '') {
  id = Number(id);
  if (!isAdmin() && id !== me.id) { location.hash = '#/estadistiques'; return; }
  const st = await api('GET', `/stats/people/${id}?${statsQuery()}`);
  const own = id === me.id;
  $app.innerHTML = `
    ${isAdmin() ? `<a class="back" href="#/estadistiques">${icon.back}${t('Estadístiques')}</a>` : ''}
    <div class="page-head"><h1>${tabs ? t('Estadístiques') : own ? t('Les meves estadístiques') : esc(fullName(st.person))}</h1>${tabs ? `<div class="actions">${tabs}</div>` : ''}</div>
    ${statsFilters(st.seasons)}
    <div class="stats-body">${personStatsHtml(st)}</div>`;
  bindStatsFilters();
  bindStatsTabs();
}
