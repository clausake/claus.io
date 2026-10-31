// T3.2 : extrait de src/components/InventoryAudit.tsx (extraction pure, byte-exact).
// Formulaire d'ajout d'article : JSX sans hook interne ; props = variables mesurées
// (newItem/setNewItem, handleAddSubmit, t). Le garde {showAddForm && ...} reste dans
// le parent. JSX Copié tel quel.
export function AddForm({ newItem, setNewItem, handleAddSubmit, t }: {
  newItem: any; setNewItem: (v: any) => void; handleAddSubmit: (e: any) => void;
  t: Record<string, string>;
}) {
  return (
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
  );
}
