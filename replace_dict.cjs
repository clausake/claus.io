const fs = require('fs');

const dictCode = `const dict = {
  fr: {
    lang: "Français",
    title: "Guide Utilisateur Pratique",
    sub: "Le Compagnon du Chef",
    
    sec1: "1. Introduction : Votre Assistant Culinaire Autonome",
    p1: "Bienvenue sur CLAUS.IO, un véritable \\"Operating System\\" conçu par des restaurateurs pour des restaurateurs. Plus qu'un simple logiciel, c'est votre second de cuisine numérique.",
    p1_a: "<b>Autonomie Totale et Flexibilité Matérielle :</b> Le système a été conçu pour être robuste. Même si votre ordinateur est ancien ou peu puissant, le cœur du système reste pleinement fonctionnel.",
    p1_b: "<b>100% Manuel ou Assisté par IA :</b> Le logiciel est totalement prévu pour une utilisation classique sans Intelligence Artificielle. Le remplissage de vos fiches et produits se fait manuellement via une interface ultra-rapide et ergonomique. Quel que soit votre ordinateur, vous profitez de toute notre suite d'outils, sans aucune restriction. Que vous choisissiez l'automatisation IA ou la gestion manuelle, une chose ne change pas : vous gardez le contrôle absolu sur votre système.",
    p1_c: "<b>Sécurité et Confidentialité (Données Locales) :</b> Vos marges, vos recettes, les données de vos employés vous appartiennent. Contrairement aux solutions Cloud 100% internet, votre base de données CLAUS.IO est locale. Vos données sont chez VOUS, assurant un niveau de sécurité et de discrétion maximal.",
    
    sec2: "2. Les Outils Transversaux : Smartphone et Importation",
    p2: "<b>Le Mode Smartphone (QR Code) 📱</b><br>Votre ordinateur affiche en bas du menu principal un Flashcode (QR Code) de connexion. Scannez-le simplement avec l'appareil photo de votre téléphone (tout en étant sur le même réseau WiFi). Votre téléphone devient alors la télécommande et le scanner de votre logiciel.<ul><li>Idéal pour aller faire ses inventaires en chambre froide sans transporter l'ordinateur.</li><li>Idéal pour prendre une photo rapidement depuis votre poste.</li></ul>",
    p2_b: "<b>Le Scannage des Documents et Vérification 📄</b><br>Lorsque vous déposez ou prenez en photo un document administratif (facture, livraison, étiquette réglementaire), le système vous permet :<ul><li><b>Soit un Téléversement rapide (Brouillon) :</b> la photo est simplement sauvegardée et stockée en sécurité sans fioritures.</li><li><b>Soit un pré-remplissage via IA :</b> l'outil lit votre document pour vous faire gagner du temps. Mais la règle est stricte : l'humain valide toujours. L'écran vous soumettra toujours le texte vérifié pour que vous puissiez le corriger ou l'accepter. Vous gardez la main totale et évitez les erreurs fatales dans les commandes ou les prix.</li></ul>",
    
    sec3: "3. Onglets du Logiciel (Modules) et Connexions",
    p3: "Les onglets de CLAUS.IO ne travaillent pas chacun dans leur coin : ils sont interconnectés pour éviter les doubles saisies et optimiser votre productivité.",
    
    modules: [
      { i: "📊", t: "1. Tableau de Bord (Dashboard)", d: "<b>Votre tour de contrôle.</b> Vous allumez CLAUS.IO le matin et il vous donne instantanément l'état de santé de la cuisine : coût de matière récent, distribution graphique de vos stocks (Viandes, Crémerie...). En un coup d'œil, vous savez où vous en êtes."},
      { i: "📦", t: "2. Inventaire & Stocks", d: "<b>La fondation de votre restaurant.</b><br><i>Fonctionnement :</i> Ajout manuel des produits, suivi des valeurs, gestion de l'économat. Alertes personnalisées.<br><i>La Connexion :</i> Dès qu'un produit est en alerte, l'onglet Achats clignote, et l'impact sur vos Recettes est immédiat."},
      { i: "🍳", t: "3. Recettes (Fiches Techniques)", d: "<b>Outil de création technique.</b> Vous y détaillez la méthode de réalisation et les proportions.<br><i>La Connexion :</i> Puise les ingrédients depuis l'Inventaire pour calculer instantanément le coût de revient (Food Cost)." },
      { i: "📖", t: "4. Menus", d: "<b>Modélisez vos cartes</b>, vos suggestions du jour ou vos formules.<br><i>La Connexion :</i> Il regroupe vos Recettes et vous donne la rentabilité mathématique et totale totale du Menu." },
      { i: "🛒", t: "5. Achats", d: "<b>Exportation et création de bons de commande fournisseurs.</b><br><i>La Connexion :</i> Magique ! Il calcule automatiquement vos besoins d'après les manques perçus dans les Stocks. Vous vérifiez et validez." },
      { i: "🔪", t: "6. Production (Laboratoire)", d: "<b>Organise le travail de préparation.</b> Il indique ce qui doit être épluché, taillé ou cuit selon ce qu'il y a à servir. Il transforme les fiches techniques en tâches." },
      { i: "🧑‍🤝‍🧑", t: "7. Personnel (Planning)", d: "<b>Gestion RH simplifiée.</b> Création de vos équipiers, de leurs rôles et mise en place de la grille horaire. Édition pour impression en un clic." },
      { i: "🧼", t: "8. HACCP (Hygiène et Qualité)", d: "<b>Fini les feuilles volantes.</b> Vous gérez la traçabilité manuellement.<br><i>Traçabilité :</i> Notez les températures, nettoyages, et importez les photos DLC via PC ou smartphone pour être inattaquable." },
      { i: "♻️", t: "9. Anti-Gaspi (Pertes)", d: "<b>Gérez les retours et pertes:</b> Chaque produit jeté est entré manuellement. Le système déduit ces pertes de l'Inventaire et quantifie le coût numériquement." },
      { i: "📄", t: "10. Documents", d: "<b>Votre classeur numérique.</b> Vous y envoyez en vrac ou triés tous les documents qui entrent dans le restaurant." },
      { i: "💬", t: "11. Assistant Chat (IA Optionnelle)", d: "<b>Collègue de réflexion.</b> Manque d'inspiration d'automne ? Accord vin/poisson ? L'assistant est là pour des réponses culinaires." },
      { i: "🤖", t: "12. Pilote de Robots", d: "<b>Fonctionnement :</b> Interface d'anticipation pour interagir avec le matériel et les automates de cuisson connectés." },
      { i: "⚙️", t: "13. Paramètres (Settings)", d: "<b>Arrière-boutique :</b> Gestion de clés systèmes, réglages généraux, licences et langues." }
    ]
  },
  en: {
    lang: "English",
    title: "Practical User Guide",
    sub: "The Chef's Companion",
    
    sec1: "1. Introduction: Your Autonomous Culinary Assistant",
    p1: "Welcome to CLAUS.IO, a true 'Operating System' designed by restaurateurs for restaurateurs. More than simple software, it is your digital sous-chef.",
    p1_a: "<b>Total Autonomy and Hardware Flexibility:</b> The system was designed to be robust. Even if your computer is older or less powerful, the core system remains fully functional.",
    p1_b: "<b>100% Manual or AI Assisted:</b> The software is fully prepared for classic use without Artificial Intelligence. Filling your records and products is done manually via an ultra-fast and ergonomic interface. Whatever your computer, you enjoy our entire suite of tools without restriction. Whether you choose AI automation or manual management, one thing does not change: you keep absolute control over your system.",
    p1_c: "<b>Security & Privacy (Local Data):</b> Your margins, your recipes, your employee data belong to you. Unlike 100% internet Cloud solutions, your CLAUS.IO database is local. Your data stays with YOU, ensuring maximum security and discretion.",
    
    sec2: "2. Cross-tools: Smartphone and Importation",
    p2: "<b>Smartphone Mode (QR Code) 📱</b><br>Your computer displays a QR Code connection at the bottom of the main menu. Simply scan it with your phone's camera (while on the same WiFi network). Your phone then becomes the remote control and scanner for your software.<ul><li>Ideal for doing inventory in the cold room without carrying the computer.</li><li>Ideal for quickly taking a photo from your station.</li></ul>",
    p2_b: "<b>Document Scanning and Verification 📄</b><br>When you upload or photograph an administrative document (invoice, delivery, regulatory label), the system allows:<ul><li><b>Fast Upload (Draft):</b> the photo is simply saved and securely stored without frills.</li><li><b>AI Pre-fill:</b> the tool reads your document to save you time. But the rule is strict: the human always validates. The screen will always submit the verified text for you to correct or accept. You keep total control and avoid fatal errors in orders or prices.</li></ul>",
    
    sec3: "3. Software Tabs (Modules) and Connections",
    p3: "The tabs in CLAUS.IO do not work in isolation: they are interconnected to avoid double entry and optimize your productivity.",
    
    modules: [
      { i: "📊", t: "1. Dashboard", d: "<b>Your control tower.</b> You turn on CLAUS.IO in the morning and it instantly gives you the health status of the kitchen: recent material cost, graphic distribution of stocks... At a glance, you know where you stand."},
      { i: "📦", t: "2. Inventory & Stocks", d: "<b>The foundation of your restaurant.</b><br><i>How it works:</i> Manual addition of products, tracking, storeroom management.<br><i>Connection:</i> As soon as a product triggers its alert threshold, Purchases tab flashes, and the impact on Recipes is immediate."},
      { i: "🍳", t: "3. Recipes (Specs)", d: "<b>Technical creation.</b> You detail the method and proportions for your teams.<br><i>Connection:</i> By integrating ingredients from Inventory, it instantly calculates the absolute Food Cost." },
      { i: "📖", t: "4. Menus", d: "<b>Model your cards,</b> daily specials or formulas.<br><i>Connection:</i> Groups your Recipes and gives you the exact total profitability of the Menu you are designing." },
      { i: "🛒", t: "5. Purchasing", d: "<b>Export purchase orders.</b><br><i>Connection:</i> Magic! It automatically calculates needs based on perceived shortages in Stocks. You verify, adjust manually, and validate." },
      { i: "🔪", t: "6. Production", d: "<b>Organizes prep work.</b> Indicates what must be peeled, cut or cooked according to what is to be served. Transforms specs into active tasks." },
      { i: "🧑‍🤝‍🧑", t: "7. Staff Planning", d: "<b>Simplified HR.</b> Creation of your team members, roles, and weekly schedule setting. Generate clear printouts in one click." },
      { i: "🧼", t: "8. HACCP (Hygiene)", d: "<b>No more greasy papers.</b> Manage your history manually.<br><i>Traceability:</i> Log temperatures, cleaning, and import photos of labels via smartphone to be unassailable." },
      { i: "♻️", t: "9. Anti-Waste (Losses)", d: "<b>Manage thrown/returned items.</b> Allows immediate deduction of losses from Inventory to keep stock accurate and quantify lost money." },
      { i: "📄", t: "10. Documents", d: "<b>Digital binder.</b> Send all documents entering the restaurant here securely." },
      { i: "💬", t: "11. Assistant Chat (Optional AI)", d: "<b>Culinary sounding board.</b> Need fall inspiration or wine pairings? The specialized assistant is there for sharp culinary answers." },
      { i: "🤖", t: "12. Robot Pilot", d: "<b>Anticipation interface</b> to interact with connected cooking machines or prep automations." },
      { i: "⚙️", t: "13. Settings", d: "<b>Back-office:</b> Management of system keys, general settings, licenses and languages." }
    ]
  },
  es: {
    lang: "Español",
    title: "Guía Práctica del Usuario",
    sub: "El Compañero del Chef",
    
    sec1: "1. Introducción: Su Asistente Culinario Autónomo",
    p1: "Bienvenido a CLAUS.IO, un verdadero 'Sistema Operativo' diseñado por restauradores para restauradores. Más que un simple software, es su segundo de cocina digital.",
    p1_a: "<b>Autonomía Total y Flexibilidad de Hardware:</b> El sistema ha sido diseñado para ser robusto. Incluso si su ordenador es antiguo o poco potente, el núcleo del sistema sigue siendo plenamente funcional.",
    p1_b: "<b>100% Manual o Asistido por IA:</b> El software está totalmente preparado para un uso clásico sin Inteligencia Artificial. El registro de sus productos y fichas se realiza manualmente a través de una interfaz ultrarrápida. Sea cual sea su ordenador, disfruta de toda nuestra suite de herramientas sin restricciones. Ya sea que elija la automatización mediante IA o la gestión manual, una cosa no cambia: mantiene el control absoluto sobre su sistema.",
    p1_c: "<b>Seguridad y Privacidad (Datos Locales):</b> Sus márgenes, sus recetas, los datos de sus empleados le pertenecen. A diferencia de las soluciones Cloud 100% en internet, su base de datos CLAUS.IO es local. Sus datos permanecen con USTED, garantizando máxima seguridad y discreción.",
    
    sec2: "2. Las Herramientas Transversales: Smartphone e Importación",
    p2: "<b>El Modo Smartphone (Código QR) 📱</b><br>Su ordenador muestra en la parte inferior del menú principal un Código QR de conexión. Simplemente escanéelo con la cámara de su teléfono (mientras esté en la misma red WiFi). Su teléfono se convierte entonces en el mando a distancia y escáner de su software.<ul><li>Ideal para realizar el inventario en la cámara frigorífica sin llevar el ordenador.</li><li>Ideal para tomar una foto rápidamente desde su estación.</li></ul>",
    p2_b: "<b>El Escaneo de Documentos y Verificación 📄</b><br>Cuando sube o fotografía un documento administrativo (factura, albarán, etiqueta), el sistema le permite:<ul><li><b>Subida rápida (Borrador):</b> la foto se guarda y almacena de forma segura directamente.</li><li><b>Prellenado mediante IA:</b> la herramienta lee su documento para ahorrarle tiempo. Pero la regla es estricta: el humano siempre valida. La pantalla siempre le mostrará el texto verificado para que pueda corregirlo o aceptarlo. Mantiene el control total y evita errores en pedidos o precios.</li></ul>",
    
    sec3: "3. Pestañas del Software (Módulos) y Conexiones",
    p3: "Las pestañas de CLAUS.IO no trabajan de forma aislada: están interconectadas para evitar la doble entrada y optimizar su productividad.",
    
    modules: [
      { i: "📊", t: "1. Panel de Control (Dashboard)", d: "<b>Su torre de control.</b> Enciende CLAUS.IO por la mañana y al instante le muestra el estado de salud de la cocina: costo reciente del material, distribución gráfica de sus existencias... De un vistazo, sabe dónde se encuentra."},
      { i: "📦", t: "2. Inventario y Existencias", d: "<b>La base de su restaurante.</b><br><i>Funcionamiento:</i> Añadido manual de productos, seguimiento, gestión del almacén. Alertas de falta.<br><i>La Conexión:</i> En cuanto un producto alcanza su umbral de alerta, la pestaña de Compras parpadea, y el impacto en sus Recetas es inmediato."},
      { i: "🍳", t: "3. Recetas (Fichas Técnicas)", d: "<b>Herramienta de creación técnica.</b> Usted detalla el método de preparación y proporciones para su equipo.<br><i>La Conexión:</i> Integrando ingredientes desde el Inventario, calcula instantáneamente el costo absoluto (Food Cost)." },
      { i: "📖", t: "4. Menus", d: "<b>Modele sus cartas,</b> sus sugerencias del día o sus fórmulas.<br><i>La Conexión:</i> Agrupa sus Recetas y le da la rentabilidad exacta y total del Menú que está diseñando." },
      { i: "🛒", t: "5. Compras", d: "<b>Exportación y creación de órdenes de compra.</b><br><i>La Conexión:</i> ¡Mágico! Calcula automáticamente sus necesidades según las carencias en Stock. Usted verifica, ajusta manualmente y valida." },
      { i: "🔪", t: "6. Producción (Laboratorio)", d: "<b>Organiza el trabajo de preparación.</b> Indica qué se debe pelar, cortar o cocinar según lo que se va a servir. Transforma las fichas en tareas." },
      { i: "🧑‍🤝‍🧑", t: "7. Personal (Planificación)", d: "<b>RRHH simplificado.</b> Creación de los miembros de su equipo, sus roles y configuración del horario. Imprima de manera clara en un clic." },
      { i: "🧼", t: "8. APPCC (Higiene)", d: "<b>Se acabaron los papeles sucios.</b> Gestione su trazabilidad manualmente.<br><i>Trazabilidad:</i> Registre temperaturas, limpieza, e importe fotos de etiquetas vía smartphone para ser inatacable." },
      { i: "♻️", t: "9. Antidesperdicio (Pérdidas)", d: "<b>Gestione artículos tirados/devueltos.</b> Permite la deducción inmediata de pérdidas del Inventario para cuantificar el dinero perdido." },
      { i: "📄", t: "10. Documentos", d: "<b>Su carpeta digital.</b> Envíe aquí, de forma segura, todos los documentos que entran al restaurante." },
      { i: "💬", t: "11. Asistente Chat (IA Opcional)", d: "<b>Colega de reflexión.</b> ¿Falta de inspiración otoñal? ¿Maridajes? El asistente especializado está aquí para respuestas culinarias." },
      { i: "🤖", t: "12. Piloto de Robots", d: "<b>Interfaz de anticipación:</b> para interactuar con máquinas de cocción conectadas o autómatas." },
      { i: "⚙️", t: "13. Ajustes (Settings)", d: "<b>Back-office:</b> Gestión de las claves del sistema, parámetros generales, licencias e idiomas." }
    ]
  },
  de: {
    lang: "Deutsch",
    title: "Praktisches Benutzerhandbuch",
    sub: "Der Begleiter des Küchenchefs",
    
    sec1: "1. Einleitung: Ihr autonomer Küchenassistent",
    p1: "Willkommen bei CLAUS.IO, einem echten 'Betriebssystem', das von Gastronomen für Gastronomen entwickelt wurde. Mehr als nur eine einfache Software – es ist Ihr digitaler Sous-Chef.",
    p1_a: "<b>Vollständige Autonomie und Hardware-Flexibilität:</b> Das System wurde so konzipiert, dass es robust ist. Auch wenn Ihr Computer älter oder weniger leistungsstark ist, bleibt das Kernsystem voll funktionsfähig.",
    p1_b: "<b>100% Manuell oder mit KI-Unterstützung:</b> Die Software ist vollständig für die klassische Nutzung ohne Künstliche Intelligenz vorbereitet. Das Ausfüllen Ihrer Artikel und Produkte erfolgt manuell über eine ultraschnelle Schnittstelle. Unabhängig von Ihrem Computer nutzen Sie unsere gesamte Tool-Suite ohne Einschränkungen. Egal, ob Sie KI-Automatisierung oder manuelle Verwaltung wählen, eines ändert sich nicht: Sie behalten die absolute Kontrolle über Ihr System.",
    p1_c: "<b>Sicherheit & Privatsphäre (Lokale Daten):</b> Ihre Margen, Ihre Rezepte, Ihre Mitarbeiterdaten gehören Ihnen. Im Gegensatz zu 100% cloudbasierten Internetlösungen ist Ihre CLAUS.IO-Datenbank lokal. Ihre Daten bleiben bei IHNEN und garantieren maximale Sicherheit und Diskretion.",
    
    sec2: "2. Übergreifende Tools: Smartphone und Import",
    p2: "<b>Smartphone-Modus (QR Code) 📱</b><br>Ihr Computer zeigt unten im Hauptmenü einen QR-Code zur Verbindung an. Scannen Sie diesen einfach mit der Kamera Ihres Telefons (im selben WLAN). Ihr Telefon wird dann zur Fernbedienung und zum Scanner für Ihre Software.<ul><li>Ideal für das Inventar im Kühlhaus, ohne den Computer mitnehmen zu müssen.</li><li>Ideal, um schnell ein Foto von Ihrem Arbeitsplatz aus zu machen.</li></ul>",
    p2_b: "<b>Dokumentenscan und -prüfung 📄</b><br>Wenn Sie ein Verwaltungsdokument (Rechnung, Lieferschein, Etikett) hochladen oder fotografieren, bietet das System folgendes:<ul><li><b>Schneller Upload (Entwurf):</b> Das Foto wird einfach sicher und ohne Schnickschnack gespeichert.</li><li><b>KI-Vorausfüllung:</b> Das Tool liest Ihr Dokument, um Ihnen Zeit zu sparen. Aber die Regel ist streng: Der Mensch bestätigt immer. Der Bildschirm zeigt den überprüften Text an, den Sie korrigieren oder akzeptieren können. Sie behalten die Kontrolle.</li></ul>",
    
    sec3: "3. Software-Tabs (Module) und Verbindungen",
    p3: "Die Tabs in CLAUS.IO arbeiten nicht isoliert: Sie sind miteinander vernetzt, um doppelte Eingaben zu vermeiden und Ihre Produktivität zu optimieren.",
    
    modules: [
      { i: "📊", t: "1. Dashboard", d: "<b>Ihre Kommandozentrale.</b> Sie schalten CLAUS.IO morgens ein und es zeigt Ihnen sofort den Gesundheitszustand der Küche: aktuelle Materialkosten, Bestandsverteilung... Auf einen Blick wissen Sie, wo Sie stehen."},
      { i: "📦", t: "2. Inventar & Bestände", d: "<b>Das Fundament Ihres Restaurants.</b><br><i>Funktionsweise:</i> Manuelles Hinzufügen von Produkten, Nachverfolgung, Lagerverwaltung.<br><i>Die Verbindung:</i> Sobald ein Produkt seine Warnschwelle erreicht, blinkt der Tab Einkäufe, und die Auswirkung auf Ihre Rezepte ist sofort sichtbar."},
      { i: "🍳", t: "3. Rezepte", d: "<b>Technische Erstellung.</b> Sie detaillieren die Methode und die Proportionen.<br><i>Die Verbindung:</i> Durch die Integration von Zutaten aus dem Inventar werden sofort die absoluten Materialkosten (Food Cost) berechnet." },
      { i: "📖", t: "4. Menüs", d: "<b>Modellieren Sie Ihre Karten,</b> Tagesempfehlungen oder Menüfolgen.<br><i>Die Verbindung:</i> Gruppiert Ihre Rezepte und zeigt die exakte Gesamttabilität des Menüs, das Sie entwerfen." },
      { i: "🛒", t: "5. Einkauf", d: "<b>Bestellungen exportieren.</b><br><i>Die Verbindung:</i> Magisch! Berechnet automatisch den Bedarf anhand von Fehlmengen im Lager. Sie prüfen, passen manuell an und validieren." },
      { i: "🔪", t: "6. Produktion (Labor)", d: "<b>Organisiert Vorbereitungsaufgaben.</b> Zeigt an, was geschält, geschnitten oder gekocht werden muss. Verwandelt Spezifikationen in Aufgaben." },
      { i: "🧑‍🤝‍🧑", t: "7. Personal (Planung)", d: "<b>Vereinfachte HR.</b> Erstellung Ihrer Teammitglieder, Rollen und des Wochenplans. Ein-Klick-Ausdruck." },
      { i: "🧼", t: "8. HACCP (Hygiene)", d: "<b>Schreiben Sie keine Listen mehr von Hand.</b> Verwalten Sie Ihre Historie.<br><i>Rückverfolgbarkeit:</i> Notieren Sie Temperaturen und Reinigung, importieren Sie Fotos von Etiketten." },
      { i: "♻️", t: "9. Anti-Food-Waste", d: "<b>Verworfene / retournierte Artikel verwalten.</b> Abzug von Verlusten aus dem Inventar, um Bestände korrekt zu halten und Geldverluste zu quantifizieren." },
      { i: "📄", t: "10. Dokumente", d: "<b>Digitaler Ordner.</b> Senden Sie hier alle Dokumente, die in das Restaurant kommen, sicher ein." },
      { i: "💬", t: "11. Assistant Chat (KI Optional)", d: "<b>Kulinarischer Begleiter.</b> Fehlende Inspiration? Weinempfehlungen? Der Fachassistent ist für kulinarische Antworten da." },
      { i: "🤖", t: "12. Robotersteuerung", d: "<b>Antizipationsschnittstelle:</b>  Zur Interaktion mit angeschlossenen Kochmaschinen oder Automaten." },
      { i: "⚙️", t: "13. Einstellungen", d: "<b>Back-office:</b> Systemschlüssel, allgemeine Einstellungen, Lizenzen und Sprachen verwalten." }
    ]
  },
  it: {
    lang: "Italiano",
    title: "Guida Pratica dell'Utente",
    sub: "Il Compagno dello Chef",
    
    sec1: "1. Introduzione: L'Assistente Culinario Autonomo",
    p1: "Benvenuto in CLAUS.IO, un vero e proprio 'Sistema Operativo' progettato da ristoratori per ristoratori. Più che un semplice software, è il tuo sous-chef digitale.",
    p1_a: "<b>Autonomia Totale e Flessibilità Hardware:</b> Il sistema è stato progettato per essere robusto. Anche se il tuo computer è datato o meno potente, il sistema centrale rimane pienamente funzionale.",
    p1_b: "<b>100% Manuale o Assistito da IA:</b> Il software è completamente preparato per un classico utilizzo senza Intelligenza Artificiale. Il caricamento di prodotti e schede tecniche si effettua manualmente tramite un'interfaccia ultraveloce ed ergonomica. A prescindere dal PC, potrai godere di tutti i nostri strumenti senza restrizioni. Sia che tu scelga l'automazione dell'IA o la gestione manuale, una cosa non cambia: mantieni il controllo assoluto sul tuo sistema.",
    p1_c: "<b>Sicurezza e Privacy (Dati Locali):</b> I tuoi margini, le ricette o i dati dei dipendenti ti appartengono. Diversamente dalle soluzioni Cloud internet al 100%, il database CLAUS.IO è locale. I dati restano a TE, offrendo massima sicurezza e discrezione.",
    
    sec2: "2. Strumenti Trasversali: Smartphone e Importazione",
    p2: "<b>Modalità Smartphone (QR Code) 📱</b><br>Il computer visualizza un QR Code di scansione in basso nel menu principale. Scansionalo con la videocamera del telefono (su rete WiFi). Il tuo telefono diventa telecomando e scanner del software.<ul><li>Ideale per l’inventario in cella frigorifera senza portare il computer.</li><li>Ideale per scattare foto veloci dalla propria postazione.</li></ul>",
    p2_b: "<b>Scansione Documenti e Verifica 📄</b><br>Quando carichi o fotografi un documento (fatture, consegne, etichette), il sistema permette:<ul><li><b>Caricamento veloce (Bozza):</b> l'immagine si salva e si conserva semplicemente e in sicurezza senza attese.</li><li><b>Pre-compilazione IA:</b> lo strumento legge il tuo documento per farti risparmiare tempo. La regola però è rigida: l'umano approva sempre. Lo schermo sottopone al tuo giudizio ogni testo letto per correggerlo o accettarlo, evitando errori su ordini o prezzi.</li></ul>",
    
    sec3: "3. Schede Software (Moduli) e Connessioni",
    p3: "Le schede in CLAUS.IO non funzionano in modo isolato: sono interconnesse per evitare doppi inserimenti ed ottimizzare la produttività.",
    
    modules: [
      { i: "📊", t: "1. Dashboard", d: "<b>Torre di controllo.</b> Accendi CLAUS.IO al mattino e lui ti mostra immediatamente lo stato di salute della cucina: costi reali del materiale, grafico distribuzione stock... Capisci dove si trova il locale con uno sguardo."},
      { i: "📦", t: "2. Inventario e Stock", d: "<b>La base del tuo ristorante.</b><br><i>Come funziona:</i> Aggiunta manuale materiali, monitoraggio, magazzino.<br><i>Connessione:</i> Appena l'articolo tocca la soglia d'allerta, gli Acquisti lampeggiano e l'effetto sulle Ricette è istantaneo."},
      { i: "🍳", t: "3. Ricette (Schede Tecniche)", d: "<b>Creazione Tecnica.</b> Metti tutto in dettaglio metodo e proporzioni per la squadra.<br><i>Connessione:</i> Integrando gli ingredienti, calcola all'istante e con assoluta precisione il Food Cost." },
      { i: "📖", t: "4. Menu", d: "<b>Costruisci i menu,</b> specials giornalieri o le combinazioni fisse.<br><i>Connessione:</i> Raggruppa tutte le tue Ricette e riporta matematicamente il vero e globale guadagno del menù progettato." },
      { i: "🛒", t: "5. Acquisti", d: "<b>Esporta in pdf fornitori.</b><br><i>Connessione:</i> Automatizza tutto il conteggio del bisogno tramite l'avviso automatico in Stock. Controlli, aggiusti manualmente, invii." },
      { i: "🔪", t: "6. Produzione", d: "<b>Organizza i turni prep.</b> Elenca quello che andrà tagliato, pulito, bollito per prepararsi al servizio e manda file precisi al team." },
      { i: "🧑‍🤝‍🧑", t: "7. Personale (Pianificazione)", d: "<b>HR semplificate.</b> Schedatura membri, inquadramento ruoli e costruzione schedula turni. PDF stampabili formattati per i dipendenti." },
      { i: "🧼", t: "8. HACCP (Igiene)", d: "<b>Stop a carta unta.</b> Segna i log fisicamente sul sistema.<br><i>Tracciabilità:</i> Gestisci frigo, pulizie e scatta le foto delle etichette (Lotto, Scadenza) dal telefono. Sarai intoccabile." },
      { i: "♻️", t: "9. Anti-Spreco (Scarti)", d: "<b>Gestione cadute e marci.</b> Deducendo il materiale scartato dal sistema Stock permetterà calcoli veritieri, conteggiando i soldi caduti o rotti preventivamente." },
      { i: "📄", t: "10. Documenti", d: "<b>Bolla faldone.</b> Manda senza indugio dentro tutto il carteceo ed estrattale all'occorrenza sicure ed indicizzate." },
      { i: "💬", t: "11. Assistente Chat (IA Opzionale)", d: "<b>Specchio creativo.</b> Suggerisce un menù particolare, abbinamenti di vini per autunno in anticipo. Risposte super gastronomiche su richesta." },
      { i: "🤖", t: "12. Robot Pilota", d: "<b>Interfaccia futuro</b> che comunica in protocolli coi macchinari intelligenti presenti al pass per le combinazioni e reazioni termiche." },
      { i: "⚙️", t: "13. Impostazioni", d: "<b>Retrobottega.</b> Mantiene al sicuro password API, sistemazione di rete e regole lingue e permessi generici della console." }
    ]
  }
};`;

let origCode = fs.readFileSync('build_pro_guide_exact.cjs', 'utf8');

// Replace everything between const dict = { and }; before let htmlContent
const startIdx = origCode.indexOf('const dict = {');
const endIdx = origCode.indexOf('};\n\nlet htmlContent =');

if (startIdx !== -1 && endIdx !== -1) {
  const newCode = origCode.substring(0, startIdx) + dictCode + origCode.substring(endIdx + 1);
  fs.writeFileSync('build_pro_guide_exact.cjs', newCode);
  console.log("Replaced dict successfully");
} else {
  console.error("Could not find dict boundary");
}
