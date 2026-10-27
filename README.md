# Colla castellera

Aplicació web (mòbil i ordinador) per gestionar una colla castellera:

- **Sessions**: assajos, diades, esdeveniments i **assajos de músics**, amb data, hora, lloc i descripció.
  Els assajos de músics només els veuen els músics (i els administradors); no tenen castells, i l'assistència
  es mostra agrupada per instrument (gralles i timbals).
- **Calendari** (tothom): vista mensual amb les sessions, de colors segons el tipus (les diades es veuen d'un cop d'ull).
  Toca una sessió per obrir-la; els admins també poden tocar un dia buit per crear-n'hi una amb aquella data. Al mòbil, cada sessió és un punt i la llista del mes surt a sota.
- **Al meu calendari**: el botó del calendari permet subscriure's a les sessions des de l'iPhone/Mac o Google Calendar
  (Android); s'actualitzen soles. A cada sessió també es pot afegir només aquella. L'enllaç (`/api/calendar.ics`) és
  públic perquè les apps de calendari no poden identificar-se: només hi surten les sessions, cap persona.
- **Data límit per respondre** (opcional, a cada sessió): després ja no es pot canviar la resposta. Sense data límit,
  es pot respondre fins al mateix dia. L'admin també pot tancar-les o tornar-les a obrir amb un botó.
