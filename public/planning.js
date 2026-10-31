// Línia de temps d'un assaig: on cau cada castell. Sense res de pantalla, per poder-ho provar.
export const PLAN_MINUTES = 20;
const STEP = 30;
const DRAG_STEP = 5;
const toMin = (s) => (s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);
export const toTime = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Els castells que es fan alhora es posen de costat: «col» és la columna i «cols» quantes n'hi ha.
function place(blocks) {
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

// El marge d'hores és el de la sessió, ampliat si algun castell en surt, i arrodonit a mitges hores. Els castells sense
// hora van a part.
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
    blocks: place(timed),
    unscheduled: castells.filter((c) => !c.plan_time),
  };
}

// Parelles de castells que coincideixen en el temps (qui fa l'un no pot fer l'altre).
export function overlappingPairs(castells) {
  const timed = castells.filter((c) => c.plan_time).map((c) => {
    const start = toMin(c.plan_time);
    return { c, start, end: start + (c.plan_minutes || PLAN_MINUTES) };
  });
  return timed.flatMap((a, i) => timed.slice(i + 1).filter((b) => a.start < b.end && b.start < a.end).map((b) => [a.c, b.c]));
}

// On queda un castell en arrossegar-lo «delta» minuts: de 5 en 5 i sense sortir de la línia de temps.
export function dragStart(start, minutes, delta, from, to) {
  const snapped = Math.round((start + delta) / DRAG_STEP) * DRAG_STEP;
  return Math.max(from, Math.min(snapped, Math.max(from, to - minutes)));
}

// Per defecte, a continuació de l'últim castell (o a l'inici de la sessió). Si s'ha de fer alhora, es canvia l'hora.
export function nextPlanTime(castell, castells, event) {
  const ends = castells.filter((c) => c.id !== castell.id && c.plan_time)
    .map((c) => toMin(c.plan_time) + (c.plan_minutes || PLAN_MINUTES));
  return ends.length ? toTime(Math.max(...ends)) : event.start_time || '20:00';
}
