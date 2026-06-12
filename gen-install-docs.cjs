const fs = require('fs');

const WINDOWS_TXT = `NOTICE D'INSTALLATION - CLAUS.IO (WINDOWS)
======================================================
FRANÇAIS
======================================================
Voici les étapes pour installer votre assistant culinaire intelligent CLAUS.IO sur Windows.

1. INSTALLATION DU LOGICIEL (DÉTOURNER L'ALERTE DE SÉCURITÉ)
   - Double-cliquez sur l'installateur \`CLAUS.IO-Setup.exe\`.
   - ⚠️ ALERTE "Windows a protégé votre ordinateur" (SmartScreen) ⚠️ 
     Comme notre logiciel est tout nouveau, Windows affiche une alerte bleue par précaution.
     -> Cliquez sur le texte "Informations complémentaires" (en dessous du texte principal).
     -> Un nouveau bouton "Exécuter quand même" va apparaître en bas à droite. Cliquez dessus.
   - Suivez les étapes de l'installateur.
   - Une fois terminé, lancez l'application depuis le raccourci créé sur votre bureau.

2. INSTALLATION DU "CERVEAU" IA (OLLAMA)
   - Ollama est une plateforme sécurisée qui fait tourner des modèles d'IA localement sur votre ordinateur, garantissant la confidentialité totale de vos données.
   - Téléchargez et installez Ollama : https://ollama.com/download/windows
   - Une fois installé, téléchargez un modèle IA. Nous recommandons \`llama3.2:11b\` (parfait pour la vision et les tâches complexes), ou adaptez selon la puissance de votre ordinateur.
   - Dans le logiciel CLAUS.IO, allez dans "PARAMÈTRES" et cliquez sur "Tester Connexion".
   - Une fois "Connecté", l'IA est prête !

3. ACTIVATION DE LA LICENCE
   - Vous disposez de 30 jours d'essai gratuit.
   - Pour débloquer la version illimitée :
     a. Allez dans l'onglet "PARAMÈTRES".
     b. Notez votre "Machine ID" (ex: 4F8B-A2C1-...).
     c. Envoyez ce code par email à votre support / administrateur.
     d. Saisissez la clé reçue en retour et cliquez sur "Activer".

4. ACCÈS SMARTPHONE (WIFI)
   - Connectez votre smartphone au *MÊME* réseau Wi-Fi que cet ordinateur Windows.
   - Dans les paramètres de CLAUS.IO, scannez le QR Code apparaissant à l'écran avec l'appareil photo du téléphone.
   - Sur mobile, vous aurez accès aux outils "INVENTAIRE", "HACCP" et "DOCUMENTS".

5. SAUVEGARDE ET MISE À JOUR (TRÈS IMPORTANT)
   - Vos données ne sont plus dans le dossier d'installation, mais dans votre profil utilisateur :
     - Windows : \`%AppData%\\Roaming\\ClausIO\`
     - Linux/macOS : \`~/.clausio\`
   - NOUVEAUTÉ : Utilisez l'outil de sauvegarde automatique dans l'onglet PARAMÈTRES pour générer un fichier \`.zip\` contenant toute votre base de données et vos fichiers.
   - En cas de réinstallation, lancez l'application une première fois pour initialiser le dossier, puis remplacez son contenu par celui de votre sauvegarde \`.zip\`.

======================================================
ENGLISH
======================================================
Here are the steps to install your intelligent culinary assistant CLAUS.IO on Windows.

1. SOFTWARE INSTALLATION (BYPASSING THE SECURITY ALERT)
   - Double-click on the installer \`CLAUS.IO-Setup.exe\`.
   - ⚠️ "Windows protected your PC" (SmartScreen) ALERT ⚠️ 
     Since our software is new, Windows displays a blue screen warning by precaution.
     -> Click on "More info" (just below the main text).
     -> A new button "Run anyway" will appear at the bottom right. Click it.
   - Follow the installation steps.
   - Once finished, launch the application from the desktop shortcut.

2. AI "BRAIN" INSTALLATION (OLLAMA)
   - Ollama is a secure platform that runs AI models locally on your computer, ensuring absolute privacy for your data.
   - Download and install Ollama: https://ollama.com/download/windows
   - Once installed, download an AI model. We recommend \`llama3.2:11b\` (perfect for vision and complex tasks), or choose according to your computer's performance.
   - Inside the CLAUS.IO software, go to "SETTINGS" and click on "Test Connection".
   - Once it says "Connected", the AI is ready!

3. LICENSE ACTIVATION
   - You have a 30-day free trial.
   - To unlock the unlimited version:
     a. Go to the "SETTINGS" tab.
     b. Write down your "Machine ID" (e.g., 4F8B-A2C1-...).
     c. Send this code to your support/administrator.
     d. Input the key received in return and click "Activate".

4. SMARTPHONE ACCESS (WIFI)
   - Connect your smartphone to the *SAME* Wi-Fi network as this Windows computer.
   - In CLAUS.IO settings, scan the QR Code on the screen using your phone's camera.
   - On your mobile device, you will access the "INVENTORY", "HACCP", and "DOCUMENTS" tools.

5. BACKUP AND UPDATES (VERY IMPORTANT)
   - Your data is no longer in the installation directory, but in your user profile:
     - Windows: \`%AppData%\\Roaming\\ClausIO\`
     - Linux/macOS: \`~/.clausio\`
   - NEW: Use the automatic backup tool in the SETTINGS tab to generate a \`.zip\` file containing your entire database and files.
   - For a fresh installation, run the application once to initialize the directory, then replace its contents with those from your \`.zip\` backup.

======================================================
ESPAÑOL
======================================================
Aquí están los pasos para instalar su asistente culinario inteligente CLAUS.IO en Windows.

1. INSTALACIÓN DEL SOFTWARE (EVITAR LA ALERTA DE SEGURIDAD)
   - Haga doble clic en el instalador \`CLAUS.IO-Setup.exe\`.
   - ⚠️ ALERTA "Windows protegió su PC" (SmartScreen) ⚠️ 
     Como nuestro software es nuevo, Windows muestra una alerta azul por precaución.
     -> Haga clic en "Más información" (debajo del texto principal).
     -> Aparecerá un botón "Ejecutar de todas formas" abajo a la derecha. Haga clic en él.
   - Siga los pasos de instalación.
   - Una vez finalizado, inicie la aplicación desde el acceso directo del escritorio.

2. INSTALACIÓN DEL "CEREBRO" IA (OLLAMA)
   - Ollama es una plataforma segura que ejecuta modelos de IA localmente en su ordenador, garantizando la privacidad absoluta de sus datos.
   - Descargue e instale Ollama: https://ollama.com/download/windows
   - Una vez instalado, descargue un modelo IA. Recomendamos \`llama3.2:11b\` (perfecto para visión y tareas complejas), o adapte según la potencia de su ordenador.
   - Dentro del software CLAUS.IO, vaya a "AJUSTES" y haga clic en "Probar Conexión".
   - Una vez que diga "Conectado", ¡la IA está lista!

3. ACTIVACIÓN DE LA LICENCIA
   - Dispone de una prueba gratuita de 30 días.
   - Para desbloquear la versión ilimitada:
     a. Vaya a la pestaña "AJUSTES".
     b. Anote su "ID de Máquina" (ej: 4F8B-A2C1-...).
     c. Envíe este código por correo electrónico a su soporte/administrador.
     d. Ingrese la clave recibida a cambio y haga clic en "Activar".

4. ACCESO DESDE SMARTPHONE (WIFI)
   - Conecte su smartphone a la *MISMA* red Wi-Fi que este ordenador con Windows.
   - En la configuración de CLAUS.IO, escanee el código QR que aparece en la pantalla con la cámara de su teléfono.
   - Desde el móvil, tendrá acceso a las herramientas "INVENTARIO", "HACCP" y "DOCUMENTOS".

5. COPIA DE SEGURIDAD Y ACTUALIZACIONES (MUY IMPORTANTE)
   - Sus datos ya no están en la carpeta de instalación, sino en su perfil de usuario:
     - Windows: \`%AppData%\\Roaming\\ClausIO\`
     - Linux/macOS: \`~/.clausio\`
   - NOVEDAD: Use la herramienta de copia de seguridad automática en AJUSTES para generar un archivo \`.zip\` que contiene toda su base de datos y archivos.
   - Para una reinstalación, ejecute la aplicación una vez para inicializar el directorio, luego reemplace su contenido con el de su archivo \`backup.zip\`.

======================================================
ITALIANO
======================================================
Ecco i passaggi per installare il tuo assistente culinario intelligente CLAUS.IO su Windows.

1. INSTALLAZIONE DEL SOFTWARE (AGGIRARE L'AVVISO DI SICUREZZA)
   - Fai doppio clic sul file di installazione \`CLAUS.IO-Setup.exe\`.
   - ⚠️ AVVISO "Windows ha protetto il tuo PC" (SmartScreen) ⚠️ 
     Poiché il nostro software è nuovo, Windows mostra un avviso blu per precauzione.
     -> Fai clic su "Ulteriori informazioni" (sotto il testo principale).
     -> Apparirà un nuovo pulsante "Esegui comunque" in basso a destra. Cliccalo.
   - Segui i passaggi di installazione.
   - Una volta terminato, avvia l'applicazione dalla scorciatoia sul desktop.

2. INSTALLAZIONE DEL "CERVELLO" IA (OLLAMA)
   - Ollama è una piattaforma sicura che esegue modelli di IA localmente sul tuo computer, garantendo la privacy totale dei tuoi dati.
   - Scarica e installa Ollama: https://ollama.com/download/windows
   - Una volta installato, scarica un modello IA. Consigliamo \`llama3.2:11b\` (perfetto per la visione e compiti complessi), oppure adatta in base alla potenza del tuo computer.
   - All'interno del software CLAUS.IO, vai su "IMPOSTAZIONI" e fai clic su "Test Connessione".
   - Una volta che dice "Connesso", l'IA è pronta!

3. ATTIVAZIONE DELLA LICENZA
   - Hai una prova gratuita di 30 giorni.
   - Per sbloccare la versione illimitata:
     a. Vai alla scheda "IMPOSTAZIONI".
     b. Prendi nota del tuo "Machine ID" (es: 4F8B-A2C1-...).
     c. Invia questo codice via email al tuo supporto/amministratore.
     d. Inserisci la chiave ricevuta in risposta e fai clic su "Attiva".

4. ACCESSO DA SMARTPHONE (WIFI)
   - Collega il tuo smartphone alla *STESSA* rete Wi-Fi di questo computer Windows.
   - Nelle impostazioni di CLAUS.IO, scansiona il QR Code che appare sullo schermo con la fotocamera del telefono.
   - Sul cellulare, avrai accesso agli strumenti "INVENTARIO", "HACCP" e "DOCUMENTI".

5. BACKUP E AGGIORNAMENTI (MOLTO IMPORTANTE)
   - I tuoi dati non si trovano più nella directory di installazione, ma nel tuo profilo utente:
     - Windows: \`%AppData%\\Roaming\\ClausIO\`
     - Linux/macOS: \`~/.clausio\`
   - NOVITÀ: Usa lo strumento di backup automatico nella scheda IMPOSTAZIONI per generare un file \`.zip\` contenente l'intero database e i file.
   - Per una nuova installazione, avvia l'applicazione una volta per inizializzare la directory, quindi sostituisci il suo contenuto con quello dal tuo \`.zip\` di backup.

======================================================
DEUTSCH
======================================================
Hier sind die Schritte zur Installation Ihres intelligenten Küchenassistenten CLAUS.IO auf Windows.

1. SOFTWAREINSTALLATION (UMGEHUNG DER SICHERHEITSWARNUNG)
   - Doppelklicken Sie auf das Installationsprogramm \`CLAUS.IO-Setup.exe\`.
   - ⚠️ WARNUNG "Der Windows-Computer wurde durch Windows geschützt" (SmartScreen) ⚠️ 
     Da unsere Software neu ist, zeigt Windows vorsichtshalber eine blaue Warnung an.
     -> Klicken Sie auf "Weitere Informationen" (unter dem Haupttext).
     -> Ein neuer Button "Trotzdem ausführen" erscheint unten rechts. Klicken Sie darauf.
   - Folgen Sie den Installationsschritten.
   - Nach Abschluss starten Sie die Anwendung über die Desktop-Verknüpfung.

2. INSTALLATION DES KI-"GEHIRNS" (OLLAMA)
   - Ollama ist eine sichere Plattform, die KI-Modelle lokal auf Ihrem Computer ausführt und absolute Privatsphäre Ihrer Daten gewährleistet.
   - Laden Sie Ollama herunter und installieren Sie es: https://ollama.com/download/windows
   - Sobald installiert, laden Sie ein KI-Modell herunter. Wir empfehlen \`llama3.2:11b\` (perfekt für Vision und komplexe Aufgaben) oder passen Sie dies je nach Leistungsfähigkeit Ihres Computers an.
   - Gehen Sie in der CLAUS.IO-Software auf "EINSTELLUNGEN" und klicken Sie auf "Verbindung testen".
   - Sobald "Verbunden" angezeigt wird, ist die KI bereit!

3. LIZENZAKTIVIERUNG
   - Sie haben eine kostenlose 30-Tage-Testversion.
   - Um die unbegrenzte Version freizuschalten:
     a. Gehen Sie auf den Tab "EINSTELLUNGEN".
     b. Notieren Sie sich Ihre "Machine ID" (z.B. 4F8B-A2C1-...).
     c. Senden Sie diesen Code per E-Mail an Ihren Support/Administrator.
     d. Geben Sie den erhaltenen Schlüssel ein und klicken Sie auf "Aktivieren".

4. SMARTPHONE-ZUGANG (WLAN)
   - Verbinden Sie Ihr Smartphone mit dem *SELBEN* WLAN-Netzwerk wie dieser Windows-Computer.
   - Scannen Sie in den CLAUS.IO-Einstellungen den QR-Code auf dem Bildschirm mit der Kamera Ihres Telefons.
   - Auf dem Mobilgerät haben Sie Zugriff auf die Tools "INVENTAR", "HACCP" und "DOKUMENTE".

5. BACKUP UND UPDATES (SEHR WICHTIG)
   - Ihre Daten befinden sich nicht mehr im Installationsverzeichnis, sondern in Ihrem Benutzerprofil:
     - Windows: \`%AppData%\\Roaming\\ClausIO\`
     - Linux/macOS: \`~/.clausio\`
   - NEU: Verwenden Sie das automatische Backup-Tool im EINSTELLUNGEN-Tab, um eine \`.zip\`-Datei mit Ihrer gesamten Datenbank und Dateien zu generieren.
   - Um eine Neuinstallation durchzuführen, führen Sie die Anwendung einmal aus, um das Verzeichnis zu initialisieren, und ersetzen Sie dann dessen Inhalt durch den Ihres \`backup.zip\`.
`;

