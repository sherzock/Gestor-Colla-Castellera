// Visualitzador d'un castell: tronc, pinya, llista, mides, historial, revisió de l'alineació i assignar posicions.
import { LEVEL_PLURAL, RESULTS, SHOULDER_GAP_CM, buildStructure, castellName, inTroncView, levelGaps, levelNames, levelRange,
  troncLoad, weightInversions } from '../castell.js';
import { boxShort } from '../editor.js';
import { proposeLineup } from '../muntador.js';
import { openZoom } from '../zoom.js';
import { castellModal } from './castell-form.js';
import { $app, FAIL_CAUSES, INSTRUMENTS, age, api, attempt, closeModal, day, esc, failCauseLabel, fmt, formData,
  fullName, hiddenBadge, hiddenToggle, icon, isAdmin, me, modalHead, norm, openModal, partialLabel, qs, qsa, render,
  resultClass, resultLabel, resultPill, shortName, statusPill, store, t, tn, toast, todayIso } from './core.js';
import { guestModal } from './event.js';

// ---------- Visualitzador de castell ----------
const KIND_LABEL = { base: 'Baix', crossa: 'Crossa', contrafort: 'Contrafort', agulla: 'Agulla', vent: 'Vents', mans: 'Mans', lateral: 'Laterals', latmans: 'Laterals de mans', altre: 'Altres' };
let castellView = store.get('castellView', 'tronc');
let selectedPerson = null;
let searchQuery = '';
let pendingFocus = null;
let proposal = null;
let lastCastellId = null;

const namesAttr = (...people) => esc(norm(people.filter(Boolean).map((p) => [p.name, p.alias, p.guest_name].join(' ')).join(' ')));

export function assignedName(a, short = false) {
  if (!a) return '';
  if (a.guest_name) return short ? a.guest_name : t('{name} (temporal)', { name: a.guest_name });
  return short ? shortName(a) : (a.alias || a.name);
}
const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function proposalMeta(a, p) {
  if (a.exact) return `<span class="meta">${t('{n}× aquí', { n: a.exact })}</span>`;
  if (a.cat) return `<span class="meta">${a.cat}× ${esc(p.cat)}</span>`;
  return `<span class="meta warn">${t('sense experiència')}</span>`;
}

// Color de cada posició (el mateix a totes les vistes): tronc per grups, pinya pel tipus de caixa.
const GROUP_VAR = { baixos: 'var(--k-baix)', tronc: 'var(--k-tronc)', pom: 'var(--k-pom)', agulla: 'var(--k-agulla)', musica: 'var(--k-musica)' };
const colorOf = (p) => GROUP_VAR[p.group] || KIND_VAR[p.kind] || 'var(--ink-3)';

function posCell(p, byKey, ctx) {
  const a = byKey.get(p.key);
  const mine = a && a.person_id === me.id;
  let meta = '';
  if (a?.proposed) meta = proposalMeta(a, p);
  else if (ctx.admin && a && !a.guest_name && (a.shoulder_height_cm || a.height_cm)) {
    meta = `<span class="meta">${a.shoulder_height_cm ? `esp. ${a.shoulder_height_cm}` : ''}${a.shoulder_height_cm && a.height_cm ? ' · ' : ''}${a.height_cm ? `${a.height_cm} cm` : ''}</span>`;
  }
  return `<button class="pos g-${p.group} ${p.kind ? `k-${p.kind}` : ''} ${a ? '' : 'empty'} ${a?.proposed ? 'proposed' : ''} ${ctx.admin ? 'editable' : ''} ${mine ? 'mine' : ''}" style="--c:${colorOf(p)}" data-key="${p.key}" data-names="${namesAttr(a)}">
    <span class="role">${esc(p.role)}</span><span class="who">${a ? esc(assignedName(a)) : ctx.admin ? t('+ Afegeix') : t('Buit')}</span>${meta}</button>`;
}

// Cel·la de la vista d'historial: qui ha fet aquesta posició i quants cops.
function histCell(p, ctx) {
  const list = ctx.hist.byPos.get(p.key) || [];
  return `<button class="pos hist g-${p.group}" style="--c:${colorOf(p)}" data-key="${p.key}" data-names="${namesAttr(...list)}">
    <span class="role">${esc(p.role)}</span>
    ${list.length ? list.slice(0, 3).map((h) => `<span class="h"><b>${esc(shortName(h))}</b><span>×${h.n}</span></span>`).join('') : '<span class="who">—</span>'}
    ${list.length > 3 ? `<span class="meta">${t('+{n} més', { n: list.length - 3 })}</span>` : ''}
  </button>`;
}

function troncView(s, cell, levelNote = () => '') {
  const agByLevel = new Map(s.agulla.map((a) => [a.level, a]));
  const n = Math.max(...s.levels.map((l) => l.cells.length));
  const rowClass = `t-row${s.agulla.length ? ' ag' : ''}`;
  const rows = [...s.levels].reverse().map((row) => `
    <div class="${rowClass}">
      <div class="t-label"><span class="lv">${row.label}</span>${row.tags.map((x) => `<span class="tag">+ ${x}</span>`).join('')}${levelNote(row)}</div>
      <div class="t-cells">${row.cells.map(cell).join('')}</div>
      ${s.agulla.length ? `<div class="t-cells">${agByLevel.has(row.level) ? cell(agByLevel.get(row.level)) : ''}</div>` : ''}
    </div>`).join('');
  const music = s.musica.length ? `<div class="music-block">
      <div class="t-label">${t('Música')}</div>
      <div class="music-cells">${s.musica.map(cell).join('')}</div>
    </div>` : '';
  return `<div class="scroll-x"><div class="tronc zoomable" style="--n:${n}">
    ${s.agulla.length ? `<div class="${rowClass}"><div></div><div class="t-label" style="text-align:center">Tronc</div><div class="t-label" style="text-align:center">Pilar central</div></div>` : ''}
    ${rows}${music}</div></div>
    <div class="legend"><span><i style="background:var(--k-pom)"></i>Pom de dalt</span><span><i style="background:var(--k-tronc)"></i>Tronc</span>${s.levels.some((l) => l.level === 1) ? '<span><i style="background:var(--k-baix)"></i>Baixos</span>' : ''}${s.agulla.length ? '<span><i style="background:var(--k-agulla)"></i>Agulla</span>' : ''}${s.musica.length ? `<span><i style="background:var(--k-musica)"></i>${t('Música')}</span>` : ''}</div>`;
}

// Color del contorn de cada tipus de posició (variables CSS, s'adapten al mode fosc).
const KIND_VAR = {
  base: 'var(--k-baix)', contrafort: 'var(--k-contrafort)', agulla: 'var(--k-agulla)', crossa: 'var(--k-crossa)',
  mans: 'var(--k-mans)', vent: 'var(--k-vent)', lateral: 'var(--k-lateral)', latmans: 'var(--k-latmans)', altre: 'var(--accent)',
};

