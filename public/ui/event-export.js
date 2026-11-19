// L'Excel d'una sessió: l'assistència i cada castell amb la seva imatge.
import { buildStructure } from '../castell.js';
import { boxShort } from '../editor.js';
import { castellPng, download, fileSafe, xlsx } from '../export.js';
import { api, fmtLong, partialLabel, resultLabel, t, toast } from './core.js';
import { assignedName } from './viewer.js';

export async function exportSession(event, castells, button) {
  button.disabled = true;
  const label = button.textContent;
  button.textContent = t('Preparant…');
  try {
    // L'assistència i les alineacions es demanen alhora; les imatges es dibuixen després, una rere l'altra.
    const [table, details] = await Promise.all([
      api('GET', `/events/${event.id}/attendance`),
      Promise.all(castells.map((c) => api('GET', `/castells/${c.id}`))),
    ]);
    const sheets = [{ name: t('Assistència'), rows: [table.columns, ...table.rows], header: true }];
    for (const [i, { castell, positions }] of details.entries()) {
      const s = buildStructure(castell);
      const byKey = new Map(positions.filter((p) => s.positions.has(p.pos_key)).map((p) => [p.pos_key, p]));
      const extra = [castell.label, partialLabel(castell), resultLabel(castell.result)].filter(Boolean).join(' · ');
      const title = `${s.name}${castell.label ? ` · ${castell.label}` : ''}`;
      const subtitle = `${event.title} · ${fmtLong(event.date)}${extra ? ` · ${extra}` : ''} · ${t('{a}/{b} posicions cobertes', { a: byKey.size, b: s.positions.size })}`;
      const image = await castellPng({ s, byKey, nameOf: assignedName, title, subtitle,
        labels: { tronc: t('Tronc i pom de dalt'), musica: t('Música'), short: boxShort } });
      // Qui hi ha a cada posició, de baix a dalt i després la música i la pinya (per buscar-hi o imprimir-ho).
      const who = (key) => (byKey.has(key) ? assignedName(byKey.get(key), false) : '');
      const list = [
        ...s.levels.flatMap((l) => l.cells), ...s.agulla, ...s.musica,
      ].map((p) => [p.role, who(p.key)]);
      for (const layer of s.layers) {
        for (const item of layer.items.filter((x) => !x.shared && !x.off)) list.push([`${layer.label} · ${item.role}`, who(item.key)]);
      }
      sheets.push({
        name: `${i + 1} ${s.name}${castell.label ? ` ${castell.label}` : ''}`,
        rows: [[title], [subtitle], [], [t('Posició'), t('Persona')], ...list],
        bold: [0, 3], widths: [30, 28, 3],
        image: { data: image, col: 3, row: 0, maxWidth: 1000 },
      });
    }
    download(xlsx(sheets), `sessio-${event.date}-${fileSafe(event.title)}.xlsx`);
  } catch (err) {
    toast(err.message, true);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
