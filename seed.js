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
  'Rosa', 'Biel', 'Gemma', 'Martí', 'Txell', 'Eloi', 'Judit', 'Ferran', 'Irene', 'Dani', 'Mariona', 'Toni', 'Èlia', 'Bernat',
  'Queralt', 'Adrià', 'Sílvia', 'Jaume', 'Alba', 'Guillem', 'Cristina', 'Lluís', 'Meritxell', 'Enric', 'Sara', 'Ricard', 'Agnès',
  'Víctor', 'Paula', 'Hèctor', 'Lídia', 'David'];
const last = ['Puig', 'Vila', 'Soler', 'Ferrer', 'Roca', 'Serra', 'Font', 'Pujol', 'Casals', 'Riera', 'Coll', 'Mas', 'Bosch', 'Sala', 'Prat',
  'Vidal', 'Camps', 'Pons', 'Batlle', 'Valls', 'Comas', 'Oliver', 'Planas', 'Rius'];
const kids = ['Pep', 'Lia', 'Nil', 'Iu', 'Abril', 'Jan', 'Mia', 'Roc', 'Ot', 'Gal·la', 'Arlet', 'Lluc', 'Bruna', 'Pere', 'Martina', 'Teo'];
// Malnoms inventats per a la demostració (fruites, verdures, herbes i grans), perquè no coincideixin amb gent real.
const aliases = ['Pebrot', 'Ceba', 'Fesol', 'Cigró', 'Pruna', 'Nespra', 'Rave', 'Bleda', 'Carxofa', 'Moniato', 'Codony', 'Albercoc',
  'Préssec', 'Meló', 'Síndria', 'Gerd', 'Móra', 'Llimona', 'Taronja', 'Magrana', 'Figa', 'Castanya', 'Avellana', 'Pèsol', 'Ametlla',
  'Pastanaga', 'Api', 'Julivert', 'Alfàbrega', 'Farigola', 'Romaní', 'Espàrrec', 'Enciam', 'Tomàquet', 'Cogombre', 'Albergínia',
  'Carbassó', 'Mongeta', 'Nap', 'Porro', 'All', 'Escarola', 'Bròquil', 'Coliflor', 'Col', 'Espinac', 'Remolatxa', 'Xirivia',
  'Carbassa', 'Patata', 'Nou', 'Pinyó', 'Dàtil', 'Pera', 'Poma', 'Plàtan', 'Raïm', 'Cirera', 'Maduixa', 'Kiwi', 'Mango', 'Coco',
  'Llima', 'Aranja', 'Mandarina', 'Nabiu', 'Grosella', 'Fonoll', 'Menta', 'Sàlvia', 'Orenga', 'Llorer', 'Marduix', 'Anet', 'Oliva',
  'Tòfona', 'Xampinyó', 'Múrgola', 'Fajol', 'Blat', 'Ordi', 'Civada', 'Arròs', 'Mill', 'Sègol', 'Llentia', 'Fava', 'Garrofa',
  'Gínjol', 'Atzerola', 'Cacauet', 'Safrà', 'Canyella', 'Vainilla', 'Gingebre', 'Comí'];

const today = new Date();
// Data local (no UTC): si no, prop de mitjanit els dies i els dies de la setmana no quadren.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
const nextWeekday = (wd, weeks = 0) => { const d = new Date(today); d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7 || 7) + weeks * 7); return iso(d); };
const birth = (years) => { const d = new Date(today); d.setFullYear(d.getFullYear() - years); d.setDate(d.getDate() - between(0, 360)); return iso(d); };
const weekday = (date) => new Date(`${date}T12:00:00`).getDay();

