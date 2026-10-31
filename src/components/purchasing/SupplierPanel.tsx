// T3.2 : extrait de src/components/Purchasing.tsx (extraction pure, byte-exact).
// Branche 'suppliers' : JSX sans hook interne ; props = les 20 variables mesurées
// sur la plage + t. JSX Copié tel quel (mêmes classes, mêmes handlers en props).
import * as motionSlim from 'motion/react-m';
import { Edit2, Mail, Plus, Trash2, Users } from 'lucide-react';
import type { PurchaseOrder } from './types';

export function SupplierPanel({ suppliers, supplierName, setSupplierName, supplierEmail, setSupplierEmail, supplierPhone, setSupplierPhone, editingSupplier, setEditingSupplier, editingSupplierName, setEditingSupplierName, editingSupplierEmail, setEditingSupplierEmail, editingSupplierPhone, setEditingSupplierPhone, addSupplier, updateSupplier, deleteSupplier, t }: {
  suppliers: any[]
  supplierName: string; setSupplierName: (v: string) => void;
  supplierEmail: string; setSupplierEmail: (v: string) => void;
  supplierPhone: string; setSupplierPhone: (v: string) => void;
  editingSupplier: string | null; setEditingSupplier: (v: string | null) => void;
  editingSupplierName: string; setEditingSupplierName: (v: string) => void;
  editingSupplierEmail: string; setEditingSupplierEmail: (v: string) => void;
  editingSupplierPhone: string; setEditingSupplierPhone: (v: string) => void;
  addSupplier: () => void; updateSupplier: (id: string) => void; deleteSupplier: (id: string) => void;
  t: Record<string, string>;
}) {
  return (
          <motionSlim.div 
            key="suppliers"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Add New Supplier Section */}
            <div className="p-6 bg-white/5 border border-white/5 rounded-3xl mb-8">
              <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-4">{t.addNewSupplier || "Nouveau Fournisseur"}</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <input 
                    type="text"
                    placeholder={t.name || "Nom du fournisseur"}
                    value={supplierName}
                    onChange={e => setSupplierName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <input 
                    type="email"
                    placeholder={t.email || "Email"}
                    value={supplierEmail}
                    onChange={e => setSupplierEmail(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <input 
                    type="tel"
                    placeholder={t.phone || "Téléphone"}
                    value={supplierPhone}
                    onChange={e => setSupplierPhone(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all"
                  />
                </div>
                <button 
                  onClick={addSupplier}
                  className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white h-[48px] rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
                >
                  <Plus className="w-5 h-5" /> {t.add || "Ajouter"}
                </button>
              </div>
            </div>

            {/* Suppliers List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
              {suppliers.length === 0 ? (
                <div className="h-full py-20 text-center flex flex-col items-center justify-center bg-black/20 rounded-3xl border border-white/10 border-dashed">
                  <Users className="w-16 h-16 text-slate-700 mb-4 opacity-30" />
                  <p className="text-slate-500 font-medium">{t.noSuppliers || "Aucun fournisseur enregistré"}</p>
                </div>
              ) : (
                suppliers.map(s => (
                  <div key={s.id} className="group bg-white/5 border border-white/5 rounded-2xl p-6 hover:bg-white/10 transition-all flex flex-col md:flex-row items-center gap-6">
                    {editingSupplier === s.id ? (
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                        <input 
                          type="text"
                          className="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-2 text-white"
                          value={editingSupplierName}
                          onChange={e => setEditingSupplierName(e.target.value)}
                          autoFocus
                        />
                        <input 
                          type="email"
                          className="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-2 text-white"
                          value={editingSupplierEmail}
                          onChange={e => setEditingSupplierEmail(e.target.value)}
                        />
                        <input 
                          type="tel"
                          className="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-2 text-white"
                          value={editingSupplierPhone}
                          onChange={e => setEditingSupplierPhone(e.target.value)}
                        />
                        <div className="md:col-span-3 flex justify-end gap-2 mt-2">
                          <button onClick={() => updateSupplier(s.id)} className="bg-emerald-600 text-white px-5 py-1.5 rounded-lg text-sm font-bold">Sauvegarder</button>
                          <button onClick={() => setEditingSupplier(null)} className="bg-white/10 text-white px-5 py-1.5 rounded-lg text-sm font-bold">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 font-black text-2xl shrink-0">
                          {(s.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 flex flex-col">
                          <span className="text-xl font-bold text-white tracking-tight">{s.name || 'Sans nom'}</span>
                          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2">
                            {s.email && <span className="text-sm text-slate-500 flex items-center gap-2"><Mail className="w-4 h-4 text-emerald-500/40" /> {s.email}</span>}
                            {s.phone && <span className="text-sm text-slate-500 flex items-center gap-2"><Users className="w-4 h-4 text-emerald-500/40" /> {s.phone}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => {
                              setEditingSupplier(s.id);
                              setEditingSupplierName(s.name);
                              setEditingSupplierEmail(s.email || '');
                              setEditingSupplierPhone(s.phone || '');
                            }}
                            className="p-3 text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-all"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button onClick={() => deleteSupplier(s.id)} className="p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="p-4 mt-4 bg-black/20 border border-white/5 rounded-2xl text-center text-[10px] uppercase tracking-[0.3em] text-slate-600 font-black">
              claus.io — Database
            </div>
          </motionSlim.div>
  );
}