- **Qui falta per contestar** (admins): a cada sessió, la llista de malnoms que encara no han respost, amb un botó per
  **enviar-la per WhatsApp** o copiar el missatge (porta l'enllaç a la sessió).
- **Sessions pendents**: a l'inici, cada sessió porta una franja de color segons la teva resposta, i un avís si en tens
  sense respondre.
- **Assistència**: cada persona respon *Vinc* o *No vinc* (sense «potser», perquè la tècnica sàpiga amb qui pot comptar) i respon els **camps extra** de la sessió
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
  - *Pinya*: planta en caixes de colors, com els esquemes de pinya en paper. Cada baix té l'agulla al davant, el
    contrafort al darrere, una crossa a cada costat i la línia de mans (primeres, segones…) amb una línia de laterals
    a cada costat; entre dos baixos hi ha la línia de vents. «Cordons» = persones per línia (fins a 12).
    La torre té una sola agulla; el pilar no porta crosses i té mans i vents pels dos costats; als castells amb
    agulla, el baix del pilar queda al centre. Els castells compostos segueixen la seva estructura: 5 = tres i torre,
    7 = quatre i tres, 9 = tres i tres torres. També folre, manilles i puntals. La rengla queda a dalt.
  - *Llista*: totes les posicions en text, còmode per al mòbil.
  - *Historial*: a cada posició, qui l'ha fet en aquest mateix castell (un 3d7, en altres 3d7) i quants cops
    (toca-la per veure la llista completa i, si ets admin, col·locar-hi algú directament).
  - **Cercador**: escriu un nom i es ressalta la seva posició (o, a l'historial, les posicions que ha fet).
  - Botó **On sóc?** per trobar-te ràpidament, i la teva posició destacada a dalt.
  - **Pantalla completa**: amplia el castell amb els dits (pinça), la roda del ratolí o els botons + i −, i arrossega
    per moure't. Al mòbil, tocar la pinya l'obre directament ampliada, centrada on ets tu si hi surts.
- **Estadístiques** per temporades (cada any natural: 2025, 2026…) o de tota la història, i de totes les sessions,
  només diades o només assajos. Només compten les sessions passades.
  - *Tècnica* (admins): un castell és de tota la colla, així que no es mira qui ha fallat sinó:
    - **què acompanya els castells descarregats**: tronc repetit respecte a l'últim cop o amb canvis, tronc amb
      experiència a cada posició o amb gent nova, i pinya plena (≥90 %) o incompleta;
    - **com avança cada castell**: es tria un castell i es veu un gràfic de columnes per mes (separat per anys) amb
      quants intents n'hi ha de cada resultat, quants intents sencers i parcials s'han fet, quants han calgut fins al
      primer descarregat, el percentatge de descarregats a assajos i a diades, els últims intents i les notes de la tècnica;
    - **preparació de les properes diades**: per a cada castell, quanta gent del tronc ha assajat la seva posició
      d'aquell castell les últimes 6 setmanes;
    - **recanvis per a cada castell** (es tria el castell, perquè una mateixa posició no és igual en un 3de7 que en un
      4de8): qui ha fet cada posició del tronc en aquell castell, un avís quan poca gent ho ha fet sovint i propostes de
      gent que es podria preparar (alçada d'espatlles i pes semblants, i experiència al mateix pis en altres castells).
  - *Resum de temporada* (tothom): millor castell, resultats, mitjana de gent per assaig i per diada, castells
    descarregats (i els només carregats) i les diades amb els seus castells. No hi surt cap persona.
  - *Cada membre* veu les seves: castells fets, com han acabat (descarregat, carregat, intent, intent desfet),
    sessions on ha vingut, i el detall **per castell** (vegades, posicions i resultats) i **per posició**.
  - *Els administradors* veuen, a més, una taula **per castell** (vegades, resultats, diades/assajos, proves parcials
    i data del primer descarregat; toca'l per veure cada vegada) i una taula **per persona**, que porta a les
    estadístiques de cadascú.
- **Historial de posicions** de cada persona (fitxa i perfil): quantes vegades ha fet cada posició i els últims castells.
  Es calcula sol a partir de les alineacions dels castells de sessions passades (fins avui inclòs).
- **Revisió de l'alineació** (admins): a cada castell, avisos de gent col·locada que ha dit que no ve o
  que no ha contestat; posicions buides al tronc; pisos amb més de 5 cm de diferència d'alçada d'espatlles; i algú que
  pesa més de 3 kg més que qui el porta. Tocant un nom es va a la seva posició.
- **Muntador automàtic** (admins): proposa una alineació amb qui ha confirmat, tenint en
  compte l'historial (la mateixa posició en el mateix castell i, en segon terme, la categoria en qualsevol castell, p. ex. «Segon»), el pes, l'alçada d'espatlles del pis i l'edat
  (la canalla només al pom de dalt). Pots muntar només el tronc, només la pinya o tot, i mantenir el que ja hi ha.
  La proposta es veu marcada al castell i no es desa fins que no la apliques. La lògica és a `public/muntador.js`.
- **Administradors**: creen/editen sessions i castells, assignen o canvien persones a cada posició
  (cercant per nom o ordenant per alçada d'espatlles, alçada o pes), poden posar convidats d'altres colles,
  i dupliquen castells (amb l'alineació) a una altra sessió. Truc ràpid: toca un nom a «Confirmats sense posició»
  i després una posició.
- **Fitxa de cada persona**: alçada, alçada i amplada d'espatlles, pes, data de naixement (edat), contacte i notes.
  A la llista de persones, l'assistència és la de la temporada actual (sense comptar els assajos de músics).
  Només la veuen els administradors.
- **Malnoms**: cada persona pot tenir un malnom únic; és el que surt a la pinya, al tronc i a les llistes.
  Sense malnom, es mostra «Nom I.» (nom i inicial del cognom).
- **Persones temporals** de cada sessió: gent que no és de la colla (d'una altra colla, de prova…). Es creen a la
  sessió o des del castell (nom i, si voleu, colla, alçada d'espatlles i pes) i es poden col·locar a qualsevol castell
  d'aquella sessió. No surten a la llista de persones ni compten a l'historial ni a les estadístiques. Les mides, si
  s'hi posen, compten a la revisió de l'alineació.
- **Notes de la tècnica** (admins): a cada castell es pot escriure com ha anat i què cal assajar. Només les veuen els
  administradors.
- **Preparació del tronc** (admins): a la revisió de l'alineació d'una diada surt qui no ha fet mai la seva posició en
  aquell castell i qui no l'ha assajada les últimes 6 setmanes.

- **Idioma i aparença**: català, castellà o anglès, i tema automàtic, clar o fosc (es recorda a cada dispositiu).
  Els termes castellers (baix, pinya, enxaneta, folre…) es mantenen en català a tots els idiomes.

## Com s'entra i tipus d'usuari

- **Membres**: obren la web i, la primera vegada, l'app els pregunta **«Qui ets?»**. Trien el seu nom i ja són dins
  (sense registre ni contrasenya; ho recorda durant un any en aquell dispositiu). El teu nom surt sempre a dalt a la
  dreta: tocant-lo s'obren els ajustos amb **«No sóc jo · Canvia de persona»**, l'idioma i el tema. A l'inici també
  hi ha un accés directe per canviar de persona.
- **Comptes d'administració**: són **a part de les persones** i només serveixen per editar. S'entra per «Entrar com a
  administrador/a» amb usuari i contrasenya, i es gestionen a la pàgina «Comptes». En mode administració la barra de
  dalt té una franja taronja i no hi ha res per respondre.
  Qui és administrador i també fa castells té la seva fitxa de membre com tothom: al mateix mòbil pot tenir les dues
  entrades obertes i passar d'una a l'altra des dels ajustos («Respon com a…» / «Passa al mode administració»),
  sense tornar a posar la contrasenya.

| | Membre | Administrador/a |
|---|---|---|
| Veure sessions i castells (tronc, pinya, llista), cercador i «On sóc?» | ✓ | ✓ |
| Confirmar la pròpia assistència (i l'escoleta) i respondre els camps extra | ✓ | |
| Veure qui ha confirmat que hi va (només noms) | ✓ | ✓ |
| Perfil: el propi malnom i el propi historial de posicions (només lectura) | ✓ | |
| Calendari mensual de sessions | ✓ | ✓ |
| Les pròpies estadístiques (per temporada o de tota la història) | ✓ | |
| Resum de temporada i subscripció al calendari | ✓ | ✓ |
| Pestanya «Historial» dels castells i historial dels altres | | ✓ |
| Estadístiques per castell i de cada persona | | ✓ |
| Editar dades i mides de qualsevol persona | | ✓ |
| Crear/editar/esborrar sessions, camps extra i castells | | ✓ |
| Col·locar persones (també temporals), muntador automàtic, duplicar castells | | ✓ |
| Taula d'assistència completa, passar llista (no presentats i gent no apuntada), exportar CSV | | ✓ |
| Pàgina «Persones»: donar d'alta gent, desactivar | | ✓ |
| Pàgina «Comptes»: crear, editar i esborrar comptes d'administració | | ✓ |
| Data límit de respostes, llista de qui falta per contestar i missatge per WhatsApp | | ✓ |
| Revisió de l'alineació (avisos) | | ✓ |
| Veure noms complets i dades personals (edat, mides, contacte…) | | ✓ |
| Crear sessions des del calendari | | ✓ |

Com que els membres no tenen contrasenya, qualsevol persona que tingui l'enllaç pot triar un nom. Per això, el servidor
no envia mai als membres cap dada personal: només el malnom (o «Nom I.» si no en té), ni tan sols la pròpia. Les dades
personals només les veuen els administradors, que entren amb contrasenya. Si voleu una mica
de protecció, definiu `COLLA_CODE`: la primera vegada es demanarà aquest codi (el mateix per a tota la colla).

### Seguretat

- Contrasenyes d'administració guardades amb scrypt; després de 10 intents fallits des d'un mateix lloc cal esperar 15 minuts.
- Sessions en cookies `HttpOnly` i `SameSite=Lax` (i `Secure` amb HTTPS). Les peticions que canvien dades han de venir
  de la mateixa web.
- Capçaleres de seguretat: només es carreguen scripts de la mateixa app (CSP), no es pot posar dins d'un marc d'una
  altra web, i amb HTTPS s'activa HSTS.
- L'exportació CSV neutralitza el text que un full de càlcul podria executar com a fórmula.
- Tot el text que escriu la gent es mostra escapat (no es pot injectar HTML).

## Requisits

Només **Node.js 22.13 o més nou** (fa servir el SQLite integrat de Node). No cal instal·lar cap dependència.

## Posar-la en marxa

```bash
cd colla-castellera
node server.js
```

Obre <http://localhost:3000>. La primera vegada es crea el compte d'administració `admin` amb una contrasenya aleatòria
que apareix a la consola (o la que posis a `ADMIN_PASSWORD`). Si la base de dades és d'una versió anterior, els
administradors d'abans passen sols a comptes d'administració (amb el mateix usuari i contrasenya) i la seva fitxa
queda com a membre.

Per provar-la amb dades d'exemple (**esborra les dades existents**):

```bash
node seed.js
```

A la demostració, els membres entren triant el seu nom; l'administrador és `admin` / `admin1234`. Les persones i els
malnoms de la demostració són inventats (els malnoms són noms de fruites i verdures).
Hi ha unes 125 persones (amb mainada i músics) i dues temporades senceres: assajos els dimarts i divendres, una diada
cada 3–4 setmanes i castells que van pujant al llarg de la temporada, cadascun amb el seu tronc habitual i
substitucions quan algú falta.

### Configuració (variables d'entorn)

| Variable | Per defecte | Descripció |
|---|---|---|
| `PORT` | `3000` | Port del servidor |
| `COLLA_NAME` | `La meva colla` | Nom que es mostra a l'aplicació |
| `DB_PATH` | `data/colla.db` | Fitxer de la base de dades SQLite |
| `ADMIN_PASSWORD` | aleatòria | Contrasenya de l'`admin` inicial (només si encara no n'hi ha cap) |
| `COLLA_CODE` | (cap) | Codi compartit que es demana als membres abans de «Qui ets?» |
| `TZ` | `Europe/Madrid` | Zona horària de les sessions i de les dates límit |

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
public/theme.js    Aplica el tema i l'idioma abans de pintar la pàgina
public/app.js      Interfície (sessions, assistència, persones, perfil, visualitzador)
public/castell.js  Generador de l'estructura de cada castell (posicions i planta de la pinya)
public/muntador.js Muntador automàtic d'alineacions
public/zoom.js     Visor a pantalla completa (pinça, roda, arrossegar)
public/i18n.js     Traduccions (català, castellà, anglès), també per als errors del servidor
public/style.css   Estils (clar/fosc, responsive)
```

La pinya es genera de manera automàtica a partir del tipus de castell i del nombre de cordons; és un model genèric.
Si la vostra colla organitza la pinya diferent, es pot ajustar a `public/castell.js` (funció `buildLayer`).
