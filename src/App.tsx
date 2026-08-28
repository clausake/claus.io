import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ChefHat,
  ClipboardList,
  PackageSearch,
  ShoppingCart,
  AlertTriangle,
  Settings,
  Bell,
  Search,
  Menu as MenuIcon,
  UploadCloud,
  FileText,
  CheckCircle2,
  Mic,
  MicOff,
  Download,
  Activity,
  Leaf,
  Sparkles,
  FlaskConical,
  Clock,
  Bot,
  Battery,
  Zap,
  Plus,
  Minus,
  Save,
  Users,
  Trash2,
  Edit2,
  MessageSquare,
  Send,
  X,
  Receipt,
  Check,
  BookOpen,
  Shield,
  LayoutDashboard,
  Thermometer,
  Calendar,
  PieChart as PieChartIcon,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  RefreshCw,
  Lock,
  Expand,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Folder,
  Bookmark,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { COST_DATA, STOCK_DISTRIBUTION, ALERTS, INITIAL_CART, MENU_ROTATION } from "./data/menuData";
import { TRANSLATIONS } from "./data/translations";
import { INGREDIENT_TRANSLATIONS, INGREDIENT_TRANSLATIONS_ES, INGREDIENT_TRANSLATIONS_IT, INGREDIENT_TRANSLATIONS_DE } from "./data/ingredientTranslations";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";

export const MediaDisplay = ({ src, alt, className, interactive = false, onClick, ...props }: any) => {
  if (!src) return null;
  const isPdf = src.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    return (
      <iframe
        src={`${src}#view=FitH&toolbar=0`}
        title={alt}
        className={`${className} ${!interactive ? 'pointer-events-none h-full' : 'min-h-[500px] h-[90vh]'} border-none w-full block`}
        onClick={onClick}
        {...props}
      />
    );
  }
  return <img src={src} alt={alt} className={className} referrerPolicy="no-referrer" onClick={onClick} {...props} />;
};

import { motion, AnimatePresence } from "motion/react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import Papa from "papaparse";
import { QRCodeSVG } from "qrcode.react";
import { Haccp } from "./components/Haccp";
import { PurchasingTab } from "./components/Purchasing";

import { DocumentUpload } from "./components/DocumentUpload";
import { StaffPlanning } from "./components/StaffPlanning";
import { EpicureStudio } from "./components/EpicureStudio";
import VOCAB_TRANSLATIONS from "../vocab_translations.json";

// Mock Data pour les graphiques





const getSupplierForIngredient = (ingredientName: string) => {
  const name = ingredientName.toLowerCase();
  if (
    name.match(
      /(pomme|poire|banane|fraise|framboise|orange|citron|légume|carotte|tomate|oignon|ail|échalote|salade|laitue|mâche|courgette|aubergine|poivron|chou|brocoli|épinard|haricot|petit pois|champignon|radis|navet|poireau|céleri|avocat|mangue|ananas|kiwi|raisin|pêche|abricot|cerise|melon|pastèque|herbe|persil|ciboulette|basilic|menthe|coriandre|thym|romarin|laurier|fruit)/,
    )
  ) {
    return "TerreAzur";
  }
  if (
    name.match(
      /(viande|boeuf|bœuf|veau|porc|agneau|mouton|volaille|poulet|dinde|canard|poisson|saumon|cabillaud|colin|thon|crevette|fruit de mer|surgelé|glace|beurre|crème|lait|fromage|yaourt|oeuf|œuf|charcuterie|jambon|saucisse|lard|bacon)/,
    )
  ) {
    return "Passion Froid";
  }
  if (
    name.match(
      /(farine|sucre|sel|poivre|épice|curry|cumin|paprika|huile|vinaigre|pâte|riz|semoule|céréale|lentille|pois chiche|conserve|bocal|moutarde|mayonnaise|ketchup|sauce|bouillon|café|thé|chocolat|cacao|biscuit|gâteau|levure|amande|noix|noisette)/,
    )
  ) {
    return "EpiSaveurs";
  }
  return "Charles Martin";
};

