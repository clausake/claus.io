// T3.2 : extrait de src/components/SettingsView.tsx (extraction pure, byte-exact).
// Génération du guide PDF (dictionnaire `guides` par langue + mise en page jsPDF).
// Le dictionnaire `guides` était un littéral SANS aucune dépendance au state/props
// (mesuré : 0 référence à settings/setState/handle/toast dans la plage). Le corps
// ne lisait que `lang` (ici passé en paramètre) + `guides` + jsPDF. Aucun octet de
// contenu (texte des guides, mise en page) n'est modifié.
import { jsPDF } from 'jspdf';

export function exporterGuidePDF(lang: string) {
    const doc = new jsPDF();

    const guides: Record<string, {
      fileName: string;
      title: string;
      subtitle: string;
      intro: string;
      sections: { title: string; content: string[] }[];
      footer: string;
    }> = {
      fr: {
        fileName: "Guide_Utilisateur_Agent_Culinaire_OS.pdf",
        title: "AGENT CULINAIRE OS - GUIDE D'UTILISATION",
        subtitle: "Système de Pilotage Culinaire Premium, Ingénierie des Menus & HACCP",
        intro: "Bienvenue dans l'interface de l'claus.io. Ce guide complet vous détaille les différentes rubriques et outils de l'application conçus en étroite synergie pour optimiser vos marges, faciliter votre approvisionnement et garantir la conformité réglementaire de votre établissement.",
        sections: [
          {
            title: "1. GESTION DE L'INVENTAIRE & STOCK EN TEMPS RÉEL",
            content: [
              "• Suivez et cataloguez vos ingrédients, matières premières et consommables.",
              "• Saisissez vos fournisseurs attitrés, prix unitaires d'achat et taux de rendement (%).",
              "• Importez en un clic vos catalogues d'ingrédients à partir de fichiers Excel ou CSV.",
              "• Utilisez les raccourcis d'ajout rapide pour fluidifier les opérations en plein service."
            ]
          },
          {
            title: "2. INGÉNIERIE ACTIVE DES MENUS & FICHES TECHNIQUES",
            content: [
              "• Générez des menus d'exception à l'aide de l'IA (Créative, Traditionnelle, Gastronomique).",
              "• Éditez les fiches techniques intégrales : ajustez ingrédients, grammages précis et étapes de préparation.",
              "• Modifiez directement les prix et les unités en temps réel dans les grilles éditables.",
              "• Vos coûts matière par portion et ratios de marge sont calculés de manière automatisée."
            ]
          },
          {
            title: "3. PLAN D'APPROVISIONNEMENT & COMMANDE ARCHITECTE",
            content: [
              "• Ajoutez les fiches techniques des recettes de votre choix dans le panier d'achats.",
              "• Saisissez le nombre de couverts prévus : les quantités requises sont consolidées à l'instant.",
              "• Génerez des listes de commandes claires, triées automatiquement par fournisseur référencé.",
              "• Exportez en un clic votre bon d'achat au format PDF ou CSV pour un envoi immédiat."
            ]
          },
          {
            title: "4. SÉCURITÉ ALIMENTAIRE - HACCP, HYGIÈNE & LOGS",
            content: [
              "• Enregistrez de façon structurée les températures relevées de vos enceintes froides.",
              "• Suivez le planning de désinfection et nettoyage récurrent par zones de travail.",
              "• Assurez une traçabilité rigoureuse via le journal des numéros de lots d'ingrédients reçus.",
              "• Renseignez de manière exhaustive la fiche des allergènes légaux pour chaque recette."
            ]
          },
          {
            title: "5. PLANNING D'ÉQUIPE ET COLLABORATION CUISINE",
            content: [
              "• Concevez et gérez l'organigramme de votre brigade (Chefs, Commis, Apprentis, Plongeurs).",
              "• Renseignez et visualisez la grille horaire hebdomadaire et assignez des postes précis.",
              "• Optimisez la productivité opérationnelle en coordonnant les horaires de production en cuisine."
            ]
          },
          {
            title: "6. EXTRACTION IA ET KIT D'EXEMPLES",
            content: [
              "• L'extraction IA d'un document ou d'une étiquette HACCP survit au changement d'onglet : le pré-remplissage vous attend à votre retour.",
              "• Une bannière globale affiche l'extraction en cours depuis n'importe quel onglet.",
              "• Sur une base vierge, un kit d'exemples est posé automatiquement : 1 élément en stock, 1 fiche en production, 1 document scanné, 1 doc HACCP.",
              "• Dans Réglages, la carte « Kit de démonstration » permet de le ressemer ou de l'effacer définitivement en un clic."
            ]
          },
          {
            title: "7. SAUVEGARDE ET REPRISE DES DONNÉES",
            content: [
              "• Dans Réglages, le bouton « Sauvegarder » télécharge une archive complète et vérifiée : la base (y compris les dernières écritures), vos réglages sans leurs secrets, vos documents importés et un manifeste de version. Réservé au compte maître.",
              "• Une copie automatique est prise au démarrage de l'application puis toutes les heures ; les cinq plus récentes sont conservées dans le dossier de sauvegardes.",
              "• Pour restaurer : fermez l'application, copiez les fichiers de l'archive dans le dossier de données (le chemin exact est affiché dans Réglages → Données), puis relancez. Copiez d'abord ce dossier tel quel avant de remplacer quoi que ce soit.",
              "• Après une réinstallation, l'application cherche une installation précédente sur le poste et vous propose de reprendre vos données ; vos données actuelles ne sont jamais écrasées."
            ]
          }
        ],
        footer: "claus.io - Solution de Pilotage Professionnel de Cuisine"
      },
      en: {
        fileName: "User_Guide_Agent_Culinaire_OS.pdf",
        title: "AGENT CULINAIRE OS - USER MANUAL",
        subtitle: "Premium Kitchen Management, Menu Engineering & HACCP System",
        intro: "Welcome to claus.io. This master guide describes how to navigate and make the most out of our comprehensive professional kitchen tools, designed in harmony to simplify operations, protect margins, streamline ordering, and ensure complete sanitary compliance.",
        sections: [
          {
            title: "1. REAL-TIME INVENTORY & INGREDIENT MANAGEMENT",
            content: [
              "• Catalog and track all raw ingredients, packaging, and culinary units.",
              "• Record supplier profiles, actual unit prices, and peeling yield values (%).",
              "• Bulk import your existing ingredient spreadsheets using clean Excel/CSV parsing.",
              "• Add quick products on the fly directly inside production grids without complex setups."
            ]
          },
          {
            title: "2. SMART MENU ENGINEERING & RECIPE SHEETS",
            content: [
              "• Spark culinary creativity using advanced generator models (Creative, Traditional, Gastronomic).",
              "• Customize fully-detailed recipe sheets: fine-tune names, grammage ratios, and cooking steps.",
              "• Modify raw prices, custom units, or ingredients seamlessly inside editable technical tables.",
              "• Auto-calculate single-portion ingredient costs, overhead percentages, and yield ratios."
            ]
          },
          {
            title: "3. SUPPLIER ORDERING & PROCUREMENT SCHEDULER",
            content: [
              "• Load recipe technical sheets directly into your command center (shopping cart).",
              "• Key in the actual guest counts to automatically scale and sum required product weights.",
              "• Produce beautiful purchase orders formatted, structured, and aggregated per vendor.",
              "• Export procurement lists to CSV tables or print-ready PDF files with one click."
            ]
          },
          {
            title: "4. REGULATORY HACCP & SANITARY COMPLIANCE LOGISTICS",
            content: [
              "• Track daily temperature logs across positive and negative refrigeration rooms.",
              "• Establish digital cleaning checklists and recurring sanitation duties across your facility.",
              "• Trace supply chains step-by-step with raw food batches, expiry alerts, and supplier lots.",
              "• Instantly configure allergen sheets across mandatory categories for guest protection."
            ]
          },
          {
            title: "5. STAFF SCHEDULING & TEAM LABOR PLANNERS",
            content: [
              "• Coordinate your kitchen team (Chefs, Sous-Chefs, Commis, Steward staff).",
              "• Lay out work grids, weekly shifts, hourly assignments, and core kitchen roles.",
              "• Optimize kitchen efficiency and control labor expenditures in sync with menu volume."
            ]
          },
          {
            title: "6. AI EXTRACTION & SAMPLE KIT",
            content: [
              "• AI extraction of a document or a HACCP label survives tab switching: the pre-filled form awaits your return.",
              "• A global banner shows the running extraction from any tab.",
              "• On an empty database, a sample kit is seeded automatically: 1 stock item, 1 production sheet, 1 scanned document, 1 HACCP document.",
              "• In Settings, the “Sample kit” card re-seeds it or wipes it for good with one click."
            ]
          },
          {
            title: "7. BACKUP & DATA RECOVERY",
            content: [
              "• In Settings, the “Save backup” button downloads a complete, verified archive: the database (including the latest writes), your settings without their secrets, your imported documents and a version manifest. Master account only.",
              "• An automatic copy is taken at application start and then every hour; the five most recent are kept in the backups folder.",
              "• To restore: close the application, copy the archive files into the data folder (the exact path is shown in Settings → Data), then restart. Copy that folder as-is first.",
              "• After a reinstall, the application looks for a previous installation on the machine and offers to take over your data; your current data is never overwritten."
            ]
          }
        ],
        footer: "claus.io - Professional Kitchen Control Deck"
      },
      de: {
        fileName: "Benutzerhandbuch_Agent_Culinaire_OS.pdf",
        title: "AGENT CULINAIRE OS - BENUTZERHANDBUCH",
        subtitle: "Premium Küchenmanagement, Menü-Analyse und HACCP-System",
        intro: "Willkommen bei claus.io. Dieses Handbuch führt Sie durch die hocheffizienten Funktionen unseres Küchen-Betriebssystems. Die nahtlos vernetzten Module senken Ihren Wareneinsatz, optimieren den Einkauf und garantieren die lückenlose Einhaltung aller Hygienevorschriften.",
        sections: [
          {
            title: "1. INVENTAR & ZUTATENVERWALTUNG IN ECHTZEIT",
            content: [
              "• Katalogisieren und kontrollieren Sie Rohstoffe, Zutaten, Preise und Einheiten.",
              "• Hinterlegen Sie Lieferanten, Netto-Einkaufspreise und genaue Schälausschuss-Raten (%).",
              "• Importieren Sie Ihre bestehenden Zutatenlisten mühelos per Excel- oder CSV-Schnittstelle.",
              "• Nutzen Sie die Schnellprodukt-Funktion für sofortige Erfassungen während des Küchenbetriebs."
            ]
          },
          {
            title: "2. MENÜ-ANALYSE & TECHNISCHE REZEPTBLÄTTER",
            content: [
              "• Entwickeln Sie Speisekarten mithilfe professioneller KI-Generatoren (Kreativ, Traditionell, Gourmet).",
              "• Passen Sie Rezepte flexibel an: Bearbeiten Sie Rohstoffe, Mengenverhältnisse und Arbeitsschritte.",
              "• Ändern Sie Zutatenbezeichnungen, Einheiten oder Stückpreise direkt in den flexiblen Tabellen.",
              "• Berechnen Sie automatisch den Wareneinsatz pro Portion, Margen und Gesamtherstellungskosten."
            ]
          },
          {
            title: "3. BESCHAFFUNGSPLANUNG & LIEFERANTENBESTELLUNGEN",
            content: [
              "• Fügen Sie technische Rezeptblätter mit einem Klick dem aktuellen Einkaufsplan hinzu.",
              "• Geben Sie die geplante Gästeanzahl ein: Alle Mengen werden sofort hochgerechnet und konsolidiert.",
              "• Generieren Sie strukturierte, nach Lieferanten gruppierte Bestellvorschläge.",
              "• Exportieren Sie fertige Einkaufslisten als PDF- oder CSV-Dateien für eine schnelle Abwicklung."
            ]
          },
          {
            title: "4. HACCP-Sicherheitskontrollen, HYGIENE-LOGS & CHARGENTRACKING",
            content: [
              "• Dokumentieren Sie die Temperaturdaten Ihrer Kühlhäuser und Tiefkühlräume.",
              "• Führen Sie digitale Reinigungs- und Desinfektionspläne für alle Arbeitszonen.",
              "• Sichern Sie lückenlose Rückverfolgbarkeit durch Erfassung von Chargennummern beim Wareneingang.",
              "• Erstellen Sie Übersichtstabellen der kennzeichnungspflichtigen Allergene pro Gericht."
            ]
          },
          {
            title: "5. KÜCHENDIENSTPLAN & BRIGADE-ORGANISATION",
            content: [
              "• Planen Sie die Dienstzeiten Ihrer Brigade (Küchenchef, Postenchefs, Commis, Spüler).",
              "• Visualisieren Sie wöchentliche Arbeitszeiten, freie Tage und feste Postenbesetzungen.",
              "• Optimieren Sie die Arbeitsabläufe und steuern Sie die Personalkosten parallel zum Auslastungsgrad."
            ]
          },
          {
            title: "6. KI-EXTRAKTION & BEISPIEL-KIT",
            content: [
              "• Die KI-Extraktion eines Dokuments oder HACCP-Etiketts übersteht den Tab-Wechsel: das vorausgefüllte Formular erwartet Sie.",
              "• Ein globales Banner zeigt die laufende Extraktion in jedem Tab.",
              "• Auf einer leeren Datenbank wird automatisch ein Beispiel-Kit gesetzt: 1 Lagerartikel, 1 Produktionsblatt, 1 gescanntes Dokument, 1 HACCP-Dokument.",
              "• In den Einstellungen setzt die Karte „Beispiel-Kit“ das Kit neu oder löscht es endgültig."
            ]
          },
          {
            title: "7. SICHERUNG UND WIEDERHERSTELLUNG DER DATEN",
            content: [
              "• In den Einstellungen lädt die Schaltfläche „Sichern“ ein vollständiges, geprüftes Archiv herunter: die Datenbank (einschließlich der letzten Schreibungen), Ihre Einstellungen ohne Geheimnisse, Ihre importierten Dokumente und ein Versionsmanifest. Nur für das Master-Konto.",
              "• Beim Start der Anwendung und danach stündlich wird automatisch eine Kopie erstellt; die fünf neuesten werden im Sicherungsordner aufbewahrt.",
              "• Wiederherstellen: Anwendung schließen, die Dateien des Archivs in den Datenordner kopieren (der genaue Pfad steht in Einstellungen → Daten), dann neu starten. Kopieren Sie diesen Ordner zuvor unverändert.",
              "• Nach einer Neuinstallation sucht die Anwendung eine frühere Installation auf dem Rechner und bietet an, Ihre Daten zu übernehmen; Ihre aktuellen Daten werden niemals überschrieben."
            ]
          }
        ],
        footer: "claus.io - Professionelle Steuerzentrale für Großküchen"
      },
      es: {
        fileName: "Guia_del_Usuario_Agent_Culinaire_OS.pdf",
        title: "AGENT CULINAIRE OS - GUÍA DE USUARIO",
        subtitle: "Gestión Culinaria Premium, Ingeniería de Menús e Higiene HACCP",
        intro: "Bienvenido a claus.io. Esta guía maestra describe el uso y la sinergia de nuestro conjunto completo de herramientas profesionales, diseñadas para optimizar sus márgenes, organizar las compras y garantizar el máximo cumplimiento de las normativas de seguridad de cocina.",
        sections: [
          {
            title: "1. CONTROL DE INVENTARIO E INGREDIENTES EN TIEMPO REAL",
            content: [
              "• Registre y realice el seguimiento de materias primas, insumos y unidades de medida.",
              "• Almacene fichas de proveedores, precio de compra real y el coeficiente de rendimiento (%).",
              "• Importe bases de datos masivas directamente con nuestro descodificador de plantillas Excel/CSV.",
              "• Añada ingredientes de manera instantánea sobre la marcha mediante formularios de carga rápida."
            ]
          },
          {
            title: "2. INGENIERÍA DE MENÚS Y FICHAS DE RECETAS INTELIGENTES",
            content: [
              "• Genere menús únicos con el respaldo de nuestros modelos IA (Creativo, Tradicional, Gastronómico).",
              "• Personalice fichas técnicas de manera minuciosa: modifique ingredientes, cantidades y preparaciones.",
              "• Edite nombres, precios, unidades de empaque u origen con las tablas interactivas.",
              "• Controle los costes por ración de manera automatizada junto con el margen comercial recomendado."
            ]
          },
          {
            title: "3. PLANIFICACIÓN DE COMPRAS Y PEDIDOS PROVEEDOR",
            content: [
              "• Envíe las fichas técnicas al centro integrado de adquisiciones (carrito de la compra).",
              "• Defina el número de comensales programado para escalar magnitudes y pesos al instante.",
              "• Produzca órdenes de pedidos consolidadas de modo automático, agrupadas por cada distribuidor.",
              "• Descargue listas preparadas como tablas CSV o archivos PDF ejecutivos legibles."
            ]
          },
          {
            title: "4. SISTEMA DE SEGURIDAD ALIMENTARIA (HACCP), HIGIENE E HISTORIAL",
            content: [
              "• Registre periódicamente las lecturas termométricas de las unidades frigoríficas de almacenamiento.",
              "• Gestione las listas de saneamiento e inspección de superficies limpias divididas por zonas.",
              "• Asegure la trazabilidad de lotes de materias primas con el panel de log de entrada.",
              "• Identifique explícitamente la presencia de alérgenos de declaración obligatoria en cada plato."
            ]
          },
          {
            title: "5. PLANIFICADOR DE TURNOS Y GESTIÓN DE EQUIPOS",
            content: [
              "• Gestione horarios y responsabilidades de sus colaboradores en cocina (Chef, Cocineros, Limpieza).",
              "• Estructure el cronograma de turnos semanales de trabajo, descansos y puestos asignados.",
              "• Ajuste las horas de mano de obra en función de la ocupación y volumen de producción."
            ]
          },
          {
            title: "6. EXTRACCIÓN IA Y KIT DE EJEMPLOS",
            content: [
              "• La extracción IA de un documento o de una etiqueta HACCP sobrevive al cambio de pestaña: el formulario prellenado le espera.",
              "• Un cartel global muestra la extracción en curso desde cualquier pestaña.",
              "• En una base vacía, un kit de ejemplos se siembra automáticamente: 1 artículo en stock, 1 ficha de producción, 1 documento escaneado, 1 documento HACCP.",
              "• En Ajustes, la tarjeta «Kit de demostración» lo resiembra o lo borra definitivamente con un clic."
            ]
          },
          {
            title: "7. COPIA DE SEGURIDAD Y RECUPERACIÓN DE DATOS",
            content: [
              "• En Ajustes, el botón «Guardar copia» descarga un archivo completo y verificado: la base de datos (incluidas las últimas escrituras), sus ajustes sin secretos, sus documentos importados y un manifiesto de versión. Reservado a la cuenta maestra.",
              "• Se toma una copia automática al iniciar la aplicación y después cada hora; se conservan las cinco más recientes en la carpeta de copias.",
              "• Para restaurar: cierre la aplicación, copie los archivos del archivo en la carpeta de datos (la ruta exacta aparece en Ajustes → Datos) y vuelva a iniciar. Copie antes esa carpeta tal cual.",
              "• Tras una reinstalación, la aplicación busca una instalación anterior en el equipo y le propone recuperar sus datos; sus datos actuales nunca se sobrescriben."
            ]
          }
        ],
        footer: "claus.io - Plataforma de Mando Culinario Profesional"
      },
      it: {
        fileName: "Guida_Utente_Agent_Culinaire_OS.pdf",
        title: "AGENT CULINAIRE OS - GUIDA PER L'UTENTE",
        subtitle: "Gestione di Cucina Premium, Ingegneria dei Menu e Protocollo HACCP",
        intro: "Benvenuto in claus.io. Questa guida centrale illustra come utilizzare le potenti utilità del nostro sistema operativo per ristorazione per consolidare i margini finanziari, regolare l'approvvigionamento e soddisfare appieno i requisiti HACCP ed allergeni del locale.",
        sections: [
          {
            title: "1. ARCHIVIO ED INVENTARIO INGREDIENTI IN TEMPO REALE",
            content: [
              "• Cataloga l'intero database di materie prime, condimenti, pesi e confezioni.",
              "• Associa nomi fornitori, prezzi di carico originali e percentuali esatte di resa (%) dei prodotti.",
              "• Carica istantaneamente i listini in blocco tramite lettore di fogli di calcolo Excel o CSV.",
              "• Utilizza scorciatoie di creazione rapida per inserire alimenti anche in pieno servizio."
            ]
          },
          {
            title: "2. INGEGNERIA DEI MENU E CREAZIONE SCHEDE RICETTE",
            content: [
              "• Genera fantastici menu ed abbinamenti gastronomici con l'AI (Creativo, Tradizionale, Stellato).",
              "• Adatta fiches di ricette: modifica ingredienti, grammature e tempi di marinatura o cottura.",
              "• Cambia diciture, costi-kg e unità di imballaggio velocemente nelle tabelle editabili.",
              "• Monitora automaticamente il food cost per porzione, ricarichi applicati e margine calcolato."
            ]
          },
          {
            title: "3. PROGRAMMAZIONE ACQUISTI E ORDINI AI FORNITORI",
            content: [
              "• Carica le ricette approvate direttamente nel carrello acquisti centralizzato per acquisti consolidati.",
              "• Digita il numero di commensali previsto: tutte le merci verranno riscalate all'istante.",
              "• Ottieni ordini pronti per la spedizione, ordinati e sommati per singolo fornitore di fiducia.",
              "• Condividi l'ordine esportandolo sia come comodo foglio di calcolo CSV che come PDF professionale."
            ]
          },
          {
            title: "4. PROTOCOLLO HACCP, SANIFICAZIONE E TRACCIABILITÀ",
            content: [
              "• Traccia digitalmente i valori giornalieri delle temperature dei frigoriferi positivi e negativi.",
              "• Coordina lo scadenzario di igienizzazione programmata delle superfici e delle attrezzature.",
              "• Mantieni l'assoluta conformità registrando la data e il lotto di provenienza dei prodotti in entrata.",
              "• Evidenzia con precisione ed accuratezza la presenza degli allergeni critici su ogni portata."
            ]
          },
          {
            title: "5. CALENDARIO TURNI E ORGANIZZAZIONE BRIGATA",
            content: [
              "• Pianifica turni, disponibilità ed assenze della squadra in servizio (Chef, Commis, Lavapiatti).",
              "• Visualizza orari d'accesso settimanali, riposi pianificati e mansioni distribuite.",
              "• Diminuisci i costi legati ad inefficienze di personale sincronizzando i turni con l'affluenza."
            ]
          },
          {
            title: "6. ESTRAZIONE IA E KIT DI ESEMPI",
            content: [
              "• L'estrazione IA di un documento o di un'etichetta HACCP sopravvive al cambio di scheda: il modulo precompilato la attende.",
              "• Una fascia globale mostra l'estrazione in corso da qualsiasi scheda.",
              "• Su un database vuoto, un kit di esempi è seminato automaticamente: 1 articolo a magazzino, 1 scheda di produzione, 1 documento scansionato, 1 documento HACCP.",
              "• In Impostazioni, la scheda « Kit dimostrativo » lo risemina o lo cancella definitivamente con un clic."
            ]
          },
          {
            title: "7. BACKUP E RIPRISTINO DEI DATI",
            content: [
              "• In Impostazioni, il pulsante «Salva backup» scarica un archivio completo e verificato: il database (comprese le ultime scritture), le sue impostazioni senza segreti, i documenti importati e un manifesto di versione. Riservato all'account maestro.",
              "• Una copia automatica viene presa all'avvio dell'applicazione e poi ogni ora; le cinque più recenti sono conservate nella cartella dei backup.",
              "• Per ripristinare: chiuda l'applicazione, copi i file dell'archivio nella cartella dei dati (il percorso esatto è indicato in Impostazioni → Dati), quindi riavvii. Copi prima quella cartella così com'è.",
              "• Dopo una reinstallazione, l'applicazione cerca un'installazione precedente sul computer e le propone di riprendere i suoi dati; i dati attuali non vengono mai sovrascritti."
            ]
          }
        ],
        footer: "claus.io - Pannello di Controllo Professionale di Cucina"
      }
    };

    const activeGuide = (guides as Record<string, typeof guides.fr>)[lang] || guides.fr;

    // Font layout setup
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59); // Charcoal #1E293B

    // Title Block
    doc.text(activeGuide.title, 20, 25);
    
    // Subtitle Block with fine styling
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(245, 158, 11); // Amber #F59E0B
    doc.text(activeGuide.subtitle, 20, 32);

    // Decorative Line
    doc.setDrawColor(203, 213, 225); // Slate #CBD5E1
    doc.setLineWidth(0.5);
    doc.line(20, 37, 190, 37);

    // Intro Paragraph
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(71, 85, 105); // Gray #475569

    const introLines = doc.splitTextToSize(activeGuide.intro, 170);
    let currentY = 46;
    doc.text(introLines, 20, currentY);
    currentY += (introLines.length * 5) + 8; // Adjust Y based on wrapped line counts

    // Section Loop with careful page overflow prevention
    activeGuide.sections.forEach((sect) => {
      // Check if we need a page break (minimum 40 points left on the page)
      if (currentY > 240) {
        doc.addPage();
        currentY = 25;
        // draw quick page numbering or header
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(148, 163, 184);
        doc.text(activeGuide.title, 20, 15);
        doc.line(20, 18, 190, 18);
      }

      // Draw Section Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42); // Black/Navy #0F172A
      doc.text(sect.title, 20, currentY);
      currentY += 6;

      // Draw bullet items
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85); // Slate #334155

      sect.content.forEach((bullet) => {
        const bulletLines = doc.splitTextToSize(bullet, 162);
        
        // Check if individual bullet wraps past page bottom
        const itemHeight = bulletLines.length * 5;
        if (currentY + itemHeight > 275) {
          doc.addPage();
          currentY = 25;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(148, 163, 184);
          doc.text(activeGuide.title, 20, 15);
          doc.line(20, 18, 190, 18);
          // Restore font style for bullet list
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          doc.setTextColor(51, 65, 85);
        }

        doc.text(bulletLines, 24, currentY);
        currentY += itemHeight + 1.5;
      });

      // Spacing between sections
      currentY += 6;
    });

    // Elegant Header/Footer Stamp across all generated pages
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      // Bottom line
      doc.setDrawColor(241, 245, 249); // Slate-100
      doc.line(20, 284, 190, 284);

      // Footer Text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184); // Slate-400
      doc.text(activeGuide.footer, 20, 290);

      // Page numbers on the right
      doc.text(`${i} / ${pageCount}`, 180, 290);
    }

    doc.save(activeGuide.fileName);
}
