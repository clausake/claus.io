// T3.2 : extrait de src/components/Purchasing.tsx (extraction pure, byte-exact).
// Branche 'validation' (l'essentiel du fichier) : JSX sans hook interne ; props =
// les variables/handlers mesurés sur la plage. JSX Copié tel quel (mêmes classes,
// mêmes handlers passés en props). Aucun changement de comportement.
import { AnimatePresence } from 'motion/react';
import * as motionSlim from 'motion/react-m';
import { Plus, Printer, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import type { ForecastItem } from './types';

export function ValidationPanel({ forecast, forecastWindow, ignoredIds, setIgnoredIds, overrides, setOverrides, history, setHistory, expanded, toggleExpand, selectedSupplier, setSelectedSupplier, selectedPrice, setSelectedPrice, suppliers, handleCreateOrder, translateIngredient, loading, manualIds, t }: {
  forecast: any[]; forecastWindow: { from: string; horizon: number } | null;
  ignoredIds: Set<string>; setIgnoredIds: (v: any) => void;
  overrides: any; setOverrides: (v: any) => void;
  history: any; setHistory: (v: any) => void;
  expanded: any; toggleExpand: (id: string) => void;
  selectedSupplier: any; setSelectedSupplier: (v: any) => void;
  selectedPrice: any; setSelectedPrice: (v: any) => void;
  suppliers: any[];
  handleCreateOrder: () => void;
  translateIngredient?: (name: string, lang: string) => string;
  loading: boolean; manualIds?: Set<string>;
  t: Record<string, string>;
}) {
  return (
          <motionSlim.div 
            key="validation"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="flex-1 flex flex-col min-h-0"
          >
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin opacity-50" />
              </div>
            ) : forecast.length === 0 ? (
              <div className="text-center text-slate-500 py-20 bg-white/5 rounded-xl border border-white/5">
                {t.noForecast || "Aucune donnée de prévision disponible."}
              </div>
            ) : (
              <div className="overflow-auto flex-1 custom-scrollbar">
                <table className="w-full text-left text-slate-300 min-w-[800px]">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="p-3">{t.ingredient}</th>
                      <th className="p-3">{t.currentStock || "Stock Actuel"}</th>
                      <th className="p-3">
                        <div className="flex flex-col">
                          <span>{t.recipeNeed || "Besoin Recettes"}</span>
                          {forecastWindow && (
                            <span className="text-caption font-normal normal-case tracking-normal text-slate-600">
                              {(t.needWindowHint || "couverts planifies, {n} j")
                                .replace('{n}', String(forecastWindow.horizon))}
                            </span>
                          )}
                        </div>
                      </th>
                      <th className="p-3">{t.suggestion || "Suggestion"}</th>
                      <th className="p-3">{t.supplier || "Fournisseur"}</th>
                    </tr>
                  </thead>
                  <tbody className="relative">
                    <AnimatePresence mode="popLayout">
                      {forecast.filter(f => !ignoredIds.has(f.inventory_id)).flatMap(item => [
                        <motionSlim.tr 
                          key={item.inventory_id}
                          layout
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="border-b border-white/5 hover:bg-white/5 cursor-pointer group" 
                          onClick={() => toggleExpand(item.inventory_id)}
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIgnoredIds(prev => {
                                    const next = new Set(prev);
                                    next.add(item.inventory_id);
                                    return next;
                                  });
                                }}
                                className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <div className="flex flex-col">
                                <span className="font-bold">
                                  {translateIngredient ? translateIngredient(item.name, t.language) : item.name}
                                </span>
                                {manualIds && manualIds.has(item.inventory_id) && (
                                  <span className="text-caption font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                                    <Plus className="w-2 h-2" /> {t.manualEntry || "Saisie Manuelle"}
                                  </span>
                                )}
                                {(!manualIds || !manualIds.has(item.inventory_id)) && (
                                  <span className="text-caption font-black uppercase tracking-widest text-indigo-500 flex items-center gap-1">
                                    <Sparkles className="w-2 h-2" /> {t.iaAutomated || "IA Automatisé"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-3">{item.quantity} {item.unit}</td>
                          <td className="p-3">{item.besoin_recettes}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <input 
                                type="number"
                                value={overrides[item.inventory_id] ?? 1}
                                onChange={(e) => setOverrides(prev => ({...prev, [item.inventory_id]: parseFloat(e.target.value) || 0}))}
                                className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm font-bold text-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                              />
                              <span className="text-xs text-slate-500">{item.unit}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            {selectedSupplier[item.inventory_id] && (
                                <div className="text-xs font-bold text-indigo-400 mb-1">{selectedSupplier[item.inventory_id]}</div>
                            )}
                            <select 
                              className="bg-[#121212] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-slate-300 w-full"
                              value={selectedSupplier[item.inventory_id] || ''}
                              onChange={e => {
                                setSelectedSupplier(prev => ({...prev, [item.inventory_id]: e.target.value}));
                                // Trigger finding unit price of the selected supplier for this item if available of history
                                const foundHistory = history[item.inventory_id]?.find(h => h.supplier === e.target.value);
                                if (foundHistory) {
                                  setSelectedPrice(prev => ({...prev, [item.inventory_id]: foundHistory.unit_price}));
                                }
                              }}
                              onClick={e => e.stopPropagation()}
                            >
                              <option value="">{t.selectSupplier || "Choisir un fournisseur..."}</option>
                              {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                            </select>
                          </td>
                        </motionSlim.tr>,
                        expanded === item.inventory_id && (
                          <motionSlim.tr
                            key={`${item.inventory_id}-expanded`}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                          >
                            <td colSpan={5} className="p-4 bg-black/50">
                              <h4 className="font-bold mb-2 text-emerald-400/80 text-xs uppercase tracking-wider">{t.priceHistory || "Tarifs Enregistrés de l'ingrédient:"}</h4>
                              {history[item.inventory_id]?.length > 0 ? (
                                <div className="grid gap-2">
                                  {history[item.inventory_id].map((h: {supplier: string; date?: string; unit_price?: number}, i: number) => (
                                    <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5 hover:border-emerald-500/30 transition-all">
                                      <div className="flex flex-col">
                                        <span className="font-medium text-slate-200">{h.supplier}</span>
                                        <span className="text-[10px] text-slate-500 italic">{h.date}</span>
                                      </div>
                                      <div className="flex gap-4 items-center">
                                        <span className="text-sm font-bold text-amber-400">{(h.unit_price || 0).toFixed(2)} € / {item.unit}</span>
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedSupplier(prev => ({...prev, [item.inventory_id]: h.supplier}));
                                            setSelectedPrice(prev => ({...prev, [item.inventory_id]: h.unit_price}));
                                          }} 
                                          className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${selectedPrice[item.inventory_id] === h.unit_price && selectedSupplier[item.inventory_id] === h.supplier ? 'bg-emerald-600 text-white' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'}`}
                                        >
                                          Sélectionner
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-500 text-sm italic">{t.noHistory || "Aucun historique disponible"}</span>
                              )}
                            </td>
                          </motionSlim.tr>
                        )
                      ].filter(Boolean))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
            {forecast.length > 0 && (
              <div className="mt-6 flex justify-end">
                <button onClick={() => handleCreateOrder()} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 transition-colors text-white rounded-xl font-bold flex items-center shadow-lg shadow-emerald-500/30">
                    <Printer className="w-5 h-5 mr-2" /> {t.createOrderPdf || "Générer les Bons de Commande (PDF)"}
                </button>
              </div>
            )}
          </motionSlim.div>
  );
}
