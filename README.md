<img src="public/icons/icon.svg" alt="" width="72" align="right">

# Appinya't

[![Proves](https://github.com/sherzock/Gestor-Colla-Castellera/actions/workflows/tests.yml/badge.svg)](https://github.com/sherzock/Gestor-Colla-Castellera/actions/workflows/tests.yml)

**Appinya't** és l'aplicació (mòbil i ordinador) per organitzar una colla castellera. «Apinyar-se» és ajuntar-se ben
atapeïts, com a la pinya; la icona és una pinya vista des de dalt. A l'app, el protagonista és el nom de cada colla:
Appinya't només surt, discret, a les pantalles d'entrada i al títol de la pestanya.

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
- **Qui falta per contestar** (admins): a cada sessió, la llista de malnoms que encara no han respost, i un botó per
  **enviar un recordatori per WhatsApp** o copiar-lo. El recordatori és general (no diu qui falta, perquè ningú quedi
  assenyalat davant del grup) i porta l'enllaç a la sessió i, si n'hi ha, el lloc i la data límit.
- **El lloc obre el mapa**: a la pàgina de cada sessió, prémer el lloc l'obre a Google Maps (al mòbil, a l'app de mapes).
  Si el lloc és un nom que el mapa no coneix («Local de la colla»), a la sessió es pot posar a part l'**adreça per al
  mapa**: es continua veient el nom, però s'obre l'adreça. Les sessions noves al mateix lloc la recorden, i el
  calendari la porta al lloc perquè el mòbil la trobi.
- **Sessions pendents**: a l'inici, cada sessió porta una franja de color segons la teva resposta, i un avís si en tens
  sense respondre. Es pot dir *Vinc* o *No vinc* des de la mateixa llista; si la sessió té preguntes obligatòries,
  *Vinc* porta a la sessió per respondre-les.
- **Assistència**: cada persona respon *Vinc* o *No vinc* (sense «potser», perquè la tècnica sàpiga amb qui pot comptar) i respon els **camps extra** de la sessió
  (acompanyants, dinar, menú…: número, sí/no, text o llista d'opcions; poden ser obligatoris).
  Els administradors veuen la taula completa amb totals i exporten a CSV.
- **Altaveu**: pestanya amb missatges d'informació de l'administració per a tota la colla (canvis d'hora, què cal
  portar, enllaços a fotos…). Els administradors els publiquen, editen, esborren i poden fixar-ne a dalt de tot. Les
  adreces web es converteixen en enllaços. Quan hi ha missatges nous, la pestanya surt marcada i a l'inici apareix un
  avís; cada mòbil recorda fins on ha llegit. Els membres no veuen quin compte d'administració ha escrit el missatge.
- **Acompanyants**: en crear o editar una sessió, l'administració pot marcar «Pregunta si vindran acompanyats». Llavors,
  qui respon «Vinc» pot dir quants acompanyants porta i, si vol, el seu nom. Cada acompanyant es crea sol com a
  **persona temporal** de la sessió («Acompanyant de …» si no hi ha nom) i la tècnica el pot col·locar als castells.
  Si la persona en diu menys o ja no ve, els que encara no són a cap castell s'esborren sols. Els que ja hi són es
  queden marcats «Ja no ve» i el castell en mostra un avís. El recompte surt com «40 vénen + 6 acompanyants», i el CSV
  té una columna amb els noms. Els membres no veuen els acompanyants dels altres (als castells, com tothom, «Nom I.»). Amb «Excel amb castells» es descarrega un
  sol fitxer Excel (.xlsx): una pestanya amb l'assistència (les mateixes columnes que el CSV, amb filtres) i una per
  castell, amb qui hi ha a cada posició i la imatge del castell (tronc, pom de dalt i pinya). S'obre amb Excel,
  LibreOffice i Numbers; a Google Sheets les imatges poden no sortir. Les imatges es dibuixen al navegador.
- **Passar llista**: el dia de la sessió (i després), qui havia dit «Vinc» compta com a present. L'admin només ha de
  marcar **qui no ha vingut** i, amb «Afegeix qui ha vingut», qui ha vingut **sense apuntar-se** (fins i tot algú que
  encara no és a l'app: es crea en aquell moment). Els qui no han vingut deixen de sortir com a disponibles per als
  castells i els que han vingut sense apuntar-se hi passen a sortir.
- **Escoleta**: un assaig pot tenir escoleta abans (amb hora), oberta a tothom qui vulgui. Cadascú marca si hi vindrà
  o no, a part de l'assaig.
- **Música**: cada persona pot ser músic (gralla o timbal). Cada castell pot tenir gralles i timbals: surten al
  tronc i a la llista, i el muntador automàtic hi posa músics de l'instrument corresponent.
- **Grups**: a la fitxa de cada persona es pot posar el seu grup (canalla, tècnica o junta; només un). Tronc i pinya
  no ho són, perquè qui fa tronc en un castell sovint fa pinya en un altre. A cada sessió, «Qui hi va» surt separat
  per grups, amb els músics a part i qui no en té a «Altres»; l'administració ho veu igual a la taula d'assistència,
  amb quants en vénen de cada grup.
- **Encarregats**: a cada sessió, l'administració pot posar qui s'encarrega de què (material, farmaciola, aigua… o el
  que sigui; es proposen els que ja s'han fet servir). Tothom ho veu, amb el nom curt, i qui en té un ho veu a la seva
  resposta. Surt també a la descàrrega de les dades de la persona.
- **Castells** per sessió (pilars, torres, 3, 4, 5, 7, 9; amb agulla, folre, manilles i puntals; aixecats per sota;
  nombre de cordons de pinya). Nomenclatura: `3d6`, `4d7a`, `3d9fm`, `3d6n` (net), `pd4ps` (per sota).
  - **Castells nets** (`n`): la pinya no toca el tronc; només hi ha tronc, sense pinya, folre ni manilles.
  - **Proves parcials** (assajos): activa «Parcial» i tria en dues llistes **des de quin pis** comença i **fins a
    quin pis** es fa (p. ex. dels segons als quints d'un 3d8). El nom del castell no canvia (segueix sent «3d8»);
    a la pàgina del castell es veu «Prova parcial: de Segons a Quints». Només es treuen pisos del tronc: la pinya,
    el folre, les manilles i els puntals hi són igual. Si no hi ha baixos, el pis més baix que es fa (segons, terços…)
    ocupa el seu lloc a la pinya.
  - **Com ha acabat**: els administradors el marquen amb un toc a la pàgina del castell (previst, descarregat,
    carregat, intent, intent desfet). Es veu a la llista de sessions i a l'historial. Si no es va descarregar, s'hi pot
    apuntar **on va fallar** (el pis) i què va passar (es va obrir, es va decantar, va cedir un pis o una altra cosa);
    això només ho veuen els administradors.
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
      experiència a cada posició o amb gent nova, pinya plena (≥90 %) o incompleta, cada pis del tronc anivellat
      (≤5 cm de diferència d'espatlles) o desnivellat, i algú que pesa més que qui el porta o no (amb les mides actuals);
    - **com avança cada castell**: es tria un castell i es veu un gràfic de columnes per mes (separat per anys) amb
      quants intents n'hi ha de cada resultat, quants intents sencers i parcials s'han fet, quants han calgut fins al
      primer descarregat, el percentatge de descarregats a assajos i a diades, **on falla** (a quin pis van fallar els
      intents no descarregats i què hi va passar), els últims intents i les notes de la tècnica;
    - **preparació de les properes diades**: per a cada castell, quanta gent del tronc ha assajat la seva posició
      d'aquell castell les últimes 6 setmanes, i quantes posicions no tenen relleu (ningú més actiu les ha fet
      descarregant o carregant aquell castell);
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
- **Sessions i castells ocults** (admins): una sessió o un castell es pot ocultar als membres (per exemple, mentre es
  prepara una diada) i mostrar-lo quan estigui a punt, amb el botó «Oculta als membres» / «Mostra als membres» o en
  crear-lo. Per als membres és com si no existís: no surt a la llista, al calendari, a l'historial ni a les
  estadístiques, i si en tenen l'enllaç no el poden obrir. Si s'oculta una sessió, també queden ocults tots els seus
  castells. Els administradors ho continuen veient tot, marcat com a «Oculta» / «Ocult».
- **Revisió de l'alineació** (admins): a cada castell, avisos de gent col·locada que ha dit que no ve o
  que no ha contestat; posicions buides al tronc; pisos amb més de 5 cm de diferència d'alçada d'espatlles; i algú que
  pesa més de 3 kg més que qui el porta. Abans d'una diada, també qui no ha assajat la seva posició i les posicions
  sense relleu (amb el percentatge de sessions dels últims 3 mesos a què ha vingut qui hi ha). Tocant un nom es va a la
  seva posició.
- **Mides del tronc** (admins): vista «Mides» de cada castell amb l'alçada d'espatlles i el pes de cada persona, el
  desnivell de cada pis i el pes que porta a sobre cada posició (la seva columna i la part del pom de dalt que li toca),
  també en vegades el seu propi pes.
- **Omplir com un castell anterior** (admins): en afegir o editar un castell, el formulari ofereix els 6 castells
  més recents del mateix tipus (de qualsevol sessió fins a la data d'aquesta) que tinguin gent col·locada. Si en tries
  un, se'n copien la gent de cada posició, els cordons, la música i els pisos de la prova. En editar, substitueix
  l'alineació que hi havia (abans es demana confirmació). No es copia gent donada de baixa ni persones temporals d'una
  altra sessió.
- **Muntador automàtic** (admins): proposa una alineació amb qui ha confirmat, tenint en
  compte l'historial (la mateixa posició en el mateix castell i, en segon terme, la categoria en qualsevol castell, p. ex. «Segon»), el pes, l'alçada d'espatlles del pis i l'edat
  (la canalla només al pom de dalt). Pots muntar només el tronc, només la pinya o tot, i mantenir el que ja hi ha.
  Al tronc procura que cada pis quedi anivellat (≤5 cm d'espatlles, comptant també qui ja hi és) i que ningú pesi més
  que qui el porta: després d'omplir-lo prova intercanvis (dins del tronc, amb la pinya o amb gent lliure) mentre
  millori. El que no es pot evitar amb la gent que hi ha surt als avisos de la revisió. Opcionalment proposa un
  **relleu** per a cada posició del tronc amb la gent que ha quedat lliure (no es desa: és per tenir-ho present).
  La proposta es veu marcada al castell i no es desa fins que no la apliques. La lògica és a `public/muntador.js`.
- **Pinyes de la colla** (admins): cada colla fa la pinya a la seva manera. Des de «Comptes» → «Obre l'editor de
  pinyes» (o el botó «Pinya de la colla» d'un castell) es redibuixa la pinya, el folre, les manilles i els puntals de
  cada tipus de castell (3d7, 4d8a…). Es poden arrossegar les caixes, girar-les, canviar-ne el nom o el tipus,
  duplicar-les, afegir-ne de noves (també posicions pròpies amb un altre nom) i treure-les. La plantilla desada val per
  a tots els castells d'aquell tipus, també els passats. Les posicions que es mantenen conserven l'historial i les
  estadístiques. Les que es treuen deixen de comptar, però les alineacions no s'esborren: si es tornen a posar, tornen.
  «Torna a l'estàndard» parteix de la pinya automàtica amb els cordons que triïs, i «Esborra la plantilla» la deixa
  com abans.
- **Administradors**: creen/editen sessions i castells, assignen o canvien persones a cada posició
  (cercant per nom o ordenant per alçada d'espatlles, alçada o pes), poden posar convidats d'altres colles,
  i dupliquen castells (amb l'alineació) a una altra sessió. Truc ràpid: toca un nom a «Confirmats sense posició»
  i després una posició.
- **Fitxa de cada persona**: alçada, alçada i amplada d'espatlles, pes, data de naixement (edat), contacte i notes.
  A la llista de persones, l'assistència és la de la temporada actual (sense comptar els assajos de músics).
  Només la veuen els administradors.
- **Importar persones d'un Excel** (admins): a «Persones» → «Importa des d'un Excel» es tria un fitxer `.xlsx` o
  `.csv` (també el CSV amb «;» i la codificació de Windows que fa Excel) amb una persona per fila. L'app endevina
  quin camp és cada columna pel títol (Nom, Cognoms, Malnom, Alçada, Pes… en català, castellà o anglès) i es pot
  corregir. Entén dates com `15/06/2010` i alçades en metres (`1,62`). Primer es comprova i es diu què passarà
  (persones noves, les que ja hi són i, si n'hi ha, les files amb errors); és tot o res. Qui ja hi és (mateix nom)
  no es toca, tret que es marqui «actualitza-la»: llavors s'hi posen les dades del fitxer (les cel·les buides no
  esborren res). Hi ha una plantilla CSV per començar.
- **Còpies de seguretat** (admins): el servidor en fa una cada dia (es guarden les últimes 14) i a «Comptes» →
  «Descarrega una còpia» se'n baixa una per guardar-la fora del servidor. Les còpies no porten les sessions obertes
  (ni de membres ni d'administració), els mòbils coneguts dels administradors ni els avisos per recollir: amb una còpia
  a la mà no s'entra enlloc.
- **Dades d'una persona** (admins): a la seva fitxa, «Descarrega les seves dades» dona un fitxer JSON amb tot el que
  se'n guarda (fitxa, assistència i respostes, posicions, acompanyants, mòbils amb avisos i recordatoris enviats), per
  si ho demana (dret d'accés i de portabilitat). Els membres no se les poden baixar ells mateixos: entren sense
  contrasenya. Una prova comprova que cada columna i cada taula amb dades de la gent hi surt.
- **Protecció de dades**: una nota per als membres (què es guarda, per a què, qui ho veu, quant de temps i com
  exercir els drets), en català, castellà i anglès. Es pot llegir abans d'entrar i des d'«Ajustos», i imprimir per
  signar-la a paper (els menors de 14 anys, amb la signatura del pare, mare o tutor/a). És un model: la junta l'ha de
  revisar, i cal posar-hi el contacte (`PRIVACY_CONTACT`).
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
- **Previsió d'assistència** (admins): a cada sessió que encara no s'ha fet, quanta gent vindrà probablement (amb un
  marge). Es calcula amb el que ha passat l'últim any a sessions del mateix tipus: quanta gent ha vingut quan havia
  dit que sí i quanta quan no havia respost (per a cada persona, i s'acosta a la mitjana de la colla quan hi ha poca
  història). S'hi sumen les persones temporals i els acompanyants, i es compara amb la gent que cal per al castell més
  gran. Només es mostra el total: cap nom ni cap xifra per persona.

- **Idioma i aparença**: català, castellà o anglès, i tema automàtic, clar o fosc (es recorda a cada dispositiu).
  Els termes castellers (baix, pinya, enxaneta, folre…) es mantenen en català a tots els idiomes.
- **Al mòbil com una app**: des del navegador es pot afegir a la pantalla d'inici (amb el nom de la colla i la seva
  icona). Sense connexió es pot consultar l'últim que s'hi ha vist (sessions, castells i alineacions), amb un avís
  que diu de quan és; per canviar res cal connexió. Amb connexió sempre es veu el més nou. En sortir o canviar de
  persona, el que s'havia desat al dispositiu s'esborra.
- **Avisos al mòbil**: cadascú els activa als Ajustos (a l'iPhone, amb l'app afegida a la pantalla d'inici). Arriben
  quan hi ha un missatge nou a l'Altaveu (es pot publicar sense avís) i, a qui encara no ha respost una sessió, un
  recordatori 24 hores abans de la data límit (o el dia abans, si no en té). L'avís que passa pel servei del mòbil
  (Google, Apple…) va buit: el text el recull el mòbil directament de l'app. El mòbil queda lligat a qui hi ha entrat;
  en sortir o canviar de persona es torna a lligar o es dona de baixa. Cal que l'app sigui en https (a Render ja ho és).

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
- **Rols dels comptes**: cada compte és d'**administració** (tot), de **junta**, de **tècnica** o de junta i tècnica
  alhora. Ho tria l'administració en crear o editar el compte. El «Grup» de la fitxa d'una persona no dona cap permís
  (els membres entren sense contrasenya). Sempre ha de quedar almenys un compte d'administració.

| | Administració | Junta | Tècnica |
|---|---|---|---|
| Crear, editar, ocultar i esborrar sessions; camps extra i encarregats | ✓ | ✓ | |
| Castells: crear, muntar, resultats, notes de la tècnica; persones temporals; editor de pinyes | ✓ | | ✓ |
| Altaveu | ✓ | ✓ | ✓ |
| Assistència: passar llista, recordatori, exportar, tancar o obrir les respostes | ✓ | ✓ | ✓ |
| Estadístiques (les notes de la tècnica, només qui fa castells) | ✓ | ✓ | ✓ |
| Persones: afegir, editar i donar de baixa | ✓ | ✓ | ✓ |
| Veure i editar el telèfon i el correu | ✓ | ✓ | |
| Veure i editar les mides, el pes i les notes de la fitxa | ✓ | | ✓ |
| Veure i editar la data de naixement (el muntador la necessita per a la canalla) | ✓ | ✓ | ✓ |
| Importar persones des d'un Excel | ✓ | ✓ | |
| Esborrar una persona i descarregar les seves dades | ✓ | | |
| Comptes i còpies de seguretat | ✓ | | |

  Els permisos es comproven al servidor, ruta per ruta (`tests/roles.test.js`). A la versió de prova hi ha els comptes
  `junta` / `junta1234` i `tecnica` / `tecnica1234` per provar-ho.

A la taula següent, «Administrador/a» vol dir qualsevol d'aquests comptes, amb els límits de cada rol.

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
| Llegir els missatges de l'altaveu | ✓ | ✓ |
| Publicar, editar i esborrar missatges de l'altaveu | | ✓ |
| Ocultar o mostrar sessions i castells als membres | | ✓ |
| Col·locar persones (també temporals), muntador automàtic, duplicar castells | | ✓ |
| Taula d'assistència completa, passar llista (no presentats i gent no apuntada), exportar CSV o Excel amb els castells | | ✓ |
| Editor de pinyes de la colla (plantilles per tipus de castell) | | ✓ |
| Pàgina «Persones»: donar d'alta gent, desactivar | | ✓ |
| Pàgina «Comptes»: crear, editar i esborrar comptes d'administració | | ✓ |
| Data límit de respostes, llista de qui falta per contestar i recordatori per WhatsApp | | ✓ |
| Revisió de l'alineació (avisos) | | ✓ |
| Veure noms complets i dades personals (edat, mides, contacte…) | | ✓ |
| Crear sessions des del calendari | | ✓ |

Com que els membres no tenen contrasenya, qualsevol persona que tingui l'enllaç pot triar un nom. Per això, el servidor
no envia mai als membres cap dada personal: només el malnom (o «Nom I.» si no en té), ni tan sols la pròpia. Les dades
personals només les veuen els administradors, que entren amb contrasenya. Si voleu una mica
de protecció, definiu `COLLA_CODE`: la primera vegada es demanarà aquest codi (el mateix per a tota la colla).

### Seguretat

- Contrasenyes d'administració guardades amb scrypt (mínim 8 caràcters; no s'accepten les més típiques ni la que
  és igual que l'usuari). Després de 10 intents fallits des d'un mateix lloc cal esperar 15 minuts, i un mateix compte
  no admet més de 50 intents fallits cada 15 minuts encara que vinguin de molts llocs. Amb IPv6 es compta tot el bloc
  `/64` (si no, canviar d'adreça saltaria el límit). La resposta triga el mateix tant si l'usuari existeix com si no.
- Perquè ningú pugui deixar fora l'administració provant contrasenyes dolentes a propòsit, als mòbils on un compte ja
  ha entrat bé no se'ls aplica el bloqueig per compte (sí el de cada lloc).
- Crear, canviar o esborrar comptes d'administració i canviar la contrasenya demana la contrasenya de qui ho fa, i els
  errors compten com a intents d'entrar: amb una sessió oberta en un mòbil aliè no es pot prendre el control dels
  comptes ni anar provant contrasenyes. En canviar la contrasenya d'un compte, se'n tanquen les altres sessions i
  se n'obliden els altres mòbils coneguts.
- El codi de la colla (`COLLA_CODE`) es compara sempre en el mateix temps i, després de 20 errors des d'un mateix lloc,
  cal esperar 15 minuts.
- L'entrada de membres (sense contrasenya) té un límit de 150 entrades cada 10 minuts per adreça i com a molt 20
  sessions obertes per persona, perquè ningú pugui omplir la base de dades; quan algú canvia de persona al mateix mòbil,
  la sessió anterior s'esborra, i les sessions caducades es netegen soles. Qui es dona de baixa perd les sessions i
  deixa de rebre avisos al mòbil.
- Sessions en cookies `HttpOnly` i `SameSite=Lax` (i `Secure` amb HTTPS). A la base de dades només se'n guarda un resum
  (SHA-256): amb una còpia de la base de dades no es pot entrar a l'app. El fitxer de la base de dades només el pot llegir
  l'usuari que fa anar el servidor.
- Les peticions que canvien dades han de venir de la mateixa web (es comprova `Origin` i `Sec-Fetch-Site`) i en format
  JSON (un objecte), cosa que un formulari d'una altra web no pot enviar.
- Les connexions que envien la petició a poc a poc es tallen (15 s per a les capçaleres, 30 s per a tota la petició),
  i una petició de més d'1 MB es rebutja (amb un error que l'app pot explicar, no tallant la connexió).
- Capçaleres de seguretat: només es carreguen scripts de la mateixa app (CSP), no es pot posar dins d'un marc d'una
  altra web, la càmera, el micròfon i la ubicació queden desactivats (`Permissions-Policy`), i amb HTTPS s'activa HSTS.
- Només se serveixen els fitxers de `public/` (ni la base de dades, ni el codi del servidor, ni fitxers ocults), i
  una adreça mal formada no pot aturar el servidor.
- L'exportació CSV neutralitza el text que un full de càlcul podria executar com a fórmula i no es guarda a la memòria
  cau del navegador. Al calendari (`.ics`), el text de les sessions no pot afegir línies.
- Tot el text que escriu la gent es mostra escapat (no es pot injectar HTML). Una prova posa codi HTML a cada camp
  (noms, malnoms, títols, comentaris, respostes, temporals, acompanyants, missatges, notes, plantilles…) i pinta totes
  les pantalles, com a administració i com a membre, per comprovar que no n'arriba cap tros sense escapar.
- Límits per al que no té sentit: textos tallats (noms 100, malnoms 40, comentaris 300, caixes de plantilla 30…),
  alçades i pesos possibles, dates i hores que existeixen, i com a molt 6 acompanyants per persona, 30 castells,
  15 camps extra i 200 persones temporals per sessió, 200 caixes per capa de plantilla i només posicions que el
  castell té. Els valors són a `LIMITS` i `MEASURES` (a `server.js`; l'app fa servir els mateixos).
- Privadesa: als membres no els arriba cap dada personal (ni la pròpia): de la gent només el malnom o «Nom I.», sense
  dir qui va a l'escoleta, sense comentaris ni respostes als camps extra dels altres, i sense les
  notes de la tècnica ni on va fallar cada castell. Les persones temporals també surten com a «Nom I.». Les sessions i els castells ocults no
  arriben als membres per cap camí (llistes, fitxes, calendari, historial ni estadístiques), i una sessió oculta respon
  igual que una que no existeix. Qui diu que no ve no surt enlloc per als altres.
- Esborrar una persona l'esborra de debò: amb les respostes, posicions, acompanyants, mòbils i avisos, i també de
  dins del fitxer de la base de dades (el que s'esborra se sobreescriu amb zeros i el diari de canvis es buida). Les
  còpies de seguretat diàries la conserven fins que es renoven (la nota de privadesa ho diu).

Una limitació que ve del disseny (entrar sense codis): qualsevol persona amb l'enllaç pot triar un nom i contestar
l'assistència en nom d'aquella persona. No pot veure cap dada personal ni canviar res més; si es vol posar una mica més
difícil, feu servir `COLLA_CODE`.

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

A la demostració, els membres entren triant el seu nom; l'administrador és `admin` / `admin1234`. Com que el compte és
compartit, en mode demo (`DEMO=1`) no es poden canviar contrasenyes ni crear, editar o esborrar comptes d'administració
(ningú pot deixar els altres sense entrar). Les persones i els
malnoms de la demostració són inventats (els malnoms són noms de fruites i verdures).
Hi ha unes 125 persones (amb mainada i músics) i dues temporades senceres: assajos els dimarts i divendres, una diada
cada 3–4 setmanes i castells que van pujant al llarg de la temporada, cadascun amb el seu tronc habitual i
substitucions quan algú falta.

### Proves

```bash
npm test
```

Cada fitxer de `tests/` arrenca el seu propi servidor amb les dades de demostració, en una base de dades temporal i un
port lliure (no toca `data/colla.db`). Comproven:

- **Permisos i sessions**: totes les rutes sense sessió i com a membre; galetes; sortir, sessions caducades, baixes i
  canvis de contrasenya que tanquen les altres sessions; camps que no es poden tocar des de fora (rol, id, qui ha
  vingut…); respostes tancades.
- **Atacs**: XSS a totes les pantalles (amb un navegador de mentida, `tests/fakedom.js`), CSRF, fitxers fora de
  `public/`, peticions massa grans, JSON estrany (`__proto__`…), i que cap resposta ni el registre del servidor porti
  contrasenyes, sessions ni la clau dels avisos.
- **Robustesa**: totes les rutes amb adreces, consultes i cossos mal fets o d'un tipus que no toca (milers de
  peticions) sense cap error intern.
- **Privadesa**: què veu un membre, sessions ocultes, el calendari públic, la descàrrega de dades d'una persona i que
  esborrar-la no en deixi rastre (ni als bytes del fitxer).
- **Castells i muntador**: claus úniques i noms coherents per a tots els castells possibles, proves parcials, i que el
  muntador posi cadascú un sol cop, la canalla només a dalt i cada músic al seu instrument.
- Els límits, les funcionalitats principals, que les traduccions tinguin els mateixos buits (`{n}`…) que l'original, i
  que el servidor no faci servir valors que el SQLite de Node 22 (el de Render) no accepta. A GitHub es passen soles a cada push (`.github/workflows/tests.yml`), amb Node 22.13,
22 i 24.

### Configuració (variables d'entorn)

| Variable | Per defecte | Descripció |
|---|---|---|
| `PORT` | `3000` | Port del servidor |
| `COLLA_NAME` | `La meva colla` | Nom que es mostra a l'aplicació |
| `DB_PATH` | `data/colla.db` | Fitxer de la base de dades SQLite |
| `ADMIN_PASSWORD` | aleatòria | Contrasenya de l'`admin` inicial (només si encara no n'hi ha cap) |
| `COLLA_CODE` | (cap) | Codi compartit que es demana als membres abans de «Qui ets?» |
| `TZ` | `Europe/Madrid` | Zona horària de les sessions i de les dates límit |
| `PRIVACY_CONTACT` | (cap) | Contacte per a les dades personals que surt a la nota de privadesa (p. ex. el correu de la junta) |
| `BACKUP_DIR` | `backups` al costat de `DB_PATH` | Carpeta de les còpies de seguretat diàries (a la demo només se'n fan si es posa) |
| `BACKUP_KEEP` | `14` | Quantes còpies diàries es guarden |
| `PUSH_SUBJECT` | `mailto:` del `PRIVACY_CONTACT` | Contacte que es dona als serveis d'avisos (Google, Apple…) per si hi ha cap problema (`mailto:…` o `https://…`) |
| `TRUST_PROXY` | (no; sí a Render) | Posa-ho a `1` si l'app és darrere d'un proxy (Nginx, Caddy…), perquè el límit d'intents sàpiga l'adreça real de cada persona. Sense proxy, deixa-ho buit: si no, qualsevol es podria saltar el límit |

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
davant (Caddy, Nginx o el del proveïdor) amb `TRUST_PROXY=1` i assegura't que el fitxer `DB_PATH` està en un disc que no s'esborri.
El servidor fa una còpia de seguretat cada dia a `BACKUP_DIR`, però si el disc es perd, es perden amb ell: baixa'n
una de tant en tant des de «Comptes» → «Descarrega una còpia» (o copia la carpeta a un altre lloc) i guarda-la en un
lloc privat: hi ha les dades personals de la colla (les contrasenyes no hi són tal com són, però la resta sí).

Per **restaurar una còpia**: atura el servidor, substitueix el fitxer de la base de dades per la còpia i esborra els
fitxers `-wal` i `-shm` que hi pugui haver al costat, i torna'l a engegar. Tothom haurà de tornar a entrar.

```bash
cp data/backups/colla-2026-10-28.db data/colla.db && rm -f data/colla.db-wal data/colla.db-shm
```

## Estructura

```
server.js          API REST i servidor de fitxers
db.js              Esquema SQLite i contrasenyes (scrypt)
push.js            Avisos al mòbil (Web Push): claus VAPID i enviament, sense dependències
seed.js            Dades de demostració
public/index.html  Pàgina única
public/theme.js    Aplica el tema i l'idioma abans de pintar la pàgina
public/sw.js       Service worker: app instal·lable i consulta sense connexió
public/icons/      Icones de l'app (icon.svg i les PNG, la marca mark.svg; el manifest el genera el servidor amb el nom de la colla)
public/app.js      Punt d'entrada de la interfície: rutes i arrencada
public/ui/         Una pantalla per fitxer:
  core.js          estat compartit, crides a l'API, utilitats, icones i finestres
  shell.js         ajustos i barra de navegació
  login.js         entrada (membres i administradors)
  sessions.js      llista de sessions i formulari de sessió
  event.js         detall d'una sessió: respostes, assistència, temporals, exportació
  castell-form.js  formulari d'un castell
  viewer.js        visualitzador del castell (tronc, pinya, llista, mides, historial) i assignar posicions
  people.js        persones, importar-ne i perfil del membre
  news.js          altaveu
  notifications.js avisos al mòbil (activar-los als ajustos)
  templates.js     pinyes de la colla
  accounts.js      comptes d'administració, còpies de seguretat i protecció de dades
  calendar.js      calendari i subscripció
  stats.js         estadístiques
public/castell.js  Generador de l'estructura de cada castell (posicions i planta de la pinya)
public/editor.js   Editor visual de pinyes de la colla (plantilles)
public/export.js   Exportació d'una sessió en Excel (.xlsx: assistència + cada castell amb la seva imatge)
public/muntador.js Muntador automàtic d'alineacions
public/zoom.js     Visor a pantalla completa (pinça, roda, arrossegar)
public/import.js   Lectura de fitxers CSV i Excel (.xlsx) per importar persones
public/privacy.js  Nota de protecció de dades (català, castellà, anglès)
public/i18n.js     Traduccions (català, castellà, anglès), també per als errors del servidor
public/style.css   Estils (clar/fosc, responsive)
tests/             Proves automàtiques (npm test)
```

La pinya es genera de manera automàtica a partir del tipus de castell i del nombre de cordons; és un model genèric.
Si la vostra colla organitza la pinya diferent, es redibuixa des de l'editor de pinyes (sense tocar codi). Les
plantilles es guarden a la taula `castell_templates` i `public/castell.js` les aplica en lloc de la capa generada.