// Castells que es fan, de més fàcil a més difícil (dificultat 0–3).
const C = {
  '3d6': { width: 3, height: 6, d: 0 }, '4d6': { width: 4, height: 6, d: 0 }, pd4: { width: 1, height: 4, cordons: 1, d: 0 },
  '3d6n': { width: 3, height: 6, net: 1, d: 1 }, '2d6': { width: 2, height: 6, cordons: 2, d: 1 }, pd5: { width: 1, height: 5, cordons: 1, d: 1 },
  '3d7': { width: 3, height: 7, d: 1 }, '4d7': { width: 4, height: 7, d: 1 }, '4d7a': { width: 4, height: 7, agulla: 1, d: 2 },
  '3d8': { width: 3, height: 8, cordons: 2, d: 3 },
};
// Què s'assaja i què es fa a plaça a cada moment de la temporada (inici, mitjan, final).
const ASSAIG = [['3d6', '4d6', '2d6', 'pd4', '3d7'], ['3d7', '4d7', '2d6', 'pd5', '3d6n', '4d7a'], ['3d7', '4d7a', '2d6', 'pd5', '3d8', '3d6n']];
const DIADA = [['3d6', '4d6', '2d6', 'pd4'], ['3d7', '4d7', '2d6', 'pd5'], ['3d7', '4d7a', '2d6', 'pd5']];
const DIADA_NAMES = ['Diada de Sant Jordi', "Diada de l'aniversari", 'Diada de la Verema', 'Diada del Mercat', 'Diada de la Plaça Nova',
  'Trobada de colles', 'Diada del barri de Sant Pere', 'Diada a la Rambla', 'Diada de la colla', 'Diada de les entitats', 'Diada de la Festa Major'];

