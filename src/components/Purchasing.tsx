import React, { useState, useEffect } from 'react';
import { ShoppingCart, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Printer, Mail, Trash2, Edit2, RotateCcw, Plus, Sparkles, Users, X, HelpCircle, PackageCheck } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AnimatePresence, LazyMotion, domAnimation } from "motion/react";
import * as motionSlim from "motion/react-m";
import { useToast, ConfirmDialog } from "./ui/Toast";

interface ForecastItem {
  inventory_id: string;
  minStock: number;
  quantity: number;
  besoin_recettes: number;
}

interface PurchaseOrder {
  id: string;
  status: string;
  supplier: string;
  date: string;
  items: { raw_name: string; raw_price: number; raw_unit: string }[];
  total_amount: number;
}

export function PurchasingTab({ t, translateIngredient, manualIds }: { t: any, translateIngredient?: (name: string, lang: string) => string, manualIds?: Set<string> }) {
  const toast = useToast();
  const [pendingDeletePrice, setPendingDeletePrice] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  // La fenetre reelle du besoin (« sur 14 jours a partir du ... »). Sans elle le
  // chiffre du besoin n'a pas d'origine et le cuisinier ne peut pas dire s'il
  // couvre le service du lendemain ou trois semaines.
  const [forecastWindow, setForecastWindow] = useState<{ from: string; horizon: number } | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [history, setHistory] = useState<Record<string, any[]>>({});
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
  interface ImportMatch {
  prix_exploitable: boolean;
  matched_inventory_id: string | null;
  [k: string]: unknown;
}

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

  const generateOrderPdf = (supplierName: string, supplierData: { supplier_id: string; supplier_name: string; email: string; phone: string }, items: { raw_name: string; raw_price: number; raw_unit: string }[]) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(34, 197, 94);
    doc.text(`RESTAURATION IO`, 14, 22);
    
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text(t.purchaseOrder || "Bon de Commande", 14, 32);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 40);
    doc.text(`Heure: ${new Date().toLocaleTimeString()}`, 14, 45);

    // Supplier Info
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`${t.attentionOf || "À l'attention de :"}`, 120, 32);
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(supplierName, 120, 38);
    if (supplierData?.email) doc.text(`${t.email || "Email"}: ${supplierData.email}`, 120, 43);
    if (supplierData?.phone) doc.text(`${t.phone || "Téléphone"}: ${supplierData.phone}`, 120, 48);

    doc.setDrawColor(220, 220, 220);
    doc.line(14, 55, 196, 55);

    let totalOrder = 0;
    const tableData = items.map((i: { raw_name: string; raw_price: number; raw_unit: string }) => {
        totalOrder += (i.total || 0);
        return [
            i.name,
            i.quantity,
            i.unit_price > 0 ? `${i.unit_price.toFixed(2)}` : '-',
            i.total > 0 ? `${i.total.toFixed(2)}` : '-'
        ];
    });

    autoTable(doc, {
        startY: 65,
        head: [[t.product || 'Produit', t.quantity || 'Quantité', t.unitPrice || 'Prix Unitaire', 'Total']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255] },
        styles: { fontSize: 10, cellPadding: 3 },
    });
    
    const finalY = (doc as any).lastAutoTable.finalY || 65;
    
    if (totalOrder > 0) {
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(`Total estimé : ${totalOrder.toFixed(2)}`, 14, finalY + 15);
    }
    
    return doc;
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
        const doc = generateOrderPdf(supplier, supplierData, items);
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
        const text = e.target?.result as string;
        const lines = text
          .split(/\r?\n/)
          .map(line => 
            line.split(/[;,]/).map(cell => cell.trim().replace(/^"(.*)"$/, '$1'))
          )
          .filter(l => l.some(cell => cell !== ''));
        
        if (lines.length < 2) {
          toast("Le fichier semble vide ou invalide !", "error");
          setIsAnalyzingImport(false);
          return;
        }

        const headerRow = lines[0] || [];
        let nameIdx = -1;
        let priceIdx = -1;
        let unitIdx = -1;

        for (let i = 0; i < headerRow.length; i++) {
          const l = headerRow[i].toLowerCase();
          if (l.includes('design') || l.includes('prod') || l.includes('article') || l.includes('nom') || l.includes('item') || l.includes('name') || l.includes('libell')) {
            nameIdx = i;
          } else if (l.includes('prix') || l.includes('price') || l.includes('tarif') || l.includes('cost') || l.includes('u.p')) {
            priceIdx = i;
          } else if (l.includes('unit') || l.includes('cond') || l.includes('pack')) {
            unitIdx = i;
          }
        }

        if (nameIdx === -1) nameIdx = 0;
        if (priceIdx === -1) priceIdx = headerRow.length > 1 ? 1 : 0;
        if (unitIdx === -1 && headerRow.length > 2) unitIdx = 2;

        const items: { raw_name: string; raw_price: number; raw_unit: string }[] = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (line.length <= Math.max(nameIdx, priceIdx)) continue;
          const raw_name = line[nameIdx];
          const raw_price = parseFloat(line[priceIdx]?.replace(',', '.'));
          const raw_unit = unitIdx !== -1 ? line[unitIdx] : 'kg';
          if (raw_name && !isNaN(raw_price)) {
            items.push({ raw_name, raw_price, raw_unit });
          }
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
            {orders.filter((o: any) => (o.status || 'PENDING').toUpperCase() === 'PENDING').length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-black">
                {orders.filter((o: any) => (o.status || 'PENDING').toUpperCase() === 'PENDING').length}
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
                                  {history[item.inventory_id].map((h: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5 hover:border-emerald-500/30 transition-all">
                                      <div className="flex flex-col">
                                        <span className="font-medium text-slate-200">{h.supplier}</span>
                                        <span className="text-[10px] text-slate-500 italic">{h.date}</span>
                                      </div>
                                      <div className="flex gap-4 items-center">
                                        <span className="text-sm font-bold text-amber-400">{h.unit_price.toFixed(2)} € / {item.unit}</span>
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
        ) : activeTab === 'receptions' ? (
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
                {orders.map((order: any) => {
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
                          {(order.items || []).map((it: any) => (
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
        ) : activeTab === 'suppliers' ? (
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
              Restauration IO — Database
            </div>
          </motionSlim.div>
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
                    Déposez une feuille de tarifs (CSV) envoyée par votre fournisseur. L'IA de Restauration IO va faire correspondre les lignes au bon ingrédient en stock.
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
            {importMatches && (
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
                      Enregistrer les prix ({importMatches.filter((m: any) => m.prix_exploitable !== false && m.matched_inventory_id).length})
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
            )}

            {/* General Price Comparison Table List */}
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
                                  {g.supplier_prices.map((p: any) => (
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
                                          Tarif d'achat brut: {p.raw_unit_price.toFixed(2)} € / {p.unit}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-4">
                                        <div className="text-right">
                                          <span className="font-mono text-sm font-black text-amber-400">{p.calculated_price_per_ref.toFixed(2)} €</span>
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
          </motionSlim.div>
        )}
      </AnimatePresence>

      {/* Manual Price Addition Modal */}
      {showAddPriceModal && (
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
