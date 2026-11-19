# Registre d'activitats de tractament (article 30 del RGPD)

> **Avís: això és un model, no un document definitiu.** L'ha redactat qui desenvolupa l'app a partir del que
> l'app fa de veritat, però no és assessorament jurídic. L'ha de revisar algú que conegui el RGPD i la LOPDGDD, i la
> junta ha d'omplir tots els camps marcats [ENTRE CLAUDÀTORS]. Només recull els tractaments que es fan amb l'app
> Appinya't; si la colla en fa d'altres (socis, quotes, fotos, federació…), s'hi han d'afegir. S'ha de revisar cada
> cop que l'app canviï o com a mínim un cop l'any.

**Darrera revisió**: [DATA] · **Revisat per**: [NOM]

## Dades comunes a totes les fitxes

**Responsable del tractament**
- Nom: [NOM COMPLET DE LA COLLA] · NIF: [NIF]
- Domicili: [DOMICILI SOCIAL]
- Contacte per a protecció de dades: [CORREU] (és el que surt a la nota de privadesa de l'app, variable
  `PRIVACY_CONTACT`)
- Delegat de protecció de dades: [NO EN TÉ / NOM I CONTACTE SI EN TÉ]

**Encarregat del tractament**: [NOM DE QUI ALLOTJA I MANTÉ L'APP], amb contracte d'encàrrec signat el [DATA] (vegeu
`contracte-encarregat.md`). Subencarregats: [PROVEÏDOR D'ALLOTJAMENT] (servidor, a [PAÍS]) i [PROVEÏDOR S3] (còpies
xifrades, a [PAÍS]).

**Qui hi té accés dins la colla** (tots amb compte propi i contrasenya; els permisos es comproven al servidor):
- Administració: tot.
- Junta: contacte (telèfon i correu) i data de naixement, assistència i pagaments.
- Tècnica: mides, pes, data de naixement, notes de la tècnica, castells i assistència.
- La resta de membres entren sense contrasenya i només veuen el malnom (o «Nom I.») de la gent i on surt als castells.

**Transferències internacionals**: [CAP / DESCRIURE-LES SI EL SERVIDOR O L'EMMAGATZEMATGE SÓN FORA DE L'EEE, AMB LA
GARANTIA (DECISIÓ D'ADEQUACIÓ O CLÀUSULES CONTRACTUALS TIPUS)].

**Mesures de seguretat generals** (article 32): HTTPS amb HSTS; contrasenyes d'administració en resum scrypt, límit
d'intents i segon factor; permisos per rol comprovats al servidor; als membres no els arriba cap dada personal;
sessions en galetes `HttpOnly` i guardades només en resum; fitxer de la base de dades llegible només per l'usuari del
servidor; registre de canvis de cada compte d'administració (un any), que també apunta qui baixa dades personals;
esborrat real (el fitxer se sobreescriu); còpies diàries amb restauració de prova automàtica; còpia fora del servidor
sempre xifrada. Detall al README, apartat «Seguretat».

---

## 1. Membres i assistència

| | |
|---|---|
| **Finalitat** | Portar la llista de membres de la colla, organitzar els assajos i les actuacions, saber qui vindrà (també a l'escoleta), passar llista i fer estadístiques internes. |
| **Base legal** | Relació de pertinença a la colla (art. 6.1.b RGPD). Menors de 14 anys: consentiment del pare, mare o tutor/a (art. 6.1.a i art. 7 LOPDGDD); l'app apunta la data en què es va rebre i avisa la junta dels que no en tenen. [CONFIRMAR LA BASE LEGAL AMB L'ASSESSOR] |
| **Persones** | Membres de la colla (adults i menors), músics. |
| **Dades** | Nom i cognoms, malnom, correu i telèfon (opcionals), data de naixement, data del consentiment familiar, grup o secció, instrument, alta o baixa; notes de la junta tècnica; per cada sessió: si ve, si ha vingut, escoleta, comentari i respostes a les preguntes de la sessió. Si la persona diu que porta acompanyants: el nom que hi posa. |
| **Categories especials** | Cap de manera directa. Els comentaris lliures i les notes poden acabar portant-ne (p. ex. «lesionat»): [INSTRUCCIÓ DE LA JUNTA SOBRE QUÈ NO S'HI HA D'ESCRIURE]. |
| **Destinataris** | Ningú fora de la colla. L'encarregat del tractament (allotjament). |
| **Termini de supressió** | Mentre la persona sigui de la colla. Quan la deixa, la fitxa queda inactiva [TERMINI DESPRÉS DEL QUAL LA JUNTA L'ESBORRA, p. ex. 2 ANYS]. Si la persona demana que s'esborri, se'n treu tot el que l'identifica i a l'historial hi surt «Persona esborrada»; les còpies de seguretat la conserven fins que es renoven (vegeu la fitxa 6). |
| **Origen** | La mateixa persona o la seva família; l'assistència la respon la persona des de l'app o la junta en passar llista. |

## 2. Pagaments de les sessions

| | |
|---|---|
| **Finalitat** | Saber qui ha pagat les sessions que tenen un cost (viatges, sopars, samarretes…) i recordar-ho a qui no ho ha fet. L'app no mou diners. |
| **Base legal** | Relació de pertinença a la colla i acord de participar a la sessió (art. 6.1.b RGPD). |
| **Persones** | Membres que s'apunten a una sessió de pagament (i, indirectament, els seus acompanyants, pel preu). |
| **Dades** | Si la persona diu que ha pagat i quan, si la junta ho ha rebut i quan, si va ser en efectiu, quan se li va enviar el recordatori, i les respostes que fixen l'import (nombre d'acompanyants, opcions triades). **No** es guarda cap dada bancària de les persones: només el compte o Bizum de la colla on s'ha de pagar. |
| **Destinataris** | Ningú fora de la colla. L'encarregat del tractament. [SI LA TRESORERIA EXPORTA AQUESTES DADES A UN ALTRE SISTEMA (COMPTABILITAT), INDICAR-HO] |
| **Termini de supressió** | Mentre existeixi la sessió a l'app. [TERMINI QUE LA COLLA HA DE CONSERVAR ELS JUSTIFICANTS DE COBRAMENT PER OBLIGACIONS COMPTABLES O FISCALS, SI N'HI HA] |
| **Origen** | La mateixa persona (avisa que ha pagat) i la junta (marca que ho ha rebut). |

## 3. Castells

| | |
|---|---|
| **Finalitat** | Fer les alineacions dels castells amb seguretat (col·locar cada persona on li toca segons les mides), guardar-ne els resultats i l'historial de posicions. |
| **Base legal** | Relació de pertinença a la colla (art. 6.1.b RGPD) i interès legítim de la colla a fer els castells amb seguretat (art. 6.1.f RGPD). [FER LA PONDERACIÓ DE L'INTERÈS LEGÍTIM PER ESCRIT] |
| **Persones** | Membres; persones temporals (de fora de la colla, per a una sola sessió); acompanyants. |
| **Dades** | Alçada, alçada i amplada d'espatlles i pes; data de naixement (la canalla només va a dalt); posicions a cada castell; resultat del castell i notes de la tècnica. De les persones temporals i els acompanyants: nom, colla i, si cal, alçada d'espatlles i pes. |
| **Categories especials** | [CONFIRMAR AMB L'ASSESSOR SI L'ALÇADA I EL PES ES CONSIDEREN DADES DE SALUT (ART. 9 RGPD). Si ho són, cal una excepció de l'art. 9.2 (p. ex. 9.2.d, activitats d'una associació sense ànim de lucre amb els seus membres) i potser una avaluació d'impacte, sobretot perquè hi ha menors.] |
| **Destinataris** | Ningú fora de la colla. Els altres membres veuen on surt cadascú als castells, amb el malnom o «Nom I.», mai les mides. L'encarregat del tractament. |
| **Termini de supressió** | Mides i pes: mentre la persona sigui de la colla. Posicions i resultats: es conserven com a historial de la colla; si la persona demana l'esborrat, hi surt «Persona esborrada». Persones temporals i acompanyants: [TERMINI, p. ex. ES CONSERVEN AMB LA SESSIÓ / S'ESBORREN AL CAP DE X MESOS]. |
| **Origen** | La mateixa persona o la seva família (mides), la junta tècnica (posicions i notes); les dades dels acompanyants, la persona que els porta (que els ha d'avisar abans). |

## 4. Avisos al mòbil

| | |
|---|---|
| **Finalitat** | Enviar avisos al mòbil de qui ho demana: sessions noves, recordatoris de respondre o de pagar, missatges de l'altaveu. |
| **Base legal** | Consentiment de la persona, que activa els avisos des de l'app i els pot desactivar quan vulgui (art. 6.1.a RGPD). |
| **Persones** | Membres i comptes d'administració que activen els avisos. |
| **Dades** | L'adreça de subscripció que dona el navegador del mòbil (endpoint i claus), l'idioma, a qui pertany, i els avisos pendents de recollir i els recordatoris ja enviats. |
| **Destinataris** | El servei d'avisos del navegador de cada mòbil (Google, Apple, Mozilla…), que només rep l'avís que hi ha un missatge nou: el text el va a buscar el mòbil a l'app. [CONFIRMAR AMB L'ASSESSOR COM S'HAN DE CONSIDERAR AQUESTS SERVEIS] |
| **Termini de supressió** | Mentre la persona tingui els avisos activats. Els avisos pendents de recollir s'esborren al cap de 3 dies. Quan la persona es dona de baixa o es desactiven, se n'esborra la subscripció. |
| **Origen** | La mateixa persona, en activar-los. |

## 5. Suggeriments i errors

| | |
|---|---|
| **Finalitat** | Recollir idees i errors que la gent troba a l'app per millorar-la, i detectar errors tècnics. |
| **Base legal** | Interès legítim de la colla a tenir l'app en bon funcionament (art. 6.1.f RGPD). |
| **Persones** | Qualsevol persona que fa servir l'app. |
| **Dades** | Suggeriments: el tipus (idea o error), el text, la pantalla i la versió de l'app, **sense dir qui l'ha enviat**. Errors tècnics: missatge, lloc i detall de l'error. Cap dels dos guarda qui era, però el text lliure el pot dir la mateixa persona. |
| **Destinataris** | L'administració de la colla. L'encarregat del tractament (manteniment de l'app). Si està configurat, el servei d'avisos d'errors [SERVEI, p. ex. ntfy.sh] rep el text dels errors nous. |
| **Termini de supressió** | Suggeriments: s'esborren sols al cap d'un any (i com a molt se'n guarden els 300 últims). Errors: els 200 últims. L'administració els pot esborrar abans. |
| **Origen** | La mateixa persona (suggeriments) i l'app (errors). |

## 6. Còpies de seguretat

| | |
|---|---|
| **Finalitat** | Poder recuperar les dades si es perd el servidor o hi ha un error greu (disponibilitat i resiliència, art. 32 RGPD). |
| **Base legal** | Obligació legal de garantir la seguretat de les dades (art. 6.1.c en relació amb l'art. 32 RGPD) i interès legítim de la colla (art. 6.1.f). |
| **Persones** | Totes les de les fitxes anteriors. |
| **Dades** | Una còpia de tota la base de dades, sense les sessions obertes, els mòbils coneguts dels administradors ni els avisos pendents de recollir (amb una còpia a la mà no s'entra enlloc). |
| **Destinataris** | L'encarregat del tractament i el subencarregat d'emmagatzematge [PROVEÏDOR S3], que només rep fitxers xifrats i no en té la clau. L'administració de la colla en pot baixar una còpia des de l'app (queda apuntat al registre de canvis). |
| **Termini de supressió** | Al servidor: les últimes [14] còpies diàries (variable `BACKUP_KEEP`). Fora del servidor: 30 dies, amb una regla del mateix emmagatzematge que les esborra soles. Les còpies que la junta baixa a mà: [ON ES GUARDEN I QUAN S'ESBORREN]. Per això, quan s'esborra una persona, encara queda a les còpies fins que es renoven (la nota de privadesa ho diu). |
| **Mesures específiques** | Cada còpia nova es restaura de prova automàticament i es comprova que té les mateixes persones i sessions. La còpia que surt del servidor va xifrada amb una clau (`BACKUP_KEY`) que es guarda en un altre lloc, a càrrec de [QUI LA GUARDA]; sense clau, no s'envia res. Abans d'enviar-la es comprova que es pot tornar a obrir. Un cop al mes, la junta o l'encarregat comproven a mà l'última còpia xifrada. |
| **Origen** | La base de dades de l'app. |

---

## Tractaments relacionats que no tenen fitxa pròpia

- **Comptes d'administració**: usuari, nom, contrasenya (en resum), segon factor, sessions i mòbils coneguts. Són
  persones de la colla amb un càrrec; es tracta per controlar l'accés (art. 6.1.b i 6.1.f). Es guarden mentre la
  persona tingui el compte. [VALORAR SI CAL UNA FITXA PRÒPIA]
- **Registre de canvis de l'administració**: què ha fet cada compte i qui ha baixat dades personals, amb el número de
  la fitxa afectada però no el nom. Es guarda un any. Base: obligació de seguretat i responsabilitat proactiva
  (art. 5.2 i 32 RGPD).
- **Altaveu**: missatges de la junta a tots els membres, amb el nom del compte que el publica i les imatges que s'hi
  pengin. [SI ES PENGEN FOTOS DE PERSONES, CAL LA SEVA AUTORITZACIÓ I POTSER UNA FITXA DE «IMATGE»]
- **Galetes**: només les imprescindibles (sessió, idioma, tema). No requereixen consentiment.
