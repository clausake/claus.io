import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChefHat,
  ClipboardList,
  Clock,
  Download,
  Leaf,
  Maximize2,
  Minimize2,
  Sparkles,
  X,
} from "lucide-react";
import { translateIngredientHelper } from "../lib/helpers";
import { useToast } from "./ui/Toast";

export function AntiWaste({ t }: { t: Record<string, string> }) {
  const toast = useToast();
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
      toast(t.syncFTError, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="led-glow-container p-8 h-full flex flex-col animate-in fade-in duration-150 overflow-y-auto custom-scrollbar">
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
            <div className="space-y-4 animate-in slide-in-from-bottom-4 fade-in duration-150">
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
                  ).map((item: string | {quantity: number | string; unit: string; name: string}, i: number) => {
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
