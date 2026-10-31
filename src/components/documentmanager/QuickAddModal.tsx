// T3.2 : extrait de src/components/DocumentManager.tsx (extraction pure, byte-exact).
// Modale « ajouter au stock » : JSX sans hook interne ; props = variables mesurées
// (showProductQuickAdd reste le garde du parent). JSX Copié tel quel.
import * as motionSlim from 'motion/react-m';
import { X } from 'lucide-react';

export function QuickAddModal({ quickProduct, setQuickProduct, setShowProductQuickAdd, handleQuickAdd, t }: {
  quickProduct: any; setQuickProduct: (v: any) => void; setShowProductQuickAdd: (v: boolean) => void;
  handleQuickAdd: (e: any) => void; t: Record<string, string>;
}) {
  return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <motionSlim.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-panel w-full max-w-lg p-8 space-y-6"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white tracking-tight">
                {t.addToStockModalTitle || "Ajouter au Stock"}
              </h3>
              <button
                onClick={() => setShowProductQuickAdd(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleQuickAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                  {t.designationLabel || "Désignation"}
                </label>
                <input
                  type="text"
                  required
                  value={quickProduct.name}
                  onChange={(e) =>
                    setQuickProduct({ ...quickProduct, name: e.target.value })
                  }
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                    {t.unitModalLabel || "Unité"}
                  </label>
                  <select
                    value={quickProduct.unit}
                    onChange={(e) =>
                      setQuickProduct({ ...quickProduct, unit: e.target.value })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="kg">kg</option>
                    <option value="L">L</option>
                    <option value="pièces">{t.piecesLabel || "pièces"}</option>
                    <option value="unités">{t.unitsLabel || "unités"}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                    {t.categoryModalLabel || "Catégorie"}
                  </label>
                  <select
                    value={quickProduct.category}
                    onChange={(e) =>
                      setQuickProduct({
                        ...quickProduct,
                        category: e.target.value,
                      })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="Protéines">
                      {t.catMeat || "Protéines"}
                    </option>
                    <option value="Sec">{t.catDry || "Sec"}</option>
                    <option value="Légumes">{t.catVeg || "Légumes"}</option>
                    <option value="Fruits">{t.catFruit || "Fruits"}</option>
                    <option value="Crémerie">{t.catDairy || "Crémerie"}</option>
                    <option value="Pâtisserie">
                      {t.catPastry || "Pâtisserie"}
                    </option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                    {t.estimatedPULabel || "Prix Unitaire Estimé"}{" "}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={
                      quickProduct.unit_price === 0
                        ? ""
                        : quickProduct.unit_price
                    }
                    onChange={(e) =>
                      setQuickProduct({
                        ...quickProduct,
                        unit_price: e.target.value,
                      })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                    {t.minStockModalLabel || "Stock Minimum"}
                  </label>
                  <input
                    type="number"
                    value={
                      quickProduct.minStock === 0 ? "" : quickProduct.minStock
                    }
                    onChange={(e) =>
                      setQuickProduct({
                        ...quickProduct,
                        minStock: e.target.value,
                      })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold uppercase tracking-widest transition-all led-glow-emerald"
              >
                Confirmer l'ajout
              </button>
            </form>
          </motionSlim.div>
        </div>
  );
}
