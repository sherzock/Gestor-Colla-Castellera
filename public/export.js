// Exportació d'una sessió: un Excel (.xlsx) amb l'assistència i una pestanya per castell (qui hi ha a cada posició i
// la imatge del castell, tronc i pinya). Tot es fa al navegador: les dades venen de l'API, el dibuix es fa en un
// <canvas> i el fitxer (que és un ZIP de fitxers XML) s'empaqueta sense compressió (els PNG ja ho estan).

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

// ---------- Excel (.xlsx) ----------
// El mínim que cal perquè l'obrin Excel, LibreOffice i Numbers: text com a «inlineStr» (mai es llegeix com a fórmula),
// la primera fila en negreta i, si es vol, fixada i amb filtres, amplades de columna i una imatge per pestanya.
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org';
const REL = `${NS}/officeDocument/2006/relationships`;
// Text vàlid dins d'un XML: s'escapen els caràcters especials i es treuen els de control que l'XML no admet.
// eslint-disable-next-line no-control-regex
const xmlText = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colName = (i) => (i >= 26 ? colName(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

// Mida d'un PNG (amplada i alçada són a la capçalera IHDR).
export function pngSize(data) {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

// Noms de pestanya: com a molt 31 caràcters, sense []:*?/\ i sense repetir-se.
function sheetNames(names) {
  const used = new Set();
  return names.map((n) => {
    const base = String(n).replace(/[[\]:*?/\\]/g, '-').trim().slice(0, 31) || 'Full';
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
    used.add(name.toLowerCase());
    return name;
  });
}

// sheets: [{ name, rows: [[text]], header: la primera fila és capçalera (negreta, fixada i amb filtres),
//            bold: índexs d'altres files en negreta, widths: [caràcters], image: { data: PNG, col, row, maxWidth } }]
export function xlsx(sheets) {
  const enc = new TextEncoder();
  const names = sheetNames(sheets.map((s) => s.name));
  const files = [];
  const add = (name, text) => files.push({ name, data: enc.encode(XML_HEAD + text) });
  let images = 0;
  const overrides = [];

  sheets.forEach((sheet, i) => {
    const n = i + 1;
    const rows = sheet.rows || [];
    const bold = new Set(sheet.bold || []);
    if (sheet.header) bold.add(0);
    const widthsOf = sheet.widths || rows.reduce((w, r) => r.map((v, c) => Math.max(w[c] || 8, Math.min(50, String(v ?? '').length + 2))), []);
    const cols = widthsOf.length ? `<cols>${widthsOf.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const data = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, c) => (v === '' || v === null || v === undefined ? ''
      : `<c r="${colName(c)}${ri + 1}" t="inlineStr"${bold.has(ri) ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlText(v)}</t></is></c>`)).join('')}</row>`).join('');
    const lastCol = colName(Math.max(1, ...rows.map((r) => r.length)) - 1);
    const view = sheet.header && rows.length > 1
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
    const filter = sheet.header && rows.length > 1 ? `<autoFilter ref="A1:${lastCol}${rows.length}"/>` : '';
    let drawing = '';
    if (sheet.image) {
      images++;
      const { width, height } = pngSize(sheet.image.data);
      const scale = Math.min(1, (sheet.image.maxWidth || width) / width);
      const cx = Math.round(width * scale * 9525), cy = Math.round(height * scale * 9525); // 1 píxel = 9525 EMU
      files.push({ name: `xl/media/image${images}.png`, data: sheet.image.data });
      add(`xl/drawings/drawing${n}.xml`, `<xdr:wsDr xmlns:xdr="${NS}/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS}/drawingml/2006/main" xmlns:r="${REL}">`
        + `<xdr:oneCellAnchor><xdr:from><xdr:col>${sheet.image.col || 0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${sheet.image.row || 0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`
        + `<xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="${xmlText(names[i])}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>`
        + `<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>`
        + `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
      add(`xl/drawings/_rels/drawing${n}.xml.rels`, `<Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/image" Target="../media/image${images}.png"/></Relationships>`);
      add(`xl/worksheets/_rels/sheet${n}.xml.rels`, `<Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`);
      overrides.push(`<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      drawing = '<drawing r:id="rId1"/>';
    }
    add(`xl/worksheets/sheet${n}.xml`, `<worksheet xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${REL}">${view}${cols}<sheetData>${data}</sheetData>${filter}${drawing}</worksheet>`);
    overrides.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
  });

  add('xl/workbook.xml', `<workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets>${names.map((name, i) => `<sheet name="${xmlText(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
    + (sheets.some((s) => s.header && s.rows?.length > 1) ? `<definedNames>${sheets.map((s, i) => (s.header && s.rows.length > 1
      ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlText(names[i].replace(/'/g, "''"))}'!$A$1:$${colName(Math.max(1, ...s.rows.map((r) => r.length)) - 1)}$${s.rows.length}</definedName>` : '')).join('')}</definedNames>` : '')
    + '</workbook>');
  add('xl/_rels/workbook.xml.rels', `<Relationships xmlns="${NS}/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}`
    + `<Relationship Id="rId${names.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`);
  add('xl/styles.xml', `<styleSheet xmlns="${NS}/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
    + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>');
  add('_rels/.rels', `<Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  add('[Content_Types].xml', `<Types xmlns="${NS}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + `${overrides.join('')}</Types>`);
  // [Content_Types].xml ha d'anar primer (alguns lectors ho esperen).
  files.unshift(files.pop());
  return new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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

// Rectangle arrodonit; en navegadors antics sense roundRect, amb cantonades rectes.
const box = (ctx, x, y, w, h) => (ctx.roundRect ? ctx.roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h));

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
    ctx.beginPath(); box(ctx, x, cy, CELL_W, CELL_H); ctx.fill(); ctx.stroke();
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
      ctx.beginPath(); box(ctx, -bw / 2, -bh / 2, bw, bh); ctx.fill(); ctx.stroke();
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
