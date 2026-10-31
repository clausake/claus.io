// T3.2 : extrait de src/components/DocumentManager.tsx (extraction pure, byte-exact).
// Vue archive « pending » (le garde {archiveTab === "pending" && ...} reste
// dans le parent) : JSX sans hook interne ; props = variables mesurées. JSX Copié
// tel quel, handlers passés en props. Aucun changement de comportement.
import { Calendar, CheckCircle2, Clock, Expand, FileText } from 'lucide-react';
import { MediaDisplay, translateIngredientHelper } from '../../lib/helpers';
import type { Document } from './types';

export function ChronologicalView({groupedDocuments, handleValidate, setEnlargedImage, t}: {
  groupedDocuments: any; handleValidate: (d: any) => void; setEnlargedImage: (v: any) => void
  t: Record<string, string>;
}) {
  return (
Object.keys(groupedDocuments).length === 0 ? (
                <div className="text-center py-24 bg-[#1A1A1A]/30 rounded-3xl border border-white/5">
                  <FileText className="w-16 h-16 text-slate-700 mx-auto mb-6" />
                  <h3 className="text-xl font-bold text-white mb-2">
                    {t.emptyArchive || "Archive vide"}
                  </h3>
                  <p className="text-slate-500">{t.noAlertsActive}</p>
                </div>
              ) : (
                Object.keys(groupedDocuments)
                  .sort((a, b) => {
                    // Sort by date descending
                    const dateA = new Date(
                      groupedDocuments[a][
                        Object.keys(groupedDocuments[a])[0]
                      ][0].date,
                    );
                    const dateB = new Date(
                      groupedDocuments[b][
                        Object.keys(groupedDocuments[b])[0]
                      ][0].date,
                    );
                    return dateB.getTime() - dateA.getTime();
                  })
                  .map((month) => (
                    <div key={month} className="space-y-6">
                      <div className="flex items-center gap-4">
                        <h3 className="text-lg font-black text-emerald-500 uppercase tracking-widest">
                          {month}
                        </h3>
                        <div className="h-px flex-1 bg-gradient-to-r from-emerald-500/20 to-transparent"></div>
                      </div>

                      <div className="space-y-8">
                        {Object.keys(groupedDocuments[month])
                          .sort((a, b) => {
                            const dateA = new Date(
                              groupedDocuments[month][a][0].date,
                            );
                            const dateB = new Date(
                              groupedDocuments[month][b][0].date,
                            );
                            return dateB.getTime() - dateA.getTime();
                          })
                          .map((day) => (
                            <div key={day} className="space-y-4">
                              <div className="flex items-center gap-3">
                                <Calendar className="w-4 h-4 text-slate-500" />
                                <h4 className="text-sm font-bold text-slate-400">
                                  {day}
                                </h4>
                              </div>

                              <div className="grid grid-cols-1 gap-4">
                                {groupedDocuments[month][day].map(
                                  (doc: {id: string; supplier?: string; date?: string; status?: string; type?: string; total_amount?: number; items?: {id: string; name?: string; quantity?: number; inventory_name?: string; unit?: string; unit_price?: number}[]; source_image_url?: string}) => (
                                    <div
                                      key={doc.id}
                                      className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 hover:border-emerald-500/30 transition-all group"
                                    >
                                      <div className="flex justify-between items-start mb-6">
                                        <div>
                                          <div className="flex items-center space-x-3 mb-2">
                                            <span
                                              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
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
                                            <span
                                              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center ${
                                                doc.status === "VALIDATED"
                                                  ? "bg-emerald-500/20 text-emerald-400"
                                                  : "bg-amber-500/20 text-amber-400"
                                              }`}
                                            >
                                              {doc.status === "VALIDATED" ? (
                                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                              ) : (
                                                <Clock className="w-3 h-3 mr-1" />
                                              )}
                                              {doc.status === "VALIDATED"
                                                ? t.stockUpdated
                                                : t.pendingValidation}
                                            </span>
                                          </div>
                                          <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">
                                            {doc.supplier}
                                          </h3>
                                          <p className="text-slate-400 text-sm mt-1">
                                            {t.totalShort || "Total"}:{" "}
                                            <span className="text-white font-bold">
                                              {doc.total_amount}
                                            </span>
                                          </p>
                                        </div>
                                        {doc.status === "PENDING" && (
                                          <button
                                            onClick={() =>
                                              handleValidate(doc.id)
                                            }
                                            className="bg-emerald-600 text-white hover:bg-emerald-500 px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all flex items-center led-glow-emerald border border-emerald-400/30 shadow-lg"
                                          >
                                            <CheckCircle2 className="w-4 h-4 mr-2 led-icon-glow" />
                                            {t.validateStock}
                                          </button>
                                        )}
                                      </div>

                                      <div className="bg-black rounded-xl border border-white/5 overflow-hidden">
                                        {doc.source_image_url && (
                                          <div
                                            className="border-b border-white/5 bg-black/40 flex items-center justify-center p-4 cursor-pointer hover:bg-black/60 transition-colors relative group"
                                            onClick={() =>
                                              setEnlargedImage(
                                                doc.source_image_url,
                                              )
                                            }
                                            title={
                                              t.clickToEnlarge ||
                                              "Cliquez pour agrandir"
                                            }
                                          >
                                            <MediaDisplay
                                              src={doc.source_image_url}
                                              alt={
                                                t.scannedDocAlt ||
                                                "Document scanné"
                                              }
                                              className="max-h-[150px] object-contain rounded-lg shadow-sm transition-transform group-hover:scale-105"
                                            />
                                            <div className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md">
                                              <Expand size={14} />
                                            </div>
                                          </div>
                                        )}
                                        <table className="w-full text-sm text-left text-slate-300">
                                          <thead className="text-[10px] text-slate-500 uppercase font-black tracking-widest bg-[#1A1A1A]/50 border-b border-white/5">
                                            <tr>
                                              <th className="px-4 py-3">
                                                Article (Stock)
                                              </th>
                                              <th className="px-4 py-3 text-right">
                                                Quantité
                                              </th>
                                              <th className="px-4 py-3 text-right">
                                                {t.puLabel || "P.U."}
                                              </th>
                                              <th className="px-4 py-3 text-right">
                                                {t.totalRowLabel || "Total"}
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {doc.items?.map((item: {id: string; name?: string; quantity?: number; inventory_name?: string; unit?: string; unit_price?: number}) => (
                                              <tr
                                                key={item.id}
                                                className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                                              >
                                                <td className="px-4 py-3 font-medium text-white">
                                                  {translateIngredientHelper(
                                                    item.inventory_name || "",
                                                    t.language,
                                                  )}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">
                                                  {item.quantity} {item.unit}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">
                                                  {item.unit_price}
                                                </td>
                                                <td className="px-4 py-3 text-right text-emerald-400 font-bold font-mono">
                                                  {(
                                                    (item.quantity || 0) *
                                                    (item.unit_price || 0)
                                                  ).toFixed(2)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))
              )
  );
}
