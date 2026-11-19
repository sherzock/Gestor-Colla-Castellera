import { db } from '../../db.js';
import { COLLA_NAME } from '../config.js';
import { localStamp, visibleEvent } from '../util.js';
import { route } from '../router.js';
import { checkCollaCode } from './auth.js';

// ---------- Calendari per subscriure-s'hi (Google Calendar, iPhone…) ----------
// És públic perquè les apps de calendari no poden identificar-se: només hi surten les sessions, cap persona.
export const ICS_TYPES = { assaig: 'Assaig', diada: 'Diada', esdeveniment: 'Esdeveniment', musics: 'Assaig de músics' };
export const ICS_TZ = ['BEGIN:VTIMEZONE', 'TZID:Europe/Madrid',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'];
export const icsText = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[,;]/g, '\\$&');
// Les línies d'un .ics no poden passar de 75 bytes: les llargues es parteixen.
export function icsFold(line) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 74) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}
export const icsStamp = (local) => local.replace(/[-:]/g, '') + '00';
export function icsEvent(e, origin) {
  const lines = ['BEGIN:VEVENT', `UID:sessio-${e.id}@${new URL(origin).host}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`];
  if (e.start_time) {
    const start = new Date(`${e.date}T${e.start_time}:00`);
    let end = e.end_time ? new Date(`${e.date}T${e.end_time}:00`) : null;
    if (!end || end <= start) end = new Date(start.getTime() + 2 * 3600 * 1000);
    lines.push(`DTSTART;TZID=Europe/Madrid:${icsStamp(localStamp(start))}`, `DTEND;TZID=Europe/Madrid:${icsStamp(localStamp(end))}`);
  } else {
    const next = new Date(`${e.date}T12:00:00`);
    next.setDate(next.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${e.date.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${localStamp(next).slice(0, 10).replaceAll('-', '')}`);
  }
  const notes = [ICS_TYPES[e.type], e.escoleta ? `Escoleta${e.escoleta_time ? ` a les ${e.escoleta_time}` : ''}` : null, e.description, `${origin}/#/sessio/${e.id}`];
  lines.push(`SUMMARY:${icsText(e.title)}`, `CATEGORIES:${icsText(ICS_TYPES[e.type])}`, `DESCRIPTION:${icsText(notes.filter(Boolean).join('\n'))}`,
    `URL:${origin}/#/sessio/${e.id}`);
  // Les apps de calendari busquen el lloc al mapa: hi va també l'adreça, si n'hi ha.
  const where = [e.location, e.address].filter(Boolean).join(', ');
  if (where) lines.push(`LOCATION:${icsText(where)}`);
  lines.push('END:VEVENT');
  return lines;
}

route('GET', '/api/calendar.ics', ({ req, res, query }) => {
  checkCollaCode(req, query.get('code'));
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const origin = `${proto}://${req.headers.host}`;
  const one = Number(query.get('event')) || null;
  const events = one ? [visibleEvent(one, null)]
    : db.prepare(`SELECT * FROM events WHERE hidden = 0 AND date >= date('now','localtime','-90 days')${query.get('musics') === '1' ? '' : " AND type != 'musics'"}
        ORDER BY date, start_time`).all();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', "PRODID:-//Appinya't//CA", 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(COLLA_NAME)}`, 'X-WR-TIMEZONE:Europe/Madrid', ...ICS_TZ, ...events.flatMap((e) => icsEvent(e, origin)), 'END:VCALENDAR'];
  res.writeHead(200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'no-cache',
    ...(one ? { 'Content-Disposition': `attachment; filename="sessio-${events[0].date}.ics"` } : {}),
  });
  res.end(lines.map(icsFold).join('\r\n') + '\r\n');
}, 'public');
