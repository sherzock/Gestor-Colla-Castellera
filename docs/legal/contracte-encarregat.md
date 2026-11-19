# Contracte d'encàrrec del tractament (article 28 del RGPD)

> **Avís: això és un model, no un document definitiu.** L'ha redactat qui desenvolupa l'app a partir del que
> l'app fa de veritat, però no és assessorament jurídic. Abans de signar-lo, l'ha de revisar algú que conegui el
> RGPD i la LOPDGDD, i la junta ha d'omplir tots els camps marcats [ENTRE CLAUDÀTORS]. Si l'app canvia (dades noves,
> proveïdors nous), cal revisar-lo.

## Parts

**Responsable del tractament** («la Colla»)
- Nom: [NOM COMPLET DE LA COLLA]
- NIF: [NIF DE LA COLLA]
- Domicili: [DOMICILI SOCIAL]
- Representada per: [NOM I CÀRREC DE QUI SIGNA PER LA COLLA], amb facultats per signar segons [ACORD DE JUNTA / ESTATUTS]
- Contacte per a protecció de dades: [CORREU DE PROTECCIÓ DE DADES DE LA COLLA]

**Encarregat del tractament** («l'Encarregat»)
- Nom: [NOM I COGNOMS O RAÓ SOCIAL DE QUI ALLOTJA I MANTÉ L'APP]
- NIF/DNI: [NIF/DNI]
- Domicili: [DOMICILI]
- Contacte: [CORREU I TELÈFON DE L'ENCARREGAT]

Les dues parts es reconeixen capacitat per signar aquest contracte i acorden les clàusules següents.

## 1. Objecte

L'Encarregat allotja, manté, actualitza i fa les còpies de seguretat de l'aplicació web Appinya't (l'«App»), que la
Colla fa servir per organitzar els assajos, les diades i els castells. Per fer-ho, l'Encarregat té accés a les dades
personals que la Colla hi guarda. Aquest contracte regula aquest accés, d'acord amb l'article 28 del Reglament (UE)
2016/679 (RGPD) i l'article 33 de la Llei orgànica 3/2018 (LOPDGDD).

El servei inclou:

- Tenir l'App en funcionament en un servidor amb HTTPS i disc persistent, a [PROVEÏDOR I PAÍS DEL SERVIDOR].
- Instal·lar-hi les versions noves i les correccions de seguretat.
- Les còpies de seguretat: una còpia diària al mateix servidor (es guarden les últimes [14] còpies) i una còpia
  diària xifrada fora del servidor, en un emmagatzematge compatible amb S3 a [PROVEÏDOR I PAÍS DE L'EMMAGATZEMATGE],
  que s'esborra sola al cap de 30 dies.
- Vigilar que l'App funcioni, rebre els avisos d'error i restaurar una còpia si cal.
- Ajudar la Colla, quan ho demani, a atendre els drets de les persones i les incidències (clàusula 7).

El servei **no** inclou decidir quines dades es recullen ni per a què: això ho decideix la Colla.

## 2. Durada

Aquest contracte comença el [DATA D'INICI] i dura mentre l'Encarregat presti el servei. Qualsevol de les parts el
pot acabar avisant amb [TERMINI DE PREAVÍS, p. ex. 1 MES] d'antelació. En acabar, s'aplica la clàusula 10.

## 3. Dades i persones afectades

**Persones afectades**: membres de la colla (també menors d'edat, i menors de 14 anys amb el consentiment del pare,
mare o tutor/a), persones que hi col·laboren de manera puntual (persones temporals, acompanyants) i les persones de la
colla que tenen un compte d'administració, de junta o de tècnica.

**Dades**:

- Identificació i contacte: nom i cognoms, malnom, correu electrònic i telèfon (si es donen), grup o secció,
  instrument (músics).
- Data de naixement i data del consentiment familiar (menors de 14 anys).
- Mides físiques: alçada, alçada i amplada d'espatlles i pes. Són dades que la Colla fa servir per col·locar cada
  persona al castell amb seguretat. [CONFIRMAR AMB L'ASSESSOR SI ES CONSIDEREN DADES DE SALUT (ARTICLE 9 DEL RGPD)]
- Notes de la junta tècnica sobre cada persona.
- Assistència: si ve a cada sessió, si ha vingut, escoleta, comentaris i respostes a les preguntes de la sessió.
- Pagaments de les sessions: si la persona diu que ha pagat, si la junta ho ha rebut i si va ser en efectiu, i el
  recordatori enviat. L'App **no** guarda cap dada bancària de les persones (només el compte o Bizum de la Colla on
  s'ha de pagar) ni mou diners.
- Posicions als castells i resultats.
- Acompanyants i persones temporals: nom, colla, i si cal alçada d'espatlles i pes.
- Avisos al mòbil: l'adreça de subscripció que dona el navegador i l'idioma.
- Comptes d'administració: usuari, nom, contrasenya (només en resum scrypt), segon factor i codis de recuperació,
  sessions obertes i mòbils coneguts (només en resum), i el registre de canvis (què ha fet cada compte, sense el nom
  de les persones afectades, només el número de la fitxa).
- Suggeriments i errors enviats des de l'App, sense dir de qui són.

**Operacions**: allotjar, guardar, fer còpies de seguretat, restaurar, consultar quan calgui per al servei
(p. ex. per resoldre un error) i suprimir.

## 4. Obligacions de l'Encarregat

L'Encarregat es compromet a:

a) Tractar les dades **només per prestar el servei** i seguint les instruccions documentades de la Colla (aquest
   contracte i les que li doni per escrit, també per correu). No les farà servir per a cap altra finalitat ni en
   traurà profit. Si creu que una instrucció va contra el RGPD, ho dirà a la Colla de seguida.
b) No comunicar les dades a ningú, fora dels subencarregats de la clàusula 6 o quan ho exigeixi la llei (i, en aquest
   cas, avisar la Colla abans, si la llei ho permet).
c) No consultar les dades personals si no cal per al servei. Les tasques habituals (actualitzar, revisar errors,
   comprovar còpies) s'han de fer, sempre que es pugui, sense obrir-les.
d) Garantir que les persones que hi tinguin accés per part seva s'han compromès a la confidencialitat. Aquest deure
   continua després d'acabar el contracte.
e) Aplicar les mesures de seguretat de la clàusula 5.
f) Portar un registre de les activitats de tractament que fa per compte de la Colla (article 30.2 del RGPD), si li
   és obligatori.
