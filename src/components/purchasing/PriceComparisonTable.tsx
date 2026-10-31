// T3.2 : extrait de src/components/Purchasing.tsx (extraction pure, byte-exact).
// Tableau comparateur de prix : JSX sans hook interne ; props = exactement les
// variables qu'il lisait (mesuré) : priceSearch/setter, filteredComparison,
// expandedIngredientPrice/setter, setPendingDeletePrice. JSX Copié tel quel.
import React from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';

export function PriceComparisonTable({ priceSearch, setPriceSearch, filteredComparison, expandedIngredientPrice, setExpandedIngredientPrice, setPendingDeletePrice }: {
  priceSearch: string; setPriceSearch: (v: string) => void; filteredComparison: any[];
  expandedIngredientPrice: string | null; setExpandedIngredientPrice: (v: string | null) => void;
  setPendingDeletePrice: (v: string | null) => void;
}) {
  return (
            <div className="p-6 bg-white/5 border border-white/5 rounded-3xl space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h3 className="text-xl font-black text-white">Tableau Comparateur de Prix</h3>
                <input 
                  type="text" 
                  placeholder="Rechercher un ingrédient..."
                  value={priceSearch}
                  onChange={e => setPriceSearch(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-600 outline-none w-full md:w-64 focus:border-amber-500"
                />
              </div>

              {filteredComparison.length === 0 ? (
                <div className="py-20 text-center text-slate-500 italic">
                  Aucune comparaison à afficher. Ajoutez un tarif ou importez une mercuriale d'abord.
                </div>
              ) : (
                <div className="overflow-auto custom-scrollbar">
                  <table className="w-full text-left text-sm text-slate-300 min-w-[700px]">
                    <thead>
                      <tr className="border-b border-white/10 font-black text-slate-500 text-xs uppercase tracking-wider">
                        <th className="p-3">Ingrédient unique</th>
                        <th className="p-3 text-right">Prix Moyen Stock</th>
                        <th className="p-3">Meilleure offre fournisseur</th>
                        <th className="p-3 text-right">Économie Possible</th>
                        <th className="p-3 text-center">Tarifs actifs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredComparison.map((g) => (
                        <React.Fragment key={g.inventory_id}>
                          <tr 
                            className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                            onClick={() => setExpandedIngredientPrice(expandedIngredientPrice === g.inventory_id ? null : g.inventory_id)}
                          >
                            <td className="p-3 font-bold text-white flex items-center gap-2">
                              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedIngredientPrice === g.inventory_id ? 'rotate-180' : ''}`} />
                              {g.inventory_name}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-400">
                              {g.current_inventory_price.toFixed(2)} € / {g.inventory_unit}
                            </td>
                            <td className="p-3">
                              {g.best_supplier_price ? (
                                <div className="flex flex-col">
                                  <span className="font-bold text-amber-400">
                                    {g.best_supplier_price.calculated_price_per_ref.toFixed(2)} € / {g.inventory_unit}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    chez {g.best_supplier_price.supplier_name} ({g.best_supplier_price.raw_unit_price.toFixed(2)} €/{g.best_supplier_price.unit})
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-500 text-xs italic">Aucune mercuriale enregistrée</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {g.savings_percent > 0 ? (
                                <span className="p-1 px-2.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono font-black text-xs">
                                  -{g.savings_percent}%
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                            <td className="p-3 text-center font-bold text-slate-400 font-mono">
                              {g.supplier_prices?.length || 0}
                            </td>
                          </tr>

                          {expandedIngredientPrice === g.inventory_id && (
                            <tr>
                              <td colSpan={5} className="bg-black/40 p-4 border-b border-white/10">
                                <h4 className="text-xs uppercase font-black tracking-widest text-indigo-400 mb-3">Toutes les offres disponibles pour cet ingrédient :</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {g.supplier_prices.map((p: {id: string; supplier_name?: string; raw_unit_price?: number; unit?: string; is_verified_from_invoice?: boolean; calculated_price_per_ref?: number}) => (
                                    <div key={p.id} className="p-3 bg-white/5 border border-white/5 rounded-xl flex justify-between items-center group">
                                      <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-slate-200">{p.supplier_name}</span>
                                          <span className={`text-caption font-black uppercase px-1.5 py-0.5 rounded ${
                                            p.is_verified_from_invoice ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'
                                          }`}>
                                            {p.is_verified_from_invoice ? "Facture" : "Mercuriale"}
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-slate-500 font-mono">
                                          Tarif d'achat brut: {(p.raw_unit_price || 0).toFixed(2)} € / {p.unit}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-4">
                                        <div className="text-right">
                                          <span className="font-mono text-sm font-black text-amber-400">{(p.calculated_price_per_ref || 0).toFixed(2)} €</span>
                                          <span className="block text-caption uppercase tracking-wider text-slate-600">Ramene au {g.inventory_unit}</span>
                                        </div>
                                        <button 
                                          onClick={() => setPendingDeletePrice(p.id)}
                                          className="text-slate-600 hover:text-red-500 p-2 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
  );
}
