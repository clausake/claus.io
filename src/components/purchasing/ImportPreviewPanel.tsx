// T3.2 : extrait de src/components/Purchasing.tsx (extraction pure, byte-exact).
// Panneau d'aperçu de l'import CSV ({importMatches && ...}) : JSX sans hook interne ;
// props = variables mesurées. JSX Copié tel quel.
import React from 'react';
import * as motionSlim from 'motion/react-m';
import { Sparkles } from 'lucide-react';
import type { ImportMatch } from './types';

export function ImportPreviewPanel({ importMatches, setImportMatches, inventoryItems, handleConfirmImport }: {
  importMatches: any; setImportMatches: (v: any) => void; inventoryItems: any[];
  handleConfirmImport: () => void;
}) {
  return (
              <motionSlim.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 bg-gradient-to-r from-amber-500/5 to-transparent border border-amber-500/20 rounded-3xl space-y-4"
              >
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500 animate-bounce" />
                    <div>
                      <h3 className="font-black text-lg text-white">Analyseur de Mercuriale : Alignement des Ingrédients</h3>
                      <p className="text-xs text-slate-400">Veuillez vérifier les correspondances de l'IA ci-dessous. Modifiez les sélections si nécessaire avant d'importer.</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => setImportMatches(null)}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-lg text-xs"
                    >
                      Annuler
                    </button>
                    <button 
                      onClick={handleConfirmImport}
                      className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-black font-black rounded-lg text-xs shadow-lg shadow-amber-500/10"
                    >
                      Enregistrer les prix ({importMatches.filter((m: ImportMatch) => m.prix_exploitable !== false && m.matched_inventory_id).length})
                    </button>
                  </div>
                </div>

                <div className="overflow-auto max-h-[300px] custom-scrollbar">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/5 text-slate-500 uppercase font-black text-caption tracking-widest">
                        <th className="p-2">Libellé Fournisseur</th>
                        <th className="p-2 text-right">Prix Brut</th>
                        <th className="p-2">Unité d'achat</th>
                        <th className="p-2">⇌ Ingrédient Associé (Stock)</th>
                        <th className="p-2 text-center">Fidélité IA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importMatches.map((m, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                          <td className="p-2 font-bold text-slate-200">{m.raw_name}</td>
                          <td className="p-2 text-right font-mono font-bold">
                            {/* Le prix non numerique arrive desormais en `null`
                                (la route danalyse ne fabrique plus de 0 par
                                defaut). Sans ce garde, `m.raw_price.toFixed(2)`
                                jetterait sur null et toute la vue deimport
                                meurait — un defaut remplace par un autre. La
                                ligne reste VISIBLE (le chef doit voir ce qui
                                etait dans le fichier) mais elle est marquee
                                exploitable-plutot-que-fausse et le bouton ne la
                                compte plus. */}
                            {m.prix_exploitable === false ? (
                              <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-caption font-black">
                                prix illisible
                              </span>
                            ) : (
                              <span className="text-amber-400">{Number(m.raw_price).toFixed(2)} €</span>
                            )}
                          </td>
                          <td className="p-2 text-slate-400 font-mono">{m.raw_unit}</td>
                          <td className="p-2">
                            <select
                              className="bg-black/80 border border-white/10 rounded px-2 py-1 text-xs text-slate-300 w-full"
                              value={m.matched_inventory_id || ''}
                              onChange={e => {
                                const newMatches = [...importMatches];
                                const selectedId = e.target.value;
                                const matchedInv = inventoryItems.find(i => i.id === selectedId);
                                newMatches[idx] = {
                                  ...m,
                                  matched_inventory_id: selectedId,
                                  matched_inventory_name: matchedInv ? matchedInv.name : null,
                                  confidence: 1 // Manual override sets high confidence
                                };
                                setImportMatches(newMatches);
                              }}
                            >
                              <option value="">-- Ignorer cet élément --</option>
                              {inventoryItems.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                            </select>
                          </td>
                          <td className="p-2 text-center">
                            {m.matched_inventory_id ? (
                              <span className={`px-2 py-0.5 rounded-full text-caption font-black ${
                                m.confidence > 1.2 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                              }`}>
                                {m.confidence > 1.2 ? "Haut" : "Moyen"}
                              </span>
                            ) : (
                              <span className="text-red-400 text-[10px] font-bold">Non associé</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motionSlim.div>
  );
}
