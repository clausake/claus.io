// Grille des fiches techniques, mode « categories » : les cartes du dossier
// selectionne (edition inline des ingredients, prix, export PDF, ajout au plan).
//
// Extrait de FichesTechniques.tsx (meme methode que le chantier 8 : le JSX est
// deplace OCTET POUR OCTET, zero state propre — tout arrive en props, les
// handlers du parent passes tels quels). Le comportement est juge par les memes
// portes e2e (verify:routes, verify:recipes, verify:reception) : elles doivent
// rester vertes et le bundle identique.
import React from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChefHat,
  Download,
  FolderOpen,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { appartientDossier } from "../lib/fiches";
import { MediaDisplay, getIngredientEffectivePrice } from "../lib/helpers";
interface RecipeIngredient {
  id?: string;
  inventory_name?: string;
  name?: string;
  quantity_per_person?: string | number;
  unit?: string;
  unit_price?: number;
  inventory_id?: string | null;
  [k: string]: unknown;
}

interface Recipe {
  id: string;
  name?: string;
  category?: string;
  dish_type?: string;
  ingredients: RecipeIngredient[];
  preparation_steps?: string | { step_order: number; instructions: string }[];
  is_saved?: boolean;
  // Present des qu'une fiche a ete scannee/importee (image source du PDF et
  // de la carte) — absent des fiches saisies a la main.
  source_image_url?: string;
  [k: string]: unknown;
}

interface FichesGrilleCategoriesProps {
  t: Record<string, string>;
  recipes: Recipe[];
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  generatedRecipes: Recipe[];
  selectedCategory: string;  // le parent ne rend ce composant que hors du ternaire !selectedCategory
  setSelectedRecipeForModal: (r: Recipe) => void;
  guestCounts: Record<string, number>;
  setGuestCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  handleSaveToBook: (id: string) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  addToCart: (recipe: Recipe) => void;
  addedToPlanIds: Set<string>;
  expandedRecipes: Record<string, boolean>;
  generatingSteps: Record<string, boolean>;
  generateSteps: (id: string) => Promise<void>;
  exportSingleRecipeToPDF: (recipe: Recipe) => void;
  addIngredient: (recipeId: string) => void;
  removeIngredient: (recipeId: string, ingId: string) => void;
}

export function FichesGrilleCategories({
  t,
  recipes,
  setRecipes,
  generatedRecipes,
  selectedCategory,
  setSelectedRecipeForModal,
  guestCounts,
  setGuestCounts,
  handleSaveToBook,
  deleteRecipe,
  addToCart,
  addedToPlanIds,
  expandedRecipes,
  generatingSteps,
  generateSteps,
  exportSingleRecipeToPDF,
  addIngredient,
  removeIngredient,
}: FichesGrilleCategoriesProps) {
  return (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {generatedRecipes
                  .filter(
                    (r: Recipe) => appartientDossier(r, selectedCategory),
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
                                  (sum: number, ing: RecipeIngredient) =>
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
                                  {recipe.ingredients?.map((ing: RecipeIngredient) => (
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
                                                  ingredients: r.ingredients.map((i: RecipeIngredient) =>
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
                                                          (i: RecipeIngredient) =>
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
                                                    ingredients: r.ingredients.map((i: RecipeIngredient) =>
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
                                                  ingredients: r.ingredients.map((i: RecipeIngredient) =>
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
                                            removeIngredient(recipe.id || "", ing.id || "")
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
  );
}
