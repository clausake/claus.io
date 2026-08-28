import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Check,
  ChefHat,
  Edit2,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  UploadCloud,
  PieChart as PieChartIcon} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import Papa from "papaparse";
import { translateIngredientHelper } from "../lib/helpers";
import { useToast } from "./ui/Toast";
import { SkeletonTable, Skeleton } from "./ui/Skeleton";

export function InventoryAudit({
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
  const toast = useToast();
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
            toast((
                t.importSuccess ||
                "✅ {count} ingrédients importés avec succès !", "success").replace("{count}", items.length.toString()),
            );
            const newRes = await fetch("/api/inventory");
            const newData = await newRes.json();
            setInventory(newData);
          } else {
            toast(t.importError || "❌ Erreur lors de l'importation.", "error");
          }
        } catch (err) {
          console.error("Erreur d'import", err);
          toast(t.csvReadError || "❌ Erreur lors de la lecture du fichier CSV.", "error");
        }

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
      error: (error) => {
        console.error("Erreur PapaParse:", error);
        toast(t.csvLoadError || "❌ Impossible de lire le fichier CSV.", "error");
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
        toast(t.inventoryLoadError ||
            "Impossible de charger l'inventaire depuis le serveur d'IA.", "error");
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
        <div className="glass-panel p-3 border border-white/10 shadow-2xl bg-black/95 backdrop-blur-md">
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
        <div className="glass-panel p-2 border border-white/10 shadow-2xl bg-black/95 backdrop-blur-md flex items-center gap-2">
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
    <div className="led-glow-container animate-in fade-in duration-150 relative">
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
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-48" />
            <SkeletonTable rows={6} />
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
                    <span className="text-caption font-bold text-slate-500 bg-white/5 px-3 py-1 rounded-full border border-white/5 tracking-widest uppercase">
                      {groupedInventory[cat].length} {t.batches || "LOTS"}
                    </span>
                  </div>
                  <table className="w-full text-sm text-left">
                    <thead className="text-caption text-slate-500 uppercase font-black tracking-widest bg-black/20 border-b border-white/5">
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
                          <td className="px-8 py-6 text-slate-600 font-mono text-caption">
                            #{item.id}
                          </td>
                          <td className="px-8 py-6">
                            <div className="font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">
                              {translateIngredientHelper(item.name, t.language)}
                            </div>
                            {item.dlc && (
                              <div className="mt-1 text-caption font-black uppercase text-slate-500">
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
                                  className={`text-caption font-black tracking-widest uppercase ${
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
