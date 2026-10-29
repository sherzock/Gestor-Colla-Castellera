// Exportació d'una sessió a Excel: el fitxer té totes les peces que demanen Excel i LibreOffice, el text hi arriba
// sencer (i mai com a fórmula), cada castell porta la seva imatge, i l'assistència és la mateixa que la del CSV.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { startServer, sessions } from './helpers.js';
import { xlsx, pngSize } from '../public/export.js';
import { parseCsv } from '../public/import.js';

let server, s;
before(async () => { server = await startServer(); s = await sessions(server); });
after(() => server.stop());

// Llegeix el ZIP (sense compressió, com el fa l'app): nom → bytes.
function unzipStored(buf) {
  const files = new Map();
  for (let p = 0; buf.readUInt32LE(p) === 0x04034b50;) {
    const size = buf.readUInt32LE(p + 18), nameLen = buf.readUInt16LE(p + 26), extraLen = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString('utf8');
    const start = p + 30 + nameLen + extraLen;
    files.set(name, buf.subarray(start, start + size));
    p = start + size;
  }
  return files;
}
const unescape = (x) => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const cells = (xml) => [...xml.matchAll(/<row r="(\d+)">([\s\S]*?)<\/row>/g)].map(([, , row]) =>
  [...row.matchAll(/<c r="([A-Z]+)\d+"[^>]*><is><t xml:space="preserve">([\s\S]*?)<\/t><\/is><\/c>/g)].map(([, col, v]) => [col, unescape(v)]));

// Un PNG de debò, petit: 3×2 píxels.
function png(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x90);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

test('Excel: totes les peces hi són i cada referència apunta a un fitxer que existeix', async () => {
  const image = png(3, 2);
  assert.deepEqual(pngSize(image), { width: 3, height: 2 });
  const book = xlsx([
    { name: 'Assistència', rows: [['Nom', 'Comentari'], ['Anna', 'hola']], header: true },
    { name: '1 3d7', rows: [['3d7'], ['Posició', 'Persona']], image: { data: image, col: 3 } },
    { name: '2 4d8 amb un nom massa llarg per a una pestanya', rows: [['x']], image: { data: image } },
    { name: '1 3d7', rows: [['repetit']] },
  ]);
  assert.equal(book.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const files = unzipStored(Buffer.from(await book.arrayBuffer()));
  assert.equal([...files.keys()][0], '[Content_Types].xml');
  const text = (name) => files.get(name)?.toString('utf8');
  // Cada «Target» de cada .rels i cada «PartName» existeix.
  for (const [name, data] of files) {
    if (!name.endsWith('.rels')) continue;
    const dir = name.replace(/_rels\/[^/]+$/, '');
    for (const [, target] of data.toString().matchAll(/Target="([^"]+)"/g)) {
      const full = new URL(target, `file:///${dir}`).pathname.slice(1);
      assert.ok(files.has(full), `${name} → ${full}`);
    }
  }
  for (const [, part] of text('[Content_Types].xml').matchAll(/PartName="\/([^"]+)"/g)) assert.ok(files.has(part), part);
  // Pestanyes: 31 caràcters com a molt, sense repetir-se.
  const names = [...text('xl/workbook.xml').matchAll(/<sheet name="([^"]+)"/g)].map((m) => unescape(m[1]));
  assert.deepEqual(names.map((n) => n.length <= 31), [true, true, true, true]);
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, 4, names.join(' | '));
  // Imatges: una per castell, amb la mida del PNG (1 píxel = 9525 EMU).
  assert.equal([...files.keys()].filter((f) => f.startsWith('xl/media/')).length, 2);
  assert.match(text('xl/drawings/drawing2.xml'), /<xdr:ext cx="28575" cy="19050"\/>/);
  assert.match(text('xl/drawings/drawing2.xml'), /<xdr:col>3<\/xdr:col>/);
  // L'assistència té la capçalera fixada i filtres.
  assert.match(text('xl/worksheets/sheet1.xml'), /state="frozen"/);
  assert.match(text('xl/worksheets/sheet1.xml'), /<autoFilter ref="A1:B2"\/>/);
});

test('Excel: el text hi arriba sencer, escapat, sense caràcters que trenquin el fitxer i mai com a fórmula', async () => {
  const tricky = ['=HYPERLINK("http://x","clic")', '+34 600 000 000', '-1', '@SUM(A1)', 'a & b < c > d "e" \'f\'', 'línia 1\nlínia 2',
    'control\u0000\u0007\u001f', 'emoji 🏰', '</t></is></c><c>trencat'];
  const files = unzipStored(Buffer.from(await xlsx([{ name: 'Proves', rows: [tricky] }]).arrayBuffer()));
  const sheet = files.get('xl/worksheets/sheet1.xml').toString('utf8');
  assert.doesNotMatch(sheet, /<f>/, 'cap fórmula');
  // eslint-disable-next-line no-control-regex
  assert.doesNotMatch(sheet, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/, 'cap caràcter de control');
  const got = cells(sheet)[0].map(([, v]) => v);
  // eslint-disable-next-line no-control-regex
  assert.deepEqual(got, tricky.map((x) => x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')));
});

test('l\'assistència per a l\'Excel és la mateixa que la del CSV, i només la pot demanar l\'administració', async () => {
  const id = s.pastEvent.id;
  const json = await s.admin('GET', `/events/${id}/attendance`);
  assert.equal(json.s, 200);
  const csv = await s.admin('GET', `/events/${id}/attendance.csv`);
  const rows = parseCsv(csv.text.replace(/^﻿/, '')).map((r) => r.map((c) => c.replace(/^'(?=[=+\-@\t\r])/, '')));
  assert.deepEqual(rows[0], json.d.columns);
  assert.deepEqual(rows.slice(1), json.d.rows);
  assert.ok(json.d.rows.length > 10);
  assert.equal((await s.member('GET', `/events/${id}/attendance`)).s, 403);
});

test('el servidor no ha fet servir cap valor que Node 22 no accepti', () => {
  assert.ok(!server.log().includes('NODE22'));
});
