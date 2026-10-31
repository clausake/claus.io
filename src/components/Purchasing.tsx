import React, { useState, useEffect } from 'react';
import { ShoppingCart, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Printer, Mail, Trash2, Edit2, RotateCcw, Plus, Sparkles, Users, X, HelpCircle, PackageCheck } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AnimatePresence, LazyMotion, domAnimation } from "motion/react";
import * as motionSlim from "motion/react-m";
import { useToast, ConfirmDialog } from "./ui/Toast";
// T3.2 : types, PDF, parsing CSV et cinq panneaux JSX extraits (extraction pure,
// byte-exact) dans ./purchasing/ pour tenir la règle « aucun fichier source > 800 ».
import { ForecastItem, OrderItem, PurchaseOrder, ImportMatch } from "./purchasing/types";
import { generateOrderPdf } from "./purchasing/orderPdf";
import { parseCsvItems } from "./purchasing/csvParse";
import { ReceptionsPanel } from "./purchasing/ReceptionsPanel";
import { SupplierPanel } from "./purchasing/SupplierPanel";
import { ImportPreviewPanel } from "./purchasing/ImportPreviewPanel";
import { PriceComparisonTable } from "./purchasing/PriceComparisonTable";
import { AddPriceModal } from "./purchasing/AddPriceModal";
import { ValidationPanel } from "./purchasing/ValidationPanel";


export function PurchasingTab({ t, translateIngredient, manualIds }: { t: Record<string, string>, translateIngredient?: (name: string, lang: string) => string, manualIds?: Set<string> }) {
  const toast = useToast();
  const [pendingDeletePrice, setPendingDeletePrice] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  // La fenetre reelle du besoin (« sur 14 jours a partir du ... »). Sans elle le
  // chiffre du besoin n'a pas d'origine et le cuisinier ne peut pas dire s'il
  // couvre le service du lendemain ou trois semaines.
  const [forecastWindow, setForecastWindow] = useState<{ from: string; horizon: number } | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [history, setHistory] = useState<Record<string, {supplier: string; date?: string; unit_price?: number}[]>>({});
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Record<string, string>>({});
  const [selectedPrice, setSelectedPrice] = useState<Record<string, number>>({});
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set());
  
  const [activeTab, setActiveTab] = useState<'validation' | 'suppliers' | 'prices' | 'receptions'>('validation');
  const [supplierName, setSupplierName] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const [editingSupplierName, setEditingSupplierName] = useState('');
  const [editingSupplierEmail, setEditingSupplierEmail] = useState('');
  const [editingSupplierPhone, setEditingSupplierPhone] = useState('');

  // Price Comparison & Mercuriales States
  const [comparisonData, setComparisonData] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);

