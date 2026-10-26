# Colla castellera

Aplicació web (mòbil i ordinador) per gestionar una colla castellera:

- **Sessions**: assajos, diades, esdeveniments i **assajos de músics**, amb data, hora, lloc i descripció.
  Els assajos de músics només els veuen els músics (i els administradors); no tenen castells, i l'assistència
  es mostra agrupada per instrument (gralles i timbals).
- **Calendari** (admins): vista mensual amb totes les sessions, de colors segons el tipus. Toca una sessió per obrir-la
  o un dia buit per crear-n'hi una amb aquella data. Al mòbil, cada sessió és un punt i la llista del mes surt a sota.
- **Assistència**: cada persona confirma *Vinc / Potser / No vinc* i respon els **camps extra** de la sessió
  (acompanyants, dinar, menú…: número, sí/no, text o llista d'opcions; poden ser obligatoris).
  Els administradors veuen la taula completa amb totals i exporten a CSV.
- **Passar llista**: el dia de la sessió (i després), qui havia dit «Vinc» compta com a present. L'admin només ha de
  marcar **qui no ha vingut** i, amb «Afegeix qui ha vingut», qui ha vingut **sense apuntar-se** (fins i tot algú que
  encara no és a l'app: es crea en aquell moment). Els qui no han vingut deixen de sortir com a disponibles per als
  castells i els que han vingut sense apuntar-se hi passen a sortir.
- **Escoleta**: un assaig pot tenir escoleta abans (amb hora). Cadascú marca si hi vindrà o no, a part de l'assaig.
- **Música**: cada persona pot ser músic (gralla o timbal). Cada castell pot tenir gralles i timbals: surten al
  tronc i a la llista, i el muntador automàtic hi posa músics de l'instrument corresponent.
- **Castells** per sessió (pilars, torres, 3, 4, 5, 7, 9; amb agulla, folre, manilles i puntals; aixecats per sota;
  nombre de cordons de pinya). Nomenclatura: `3d6`, `4d7a`, `3d9fm`, `3d6n` (net), `pd4ps` (per sota).
  - **Castells nets** (`n`): la pinya no toca el tronc; només hi ha tronc, sense pinya, folre ni manilles.
  - **Proves parcials** (assajos): activa «Parcial» i tria en dues llistes **des de quin pis** comença i **fins a
    quin pis** es fa (p. ex. dels segons als quints d'un 3d8). El nom del castell no canvia (segueix sent «3d8»);
    a la pàgina del castell es veu «Prova parcial: de Segons a Quints». Només es treuen pisos del tronc: la pinya,
    el folre, les manilles i els puntals hi són igual. Si no hi ha baixos, el pis més baix que es fa (segons, terços…)
    ocupa el seu lloc a la pinya.
  - **Com ha acabat**: els administradors el marquen amb un toc a la pàgina del castell (previst, descarregat,
    carregat, intent, intent desfet). Es veu a la llista de sessions i a l'historial.
  - Tot això queda guardat per separat a la base de dades (`net`, `from_level`, `to_level`, `result`) per poder fer
    estadístiques més endavant.
- **Visualitzador** de cada castell amb el nom de cada persona a la seva posició:
  - *Tronc*: pisos de baix a dalt (baixos, segons… dosos, acotxador, enxaneta) i pilar central si n'hi ha.
  - *Pinya*: planta en caixes de colors, com els esquemes de pinya en paper. Per cada baix: agulla, baix, contrafort,
    crosses i la línia de mans, amb laterals de mans als costats; pel buit entre baixos, la línia de vents amb laterals
    a cada costat. «Cordons» = persones per línia (fins a 12). També folre, manilles i puntals. La rengla queda a dalt.
  - *Llista*: totes les posicions en text, còmode per al mòbil.
  - *Historial*: a cada posició, qui l'ha fet en castells anteriors de la mateixa amplada i quants cops
    (toca-la per veure la llista completa i, si ets admin, col·locar-hi algú directament).
  - **Cercador**: escriu un nom i es ressalta la seva posició (o, a l'historial, les posicions que ha fet).
  - Botó **On sóc?** per trobar-te ràpidament, i la teva posició destacada a dalt.
  - **Pantalla completa**: amplia el castell amb els dits (pinça), la roda del ratolí o els botons + i −, i arrossega
    per moure't. Al mòbil, tocar la pinya l'obre directament ampliada, centrada on ets tu si hi surts.
- **Estadístiques** per temporades (cada any natural: 2025, 2026…) o de tota la història, i de totes les sessions,
  només diades o només assajos. Només compten les sessions passades.
  - *Cada membre* veu les seves: castells fets, com han acabat (descarregat, carregat, intent, intent desfet),
    sessions on ha vingut, i el detall **per castell** (vegades, posicions i resultats) i **per posició**.
  - *Els administradors* veuen, a més, una taula **per castell** (vegades, resultats, diades/assajos, proves parcials
    i data del primer descarregat; toca'l per veure cada vegada) i una taula **per persona**, que porta a les
    estadístiques de cadascú.
- **Historial de posicions** de cada persona (fitxa i perfil): quantes vegades ha fet cada posició i els últims castells.
  Es calcula sol a partir de les alineacions dels castells de sessions passades (fins avui inclòs).
- **Muntador automàtic** (admins): proposa una alineació amb qui ha confirmat (opcionalment també «Potser»), tenint en
  compte l'historial (la mateixa posició i la categoria, p. ex. «Segon»), el pes, l'alçada d'espatlles del pis i l'edat
  (la canalla només al pom de dalt). Pots muntar només el tronc, només la pinya o tot, i mantenir el que ja hi ha.
  La proposta es veu marcada al castell i no es desa fins que no la apliques. La lògica és a `public/muntador.js`.
- **Administradors**: creen/editen sessions i castells, assignen o canvien persones a cada posició
  (cercant per nom o ordenant per alçada d'espatlles, alçada o pes), poden posar convidats d'altres colles,
  i dupliquen castells (amb l'alineació) a una altra sessió. Truc ràpid: toca un nom a «Confirmats sense posició»
  i després una posició.
- **Fitxa de cada persona**: alçada, alçada i amplada d'espatlles, pes, data de naixement (edat), contacte i notes.
  Les mides només les veuen els administradors i la mateixa persona.
- **Malnoms**: cada persona pot tenir un malnom únic; és el que surt a la pinya, al tronc i a les llistes.
  Sense malnom, es mostra «Nom I.» (nom i inicial del cognom).
- **Persones temporals**: gent que no és a l'aplicació (d'una altra colla, de prova…) es pot col·locar en un castell
  escrivint-ne el nom. Només es guarda en aquell castell i no compta a l'historial.

- **Idioma i aparença**: català, castellà o anglès, i tema automàtic, clar o fosc (es recorda a cada dispositiu).
  Els termes castellers (baix, pinya, enxaneta, folre…) es mantenen en català a tots els idiomes.

## Com s'entra i tipus d'usuari

- **Membres**: obren la web i, la primera vegada, l'app els pregunta **«Qui ets?»**. Trien el seu nom i ja són dins
  (sense registre ni contrasenya; ho recorda durant un any en aquell dispositiu). El teu nom surt sempre a dalt a la
  dreta: tocant-lo s'obren els ajustos amb **«No sóc jo · Canvia de persona»**, l'idioma i el tema. A l'inici també
  hi ha un accés directe per canviar de persona.
- **Administradors**: entren per «Entrar com a administrador/a» amb usuari i contrasenya. Només les persones amb rol
  d'administrador i usuari poden entrar així; si un admin entra per «Qui ets?», només té permisos de membre.

| | Membre | Administrador/a |
|---|---|---|
| Veure sessions i castells (tronc, pinya, llista), cercador i «On sóc?» | ✓ | ✓ |
| Confirmar la pròpia assistència (i l'escoleta) i respondre els camps extra | ✓ | ✓ |
| Veure qui ha confirmat que hi va (només noms) | ✓ | ✓ |
| Perfil: veure les pròpies dades i el propi historial de posicions (només lectura) | ✓ | ✓ |
| Les pròpies estadístiques (per temporada o de tota la història) | ✓ | ✓ |
| Pestanya «Historial» dels castells i historial dels altres | | ✓ |
| Estadístiques per castell i de cada persona | | ✓ |
| Editar dades i mides de qualsevol persona | | ✓ |
| Crear/editar/esborrar sessions, camps extra i castells | | ✓ |
| Col·locar persones (també temporals), muntador automàtic, duplicar castells | | ✓ |
| Taula d'assistència completa, passar llista (no presentats i gent no apuntada), exportar CSV | | ✓ |
| Pàgina «Persones»: donar d'alta gent, fer administradors, desactivar | | ✓ |
| Calendari mensual de sessions | | ✓ |

Com que els membres no tenen contrasenya, qualsevol persona que tingui l'enllaç pot triar un nom. Si voleu una mica
de protecció, definiu `COLLA_CODE`: la primera vegada es demanarà aquest codi (el mateix per a tota la colla).

## Requisits

Només **Node.js 22.13 o més nou** (fa servir el SQLite integrat de Node). No cal instal·lar cap dependència.

## Posar-la en marxa

```bash
cd colla-castellera
node server.js
```

Obre <http://localhost:3000>. La primera vegada es crea l'usuari `admin` amb una contrasenya aleatòria que
apareix a la consola (o la que posis a `ADMIN_PASSWORD`).

Per provar-la amb dades d'exemple (**esborra les dades existents**):

```bash
node seed.js
```

A la demostració, els membres entren triant el seu nom; l'administrador és `admin` / `admin1234`. Les persones i els
malnoms de la demostració són inventats (els malnoms són noms de fruites i verdures).

### Configuració (variables d'entorn)

| Variable | Per defecte | Descripció |
|---|---|---|
| `PORT` | `3000` | Port del servidor |
| `COLLA_NAME` | `La meva colla` | Nom que es mostra a l'aplicació |
| `DB_PATH` | `data/colla.db` | Fitxer de la base de dades SQLite |
| `ADMIN_PASSWORD` | aleatòria | Contrasenya de l'`admin` inicial (només si encara no n'hi ha cap) |
| `COLLA_CODE` | (cap) | Codi compartit que es demana als membres abans de «Qui ets?» |

## Versió de prova gratuïta (Render)

Per deixar que la gent la provi sense instal·lar res, el repositori ja porta `render.yaml`:

1. Entra a <https://render.com> amb el compte de GitHub.
2. **New → Blueprint** i tria aquest repositori. Render llegeix `render.yaml` i crea el servei gratuït.
3. Quan acabi, tindràs una adreça com `https://colla-castellera-demo.onrender.com`.

El servei arrenca amb `npm run demo`: torna a crear les dades de demostració i mostra a la pantalla d'entrada com entrar
(`admin` / `admin1234`). En el pla gratuït el servei s'atura si ningú l'utilitza durant una estona i triga uns
segons a tornar a arrencar; aleshores les dades es reinicien. **No ho feu servir per a dades reals de la colla.**

## Publicar-la per a la colla

Qualsevol servidor amb Node (un VPS, Railway, Fly.io, Render amb disc persistent…) serveix. Posa-hi HTTPS
davant (Caddy, Nginx o el del proveïdor) i assegura't que el fitxer `DB_PATH` està en un disc que no s'esborri.
Fes còpies de seguretat del fitxer `.db` periòdicament.

## Estructura

```
server.js          API REST i servidor de fitxers
db.js              Esquema SQLite i contrasenyes (scrypt)
seed.js            Dades de demostració
public/index.html  Pàgina única
public/app.js      Interfície (sessions, assistència, persones, perfil, visualitzador)
public/castell.js  Generador de l'estructura de cada castell (posicions i planta de la pinya)
public/muntador.js Muntador automàtic d'alineacions
public/zoom.js     Visor a pantalla completa (pinça, roda, arrossegar)
public/i18n.js     Traduccions (català, castellà, anglès), també per als errors del servidor
public/style.css   Estils (clar/fosc, responsive)
```

La pinya es genera de manera automàtica a partir del tipus de castell i del nombre de cordons; és un model genèric.
Si la vostra colla organitza la pinya diferent, es pot ajustar a `public/castell.js` (funció `buildLayer`).
