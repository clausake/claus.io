import React, { AnimatePresence } from "react";
import {
  AlertTriangle, Bookmark, CheckCircle2, ChefHat, ClipboardList, Download,
  Maximize2, Minimize2, Plus, RefreshCw, Save, Sparkles, Trash2, Users, X,
} from "lucide-react";
import * as motionSlim from "motion/react-m";
import { MediaDisplay, getCostModifier, getIngredientEffectivePrice } from "../lib/helpers";

interface RecipeIngredient {
  id?: string;
  inventory_name?: string;
  name?: string;
  quantity_per_person?: string | number;
  unit?: string;
  unit_price?: number;
  inventory_id?: string | null;
  allergens?: string;
  [k: string]: unknown;
}

interface Recipe {
  id?: string;
  name?: string;
  category?: string;
  dish_type?: string;
  allergens?: string[];
  ingredients?: RecipeIngredient[];
  preparation_steps?: string | { step_order: number; instructions: string }[];
  is_saved?: boolean;
  [k: string]: unknown;
}

interface Optimisation {
  type?: string;
  label?: string;
  ingredient_name?: string;
  supplier_name?: string;
  best_price?: number;
  current_price?: number;
  unit?: string;
  savings_percent?: number;
  savings_value?: number;
}

export interface RecipeModalProps {
  /** La recette affichee (state du parent) — null = modal ferme. */
  selectedRecipeForModal: Recipe;
  setSelectedRecipeForModal: React.Dispatch<React.SetStateAction<Recipe | null>>;
  recipes: Recipe[];
  inventory: RecipeIngredient[];
  supplierComparison: RecipeIngredient[];
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  guestCounts: Record<string, number>;
  setGuestCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  isRecipeModalFullScreen: boolean;
  setIsRecipeModalFullScreen: React.Dispatch<React.SetStateAction<boolean>>;
  generatingSteps: Record<string, boolean>;
  generateSteps: (id: string) => Promise<void>;
  addIngredient: (recipeId: string) => void;
  removeIngredient: (recipeId: string, ingId: string) => void;
  saveRecipe: (recipe: Recipe) => Promise<void>;
  addToCart: (recipe: Recipe) => void;
  /** Le ref de scroll EXTERIEUR (le parent y reset le scrollTop). */
  outerModalScrollRef: React.RefObject<HTMLDivElement | null>;
  /** Le ref de scroll INTERIEUR (le modal lui-meme). */
  modalScrollRef: React.RefObject<HTMLDivElement | null>;
  t: Record<string, string>;
  exportSingleRecipeToPDF: (recipe: Recipe) => void;
}


