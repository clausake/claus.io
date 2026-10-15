// Vue « livre de recettes » : la barre de filtre A-Z et les fiches sauvegardees
// (edition inline, generation d'etapes, ajout au plan de production).
//
// Extrait de FichesTechniques.tsx (meme methode que le chantier 8 : le JSX est
// deplace OCTET POUR OCTET, zero state propre — tout arrive en props, les
// handlers du parent passes tels quels). Le comportement est juge par les memes
// portes e2e (verify:routes, verify:recipes, verify:reception) : elles doivent
// rester vertes et le bundle identique.
import React from "react";
import {
  BookOpen,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Download,
  Plus,
  RefreshCw,
  Save,
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

interface FichesVueLivreProps {
  t: Record<string, string>;
  recipes: Recipe[];
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  savedRecipes: Recipe[];
  selectedCategory: string;  // le parent ne rend ce composant que hors du ternaire !selectedCategory
  setSelectedRecipeForModal: (r: Recipe) => void;
  guestCounts: Record<string, number>;
  setGuestCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  deleteRecipe: (id: string) => Promise<void>;
  addToCart: (recipe: Recipe) => void;
  expandedRecipes: Record<string, boolean>;
  generatingSteps: Record<string, boolean>;
  generateSteps: (id: string) => Promise<void>;
  exportSingleRecipeToPDF: (recipe: Recipe) => void;
  addIngredient: (recipeId: string) => void;
  removeIngredient: (recipeId: string, ingId: string) => void;
  activeLetter: string | null;
  setActiveLetter: (l: string | null) => void;
  toggleRecipeExpansion: (id: string) => void;
  saveRecipe: (recipe: Recipe) => Promise<void>;
}

export function FichesVueLivre({
  t,
  recipes,
  setRecipes,
  savedRecipes,
  selectedCategory,
  setSelectedRecipeForModal,
  guestCounts,
  setGuestCounts,
  deleteRecipe,
  addToCart,
  expandedRecipes,
  generatingSteps,
  generateSteps,
  exportSingleRecipeToPDF,
  addIngredient,
  removeIngredient,
  activeLetter,
  setActiveLetter,
  toggleRecipeExpansion,
  saveRecipe,
}: FichesVueLivreProps) {
  // Copie du composant parent (FichesTechniques) : les onglets A-Z du livre.
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  return (
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
                      (r: Recipe) =>
                        appartientDossier(r, selectedCategory) &&
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
                    (r: Recipe) => appartientDossier(r, selectedCategory),
                  )
                  .filter(
                    (r: Recipe) =>
                      !activeLetter ||
                      (r.name && r.name.toUpperCase().startsWith(activeLetter)),
                  )
                  .filter((r: Recipe) => {
                    const tType = r.dish_type || "plat";
                    return tType === dishType;
                  })
                  .sort((a: Recipe, b: Recipe) => (a.name || "").localeCompare(b.name || ""));

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
                              {recipe.ingredients?.map((ing: RecipeIngredient) => (
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
                                                ingredients: r.ingredients.map((i: RecipeIngredient) =>
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
                                                  ingredients: r.ingredients.map((i: RecipeIngredient) =>
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
                                                ingredients: r.ingredients.map((i: RecipeIngredient) =>
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
                                        removeIngredient(recipe.id || "", ing.id || "")
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
                  (r: Recipe) => appartientDossier(r, selectedCategory),
                )
                .filter(
                  (r: Recipe) =>
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
  );
}
