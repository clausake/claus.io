import React, { useState, useEffect, Suspense, useRef } from "react";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Bot,
  Calendar,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Lock,
  MessageSquare,
  PackageSearch,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  ShieldCheck,
  Thermometer,
  Users,
  X,
  Zap,

  Menu as MenuIcon} from "lucide-react";
import {
  Area,
} from "recharts";
import { INITIAL_CART } from "./data/menuData";
import { TRANSLATIONS } from "./data/translations";
import { AnimatePresence, LazyMotion, domAnimation } from "motion/react";
import * as motionSlim from "motion/react-m";
import { LandingPage, NavItem } from "./components/views";
import { Assistant } from "./components/Assistant";
import { AuthGate, type Utilisateur } from "./components/AuthGate";
import { Sidebar } from "./components/Sidebar";
import * as LazyViews from "./components/lazy-views";
import { translateAlertMessage, translateIngredientHelper } from "./lib/helpers";

export default function App() {
  // L'identite (chantier 1) : AuthGate tient l'ecran tant qu'aucune session
  // n'est ouverte ; App recoit le user pour masquer ce qui ne lui est pas
  // destine (Comptes maitre-only) et pour ne rien ecrire tant qu'on n'est pas
  // connecte (le persist settings part sinon en 401 a chaque boot).
  const [user, setUser] = useState<Utilisateur | null>(null);
  const [logoutSignal, setLogoutSignal] = useState(0);
  const [showLanding, setShowLanding] = useState(true);
  // L'assistant de premier demarrage (Tache 10) : il s'ouvre tant que le
  // demarrage n'est PAS consigne (`install_termine_le` absent de settings —
  // la consignation ne vient que de /api/assistant/consigner, qui exige
  // l'epreuve reussie). La decision est prise par le SERVEUR, pas par un
  // drapeau local que l'on pourrait vider.
  const [assistantRequis, setAssistantRequis] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [cartItems, setCartItems] = useState<any[]>(INITIAL_CART);
  // La fiche nee du chat culinaire en route vers l'onglet Fiches Techniques
  // (Sprint 16) : MenuAnalysis la depose ici, FichesTechniques la consomme.
  const [ficheDepuisChat, setFicheDepuisChat] = useState<any | null>(null);
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

  const searchInputRef = useRef<HTMLInputElement>(null);
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

  // L'etat du demarrage est demande AU SERVEUR une fois par seance (jamais
  // dans le corps du rendu : un fetch par rendu serait une boucle). Un etat
  // injoignable ne boucle pas l'utilisateur sur l'assistant : on laisse
  // passer, le Reglages reste la voie de reprise.
  useEffect(() => {
    fetch("/api/assistant/etat")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("etat " + r.status))))
      .then((d) => setAssistantRequis(!d.install_termine_le))
      .catch(() => setAssistantRequis(false));
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings((prev: Record<string, unknown>) => ({ ...prev, ...data }));
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
    // Rien ne s'ecrit tant qu'aucune session n'est ouverte : un POST sans
    // session serait un 401 garanti (la gate mord) et l'ecran de connexion
    // recolterait une erreur qui n'appartient a personne.
    if (isSettingsLoaded && user) {
      // Persist settings to backend
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      }).catch((err) => console.error("Error saving settings:", err));
    }
  }, [settings, isSettingsLoaded, user]);

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
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "Failed to fetch") return;
        console.error("Alerts fetch error", e);
      }
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts: Ctrl/Cmd+K = focus search, Alt+1-9 = sidebar tabs, Esc = close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K = focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      // Esc = close dropdowns
      if (e.key === "Escape") {
        setShowSearchDropdown(false);
        setShowAlerts(false);
        setShowProfileMenu(false);
        return;
      }
      // Alt + 1-9 = sidebar tabs
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const tabMap: Record<string, string> = {
          "1": "dashboard",
          "2": "inventory",
          "3": "menus",
          "4": "recipes",
          "5": "production",
          "6": "purchasing",
          "7": "documents",
          "8": "staff-planning",
          "9": "haccp",
        };
        const tab = tabMap[e.key];
        if (tab) {
          e.preventDefault();
          setActiveTab(tab);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
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

  // L'assistant de premier demarrage (Tache 10) : tant que le serveur dit que
  // l'epreuve n'est pas consignée, c'est LUI qui tient l'ecran.
  if (assistantRequis === true) {
    return <Assistant t={t} onTermine={() => setAssistantRequis(false)} />;
  }

  return (
    <AuthGate onUser={setUser} logoutSignal={logoutSignal}>
    <div className="flex h-screen bg-[#0A0A0A] font-sans text-slate-200 selection:bg-emerald-500/30 selection:text-emerald-200 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-teal-500/10 blur-[100px] rounded-full pointer-events-none"></div>


      {/* La barre laterale des onglets. ⚠ Elle a ete EXTRAITE d'App.tsx au
          chantier 9 (9a0f7fb) mais jamais re-rendue : l'app a navigue pendant
          des semaines uniquement par raccourcis clavier (Alt+1..), sans aucun
          onglet visible. Les specs e2e ne l'ont pas vu parce qu'elles aussi
          passent par Alt+6 (reception-view.spec.ts:284). Rendue ici, a la
          place exacte du <aside> supprime (l'overlay mobile juste apres). */}
      <Sidebar
        t={t}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        isMobile={isMobile}
        trialStatus={trialStatus}
        user={user}
      />

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
            <motionSlim.div
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
            </motionSlim.div>
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
            </div>
          </div>

          <div className="flex items-center space-x-8">
            <div className="relative group hidden md:block search-container">
              <Search
                className={`w-4 h-4 absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors ${isSearching ? "text-brand-500 animate-pulse" : "text-slate-500 group-focus-within:text-brand-500"}`}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() =>
                  searchQuery.length >= 2 && setShowSearchDropdown(true)
                }
                placeholder={(t.searchPlaceholder || "Rechercher...") + "  (Ctrl+K)"}
                className="pl-12 pr-6 py-3 bg-white/5 border border-transparent focus:border-brand-500/30 rounded-2xl text-sm text-white focus:outline-none focus:ring-8 focus:ring-brand-500/5 transition-all w-80 font-medium placeholder:text-slate-600"
              />

              <AnimatePresence>
                {showSearchDropdown && searchResults.length > 0 && (
                  <motionSlim.div
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
                  </motionSlim.div>
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
                    <motionSlim.div
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
                    </motionSlim.div>
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
                    <motionSlim.div
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
                        <button
                          onClick={() => setActiveTab("comptes")}
                          className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl transition-colors text-left text-sm text-slate-300 hover:text-white"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          {t.accounts || "Comptes"}
                        </button>
                        <div className="my-2 border-t border-white/5"></div>
                        <button
                          onClick={() => {
                            setShowProfileMenu(false);
                            setLogoutSignal((n) => n + 1);
                          }}
                          className="w-full flex items-center gap-3 p-3 hover:bg-red-500/10 rounded-xl transition-colors text-left text-sm text-red-500"
                        >
                          <X className="w-4 h-4" />
                          {t.logout}
                        </button>
                      </div>
                    </motionSlim.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div
          className={`flex-1 overflow-auto p-4 md:p-8 custom-scrollbar relative`}
        >
          <Suspense fallback={
            <div className="flex items-center justify-center h-full min-h-[300px]">
              <div className="w-8 h-8 border-2 border-accent-500/30 border-t-accent-500 rounded-full animate-spin" />
            </div>
          }>
          {activeTab === "dashboard" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.DashboardOverview t={t} settings={settings} />
            </div>
          )}
          {activeTab === "menus" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.MenuAnalysis
                setActiveTab={setActiveTab}
                t={t}
                settings={settings}
                showNotification={showNotification}
                onOuvrirFiche={(recette, carte) => {
                  // Le geste du chef : la fiche nee du chat part dans
                  // l'onglet Fiches Techniques en formulaire PRE-REMPLI,
                  // jamais en ecriture directe (edition 100 % avant save).
                  setFicheDepuisChat({ recette, carte });
                  setActiveTab("recipes");
                }}
              />
            </div>
          )}
          {activeTab === "robots" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.RobotManagement t={t} />
            </div>
          )}
          {activeTab === "inventory" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.InventoryAudit
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
              <LazyViews.ProductionPlan
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
              <LazyViews.StaffPlanning t={t} />
            </div>
          )}
          {activeTab === "purchasing" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.PurchasingTab
                t={t}
                translateIngredient={translateIngredientHelper}
                manualIds={manualPurchaseIds}
              />
            </div>
          )}
          {activeTab === "quality" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.QualityControl t={t} />
            </div>
          )}
          {activeTab === "haccp" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.Haccp t={t} translateIngredient={translateIngredientHelper} />
            </div>
          )}
          {activeTab === "anti-waste" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.AntiWaste t={t} />
            </div>
          )}
          {activeTab === "epicure-studio" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.EpicureStudio
                t={t}
                settings={settings}
              />
            </div>
          )}
          {activeTab === "documents" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.DocumentManager t={t} />
            </div>
          )}
          {activeTab === "recipes" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.FichesTechniques
                activeTab={activeTab}
                cartItems={cartItems}
                setCartItems={setCartItems}
                t={t}
                showNotification={showNotification}
                ficheDepuisChat={ficheDepuisChat}
                ficheDepuisChatConsommee={() => setFicheDepuisChat(null)}
              />
            </div>
          )}
          {activeTab === "comptes" && user?.role === "maitre" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.AccountsView moi={user} />
            </div>
          )}
          {activeTab === "comptes" && user?.role === "maitre" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.AccountsView moi={user} />
            </div>
          )}
          {activeTab === "settings" && (
            <div className="animate-in fade-in duration-200">
              <LazyViews.SettingsView
                settings={settings}
                setSettings={setSettings}
                t={t}
                trialStatus={trialStatus}
                setTrialStatus={setTrialStatus}
              />
            </div>
          )}
          </Suspense>
        </div>
      </main>
    </div>
    </AuthGate>
  );
}
