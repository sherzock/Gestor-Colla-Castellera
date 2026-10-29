// Nota de privadesa (informació de l'article 13 del RGPD) per als membres de la colla, en els tres idiomes.
// És un model: la junta l'ha de revisar i adaptar. Es pot llegir a l'app i imprimir per signar-la a paper.
// «colla» i «contact» arriben ja escapats (HTML).

export const PRIVACY = {
  ca: ({ colla, contact }) => ({
    title: 'Protecció de dades',
    intro: `Aquesta aplicació és l'eina que fa servir ${colla} per organitzar els assajos, les diades i els castells. Aquí s'explica quines dades teves s'hi guarden i per què.`,
    sections: [
      ['Qui en és responsable', `${colla}. Per a qualsevol cosa sobre les teves dades, adreça't a ${contact}.`],
      ['Quines dades es guarden', "Nom i cognoms, malnom, correu i telèfon (si els dones), data de naixement, alçada, alçada i amplada d'espatlles i pes; si véns a cada sessió i les teves respostes; les posicions que has fet als castells; les notes de la junta tècnica; i, si actives els avisos al mòbil, l'adreça on el teu mòbil els rep."],
      ['Per a què', "Per organitzar els assajos i les actuacions, saber qui vindrà, fer les alineacions dels castells amb seguretat (les mides serveixen per col·locar cada persona on li toca) i fer estadístiques internes de la colla. No es fan servir per a res més."],
      ['Per què es poden fer servir', "Perquè formes part de la colla (article 6.1.b del RGPD) i per l'interès legítim de la colla a fer els castells amb seguretat (article 6.1.f). Si tens menys de 14 anys, cal el consentiment del teu pare, mare o tutor/a legal."],
      ['Qui les veu', "Només les persones de la junta que tenen compte d'administració. La resta de membres només veuen el teu malnom (o el teu nom i la inicial del cognom) i on surts als castells: mai les mides, la data de naixement ni el contacte. No es donen a ningú més. L'empresa on s'allotja l'aplicació les guarda per encàrrec de la colla i no les pot fer servir."],
      ['Quant de temps', "Mentre siguis de la colla. Si la deixes, la teva fitxa queda inactiva; si demanes que s'esborri, s'esborra amb tot el teu historial."],
      ['Els teus drets', `Pots demanar veure les teves dades, corregir-les, esborrar-les, limitar-ne l'ús, oposar-t'hi o rebre-les en un fitxer, escrivint a ${contact}. Si creus que no s'han tractat bé, pots reclamar a l'Agència Espanyola de Protecció de Dades (aepd.es).`],
      ['Galetes', "L'aplicació només fa servir les galetes imprescindibles per mantenir la sessió oberta i recordar l'idioma i el tema. Cap de seguiment ni de publicitat. Perquè es pugui consultar sense connexió, l'últim que hi has vist queda desat al teu dispositiu fins que surts o canvies de persona."],
    ],
    paper: 'Per signar a paper',
    paperText: "He llegit aquesta informació i dono les meves dades a la colla per a les finalitats explicades.",
    sign: ['Nom i cognoms', 'Data', 'Signatura', 'Si és menor de 14 anys: nom i signatura del pare, mare o tutor/a'],
    print: 'Imprimeix',
  }),
  es: ({ colla, contact }) => ({
    title: 'Protección de datos',
    intro: `Esta aplicación es la herramienta que usa ${colla} para organizar los ensayos, las diades y los castells. Aquí se explica qué datos tuyos se guardan y por qué.`,
    sections: [
      ['Quién es responsable', `${colla}. Para cualquier cosa sobre tus datos, dirígete a ${contact}.`],
      ['Qué datos se guardan', 'Nombre y apellidos, mote, correo y teléfono (si los das), fecha de nacimiento, altura, altura y anchura de hombros y peso; si vienes a cada sesión y tus respuestas; las posiciones que has hecho en los castells; las notas de la junta técnica; y, si activas los avisos en el móvil, la dirección donde tu móvil los recibe.'],
      ['Para qué', 'Para organizar los ensayos y las actuaciones, saber quién vendrá, hacer las alineaciones de los castells con seguridad (las medidas sirven para colocar a cada persona donde le toca) y hacer estadísticas internas de la colla. No se usan para nada más.'],
      ['Por qué se pueden usar', 'Porque formas parte de la colla (artículo 6.1.b del RGPD) y por el interés legítimo de la colla en hacer los castells con seguridad (artículo 6.1.f). Si tienes menos de 14 años, hace falta el consentimiento de tu padre, madre o tutor/a legal.'],
      ['Quién los ve', 'Solo las personas de la junta que tienen cuenta de administración. El resto de miembros solo ven tu mote (o tu nombre y la inicial del apellido) y dónde sales en los castells: nunca las medidas, la fecha de nacimiento ni el contacto. No se dan a nadie más. La empresa donde se aloja la aplicación los guarda por encargo de la colla y no puede usarlos.'],
      ['Cuánto tiempo', 'Mientras seas de la colla. Si la dejas, tu ficha queda inactiva; si pides que se borre, se borra con todo tu historial.'],
      ['Tus derechos', `Puedes pedir ver tus datos, corregirlos, borrarlos, limitar su uso, oponerte o recibirlos en un archivo, escribiendo a ${contact}. Si crees que no se han tratado bien, puedes reclamar a la Agencia Española de Protección de Datos (aepd.es).`],
      ['Cookies', 'La aplicación solo usa las cookies imprescindibles para mantener la sesión abierta y recordar el idioma y el tema. Ninguna de seguimiento ni de publicidad. Para poder consultarla sin conexión, lo último que has visto queda guardado en tu dispositivo hasta que sales o cambias de persona.'],
    ],
    paper: 'Para firmar en papel',
    paperText: 'He leído esta información y doy mis datos a la colla para las finalidades explicadas.',
    sign: ['Nombre y apellidos', 'Fecha', 'Firma', 'Si es menor de 14 años: nombre y firma del padre, madre o tutor/a'],
    print: 'Imprimir',
  }),
  en: ({ colla, contact }) => ({
    title: 'Data protection',
    intro: `This app is the tool ${colla} uses to organise rehearsals, performances (diades) and castells. This page explains which of your data are stored and why.`,
    sections: [
      ['Who is responsible', `${colla}. For anything about your data, contact ${contact}.`],
      ['Which data are stored', 'Full name, nickname, email and phone (if you give them), date of birth, height, shoulder height and width and weight; whether you come to each session and your answers; the positions you have taken in castells; the technical team\'s notes; and, if you turn on phone notifications, the address where your phone receives them.'],
      ['What for', 'To organise rehearsals and performances, know who is coming, build castell line-ups safely (the measurements are used to place each person where they fit) and keep internal statistics for the colla. They are not used for anything else.'],
      ['Legal basis', 'Your membership of the colla (GDPR article 6.1.b) and the colla\'s legitimate interest in building castells safely (article 6.1.f). If you are under 14, consent from your parent or legal guardian is required.'],
      ['Who can see them', 'Only the members of the board with an admin account. Other members only see your nickname (or your first name and surname initial) and where you are in the castells: never your measurements, date of birth or contact details. They are not given to anyone else. The company hosting the app stores them on behalf of the colla and cannot use them.'],
      ['How long', 'While you are a member of the colla. If you leave, your record becomes inactive; if you ask for it to be deleted, it is deleted together with your history.'],
      ['Your rights', `You can ask to see, correct or delete your data, restrict or object to their use, or receive them in a file, by writing to ${contact}. If you think they have not been handled properly, you can complain to the Spanish Data Protection Agency (aepd.es).`],
      ['Cookies', 'The app only uses the cookies strictly needed to keep you signed in and remember your language and theme. No tracking or advertising cookies. So that it can be used offline, what you last viewed is kept on your device until you sign out or switch person.'],
    ],
    paper: 'To sign on paper',
    paperText: 'I have read this information and give my data to the colla for the purposes explained.',
    sign: ['Full name', 'Date', 'Signature', 'If under 14: name and signature of parent or legal guardian'],
    print: 'Print',
  }),
};
