// T3.2 : extrait de src/components/Purchasing.tsx (extraction pure, byte-exact).
// Panneau 'receptions' : JSX sans hook interne (aucun useState/useEffect/toast
// dans la plage, vérifié). Il ne lisait que ordersLoading/orders/t et appelait
// setPendingReceive -> devenu props. Le JSX est Copié tel quel.
import * as motionSlim from 'motion/react-m';
import { RefreshCw, PackageCheck } from 'lucide-react';
import type { PurchaseOrder, OrderItem } from './types';

export function ReceptionsPanel({ ordersLoading, orders, t, setPendingReceive }: {
  ordersLoading: boolean; orders: PurchaseOrder[]; t: Record<string, string>;
  setPendingReceive: (o: PurchaseOrder) => void;
}) {
  return (
          <motionSlim.div 
            key="receptions"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="flex-1 flex flex-col min-h-0"
          >
            {ordersLoading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin opacity-50" />
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center text-slate-500 py-20 bg-white/5 rounded-xl border border-white/5">
                {t.noOrders || "Aucun bon de commande. Generez-en un depuis l'onglet Saisies."}
              </div>
            ) : (
              <div className="overflow-auto flex-1 custom-scrollbar space-y-4">
                {orders.map((order: PurchaseOrder) => {
                  const isPending = (order.status || 'PENDING').toUpperCase() !== 'RECEIVED';
                  return (
                    <div key={order.id} className="p-5 bg-white/5 border border-white/5 rounded-2xl">
                      <div className="flex justify-between items-start gap-4 mb-4">
                        <div>
                          <div className="font-bold text-white">{order.supplier || t.unknownSupplier || 'Fournisseur Inconnu'}</div>
                          <div className="text-caption text-slate-500">
                            {order.date ? new Date(order.date).toLocaleString() : ''}
                            {' · '}{(order.items || []).length} {t.lines || 'lignes'}
                            {' · '}{(Number(order.total_amount) || 0).toFixed(2)} €
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-caption font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${
                            (order.status || '').toUpperCase() === 'RECEIVED'
                              ? 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10'
                              : (order.status || '').toUpperCase() === 'PARTIAL'
                                ? 'border-amber-500/40 text-amber-500 bg-amber-500/10'
                                : 'border-slate-500/30 text-slate-400 bg-white/5'
                          }`}>
                            {order.status || 'PENDING'}
                          </span>
                          {isPending && (
                            <button
                              onClick={() => setPendingReceive(order)}
                              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                            >
                              <PackageCheck className="w-4 h-4" /> {t.receiveNow || 'Receptionner'}
                            </button>
                          )}
                        </div>
                      </div>
                      <table className="w-full text-left text-slate-300 text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-caption uppercase tracking-widest text-slate-500">
                            <th className="py-2">{t.product || 'Produit'}</th>
                            <th className="py-2">{t.quantity || 'Quantité'}</th>
                            <th className="py-2">{t.receivedQty || 'Reçu'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(order.items || []).map((it: OrderItem) => (
                            <tr key={it.id} className="border-b border-white/5">
                              <td className="py-2">{it.inventory_name || it.original_name || '—'}
                                {!it.inventory_id || !it.in_stock ? (
                                  <span className="ml-2 text-caption text-amber-500">
                                    {t.notInStock || 'hors inventaire'}
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-2">{Number(it.quantity) || 0} {it.unit || ''}</td>
                              <td className="py-2">
                                {Number(it.received_quantity) > 0
                                  ? <span className="text-emerald-500 font-bold">{Number(it.received_quantity)}</span>
                                  : <span className="text-slate-600">0</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </motionSlim.div>
  );
}