const gerer_flux_culinaire = async (jsonData: string) => {
  try {
    const payload = {
      source: "mobile",
      type: "MANUAL",
      data: { action: "review_carts", carts: JSON.parse(jsonData) },
      timestamp: new Date().toISOString(),
    };

    console.log("Transmission au serveur local (Asus G16) :", payload);

    // Appel API vers le cerveau Agent Culinaire OS
    const response = await fetch("/api/agent/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("Réponse du serveur :", result);

    if (result.claus_analysis) {
      alert(`✅ Ordre transmis avec succès !

🧠 Avis de l'Assistant IA :
${result.claus_analysis}`);
    } else {
      alert("✅ Ordre transmis avec succès !");
    }
  } catch (error) {
    console.error("Erreur de transmission:", error);
    alert(
      "❌ Erreur de connexion au serveur Agent Culinaire OS. Vérifiez que le backend est lancé.",
    );
  }
};

function RobotManagement({ t }: { t: any }) {
  const [robots, setRobots] = useState<any[]>([]);

  useEffect(() => {
    const fetchRobots = async () => {
      try {
        const res = await fetch("/api/robots");
        if (res.ok) setRobots(await res.json());
      } catch (e: any) {
        if (e && e.message === "Failed to fetch") return;
        console.error("Error loading robots", e);
      }
    };
    fetchRobots();
    const interval = setInterval(fetchRobots, 5000);
    return () => clearInterval(interval);
  }, []);

  const translateValue = (val: string) => {
    if (!val) return val;
    const lower = val.toLowerCase();
    if (lower.includes("épluchage") || lower.includes("peeling"))
      return t.peelingCarrots;
    if (lower.includes("plonge") || lower.includes("dishwashing"))
      return t.washingPots;
    if (
      lower.includes("en attente") ||
      lower.includes("waiting") ||
      lower.includes("idle")
    )
      return t.robotWaiting;
    if (lower.includes("légumerie") || lower.includes("veg prep"))
      return t.vegPrep;
    if (
      lower.includes("station de charge") ||
      lower.includes("charging station")
    )
      return t.chargingStationA;
    if (lower === "plonge") return t.dishWashArea;
    return val;
  };

  const handleAssign = async (robotId: string) => {
    const task = prompt(t.whatTaskAssign);
    if (!task) return;

    try {
      const res = await fetch("/api/robots/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ robotId, task }),
      });
      if (res.ok) {
        const updatedRes = await fetch("/api/robots");
        if (updatedRes.ok) setRobots(await updatedRes.json());
      }
    } catch (e) {
      console.error("Assignment error", e);
    }
  };

  return (
    <div className="led-glow-container flex flex-col animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center">
            <Bot className="w-8 h-8 mr-3 text-blue-500" />
            {t.robotFleet}
          </h2>
          <p className="text-slate-500 mt-1">{t.robotFleetSubtitle}</p>
          <div className="mt-4 px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-lg text-xs font-medium inline-block">
            {t.simulationWarning}
          </div>
        </div>
        <button className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black uppercase tracking-widest hover:bg-blue-500 transition-all flex items-center shadow-[0_0_20px_rgba(59,130,246,0.4)] border border-blue-400/30">
          <Zap className="w-4 h-4 mr-2 led-icon-glow" />
          {t.autoAssignAI}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {robots.map((robot) => (
          <div
            key={robot.id}
            className="led-glow-container p-6 relative overflow-hidden group hover:border-blue-500/30 transition-colors"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
              <div
                className={`h-full ${robot.status === "active" ? "bg-blue-500" : "bg-emerald-500"}`}
                style={{ width: `${robot.battery}%` }}
              />
            </div>

            <div className="flex justify-between items-start mb-4 mt-2">
              <div>
                <h3 className="text-lg font-bold text-white">{robot.name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-1">
                  {robot.id}
                </p>
              </div>
              <div
                className={`flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
                  robot.status === "active"
                    ? "bg-blue-500/10 text-blue-500"
                    : "bg-emerald-500/10 text-emerald-500"
                }`}
              >
                {robot.status === "active" ? t.robotOnMission : t.robotCharging}
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-center text-sm text-slate-400">
                <Battery className="w-4 h-4 mr-2 text-slate-500" />
                {t.batteryLabel}{" "}
                <span className="text-white ml-2 font-mono">
                  {robot.battery}%
                </span>
              </div>
              <div className="flex items-center text-sm text-slate-400">
                <Activity className="w-4 h-4 mr-2 text-slate-500" />
                {t.taskLabel}{" "}
                <span className="text-white ml-2">
                  {translateValue(robot.task)}
                </span>
              </div>
              <div className="flex items-center text-sm text-slate-400">
                <MenuIcon className="w-4 h-4 mr-2 text-slate-500" />
                {t.zoneLabel}{" "}
                <span className="text-white ml-2">
                  {translateValue(robot.location)}
                </span>
              </div>
            </div>

            {robot.status === "active" && (
              <div className="mb-6">
                <div className="flex justify-between text-xs text-slate-500 mb-2">
                  <span>{t.progressLabel}</span>
                  <span>{robot.progress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${robot.progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button className="py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-xl transition-colors">
                {t.details}
              </button>
              <button
                onClick={() => handleAssign(robot.id)}
                className={`py-2 text-sm font-medium rounded-xl transition-colors ${
                  robot.status === "active"
                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                    : "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                }`}
              >
                {robot.status === "active" ? t.interrupt : t.assign}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LandingPage({ onEnter, t }: { onEnter: () => void; t: any }) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center relative overflow-hidden text-slate-200">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[40%] rounded-full bg-teal-500/10 blur-[100px]" />
      </div>

      <div className="z-10 text-center max-w-3xl px-6 led-glow-container p-12 rounded-3xl">
        <div className="mb-8 flex justify-center">
          <div className="w-24 h-24 bg-emerald-500/20 rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/30 backdrop-blur-xl">
            <ChefHat className="w-12 h-12 text-emerald-400" />
          </div>
        </div>
        <h1 className="text-5xl md:text-7xl font-serif font-bold text-white mb-6 tracking-tight">
          {t.landingTitle || "LOGICIEL DE GESTION"}{" "}
          <span className="text-emerald-400">RESTAURATION IO</span>
        </h1>
        <p className="text-xl md:text-2xl text-slate-400 mb-12 font-light leading-relaxed">
          {t.landingSubtitle ||
            "L'intelligence artificielle au service de la restauration et la haute gastronomie."}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onEnter}
            className="px-8 py-4 bg-emerald-600 text-white rounded-full font-medium text-lg hover:bg-emerald-500 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center gap-2 hover:scale-105 active:scale-95"
          >
            {t.accessKitchen || "Accéder à la Cuisine"}
            <Sparkles className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="absolute bottom-10 text-slate-500 text-sm font-medium tracking-wider uppercase font-mono">
        RESTAURATION IO Intelligent System
      </div>
    </div>
  );
}






const translateIngredientHelper = (name: string, language: string) => {
  if (!name) return name;
  const trimmed = name.trim();
  const lowerTrimmed = trimmed.toLowerCase();
  const snakeKey = lowerTrimmed.replace(/[\s-]+/g, "_");

  // Type-safe cast of imported JSON translations
  const vt = VOCAB_TRANSLATIONS as any;

  // Let's check if we can find a matching key via our 1790-term VOCAB_TRANSLATIONS dictionary first
  let matchedKey: string | null = null;

  // 1. Is the snakeKey an exact vocabulary key?
  if (vt && vt.fr && vt.fr[snakeKey] !== undefined) {
    matchedKey = snakeKey;
  } else if (vt) {
    // 2. Or is the name a translated or original value currently under any language in our vocab dictionary?
    const checkLangs = ["fr", "es", "it", "de"];
    for (const lang of checkLangs) {
      const dict = vt[lang];
      if (dict) {
        const found = Object.keys(dict).find(
          (k) => dict[k] && dict[k].toLowerCase() === lowerTrimmed
        );
        if (found) {
          matchedKey = found;
          break;
        }
      }
    }
    // Also check standard English string spacing with titlecase or clean name match
    if (!matchedKey) {
      const keys = Object.keys(vt.fr || {});
      const foundEng = keys.find(k => k.replace(/_/g, " ") === lowerTrimmed);
      if (foundEng) {
        matchedKey = foundEng;
      }
    }
  }

  // If a vocabulary key is identified, return the translated form for the targeted language!
  if (matchedKey && vt) {
    if (language === "en") {
      return matchedKey.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
    const dict = vt[language];
    if (dict && dict[matchedKey]) {
      return dict[matchedKey];
    }
  }

  // 3. Fallback: Use our smaller handcoded tables
  const frenchMatch = Object.keys(INGREDIENT_TRANSLATIONS).find(
    (k) => k.toLowerCase() === lowerTrimmed
  );

  if (language === "fr") {
    // If input is in English and we need French
    const rKey = Object.keys(INGREDIENT_TRANSLATIONS).find(
      (k) => INGREDIENT_TRANSLATIONS[k].toLowerCase() === lowerTrimmed
    );
    if (rKey) return rKey;
    return trimmed;
  }

  if (language === "es") {
    if (frenchMatch) return INGREDIENT_TRANSLATIONS_ES[frenchMatch];
    const rKey = Object.keys(INGREDIENT_TRANSLATIONS).find(
      (k) => INGREDIENT_TRANSLATIONS[k].toLowerCase() === lowerTrimmed
    );
    if (rKey && INGREDIENT_TRANSLATIONS_ES[rKey]) return INGREDIENT_TRANSLATIONS_ES[rKey];
    return trimmed;
  }

  if (language === "it") {
    if (frenchMatch) return INGREDIENT_TRANSLATIONS_IT[frenchMatch];
    const rKey = Object.keys(INGREDIENT_TRANSLATIONS).find(
      (k) => INGREDIENT_TRANSLATIONS[k].toLowerCase() === lowerTrimmed
    );
    if (rKey && INGREDIENT_TRANSLATIONS_IT[rKey]) return INGREDIENT_TRANSLATIONS_IT[rKey];
    return trimmed;
  }

  if (language === "de") {
    if (frenchMatch) return INGREDIENT_TRANSLATIONS_DE[frenchMatch];
    const rKey = Object.keys(INGREDIENT_TRANSLATIONS).find(
      (k) => INGREDIENT_TRANSLATIONS[k].toLowerCase() === lowerTrimmed
    );
    if (rKey && INGREDIENT_TRANSLATIONS_DE[rKey]) return INGREDIENT_TRANSLATIONS_DE[rKey];
    return trimmed;
  }

  if (language === "en") {
    if (frenchMatch) return INGREDIENT_TRANSLATIONS[frenchMatch];
    return trimmed;
  }

  return name;
};

function translateAlertMessage(
  message: string,
  t: any,
  translateIngredientHelper: any,
) {
  if (t.language === "fr") return message;

  const matchStock = message.match(
    /Stock d'alerte\s*:\s*(.*?)\s*\((.*?)\s+(.*?)\s+restant pour un minimum de\s+(.*?)\s+(.*?)\s+param/,
  );
  if (matchStock) {
    const itemTranslated = translateIngredientHelper(
      matchStock[1].trim(),
      t.language,
    );
    if (t.language === "en")
      return `Low Stock: ${itemTranslated} (${matchStock[2]} ${matchStock[3]} remaining, minimum set at ${matchStock[4]} ${matchStock[5]})`;
    if (t.language === "es")
      return `Stock Crítico: ${itemTranslated} (${matchStock[2]} ${matchStock[3]} restante de ${matchStock[4]} ${matchStock[5]} mínimo configurado)`;
    if (t.language === "de")
      return `Kritischer Bestand: ${itemTranslated} (${matchStock[2]} ${matchStock[3]} verbleibend von ${matchStock[4]} ${matchStock[5]} konfiguriertem Minimum)`;
    if (t.language === "it")
      return `Scorta Critica: ${itemTranslated} (${matchStock[2]} ${matchStock[3]} rimanenti rispetto al minimo di ${matchStock[4]} ${matchStock[5]})`;
  }

  const matchRupture = message.match(/Rupture imminente\s*:\s*(.*)/);
  if (matchRupture) {
    const itemTranslated = translateIngredientHelper(
      matchRupture[1].trim(),
      t.language,
    );
    if (t.language === "en") return `Imminent Shortage: ${itemTranslated}`;
    if (t.language === "es") return `Ruptura inminente: ${itemTranslated}`;
    if (t.language === "de") return `Drohender Engpass: ${itemTranslated}`;
    if (t.language === "it") return `Esaurimento imminente: ${itemTranslated}`;
  }

  const matchPrice = message.match(
    /Hausse de prix >10% sur le (.*?)\s*\(Fournisseur A\)/,
  );
  if (matchPrice) {
    const itemTranslated = translateIngredientHelper(
      matchPrice[1].trim(),
      t.language,
    );
    if (t.language === "en")
      return `Price increase >10% on ${itemTranslated} (Supplier A)`;
    if (t.language === "es")
      return `Aumento de precio >10% en ${itemTranslated} (Proveedor A)`;
    if (t.language === "de")
      return `Preisanstieg >10% bei ${itemTranslated} (Lieferant A)`;
    if (t.language === "it")
      return `Aumento del prezzo >10% su ${itemTranslated} (Fornitore A)`;
  }

  return message;
}


const getCostModifier = (unit?: string) => {
  const u = (unit || '').toLowerCase().trim();
  if (u === 'g' || u === 'ml') return 0.001;
  if (u === 'cl') return 0.01;
  if (u === 'mg') return 0.000001;
  return 1;
};

const getIngredientEffectivePrice = (ing: any) => {
  const basePrice = (ing.unit_price || ing.price || 0) * getCostModifier(ing.unit);
  const yieldPercent = (ing.yield_percent !== undefined) ? ing.yield_percent : 100;
  if (yieldPercent <= 0) return basePrice;
  return basePrice / (yieldPercent / 100);
};

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [cartItems, setCartItems] = useState<any[]>(INITIAL_CART);
  const [settings, setSettings] = useState<any>({
    model_name: "llama3.2-vision",
    custom_model: "gemma-12b-it-qat",
    ollama_url: "http://localhost:11434/api/generate",
    copilot_mode: true,
    auto_pause: true,
    language: "fr",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [manualPurchaseIds, setManualPurchaseIds] = useState<Set<string>>(
    new Set(),
  );
  const [trialStatus, setTrialStatus] = useState<{
    isExpired: boolean;
    daysLeft: number;
    isUnlocked?: boolean;
    machineId?: string;
  } | null>(null);
  const [unlockKey, setUnlockKey] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showNotification = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const t = { ...TRANSLATIONS.fr, ...(TRANSLATIONS[settings.language] || {}) };

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobileStatus = () => {
      // On considère smartphone si largeur < 1024 (Tablette/Mobile)
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobileStatus();
    window.addEventListener("resize", checkMobileStatus);
    return () => window.removeEventListener("resize", checkMobileStatus);
  }, []);

  useEffect(() => {
    // Si on est sur smartphone et qu'on est sur un onglet interdit, on redirige vers HACCP
    if (
      isMobile &&
      activeTab !== "documents" &&
      activeTab !== "haccp" &&
      activeTab !== "inventory"
    ) {
      setActiveTab("inventory");
    }
  }, [isMobile, activeTab]);

  useEffect(() => {
    fetch("/api/trial-status")
      .then((res) => res.json())
      .then((data) => setTrialStatus(data))
      .catch(console.error);
  }, []);

  const handleUnlock = async () => {
    setUnlockError("");
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: unlockKey }),
      });
      if (res.ok) {
        setTrialStatus((prev) => (prev ? { ...prev, isUnlocked: true } : null));
      } else {
        setUnlockError("Clé d'activation invalide.");
      }
    } catch (e) {
      setUnlockError("Erreur de connexion.");
    }
  };

  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings((prev: any) => ({ ...prev, ...data }));
        setIsSettingsLoaded(true);
      })
      .catch((err) => {
        console.warn(
          "Backend non disponible, utilisation des paramètres par défaut.",
        );
        setIsSettingsLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (isSettingsLoaded) {
      // Persist settings to backend
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      }).catch((err) => console.error("Error saving settings:", err));
    }
  }, [settings, isSettingsLoaded]);

  useEffect(() => {
    const handleSearch = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        setShowSearchDropdown(false);
        return;
      }
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(searchQuery)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results);
          setShowSearchDropdown(true);
        }
      } catch (e) {
        console.error("Search error", e);
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(handleSearch, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch("/api/alerts");
        if (res.ok) setAlerts(await res.json());
      } catch (e: any) {
        if (e && e.message === "Failed to fetch") return;
        console.error("Alerts fetch error", e);
      }
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".search-container")) {
        setShowSearchDropdown(false);
      }
      if (!target.closest(".alerts-container")) {
        setShowAlerts(false);
      }
      if (!target.closest(".profile-container")) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleVoiceCommand = async (command: string) => {
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: command }),
      });
      const result = await response.json();

      if (result.response) {
        // Synthèse vocale locale (système)
        const utterance = new SpeechSynthesisUtterance(result.response);
        utterance.lang = "fr-FR";
        window.speechSynthesis.speak(utterance);
      }

      if (result.intent === "add_to_cart") {
        const newItem = {
          id: Date.now(),
          item: result.item,
          quantity: result.quantity,
          unit: result.unit,
          supplier: "À déterminer",
          price: 0,
          total: 0,
        };
        setCartItems((prev) => [...prev, newItem]);
      }
    } catch (error) {
      console.error("Erreur commande vocale:", error);
    }
  };

  if (trialStatus?.isExpired && !trialStatus?.isUnlocked) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-8">
        <div className="bg-black border border-amber-500/20 max-w-lg w-full p-10 rounded-3xl shadow-2xl shadow-amber-500/5 text-center">
          <div className="w-20 h-20 mx-auto bg-amber-500/10 rounded-full flex items-center justify-center mb-6">
            <Lock className="w-10 h-10 text-amber-500" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-widest uppercase mb-4">
            {t.trialEndedTitle || "Période d'Essai Terminée"}
          </h1>
          <p className="text-slate-400 mb-8 leading-relaxed">
            Votre période d'essai de 30 jours a expiré. Pour continuer à
            profiter de toutes les fonctionnalités en local, veuillez activer
            votre licence.
          </p>

          <div className="mb-8 p-4 bg-black border border-slate-800 rounded-xl">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">
              {t.machineIdSupport ||
                "Identifiant Machine (à communiquer au support)"}
            </p>
            <p className="text-2xl font-mono font-bold text-amber-400 tracking-widest">
              {trialStatus.machineId}
            </p>
          </div>

          <div className="mb-8 text-left">
            <label className="block text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">
              {t.enterActivationKey || "Entrer la clé d'activation"}
            </label>
            <input
              type="text"
              value={unlockKey}
              onChange={(e) => setUnlockKey(e.target.value.toUpperCase())}
              placeholder={t.exLicense || "Ex: XXXX-XXXX-XXXX"}
              className="w-full bg-[#0a0a0a] border border-slate-800 focus:border-amber-500/50 text-white rounded-xl px-4 py-3 font-mono tracking-widest outline-none transition-colors uppercase"
            />
            {unlockError && (
              <p className="text-red-500 text-sm mt-2 font-medium">
                {unlockError}
              </p>
            )}
          </div>

          <button
            onClick={handleUnlock}
            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-[0_0_20px_rgba(217,119,6,0.3)] border border-amber-400/30 flex items-center justify-center"
          >
            <Zap className="w-5 h-5 mr-3" />
            Débloquer le logiciel
          </button>
        </div>
      </div>
    );
  }

  if (!isSettingsLoaded) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} t={t} />;
  }

  return (
    <div className="flex h-screen bg-[#0A0A0A] font-sans text-slate-200 selection:bg-emerald-500/30 selection:text-emerald-200 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-teal-500/10 blur-[100px] rounded-full pointer-events-none"></div>

      {/* Sidebar - Mobile: drawer, Desktop: always visible/toggleable */}
      <aside
        className={`${isSidebarOpen ? "w-full md:w-72" : "hidden md:flex md:w-20"} fixed md:static inset-y-0 left-0 bg-obsidian border-r border-white/5 flex flex-col transition-all duration-500 ease-in-out z-50 shadow-2xl shadow-black`}
      >
        {/* Mobile close button */}
        <button
          onClick={() => setIsSidebarOpen(false)}
          className="md:hidden p-4 absolute top-2 right-2 text-white"
        >
          <X />
        </button>

        <div className="h-16 md:h-20 flex items-center px-4 md:px-6 mb-2">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-brand-500 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/20 glow-emerald">
              <ChefHat className="w-6 h-6 md:w-7 md:h-7 text-obsidian" />
            </div>
            {isSidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col"
              >
                <span className="text-xl font-black text-white tracking-tighter leading-none">
                  Restauration IO
                </span>
                <span className="text-[10px] font-mono text-brand-500 uppercase tracking-widest mt-1">
                  Logiciel de Gestion
                </span>
              </motion.div>
            )}
          </div>
        </div>

        <nav className="flex-1 px-1 py-1 overflow-y-auto custom-scrollbar">
          <div className="mb-2">
            {isSidebarOpen && (
              <p className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">
                {t.principal}
              </p>
            )}
            {!isMobile && (
              <NavItem
                icon={<LayoutDashboard className="w-6 h-6" />}
                label={t.dashboard}
                isActive={activeTab === "dashboard"}
                onClick={() => {
                  setActiveTab("dashboard");
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                isOpen={isSidebarOpen}
              />
            )}
            <NavItem
              icon={<PackageSearch className="w-6 h-6" />}
              label={t.inventory}
              isActive={activeTab === "inventory"}
              onClick={() => {
                setActiveTab("inventory");
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              isOpen={isSidebarOpen}
            />
          </div>
          <div className="mb-2">
            {isSidebarOpen && (
              <p className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">
                {t.operations}
              </p>
            )}
            {!isMobile && (
              <>
                <NavItem
                  icon={<BookOpen className="w-6 h-6" />}
                  label={t.menus}
                  isActive={activeTab === "menus"}
                  onClick={() => {
                    setActiveTab("menus");
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }}
                  isOpen={isSidebarOpen}
                />
                <NavItem
                  icon={<ClipboardList className="w-6 h-6" />}
                  label={t.recipes}
                  isActive={activeTab === "recipes"}
                  onClick={() => {
                    setActiveTab("recipes");
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }}
                  isOpen={isSidebarOpen}
                />
                <NavItem
                  icon={<CheckCircle2 className="w-6 h-6" />}
                  label={t.productionPlan || "Plan Production"}
                  isActive={activeTab === "production"}
                  onClick={() => {
                    setActiveTab("production");
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }}
                  isOpen={isSidebarOpen}
                />
                <NavItem
                  icon={<ShoppingCart className="w-6 h-6" />}
                  label={t.purchasing}
                  isActive={activeTab === "purchasing"}
                  onClick={() => {
                    setActiveTab("purchasing");
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }}
                  isOpen={isSidebarOpen}
                />
              </>
            )}
            <NavItem
              icon={<FileText className="w-6 h-6" />}
              label={t.documents}
              isActive={activeTab === "documents"}
              onClick={() => {
                setActiveTab("documents");
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              isOpen={isSidebarOpen}
            />
            {!isMobile && (
              <NavItem
                icon={<Calendar className="w-6 h-6" />}
                label={t.staffPlanning || "Gestion du Personnel"}
                isActive={activeTab === "staff-planning"}
                onClick={() => {
                  setActiveTab("staff-planning");
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                isOpen={isSidebarOpen}
              />
            )}
            <NavItem
              icon={<Thermometer className="w-6 h-6" />}
              label={t.haccp}
              isActive={activeTab === "haccp"}
              onClick={() => {
                setActiveTab("haccp");
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              isOpen={isSidebarOpen}
            />
            {!isMobile && (
              <NavItem
                icon={<Sparkles className="w-6 h-6" />}
                label={t.antiWaste}
                isActive={activeTab === "anti-waste"}
                onClick={() => {
                  setActiveTab("anti-waste");
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                isOpen={isSidebarOpen}
              />
            )}
          </div>

          {!isMobile && (
            <div className="mb-2">
              {isSidebarOpen && (
                <p className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">
                  {t.intelligence}
                </p>
              )}
              <NavItem
                icon={<MessageSquare className="w-6 h-6" />}
                label={t.chat}
                isActive={activeTab === "chat"}
                onClick={() => {
                  setActiveTab("chat");
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                isOpen={isSidebarOpen}
              />
              <NavItem
                icon={<Bot className="w-6 h-6" />}
                label={t.robots}
                isActive={activeTab === "robots"}
                onClick={() => {
                  setActiveTab("robots");
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                isOpen={isSidebarOpen}
              />
              <NavItem
                icon={<FlaskConical className="w-6 h-6" />}
                label={t.epicureStudio || "Studio Epicure"}
                isActive={activeTab === "epicure-studio"}
                onClick={() => {
                  setActiveTab("epicure-studio");
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                isOpen={isSidebarOpen}
              />
            </div>
          )}
        </nav>

        {trialStatus &&
          !trialStatus.isExpired &&
          !trialStatus.isUnlocked &&
          isSidebarOpen && (
            <div className="p-4 mx-4 mb-2 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
              <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1 flex items-center">
                <Zap className="w-3 h-3 mr-1" />
                {t.freeTrial || "Essai Gratuit"}
              </p>
              <p className="text-xs text-amber-500/80 font-medium">
                {(
                  t.trialDaysLeft || "Il vous reste {days} jours d'essai."
                ).replace("{days}", trialStatus.daysLeft.toString())}
              </p>
            </div>
          )}

        {trialStatus &&
          trialStatus.isExpired &&
          !trialStatus.isUnlocked &&
          isSidebarOpen && (
            <div className="p-4 mx-4 mb-2 bg-red-500/10 border border-red-500/20 rounded-2xl">
              <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1 flex items-center">
                <Lock className="w-3 h-3 mr-1" />
                {t.trialExpired || "Essai Terminé"}
              </p>
            </div>
          )}

        <div className="p-4 border-t border-white/5">
          <NavItem
            icon={<Settings className="w-5 h-5" />}
            label={t.settings}
            isActive={activeTab === "settings"}
            onClick={() => {
              setActiveTab("settings");
              if (window.innerWidth < 768) setIsSidebarOpen(false);
            }}
            isOpen={isSidebarOpen}
          />
        </div>
      </aside>

      {/* Overlay for mobile drawer */}
      {isSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-obsidian">
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: "-50%" }}
              animate={{ opacity: 1, y: 100, x: "-50%" }}
              exit={{ opacity: 0, y: -20, x: "-50%" }}
              className={`fixed z-[9999] top-12 left-1/2 px-6 py-3 rounded-full text-sm font-bold shadow-2xl flex items-center gap-2 border border-white/10 backdrop-blur-xl ${
                notification.type === "success"
                  ? "bg-emerald-500/90 text-white shadow-emerald-500/20"
                  : "bg-red-500/90 text-white shadow-red-500/20"
              }`}
            >
              {notification.type === "success" ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              {notification.message}
            </motion.div>
          )}
        </AnimatePresence>
        {/* Header */}
        <header className="h-16 md:h-20 bg-obsidian/80 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-4 md:px-8 z-30 flex-none">
          <div className="flex items-center">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 md:p-3 rounded-2xl hover:bg-white/5 text-slate-400 hover:text-white transition-all duration-300"
            >
              <MenuIcon className="w-5 h-5 md:w-6 md:h-6" />
            </button>
            <div className="ml-3 md:ml-6">
              <h1 className="text-lg md:text-xl font-bold text-white tracking-tight">
                {activeTab === "dashboard"
                  ? t.dashboard
                  : t[activeTab] ||
                    activeTab
                      .split("-")
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(" ")}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-1 h-1 rounded-full bg-brand-500 animate-pulse"></div>
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest leading-none">
                  {t.systemOperational} • {settings.model_name}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-8">
            <div className="relative group hidden md:block search-container">
              <Search
                className={`w-4 h-4 absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors ${isSearching ? "text-brand-500 animate-pulse" : "text-slate-500 group-focus-within:text-brand-500"}`}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() =>
                  searchQuery.length >= 2 && setShowSearchDropdown(true)
                }
                placeholder={t.searchPlaceholder}
                className="pl-12 pr-6 py-3 bg-white/5 border border-transparent focus:border-brand-500/30 rounded-2xl text-sm text-white focus:outline-none focus:ring-8 focus:ring-brand-500/5 transition-all w-80 font-medium placeholder:text-slate-600"
              />

              <AnimatePresence>
                {showSearchDropdown && searchResults.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full left-0 w-full mt-4 bg-obsidian border border-white/10 rounded-2xl shadow-2xl shadow-black overflow-hidden z-50 backdrop-blur-xl"
                  >
                    <div className="p-2">
                      {searchResults.map((result, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setActiveTab(
                              result.type === "inventory"
                                ? "inventory"
                                : "recipes",
                            );
                            setShowSearchDropdown(false);
                            setSearchQuery("");
                          }}
                          className="w-full flex items-center gap-4 p-3 hover:bg-white/5 rounded-xl transition-colors text-left group"
                        >
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${result.type === "inventory" ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"}`}
                          >
                            {result.type === "inventory" ? (
                              <PackageSearch className="w-5 h-5" />
                            ) : (
                              <ClipboardList className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white group-hover:text-brand-500 transition-colors">
                              {result.title}
                            </p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                              {result.subtitle}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative alerts-container">
                <button
                  onClick={() => setShowAlerts(!showAlerts)}
                  className={`relative p-3 rounded-2xl transition-all duration-300 ${showAlerts ? "bg-brand-500/10 text-brand-500" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                >
                  <Bell className="w-6 h-6" />
                  {alerts.length > 0 && (
                    <span className="absolute top-3 right-3 w-2 h-2 bg-brand-500 rounded-full ring-4 ring-obsidian"></span>
                  )}
                </button>

                <AnimatePresence>
                  {showAlerts && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full right-0 w-80 mt-4 bg-obsidian border border-white/10 rounded-2xl shadow-2xl shadow-black overflow-hidden z-50 backdrop-blur-xl"
                    >
                      <div className="p-4 border-b border-white/5 flex justify-between items-center">
                        <h3 className="font-bold text-white">
                          {t.notifications}
                        </h3>
                        <span className="text-[10px] font-mono text-brand-500 uppercase tracking-widest">
                          {alerts.length} {t.active}
                        </span>
                      </div>
                      <div className="max-h-96 overflow-y-auto custom-scrollbar">
                        {alerts.length > 0 ? (
                          alerts.map((alert) => (
                            <div
                              key={alert.id}
                              className="p-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                            >
                              <div className="flex gap-3">
                                <div
                                  className={`mt-1 w-2 h-2 rounded-full shrink-0 ${alert.severity === "high" ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"}`}
                                ></div>
                                <div>
                                  <p className="text-xs text-slate-300 leading-relaxed group-hover:text-white transition-colors">
                                    {translateAlertMessage(
                                      alert.message,
                                      t,
                                      translateIngredientHelper,
                                    )}
                                  </p>
                                  <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest font-mono">
                                    ID: {alert.id}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-8 text-center">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-3 opacity-20" />
                            <p className="text-sm text-slate-500">
                              {t.noAlerts}
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-4 pl-4 border-l border-white/10 relative profile-container">
                <div
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="w-12 h-12 bg-emerald-500/10 rounded-2xl shadow-xl shadow-brand-500/5 ring-1 ring-white/10 cursor-pointer flex items-center justify-center text-brand-500 hover:scale-105 active:scale-95 transition-all"
                >
                  <Users className="w-6 h-6" />
                </div>

                <AnimatePresence>
                  {showProfileMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full right-0 w-64 mt-4 bg-obsidian border border-white/10 rounded-2xl shadow-2xl shadow-black overflow-hidden z-50 backdrop-blur-xl"
                    >
                      <div className="p-2">
                        <button className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl transition-colors text-left text-sm text-slate-300 hover:text-white">
                          <Users className="w-4 h-4" />
                          {t.profile}
                        </button>
                        <button
                          onClick={() => setActiveTab("settings")}
                          className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl transition-colors text-left text-sm text-slate-300 hover:text-white"
                        >
                          <Settings className="w-4 h-4" />
                          {t.settings}
                        </button>
                        <div className="my-2 border-t border-white/5"></div>
                        <button
                          onClick={() => setShowLanding(true)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-red-500/10 rounded-xl transition-colors text-left text-sm text-red-500"
                        >
                          <X className="w-4 h-4" />
                          {t.logout}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div
          className={`flex-1 overflow-auto ${activeTab === "chat" ? "p-0" : "p-10"} custom-scrollbar relative`}
        >
          {activeTab === "dashboard" && (
            <div className="animate-in fade-in duration-200">
              <DashboardOverview t={t} settings={settings} />
            </div>
          )}
          {activeTab === "menus" && (
            <div className="animate-in fade-in duration-200">
              <MenuAnalysis
                cartItems={cartItems}
                setCartItems={setCartItems}
                setActiveTab={setActiveTab}
                t={t}
                settings={settings}
                showNotification={showNotification}
              />
            </div>
          )}
          {activeTab === "robots" && (
            <div className="animate-in fade-in duration-200">
              <RobotManagement t={t} />
            </div>
          )}
          {activeTab === "inventory" && (
            <div className="animate-in fade-in duration-200">
              <InventoryAudit
                t={t}
                translateIngredient={translateIngredientHelper}
                settings={settings}
                onAddToCart={(item) => setCartItems((prev) => [...prev, item])}
                onAddToPurchasing={(id) =>
                  setManualPurchaseIds((prev) => new Set([...prev, id]))
                }
                showNotification={showNotification}
              />
            </div>
          )}
          {activeTab === "production" && (
            <div className="animate-in fade-in duration-200">
              <ProductionPlan
                cartItems={cartItems}
                setCartItems={setCartItems}
                t={t}
                showNotification={showNotification}
                isActive={activeTab === "production"}
              />
            </div>
          )}
          {activeTab === "staff-planning" && (
            <div className="animate-in fade-in duration-200">
              <StaffPlanning t={t} />
            </div>
          )}
          {activeTab === "purchasing" && (
            <div className="animate-in fade-in duration-200">
              <PurchasingTab
                t={t}
                translateIngredient={translateIngredientHelper}
                manualIds={manualPurchaseIds}
              />
            </div>
          )}
          {activeTab === "quality" && (
            <div className="animate-in fade-in duration-200">
              <QualityControl t={t} />
            </div>
          )}
          {activeTab === "haccp" && (
            <div className="animate-in fade-in duration-200">
              <Haccp t={t} translateIngredient={translateIngredientHelper} />
            </div>
          )}
          {activeTab === "anti-waste" && (
            <div className="animate-in fade-in duration-200">
              <AntiWaste t={t} />
            </div>
          )}
          {activeTab === "epicure-studio" && (
            <div className="animate-in fade-in duration-200">
              <EpicureStudio
                t={t}
                settings={settings}
              />
            </div>
          )}
          {activeTab === "documents" && (
            <div className="animate-in fade-in duration-200">
              <DocumentManager t={t} />
            </div>
          )}
          {activeTab === "recipes" && (
            <div className="animate-in fade-in duration-200">
              <FichesTechniques
                activeTab={activeTab}
                cartItems={cartItems}
                setCartItems={setCartItems}
                t={t}
                showNotification={showNotification}
              />
            </div>
          )}
          {activeTab === "chat" && (
            <div className="h-full animate-in fade-in duration-200">
              <CulinaryChat t={t} settings={settings} />
            </div>
          )}
          {activeTab === "settings" && (
            <div className="animate-in fade-in duration-200">
              <SettingsView
                settings={settings}
                setSettings={setSettings}
                t={t}
                trialStatus={trialStatus}
                setTrialStatus={setTrialStatus}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// Subcomponents

function NavItem({
  icon,
  label,
  isActive,
  onClick,
  isOpen,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isOpen: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center ${isOpen ? "justify-start px-4" : "justify-center"} py-1.5 mb-1 transition-all duration-500 group relative overflow-hidden ${
        isActive
          ? "side-light-active text-white"
          : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
      }`}
      title={!isOpen ? label : undefined}
    >
      {isActive && (
        <>
          <div className="side-light-filament"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-brand-500/10 to-transparent -z-10"></div>
        </>
      )}
      <span
        className={`${isActive ? "text-brand-500 scale-105" : "text-slate-500 group-hover:text-slate-300 group-hover:scale-105"} transition-all duration-300 relative z-10 mr-1`}
      >
        {icon}
      </span>
      {isOpen && (
        <span
          className={`ml-3 font-bold text-base tracking-tight whitespace-nowrap overflow-hidden relative z-10 ${isActive ? "text-white led-text-glow" : "text-slate-500 group-hover:text-slate-200"}`}
        >
          {label}
        </span>
      )}
    </button>
  );
}

function SettingsView({
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
        alert("Licence activée avec succès !");
        fetchLicense();
      } else {
        alert("Clé invalide.");
      }
    } catch (e) {
      alert("Erreur serveur.");
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
      alert(t.saveSuccess);
    } catch (e) {
      alert(t.syncError);
    }
  };

  const handleBackup = async () => {
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ ${t.active}: ${data.message}`);
      } else {
        throw new Error(data.message || "Server error");
      }
    } catch (e) {
      console.error("Backup error:", e);
      alert(t.syncError);
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

function DashboardOverview({ t, settings }: { t: any; settings: any }) {
  const [stats, setStats] = useState({
    totalStockValue: 0,
    activeAlerts: 0,
    criticalItems: 0,
    monthlyTrend: "0%",
    dailyLaborCost: 0,
  });
  const [costData, setCostData] = useState<any[]>([]);
  const [stockData, setStockData] = useState<any[]>([]);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 7))
      .toISOString()
      .split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

  const testSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 250" width="300" height="250" fill="none">
    <path stroke="#555" stroke-width="1.2" d="M30,170 Q150,210 270,170 Q150,130 30,170" />
    <path stroke="#555" stroke-width="0.8" d="M40,170 Q150,200 260,170" opacity="0.5" />
    <path stroke="#d4ab28" stroke-width="1.5" d="M100,160 Q120,130 150,120 Q180,130 200,160 Q180,180 150,185 Q120,180 100,160" />
    <path stroke="#d4ab28" stroke-width="1" d="M110,150 Q130,125 160,125 Q180,140 190,160" />
    <path stroke="#d4ab28" stroke-width="1.2" d="M115,165 Q140,180 170,175 Q185,160 175,145" />
    <path stroke="#d4ab28" stroke-width="0.8" d="M130,135 Q150,105 170,140" />
    <path stroke="#d4ab28" stroke-width="1" d="M120,155 Q130,175 160,165" />
    <path stroke="#d4ab28" stroke-width="1.5" d="M90,165 Q150,195 210,165" opacity="0.6"/>
    <circle cx="150" cy="115" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="156" cy="118" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="145" cy="117" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="152" cy="111" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="146" cy="112" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="158" cy="112" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="162" cy="119" r="2.5" stroke="#222" stroke-width="2" />
    <circle cx="140" cy="122" r="2.5" stroke="#222" stroke-width="2" />
    <path stroke="#888" stroke-width="1" d="M110,145 Q115,140 120,148 Q115,152 110,145" />
    <path stroke="#888" stroke-width="1" d="M175,165 Q182,160 188,168 Q182,175 175,165" />
    <path stroke="#888" stroke-width="1" d="M140,170 Q145,165 150,175 Q145,180 140,170" />
    <path stroke="#555" stroke-width="0.8" d="M140,90 Q145,100 148,108" fill="none" />
    <path stroke="#555" stroke-width="0.8" d="M165,85 Q160,95 157,105" fill="none" />
    <text x="110" y="85" font-family="'Caveat', cursive" font-size="20" fill="#444" transform="rotate(-5, 110, 85)">CAVIAR !!!</text>
    <path stroke="#555" stroke-width="0.8" d="M190,105 Q180,120 170,125" fill="none" />
    <text x="195" y="100" font-family="'Caveat', cursive" font-size="16" fill="#444" transform="rotate(2, 195, 100)">BOUILLON CALAMARS</text>
    <path stroke="#555" stroke-width="0.8" d="M225,120 Q195,125 185,135" fill="none" />
    <text x="230" y="115" font-family="'Caveat', cursive" font-size="14" fill="#444">LINGUINES AU</text>
    <text x="230" y="130" font-family="'Caveat', cursive" font-size="14" fill="#444">BOUILLON</text>
    <path stroke="#555" stroke-width="0.8" d="M225,155 Q205,150 185,160" fill="none" />
    <text x="230" y="160" font-family="'Caveat', cursive" font-size="14" fill="#444" transform="rotate(-1, 230, 160)">HUITRES BASSE TEMP.</text>
  </svg>
`;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, costRes, stockRes] = await Promise.all([
          fetch("/api/dashboard/stats"),
          fetch(
            `/api/dashboard/cost-data?start=${dateRange.start}&end=${dateRange.end}`,
          ),
          fetch("/api/dashboard/stock-data"),
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (costRes.ok) setCostData(await costRes.json());
        if (stockRes.ok) {
          const rawStock = await stockRes.json();
          const hasValues = rawStock.some((d: any) => d.value > 0);
          if (!hasValues) {
            setStockData([
              {
                name: t.noData || "Aucune donnée",
                value: 1,
                isEmpty: true,
                color: "#334155",
              },
            ]);
          } else {
            setStockData(rawStock.filter((d: any) => d.value > 0));
          }
        }
      } catch (e) {
        console.error("Erreur de chargement des données dashboard", e);
      }
    };
    fetchData();
  }, [dateRange]);

  const translateCat = (cat: string) => {
    const map: Record<string, string> = {
      Sec: t.catDry || "Sec",
      Crémerie: t.catDairy || "Crémerie",
      Viande: t.catMeat || "Viande",
      Viandes: t.catMeat || "Viandes",
      Poisson: t.catFish || "Poisson",
      Légumes: t.catVeg || "Légumes",
      Fruits: t.catFruit || "Fruits",
      Pâtisserie: t.catPastry || "Pâtisserie",
    };
    return map[cat] || cat;
  };

  const translateDayName = (day: string) => {
    const map: Record<string, string> = {
      Lun: t.monday ? t.monday.substring(0, 3) : "Mon",
      Mar: t.tuesday ? t.tuesday.substring(0, 3) : "Tue",
      Mer: t.wednesday ? t.wednesday.substring(0, 3) : "Wed",
      Jeu: t.thursday ? t.thursday.substring(0, 3) : "Thu",
      Ven: t.friday ? t.friday.substring(0, 3) : "Fri",
      Sam: t.saturday ? t.saturday.substring(0, 3) : "Sat",
      Dim: t.sunday ? t.sunday.substring(0, 3) : "Sun",
    };
    return map[day] || day;
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap gap-4 items-center p-1">
        <div className="glass-panel px-4 py-3 flex items-center gap-3 border border-white/5 rounded-2xl bg-black/40 backdrop-blur-md shadow-lg shadow-black/20 hover:border-emerald-500/30 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] transition-all duration-500 group">
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest group-hover:text-emerald-400/70 transition-colors">
            {t.start}:
          </label>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, start: e.target.value }))
            }
            className="bg-transparent text-slate-200 outline-none text-sm font-mono cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert-[0.8]"
          />
        </div>
        <div className="glass-panel px-4 py-3 flex items-center gap-3 border border-white/5 rounded-2xl bg-black/40 backdrop-blur-md shadow-lg shadow-black/20 hover:border-indigo-500/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all duration-500 group">
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest group-hover:text-indigo-400/70 transition-colors">
            {t.end}:
          </label>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, end: e.target.value }))
            }
            className="bg-transparent text-slate-200 outline-none text-sm font-mono cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert-[0.8]"
          />
        </div>
      </div>
      {/* Bento Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <motion.div
          whileHover={{ y: -5 }}
          onClick={() => setActiveCard("stock")}
          className={`glass-panel p-4 md:p-6 relative overflow-hidden group cursor-pointer transition-all duration-500 ${
            activeCard === "stock"
              ? "side-light-active border-brand-500/50"
              : "led-glow-emerald border-brand-500/30"
          }`}
        >
          {activeCard === "stock" && (
            <div className="side-light-filament"></div>
          )}
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity led-icon-glow">
            <ShoppingCart className="w-16 h-16 text-brand-500" />
          </div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            {t.stockValue || "Valeur Stock"}
          </h3>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white tracking-tighter font-mono led-text-glow">
              {(stats.totalStockValue || 0).toLocaleString()}
            </span>
            <span className="text-brand-500 font-bold"></span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></div>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              {t.liveActive || "Actif en direct"}
            </span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -5 }}
          onClick={() => setActiveCard("alerts")}
          className={`glass-panel p-4 md:p-6 relative overflow-hidden group cursor-pointer transition-all duration-500 ${
            activeCard === "alerts"
              ? "side-light-active-amber border-amber-500/50"
              : "led-glow-amber border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.05)] hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]"
          }`}
        >
          {activeCard === "alerts" && (
            <div
              className="side-light-filament"
              style={{
                backgroundColor: "#f59e0b",
                boxShadow:
                  "0 0 10px #f59e0b, 0 0 20px #f59e0b, 0 0 40px rgba(245,158,11,0.8), 10px 0 60px rgba(245,158,11,0.4)",
              }}
            ></div>
          )}
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
            <AlertTriangle className="w-16 h-16 text-amber-500" />
          </div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            {t.criticalAlerts || "Alertes Critiques"}
          </h3>
          <div className="flex items-baseline gap-2">
            <span
              className="text-4xl font-black text-amber-500 tracking-tighter font-mono"
              style={{ textShadow: "0 0 10px rgba(245,158,11,0.4)" }}
            >
              {stats.activeAlerts}
            </span>
            <span className="text-slate-500 text-sm font-bold">
              {t.items || "Items"}
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              {stats.criticalItems} {t.shortages || "Ruptures"}
            </span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -5 }}
          onClick={() => setActiveCard("robots")}
          className={`glass-panel p-4 md:p-6 relative overflow-hidden group cursor-pointer transition-all duration-500 ${
            activeCard === "robots"
              ? "side-light-active-blue border-blue-500/50"
              : "led-glow-blue border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.05)] hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]"
          }`}
        >
          {activeCard === "robots" && (
            <div
              className="side-light-filament"
              style={{
                backgroundColor: "#3b82f6",
                boxShadow:
                  "0 0 10px #3b82f6, 0 0 20px #3b82f6, 0 0 40px rgba(59,130,246,0.8), 10px 0 60px rgba(59,130,246,0.4)",
              }}
            ></div>
          )}
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
            <Bot className="w-16 h-16 text-blue-500" />
          </div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            {t.robotFleet}
          </h3>
          <div className="flex items-baseline gap-2">
            <span
              className="text-4xl font-black text-blue-500 tracking-tighter font-mono"
              style={{ textShadow: "0 0 10px rgba(59,130,246,0.4)" }}
            >
              03
            </span>
            <span className="text-slate-500 text-sm font-bold">
              {t.units || "Unités"}
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              {t.connected || "Connectés"}
            </span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -5 }}
          onClick={() => setActiveCard("labor")}
          className={`glass-panel p-4 md:p-6 relative overflow-hidden group cursor-pointer transition-all duration-500 ${
            activeCard === "labor"
              ? "side-light-active-purple border-purple-500/50"
              : "led-glow-purple border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.05)] hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]"
          }`}
        >
          {activeCard === "labor" && (
            <div
              className="side-light-filament"
              style={{
                backgroundColor: "#a855f7",
                boxShadow:
                  "0 0 10px #a855f7, 0 0 20px #a855f7, 0 0 40px rgba(168,85,247,0.8), 10px 0 60px rgba(168,85,247,0.4)",
              }}
            ></div>
          )}
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
            <Clock className="w-16 h-16 text-purple-500" />
          </div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            {t.dailyLaborCost || "Coût Main d'Œuvre"}
          </h3>
          <div className="flex items-baseline gap-2">
            <span
              className="text-4xl font-black text-purple-500 tracking-tighter font-mono"
              style={{ textShadow: "0 0 10px rgba(168,85,247,0.4)" }}
            >
              {Math.round(stats.dailyLaborCost || 0)}
            </span>
            <span className="text-brand-500 font-bold"></span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></div>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              {t.today || "Aujourd'hui"}
            </span>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div
          onClick={() => setActiveCard("costs")}
          className={`lg:col-span-2 glass-panel p-4 md:p-6 relative overflow-hidden cursor-pointer transition-all duration-500 ${
            activeCard === "costs"
              ? "side-light-active border-brand-500/50"
              : ""
          }`}
        >
          {activeCard === "costs" && (
            <div className="side-light-filament"></div>
          )}
          <div className="flex items-center justify-between mb-10">
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                {t.costAnalysis || "Analyse des Coûts"}
              </h3>
              <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
                {t.financialFlow || "Flux financier sur 7 jours"}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {t.foodCost || "Matière"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {t.laborCost || "Main d'Œuvre"}
                </span>
              </div>
            </div>
          </div>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={costData.map((d) => ({
                  ...d,
                  name: translateDayName(d.name),
                }))}
              >
                <defs>
                  <linearGradient id="colorCout" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorLabor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#475569", fontSize: 10, fontWeight: 600 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#475569",
                    fontSize: 10,
                    fontFamily: "JetBrains Mono",
                  }}
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "16px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    backgroundColor: "#050505",
                    boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
                    padding: "12px",
                  }}
                  itemStyle={{
                    fontFamily: "JetBrains Mono",
                    fontWeight: 800,
                    color: "#fff",
                  }}
                  labelStyle={{
                    color: "#64748b",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    marginBottom: "4px",
                  }}
                  cursor={{
                    stroke: "rgba(255, 255, 255, 0.1)",
                    strokeWidth: 2,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cout"
                  name={t.foodCost || "Matière"}
                  stroke="#10b981"
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorCout)"
                  animationDuration={2000}
                />
                <Area
                  type="monotone"
                  dataKey="labor"
                  name={t.laborCost || "Main d'Œuvre"}
                  stroke="#a855f7"
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorLabor)"
                  animationDuration={2000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          onClick={() => setActiveCard("distribution")}
          className={`glass-panel p-4 md:p-6 relative overflow-hidden cursor-pointer transition-all duration-500 ${
            activeCard === "distribution"
              ? "side-light-active border-brand-500/50"
              : ""
          }`}
        >
          {activeCard === "distribution" && (
            <div className="side-light-filament"></div>
          )}
          <h3 className="text-xl font-bold text-white tracking-tight mb-2">
            {t.stockDistribution || "Répartition Stock"}
          </h3>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-10">
            {t.valueByCategory || "Valeur par catégorie"}
          </p>
          <div className="h-[300px] flex items-center justify-center relative">
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                {t.total || "Total"}
              </span>
              <span className="text-2xl font-black text-white tracking-tighter">
                {(stats.totalStockValue || 0).toLocaleString()}
              </span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stockData.map((item) => ({
                    ...item,
                    name: translateCat(item.name),
                  }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={85}
                  outerRadius={110}
                  paddingAngle={8}
                  dataKey="value"
                  animationDuration={1500}
                >
                  {stockData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke="none"
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "16px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    backgroundColor: "#050505",
                    boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
                  }}
                  itemStyle={{ fontFamily: "JetBrains Mono", fontWeight: 800 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {stockData
              .filter((i) => !i.isEmpty)
              .map((item, index) => {
                const translatedName = translateCat(item.name);
                return (
                  <div
                    key={index}
                    className="flex flex-col p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      ></div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate">
                        {translatedName}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-white">
                      {item.value}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuAnalysis({
  cartItems,
  setCartItems,
  setActiveTab,
  t,
  settings,
  showNotification,
}: {
  cartItems?: any[];
  setCartItems?: any;
  setActiveTab?: any;
  t: any;
  settings: any;
  showNotification: (m: string, type?: any) => void;
}) {
  const [analysisMode, setAnalysisMode] = useState<
    "decompose" | "creative" | "gastronomic" | "traditional" | null
  >(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fichesTechniques, setFichesTechniques] = useState<any[] | null>(null);
  const [creativeMenu, setCreativeMenu] = useState<any[] | null>(null);
  const [gastronomicMenu, setGastronomicMenu] = useState<any[] | null>(null);
  const [traditionalMenu, setTraditionalMenu] = useState<any[] | null>(null);
  const [guestCount, setGuestCount] = useState<number>(1);
  const [planningModal, setPlanningModal] = useState<{ recipe: any } | null>(
    null,
  );
  const [planningDate, setPlanningDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [planningMeal, setPlanningMeal] = useState<"LUNCH" | "DINNER">("LUNCH");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddToPlanning = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!planningModal) return;

    try {
      const res = await fetch("/api/menu-planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: planningDate,
          meal_type: planningMeal,
          title:
            planningModal.recipe.nom ||
            planningModal.recipe.name ||
            planningModal.recipe.recette,
          recipe_details: JSON.stringify(planningModal.recipe),
        }),
      });

      if (res.ok) {
        showNotification(t.planningSaved || "Ajouté au planning", "success");
        setPlanningModal(null);
      }
    } catch (err) {
      showNotification("Erreur lors de l'ajout au planning", "error");
    }
  };

  const translateFood = (food: string) => {
    const map: Record<string, string> = {
      Poisson: t.fish,
      Poulet: t.chicken,
      "Pâtes de blé": t.wheatPasta,
      Porc: t.pork,
      Bœuf: t.beef,
      Veau: t.veal,
      Saucisses: t.sausages,
      "Pâtes fraîches ou plat vegan": t.veganPasta,
      Dinde: t.turkey,
      Agneau: t.lamb,
      "Stock résiduel ou Salade de pâtes": t.residualPasta,
      "Plat ++": t.premiumDish,
      "Stock résiduel ou Salade de riz": t.residualRice,
      "Omelette ou œufs brouillés": t.eggs,
      Canard: t.duck,
      Lapin: t.rabbit,
      Omelette: t.omelette,
    };
    return map[food] || food;
  };

  const translateDay = (day: string) => {
    if (!day) return "";
    const lowerDay = day.toLowerCase();
    const map: Record<string, string> = {
      lundi: t.monday,
      monday: t.monday,
      mardi: t.tuesday,
      tuesday: t.tuesday,
      mercredi: t.wednesday,
      wednesday: t.wednesday,
      jeudi: t.thursday,
      thursday: t.thursday,
      vendredi: t.friday,
      friday: t.friday,
      samedi: t.saturday,
      saturday: t.saturday,
      dimanche: t.sunday,
      sunday: t.sunday,
    };
    return map[lowerDay] || day;
  };

  const saveGeneratedRecipes = async (recipes: any[]) => {
    try {
      for (const recipe of recipes) {
        // Robust extraction of name and ingredients
        const recipeName =
          recipe.name ||
          recipe.nom ||
          recipe.recette ||
          recipe.title ||
          recipe.plat_creatif;
        if (!recipeName) continue;

        const rawIngredients =
          recipe.ingredients || recipe.fiche_technique || [];
        const ingredients = (
          Array.isArray(rawIngredients) ? rawIngredients : []
        ).map((ing: any) => ({
          inventory_name: ing.name || ing.nom || ing.ingredient || "Ingrédient",
          quantity_per_person: ing.quantite || ing.qte || 0,
          unit: ing.unite || ing.unit || "g",
        }));

        await fetch("/api/recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: recipeName,
            category: recipe.category || "decompose",
            dish_type: recipe.dish_type || "plat",
            ingredients: ingredients,
            preparation_steps:
              recipe.preparation_steps || recipe.preparation || null,
            source_image_url: recipe.source_image_url || null,
            allergens: recipe.allergens || [],
            skip_svg: true,
          }),
        });
      }
      // Notification de synchronisation
      alert(
        t.syncFTSuccess ||
          "✅ Fiches techniques synchronisées instantanément avec l'onglet dédié.",
      );
    } catch (error) {
      console.error(
        "Erreur lors de la sauvegarde des fiches techniques:",
        error,
      );
    }
  };

  const exportMenuToPDF = (
    titre: string,
    menuArray: any[],
    menuType: "creative" | "gastronomic" | "traditional",
  ) => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(59, 130, 246); // Blueish
    doc.text(titre, 20, 20);

    let y = 35;

    menuArray.forEach((jourMenu, idx) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(16);
      doc.setTextColor(31, 41, 55);
      const dayText =
        translateDay(jourMenu.jour) || t.chefMenu || "MENU DU CHEF";
      doc.text(dayText, 20, y);
      y += 10;

      doc.setFontSize(12);
      doc.setTextColor(107, 114, 128);

      if (menuType === "creative") {
        const renderMeals = (mealObj: any, title: string) => {
          if (!mealObj) return;
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          doc.setFont("helvetica", "bold");
          doc.text(title, 20, y);
          y += 6;
          doc.setFont("helvetica", "normal");

          if (mealObj.plat_creatif || mealObj.description) {
            const text = doc.splitTextToSize(
              mealObj.plat_creatif || mealObj.description || "",
              170,
            );
            doc.text(text, 25, y);
            y += text.length * 6 + 5;
          } else {
            ["entree", "plat", "dessert"].forEach((course) => {
              const dish = mealObj[course];
              if (dish) {
                if (y > 270) {
                  doc.addPage();
                  y = 20;
                }
                doc.setFont("helvetica", "bold");
                const cTitle =
                  course === "entree"
                    ? t.starter || "Entrée"
                    : course === "plat"
                      ? t.mainCourse || "Plat"
                      : t.dessert || "Dessert";
                doc.text(`- ${cTitle}:`, 25, y);
                doc.setFont("helvetica", "normal");
                const text = doc.splitTextToSize(
                  dish.nom || dish.name || dish.plat_creatif || "",
                  150,
                );
                doc.text(text, 50, y);
                y += text.length * 6 + 2;
              }
            });
            y += 5;
          }
        };
        renderMeals(jourMenu.dejeuner, t.lunch || "Déjeuner");
        renderMeals(jourMenu.diner, t.dinner || "Dîner");
      } else {
        ["entree", "plat", "dessert"].forEach((type) => {
          const dish = jourMenu[type];
          if (dish) {
            if (y > 270) {
              doc.addPage();
              y = 20;
            }
            doc.setFont("helvetica", "bold");
            doc.text(
              type === "entree"
                ? t.entree || "Entrée"
                : type === "plat"
                  ? t.plat || "Plat"
                  : t.dessert || "Dessert",
              20,
              y,
            );
            y += 6;
            doc.setFont("helvetica", "normal");
            const platText = doc.splitTextToSize(
              dish.nom || dish.name || "",
              170,
            );
            doc.text(platText, 25, y);
            y += platText.length * 6 + 5;
          }
        });
        y += 5;
      }
    });

    doc.save(`${titre.replace(/\s+/g, "_").toLowerCase()}.pdf`);
  };

  const exportToPDF = (fiche: any) => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129); // Emerald 500
    doc.text(t.recipeFT || "FICHE TECHNIQUE", 20, 20);

    doc.setFontSize(16);
    doc.setTextColor(31, 41, 55); // Gray 800
    doc.text(fiche.recette, 20, 35);

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128); // Gray 500
    doc.text(
      `${t.guests || "Couverts"} : ${typeof guestCount !== "undefined" ? guestCount : 1} | ${t.estimatedLoss || "Perte estimée"} : ${fiche.perte || "10%"}`,
      20,
      45,
    );

    doc.setDrawColor(229, 231, 235);
    doc.line(20, 50, 190, 50);

    let y = 60;

    // Allergens
    if (fiche.allergens && fiche.allergens.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text(t.allergens || "Allergènes :", 20, y);
      y += 8;
      doc.setFontSize(10);
      doc.setTextColor(75, 85, 99);
      doc.text(fiche.allergens.join(", "), 20, y);
      y += 15;
    }

    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text(t.requiredIngredients || "Ingrédients requis :", 20, y);

    // Ingredients Table
    const ingredientsList = fiche.ingredients || fiche.fiche_technique || [];
    const count = typeof guestCount !== "undefined" ? guestCount : 1;

    const tableData = ingredientsList.map((ing: any) => {
      const name = ing.name || ing.ingredient;
      const qte = ing.qte || ing.quantite;
      const unit = ing.unit || ing.unite;

      let totalQte = qte * count;
      let displayUnit = unit;

      if ((unit === "g" || unit === "ml") && totalQte >= 1000) {
        totalQte = totalQte / 1000;
        displayUnit = unit === "g" ? "kg" : "L";
      }

      return [
        name,
        `${totalQte.toFixed(unit === "g" || (unit === "ml" && totalQte >= 1) ? 2 : 0)} ${displayUnit}`,
      ];
    });

    autoTable(doc, {
      startY: y + 5,
      head: [[t.ingredient || "Ingrédient", t.quantity || "Quantité"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129] },
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    // Preparation Steps
    if (fiche.preparation_steps || fiche.instructions) {
      if (finalY > 250) {
        doc.addPage();
        finalY = 20;
      }
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text(t.preparationSteps || "Étapes de préparation :", 20, finalY);
      finalY += 8;
      doc.setFontSize(10);
      doc.setTextColor(75, 85, 99);
      const stepsText = doc.splitTextToSize(
        fiche.preparation_steps || fiche.instructions || "",
        170,
      );
      doc.text(stepsText, 20, finalY);
    }

    doc.save(`Fiche_Technique_${fiche.recette.replace(/\s+/g, "_")}.pdf`);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    await processFile(file);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await processFile(file);
  };

  const handleGenerateCreative = async (dishType?: "entree" | "plat" | "dessert") => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setCreativeMenu(null); // Reset current category data before starting
    try {
      const response = await fetch("/api/generate-creative-menu", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dishType }),
      });
      const data = await response.json();
      if (data.status === "success") {
        setCreativeMenu(data.creative_menu);
        // Sauvegarde automatique des fiches techniques générées
        const allRecipes: any[] = [];
        data.creative_menu.forEach((day: any) => {
          if (day.dejeuner) {
            if (day.dejeuner.plat_creatif)
              allRecipes.push({ ...day.dejeuner, category: "creative", dish_type: "plat" });
            else {
              if (day.dejeuner.entree)
                allRecipes.push({
                  ...day.dejeuner.entree,
                  category: "creative",
                  dish_type: "entree",
                });
              if (day.dejeuner.plat)
                allRecipes.push({ ...day.dejeuner.plat, category: "creative", dish_type: "plat" });
              if (day.dejeuner.dessert)
                allRecipes.push({
                  ...day.dejeuner.dessert,
                  category: "creative",
                  dish_type: "dessert",
                });
            }
          }
          if (day.diner) {
            if (day.diner.plat_creatif)
              allRecipes.push({ ...day.diner, category: "creative", dish_type: "plat" });
            else {
              if (day.diner.entree)
                allRecipes.push({ ...day.diner.entree, category: "creative", dish_type: "entree" });
              if (day.diner.plat)
                allRecipes.push({ ...day.diner.plat, category: "creative", dish_type: "plat" });
              if (day.diner.dessert)
                allRecipes.push({ ...day.diner.dessert, category: "creative", dish_type: "dessert" });
            }
          }
          // New format without dejeuner/diner wrappers
          if (day.entree)
            allRecipes.push({
              ...day.entree,
              category: "creative",
              dish_type: "entree",
              jour: day.jour,
            });
          if (day.plat)
            allRecipes.push({
              ...day.plat,
              category: "creative",
              dish_type: "plat",
              jour: day.jour,
            });
          if (day.dessert)
            allRecipes.push({
              ...day.dessert,
              category: "creative",
              dish_type: "dessert",
              jour: day.jour,
            });
        });
        saveGeneratedRecipes(allRecipes);
      } else {
        alert(
          "Erreur lors de la création : " +
            (data.error || data.message || "Erreur serveur ou IA"),
        );
      }
    } catch (error) {
      console.error("Erreur backend:", error);
      alert(
        "Erreur de connexion au serveur IA (Ollama).",
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateGastronomic = async (dishType?: "entree" | "plat" | "dessert") => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setGastronomicMenu(null);
    try {
      const response = await fetch("/api/generate-gastronomic-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dishType }),
      });
      const data = await response.json();
      if (data.status === "success") {
        setGastronomicMenu(data.gastronomic_menu);
        // Sauvegarde automatique
        const allRecipes: any[] = [];
        data.gastronomic_menu.slice(0, 1).forEach((menu: any) => {
          if (menu.entree)
            allRecipes.push({ ...menu.entree, category: "gastronomic", dish_type: "entree" });
          if (menu.plat)
            allRecipes.push({ ...menu.plat, category: "gastronomic", dish_type: "plat" });
          if (menu.dessert)
            allRecipes.push({ ...menu.dessert, category: "gastronomic", dish_type: "dessert" });
        });
        saveGeneratedRecipes(allRecipes);
      } else {
        alert(
          "Erreur lors de la création : " +
            (data.error || data.message || "Erreur serveur ou IA"),
        );
      }
    } catch (error) {
      console.error("Erreur backend:", error);
      alert("Erreur de connexion au serveur de l'IA.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateTraditional = async (dishType?: "entree" | "plat" | "dessert") => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setTraditionalMenu(null);
    try {
      const response = await fetch("/api/generate-traditional-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week: selectedWeek, dishType }),
      });
      const data = await response.json();
      if (data.status === "success") {
        setTraditionalMenu(data.traditional_menu);
        const allRecipes: any[] = [];
        data.traditional_menu.forEach((day: any) => {
          if (day.entree)
            allRecipes.push({
              ...day.entree,
              category: "traditional",
              dish_type: "entree",
              id: `entree-${day.jour}-${Date.now()}`,
            });
          if (day.plat)
            allRecipes.push({
              ...day.plat,
              category: "traditional",
              dish_type: "plat",
              id: `plat-${day.jour}-${Date.now()}`,
            });
          if (day.dessert)
            allRecipes.push({
              ...day.dessert,
              category: "traditional",
              dish_type: "dessert",
              id: `dessert-${day.jour}-${Date.now()}`,
            });
        });
        saveGeneratedRecipes(allRecipes);
      } else {
        alert(
          "Erreur lors de la création : " +
            (data.error || data.message || "Erreur serveur ou IA"),
        );
      }
    } catch (error) {
      console.error("Erreur backend:", error);
      alert("Erreur de connexion au serveur de l'IA.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processFile = async (file: File) => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);

    // Reset data based on mode
    if (analysisMode === "decompose") setFichesTechniques(null);
    else setCreativeMenu(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("week", selectedWeek.toString());
    formData.append(
      "rotation_data",
      JSON.stringify(MENU_ROTATION[selectedWeek as keyof typeof MENU_ROTATION]),
    );

    try {
      if (analysisMode === "decompose") {
        const response = await fetch("/api/analyze-menu", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (data.status === "success") {
          setFichesTechniques(data.fiches_techniques);
          saveGeneratedRecipes(data.fiches_techniques);
        } else {
          alert(
            "Erreur lors de l'analyse : " +
              (data.error || data.message || "Erreur serveur ou IA"),
          );
        }
      } else if (analysisMode === "creative") {
        const response = await fetch("/api/generate-creative-menu", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (data.status === "success") {
          setCreativeMenu(data.creative_menu);
          const allRecipes: any[] = [];
          data.creative_menu.forEach((day: any) => {
            if (day.dejeuner) {
              if (day.dejeuner.plat_creatif) allRecipes.push(day.dejeuner);
              else {
                if (day.dejeuner.entree) allRecipes.push(day.dejeuner.entree);
                if (day.dejeuner.plat) allRecipes.push(day.dejeuner.plat);
                if (day.dejeuner.dessert) allRecipes.push(day.dejeuner.dessert);
              }
            }
            if (day.diner) {
              if (day.diner.plat_creatif) allRecipes.push(day.diner);
              else {
                if (day.diner.entree) allRecipes.push(day.diner.entree);
                if (day.diner.plat) allRecipes.push(day.diner.plat);
                if (day.diner.dessert) allRecipes.push(day.diner.dessert);
              }
            }
            // New format without dejeuner/diner wrappers
            if (day.entree)
              allRecipes.push({
                ...day.entree,
                category: "creative",
                jour: day.jour,
              });
            if (day.plat)
              allRecipes.push({
                ...day.plat,
                category: "creative",
                jour: day.jour,
              });
            if (day.dessert)
              allRecipes.push({
                ...day.dessert,
                category: "creative",
                jour: day.jour,
              });
          });
          saveGeneratedRecipes(allRecipes);
        } else {
          alert(
            "Erreur lors de la création : " +
              (data.error || data.message || "Erreur serveur ou IA"),
          );
        }
      } else if (analysisMode === "gastronomic") {
        const response = await fetch("/api/generate-gastronomic-menu", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (data.status === "success") {
          setGastronomicMenu(data.gastronomic_menu);
          const allRecipes: any[] = [];
          data.gastronomic_menu.forEach((menu: any) => {
            if (menu.entree) allRecipes.push(menu.entree);
            if (menu.plat) allRecipes.push(menu.plat);
            if (menu.dessert) allRecipes.push(menu.dessert);
          });
          saveGeneratedRecipes(allRecipes);
        } else {
          alert(
            "Erreur lors de la création : " +
              (data.error || data.message || "Erreur serveur ou IA"),
          );
        }
      } else {
        // Mode traditionnel
        const response = await fetch("/api/generate-traditional-menu", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (data.status === "success") {
          setTraditionalMenu(data.traditional_menu);
          const allRecipes: any[] = [];
          data.traditional_menu.forEach((day: any) => {
            if (day.entree) allRecipes.push(day.entree);
            if (day.plat) allRecipes.push(day.plat);
            if (day.dessert) allRecipes.push(day.dessert);
          });
          saveGeneratedRecipes(allRecipes);
        } else {
          alert(
            "Erreur lors de la création : " +
              (data.error || data.message || "Erreur serveur ou IA"),
          );
        }
      }
    } catch (error) {
      console.error("Erreur backend:", error);
      alert(
        "Erreur de connexion au serveur IA (Ollama).",
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveFicheToBook = async (fiche: any) => {
    try {
      const recipe = {
        name: fiche.recette || "Nouvelle Recette",
        category: fiche.categorie || fiche.jour || "Non classé",
        ingredients: (fiche.ingredients || []).map((ing: any) => ({
          inventory_name: ing.name || ing.ingredient,
          quantity_per_person: ing.qte || ing.quantite || 0,
          inventory_id: null
        })),
        preparation_steps: fiche.etapes || [{ step_order: 1, instructions: "À définir" }]
      };
      
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });

      if (res.ok) {
        alert("Fiche technique enregistrée dans le Livre de recettes !");
      } else {
        alert("Erreur lors de l'enregistrement de la fiche.");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur de connexion.");
    }
  };

  return (
    <div className="led-glow-container h-full flex flex-col animate-in fade-in duration-500 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 blur-[100px] rounded-full pointer-events-none"></div>

      <div className="flex justify-between items-center mb-10 relative z-10 p-8">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">
            {t.menuEngineering || "Ingénierie des Menus"}
          </h2>
          <p className="text-slate-500 mt-1">
            {t.menuAnalysisSubtitle ||
              "Analyse intelligente et planification stratégique de l'IA"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {analysisMode && !isAnalyzing && (
            <button
              onClick={() => {
                setAnalysisMode(null);
                setFichesTechniques(null);
                setCreativeMenu(null);
                setGastronomicMenu(null);
                setTraditionalMenu(null);
              }}
              className="px-6 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl text-sm font-bold hover:bg-white/10 transition-all"
            >
              {t.backToModes || "Retour aux modes"}
            </button>
          )}
        </div>
      </div>

      {!analysisMode ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-7xl">
            <motion.div
              whileHover={{ y: -5, scale: 1.02 }}
              onClick={() => {
                setAnalysisMode("decompose");
                setFichesTechniques(null);
                setCreativeMenu(null);
                setGastronomicMenu(null);
                setTraditionalMenu(null);
              }}
              className="glass-panel p-6 relative overflow-hidden group cursor-pointer transition-all duration-500 led-glow-emerald border-brand-500/30 flex flex-col min-h-[280px] max-h-[350px]"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
                <UploadCloud className="w-10 h-10 text-brand-500" />
              </div>
              <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                {t.mode01 || "Mode 01"}
              </h3>
              <h4 className="text-lg font-black text-white tracking-tighter mb-2">
                {t.modeDecompose || "Décomposition Menu"}
              </h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {t.modeDecomposeDesc ||
                  "Analysez vos menus existants et générez automatiquement les fiches techniques."}
              </p>
              <div className="mt-auto pt-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></div>
                <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">
                  {t.aiAnalysisActive || "IA Analyse Active"}
                </span>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -5, scale: 1.02 }}
              onClick={() => {
                setAnalysisMode("creative");
                setFichesTechniques(null);
                setCreativeMenu(null);
                setGastronomicMenu(null);
                setTraditionalMenu(null);
              }}
              className="glass-panel p-6 relative overflow-hidden group cursor-pointer transition-all duration-500 border-blue-500/30 hover:border-blue-500/50 shadow-[0_0_25px_rgba(59,130,246,0.15)] hover:shadow-[0_0_40px_rgba(59,130,246,0.25)] flex flex-col min-h-[280px] max-h-[350px]"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
                <Clock className="w-10 h-10 text-blue-500" />
              </div>
              <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                {t.mode02 || "Mode 02"}
              </h3>
              <h4 className="text-lg font-black text-white tracking-tighter mb-2">
                {t.modeCreative || "Cuisine Créative"}
              </h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {t.modeCreativeDesc ||
                  "Cuisine d'auteur, associations audacieuses et techniques d'avant-garde."}
              </p>
              <div className="mt-auto pt-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">
                  {t.creativeConcept || "Concept Créatif"}
                </span>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -5, scale: 1.02 }}
              onClick={() => {
                setAnalysisMode("gastronomic");
                setFichesTechniques(null);
                setCreativeMenu(null);
                setGastronomicMenu(null);
                setTraditionalMenu(null);
              }}
              className="glass-panel p-6 relative overflow-hidden group cursor-pointer transition-all duration-500 border-purple-500/30 hover:border-purple-500/50 shadow-[0_0_25px_rgba(168,85,247,0.15)] hover:shadow-[0_0_40px_rgba(168,85,247,0.25)] flex flex-col min-h-[280px] max-h-[350px]"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
                <Sparkles className="w-10 h-10 text-purple-500" />
              </div>
              <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                {t.mode03 || "Mode 03"}
              </h3>
              <h4 className="text-lg font-black text-white tracking-tighter mb-2">
                {t.modeGastronomic || "Haute Gastronomie"}
              </h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {t.modeGastronomicDesc ||
                  "Créez des plats élaborés et des menus signatures avec l'aide de l'IA créative."}
              </p>
              <div className="mt-auto pt-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></div>
                <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">
                  {t.highGastronomy || "Haute Gastronomie"}
                </span>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -5, scale: 1.02 }}
              onClick={() => {
                setAnalysisMode("traditional");
                setFichesTechniques(null);
                setCreativeMenu(null);
                setGastronomicMenu(null);
                setTraditionalMenu(null);
              }}
              className="glass-panel p-6 relative overflow-hidden group cursor-pointer transition-all duration-500 border-amber-500/30 hover:border-amber-500/50 shadow-[0_0_25px_rgba(245,158,11,0.15)] hover:shadow-[0_0_40px_rgba(245,158,11,0.25)] flex flex-col min-h-[280px] max-h-[350px]"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
                <ChefHat className="w-10 h-10 text-amber-500" />
              </div>
              <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                {t.mode04 || "Mode 04"}
              </h3>
              <h4 className="text-lg font-black text-white tracking-tighter mb-2">
                {t.modeTraditional || "Bistro Chic"}
              </h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {t.modeTraditionalDesc ||
                  "Générez des menus hebdomadaires équilibrés et classiques."}
              </p>
              <div className="mt-auto pt-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">
                  {t.traditionalCooking || "Cuisine Bistro Chic"}
                </span>
              </div>
            </motion.div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-auto custom-scrollbar">
          {(!fichesTechniques && analysisMode === "decompose") ||
          (!creativeMenu && analysisMode === "creative") ||
          (!gastronomicMenu && analysisMode === "gastronomic") ||
          (!traditionalMenu && analysisMode === "traditional") ? (
            <div className="flex-1 flex flex-col lg:flex-row gap-8 overflow-hidden">
              <div
                onDragOver={
                  analysisMode === "decompose" ? handleDragOver : undefined
                }
                onDragLeave={
                  analysisMode === "decompose" ? handleDragLeave : undefined
                }
                onDrop={analysisMode === "decompose" ? handleDrop : undefined}
                className={`flex-1 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all duration-500 relative group bg-black ${
                  isDragging && analysisMode === "decompose"
                    ? "border-brand-500 bg-brand-500/5 scale-[1.01]"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                {isAnalyzing ? (
                  <div className="text-center">
                    <div
                      className={`w-20 h-20 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-8 ${analysisMode === "decompose" ? "border-brand-500" : analysisMode === "creative" ? "border-blue-500" : analysisMode === "gastronomic" ? "border-purple-500" : "border-amber-500"}`}
                    ></div>
                    <p
                      className={`font-black text-2xl tracking-tighter ${analysisMode === "decompose" ? "text-brand-500" : analysisMode === "creative" ? "text-blue-500" : analysisMode === "gastronomic" ? "text-purple-500" : "text-amber-500"}`}
                    >
                      {analysisMode === "decompose"
                        ? t.analysisInProgress || "ANALYSE EN COURS..."
                        : analysisMode === "creative"
                          ? t.generatingCreative ||
                            "L'IA GÉNÈRE VOTRE MENU..."
                          : analysisMode === "gastronomic"
                            ? t.creatingGastronomic ||
                              "CRÉATION GASTRONOMIQUE..."
                            : t.generatingTraditional ||
                              "GÉNÉRATION BISTRO CHIC..."}
                    </p>
                    <p className="mt-3 text-slate-500 font-medium max-w-xs mx-auto">
                      {analysisMode === "decompose"
                        ? t.decomposeAnalysisDesc ||
                          "Extraction des données et génération des fiches techniques."
                        : analysisMode === "creative"
                          ? t.creativeAnalysisDesc ||
                            "Optimisation nutritionnelle et créative basée sur le cycle de 4 semaines."
                          : analysisMode === "gastronomic"
                            ? t.gastronomicAnalysisDesc ||
                              "Élaboration de recettes complexes et raffinées par l'IA."
                            : t.traditionalAnalysisDesc ||
                              "Préparation de menus classiques et conviviaux."}
                    </p>
                  </div>
                ) : analysisMode === "decompose" ? (
                  <div className="text-center p-10">
                    <div
                      className={`w-24 h-24 mx-auto mb-8 rounded-3xl flex items-center justify-center transition-all duration-500 shadow-2xl ${isDragging ? "bg-brand-500 text-obsidian rotate-12" : "bg-white/5 text-slate-500 group-hover:text-brand-500 group-hover:scale-110"}`}
                    >
                      <UploadCloud className="w-12 h-12" />
                    </div>
                    <h3 className="font-black text-2xl text-white tracking-tight mb-3">
                      {t.importMenu || "Importer un Menu"}
                    </h3>
                    <p className="text-slate-500 max-w-xs mx-auto leading-relaxed mb-10">
                      {t.importMenuDesc ||
                        "Glissez votre fichier ici ou utilisez le bouton ci-dessous. PDF, Excel, Word ou Images supportés."}
                    </p>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                      accept=".pdf,.xlsx,.docx,image/*"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-10 py-4 bg-white text-obsidian rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-brand-500 transition-all shadow-xl active:scale-95"
                    >
                      {t.browseFiles || "Parcourir les fichiers"}
                    </button>
                  </div>
                ) : analysisMode === "creative" ? (
                  <div className="text-center p-10 w-full max-w-lg">
                    <div className="w-24 h-24 mx-auto mb-8 rounded-3xl flex items-center justify-center bg-blue-500/10 text-blue-500 shadow-2xl ring-1 ring-blue-500/20">
                      <Sparkles className="w-12 h-12" />
                    </div>
                    <h3 className="font-black text-2xl text-white tracking-tight mb-4">
                      {t.creativeConcept || "Concept Créatif"}
                    </h3>
                    <p className="text-slate-400 font-medium mb-10 leading-relaxed max-w-sm mx-auto">
                      {t.creativeAnalysisDesc ||
                        "L'IA va élaborer 1 menu créatif signature inspiré de la Cuisine du Monde."}
                    </p>

                    <div className="grid grid-cols-3 gap-4">
                      <button
                        onClick={() => handleGenerateCreative("entree")}
                        className="w-full py-4 bg-blue-600/20 border border-blue-500/50 text-blue-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-xl hover:led-glow-blue active:scale-[0.98]"
                      >
                        {t.starter || "Entrée"}
                      </button>
                      <button
                        onClick={() => handleGenerateCreative("plat")}
                        className="w-full py-4 bg-blue-600/20 border border-blue-500/50 text-blue-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-xl hover:led-glow-blue active:scale-[0.98]"
                      >
                        {t.mainCourse || "Plat"}
                      </button>
                      <button
                        onClick={() => handleGenerateCreative("dessert")}
                        className="w-full py-4 bg-blue-600/20 border border-blue-500/50 text-blue-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-xl hover:led-glow-blue active:scale-[0.98]"
                      >
                        {t.dessert || "Dessert"}
                      </button>
                    </div>
                  </div>
                ) : analysisMode === "gastronomic" ? (
                  <div className="text-center p-10 w-full max-w-lg">
                    <div className="w-24 h-24 mx-auto mb-8 rounded-3xl flex items-center justify-center bg-purple-500/10 text-purple-500 shadow-2xl ring-1 ring-purple-500/20">
                      <Sparkles className="w-12 h-12" />
                    </div>
                    <h3 className="font-black text-2xl text-white tracking-tight mb-8">
                      {t.highGastronomy || "Haute Gastronomie"}
                    </h3>
                    <p className="text-slate-500 mb-10">
                      {t.gastronomicAIPrompt ||
                        "L'IA va élaborer 1 menu signature complet avec des techniques avancées."}
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      <button
                        onClick={() => handleGenerateGastronomic("entree")}
                        className="w-full py-4 bg-purple-600/20 border border-purple-500/50 text-purple-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all shadow-xl hover:led-glow-purple active:scale-[0.98]"
                      >
                        {t.starter || "Entrée"}
                      </button>
                      <button
                        onClick={() => handleGenerateGastronomic("plat")}
                        className="w-full py-4 bg-purple-600/20 border border-purple-500/50 text-purple-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all shadow-xl hover:led-glow-purple active:scale-[0.98]"
                      >
                        {t.mainCourse || "Plat"}
                      </button>
                      <button
                        onClick={() => handleGenerateGastronomic("dessert")}
                        className="w-full py-4 bg-purple-600/20 border border-purple-500/50 text-purple-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all shadow-xl hover:led-glow-purple active:scale-[0.98]"
                      >
                        {t.dessert || "Dessert"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-10 w-full max-w-lg">
                    <div className="w-24 h-24 mx-auto mb-8 rounded-3xl flex items-center justify-center bg-amber-500/10 text-amber-500 shadow-2xl ring-1 ring-amber-500/20">
                      <ChefHat className="w-12 h-12" />
                    </div>
                    <h3 className="font-black text-2xl text-white tracking-tight mb-8">
                      {t.modeTraditional || "Bistro Chic"}
                    </h3>
                    <p className="text-slate-500 mb-10">
                      {t.traditionalRecipesPrompt ||
                        "L'IA va élaborer des menus hebdomadaires de bistronomie."}
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      <button
                        onClick={() => handleGenerateTraditional("entree")}
                        className="w-full py-4 bg-amber-600/20 border border-amber-500/50 text-amber-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all shadow-xl hover:led-glow-amber active:scale-[0.98]"
                      >
                        {t.starter || "Entrée"}
                      </button>
                      <button
                        onClick={() => handleGenerateTraditional("plat")}
                        className="w-full py-4 bg-amber-600/20 border border-amber-500/50 text-amber-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all shadow-xl hover:led-glow-amber active:scale-[0.98]"
                      >
                        {t.mainCourse || "Plat"}
                      </button>
                      <button
                        onClick={() => handleGenerateTraditional("dessert")}
                        className="w-full py-4 bg-amber-600/20 border border-amber-500/50 text-amber-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all shadow-xl hover:led-glow-amber active:scale-[0.98]"
                      >
                        {t.dessert || "Dessert"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {analysisMode === "creative" && !isAnalyzing && (
                <div className="w-full lg:w-80 bg-white/[0.02] border border-white/5 rounded-3xl p-6 overflow-y-auto custom-scrollbar">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-6 tracking-widest">
                    {t.basePlan || "Inspirations"}
                  </h4>
                  <div className="space-y-4">
                    <div className="p-6 rounded-3xl bg-blue-500/5 border border-blue-500/10 text-center">
                      <Sparkles className="w-8 h-8 text-blue-400 mx-auto mb-4" />
                      <p className="text-sm text-slate-400 leading-relaxed italic">
                        {settings.language === "fr"
                          ? "La génération créative ne suit plus de cycle fixe pour garantir une exclusivité totale à chaque service."
                          : settings.language === "es"
                            ? "La generación creativa ya no sigue un ciclo fijo para garantizar la exclusividad total de cada servicio."
                            : settings.language === "de"
                              ? "Die kreative Generierung folgt keinem festen Zyklus mehr, um für jeden Service absolute Exklusivität zu gewährleisten."
                              : "Creative generation no longer follows a fixed cycle to ensure total exclusivity for each service."}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : analysisMode === "decompose" && fichesTechniques ? (
            <div className="flex-1 overflow-auto pr-2">
              <div className="flex items-center mb-8 text-emerald-700 bg-emerald-50/80 p-5 rounded-2xl ring-1 ring-emerald-500/20">
                <div className="bg-emerald-500 text-white p-2 rounded-full mr-4 shadow-lg shadow-black/20">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-lg tracking-tight">
                    {t.analysisSuccess || "Analyse terminée avec succès"}
                  </p>
                  <p className="text-emerald-600/90 mt-0.5">
                    {(
                      t.recipesIdentified ||
                      "{count} recettes identifiées et décomposées."
                    ).replace("{count}", fichesTechniques.length.toString())}
                  </p>
                </div>
                <button
                  onClick={() => setFichesTechniques(null)}
                  className="ml-auto px-4 py-2 bg-black border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium hover:bg-emerald-50 transition-colors shadow-lg shadow-black/20"
                >
                  {t.analyzeAnother || "Analyser un autre menu"}
                </button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {fichesTechniques.map((fiche: any, idx) => (
                  <div
                    key={idx}
                    className="border border-white/10 rounded-2xl p-6 bg-black shadow-lg shadow-black/20 hover:shadow-md transition-shadow duration-300"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center">
                        <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl mr-4">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-xl text-white tracking-tight">
                            {fiche.recette}
                          </h3>
                          {(fiche.jour || fiche.categorie) && (
                            <div className="flex gap-2 mt-2">
                              {fiche.jour && (
                                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] font-bold rounded uppercase tracking-widest">
                                  {translateDay(fiche.jour)}
                                </span>
                              )}
                              {fiche.categorie && (
                                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded uppercase tracking-widest">
                                  {fiche.categorie}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => exportToPDF(fiche)}
                          className="p-2.5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-colors ring-1 ring-transparent hover:ring-emerald-500/30"
                          title={t.download || "Exporter en PDF"}
                        >
                          <Download className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleSaveFicheToBook(fiche)}
                          className="p-2.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-colors ring-1 ring-transparent hover:ring-blue-500/30"
                          title={
                            t.saveToBook ||
                            "Enregistrer dans le livre des recettes"
                          }
                        >
                          <Bookmark className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() =>
                            setFichesTechniques(
                              fichesTechniques.filter((_, i) => i !== idx),
                            )
                          }
                          className="p-2.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors ring-1 ring-transparent hover:ring-red-500/30"
                          title={t.delete || "Supprimer"}
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm text-slate-500 mb-2 p-4 bg-[#0A0A0A] rounded-xl border border-white/5">
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">
                          {t.status || "Statut"}
                        </span>
                        <span className="font-bold text-emerald-500 text-sm">
                          {t.readyForFT || "Prêt pour Fiche Technique"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : analysisMode === "creative" && creativeMenu ? (
            <div className="flex-1 overflow-auto pr-2">
              <div className="flex items-center mb-8 text-white bg-black/40 p-6 rounded-3xl ring-1 ring-white/10 led-glow-blue-subtle group hover:led-glow-blue transition-all duration-500">
                <div className="bg-blue-500/20 text-blue-400 p-3 rounded-2xl mr-5 shadow-inner ring-1 ring-blue-500/30">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-black text-xl tracking-tight text-white">
                    {t.creativeMenuGenerated || "Menu Créatif Généré"}
                  </p>
                  <p className="text-slate-500 mt-1 text-sm font-medium">
                    {t.ftDedicatedTab ||
                      "Les fiches techniques sont disponibles dans l'onglet dédié."}
                  </p>
                </div>
                <div className="ml-auto flex gap-3">
                  <button
                    onClick={() => setCreativeMenu(null)}
                    className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all shadow-2xl active:scale-95"
                  >
                    {t.generateAnother || "Générer un autre menu"}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">
                {creativeMenu
                  .filter(
                    (m) =>
                      m.entree || m.plat || m.dessert || m.dejeuner || m.diner,
                  )
                  .map((jourMenu, idx) => (
                    <div
                      key={idx}
                      className="border border-white/10 rounded-3xl p-8 bg-black shadow-xl shadow-black/40 hover:shadow-2xl transition-shadow duration-300 relative overflow-hidden ring-1 ring-white/5"
                    >
                      <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Sparkles className="w-48 h-48 text-blue-500" />
                      </div>
                      <div className="relative z-10">
                        <h3 className="font-bold text-2xl text-white tracking-tight mb-8 border-b border-white/10 pb-4 flex items-center justify-between">
                          <div className="flex items-center">
                            <span className="bg-blue-500/20 text-blue-400 px-4 py-2 rounded-xl mr-3 text-sm font-black uppercase tracking-wider">
                              {jourMenu.jour
                                ? translateDay(jourMenu.jour)
                                : t.creativeMenuGenerated || "MENU CRÉATIF"}
                            </span>
                          </div>
                        </h3>

                        <div className="space-y-6">
                          {jourMenu.dejeuner && (
                            <div className="bg-[#0A0A0A] p-4 rounded-xl ring-1 ring-white/5 space-y-3">
                              <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                  {t.lunch || "Déjeuner"}
                                </span>
                              </div>

                              {/* Backward compatibility for old format */}
                              {jourMenu.dejeuner.plat_creatif && (
                                <div>
                                  <p className="text-slate-300 font-medium leading-relaxed">
                                    {jourMenu.dejeuner.plat_creatif}
                                  </p>
                                  {jourMenu.dejeuner.allergens &&
                                    !!jourMenu.dejeuner.allergens.length && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {jourMenu.dejeuner.allergens.map(
                                          (all: string, i: number) => (
                                            <span
                                              key={i}
                                              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded"
                                            >
                                              {all}
                                            </span>
                                          ),
                                        )}
                                      </div>
                                    )}
                                </div>
                              )}

                              {/* New format */}
                              {["entree", "plat", "dessert"].map((course) => {
                                const item = jourMenu.dejeuner[course];
                                if (!item)
                                  return (
                                    <div
                                      key={course}
                                      className="mb-2 opacity-40"
                                    >
                                      <span className="text-[10px] text-blue-400/80 uppercase font-black tracking-widest block mb-1">
                                        {course === "entree"
                                          ? t.starter || "Entrée"
                                          : course === "plat"
                                            ? t.mainCourse || "Plat"
                                            : t.dessert || "Dessert"}
                                      </span>
                                      <p className="text-slate-500 text-xs italic">
                                        Génération en cours ou indisponible
                                      </p>
                                    </div>
                                  );
                                return (
                                  <div key={course} className="mb-2">
                                    <span className="text-[10px] text-blue-400/80 uppercase font-black tracking-widest block mb-1">
                                      {course === "entree"
                                        ? t.starter || "Entrée"
                                        : course === "plat"
                                          ? t.mainCourse || "Plat"
                                          : t.dessert || "Dessert"}
                                    </span>
                                    <p className="text-slate-300 font-medium leading-relaxed">
                                      {item.nom ||
                                        item.name ||
                                        item.plat_creatif ||
                                        "Nom à générer..."}
                                    </p>
                                    {item.allergens &&
                                      !!item.allergens.length && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {item.allergens.map(
                                            (all: string, i: number) => (
                                              <span
                                                key={i}
                                                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded"
                                              >
                                                {all}
                                              </span>
                                            ),
                                          )}
                                        </div>
                                      )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {jourMenu.diner && (
                            <div className="bg-[#0A0A0A] p-4 rounded-xl ring-1 ring-white/5 space-y-3">
                              <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                  {t.dinner || "Dîner"}
                                </span>
                              </div>

                              {/* Backward compatibility */}
                              {jourMenu.diner.plat_creatif && (
                                <div>
                                  <p className="text-slate-300 font-medium leading-relaxed">
                                    {jourMenu.diner.plat_creatif}
                                  </p>
                                  {jourMenu.diner.allergens &&
                                    !!jourMenu.diner.allergens.length && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {jourMenu.diner.allergens.map(
                                          (all: string, i: number) => (
                                            <span
                                              key={i}
                                              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded"
                                            >
                                              {all}
                                            </span>
                                          ),
                                        )}
                                      </div>
                                    )}
                                </div>
                              )}

                              {/* New format */}
                              {["entree", "plat", "dessert"].map((course) => {
                                const item = jourMenu.diner[course];
                                if (!item)
                                  return (
                                    <div
                                      key={course}
                                      className="mb-2 opacity-40"
                                    >
                                      <span className="text-[10px] text-blue-400/80 uppercase font-black tracking-widest block mb-1">
                                        {course === "entree"
                                          ? t.starter || "Entrée"
                                          : course === "plat"
                                            ? t.mainCourse || "Plat"
                                            : t.dessert || "Dessert"}
                                      </span>
                                      <p className="text-slate-500 text-xs italic">
                                        Génération en cours ou indisponible
                                      </p>
                                    </div>
                                  );
                                return (
                                  <div key={course} className="mb-2">
                                    <span className="text-[10px] text-blue-400/80 uppercase font-black tracking-widest block mb-1">
                                      {course === "entree"
                                        ? t.starter || "Entrée"
                                        : course === "plat"
                                          ? t.mainCourse || "Plat"
                                          : t.dessert || "Dessert"}
                                    </span>
                                    <p className="text-slate-300 font-medium leading-relaxed">
                                      {item.nom ||
                                        item.name ||
                                        item.plat_creatif ||
                                        "Nom à générer..."}
                                    </p>
                                    {item.allergens &&
                                      !!item.allergens.length && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {item.allergens.map(
                                            (all: string, i: number) => (
                                              <span
                                                key={i}
                                                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded"
                                              >
                                                {all}
                                              </span>
                                            ),
                                          )}
                                        </div>
                                      )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {!jourMenu.dejeuner &&
                            !jourMenu.diner &&
                            (jourMenu.entree ||
                              jourMenu.plat ||
                              jourMenu.dessert) && (
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {["entree", "plat", "dessert"].map((course) => {
                                  const item =
                                    jourMenu[course as keyof typeof jourMenu];
                                  if (!item)
                                    return (
                                      <div
                                        key={course}
                                        className="bg-[#0A0A0A] p-6 rounded-2xl ring-1 ring-white/5 flex flex-col items-center justify-center h-full min-h-[120px] opacity-30"
                                      >
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                          {course === "entree"
                                            ? t.entree
                                            : course === "plat"
                                              ? t.plat
                                              : t.dessert}
                                        </p>
                                        <p className="text-xs mt-2 italic text-slate-600">
                                          Génération en cours ou indisponible
                                        </p>
                                      </div>
                                    );
                                  return (
                                    <div
                                      key={course}
                                      className="bg-[#0A0A0A] p-6 rounded-2xl ring-1 ring-white/10 flex flex-col h-full hover:ring-blue-500/50 transition-all"
                                    >
                                      <p className="text-[11px] font-black text-blue-400 uppercase tracking-widest mb-3 flex-shrink-0">
                                        {course === "entree"
                                          ? t.entree
                                          : course === "plat"
                                            ? t.plat
                                            : t.dessert}
                                      </p>
                                      <h4 className="text-white font-bold text-lg leading-snug flex-1">
                                        {item.nom ||
                                          item.name ||
                                          item.plat_creatif ||
                                          "Nom à générer..."}
                                      </h4>
                                      {item.allergens &&
                                        !!item.allergens.length && (
                                          <div className="mt-6 flex flex-wrap gap-1.5 flex-shrink-0">
                                            {item.allergens.map(
                                              (all: string, i: number) => (
                                                <span
                                                  key={i}
                                                  className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 bg-red-500/10 text-red-500 rounded"
                                                >
                                                  {all}
                                                </span>
                                              ),
                                            )}
                                          </div>
                                        )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : analysisMode === "gastronomic" && gastronomicMenu ? (
            <div className="flex-1 overflow-auto pr-2">
              <div className="flex items-center mb-8 text-white bg-black/40 p-6 rounded-3xl ring-1 ring-white/10 led-glow-purple-subtle group hover:led-glow-purple transition-all duration-500">
                <div className="bg-purple-500/20 text-purple-400 p-3 rounded-2xl mr-5 shadow-inner ring-1 ring-purple-500/30">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-black text-xl tracking-tight text-white">
                    {t.gastronomicMenusGenerated ||
                      "Menus Gastronomiques Générés"}
                  </p>
                  <p className="text-slate-500 mt-1 text-sm font-medium">
                    {t.ftDedicatedTab ||
                      "Les fiches techniques sont disponibles dans l'onglet dédié."}
                  </p>
                </div>
                <div className="ml-auto flex gap-3">
                  <button
                    onClick={() => setGastronomicMenu(null)}
                    className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all shadow-2xl active:scale-95"
                  >
                    {t.generateAnother || "Générer d'autres menus"}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">
                {gastronomicMenu
                  .filter((m) => m.entree || m.plat || m.dessert)
                  .slice(0, 1)
                  .map((menu, idx) => (
                    <div
                      key={idx}
                      className="border border-white/10 rounded-3xl p-8 bg-black shadow-xl shadow-black/40 hover:shadow-2xl transition-shadow duration-300 relative overflow-hidden ring-1 ring-white/5"
                    >
                      <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Sparkles className="w-48 h-48 text-purple-500" />
                      </div>
                      <div className="relative z-10">
                        <h3 className="font-bold text-2xl text-white tracking-tight mb-8 border-b border-white/10 pb-4 flex items-center justify-between">
                          <div className="flex items-center">
                            <span className="bg-purple-500/20 text-purple-400 px-4 py-2 rounded-xl mr-3 text-sm font-black uppercase tracking-wider">
                              {menu.jour
                                ? translateDay(menu.jour)
                                : t.chefMenu || "MENU DU CHEF"}
                            </span>
                          </div>
                        </h3>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          {["entree", "plat", "dessert"].map((type) => {
                            const dish = (menu as any)[type];
                            if (!dish)
                              return (
                                <div
                                  key={type}
                                  className="bg-[#0A0A0A] p-6 rounded-2xl ring-1 ring-white/5 flex flex-col items-center justify-center h-full min-h-[120px] opacity-30"
                                >
                                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {type === "entree"
                                      ? t.entree
                                      : type === "plat"
                                        ? t.plat
                                        : t.dessert}
                                  </p>
                                  <p className="text-xs mt-2 italic text-slate-600">
                                    Génération en cours ou indisponible
                                  </p>
                                </div>
                              );
                            return (
                              <div
                                key={type}
                                className="bg-[#0A0A0A] p-6 rounded-2xl ring-1 ring-white/10 flex flex-col h-full hover:ring-purple-500/50 transition-all"
                              >
                                <p className="text-[11px] font-black text-purple-400 uppercase tracking-widest mb-3 flex-shrink-0">
                                  {type === "entree"
                                    ? t.entree
                                    : type === "plat"
                                      ? t.plat
                                      : t.dessert}
                                </p>
                                <h4 className="text-white font-bold text-lg leading-snug flex-1">
                                  {dish.nom ||
                                    dish.name ||
                                    dish.plat_creatif ||
                                    "Nom à générer..."}
                                </h4>
                                {dish.allergens && !!dish.allergens.length && (
                                  <div className="mt-6 flex flex-wrap gap-1.5 flex-shrink-0">
                                    {dish.allergens.map(
                                      (all: string, i: number) => (
                                        <span
                                          key={i}
                                          className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 bg-red-500/10 text-red-500 rounded"
                                        >
                                          {all}
                                        </span>
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : analysisMode === "traditional" && traditionalMenu ? (
            <div className="flex-1 overflow-auto pr-2">
              <div className="flex items-center mb-8 text-white bg-black/40 p-6 rounded-3xl ring-1 ring-white/10 led-glow-amber-subtle group hover:led-glow-amber transition-all duration-500">
                <div className="bg-amber-500/20 text-amber-400 p-3 rounded-2xl mr-5 shadow-inner ring-1 ring-amber-500/30">
                  <ChefHat className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-black text-xl tracking-tight text-white">
                    {t.traditionalMenusGenerated || "Menus Bistro Chic Générés"}
                  </p>
                  <p className="text-slate-500 mt-1 text-sm font-medium">
                    {t.ftDedicatedTab ||
                      "Les fiches techniques sont disponibles dans l'onglet dédié."}
                  </p>
                </div>
                <div className="ml-auto flex gap-3">
                  <button
                    onClick={() => setTraditionalMenu(null)}
                    className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all shadow-2xl active:scale-95"
                  >
                    {t.generateAnother || "Générer d'autres menus"}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">
                {traditionalMenu
                  .filter((m) => m.entree || m.plat || m.dessert)
                  .map((day, idx) => (
                    <div
                      key={idx}
                      className="border border-white/10 rounded-3xl p-8 bg-black shadow-xl shadow-black/40 hover:shadow-2xl transition-shadow duration-300 relative overflow-hidden ring-1 ring-white/5"
                    >
                      <div className="absolute top-0 right-0 p-8 opacity-5">
                        <ChefHat className="w-48 h-48 text-amber-500" />
                      </div>
                      <div className="relative z-10">
                        <h3 className="font-bold text-2xl text-white tracking-tight mb-8 border-b border-white/10 pb-4 flex items-center justify-between">
                          <div className="flex items-center">
                            <span className="bg-amber-500/20 text-amber-400 px-4 py-2 rounded-xl mr-3 text-sm font-black uppercase tracking-wider">
                              {day.jour
                                ? translateDay(day.jour)
                                : "MENU BISTRO"}
                            </span>
                          </div>
                        </h3>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          {["entree", "plat", "dessert"].map((type) => {
                            const dish = (day as any)[type];
                            if (!dish)
                              return (
                                <div
                                  key={type}
                                  className="bg-[#0A0A0A] p-6 rounded-2xl ring-1 ring-white/5 flex flex-col items-center justify-center h-full min-h-[120px] opacity-30"
                                >
                                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {type === "entree"
                                      ? t.entree
                                      : type === "plat"
                                        ? t.plat
                                        : t.dessert}
                                  </p>
                                  <p className="text-xs mt-2 italic text-slate-600">
                                    Génération en cours ou indisponible
                                  </p>
                                </div>
                              );
                            return (
                              <div
                                key={type}
                                className="bg-[#0A0A0A] p-6 rounded-2xl ring-1 ring-white/10 flex flex-col h-full hover:ring-amber-500/50 transition-all"
                              >
                                <p className="text-[11px] font-black text-amber-500 uppercase tracking-widest mb-3 flex-shrink-0">
                                  {type === "entree"
                                    ? t.entree
                                    : type === "plat"
                                      ? t.plat
                                      : t.dessert}
                                </p>
                                <h4 className="text-white font-bold text-lg leading-snug flex-1">
                                  {dish.nom || dish.name || dish.plat_creatif}
                                </h4>
                                {dish.allergens && !!dish.allergens.length && (
                                  <div className="mt-6 flex flex-wrap gap-1.5 flex-shrink-0">
                                    {dish.allergens.map(
                                      (all: string, i: number) => (
                                        <span
                                          key={i}
                                          className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 bg-red-500/10 text-red-500 rounded"
                                        >
                                          {all}
                                        </span>
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function InventoryAudit({
  t,
  translateIngredient,
  settings,
  onAddToCart,
  onAddToPurchasing,
  showNotification,
}: {
  t: any;
  translateIngredient: (name: string, lang: string) => string;
  settings: any;
  onAddToCart: (item: any) => void;
  onAddToPurchasing: (id: string) => void;
  showNotification: (m: string, type?: any) => void;
}) {
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [clausAnalysis, setClausAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    quantity: 0,
    minStock: 0,
    unit: "kg",
    category: "Sec",
    unit_price: 0,
    yield_percent: 100,
    dlc: "",
  });
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [activeCategoryFilter, setActiveCategoryFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const cats = Array.from(
      new Set(inventory.map((item) => item.category || "Non classé")),
    );
    return ["all", ...cats];
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchCategory =
        activeCategoryFilter === "all" ||
        item.category === activeCategoryFilter;
      const matchSearch = item.name
        .toLowerCase()
        .includes(searchFilter.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [inventory, activeCategoryFilter, searchFilter]);

  const groupedInventory = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredInventory.forEach((item) => {
      const cat = item.category || "Non classé";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [filteredInventory]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const normalizeCategory = (cat: string) => {
            const map: Record<string, string> = {
              Dry: "Sec",
              Sec: "Sec",
              Dairy: "Crémerie",
              Crémerie: "Crémerie",
              Meat: "Viande",
              Viandes: "Viande",
              Viande: "Viande",
              Fish: "Poisson",
              Poisson: "Poisson",
              Vegetables: "Légumes",
              Légumes: "Légumes",
              Fruits: "Fruits",
              Pastry: "Pâtisserie",
              Pâtisserie: "Pâtisserie",
              Bakery: "Pâtisserie",
            };
            return map[cat] || cat;
          };

          const items = results.data.map((row: any) => {
            const quantity = parseFloat(
              row["Quantité"] || row["Quantity"] || row["quantite"] || "0",
            );
            const minStock = parseFloat(
              row["Stock Minimum"] ||
                row["Min Stock"] ||
                row["minStock"] ||
                "0",
            );
            const status =
              quantity <= minStock
                ? "critical"
                : quantity <= minStock * 1.5
                  ? "low"
                  : "ok";
            const rawCategory =
              row["Catégorie"] || row["Category"] || row["categorie"] || "Sec";

            return {
              id:
                Date.now().toString() + Math.random().toString(36).substring(7),
              name: row["Nom"] || row["Name"] || row["name"] || "Inconnu",
              quantity,
              minStock,
              unit: row["Unité"] || row["Unit"] || row["unite"] || "kg",
              category: normalizeCategory(rawCategory),
              status,
            };
          });

          const res = await fetch("/api/inventory/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items }),
          });

          if (res.ok) {
            alert(
              (
                t.importSuccess ||
                "✅ {count} ingrédients importés avec succès !"
              ).replace("{count}", items.length.toString()),
            );
            const newRes = await fetch("/api/inventory");
            const newData = await newRes.json();
            setInventory(newData);
          } else {
            alert(t.importError || "❌ Erreur lors de l'importation.");
          }
        } catch (err) {
          console.error("Erreur d'import", err);
          alert(
            t.csvReadError || "❌ Erreur lors de la lecture du fichier CSV.",
          );
        }

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
      error: (error) => {
        console.error("Erreur PapaParse:", error);
        alert(t.csvLoadError || "❌ Impossible de lire le fichier CSV.");
      },
    });
  };

  useEffect(() => {
    // Initialisation de la reconnaissance vocale
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang =
        settings.language === "fr"
          ? "fr-FR"
          : settings.language === "es"
            ? "es-ES"
            : settings.language === "de"
              ? "de-DE"
              : "en-US";
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        setIsListening(false);
        await handleAiChat(transcript);
      };
    }
  }, [settings.language]);

  const handleAiChat = async (message: string) => {
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      setAiResponse(data.response);

      // Synthèse vocale
      const utterance = new SpeechSynthesisUtterance(data.response);
      utterance.lang =
        settings.language === "fr"
          ? "fr-FR"
          : settings.language === "es"
            ? "es-ES"
            : settings.language === "de"
              ? "de-DE"
              : "en-US";
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("Erreur IA", err);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  useEffect(() => {
    fetch("/api/inventory")
      .then((res) => res.json())
      .then((data) => {
        setInventory(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Erreur de chargement de l'inventaire :", err);
        alert(
          t.inventoryLoadError ||
            "Impossible de charger l'inventaire depuis le serveur d'IA.",
        );
        setIsLoading(false);
      });
  }, []);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const status =
      newItem.quantity <= newItem.minStock
        ? "critical"
        : newItem.quantity <= newItem.minStock * 1.5
          ? "low"
          : "ok";
    const itemToAdd = {
      ...newItem,
      id: Date.now().toString(),
      status,
    };

    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemToAdd),
      });
      if (res.ok) {
        setShowAddForm(false);
        setNewItem({
          name: "",
          quantity: 0,
          minStock: 0,
          unit: "kg",
          category: "Sec",
          unit_price: 0,
          yield_percent: 100,
          dlc: "",
        });
        const newRes = await fetch("/api/inventory");
        const newData = await newRes.json();
        setInventory(newData);
        showNotification(
          t.addSuccess || "L'ingrédient a été ajouté avec succès.",
          "success",
        );
      } else {
        showNotification(
          t.addError || "Erreur lors de l'ajout de l'ingrédient.",
          "error",
        );
      }
    } catch (err) {
      console.error("Erreur lors de l'ajout", err);
      showNotification(
        t.serverConnError || "Erreur de connexion au serveur.",
        "error",
      );
    }
  };

  const handleDelete = async (id: string) => {
    // Standard confirm() is blocked in some environments, so we execute immediately.
    try {
      const res = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
      if (res.ok) {
        setInventory(inventory.filter((item) => item.id !== id));
        showNotification(
          t.deleteSuccess || "L'ingrédient a été supprimé.",
          "success",
        );
      } else {
        showNotification(
          t.deleteError || "Erreur lors de la suppression.",
          "error",
        );
      }
    } catch (err) {
      console.error("Erreur lors de la suppression", err);
      showNotification(
        t.serverConnError || "Erreur de connexion au serveur.",
        "error",
      );
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const status =
      editingItem.quantity <= editingItem.minStock
        ? "critical"
        : editingItem.quantity <= editingItem.minStock * 1.5
          ? "low"
          : "ok";
    const itemToUpdate = { ...editingItem, status };

    try {
      const res = await fetch(`/api/inventory/${editingItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemToUpdate),
      });
      if (res.ok) {
        setEditingItem(null);
        const newRes = await fetch("/api/inventory");
        const newData = await newRes.json();
        setInventory(newData);
        showNotification(
          t.updateSuccess || "L'ingrédient a été mis à jour.",
          "success",
        );
      } else {
        showNotification(
          t.updateError || "Erreur lors de la modification.",
          "error",
        );
      }
    } catch (err) {
      console.error("Erreur lors de la modification", err);
      showNotification(
        t.serverConnError || "Erreur de connexion au serveur.",
        "error",
      );
    }
  };

  const handleAnalyzeInventory = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/inventory/analyze", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setClausAnalysis(data.analysis);
      }
    } catch (e) {
      showNotification(
        t.clausUnavailable || "Impossible de joindre l'IA.",
        "error",
      );
    }
    setIsAnalyzing(false);
  };

  const categoryData = useMemo(() => {
    const reduced = inventory.reduce(
      (acc, item) => {
        const val = (item.quantity || 0) * (item.unit_price || 0);
        acc[item.category] = (acc[item.category] || 0) + val;
        return acc;
      },
      {} as Record<string, number>,
    );

    const translateCat = (cat: string) => {
      const map: Record<string, string> = {
        Sec: t.catDry || "Sec",
        Crémerie: t.catDairy || "Crémerie",
        Viande: t.catMeat || "Viande",
        Viandes: t.catMeat || "Viandes",
        Poisson: t.catFish || "Poisson",
        Légumes: t.catVeg || "Légumes",
        Fruits: t.catFruit || "Fruits",
        Pâtisserie: t.catPastry || "Pâtisserie",
      };
      return map[cat] || cat;
    };

    const sorted = Object.entries(reduced)
      .filter(([_, val]) => (val as number) > 0)
      .map(([name, value]) => ({
        name: translateCat(name),
        value: Number((value as number).toFixed(2)),
      }))
      .sort((a, b) => b.value - a.value);

    return sorted.length > 0
      ? sorted
      : [{ name: t.noData || "Aucun stock", value: 1, isEmpty: true }];
  }, [inventory, t]);

  const statusData = useMemo(() => {
    const reduced = inventory.reduce(
      (acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const validStatuses = [
      { name: t.normal, value: reduced.ok || 0, color: "#10b981" },
      { name: t.toOrder, value: reduced.low || 0, color: "#f59e0b" },
      { name: t.critical, value: reduced.critical || 0, color: "#ef4444" },
    ].filter((d) => d.value > 0);

    return validStatuses.length > 0
      ? validStatuses
      : [
          {
            name: t.noData || "Aucun stock",
            value: 1,
            color: "#334155",
            isEmpty: true,
          },
        ];
  }, [inventory]);

  const CATEGORY_COLORS = [
    "#38bdf8",
    "#818cf8",
    "#a78bfa",
    "#e879f9",
    "#f472b6",
    "#fb7185",
    "#f87171",
    "#fb923c",
  ];
  const totalValue = categoryData.reduce(
    (sum, item) => sum + ((item as any).isEmpty ? 0 : item.value),
    0,
  );

  const ChartTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length && !payload[0].payload.isEmpty) {
      return (
        <div className="glass-panel p-3 border border-white/10 shadow-2xl bg-black/95 backdrop-blur-xl">
          <p className="text-slate-300 font-medium text-xs uppercase tracking-widest mb-1">
            {payload[0].name}
          </p>
          <p className="text-emerald-400 font-mono font-bold text-lg">
            {payload[0].value.toFixed(2)}
          </p>
        </div>
      );
    }
    return null;
  };

  const StatusTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length && !payload[0].payload.isEmpty) {
      return (
        <div className="glass-panel p-2 border border-white/10 shadow-2xl bg-black/95 backdrop-blur-xl flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: payload[0].payload.color }}
          ></div>
          <p className="text-slate-300 font-medium text-xs">
            {payload[0].name}:
          </p>
          <p className="font-mono font-bold text-white text-sm">
            {payload[0].value}
          </p>
        </div>
      );
    }
    return null;
  };

  const getCatTranslation = (cat: string) => {
    if (cat === "all") return t.all || "Tous";
    const catMap: Record<string, string> = {
      Sec: "catDry",
      Crémerie: "catDairy",
      Viande: "catViande",
      Viandes: "catViandes",
      Poisson: "catFish",
      Poissons: "catFish",
      Légumes: "catVeg",
      Fruits: "catFruit",
      "Fruits & Légumes": "catFruitsLegumes",
      Pâtisserie: "catPastry",
    };
    const key =
      catMap[cat] || `cat${cat.replace(/ & /g, "").replace(/ /g, "")}`;
    return t[key] || cat;
  };

  return (
    <div className="led-glow-container animate-in fade-in duration-500 relative">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {t.inventoryAudit}
          </h2>
          <p className="text-slate-500 mt-1">{t.realTimeData}</p>
        </div>
        <div className="flex space-x-3">
          <input
            type="file"
            accept="image/*,application/pdf"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2.5 bg-blue-600/20 border border-blue-500/50 text-blue-400 rounded-xl text-sm font-medium hover:bg-blue-600/30 transition-all flex items-center"
          >
            <UploadCloud className="w-4 h-4 mr-2" />
            {t.importCsv}
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-5 py-2.5 bg-indigo-600/20 border border-indigo-500/50 text-indigo-400 rounded-xl text-sm font-medium hover:bg-indigo-600/30 transition-all flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            {showAddForm ? t.close : t.add}
          </button>
          <button
            onClick={handleAnalyzeInventory}
            disabled={isAnalyzing}
            className={`px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all flex items-center shadow-lg ${
              isAnalyzing
                ? "bg-white/5 text-slate-500"
                : "bg-emerald-600 text-white hover:bg-emerald-500 led-glow-emerald border border-emerald-400/30"
            }`}
          >
            {isAnalyzing ? (
              <Activity className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2 led-icon-glow" />
            )}
            {isAnalyzing ? t.analyzing || "Analyse..." : t.clausAdvice}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="glass-panel p-4">
          <h3 className="text-white font-bold mb-3 flex items-center text-sm">
            <PieChartIcon className="w-5 h-5 mr-2 text-indigo-400" />
            {t.valuationChart}
          </h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={65}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {categoryData.map((entry: any, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.isEmpty
                          ? "#334155"
                          : CATEGORY_COLORS[index % CATEGORY_COLORS.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <text
                  x="50%"
                  y="45%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-lg font-bold fill-white text-glow-indigo"
                >
                  {totalValue.toFixed(0)}
                </text>
                <text
                  x="50%"
                  y="58%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-[10px] font-mono fill-slate-400 uppercase tracking-widest"
                >
                  {t.total}
                </text>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-4">
          <h3 className="text-white font-bold mb-3 flex items-center text-sm">
            <Activity className="w-5 h-5 mr-2 text-emerald-400" />
            {t.stockHealth}
          </h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={0}
                  outerRadius={65}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth={2}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<StatusTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddSubmit}
          className="mb-8 p-6 bg-[#1A1A1A] border border-white/10 rounded-xl animate-in slide-in-from-top-4"
        >
          <h3 className="text-white font-bold mb-4">{t.newIngredient}</h3>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="col-span-1 md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">
                {t.name}
              </label>
              <input
                type="text"
                required
                value={newItem.name}
                onChange={(e) =>
                  setNewItem({ ...newItem, name: e.target.value })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                placeholder={t.exName || "Ex: Farine T55"}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.quantity}
              </label>
              <input
                type="number"
                required
                step="0.1"
                min="0"
                value={newItem.quantity}
                onChange={(e) =>
                  setNewItem({
                    ...newItem,
                    quantity: parseFloat(e.target.value),
                  })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.alertThreshold}
              </label>
              <input
                type="number"
                required
                step="0.1"
                min="0"
                value={newItem.minStock}
                onChange={(e) =>
                  setNewItem({
                    ...newItem,
                    minStock: parseFloat(e.target.value),
                  })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.unit}
              </label>
              <select
                value={newItem.unit}
                onChange={(e) =>
                  setNewItem({ ...newItem, unit: e.target.value })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              >
                <option value="kg">kg</option>
                <option value="L">L</option>
                <option value="unités">{t.unitsLabel || "unités"}</option>
                <option value="pièces">{t.piecesLabel || "pièces"}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.category}
              </label>
              <select
                value={newItem.category}
                onChange={(e) =>
                  setNewItem({ ...newItem, category: e.target.value })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              >
                <option value="Sec">{t.catDry || "Sec"}</option>
                <option value="Crémerie">{t.catDairy || "Crémerie"}</option>
                <option value="Viandes">{t.catMeat || "Viandes"}</option>
                <option value="Poissons">{t.catPoissons || "Poissons"}</option>
                <option value="Fruits & Légumes">
                  {t.catFruitsLegumes || "Fruits & Légumes"}
                </option>
                <option value="Pâtisserie">
                  {t.catPastry || "Pâtisserie"}
                </option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.nextDlc}
              </label>
              <input
                type="date"
                value={newItem.dlc || ""}
                onChange={(e) =>
                  setNewItem({ ...newItem, dlc: e.target.value })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.unitPrice || "Prix Unitaire (€)"}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newItem.unit_price}
                onChange={(e) =>
                  setNewItem({
                    ...newItem,
                    unit_price: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.yieldPercentLabel || "Rendement (%)"}
              </label>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                required
                value={newItem.yield_percent}
                onChange={(e) =>
                  setNewItem({
                    ...newItem,
                    yield_percent: parseFloat(e.target.value) || 100,
                  })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors"
            >
              {t.save}
            </button>
          </div>
        </form>
      )}

      {editingItem && (
        <form
          onSubmit={handleEditSubmit}
          className="mb-8 p-6 bg-[#1A1A1A] border border-indigo-500/30 rounded-xl animate-in slide-in-from-top-4"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-indigo-400 font-bold">{t.editIngredient}</h3>
            <button
              type="button"
              onClick={() => setEditingItem(null)}
              className="text-slate-400 hover:text-white"
            >
              <Plus className="w-5 h-5 rotate-45" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="col-span-1 md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">
                {t.name}
              </label>
              <input
                type="text"
                required
                value={editingItem.name}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, name: e.target.value })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.quantity}
              </label>
              <input
                type="number"
                required
                step="0.1"
                min="0"
                value={editingItem.quantity}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    quantity: parseFloat(e.target.value),
                  })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.alertThreshold}
              </label>
              <input
                type="number"
                required
                step="0.1"
                min="0"
                value={editingItem.minStock}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    minStock: parseFloat(e.target.value),
                  })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.unitPrice}
              </label>
              <input
                type="number"
                required
                step="0.01"
                min="0"
                value={editingItem.unit_price || 0}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    unit_price: parseFloat(e.target.value),
                  })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.unit}
              </label>
              <select
                value={editingItem.unit}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, unit: e.target.value })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              >
                <option value="kg">kg</option>
                <option value="L">L</option>
                <option value="unités">{t.unitsLabel || "unités"}</option>
                <option value="pièces">{t.piecesLabel || "pièces"}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.category}
              </label>
              <select
                value={editingItem.category}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, category: e.target.value })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              >
                <option value="Sec">{t.catDry || "Sec"}</option>
                <option value="Crémerie">{t.catDairy || "Crémerie"}</option>
                <option value="Viandes">{t.catMeat || "Viandes"}</option>
                <option value="Poissons">{t.catPoissons || "Poissons"}</option>
                <option value="Fruits & Légumes">
                  {t.catFruitsLegumes || "Fruits & Légumes"}
                </option>
                <option value="Pâtisserie">
                  {t.catPastry || "Pâtisserie"}
                </option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.nextDlc}
              </label>
              <input
                type="date"
                value={editingItem.dlc || ""}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, dlc: e.target.value })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t.yieldPercentLabel || "Rendement (%)"}
              </label>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                required
                value={editingItem.yield_percent !== undefined ? editingItem.yield_percent : 100}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    yield_percent: parseFloat(e.target.value) || 100,
                  })
                }
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setEditingItem(null)}
              className="px-6 py-2 bg-transparent border border-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/5 transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors"
            >
              {t.update}
            </button>
          </div>
        </form>
      )}

      {clausAnalysis && (
        <div className="mb-8 p-6 bg-emerald-900/20 border border-emerald-500/30 rounded-xl animate-in slide-in-from-top-4">
          <h3 className="text-emerald-400 font-bold flex items-center mb-2">
            <ChefHat className="w-5 h-5 mr-2" /> {t.clausStrategic}
          </h3>
          <p className="text-emerald-100/80 text-sm leading-relaxed">
            {clausAnalysis}
          </p>
        </div>
      )}

      {/* Category Classification & Search Headers */}
      <div className="mb-8 space-y-6">
        <div className="flex flex-col xl:flex-row gap-6 justify-between items-start xl:items-center">
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategoryFilter(cat)}
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.1em] transition-all duration-300 border ${
                  activeCategoryFilter === cat
                    ? "bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-500/30 scale-105"
                    : "bg-[#1A1A1A]/80 text-slate-400 border-white/5 hover:border-white/10 hover:bg-white/5"
                }`}
              >
                {getCatTranslation(cat)}
              </button>
            ))}
          </div>

          <div className="relative w-full xl:w-80 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
            <input
              type="text"
              placeholder={t.searchIngredient}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-[#1A1A1A]/80 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all placeholder:text-slate-600"
            />
          </div>
        </div>
      </div>

      <div
        id="inventory-categorized-wrapper"
        className="overflow-hidden rounded-3xl border border-white/10 bg-[#0A0A0A]/60 shadow-2xl"
      >
        {isLoading ? (
          <div className="py-24 text-center">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">
              {t.initClaus || "Initialisation en cours..."}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[700px] custom-scrollbar">
            {Object.keys(groupedInventory)
              .sort()
              .map((cat) => (
                <div key={cat} className="mb-px last:mb-0">
                  <div className="bg-black/90 sticky top-0 z-10 px-8 py-5 border-b border-white/5 flex items-center justify-between backdrop-blur-md">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-glow-emerald"></div>
                      <h3 className="text-[10px] font-black text-white uppercase tracking-[0.3em]">
                        {getCatTranslation(cat)}
                      </h3>
                    </div>
                    <span className="text-[9px] font-bold text-slate-500 bg-white/5 px-3 py-1 rounded-full border border-white/5 tracking-widest uppercase">
                      {groupedInventory[cat].length} {t.batches || "LOTS"}
                    </span>
                  </div>
                  <table className="w-full text-sm text-left">
                    <thead className="text-[9px] text-slate-500 uppercase font-black tracking-widest bg-black/20 border-b border-white/5">
                      <tr>
                        <th className="px-8 py-4">{t.id || "ID"}</th>
                        <th className="px-8 py-4">{t.name || "DÉSIGNATION"}</th>
                        <th className="px-8 py-4 w-72">
                          {t.stockLevel || "STOCK / SEUIL"}
                        </th>
                        <th className="px-8 py-4">{t.unit || "UNITÉ"}</th>
                        <th className="px-8 py-4 text-right">
                          {t.actions || "GESTION"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {groupedInventory[cat].map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-white/[0.01] transition-colors group"
                        >
                          <td className="px-8 py-6 text-slate-600 font-mono text-[9px]">
                            #{item.id}
                          </td>
                          <td className="px-8 py-6">
                            <div className="font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">
                              {translateIngredientHelper(item.name, t.language)}
                            </div>
                            {item.dlc && (
                              <div className="mt-1 text-[9px] font-black uppercase text-slate-500">
                                DLC: {new Date(item.dlc).toLocaleDateString()}
                              </div>
                            )}
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex flex-col gap-3">
                              <div className="flex justify-between items-baseline">
                                <div className="flex items-baseline gap-1.5">
                                  <span
                                    className={`font-mono text-lg font-black ${item.quantity === 0 ? "text-red-500" : "text-white"}`}
                                  >
                                    {item.quantity}
                                  </span>
                                  <span className="font-mono text-slate-600 text-[10px] font-bold">
                                    {item.unit}
                                  </span>
                                </div>
                                <span
                                  className={`text-[9px] font-black tracking-widest uppercase ${
                                    item.status === "ok"
                                      ? "text-emerald-500"
                                      : item.status === "low"
                                        ? "text-amber-500"
                                        : "text-red-500 animate-pulse"
                                  }`}
                                >
                                  {item.status === "ok"
                                    ? t.normal
                                    : item.status === "low"
                                      ? t.toOrder
                                      : t.critical}
                                </span>
                              </div>
                              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ${
                                    item.status === "ok"
                                      ? "bg-emerald-500"
                                      : item.status === "low"
                                        ? "bg-amber-500"
                                        : "bg-red-500"
                                  }`}
                                  style={{
                                    width: `${Math.max(2, Math.min(100, item.minStock > 0 ? (item.quantity / item.minStock) * 100 : item.quantity > 0 ? 100 : 0))}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-6 font-mono text-[10px]">
                            {item.unit_price ? (
                              <span className="text-white font-bold">
                                {item.unit_price.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-slate-800 italic">—</span>
                            )}
                          </td>
                          <td className="px-8 py-6 text-right">
                            <div className="flex justify-end gap-2 text-slate-500">
                              <button
                                onClick={() => setEditingItem(item)}
                                className="p-2 hover:text-white hover:bg-white/5 rounded-lg"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(item.id)}
                                className="p-2 hover:text-red-400 hover:bg-red-400/5 rounded-lg"
                              >
                                <Trash2 size={14} />
                              </button>
                              <button
                                onClick={() => {
                                  onAddToPurchasing(item.id);
                                  setPurchasedIds((prev) =>
                                    new Set(prev).add(item.id),
                                  );
                                  setTimeout(() => {
                                    setPurchasedIds((prev) => {
                                      const next = new Set(prev);
                                      next.delete(item.id);
                                      return next;
                                    });
                                  }, 2000);
                                  showNotification(
                                    `${item.name} ajouté`,
                                    "success",
                                  );
                                }}
                                className={`p-2 rounded-lg border transition-all ${
                                  purchasedIds.has(item.id)
                                    ? "bg-emerald-600 text-white border-emerald-500 shadow-glow-emerald scale-110"
                                    : "bg-emerald-500/5 text-emerald-500 border-emerald-500/20 hover:bg-emerald-600 hover:text-white"
                                }`}
                              >
                                {purchasedIds.has(item.id) ? (
                                  <Check size={14} />
                                ) : (
                                  <ShoppingCart size={14} />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductionPlan({
  cartItems = [],
  setCartItems,
  t,
  showNotification,
  isActive,
}: {
  cartItems?: any[];
  setCartItems?: any;
  t: any;
  showNotification: (m: string, type?: any) => void;
  isActive?: boolean;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [consumed, setConsumed] = useState(false);
  const [dailyLaborCost, setDailyLaborCost] = useState(0);

  useEffect(() => {
    if (isActive) {
      fetch("/api/dashboard/stats")
        .then((res) => res.json())
        .then((data) => setDailyLaborCost(data.dailyLaborCost || 0))
        .catch(console.error);
    }
  }, [isActive]);

  // Get unique recipes from cart with detailed ingredient information
  const cartRecipes = Array.from(
    new Set(cartItems.map((i) => i.sourceRecipeId)),
  )
    .filter(Boolean)
    .map((id) => {
      const item = cartItems.find((i) => i.sourceRecipeId === id);
      // Find all ingredients for this recipe in the cart
      const ingredients = cartItems
        .filter((i) => i.sourceRecipeId === id && !i.isRecipeHeader)
        .map((i) => ({
          name: i.item,
          quantity: i.quantity,
          unit: i.unit,
        }));
      return {
        id,
        name: item?.recipeName,
        guests: item?.guests || 1,
        ingredients,
      };
    });

  const totalGuests = cartRecipes.reduce(
    (sum, r) => sum + ((r.guests as number) || 0),
    0,
  );
  const laborPerGuest = totalGuests > 0 ? dailyLaborCost / totalGuests : 0;

  const handleGuestChange = (recipeId: string, newGuests: number) => {
    if (!setCartItems) return;
    const newItems = cartItems.map((item) => {
      if (item.sourceRecipeId === recipeId) {
        const qty = (item.quantity_per_person || 0) * newGuests;
        return {
          ...item,
          guests: newGuests,
          quantity: qty,
          total: qty * (item.price || 0),
        };
      }
      return item;
    });
    setCartItems(newItems);
  };

  const handleRejectCarts = () => {
    if (setCartItems) setCartItems([]);
    alert(t.prodPlanReset);
  };

  const handleConsumeStock = async () => {
    if (!cartItems || cartItems.length === 0) return;
    setIsProcessing(true);
    try {
      const itemsToDeduct = cartItems.map((item) => ({
        inventory_id: item.inventory_id,
        quantity: item.quantity,
      }));

      const res = await fetch("/api/inventory/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsToDeduct }),
      });

      if (res.ok) {
        setConsumed(true);
        setTimeout(() => setConsumed(false), 2000);
        showNotification(
          t.stockDeductedSuccess ||
            "✅ Stock out validated! Stock deducted successfully.",
        );
      } else {
        showNotification(
          t.stockDeductionError || "❌ Error during stock deduction.",
          "error",
        );
      }
    } catch (e) {
      showNotification(
        t.serverConnError || "Server connection error.",
        "error",
      );
    }
    setIsProcessing(false);
  };

  // Group identical items
  const groupedItems = Object.entries(
    cartItems.reduce((acc: any, item: any) => {
      if (item.isRecipeHeader || !item.item) return acc;
      if (!acc["Global"]) acc["Global"] = {};
      const translatedName = translateIngredientHelper(item.item, t.language);
      if (!acc["Global"][translatedName]) {
        acc["Global"][translatedName] = {
          ...item,
          quantity: 0,
          total: 0,
          sourceRecipes: new Set(),
        };
      }
      acc["Global"][translatedName].quantity += item.quantity;
      acc["Global"][translatedName].total += item.total;
      if (item.recipeName)
        acc["Global"][translatedName].sourceRecipes.add(
          translateIngredientHelper(item.recipeName, t.language),
        );
      return acc;
    }, {}),
  );

  return (
    <div className="led-glow-container p-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {t.productionPlan || "Plan de Production"}
          </h2>
          <p className="text-slate-500 mt-1">
            {t.prodPlanSubtitle ||
              "Gérez vos convives et sortez les ingrédients de l'économat."}
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleRejectCarts}
            disabled={isProcessing || !cartItems?.length}
            className="px-5 py-2.5 bg-black border border-white/10 text-slate-300 rounded-xl text-sm font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all shadow-lg shadow-black/20 disabled:opacity-50"
          >
            {t.clear || "Vider"}
          </button>
          <button
            onClick={handleConsumeStock}
            disabled={isProcessing || !cartItems?.length}
            className={`px-6 py-3 border rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-lg disabled:opacity-50 flex items-center led-glow-emerald ${
              consumed
                ? "bg-emerald-500 text-white border-emerald-400"
                : "bg-emerald-600 border-emerald-500/50 text-white hover:bg-emerald-500"
            }`}
          >
            {isProcessing ? (
              <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
            ) : consumed ? (
              <Check className="w-5 h-5 mr-3" />
            ) : (
              <CheckCircle2 className="w-5 h-5 mr-3" />
            )}
            {consumed ? "OK" : t.consumeStock || "Sortir de l'économat"}
          </button>
        </div>
      </div>

      {cartRecipes.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 p-6 bg-[#1A1A1A] border border-white/10 rounded-2xl">
            <h3 className="text-white font-bold mb-4 flex items-center">
              <Users className="w-5 h-5 mr-2 text-emerald-500" />
              {t.recipesToProduce || "Recettes à produire"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cartRecipes.map((recipe) => (
                <div
                  key={recipe.id as string}
                  className="bg-black p-4 rounded-xl border border-white/5 relative group space-y-4"
                >
                  <div className="flex justify-between items-center">
                    <button
                      onClick={() =>
                        setCartItems(
                          cartItems.filter(
                            (item) => item.sourceRecipeId !== recipe.id,
                          ),
                        )
                      }
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <span className="font-medium text-slate-300 truncate pr-2">
                      {translateIngredientHelper(recipe.name, t.language)}
                    </span>
                    <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-lg border border-white/10">
                      <span className="text-xs text-slate-500 font-bold uppercase">
                        {t.guests || "Convives"}
                      </span>
                      <input
                        type="number"
                        min="1"
                        value={recipe.guests as number}
                        onChange={(e) =>
                          handleGuestChange(
                            recipe.id as string,
                            parseInt(e.target.value) || 1,
                          )
                        }
                        className="w-12 bg-transparent text-white text-center font-bold focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 space-y-1 mt-2 border-t border-white/5 pt-2">
                    {recipe.ingredients.map((ing: any, i: number) => (
                      <div
                        key={i}
                        className="flex justify-between text-slate-400"
                      >
                        <span>
                          {translateIngredientHelper(ing.name, t.language)}
                        </span>
                        <span>
                          {ing.quantity.toFixed(2)} {ing.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20 rounded-2xl flex flex-col justify-between">
            <div>
              <h3 className="text-purple-400 font-bold mb-6 flex items-center uppercase tracking-widest text-xs">
                <Clock className="w-4 h-4 mr-2" />
                {t.impactLabor}
              </h3>
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-xs uppercase tracking-widest font-bold">
                    {t.dailyLaborCostLabel}
                  </span>
                  <span className="text-white font-black text-xl">
                    {Math.round(dailyLaborCost)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-xs uppercase tracking-widest font-bold">
                    {t.totalGuestsLabel}
                  </span>
                  <span className="text-white font-black text-xl">
                    {totalGuests}
                  </span>
                </div>
                <div className="h-px bg-white/5"></div>
                <div className="flex justify-between items-center text-purple-400">
                  <span className="text-xs uppercase tracking-widest font-bold">
                    {t.laborCostPerGuestLabel}
                  </span>
                  <span className="font-black text-2xl">
                    {laborPerGuest.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-600 italic mt-6 leading-relaxed">
              {t.laborPlanningBasis}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {groupedItems.length > 0 ? (
          groupedItems.map(([groupName, items], idx) => {
            const typedItems = Object.values(items as any[]);
            return (
              <div
                key={idx}
                className="border border-brand-500/30 rounded-2xl overflow-hidden shadow-lg shadow-black/20 hover:shadow-md transition-shadow duration-300 bg-black"
              >
                <div className="bg-black/5 px-6 py-4 border-b border-white/10 flex justify-between items-center">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mr-3">
                      <ClipboardList className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-white tracking-tight">
                      {t.ingredientsToConsumeList ||
                        "Liste d'ingrédients à sortir"}
                    </span>
                  </div>
                </div>
                <div className="p-6">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="text-slate-500 uppercase tracking-wider text-xs border-b border-white/5">
                        <th className="pb-3 font-semibold">
                          {t.article || "Article"}
                        </th>
                        <th className="pb-3 font-semibold text-right">
                          {t.totalQuantity || "Quantité Cumulée"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50/10">
                      {typedItems.map((item: any, i) => (
                        <tr key={i} className="group">
                          <td className="py-4 font-medium text-slate-100">
                            {translateIngredientHelper(item.item, t.language)}
                            {item.sourceRecipes?.size > 0 && (
                              <span className="block text-[10px] text-emerald-500 italic mt-0.5">
                                {(t.forLabel || "Pour: ") +
                                  Array.from(
                                    item.sourceRecipes as Set<string>,
                                  ).join(", ")}
                              </span>
                            )}
                          </td>
                          <td className="py-4 font-mono text-emerald-400 font-bold text-right">
                            {item.quantity.toFixed(2)}{" "}
                            {item.unit === "unités"
                              ? t.unitsLabel || "unités"
                              : item.unit === "pièces"
                                ? t.piecesLabel || "pièces"
                                : item.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10">
            <BookOpen className="w-12 h-12 text-slate-500 mx-auto mb-4 opacity-50" />
            <p className="text-slate-400 font-medium">
              {t.noRecipesInPlan ||
                "Aucune recette ajoutée au plan de production."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function QualityControl({ t }: { t: any }) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAlerts = async () => {
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      setAlerts(data);
    } catch (e: any) {
      if (e && e.message === "Failed to fetch") return;
      console.error(t.loadingAlerts, e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleResolveAlert = async (alertItem: any) => {
    try {
      const res = await fetch(`/api/alerts/${alertItem.id}/resolve`, {
        method: "POST",
      });
      if (res.ok) {
        alert(`✅ ${t.resolve} : ${alertItem.message}`);
        fetchAlerts();
      } else {
        throw new Error("Erreur serveur");
      }
    } catch (e) {
      console.error("Erreur traitement alerte:", e);
      alert(t.updateError);
    }
  };

  const handleIgnoreAlert = async (alertItem: any) => {
    try {
      const res = await fetch(`/api/alerts/${alertItem.id}/ignore`, {
        method: "POST",
      });
      if (res.ok) {
        alert(`👁️ ${t.ignore}`);
        fetchAlerts();
      } else {
        throw new Error("Erreur serveur");
      }
    } catch (e) {
      console.error("Erreur ignorance alerte:", e);
      alert(t.updateError);
    }
  };

  return (
    <div className="bg-black p-8 rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {t.qcTitle}
          </h2>
          <p className="text-slate-500 mt-1">{t.qcSubtitle}</p>
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">
            {t.loadingAlerts}
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-50" />
            <p className="text-slate-400 font-medium">{t.noAlertsActive}</p>
          </div>
        ) : (
          alerts.map((alertItem) => (
            <div
              key={alertItem.id}
              className="p-5 rounded-2xl border border-white/10 flex items-start hover:bg-black/5 transition-colors shadow-lg shadow-black/20 hover:shadow-md duration-300"
            >
              <div
                className={`p-3 rounded-xl mr-5 shadow-lg shadow-black/20 ${
                  alertItem.type === "price"
                    ? "bg-purple-100 text-purple-600 ring-1 ring-purple-600/20"
                    : alertItem.type === "stock"
                      ? "bg-red-100 text-red-600 ring-1 ring-red-600/20"
                      : "bg-amber-100 text-amber-600 ring-1 ring-amber-600/20"
                }`}
              >
                {alertItem.type === "price" ? (
                  <ShoppingCart className="w-6 h-6" />
                ) : alertItem.type === "stock" ? (
                  <PackageSearch className="w-6 h-6" />
                ) : (
                  <AlertTriangle className="w-6 h-6" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white tracking-tight text-lg">
                    {alertItem.type === "price"
                      ? t.priceAlert
                      : alertItem.type === "stock"
                        ? t.stockAlert
                        : t.yieldAlert}
                  </h4>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                      alertItem.severity === "high"
                        ? "bg-red-100/80 text-red-700 ring-1 ring-red-600/20"
                        : "bg-amber-100/80 text-amber-700 ring-1 ring-amber-600/20"
                    }`}
                  >
                    {alertItem.severity === "high"
                      ? t.criticalSeverity
                      : t.majorSeverity}
                  </span>
                </div>
                <p className="text-slate-500 mt-2">
                  {translateAlertMessage(
                    alertItem.message,
                    t,
                    translateIngredientHelper,
                  )}
                </p>
                <div className="mt-4 flex space-x-4">
                  <button
                    onClick={() => handleResolveAlert(alertItem)}
                    className="text-sm text-emerald-600 font-semibold hover:text-emerald-700 uppercase tracking-wider hover:underline underline-offset-2 transition-all"
                  >
                    {t.resolve}
                  </button>
                  <button
                    onClick={() => handleIgnoreAlert(alertItem)}
                    className="text-sm text-slate-500 font-semibold hover:text-slate-500 uppercase tracking-wider hover:underline underline-offset-2 transition-all"
                  >
                    {t.ignore}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AntiWaste({ t }: { t: any }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [recipes, setRecipes] = useState<any[] | null>(null);
  const [criticalStock, setCriticalStock] = useState<any[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<any[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
  const [isAntiWasteFullScreen, setIsAntiWasteFullScreen] = useState(true);
  const antiWasteScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedRecipe && antiWasteScrollRef.current) {
      antiWasteScrollRef.current.scrollTop = 0;
    }
  }, [selectedRecipe]);

  useEffect(() => {
    fetch("/api/anti-waste/critical")
      .then((res) => res.json())
      .then((data) => {
        setCriticalStock(data.inventory || []);
        setExpiringBatches(data.expiringBatches || []);
      })
      .catch((err) => console.error("Error loading anti-waste data:", err));
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/anti-waste/generate", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setRecipes(data.dishes);
      } else {
        throw new Error("Erreur serveur");
      }
    } catch (e) {
      console.error("Erreur de l'IA anti-gaspi:", e);
      alert(t.syncFTError);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="led-glow-container p-8 h-full flex flex-col animate-in fade-in duration-500 overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {t.antiWasteTitle}
          </h2>
          <p className="text-slate-500 mt-1">{t.antiWasteSubtitle}</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating || criticalStock.length === 0}
          className={`px-6 py-3 rounded-xl text-sm font-black flex items-center transition-all shadow-lg relative overflow-hidden ${
            isGenerating || criticalStock.length === 0
              ? "bg-white/5 text-slate-500 cursor-not-allowed"
              : "bg-emerald-600 text-white hover:bg-emerald-500 led-glow-emerald border border-emerald-400/30"
          }`}
        >
          {!isGenerating && criticalStock.length > 0 && (
            <div className="absolute inset-0 bg-emerald-400/20 blur-xl animate-pulse"></div>
          )}
          <div className="relative z-10 flex items-center">
            {isGenerating ? (
              <Activity className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5 mr-2 led-icon-glow" />
            )}
            {isGenerating ? t.generatingClaus : t.generateWithClaus}
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Colonne Ingrédients */}
        <div className="lg:col-span-1 border border-white/10 rounded-2xl p-6 bg-black/[0.02] flex flex-col gap-6">
          <div>
            <h3 className="font-bold text-slate-100 mb-4 flex items-center">
              <Clock className="w-5 h-5 mr-2 text-amber-500" />
              {t.alertIngredients}
            </h3>
            <div className="space-y-3">
              {criticalStock.length === 0 ? (
                <p className="text-slate-500 text-sm italic">
                  {t.noCriticalStock}
                </p>
              ) : (
                criticalStock.map((ing, idx) => (
                  <div
                    key={idx}
                    className="led-glow-container p-4 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-semibold text-slate-100 text-sm">
                        {translateIngredientHelper(ing.name, t.language)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t.stockLabel || "Stock"} : {ing.quantity} {ing.unit}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                        ing.status === "critical"
                          ? "bg-red-500/10 text-red-400"
                          : "bg-amber-500/10 text-amber-400"
                      }`}
                    >
                      {ing.status === "critical" ? t.urgentStatus : t.lowStatus}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {expiringBatches.length > 0 && (
            <div>
              <h3 className="font-bold text-slate-100 mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />
                {t.expiringBatchesAlert || "DLC Courtes (Lots)"}
              </h3>
              <div className="space-y-3">
                {expiringBatches.map((batch, idx) => (
                  <div
                    key={idx}
                    className="led-glow-container p-4 bg-red-500/5 border-red-500/20"
                  >
                    <p className="font-semibold text-red-400 text-sm">
                      {batch.product_name}
                    </p>
                    <div className="flex justify-between items-end mt-1">
                      <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
                        Expire le: {batch.expiration_date}
                      </p>
                      <p className="text-xs font-black text-slate-300">
                        {batch.quantity} {batch.unit}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Colonne Recettes */}
        <div className="lg:col-span-2">
          {!recipes && !isGenerating && (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-white/10 rounded-2xl bg-black/[0.02]">
              <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                <Leaf className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 mb-2">
                {t.noRecipeGenerated}
              </h3>
              <p className="text-slate-500 max-w-sm">{t.generateIdeasDesc}</p>
            </div>
          )}

          {isGenerating && (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-emerald-500/30 rounded-2xl bg-emerald-500/5">
              <Sparkles className="w-12 h-12 text-emerald-500 animate-pulse mb-4" />
              <h3 className="text-lg font-bold text-emerald-400 mb-2">
                {t.clausAnalyzingCombo}
              </h3>
              <p className="text-emerald-500/70 max-w-sm">
                {t.profitableSearchDesc}
              </p>
            </div>
          )}

          {recipes && (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 fade-in duration-500">
              <h3 className="font-bold text-slate-100 mb-4 flex items-center">
                <ChefHat className="w-5 h-5 mr-2 text-emerald-500" />
                {t.clausProposals}
              </h3>
              {recipes.map((recipe, idx) => (
                <div
                  key={idx}
                  className="bg-black border border-white/10 rounded-2xl p-6 shadow-lg shadow-black/20 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="text-lg font-bold text-white">
                      {recipe.name}
                    </h4>
                  </div>
                  <p className="text-slate-400 text-sm mb-4 leading-relaxed">
                    {recipe.preparation_steps}
                  </p>

                  <div className="mt-4 border-t border-white/5 pt-4">
                    <p className="text-xs text-slate-500 font-medium mb-2">
                      {t.ingredientsLabel || "Ingrédients"} :
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {recipe.ingredients.map((ing: string, i: number) => (
                        <span
                          key={i}
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-white/5 text-slate-400 rounded-md"
                        >
                          {ing}
                        </span>
                      ))}
                    </div>

                    {recipe.allergens && recipe.allergens.length > 0 && (
                      <>
                        <p className="text-xs text-slate-500 font-medium mb-2 mt-4">
                          {t.allergensLabel || "Allergènes"} :
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {recipe.allergens.map((all: string, i: number) => (
                            <span
                              key={i}
                              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-red-500/10 text-red-500 rounded-md"
                            >
                              {all}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal Fiche Technique */}
      {selectedRecipe && (
        <div className={`fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300 ${isAntiWasteFullScreen ? "p-0" : "p-4"}`}>
          <div className={`bg-black flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 ${isAntiWasteFullScreen ? "w-screen h-screen max-w-none max-h-none rounded-none border-0" : "border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden"}`}>
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-emerald-500/10 to-transparent">
              <div>
                <h3 className="text-2xl font-bold text-white tracking-tight">
                  {selectedRecipe.title}
                </h3>
                <p className="text-emerald-400 text-sm font-bold mt-1 uppercase tracking-widest">
                  {t.antiWasteFT || "Fiche Technique Anti-Gaspi"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAntiWasteFullScreen(!isAntiWasteFullScreen)}
                  className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors"
                  title={isAntiWasteFullScreen ? "Réduire" : "Plein écran"}
                >
                  {isAntiWasteFullScreen ? (
                    <Minimize2 className="w-5 h-5" />
                  ) : (
                    <Maximize2 className="w-5 h-5" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setSelectedRecipe(null);
                    setIsAntiWasteFullScreen(false);
                  }}
                  className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div
              ref={antiWasteScrollRef}
              className="flex-1 overflow-auto p-8 space-y-8"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">
                    {t.difficultyLabel || "Difficulté"}
                  </p>
                  <p className="text-white font-bold">
                    {selectedRecipe.difficulty === "Moyen"
                      ? t.mediumDifficulty || "Moyen"
                      : selectedRecipe.difficulty}
                  </p>
                </div>
                <div className="bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/20">
                  <p className="text-xs text-emerald-500 font-bold uppercase tracking-widest mb-1">
                    {t.estimatedSavings || "Économie estimée"}
                  </p>
                  <p className="text-emerald-400 font-bold">
                    {selectedRecipe.savings}
                  </p>
                </div>
              </div>

              <section>
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                  <ClipboardList className="w-4 h-4 mr-2 text-emerald-500" />
                  {t.ingredientsQuantities || "Ingrédients & Quantités"}
                </h4>
                <ul className="grid grid-cols-1 gap-2">
                  {(
                    selectedRecipe.quantities || selectedRecipe.ingredients
                  ).map((item: any, i: number) => {
                    // Logic to extract name/qty if item is an object vs string
                    const displayItem =
                      typeof item === "string"
                        ? item
                        : `${item.quantity} ${item.unit} - ${item.name}`;
                    return (
                      <li
                        key={i}
                        className="flex items-center text-slate-300 text-sm bg-white/5 p-3 rounded-xl border border-white/5"
                      >
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-3 shrink-0" />
                        {translateIngredientHelper(displayItem, t.language)}
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section>
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                  <Activity className="w-4 h-4 mr-2 text-emerald-500" />
                  {t.prepInstructions || "Instructions de préparation"}
                </h4>
                <div className="space-y-4">
                  {selectedRecipe.instructions ? (
                    selectedRecipe.instructions.map(
                      (step: string, i: number) => (
                        <div key={i} className="flex gap-4">
                          <span className="flex-shrink-0 w-6 h-6 bg-emerald-500/20 text-emerald-400 rounded-lg flex items-center justify-center text-xs font-bold ring-1 ring-emerald-500/30">
                            {i + 1}
                          </span>
                          <p className="text-slate-300 text-sm leading-relaxed">
                            {step}
                          </p>
                        </div>
                      ),
                    )
                  ) : (
                    <p className="text-slate-500 italic text-sm">
                      {t.instructionsNotAvailable ||
                        "Instructions détaillées non disponibles pour cette recette."}
                    </p>
                  )}
                </div>
              </section>
            </div>

            <div className="p-6 border-t border-white/10 bg-[#0A0A0A]/50 flex justify-end gap-3">
              <button
                onClick={() => setSelectedRecipe(null)}
                className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl transition-all"
              >
                {t.close || "Fermer"}
              </button>
              <button
                onClick={() => {
                  window.print();
                }}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                {t.printSheet || "Imprimer la fiche"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CulinaryChat({ t, settings }: { t: any; settings: any }) {
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  useEffect(() => {
    setMessages((prev) => {
      if (
        prev.length === 0 ||
        (prev.length === 1 && prev[0].role === "assistant")
      ) {
        return [
          {
            role: "assistant",
            content:
              t.chatWelcome ||
              "Bonjour ! Je suis votre assistant culinaire. Posez-moi vos questions sur la cuisine, les recettes, ou les techniques !",
          },
        ];
      }
      return prev;
    });
  }, [t.chatWelcome]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang =
        settings.language === "fr"
          ? "fr-FR"
          : settings.language === "es"
            ? "es-ES"
            : settings.language === "de"
              ? "de-DE"
              : "en-US";

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [settings.language]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: t.chatError },
        ]);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t.chatServerError },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="led-glow-container h-full flex flex-col animate-in fade-in duration-500 overflow-hidden">
      <div className="p-6 border-b border-white/10 bg-[#0A0A0A] flex-none">
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center">
          <MessageSquare className="w-6 h-6 mr-3 text-emerald-500" />
          {t.culinaryAssistant}
        </h2>
        <p className="text-slate-500 mt-1">{t.chatSubtitle}</p>
      </div>

      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
      >
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl p-4 ${
                msg.role === "user"
                  ? "bg-emerald-600 text-white rounded-tr-sm"
                  : "bg-[#1A1A1A] text-slate-200 border border-white/10 rounded-tl-sm"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">
                {msg.content}
              </p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl rounded-tl-sm p-4 flex space-x-2 items-center">
              <div
                className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              ></div>
              <div
                className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              ></div>
              <div
                className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              ></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-[#0A0A0A] border-t border-white/10">
        <form
          onSubmit={handleSubmit}
          className="relative flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.chatPlaceholder}
              className="w-full bg-black border border-white/10 rounded-xl pl-4 pr-12 py-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={toggleListening}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${
                isListening
                  ? "bg-red-500 text-white animate-pulse"
                  : "text-slate-500 hover:text-emerald-500"
              }`}
            >
              {isListening ? (
                <Mic className="w-5 h-5" />
              ) : (
                <MicOff className="w-5 h-5" />
              )}
            </button>
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

function DocumentManager({ t }: { t: any }) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [archiveTab, setArchiveTab] = useState<
    "pending" | "suppliers" | "drafts"
  >("pending");
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);

  // Missing states for quick add
  const [showProductQuickAdd, setShowProductQuickAdd] = useState(false);
  const [activeFormIndex, setActiveFormIndex] = useState<number | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [quickProduct, setQuickProduct] = useState({
    name: "",
    unit: "kg",
    category: "Protéines",
    minStock: 2 as number | string,
    unit_price: 0 as number | string,
  });

  const [formData, setFormData] = useState({
    id: null as string | null,
    type: "FACTURE",
    supplier: "",
    date: new Date().toISOString().split("T")[0],
    total_amount: 0 as number | string,
    source_image_url: "" as string | null,
    items: [] as {
      inventory_id: string;
      original_name?: string;
      quantity: number | string;
      unit_price: number | string;
      lot_number?: string;
      dlc?: string;
    }[],
  });

  useEffect(() => {
    fetchDocuments();
    fetchInventory();
    fetchSuppliersList();
  }, []);

  const fetchSuppliersList = async () => {
    try {
      const res = await fetch("/api/suppliers");
      if (res.ok) {
        const data = await res.json();
        setSuppliersList(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(Array.isArray(data) ? data : []);
      } else {
        setDocuments([]);
      }
    } catch (e) {
      console.error(e);
      setDocuments([]);
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await fetch("/api/inventory");
      if (res.ok) {
        const data = await res.json();
        setInventory(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          inventory_id: "",
          original_name: "",
          quantity: "",
          unit_price: "",
          lot_number: "",
          dlc: "",
        },
      ],
    });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...quickProduct,
        minStock: parseInt(quickProduct.minStock as string) || 0,
        unit_price: parseFloat(quickProduct.unit_price as string) || 0,
      };
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const result = await res.json();
        // Correcting: we need to retrieve the latest inventory to update the list
        const invRes = await fetch("/api/inventory");
        const newInventory = await invRes.json();
        setInventory(newInventory);

        // Associate this new item to the current line in formData
        if (activeFormIndex !== null) {
          const newItems = [...formData.items];
          newItems[activeFormIndex] = {
            ...newItems[activeFormIndex],
            inventory_id: result.id,
          };
          setFormData({ ...formData, items: newItems });
        }

        setQuickProduct({
          name: "",
          unit: "kg",
          category: "Protéines",
          minStock: 2,
          unit_price: 0,
        });
        setShowProductQuickAdd(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveItem = (index: number) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        total_amount:
          parseFloat(
            (formData.total_amount || "").toString().replace(",", "."),
          ) || 0,
        items: formData.items.map((item) => ({
          ...item,
          quantity:
            parseFloat((item.quantity || "").toString().replace(",", ".")) || 0,
          unit_price:
            parseFloat((item.unit_price || "").toString().replace(",", ".")) ||
            0,
        })),
      };

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowForm(false);
        setFormData({
          id: null,
          type: "FACTURE",
          supplier: "",
          date: new Date().toISOString().split("T")[0],
          total_amount: 0,
          source_image_url: null,
          items: [],
        });
        fetchDocuments();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleValidate = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}/validate`, {
        method: "POST",
      });
      if (res.ok) {
        fetchDocuments();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExtractFromDraft = async (id: string) => {
    try {
      setExtractingId(id);
      const res = await fetch(`/api/documents/${id}/extract`, {
        method: "POST",
      });
      if (res.ok) {
        const result = await res.json();
        if (result && result.data) {
          const matchedItems = (result.data.items || []).map((item: any) => {
            const itemName = item.item || item.description || "";
            const found = inventory.find(
              (inv) =>
                inv.name.toLowerCase().includes(itemName.toLowerCase()) ||
                itemName.toLowerCase().includes(inv.name.toLowerCase()),
            );
            return {
              original_name: itemName,
              inventory_id: found ? found.id : "",
              quantity: item.quantity || 0,
              unit_price: item.unit_price || 0,
              lot_number: item.lot || "",
              dlc: item.dlc || "",
            };
          });

          setFormData({
            id: id,
            type:
              result.data.type === "AVOIR"
                ? "AVOIR"
                : result.data.type === "BL"
                  ? "BON_LIVRAISON"
                  : "FACTURE",
            supplier: result.data.supplier || "",
            date: result.data.date || new Date().toISOString().split("T")[0],
            total_amount: result.data.total_amount || 0,
            source_image_url: result.source_image_url || "",
            items: matchedItems,
          });
          setShowForm(true);
        }
      } else {
        alert("Erreur lors de l'extraction IA");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur de connexion.");
    } finally {
      setExtractingId(null);
    }
  };

  // Group documents by month and day
  const groupedDocuments = documents
    .filter((doc) => doc.status !== "DRAFT")
    .reduce((acc: any, doc: any) => {
      const date = new Date(doc.date);
      const month = date.toLocaleString(
        t.language === "fr"
          ? "fr-FR"
          : t.language === "es"
            ? "es-ES"
            : t.language === "de"
              ? "de-DE"
              : t.language === "it"
                ? "it-IT"
                : "en-US",
        { month: "long", year: "numeric" },
      );
      const day = date.toLocaleDateString(
        t.language === "fr"
          ? "fr-FR"
          : t.language === "es"
            ? "es-ES"
            : t.language === "de"
              ? "de-DE"
              : t.language === "it"
                ? "it-IT"
                : "en-US",
        { day: "numeric", month: "long" },
      );

      if (!acc[month]) acc[month] = {};
      if (!acc[month][day]) acc[month][day] = [];
      acc[month][day].push(doc);
      return acc;
    }, {});

  const validatedDocs = documents.filter((doc) => doc.status === "VALIDATED");
  const docsBySupplier = validatedDocs.reduce((acc: any, doc: any) => {
    const sup = doc.supplier || "Inconnu";
    if (!acc[sup]) acc[sup] = [];
    acc[sup].push(doc);
    return acc;
  }, {});

  return (
    <div className="led-glow-container h-full flex flex-col animate-in fade-in duration-500 overflow-hidden">
      <div className="p-6 border-b border-white/10 bg-[#0A0A0A] flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center">
            <Receipt className="w-6 h-6 mr-3 text-emerald-500" />
            {t.documents}
          </h2>
          <p className="text-slate-500 mt-1">{t.docManagerSubtitle}</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => {
              if (showForm) {
                setShowForm(false);
                setFormData({
                  id: null,
                  type: "FACTURE",
                  supplier: "",
                  date: new Date().toISOString().split("T")[0],
                  total_amount: 0,
                  source_image_url: null,
                  items: [],
                });
              } else {
                setShowForm(true);
              }
            }}
            className={`px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all flex items-center shadow-lg ${
              showForm
                ? "bg-white/10 text-white border border-white/20"
                : "bg-emerald-600 text-white hover:bg-emerald-500 led-glow-emerald border border-emerald-400/30"
            }`}
          >
            {showForm ? (
              <X className="w-4 h-4 mr-2" />
            ) : (
              <Plus className="w-4 h-4 mr-2 led-icon-glow" />
            )}
            {showForm ? t.cancel : t.manualEntry}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {!showForm && (
          <div className="flex space-x-4 mb-6">
            <button
              onClick={() => setArchiveTab("pending")}
              className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors ${archiveTab === "pending" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-slate-400 border border-transparent hover:bg-white/10"}`}
            >
              {t.chronologicalHistory}
            </button>
            <button
              onClick={() => setArchiveTab("drafts")}
              className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors ${archiveTab === "drafts" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-slate-400 border border-transparent hover:bg-white/10"}`}
            >
              BROUILLONS (A TRAITER)
            </button>
            <button
              onClick={() => setArchiveTab("suppliers")}
              className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors ${archiveTab === "suppliers" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-slate-400 border border-transparent hover:bg-white/10"}`}
            >
              {t.supplierBinder}
            </button>
          </div>
        )}
        <div className="mb-6">
          <DocumentUpload
            t={t}
            onUploadComplete={(result?: any) => {
              if (result && result.type === "draft") {
                fetchDocuments();
                setArchiveTab("drafts");
              } else if (result && result.data) {
                const matchedItems = (result.data.items || []).map(
                  (item: any) => {
                    const itemName = item.item || item.description || "";
                    // Recherche dans l'inventaire
                    const found = inventory.find(
                      (inv) =>
                        inv.name
                          .toLowerCase()
                          .includes(itemName.toLowerCase()) ||
                        itemName.toLowerCase().includes(inv.name.toLowerCase()),
                    );
                    return {
                      original_name: itemName,
                      inventory_id: found ? found.id : "",
                      quantity: item.quantity || 0,
                      unit_price: item.unit_price || 0,
                      lot_number: item.lot || "",
                      dlc: item.dlc || "",
                    };
                  },
                );

                setFormData({
                  type:
                    result.data.type === "AVOIR"
                      ? "AVOIR"
                      : result.data.type === "BL"
                        ? "BON_LIVRAISON"
                        : "FACTURE",
                  supplier: result.data.supplier || "",
                  date:
                    result.data.date || new Date().toISOString().split("T")[0],
                  total_amount: result.data.total_amount || 0,
                  source_image_url: result.source_image_url || "",
                  items: matchedItems,
                });
                setShowForm(true);
              } else {
                fetchDocuments();
              }
            }}
          />
        </div>
        {showForm ? (
          <div className="flex flex-col lg:flex-row gap-6 animate-in slide-in-from-top-4 duration-300">
            {formData.source_image_url && (
              <div className="w-full lg:w-1/2 flex flex-col">
                <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 flex flex-col h-full">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-white uppercase tracking-tight">
                      {t.sourceLabel || "Source"}
                    </h2>
                    <button
                      type="button"
                      onClick={() =>
                        setEnlargedImage(formData.source_image_url)
                      }
                      className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-400 hover:text-white transition-all text-xs font-black uppercase tracking-widest"
                    >
                      <Expand size={14} className="text-emerald-500" />
                      Plein Écran
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto rounded-xl border border-white/10 bg-black/40 min-h-[400px] max-h-[80vh] flex justify-center">
                    <MediaDisplay
                      src={formData.source_image_url}
                      alt={t.docScanned}
                      className="object-contain w-full"
                      interactive={true}
                    />
                  </div>
                </div>
              </div>
            )}
            <form
              onSubmit={handleSubmit}
              className={`bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 space-y-6 ${formData.source_image_url ? "w-full lg:w-1/2" : "w-full"}`}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white uppercase tracking-tight">
                  {t.documentDetails || "Détails du Document"}
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    {t.docType}
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
                  >
                    <option value="FACTURE">{t.facture}</option>
                    <option value="BON_LIVRAISON">{t.deliveryNote}</option>
                    <option value="AVOIR">{t.creditNote}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    {t.supplier}
                  </label>
                  <input
                    type="text"
                    required
                    list="suppliers-list"
                    value={formData.supplier}
                    onChange={(e) =>
                      setFormData({ ...formData, supplier: e.target.value })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
                    placeholder={t.exTerreAzur || "Ex: TerreAzur"}
                  />
                  <datalist id="suppliers-list">
                    {suppliersList.map((sup, idx) => (
                      <option key={idx} value={sup.name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    {t.date}
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    {t.totalShort || "Total"}{" "}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={
                      formData.total_amount === 0 ? "" : formData.total_amount
                    }
                    onChange={(e) =>
                      setFormData({ ...formData, total_amount: e.target.value })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>

              <div className="border-t border-white/10 pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-white">
                    {t.receivedArticles}
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-emerald-500 hover:text-emerald-400 text-sm font-medium flex items-center"
                  >
                    <Plus className="w-4 h-4 mr-1" /> {t.addLine}
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.items.map((item, index) => (
                    <div
                      key={index}
                      className="flex flex-col gap-3 bg-black p-4 rounded-xl border border-white/5"
                    >
                      <div className="w-full">
                        <input
                          type="text"
                          placeholder={
                            t.docDesignationEx ||
                            "Désignation sur document (ex: Tomates Grappe)"
                          }
                          value={item.original_name || ""}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              "original_name",
                              e.target.value,
                            )
                          }
                          className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>

                      <div className="flex flex-wrap sm:flex-nowrap gap-3 items-center">
                        <div className="flex-1 min-w-[200px] flex gap-2">
                          <select
                            required
                            value={item.inventory_id}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "inventory_id",
                                e.target.value,
                              )
                            }
                            className={`flex-1 bg-[#1A1A1A] border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50 ${!item.inventory_id && item.original_name ? "border-amber-500/50 text-amber-500" : "border-white/10 text-white"}`}
                          >
                            <option value="">
                              {item.original_name
                                ? `${t.associateWarning} ${item.original_name}`
                                : t.selectStockItem}
                            </option>
                            {inventory.map((inv) => (
                              <option key={inv.id} value={inv.id}>
                                {translateIngredientHelper(
                                  inv.name,
                                  t.language,
                                )}{" "}
                                ({inv.unit})
                              </option>
                            ))}
                          </select>
                          {!item.inventory_id && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveFormIndex(index);
                                setQuickProduct({
                                  name: item.original_name || "",
                                  unit: "kg",
                                  category: "Protéines",
                                  minStock: 2,
                                  unit_price: item.unit_price || 0,
                                });
                                setShowProductQuickAdd(true);
                              }}
                              className="px-3 shrink-0 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-lg transition-colors"
                              title={
                                t.addToStockTitle ||
                                "Ajouter ce produit au stock"
                              }
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <div className="w-24 shrink-0">
                          <input
                            type="text"
                            inputMode="decimal"
                            required
                            placeholder={t.quantityShort || "Qté"}
                            value={item.quantity === 0 ? "" : item.quantity}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "quantity",
                                e.target.value,
                              )
                            }
                            className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                        <div className="w-28 shrink-0 relative">
                          <input
                            type="text"
                            inputMode="decimal"
                            required
                            placeholder={t.unitPriceShort || "PU"}
                            value={item.unit_price === 0 ? "" : item.unit_price}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "unit_price",
                                e.target.value,
                              )
                            }
                            className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg pl-3 pr-6 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="p-2 shrink-0 text-slate-500 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {formData.items.length === 0 && (
                    <p className="text-slate-500 text-sm text-center py-4">
                      {t.noAlertsActive}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-medium transition-colors shadow-lg led-glow-emerald"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-12">
            {archiveTab === "pending" &&
              (Object.keys(groupedDocuments).length === 0 ? (
                <div className="text-center py-24 bg-[#1A1A1A]/30 rounded-3xl border border-white/5">
                  <FileText className="w-16 h-16 text-slate-700 mx-auto mb-6" />
                  <h3 className="text-xl font-bold text-white mb-2">
                    {t.emptyArchive || "Archive vide"}
                  </h3>
                  <p className="text-slate-500">{t.noAlertsActive}</p>
                </div>
              ) : (
                Object.keys(groupedDocuments)
                  .sort((a, b) => {
                    // Sort by date descending
                    const dateA = new Date(
                      groupedDocuments[a][
                        Object.keys(groupedDocuments[a])[0]
                      ][0].date,
                    );
                    const dateB = new Date(
                      groupedDocuments[b][
                        Object.keys(groupedDocuments[b])[0]
                      ][0].date,
                    );
                    return dateB.getTime() - dateA.getTime();
                  })
                  .map((month) => (
                    <div key={month} className="space-y-6">
                      <div className="flex items-center gap-4">
                        <h3 className="text-lg font-black text-emerald-500 uppercase tracking-widest">
                          {month}
                        </h3>
                        <div className="h-px flex-1 bg-gradient-to-r from-emerald-500/20 to-transparent"></div>
                      </div>

                      <div className="space-y-8">
                        {Object.keys(groupedDocuments[month])
                          .sort((a, b) => {
                            const dateA = new Date(
                              groupedDocuments[month][a][0].date,
                            );
                            const dateB = new Date(
                              groupedDocuments[month][b][0].date,
                            );
                            return dateB.getTime() - dateA.getTime();
                          })
                          .map((day) => (
                            <div key={day} className="space-y-4">
                              <div className="flex items-center gap-3">
                                <Calendar className="w-4 h-4 text-slate-500" />
                                <h4 className="text-sm font-bold text-slate-400">
                                  {day}
                                </h4>
                              </div>

                              <div className="grid grid-cols-1 gap-4">
                                {groupedDocuments[month][day].map(
                                  (doc: any) => (
                                    <div
                                      key={doc.id}
                                      className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 hover:border-emerald-500/30 transition-all group"
                                    >
                                      <div className="flex justify-between items-start mb-6">
                                        <div>
                                          <div className="flex items-center space-x-3 mb-2">
                                            <span
                                              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                                                doc.type === "FACTURE"
                                                  ? "bg-blue-500/20 text-blue-400"
                                                  : doc.type === "AVOIR"
                                                    ? "bg-rose-500/20 text-rose-400"
                                                    : "bg-purple-500/20 text-purple-400"
                                              }`}
                                            >
                                              {doc.type === "FACTURE"
                                                ? t.facture
                                                : doc.type === "AVOIR"
                                                  ? t.creditNote
                                                  : t.deliveryNote}
                                            </span>
                                            <span
                                              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center ${
                                                doc.status === "VALIDATED"
                                                  ? "bg-emerald-500/20 text-emerald-400"
                                                  : "bg-amber-500/20 text-amber-400"
                                              }`}
                                            >
                                              {doc.status === "VALIDATED" ? (
                                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                              ) : (
                                                <Clock className="w-3 h-3 mr-1" />
                                              )}
                                              {doc.status === "VALIDATED"
                                                ? t.stockUpdated
                                                : t.pendingValidation}
                                            </span>
                                          </div>
                                          <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">
                                            {doc.supplier}
                                          </h3>
                                          <p className="text-slate-400 text-sm mt-1">
                                            {t.totalShort || "Total"}:{" "}
                                            <span className="text-white font-bold">
                                              {doc.total_amount}
                                            </span>
                                          </p>
                                        </div>
                                        {doc.status === "PENDING" && (
                                          <button
                                            onClick={() =>
                                              handleValidate(doc.id)
                                            }
                                            className="bg-emerald-600 text-white hover:bg-emerald-500 px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all flex items-center led-glow-emerald border border-emerald-400/30 shadow-lg"
                                          >
                                            <CheckCircle2 className="w-4 h-4 mr-2 led-icon-glow" />
                                            {t.validateStock}
                                          </button>
                                        )}
                                      </div>

                                      <div className="bg-black rounded-xl border border-white/5 overflow-hidden">
                                        {doc.source_image_url && (
                                          <div
                                            className="border-b border-white/5 bg-black/40 flex items-center justify-center p-4 cursor-pointer hover:bg-black/60 transition-colors relative group"
                                            onClick={() =>
                                              setEnlargedImage(
                                                doc.source_image_url,
                                              )
                                            }
                                            title={
                                              t.clickToEnlarge ||
                                              "Cliquez pour agrandir"
                                            }
                                          >
                                            <MediaDisplay
                                              src={doc.source_image_url}
                                              alt={
                                                t.scannedDocAlt ||
                                                "Document scanné"
                                              }
                                              className="max-h-[150px] object-contain rounded-lg shadow-sm transition-transform group-hover:scale-105"
                                            />
                                            <div className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md">
                                              <Expand size={14} />
                                            </div>
                                          </div>
                                        )}
                                        <table className="w-full text-sm text-left text-slate-300">
                                          <thead className="text-[10px] text-slate-500 uppercase font-black tracking-widest bg-[#1A1A1A]/50 border-b border-white/5">
                                            <tr>
                                              <th className="px-4 py-3">
                                                Article (Stock)
                                              </th>
                                              <th className="px-4 py-3 text-right">
                                                Quantité
                                              </th>
                                              <th className="px-4 py-3 text-right">
                                                {t.puLabel || "P.U."}
                                              </th>
                                              <th className="px-4 py-3 text-right">
                                                {t.totalRowLabel || "Total"}
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {doc.items?.map((item: any) => (
                                              <tr
                                                key={item.id}
                                                className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                                              >
                                                <td className="px-4 py-3 font-medium text-white">
                                                  {translateIngredientHelper(
                                                    item.inventory_name,
                                                    t.language,
                                                  )}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">
                                                  {item.quantity} {item.unit}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">
                                                  {item.unit_price}
                                                </td>
                                                <td className="px-4 py-3 text-right text-emerald-400 font-bold font-mono">
                                                  {(
                                                    item.quantity *
                                                    item.unit_price
                                                  ).toFixed(2)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))
              ))}
            {archiveTab === "suppliers" &&
              (Object.keys(docsBySupplier).length === 0 ? (
                <div className="text-center py-24 bg-[#1A1A1A]/30 rounded-3xl border border-white/5">
                  <Folder className="w-16 h-16 text-slate-700 mx-auto mb-6" />
                  <h3 className="text-xl font-bold text-white mb-2">
                    {t.emptyFolder || "Classeur vide"}
                  </h3>
                  <p className="text-slate-500">
                    {t.noDocumentRegistered || "Aucun document validé"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.keys(docsBySupplier)
                    .sort()
                    .map((sup) => (
                      <div
                        key={sup}
                        className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 hover:border-emerald-500/30 transition-all group h-fit cursor-pointer flex flex-col"
                        onClick={() =>
                          setExpandedSupplier(
                            expandedSupplier === sup ? null : sup,
                          )
                        }
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500/20 transition-colors">
                            <Folder className="w-6 h-6" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-white">
                              {sup}
                            </h3>
                            <p className="text-sm text-slate-400">
                              {docsBySupplier[sup].length} document
                              {docsBySupplier[sup].length > 1 ? "s" : ""}
                            </p>
                          </div>
                          <div
                            className={`transition-transform duration-300 ${expandedSupplier === sup ? "rotate-180" : ""}`}
                          >
                            <ChevronDown className="w-5 h-5 text-slate-500" />
                          </div>
                        </div>

                        {expandedSupplier === sup && (
                          <div
                            className="mt-6 space-y-4 pt-6 border-t border-white/5 flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {docsBySupplier[sup].map((doc: any) => (
                              <div
                                key={doc.id}
                                className="bg-black rounded-xl border border-white/5 overflow-hidden"
                              >
                                <div className="p-4 flex justify-between items-center bg-black/40 border-b border-white/5">
                                  <div>
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest mr-2 ${
                                        doc.type === "FACTURE"
                                          ? "bg-blue-500/20 text-blue-400"
                                          : doc.type === "AVOIR"
                                            ? "bg-rose-500/20 text-rose-400"
                                            : "bg-purple-500/20 text-purple-400"
                                      }`}
                                    >
                                      {doc.type === "FACTURE"
                                        ? t.facture
                                        : doc.type === "AVOIR"
                                          ? t.creditNote
                                          : t.deliveryNote}
                                    </span>
                                    <span className="text-slate-400 text-xs font-mono">
                                      {new Date(doc.date).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <div className="text-emerald-400 font-bold font-mono text-sm">
                                    {doc.total_amount}
                                  </div>
                                </div>
                                {doc.source_image_url && (
                                  <div
                                    className="bg-black/60 flex items-center justify-center p-2 cursor-pointer hover:bg-black/80 transition-colors relative group"
                                    onClick={() =>
                                      setEnlargedImage(doc.source_image_url)
                                    }
                                    title={
                                      t.clickToEnlarge ||
                                      "Cliquez pour agrandir"
                                    }
                                  >
                                    <MediaDisplay
                                      src={doc.source_image_url}
                                      alt={t.scannedDocAlt || "Document scanné"}
                                      className="max-h-[100px] object-contain rounded-lg shadow-sm transition-transform group-hover:scale-105"
                                    />
                                    <div className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md">
                                      <Expand size={12} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ))}

            {archiveTab === "drafts" &&
              (documents.filter((d) => d.status === "DRAFT").length === 0 ? (
                <div className="text-center py-24 bg-[#1A1A1A]/30 rounded-3xl border border-white/5">
                  <Clock className="w-16 h-16 text-slate-700 mx-auto mb-6" />
                  <h3 className="text-xl font-bold text-white mb-2">
                    Aucun brouillon
                  </h3>
                  <p className="text-slate-500">
                    Toutes les photos ont été traitées.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {documents
                    .filter((d) => d.status === "DRAFT")
                    .map((doc) => (
                      <div
                        key={doc.id}
                        className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 flex flex-col group"
                      >
                        <div
                          className="bg-black/40 rounded-xl overflow-hidden mb-4 cursor-pointer relative h-48 flex items-center justify-center border border-white/5 group-hover:border-emerald-500/30 transition-colors"
                          onClick={() => setEnlargedImage(doc.source_image_url)}
                        >
                          <MediaDisplay
                            src={doc.source_image_url}
                            alt="Brouillon"
                            className="max-h-full max-w-full object-contain"
                          />
                          <div className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md">
                            <Expand size={14} />
                          </div>
                        </div>

                        <button
                          onClick={() => handleExtractFromDraft(doc.id)}
                          disabled={extractingId === doc.id}
                          className={`mt-auto w-full px-4 py-2.5 rounded-xl text-sm font-bold uppercase tracking-widest transition-all flex items-center justify-center ${
                            extractingId === doc.id
                              ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                              : "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/30"
                          }`}
                        >
                          {extractingId === doc.id
                            ? t.aiExtractionInProgress
                            : t.scanDocIA}
                        </button>
                      </div>
                    ))}
                </div>
              ))}
          </div>
        )}
      </div>

      {enlargedImage && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative w-[90vw] h-[90vh] flex items-center justify-center">
            <button
              className="absolute -top-12 right-0 text-white hover:text-emerald-400 bg-black/50 p-2 rounded-full transition-colors z-[210]"
              onClick={() => setEnlargedImage(null)}
            >
              <X size={24} />
            </button>
            <MediaDisplay
              src={enlargedImage}
              alt={t.enlargedDocAlt || "Document agrandi"}
              className="w-full h-full object-contain rounded-xl shadow-2xl ring-1 ring-white/10"
              interactive={true}
              onClick={(e: any) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {showProductQuickAdd && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-panel w-full max-w-lg p-8 space-y-6"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white tracking-tight">
                {t.addToStockModalTitle || "Ajouter au Stock"}
              </h3>
              <button
                onClick={() => setShowProductQuickAdd(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleQuickAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                  {t.designationLabel || "Désignation"}
                </label>
                <input
                  type="text"
                  required
                  value={quickProduct.name}
                  onChange={(e) =>
                    setQuickProduct({ ...quickProduct, name: e.target.value })
                  }
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                    {t.unitModalLabel || "Unité"}
                  </label>
                  <select
                    value={quickProduct.unit}
                    onChange={(e) =>
                      setQuickProduct({ ...quickProduct, unit: e.target.value })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="kg">kg</option>
                    <option value="L">L</option>
                    <option value="pièces">{t.piecesLabel || "pièces"}</option>
                    <option value="unités">{t.unitsLabel || "unités"}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                    {t.categoryModalLabel || "Catégorie"}
                  </label>
                  <select
                    value={quickProduct.category}
                    onChange={(e) =>
                      setQuickProduct({
                        ...quickProduct,
                        category: e.target.value,
                      })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="Protéines">
                      {t.catMeat || "Protéines"}
                    </option>
                    <option value="Sec">{t.catDry || "Sec"}</option>
                    <option value="Légumes">{t.catVeg || "Légumes"}</option>
                    <option value="Fruits">{t.catFruit || "Fruits"}</option>
                    <option value="Crémerie">{t.catDairy || "Crémerie"}</option>
                    <option value="Pâtisserie">
                      {t.catPastry || "Pâtisserie"}
                    </option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                    {t.estimatedPULabel || "Prix Unitaire Estimé"}{" "}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={
                      quickProduct.unit_price === 0
                        ? ""
                        : quickProduct.unit_price
                    }
                    onChange={(e) =>
                      setQuickProduct({
                        ...quickProduct,
                        unit_price: e.target.value,
                      })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                    {t.minStockModalLabel || "Stock Minimum"}
                  </label>
                  <input
                    type="number"
                    value={
                      quickProduct.minStock === 0 ? "" : quickProduct.minStock
                    }
                    onChange={(e) =>
                      setQuickProduct({
                        ...quickProduct,
                        minStock: e.target.value,
                      })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold uppercase tracking-widest transition-all led-glow-emerald"
              >
                Confirmer l'ajout
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function FichesTechniques({
  activeTab,
  cartItems,
  setCartItems,
  t,
  showNotification,
}: {
  activeTab: string;
  cartItems?: any[];
  setCartItems?: any;
  t: any;
  showNotification: (m: string, type?: any) => void;
}) {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [supplierComparison, setSupplierComparison] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [guestCounts, setGuestCounts] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<"categories" | "book">("categories");
  const [expandedRecipes, setExpandedRecipes] = useState<
    Record<string, boolean>
  >({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [generatingSteps, setGeneratingSteps] = useState<
    Record<string, boolean>
  >({});
  const [addedToPlanIds, setAddedToPlanIds] = useState<Set<string>>(new Set());
  const [selectedRecipeForModal, setSelectedRecipeForModal] = useState<
    any | null
  >(null);
  const [isRecipeModalFullScreen, setIsRecipeModalFullScreen] = useState(true);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const outerModalScrollRef = useRef<HTMLDivElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/recipes/scan", {
        method: "POST",
        body: formData,
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success" && data.fiches_techniques && data.fiches_techniques.length > 0) {
          let lastCreatedId: string | null = null;
          
          for (const recipe of data.fiches_techniques) {
            const recipeName = recipe.recette || recipe.name || "Nouvelle Recette";
            const rawIngredients = recipe.ingredients || [];
            const ingredients = rawIngredients.map((ing: any) => ({
              inventory_name: ing.name || ing.ingredient || "Ingrédient",
              quantity_per_person: ing.quantite || ing.qte || 0,
              unit: ing.unite || ing.unit || "g",
            }));

            const postRes = await fetch("/api/recipes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: recipeName,
                category: recipe.categorie || "decompose",
                ingredients: ingredients,
                preparation_steps: recipe.preparation_steps || null,
                allergens: recipe.allergens || [],
                source_image_url: null,
              }),
            });

            if (postRes.ok) {
              const postData = await postRes.json();
              if (postData.id) {
                lastCreatedId = postData.id;
              }
            }
          }

          showNotification("🎨 " + (t.recipesScannedSuccess || "Fiches techniques scannées et importées avec succès !"), "success");
          
          // Re-fetch recipes inline so we can immediately auto-open for corrections
          try {
            const upRes = await fetch("/api/recipes");
            const upData = await upRes.json();
            setRecipes(upData);

            // Initialize guest counts, preserving existing ones if present
            setGuestCounts((prev) => {
              const next = { ...prev };
              upData.forEach((r: any) => {
                if (next[r.id] === undefined) next[r.id] = 1;
              });
              return next;
            });

            if (lastCreatedId) {
              const matched = upData.find((r: any) => r.id === lastCreatedId);
              if (matched) {
                setSelectedRecipeForModal(matched);
              }
            }
          } catch (err) {
            console.error("Error updating recipes list after scan:", err);
            fetchRecipes();
          }

        } else {
          alert(data.message || "Impossible de décoder la fiche technique. Assurez-vous que le document est lisible.");
        }
      } else {
        alert("Erreur serveur lors du scan IA.");
      }
    } catch (error) {
      console.error("Recipe scan error:", error);
      alert("Une erreur de connexion est survenue.");
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (selectedRecipeForModal) {
      setTimeout(() => {
        if (modalScrollRef.current) modalScrollRef.current.scrollTop = 0;
        if (outerModalScrollRef.current)
          outerModalScrollRef.current.scrollTop = 0;
      }, 10);
    }
  }, [selectedRecipeForModal]);

  const generateSteps = async (id: string) => {
    setGeneratingSteps((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/recipes/${id}/generate-steps`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setRecipes((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, preparation_steps: data.preparation_steps }
              : r,
          ),
        );
        setSelectedRecipeForModal((prev) =>
          prev && prev.id === id
            ? { ...prev, preparation_steps: data.preparation_steps }
            : prev,
        );
      }
    } catch (error) {
      console.error(error);
    } finally {
      setGeneratingSteps((prev) => ({ ...prev, [id]: false }));
    }
  };

  const exportSingleRecipeToPDF = (recipe: any) => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(245, 158, 11); // Amber 500
    doc.text(t.technicalSheetFull || "FICHE TECHNIQUE", 20, 20);

    doc.setFontSize(16);
    doc.setTextColor(31, 41, 55); // Gray 800
    doc.text(recipe.name || t.untitled || "Recette sans nom", 20, 35);

    const count = guestCounts[recipe.id] || 1;
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128); // Gray 500
    doc.text(`${t.guests || "Couverts"} : ${count}`, 20, 45);

    doc.setDrawColor(229, 231, 235);
    doc.line(20, 50, 190, 50);

    let y = 60;

    if (recipe.preparation_steps) {
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text(t.prepSteps || "Étapes de préparation :", 20, y);
      y += 8;
      doc.setFontSize(10);
      doc.setTextColor(75, 85, 99);
      const stepsText = doc.splitTextToSize(recipe.preparation_steps, 170);
      doc.text(stepsText, 20, y);
      y += stepsText.length * 5 + 10;
    }

    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text(t.requiredIngredients || "Ingrédients requis :", 20, y);

    const tableData = (recipe.ingredients || []).map((ing: any) => {
      const qte =
        parseFloat(
          (ing.quantity_per_person || "").toString().replace(",", "."),
        ) || 0;
      let totalQte = qte * count;
      let displayUnit = ing.unit || "kg";

      if ((displayUnit === "g" || displayUnit === "ml") && totalQte >= 1000) {
        totalQte = totalQte / 1000;
        displayUnit = displayUnit === "g" ? "kg" : "L";
      }

      return [
        ing.inventory_name || ing.name || "",
        `${totalQte.toFixed(displayUnit === "g" || (displayUnit === "ml" && totalQte > 1) ? 0 : 2)} ${displayUnit}`,
        (qte * getIngredientEffectivePrice(ing) * count).toFixed(2),
      ];
    });

    autoTable(doc, {
      startY: y + 5,
      head: [
        [t.ingredient || "Ingrédient", t.qtyShort || "Qte", t.cost || "Coût"],
      ],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [245, 158, 11] },
    });

    doc.save(
      `fiche_technique_${recipe.name?.replace(/\s+/g, "_") || "recette"}.pdf`,
    );
  };

  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const toggleRecipeExpansion = (id: string) => {
    setExpandedRecipes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveToBook = async (id: string) => {
    try {
      await fetch(`/api/recipes/${id}/save`, { method: "PUT" });
      fetchRecipes();
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (activeTab === "recipes") {
      fetchRecipes();
      fetchInventory();
      fetchSupplierComparison();
    }
  }, [activeTab]);

  const fetchSupplierComparison = async () => {
    try {
      const res = await fetch("/api/supplier-prices/comparison");
      const data = await res.json();
      setSupplierComparison(data);
    } catch (error) {
      console.error("Error fetching supplier comparison for recipes modal:", error);
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await fetch("/api/inventory");
      const data = await res.json();
      setInventory(data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchRecipes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/recipes");
      const data = await res.json();
      setRecipes(data);

      // Initialize guest counts, preserving existing ones if present
      setGuestCounts((prev) => {
        const next = { ...prev };
        data.forEach((r: any) => {
          if (next[r.id] === undefined) next[r.id] = 1;
        });
        return next;
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteRecipe = async (id: string) => {
    if (!confirm(t.confirmDeleteRecipe || "Supprimer cette fiche technique ?"))
      return;
    try {
      await fetch(`/api/recipes/${id}`, { method: "DELETE" });
      setRecipes(recipes.filter((r) => r.id !== id));
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
    }
  };

  const saveRecipe = async (recipe: any) => {
    try {
      if (recipe.id.startsWith("manual-")) {
        const res = await fetch(`/api/recipes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: recipe.name,
            category: recipe.category,
            ingredients: recipe.ingredients,
            preparation_steps: recipe.preparation_steps,
          }),
        });
        if (res.ok) {
          alert(t.recipeSaved || "Fiche technique enregistrée !");
          setSelectedRecipeForModal(null);
          fetchRecipes();
        }
      } else {
        const res = await fetch(`/api/recipes/${recipe.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: recipe.name,
            ingredients: recipe.ingredients.map((ing: any) => ({
              inventory_name: ing.inventory_name,
              inventory_id: ing.inventory_id,
              quantity_per_person: ing.quantity_per_person,
            })),
            preparation_steps: recipe.preparation_steps,
          }),
        });
        if (res.ok) {
          alert(t.recipeSaved || "Fiche technique enregistrée !");
          fetchRecipes();
        }
      }
    } catch (error) {
      console.error("Erreur lors de l'enregistrement:", error);
    }
  };

  const handleSaveFicheToBook = async (fiche: any) => {
    // Transform fiche to recipe format
    const recipe = {
      id: "manual-" + Date.now(),
      name: fiche.recette,
      category: fiche.categorie || "Non classé",
      ingredients: (fiche.ingredients || []).map((ing: any) => ({
        inventory_name: ing.name || ing.ingredient,
        inventory_id: null,
        quantity_per_person: ing.qte || ing.quantite || 0,
      })),
      preparation_steps: fiche.preparation_steps || fiche.instructions || "",
    };
    await saveRecipe(recipe);
  };

  const addIngredient = (recipeId: string) => {
    const newIng = {
      id: Math.random().toString(36).substr(2, 9),
      name: "Nouvel ingrédient",
      inventory_name: "Nouvel ingrédient",
      quantity_per_person: 0,
      unit: "kg",
      unit_price: 0,
    };

    setRecipes((prev) =>
      prev.map((r) =>
        r.id === recipeId
          ? {
              ...r,
              ingredients: [...(r.ingredients || []), newIng],
            }
          : r,
      ),
    );

    setSelectedRecipeForModal((prev) =>
      prev
        ? {
            ...prev,
            ingredients: [...(prev.ingredients || []), newIng],
          }
        : prev,
    );
  };

  const removeIngredient = (recipeId: string, ingId: string) => {
    const newRecipes = recipes.map((r) => {
      if (r.id === recipeId) {
        return {
          ...r,
          ingredients: r.ingredients.filter((i: any) => i.id !== ingId),
        };
      }
      return r;
    });
    setRecipes(newRecipes);
  };

  const addToCart = (recipe: any) => {
    if (!setCartItems || !cartItems) return;

    const count = guestCounts[recipe.id] || 1;

    // Actualisation : on retire les anciens éléments de cette recette spécifique du panier
    const otherItems = cartItems.filter((i) => i.sourceRecipeId !== recipe.id);
    const newItems = [...otherItems];

    // Ajout systématique de l'entête de la recette pour qu'elle apparaisse dans "Plan de Production"
    newItems.push({
      id: Math.random().toString(36).substr(2, 9),
      isRecipeHeader: true,
      sourceRecipeId: recipe.id,
      recipeName: recipe.name,
      guests: count,
      quantity: 0,
      total: 0,
      item: "",
      inventory_id: null,
    });

    recipe.ingredients?.forEach((ing: any) => {
      if (!ing.inventory_name) return;

      const totalQty =
        (parseFloat(
          (ing.quantity_per_person || "").toString().replace(",", "."),
        ) || 0) * count;

      newItems.push({
        id: Math.random().toString(36).substr(2, 9),
        item: ing.inventory_name,
        inventory_id: ing.inventory_id || ing.id,
        quantity: totalQty,
        quantity_per_person: ing.quantity_per_person || 0,
        guests: count,
        unit: ing.unit || "kg",
        supplier: getSupplierForIngredient(ing.inventory_name),
        price: ing.unit_price || 0,
        total: totalQty * getIngredientEffectivePrice(ing),
        sourceRecipeId: recipe.id,
        recipeName: recipe.name,
      });
    });

    setCartItems(newItems);
    setAddedToPlanIds((prev) => new Set(prev).add(recipe.id));
    setTimeout(() => {
      setAddedToPlanIds((prev) => {
        const next = new Set(prev);
        next.delete(recipe.id);
        return next;
      });
    }, 2000);
    showNotification(
      (
        t.successAddToCartProduction ||
        "✅ {name} a été ajouté au Plan de Production avec {count} convive(s)."
      )
        .replace("{name}", recipe.name)
        .replace("{count}", count.toString()),
    );
  };

  const generatedRecipes = recipes.filter((r) => !r.is_saved);
  const savedRecipes = recipes
    .filter((r) => r.is_saved)
    .sort((a, b) => a.name.localeCompare(b.name));

  const categories = [
    {
      id: "creative",
      name: t.creativeMenu || "Menu Créatif",
      icon: Clock,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      id: "gastronomic",
      name: t.highGastronomy || t.gastronomy || "Haute Gastronomie",
      icon: Sparkles,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      id: "traditional",
      name: t.traditionalCatering || "Bistro Chic",
      icon: ChefHat,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      id: "decompose",
      name: t.importedSheets || "Fiches Importées",
      icon: UploadCloud,
      color: "text-brand-500",
      bg: "bg-brand-500/10",
    },
  ];

  return (
    <div className="led-glow-container h-full flex flex-col animate-in fade-in duration-500 overflow-hidden relative">
      <div className="p-6 border-b border-white/10 bg-[#0A0A0A] flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center">
            <BookOpen className="w-6 h-6 mr-3 text-emerald-500" />
            {t.technicalSheets}
          </h2>
          <p className="text-slate-500 mt-1">{t.foodCostSubtitle}</p>
        </div>
        <div className="flex gap-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileScan}
            accept="image/*,.pdf"
            className="hidden"
          />
          <button
            onClick={() => {
              const newRecipe = {
                id: "manual-" + Math.random().toString(36).substr(2, 9),
                name: t.newRecipe || "Nouvelle Recette",
                category: selectedCategory || "general",

                ingredients: [],
                preparation_steps: "",
                is_saved: true,
              };
              setSelectedRecipeForModal(newRecipe);
            }}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all led-glow-emerald border border-blue-400/30 shadow-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t.addRecipeManually || "Ajouter Manuellement"}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all led-glow-purple border border-purple-400/30 shadow-lg flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-purple-200 animate-pulse" />
            {t.scanAndImport || "Scanner & Importer par IA"}
          </button>
          <button
            onClick={() => {
              setViewMode(viewMode === "categories" ? "book" : "categories");
              setActiveLetter(null);
            }}
            className={`px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2 border shadow-lg ${
              viewMode === "book"
                ? "bg-amber-600 hover:bg-amber-500 text-white led-glow-amber border-amber-400/30"
                : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            {t.recipeBook || "Livre des Recettes"}
          </button>
          <button
            onClick={fetchRecipes}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all led-glow-emerald border border-emerald-400/30 shadow-lg flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {t.refresh}
          </button>
        </div>
      </div>

      {isScanning && (
        <div className="absolute inset-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="relative flex flex-col items-center text-center max-w-sm p-8 bg-black/60 rounded-3xl border border-white/10 shadow-2xl">
            <div className="relative w-24 h-24 mb-6">
              <Sparkles className="w-12 h-12 text-purple-400 absolute inset-0 m-auto animate-pulse" />
              <div className="w-24 h-24 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
            </div>
            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">
              Analyse IA en cours...
            </h3>
            <p className="text-slate-400 text-sm">
              Notre intelligence artificielle examine votre document pour en extraire les détails, ingrédients requis, étapes de préparation et allergènes.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/4 min-w-[300px] bg-[#0A0A0A] border-r border-white/5 overflow-y-auto p-6 flex flex-col gap-3">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2 mb-4">
            {t.menuFolders || "Dossiers de Menus"}{" "}
            {viewMode === "book"
              ? savedRecipes.length
              : generatedRecipes.length}{" "}
          </h3>
          {categories.map((cat) => {
            const count = (
              viewMode === "book" ? savedRecipes : generatedRecipes
            ).filter(
              (r: any) =>
                (r.category || "general") === cat.id ||
                (cat.id === "decompose" && r.category === "general"),
            ).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${selectedCategory === cat.id ? "bg-[#1A1A1A] ring-1 ring-white/10 shadow-lg scale-[1.02]" : "hover:bg-white/5 opacity-70 hover:opacity-100"}`}
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${cat.bg} ${cat.color}`}
                >
                  <cat.icon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-white mb-1">{cat.name}</h4>
                  <p className="text-xs font-mono text-slate-500">
                    {count} {t.sheetsCount || "fiches"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-[#050505]">
          {!selectedCategory ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
              <FolderOpen className="w-20 h-20 text-slate-600 mb-6" />
              <h3 className="text-xl font-bold text-white mb-2">
                {t.noFolderSelected || "Aucun dossier sélectionné"}
              </h3>
              <p className="text-slate-500 max-w-sm">
                {t.selectCategoryDesc ||
                  "Sélectionnez une catégorie dans le menu latéral pour voir les fiches techniques associées."}
              </p>
            </div>
          ) : viewMode === "categories" ? (
            // MODE GENERATED

            generatedRecipes.filter(
              (r: any) =>
                (r.category || "general") === selectedCategory ||
                (selectedCategory === "decompose" && r.category === "general"),
            ).length === 0 ? (
              <div className="text-center py-20 bg-[#0A0A0A] rounded-3xl border border-white/5">
                <BookOpen className="w-16 h-16 text-slate-600 mx-auto mb-6" />
                <h3 className="text-lg font-bold text-white mb-2">
                  {t.emptyFolder || "Dossier vide"}
                </h3>
                <p className="text-slate-500">
                  {t.emptyFolderDesc ||
                    "Générez des menus pour remplir cette catégorie."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {generatedRecipes
                  .filter(
                    (r: any) =>
                      (r.category || "general") === selectedCategory ||
                      (selectedCategory === "decompose" &&
                        r.category === "general"),
                  )
                  .map((recipe) => (
                    <div
                      key={recipe.id}
                      className="bg-black border border-brand-500/30 rounded-2xl p-6 flex flex-col relative group led-glow-emerald cursor-pointer hover:border-brand-500/60 transition-all hover:scale-[1.01]"
                      onClick={() => setSelectedRecipeForModal(recipe)}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRecipe(recipe.id);
                        }}
                        className="absolute top-4 right-4 p-2 bg-red-500/10 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white z-10"
                        title={t.deleteRecipe}
                      >
                        <X className="w-4 h-4" />
                      </button>

                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-white mb-2">
                            {recipe.name}
                          </h3>
                          <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg inline-block">
                            <span className="text-emerald-400 font-bold text-sm">
                              {(
                                recipe.ingredients?.reduce(
                                  (sum: number, ing: any) =>
                                    sum +
                                    (parseFloat(
                                      (ing.quantity_per_person || "")
                                        .toString()
                                        .replace(",", "."),
                                    ) || 0) *
                                      getIngredientEffectivePrice(ing),
                                  0,
                                ) || 0
                              ).toFixed(2)}
                            </span>
                            <span className="text-xs text-emerald-500/70 ml-1">
                              {t.portionShort || "/ portion"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRecipeForModal(recipe);
                            }}
                            className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2.5 rounded-xl transition-all border border-emerald-500/20 flex items-center justify-center gap-2 w-full hover:scale-105 active:scale-95 shadow-lg"
                          >
                            <BookOpen className="w-4 h-4" />
                            {t.technicalSheetFull || "Fiche Technique"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveToBook(recipe.id);
                            }}
                            className="text-[10px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 hover:bg-amber-500 hover:text-white px-4 py-2.5 rounded-xl transition-all border border-amber-500/30 flex items-center justify-center gap-2 w-full hover:scale-105 active:scale-95 shadow-lg shadow-amber-500/10"
                          >
                            <FolderOpen className="w-4 h-4" />
                            {t.save || "Enregistrer"}
                          </button>
                        </div>
                      </div>

                      {expandedRecipes[recipe.id] && (
                        <div className="mt-4 pt-4 border-t border-brand-500/20 animate-in slide-in-from-top-2 duration-300">
                          {recipe.source_image_url && (
                            <div className="mb-6 rounded-2xl overflow-hidden border border-white/10 shadow-xl max-h-[300px] flex justify-center">
                              <MediaDisplay
                                src={recipe.source_image_url}
                                alt={t.sourceAlt || "Source"}
                                className="object-contain max-h-full"
                              />
                            </div>
                          )}

                          {recipe.preparation_steps ? (
                            <div className="mb-6 flex flex-col gap-4">
                              <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                                <h4 className="text-sm font-bold text-white mb-3 flex items-center">
                                  <ChefHat className="w-4 h-4 mr-2 text-emerald-500" />{" "}
                                  {t.prepSteps}
                                </h4>
                                <div className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                                  {recipe.preparation_steps}
                                </div>
                              </div>
                              <div className="flex justify-center">
                                <button
                                  onClick={() => generateSteps(recipe.id)}
                                  disabled={generatingSteps[recipe.id]}
                                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500/50 hover:text-emerald-500 transition-colors"
                                >
                                  <RefreshCw
                                    className={`w-3 h-3 ${generatingSteps[recipe.id] ? "animate-spin" : ""}`}
                                  />
                                  {generatingSteps[recipe.id]
                                    ? t.generating
                                    : t.regenerateSteps}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="mb-6 flex justify-center">
                              <button
                                onClick={() => generateSteps(recipe.id)}
                                disabled={generatingSteps[recipe.id]}
                                className="px-6 py-3 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-400 rounded-2xl border border-emerald-500/30 font-black uppercase tracking-widest text-[10px] flex items-center gap-3 transition-all disabled:opacity-50 shadow-lg"
                              >
                                {generatingSteps[recipe.id] ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <ChefHat className="w-4 h-4" />
                                )}
                                {generatingSteps[recipe.id]
                                  ? t.generating
                                  : t.generateSteps}
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-4 mb-4 bg-white/5 p-3 rounded-xl border border-white/10">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-slate-400" />
                              <span className="text-sm font-medium text-slate-300">
                                {t.guests} :
                              </span>
                              <input
                                type="number"
                                min="1"
                                value={guestCounts[recipe.id] || 1}
                                onChange={(e) =>
                                  setGuestCounts({
                                    ...guestCounts,
                                    [recipe.id]: parseInt(e.target.value) || 1,
                                  })
                                }
                                className="w-16 bg-black/40 border border-white/10 rounded-lg text-center font-bold text-white py-1 focus:ring-2 focus:ring-brand-500 outline-none"
                              />
                            </div>
                            <div className="ml-auto flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  exportSingleRecipeToPDF(recipe);
                                }}
                                className="flex items-center justify-center p-2 text-slate-500 hover:text-white rounded-lg transition-colors cursor-pointer mr-2"
                                title={t.download || "Télécharger"}
                              >
                                <Download className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => addToCart(recipe)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border shadow-lg ${
                                  addedToPlanIds.has(recipe.id)
                                    ? "bg-emerald-500 text-white border-emerald-400"
                                    : "bg-brand-500/20 text-brand-400 hover:bg-brand-500 hover:text-white border-brand-500/30 shadow-brand-500/10"
                                }`}
                              >
                                {addedToPlanIds.has(recipe.id) ? (
                                  <>
                                    <Check className="w-4 h-4" />
                                    OK
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    {t.productionPlan || "Plan Production"}
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="bg-black rounded-xl border border-white/5 overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm text-left text-slate-300">
                                <thead className="text-xs text-slate-500 uppercase bg-[#1A1A1A]/80 border-b border-white/10">
                                  <tr>
                                    <th className="px-4 py-3 min-w-[200px]">
                                      {t.ingredient}
                                    </th>
                                    <th className="px-4 py-3 text-right">
                                      {t.qtyShort || "Qte"}
                                    </th>
                                    <th className="px-4 py-3 text-right">
                                      {t.unitPrice}
                                    </th>
                                    <th className="px-4 py-3 text-right">
                                      {t.cost}
                                    </th>
                                    <th className="px-4 py-3 text-center">
                                      {t.actions || "Action"}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {recipe.ingredients?.map((ing: any) => (
                                    <tr
                                      key={ing.id}
                                      className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                                    >
                                      <td className="px-4 py-2 font-medium text-white">
                                        <input
                                          type="text"
                                          placeholder={t.name || "Nom"}
                                          value={ing.inventory_name || ing.name || ""}
                                          onChange={(e) => {
                                            const newName = e.target.value;
                                            const newRecipes = recipes.map((r) => {
                                              if (r.id === recipe.id) {
                                                return {
                                                  ...r,
                                                  ingredients: r.ingredients.map((i: any) =>
                                                    i.id === ing.id
                                                      ? {
                                                          ...i,
                                                          inventory_name: newName,
                                                          name: newName,
                                                        }
                                                      : i,
                                                  ),
                                                };
                                              }
                                              return r;
                                            });
                                            setRecipes(newRecipes);
                                          }}
                                          className="w-full bg-black/40 border border-white/10 hover:border-amber-500/30 rounded-lg px-2 py-1 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all shadow-inner shadow-black/50 text-white font-bold text-sm"
                                        />
                                      </td>
                                      <td className="px-4 py-2 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={
                                              ing.quantity_per_person === 0
                                                ? ""
                                                : ing.quantity_per_person
                                            }
                                            onChange={(e) => {
                                              const newQte = e.target.value;
                                              const newRecipes = recipes.map(
                                                (r) => {
                                                  if (r.id === recipe.id) {
                                                    return {
                                                      ...r,

                                                      ingredients:
                                                        r.ingredients.map(
                                                          (i: any) =>
                                                            i.id === ing.id
                                                              ? {
                                                                  ...i,
                                                                  quantity_per_person:
                                                                    newQte,
                                                                }
                                                              : i,
                                                        ),
                                                    };
                                                  }
                                                  return r;
                                                },
                                              );
                                              setRecipes(newRecipes);
                                            }}
                                            className="w-20 bg-black/40 border border-white/10 rounded-lg text-center font-bold text-white py-1 focus:ring-1 focus:ring-emerald-500 outline-none text-sm"
                                          />
                                          <input
                                            type="text"
                                            placeholder={t.unit || "kg"}
                                            value={ing.unit || ""}
                                            onChange={(e) => {
                                              const newUnit = e.target.value;
                                              const newRecipes = recipes.map((r) => {
                                                if (r.id === recipe.id) {
                                                  return {
                                                    ...r,
                                                    ingredients: r.ingredients.map((i: any) =>
                                                      i.id === ing.id
                                                        ? { ...i, unit: newUnit }
                                                        : i,
                                                    ),
                                                  };
                                                }
                                                return r;
                                              });
                                              setRecipes(newRecipes);
                                            }}
                                            className="w-10 bg-black/40 border border-white/10 rounded-lg text-center text-slate-400 py-1 outline-none text-xs focus:border-emerald-500"
                                          />
                                        </div>
                                      </td>
                                      <td className="px-4 py-2 text-right text-xs">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={ing.unit_price === 0 || ing.unit_price === undefined ? "" : ing.unit_price}
                                          onChange={(e) => {
                                            const newPrice = parseFloat(e.target.value.replace(",", ".")) || 0;
                                            const newRecipes = recipes.map((r) => {
                                              if (r.id === recipe.id) {
                                                return {
                                                  ...r,
                                                  ingredients: r.ingredients.map((i: any) =>
                                                    i.id === ing.id
                                                      ? { ...i, unit_price: newPrice }
                                                      : i,
                                                  ),
                                                };
                                              }
                                              return r;
                                            });
                                            setRecipes(newRecipes);
                                          }}
                                          className="w-20 bg-black/40 border border-white/10 rounded-lg text-center font-mono font-bold text-blue-400 py-1 focus:ring-1 focus:ring-blue-500 outline-none text-xs"
                                        />
                                      </td>
                                      <td className="px-4 py-2 text-right text-emerald-400 font-bold tabular-nums">
                                        {(
                                          (parseFloat(
                                            (ing.quantity_per_person || "")
                                              .toString()
                                              .replace(",", "."),
                                          ) || 0) * getIngredientEffectivePrice(ing)
                                        ).toFixed(2)}
                                      </td>
                                      <td className="px-4 py-2 text-center">
                                        <button
                                          onClick={() =>
                                            removeIngredient(recipe.id, ing.id)
                                          }
                                          className="p-1.5 text-slate-500 hover:text-red-500 transition-colors bg-white/5 rounded-lg"
                                          title={t.delete || "Supprimer"}
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                  <tr>
                                    <td colSpan={5} className="p-2">
                                      <button
                                        onClick={() => addIngredient(recipe.id)}
                                        className="w-full py-2.5 bg-white/5 border border-dashed border-white/10 rounded-xl text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/5 hover:border-emerald-500/30 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest font-bold"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        {t.newIngredient ||
                                          "Ajouter un ingrédient"}
                                      </button>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )
          ) : (
            <div className="space-y-6">
              {/* A-Z Filter Bar */}
              <div className="flex items-center gap-2 overflow-x-auto pb-4 hide-scrollbar">
                <button
                  onClick={() => setActiveLetter(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors min-w-[40px] ${!activeLetter ? "bg-amber-500 text-white" : "bg-[#1A1A1A] text-slate-400 hover:text-white"}`}
                >
                  {t.all || "TOUS"}
                </button>
                {ALPHABET.map((letter) => {
                  const hasItems =
                    savedRecipes.filter(
                      (r: any) =>
                        ((r.category || "general") === selectedCategory ||
                          (selectedCategory === "decompose" &&
                            r.category === "general")) &&
                        r.name &&
                        r.name.toUpperCase().startsWith(letter),
                    ).length > 0;
                  return (
                    <button
                      key={letter}
                      onClick={() =>
                        hasItems ? setActiveLetter(letter) : null
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors min-w-[32px] ${
                        activeLetter === letter
                          ? "bg-amber-500 text-white"
                          : hasItems
                            ? "bg-[#1A1A1A] text-white hover:bg-white/10"
                            : "bg-[#111] text-slate-700 cursor-not-allowed"
                      }`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>

              {["entree", "plat", "dessert"].map((dishType) => {
                const filteredSortedRecipes = savedRecipes
                  .filter(
                    (r: any) =>
                      (r.category || "general") === selectedCategory ||
                      (selectedCategory === "decompose" &&
                        r.category === "general"),
                  )
                  .filter(
                    (r: any) =>
                      !activeLetter ||
                      (r.name && r.name.toUpperCase().startsWith(activeLetter)),
                  )
                  .filter((r: any) => {
                    const tType = r.dish_type || "plat";
                    return tType === dishType;
                  })
                  .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));

                if (filteredSortedRecipes.length === 0) return null;

                return (
                  <div key={dishType} className="mb-12">
                    <h3 className="font-black text-2xl text-amber-500 tracking-widest uppercase mb-6 flex items-center border-b border-amber-500/20 pb-3">
                      <ChefHat className="w-6 h-6 mr-3" />
                      {dishType === "entree" ? (t.starter || "Entrées") : dishType === "plat" ? (t.mainCourse || "Plats") : (t.dessert || "Desserts")}
                    </h3>
                    <div className="space-y-6">
                      {filteredSortedRecipes.map((recipe) => (
                        <div
                          key={recipe.id}
                          className="bg-black border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.05)] rounded-2xl p-6 relative group overflow-hidden mb-6 cursor-pointer hover:border-amber-500/50 transition-all hover:scale-[1.01]"
                          onClick={() => setSelectedRecipeForModal(recipe)}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRecipe(recipe.id);
                            }}
                            className="absolute top-4 right-4 p-2 bg-red-500/10 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white z-20"
                            title={t.deleteRecipe}
                          >
                            <X className="w-4 h-4" />
                          </button>

                    <div className="flex justify-between items-center">
                      <h3 className="text-xl font-bold text-white group-hover:text-amber-400 transition-colors">
                        {recipe.name}
                      </h3>
                      <div className="flex items-center gap-4 mr-10 relative z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRecipeExpansion(recipe.id);
                          }}
                          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                        >
                          {expandedRecipes[recipe.id] ? (
                            <ChevronUp className="w-5 h-5 text-slate-500" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-500" />
                          )}
                        </button>
                        <span className="text-amber-500 font-bold bg-amber-500/10 px-3 py-1 rounded-lg">
                          {(
                            recipe.ingredients?.reduce(
                              (sum: number, ing: any) =>
                                sum +
                                (parseFloat(
                                  (ing.quantity_per_person || "")
                                    .toString()
                                    .replace(",", "."),
                                ) || 0) *
                                  getIngredientEffectivePrice(ing),
                              0,
                            ) || 0
                          ).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* EDITABLE SECTION */}
                    {expandedRecipes[recipe.id] && (
                      <div className="mt-8 pt-6 border-t border-white/5 animate-in slide-in-from-top-4 duration-300">
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex-1 max-w-xl">
                            <label className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-2 block">
                              {t.dishName || "Nom du plat"}
                            </label>
                            <textarea
                              value={recipe.name}
                              onChange={(e) => {
                                const newRecipes = recipes.map((r) =>
                                  r.id === recipe.id
                                    ? { ...r, name: e.target.value }
                                    : r,
                                );
                                setRecipes(newRecipes);
                              }}
                              rows={1}
                              className="text-2xl font-black text-amber-400 bg-transparent border-b border-transparent hover:border-white/20 focus:border-amber-500 focus:outline-none w-full resize-none leading-tight overflow-hidden transition-colors"
                            />
                          </div>
                        </div>

                        {recipe.source_image_url && (
                          <div className="mb-6 rounded-2xl overflow-hidden border border-white/10 shadow-xl max-h-[300px] flex justify-center bg-black/20">
                            <MediaDisplay
                              src={recipe.source_image_url}
                              alt={t.sourceAlt || "Source"}
                              className="object-contain max-h-full"
                            />
                          </div>
                        )}

                        {recipe.preparation_steps ? (
                          <div className="mb-8 flex flex-col gap-4">
                            <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                              <h4 className="text-sm font-bold text-amber-500 mb-3 flex items-center">
                                <ChefHat className="w-4 h-4 mr-2" />{" "}
                                {t.prepSteps}
                              </h4>
                              <div className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                                {recipe.preparation_steps}
                              </div>
                            </div>
                            <div className="flex justify-center">
                              <button
                                onClick={() => generateSteps(recipe.id)}
                                disabled={generatingSteps[recipe.id]}
                                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-500/50 hover:text-amber-500 transition-colors"
                              >
                                <RefreshCw
                                  className={`w-3 h-3 ${generatingSteps[recipe.id] ? "animate-spin" : ""}`}
                                />
                                {generatingSteps[recipe.id]
                                  ? t.generating
                                  : t.regenerateSteps}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mb-8 flex justify-center">
                            <button
                              onClick={() => generateSteps(recipe.id)}
                              disabled={generatingSteps[recipe.id]}
                              className="px-8 py-4 bg-amber-500/10 hover:bg-amber-500 hover:text-white text-amber-400 rounded-2xl border border-amber-500/30 font-black uppercase tracking-widest text-xs flex items-center gap-3 transition-all disabled:opacity-50 shadow-lg shadow-amber-500/10"
                            >
                              {generatingSteps[recipe.id] ? (
                                <RefreshCw className="w-5 h-5 animate-spin" />
                              ) : (
                                <ChefHat className="w-5 h-5" />
                              )}
                              {generatingSteps[recipe.id]
                                ? t.generating
                                : t.generateSteps}
                            </button>
                          </div>
                        )}

                        <div className="flex bg-[#0A0A0A] p-4 rounded-2xl border border-white/5 gap-4 mb-6">
                          <div className="flex items-center gap-3 px-4">
                            <Users className="w-5 h-5 text-slate-400" />
                            <span className="text-xs font-black text-slate-300 uppercase tracking-widest">
                              {t.guests} :
                            </span>
                            <input
                              type="number"
                              min="1"
                              value={guestCounts[recipe.id] || 1}
                              onChange={(e) =>
                                setGuestCounts({
                                  ...guestCounts,
                                  [recipe.id]: parseInt(e.target.value) || 1,
                                })
                              }
                              className="w-16 bg-[#1A1A1A] border-2 border-white/10 rounded-xl text-center font-black text-lg text-white py-1 focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                            />
                          </div>
                          <div className="flex-1 flex justify-end gap-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                exportSingleRecipeToPDF(recipe);
                              }}
                              className="flex items-center gap-2 p-2 bg-transparent text-slate-500 hover:text-white rounded-xl transition-colors cursor-pointer"
                              title={t.download || "Télécharger"}
                            >
                              <Download className="w-5 h-5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                saveRecipe(recipe);
                              }}
                              className="flex items-center gap-2 px-6 py-2 bg-white/5 text-white hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-colors border border-white/10"
                            >
                              <Save className="w-4 h-4" />
                              {t.saveFull || "SAUVEGARDER"}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCart(recipe);
                              }}
                              className="flex items-center gap-2 px-6 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-emerald-500/30"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              {t.prodPlanShort || "Plan Prod"}
                            </button>
                          </div>
                        </div>

                        <div className="bg-[#1A1A1A] rounded-2xl border border-white/5">
                          <table className="w-full text-sm text-left text-slate-300">
                            <thead className="text-[10px] text-slate-500 uppercase font-black bg-black/40 border-b border-white/5 tracking-widest">
                              <tr>
                                <th className="px-4 py-3 w-1/2">
                                  {t.ingredient}
                                </th>
                                <th className="px-4 py-3 text-right">
                                  {t.qtyPerPersShort || "Qté/Pers"}
                                </th>
                                <th className="px-4 py-3 text-right">
                                  {t.unitPriceShort || "Prix.U"}
                                </th>
                                <th className="px-4 py-3 text-right">
                                  {t.net || "Net"}
                                </th>
                                <th className="px-4 py-3 text-center w-12"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {recipe.ingredients?.map((ing: any) => (
                                <tr
                                  key={ing.id}
                                  className="border-b border-white/5 last:border-0 hover:bg-white/5"
                                >
                                  <td className="px-4 py-3 font-medium text-white">
                                    <input
                                      type="text"
                                      placeholder={t.name || "Nom"}
                                      value={ing.inventory_name || ing.name || ""}
                                      onChange={(e) => {
                                        const newName = e.target.value;
                                        const newRecipes = recipes.map((r) =>
                                          r.id === recipe.id
                                            ? {
                                                ...r,
                                                ingredients: r.ingredients.map((i: any) =>
                                                  i.id === ing.id
                                                    ? {
                                                        ...i,
                                                        inventory_name: newName,
                                                        name: newName,
                                                      }
                                                    : i
                                                ),
                                              }
                                            : r
                                        );
                                        setRecipes(newRecipes);
                                      }}
                                      className="w-full bg-[#0A0A0A] border border-white/5 hover:border-amber-500/30 rounded-lg px-2 py-1 text-white text-sm focus:border-amber-500 font-bold outline-none text-amber-400"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={
                                          ing.quantity_per_person === 0
                                            ? ""
                                            : ing.quantity_per_person
                                        }
                                        onChange={(e) => {
                                          const newQte = e.target.value;
                                          const newRecipes = recipes.map((r) =>
                                            r.id === recipe.id
                                              ? {
                                                  ...r,
                                                  ingredients: r.ingredients.map(
                                                    (i: any) =>
                                                      i.id === ing.id
                                                        ? {
                                                            ...i,
                                                            quantity_per_person:
                                                              newQte,
                                                          }
                                                        : i,
                                                  ),
                                                }
                                              : r,
                                          );
                                          setRecipes(newRecipes);
                                        }}
                                        className="w-16 bg-[#0A0A0A] border border-white/5 rounded-lg text-center font-mono font-bold text-emerald-400 py-1 outline-none"
                                      />
                                      <input
                                        type="text"
                                        placeholder={t.unit || "kg"}
                                        value={ing.unit || ""}
                                        onChange={(e) => {
                                          const newUnit = e.target.value;
                                          const newRecipes = recipes.map((r) =>
                                            r.id === recipe.id
                                              ? {
                                                  ...r,
                                                  ingredients: r.ingredients.map((i: any) =>
                                                    i.id === ing.id
                                                      ? { ...i, unit: newUnit }
                                                      : i
                                                  ),
                                                }
                                              : r
                                          );
                                          setRecipes(newRecipes);
                                        }}
                                        className="w-10 bg-[#0A0A0A] border border-white/5 rounded-lg text-center text-slate-400 py-1 outline-none text-xs focus:border-emerald-500"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={ing.unit_price === 0 || ing.unit_price === undefined ? "" : ing.unit_price}
                                      onChange={(e) => {
                                        const newPrice = parseFloat(e.target.value.replace(",", ".")) || 0;
                                        const newRecipes = recipes.map((r) =>
                                          r.id === recipe.id
                                            ? {
                                                ...r,
                                                ingredients: r.ingredients.map((i: any) =>
                                                  i.id === ing.id
                                                    ? { ...i, unit_price: newPrice }
                                                    : i
                                                ),
                                              }
                                            : r
                                        );
                                        setRecipes(newRecipes);
                                      }}
                                      className="w-20 bg-[#0A0A0A] border border-white/5 rounded-lg text-center font-mono font-bold text-blue-400 py-1 outline-none focus:border-blue-500 text-xs"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono font-bold text-amber-400">
                                    {(
                                      (parseFloat(
                                        (ing.quantity_per_person || "")
                                          .toString()
                                          .replace(",", "."),
                                      ) || 0) * getIngredientEffectivePrice(ing)
                                    ).toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={() =>
                                        removeIngredient(recipe.id, ing.id)
                                      }
                                      className="p-1.5 text-slate-600 hover:text-red-500 bg-red-500/0 hover:bg-red-500/10 rounded-lg"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              <tr>
                                <td colSpan={5} className="p-2">
                                  <button
                                    onClick={() => addIngredient(recipe.id)}
                                    className="w-full py-3 border border-dashed border-white/10 rounded-xl text-slate-500 hover:text-amber-500 hover:bg-amber-500/5 text-xs font-bold uppercase tracking-widest flex justify-center items-center gap-2"
                                  >
                                    <Plus className="w-4 h-4" />
                                    Ajouter un ingrédient
                                  </button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
              {savedRecipes
                .filter(
                  (r: any) =>
                    (r.category || "general") === selectedCategory ||
                    (selectedCategory === "decompose" &&
                      r.category === "general"),
                )
                .filter(
                  (r: any) =>
                    !activeLetter ||
                    (r.name && r.name.toUpperCase().startsWith(activeLetter)),
                ).length === 0 && (
                <div className="text-center py-20 bg-black rounded-3xl border border-white/5">
                  <BookOpen className="w-16 h-16 text-slate-600 mx-auto mb-4 opacity-50" />
                  <p className="text-slate-500">
                    {t.noRecipeLetter ||
                      "Aucune recette trouvée sur cette lettre."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL RECETTE */}
      <AnimatePresence>
        {selectedRecipeForModal && (
          <div
            ref={outerModalScrollRef}
            className={`fixed inset-0 z-[100] flex items-start md:items-center justify-center overflow-y-auto custom-scrollbar bg-black/80 backdrop-blur-md ${isRecipeModalFullScreen ? "p-0" : "p-4 md:p-12"}`}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setSelectedRecipeForModal(null);
                setIsRecipeModalFullScreen(false);
              }}
              className="fixed inset-0"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`relative bg-obsidian border border-white/10 shadow-2xl flex flex-col ${isRecipeModalFullScreen ? "w-screen h-screen md:h-screen max-w-none max-h-none rounded-none border-0" : "relative w-full max-w-5xl max-h-[95vh] md:max-h-[90vh] rounded-3xl"}`}
            >
              {/* Header Modal */}
              <div className="p-6 md:p-8 border-b border-white/10 flex flex-col gap-4 bg-gradient-to-r from-emerald-500/10 to-transparent">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      value={selectedRecipeForModal.name}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setRecipes((prev) =>
                          prev.map((r) =>
                            r.id === selectedRecipeForModal.id
                              ? { ...r, name: newVal }
                              : r,
                          ),
                        );
                        setSelectedRecipeForModal((prev) =>
                          prev ? { ...prev, name: newVal } : prev,
                        );
                      }}
                      className="w-full text-2xl md:text-3xl font-black text-white tracking-tight mb-2 break-words drop-shadow-md bg-transparent border-b border-transparent focus:border-emerald-500/50 hover:border-emerald-500/30 outline-none transition-all"
                    />

                    {/* Allergens Display */}
                    {(() => {
                      const recipeAllergens = Array.from(
                        new Set([
                          ...(selectedRecipeForModal.allergens || []).map(
                            (a: string) => a.trim().toUpperCase(),
                          ),
                          ...(selectedRecipeForModal.ingredients || []).flatMap(
                            (ing: any) =>
                              ing.allergens
                                ? ing.allergens
                                    .split(",")
                                    .map((a: string) => a.trim().toUpperCase())
                                : [],
                          ),
                        ]),
                      ).filter(Boolean);

                      if (recipeAllergens.length > 0) {
                        return (
                          <div className="flex flex-wrap gap-2 mt-3 mb-4">
                            <span className="px-2 py-1 bg-red-600 font-bold text-white text-xs uppercase tracking-widest rounded flex items-center">
                              <AlertTriangle className="w-3 h-3 mr-1" />{" "}
                              ALLERGÈNES :
                            </span>
                            {recipeAllergens.map((a: any) => (
                              <span
                                key={a}
                                className="px-3 py-1 bg-red-500/10 border border-red-500/30 text-red-500 font-black text-xs uppercase tracking-widest rounded"
                              >
                                {a}
                              </span>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })()}

                    <div className="flex items-center gap-4">
                      <div className="px-4 py-2 bg-emerald-500/20 rounded-xl border border-emerald-500/30 flex items-center gap-2">
                        <span className="text-emerald-400 font-bold text-lg">
                          {(
                            selectedRecipeForModal.ingredients?.reduce(
                              (sum: number, ing: any) =>
                                sum +
                                (parseFloat(
                                  (ing.quantity_per_person || "")
                                    .toString()
                                    .replace(",", "."),
                                ) || 0) *
                                  ((ing.unit_price || 0) * getCostModifier(ing.unit)),
                              0,
                            ) || 0
                          ).toFixed(2)}
                        </span>
                        <span className="text-xs text-emerald-500/60 uppercase tracking-widest font-black">
                          / Portion
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 text-sm font-mono uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl">
                        <ChefHat className="w-4 h-4" />
                        {selectedRecipeForModal.is_saved
                          ? t.saved || "Enregistrée"
                          : t.generated || "Générée"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        exportSingleRecipeToPDF(selectedRecipeForModal)
                      }
                      className="p-3 bg-white/5 hover:bg-emerald-500/20 hover:text-emerald-400 text-slate-400 rounded-2xl transition-all border border-transparent hover:border-emerald-500/30"
                      title={t.download || "Télécharger"}
                    >
                      <Download className="w-6 h-6" />
                    </button>
                    <button
                      onClick={() => setIsRecipeModalFullScreen(!isRecipeModalFullScreen)}
                      className="p-3 bg-white/5 hover:bg-emerald-500/20 hover:text-emerald-400 text-slate-400 rounded-2xl transition-all border border-transparent hover:border-emerald-500/30"
                      title={isRecipeModalFullScreen ? "Réduire" : "Plein écran"}
                    >
                      {isRecipeModalFullScreen ? (
                        <Minimize2 className="w-6 h-6" />
                      ) : (
                        <Maximize2 className="w-6 h-6" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedRecipeForModal(null);
                        setIsRecipeModalFullScreen(false);
                      }}
                      className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl transition-all"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Content Modal */}
              <div
                ref={modalScrollRef}
                className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar"
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Image & Steps */}
                  <div className="lg:col-span-1 flex flex-col gap-6">
                    {selectedRecipeForModal.source_image_url && (
                      <div className="rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-black/40 aspect-video relative group">
                        <MediaDisplay
                          src={selectedRecipeForModal.source_image_url}
                          alt={selectedRecipeForModal.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>
                      </div>
                    )}

                    <div className="p-6 bg-white/5 border border-white/10 rounded-3xl relative flex-1 flex flex-col overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                        <ChefHat className="w-20 h-20 text-emerald-500" />
                      </div>
                      <h3 className="text-sm font-black text-white uppercase tracking-widest mb-1 flex items-center gap-2">
                        <ChefHat className="w-5 h-5 text-emerald-500" />
                        {t.prepSteps || "Étapes de Préparation"}
                      </h3>
                      <h4 className="text-lg font-bold text-emerald-400 mb-4">
                        {selectedRecipeForModal.name}
                      </h4>
                      {selectedRecipeForModal.preparation_steps !== undefined &&
                      selectedRecipeForModal.preparation_steps !== null ? (
                        <textarea
                          value={selectedRecipeForModal.preparation_steps}
                          onChange={(e) => {
                            const newVal = e.target.value;
                            setRecipes((prev) =>
                              prev.map((r) =>
                                r.id === selectedRecipeForModal.id
                                  ? { ...r, preparation_steps: newVal }
                                  : r,
                              ),
                            );
                            setSelectedRecipeForModal((prev) =>
                              prev
                                ? { ...prev, preparation_steps: newVal }
                                : prev,
                            );
                          }}
                          className="w-full flex-1 min-h-[300px] bg-transparent text-slate-300 text-sm whitespace-pre-wrap leading-relaxed outline-none resize-none"
                          placeholder={
                            t.prepStepsPlaceholder ||
                            "Saisissez les étapes de préparation ici..."
                          }
                        />
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
                          <AlertTriangle className="w-10 h-10 text-amber-500 mb-4 opacity-30" />
                          <p className="text-slate-500 italic mb-6">
                            {t.noPrepSteps ||
                              "Aucune étape de préparation renseignée."}
                          </p>
                          <button
                            onClick={() =>
                              generateSteps(selectedRecipeForModal.id)
                            }
                            disabled={
                              generatingSteps[selectedRecipeForModal.id]
                            }
                            className="flex items-center justify-center gap-3 px-8 py-4 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-400 rounded-2xl border border-emerald-500/30 font-black uppercase tracking-widest text-xs transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/10 active:scale-[0.98]"
                          >
                            {generatingSteps[selectedRecipeForModal.id] ? (
                              <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : (
                              <ChefHat className="w-5 h-5" />
                            )}
                            {generatingSteps[selectedRecipeForModal.id]
                              ? t.generating || "Génération en cours..."
                              : t.generateSteps || "Générer les Étapes"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Ingredients Table */}
                  <div className="lg:col-span-2 flex flex-col space-y-6">
                    {/* Meilleure Offre Ingrédients Advise Box */}
                    {(() => {
                      const optimisations: any[] = [];
                      let totalCurrentCost = 0;
                      let totalOptimizedCost = 0;
                      
                      selectedRecipeForModal.ingredients?.forEach((ing: any) => {
                        const guests = guestCounts[selectedRecipeForModal.id] || 1;
                        const totalQty = (parseFloat((ing.quantity_per_person || "").toString().replace(",", ".")) || 0) * guests;
                        
                        const inventoryItem = inventory.find(i => i.id === ing.inventory_id);
                        const standardPrice = inventoryItem?.unit_price || 0;
                        const originalCost = totalQty * standardPrice;
                        totalCurrentCost += originalCost;

                        const comparison = supplierComparison.find(c => c.inventory_id === ing.inventory_id);
                        
                        if (comparison && comparison.best_supplier_price) {
                          const bestPrice = comparison.best_supplier_price.calculated_price_per_ref;
                          const optimizedCost = totalQty * bestPrice;
                          totalOptimizedCost += optimizedCost;
                          
                          if (bestPrice < standardPrice) {
                            const diff = standardPrice - bestPrice;
                            const savingsPercent = Math.round((diff / standardPrice) * 100);
                            const savingsValue = totalQty * diff;
                            if (savingsValue > 0.01) {
                              optimisations.push({
                                ingredient_name: ing.inventory_name || ing.name,
                                supplier_name: comparison.best_supplier_price.supplier_name,
                                best_price: bestPrice,
                                current_price: standardPrice,
                                unit: comparison.inventory_unit,
                                savings_percent: savingsPercent,
                                savings_value: savingsValue
                              });
                            }
                          }
                        } else {
                          totalOptimizedCost += originalCost;
                        }
                      });

                      if (optimisations.length === 0) return null;

                      const totalSavings = totalCurrentCost - totalOptimizedCost;

                      return (
                        <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                              <span className="text-xs font-black uppercase text-emerald-400 tracking-wider">
                                Optimiseur de Prix Fournisseurs
                              </span>
                            </div>
                            {totalSavings > 0.01 && (
                              <span className="bg-emerald-500/10 text-emerald-400 font-mono font-black text-xs px-2.5 py-0.5 rounded-full">
                                Économie estimée : -{Math.round((totalSavings / totalCurrentCost) * 100)}%
                              </span>
                            )}
                          </div>

                          <div className="space-y-2 max-h-[140px] overflow-y-auto custom-scrollbar">
                            {optimisations.map((opt, oIdx) => (
                              <div key={oIdx} className="text-xs text-slate-300 flex justify-between items-center bg-black/30 p-2 rounded-xl border border-white/5 font-medium">
                                <span className="text-slate-200">
                                  💡 <strong className="font-extrabold text-white">{opt.ingredient_name}</strong> est moins cher chez{' '}
                                  <strong className="font-bold text-emerald-400">{opt.supplier_name}</strong>
                                </span>
                                <div className="text-right">
                                  <span className="block font-bold text-emerald-400 font-mono">
                                    {opt.best_price.toFixed(2)} € / {opt.unit}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    (vs {opt.current_price.toFixed(2)} €, soit -{opt.savings_percent}%)
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-emerald-500" />
                        {t.ingredients || "Ingrédients"}
                        <button
                          onClick={() =>
                            addIngredient(selectedRecipeForModal.id)
                          }
                          className="ml-2 p-1 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </h3>
                      <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/10">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-none">
                          {t.guests || "Convives"} :
                        </span>
                        <input
                          type="number"
                          min="1"
                          value={guestCounts[selectedRecipeForModal.id] || 1}
                          onChange={(e) =>
                            setGuestCounts({
                              ...guestCounts,
                              [selectedRecipeForModal.id]:
                                parseInt(e.target.value) || 1,
                            })
                          }
                          className="w-12 bg-transparent text-white text-center font-black focus:outline-none text-sm"
                        />
                      </div>
                    </div>
                    <div className="bg-[#1A1A1A] rounded-3xl border border-white/10 overflow-hidden shadow-xl flex flex-col">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-black/40 border-b border-white/10 text-[10px] text-slate-500 font-black uppercase tracking-widest">
                            <tr>
                              <th className="px-3 py-1">{t.ingredient}</th>
                              <th className="px-3 py-1 text-right">
                                {t.qty || "Quantité"}
                              </th>
                              <th className="px-3 py-1 text-right">
                                {t.unitPriceShort || "Prix U. (Kg/L/U)"}
                              </th>
                              <th className="px-3 py-1 text-right">
                                {t.cost || "Coût"}
                              </th>
                              <th className="px-3 py-1 w-10"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {selectedRecipeForModal.ingredients &&
                            selectedRecipeForModal.ingredients.length > 0 ? (
                              selectedRecipeForModal.ingredients.map(
                                (ing: any) => {
                                  const guests =
                                    guestCounts[selectedRecipeForModal.id] || 1;
                                  const totalQty =
                                    (parseFloat(
                                      (ing.quantity_per_person || "")
                                        .toString()
                                        .replace(",", "."),
                                    ) || 0) * guests;
                                  return (
                                    <tr
                                      key={ing.id}
                                      className="hover:bg-white/5 transition-colors"
                                    >
                                      <td className="px-2 py-1 font-bold text-white">
                                        <input
                                          type="text"
                                          placeholder={t.name || "Nom"}
                                          value={ing.inventory_name || ing.name || ""}
                                          onChange={(e) => {
                                            const newName = e.target.value;
                                            setRecipes((prev) =>
                                              prev.map((r) =>
                                                r.id ===
                                                selectedRecipeForModal.id
                                                  ? {
                                                      ...r,
                                                      ingredients:
                                                        r.ingredients.map(
                                                          (i: any) =>
                                                            i.id === ing.id
                                                              ? {
                                                                  ...i,
                                                                  inventory_name:
                                                                    newName,
                                                                  name: newName,
                                                                }
                                                              : i,
                                                        ),
                                                    }
                                                  : r,
                                              ),
                                            );
                                            setSelectedRecipeForModal(
                                              (prev) =>
                                                prev
                                                  ? {
                                                      ...prev,
                                                      ingredients:
                                                        prev.ingredients.map(
                                                          (i: any) =>
                                                            i.id === ing.id
                                                              ? {
                                                                  ...i,
                                                                  inventory_name:
                                                                    newName,
                                                                  name: newName,
                                                                }
                                                              : i,
                                                        ),
                                                    }
                                                  : prev,
                                            );
                                          }}
                                          className="w-full bg-black/40 border border-amber-500/30 rounded-lg px-2 py-1 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all shadow-inner shadow-black/50 text-amber-400 text-xs"
                                        />
                                      </td>
                                      <td className="px-2 py-1 text-right tabular-nums">
                                        <div className="flex items-center justify-end">
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={
                                              ing.quantity_per_person === 0
                                                ? ""
                                                : ing.quantity_per_person
                                            }
                                            onChange={(e) => {
                                              const newQte = e.target.value;
                                              setRecipes((prev) =>
                                                prev.map((r) =>
                                                  r.id ===
                                                  selectedRecipeForModal.id
                                                    ? {
                                                        ...r,
                                                        ingredients:
                                                          r.ingredients.map(
                                                            (i: any) =>
                                                              i.id === ing.id
                                                                ? {
                                                                    ...i,
                                                                    quantity_per_person:
                                                                      newQte,
                                                                  }
                                                                : i,
                                                          ),
                                                      }
                                                    : r,
                                                ),
                                              );
                                              setSelectedRecipeForModal((prev) =>
                                                prev
                                                  ? {
                                                      ...prev,
                                                      ingredients:
                                                        prev.ingredients.map(
                                                          (i: any) =>
                                                            i.id === ing.id
                                                              ? {
                                                                  ...i,
                                                                  quantity_per_person:
                                                                    newQte,
                                                                }
                                                              : i,
                                                        ),
                                                    }
                                                  : prev,
                                              );
                                            }}
                                            className="w-16 bg-black/40 border border-emerald-500/30 rounded-lg text-center font-mono font-bold text-emerald-400 py-1 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all shadow-inner shadow-black/50 text-xs"
                                          />
                                          <input
                                            type="text"
                                            placeholder={t.unit || "kg"}
                                            value={ing.unit || ""}
                                            onChange={(e) => {
                                              const newUnit = e.target.value;
                                              setRecipes((prev) =>
                                                prev.map((r) =>
                                                  r.id ===
                                                  selectedRecipeForModal.id
                                                    ? {
                                                        ...r,
                                                        ingredients:
                                                          r.ingredients.map(
                                                            (i: any) =>
                                                              i.id === ing.id
                                                                ? {
                                                                    ...i,
                                                                    unit: newUnit,
                                                                  }
                                                                : i,
                                                          ),
                                                      }
                                                    : r,
                                                ),
                                              );
                                              setSelectedRecipeForModal((prev) =>
                                                prev
                                                  ? {
                                                      ...prev,
                                                      ingredients:
                                                        prev.ingredients.map(
                                                          (i: any) =>
                                                            i.id === ing.id
                                                              ? {
                                                                  ...i,
                                                                  unit: newUnit,
                                                                }
                                                              : i,
                                                        ),
                                                    }
                                                  : prev,
                                              );
                                            }}
                                            className="w-10 ml-1 bg-black/40 border border-white/10 rounded-lg text-center text-slate-400 py-1 outline-none focus:border-emerald-500 text-[10px]"
                                          />
                                        </div>
                                      </td>
                                      <td className="px-2 py-1 text-right tabular-nums">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={
                                            ing.unit_price === 0
                                              ? ""
                                              : ing.unit_price
                                          }
                                          onChange={(e) => {
                                            const newPrice =
                                              parseFloat(
                                                e.target.value.replace(
                                                  ",",
                                                  ".",
                                                ),
                                              ) || 0;
                                            setRecipes((prev) =>
                                              prev.map((r) =>
                                                r.id ===
                                                selectedRecipeForModal.id
                                                  ? {
                                                      ...r,
                                                      ingredients:
                                                        r.ingredients.map(
                                                          (i: any) =>
                                                            i.id === ing.id
                                                              ? {
                                                                  ...i,
                                                                  unit_price:
                                                                    newPrice,
                                                                }
                                                              : i,
                                                        ),
                                                    }
                                                  : r,
                                              ),
                                            );
                                            setSelectedRecipeForModal((prev) =>
                                              prev
                                                ? {
                                                    ...prev,
                                                    ingredients:
                                                      prev.ingredients.map(
                                                        (i: any) =>
                                                          i.id === ing.id
                                                            ? {
                                                                ...i,
                                                                unit_price:
                                                                  newPrice,
                                                              }
                                                            : i,
                                                      ),
                                                  }
                                                : prev,
                                            );
                                          }}
                                          className="w-16 bg-black/40 border border-blue-500/30 rounded-lg text-center font-mono font-bold text-blue-400 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-inner shadow-black/50 text-xs"
                                        />
                                      </td>
                                      <td className="px-6 py-4 text-right tabular-nums">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={
                                            Number(
                                              (
                                                totalQty * getIngredientEffectivePrice(ing)
                                              ).toFixed(2),
                                            ) === 0
                                              ? ""
                                              : Number(
                                                  (
                                                    totalQty * getIngredientEffectivePrice(ing)
                                                  ).toFixed(2),
                                                )
                                          }
                                          onChange={(e) => {
                                            const newCost =
                                              parseFloat(
                                                e.target.value.replace(
                                                  ",",
                                                  ".",
                                                ),
                                              ) || 0;
                                            const yieldPercent = (ing.yield_percent !== undefined) ? ing.yield_percent : 100;
                                            const yieldFactor = yieldPercent / 100;
                                            const newPrice =
                                              totalQty > 0
                                                ? (newCost * yieldFactor) / (totalQty * getCostModifier(ing.unit))
                                                : 0;
                                            setRecipes((prev) =>
                                              prev.map((r) =>
                                                r.id ===
                                                selectedRecipeForModal.id
                                                  ? {
                                                      ...r,
                                                      ingredients:
                                                        r.ingredients.map(
                                                          (i: any) =>
                                                            i.id === ing.id
                                                              ? {
                                                                  ...i,
                                                                  unit_price:
                                                                    newPrice,
                                                                }
                                                              : i,
                                                        ),
                                                    }
                                                  : r,
                                              ),
                                            );
                                            setSelectedRecipeForModal((prev) =>
                                              prev
                                                ? {
                                                    ...prev,
                                                    ingredients:
                                                      prev.ingredients.map(
                                                        (i: any) =>
                                                          i.id === ing.id
                                                            ? {
                                                                ...i,
                                                                unit_price:
                                                                  newPrice,
                                                              }
                                                            : i,
                                                      ),
                                                  }
                                                : prev,
                                            );
                                          }}
                                          className="w-20 bg-black/40 border border-emerald-500/30 rounded-lg text-center font-mono font-bold text-emerald-400 py-1 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all shadow-inner shadow-black/50"
                                        />
                                      </td>
                                      <td className="px-4 py-4 text-right">
                                        <button
                                          onClick={() => {
                                            removeIngredient(
                                              selectedRecipeForModal.id,
                                              ing.id,
                                            );
                                            setSelectedRecipeForModal((prev) =>
                                              prev
                                                ? {
                                                    ...prev,
                                                    ingredients:
                                                      prev.ingredients.filter(
                                                        (i: any) =>
                                                          i.id !== ing.id,
                                                      ),
                                                  }
                                                : prev,
                                            );
                                          }}
                                          className="text-slate-500 hover:text-red-400 p-1 rounded transition-colors"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                },
                              )
                            ) : (
                              <tr>
                                <td
                                  colSpan={5}
                                  className="px-6 py-10 text-center text-slate-500 italic"
                                >
                                  Aucun ingrédient renseigné.
                                </td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot className="bg-emerald-500/5 border-t border-white/10">
                            <tr>
                              <td
                                colSpan={5}
                                className="px-6 py-3 border-b border-white/5"
                              >
                                <button
                                  onClick={() => {
                                    addIngredient(selectedRecipeForModal.id);
                                    setSelectedRecipeForModal((prev) => {
                                      if (!prev) return prev;
                                      const newIng = {
                                        id: Math.random()
                                          .toString(36)
                                          .substr(2, 9),
                                        inventory_name: "",
                                        quantity_per_person: 0,
                                        unit: "kg",
                                        unit_price: 0,
                                      };
                                      return {
                                        ...prev,
                                        ingredients: [
                                          ...(prev.ingredients || []),
                                          newIng,
                                        ],
                                      };
                                    });
                                  }}
                                  className="w-full py-2 border border-dashed border-white/10 text-slate-400 hover:text-emerald-500 transition-colors uppercase font-bold text-xs flex items-center justify-center gap-2 rounded-xl"
                                >
                                  <Plus className="w-4 h-4" />{" "}
                                  {t.addLine || "Ajouter un ingrédient"}
                                </button>
                              </td>
                            </tr>
                            <tr>
                              <td
                                colSpan={2}
                                className="px-6 py-4 font-black text-white uppercase tracking-widest text-[10px]"
                              >
                                {t.totalShort || "TOTAL"} (
                                {guestCounts[selectedRecipeForModal.id] || 1}{" "}
                                {t.guests || "Convive(s)"})
                              </td>
                              <td colSpan={3} className="px-6 py-4 text-right">
                                <span className="text-2xl font-black text-emerald-500 tabular-nums">
                                  {(
                                    selectedRecipeForModal.ingredients?.reduce(
                                      (sum: number, ing: any) =>
                                        sum +
                                        (parseFloat(
                                          (ing.quantity_per_person || "")
                                            .toString()
                                            .replace(",", "."),
                                        ) || 0) *
                                          (guestCounts[
                                            selectedRecipeForModal.id
                                          ] || 1) *
                                          getIngredientEffectivePrice(ing),
                                      0,
                                    ) || 0
                                  ).toFixed(2)}
                                </span>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    <div className="mt-8 flex gap-4">
                      <button
                        onClick={() => saveRecipe(selectedRecipeForModal)}
                        className="flex-1 bg-white/10 hover:bg-white/20 text-white rounded-2xl py-4 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all border border-white/10 active:scale-[0.98]"
                      >
                        <Save className="w-5 h-5" />
                        {t.save || "Sauvegarder"}
                      </button>
                      <button
                        onClick={() => addToCart(selectedRecipeForModal)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl py-4 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        {t.addToProductionPlan ||
                          "Ajouter au Plan de Production"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
