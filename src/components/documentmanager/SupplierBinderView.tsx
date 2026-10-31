// T3.2 : extrait de src/components/DocumentManager.tsx (extraction pure, byte-exact).
// Vue archive « suppliers » (le garde {archiveTab === "suppliers" && ...} reste
// dans le parent) : JSX sans hook interne ; props = variables mesurées. JSX Copié
// tel quel, handlers passés en props. Aucun changement de comportement.
import { ChevronDown, Expand, Folder } from 'lucide-react';
import { MediaDisplay, translateIngredientHelper } from '../../lib/helpers';
import type { Document } from './types';

export function SupplierBinderView({docsBySupplier, expandedSupplier, setExpandedSupplier, setEnlargedImage, t}: {
  docsBySupplier: any; expandedSupplier: string | null; setExpandedSupplier: (v: any) => void; setEnlargedImage: (v: any) => void
  t: Record<string, string>;
}) {
  return (
Object.keys(docsBySupplier).length === 0 ? (
                <div className="text-center py-24 bg-[#1A1A1A]/30 rounded-3xl border border-white/5">
                  <Folder className="w-16 h-16 text-slate-700 mx-auto mb-6" />
                  <h3 className="text-xl font-bold text-white mb-2">
                    {t.emptyFolder || "Classeur vide"}
                  </h3>
                  <p className="text-slate-500">
                    {t.noDocumentRegistered || "Aucun document validé"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.keys(docsBySupplier)
                    .sort()
                    .map((sup) => (
                      <div
                        key={sup}
                        className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 hover:border-emerald-500/30 transition-all group h-fit cursor-pointer flex flex-col"
                        onClick={() =>
                          setExpandedSupplier(
                            expandedSupplier === sup ? null : sup,
                          )
                        }
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500/20 transition-colors">
                            <Folder className="w-6 h-6" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-white">
                              {sup}
                            </h3>
                            <p className="text-sm text-slate-400">
                              {docsBySupplier[sup].length} document
                              {docsBySupplier[sup].length > 1 ? "s" : ""}
                            </p>
                          </div>
                          <div
                            className={`transition-transform duration-300 ${expandedSupplier === sup ? "rotate-180" : ""}`}
                          >
                            <ChevronDown className="w-5 h-5 text-slate-500" />
                          </div>
                        </div>

                        {expandedSupplier === sup && (
                          <div
                            className="mt-6 space-y-4 pt-6 border-t border-white/5 flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {docsBySupplier[sup].map((doc: {id: string; supplier?: string; date?: string; status?: string; type?: string; total_amount?: number; items?: {id: string; name?: string; quantity?: number; inventory_name?: string; unit?: string; unit_price?: number}[]; source_image_url?: string}) => (
                              <div
                                key={doc.id}
                                className="bg-black rounded-xl border border-white/5 overflow-hidden"
                              >
                                <div className="p-4 flex justify-between items-center bg-black/40 border-b border-white/5">
                                  <div>
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest mr-2 ${
                                        doc.type === "FACTURE"
                                          ? "bg-blue-500/20 text-blue-400"
                                          : doc.type === "AVOIR"
                                            ? "bg-rose-500/20 text-rose-400"
                                            : "bg-purple-500/20 text-purple-400"
                                      }`}
                                    >
                                      {doc.type === "FACTURE"
                                        ? t.facture
                                        : doc.type === "AVOIR"
                                          ? t.creditNote
                                          : t.deliveryNote}
                                    </span>
                                    <span className="text-slate-400 text-xs font-mono">
                                      {doc.date ? new Date(doc.date).toLocaleDateString() : ""}
                                    </span>
                                  </div>
                                  <div className="text-emerald-400 font-bold font-mono text-sm">
                                    {doc.total_amount}
                                  </div>
                                </div>
                                {doc.source_image_url && (
                                  <div
                                    className="bg-black/60 flex items-center justify-center p-2 cursor-pointer hover:bg-black/80 transition-colors relative group"
                                    onClick={() =>
                                      setEnlargedImage(doc.source_image_url)
                                    }
                                    title={
                                      t.clickToEnlarge ||
                                      "Cliquez pour agrandir"
                                    }
                                  >
                                    <MediaDisplay
                                      src={doc.source_image_url}
                                      alt={t.scannedDocAlt || "Document scanné"}
                                      className="max-h-[100px] object-contain rounded-lg shadow-sm transition-transform group-hover:scale-105"
                                    />
                                    <div className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md">
                                      <Expand size={12} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )
  );
}
