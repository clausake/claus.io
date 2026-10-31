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
// T3.2 : interfaces et quatre vues "dumb" extraites (extraction pure, byte-exact)
// dans ./documentmanager/ pour tenir la règle « aucun fichier source > 800 lignes ».
import { useToast } from "./ui/Toast";
import type { Document, Item, Supplier, InitialState, DocumentManagerProps } from "./documentmanager/types";
import { ChronologicalView } from "./documentmanager/ChronologicalView";
import { SupplierBinderView } from "./documentmanager/SupplierBinderView";
import { DraftsView } from "./documentmanager/DraftsView";
import { QuickAddModal } from "./documentmanager/QuickAddModal";
import { Lightbox } from "./documentmanager/Lightbox";


export function DocumentManager({ t }: DocumentManagerProps) {
  const toast = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [inventory, setInventory] = useState<string[]>([]);
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
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

  const handleItemChange = (index: number, field: string, value: string | number) => {
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
        const rejetees: {index?: number; nom?: string; raison?: string}[] = Array.isArray(corps?.rejetees) ? corps.rejetees : [];
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
          .map((r: {index?: number; nom?: string; raison?: string}) => `ligne ${(r.index ?? 0) + 1} (${r.nom || "?"}) : ${r.raison}`)
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
          const matchedItems = (result.data.items || []).map((item: {item?: string; description?: string; quantity?: number; unit_price?: number; lot?: string; dlc?: string}) => {
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
    .reduce<Record<string, Record<string, Document[]>>>((acc, doc) => {
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
  const docsBySupplier = validatedDocs.reduce<Record<string, Document[]>>((acc, doc) => {
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
            onUploadComplete={(result?: import("./DocumentUpload").UploadResult) => {
              if (result && result.type === "draft") {
                fetchDocuments();
                setArchiveTab("drafts");
              } else if (result && result.data) {
                const matchedItems = (result.data.items || []).map(
                  (item: {item?: string; description?: string; quantity?: number; unit_price?: number; lot?: string; dlc?: string}) => {
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
            {archiveTab === "pending" && <ChronologicalView groupedDocuments={groupedDocuments} handleValidate={handleValidate} setEnlargedImage={setEnlargedImage} t={t} />}
            {archiveTab === "suppliers" && <SupplierBinderView docsBySupplier={docsBySupplier} expandedSupplier={expandedSupplier} setExpandedSupplier={setExpandedSupplier} setEnlargedImage={setEnlargedImage} t={t} />}

            {archiveTab === "drafts" && <DraftsView documents={documents} handleExtractFromDraft={handleExtractFromDraft} extractingId={extractingId} setEnlargedImage={setEnlargedImage} t={t} />}
          </div>
        )}
      </div>

      <Lightbox enlargedImage={enlargedImage} setEnlargedImage={setEnlargedImage} t={t} />

      {showProductQuickAdd && <QuickAddModal quickProduct={quickProduct} setQuickProduct={setQuickProduct} setShowProductQuickAdd={setShowProductQuickAdd} handleQuickAdd={handleQuickAdd} t={t} />}
    </div>
  );
}