const LINUX_TXT = \`NOTICE D'INSTALLATION - CLAUS.IO (LINUX)
======================================================
FRANÇAIS
======================================================
Voici les étapes pour installer CLAUS.IO sur Linux (versions basées sur Ubuntu/Debian).

1. EXÉCUTION DU LOGICIEL (PERMISSIONS APPIMAGE)
   - Vous avez reçu un fichier \`.AppImage\` (ex: \`CLAUS.IO-1.0.0.AppImage\`).
   - Par défaut, Linux bloque l'exécution des nouveaux fichiers.
   - Faites un clic droit sur le fichier \`.AppImage\` -> Sélectionnez **Propriétés** (Properties).
   - Allez dans l'onglet **Permissions**.
   - Cochez la case **"Autoriser l'exécution du fichier comme un programme"** (Allow executing file as program).
   - Fermez la fenêtre des propriétés et double-cliquez sur le fichier pour lancer CLAUS.IO.
   *(Alternative en terminal : \`chmod +x CLAUS.IO-1.0.0.AppImage\` puis \`./CLAUS.IO-1.0.0.AppImage\`)*

2. INSTALLATION DU "CERVEAU" IA (OLLAMA)
   - Ollama est une plateforme sécurisée qui fait tourner des modèles d'IA localement sur votre ordinateur, garantissant la confidentialité totale de vos données.
   - Ouvrez un terminal et installez Ollama : \`curl -fsSL https://ollama.com/install.sh | sh\`
   - Une fois installé, téléchargez un modèle IA. Nous recommandons \`llama3.2:11b\` (parfait pour la vision et les tâches complexes), ou adaptez selon la puissance de votre ordinateur.
   - (Dans le terminal, tapez : \`ollama run llama3.2\`)
   - Dans le logiciel CLAUS.IO, allez dans "PARAMÈTRES" et cliquez sur "Tester Connexion".

3. ACTIVATION DE LA LICENCE
   - Allez dans "PARAMÈTRES". Notez le "Machine ID" et envoyez-le à la direction/support.
   - Renseignez la clé reçue et activez l'application.

4. SAUVEGARDE ET ACCÈS SMARTPHONE
   - QR Code Wi-Fi disponible dans les paramètres (téléphone et PC sur le même réseau local !).
   - Copiez TOUJOURS \`agent_culinaire.db\` et le dossier \`uploads\` avant une mise à jour. Ils sont générés dans le même répertoire que votre AppImage (ou dans \`~/.config/agent-culinaire-os\` selon votre distribution).

5. CRÉATION DE L'EXÉCUTABLE LINUX (POUR VOUS)
   - Ouvrez un terminal dans le dossier du projet.
   - Assurez-vous d'avoir installé les dépendances (\`npm install\`).
   - Exécutez : \`npm run build:linux\`
   - Le fichier généré se trouvera dans le dossier \`/release\`.

======================================================
ENGLISH
======================================================
Here are the steps to install CLAUS.IO on Linux (Ubuntu/Debian based).

1. RUNNING THE SOFTWARE (APPIMAGE PERMISSIONS)
   - You received an \`.AppImage\` file (e.g., \`CLAUS.IO-1.0.0.AppImage\`).
   - By default, Linux blocks executing new files.
   - Right-click on the \`.AppImage\` file -> Select **Properties**.
   - Go to the **Permissions** tab.
   - Check the box labeled **"Allow executing file as program"**.
   - Close the properties window, then double-click the file to launch CLAUS.IO.
   *(Terminal alternative: \`chmod +x CLAUS.IO-1.0.0.AppImage\` then \`./CLAUS.IO-1.0.0.AppImage\`)*

2. AI "BRAIN" INSTALLATION (OLLAMA)
   - Ollama is a secure platform that runs AI models locally on your computer, ensuring absolute privacy for your data.
   - Open a terminal and install Ollama: \`curl -fsSL https://ollama.com/install.sh | sh\`
   - Once installed, download an AI model. We recommend \`llama3.2:11b\` (perfect for vision and complex tasks), or choose according to your computer's performance.
   - (In the terminal, run: \`ollama run llama3.2\`)
   - Inside CLAUS.IO software, go to "SETTINGS" and click on "Test Connection".

3. LICENSE ACTIVATION
   - Go to "SETTINGS". Note the "Machine ID" and send it to management/support.
   - Enter the received key and activate the application.

4. BACKUP AND SMARTPHONE ACCESS
   - Wi-Fi QR Code is available in settings (Phone and PC must be on the same local network!).
   - ALWAYS backup \`agent_culinaire.db\` and the \`uploads\` folder before modifying the software. They reside alongside your AppImage (or inside \`~/.config/agent-culinaire-os\` depending on your distro).

5. CREATING THE LINUX EXECUTABLE (FOR YOU)
   - Open a terminal in the project directory.
   - Make sure dependencies are installed (\`npm install\`).
   - Run: \`npm run build:linux\`
   - The generated file will be in the \`/release\` folder.

======================================================
ESPAÑOL
======================================================
Aquí están los pasos para instalar CLAUS.IO en Linux (basado en Ubuntu/Debian).

1. EJECUCIÓN DEL SOFTWARE (PERMISOS DE APPIMAGE)
   - Ha recibido un archivo \`.AppImage\` (ej: \`CLAUS.IO-1.0.0.AppImage\`).
   - De forma predeterminada, Linux bloquea la ejecución de nuevos archivos.
   - Haga clic derecho en el archivo \`.AppImage\` -> Seleccione **Propiedades**.
   - Vaya a la pestaña de **Permisos**.
   - Marque la casilla **"Permitir ejecutar el archivo como un programa"**.
   - Cierre la ventana de propiedades y haga doble clic en el archivo para iniciar CLAUS.IO.
   *(Alternativa en terminal: \`chmod +x CLAUS.IO-1.0.0.AppImage\` luego \`./CLAUS.IO-1.0.0.AppImage\`)*

2. INSTALACIÓN DEL "CEREBRO" IA (OLLAMA)
   - Ollama es una plataforma segura que ejecuta modelos de IA localmente en su ordenador, garantizando la privacidad absoluta de sus datos.
   - Abra un terminal e instale Ollama: \`curl -fsSL https://ollama.com/install.sh | sh\`
   - Una vez instalado, descargue un modelo IA. Recomendamos \`llama3.2:11b\` (perfecto para visión y tareas complejas), o adapte según la potencia de su ordenador.
   - (En el terminal, escriba: \`ollama run llama3.2\`)
   - Dentro del software CLAUS.IO, vaya a "AJUSTES" y haga clic en "Probar conexión".

3. ACTIVACIÓN DE LA LICENCIA
   - Vaya a "AJUSTES". Anote el "Machine ID" y envíelo a la dirección/soporte.
   - Ingrese la clave recibida y active la aplicación.

4. COPIA DE SEGURIDAD Y ACCESO DESDE SMARTPHONE
   - El código QR de Wi-Fi está disponible en ajustes (¡el teléfono y el PC deben estar en la misma red local!).
   - SIEMPRE haga una copia de seguridad de \`agent_culinaire.db\` y de la carpeta \`uploads\` antes de modificar el software. Estos residen junto a su AppImage (o en \`~/.config/agent-culinaire-os\` dependiendo de su distro).

5. CREACIÓN DEL EJECUTABLE LINUX (PARA USTED)
   - Abra un terminal en el directorio del proyecto.
   - Asegúrese de tener instaladas las dependencias (\`npm install\`).
   - Ejecute: \`npm run build:linux\`
   - El archivo generado estará en la carpeta \`/release\`.

======================================================
ITALIANO
======================================================
Ecco i passaggi per installare CLAUS.IO su Linux (basato su Ubuntu/Debian).

1. ESECUZIONE DEL SOFTWARE (PERMESSI APPIMAGE)
   - Hai ricevuto un file \`.AppImage\` (es. \`CLAUS.IO-1.0.0.AppImage\`).
   - Di default, Linux blocca l'esecuzione di nuovi file.
   - Fai clic col tasto destro sul file \`.AppImage\` -> Seleziona **Proprietà**.
   - Vai alla scheda **Permessi**.
   - Spunta la casella **"Consenti l'esecuzione del file come programma"**.
   - Chiudi la finestra delle proprietà e fai doppio clic sul file per avviare CLAUS.IO.
   *(Alternativa nel terminale: \`chmod +x CLAUS.IO-1.0.0.AppImage\` e poi \`./CLAUS.IO-1.0.0.AppImage\`)*

2. INSTALLAZIONE DEL "CERVELLO" IA (OLLAMA)
   - Ollama è una piattaforma sicura che esegue modelli di IA localmente sul tuo computer, garantendo la privacy totale dei tuoi dati.
   - Apri un terminale e installa Ollama: \`curl -fsSL https://ollama.com/install.sh | sh\`
   - Una volta installato, scarica un modello IA. Consigliamo \`llama3.2:11b\` (perfetto per la visione e compiti complessi), oppure adatta in base alla potenza del tuo computer.
   - (Nel terminale, digita: \`ollama run llama3.2\`)
   - Nel software CLAUS.IO, vai su "IMPOSTAZIONI" e clicca su "Test Connessione".

3. ATTIVAZIONE DELLA LICENZA
   - Vai su "IMPOSTAZIONI". Annota il "Machine ID" e invialo alla direzione/supporto.
   - Inserisci la chiave ricevuta e attiva l'applicazione.

4. BACKUP E ACCESSO DA SMARTPHONE
   - Il QR Code Wi-Fi è disponibile nelle impostazioni (telefono e PC devono trovarsi sulla stessa rete locale!).
   - Esegui SEMPRE il backup di \`agent_culinaire.db\` e della cartella \`uploads\` prima di una modifica al software. Risiedono accanto alla tua AppImage (o in \`~/.config/agent-culinaire-os\` a seconda della distribuzione).

5. CREAZIONE DELL'ESEGUIBILE LINUX (PER TE)
   - Apri un terminale nella directory del progetto.
   - Assicurati che le dipendenze siano installate (\`npm install\`).
   - Esegui: \`npm run build:linux\`
   - Il file generato sarà nella cartella \`/release\`.

======================================================
DEUTSCH
======================================================
Hier sind die Schritte zur Installation von CLAUS.IO auf Linux (Debian/Ubuntu-basiert).

1. AUSFÜHRUNG DER SOFTWARE (APPIMAGE-BERECHTIGUNGEN)
   - Sie haben eine \`.AppImage\`-Datei erhalten (z. B. \`CLAUS.IO-1.0.0.AppImage\`).
   - Standardmäßig blockiert Linux die Ausführung neuer Dateien.
   - Klicken Sie mit der rechten Maustaste auf die \`.AppImage\`-Datei -> Wählen Sie **Eigenschaften** (Properties).
   - Wechseln Sie zum Reiter **Berechtigungen** (Permissions).
   - Aktivieren Sie das Kästchen **"Datei als Programm ausführen zulassen"**.
   - Schließen Sie das Eigenschaften-Fenster und doppelklicken Sie dann auf die Datei, um CLAUS.IO zu starten.
   *(Terminal-Alternative: \`chmod +x CLAUS.IO-1.0.0.AppImage\` und dann \`./CLAUS.IO-1.0.0.AppImage\`)*

2. INSTALLATION DES KI-"GEHIRNS" (OLLAMA)
   - Ollama ist eine sichere Plattform, die KI-Modelle lokal auf Ihrem Computer ausführt und absolute Privatsphäre Ihrer Daten gewährleistet.
   - Öffnen Sie ein Terminal und installieren Sie Ollama: \`curl -fsSL https://ollama.com/install.sh | sh\`
   - Sobald installiert, laden Sie ein KI-Modell herunter. Wir empfehlen \`llama3.2:11b\` (perfekt für Vision und komplexe Aufgaben) oder passen Sie dies je nach Leistungsfähigkeit Ihres Computers an.
   - (Geben Sie im Terminal ein: \`ollama run llama3.2\`)
   - Gehen Sie in der CLAUS.IO-Software auf "EINSTELLUNGEN" und klicken Sie auf "Verbindung testen".

3. LIZENZAKTIVIERUNG
   - Gehen Sie auf "EINSTELLUNGEN". Notieren Sie die "Machine ID" und senden Sie diese an Ihre Leitung/Support.
   - Geben Sie den erhaltenen Schlüssel ein und aktivieren Sie die Anwendung.

4. BACKUP UND SMARTPHONE-ZUGANG
   - Ein WLAN-QR-Code ist in den Einstellungen verfügbar (Telefon und PC müssen im selben lokalen Netzwerk sein!).
   - Sichern Sie IMMER \`agent_culinaire.db\` und den Ordner \`uploads\` vor einem Software-Update. Diese befinden sich normalerweise neben Ihrer AppImage-Datei (oder in \`~/.config/agent-culinaire-os\`, abhängig von Ihrer Distribution).

5. ERSTELLUNG DER LINUX-DATEI (FÜR SIE)
   - Öffnen Sie ein Terminal im Projektverzeichnis.
   - Vergewissern Sie sich, dass die Abhängigkeiten installiert sind (\`npm install\`).
   - Führen Sie aus: \`npm run build:linux\`
   - Die generierte Datei befindet sich im Ordner \`/release\`.
`;

