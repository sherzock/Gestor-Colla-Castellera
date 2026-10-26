// Visor a pantalla completa: mostra un castell (tronc o pinya) i deixa ampliar-lo i moure'l
// amb els dits (pinça), la roda del ratolí o els botons. Tocar una posició crida onTap(key).

const MAX_SCALE = 6;

export function openZoom({ content, title, focus, onTap, labels }) {
  const back = document.createElement('div');
  back.className = 'zoomer';
  back.setAttribute('role', 'dialog');
  back.setAttribute('aria-modal', 'true');
  back.innerHTML = `
    <div class="zoom-bar">
      <strong class="zoom-title"></strong>
      <div class="zoom-btns">
        <button data-z="out" aria-label="${labels.out}">−</button>
        <button data-z="fit" aria-label="${labels.fit}">⤢</button>
        <button data-z="in" aria-label="${labels.in}">+</button>
        <button data-z="close" aria-label="${labels.close}">✕</button>
      </div>
    </div>
    <div class="zoom-area"><div class="zoom-stage"></div></div>
    <div class="zoom-hint">${labels.hint}</div>`;
  back.querySelector('.zoom-title').textContent = title;
  const area = back.querySelector('.zoom-area');
  const stage = back.querySelector('.zoom-stage');
  stage.append(content);
  document.body.append(back);
  document.body.classList.add('no-scroll');

  const natural = { w: stage.offsetWidth, h: stage.offsetHeight };
  const view = { s: 1, x: 0, y: 0 };
  const apply = () => { stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`; };
  const fitScale = () => Math.min(area.clientWidth / natural.w, area.clientHeight / natural.h) * 0.94;
  const minScale = () => Math.min(fitScale() * 0.6, 1);
  const fit = () => {
    view.s = fitScale();
    view.x = (area.clientWidth - natural.w * view.s) / 2;
    view.y = (area.clientHeight - natural.h * view.s) / 2;
    apply();
  };
  // Amplia mantenint fix el punt (px, py) de la pantalla.
  const zoomAt = (factor, px, py) => {
    const s = Math.max(minScale(), Math.min(MAX_SCALE, view.s * factor));
    view.x = px - ((px - view.x) * s) / view.s;
    view.y = py - ((py - view.y) * s) / view.s;
    view.s = s;
    apply();
  };
  const center = () => [area.clientWidth / 2, area.clientHeight / 2];

  fit();
  // Si la persona hi surt, centra-ho a sobre seu i amplia perquè es llegeixi bé.
  const target = focus && stage.querySelector(focus);
  if (target) {
    const r = target.getBoundingClientRect(), st = stage.getBoundingClientRect();
    const cx = (r.left + r.width / 2 - st.left) / view.s, cy = (r.top + r.height / 2 - st.top) / view.s;
    view.s = Math.max(view.s, 1.8);
    view.x = area.clientWidth / 2 - cx * view.s;
    view.y = area.clientHeight / 2 - cy * view.s;
    apply();
  }

  // ----- Gestos -----
  const pointers = new Map();
  let gesture = null;
  const rel = (e) => { const r = area.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  area.addEventListener('pointerdown', (e) => {
    area.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, rel(e));
    gesture = { moved: 0, start: rel(e), multi: pointers.size > 1 || gesture?.multi };
  });
  area.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const cur = rel(e);
    if (pointers.size === 1) {
      view.x += cur[0] - prev[0];
      view.y += cur[1] - prev[1];
      apply();
    } else if (pointers.size === 2) {
      const [other] = [...pointers].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
      const d0 = Math.hypot(prev[0] - other[0], prev[1] - other[1]);
      const d1 = Math.hypot(cur[0] - other[0], cur[1] - other[1]);
      if (d0 > 0) zoomAt(d1 / d0, (cur[0] + other[0]) / 2, (cur[1] + other[1]) / 2);
    }
    if (gesture) gesture.moved += Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    pointers.set(e.pointerId, cur);
  });
  const end = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size === 0 && gesture && !gesture.multi && gesture.moved < 8 && e.type === 'pointerup') {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-key]');
      if (el && stage.contains(el)) onTap?.(el.dataset.key);
    }
    if (pointers.size === 0) gesture = null;
  };
  area.addEventListener('pointerup', end);
  area.addEventListener('pointercancel', end);
  area.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [px, py] = rel(e);
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), px, py);
  }, { passive: false });
  area.addEventListener('dblclick', (e) => { const [px, py] = rel(e); zoomAt(1.8, px, py); });

  const close = () => {
    back.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', fit);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === '+' || e.key === '=') zoomAt(1.3, ...center());
    else if (e.key === '-') zoomAt(1 / 1.3, ...center());
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', fit);
  back.querySelector('.zoom-btns').addEventListener('click', (e) => {
    const action = e.target.closest('[data-z]')?.dataset.z;
    if (action === 'in') zoomAt(1.4, ...center());
    else if (action === 'out') zoomAt(1 / 1.4, ...center());
    else if (action === 'fit') fit();
    else if (action === 'close') close();
  });
  return { close };
}
