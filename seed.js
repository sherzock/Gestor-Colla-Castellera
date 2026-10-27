// Omple la base de dades amb dades de demostració.
// Ús: node seed.js   (esborra les dades existents!)
import { db, hashPassword, transaction } from './db.js';
import { buildStructure } from './public/castell.js';

const ADMIN_PASSWORD = 'admin1234';

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => Math.round(a + rand() * (b - a));

const first = ['Marta', 'Jordi', 'Laia', 'Pau', 'Núria', 'Oriol', 'Anna', 'Marc', 'Júlia', 'Arnau', 'Clara', 'Pol', 'Mireia', 'Gerard',
  'Berta', 'Xavier', 'Ona', 'Albert', 'Carla', 'Roger', 'Aina', 'Joan', 'Neus', 'Sergi', 'Elisenda', 'Quim', 'Montse', 'Aleix',
  'Rosa', 'Biel', 'Gemma', 'Martí', 'Txell', 'Eloi', 'Judit', 'Ferran', 'Irene', 'Dani', 'Mariona', 'Toni'];
const last = ['Puig', 'Vila', 'Soler', 'Ferrer', 'Roca', 'Serra', 'Font', 'Pujol', 'Casals', 'Riera', 'Coll', 'Mas', 'Bosch', 'Sala', 'Prat'];
const kids = ['Pep', 'Lia', 'Nil', 'Iu', 'Abril', 'Jan'];
// Malnoms inventats per a la demostració (fruites, verdures i herbes), perquè no coincideixin amb gent real.
const aliases = ['Pebrot', 'Ceba', 'Fesol', 'Cigró', 'Pruna', 'Nespra', 'Rave', 'Bleda', 'Carxofa', 'Moniato', 'Codony', 'Albercoc',
  'Préssec', 'Meló', 'Síndria', 'Gerd', 'Móra', 'Llimona', 'Taronja', 'Magrana', 'Figa', 'Castanya', 'Avellana', 'Pèsol', 'Ametlla',
  'Pastanaga', 'Api', 'Julivert', 'Alfàbrega', 'Farigola', 'Romaní', 'Espàrrec', 'Enciam', 'Tomàquet', 'Cogombre', 'Albergínia',
  'Carbassó', 'Mongeta'];

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
const nextWeekday = (wd, weeks = 0) => { const d = new Date(today); d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7 || 7) + weeks * 7); return iso(d); };
const birth = (years) => { const d = new Date(today); d.setFullYear(d.getFullYear() - years); d.setDate(d.getDate() - between(0, 360)); return iso(d); };

