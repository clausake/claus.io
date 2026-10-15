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
import { FichesGrilleCategories } from "./FichesGrilleCategories";
import { FichesVueLivre } from "./FichesVueLivre";

// Le payload du chat culinaire (Sprint 16) : recette nommee en francais,
// ingredients en nom/quantite/unite, etapes en string[].
interface FicheIngredient {
  name?: string;
  ingredient?: string;
  qte?: string | number;
  quantite?: string | number;
}

interface FicheScanneePayload {
  recette?: string;
  categorie?: string;
  jour?: string;
  ingredients?: FicheIngredient[];
  etapes?: { step_order: number; instructions: string }[];
  preparation_steps?: string;
  instructions?: string;
}

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
      ingredients: (recette.ingredients || []).map((ing: {nom?: string; quantite?: number | null; unite?: string}, idx: number) => ({
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
            const ingredients = rawIngredients.map((ing: {nom?: string; quantite?: number | null; unite?: string; name?: string; ingredient?: string; qte?: string | number; unit?: string}) => ({
              inventory_name: ing.name || ing.ingredient || ing.nom || "Ingrédient",
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
              upData.forEach((r: Recipe) => {
                if (r.id && next[r.id] === undefined) next[r.id] = 1;
              });
              return next;
            });

            if (lastCreatedId) {
              const matched = upData.find((r: Recipe) => r.id === lastCreatedId);
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
        data.forEach((r: Recipe) => {
          if (r.id && next[r.id] === undefined) next[r.id] = 1;
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

  const saveRecipe = async (recipe: Recipe) => {
    try {
      // Sprint 16 : la carte (entree/plat/dessert) est PORTEE a l'enregistre-
      // ment — c'est elle qui range la fiche dans le bon dossier. Defaut : la
      // categorie du dossier courant si c'est une carte, sinon "plat".
      const carteDeLaFiche = ["entree", "plat", "dessert"].includes(recipe.dish_type || "")
        ? (recipe.dish_type as string)
        : ["entree", "plat", "dessert"].includes(recipe.category || "")
          ? (recipe.category as string)
          : "plat";
      if (recipe.id && recipe.id.startsWith("manual-")) {
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
            ingredients: (recipe.ingredients || []).map((ing: RecipeIngredient) => ({
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

  const handleSaveFicheToBook = async (fiche: FicheScanneePayload) => {
    // Transform fiche to recipe format
    const recipe = {
      id: "manual-" + Date.now(),
      name: fiche.recette,
      category: fiche.categorie || "Non classé",
      ingredients: (fiche.ingredients || []).map((ing: FicheIngredient) => ({
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
          ingredients: r.ingredients.filter((i: RecipeIngredient) => i.id !== ingId),
        };
      }
      return r;
    });
    setRecipes(newRecipes);
  };

  const addToCart = (recipe: Recipe) => {
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

    recipe.ingredients?.forEach((ing: RecipeIngredient) => {
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
        quantity_per_person: Number(ing.quantity_per_person) || 0,
        guests: count,
        unit: ing.unit || "kg",
        supplier: getSupplierForIngredient(ing.inventory_name || ""),
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
        .replace("{name}", recipe.name || "")
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
  const exportSingleRecipeToPDF = (recipe: Recipe) => {
    if (!recipe.id) return;
    const steps = recipe.preparation_steps;
    const stepsFlat = Array.isArray(steps)
      ? steps.map((s, i) => `${i + 1}. ${s.instructions}`).join("\n")
      : steps;
    const recipeWithId = { ...recipe, id: recipe.id, preparation_steps: stepsFlat };
    exportPDF(recipeWithId, {
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
            ).filter((r: Recipe) => appartientDossier(r, cat.id)).length;
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
              (r: Recipe) => appartientDossier(r, selectedCategory),
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
              <FichesGrilleCategories
                t={t}
                recipes={recipes}
                setRecipes={setRecipes}
                generatedRecipes={generatedRecipes}
                selectedCategory={selectedCategory}
                setSelectedRecipeForModal={setSelectedRecipeForModal}
                guestCounts={guestCounts}
                setGuestCounts={setGuestCounts}
                handleSaveToBook={handleSaveToBook}
                deleteRecipe={deleteRecipe}
                addToCart={addToCart}
                addedToPlanIds={addedToPlanIds}
                expandedRecipes={expandedRecipes}
                generatingSteps={generatingSteps}
                generateSteps={generateSteps}
                exportSingleRecipeToPDF={exportSingleRecipeToPDF}
                addIngredient={addIngredient}
                removeIngredient={removeIngredient}
              />
            )
          ) : (
            <FichesVueLivre
              t={t}
              recipes={recipes}
              setRecipes={setRecipes}
              savedRecipes={savedRecipes}
              selectedCategory={selectedCategory}
              setSelectedRecipeForModal={setSelectedRecipeForModal}
              guestCounts={guestCounts}
              setGuestCounts={setGuestCounts}
              deleteRecipe={deleteRecipe}
              addToCart={addToCart}
              expandedRecipes={expandedRecipes}
              generatingSteps={generatingSteps}
              generateSteps={generateSteps}
              exportSingleRecipeToPDF={exportSingleRecipeToPDF}
              addIngredient={addIngredient}
              removeIngredient={removeIngredient}
              activeLetter={activeLetter}
              setActiveLetter={setActiveLetter}
              toggleRecipeExpansion={toggleRecipeExpansion}
              saveRecipe={saveRecipe}
            />
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
