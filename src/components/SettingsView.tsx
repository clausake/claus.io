import React, { useState, useEffect } from "react";
import {
  Activity,
  Check,
  ClipboardList,
  Download,
  Lock,
  Menu as MenuIcon,
  Settings,
  Smartphone,
} from "lucide-react";
import {
  Line,
} from "recharts";
import { motion } from "motion/react";
import { jsPDF } from "jspdf";
import { QRCodeSVG } from "qrcode.react";
import { useToast } from "./ui/Toast";

export function SettingsView({
  settings,
  setSettings,
  t,
  trialStatus,
  setTrialStatus,
}: {
  settings: any;
  setSettings: any;
  t: any;
  trialStatus: any;
  setTrialStatus: any;
}) {
  const toast = useToast();
  const [ollamaStatus, setOllamaStatus] = React.useState<
    "idle" | "checking" | "connected" | "error"
  >("idle");
  const [ollamaInfo, setOllamaInfo] = React.useState<string>("");
  const [networkInfo, setNetworkInfo] = React.useState<{
    ip: string;
    port: number;
    url: string;
  } | null>(null);

  const [licenseKey, setLicenseKey] = React.useState("");

  const fetchLicense = async () => {
    try {
      const res = await fetch("/api/trial-status");
      const data = await res.json();
      setTrialStatus(data);
    } catch (e) {
      console.error("Error fetching license", e);
    }
  };

  React.useEffect(() => {
    const fetchNetwork = async () => {
      try {
        const res = await fetch("/api/network-info");
        const data = await res.json();
        setNetworkInfo(data);
      } catch (e) {
        console.error("Error fetching network info", e);
      }
    };
    fetchNetwork();
    fetchLicense();
    checkOllama();
  }, []);

  const handleUnlock = async () => {
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: licenseKey }),
      });
      const data = await res.json();
      if (res.ok) {
        toast("Licence activée avec succès !", "success");
        fetchLicense();
      } else {
        toast("Clé invalide.", "error");
      }
    } catch (e) {
      toast("Erreur serveur.", "error");
    }
  };

  const [availableModels, setAvailableModels] = React.useState<string[]>([
    "llama3.2",
  ]); // Default fallback

  const checkOllama = async () => {
    setOllamaStatus("checking");
    try {
      const res = await fetch("/api/ollama/status");
      const data = await res.json();
      if (data.status === "connected") {
        setOllamaStatus("connected");
        setOllamaInfo(`${data.models.length} modèles détectés`);
        if (data.models && Array.isArray(data.models)) {
          // Assume models are objects with a 'name' field
          setAvailableModels(
            data.models.map((m: any) => (typeof m === "string" ? m : m.name)),
          );
        }
      } else {
        setOllamaStatus("error");
        setOllamaInfo(data.error);
      }
    } catch (e) {
      setOllamaStatus("error");
      setOllamaInfo("Impossible de contacter le serveur local.");
    }
  };

  const handleSave = async () => {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      toast(t.saveSuccess, "success");
    } catch (e) {
      toast(t.syncError, "error");
    }
  };

  const handleBackup = async () => {
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast(`✅ ${t.active}: ${data.message}`, "success");
      } else {
        throw new Error(data.message || "Server error");
      }
    } catch (e) {
      console.error("Backup error:", e);
      toast(t.syncError, "error");
    }
  };

  
  const handleDownloadGuide = () => {
    const doc = new jsPDF();
    const lang = settings.language || "fr";

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
        intro: "Bienvenue dans l'interface de l'Agent Culinaire OS. Ce guide complet vous détaille les différentes rubriques et outils de l'application conçus en étroite synergie pour optimiser vos marges, faciliter votre approvisionnement et garantir la conformité réglementaire de votre établissement.",
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
          }
        ],
        footer: "Agent Culinaire OS - Solution de Pilotage Professionnel de Cuisine"
      },
      en: {
        fileName: "User_Guide_Agent_Culinaire_OS.pdf",
        title: "AGENT CULINAIRE OS - USER MANUAL",
        subtitle: "Premium Kitchen Management, Menu Engineering & HACCP System",
        intro: "Welcome to Agent Culinaire OS. This master guide describes how to navigate and make the most out of our comprehensive professional kitchen tools, designed in harmony to simplify operations, protect margins, streamline ordering, and ensure complete sanitary compliance.",
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
          }
        ],
        footer: "Agent Culinaire OS - Professional Kitchen Control Deck"
      },
      de: {
        fileName: "Benutzerhandbuch_Agent_Culinaire_OS.pdf",
        title: "AGENT CULINAIRE OS - BENUTZERHANDBUCH",
        subtitle: "Premium Küchenmanagement, Menü-Analyse und HACCP-System",
        intro: "Willkommen bei Agent Culinaire OS. Dieses Handbuch führt Sie durch die hocheffizienten Funktionen unseres Küchen-Betriebssystems. Die nahtlos vernetzten Module senken Ihren Wareneinsatz, optimieren den Einkauf und garantieren die lückenlose Einhaltung aller Hygienevorschriften.",
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
          }
        ],
        footer: "Agent Culinaire OS - Professionelle Steuerzentrale für Großküchen"
      },
      es: {
        fileName: "Guia_del_Usuario_Agent_Culinaire_OS.pdf",
        title: "AGENT CULINAIRE OS - GUÍA DE USUARIO",
        subtitle: "Gestión Culinaria Premium, Ingeniería de Menús e Higiene HACCP",
        intro: "Bienvenido a Agent Culinaire OS. Esta guía maestra describe el uso y la sinergia de nuestro conjunto completo de herramientas profesionales, diseñadas para optimizar sus márgenes, organizar las compras y garantizar el máximo cumplimiento de las normativas de seguridad de cocina.",
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
          }
        ],
        footer: "Agent Culinaire OS - Plataforma de Mando Culinario Profesional"
      },
      it: {
        fileName: "Guida_Utente_Agent_Culinaire_OS.pdf",
        title: "AGENT CULINAIRE OS - GUIDA PER L'UTENTE",
        subtitle: "Gestione di Cucina Premium, Ingegneria dei Menu e Protocollo HACCP",
        intro: "Benvenuto in Agent Culinaire OS. Questa guida centrale illustra come utilizzare le potenti utilità del nostro sistema operativo per ristorazione per consolidare i margini finanziari, regolare l'approvvigionamento e soddisfare appieno i requisiti HACCP ed allergeni del locale.",
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
          }
        ],
        footer: "Agent Culinaire OS - Pannello di Controllo Professionale di Cucina"
      }
    };

    const activeGuide = guides[lang] || guides.fr;

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
  };

  const handleDownloadDB = () => {
    const a = document.createElement("a");
    a.href = "/api/admin/db-download";
    a.download = "agent_culinaire.sqlite";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      <div className="mb-10">
        <h2 className="text-4xl font-black text-white tracking-tight mb-2">
          {t.systemCore}
        </h2>
        <p className="text-slate-500 text-lg">{t.advancedConfig}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-8">
          {/* Section IA */}
          <section className="led-glow-container">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <div className="p-2 bg-brand-500/10 text-brand-500 rounded-xl mr-4">
                <Settings className="w-5 h-5" />
              </div>
              {t.aiSection}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {t.ollamaStatus || "Statut Ollama"}
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={checkOllama}
                    disabled={ollamaStatus === "checking"}
                    className="px-4 py-2 bg-brand-500/10 text-brand-500 border border-brand-500/30 rounded-xl text-xs font-bold hover:bg-brand-500/20 transition-all"
                  >
                    {ollamaStatus === "checking"
                      ? t.checking || "Vérification..."
                      : t.testConnection || "Tester Connexion"}
                  </button>
                  <div className="flex flex-col">
                    <span
                      className={`text-xs font-black uppercase tracking-tighter ${
                        ollamaStatus === "connected"
                          ? "text-emerald-500"
                          : ollamaStatus === "error"
                            ? "text-red-500"
                            : "text-slate-500"
                      }`}
                    >
                      {ollamaStatus === "connected"
                        ? t.connectedStatus || "Connecté"
                        : ollamaStatus === "error"
                          ? t.errorStatus || "Erreur"
                          : t.notTested || "Non testé"}
                    </span>
                    {ollamaInfo && (
                      <span className="text-[10px] text-slate-500">
                        {ollamaInfo}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {t.systemLanguage}
                </label>
                <select
                  value={settings.language}
                  onChange={(e) =>
                    setSettings({ ...settings, language: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                >
                  <option value="fr" className="bg-black text-white">
                    {t.frenchLang || "Français"}
                  </option>
                  <option value="en" className="bg-black text-white">
                    {t.englishLang || "English"}
                  </option>
                  <option value="es" className="bg-black text-white">
                    {t.spanishLang || "Español"}
                  </option>
                  <option value="it" className="bg-black text-white">
                    {t.italianLang || "Italiano"}
                  </option>
                  <option value="de" className="bg-black text-white">
                    {t.germanLang || "Deutsch"}
                  </option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {t.activeAIModel || "Modèle IA Actif"}
                </label>
                <select
                  value={settings.model_name}
                  onChange={(e) =>
                    setSettings({ ...settings, model_name: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white font-mono focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all appearance-none"
                >
                  {availableModels.map((model) => (
                    <option
                      key={model}
                      value={model}
                      className="bg-black text-white"
                    >
                      {model}
                    </option>
                  ))}
                  <option value="custom" className="bg-black text-white">
                    {settings.language === "fr" ? "Personnalisé (Saisir ci-dessous)" : "Custom Model (Type below)"}
                  </option>
                </select>
                <p className="text-[10px] text-slate-500 italic">
                  {t.activeAIModelDesc ||
                    "Modèle utilisé pour toutes les analyses IA locales."}
                </p>
              </div>
              {settings.model_name === "custom" && (
                <div className="space-y-2 col-span-1 md:col-span-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    {settings.language === "fr" ? "Nom du modèle personnalisé" : "Custom Model Name"}
                  </label>
                  <input
                    type="text"
                    value={settings.custom_model || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, custom_model: e.target.value })
                    }
                    placeholder="e.g. gemma-12b-it-qat"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white font-mono focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                  />
                </div>
              )}
              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {t.ollamaEndpoint}
                </label>
                <input
                  type="text"
                  value={settings.ollama_url}
                  onChange={(e) =>
                    setSettings({ ...settings, ollama_url: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white font-mono focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                />
              </div>
            </div>
          </section>

          {/* Section Licence */}
          <section className="led-glow-container bg-black/40 border-emerald-500/20 shadow-none">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl mr-4">
                <Lock className="w-5 h-5" />
              </div>
              {trialStatus?.isUnlocked
                ? "Licence Activée"
                : "Activation de la Licence"}
            </h3>

            {trialStatus ? (
              <div className="space-y-6">
                <div>
                  <span className="text-xs text-slate-500 uppercase font-bold tracking-widest">
                    {t.machineId || "Machine ID"}
                  </span>
                  <div className="font-mono text-emerald-400 text-lg bg-black/60 p-3 rounded-lg mt-1 border border-white/5">
                    {trialStatus.machineId}
                  </div>
                </div>

                {!trialStatus.isUnlocked ? (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-400">
                      {t.configTrialDesc
                        ? t.configTrialDesc.replace(
                            "{days}",
                            trialStatus.daysLeft.toString(),
                          )
                        : "Il vous reste " +
                          trialStatus.daysLeft +
                          " jours d'essai pour tester le système."}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={licenseKey}
                        onChange={(e) => setLicenseKey(e.target.value)}
                        placeholder={
                          t.licenseKeyPlaceholder || "XXXX-XXXX-XXXX"
                        }
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-white font-mono outline-none focus:border-emerald-500/50"
                      />
                      <button
                        onClick={handleUnlock}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all"
                      >
                        Activer
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-xl font-bold border border-emerald-500/20">
                    {t.clausIsActivated || "Le système est activé sur ce poste."}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-500 italic">
                {t.loadingLicense || "Chargement de la licence..."}
              </div>
            )}
          </section>

          {/* Section Achats */}
          <section className="led-glow-container">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl mr-4">
                <Activity className="w-5 h-5" />
              </div>
              {t.automationSection}
            </h3>
            <div className="space-y-4">
              <label className="flex items-center group cursor-pointer p-4 rounded-2xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.copilot_mode}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        copilot_mode: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                </div>
                <div className="ml-4">
                  <span className="block text-sm font-bold text-white">
                    {t.copilotMode}
                  </span>
                  <span className="text-xs text-slate-500">
                    {t.copilotDesc}
                  </span>
                </div>
              </label>
              <label className="flex items-center group cursor-pointer p-4 rounded-2xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.auto_pause}
                    onChange={(e) =>
                      setSettings({ ...settings, auto_pause: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                </div>
                <div className="ml-4">
                  <span className="block text-sm font-bold text-white">
                    {t.autoPause}
                  </span>
                  <span className="text-xs text-slate-500">
                    {t.autoPauseDesc}
                  </span>
                </div>
              </label>
            </div>
          </section>

          {/* Section Smartphone */}
          <section className="led-glow-container p-8 bg-gradient-to-br from-brand-500/5 to-transparent relative overflow-hidden group">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-500/10 rounded-full blur-3xl opacity-50"></div>
            <div className="relative z-10">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center">
                <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl mr-4">
                  <Smartphone className="w-5 h-5" />
                </div>
                {t.smartphoneAccess || "Accès Smartphone Wi-Fi"}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <p
                    className="text-sm text-slate-400 leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html:
                        t.smartphoneAccessDesc ||
                        "Connectez votre smartphone au **même réseau Wi-Fi** que cet ordinateur pour scanner les factures et gérer l'inventaire en direct.",
                    }}
                  ></p>
                  <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                      {t.localWifiAddress ||
                        "Adresse de connexion (Wi-Fi Local)"}
                    </div>
                    <div className="flex items-center justify-between">
                      <code className="text-emerald-400 font-mono font-bold text-lg">
                        {networkInfo?.url || t.loading || "Chargement..."}
                      </code>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-6 bg-white/5 rounded-3xl border border-white/5 border-dashed">
                  <div className="w-32 h-32 bg-white flex items-center justify-center rounded-2xl mb-4 shadow-2xl p-2 overflow-hidden">
                    {networkInfo?.url ? (
                      <QRCodeSVG
                        value={networkInfo.url}
                        size={112}
                        bgColor="#ffffff"
                        fgColor="#000000"
                        level="L"
                        includeMargin={false}
                      />
                    ) : (
                      <div className="text-black text-[10px] text-center font-bold px-2 flex flex-col items-center">
                        <Smartphone className="w-8 h-8 mb-2 text-emerald-600" />
                        {t.loading || "Chargement..."}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center"
                    dangerouslySetInnerHTML={{
                      __html:
                        t.openCameraToConnect ||
                        "Ouvrez l'appareil photo<br/>pour vous connecter",
                    }}
                  ></span>
                </div>
              </div>
            </div>
          </section>

          {/* Boutons Actions */}
          <div className="flex gap-4">
            <button
              onClick={handleSave}
              className="flex-1 py-4 bg-brand-600 hover:bg-brand-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-brand-500/20"
            >
              {t.saveSettings || "Sauvegarder les Paramètres"}
            </button>
          </div>
        </div>

        <div className="space-y-8">
          {/* Section Base de données */}
          <section className="led-glow-container">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl mr-4">
                <ClipboardList className="w-5 h-5" />
              </div>
              {t.backupSection}
            </h3>
            <div className="space-y-6">
              <div className="p-4 bg-black/40 rounded-2xl border border-white/5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                  {t.activeEngine || "Moteur Actif"}
                </p>
                <p className="font-bold text-white">SQLite 3.0</p>
                <p className="text-[10px] font-mono text-brand-500 mt-1">
                  agent_culinaire.db
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => { const a = document.createElement("a"); a.href = "/api/admin/db-download"; a.download = "agent_culinaire.db"; document.body.appendChild(a); a.click(); document.body.removeChild(a); }}
                  className="w-full py-4 bg-brand-500 text-obsidian rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-brand-400 transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center gap-3"
                >
                  <Download className="w-5 h-5" />
                  {t.downloadDB}
                </button>
                
                <button
                  onClick={handleDownloadGuide}
                  className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-3 mt-4"
                >
                  <Download className="w-5 h-5" />
                  {t.downloadGuide || "Download Guide"}
                </button>

                <button
                  onClick={handleBackup}
                  className="w-full py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-bold text-sm hover:bg-white/10 transition-all"
                >
                  {t.runBackup}
                </button>
              </div>
            </div>
          </section>

          <button
            onClick={handleSave}
            className="w-full py-3 bg-white text-obsidian rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all shadow-2xl shadow-white/10"
          >
            {t.saveSettings}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
