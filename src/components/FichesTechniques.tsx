import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Download,
  FolderOpen,
  Maximize2,
  Menu as MenuIcon,
  Minimize2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, LazyMotion, domAnimation } from "motion/react";
import * as motionSlim from "motion/react-m";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { MediaDisplay, getCostModifier, getIngredientEffectivePrice, getSupplierForIngredient } from "../lib/helpers";
import { useToast, ConfirmDialog } from "./ui/Toast";
import { appartientDossier, exportSingleRecipeToPDF as exportPDF } from "../lib/fiches";
import { RecipeModal } from "./RecipeModal";

// Une ligne du panier de production : soit l'entete d'une recette (isRecipeHeader),
// soit un ingredient a acheter. Les champs prix/fournisseur ne sont presents
// que pour les lignes ingredient.
interface CartItem {
  id: string;
  item?: string;
  inventory_id?: string | null;
  quantity?: number;
  quantity_per_person?: number;
  guests?: number;
  unit?: string;
  supplier?: string;
  price?: number;
  total?: number;
  sourceRecipeId?: string;
  recipeName?: string;
  isRecipeHeader?: boolean;
  [k: string]: unknown;
}

// La fiche technique telle que stockee en base et editee dans le formulaire.
// Les champs sont optionnels : les fiches viennent d'OCR (scan), du chat
// culinaire, ou de saisie manuelle — les formes varient.
interface RecipeIngredient {
  id?: string;
  inventory_name?: string;
  name?: string;
  quantity_per_person?: string | number;
  unit?: string;
  unit_price?: number;
  inventory_id?: string | null;
  [k: string]: unknown;
}

interface Recipe {
  id?: string;
  name?: string;
  category?: string;
  dish_type?: string;
  ingredients?: RecipeIngredient[];
  preparation_steps?: string | { step_order: number; instructions: string }[];
  is_saved?: boolean;
  [k: string]: unknown;
}