const [importMatches, setImportMatches] = useState<ImportMatch[] | null>(null);
  const [importSupplierId, setImportSupplierId] = useState('');
  const [isAnalyzingImport, setIsAnalyzingImport] = useState(false);
  const [priceSearch, setPriceSearch] = useState('');
  const [expandedIngredientPrice, setExpandedIngredientPrice] = useState<string | null>(null);
  const [newPriceData, setNewPriceData] = useState({
    inventory_id: '',
    supplier_id: '',
    raw_unit_price: '',
    unit: 'kg',
    valid_until: ''
  });
  const [showAddPriceModal, setShowAddPriceModal] = useState(false);

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers');
      const data = await res.json();
      setSuppliers(data);
    } catch (error) {
  const toast = useToast();
      console.error('Error fetching suppliers:', error);
    }
  };

  const addSupplier = async () => {
    if (!supplierName.trim()) return;
    try {
      await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: supplierName.trim(), 
          email: supplierEmail.trim(), 
          phone: supplierPhone.trim() 
        })
      });
      setSupplierName('');
      setSupplierEmail('');
      setSupplierPhone('');
      await fetchSuppliers();
    } catch (error) {
      console.error('Error adding supplier:', error);
    }
  };

  const updateSupplier = async (id: string) => {
    if (!editingSupplierName.trim()) return;
    try {
      await fetch(`/api/suppliers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: editingSupplierName.trim(), 
          email: editingSupplierEmail.trim(), 
          phone: editingSupplierPhone.trim() 
        })
      });
      setEditingSupplier(null);
      await fetchSuppliers();
    } catch (error) {
      console.error('Error updating supplier:', error);
    }
  };

  const deleteSupplier = async (id: string) => {
    try {
      await fetch(`/api/suppliers/${id}`, { method: 'DELETE' });
      await fetchSuppliers();
    } catch (error) {
      console.error('Error deleting supplier:', error);
    }
  };

  const fetchForecast = () => {
    setLoading(true);
    const idsParam = manualIds && manualIds.size > 0 ? `?ids=${Array.from(manualIds).join(',')}` : '';
    Promise.all([
        fetch(`/api/purchasing/forecast${idsParam}`).then(res => res.json()),
        fetch('/api/suppliers').then(res => res.json())
    ]).then(([payload, supplierData]) => {
        // La route renvoie { items, window }. Le garde sur `?.items ?? payload`
        // laisse tourner une instance ancienne (ou un serveur qui n'aurait pas
        // la nouvelle forme) sans plan blanc : un tableau reste un tableau.
        const forecastData = Array.isArray(payload) ? payload : (payload?.items ?? []);
        setForecast(forecastData);
        setForecastWindow(payload && !Array.isArray(payload) ? payload.window ?? null : null);
        setSuppliers(supplierData);
        const initialOverrides: Record<string, number> = { ...overrides };
        forecastData.forEach((item: ForecastItem) => {
          if (initialOverrides[item.inventory_id] === undefined) {
             initialOverrides[item.inventory_id] = Math.max(0, item.minStock - item.quantity + item.besoin_recettes);
          }
        });
        setOverrides(initialOverrides);
        setLoading(false);
      });
  };

  const fetchOrders = () => {
    setOrdersLoading(true);
    fetch('/api/purchasing/orders')
      .then(res => res.json())
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch((e) => console.error('Error fetching orders:', e))
      .finally(() => setOrdersLoading(false));
  };

  // Une reception est un mouvement de stock : elle se confirme (pas d'alert(),
  // ConfirmDialog) et elle se dit ensuite a voix haute (toast) avec le solde.
  const [pendingReceive, setPendingReceive] = useState<any | null>(null);

  const receiveOrder = async (order: PurchaseOrder) => {
    try {
      const res = await fetch(`/api/purchasing/orders/${order.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ received: [] }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.message || (t.receiveFailed || 'Reception impossible'), 'error');
        return;
      }
      toast(
        (t.receivedOk || 'Bon receptionne : {lines} lignes entre(es) en stock')
          .replace('{lines}', String(data.received_lines ?? 0)),
        'success',
      );
      fetchOrders();
      fetchForecast();
    } catch (error) {
      console.error('Error receiving order:', error);
      toast(t.receiveFailed || 'Reception impossible', 'error');
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prices Comparison & Mercuriales Operations
  const fetchComparison = async () => {
    try {
      const res = await fetch('/api/supplier-prices/comparison');
      const data = await res.json();
      setComparisonData(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      setInventoryItems(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchForecast();
  }, [manualIds]);

  useEffect(() => {
    if (activeTab === 'prices') {
      fetchComparison();
      fetchInventory();
      fetchSuppliers();
    }
  }, [activeTab]);

  const handleReset = () => {
    setIgnoredIds(new Set());
    fetchForecast();
  };

  const toggleExpand = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
    } else {
      setExpanded(id);
      if (!history[id]) {
        // Fetch custom supplier prices for comparison
        const res = await fetch(`/api/inventory/${id}/prices`);
        const data = await res.json();
        setHistory(prev => ({ ...prev, [id]: data }));
      }
    }
  };

  const getOrderItems = () => {
    return forecast
      .filter(f => !ignoredIds.has(f.inventory_id))
      .map(f => {
        const name = translateIngredient ? translateIngredient(f.name, t.language) : f.name;
        const qty = overrides[f.inventory_id] ?? Math.max(0, f.minStock - f.quantity + f.besoin_recettes);
        const price = selectedPrice[f.inventory_id] ?? 0;
        return {
          name,
          quantity: qty,
          unit_price: price,
          total: qty * price
        };
      });
  };


  const handleCreateOrder = async () => {
    const allItems = forecast.filter(f => !ignoredIds.has(f.inventory_id));
    if (allItems.length === 0) return;

    const groupedOrders: Record<string, any[]> = {};
    allItems.forEach(f => {
        const supplier = selectedSupplier[f.inventory_id] || (t.unknownSupplier || 'Fournisseur Inconnu');
        const qty = overrides[f.inventory_id] ?? Math.max(0, f.minStock - f.quantity + f.besoin_recettes);
        const name = translateIngredient ? translateIngredient(f.name, t.language) : f.name;
        const price = selectedPrice[f.inventory_id] ?? f.unit_price ?? 0;
        
        if (!groupedOrders[supplier]) groupedOrders[supplier] = [];
        groupedOrders[supplier].push({
            name,
            inventory_id: f.inventory_id,
            quantity: qty,
            unit_price: price,
            total: qty * price
        });
    });

    for (const [supplier, items] of Object.entries(groupedOrders)) {
        await fetch('/api/purchasing/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // `inventory_id: <nom>` etait la faute : le bon se creeit, son detail
            // aussi, tout restait VERT, et la jointure d'inventaire etait creuse.
            // Un bon dont la ligne ne pointe pas un id d'inventaire ne peut pas
            // etre receptionne (l'UPDATE ne toucerait 0 ligne). La cle part donc
            // en id REEL; le nom ne sert plus qu'au PDF.
            body: JSON.stringify({
                items: items.map(i => ({ inventory_id: i.inventory_id, quantity: i.quantity, unit_price: i.unit_price })),
                supplier
            })
        });

        const supplierData = suppliers.find(s => s.name === supplier);
        const doc = generateOrderPdf(t, supplier, supplierData, items);
        doc.save(`Bon_Commande_${supplier}.pdf`);
    }
    fetchOrders();

    toast((t.orderSimpleReportMsg || "{count} bons de commande générés et téléchargés !", "success").replace('{count}', Object.keys(groupedOrders).length.toString()));
  };

  // CSV Import parsing logic
  const handleCSVImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!importSupplierId) {
      toast("Veuillez sélectionner un fournisseur d'abord !", "info");
      return;
    }
    
    setIsAnalyzingImport(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const { lines, items } = parseCsvItems(e.target?.result as string);

        if (lines.length < 2) {
          toast("Le fichier semble vide ou invalide !", "error");
          setIsAnalyzingImport(false);
          return;
        }

        if (items.length === 0) {
          toast("Aucune ligne de tarif valide trouvée. Vérifiez vos en-têtes (Produit, Prix, Unité).", "info");
          setIsAnalyzingImport(false);
          return;
        }

        const response = await fetch('/api/supplier-prices/import-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ supplier_id: importSupplierId, items })
        });
        const result = await response.json();
        
        if (result.status === 'success') {
          setImportMatches(result.matches);
        } else {
          toast("Erreur lors de l'analyse : " + result.message, "error");
        }
      } catch (err) {
        console.error(err);
        toast("Erreur de parsing", "error");
      } finally {
        setIsAnalyzingImport(false);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!importMatches || !importSupplierId) return;
    try {
      setLoading(true);
      const res = await fetch('/api/supplier-prices/import-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: importSupplierId,
          matches: importMatches
        })
      });
      const result = await res.json();
      if (result.status === 'success') {
        toast("Mercuriale importée avec succès !", "success");
        setImportMatches(null);
        await fetchComparison();
      } else {
        toast("Erreur: " + result.message, "error");
      }
    } catch (error) {
      console.error(error);
      toast("Échec de l'importation", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddManualPrice = async () => {
    if (!newPriceData.inventory_id || !newPriceData.supplier_id || !newPriceData.raw_unit_price) {
      toast("Veuillez remplir tous les champs obligatoires (*) !", "info");
      return;
    }
    try {
      const res = await fetch('/api/supplier-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: newPriceData.supplier_id,
          inventory_id: newPriceData.inventory_id,
          raw_unit_price: parseFloat(newPriceData.raw_unit_price),
          unit: newPriceData.unit || 'kg',
          valid_until: newPriceData.valid_until || null,
          is_verified_from_invoice: 0
        })
      });
      const result = await res.json();
      if (result.status === 'success') {
        setShowAddPriceModal(false);
        setNewPriceData({
          inventory_id: '',
          supplier_id: '',
          raw_unit_price: '',
          unit: 'kg',
          valid_until: ''
        });
        await fetchComparison();
      } else {
        toast("Erreur: " + result.message, "error");
      }
    } catch (e) {
      console.error(e);
      toast("Erreur réseau", "error");
    }
  };

  const handleDeletePrice = async (priceId: string) => {
    try {
      const res = await fetch(`/api/supplier-prices/${priceId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.status === 'success') {
        await fetchComparison();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredComparison = comparisonData.filter(g =>
    (g.inventory_name || '').toLowerCase().includes(priceSearch.toLowerCase())
  );

  return (
    <div className="led-glow-container flex flex-col relative overflow-hidden hidden-scrollbar">
      {/* Header with Sub-tabs */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-8 gap-6 border-b border-white/5 pb-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-black text-white tracking-tight">
            {activeTab === 'validation' 
              ? (t.purchasingValidation || "Validation des Achats") 
              : activeTab === 'suppliers' 
                ? (t.manageSuppliers || "Gestion Fournisseurs") 
                : activeTab === 'receptions'
                  ? (t.receiveTab || "Reception des Bons")
                  : "Comparateur & Mercuriales"}
          </h2>
          <p className="text-slate-500 text-sm font-medium">
            {activeTab === 'prices' ? "Comparaison de prix, détection d'économies & import automatisé" : (t.purchasingSubtitle2 || "Logistique & Approvisionnement")}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-black/40 p-1.5 rounded-2xl border border-white/5 shadow-inner gap-1 flex-wrap">
          <button 
            onClick={() => setActiveTab('validation')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'validation' 
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            {t.validation || "Saisies"}
          </button>
          
          <button 
            onClick={() => setActiveTab('suppliers')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'suppliers' 
                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            {t.suppliers || "Fournisseurs"}
          </button>

          <button 
            onClick={() => setActiveTab('prices')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'prices' 
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/10' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Comparateur
          </button>

          <button 
            onClick={() => setActiveTab('receptions')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'receptions' 
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            {t.receiveTab || "Reception"}
            {orders.filter((o: PurchaseOrder) => (o.status || 'PENDING').toUpperCase() === 'PENDING').length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-black">
                {orders.filter((o: PurchaseOrder) => (o.status || 'PENDING').toUpperCase() === 'PENDING').length}
              </span>
            )}
          </button>
        </div>

        {(activeTab === 'validation' || activeTab === 'receptions') && (
          <button 
            onClick={handleReset}
            className={`p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all flex items-center gap-2 ${loading ? 'animate-spin' : ''}`}
            title={t.refresh || "Actualiser"}
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'validation' ? (
          <ValidationPanel forecast={forecast} forecastWindow={forecastWindow} ignoredIds={ignoredIds} setIgnoredIds={setIgnoredIds} overrides={overrides} setOverrides={setOverrides} history={history} setHistory={setHistory} expanded={expanded} toggleExpand={toggleExpand} selectedSupplier={selectedSupplier} setSelectedSupplier={setSelectedSupplier} selectedPrice={selectedPrice} setSelectedPrice={setSelectedPrice} suppliers={suppliers} handleCreateOrder={handleCreateOrder} translateIngredient={translateIngredient} loading={loading} manualIds={manualIds} t={t} />
        ) : activeTab === 'receptions' ? (
          <ReceptionsPanel ordersLoading={ordersLoading} orders={orders} t={t} setPendingReceive={setPendingReceive} />
        ) : activeTab === 'suppliers' ? (
          <SupplierPanel suppliers={suppliers} supplierName={supplierName} setSupplierName={setSupplierName} supplierEmail={supplierEmail} setSupplierEmail={setSupplierEmail} supplierPhone={supplierPhone} setSupplierPhone={setSupplierPhone} editingSupplier={editingSupplier} setEditingSupplier={setEditingSupplier} editingSupplierName={editingSupplierName} setEditingSupplierName={setEditingSupplierName} editingSupplierEmail={editingSupplierEmail} setEditingSupplierEmail={setEditingSupplierEmail} editingSupplierPhone={editingSupplierPhone} setEditingSupplierPhone={setEditingSupplierPhone} addSupplier={addSupplier} updateSupplier={updateSupplier} deleteSupplier={deleteSupplier} t={t} />
        ) : (
          /* COMPARATEUR DE PRIX & MERCURIALES TAB */
          <motionSlim.div 
            key="prices"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex-1 flex flex-col min-h-0 space-y-8"
          >
            {/* Import Area and Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Mercuriale direct file upload */}
              <div className="lg:col-span-2 p-6 bg-white/5 border border-white/5 rounded-3xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
                    <h3 className="text-lg font-black text-white">Import Intelligent de Mercuriale</h3>
                  </div>
                  <p className="text-slate-400 text-sm mb-6">
                    Déposez une feuille de tarifs (CSV) envoyée par votre fournisseur. L'IA de claus.io va faire correspondre les lignes au bon ingrédient en stock.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase text-slate-500 tracking-wider">Fournisseur de la Mercuriale</label>
                    <select
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-amber-500"
                      value={importSupplierId}
                      onChange={e => setImportSupplierId(e.target.value)}
                    >
                      <option value="">-- Choisir le Fournisseur --</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase text-slate-500 tracking-wider">Fichier de tarifs (.CSV)</label>
                    <div className="relative">
                      <input 
                        type="file" 
                        accept=".csv"
                        disabled={!importSupplierId || isAnalyzingImport}
                        onChange={handleCSVImport}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer disabled:cursor-not-allowed"
                      />
                      <div className={`w-full border border-dashed rounded-xl py-3 px-4 text-center font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                        !importSupplierId 
                          ? 'border-white/5 text-slate-600 bg-white/[0.01]' 
                          : isAnalyzingImport
                            ? 'border-amber-500/50 text-amber-500 bg-amber-500/5 animate-pulse'
                            : 'border-white/20 text-slate-300 hover:border-amber-500/50 bg-white/5'
                      }`}>
                        {isAnalyzingImport ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Analyse de la Mercuriale...
                          </>
                        ) : (
                          "Choisir / Glisser un CSV"
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI Quick info card */}
              <div className="p-6 bg-white/5 border border-white/5 rounded-3xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">Statistiques du Stock</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center bg-black/30 p-3 rounded-xl border border-white/5">
                      <span className="text-sm text-slate-400">Total Tarifs Enregistrés</span>
                      <span className="text-xl font-mono font-black text-amber-500">{comparisonData.reduce((acc, g) => acc + (g.supplier_prices?.length || 0), 0)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-black/30 p-3 rounded-xl border border-white/5">
                      <span className="text-sm text-slate-400 font-medium">Alertes Économies Actives</span>
                      <span className="text-xl font-mono font-black text-emerald-500">{comparisonData.filter(g => g.savings_percent > 0).length}</span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => setShowAddPriceModal(true)}
                  className="w-full mt-4 bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-xl font-bold text-sm text-slate-300 flex items-center justify-center gap-2 transition-all hover:text-white"
                >
                  <Plus className="w-4 h-4" /> Saisir un Tarif Manuellement
                </button>
              </div>
            </div>

            {/* Mercuriale Matched Preview Rows Panel (Interactive verification) */}
            {importMatches && <ImportPreviewPanel importMatches={importMatches} setImportMatches={setImportMatches} inventoryItems={inventoryItems} handleConfirmImport={handleConfirmImport} />}

            {/* General Price Comparison Table List */}
            <PriceComparisonTable priceSearch={priceSearch} setPriceSearch={setPriceSearch} filteredComparison={filteredComparison} expandedIngredientPrice={expandedIngredientPrice} setExpandedIngredientPrice={setExpandedIngredientPrice} setPendingDeletePrice={setPendingDeletePrice} />
          </motionSlim.div>
        )}
      </AnimatePresence>

      {/* Manual Price Addition Modal */}
      {showAddPriceModal && (
        <AddPriceModal newPriceData={newPriceData} setNewPriceData={setNewPriceData} setShowAddPriceModal={setShowAddPriceModal} suppliers={suppliers} inventoryItems={inventoryItems} handleAddManualPrice={handleAddManualPrice} />
      )}
    
      <ConfirmDialog
        open={!!pendingReceive}
        title={t.receiveConfirmTitle || 'Receptionner ce bon ?'}
        description={(t.receiveConfirmMsg || 'Les quantites de ce bon entrent en stock. A faire quand la marchandise est physiquement la (livraison {supplier}, {lines} lignes).)').replace('{supplier}', pendingReceive?.supplier || '?').replace('{lines}', String((pendingReceive?.items || []).length))}
        confirmLabel={t.receiveNow || 'Receptionner'}
        cancelLabel="Annuler"
        onConfirm={async () => {
          const o = pendingReceive;
          setPendingReceive(null);
          if (o) await receiveOrder(o);
        }}
        onCancel={() => setPendingReceive(null)}
      />
      <ConfirmDialog
        open={!!pendingDeletePrice}
        title="Supprimer ce tarif ?"
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        danger
        onConfirm={async () => {
          if (pendingDeletePrice) {
            await handleDeletePrice(pendingDeletePrice);
          }
          setPendingDeletePrice(null);
        }}
        onCancel={() => setPendingDeletePrice(null)}
      />
</div>
  );
}
