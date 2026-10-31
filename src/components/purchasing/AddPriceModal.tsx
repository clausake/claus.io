// T3.2 : extrait de src/components/Purchasing.tsx (extraction pure, byte-exact).
// Modale 'Saisir un Tarif' : JSX sans hook interne ; props = exactement les
// variables qu'il lisait (mesuré) : newPriceData + son setter, le setter de
// visibilité, suppliers, inventoryItems, handleAddManualPrice. JSX Copié tel quel.
import * as motionSlim from 'motion/react-m';
import { X, Plus } from 'lucide-react';

export function AddPriceModal({ newPriceData, setNewPriceData, setShowAddPriceModal, suppliers, inventoryItems, handleAddManualPrice }: {
  newPriceData: any; setNewPriceData: (v: any) => void; setShowAddPriceModal: (v: boolean) => void;
  suppliers: any[]; inventoryItems: any[]; handleAddManualPrice: () => void;
}) {
  return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <motionSlim.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#181818] border border-white/15 rounded-3xl p-6 w-full max-w-lg space-y-4 shadow-2xl relative"
          >
            <button 
              onClick={() => setShowAddPriceModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 hover:bg-white/5 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-500" /> Saisir un Tarif Fournisseur
            </h3>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-black uppercase text-slate-500 tracking-wider">Fournisseur d'approvisionnement *</label>
                <select
                  className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-white outline-none"
                  value={newPriceData.supplier_id}
                  onChange={e => setNewPriceData({ ...newPriceData, supplier_id: e.target.value })}
                >
                  <option value="">-- Choisir le Fournisseur --</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black uppercase text-slate-500 tracking-wider">Ingrédient Unique Associé *</label>
                <select
                  className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-white outline-none"
                  value={newPriceData.inventory_id}
                  onChange={e => setNewPriceData({ ...newPriceData, inventory_id: e.target.value })}
                >
                  <option value="">-- Choisir l'Ingrédient --</option>
                  {inventoryItems.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase text-slate-500 tracking-wider">Prix Brut (€) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="ex: 1.50"
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-white outline-none"
                    value={newPriceData.raw_unit_price}
                    onChange={e => setNewPriceData({ ...newPriceData, raw_unit_price: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black uppercase text-slate-500 tracking-wider">Unité de facturation *</label>
                  <select
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-white outline-none"
                    value={newPriceData.unit}
                    onChange={e => setNewPriceData({ ...newPriceData, unit: e.target.value })}
                  >
                    <option value="kg">kilogramme (kg)</option>
                    <option value="g">gramme (g)</option>
                    <option value="L">litre (L)</option>
                    <option value="cl">centilitre (cl)</option>
                    <option value="ml">millilitre (ml)</option>
                    <option value="pce">pièce (pce)</option>
                    <option value="bouteille">bouteille (bottle)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black uppercase text-slate-500 tracking-wider">Date Limite de Validité (Optionnelle)</label>
                <input
                  type="date"
                  className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-white outline-none focus:border-amber-500"
                  value={newPriceData.valid_until}
                  onChange={e => setNewPriceData({ ...newPriceData, valid_until: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button 
                  onClick={() => setShowAddPriceModal(false)}
                  className="px-5 py-3 bg-white/5 hover:bg-white/10 font-bold text-slate-300 rounded-xl text-sm"
                >
                  Annuler
                </button>
                <button 
                  onClick={handleAddManualPrice}
                  className="px-6 py-3 bg-amber-500 hover:bg-amber-600 font-black text-black rounded-xl text-sm"
                >
                  Ajouter le Tarif
                </button>
              </div>
            </div>
          </motionSlim.div>
        </div>
  );
}
