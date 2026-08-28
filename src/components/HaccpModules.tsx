import React from 'react';
import { PackageSearch, Thermometer, ScanLine, FileCheck, AlertTriangle, CheckCircle2, Droplets, CalendarClock, Printer, Expand, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MediaDisplay } from "../lib/helpers";

export const AdmissionModule = ({ t, translateIngredient }: { t: any, translateIngredient?: (name: string, lang: string) => string }) => {
  const [view, setView] = React.useState<'stocks' | 'history' | 'suppliers'>('stocks');
  const [batches, setBatches] = React.useState<any[]>([]);
  const [inventory, setInventory] = React.useState<any[]>([]);
  const [suppliers, setSuppliers] = React.useState<any[]>([]);
  const [selectedInventoryId, setSelectedInventoryId] = React.useState('');
  const [productName, setProductName] = React.useState(''); // For manual entry or AI result display
  const [lot, setLot] = React.useState('');
  const [dlc, setDlc] = React.useState('');
  const [quantity, setQuantity] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [receptionTemp, setReceptionTemp] = React.useState('');
  const [packagingOk, setPackagingOk] = React.useState(true);
  const [selectedSupplier, setSelectedSupplier] = React.useState(''); // New field
  const [sourceImageUrl, setSourceImageUrl] = React.useState<string | null>(null);
  const [isScanning, setIsScanning] = React.useState(false);
  const [enlargedImage, setEnlargedImage] = React.useState<string | null>(null);
  const [showNewProductForm, setShowNewProductForm] = React.useState(false);
  const [detectedAllergens, setDetectedAllergens] = React.useState<string[]>([]);

  const fetchData = async () => {
    try {
      const [bRes, iRes, sRes] = await Promise.all([
        fetch('/api/haccp/batches'),
        fetch('/api/inventory'),
        fetch('/api/suppliers')
      ]);
      setBatches(await bRes.json());
      setInventory(await iRes.json());
      setSuppliers(await sRes.json());
    } catch(err) { console.error(err); }
  };

  React.useEffect(() => { fetchData(); }, []);

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setIsScanning(true);
          try {
            const formData = new FormData();
            formData.append('image', e.target.files[0]);
            const res = await fetch('/api/haccp/scan', { method: 'POST', body: formData });
            const data = await res.json();
            
            if (!res.ok || data.error || data.status === 'error') {
               alert(t.error ? t.error + ": " + (data.error || data.message || "Scan failed") : "Error: Scan failed. Provide a better picture format.");
            } else {
              // Try to find matching product in inventory
              if (data.product) {
                setProductName(data.product);
                const match = inventory.find(i => i.name.toLowerCase().includes(data.product.toLowerCase()) || data.product.toLowerCase().includes(i.name.toLowerCase()));
                if (match) setSelectedInventoryId(match.id);
              } else {
                alert(t.error ? t.error + ": Could not read product" : "Error: Could not read product details.");
              }
              if (data.lot) setLot(data.lot);
              if (data.dlc) setDlc(data.dlc);
              if (data.quantity) setQuantity(data.quantity.toString());
              if (data.unit) setUnit(data.unit);
              if (data.source_image_url) setSourceImageUrl(data.source_image_url);
              if (data.allergens && Array.isArray(data.allergens)) {
                setDetectedAllergens(data.allergens);
              }
            }
          } catch (err) {
            console.error(err);
            alert(t.iaScanError || "Error during AI scan");
          } finally {
            setIsScanning(false);
          }
      }
  };

  const saveBatch = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedInventoryId && !productName) return;
      
      let finalInventoryId = selectedInventoryId;
      
      // If manual entry and no ID selected, we might need a way to create a minimal inventory entry 
      // or just warn the user. For now, we prefer linkage.
      if (!finalInventoryId && productName) {
        // Fallback: search again or alert
        const match = inventory.find(i => i.name.toLowerCase() === productName.toLowerCase());
        if (match) {
           finalInventoryId = match.id;
        } else {
           try {
             // Create it dynamically in inventory
             const newInvRes = await fetch('/api/inventory', {
               method: 'POST',
               headers: {'Content-Type': 'application/json'},
               body: JSON.stringify({
                 name: productName,
                 quantity: 0,
                 minStock: 1,
                 unit: unit || 'kg',
                 status: 'normal',
                 category: 'Sec',
                 allergens: detectedAllergens.length > 0 ? detectedAllergens : undefined
               })
             });
             const newInvData = await newInvRes.json();
             if (newInvData.id) {
               finalInventoryId = newInvData.id;
             } else {
               alert("Erreur lors de la création de l'ingrédient.");
               return;
             }
           } catch(e) {
             console.error(e);
             alert("Erreur réseau lors de la création de l'ingrédient.");
             return;
           }
        }
      }

      await fetch('/api/haccp/batches', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
          inventory_id: finalInventoryId, 
          lot_number: lot, 
          expiration_date: dlc, 
          source_image_url: sourceImageUrl,
          quantity: parseFloat(quantity) || 0,
          unit: unit || (inventory.find(i => i.id === finalInventoryId)?.unit),
          reception_temp: receptionTemp ? parseFloat(receptionTemp) : null,
          packaging_ok: packagingOk,
          supplier: selectedSupplier
        })
      });
      setSelectedInventoryId(''); setProductName(''); setLot(''); setDlc(''); setQuantity(''); setUnit(''); setReceptionTemp(''); setPackagingOk(true); setSourceImageUrl(null); setShowNewProductForm(false); setDetectedAllergens([]); setSelectedSupplier('');
      fetchData();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6">
          <h4 className="text-white font-bold mb-4 flex items-center"><PackageSearch className="w-5 h-5 mr-2 text-emerald-500" /> {t.admissionEntry || "Admission Entry"}</h4>
          <form onSubmit={saveBatch} className="space-y-3">
              <div className="flex flex-col gap-2">
                {!showNewProductForm ? (
                  <select 
                    value={selectedInventoryId} 
                    onChange={e => {
                      if (e.target.value === 'NEW_PRODUCT') {
                        setShowNewProductForm(true);
                        setSelectedInventoryId('');
                        setProductName('');
                        return;
                      }
                      setSelectedInventoryId(e.target.value);
                      const item = inventory.find(i => i.id === e.target.value);
                      if (item) {
                        setProductName(item.name);
                        setUnit(item.unit);
                      }
                    }}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="">-- {t.selectProduct || "Choisir un produit"} --</option>
                    <option value="NEW_PRODUCT">+ {t.newProduct || "Nouveau produit..."}</option>
                    {inventory.map(i => <option key={i.id} value={i.id}>{translateIngredient ? translateIngredient(i.name, t.language) : i.name}</option>)}
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input 
                      value={productName}
                      onChange={e => setProductName(e.target.value)}
                      placeholder="Nom du nouveau produit..."
                      className="w-full bg-black/40 border border-emerald-500/50 rounded-xl px-3 py-2 text-white"
                      autoFocus
                    />
                    <button type="button" onClick={() => { setShowNewProductForm(false); setProductName(''); }} className="p-2 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 hover:bg-red-500/20 transition-all" title="Annuler">
                      <X className="w-5 h-5 mx-auto" />
                    </button>
                  </div>
                )}
              </div>
              {productName && !selectedInventoryId && !showNewProductForm && (
                <p className="text-[10px] text-amber-500 font-bold uppercase flex items-center justify-between">
                  <span>{t.productDetected || "Produit détecté"} : {productName}</span>
                  <button type="button" onClick={() => setShowNewProductForm(true)} className="underline">Créer manuellement ?</button>
                </p>
              )}
              {detectedAllergens.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-[10px] text-red-500 font-bold uppercase mr-1 mt-0.5">⚠️ Allergènes :</span>
                  {detectedAllergens.map(a => (
                    <span key={a} className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 rounded font-bold uppercase tracking-widest">{a}</span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <input value={lot} onChange={e => setLot(e.target.value)} placeholder={t.lotNumberShort || "Lot No."} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white" />
                <input type="date" value={dlc} onChange={e => setDlc(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder={t.quantity || "Quantité"} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white" />
                <input value={unit} onChange={e => setUnit(e.target.value)} placeholder={t.unit || "Unité"} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3 pb-2 border-b border-white/5">
                <input type="number" step="0.1" value={receptionTemp} onChange={e => setReceptionTemp(e.target.value)} placeholder="T° T°C (Optionnel)" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white" />
                <label className="flex items-center gap-2 text-sm text-white bg-black/40 border border-white/10 rounded-xl px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={packagingOk} onChange={e => setPackagingOk(e.target.checked)} className="accent-emerald-500 w-4 h-4" />
                  {t.packagingIntact || "Emballage Intact"}
                </label>
              </div>
              <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white mt-2">
                <option value="">-- {t.selectSupplier || "Choisir un fournisseur"} --</option>
                {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <button type="submit" className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-sm tracking-widest uppercase">{t.saveShort || "Enregistrer"}</button>
              
              <input type="file" accept="image/*, application/pdf" capture="environment" onChange={handleScan} className="hidden" id="scan-input" />
              <label htmlFor="scan-input" className={`cursor-pointer block w-full py-3 rounded-xl font-bold text-sm text-center transition-all ${isScanning ? 'bg-blue-900 text-blue-400' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                {isScanning ? (t.clausAnalyzing || "Analyse par l'IA...") : (t.scanDocIA || 'Scan Document (AI)')}
              </label>
          </form>
        </div>
        <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6">
          <div className="flex gap-4 mb-4">
            <button onClick={() => setView('stocks')} className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors ${view === 'stocks' ? 'bg-emerald-600' : 'bg-white/5'}`}>{t.batchesInStock || "Lots en Stock"}</button>
            <button onClick={() => setView('history')} className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors ${view === 'history' ? 'bg-emerald-600' : 'bg-white/5'}`}>{t.history || "Historique"}</button>
            <button onClick={() => setView('suppliers')} className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors ${view === 'suppliers' ? 'bg-emerald-600' : 'bg-white/5'}`}>{t.suppliers || "Fournisseurs"}</button>
          </div>

          {view === 'stocks' && (
            <div className="space-y-3 text-sm max-h-[500px] overflow-y-auto custom-scrollbar">
              {batches.filter(b => b.quantity > 0).map(b => (
                <div key={b.id} className="flex justify-between items-center p-3 bg-black/20 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-all">
                  <div>
                    <div className="font-bold text-slate-100">{b.product_name || b.inventory_id}</div>
                    <div className="text-white/50 text-[10px] uppercase tracking-widest font-mono mt-1">Lot: <span className="text-amber-500">{b.lot_number}</span> | DLC: <span className="text-red-400">{b.expiration_date}</span></div>
                    <div className="text-emerald-500 font-black mt-1">Stock: {b.quantity} {b.unit}</div>
                  </div>
                </div>
              ))}
              {batches.filter(b => b.quantity > 0).length === 0 && <p className="text-slate-500 italic text-center py-10">{t.noBatchInStock || "Aucun lot en stock."}</p>}
            </div>
          )}

          {view === 'history' && (
            <div className="space-y-3 text-sm max-h-[500px] overflow-y-auto custom-scrollbar">
              {batches.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(b => (
                 <div key={b.id} className="p-3 bg-black/20 rounded-xl border border-white/5">
                   <div className="flex justify-between">
                     <span className="font-bold text-slate-100">{b.product_name || b.inventory_id}</span>
                     <span className="text-slate-500 text-xs">{new Date(b.created_at).toLocaleDateString()}</span>
                   </div>
                   <div className="text-white/50 text-[10px]">Lot: {b.lot_number} | Fournisseur: {b.supplier || 'N/A'}</div>
                 </div>
              ))}
            </div>
          )}

          {view === 'suppliers' && (
            <div className="space-y-3 text-sm max-h-[500px] overflow-y-auto custom-scrollbar">
              {suppliers.map(s => (
                <div key={s.id} className="p-3 bg-black/20 rounded-xl border border-white/5">
                  <div className="font-bold text-emerald-400">{s.name}</div>
                  <div className="text-white/50 text-[10px]">
                     {batches.filter(b => b.supplier === s.name).length} produits admis.
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
{sourceImageUrl && (
  <div 
    className="mt-4 p-4 bg-black/20 rounded-xl border border-white/10 flex justify-center cursor-pointer hover:bg-black/40 transition-colors relative group"
    onClick={() => setEnlargedImage(sourceImageUrl)}
  >
    <MediaDisplay src={sourceImageUrl} alt="Etiquette scannée" className="max-h-48 object-contain rounded-lg shadow-xl transition-transform group-hover:scale-[1.02]" />
    <div className="absolute top-2 right-2 bg-black/60 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md">
       <Expand size={16} />
    </div>
  </div>
)}
      {enlargedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center">
            <button 
              className="absolute -top-12 right-0 text-white hover:text-emerald-400 bg-black/50 p-2 rounded-full transition-colors"
              onClick={() => setEnlargedImage(null)}
            >
              <X size={24} />
            </button>
            <MediaDisplay 
              src={enlargedImage} 
              alt="Etiquette agrandie" 
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl ring-1 ring-white/10" 
              interactive={true}
              onClick={(e: any) => e.stopPropagation()} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const TransformationModule = ({ t }: { t: any }) => {
    const [recipes, setRecipes] = React.useState<any[]>([]);
    const [batches, setBatches] = React.useState<any[]>([]);
    const [history, setHistory] = React.useState<any[]>([]);
    const [selectedRecipe, setSelectedRecipe] = React.useState('');
    const [selectedBatches, setSelectedBatches] = React.useState<string[]>([]);

    const fetchData = async () => {
        const [rRes, bRes, hRes] = await Promise.all([
            fetch('/api/recipes'),
            fetch('/api/haccp/batches'),
            fetch('/api/haccp/production-history')
        ]);
        setRecipes(await rRes.json());
        setBatches(await bRes.json());
        setHistory(await hRes.json());
    };

    React.useEffect(() => { fetchData(); }, []);

    const recordProduction = async () => {
        await fetch('/api/haccp/production', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ recipe_id: selectedRecipe, batch_ids: selectedBatches })
        });
        setSelectedRecipe('');
        setSelectedBatches([]);
        fetchData();
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6">
                <h4 className="text-white font-bold mb-4">{t.startProduction || "Start Production"}</h4>
                <div className="flex gap-4">
                    <select value={selectedRecipe} onChange={e => setSelectedRecipe(e.target.value)} className="bg-black border border-white/10 rounded-xl px-4 py-2 text-white">
                        <option value="">{t.selectRecipe || "Select a recipe"}</option>
                        {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <button onClick={recordProduction} disabled={!selectedRecipe} className="px-6 py-2 bg-emerald-600 rounded-xl font-bold disabled:opacity-50">{t.validateProduction || "Validate Production"}</button>
                </div>
                <div className="mt-4">
                    <p className="text-sm text-slate-500 mb-2">{t.batchesUsed || "Batches used"} :</p>
                    <div className="flex flex-wrap gap-2">
                        {batches.map(b => (
                            <button key={b.id} onClick={() => setSelectedBatches(prev => prev.includes(b.id) ? prev.filter(id => id !== b.id) : [...prev, b.id])} 
                                    className={`px-3 py-1 rounded-full text-xs border ${selectedBatches.includes(b.id) ? 'bg-emerald-900 border-emerald-500' : 'bg-white/5 border-white/10'}`}>
                                {b.product_name} - {b.lot_number}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            
            <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6">
                <h4 className="text-white font-bold mb-4">{t.productionHistoryTraceability || "Production History (Traceability)"}</h4>
                <div className="space-y-3 text-sm">
                    {history.map(h => (
                        <div key={h.id} className="border-b border-white/5 pb-2">
                            <span className="font-bold text-emerald-500">{h.recipe_name}</span> - <span className="text-slate-400">{new Date(h.created_at).toLocaleDateString(t.language === 'fr' ? 'fr-FR' : t.language === 'es' ? 'es-ES' : t.language === 'de' ? 'de-DE' : t.language === 'it' ? 'it-IT' : 'en-US')}</span>
                            <div className="text-xs text-slate-500">Lots: {h.batches}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// Helper function to export HACCP logs as PDF
const exportHaccpToPdf = async (t: any) => {
    const doc = new jsPDF();
    const title = t.haccpPdfTitle || "Journal de Conformité HACCP";
    doc.setFontSize(18);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(`Généré le : ${new Date().toLocaleString()}`, 14, 22);
    
    let currentY = 30;

    // 1. TEMPERATURE LOGS
    doc.setFontSize(14);
    doc.setTextColor(16, 185, 129); // Emerald-500
    doc.text(t.controls || "Contrôles", 14, currentY);
    doc.setTextColor(0, 0, 0);
    
    const resTemp = await fetch('/api/haccp/temperatures');
    const logs = await resTemp.json();
    
    const tempTableData = logs.map((l: any) => [
        new Date(l.recorded_at).toLocaleDateString(),
        l.equipment_name,
        `${l.temperature}°C`,
        l.user
    ]);

    autoTable(doc, {
        startY: currentY + 5,
        head: [[t.date || 'Date', t.equipment || 'Equipement', 'Temp', t.user || 'Utilisateur']],
        body: tempTableData,
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    // 2. ADMISSION LOGS (BATCHES)
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    doc.setFontSize(14);
    doc.setTextColor(16, 185, 129);
    doc.text(t.admission || "Admission/Réception", 14, currentY);
    doc.setTextColor(0, 0, 0);

    const resBatches = await fetch('/api/haccp/batches');
    const batches = await resBatches.json();

    const admissionTableData = batches.map((b: any) => [
        b.created_at ? new Date(b.created_at).toLocaleDateString() : '-',
        b.product_name || b.inventory_id,
        b.lot_number,
        b.expiration_date,
        b.quantity ? `${b.quantity} ${b.unit || ''}` : '-'
    ]);

    autoTable(doc, {
        startY: currentY + 5,
        head: [[t.date || 'Date', t.productName || 'Produit', t.lotNumberShort || 'N° Lot', 'DLC', t.quantity || 'Qté']],
        body: admissionTableData,
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    // 2.1 SCANNED LABELS IMAGES (Evidence)
    const batchesWithImages = batches.filter((b: any) => b.source_image_url);
    if (batchesWithImages.length > 0) {
        if (currentY > 200) { doc.addPage(); currentY = 20; }
        doc.setFontSize(14);
        doc.setTextColor(16, 185, 129);
        doc.text("Preuves d'étiquettes scannées (Images)", 14, currentY);
        currentY += 10;

        for (const batch of batchesWithImages) {
            if (currentY > 230) { doc.addPage(); currentY = 20; }
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text(`${batch.product_name} - Lot: ${batch.lot_number} - DLC: ${batch.expiration_date}`, 14, currentY);
            currentY += 5;
            
            try {
                // Since these are local or base64 or blob URLs, we try to add them
                // Note: jsPDF addImage might need the format, and dealing with relative paths can be tricky in some environments
                // But let's try to add a placeholder or a link if we can't fetch the image easily in this context
                doc.setTextColor(0, 0, 255);
                doc.text(`[Image disponible dans le logiciel: ${batch.lot_number}]`, 14, currentY);
                doc.setTextColor(0, 0, 0);
            } catch (e) {
                console.warn("Could not add image to PDF", e);
            }
            currentY += 10;
        }
    }

    // 3. CLEANING LOGS
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    doc.setFontSize(14);
    doc.setTextColor(16, 185, 129);
    doc.text(t.cleaningPlan || "Plan de Nettoyage", 14, currentY);
    doc.setTextColor(0, 0, 0);

    const resCleaning = await fetch('/api/haccp/cleaning');
    const cleaning = await resCleaning.json();

    const cleaningTableData = cleaning.map((c: any) => [
        new Date(c.completed_at).toLocaleDateString(),
        new Date(c.completed_at).toLocaleTimeString(),
        c.zone_name,
        'OK'
    ]);

    autoTable(doc, {
        startY: currentY + 5,
        head: [[t.date || 'Date', 'Heure', t.zone || 'Zone', 'Etat']],
        body: cleaningTableData,
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] }
    });
    
    doc.save('Journal_Complet_HACCP.pdf');
};

export const LabelingModule = ({ t }: { t: any }) => {
    const [product, setProduct] = React.useState('');
    const [dlc, setDlc] = React.useState('');

    const generateLabel = () => {
        // Standard thermal label size (e.g., 62mmx100mm)
        const doc = new jsPDF({ format: [62, 100] });
        
        // Background white, black border
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, 62, 100, 'F');
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(1);
        doc.rect(0, 0, 62, 100, 'S');

        // Black text
        doc.setTextColor(0, 0, 0);
        
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(`${t.labelUpper || "ÉTIQUETTE"}`, 31, 12, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${t.productUpper || "PRODUIT"} :`, 5, 25);
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        const splitProduct = doc.splitTextToSize(product.toUpperCase(), 52);
        doc.text(splitProduct, 5, 32);
        
        let currentY = 32 + (splitProduct.length * 6) + 5;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${t.productionDate || "DATE DE FAB."} :`, 5, currentY);
        
        currentY += 6;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        const fabDate = new Date().toLocaleDateString(t.language === 'fr' ? 'fr-FR' : t.language === 'es' ? 'es-ES' : t.language === 'de' ? 'de-DE' : t.language === 'it' ? 'it-IT' : 'en-US');
        doc.text(fabDate, 5, currentY);
        
        currentY += 12;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`DLC :`, 5, currentY);
        
        currentY += 6;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        let dlcStr = "----/--/--";
        if (dlc) {
            dlcStr = new Date(dlc).toLocaleDateString(t.language === 'fr' ? 'fr-FR' : t.language === 'es' ? 'es-ES' : t.language === 'de' ? 'de-DE' : t.language === 'it' ? 'it-IT' : 'en-US');
        }
        doc.text(dlcStr, 5, currentY);
        
        doc.save(`${product}_label.pdf`);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6">
                <h4 className="text-white font-bold mb-4 flex items-center">
                    <Printer className="w-5 h-5 mr-2 text-emerald-500" /> {t.dlcLabelGenerator || "DLC Label Generator"}
                </h4>
                <div className="space-y-4">
                    <input value={product} onChange={e => setProduct(e.target.value)} placeholder={t.productNamePlaceholder || "Product name"} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white" />
                    <input type="date" value={dlc} onChange={e => setDlc(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white" />
                    <button onClick={generateLabel} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold">{t.generateLabelPdf}</button>
                </div>
            </div>
        </div>
    );
};

export const EvidenceModule = ({ t }: { t: any }) => {
    const [docs, setDocs] = React.useState<any[]>([]);
    const [isUploading, setIsUploading] = React.useState(false);
    const [docType, setDocType] = React.useState('HACCP_ENTRETIEN');
    const [docName, setDocName] = React.useState('');
    const [enlargedImage, setEnlargedImage] = React.useState<string | null>(null);

    const categories = [
      { id: 'HACCP_ENTRETIEN', label: t.haccpEntretien || "Fiches d'entretien" },
      { id: 'HACCP_DERATISATION', label: t.haccpDeratisation || "Dératisation & Nuisibles" },
      { id: 'HACCP_FORMATION', label: t.haccpFormation || "Attestations de Formation" },
      { id: 'HACCP_ANALYSES', label: t.haccpAnalyses || "Analyses Microbiologiques" },
      { id: 'HACCP_AUTRE', label: t.haccpAutre || "Autres preuves" }
    ];

    const fetchDocs = async () => {
        try {
            const res = await fetch('/api/haccp/documents');
            setDocs(await res.json());
        } catch(err) { console.error(err); }
    };

    React.useEffect(() => { fetchDocs(); }, []);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        if (docName) {
           await fetch('/api/haccp/documents', {
             method: 'POST',
             headers: {'Content-Type': 'application/json'},
             body: JSON.stringify({ type: docType, name: docName })
           });
           setDocName('');
           fetchDocs();
        }
        return;
      }
  
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', docType);
      formData.append('name', docName || file.name);
  
      try {
        await fetch('/api/haccp/documents/upload', {
          method: 'POST',
          body: formData,
        });
        setDocName('');
        fetchDocs();
      } catch (err) {
        console.error(err);
      } finally {
        setIsUploading(false);
      }
    };

    const deleteDoc = async (id: string) => {
      if (!confirm(t.confirmDelete || "Supprimer ?")) return;
      await fetch(`/api/haccp/documents/${id}`, { method: 'DELETE' });
      fetchDocs();
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center bg-[#1A1A1A] p-4 rounded-xl border border-white/10">
              <h4 className="text-white font-bold flex items-center">
                 <FileCheck className="w-5 h-5 mr-2 text-emerald-500" />
                 {t.pmsDocuments || "Documents PMS & Preuves"}
              </h4>
              <button onClick={() => exportHaccpToPdf(t)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-bold text-sm transition-colors">
                {t.exportJournalPdf || "Exporter Journal HACCP (PDF)"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6">
                    <h4 className="text-white font-bold mb-4">{t.addDocument}</h4>
                    <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{t.category}</label>
                          <select value={docType} onChange={e => setDocType(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500/50">
                             {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{t.docNameOptional}</label>
                          <input type="text" value={docName} onChange={e => setDocName(e.target.value)} placeholder={t.docNameEx} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500/50" />
                        </div>
                        
                        <label className={`block w-full py-8 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all ${isUploading ? 'opacity-50' : 'hover:border-emerald-500/50 hover:bg-white/5'}`}>
                            <span className="text-sm font-bold text-slate-300">
                               {isUploading ? t.uploading || "Envoi en cours..." : t.uploadPhotoFile}
                            </span>
                            <span className="text-xs text-slate-500 mt-1">{t.leaveEmptyToValidate}</span>
                            <input type="file" className="hidden" onChange={handleUpload} accept="image/*,application/pdf" capture="environment" disabled={isUploading} />
                        </label>

                        <button onClick={() => handleUpload({ target: { files: null } } as any)} className="w-full py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-all border border-white/10">
                           {t.validateManualEntry}
                        </button>
                    </div>
                </div>
                
                <div className="md:col-span-2 bg-[#1A1A1A] border border-white/10 rounded-2xl p-6">
                    <h4 className="text-white font-bold mb-4">{t.documentArchive}</h4>
                    <div className="space-y-6 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                       {categories.map(cat => {
                           const catDocs = docs.filter(d => d.type === cat.id);
                           if (catDocs.length === 0) return null;
                           return (
                             <div key={cat.id}>
                               <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 border-b border-white/5 pb-2">{cat.label}</h5>
                               <div className="space-y-2">
                                 {catDocs.map(d => (
                                    <div key={d.id} className="flex justify-between items-center p-3 bg-black/20 rounded-xl border border-white/5 hover:bg-white/5 transition-colors">
                                       <div className="flex-1">
                                          <div className="font-bold text-white text-sm">{d.name}</div>
                                          <div className="text-[10px] text-slate-500 mt-1">{new Date(d.date).toLocaleString()}</div>
                                       </div>
                                       <div className="flex items-center gap-2">
                                          {d.file_url ? (
                                             <button onClick={() => setEnlargedImage(d.file_url)} className="p-2 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors text-xs font-bold uppercase tracking-widest">{t.view || "Voir"}</button>
                                          ) : (
                                             <span className="px-2 py-1 text-[10px] bg-slate-800 text-slate-400 rounded">{t.manual || "Manuel"}</span>
                                          )}
                                          <button onClick={() => deleteDoc(d.id)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                                       </div>
                                    </div>
                                 ))}
                               </div>
                             </div>
                           );
                       })}
                       {docs.length === 0 && <p className="text-slate-500 text-center py-8">{t.noDocumentRegistered}</p>}
                    </div>
                </div>
            </div>

            {enlargedImage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={() => setEnlargedImage(null)}>
                  <div className="relative max-w-[90vw] max-h-[90vh]">
                     <MediaDisplay src={enlargedImage} alt="Document" className="w-[85vw] h-[85vh] max-w-full max-h-[85vh] object-contain rounded-xl" interactive={true} onClick={(e: any) => e.stopPropagation()} />
                     <button className="absolute -top-12 right-0 text-white p-2 rounded-full bg-black/50" onClick={() => setEnlargedImage(null)}><X size={24} /></button>
                  </div>
                </div>
            )}
        </div>
    );
};
