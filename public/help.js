// Ajuda de l'app, en els tres idiomes. Cada apartat diu per a qui és: «all» (tothom), «staff» (comptes de junta,
// tècnica o administració) o «admin» (administració i qui porta el servidor). El text és HTML fet aquí (no hi entra
// res de la gent).

const ca = [
  ['respondre', 'all', 'Dir si vens', `
    <p>A l'inici surten les sessions que vénen. Toca <strong>Vinc</strong> o <strong>No vinc</strong> a cada una; ho pots canviar fins a la data límit (si n'hi ha) o fins al mateix dia.</p>
    <p>Si una sessió té preguntes (per exemple, si vens a sopar), <em>Vinc</em> t'obre la sessió per respondre-les. Tot es desa sol mentre respons: no cal tocar cap botó. Els castells on surts es veuen a la sessió i al teu perfil.</p>
    <p>Si la sessió es paga (un viatge, un dinar…), en dir que vens hi veuràs quant et toca, l'IBAN o el Bizum de la colla i el concepte amb el teu nom, amb botons per copiar-ho. Quan hagis pagat, toca <em>Ja he pagat</em>; la junta ho comprovarà.</p>`],
  ['mobil', 'all', "Al mòbil: instal·lar l'app i rebre avisos", `
    <p><strong>Instal·lar-la</strong>: a l'iPhone, obre l'app amb Safari, toca <em>Compartir</em> i <em>Afegeix a la pantalla d'inici</em>. A Android, el menú del navegador ofereix <em>Instal·la l'aplicació</em>. Així s'obre com una app i es pot consultar sense connexió.</p>
    <p><strong>Avisos</strong>: al teu perfil, <em>Activa els avisos</em>. Rebràs els missatges de l'altaveu, les sessions noves i un recordatori si no has respost. A l'iPhone, primer cal instal·lar-la.</p>`],
  ['sessions', 'staff', 'Sessions i assistència', `
    <p>Les sessions i els castells es creen <strong>ocults</strong>: els membres no els veuen fins que els mostres. En mostrar una sessió pots mostrar també els seus castells i enviar un avís al mòbil de tothom.</p>
    <p>A cada sessió hi ha qui ha dit que ve, qui falta per contestar (amb un recordatori per WhatsApp que no assenyala ningú) i, el mateix dia, la llista per marcar qui ha vingut de debò.</p>
    <p><strong>Preguntes i pagaments</strong>: a <em>Camps extra</em> hi poses les preguntes (sí/no, número, llista) i, amb <em>Preu</em>, què costa cada resposta. A <em>Pagament</em> hi poses on es paga, el preu per persona i el concepte. Qui diu que ve veu quant ha de pagar i avisa quan ho ha fet; tu comproves el banc i ho marques com a rebut (o com a <em>Rebut en efectiu</em>, si t'ho han donat en mà). Amb les caselles de la columna <em>Pagament</em> en pots marcar diversos alhora. Si poses una data límit, tres dies abans qui encara no ha pagat rep un recordatori al mòbil, i després de la data el veuràs com a <em>Fora de termini</em>. L'Excel i el CSV de la sessió porten l'import i l'estat de cada pagament. L'app no fa cap cobrament.</p>`],
  ['castells', 'staff', 'Castells i alineacions', `
    <p>Dins de cada castell, toca una posició i tria qui hi va. <strong>Munta automàticament</strong> proposa una alineació amb qui ha dit que ve, anivellant espatlles i vigilant el pes; la pots retocar abans de desar-la.</p>
    <p>Els <strong>avisos a revisar</strong> diuen què no quadra: gent que no ve, forats al tronc, espatlles desiguals, algú en dos castells que es fan alhora…</p>`],
  ['horari', 'staff', "Horari de l'assaig", `
    <p>A cada assaig, la tècnica i la junta veuen quan es fa cada castell. Arrossega un bloc per canviar-ne l'hora (amb el dit, agafa'l pels punts de la dreta) o toca'l per posar-hi l'hora i els minuts exactes. Si dos castells coincideixen i tenen gent en comú, surt en vermell.</p>`],
  ['pinyes', 'staff', 'Pinyes de la colla', `
    <p>A la pestanya <em>Pinyes</em> es redibuixa la pinya de cada castell: moure, girar, afegir o treure posicions, amb encaix i desfer. Els canvis valen per a tots els castells d'aquell tipus, i les posicions que es mantenen conserven l'historial.</p>
    <p>Es pot partir de la pinya d'un altre castell amb els mateixos baixos (per exemple, del 3d7 al 3d8), o de l'estàndard amb taps i tapa-taps.</p>`],
  ['altaveu', 'staff', 'Altaveu', `<p>Missatges per a tota la colla, amb fotos i emojis. Si ho marques, arriben com a avís al mòbil de qui els té activats. Se'n guarden com a molt 50.</p>
    <p>Un missatge pot portar un botó cap a una sessió: va bé per anunciar un viatge o un sopar i que la gent s'hi apunti i, si cal, pagui.</p>`],
  ['comptes', 'admin', 'Comptes i segon factor', `
    <p>Cada persona que edita hauria de tenir el seu compte, amb el que necessita: <strong>junta</strong> (sessions, assistència, contacte), <strong>tècnica</strong> (castells, pinyes, mides) o <strong>administració</strong> (tot).</p>
    <p><strong>Segon factor</strong>: a <em>El meu compte</em>, <em>Activa el segon factor</em>. Cal una app d'autenticació (Google Authenticator, Microsoft Authenticator, Aegis, 2FAS o Contrasenyes de l'iPhone). Guarda els codis de recuperació fora del mòbil.</p>
    <p><strong>Si algú oblida la contrasenya o perd el mòbil</strong>, un altre compte d'administració li'n pot posar una de nova i treure-li el segon factor (<em>Comptes → Edita</em>). Si és l'únic compte d'administració, qui porta el servidor pot executar <code>node reset-password.js &lt;usuari&gt;</code>.</p>
    <p>El <strong>registre de canvis</strong> guarda què ha fet cada compte durant un any.</p>`],
  ['privadesa', 'admin', 'Dades personals i menors', `
    <p>La <a href="#/privadesa">nota de protecció de dades</a> és un model: reviseu-la (millor amb algú que conegui el RGPD) i poseu-hi el contacte de la junta. Es pot imprimir per signar.</p>
    <p>Per als <strong>menors de 14 anys</strong> cal el consentiment del pare, mare o tutor/a: quan el tingueu signat, apunteu-ne la data a la seva fitxa. A <em>Persones</em> surt qui encara no el té.</p>
    <p>Qualsevol persona pot demanar les seves dades (a la fitxa, <em>Descarrega les seves dades</em>) o que s'esborrin.</p>`],
  ['servidor', 'admin', 'Posar-la en marxa per a la colla', `
    <p>Cal un servidor amb <strong>Node 22.13 o més nou</strong> i un <strong>disc que es conservi</strong> (la versió de prova gratuïta de Render s'esborra a cada reinici). Opcions senzilles: Render amb un disc (pla de pagament), Fly.io amb un volum, o un servidor virtual (Hetzner, OVH…) amb HTTPS al davant (Caddy ho fa sol).</p>
    <p>Variables principals: <code>COLLA_NAME</code> (nom de la colla), <code>COLLA_CODE</code> (codi per entrar com a membre), <code>PRIVACY_CONTACT</code> (correu de la junta), <code>DB_PATH</code> (on és la base de dades, dins del disc). Arrenca amb <code>npm start</code>.</p>
    <p>Amb un domini propi (p. ex. <code>app.lavostracolla.cat</code>) apuntant al servidor, la gent s'hi fia més i els enllaços no canvien mai.</p>`],
  ['copies', 'admin', 'Còpies de seguretat', `
    <p>Cada dia es fa una còpia al servidor (<code>BACKUP_DIR</code>, se'n guarden <code>BACKUP_KEEP</code>). Però si es perd el disc, es perden totes: configureu també la <strong>còpia fora del servidor</strong>, que s'envia xifrada un cop al dia a un emmagatzematge compatible amb S3 (Backblaze B2, Cloudflare R2, Scaleway…):</p>
    <p><code>BACKUP_S3_ENDPOINT</code>, <code>BACKUP_S3_BUCKET</code>, <code>BACKUP_S3_KEY_ID</code>, <code>BACKUP_S3_SECRET</code>, <code>BACKUP_S3_REGION</code> (si cal) i <code>BACKUP_KEY</code>, la clau per xifrar-la (almenys 12 caràcters). <strong>Guardeu BACKUP_KEY en un altre lloc</strong>: sense ella les còpies no es poden obrir. Al bucket, una regla de cicle de vida pot esborrar les de fa més de 30 dies.</p>
    <p><strong>Restaurar-ne una</strong>: <code>BACKUP_KEY='…' node restore.js colla-2026-11-18.db.enc restaurada.db</code> comprova la còpia i la deixa en un fitxer nou; després s'arrenca el servidor amb <code>DB_PATH</code> apuntant-hi. Proveu-ho un cop, abans que faci falta.</p>`],
  ['errors', 'admin', "Quan l'app falla", `
    <p>Els errors del servidor i dels mòbils es guarden (sense dir de qui eren) i surten a <em>Comptes → Errors de l'app</em>.</p>
    <p><strong>Avís al mòbil quan surt un error nou</strong>: instal·leu l'app ntfy, subscriviu-vos a un tema amb un nom difícil d'endevinar i poseu <code>ALERT_WEBHOOK=https://ntfy.sh/el-vostre-tema</code>.</p>
    <p><strong>Saber si l'app ha caigut</strong>: un servei com UptimeRobot o Better Stack (tenen pla gratuït) pot comprovar cada pocs minuts <code>/api/health</code> i avisar-vos si no respon.</p>`],
];

