import React, { useState, useEffect } from "react";
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
import { AnimatePresence, motion } from "motion/react";
import { EpicureStudio } from "./components/EpicureStudio";
import { Haccp } from "./components/Haccp";
import { PurchasingTab } from "./components/Purchasing";
import { StaffPlanning } from "./components/StaffPlanning";
import { AntiWaste, CulinaryChat, DashboardOverview, DocumentManager, FichesTechniques, InventoryAudit, LandingPage, MenuAnalysis, NavItem, ProductionPlan, QualityControl, RobotManagement, SettingsView } from "./components/views";
import { translateAlertMessage, translateIngredientHelper } from "./lib/helpers";

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