transaction(() => {
  for (const t of ['announcements', 'castell_templates', 'castell_positions', 'event_guests', 'castells', 'attendance', 'event_fields', 'events', 'auth_tokens', 'admin_tokens', 'admins', 'people']) db.exec(`DELETE FROM ${t}`);

  const insPerson = db.prepare(`INSERT INTO people (username, password_hash, role, name, alias, birthdate, height_cm, shoulder_height_cm, shoulder_width_cm, weight_kg, instrument)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const people = [];
  // El compte d'administració és a part; el cap de colla, a més, té la seva fitxa de membre com tothom.
  db.prepare('INSERT INTO admins (username, password_hash, name) VALUES (?, ?, ?)').run('admin', hashPassword(ADMIN_PASSWORD), 'Administració');
  // Per provar els altres rols a la versió de prova (les contrasenyes són públiques, com la d'admin).
  for (const [username, name] of [['junta', 'Junta'], ['tecnica', 'Tècnica']]) {
    db.prepare('INSERT INTO admins (username, password_hash, name, roles) VALUES (?, ?, ?, ?)').run(username, hashPassword(`${username}1234`), name, username);
  }
  const capId = Number(insPerson.run(null, null, 'member', 'Cap de colla', 'Cap', birth(41), 178, 147, 46, 82, null).lastInsertRowid);
  people.push({ id: capId, name: 'Cap', height: 178, weight: 82, reliability: 0.97 });
  // Uns quants músics: les primeres persones toquen la gralla o el timbal.
  const instrumentOf = (i) => (i < 7 ? 'gralla' : i < 12 ? 'timbal' : null);

  const ADULTS = 110;
  const usedNames = new Set();
  for (let i = 0; i < ADULTS; i++) {
    let name;
    do name = `${first[i % first.length]} ${pick(last)} ${pick(last)}`; while (usedNames.has(name));
    usedNames.add(name);
    const height = between(155, 194);
    const weight = Math.max(50, Math.min(108, height - 100 + between(-12, 16)));
    const p = {
      name, height, weight,
      alias: i % 7 === 6 ? null : aliases.splice(Math.floor(rand() * aliases.length), 1)[0] ?? null,
      age: between(17, 60), shoulder: Math.round(height * 0.82), width: between(36, 50),
      reliability: 0.45 + rand() * 0.5,
    };
    const instrument = instrumentOf(i);
    const id = Number(insPerson.run(null, null, 'member', p.name, p.alias, birth(p.age), p.height, p.shoulder, p.width, p.weight, instrument).lastInsertRowid);
    people.push({ id, ...p, instrument });
  }
  kids.forEach((n) => {
    const age = between(6, 13), height = between(115, 152), weight = Math.round(height / 4.5);
    const id = Number(insPerson.run(null, null, 'member', `${n} ${pick(last)}`, null, birth(age), height, Math.round(height * 0.8), between(26, 33), weight, null).lastInsertRowid);
    people.push({ id, name: n, age, height, shoulder: Math.round(height * 0.8), weight, kid: true, reliability: 0.6 + rand() * 0.3 });
  });

  const insEvent = db.prepare('INSERT INTO events (type, title, date, start_time, end_time, location, description, escoleta, escoleta_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const ev = (type, title, date, start, end, location, description, escoleta = null) =>
    Number(insEvent.run(type, title, date, start, end, location, description, escoleta ? 1 : 0, escoleta).lastInsertRowid);
  const insAtt = db.prepare('INSERT INTO attendance (event_id, person_id, status, present, came, escoleta, extra) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insCastell = db.prepare(`INSERT INTO castells (event_id, width, height, agulla, folre, manilles, puntals, sota, net, from_level, to_level, gralles, timbals, cordons, label, result, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insPos = db.prepare('INSERT INTO castell_positions (castell_id, pos_key, person_id) VALUES (?, ?, ?)');

  // Assistència: cada persona ve més o menys sovint. A les sessions passades queda marcat qui ha vingut.
  function attend(eid, { past, music = false, escoleta = false, extra = () => ({}) }) {
    const present = new Set();
    for (const p of people) {
      if (music && !p.instrument) continue;
      const r = rand();
      const status = r < p.reliability ? 'si' : r < p.reliability + 0.12 ? 'no' : null;
      const came = past && status === 'si' && rand() < 0.06 ? 0 : past && status !== 'si' && rand() < 0.25 ? 1 : null;
      const here = came === 1 || (came === null && status === 'si');
      if (here) present.add(p.id);
      if (!status && !came) continue;
      insAtt.run(eid, p.id, status, past && here ? 1 : 0, came, escoleta && here ? (rand() < (p.kid ? 0.8 : 0.2) ? 1 : 0) : null,
        JSON.stringify(status === 'si' ? extra() : {}));
    }
    return present;
  }

  // Cada castell té el seu tronc habitual; quan algú no hi és, el substitueix qui té mides més semblants.
  const cores = new Map();
  const isTronc = (pos) => ['baixos', 'tronc', 'pom', 'agulla'].includes(pos.group);
  const wantsKid = (pos, cfg) => pos.group === 'pom' || (pos.key.startsWith('ag') && pos.level >= cfg.height - 3);
  function coreOf(name, s, cfg) {
    if (cores.has(name)) return cores.get(name);
    const adults = people.filter((p) => !p.kid && !p.instrument).map((p) => ({ p, w: p.weight + (rand() - 0.5) * 16 })).sort((a, b) => b.w - a.w).map((x) => x.p);
    const kidsList = people.filter((p) => p.kid).sort(() => rand() - 0.5);
    const core = new Map();
    const tronc = [...s.levels.flatMap((l) => l.cells), ...s.agulla].filter(isTronc);
    for (const pos of tronc) {
      const list = wantsKid(pos, cfg) ? kidsList : adults;
      const p = list.find((x) => ![...core.values()].includes(x.id));
      if (p) core.set(pos.key, p.id);
    }
    cores.set(name, core);
    return core;
  }
  const byId = () => new Map(people.map((p) => [p.id, p]));
  let peopleById;
  function fill(castellId, cfg, name, present, ratio) {
    peopleById ||= byId();
    const s = buildStructure(cfg);
    const core = coreOf(name, s, cfg);
    const used = new Set();
    const avail = (p) => present.has(p.id) && !used.has(p.id);
    const put = (pos, p) => { used.add(p.id); insPos.run(castellId, pos.key, p.id); };
    for (const pos of s.musica) {
      const p = people.find((m) => m.instrument === pos.kind && avail(m));
      if (p) put(pos, p);
    }
    const tronc = [...s.levels.flatMap((l) => l.cells), ...s.agulla].filter(isTronc);
    for (const pos of tronc) {
      const regular = peopleById.get(core.get(pos.key));
      let p = regular && avail(regular) && rand() < 0.9 ? regular : null;
      if (!p) {
        const kid = wantsKid(pos, cfg);
        const target = regular?.weight ?? (kid ? 30 : 75);
        p = people.filter((x) => avail(x) && !!x.kid === kid && !x.instrument).sort((a, b) => Math.abs(a.weight - target) - Math.abs(b.weight - target))[0];
      }
      if (p) put(pos, p);
    }
    const rest = people.filter((p) => avail(p) && !p.kid && !p.instrument).sort((a, b) => b.weight - a.weight + (rand() - 0.5) * 20);
    for (const layer of s.layers) for (const item of layer.items) {
      if (item.shared || rand() > ratio) continue;
      const p = rest.find(avail);
      if (p) put(item, p);
    }
  }
  function result(d, progress, diada, partial) {
    if (partial) return rand() < 0.85 ? 'descarregat' : 'carregat';
    const ok = Math.max(0.15, Math.min(0.96, 0.9 - 0.24 * d + 0.25 * progress + (diada ? 0.05 : 0)));
    const r = rand();
    if (r < ok) return 'descarregat';
    const rest = (r - ok) / (1 - ok);
    return rest < 0.45 ? 'carregat' : rest < 0.8 ? 'intent' : 'intent desfet';
  }
  const castell = (eid, key, { label = null, result: res = 'previst', position, ratio, present, partial = null, music = false }) => {
    const base = C[key];
    const cfg = { cordons: 4, ...base, ...(partial || {}), ...(music ? { gralles: 3, timbals: 2 } : {}) };
    const id = Number(insCastell.run(eid, cfg.width, cfg.height, cfg.agulla || 0, cfg.folre || 0, cfg.manilles || 0, cfg.puntals || 0, cfg.sota || 0, cfg.net || 0,
      cfg.from_level || 1, cfg.to_level || 0, cfg.gralles || 0, cfg.timbals || 0, cfg.cordons, label, res, position).lastInsertRowid);
    fill(id, cfg, key, present, ratio);
    return id;
  };

  // Dues temporades senceres: assajos dimarts i divendres (menys a l'agost) i una diada cada 3–4 setmanes.
  function season(fromDay, toDay, lastDiada) {
    const diadaDays = [];
    for (let d = toDay; d >= fromDay + 20; d -= between(21, 28)) diadaDays.unshift(d);
    if (lastDiada != null) diadaDays[diadaDays.length - 1] = lastDiada;
    // Les diades són en diumenge.
    const sundays = diadaDays.map((d) => { const wd = weekday(addDays(d)); return d - wd; }).filter((d) => d >= fromDay && d < 0);
    // L'última diada de la temporada és sempre la mateixa; si en surten més que noms, es tornen a fer servir.
    const L = DIADA_NAMES.length;
    const names = sundays.map((_, i) => DIADA_NAMES[(((L - sundays.length + i) % L) + L) % L]);
    for (let day = fromDay; day <= toDay && day < 0; day++) {
      const date = addDays(day);
      const wd = weekday(date);
      const progress = (day - fromDay) / (toDay - fromDay);
      const stage = progress < 0.3 ? 0 : progress < 0.6 ? 1 : 2;
      const sunday = sundays.indexOf(day);
      if (sunday >= 0) {
        const eid = ev('diada', names[sunday], date, '12:00', '14:00', 'Plaça de la Vila', null);
        const present = attend(eid, { past: true });
        const plan = DIADA[stage];
        plan.forEach((key, i) => {
          const pilar = C[key].width === 1;
          const res = result(C[key].d, progress, true);
          castell(eid, key, { label: pilar ? 'Pilar' : `${i + 1}a ronda`, result: res, position: i + 1, ratio: 0.95, present, music: i === 0 });
        });
        continue;
      }
      if ((wd !== 2 && wd !== 5) || date.slice(5, 7) === '08') continue;
      const escoleta = wd === 2 ? '19:00' : null;
      const eid = ev('assaig', 'Assaig general', date, '20:00', '22:30', 'Local de la colla', null, escoleta);
      const present = attend(eid, { past: true, escoleta: !!escoleta });
      const pool = [...ASSAIG[stage]].sort(() => rand() - 0.5).slice(0, between(2, 4));
      pool.forEach((key, i) => {
        const base = C[key];
        // Els castells més difícils s'assagen per parts (proves de tronc).
        const partial = base.d >= 3 || (base.d >= 2 && rand() < 0.3) ? { from_level: rand() < 0.5 ? 2 : 1, to_level: base.height - between(2, 3) } : null;
        castell(eid, key, { label: partial ? 'Prova de tronc' : null, result: result(base.d, progress, false, !!partial), position: i + 1,
          ratio: 0.55 + rand() * 0.3, present, partial });
      });
    }
  }
  season(-600, -390, null);
  season(-215, -1, -15);

  // Sessions futures.
  const events = {
    a1: ev('assaig', 'Assaig general', nextWeekday(2), '20:00', '22:30', 'Local de la colla', 'Assaig de pinyes i proves de tronc del 3d8.', '19:00'),
    musics: ev('musics', 'Assaig de gralles i timbals', nextWeekday(4), '19:30', '21:00', 'Local de la colla', 'Repàs dels tocs de castells per a la diada.'),
    a2: ev('assaig', 'Assaig general', nextWeekday(5), '20:00', '22:30', 'Local de la colla', null),
    diada: ev('diada', 'Diada de Tots Sants', nextWeekday(0, 1), '12:00', '14:00', 'Plaça de la Vila',
      'Actuació conjunta amb les colles convidades. Cal ser a la plaça a les 11:15 amb la camisa.'),
    a3: ev('assaig', 'Assaig general', nextWeekday(2, 1), '20:00', '22:30', 'Local de la colla', null, '19:00'),
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
  // El sopar pregunta pels acompanyants: cadascun és una persona temporal de la sessió.
  db.prepare('UPDATE events SET ask_companions = 1 WHERE id = ?').run(events.sopar);
  const fMenu = Number(insField.run(events.sopar, 'Menú', 'select', JSON.stringify(['Carn', 'Peix', 'Vegetarià']), 1, 2).lastInsertRowid);
  const present = {
    a1: attend(events.a1, { past: false, escoleta: true }),
    musics: attend(events.musics, { past: false, music: true }),
    a2: attend(events.a2, { past: false }),
    diada: attend(events.diada, { past: false, extra: () => ({ [fDinar]: rand() < 0.6, [fAcomp]: between(0, 2) }) }),
    a3: attend(events.a3, { past: false, escoleta: true }),
    sopar: attend(events.sopar, { past: false, extra: () => ({ [fMenu]: pick(['Carn', 'Carn', 'Peix', 'Vegetarià']) }) }),
  };
  // Altaveu: uns quants missatges de l'administració.
  const insNews = db.prepare("INSERT INTO announcements (title, body, pinned, author, created_at) VALUES (?, ?, ?, 'Tècnica', datetime('now', ?))");
  insNews.run('Camisa i faixa per a la diada', "Recordeu portar la camisa neta i la faixa. Ens trobem a la plaça a les 11:15.\nQui necessiti faixa, que ho digui a l'assaig de dijous.", 1, '-2 days');
  insNews.run("Canvi d'hora de l'assaig", "Aquesta setmana l'assaig del dijous comença a les 20:30 per l'obra del local.", 0, '-1 days');
  insNews.run('Fotos de la darrera diada', 'Ja teniu les fotos penjades: https://example.com/fotos-diada', 0, '-6 days');
  const insCompanion = db.prepare('INSERT INTO event_guests (event_id, name, companion_of) VALUES (?, ?, ?)');
  const companionNames = ['Laia', 'Oriol', 'Marta', 'Pau', 'Núria', 'Jordi', 'Clara', 'Marc'];
  for (const p of people.filter((x) => present.sopar.has(x.id))) {
    const n = rand() < 0.45 ? between(1, 3) : 0;
    const label = p.alias || p.name.replace(/^(\S+)\s+(\S).*$/, '$1 $2.');
    for (let i = 0; i < n; i++) insCompanion.run(events.sopar, rand() < 0.4 ? pick(companionNames) : `Acompanyant ${/^[aeiouàèéíòóúh]/i.test(label) ? "d'" : 'de '}${label}${n > 1 ? ` (${i + 1})` : ''}`, p.id);
  }
  castell(events.a1, '3d8', { label: 'Prova de tronc', position: 1, ratio: 0.6, present: present.a1, partial: { from_level: 2, to_level: 6 } });
  castell(events.a1, '3d6n', { label: 'Prova neta', position: 2, ratio: 1, present: present.a1 });
  castell(events.a1, 'pd5', { position: 3, ratio: 1, present: present.a1 });
  castell(events.a2, '3d7', { position: 1, ratio: 0.8, present: present.a2 });
  castell(events.a2, '4d7a', { position: 2, ratio: 0.8, present: present.a2 });
  castell(events.a2, '2d6', { position: 3, ratio: 0.8, present: present.a2 });
  castell(events.diada, '3d7', { label: '1a ronda', position: 1, ratio: 1, present: present.diada, music: true });
  castell(events.diada, '4d7a', { label: '2a ronda', position: 2, ratio: 0.9, present: present.diada, music: true });
  castell(events.diada, '2d6', { label: '3a ronda', position: 3, ratio: 0.9, present: present.diada });
  castell(events.diada, 'pd5', { label: 'Pilar de sortida', position: 4, ratio: 1, present: present.diada });
});

// Notes de la tècnica d'alguns intents, i dues persones temporals d'una colla convidada a la propera diada.
const NOTES = ['La pinya ha arribat tard a tancar.', 'Els baixos s\'han obert una mica a la sortida.', 'Molt bé el pom de dalt.',
  'Ha costat carregar: cal assajar més l\'aleta.', 'Primer cop amb aquest tronc: bona base.', 'Els segons han baixat massa ràpid.',
  'Falta gent a les mans: cal reforçar la pinya.', 'Molt ben coordinat amb la música.', 'L\'enxaneta ha dubtat a l\'aleta.',
  'Terços una mica desquadrats d\'alçada.'];
transaction(() => {
  for (const c of db.prepare("SELECT id FROM castells WHERE result != 'previst'").all()) {
    if (rand() < 0.25) db.prepare('UPDATE castells SET tech_notes = ? WHERE id = ?').run(pick(NOTES), c.id);
  }
  // On van fallar els que no es van descarregar: els carregats, a la baixada (a dalt); els intents, a qualsevol pis.
  const setFail = db.prepare('UPDATE castells SET fail_level = ?, fail_cause = ? WHERE id = ?');
  for (const c of db.prepare("SELECT id, height, from_level, to_level, result FROM castells WHERE result IN ('carregat', 'intent', 'intent desfet')").all()) {
    if (rand() < 0.2) continue; // no consta
    const top = c.to_level || c.height;
    const low = c.result === 'carregat' ? Math.max(c.from_level, top - 2) : Math.max(c.from_level, 2);
    const level = low + Math.floor(rand() * (top - low + 1));
    setFail.run(level, rand() < 0.15 ? null : pick(['obert', 'obert', 'decantat', 'cedit', 'cedit', 'altre']), c.id);
  }
  const diada = db.prepare("SELECT id FROM events WHERE title = 'Diada de Tots Sants'").get();
  const insGuest = db.prepare('INSERT INTO event_guests (event_id, name, colla, shoulder_height_cm, weight_kg) VALUES (?, ?, ?, ?, ?)');
  insGuest.run(diada.id, 'Rovelló', 'Colla convidada', 142, 66);
  insGuest.run(diada.id, 'Bolet', 'Colla convidada', 150, 74);
  // L'horari dels assajos que vénen: els nets es fan alhora que la resta, cada carril a continuació de l'anterior.
  const setPlan = db.prepare('UPDATE castells SET plan_time = ?, plan_minutes = ? WHERE id = ?');
  for (const { id, start_time: start } of db.prepare("SELECT id, start_time FROM events WHERE type = 'assaig' AND date >= date('now')").all()) {
    const next = { 0: 15, 1: 15 };
    for (const c of db.prepare('SELECT id, net FROM castells WHERE event_id = ? ORDER BY position').all(id)) {
      const at = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + next[c.net];
      setPlan.run(`${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`, 25, c.id);
      next[c.net] += 25;
    }
  }
});

console.log(`Dades de demostració creades.
  Administrador → usuari: admin · contrasenya: ${ADMIN_PASSWORD}
  Membres       → entren sense contrasenya triant el seu nom a «Qui ets?»`);
