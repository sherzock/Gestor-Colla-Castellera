// Línia de temps d'un assaig: on cau cada castell. Sense res de pantalla, per poder-ho provar.
export const PLAN_MINUTES = 20;
const STEP = 30;
const toMin = (s) => (s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);
export const toTime = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Dins d'un carril, els castells que es fan alhora es posen de costat: «col» és la columna i «cols» quantes n'hi ha.
function placeLane(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.c.position - b.c.position);
  let group = [], groupEnd = -1;
  const close = () => { const cols = Math.max(0, ...group.map((b) => b.col + 1)); group.forEach((b) => { b.cols = cols; }); group = []; };
  for (const b of sorted) {
    if (group.length && b.start >= groupEnd) close();
    const taken = group.filter((o) => o.end > b.start).map((o) => o.col);
    b.col = 0;
    while (taken.includes(b.col)) b.col++;
    group.push(b);
    groupEnd = Math.max(groupEnd, b.end);
  }
  close();
  return sorted;
}

// Dos carrils, perquè els nets se solen fer al mateix temps que la resta. El marge d'hores és el de la sessió, ampliat
// si algun castell en surt, i arrodonit a mitges hores. Els castells sense hora van a part.
export function planLayout(castells, event) {
  const timed = castells.filter((c) => c.plan_time).map((c) => {
    const start = toMin(c.plan_time);
    return { c, start, end: start + (c.plan_minutes || PLAN_MINUTES) };
  });
  const starts = timed.map((b) => b.start), ends = timed.map((b) => b.end);
  const from = Math.min(...starts, toMin(event.start_time) ?? Infinity);
  const to = Math.max(...ends, toMin(event.end_time) ?? -Infinity);
  return {
    from: Math.floor(from / STEP) * STEP,
    to: Math.ceil(to / STEP) * STEP,
    normal: placeLane(timed.filter((b) => !b.c.net)),
    net: placeLane(timed.filter((b) => b.c.net)),
    unscheduled: castells.filter((c) => !c.plan_time),
  };
}

// Per defecte, a continuació de l'últim del seu carril (o a l'inici de la sessió).
export function nextPlanTime(castell, castells, event) {
  const ends = castells.filter((c) => c.id !== castell.id && c.plan_time && !c.net === !castell.net)
    .map((c) => toMin(c.plan_time) + (c.plan_minutes || PLAN_MINUTES));
  return ends.length ? toTime(Math.max(...ends)) : event.start_time || '20:00';
}