g) Posar a disposició de la Colla tota la informació necessària per demostrar que compleix aquest contracte, i
   permetre-li'n revisions raonables, avisant amb [TERMINI, p. ex. 15 DIES].
h) No transferir dades fora de l'Espai Econòmic Europeu sense l'autorització escrita de la Colla i les garanties del
   capítol V del RGPD.

## 5. Mesures de seguretat

Tenint en compte el tipus de dades (hi ha menors i mides físiques), l'Encarregat manté com a mínim aquestes mesures,
que l'App ja porta o que depenen de com s'instal·la:

**Servidor i accés**
- HTTPS a tot arreu (amb HSTS), i el fitxer de la base de dades llegible només per l'usuari del sistema que fa anar
  l'App.
- Accés al servidor, al proveïdor d'allotjament i a l'emmagatzematge de les còpies només per a l'Encarregat, amb
  contrasenyes fortes i segon factor sempre que el proveïdor ho permeti.
- Actualitzar el sistema i Node.js quan surtin correccions de seguretat.

**Dins de l'App**
- Comptes d'administració amb contrasenya guardada en resum (scrypt), límit d'intents, segon factor disponible i
  permisos per rol (administració, junta, tècnica) comprovats al servidor.
- Als membres, que entren sense contrasenya, no els arriba cap dada personal: només el malnom o «Nom I.».
- Sessions en galetes `HttpOnly`; a la base de dades només se'n guarda un resum.
- Registre de canvis de cada compte d'administració, que també apunta qui baixa dades personals (còpies, dades d'una
  persona, llistes d'assistència). Es guarda un any.
- Esborrar una persona esborra de debò les seves dades i sobreescriu l'espai al fitxer.