const es = [
  ['respondre', 'all', 'Decir si vienes', `
    <p>Al inicio salen las próximas sesiones. Toca <strong>Voy</strong> o <strong>No voy</strong> en cada una; puedes cambiarlo hasta la fecha límite (si la hay) o hasta el mismo día.</p>
    <p>Si una sesión tiene preguntas (por ejemplo, si vienes a cenar), <em>Voy</em> te abre la sesión para responderlas. Todo se guarda solo mientras respondes: no hace falta tocar ningún botón. Los castells en los que sales se ven en la sesión y en tu perfil.</p>
    <p>Si la sesión se paga (un viaje, una comida…), al decir que vienes verás cuánto te toca, el IBAN o el Bizum de la colla y el concepto con tu nombre, con botones para copiarlo. Cuando hayas pagado, toca <em>Ya he pagado</em>; la junta lo comprobará.</p>`],
  ['mobil', 'all', 'En el móvil: instalar la app y recibir avisos', `
    <p><strong>Instalarla</strong>: en el iPhone, abre la app con Safari, toca <em>Compartir</em> y <em>Añadir a pantalla de inicio</em>. En Android, el menú del navegador ofrece <em>Instalar aplicación</em>. Así se abre como una app y se puede consultar sin conexión.</p>
    <p><strong>Avisos</strong>: en tu perfil, <em>Activar los avisos</em>. Recibirás los mensajes del altavoz, las sesiones nuevas y un recordatorio si no has respondido. En el iPhone, primero hay que instalarla.</p>`],
  ['sessions', 'staff', 'Sesiones y asistencia', `
    <p>Las sesiones y los castells se crean <strong>ocultos</strong>: los miembros no los ven hasta que los muestras. Al mostrar una sesión puedes mostrar también sus castells y enviar un aviso al móvil de todos.</p>
    <p>En cada sesión está quién ha dicho que viene, quién falta por contestar (con un recordatorio por WhatsApp que no señala a nadie) y, el mismo día, la lista para marcar quién ha venido de verdad.</p>
    <p><strong>Preguntas y pagos</strong>: en <em>Campos extra</em> pones las preguntas (sí/no, número, lista) y, con <em>Precio</em>, lo que cuesta cada respuesta. En <em>Pago</em> pones dónde se paga, el precio por persona y el concepto. Quien dice que viene ve cuánto tiene que pagar y avisa cuando lo ha hecho; tú compruebas el banco y lo marcas como recibido (o como <em>Recibido en efectivo</em>, si te lo han dado en mano). Con las casillas de la columna <em>Pago</em> puedes marcar varios a la vez. Si pones una fecha límite, tres días antes quien todavía no ha pagado recibe un recordatorio en el móvil, y pasada la fecha lo verás como <em>Fuera de plazo</em>. El Excel y el CSV de la sesión llevan el importe y el estado de cada pago. La app no hace ningún cobro.</p>`],
  ['castells', 'staff', 'Castells y alineaciones', `
    <p>Dentro de cada castell, toca una posición y elige quién va. <strong>Montar automáticamente</strong> propone una alineación con quien ha dicho que viene, nivelando hombros y vigilando el peso; puedes retocarla antes de guardarla.</p>
    <p>Los <strong>avisos a revisar</strong> dicen qué no cuadra: gente que no viene, huecos en el tronc, hombros desiguales, alguien en dos castells que se hacen a la vez…</p>`],
  ['horari', 'staff', 'Horario del ensayo', `
    <p>En cada ensayo, la técnica y la junta ven cuándo se hace cada castell. Arrastra un bloque para cambiar su hora (con el dedo, cógelo por los puntos de la derecha) o tócalo para poner la hora y los minutos exactos. Si dos castells coinciden y tienen gente en común, sale en rojo.</p>`],
  ['pinyes', 'staff', 'Pinyes de la colla', `
    <p>En la pestaña <em>Pinyes</em> se redibuja la pinya de cada castell: mover, girar, añadir o quitar posiciones, con encaje y deshacer. Los cambios valen para todos los castells de ese tipo, y las posiciones que se mantienen conservan el historial.</p>
    <p>Se puede partir de la pinya de otro castell con los mismos baixos (por ejemplo, del 3d7 al 3d8), o de la estándar con taps y tapa-taps.</p>`],
  ['altaveu', 'staff', 'Altavoz', `<p>Mensajes para toda la colla, con fotos y emojis. Si lo marcas, llegan como aviso al móvil de quien los tiene activados. Se guardan como mucho 50.</p>
    <p>Un mensaje puede llevar un botón hacia una sesión: va bien para anunciar un viaje o una cena y que la gente se apunte y, si hace falta, pague.</p>`],
  ['comptes', 'admin', 'Cuentas y segundo factor', `
    <p>Cada persona que edita debería tener su cuenta, con lo que necesita: <strong>junta</strong> (sesiones, asistencia, contacto), <strong>técnica</strong> (castells, pinyes, medidas) o <strong>administración</strong> (todo).</p>
    <p><strong>Segundo factor</strong>: en <em>Mi cuenta</em>, <em>Activar el segundo factor</em>. Hace falta una app de autenticación (Google Authenticator, Microsoft Authenticator, Aegis, 2FAS o Contraseñas del iPhone). Guarda los códigos de recuperación fuera del móvil.</p>
    <p><strong>Si alguien olvida la contraseña o pierde el móvil</strong>, otra cuenta de administración le puede poner una nueva y quitarle el segundo factor (<em>Cuentas → Editar</em>). Si es la única cuenta de administración, quien lleva el servidor puede ejecutar <code>node reset-password.js &lt;usuario&gt;</code>.</p>
    <p>El <strong>registro de cambios</strong> guarda qué ha hecho cada cuenta durante un año.</p>`],
  ['privadesa', 'admin', 'Datos personales y menores', `
    <p>La <a href="#/privadesa">nota de protección de datos</a> es un modelo: revisadla (mejor con alguien que conozca el RGPD) y poned el contacto de la junta. Se puede imprimir para firmar.</p>
    <p>Para los <strong>menores de 14 años</strong> hace falta el consentimiento del padre, madre o tutor/a: cuando lo tengáis firmado, apuntad la fecha en su ficha. En <em>Personas</em> sale quién aún no lo tiene.</p>
    <p>Cualquier persona puede pedir sus datos (en la ficha, <em>Descargar sus datos</em>) o que se borren.</p>`],
  ['servidor', 'admin', 'Ponerla en marcha para la colla', `
    <p>Hace falta un servidor con <strong>Node 22.13 o más nuevo</strong> y un <strong>disco que se conserve</strong> (la versión de prueba gratuita de Render se borra en cada reinicio). Opciones sencillas: Render con un disco (plan de pago), Fly.io con un volumen, o un servidor virtual (Hetzner, OVH…) con HTTPS delante (Caddy lo hace solo).</p>
    <p>Variables principales: <code>COLLA_NAME</code> (nombre de la colla), <code>COLLA_CODE</code> (código para entrar como miembro), <code>PRIVACY_CONTACT</code> (correo de la junta), <code>DB_PATH</code> (dónde está la base de datos, dentro del disco). Arranca con <code>npm start</code>.</p>
    <p>Con un dominio propio (p. ej. <code>app.vuestracolla.cat</code>) apuntando al servidor, la gente confía más y los enlaces no cambian nunca.</p>`],
  ['copies', 'admin', 'Copias de seguridad', `
    <p>Cada día se hace una copia en el servidor (<code>BACKUP_DIR</code>, se guardan <code>BACKUP_KEEP</code>). Pero si se pierde el disco, se pierden todas: configurad también la <strong>copia fuera del servidor</strong>, que se envía cifrada una vez al día a un almacenamiento compatible con S3 (Backblaze B2, Cloudflare R2, Scaleway…):</p>
    <p><code>BACKUP_S3_ENDPOINT</code>, <code>BACKUP_S3_BUCKET</code>, <code>BACKUP_S3_KEY_ID</code>, <code>BACKUP_S3_SECRET</code>, <code>BACKUP_S3_REGION</code> (si hace falta) y <code>BACKUP_KEY</code>, la clave para cifrarla (al menos 12 caracteres). <strong>Guardad BACKUP_KEY en otro sitio</strong>: sin ella las copias no se pueden abrir. En el bucket, una regla de ciclo de vida puede borrar las de hace más de 30 días.</p>
    <p><strong>Restaurar una</strong>: <code>BACKUP_KEY='…' node restore.js colla-2026-11-18.db.enc restaurada.db</code> comprueba la copia y la deja en un archivo nuevo; después se arranca el servidor con <code>DB_PATH</code> apuntando a ella. Probadlo una vez, antes de que haga falta.</p>`],
  ['errors', 'admin', 'Cuando la app falla', `
    <p>Los errores del servidor y de los móviles se guardan (sin decir de quién eran) y salen en <em>Cuentas → Errores de la app</em>.</p>
    <p><strong>Aviso al móvil cuando sale un error nuevo</strong>: instalad la app ntfy, suscribíos a un tema con un nombre difícil de adivinar y poned <code>ALERT_WEBHOOK=https://ntfy.sh/vuestro-tema</code>.</p>
    <p><strong>Saber si la app se ha caído</strong>: un servicio como UptimeRobot o Better Stack (tienen plan gratuito) puede comprobar cada pocos minutos <code>/api/health</code> y avisaros si no responde.</p>`],
];