export function FichesTechniques({
  activeTab,
  cartItems,
  setCartItems,
  t,
  showNotification,
  ficheDepuisChat,
  ficheDepuisChatConsommee,
}: {
  activeTab: string;
  cartItems?: CartItem[];
  setCartItems?: React.Dispatch<React.SetStateAction<CartItem[]>>;
  t: Record<string, string>;
  showNotification: (m: string, type?: string) => void;
  // La fiche nee du chat culinaire (Sprint 16) : MenuAnalysis la remet via
  // App, elle ouvre le VRAI formulaire en pre-rempli — le chef edite texte
  // et quantites a 100 % puis enregistre. Apres consommation, App vide.
  ficheDepuisChat?: {
    recette: {
      nom: string;
      ingredients: Array<{ nom: string; quantite: number | null; unite: string }>;
      etapes: string[];
    };
    carte: "entree" | "plat" | "dessert";
  } | null;
  ficheDepuisChatConsommee?: () => void;
}) {
  const toast = useToast();
  const [pendingDeleteRecipe, setPendingDeleteRecipe] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [inventory, setInventory] = useState<RecipeIngredient[]>([]);
  const [supplierComparison, setSupplierComparison] = useState<RecipeIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [guestCounts, setGuestCounts] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<"categories" | "book">("categories");
  const [expandedRecipes, setExpandedRecipes] = useState<
    Record<string, boolean>
  >({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [generatingSteps, setGeneratingSteps] = useState<
    Record<string, boolean>
  >({});
  const [addedToPlanIds, setAddedToPlanIds] = useState<Set<string>>(new Set());
  const [selectedRecipeForModal, setSelectedRecipeForModal] = useState<
    any | null
  >(null);
  const [isRecipeModalFullScreen, setIsRecipeModalFullScreen] = useState(true);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const outerModalScrollRef = useRef<HTMLDivElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sprint 16 : la fiche nee du chat culinaire arrive ici PRE-REMPLIE. Le
  // formulaire est le seul chemin d'enregistrement — le chef edite le texte
  // et les quantites a 100 % avant de sauver ; jamais d'ecriture directe.
  useEffect(() => {
    if (!ficheDepuisChat) return;
    const { recette, carte } = ficheDepuisChat;
    setSelectedRecipeForModal({
      id: "manual-" + Date.now(),
      name: recette.nom || "",
      category: "chat",
      dish_type: carte,
      ingredients: (recette.ingredients || []).map((ing: any, idx: number) => ({
        id: "ing-" + Date.now() + "-" + idx,
        inventory_name: ing.nom,
        name: ing.nom,
        quantity_per_person: ing.quantite === null || ing.quantite === undefined ? "" : ing.quantite,
        unit: ing.unite || "kg",
        unit_price: 0,
      })),
      preparation_steps: (recette.etapes || []).join("\n"),
      is_saved: false,
    });
    if (ficheDepuisChatConsommee) ficheDepuisChatConsommee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ficheDepuisChat]);

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/recipes/scan", {
        method: "POST",
        body: formData,
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success" && data.fiches_techniques && data.fiches_techniques.length > 0) {
          let lastCreatedId: string | null = null;
          
          for (const recipe of data.fiches_techniques) {
            const recipeName = recipe.recette || recipe.name || "Nouvelle Recette";
            const rawIngredients = recipe.ingredients || [];
            const ingredients = rawIngredients.map((ing: any) => ({
              inventory_name: ing.name || ing.ingredient || "Ingrédient",
              quantity_per_person: ing.quantite || ing.qte || 0,
              unit: ing.unite || ing.unit || "g",
            }));

            const postRes = await fetch("/api/recipes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: recipeName,
                category: recipe.categorie || "decompose",
                ingredients: ingredients,
                preparation_steps: recipe.preparation_steps || null,
                allergens: recipe.allergens || [],
                source_image_url: null,
              }),
            });

            if (postRes.ok) {
              const postData = await postRes.json();
              if (postData.id) {
                lastCreatedId = postData.id;
              }
            }
          }

          showNotification("🎨 " + (t.recipesScannedSuccess || "Fiches techniques scannées et importées avec succès !"), "success");
          
          // Re-fetch recipes inline so we can immediately auto-open for corrections
          try {
            const upRes = await fetch("/api/recipes");
            const upData = await upRes.json();
            setRecipes(upData);

            // Initialize guest counts, preserving existing ones if present
            setGuestCounts((prev) => {
              const next = { ...prev };
              upData.forEach((r: any) => {
                if (next[r.id] === undefined) next[r.id] = 1;
              });
              return next;
            });

            if (lastCreatedId) {
              const matched = upData.find((r: any) => r.id === lastCreatedId);
              if (matched) {
                setSelectedRecipeForModal(matched);
              }
            }
          } catch (err) {
            console.error("Error updating recipes list after scan:", err);
            fetchRecipes();
          }

        } else {
          toast(data.message || "Impossible de décoder la fiche technique. Assurez-vous que le document est lisible.", "error");
        }
      } else {
        toast("Erreur serveur lors du scan IA.", "error");
      }
    } catch (error) {
      console.error("Recipe scan error:", error);
      toast("Une erreur de connexion est survenue.", "error");
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (selectedRecipeForModal) {
      setTimeout(() => {
        if (modalScrollRef.current) modalScrollRef.current.scrollTop = 0;
        if (outerModalScrollRef.current)
          outerModalScrollRef.current.scrollTop = 0;
      }, 10);
    }
  }, [selectedRecipeForModal]);

  const generateSteps = async (id: string) => {
    setGeneratingSteps((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/recipes/${id}/generate-steps`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setRecipes((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, preparation_steps: data.preparation_steps }
              : r,
          ),
        );
        setSelectedRecipeForModal((prev) =>
          prev && prev.id === id
            ? { ...prev, preparation_steps: data.preparation_steps }
            : prev,
        );
      }
    } catch (error) {
      console.error(error);
    } finally {
      setGeneratingSteps((prev) => ({ ...prev, [id]: false }));
    }
  };

  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const toggleRecipeExpansion = (id: string) => {
    setExpandedRecipes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveToBook = async (id: string) => {
    try {
      await fetch(`/api/recipes/${id}/save`, { method: "PUT" });
      fetchRecipes();
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (activeTab === "recipes") {
      fetchRecipes();
      fetchInventory();
      fetchSupplierComparison();
    }
  }, [activeTab]);

  const fetchSupplierComparison = async () => {
    try {
      const res = await fetch("/api/supplier-prices/comparison");
      const data = await res.json();
      setSupplierComparison(data);
    } catch (error) {
      console.error("Error fetching supplier comparison for recipes modal:", error);
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await fetch("/api/inventory");
      const data = await res.json();
      setInventory(data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchRecipes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/recipes");
      const data = await res.json();
      setRecipes(data);

      // Initialize guest counts, preserving existing ones if present
      setGuestCounts((prev) => {
        const next = { ...prev };
        data.forEach((r: any) => {
          if (next[r.id] === undefined) next[r.id] = 1;
        });
        return next;
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteRecipe = async (id: string) => {
    if (!confirm(t.confirmDeleteRecipe || "Supprimer cette fiche technique ?"))
      return;
    try {
      await fetch(`/api/recipes/${id}`, { method: "DELETE" });
      setRecipes(recipes.filter((r) => r.id !== id));
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
    }
  };

  const saveRecipe = async (recipe: any) => {
    try {
      // Sprint 16 : la carte (entree/plat/dessert) est PORTEE a l'enregistre-
      // ment — c'est elle qui range la fiche dans le bon dossier. Defaut : la
      // categorie du dossier courant si c'est une carte, sinon "plat".
      const carteDeLaFiche = ["entree", "plat", "dessert"].includes(recipe.dish_type)
        ? recipe.dish_type
        : ["entree", "plat", "dessert"].includes(recipe.category)
          ? recipe.category
          : "plat";
      if (recipe.id.startsWith("manual-")) {
        const res = await fetch(`/api/recipes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: recipe.name,
            category: recipe.category,
            dish_type: carteDeLaFiche,
            ingredients: recipe.ingredients,
            preparation_steps: recipe.preparation_steps,
          }),
        });
        if (res.ok) {
          toast(t.recipeSaved || "Fiche technique enregistrée !", "success");
          setSelectedRecipeForModal(null);
          fetchRecipes();
        }
      } else {
        const res = await fetch(`/api/recipes/${recipe.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: recipe.name,
            ingredients: recipe.ingredients.map((ing: any) => ({
              inventory_name: ing.inventory_name,
              inventory_id: ing.inventory_id,
              quantity_per_person: ing.quantity_per_person,
              // L'unite est editable a 100 % dans le formulaire : sans elle
              // au PUT, la correction du chef restait purement locale.
              unit: ing.unit,
            })),
            preparation_steps: recipe.preparation_steps,
          }),
        });
        if (res.ok) {
          toast(t.recipeSaved || "Fiche technique enregistrée !", "success");
          fetchRecipes();
        }
      }
    } catch (error) {
      console.error("Erreur lors de l'enregistrement:", error);
    }
  };

  const handleSaveFicheToBook = async (fiche: any) => {
    // Transform fiche to recipe format
    const recipe = {
      id: "manual-" + Date.now(),
      name: fiche.recette,
      category: fiche.categorie || "Non classé",
      ingredients: (fiche.ingredients || []).map((ing: any) => ({
        inventory_name: ing.name || ing.ingredient,
        inventory_id: null,
        quantity_per_person: ing.qte || ing.quantite || 0,
      })),
      preparation_steps: fiche.preparation_steps || fiche.instructions || "",
    };
    await saveRecipe(recipe);
  };

  const addIngredient = (recipeId: string) => {
    const newIng = {
      id: Math.random().toString(36).substr(2, 9),
      name: "Nouvel ingrédient",
      inventory_name: "Nouvel ingrédient",
      quantity_per_person: 0,
      unit: "kg",
      unit_price: 0,
    };

    setRecipes((prev) =>
      prev.map((r) =>
        r.id === recipeId
          ? {
              ...r,
              ingredients: [...(r.ingredients || []), newIng],
            }
          : r,
      ),
    );

    setSelectedRecipeForModal((prev) =>
      prev
        ? {
            ...prev,
            ingredients: [...(prev.ingredients || []), newIng],
          }
        : prev,
    );
  };

  const removeIngredient = (recipeId: string, ingId: string) => {
    const newRecipes = recipes.map((r) => {
      if (r.id === recipeId) {
        return {
          ...r,
          ingredients: r.ingredients.filter((i: any) => i.id !== ingId),
        };
      }
      return r;
    });
    setRecipes(newRecipes);
  };

  const addToCart = (recipe: any) => {
    if (!setCartItems || !cartItems) return;

    const count = guestCounts[recipe.id] || 1;

    // Actualisation : on retire les anciens éléments de cette recette spécifique du panier
    const otherItems = cartItems.filter((i) => i.sourceRecipeId !== recipe.id);
    const newItems = [...otherItems];

    // Ajout systématique de l'entête de la recette pour qu'elle apparaisse dans "Plan de Production"
    newItems.push({
      id: Math.random().toString(36).substr(2, 9),
      isRecipeHeader: true,
      sourceRecipeId: recipe.id,
      recipeName: recipe.name,
      guests: count,
      quantity: 0,
      total: 0,
      item: "",
      inventory_id: null,
    });

    recipe.ingredients?.forEach((ing: any) => {
      if (!ing.inventory_name) return;

      const totalQty =
        (parseFloat(
          (ing.quantity_per_person || "").toString().replace(",", "."),
        ) || 0) * count;

      newItems.push({
        id: Math.random().toString(36).substr(2, 9),
        item: ing.inventory_name,
        inventory_id: ing.inventory_id || ing.id,
        quantity: totalQty,
        quantity_per_person: ing.quantity_per_person || 0,
        guests: count,
        unit: ing.unit || "kg",
        supplier: getSupplierForIngredient(ing.inventory_name),
        price: ing.unit_price || 0,
        total: totalQty * getIngredientEffectivePrice(ing),
        sourceRecipeId: recipe.id,
        recipeName: recipe.name,
      });
    });

    setCartItems(newItems);
    setAddedToPlanIds((prev) => new Set(prev).add(recipe.id));
    setTimeout(() => {
      setAddedToPlanIds((prev) => {
        const next = new Set(prev);
        next.delete(recipe.id);
        return next;
      });
    }, 2000);
    showNotification(
      (
        t.successAddToCartProduction ||
        "✅ {name} a été ajouté au Plan de Production avec {count} convive(s)."
      )
        .replace("{name}", recipe.name)
        .replace("{count}", count.toString()),
    );
  };

  const generatedRecipes = recipes.filter((r) => !r.is_saved);
  const savedRecipes = recipes
    .filter((r) => r.is_saved)
    .sort((a, b) => a.name.localeCompare(b.name));

  const categories = [
    {
      id: "entree",
      name: t.starter || "Entrées",
      icon: ChefHat,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      id: "plat",
      name: t.mainCourse || "Plats",
      icon: ChefHat,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      id: "dessert",
      name: t.dessert || "Desserts",
      icon: Bookmark,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      id: "decompose",
      name: t.importedSheets || "Fiches Importées",
      icon: UploadCloud,
      color: "text-brand-500",
      bg: "bg-brand-500/10",
    },
  ];

  // Le module pur reçoit les deps du composant (labels, couverts, prix).
  const exportSingleRecipeToPDF = (recipe: any) => {
    exportPDF(recipe, {
      labels: t,
      guestCount: guestCounts[recipe.id] || 1,
      prixEffectif: (ing) => getIngredientEffectivePrice(ing),
    });
  };

  return (
    <div className="led-glow-container h-full flex flex-col animate-in fade-in duration-150 overflow-hidden relative">
      <div className="p-6 border-b border-white/10 bg-[#0A0A0A] flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center">
            <BookOpen className="w-6 h-6 mr-3 text-emerald-500" />
            {t.technicalSheets}
          </h2>
          <p className="text-slate-500 mt-1">{t.foodCostSubtitle}</p>
        </div>
        <div className="flex gap-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileScan}
            accept="image/*,.pdf"
            className="hidden"
          />
          <button
            onClick={() => {
              const newRecipe = {
                id: "manual-" + Math.random().toString(36).substr(2, 9),
                name: t.newRecipe || "Nouvelle Recette",
                category: selectedCategory || "general",

                ingredients: [],
                preparation_steps: "",
                is_saved: true,
              };
              setSelectedRecipeForModal(newRecipe);
            }}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all led-glow-emerald border border-blue-400/30 shadow-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t.addRecipeManually || "Ajouter Manuellement"}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all led-glow-purple border border-purple-400/30 shadow-lg flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-purple-200 animate-pulse" />
            {t.scanAndImport || "Scanner & Importer par IA"}
          </button>
          <button
            onClick={() => {
              setViewMode(viewMode === "categories" ? "book" : "categories");
              setActiveLetter(null);
            }}
            className={`px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2 border shadow-lg ${
              viewMode === "book"
                ? "bg-amber-600 hover:bg-amber-500 text-white led-glow-amber border-amber-400/30"
                : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            {t.recipeBook || "Livre des Recettes"}
          </button>
          <button
            onClick={fetchRecipes}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all led-glow-emerald border border-emerald-400/30 shadow-lg flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {t.refresh}
          </button>
        </div>
      </div>

      {isScanning && (
        <div className="absolute inset-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="relative flex flex-col items-center text-center max-w-sm p-8 bg-black/60 rounded-3xl border border-white/10 shadow-2xl">
            <div className="relative w-24 h-24 mb-6">
              <Sparkles className="w-12 h-12 text-purple-400 absolute inset-0 m-auto animate-pulse" />
              <div className="w-24 h-24 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
            </div>
            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">
              Analyse IA en cours...
            </h3>
            <p className="text-slate-400 text-sm">
              Notre intelligence artificielle examine votre document pour en extraire les détails, ingrédients requis, étapes de préparation et allergènes.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/4 min-w-[300px] bg-[#0A0A0A] border-r border-white/5 overflow-y-auto p-6 flex flex-col gap-3">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2 mb-4">
            {t.menuFolders || "Dossiers de Menus"}{" "}
            {viewMode === "book"
              ? savedRecipes.length
              : generatedRecipes.length}{" "}
          </h3>
          {categories.map((cat) => {
            const count = (
              viewMode === "book" ? savedRecipes : generatedRecipes
            ).filter((r: any) => appartientDossier(r, cat.id)).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${selectedCategory === cat.id ? "bg-[#1A1A1A] ring-1 ring-white/10 shadow-lg scale-[1.02]" : "hover:bg-white/5 opacity-70 hover:opacity-100"}`}
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${cat.bg} ${cat.color}`}
                >
                  <cat.icon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-white mb-1">{cat.name}</h4>
                  <p className="text-xs font-mono text-slate-500">
                    {count} {t.sheetsCount || "fiches"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-[#050505]">
          {!selectedCategory ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
              <FolderOpen className="w-20 h-20 text-slate-600 mb-6" />
              <h3 className="text-xl font-bold text-white mb-2">
                {t.noFolderSelected || "Aucun dossier sélectionné"}
              </h3>
              <p className="text-slate-500 max-w-sm">
                {t.selectCategoryDesc ||
                  "Sélectionnez une catégorie dans le menu latéral pour voir les fiches techniques associées."}
              </p>
            </div>
          ) : viewMode === "categories" ? (
            // MODE GENERATED

            generatedRecipes.filter(
              (r: any) => appartientDossier(r, selectedCategory),
            ).length === 0 ? (
              <div className="text-center py-20 bg-[#0A0A0A] rounded-3xl border border-white/5">
                <BookOpen className="w-16 h-16 text-slate-600 mx-auto mb-6" />
                <h3 className="text-lg font-bold text-white mb-2">
                  {t.emptyFolder || "Dossier vide"}
                </h3>
                <p className="text-slate-500">
                  {t.emptyFolderDesc ||
                    "Générez des menus pour remplir cette catégorie."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {generatedRecipes
                  .filter(
                    (r: any) => appartientDossier(r, selectedCategory),
                  )
                  .map((recipe) => (
                    <div
                      key={recipe.id}
                      className="bg-black border border-brand-500/30 rounded-2xl p-6 flex flex-col relative group led-glow-emerald cursor-pointer hover:border-brand-500/60 transition-all hover:scale-[1.01]"
                      onClick={() => setSelectedRecipeForModal(recipe)}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRecipe(recipe.id);
                        }}
                        className="absolute top-4 right-4 p-2 bg-red-500/10 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white z-10"
                        title={t.deleteRecipe}
                      >
                        <X className="w-4 h-4" />
                      </button>

                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-white mb-2">
                            {recipe.name}
                          </h3>
                          <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg inline-block">
                            <span className="text-emerald-400 font-bold text-sm">
                              {(
                                recipe.ingredients?.reduce(
                                  (sum: number, ing: any) =>
                                    sum +
                                    (parseFloat(
                                      (ing.quantity_per_person || "")
                                        .toString()
                                        .replace(",", "."),
                                    ) || 0) *
                                      getIngredientEffectivePrice(ing),
                                  0,
                                ) || 0
                              ).toFixed(2)}
                            </span>
                            <span className="text-xs text-emerald-500/70 ml-1">
                              {t.portionShort || "/ portion"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRecipeForModal(recipe);
                            }}
                            className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2.5 rounded-xl transition-all border border-emerald-500/20 flex items-center justify-center gap-2 w-full hover:scale-105 active:scale-95 shadow-lg"
                          >
                            <BookOpen className="w-4 h-4" />
                            {t.technicalSheetFull || "Fiche Technique"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveToBook(recipe.id);
                            }}
                            className="text-[10px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 hover:bg-amber-500 hover:text-white px-4 py-2.5 rounded-xl transition-all border border-amber-500/30 flex items-center justify-center gap-2 w-full hover:scale-105 active:scale-95 shadow-lg shadow-amber-500/10"
                          >
                            <FolderOpen className="w-4 h-4" />
                            {t.save || "Enregistrer"}
                          </button>
                        </div>
                      </div>

                      {expandedRecipes[recipe.id] && (
                        <div className="mt-4 pt-4 border-t border-brand-500/20 animate-in slide-in-from-top-2 duration-300">
                          {recipe.source_image_url && (
                            <div className="mb-6 rounded-2xl overflow-hidden border border-white/10 shadow-xl max-h-[300px] flex justify-center">
                              <MediaDisplay
                                src={recipe.source_image_url}
                                alt={t.sourceAlt || "Source"}
                                className="object-contain max-h-full"
                              />
                            </div>
                          )}

                          {recipe.preparation_steps ? (
                            <div className="mb-6 flex flex-col gap-4">
                              <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                                <h4 className="text-sm font-bold text-white mb-3 flex items-center">
                                  <ChefHat className="w-4 h-4 mr-2 text-emerald-500" />{" "}
                                  {t.prepSteps}
                                </h4>
                                <div className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                                  {recipe.preparation_steps}
                                </div>
                              </div>
                              <div className="flex justify-center">
                                <button
                                  onClick={() => generateSteps(recipe.id)}
                                  disabled={generatingSteps[recipe.id]}
                                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500/50 hover:text-emerald-500 transition-colors"
                                >
                                  <RefreshCw
                                    className={`w-3 h-3 ${generatingSteps[recipe.id] ? "animate-spin" : ""}`}
                                  />
                                  {generatingSteps[recipe.id]
                                    ? t.generating
                                    : t.regenerateSteps}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="mb-6 flex justify-center">
                              <button
                                onClick={() => generateSteps(recipe.id)}
                                disabled={generatingSteps[recipe.id]}
                                className="px-6 py-3 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-400 rounded-2xl border border-emerald-500/30 font-black uppercase tracking-widest text-[10px] flex items-center gap-3 transition-all disabled:opacity-50 shadow-lg"
                              >
                                {generatingSteps[recipe.id] ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <ChefHat className="w-4 h-4" />
                                )}
                                {generatingSteps[recipe.id]
                                  ? t.generating
                                  : t.generateSteps}
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-4 mb-4 bg-white/5 p-3 rounded-xl border border-white/10">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-slate-400" />
                              <span className="text-sm font-medium text-slate-300">
                                {t.guests} :
                              </span>
                              <input
                                type="number"
                                min="1"
                                value={guestCounts[recipe.id] || 1}
                                onChange={(e) =>
                                  setGuestCounts({
                                    ...guestCounts,
                                    [recipe.id]: parseInt(e.target.value) || 1,
                                  })
                                }
                                className="w-16 bg-black/40 border border-white/10 rounded-lg text-center font-bold text-white py-1 focus:ring-2 focus:ring-brand-500 outline-none"
                              />
                            </div>
                            <div className="ml-auto flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  exportSingleRecipeToPDF(recipe);
                                }}
                                className="flex items-center justify-center p-2 text-slate-500 hover:text-white rounded-lg transition-colors cursor-pointer mr-2"
                                title={t.download || "Télécharger"}
                              >
                                <Download className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => addToCart(recipe)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border shadow-lg ${
                                  addedToPlanIds.has(recipe.id)
                                    ? "bg-emerald-500 text-white border-emerald-400"
                                    : "bg-brand-500/20 text-brand-400 hover:bg-brand-500 hover:text-white border-brand-500/30 shadow-brand-500/10"
                                }`}
                              >
                                {addedToPlanIds.has(recipe.id) ? (
                                  <>
                                    <Check className="w-4 h-4" />
                                    OK
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    {t.productionPlan || "Plan Production"}
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="bg-black rounded-xl border border-white/5 overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm text-left text-slate-300">
                                <thead className="text-xs text-slate-500 uppercase bg-[#1A1A1A]/80 border-b border-white/10">
                                  <tr>
                                    <th className="px-4 py-3 min-w-[200px]">
                                      {t.ingredient}
                                    </th>
                                    <th className="px-4 py-3 text-right">
                                      {t.qtyShort || "Qte"}
                                    </th>
                                    <th className="px-4 py-3 text-right">
                                      {t.unitPrice}
                                    </th>
                                    <th className="px-4 py-3 text-right">
                                      {t.cost}
                                    </th>
                                    <th className="px-4 py-3 text-center">
                                      {t.actions || "Action"}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {recipe.ingredients?.map((ing: any) => (
                                    <tr
                                      key={ing.id}
                                      className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                                    >
                                      <td className="px-4 py-2 font-medium text-white">
                                        <input
                                          type="text"
                                          placeholder={t.name || "Nom"}
                                          value={ing.inventory_name || ing.name || ""}
                                          onChange={(e) => {
                                            const newName = e.target.value;
                                            const newRecipes = recipes.map((r) => {
                                              if (r.id === recipe.id) {
                                                return {
                                                  ...r,
                                                  ingredients: r.ingredients.map((i: any) =>
                                                    i.id === ing.id
                                                      ? {
                                                          ...i,
                                                          inventory_name: newName,
                                                          name: newName,
                                                        }
                                                      : i,
                                                  ),
                                                };
                                              }
                                              return r;
                                            });
                                            setRecipes(newRecipes);
                                          }}
                                          className="w-full bg-black/40 border border-white/10 hover:border-amber-500/30 rounded-lg px-2 py-1 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all shadow-inner shadow-black/50 text-white font-bold text-sm"
                                        />
                                      </td>
                                      <td className="px-4 py-2 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={
                                              ing.quantity_per_person === 0
                                                ? ""
                                                : ing.quantity_per_person
                                            }
                                            onChange={(e) => {
                                              const newQte = e.target.value;
                                              const newRecipes = recipes.map(
                                                (r) => {
                                                  if (r.id === recipe.id) {
                                                    return {
                                                      ...r,

                                                      ingredients:
                                                        r.ingredients.map(
                                                          (i: any) =>
                                                            i.id === ing.id
                                                              ? {
                                                                  ...i,
                                                                  quantity_per_person:
                                                                    newQte,
                                                                }
                                                              : i,
                                                        ),
                                                    };
                                                  }
                                                  return r;
                                                },
                                              );
                                              setRecipes(newRecipes);
                                            }}
                                            className="w-20 bg-black/40 border border-white/10 rounded-lg text-center font-bold text-white py-1 focus:ring-1 focus:ring-emerald-500 outline-none text-sm"
                                          />
                                          <input
                                            type="text"
                                            placeholder={t.unit || "kg"}
                                            value={ing.unit || ""}
                                            onChange={(e) => {
                                              const newUnit = e.target.value;
                                              const newRecipes = recipes.map((r) => {
                                                if (r.id === recipe.id) {
                                                  return {
                                                    ...r,
                                                    ingredients: r.ingredients.map((i: any) =>
                                                      i.id === ing.id
                                                        ? { ...i, unit: newUnit }
                                                        : i,
                                                    ),
                                                  };
                                                }
                                                return r;
                                              });
                                              setRecipes(newRecipes);
                                            }}
                                            className="w-10 bg-black/40 border border-white/10 rounded-lg text-center text-slate-400 py-1 outline-none text-xs focus:border-emerald-500"
                                          />
                                        </div>
                                      </td>
                                      <td className="px-4 py-2 text-right text-xs">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={ing.unit_price === 0 || ing.unit_price === undefined ? "" : ing.unit_price}
                                          onChange={(e) => {
                                            const newPrice = parseFloat(e.target.value.replace(",", ".")) || 0;
                                            const newRecipes = recipes.map((r) => {
                                              if (r.id === recipe.id) {
                                                return {
                                                  ...r,
                                                  ingredients: r.ingredients.map((i: any) =>
                                                    i.id === ing.id
                                                      ? { ...i, unit_price: newPrice }
                                                      : i,
                                                  ),
                                                };
                                              }
                                              return r;
                                            });
                                            setRecipes(newRecipes);
                                          }}
                                          className="w-20 bg-black/40 border border-white/10 rounded-lg text-center font-mono font-bold text-blue-400 py-1 focus:ring-1 focus:ring-blue-500 outline-none text-xs"
                                        />
                                      </td>
                                      <td className="px-4 py-2 text-right text-emerald-400 font-bold tabular-nums">
                                        {(
                                          (parseFloat(
                                            (ing.quantity_per_person || "")
                                              .toString()
                                              .replace(",", "."),
                                          ) || 0) * getIngredientEffectivePrice(ing)
                                        ).toFixed(2)}
                                      </td>
                                      <td className="px-4 py-2 text-center">
                                        <button
                                          onClick={() =>
                                            removeIngredient(recipe.id, ing.id)
                                          }
                                          className="p-1.5 text-slate-500 hover:text-red-500 transition-colors bg-white/5 rounded-lg"
                                          title={t.delete || "Supprimer"}
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                  <tr>
                                    <td colSpan={5} className="p-2">
                                      <button
                                        onClick={() => addIngredient(recipe.id)}
                                        className="w-full py-2.5 bg-white/5 border border-dashed border-white/10 rounded-xl text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/5 hover:border-emerald-500/30 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest font-bold"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        {t.newIngredient ||
                                          "Ajouter un ingrédient"}
                                      </button>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )
          ) : (
            <div className="space-y-6">
              {/* A-Z Filter Bar */}
              <div className="flex items-center gap-2 overflow-x-auto pb-4 hide-scrollbar">
                <button
                  onClick={() => setActiveLetter(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors min-w-[40px] ${!activeLetter ? "bg-amber-500 text-white" : "bg-[#1A1A1A] text-slate-400 hover:text-white"}`}
                >
                  {t.all || "TOUS"}
                </button>
                {ALPHABET.map((letter) => {
                  const hasItems =
                    savedRecipes.filter(
                      (r: any) =>
                        appartientDossier(r, selectedCategory) &&
                        r.name &&
                        r.name.toUpperCase().startsWith(letter),
                    ).length > 0;
                  return (
                    <button
                      key={letter}
                      onClick={() =>
                        hasItems ? setActiveLetter(letter) : null
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors min-w-[32px] ${
                        activeLetter === letter
                          ? "bg-amber-500 text-white"
                          : hasItems
                            ? "bg-[#1A1A1A] text-white hover:bg-white/10"
                            : "bg-[#111] text-slate-700 cursor-not-allowed"
                      }`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>

              {["entree", "plat", "dessert"].map((dishType) => {
                const filteredSortedRecipes = savedRecipes
                  .filter(
                    (r: any) => appartientDossier(r, selectedCategory),
                  )
                  .filter(
                    (r: any) =>
                      !activeLetter ||
                      (r.name && r.name.toUpperCase().startsWith(activeLetter)),
                  )
                  .filter((r: any) => {
                    const tType = r.dish_type || "plat";
                    return tType === dishType;
                  })
                  .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));

                if (filteredSortedRecipes.length === 0) return null;

                return (
                  <div key={dishType} className="mb-12">
                    <h3 className="font-black text-2xl text-amber-500 tracking-widest uppercase mb-6 flex items-center border-b border-amber-500/20 pb-3">
                      <ChefHat className="w-6 h-6 mr-3" />
                      {dishType === "entree" ? (t.starter || "Entrées") : dishType === "plat" ? (t.mainCourse || "Plats") : (t.dessert || "Desserts")}
                    </h3>
                    <div className="space-y-6">
                      {filteredSortedRecipes.map((recipe) => (
                        <div
                          key={recipe.id}
                          className="bg-black border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.05)] rounded-2xl p-6 relative group overflow-hidden mb-6 cursor-pointer hover:border-amber-500/50 transition-all hover:scale-[1.01]"
                          onClick={() => setSelectedRecipeForModal(recipe)}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRecipe(recipe.id);
                            }}
                            className="absolute top-4 right-4 p-2 bg-red-500/10 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white z-20"
                            title={t.deleteRecipe}
                          >
                            <X className="w-4 h-4" />
                          </button>

                    <div className="flex justify-between items-center">
                      <h3 className="text-xl font-bold text-white group-hover:text-amber-400 transition-colors">
                        {recipe.name}
                      </h3>
                      <div className="flex items-center gap-4 mr-10 relative z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRecipeExpansion(recipe.id);
                          }}
                          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                        >
                          {expandedRecipes[recipe.id] ? (
                            <ChevronUp className="w-5 h-5 text-slate-500" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-500" />
                          )}
                        </button>
                        <span className="text-amber-500 font-bold bg-amber-500/10 px-3 py-1 rounded-lg">
                          {(
                            recipe.ingredients?.reduce(
                              (sum: number, ing: any) =>
                                sum +
                                (parseFloat(
                                  (ing.quantity_per_person || "")
                                    .toString()
                                    .replace(",", "."),
                                ) || 0) *
                                  getIngredientEffectivePrice(ing),
                              0,
                            ) || 0
                          ).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* EDITABLE SECTION */}
                    {expandedRecipes[recipe.id] && (
                      <div className="mt-8 pt-6 border-t border-white/5 animate-in slide-in-from-top-4 duration-300">
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex-1 max-w-xl">
                            <label className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-2 block">
                              {t.dishName || "Nom du plat"}
                            </label>
                            <textarea
                              value={recipe.name}
                              onChange={(e) => {
                                const newRecipes = recipes.map((r) =>
                                  r.id === recipe.id
                                    ? { ...r, name: e.target.value }
                                    : r,
                                );
                                setRecipes(newRecipes);
                              }}
                              rows={1}
                              className="text-2xl font-black text-amber-400 bg-transparent border-b border-transparent hover:border-white/20 focus:border-amber-500 focus:outline-none w-full resize-none leading-tight overflow-hidden transition-colors"
                            />
                          </div>
                        </div>

                        {recipe.source_image_url && (
                          <div className="mb-6 rounded-2xl overflow-hidden border border-white/10 shadow-xl max-h-[300px] flex justify-center bg-black/20">
                            <MediaDisplay
                              src={recipe.source_image_url}
                              alt={t.sourceAlt || "Source"}
                              className="object-contain max-h-full"
                            />
                          </div>
                        )}

                        {recipe.preparation_steps ? (
                          <div className="mb-8 flex flex-col gap-4">
                            <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                              <h4 className="text-sm font-bold text-amber-500 mb-3 flex items-center">
                                <ChefHat className="w-4 h-4 mr-2" />{" "}
                                {t.prepSteps}
                              </h4>
                              <div className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                                {recipe.preparation_steps}
                              </div>
                            </div>
                            <div className="flex justify-center">
                              <button
                                onClick={() => generateSteps(recipe.id)}
                                disabled={generatingSteps[recipe.id]}
                                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-500/50 hover:text-amber-500 transition-colors"
                              >
                                <RefreshCw
                                  className={`w-3 h-3 ${generatingSteps[recipe.id] ? "animate-spin" : ""}`}
                                />
                                {generatingSteps[recipe.id]
                                  ? t.generating
                                  : t.regenerateSteps}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mb-8 flex justify-center">
                            <button
                              onClick={() => generateSteps(recipe.id)}
                              disabled={generatingSteps[recipe.id]}
                              className="px-8 py-4 bg-amber-500/10 hover:bg-amber-500 hover:text-white text-amber-400 rounded-2xl border border-amber-500/30 font-black uppercase tracking-widest text-xs flex items-center gap-3 transition-all disabled:opacity-50 shadow-lg shadow-amber-500/10"
                            >
                              {generatingSteps[recipe.id] ? (
                                <RefreshCw className="w-5 h-5 animate-spin" />
                              ) : (
                                <ChefHat className="w-5 h-5" />
                              )}
                              {generatingSteps[recipe.id]
                                ? t.generating
                                : t.generateSteps}
                            </button>
                          </div>
                        )}

                        <div className="flex bg-[#0A0A0A] p-4 rounded-2xl border border-white/5 gap-4 mb-6">
                          <div className="flex items-center gap-3 px-4">
                            <Users className="w-5 h-5 text-slate-400" />
                            <span className="text-xs font-black text-slate-300 uppercase tracking-widest">
                              {t.guests} :
                            </span>
                            <input
                              type="number"
                              min="1"
                              value={guestCounts[recipe.id] || 1}
                              onChange={(e) =>
                                setGuestCounts({
                                  ...guestCounts,
                                  [recipe.id]: parseInt(e.target.value) || 1,
                                })
                              }
                              className="w-16 bg-[#1A1A1A] border-2 border-white/10 rounded-xl text-center font-black text-lg text-white py-1 focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                            />
                          </div>
                          <div className="flex-1 flex justify-end gap-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                exportSingleRecipeToPDF(recipe);
                              }}
                              className="flex items-center gap-2 p-2 bg-transparent text-slate-500 hover:text-white rounded-xl transition-colors cursor-pointer"
                              title={t.download || "Télécharger"}
                            >
                              <Download className="w-5 h-5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                saveRecipe(recipe);
                              }}
                              className="flex items-center gap-2 px-6 py-2 bg-white/5 text-white hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-colors border border-white/10"
                            >
                              <Save className="w-4 h-4" />
                              {t.saveFull || "SAUVEGARDER"}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCart(recipe);
                              }}
                              className="flex items-center gap-2 px-6 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-emerald-500/30"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              {t.prodPlanShort || "Plan Prod"}
                            </button>
                          </div>
                        </div>

                        <div className="bg-[#1A1A1A] rounded-2xl border border-white/5">
                          <table className="w-full text-sm text-left text-slate-300">
                            <thead className="text-[10px] text-slate-500 uppercase font-black bg-black/40 border-b border-white/5 tracking-widest">
                              <tr>
                                <th className="px-4 py-3 w-1/2">
                                  {t.ingredient}
                                </th>
                                <th className="px-4 py-3 text-right">
                                  {t.qtyPerPersShort || "Qté/Pers"}
                                </th>
                                <th className="px-4 py-3 text-right">
                                  {t.unitPriceShort || "Prix.U"}
                                </th>
                                <th className="px-4 py-3 text-right">
                                  {t.net || "Net"}
                                </th>
                                <th className="px-4 py-3 text-center w-12"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {recipe.ingredients?.map((ing: any) => (
                                <tr
                                  key={ing.id}
                                  className="border-b border-white/5 last:border-0 hover:bg-white/5"
                                >
                                  <td className="px-4 py-3 font-medium text-white">
                                    <input
                                      type="text"
                                      placeholder={t.name || "Nom"}
                                      value={ing.inventory_name || ing.name || ""}
                                      onChange={(e) => {
                                        const newName = e.target.value;
                                        const newRecipes = recipes.map((r) =>
                                          r.id === recipe.id
                                            ? {
                                                ...r,
                                                ingredients: r.ingredients.map((i: any) =>
                                                  i.id === ing.id
                                                    ? {
                                                        ...i,
                                                        inventory_name: newName,
                                                        name: newName,
                                                      }
                                                    : i
                                                ),
                                              }
                                            : r
                                        );
                                        setRecipes(newRecipes);
                                      }}
                                      className="w-full bg-[#0A0A0A] border border-white/5 hover:border-amber-500/30 rounded-lg px-2 py-1 text-white text-sm focus:border-amber-500 font-bold outline-none text-amber-400"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={
                                          ing.quantity_per_person === 0
                                            ? ""
                                            : ing.quantity_per_person
                                        }
                                        onChange={(e) => {
                                          const newQte = e.target.value;
                                          const newRecipes = recipes.map((r) =>
                                            r.id === recipe.id
                                              ? {
                                                  ...r,
                                                  ingredients: r.ingredients.map(
                                                    (i: any) =>
                                                      i.id === ing.id
                                                        ? {
                                                            ...i,
                                                            quantity_per_person:
                                                              newQte,
                                                          }
                                                        : i,
                                                  ),
                                                }
                                              : r,
                                          );
                                          setRecipes(newRecipes);
                                        }}
                                        className="w-16 bg-[#0A0A0A] border border-white/5 rounded-lg text-center font-mono font-bold text-emerald-400 py-1 outline-none"
                                      />
                                      <input
                                        type="text"
                                        placeholder={t.unit || "kg"}
                                        value={ing.unit || ""}
                                        onChange={(e) => {
                                          const newUnit = e.target.value;
                                          const newRecipes = recipes.map((r) =>
                                            r.id === recipe.id
                                              ? {
                                                  ...r,
                                                  ingredients: r.ingredients.map((i: any) =>
                                                    i.id === ing.id
                                                      ? { ...i, unit: newUnit }
                                                      : i
                                                  ),
                                                }
                                              : r
                                          );
                                          setRecipes(newRecipes);
                                        }}
                                        className="w-10 bg-[#0A0A0A] border border-white/5 rounded-lg text-center text-slate-400 py-1 outline-none text-xs focus:border-emerald-500"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={ing.unit_price === 0 || ing.unit_price === undefined ? "" : ing.unit_price}
                                      onChange={(e) => {
                                        const newPrice = parseFloat(e.target.value.replace(",", ".")) || 0;
                                        const newRecipes = recipes.map((r) =>
                                          r.id === recipe.id
                                            ? {
                                                ...r,
                                                ingredients: r.ingredients.map((i: any) =>
                                                  i.id === ing.id
                                                    ? { ...i, unit_price: newPrice }
                                                    : i
                                                ),
                                              }
                                            : r
                                        );
                                        setRecipes(newRecipes);
                                      }}
                                      className="w-20 bg-[#0A0A0A] border border-white/5 rounded-lg text-center font-mono font-bold text-blue-400 py-1 outline-none focus:border-blue-500 text-xs"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono font-bold text-amber-400">
                                    {(
                                      (parseFloat(
                                        (ing.quantity_per_person || "")
                                          .toString()
                                          .replace(",", "."),
                                      ) || 0) * getIngredientEffectivePrice(ing)
                                    ).toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={() =>
                                        removeIngredient(recipe.id, ing.id)
                                      }
                                      className="p-1.5 text-slate-600 hover:text-red-500 bg-red-500/0 hover:bg-red-500/10 rounded-lg"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              <tr>
                                <td colSpan={5} className="p-2">
                                  <button
                                    onClick={() => addIngredient(recipe.id)}
                                    className="w-full py-3 border border-dashed border-white/10 rounded-xl text-slate-500 hover:text-amber-500 hover:bg-amber-500/5 text-xs font-bold uppercase tracking-widest flex justify-center items-center gap-2"
                                  >
                                    <Plus className="w-4 h-4" />
                                    Ajouter un ingrédient
                                  </button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
              {savedRecipes
                .filter(
                  (r: any) => appartientDossier(r, selectedCategory),
                )
                .filter(
                  (r: any) =>
                    !activeLetter ||
                    (r.name && r.name.toUpperCase().startsWith(activeLetter)),
                ).length === 0 && (
                <div className="text-center py-20 bg-black rounded-3xl border border-white/5">
                  <BookOpen className="w-16 h-16 text-slate-600 mx-auto mb-4 opacity-50" />
                  <p className="text-slate-500">
                    {t.noRecipeLetter ||
                      "Aucune recette trouvée sur cette lettre."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL RECETTE (extrait, chantier 8) : tout le state reste ICI
           (le parent le possede), le modal ne fait que l'afficher. */}
      <RecipeModal
        selectedRecipeForModal={selectedRecipeForModal}
        setSelectedRecipeForModal={setSelectedRecipeForModal}
        recipes={recipes}
        inventory={inventory}
        supplierComparison={supplierComparison}
        setRecipes={setRecipes}
        guestCounts={guestCounts}
        setGuestCounts={setGuestCounts}
        isRecipeModalFullScreen={isRecipeModalFullScreen}
        setIsRecipeModalFullScreen={setIsRecipeModalFullScreen}
        generatingSteps={generatingSteps}
        generateSteps={generateSteps}
        addIngredient={addIngredient}
        removeIngredient={removeIngredient}
        saveRecipe={saveRecipe}
        addToCart={addToCart}
        outerModalScrollRef={outerModalScrollRef}
        modalScrollRef={modalScrollRef}
        t={t}
        exportSingleRecipeToPDF={exportSingleRecipeToPDF}
      />
      <ConfirmDialog
        open={!!pendingDeleteRecipe}
        title={t.confirmDeleteRecipe || "Supprimer cette fiche technique ?"}
        description="Cette fiche sera définitivement supprimée."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        danger
        onConfirm={async () => {
          if (pendingDeleteRecipe) {
            await deleteRecipe(pendingDeleteRecipe);
          }
          setPendingDeleteRecipe(null);
        }}
        onCancel={() => setPendingDeleteRecipe(null)}
      />
</div>
  );
}
