import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { translateIngredientHelper } from "../lib/helpers";

export function ProductionPlan({
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