const en = [
  ['respondre', 'all', "Saying whether you're coming", `
    <p>The home page lists upcoming sessions. Tap <strong>Going</strong> or <strong>Not going</strong> on each; you can change it until the deadline (if there is one) or until the day itself.</p>
    <p>If a session has questions (for example, whether you'll stay for dinner), <em>Going</em> opens the session so you can answer them. Everything saves by itself as you answer: there is no button to press. The castells you are in show up in the session and on your profile.</p>
    <p>If the session has a cost (a trip, a lunch…), when you say you're going you'll see how much you owe, the colla's IBAN or Bizum and a reference with your name, with buttons to copy them. Once you've paid, tap <em>I've paid</em>; the board will check it.</p>`],
  ['mobil', 'all', 'On your phone: installing the app and notifications', `
    <p><strong>Installing</strong>: on iPhone, open the app in Safari, tap <em>Share</em> and <em>Add to Home Screen</em>. On Android, the browser menu offers <em>Install app</em>. It then opens like an app and works offline.</p>
    <p><strong>Notifications</strong>: on your profile, <em>Turn on notifications</em>. You'll get announcements, new sessions and a reminder if you haven't answered. On iPhone, install it first.</p>`],
  ['sessions', 'staff', 'Sessions and attendance', `
    <p>Sessions and castells are created <strong>hidden</strong>: members don't see them until you show them. When you show a session you can also show its castells and notify everyone's phone.</p>
    <p>Each session shows who is coming, who hasn't answered (with a WhatsApp reminder that doesn't single anyone out) and, on the day, the list to mark who actually came.</p>
    <p><strong>Questions and payments</strong>: under <em>Extra fields</em> add the questions (yes/no, number, list) and, with <em>Price</em>, what each answer costs. Under <em>Payment</em> set where to pay, the price per person and the reference. Whoever says they're going sees how much to pay and tells you when they have; you check the bank and mark it as received (or as <em>Received in cash</em> if they paid you by hand). Use the checkboxes in the <em>Payment</em> column to mark several at once. If you set a deadline, three days before it anyone who hasn't paid gets a reminder on their phone, and after it they show as <em>Overdue</em>. The session's Excel and CSV include each payment's amount and status. The app never charges anything.</p>`],
  ['castells', 'staff', 'Castells and line-ups', `
    <p>Inside each castell, tap a position and choose who goes there. <strong>Build automatically</strong> proposes a line-up with the people who are coming, levelling shoulders and checking weight; you can adjust it before saving.</p>
    <p>The <strong>warnings to check</strong> point out what doesn't fit: people not coming, gaps in the tronc, uneven shoulders, someone in two castells at the same time…</p>`],
  ['horari', 'staff', 'Rehearsal schedule', `
    <p>At each rehearsal, the technical team and the board see when each castell happens. Drag a block to change its time (with a finger, hold it by the dots on the right) or tap it to set the exact time and minutes. If two castells overlap and share people, it shows in red.</p>`],
  ['pinyes', 'staff', "Colla's pinyes", `
    <p>In the <em>Pinyes</em> tab you redraw the pinya of each castell: move, rotate, add or remove positions, with snapping and undo. Changes apply to every castell of that type, and positions that are kept keep their history.</p>
    <p>You can start from another castell's pinya with the same baixos (for example, from 3d7 to 3d8), or from the standard one with taps and tapa-taps.</p>`],
  ['altaveu', 'staff', 'Announcements', `<p>Messages for the whole colla, with photos and emojis. If you tick it, they arrive as a notification on phones that have them turned on. At most 50 are kept.</p>
    <p>A message can carry a button to a session: handy to announce a trip or a dinner so people sign up and, if needed, pay.</p>`],
  ['comptes', 'admin', 'Accounts and two-step verification', `
    <p>Everyone who edits should have their own account with what they need: <strong>board</strong> (sessions, attendance, contact details), <strong>technical</strong> (castells, pinyes, measurements) or <strong>admin</strong> (everything).</p>
    <p><strong>Two-step verification</strong>: in <em>My account</em>, <em>Turn on two-step verification</em>. You need an authenticator app (Google Authenticator, Microsoft Authenticator, Aegis, 2FAS or iPhone Passwords). Keep the recovery codes somewhere other than your phone.</p>
    <p><strong>If someone forgets their password or loses their phone</strong>, another admin account can give them a new one and turn off their two-step verification (<em>Accounts → Edit</em>). If it's the only admin account, whoever runs the server can run <code>node reset-password.js &lt;username&gt;</code>.</p>
    <p>The <strong>activity log</strong> keeps what each account did for one year.</p>`],
  ['privadesa', 'admin', 'Personal data and minors', `
    <p>The <a href="#/privadesa">data protection notice</a> is a template: review it (ideally with someone who knows the GDPR) and add the board's contact. It can be printed to sign.</p>
    <p>For <strong>children under 14</strong>, consent from a parent or legal guardian is required: once it's signed, record the date on their record. <em>People</em> shows who still doesn't have it.</p>
    <p>Anyone can ask for their data (on their record, <em>Download their data</em>) or for it to be deleted.</p>`],
  ['servidor', 'admin', 'Running it for the colla', `
    <p>You need a server with <strong>Node 22.13 or newer</strong> and a <strong>persistent disk</strong> (Render's free demo is wiped on every restart). Simple options: Render with a disk (paid plan), Fly.io with a volume, or a virtual server (Hetzner, OVH…) with HTTPS in front (Caddy does it by itself).</p>
    <p>Main variables: <code>COLLA_NAME</code> (the colla's name), <code>COLLA_CODE</code> (code members need to sign in), <code>PRIVACY_CONTACT</code> (the board's email), <code>DB_PATH</code> (where the database lives, on the disk). Start it with <code>npm start</code>.</p>
    <p>With your own domain (e.g. <code>app.yourcolla.cat</code>) pointing at the server, people trust it more and links never change.</p>`],
  ['copies', 'admin', 'Backups', `
    <p>A copy is made on the server every day (<code>BACKUP_DIR</code>, <code>BACKUP_KEEP</code> are kept). But if the disk is lost, so are they: also set up the <strong>off-site backup</strong>, sent encrypted once a day to S3-compatible storage (Backblaze B2, Cloudflare R2, Scaleway…):</p>
    <p><code>BACKUP_S3_ENDPOINT</code>, <code>BACKUP_S3_BUCKET</code>, <code>BACKUP_S3_KEY_ID</code>, <code>BACKUP_S3_SECRET</code>, <code>BACKUP_S3_REGION</code> (if needed) and <code>BACKUP_KEY</code>, the encryption key (at least 12 characters). <strong>Keep BACKUP_KEY somewhere else</strong>: without it the backups can't be opened. On the bucket, a lifecycle rule can delete copies older than 30 days.</p>
    <p><strong>Restoring one</strong>: <code>BACKUP_KEY='…' node restore.js colla-2026-11-18.db.enc restored.db</code> checks the backup and writes it to a new file; then start the server with <code>DB_PATH</code> pointing at it. Try it once, before you need it.</p>`],
  ['errors', 'admin', 'When the app fails', `
    <p>Server and phone errors are recorded (without saying whose they were) and appear in <em>Accounts → App errors</em>.</p>
    <p><strong>A phone notification when a new error appears</strong>: install the ntfy app, subscribe to a topic with a hard-to-guess name and set <code>ALERT_WEBHOOK=https://ntfy.sh/your-topic</code>.</p>
    <p><strong>Knowing if the app is down</strong>: a service like UptimeRobot or Better Stack (both have free plans) can check <code>/api/health</code> every few minutes and alert you if it doesn't respond.</p>`],
];

const toSections = (list) => list.map(([id, who, title, body]) => ({ id, who, title, body }));
export const HELP = { ca: toSections(ca), es: toSections(es), en: toSections(en) };
