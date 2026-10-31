// T3.2 : extrait de src/components/InventoryAudit.tsx (extraction pure, byte-exact).
// Formulaire d'édition d'article : JSX sans hook interne ; props = variables mesurées
// (editingItem/setEditingItem, handleEditSubmit, t) + l'icône Plus. Le garde
// {editingItem && ...} reste dans le parent. JSX Copié tel quel.
import { Plus } from 'lucide-react';

export function EditForm({ editingItem, setEditingItem, handleEditSubmit, t }: {
  editingItem: any; setEditingItem: (v: any) => void; handleEditSubmit: (e: any) => void;
  t: Record<string, string>;
}) {
  return (
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
  );
}