function layerSvg(layer, s, byKey, ctx) {
  const pad = 12;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const i of layer.items) {
    const r = Math.hypot(i.w, i.h) / 2;
    minX = Math.min(minX, i.x - r); maxX = Math.max(maxX, i.x + r);
    minY = Math.min(minY, i.y - r); maxY = Math.max(maxY, i.y + r);
  }
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const boxes = layer.items.map((item) => {
    const a = byKey.get(item.key);
    const mine = a && a.person_id === me.id;
    const role = item.shared ? s.positions.get(item.key)?.role || item.role : item.role;
    // El text segueix la caixa però mai queda cap per avall.
    let deg = (item.rot * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    if (deg > 90 && deg <= 270) deg -= 180;
    const name = a ? truncate(assignedName(a, true), item.w > 70 ? 11 : 8) : '—';
    const short = item.shared ? role?.split(' · ')[0] : boxShort(item);
    if (item.off) {
      return `<g class="box off" transform="translate(${item.x.toFixed(1)} ${item.y.toFixed(1)}) rotate(${deg.toFixed(1)})">
      <title>${esc(t('{level}: no es fa en aquesta prova', { level: role }))}</title>
      <rect x="${-item.w / 2}" y="${-item.h / 2}" width="${item.w}" height="${item.h}" rx="3"/>
      <text class="r" y="3" text-anchor="middle">${esc(role)}</text>
    </g>`;
    }
    return `<g class="box ${a ? '' : 'empty'} ${a?.proposed ? 'proposed' : ''} ${ctx.admin ? 'editable' : ''} ${mine ? 'mine' : ''}" style="--c:${KIND_VAR[item.kind] || 'var(--ink-3)'}" data-key="${item.key}" data-names="${namesAttr(a)}" transform="translate(${item.x.toFixed(1)} ${item.y.toFixed(1)}) rotate(${deg.toFixed(1)})">
      <title>${esc(role + (a ? ': ' + assignedName(a) : ''))}</title>
      <rect x="${-item.w / 2}" y="${-item.h / 2}" width="${item.w}" height="${item.h}" rx="5"/>
      <text class="r" y="-4.5" text-anchor="middle">${esc(short)}</text>
      <text class="n" y="10" text-anchor="middle">${esc(name)}</text>
    </g>`;
  }).join('');
  const w = maxX - minX, h = maxY - minY;
  return `<svg class="plan" viewBox="${minX.toFixed(0)} ${minY.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" role="img" aria-label="${esc(layer.label)}">${boxes}</svg>`;
}

function pinyaView(s, byKey, ctx) {
  const kinds = ['base', 'contrafort', 'agulla', 'crossa', 'mans', 'vent', 'lateral'];
  if (s.layers.some((l) => l.items.some((i) => i.kind === 'altre'))) kinds.push('altre');
  return s.layers.map((layer, i) => {
    const filled = layer.items.filter((x) => !x.shared && byKey.has(x.key)).length;
    const total = layer.items.filter((x) => !x.shared).length;
    return `<div class="layer">
      <div class="card-head"><h2>${layer.label}</h2><span class="muted small">${t('{a}/{b} posicions', { a: filled, b: total })}</span>
        <div class="actions"><button class="btn sm" data-zoom-layer="${i}">${icon.expand}${t('Amplia')}</button></div></div>
      <div class="plan-wrap" data-zoom-layer="${i}">${layerSvg(layer, s, byKey, ctx)}</div>
    </div>`;
  }).join('') + `<div class="legend">${kinds.map((k) => `<span><i style="background:${KIND_VAR[k]}"></i>${KIND_LABEL[k]}</span>`).join('')}</div>
    <p class="small muted">${t("Planta vista des de dalt. La rengla (primer baix) queda a dalt. Toca una caixa per veure'n la posició.")}</p>`;
}

function listSections(s) {
  const sections = [{ id: 'tronc', title: 'Tronc i pom de dalt', items: [...s.levels].reverse().flatMap((l) => l.cells) }];
  if (s.agulla.length) sections.push({ id: 'agulla', title: 'Pilar central (agulla)', items: [...s.agulla].reverse() });
  if (s.musica.length) sections.push({ id: 'musica', title: t('Música'), items: s.musica });
  for (const layer of s.layers) sections.push({ id: layer.id, title: layer.label, items: layer.items.filter((i) => !i.shared) });
  return sections;
}

function listView(s, byKey, ctx) {
  const li = (p) => {
    const a = byKey.get(p.key);
    const mine = a && a.person_id === me.id;
    return `<li class="${a ? '' : 'empty'} ${a?.proposed ? 'proposed' : ''} ${ctx.admin ? 'editable' : ''} ${mine ? 'mine' : ''}" style="--c:${colorOf(p)}" data-key="${p.key}" data-names="${namesAttr(a)}"><span class="r">${esc(p.role)}</span><span class="n">${a ? esc(assignedName(a)) : t('Buit')}</span></li>`;
  };
  return `<div class="pos-list">${listSections(s).map(({ title, items }) => `<h3>${esc(title)} <span class="muted small">${items.filter((p) => byKey.has(p.key)).length}/${items.length}</span></h3><ul>${items.map(li).join('')}</ul>`).join('')}</div>`;
}

// Mides del tronc (administració): espatlles i pes de cada persona i el pes que porta a sobre.
function measuresView(s, byKey) {
  const get = (key) => byKey.get(key);
  const load = troncLoad(s, get);
  const gaps = new Map(levelGaps(s, get).map((g) => [g.level, g.gap]));
  const heavy = new Set(weightInversions(s, get).map((w) => w.up));
  const cell = (p) => {
    const a = get(p.key);
    const l = load.get(p.key);
    const w = a?.weight_kg;
    return `<button class="pos hist g-${p.group}" style="--c:${colorOf(p)}" data-key="${p.key}" data-names="${namesAttr(a)}">
      <span class="role">${esc(p.role)}</span>
      <span class="who">${a ? esc(assignedName(a)) : '—'}</span>
      ${a ? `<span class="h" title="${t('Espatlles')} · ${t('Pes')}"><span>${a.shoulder_height_cm ? `${a.shoulder_height_cm} cm` : '? cm'} · <span class="${heavy.has(p.key) ? 'over' : ''}">${w ? `${w} kg` : '? kg'}</span></span></span>` : ''}
      ${l && (l.kg || l.partial) ? `<span class="h"><span>${t('porta {n} kg', { n: `${l.partial ? '≥ ' : ''}${l.kg}` })}${w && l.kg ? ` ×${(l.kg / w).toFixed(1)}` : ''}</span></span>` : ''}
    </button>`;
  };
  const note = (row) => (gaps.has(row.level)
    ? `<span class="tag ${gaps.get(row.level) > SHOULDER_GAP_CM ? 'over' : ''}">${t('{n} cm de desnivell', { n: gaps.get(row.level) })}</span>` : '');
  return `<p class="small muted" style="margin-top:0">${t("Alçada d'espatlles i pes de cada persona, i el pes que porta a sobre (la seva columna i la part del pom de dalt que li toca). «×» és quantes vegades el seu propi pes. Amb «≥» falta el pes d'algú de sobre.")}</p>
    ${troncView({ ...s, musica: [] }, cell, note)}`;
}