**Còpies de seguretat**
- Còpia diària al servidor, sense sessions obertes ni mòbils coneguts, i restaurada de prova automàticament.
- Còpia diària fora del servidor **sempre xifrada**; si no hi ha clau, no s'envia res. La clau (`BACKUP_KEY`) la guarda
  [QUI GUARDA LA CLAU: L'ENCARREGAT / LA JUNTA / TOTS DOS] en un lloc diferent del servidor.
- Les còpies fora del servidor s'esborren soles al cap de 30 dies.
- Un cop al mes, comprovar que l'última còpia xifrada es pot obrir.

**Avisos**
- Avís automàtic quan l'App registra un error nou i vigilància que l'App respon.

## 6. Subencarregats

La Colla autoritza l'Encarregat a fer servir aquests subencarregats, només per a les tasques indicades:

| Subencarregat | Servei | On són les dades | Garanties |
|---|---|---|---|
| [PROVEÏDOR D'ALLOTJAMENT, p. ex. Render, Hetzner, OVH…] | Servidor on funciona l'App i on hi ha la base de dades i les còpies diàries | [PAÍS / REGIÓ] | [CONDICIONS DE TRACTAMENT DEL PROVEÏDOR (DPA) I, SI ÉS FORA DE L'EEE, CLÀUSULES CONTRACTUALS TIPUS] |
| [PROVEÏDOR DE L'EMMAGATZEMATGE S3, p. ex. Backblaze B2, Cloudflare R2, Scaleway…] | Còpies xifrades fora del servidor (30 dies) | [PAÍS / REGIÓ] | [DPA DEL PROVEÏDOR]. Només rep fitxers xifrats i no té la clau |
| [SERVEI D'AVISOS D'ERRORS, p. ex. ntfy.sh, SI ES FA SERVIR] | Rep el text dels errors nous de l'App | [PAÍS / REGIÓ] | [DPA O VALORACIÓ]. El text dels errors no hauria de portar dades personals |
| [SERVEI DE VIGILÀNCIA, p. ex. UptimeRobot, SI ES FA SERVIR] | Comprova que l'App respon | — | No rep dades personals |

Els **serveis d'avisos dels navegadors** (Google, Apple, Mozilla…) reben l'avís que hi ha un missatge nou per a
l'adreça de subscripció d'un mòbil, però l'App no els envia el text del missatge: el mòbil el va a buscar a l'App.
[CONFIRMAR AMB L'ASSESSOR SI CAL TRACTAR-LOS COM A SUBENCARREGATS O COM A PART DEL SERVEI QUE TRIA LA PERSONA EN
ACTIVAR ELS AVISOS]

Per afegir o canviar un subencarregat, l'Encarregat ho ha de dir per escrit a la Colla amb [TERMINI, p. ex. 15 DIES]
d'antelació, dient qui és, què farà i on seran les dades. La Colla s'hi pot oposar dins d'aquest termini. Cada
subencarregat ha d'estar obligat, per contracte, a les mateixes obligacions que aquest contracte imposa a
l'Encarregat, i l'Encarregat respon davant la Colla del que facin.

## 7. Ajuda a la Colla

**Drets de les persones**. Si una persona demana a l'Encarregat veure, corregir, esborrar, limitar o rebre les seves
dades, o s'hi oposa, l'Encarregat no ho resoldrà pel seu compte: ho passarà a la Colla en [TERMINI, p. ex. 2 DIES
FEINERS]. L'App ja permet a l'administració de la Colla descarregar les dades d'una persona i esborrar-les; si cal
alguna cosa més (p. ex. treure algú d'una còpia restaurada), l'Encarregat ajudarà la Colla.

**Avaluacions i consultes**. Si la Colla ha de fer una avaluació d'impacte o consultar l'autoritat de control,
l'Encarregat li donarà la informació tècnica que tingui.

## 8. Violacions de seguretat

Si l'Encarregat té coneixement d'una violació de seguretat que afecti les dades (accés no autoritzat, pèrdua, còpia
filtrada, clau de xifratge exposada…), ho dirà a la Colla **sense dilació indeguda i com a molt tard en [TERMINI, p.
ex. 24 HORES]**, a [CORREU I TELÈFON D'AVÍS DE LA COLLA], amb, si les té:

- què ha passat i quan, quines dades i quantes persones hi ha implicades;
- quines conseqüències pot tenir;
- què s'ha fet o es proposa fer per arreglar-ho i limitar-ne els efectes;
- qui pot donar-ne més informació.

Si no ho sap tot de cop, ho anirà dient a mesura que ho sàpiga. És la Colla qui decideix si cal avisar l'Agència
Espanyola de Protecció de Dades (en 72 hores) i les persones afectades; l'Encarregat l'ajudarà a fer-ho.

## 9. Obligacions de la Colla

La Colla:

- Garanteix que pot tractar les dades (té una base legal, ha informat les persones amb la nota de protecció de dades
  de l'App i ha recollit el consentiment de les famílies dels menors de 14 anys).
- Dona a l'Encarregat les instruccions per escrit.
- Decideix qui té comptes d'administració, de junta i de tècnica, i quins permisos, i en revisa la llista.
- Vetlla perquè els seus comptes facin servir segon factor i perquè les dades que baixen de l'App (còpies, Excel,
  dades d'una persona) es guardin en un lloc segur.

## 10. Final del contracte

Quan s'acabi el servei, l'Encarregat, segons el que triï la Colla per escrit:

- li lliurarà una còpia completa de la base de dades (o li deixarà baixar-la des de l'App), i la clau de les còpies
  xifrades si la té, i
- després **esborrarà** la base de dades i les còpies del servidor i de l'emmagatzematge extern, i en certificarà
  l'esborrament per escrit en [TERMINI, p. ex. 30 DIES].

Si la llei l'obliga a conservar-ne alguna dada, la guardarà bloquejada i només per a aquest fi.

## 11. Responsabilitat

Si l'Encarregat fa servir les dades per a una altra finalitat, les comunica a qui no toca o no compleix aquest
contracte, se'l considerarà responsable del tractament en allò que hagi fet i respondrà de les infraccions que hagi
comès (article 28.10 del RGPD). [CLÀUSULA DE RESPONSABILITAT ECONÒMICA O LÍMITS, SI LES PARTS EN VOLEN, A REVISAR AMB
L'ASSESSOR]

## 12. Retribució

[GRATUÏT / IMPORT I FORMA DE PAGAMENT]. La retribució (o que no n'hi hagi) no canvia cap obligació d'aquest contracte.

## 13. Llei i jurisdicció

Aquest contracte es regeix per la llei espanyola i pel RGPD. Per a qualsevol discrepància, les parts se sotmeten als
jutjats de [CIUTAT].

---

I, en prova de conformitat, ho signen per duplicat a [LLOC], el [DATA].

| Per la Colla | L'Encarregat |
|---|---|
| [NOM I CÀRREC] | [NOM] |
| Signatura: | Signatura: |
