// T3.2 : extrait de src/components/RecipeModal.tsx (extraction pure, byte-exact).
// Tableau des ingredients de la recette (lignes 458-892 de l'original). JSX sans hook
// interne (le modal entier n'a aucun useState/useEffect/fetch) ; props = les variables
// et handlers MESURÉS sur la plage. Les onChange inline (couplés à setRecipes/
// setSelectedRecipeForModal) partent AVEC le bloc, tels quels. JSX Copié tel quel.
import { Plus, Trash2 } from 'lucide-react';
import { getCostModifier, getIngredientEffectivePrice } from '../../lib/helpers';
import type { RecipeIngredient } from '../RecipeModal';

export function RecipeIngredientsTable({ rid, selectedRecipeForModal, setSelectedRecipeForModal, setRecipes, guestCounts, addIngredient, removeIngredient, t }: {
  rid: string;
  selectedRecipeForModal: any; setSelectedRecipeForModal: (v: any) => void; setRecipes: (v: any) => void;
  guestCounts: any; addIngredient: (rid: any) => void; removeIngredient: (...a: any[]) => void;
  t: Record<string, string>;
}) {
  return (
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
  );
}