const MACOS_TXT = \`NOTICE D'INSTALLATION - CLAUS.IO (macOS / APPLE)
======================================================
FRANÇAIS
======================================================
Voici les étapes pour installer votre assistant culinaire intelligent CLAUS.IO sur Mac.

1. INSTALLATION DU LOGICIEL (DÉTOURNER GATEKEEPER)
   - Double-cliquez sur le fichier téléchargé \`CLAUS.IO.dmg\`.
   - Dans la fenêtre qui s'ouvre, glissez l'icône de l'application "CLAUS.IO" vers le dossier "Applications".
   - Allez dans votre dossier "Applications" et lancez CLAUS.IO.
   - ⚠️ ALERTE SÉCURITÉ ⚠️
     Le Mac vous dira probablement : "Impossible d'ouvrir CLAUS.IO car le développeur ne peut pas être vérifié".
     -> Cliquez sur "Annuler" ou "OK".
     -> Allez dans le menu Pomme en haut à gauche > **Réglages Système** (ou Préférences Système) > **Confidentialité et sécurité**.
     -> Descendez jusqu'à la section Sécurité, vous verrez un message indiquant que CLAUS.IO a été bloqué. Cliquez sur le bouton **"Ouvrir quand même"** et entrez votre mot de passe Mac.
     (Astuce rapide : Faites un Clic-Droit sur l'application CLAUS.IO et cliquez sur "Ouvrir", puis confirmez).

2. INSTALLATION DU "CERVEAU" IA (OLLAMA)
   - Ollama est une plateforme sécurisée qui fait tourner des modèles d'IA localement sur votre ordinateur, garantissant la confidentialité totale de vos données.
   - Téléchargez et installez Ollama : https://ollama.com/download/mac
   - Une fois installé, téléchargez un modèle IA. Nous recommandons \`llama3.2:11b\` (parfait pour la vision et les tâches complexes), ou adaptez selon la puissance de votre ordinateur.
   - Dans le logiciel CLAUS.IO, allez dans "PARAMÈTRES" et cliquez sur "Tester Connexion".

3. ACTIVATION DE LA LICENCE
   - Allez dans l'onglet "PARAMÈTRES".
   - Notez le "Machine ID" affiché (ex: MAC-A2C1-...).
   - Envoyez-le à votre administrateur pour recevoir votre clé.
   - Entrez la clé et cliquez sur "Activer".

4. ACCÈS SMARTPHONE (WIFI)
   - Connectez votre smartphone au *MÊME* réseau Wi-Fi que votre Mac.
   - Dans les paramètres de CLAUS.IO, scannez le QR Code apparaissant à l'écran.

5. SAUVEGARDE (TRÈS IMPORTANT)
   - Ne désinstallez jamais sans copier le fichier \`agent_culinaire.db\` et le dossier \`uploads\` !

======================================================
ENGLISH
======================================================
Here are the steps to install your intelligent culinary assistant CLAUS.IO on Mac.

1. SOFTWARE INSTALLATION (BYPASSING GATEKEEPER)
   - Double-click on the downloaded file \`CLAUS.IO.dmg\`.
   - In the window that opens, drag the "CLAUS.IO" app icon into the "Applications" folder.
   - Go to your "Applications" folder and launch CLAUS.IO.
   - ⚠️ SECURITY ALERT ⚠️
     The Mac will likely say: "CLAUS.IO cannot be opened because the developer cannot be verified".
     -> Click "Cancel" or "OK".
     -> Go to the Apple menu (top left) > **System Settings** (or System Preferences) > **Privacy & Security**.
     -> Scroll down to the Security section, you will see a message indicating CLAUS.IO was blocked. Click the **"Open Anyway"** button and enter your Mac password.
     (Quick tip: Alternatively, Right-Click the CLAUS.IO application, click "Open", then confirm).

2. AI "BRAIN" INSTALLATION (OLLAMA)
   - Ollama is a secure platform that runs AI models locally on your computer, ensuring absolute privacy for your data.
   - Download and install Ollama: https://ollama.com/download/mac
   - Once installed, download an AI model. We recommend \`llama3.2:11b\` (perfect for vision and complex tasks), or choose according to your computer's performance.
   - Inside CLAUS.IO, go to "SETTINGS" and click on "Test Connection".

3. LICENSE ACTIVATION
   - Go to the "SETTINGS" tab.
   - Note down the displayed "Machine ID" (e.g., MAC-A2C1-...).
   - Send it to your administrator to receive your key.
   - Input the key and click "Activate".

4. SMARTPHONE ACCESS (WIFI)
   - Connect your smartphone to the *SAME* Wi-Fi network as your Mac.
   - In CLAUS.IO settings, scan the on-screen QR Code.

5. BACKUP (VERY IMPORTANT)
   - Never uninstall without copying the \`agent_culinaire.db\` file and the \`uploads\` folder!

======================================================
ESPAÑOL
======================================================
Aquí están los pasos para instalar su asistente culinario inteligente CLAUS.IO en Mac.

1. INSTALACIÓN DEL SOFTWARE (EVITAR GATEKEEPER)
   - Haga doble clic en el archivo descargado \`CLAUS.IO.dmg\`.
   - En la ventana que se abre, arrastre el icono de la aplicación "CLAUS.IO" a la carpeta "Aplicaciones".
   - Vaya a su carpeta de "Aplicaciones" e inicie CLAUS.IO.
   - ⚠️ ALERTA DE SEGURIDAD ⚠️
     El Mac probablemente dirá: "No se puede abrir CLAUS.IO porque el desarrollador no puede ser verificado".
     -> Haga clic en "Cancelar" o "Aceptar".
     -> Vaya al menú de Apple (arriba a la izquierda) > **Ajustes del Sistema** (o Preferencias del Sistema) > **Privacidad y Seguridad**.
     -> Desplácese hacia abajo hasta la sección de Seguridad, verá un mensaje indicando que CLAUS.IO fue bloqueado. Haga clic en el botón **"Abrir de todos modos"** e introduzca la contraseña de su Mac.
     (Consejo rápido: como alternativa, haga clic con el Botón Derecho en la aplicación CLAUS.IO, seleccione "Abrir", y luego confirme).

2. INSTALACIÓN DEL "CEREBRO" IA (OLLAMA)
   - Ollama es una plataforma segura que ejecuta modelos de IA localmente en su ordenador, garantizando la privacidad absoluta de sus datos.
   - Descargue e instale Ollama: https://ollama.com/download/mac
   - Una vez instalado, descargue un modelo IA. Recomendamos \`llama3.2:11b\` (perfecto para visión y tareas complejas), o adapte según la potencia de su ordenador.
   - Dentro del software CLAUS.IO, vaya a "AJUSTES" y haga clic en "Probar Conexión".

3. ACTIVACIÓN DE LA LICENCIA
   - Vaya a la pestaña "AJUSTES".
   - Anote el "ID de Máquina" mostrado (ej: MAC-A2C1-...).
   - Envíelo a su administrador para recibir su clave.
   - Ingrese la clave y haga clic en "Activar".

4. ACCESO DESDE SMARTPHONE (WIFI)
   - Conecte su smartphone a la *MISMA* red Wi-Fi que su Mac.
   - En la configuración de CLAUS.IO, escanee el código QR que se muestra en la pantalla.

5. COPIA DE SEGURIDAD (MUY IMPORTANTE)
   - ¡Nunca desinstale sin antes copiar el archivo \`agent_culinaire.db\` y la carpeta \`uploads\`!

======================================================
ITALIANO
======================================================
Ecco i passaggi per installare il tuo assistente culinario intelligente CLAUS.IO su Mac.

1. INSTALLAZIONE DEL SOFTWARE (AGGIRARE GATEKEEPER)
   - Fai doppio clic sul file scaricato \`CLAUS.IO.dmg\`.
   - Nella finestra che si apre, trascina l'icona dell'app "CLAUS.IO" nella cartella "Applicazioni".
   - Vai nella cartella "Applicazioni" e avvia CLAUS.IO.
   - ⚠️ AVVISO DI SICUREZZA ⚠️
     Il Mac dirà probabilmente: "Non è possibile aprire CLAUS.IO poiché lo sviluppatore non può essere verificato".
     -> Fai clic su "Annulla" o "OK".
     -> Vai sul menu Apple (in alto a sinistra) > **Impostazioni di Sistema** (o Preferenze di Sistema) > **Privacy e Sicurezza**.
     -> Scorri verso il basso fino alla sezione Sicurezza, vedrai un messaggio che indica che CLAUS.IO è stato bloccato. Clicca sul pulsante **"Apri comunque"** e inserisci la password del tuo Mac.
     (Suggerimento veloce: In alternativa, fai un Clic-Destro sull'applicazione CLAUS.IO, clicca "Apri", quindi conferma).

2. INSTALLAZIONE DEL "CERVELLO" IA (OLLAMA)
   - Ollama è una piattaforma sicura che esegue modelli di IA localmente sul tuo computer, garantendo la privacy totale dei tuoi dati.
   - Scarica e installa Ollama: https://ollama.com/download/mac
   - Una volta installato, scarica un modello IA. Consigliamo \`llama3.2:11b\` (perfetto per la visione e compiti complessi), oppure adatta in base alla potenza del tuo computer.
   - All'interno di CLAUS.IO, vai in "IMPOSTAZIONI" e clicca su "Test Connessione".

3. ATTIVAZIONE DELLA LICENZA
   - Vai alla scheda "IMPOSTAZIONI".
   - Annota il "Machine ID" visualizzato (es. MAC-A2C1-...).
   - Invialo al tuo amministratore per ricevere la tua chiave.
   - Inserisci la chiave e fai clic su "Attiva".

4. ACCESSO DA SMARTPHONE (WIFI)
   - Collega il tuo smartphone alla *STESSA* rete Wi-Fi del tuo Mac.
   - Nelle impostazioni di CLAUS.IO, scansiona il QR Code sullo schermo.

5. BACKUP (MOLTO IMPORTANTE)
   - Non disinstallare mai senza prima aver copiato il file \`agent_culinaire.db\` e la cartella \`uploads\`!

======================================================
DEUTSCH
======================================================
Hier sind die Schritte zur Installation Ihres intelligenten Küchenassistenten CLAUS.IO auf dem Mac.

1. SOFTWAREINSTALLATION (UMGEHUNG VON GATEKEEPER)
   - Doppelklicken Sie auf die heruntergeladene Datei \`CLAUS.IO.dmg\`.
   - Ziehen Sie in dem sich öffnenden Fenster das App-Symbol "CLAUS.IO" in den Ordner "Programme".
   - Gehen Sie in Ihren Ordner "Programme" und starten Sie CLAUS.IO.
   - ⚠️ SICHERHEITSWARNUNG ⚠️
     Der Mac wird wahrscheinlich sagen: "CLAUS.IO kann nicht geöffnet werden, da der Entwickler nicht verifiziert werden kann".
     -> Klicken Sie auf "Abbrechen" oder "OK".
     -> Gehen Sie in das Apple-Menü (oben links) > **Systemeinstellungen** > **Datenschutz & Sicherheit**.
     -> Scrollen Sie zum Abschnitt Sicherheit. Sie sehen eine Meldung, dass CLAUS.IO blockiert wurde. Klicken Sie auf den Button **"Dennoch öffnen"** und geben Sie Ihr Mac-Passwort ein.
     (Kurztipp: Alternativ machen Sie einen Rechtsklick auf die CLAUS.IO-Anwendung, wählen "Öffnen" und bestätigen dann).

2. INSTALLATION DES KI-"GEHIRNS" (OLLAMA)
   - Ollama ist eine sichere Plattform, die KI-Modelle lokal auf Ihrem Computer ausführt und absolute Privatsphäre Ihrer Daten gewährleistet.
   - Laden Sie Ollama herunter und installieren Sie es: https://ollama.com/download/mac
   - Sobald installiert, laden Sie ein KI-Modell herunter. Wir empfehlen \`llama3.2:11b\` (perfekt für Vision und komplexe Aufgaben) oder passen Sie dies je nach Leistungsfähigkeit Ihres Computers an.
   - Gehen Sie in der CLAUS.IO-Software auf "EINSTELLUNGEN" und klicken Sie auf "Verbindung testen".

3. LIZENZAKTIVIERUNG
   - Gehen Sie auf den Tab "EINSTELLUNGEN".
   - Notieren Sie die angezeigte "Machine ID" (z.B. MAC-A2C1-...).
   - Senden Sie diese an Ihren Administrator, um Ihren Schlüssel zu erhalten.
   - Geben Sie den Schlüssel ein und klicken Sie auf "Aktivieren".

4. SMARTPHONE-ZUGANG (WLAN)
   - Verbinden Sie Ihr Smartphone mit dem *SELBEN* WLAN-Netzwerk wie Ihren Mac.
   - Scannen Sie in den CLAUS.IO-Einstellungen den QR-Code auf dem Bildschirm.

5. BACKUP (SEHR WICHTIG)
   - Deinstallieren Sie niemals, ohne die Datei \`agent_culinaire.db\` und den Ordner \`uploads\` vorher zu kopieren!
`;

fs.writeFileSync('NOTICE_INSTALLATION_WINDOWS.txt', WINDOWS_TXT, 'utf8');
fs.writeFileSync('NOTICE_INSTALLATION_LINUX.txt', LINUX_TXT, 'utf8');
fs.writeFileSync('NOTICE_INSTALLATION_MACOS.txt', MACOS_TXT, 'utf8');
console.log('Installation documents updated successfully!');