transaction(() => {
  for (const t of ['castell_positions', 'castells', 'attendance', 'event_fields', 'events', 'auth_tokens', 'admin_tokens', 'admins', 'people']) db.exec(`DELETE FROM ${t}`);

  const insPerson = db.prepare(`INSERT INTO people (username, password_hash, role, name, alias, birthdate, height_cm, shoulder_height_cm, shoulder_width_cm, weight_kg, instrument)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const people = [];
  // El compte d'administració és a part; el cap de colla, a més, té la seva fitxa de membre com tothom.
  db.prepare('INSERT INTO admins (username, password_hash, name) VALUES (?, ?, ?)').run('admin', hashPassword(ADMIN_PASSWORD), 'Junta tècnica');
  insPerson.run(null, null, 'member', 'Cap de colla', 'Cap', birth(41), 178, 147, 46, 82, null);
  // Uns quants músics: les primeres persones toquen la gralla o el timbal.
  const instrumentOf = (i) => (i < 5 ? 'gralla' : i < 8 ? 'timbal' : null);

  first.forEach((n, i) => {
    const height = between(155, 192);
    const p = {
      name: `${n} ${pick(last)} ${pick(last)}`,
      alias: i % 6 === 5 ? null : aliases.splice(Math.floor(rand() * aliases.length), 1)[0] ?? null,
      age: between(17, 58), height, shoulder: Math.round(height * 0.82), width: between(36, 50), weight: between(52, 98),
    };
    const instrument = instrumentOf(i);
    const id = Number(insPerson.run(null, null, 'member', p.name, p.alias, birth(p.age), p.height, p.shoulder, p.width, p.weight, instrument).lastInsertRowid);
    people.push({ id, ...p, instrument });
  });
  kids.forEach((n) => {
    const age = between(7, 13), height = between(118, 150);
    const id = Number(insPerson.run(null, null, 'member', `${n} ${pick(last)}`, null, birth(age), height, Math.round(height * 0.8), between(26, 33), between(22, 40), null).lastInsertRowid);
    people.push({ id, name: n, age, height, shoulder: Math.round(height * 0.8), weight: 30, kid: true });
  });

  const insEvent = db.prepare('INSERT INTO events (type, title, date, start_time, end_time, location, description, escoleta, escoleta_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const ev = (type, title, date, start, end, location, description, escoleta = null) =>
    Number(insEvent.run(type, title, date, start, end, location, description, escoleta ? 1 : 0, escoleta).lastInsertRowid);
  // Temporada anterior (any passat), per tenir estadístiques de més d'una temporada.
  const lastYear = new Date().getFullYear() - 1;
  const events = {
    past25a: ev('diada', 'Diada de Sant Joan', `${lastYear}-06-24`, '12:00', '14:00', 'Plaça de la Vila', null),
    past25b: ev('assaig', 'Assaig general', `${lastYear}-09-18`, '20:00', '22:30', 'Local de la colla', null),
    past25c: ev('diada', 'Diada de la Mercè', `${lastYear}-09-24`, '12:00', '14:00', 'Plaça de la Vila', null),
    pastD: ev('diada', 'Diada de la Festa Major', addDays(-15), '12:00', '14:00', 'Plaça de la Vila', null),
    pastC: ev('assaig', 'Assaig general', addDays(-10), '20:00', '22:30', 'Local de la colla', null),
    pastA: ev('assaig', 'Assaig general', addDays(-6), '20:00', '22:30', 'Local de la colla', null),
    pastB: ev('assaig', 'Assaig general', addDays(-3), '20:00', '22:30', 'Local de la colla', null, '19:00'),
    a1: ev('assaig', 'Assaig general', nextWeekday(2), '20:00', '22:30', 'Local de la colla', 'Assaig de pinyes i proves de tronc del 3d8.', '19:00'),
    musics: ev('musics', 'Assaig de gralles i timbals', nextWeekday(4), '19:30', '21:00', 'Local de la colla', 'Repàs dels tocs de castells per a la diada.'),
    a2: ev('assaig', 'Assaig general', nextWeekday(5), '20:00', '22:30', 'Local de la colla', null),
    diada: ev('diada', 'Diada de Tots Sants', nextWeekday(0, 1), '12:00', '14:00', 'Plaça de la Vila',
      'Actuació conjunta amb les colles convidades. Cal ser a la plaça a les 11:15 amb la camisa.'),
    sopar: ev('esdeveniment', 'Sopar de final de temporada', nextWeekday(6, 3), '21:00', null, 'Casal del barri', 'Sopar de germanor. Hi poden venir famílies i amics.'),
  };

  const insField = db.prepare('INSERT INTO event_fields (event_id, label, kind, options, required, position) VALUES (?, ?, ?, ?, ?, ?)');
  // La diada té data límit per respondre: dos dies abans, a les 22:00.
  const diadaDate = db.prepare('SELECT date FROM events WHERE id = ?').get(events.diada).date;
  const until = new Date(`${diadaDate}T22:00:00`);
  until.setDate(until.getDate() - 2);
  db.prepare('UPDATE events SET rsvp_until = ? WHERE id = ?').run(`${iso(until)}T22:00`, events.diada);
  const fDinar = Number(insField.run(events.diada, 'Em quedo a dinar', 'bool', null, 0, 1).lastInsertRowid);
  const fAcomp = Number(insField.run(events.diada, 'Acompanyants al dinar', 'number', null, 0, 2).lastInsertRowid);
  const fSoparAcomp = Number(insField.run(events.sopar, 'Acompanyants', 'number', null, 1, 1).lastInsertRowid);
  const fMenu = Number(insField.run(events.sopar, 'Menú', 'select', JSON.stringify(['Carn', 'Peix', 'Vegetarià']), 1, 2).lastInsertRowid);

  const insAtt = db.prepare('INSERT INTO attendance (event_id, person_id, status, present, came, escoleta, extra) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const p of people) {
    for (const [key, eid] of Object.entries(events)) {
      const r = rand();
      const status = r < 0.72 ? 'si' : r < 0.82 ? 'potser' : r < 0.92 ? 'no' : null;
      if (!status) continue;
      let extra = {};
      if (key === 'diada' && status === 'si') extra = { [fDinar]: rand() < 0.6, [fAcomp]: between(0, 2) };
      if (key === 'sopar' && status === 'si') extra = { [fSoparAcomp]: between(0, 3), [fMenu]: pick(['Carn', 'Carn', 'Peix', 'Vegetarià']) };
      // A les sessions passades, alguns apuntats no van venir i alguns no apuntats sí.
      const past = key.startsWith('past');
      const came = past && status === 'si' && rand() < 0.08 ? 0 : past && status !== 'si' && rand() < 0.3 ? 1 : null;
      const escoleta = (key === 'pastB' || key === 'a1') && p.kid ? (rand() < 0.8 ? 1 : 0) : null;
      if (key === 'musics' && !p.instrument) continue;
      insAtt.run(eid, p.id, status, came === 1 || (came === null && past && status === 'si') ? 1 : 0, came, escoleta, JSON.stringify(extra));
    }
  }

  const insCastell = db.prepare(`INSERT INTO castells (event_id, width, height, agulla, folre, manilles, puntals, sota, net, from_level, to_level, gralles, timbals, cordons, label, result, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insPos = db.prepare('INSERT INTO castell_positions (castell_id, pos_key, person_id) VALUES (?, ?, ?)');

  // Col·loca gent de manera raonable: els més alts i pesants a baix, la canalla a dalt.
  function fill(castellId, cfg, ratio) {
    const s = buildStructure(cfg);
    const musicians = people.filter((p) => p.instrument);
    const adults = people.filter((p) => !p.kid && !(s.musica.length && p.instrument)).sort((a, b) => b.weight - a.weight);
    const kidsList = people.filter((p) => p.kid).sort((a, b) => b.weight - a.weight);
    const used = new Set();
    const take = (list) => { const p = list.find((x) => !used.has(x.id)); if (p) used.add(p.id); return p; };
    const order = [];
    for (const level of s.levels) for (const cell of level.cells) order.push(cell);
    for (const a of s.agulla) order.push(a);
    for (const layer of s.layers) for (const item of layer.items) if (!item.shared) order.push(item);
    for (const pos of s.musica) {
      const p = musicians.find((m) => m.instrument === pos.kind && !used.has(m.id));
      if (p) { used.add(p.id); insPos.run(castellId, pos.key, p.id); }
    }
    for (const pos of order) {
      if (rand() > ratio) continue;
      const p = pos.group === 'pom' || (pos.key.startsWith('ag') && pos.level >= cfg.height - 3) ? take(kidsList) || take(adults) : take(adults);
      if (p) insPos.run(castellId, pos.key, p.id);
    }
  }
  const castell = (eid, cfg, label, result, position, ratio) => {
    const id = Number(insCastell.run(eid, cfg.width, cfg.height, cfg.agulla || 0, cfg.folre || 0, cfg.manilles || 0, cfg.puntals || 0, cfg.sota || 0, cfg.net || 0, cfg.from_level || 1, cfg.to_level || 0, cfg.gralles || 0, cfg.timbals || 0, cfg.cordons ?? 4, label, result, position).lastInsertRowid);
    fill(id, { cordons: 4, ...cfg }, ratio);
  };
  castell(events.past25a, { width: 3, height: 7, gralles: 3, timbals: 2 }, '1a ronda', 'descarregat', 1, 1);
  castell(events.past25a, { width: 4, height: 7, agulla: 1 }, '2a ronda', 'intent', 2, 0.9);
  castell(events.past25a, { width: 4, height: 7, agulla: 1 }, '2a ronda', 'carregat', 3, 0.9);
  castell(events.past25a, { width: 1, height: 5, cordons: 1 }, 'Pilar', 'descarregat', 4, 1);
  castell(events.past25b, { width: 3, height: 8, cordons: 2, from_level: 2, to_level: 5 }, 'Prova de tronc', 'descarregat', 1, 0.8);
  castell(events.past25b, { width: 2, height: 6, cordons: 2 }, null, 'intent desfet', 2, 0.8);
  castell(events.past25c, { width: 3, height: 7 }, '1a ronda', 'descarregat', 1, 1);
  castell(events.past25c, { width: 4, height: 7, agulla: 1 }, '2a ronda', 'descarregat', 2, 0.9);
  castell(events.past25c, { width: 2, height: 6, cordons: 2 }, '3a ronda', 'carregat', 3, 0.8);
  castell(events.pastD, { width: 3, height: 7, gralles: 3, timbals: 2 }, '1a ronda', 'descarregat', 1, 1);
  castell(events.pastD, { width: 4, height: 7, agulla: 1, gralles: 3, timbals: 2 }, '2a ronda', 'descarregat', 2, 0.9);
  castell(events.pastD, { width: 2, height: 6, cordons: 2 }, '3a ronda', 'carregat', 3, 0.8);
  castell(events.pastD, { width: 1, height: 5, cordons: 1 }, 'Pilar', 'descarregat', 4, 1);
  castell(events.pastC, { width: 3, height: 8, cordons: 2, to_level: 5 }, 'Prova de tronc', 'carregat', 1, 0.7);
  castell(events.pastC, { width: 4, height: 7, agulla: 1 }, null, 'intent desfet', 2, 0.8);
  castell(events.pastA, { width: 3, height: 7 }, null, 'descarregat', 1, 0.9);
  castell(events.pastA, { width: 3, height: 6, net: 1 }, 'Prova neta', 'descarregat', 2, 1);
  castell(events.pastA, { width: 1, height: 5, cordons: 1 }, null, 'intent', 3, 1);
  castell(events.pastB, { width: 3, height: 7 }, null, 'descarregat', 1, 1);
  castell(events.pastB, { width: 4, height: 7, agulla: 1, to_level: 5 }, null, 'descarregat', 2, 0.85);
  castell(events.a1, { width: 3, height: 8, cordons: 2, from_level: 2, to_level: 6 }, 'Prova de tronc', 'previst', 1, 0.6);
  castell(events.a1, { width: 3, height: 6, net: 1 }, 'Prova neta', 'previst', 2, 1);
  castell(events.a1, { width: 1, height: 5, cordons: 1 }, null, 'previst', 3, 1);
  castell(events.a1, { width: 1, height: 4, cordons: 1, sota: 1 }, 'Pilar per sota', 'previst', 4, 1);
  castell(events.diada, { width: 3, height: 7, gralles: 3, timbals: 2 }, '1a ronda', 'previst', 1, 1);
  castell(events.diada, { width: 4, height: 7, agulla: 1, gralles: 3, timbals: 2 }, '2a ronda', 'previst', 2, 0.85);
  castell(events.diada, { width: 2, height: 6, cordons: 2 }, '3a ronda', 'previst', 3, 0.5);
  castell(events.diada, { width: 1, height: 5, cordons: 1 }, 'Pilar de sortida', 'previst', 4, 1);
});

console.log(`Dades de demostració creades.
  Administrador → usuari: admin · contrasenya: ${ADMIN_PASSWORD}
  Membres       → entren sense contrasenya triant el seu nom a «Qui ets?»`);