function historyView(s, ctx) {
  const { hist } = ctx;
  if (!hist.castellsCount) {
    return `<div class="empty">${t("Encara no s'ha fet cap {castell} en sessions passades.", { castell: s.name })}<br>
      <span class="small">${t("L'historial es construeix sol amb les alineacions dels castells que ja s'han fet.")}</span></div>`;
  }
  const cell = (p) => histCell(p, ctx);
  const pinyaSections = listSections(s).filter(({ id }) => !['tronc', 'agulla', 'musica'].includes(id));
  return `<p class="small muted" style="margin-top:0">${t("Qui ha fet cada posició en els {n} {castell} anteriors, i quants cops. Toca una posició per veure'n la llista completa.", { n: hist.castellsCount, castell: s.name })}</p>
    ${troncView(s, cell)}
    ${pinyaSections.map(({ title, items }) => `<h3 style="margin:20px 0 8px">${esc(title)}</h3><div class="hist-grid">${items.map(cell).join('')}</div>`).join('')}`;
}

// ---------- Revisió de l'alineació (administració) ----------
// Avisos per detectar errors abans de la sessió: gent col·locada que no ve, forats al tronc,
// espatlles desiguals en un mateix pis i algú que pesa més que qui el porta.
function lineupWarnings(s, byKey, candidates, event, prep, guests = []) {
  const guestsById = new Map(guests.map((g) => [g.id, g]));
  const out = [];
  const status = new Map(candidates.map((c) => [c.id, c.status]));
  const role = (key) => s.positions.get(key)?.role || key;
  const who = (a) => assignedName(a, true);
  // Cada avís és una línia amb les posicions afectades com a botons per anar-hi.
  const chip = (a) => ({ key: a.pos_key, label: `${who(a)} · ${role(a.pos_key)}` });
  if (event.date >= todayIso()) {
    const placed = [...byKey.values()].filter((a) => a.person_id);
    const group = (level, text, list) => { if (list.length) out.push({ level, text, items: list.map(chip) }); };
    group('bad', t('Han dit que no vénen'), placed.filter((a) => status.get(a.person_id) === 'no'));
    group('warn', t('Encara no han contestat'), placed.filter((a) => !status.get(a.person_id)));
  }
  // Acompanyants col·locats que ja no vénen (qui els portava ho ha canviat).
  const gone = [...byKey.values()].filter((a) => a.guest_id && (guestsById.get(a.guest_id)?.companion_dropped
    || (guestsById.get(a.guest_id)?.companion_of && status.get(guestsById.get(a.guest_id).companion_of) !== 'si')));
  if (gone.length) out.push({ level: 'bad', text: t('Acompanyants que ja no vénen'), items: gone.map(chip) });
  const tronc = [...s.positions.values()].filter((p) => ['baixos', 'tronc', 'pom', 'agulla'].includes(p.group));
  const empty = tronc.filter((p) => !byKey.has(p.key));
  if (empty.length) out.push({ level: 'bad', text: tn(empty.length, 'Falta {n} posició al tronc', 'Falten {n} posicions al tronc'), items: empty.map((p) => ({ key: p.key, label: p.role })) });

  // Mateix pis: les espatlles han de quedar a la mateixa alçada.
  const get = (key) => byKey.get(key);
  for (const g of levelGaps(s, get)) {
    if (g.gap <= SHOULDER_GAP_CM) continue;
    out.push({ level: 'warn', text: t("{level}: {n} cm de diferència d'alçada d'espatlles", { level: LEVEL_PLURAL[g.level - 1], n: g.gap }),
      items: g.keys.map(get).sort((a, b) => b.shoulder_height_cm - a.shoulder_height_cm).map((a) => ({ key: a.pos_key, label: `${who(a)} · ${a.shoulder_height_cm} cm` })) });
  }
  // Qui puja no hauria de pesar més que qui el porta (mateixa columna, un pis més avall).
  for (const w of weightInversions(s, get)) {
    const up = get(w.up), down = get(w.down);
    out.push({ level: 'warn', text: t('{up} pesa {n} kg més que {down}, que el porta', { up: who(up), n: w.diff, down: who(down) }),
      items: [chip(up), chip(down)] });
  }
  // Abans d'una diada: qui no ha assajat la seva posició d'aquest castell (només de l'alineació desada).
  if (prep && event.type !== 'assaig') {
    const same = prep.positions.filter((r) => r.person_id && byKey.get(r.key)?.person_id === r.person_id);
    const never = same.filter((r) => !r.ever);
    const notRecent = same.filter((r) => r.ever && !r.recent);
    const chips = (list) => list.map((r) => chip(byKey.get(r.key)));
    if (never.length) out.push({ level: 'warn', text: t("Mai no han fet aquesta posició en aquest castell"), items: chips(never) });
    if (notRecent.length) out.push({ level: 'warn', text: t("No l'han assajada les últimes {n} setmanes", { n: Math.round(prep.days / 7) }), items: chips(notRecent) });
    // Sense relleu: si no vénen, ningú més ha fet bé aquesta posició en aquest castell.
    const alone = same.filter((r) => !r.reliefs);
    if (alone.length) {
      out.push({ level: 'warn', text: t('Sense relleu: ningú més ho ha fet bé en aquest castell'), items: alone.map((r) => {
        const c = chip(byKey.get(r.key));
        return r.attendance != null ? { ...c, label: `${c.label} · ${t('ve el {n}%', { n: r.attendance })}` } : c;
      }) });
    }
  }
  const order = { bad: 0, warn: 1 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

function warningsCard(warnings) {
  if (!warnings.length) return `<div class="lineup-ok">${icon.check}${t("Revisió de l'alineació: tot correcte")}</div>`;
  return `<details class="card lineup-warnings" open>
    <summary>${icon.alert}<strong>${tn(warnings.length, '{n} avís a revisar', '{n} avisos a revisar')}</strong>
      <span class="small muted">${t('Toca un nom per veure la posició')}</span></summary>
    <ul>${warnings.map((w) => `<li class="${w.level}"><span class="w-text">${esc(w.text)}</span>
      <span class="w-items">${w.items.map((i) => `<button data-warn="${i.key}">${esc(i.label)}</button>`).join('')}</span></li>`).join('')}</ul>
  </details>`;
}

function focusKey(key, s) {
  const el = qs(`#viewer [data-key="${key}"]`);
  if (!el || el.getClientRects().length === 0) {
    const pos = s.positions.get(key);
    castellView = castellView === 'historial' ? 'historial' : pos && inTroncView(pos) ? 'tronc' : 'pinya';
    if (castellView !== 'historial') store.set('castellView', castellView);
    pendingFocus = key;
    render({ keepScroll: true });
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  el.classList.remove('flash'); void el.getBoundingClientRect(); el.classList.add('flash');
}

const zoomLabels = () => ({
  in: t('Amplia'), out: t('Redueix'), fit: t('Ajusta a la pantalla'), close: t('Tanca'),
  hint: t('Pinça o fes servir + i − per ampliar. Arrossega per moure. Toca una posició per veure qui hi ha.'),
});

export async function pageCastell(id) {
  // L'historial de posicions només el veuen els administradors.
  const [data, history, prep] = await Promise.all([
    api('GET', `/castells/${id}`),
    isAdmin() ? api('GET', `/castells/${id}/history`) : { castellsCount: 0, exact: [] },
    isAdmin() ? api('GET', `/castells/${id}/prep`) : null,
  ]);
  const { castell, event, positions, siblings, candidates = [], events = [], guests: sessionGuests = [] } = data;
  const admin = isAdmin();
  const s = buildStructure(castell);
  const saved = new Map(positions.filter((p) => s.positions.has(p.pos_key)).map((p) => [p.pos_key, p]));
  if (proposal && proposal.castellId !== castell.id) proposal = null;

  // Si hi ha una proposta del muntador, es mostra a sobre de l'alineació desada.
  const byKey = new Map(saved);
  if (proposal) {
    for (const [key, val] of proposal.map) {
      if (val) byKey.set(key, { pos_key: key, person_id: val.person.id, ...val.person, proposed: true, exact: val.exact, cat: val.cat });
      else byKey.delete(key);
    }
  }
  const keyByPerson = new Map([...byKey.values()].filter((p) => p.person_id).map((p) => [p.person_id, p.pos_key]));

  const exact = new Map(history.exact.map((h) => [`${h.pos_key}|${h.person_id}`, h.n]));
  const byPos = new Map();
  for (const h of history.exact) byPos.set(h.pos_key, [...(byPos.get(h.pos_key) || []), h]);
  for (const list of byPos.values()) list.sort((a, b) => b.n - a.n || b.last.localeCompare(a.last));
  const hist = { ...history, exactMap: exact, byPos };

  const ctx = { admin, hist };
  const mineKey = keyByPerson.get(me.id);
  if (selectedPerson && !selectedPerson.guest && keyByPerson.has(selectedPerson.id)) selectedPerson = null;

  // La primera vegada que un membre obre un castell on surt, se li ensenya la vista on és.
  if (castell.id !== lastCastellId) {
    lastCastellId = castell.id;
    if (!admin && mineKey) castellView = inTroncView(s.positions.get(mineKey)) ? 'tronc' : 'pinya';
  }

  const views = { tronc: 'Tronc', ...(s.layers.length ? { pinya: 'Pinya' } : {}), llista: t('Llista'), ...(admin ? { mides: t('Mides'), historial: t('Historial') } : {}) };
  if (!views[castellView]) castellView = 'tronc';
  const body = {
    pinya: () => pinyaView(s, byKey, ctx),
    llista: () => listView(s, byKey, ctx),
    mides: () => measuresView(s, byKey),
    historial: () => historyView(s, ctx),
  }[castellView]?.() ?? troncView(s, (p) => posCell(p, byKey, ctx));
  const confirmed = candidates.filter((c) => c.status === 'si');
  const unplaced = confirmed.filter((c) => !keyByPerson.has(c.id));
  const guests = [...saved.values()].filter((p) => p.guest_name);
  const placedGuests = new Set(guests.map((g) => g.guest_id).filter(Boolean));
  const freeGuests = sessionGuests.filter((g) => !placedGuests.has(g.id));
  const canZoom = castellView !== 'llista';
  const warnings = admin ? lineupWarnings(s, byKey, candidates, event, prep, sessionGuests) : [];

  $app.innerHTML = `
    <a class="back" href="#/sessio/${event.id}">${icon.back}${esc(event.title)} · ${fmt(event.date, { day: 'numeric', month: 'short' })}</a>
    ${siblings.length > 1 ? `<nav class="sibling-nav">${siblings.map((c) => `<a href="#/castell/${c.id}" class="${c.id === castell.id ? 'on' : ''} ${c.hidden ? 'is-hidden' : ''}">${c.hidden ? icon.eyeOff : ''}${castellName(c)}${c.label ? ` · ${esc(c.label)}` : ''}</a>`).join('')}</nav>` : ''}
    <div class="page-head">
      <div>
        <div class="castell-title">${s.name}${castell.hidden
          ? ` <span title="${t('Aquest castell està ocult: els membres no el veuen.')}">${hiddenBadge(t('Ocult'))}</span>`
          : event.hidden ? ` <span title="${t('La sessió està oculta: els membres no veuen cap dels seus castells.')}">${hiddenBadge(t('Sessió oculta'))}</span>` : ''}</div>
        ${partialLabel(castell) ? `<div class="parts big">${partialLabel(castell)}</div>` : ''}
        <div class="muted">${castell.net ? `<span class="result">${t('Net: sense pinya')}</span> ` : ''}${castell.sota ? '<span class="result">Aixecat per sota</span> ' : ''}${esc(castell.label || '')} ${resultPill(castell.result)}</div>
      </div>
      <div class="actions">
        ${mineKey && !proposal ? `<button class="btn sm" id="find-me">${t('On sóc?')}</button>` : ''}
        ${admin ? `<button class="btn sm primary" id="auto-build">${t('Munta automàticament')}</button>${hiddenToggle(castell.hidden, 'hide-castell')}<button class="btn sm" id="edit-castell">${t('Edita')}</button><button class="btn sm" id="dup-castell">${t('Duplica')}</button>${s.layers.length ? `<a class="btn sm" href="#/plantilla/${s.name}">${t('Pinya de la colla')}</a>` : ''}<button class="btn sm danger" id="del-castell">${t('Esborra')}</button>` : ''}
      </div>
    </div>
    ${admin ? `<div class="result-bar"><span class="small muted">${t('Com ha acabat?')}</span>
      <div class="tabs seg" id="result-seg">${Object.keys(RESULTS).map((r) => `<button type="button" data-v="${r}" class="${resultClass(r)} ${castell.result === r ? 'on' : ''}">${resultLabel(r)}</button>`).join('')}</div>
      ${castell.result !== 'previst' && castell.result !== 'descarregat' ? `<div class="fail-bar">
        <label><span class="small muted">${t('On va fallar?')}</span>
          <select id="fail-level"><option value="0">${t('No consta')}</option>${levelNames(castell).filter((l) => l.level >= levelRange(castell).from && l.level <= levelRange(castell).to).reverse()
            .map((l) => `<option value="${l.level}" ${castell.fail_level === l.level ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}</select></label>
        <label><span class="small muted">${t('Què va passar?')}</span>
          <select id="fail-cause"><option value="">${t('No consta')}</option>${FAIL_CAUSES.map((c) => `<option value="${c}" ${castell.fail_cause === c ? 'selected' : ''}>${failCauseLabel(c)}</option>`).join('')}</select></label>
      </div>` : ''}
      <label class="tech-notes"><span class="small muted">${t('Notes de la tècnica')} · ${t('només les veuen els administradors')}</span>
        <textarea id="tech-notes" rows="2" maxlength="1000" placeholder="${t('Com ha anat? Què cal assajar?')}">${esc(castell.tech_notes || '')}</textarea></label>
    </div>` : ''}
    ${!admin && mineKey ? `<div class="card my-pos"><span class="small muted">${t('La teva posició')}</span><strong>${esc(s.positions.get(mineKey).role)}</strong></div>` : ''}
    ${castell.notes ? `<div class="card description" style="margin-bottom:14px">${esc(castell.notes)}</div>` : ''}
    ${proposal ? `<div class="card proposal-bar">
      <div><strong>${t('Proposta automàtica')}</strong> · ${t('{n} posicions omplertes', { n: proposal.filled })}${proposal.empty ? `, ${t('{n} sense cobrir', { n: proposal.empty })}` : ''}${proposal.unused.length ? ` · ${tn(proposal.unused.length, '{n} persona sense posició', '{n} persones sense posició')}` : ''}
        <div class="small muted">${t('Encara no està desada. Les posicions proposades es marquen amb línia discontínua.')}</div>
        ${proposal.reliefs?.size ? `<details class="reliefs"><summary class="small">${tn(proposal.reliefs.size, '{n} relleu proposat', '{n} relleus proposats')}</summary>
          <ul class="small">${[...proposal.reliefs].map(([key, r]) => `<li><span class="muted">${esc(s.positions.get(key).role)}:</span> ${esc(shortName(r.person))}${r.exact ? ` <span class="muted">×${r.exact}</span>` : ''}</li>`).join('')}</ul>
          <div class="small muted">${t("Els relleus no es desen: apunta'ls o col·loca'ls en un altre castell.")}</div></details>` : ''}</div>
      <div class="actions"><button class="btn sm primary" id="prop-apply">${t('Aplica')}</button><button class="btn sm" id="prop-again">${t('Torna a generar')}</button><button class="btn sm ghost" id="prop-discard">${t('Descarta')}</button></div>
    </div>` : ''}
    ${selectedPerson ? `<div class="card" style="margin-bottom:14px;border-color:var(--accent)">${t("{name} seleccionat/da: toca una posició per col·locar-l'hi.", { name: `<strong>${esc(fullName(selectedPerson))}</strong>` })} <button class="btn sm ghost" id="cancel-sel">${t('Cancel·la')}</button></div>` : ''}
    ${admin ? warningsCard(warnings) : ''}
    <div class="viewer-layout ${admin ? 'with-side' : ''}">
      <div class="card">
        <div class="card-head">
          <div class="tabs" id="views">${Object.entries(views).map(([k, l]) => `<button data-v="${k}" class="${castellView === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <span class="muted small">${t('{a}/{b} posicions cobertes', { a: byKey.size, b: s.positions.size })}</span>
          ${canZoom ? `<button class="btn sm zoom-btn" id="zoom-all">${icon.expand}<span>${t('Pantalla completa')}</span></button>` : ''}
        </div>
        <div class="search-row">
          <input type="search" id="pos-search" placeholder="${castellView === 'historial' ? t('Cerca qui ha fet cada posició…') : t('Cerca una persona al castell…')}" value="${esc(searchQuery)}" autocomplete="off">
          <div class="hits" id="search-hits"></div>
        </div>
        <div id="viewer" class="view-${castellView}">${body}</div>
      </div>
      ${admin ? `<aside class="stack">
        <div class="card">
          <h3>${t('Confirmats sense posició')}</h3>
          <p class="small muted" style="margin:4px 0 10px">${t('{a} de {b} confirmats. Toca un nom i després una posició.', { a: unplaced.length, b: confirmed.length })}</p>
          <div class="side-list">${unplaced.map((c) => `<button data-pick="${c.id}" class="${selectedPerson?.id === c.id ? 'assigned' : ''}">${esc(shortName(c))}${c.instrument ? ` ${icon.music}` : ''}${c.shoulder_height_cm ? ` <span class="muted small">${c.shoulder_height_cm}</span>` : ''}</button>`).join('') || `<span class="muted small">${t('Tothom col·locat 👌')}</span>`}</div>
        </div>
        <div class="card">
          <h3>${t('Persones temporals')}</h3>
          <p class="small muted" style="margin:4px 0 10px">${t("De tota la sessió (d'una altra colla, de prova…). Toca un nom i després una posició.")}</p>
          ${freeGuests.length ? `<div class="side-list">${freeGuests.map((g) => `<button data-pick-guest="${g.id}" class="${selectedPerson?.guest && selectedPerson.id === g.id ? 'assigned' : ''}">${esc(g.name)}${g.colla ? ` <span class="muted small">${esc(g.colla)}</span>` : ''}</button>`).join('')}</div>` : ''}
          <button class="btn sm" id="new-guest" style="margin-top:10px">${icon.plus}${t('Nova persona temporal')}</button>
          ${guests.length ? `<h3 class="instr-h">${t('Ja col·locades')}</h3><div class="side-list" style="margin-top:6px">${guests.map((g) => `<button data-hit="${g.pos_key}" title="${t('Mostra al castell')}">${esc(g.guest_name)} <span class="muted small">${esc(s.positions.get(g.pos_key)?.role || '')}</span></button>`).join('')}</div>` : ''}
        </div>
      </aside>` : ''}
    </div>`;

  // ----- Cercador -----
  const applySearch = () => {
    const q = norm(searchQuery.trim());
    const viewer = qs('#viewer');
    viewer.classList.toggle('searching', !!q);
    qsa('[data-key]', viewer).forEach((el) => el.classList.toggle('hit', !!q && el.dataset.names.includes(q)));
    let hits = [];
    if (q && castellView === 'historial') {
      const people = new Map();
      for (const h of history.exact) {
        if (!norm(`${h.name} ${h.alias || ''}`).includes(q)) continue;
        const pos = s.positions.get(h.pos_key);
        if (!pos) continue;
        const entry = people.get(h.person_id) || { name: h.alias || h.name, items: [] };
        entry.items.push({ key: h.pos_key, label: `${pos.role} ×${h.n}`, n: h.n });
        people.set(h.person_id, entry);
      }
      hits = [...people.values()].flatMap((p) => p.items.sort((a, b) => b.n - a.n).slice(0, 4).map((i) => ({ key: i.key, label: `${p.name}: ${i.label}` })));
    } else if (q) {
      hits = [...byKey.values()]
        .filter((a) => norm(`${a.name || ''} ${a.alias || ''} ${a.guest_name || ''}`).includes(q))
        .map((a) => ({ key: a.pos_key, label: `${assignedName(a)}: ${s.positions.get(a.pos_key)?.role}` }));
    }
    qs('#search-hits').innerHTML = !q ? ''
      : hits.length ? hits.slice(0, 12).map((h) => `<button data-hit="${h.key}">${esc(h.label)}</button>`).join('') + (hits.length > 12 ? `<span class="muted small">+${hits.length - 12}</span>` : '')
        : `<span class="muted small">${castellView === 'historial' ? t('Cap historial per a aquesta cerca') : t('No és en aquest castell')}</span>`;
  };
  const search = qs('#pos-search');
  search.oninput = () => { searchQuery = search.value; applySearch(); };
  search.onkeydown = (e) => { if (e.key === 'Enter') qs('#search-hits [data-hit]')?.click(); };
  qs('#search-hits').onclick = (e) => { const b = e.target.closest('[data-hit]'); if (b) focusKey(b.dataset.hit, s); };
  qsa('[data-warn]').forEach((b) => (b.onclick = () => focusKey(b.dataset.warn, s)));
  applySearch();

  qsa('#views button').forEach((b) => (b.onclick = () => { castellView = b.dataset.v; store.set('castellView', castellView); render({ keepScroll: true }); }));
  qsa('#viewer .scroll-x').forEach((el) => { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; });

  // Informació d'una posició (per a membres, o tocant dins del visor ampliat).
  const showPos = (key) => {
    const pos = s.positions.get(key);
    const a = byKey.get(key);
    toast(`${pos.role}: ${a ? (a.guest_name ? assignedName(a) : fullName(a)) : t('buida')}${a?.person_id === me.id ? ` · ${t('ets tu!')}` : ''}`);
  };
  // ----- Pantalla completa -----
  const zoom = (layerIndex) => {
    let content;
    if (castellView === 'pinya') {
      content = document.createElement('div');
      content.className = 'zoom-pinya';
      const idx = layerIndex === undefined ? s.layers.map((_, i) => i) : [layerIndex];
      content.innerHTML = idx.map((i) => `<div class="zoom-layer">${s.layers.length > 1 ? `<h3>${esc(s.layers[i].label)}</h3>` : ''}${layerSvg(s.layers[i], s, byKey, ctx)}</div>`).join('');
    } else {
      content = qs('#viewer .tronc').cloneNode(true);
    }
    if (searchQuery.trim()) qsa('[data-key]', content).forEach((el) => el.classList.toggle('hit', el.dataset.names.includes(norm(searchQuery.trim()))));
    const title = `${s.name}${layerIndex !== undefined ? ` · ${s.layers[layerIndex].label}` : ''}`;
    openZoom({ content, title, focus: mineKey ? `[data-key="${mineKey}"]` : null, labels: zoomLabels(), onTap: (key) => {
      if (castellView === 'historial') { const list = byPos.get(key) || []; toast(`${s.positions.get(key).role}: ${list.slice(0, 4).map((h) => `${shortName(h)} ×${h.n}`).join(', ') || '—'}`); return; }
      showPos(key);
    } });
  };
  qs('#zoom-all')?.addEventListener('click', () => zoom());
  qsa('button[data-zoom-layer]').forEach((b) => (b.onclick = () => zoom(Number(b.dataset.zoomLayer))));

  qs('#find-me')?.addEventListener('click', () => {
    focusKey(mineKey, s);
    toast(t('Ets a: {role}', { role: s.positions.get(mineKey).role }));
  });
  if (pendingFocus) { const key = pendingFocus; pendingFocus = null; requestAnimationFrame(() => focusKey(key, s)); }

  const reload = () => render({ keepScroll: true });
  qs('#viewer').addEventListener('click', async (e) => {
    const el = e.target.closest('[data-key]');
    if (!el) return;
    const key = el.dataset.key;
    const pos = s.positions.get(key);
    if (castellView === 'historial') { historyModal(castell, pos, byPos.get(key) || [], saved.get(key), admin, reload); return; }
    if (!admin) {
      // A la pinya en un mòbil les caixes són petites: tocar-ne una obre el visor ampliat.
      if (castellView === 'pinya' && el.closest('.plan')?.getBoundingClientRect().width < 600) {
        zoom(Number(el.closest('[data-zoom-layer]').dataset.zoomLayer));
        return;
      }
      showPos(key);
      return;
    }
    if (proposal) { toast(t("Aplica o descarta la proposta abans d'editar posicions"), true); return; }
    if (selectedPerson) {
      const person = selectedPerson;
      selectedPerson = null;
      const body = person.guest ? { guest_id: person.id } : { person_id: person.id };
      if (await attempt(() => api('PUT', `/castells/${castell.id}/positions/${key}`, body))) reload();
      return;
    }
    assignModal(castell, pos, byKey.get(key), candidates, keyByPerson, s, hist, reload, sessionGuests);
  });

  if (!admin) return;
  qsa('#result-seg button').forEach((b) => (b.onclick = async () => {
    if (await attempt(() => api('PUT', `/castells/${castell.id}`, { result: b.dataset.v }))) { toast(t('Resultat desat')); reload(); }
  }));
  qsa('#fail-level, #fail-cause').forEach((sel) => sel.addEventListener('change', async () => {
    const body = sel.id === 'fail-level' ? { fail_level: Number(sel.value) } : { fail_cause: sel.value || null };
    if (await attempt(() => api('PUT', `/castells/${castell.id}`, body))) { Object.assign(castell, body); toast(t('Desat')); }
  }));
  qs('#tech-notes').addEventListener('change', async (e) => {
    if (await attempt(() => api('PUT', `/castells/${castell.id}`, { tech_notes: e.target.value }))) { castell.tech_notes = e.target.value; toast(t('Desat')); }
  });
  qs('#cancel-sel')?.addEventListener('click', () => { selectedPerson = null; reload(); });
  const pickGuest = (g) => { selectedPerson = { guest: true, id: g.id, name: g.name }; reload(); };
  qs('#new-guest').onclick = () => guestModal(event.id, null, (g) => g && pickGuest(g));
  qsa('[data-pick-guest]').forEach((b) => (b.onclick = () => {
    const g = sessionGuests.find((x) => String(x.id) === b.dataset.pickGuest);
    if (selectedPerson?.guest && selectedPerson.id === g.id) { selectedPerson = null; reload(); } else pickGuest(g);
  }));
  qsa('aside [data-hit]').forEach((b) => (b.onclick = () => focusKey(b.dataset.hit, s)));
  qsa('[data-pick]').forEach((b) => (b.onclick = () => {
    const p = candidates.find((c) => String(c.id) === b.dataset.pick);
    selectedPerson = selectedPerson?.id === p.id ? null : p;
    reload();
  }));

  // ----- Muntador automàtic -----
  const openBuilder = () => autoBuildModal({ castell, s, candidates, saved, hist, onPropose: (result) => {
    proposal = { castellId: castell.id, ...result };
    if (castellView === 'historial') castellView = 'tronc';
    reload();
  } });
  qs('#auto-build').onclick = openBuilder;
  qs('#prop-again')?.addEventListener('click', openBuilder);
  qs('#prop-discard')?.addEventListener('click', () => { proposal = null; reload(); });
  qs('#prop-apply')?.addEventListener('click', async () => {
    const assignments = [...proposal.map].map(([key, val]) => ({ pos_key: key, person_id: val ? val.person.id : null }));
    if (await attempt(() => api('PUT', `/castells/${castell.id}/positions`, { assignments }))) {
      proposal = null;
      toast(t('Alineació desada'));
      reload();
    }
  });

  qs('#edit-castell').onclick = () => castellModal(event.id, castell, (keep) => [...positions].filter((p) => !keep.has(p.pos_key)).length);
  qs('#hide-castell').onclick = async () => {
    if (await attempt(() => api('PUT', `/castells/${castell.id}/hidden`, { hidden: !castell.hidden }))) {
      toast(castell.hidden ? t('Ara els membres ja el veuen') : t('Castell ocult als membres'));
      render({ keepScroll: true });
    }
  };
  qs('#del-castell').onclick = async () => {
    if (!confirm(t('Esborrar el {name} i totes les posicions assignades?', { name: s.name }))) return;
    if (await attempt(() => api('DELETE', `/castells/${castell.id}`))) location.hash = `#/sessio/${event.id}`;
  };
  qs('#dup-castell').onclick = () => {
    const opts = events.some((e) => e.id === event.id) ? events : [event, ...events];
    openModal(`${modalHead(t('Duplica el {name}', { name: s.name }))}
      <form id="dup-form" class="stack">
        <p class="muted" style="margin:0">${t('Es copiarà el castell amb totes les persones a les mateixes posicions.')}</p>
        <label class="field">${t('Sessió de destinació')}<select name="event_id">${opts.map((e) => `<option value="${e.id}" ${e.id === event.id ? 'selected' : ''}>${fmt(e.date, { day: 'numeric', month: 'short' })} · ${esc(e.title)}</option>`).join('')}</select></label>
        <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${t('Duplica')}</button></div>
      </form>`, (m) => {
      qs('#dup-form', m).onsubmit = async (e) => {
        e.preventDefault();
        const copy = await attempt(() => api('POST', `/castells/${castell.id}/duplicate`, { event_id: Number(e.target.elements.event_id.value) }));
        if (copy) { closeModal(); toast(t('Castell duplicat')); location.hash = `#/castell/${copy.id}`; }
      };
    });
  };
}

function historyModal(castell, pos, list, current, admin, reload) {
  const max = list[0]?.n || 1;
  openModal(`${modalHead(esc(pos.role))}
    <p class="muted" style="margin:-6px 0 12px">${t("Qui l'ha fet en {castell} anteriors.", { castell: castellName(castell) })}${current ? ` ${t('Ara: {name}.', { name: `<strong>${esc(assignedName(current))}</strong>` })}` : ''}</p>
    ${list.length ? `<div class="bars">${list.map((h) => `<div class="bar-row">
        <span class="nm">${esc(fullName(h))}</span>
        <span class="bar"><i style="width:${(h.n / max) * 100}%"></i></span>
        <span class="num">${h.n}×</span>
        ${admin ? `<button class="btn sm" data-place="${h.person_id}">${t('Col·loca')}</button>` : ''}
        <span class="last small muted">${t('Última: {date}', { date: fmt(h.last, { day: 'numeric', month: 'short', year: 'numeric' }) })}</span>
      </div>`).join('')}</div>` : `<p class="muted">${t('Ningú ha fet encara aquesta posició.')}</p>`}
    <div class="form-actions"><button class="btn" data-close>${t('Tanca')}</button></div>`, (m) => {
    m.onclick = async (e) => {
      const b = e.target.closest('[data-place]');
      if (!b) return;
      if (await attempt(() => api('PUT', `/castells/${castell.id}/positions/${pos.key}`, { person_id: Number(b.dataset.place) }))) {
        closeModal(); toast(t('Col·locat')); reload();
      }
    };
  });
}

function autoBuildModal({ castell, s, candidates, saved, hist, onPropose }) {
  const count = (statuses) => candidates.filter((c) => statuses.includes(c.status)).length;
  const opts = { tronc: true, pinya: true, musica: true, reliefs: true, keep: saved.size > 0, ...JSON.parse(store.get('autoBuildOpts', '{}')) };
  const musicians = candidates.filter((c) => c.instrument && c.status === 'si').length;
  openModal(`${modalHead(t('Muntador automàtic'))}
    <form id="auto-form" class="stack">
      <p class="muted" style="margin:0">${t("Proposa una alineació amb la gent que ha confirmat, segons el pes, l'alçada d'espatlles, l'edat i l'historial de qui ha fet cada posició en aquest castell ({n} {castell} anteriors). Al tronc procura que cada pis quedi anivellat i que ningú pesi més que qui el porta. Primer veuràs la proposta i després decideixes si l'apliques.", { n: hist.castellsCount, castell: s.name })}</p>
      <fieldset class="stack"><legend>${t('Què vols muntar?')}</legend>
        <label class="check"><input type="checkbox" name="tronc" ${opts.tronc ? 'checked' : ''}> ${t('Tronc i pom de dalt')}${s.agulla.length ? ` + ${t('pilar central')}` : ''}</label>
        ${s.layers.length ? `<label class="check"><input type="checkbox" name="pinya" ${opts.pinya ? 'checked' : ''}> Pinya${s.layers.length > 1 ? ', folre, manilles' : ''}</label>` : ''}
        ${s.musica.length ? `<label class="check"><input type="checkbox" name="musica" ${opts.musica ? 'checked' : ''}> ${t('Música (gralles i timbals)')} <span class="muted small">· ${t('{n} músics confirmats', { n: musicians })}</span></label>` : ''}
      </fieldset>
      <fieldset class="stack"><legend>${t('Opcions')}</legend>
        <label class="check"><input type="checkbox" name="keep" ${opts.keep ? 'checked' : ''}> ${t('Mantén les posicions que ja estan assignades ({n})', { n: saved.size })}</label>
        <label class="check"><input type="checkbox" name="reliefs" ${opts.reliefs ? 'checked' : ''}> ${t('Proposa també un relleu per a cada posició del tronc')}</label>
      </fieldset>
      <p class="small muted" style="margin:0" id="auto-pool"></p>
      <div class="form-actions"><button type="button" class="btn" data-close>${t('Cancel·la')}</button><button class="btn primary">${t('Genera la proposta')}</button></div>
    </form>`, (m) => {
    const form = qs('#auto-form', m);
    qs('#auto-pool', m).textContent = t('Persones disponibles: {n}.', { n: count(['si']) });
    form.onsubmit = (e) => {
      e.preventDefault();
      const options = { musica: false, pinya: false, reliefs: false, ...formData(form) };
      if (!options.tronc && !options.pinya && !options.musica) { toast(t('Tria què vols muntar'), true); return; }
      store.set('autoBuildOpts', JSON.stringify(options));
      const result = proposeLineup({ structure: s, candidates, current: saved, exact: hist.exactMap, byCat: hist.byCat, options });
      if (!result.filled && !result.map.size) { toast(t('No hi ha cap posició per omplir'), true); return; }
      closeModal();
      onPropose(result);
    };
  });
}

export const STATUS_ORDER = { si: 0, null: 1, undefined: 1, no: 2 };
let assignSort = store.get('assignSort', 'status');

function assignModal(castell, pos, current, candidates, keyByPerson, s, hist, reload, guests = []) {
  const expOf = (p) => ({ exact: hist.exactMap.get(`${pos.key}|${p.id}`) || 0, cat: hist.byCat?.[p.id]?.[pos.cat] || 0 });
  const sorters = {
    status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name),
    experience: (a, b) => { const x = expOf(a), y = expOf(b); return (y.exact * 3 + y.cat) - (x.exact * 3 + x.cat) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status]; },
    shoulder: (a, b) => (b.shoulder_height_cm ?? -1) - (a.shoulder_height_cm ?? -1),
    height: (a, b) => (b.height_cm ?? -1) - (a.height_cm ?? -1),
    weight: (a, b) => (a.weight_kg ?? 999) - (b.weight_kg ?? 999),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  // A una posició de música, primer els qui toquen aquell instrument.
  const musicFirst = (a, b) => (pos.kind && pos.group === 'musica' ? (b.instrument === pos.kind) - (a.instrument === pos.kind) : 0);
  const measures = (p) => [
    p.instrument ? INSTRUMENTS[p.instrument] : null,
    age(p.birthdate) != null ? t('{n} anys', { n: age(p.birthdate) }) : null,
    p.height_cm ? `${p.height_cm} cm` : null,
    p.shoulder_height_cm ? `esp. ${p.shoulder_height_cm} cm` : null,
    p.shoulder_width_cm ? `ampl. ${p.shoulder_width_cm} cm` : null,
    p.weight_kg ? `${p.weight_kg} kg` : null,
  ].filter(Boolean).join(' · ') || t('Sense mides');
  const experience = (p) => {
    const { exact, cat } = expOf(p);
    if (!exact && !cat) return '';
    return `<span class="xp">${[exact ? t('{n}× aquesta posició', { n: exact }) : null, cat ? `${cat}× ${esc(pos.cat)}` : null].filter(Boolean).join(' · ')}</span>`;
  };

  const listHtml = (q) => [...candidates]
    .filter((p) => !q || norm(`${p.name} ${p.alias || ''}`).includes(q))
    .sort((a, b) => musicFirst(a, b) || (sorters[assignSort] || sorters.status)(a, b))
    .map((p) => {
      const where = keyByPerson.get(p.id);
      const isCurrent = current?.person_id === p.id;
      return `<button data-pid="${p.id}" class="${isCurrent ? 'current' : ''}">
        <span class="nm">${esc(fullName(p))}</span>${statusPill(p.status)}
        <span class="ms">${measures(p)}</span>
        ${experience(p)}
        ${where && !isCurrent ? `<span class="where">${t('Ara a: {role} (es mourà)', { role: esc(s.positions.get(where)?.role || where) })}</span>` : ''}
      </button>`;
    }).join('') || `<p class="muted">${t('Cap persona coincideix.')}</p>`;

  openModal(`${modalHead(esc(pos.role))}
    ${current ? `<p style="margin:-6px 0 10px">${t('Ara: {name}.', { name: `<strong>${esc(assignedName(current))}</strong>` })}</p>` : ''}
    <div class="pick-bar">
      <input type="search" id="pick-q" placeholder="${t('Cerca per nom o malnom…')}">
      <select id="pick-sort" aria-label="${t('Ordena')}">
        <option value="status">${t('Disponibilitat')}</option><option value="experience">${t('Experiència')}</option><option value="shoulder">${t('Alçada espatlles')}</option>
        <option value="height">${t('Alçada')}</option><option value="weight">${t('Pes (lleuger primer)')}</option><option value="name">${t('Nom')}</option>
      </select>
    </div>
    <div class="people-pick" id="pick-list">${listHtml('')}</div>
    <div class="guest-pick">
      <span class="small muted">${t('Persones temporals de la sessió')}</span>
      <div class="side-list">${guests.map((g) => `<button data-gid="${g.id}" class="${current?.guest_id === g.id ? 'assigned' : ''}">${esc(g.name)}</button>`).join('')}
        <button id="new-guest-pos">${icon.plus}${t('Nova')}</button></div>
    </div>
    <div class="form-actions">${current ? `<button class="btn danger" id="clear-pos">${t('Buida la posició')}</button>` : ''}<button class="btn" data-close>${t('Tanca')}</button></div>`, (m) => {
    const save = async (body) => {
      if (await attempt(() => api('PUT', `/castells/${castell.id}/positions/${pos.key}`, body))) { closeModal(); reload(); }
    };
    const q = qs('#pick-q', m), list = qs('#pick-list', m), sort = qs('#pick-sort', m);
    sort.value = assignSort;
    const refresh = () => { list.innerHTML = listHtml(norm(q.value.trim())); };
    q.oninput = refresh;
    sort.onchange = () => { assignSort = sort.value; store.set('assignSort', assignSort); refresh(); };
    list.onclick = (e) => { const b = e.target.closest('[data-pid]'); if (b) save({ person_id: Number(b.dataset.pid) }); };
    qsa('[data-gid]', m).forEach((b) => (b.onclick = () => save({ guest_id: Number(b.dataset.gid) })));
    qs('#new-guest-pos', m).onclick = () => guestModal(castell.event_id, null, async (g) => {
      if (g && await attempt(() => api('PUT', `/castells/${castell.id}/positions/${pos.key}`, { guest_id: g.id }))) reload();
    });
    qs('#clear-pos', m)?.addEventListener('click', () => save({ person_id: null, guest_name: null }));
  });
}

// Historial d'una persona (fitxa i perfil).
export function personHistoryHtml(h) {
  if (!h.total) return `<p class="muted small">${t('Encara no consta en cap castell de sessions passades.')}</p>`;
  const max = h.byCat[0]?.n || 1;
  return `<p class="small muted" style="margin:0 0 10px">${t('{n} castells en sessions passades.', { n: h.total })}</p>
    <div class="bars">${h.byCat.map((c) => `<div class="bar-row"><span class="nm">${esc(c.cat)}</span><span class="bar"><i style="width:${(c.n / max) * 100}%"></i></span><span class="num">${c.n}×</span></div>`).join('')}</div>
    <h3 style="margin:16px 0 6px">${t('Últims castells')}</h3>
    <ul class="recent">${h.recent.map((r) => `<li><a href="#/castell/${r.castell_id}"><span class="castell-tag ${resultClass(r.result)}">${esc(r.castell)}</span> ${esc(r.role)}</a>
      <span class="small muted">${fmt(r.date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${esc(r.title)}</span></li>`).join('')}</ul>`;
}