// Le modal de recette extrait (chantier 8). ZERO state propre : tout arrive
// en props depuis FichesTechniques, les handlers du parent sont passes tels
// quels — le comportement est celui du JSX deplace octet pour octet.
export function RecipeModal({
  selectedRecipeForModal,
  setSelectedRecipeForModal,
  recipes,
  inventory,
  supplierComparison,
  setRecipes,
  guestCounts,
  setGuestCounts,
  isRecipeModalFullScreen,
  setIsRecipeModalFullScreen,
  generatingSteps,
  generateSteps,
  addIngredient,
  removeIngredient,
  saveRecipe,
  addToCart,
  outerModalScrollRef,
  modalScrollRef,
  t,
  exportSingleRecipeToPDF,
}: RecipeModalProps) {
  const rid = selectedRecipeForModal.id || "";
  return (
      <AnimatePresence>
        {selectedRecipeForModal && (
          <div
            ref={outerModalScrollRef}
            className={`fixed inset-0 z-[100] flex items-start md:items-center justify-center overflow-y-auto custom-scrollbar bg-black/80 backdrop-blur-md ${isRecipeModalFullScreen ? "p-0" : "p-4 md:p-12"}`}
          >
            <motionSlim.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setSelectedRecipeForModal(null);
                setIsRecipeModalFullScreen(false);
              }}
              className="fixed inset-0"
            />
            <motionSlim.div
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
                            (ing: RecipeIngredient) =>
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
                            {recipeAllergens.map((a: string) => (
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
                              (sum: number, ing: RecipeIngredient) =>
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
                              selectedRecipeForModal.id && generateSteps(rid)
                            }
                            disabled={
                              generatingSteps[rid]
                            }
                            className="flex items-center justify-center gap-3 px-8 py-4 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-400 rounded-2xl border border-emerald-500/30 font-black uppercase tracking-widest text-xs transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/10 active:scale-[0.98]"
                          >
                            {generatingSteps[rid] ? (
                              <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : (
                              <ChefHat className="w-5 h-5" />
                            )}
                            {generatingSteps[rid]
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
                      const optimisations: Optimisation[] = [];
                      let totalCurrentCost = 0;
                      let totalOptimizedCost = 0;
                      
                      selectedRecipeForModal.ingredients?.forEach((ing: RecipeIngredient) => {
                        const guests = guestCounts[rid] || 1;
                        const totalQty = (parseFloat((ing.quantity_per_person || "").toString().replace(",", ".")) || 0) * guests;
                        
                        const inventoryItem = inventory.find(i => i.id === ing.inventory_id);
                        const standardPrice = inventoryItem?.unit_price || 0;
                        const originalCost = totalQty * standardPrice;
                        totalCurrentCost += originalCost;

                        const comparison = supplierComparison.find(c => c.inventory_id === ing.inventory_id);
                        const bestSupplier = comparison?.best_supplier_price as {supplier_name?: string; calculated_price_per_ref?: number} | undefined;
                        
                        if (bestSupplier) {
                          const bestPrice = bestSupplier.calculated_price_per_ref || 0;
                          const optimizedCost = totalQty * bestPrice;
                          totalOptimizedCost += optimizedCost;
                          
                          if (bestPrice < standardPrice) {
                            const diff = standardPrice - bestPrice;
                            const savingsPercent = Math.round((diff / standardPrice) * 100);
                            const savingsValue = totalQty * diff;
                            if (savingsValue > 0.01) {
                              optimisations.push({
                                ingredient_name: ing.inventory_name || ing.name || "Ingrédient",
                                supplier_name: bestSupplier.supplier_name || "Fournisseur",
                                best_price: bestPrice,
                                current_price: standardPrice,
                                unit: ((comparison?.inventory_unit as string) || "kg"),
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
                                    {(opt.best_price || 0).toFixed(2)} € / {opt.unit}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    (vs {(opt.current_price || 0).toFixed(2)} €, soit -{opt.savings_percent || 0}%)
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
                            addIngredient(rid)
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
                          value={guestCounts[rid] || 1}
                          onChange={(e) =>
                            setGuestCounts({
                              ...guestCounts,
                              [rid]:
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
                                (ing: RecipeIngredient) => {
                                  const guests =
                                    guestCounts[rid] || 1;
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
                                                          (i: RecipeIngredient) =>
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
                                                          (i: RecipeIngredient) =>
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
                                                            (i: RecipeIngredient) =>
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
                                                          (i: RecipeIngredient) =>
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
                                                            (i: RecipeIngredient) =>
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
                                                          (i: RecipeIngredient) =>
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
                                                          (i: RecipeIngredient) =>
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
                                                        (i: RecipeIngredient) =>
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
                                            const yieldPercent = Number(ing.yield_percent !== undefined ? ing.yield_percent : 100);
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
                                                          (i: RecipeIngredient) =>
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
                                                        (i: RecipeIngredient) =>
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
                                              rid,
                                              ing.id || "",
                                            );
                                            setSelectedRecipeForModal((prev) =>
                                              prev
                                                ? {
                                                    ...prev,
                                                    ingredients:
                                                      prev.ingredients.filter(
                                                        (i: RecipeIngredient) =>
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
                                    addIngredient(rid);
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
                                {guestCounts[rid] || 1}{" "}
                                {t.guests || "Convive(s)"})
                              </td>
                              <td colSpan={3} className="px-6 py-4 text-right">
                                <span className="text-2xl font-black text-emerald-500 tabular-nums">
                                  {(
                                    selectedRecipeForModal.ingredients?.reduce(
                                      (sum: number, ing: RecipeIngredient) =>
                                        sum +
                                        (parseFloat(
                                          (ing.quantity_per_person || "")
                                            .toString()
                                            .replace(",", "."),
                                        ) || 0) *
                                          (guestCounts[
                                            rid
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
            </motionSlim.div>
          </div>
        )}
      </AnimatePresence>
    

  );
}
