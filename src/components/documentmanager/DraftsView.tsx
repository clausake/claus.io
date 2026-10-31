// T3.2 : extrait de src/components/DocumentManager.tsx (extraction pure, byte-exact).
// Vue archive « drafts » (le garde {archiveTab === "drafts" && ...} reste
// dans le parent) : JSX sans hook interne ; props = variables mesurées. JSX Copié
// tel quel, handlers passés en props. Aucun changement de comportement.
import { Clock, Expand } from 'lucide-react';
import { MediaDisplay, translateIngredientHelper } from '../../lib/helpers';
import type { Document } from './types';

export function DraftsView({documents, handleExtractFromDraft, extractingId, setEnlargedImage, t}: {
  documents: any[]; handleExtractFromDraft: (d: any) => void; extractingId: string | null; setEnlargedImage: (v: any) => void
  t: Record<string, string>;
}) {
  return (
documents.filter((d) => d.status === "DRAFT").length === 0 ? (
                <div className="text-center py-24 bg-[#1A1A1A]/30 rounded-3xl border border-white/5">
                  <Clock className="w-16 h-16 text-slate-700 mx-auto mb-6" />
                  <h3 className="text-xl font-bold text-white mb-2">
                    Aucun brouillon
                  </h3>
                  <p className="text-slate-500">
                    Toutes les photos ont été traitées.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {documents
                    .filter((d) => d.status === "DRAFT")
                    .map((doc) => (
                      <div
                        key={doc.id}
                        className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 flex flex-col group"
                      >
                        <div
                          className="bg-black/40 rounded-xl overflow-hidden mb-4 cursor-pointer relative h-48 flex items-center justify-center border border-white/5 group-hover:border-emerald-500/30 transition-colors"
                          onClick={() => setEnlargedImage(doc.source_image_url)}
                        >
                          <MediaDisplay
                            src={doc.source_image_url}
                            alt="Brouillon"
                            className="max-h-full max-w-full object-contain"
                          />
                          <div className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md">
                            <Expand size={14} />
                          </div>
                        </div>

                        <button
                          onClick={() => handleExtractFromDraft(doc.id)}
                          disabled={extractingId === doc.id}
                          className={`mt-auto w-full px-4 py-2.5 rounded-xl text-sm font-bold uppercase tracking-widest transition-all flex items-center justify-center ${
                            extractingId === doc.id
                              ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                              : "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/30"
                          }`}
                        >
                          {extractingId === doc.id
                            ? t.aiExtractionInProgress
                            : t.scanDocIA}
                        </button>
                      </div>
                    ))}
                </div>
              )
  );
}
