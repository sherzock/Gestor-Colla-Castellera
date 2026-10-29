// Lectura de fulls de càlcul al navegador (CSV i Excel .xlsx), sense dependències: per importar persones.
// Torna les files com a llistes de text; la primera fila són els títols de les columnes.

// ---------- CSV ----------
// Excel desa els CSV amb «;» a Catalunya i amb codificació de Windows: es detecten les dues coses.
function decodeText(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
}

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---------- ZIP (un .xlsx és un ZIP de fitxers XML) ----------
async function unzip(buffer) {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('zip');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buffer, p + 46, nameLen));
    files.set(name, async () => {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = new Uint8Array(buffer, start, size);
      if (method === 0) return dec.decode(data);
      if (method !== 8) throw new Error('zip');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).text();
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ---------- Excel ----------
const xml = (text) => new DOMParser().parseFromString(text, 'application/xml');
const byTag = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

async function parseXlsx(buffer) {
  const files = await unzip(buffer);
  const read = async (name) => (files.has(name) ? files.get(name)() : null);
  // El primer full del llibre (pot no dir-se sheet1.xml).
  let sheetPath = null;
  const workbook = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  if (workbook && rels) {
    const first = byTag(xml(workbook), 'sheet')[0];
    const id = first?.getAttribute('r:id') || first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = byTag(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === id)?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  sheetPath ||= [...files.keys()].filter((f) => /^xl\/worksheets\/[^/]+\.xml$/.test(f)).sort()[0];
  if (!sheetPath || !files.has(sheetPath)) throw new Error('xlsx');
  const shared = await read('xl/sharedStrings.xml');
  const strings = shared ? byTag(xml(shared), 'si').map((si) => byTag(si, 't').map((t) => t.textContent).join('')) : [];
  const rows = [];
  for (const r of byTag(xml(await files.get(sheetPath)()), 'row')) {
    const row = [];
    const rowIndex = Number(r.getAttribute('r')) - 1;
    for (const c of byTag(r, 'c')) {
      const type = c.getAttribute('t');
      const v = byTag(c, 'v')[0]?.textContent ?? '';
      const value = type === 's' ? strings[Number(v)] ?? '' : type === 'inlineStr' ? byTag(c, 't').map((t) => t.textContent).join('') : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v;
      const ref = c.getAttribute('r');
      row[ref ? colIndex(ref) : row.length] = value;
    }
    rows[Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : rows.length] = Array.from(row, (x) => x ?? '');
  }
  return Array.from(rows, (x) => x ?? []);
}

export async function readSpreadsheet(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const rows = isZip ? await parseXlsx(buffer) : parseCsv(decodeText(bytes));
  // Fora les files buides i els espais de més.
  return rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some(Boolean));
}

// ---------- De columnes a camps de la fitxa ----------
export const IMPORT_FIELDS = ['name', 'surname', 'alias', 'email', 'phone', 'birthdate', 'height_cm', 'shoulder_height_cm',
  'shoulder_width_cm', 'weight_kg', 'notes', 'instrument'];

// Endevina el camp pel títol de la columna (en català, castellà o anglès).
export function guessField(header) {
  const h = String(header || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const words = h.split(' ');
  const has = (...keys) => keys.some((k) => h.includes(k));
  if (!h) return '';
  if (has('espatll', 'hombro', 'shoulder', 'muscle')) return has('ampl', 'anch', 'width') ? 'shoulder_width_cm' : 'shoulder_height_cm';
  if (has('cognom', 'apellid', 'surname', 'last name')) return 'surname';
  if (has('malnom', 'mote', 'alias', 'sobrenom', 'apodo', 'nick')) return 'alias';
  if (has('mail', 'correu', 'correo')) return 'email';
  if (has('telef', 'mobil', 'movil', 'phone')) return 'phone';
  if (has('naix', 'nacim', 'birth', 'aniversari')) return 'birthdate';
  if (has('alcad', 'altura', 'height', 'estatura')) return 'height_cm';
  if (words.some((w) => ['pes', 'peso', 'weight', 'kg'].includes(w))) return 'weight_kg';
  if (has('nota', 'observ', 'coment')) return 'notes';
  if (has('instrument', 'music')) return 'instrument';
  if (has('nom', 'nombre', 'name')) return 'name';
  return '';
}

// Data de naixement: 2010-06-15, 15/06/2010, 15-6-10 o el número de dies que guarda Excel.
export function normDate(value) {
  const v = String(value).trim();
  if (!v) return '';
  if (/^\d{5}(\.\d+)?$/.test(v) && Number(v) < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += y > new Date().getFullYear() % 100 ? 1900 : 2000;
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return v; // el servidor dirà que no és vàlida
}

// Mides: «1,62» o «162»; una alçada escrita en metres es passa a centímetres.
export function normNumber(value, field) {
  const v = String(value).trim().replace(/\s*(cm|kg|m)$/i, '').replace(',', '.');
  if (!v) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return value;
  return field !== 'weight_kg' && n > 0 && n < 3 ? Math.round(n * 1000) / 10 : n;
}

// Converteix les files del fitxer en persones per a l'API, amb els camps de cada columna. Les cel·les buides no
// s'envien (així, en actualitzar algú que ja hi és, no se n'esborren dades).
export function rowsToPeople(rows, fields) {
  return rows.map((row) => {
    const p = {};
    const surname = [];
    fields.forEach((field, i) => {
      const value = row[i] ?? '';
      if (!field || value === '') return;
      if (field === 'surname') surname.push(value);
      else if (field === 'name') p.name = p.name ? `${p.name} ${value}` : value;
      else if (field === 'birthdate') p.birthdate = normDate(value);
      else if (['height_cm', 'shoulder_height_cm', 'shoulder_width_cm', 'weight_kg'].includes(field)) p[field] = normNumber(value, field);
      else if (field === 'instrument') p.instrument = value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      else p[field] = value;
    });
    if (surname.length) p.name = [p.name, ...surname].filter(Boolean).join(' ');
    return p;
  });
}
