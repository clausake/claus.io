import React, { useState, useEffect } from "react";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Expand,
  FileText,
  Folder,
  Plus,
  Receipt,
  Trash2,
  X,
} from "lucide-react";
import { LazyMotion, domAnimation } from "motion/react";
import * as motionSlim from "motion/react-m";
import { DocumentUpload } from "../components/DocumentUpload";
import { MediaDisplay, translateIngredientHelper } from "../lib/helpers";
import { useToast } from "./ui/Toast";

export function DocumentManager({ t }: { t: any }) {
  const toast = useToast();
  const [documents, setDocuments] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [archiveTab, setArchiveTab] = useState<
    "pending" | "suppliers" | "drafts"
  >("pending");
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);

  // Missing states for quick add
  const [showProductQuickAdd, setShowProductQuickAdd] = useState(false);
  const [activeFormIndex, setActiveFormIndex] = useState<number | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [quickProduct, setQuickProduct] = useState({
    name: "",
    unit: "kg",
    category: "Protéines",
    minStock: 2 as number | string,
    unit_price: 0 as number | string,
  });

  const [formData, setFormData] = useState({
    id: null as string | null,
    type: "FACTURE",
    supplier: "",
    date: new Date().toISOString().split("T")[0],
    total_amount: 0 as number | string,
    source_image_url: "" as string | null,
    items: [] as {
      inventory_id: string;
      original_name?: string;
      quantity: number | string;
      unit_price: number | string;
      lot_number?: string;
      dlc?: string;
    }[],
  });

  useEffect(() => {
    fetchDocuments();
    fetchInventory();
    fetchSuppliersList();
  }, []);

  const fetchSuppliersList = async () => {
    try {
      const res = await fetch("/api/suppliers");
      if (res.ok) {
        const data = await res.json();
        setSuppliersList(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(Array.isArray(data) ? data : []);
      } else {
        setDocuments([]);
      }
    } catch (e) {
      console.error(e);
      setDocuments([]);
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await fetch("/api/inventory");
      if (res.ok) {
        const data = await res.json();
        setInventory(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          inventory_id: "",
          original_name: "",
          quantity: "",
          unit_price: "",
          lot_number: "",
          dlc: "",
        },
      ],
    });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...quickProduct,
        minStock: parseInt(quickProduct.minStock as string) || 0,
        unit_price: parseFloat(quickProduct.unit_price as string) || 0,
      };
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const result = await res.json();
        // Correcting: we need to retrieve the latest inventory to update the list
        const invRes = await fetch("/api/inventory");
        const newInventory = await invRes.json();
        setInventory(newInventory);

        // Associate this new item to the current line in formData
        if (activeFormIndex !== null) {
          const newItems = [...formData.items];
          newItems[activeFormIndex] = {
            ...newItems[activeFormIndex],
            inventory_id: result.id,
          };
          setFormData({ ...formData, items: newItems });
        }

        setQuickProduct({
          name: "",
          unit: "kg",
          category: "Protéines",
          minStock: 2,
          unit_price: 0,
        });
        setShowProductQuickAdd(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveItem = (index: number) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // LES CHAMPS PARTENT BRUTS, sans parse cote client. L'ancien code
      // faisait `parseFloat((item.quantity || "").toString().replace(",",
      // ".",) || 0`: le `|| 0` ecrasoit TROIS etats distincts en un seul
      // nombre — le champ NON REMPLI (`""`, la valeur initiale de
      // handleAddItem), le texte illegible, et un vrai 0 saisi a dessein. Un
      // bouton « Ajouter une ligne » sans rien saisir fabriquait donc une
      // ligne de 0 unite et de 0 €, que le serveur acceptait (200) et que la
      // VALIDATION transformait en mouvement de stock. Le serveur juge
      // desorais les DEUX ecritures decimales (`2,5` comme `2.5`,
      // src/shared/document-items.ts): le parse n'est plus l'affaire de l'UI,
      // et ce qui est vide doit ARRIVER vide pour que le refus soit NOMME.
      const payload = {
        ...formData,
        total_amount: formData.total_amount,
        items: formData.items.map((item) => ({
          ...item,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      };

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // ⚠ Le `if (res.ok)` SANS branche d'echec etait un defaut d'usage,
      // le meme que handleValidate avant son correctif: sur un 400, le
      // cuisinier cliquait sur « Enregistrer », RIEN ne bougeait a l'ecran,
      // et il ressaisissait un document QUI N'ETAIT JAMAIS NE. Un refus qui
      // ne se dit pas est une saisie perdue.
      if (!res.ok) {
        const corps = await res.json().catch(() => null as any);
        const rejetees: any[] = Array.isArray(corps?.rejetees) ? corps.rejetees : [];
        const detail = rejetees
          .map((r) => `ligne ${(r?.index ?? 0) + 1} (${r?.nom || "?"}) : ${r?.raison || "?"}`)
          .join(" · ");
        toast(
          `${corps?.message || t.saveFailed || "Enregistrement impossible"}${
            detail ? ` — ${detail}` : ""
          }`,
          "error",
        );
        return;
      }
      const corps = await res.json().catch(() => null as any);
      // Une facture PARTIELLEMENT acceptee est un papier que le chef croit
      // entier: la ligne ecartee doit se voir, pas rester dans le corps de
      // reponse (la lecon des prix_non_exploitables collectes et jamais lus).
      if (Array.isArray(corps?.rejetees) && corps.rejetees.length > 0) {
        const detail = corps.rejetees
          .map((r: any) => `ligne ${(r?.index ?? 0) + 1} (${r?.nom || "?"}) : ${r?.raison}`)
          .join(" · ");
        toast(
          `${t.partialDocument || "Document enregistre, mais "} ${corps.rejetees.length} ${
            t.rejectedLines || "ligne(s) ecartee(s)"
          } : ${detail}`,
          "info",
        );
      }
      setShowForm(false);
      setFormData({
        id: null,
        type: "FACTURE",
        supplier: "",
        date: new Date().toISOString().split("T")[0],
        total_amount: 0,
        source_image_url: null,
        items: [],
      });
      fetchDocuments();
    } catch (e) {
      console.error(e);
    }
  };

  const handleValidate = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}/validate`, {
        method: "POST",
      });
      if (res.ok) {
        fetchDocuments();
        return;
      }
      // ⚠ Le `if (res.ok)` SANS branche d'echec etait un defaut d'usage : un
      // refus (deja valide, bon de commande non validationable) ne faisait
      // RIEN a l'ecran. Le cuisinier cliquait, rien ne bougeait, et il
      // recliquait. Une route qui refuse doit SE DIRE : le message du serveur
      // est le seul qui explique POURQUOI le stock n'a pas bouge.
      const body = await res.json().catch(() => null as any);
      toast(
        body?.message || (t.validateFailed || "Validation impossible"),
        body?.already_validated ? "info" : "error",
      );
    } catch (e) {
      console.error(e);
      toast(t.validateFailed || "Validation impossible", "error");
    }
  };

  const handleExtractFromDraft = async (id: string) => {
    try {
      setExtractingId(id);
      const res = await fetch(`/api/documents/${id}/extract`, {
        method: "POST",
      });
      if (res.ok) {
        const result = await res.json();
        if (result && result.data) {
          const matchedItems = (result.data.items || []).map((item: any) => {
            const itemName = item.item || item.description || "";
            const found = inventory.find(
              (inv) =>
                inv.name.toLowerCase().includes(itemName.toLowerCase()) ||
                itemName.toLowerCase().includes(inv.name.toLowerCase()),
            );
            return {
              original_name: itemName,
              inventory_id: found ? found.id : "",
              quantity: item.quantity || 0,
              unit_price: item.unit_price || 0,
              lot_number: item.lot || "",
              dlc: item.dlc || "",
            };
          });

          setFormData({
            id: id,
            type:
              result.data.type === "AVOIR"
                ? "AVOIR"
                : result.data.type === "BL"
                  ? "BON_LIVRAISON"
                  : "FACTURE",
            supplier: result.data.supplier || "",
            date: result.data.date || new Date().toISOString().split("T")[0],
            total_amount: result.data.total_amount || 0,
            source_image_url: result.source_image_url || "",
            items: matchedItems,
          });
          setShowForm(true);
        }
      } else {
        toast("Erreur lors de l'extraction IA", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Erreur de connexion.", "error");
    } finally {
      setExtractingId(null);
    }
  };

  // Group documents by month and day
  const groupedDocuments = documents
    .filter((doc) => doc.status !== "DRAFT")
    .reduce((acc: any, doc: any) => {
      const date = new Date(doc.date);
      const month = date.toLocaleString(
        t.language === "fr"
          ? "fr-FR"
          : t.language === "es"
            ? "es-ES"
            : t.language === "de"
              ? "de-DE"
              : t.language === "it"
                ? "it-IT"
                : "en-US",
        { month: "long", year: "numeric" },
      );
      const day = date.toLocaleDateString(
        t.language === "fr"
          ? "fr-FR"
          : t.language === "es"
            ? "es-ES"
            : t.language === "de"
              ? "de-DE"
              : t.language === "it"
                ? "it-IT"
                : "en-US",
        { day: "numeric", month: "long" },
      );

      if (!acc[month]) acc[month] = {};
      if (!acc[month][day]) acc[month][day] = [];
      acc[month][day].push(doc);
      return acc;
    }, {});

  const validatedDocs = documents.filter((doc) => doc.status === "VALIDATED");
  const docsBySupplier = validatedDocs.reduce((acc: any, doc: any) => {
    const sup = doc.supplier || "Inconnu";
    if (!acc[sup]) acc[sup] = [];
    acc[sup].push(doc);
    return acc;
  }, {});

  return (
    <div className="led-glow-container h-full flex flex-col animate-in fade-in duration-150 overflow-hidden">
      <div className="p-6 border-b border-white/10 bg-[#0A0A0A] flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center">
            <Receipt className="w-6 h-6 mr-3 text-emerald-500" />
            {t.documents}
          </h2>
          <p className="text-slate-500 mt-1">{t.docManagerSubtitle}</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => {
              if (showForm) {
                setShowForm(false);
                setFormData({
                  id: null,
                  type: "FACTURE",
                  supplier: "",
                  date: new Date().toISOString().split("T")[0],
                  total_amount: 0,
                  source_image_url: null,
                  items: [],
                });
              } else {
                setShowForm(true);
              }
            }}
            className={`px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all flex items-center shadow-lg ${
              showForm
                ? "bg-white/10 text-white border border-white/20"
                : "bg-emerald-600 text-white hover:bg-emerald-500 led-glow-emerald border border-emerald-400/30"
            }`}
          >
            {showForm ? (
              <X className="w-4 h-4 mr-2" />
            ) : (
              <Plus className="w-4 h-4 mr-2 led-icon-glow" />
            )}
            {showForm ? t.cancel : t.manualEntry}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {!showForm && (
          <div className="flex space-x-4 mb-6">
            <button
              onClick={() => setArchiveTab("pending")}
              className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors ${archiveTab === "pending" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-slate-400 border border-transparent hover:bg-white/10"}`}
            >
              {t.chronologicalHistory}
            </button>
            <button
              onClick={() => setArchiveTab("drafts")}
              className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors ${archiveTab === "drafts" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-slate-400 border border-transparent hover:bg-white/10"}`}
            >
              BROUILLONS (A TRAITER)
            </button>
            <button
              onClick={() => setArchiveTab("suppliers")}
              className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors ${archiveTab === "suppliers" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-slate-400 border border-transparent hover:bg-white/10"}`}
            >
              {t.supplierBinder}
            </button>
          </div>
        )}
        <div className="mb-6">
          <DocumentUpload
            t={t}
            onUploadComplete={(result?: any) => {
              if (result && result.type === "draft") {
                fetchDocuments();
                setArchiveTab("drafts");
              } else if (result && result.data) {
                const matchedItems = (result.data.items || []).map(
                  (item: any) => {
                    const itemName = item.item || item.description || "";
                    // Recherche dans l'inventaire
                    const found = inventory.find(
                      (inv) =>
                        inv.name
                          .toLowerCase()
                          .includes(itemName.toLowerCase()) ||
                        itemName.toLowerCase().includes(inv.name.toLowerCase()),
                    );
                    return {
                      original_name: itemName,
                      inventory_id: found ? found.id : "",
                      quantity: item.quantity || 0,
                      unit_price: item.unit_price || 0,
                      lot_number: item.lot || "",
                      dlc: item.dlc || "",
                    };
                  },
                );

                setFormData({
                  type:
                    result.data.type === "AVOIR"
                      ? "AVOIR"
                      : result.data.type === "BL"
                        ? "BON_LIVRAISON"
                        : "FACTURE",
                  supplier: result.data.supplier || "",
                  date:
                    result.data.date || new Date().toISOString().split("T")[0],
                  total_amount: result.data.total_amount || 0,
                  source_image_url: result.source_image_url || "",
                  items: matchedItems,
                });
                setShowForm(true);
              } else {
                fetchDocuments();
              }
            }}
          />
        </div>
        {showForm ? (
          <div className="flex flex-col lg:flex-row gap-6 animate-in slide-in-from-top-4 duration-300">
            {formData.source_image_url && (
              <div className="w-full lg:w-1/2 flex flex-col">
                <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 flex flex-col h-full">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-white uppercase tracking-tight">
                      {t.sourceLabel || "Source"}
                    </h2>
                    <button
                      type="button"
                      onClick={() =>
                        setEnlargedImage(formData.source_image_url)
                      }
                      className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-400 hover:text-white transition-all text-xs font-black uppercase tracking-widest"
                    >
                      <Expand size={14} className="text-emerald-500" />
                      Plein Écran
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto rounded-xl border border-white/10 bg-black/40 min-h-[400px] max-h-[80vh] flex justify-center">
                    <MediaDisplay
                      src={formData.source_image_url}
                      alt={t.docScanned}
                      className="object-contain w-full"
                      interactive={true}
                    />
                  </div>
                </div>
              </div>
            )}
            <form
              onSubmit={handleSubmit}
              className={`bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 space-y-6 ${formData.source_image_url ? "w-full lg:w-1/2" : "w-full"}`}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white uppercase tracking-tight">
                  {t.documentDetails || "Détails du Document"}
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    {t.docType}
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
                  >
                    <option value="FACTURE">{t.facture}</option>
                    <option value="BON_LIVRAISON">{t.deliveryNote}</option>
                    <option value="AVOIR">{t.creditNote}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    {t.supplier}
                  </label>
                  <input
                    type="text"
                    required
                    list="suppliers-list"
                    value={formData.supplier}
                    onChange={(e) =>
                      setFormData({ ...formData, supplier: e.target.value })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
                    placeholder={t.exTerreAzur || "Ex: TerreAzur"}
                  />
                  <datalist id="suppliers-list">
                    {suppliersList.map((sup, idx) => (
                      <option key={idx} value={sup.name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    {t.date}
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    {t.totalShort || "Total"}{" "}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={
                      formData.total_amount === 0 ? "" : formData.total_amount
                    }
                    onChange={(e) =>
                      setFormData({ ...formData, total_amount: e.target.value })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>

              <div className="border-t border-white/10 pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-white">
                    {t.receivedArticles}
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-emerald-500 hover:text-emerald-400 text-sm font-medium flex items-center"
                  >
                    <Plus className="w-4 h-4 mr-1" /> {t.addLine}
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.items.map((item, index) => (
                    <div
                      key={index}
                      className="flex flex-col gap-3 bg-black p-4 rounded-xl border border-white/5"
                    >
                      <div className="w-full">
                        <input
                          type="text"
                          placeholder={
                            t.docDesignationEx ||
                            "Désignation sur document (ex: Tomates Grappe)"
                          }
                          value={item.original_name || ""}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              "original_name",
                              e.target.value,
                            )
                          }
                          className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>

                      <div className="flex flex-wrap sm:flex-nowrap gap-3 items-center">
                        <div className="flex-1 min-w-[200px] flex gap-2">
                          <select
                            required
                            value={item.inventory_id}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "inventory_id",
                                e.target.value,
                              )
                            }
                            className={`flex-1 bg-[#1A1A1A] border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50 ${!item.inventory_id && item.original_name ? "border-amber-500/50 text-amber-500" : "border-white/10 text-white"}`}
                          >
                            <option value="">
                              {item.original_name
                                ? `${t.associateWarning} ${item.original_name}`
                                : t.selectStockItem}
                            </option>
                            {inventory.map((inv) => (
                              <option key={inv.id} value={inv.id}>
                                {translateIngredientHelper(
                                  inv.name,
                                  t.language,
                                )}{" "}
                                ({inv.unit})
                              </option>
                            ))}
                          </select>
                          {!item.inventory_id && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveFormIndex(index);
                                setQuickProduct({
                                  name: item.original_name || "",
                                  unit: "kg",
                                  category: "Protéines",
                                  minStock: 2,
                                  unit_price: item.unit_price || 0,
                                });
                                setShowProductQuickAdd(true);
                              }}
                              className="px-3 shrink-0 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-lg transition-colors"
                              title={
                                t.addToStockTitle ||
                                "Ajouter ce produit au stock"
                              }
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <div className="w-24 shrink-0">
                          <input
                            type="text"
                            inputMode="decimal"
                            required
                            placeholder={t.quantityShort || "Qté"}
                            value={item.quantity === 0 ? "" : item.quantity}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "quantity",
                                e.target.value,
                              )
                            }
                            className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                        <div className="w-28 shrink-0 relative">
                          <input
                            type="text"
                            inputMode="decimal"
                            required
                            placeholder={t.unitPriceShort || "PU"}
                            value={item.unit_price === 0 ? "" : item.unit_price}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "unit_price",
                                e.target.value,
                              )
                            }
                            className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg pl-3 pr-6 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="p-2 shrink-0 text-slate-500 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {formData.items.length === 0 && (
                    <p className="text-slate-500 text-sm text-center py-4">
                      {t.noAlertsActive}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-medium transition-colors shadow-lg led-glow-emerald"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-12">
            {archiveTab === "pending" &&
              (Object.keys(groupedDocuments).length === 0 ? (
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
                                  (doc: any) => (
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
                                            {doc.items?.map((item: any) => (
                                              <tr
                                                key={item.id}
                                                className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                                              >
                                                <td className="px-4 py-3 font-medium text-white">
                                                  {translateIngredientHelper(
                                                    item.inventory_name,
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
                                                    item.quantity *
                                                    item.unit_price
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
              ))}
            {archiveTab === "suppliers" &&
              (Object.keys(docsBySupplier).length === 0 ? (
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
                            {docsBySupplier[sup].map((doc: any) => (
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
                                      {new Date(doc.date).toLocaleDateString()}
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
              ))}

            {archiveTab === "drafts" &&
              (documents.filter((d) => d.status === "DRAFT").length === 0 ? (
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
              ))}
          </div>
        )}
      </div>

      {enlargedImage && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative w-[90vw] h-[90vh] flex items-center justify-center">
            <button
              className="absolute -top-12 right-0 text-white hover:text-emerald-400 bg-black/50 p-2 rounded-full transition-colors z-[210]"
              onClick={() => setEnlargedImage(null)}
            >
              <X size={24} />
            </button>
            <MediaDisplay
              src={enlargedImage}
              alt={t.enlargedDocAlt || "Document agrandi"}
              className="w-full h-full object-contain rounded-xl shadow-2xl ring-1 ring-white/10"
              interactive={true}
              onClick={(e: any) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {showProductQuickAdd && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <motionSlim.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-panel w-full max-w-lg p-8 space-y-6"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white tracking-tight">
                {t.addToStockModalTitle || "Ajouter au Stock"}
              </h3>
              <button
                onClick={() => setShowProductQuickAdd(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleQuickAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                  {t.designationLabel || "Désignation"}
                </label>
                <input
                  type="text"
                  required
                  value={quickProduct.name}
                  onChange={(e) =>
                    setQuickProduct({ ...quickProduct, name: e.target.value })
                  }
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                    {t.unitModalLabel || "Unité"}
                  </label>
                  <select
                    value={quickProduct.unit}
                    onChange={(e) =>
                      setQuickProduct({ ...quickProduct, unit: e.target.value })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="kg">kg</option>
                    <option value="L">L</option>
                    <option value="pièces">{t.piecesLabel || "pièces"}</option>
                    <option value="unités">{t.unitsLabel || "unités"}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                    {t.categoryModalLabel || "Catégorie"}
                  </label>
                  <select
                    value={quickProduct.category}
                    onChange={(e) =>
                      setQuickProduct({
                        ...quickProduct,
                        category: e.target.value,
                      })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="Protéines">
                      {t.catMeat || "Protéines"}
                    </option>
                    <option value="Sec">{t.catDry || "Sec"}</option>
                    <option value="Légumes">{t.catVeg || "Légumes"}</option>
                    <option value="Fruits">{t.catFruit || "Fruits"}</option>
                    <option value="Crémerie">{t.catDairy || "Crémerie"}</option>
                    <option value="Pâtisserie">
                      {t.catPastry || "Pâtisserie"}
                    </option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                    {t.estimatedPULabel || "Prix Unitaire Estimé"}{" "}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={
                      quickProduct.unit_price === 0
                        ? ""
                        : quickProduct.unit_price
                    }
                    onChange={(e) =>
                      setQuickProduct({
                        ...quickProduct,
                        unit_price: e.target.value,
                      })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                    {t.minStockModalLabel || "Stock Minimum"}
                  </label>
                  <input
                    type="number"
                    value={
                      quickProduct.minStock === 0 ? "" : quickProduct.minStock
                    }
                    onChange={(e) =>
                      setQuickProduct({
                        ...quickProduct,
                        minStock: e.target.value,
                      })
                    }
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold uppercase tracking-widest transition-all led-glow-emerald"
              >
                Confirmer l'ajout
              </button>
            </form>
          </motionSlim.div>
        </div>
      )}
    </div>
  );
}
