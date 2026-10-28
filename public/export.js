// Exportació d'una sessió: un ZIP amb l'assistència (CSV) i una imatge PNG de cada castell (tronc i pinya).
// Tot es fa al navegador: el CSV i les alineacions venen de l'API, el dibuix es fa en un <canvas> i el ZIP
// s'empaqueta sense compressió (els PNG ja ho estan).

// ---------- ZIP (mètode «store») ----------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // noms en UTF-8
    local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd.buffer, name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

// ---------- Dibuix del castell ----------
// Colors fixos (els del tema clar): la imatge ha de ser llegible igual en paper que en pantalla.
const C = {
  bg: '#ffffff', ink: '#1c1917', ink3: '#78716c', line: '#e2ded9', soft: '#f6f5f3',
  baixos: '#9b1c2c', tronc: '#c2410c', pom: '#a16207', agulla: '#6b4fa0', musica: '#a16207',
  base: '#9b1c2c', crossa: '#2f5f98', contrafort: '#1f7a4d', mans: '#57534e', vent: '#0e7490', lateral: '#8c867f', altre: '#9b1c2c',
};
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const PLAN_SCALE = 1.7;

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}

// s: estructura (buildStructure), byKey: posició → persona assignada, nameOf(a, short), title/subtitle: capçalera.
export async function castellPng({ s, byKey, nameOf, title, subtitle, labels }) {
  const M = 32, CELL_W = 150, CELL_H = 50, GAP = 6, LABEL_W = 110;
  const rows = [...s.levels].reverse();
  const agByLevel = new Map(s.agulla.map((a) => [a.level, a]));
  const cols = Math.max(...rows.map((r) => r.cells.length), 1);
  const troncW = LABEL_W + cols * (CELL_W + GAP) + (s.agulla.length ? CELL_W + 3 * GAP : 0);
  const troncH = rows.length * (CELL_H + GAP) + (s.musica.length ? CELL_H + 30 : 0);

  const plans = s.layers.map((layer) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const i of layer.items) {
      const r = Math.hypot(i.w, i.h) / 2;
      minX = Math.min(minX, i.x - r); maxX = Math.max(maxX, i.x + r);
      minY = Math.min(minY, i.y - r); maxY = Math.max(maxY, i.y + r);
    }
    return { layer, minX, minY, w: (maxX - minX) * PLAN_SCALE, h: (maxY - minY) * PLAN_SCALE };
  });
  const W = Math.ceil(Math.max(troncW, ...plans.map((p) => p.w), 700) + 2 * M);
  const H = Math.ceil(M + 70 + 30 + troncH + plans.reduce((n, p) => n + 50 + p.h, 0) + M);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  let y = M;
  ctx.fillStyle = C.ink; ctx.font = `800 30px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillText(title, M, y + 16);
  ctx.fillStyle = C.ink3; ctx.font = `500 16px ${FONT}`;
  ctx.fillText(subtitle, M, y + 48);
  y += 80;

  // Tronc i pom de dalt, de dalt a baix (com a l'app).
  const section = (label) => {
    ctx.fillStyle = C.ink; ctx.font = `700 18px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(label, M, y + 10);
    y += 30;
  };
  const cell = (p, x, cy) => {
    const a = byKey.get(p.key);
    ctx.fillStyle = a ? C.soft : C.bg;
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, cy, CELL_W, CELL_H, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C[p.group] || C.ink3; ctx.fillRect(x, cy, 4, CELL_H);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.ink3; ctx.font = `600 11px ${FONT}`;
    ctx.fillText(fit(ctx, p.role, CELL_W - 16), x + 10, cy + 14);
    ctx.fillStyle = a ? C.ink : C.ink3; ctx.font = `${a ? 700 : 500} 14px ${FONT}`;
    ctx.fillText(fit(ctx, a ? nameOf(a, false) : '—', CELL_W - 16), x + 10, cy + 33);
  };
  section(labels.tronc);
  // El tronc queda centrat, com la pinya.
  const TX = M + (W - 2 * M - troncW) / 2;
  for (const row of rows) {
    ctx.fillStyle = C.ink3; ctx.font = `600 13px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(fit(ctx, row.label + row.tags.map((x) => ` + ${x}`).join(''), LABEL_W - 8), TX, y + CELL_H / 2);
    const rowW = row.cells.length * (CELL_W + GAP);
    let x = TX + LABEL_W + ((cols * (CELL_W + GAP)) - rowW) / 2;
    for (const p of row.cells) { cell(p, x, y); x += CELL_W + GAP; }
    if (agByLevel.has(row.level)) cell(agByLevel.get(row.level), TX + LABEL_W + cols * (CELL_W + GAP) + 2 * GAP, y);
    y += CELL_H + GAP;
  }
  if (s.musica.length) {
    y += 24;
    ctx.fillStyle = C.ink3; ctx.font = `600 13px ${FONT}`;
    ctx.fillText(labels.musica, TX, y + CELL_H / 2);
    let x = TX + LABEL_W;
    for (const p of s.musica) {
      if (x + CELL_W > W - M) break;
      cell(p, x, y); x += CELL_W + GAP;
    }
    y += CELL_H;
  }

  // Capes de la pinya en planta, com a l'app: cada caixa girada i el text sempre de cara.
  for (const { layer, minX, minY, w, h } of plans) {
    y += 20;
    section(layer.label);
    const ox = M + (W - 2 * M - w) / 2;
    for (const item of layer.items) {
      const a = byKey.get(item.key);
      const kind = item.shared ? 'base' : item.kind;
      const role = item.shared ? s.positions.get(item.key)?.role || item.role || '' : item.role;
      ctx.save();
      ctx.translate(ox + (item.x - minX) * PLAN_SCALE, y + (item.y - minY) * PLAN_SCALE);
      ctx.rotate(item.rot);
      const bw = item.w * PLAN_SCALE, bh = item.h * PLAN_SCALE;
      ctx.fillStyle = item.off ? C.soft : a ? C.soft : C.bg;
      ctx.strokeStyle = item.off ? C.line : C[kind] || C.ink3; ctx.lineWidth = 2;
      if (!a && !item.off) ctx.setLineDash([5, 3]);
      ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 6); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      let deg = ((((item.rot * 180) / Math.PI) % 360) + 360) % 360;
      if (deg > 90 && deg <= 270) ctx.rotate(Math.PI);
      ctx.textAlign = 'center';
      const top = item.shared ? (role || '').split(' · ')[0] : labels.short(item);
      ctx.fillStyle = C[kind] || C.ink3; ctx.font = `700 ${Math.round(8 * PLAN_SCALE)}px ${FONT}`;
      ctx.fillText(fit(ctx, top, bw - 8), 0, -bh / 4 + 1);
      ctx.fillStyle = a ? C.ink : C.ink3; ctx.font = `${a ? 800 : 500} ${Math.round(10.5 * PLAN_SCALE)}px ${FONT}`;
      ctx.fillText(fit(ctx, item.off ? '' : a ? nameOf(a, true) : '—', bw - 8), 0, bh / 5 + 1);
      ctx.restore();
    }
    y += h;
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

// Nom de fitxer segur: sense barres ni caràcters estranys.
export const fileSafe = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'castell';

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
