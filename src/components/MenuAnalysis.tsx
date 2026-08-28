import React, { useRef, useState } from "react";
import {
  Bookmark,
  CheckCircle2,
  ChefHat,
  Clock,
  Download,
  FileText,
  Menu as MenuIcon,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { MENU_ROTATION } from "../data/menuData";
import { motion } from "motion/react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export function MenuAnalysis({
  cartItems,
  setCartItems,
  setActiveTab,
  t,
  settings,
  showNotification,
}: {
  cartItems?: any[];
  setCartItems?: any;
  setActiveTab?: any;
  t: any;
  settings: any;
  showNotification: (m: string, type?: any) => void;
}) {
  const [analysisMode, setAnalysisMode] = useState<
    "decompose" | "creative" | "gastronomic" | "traditional" | null
  >(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fichesTechniques, setFichesTechniques] = useState<any[] | null>(null);
  const [creativeMenu, setCreativeMenu] = useState<any[] | null>(null);
  const [gastronomicMenu, setGastronomicMenu] = useState<any[] | null>(null);
  const [traditionalMenu, setTraditionalMenu] = useState<any[] | null>(null);
  const [guestCount, setGuestCount] = useState<number>(1);
  const [planningModal, setPlanningModal] = useState<{ recipe: any } | null>(
    null,
  );
  const [planningDate, setPlanningDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [planningMeal, setPlanningMeal] = useState<"LUNCH" | "DINNER">("LUNCH");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddToPlanning = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!planningModal) return;

    try {
      const res = await fetch("/api/menu-planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: planningDate,
          meal_type: planningMeal,
          title:
            planningModal.recipe.nom ||
            planningModal.recipe.name ||
            planningModal.recipe.recette,
          recipe_details: JSON.stringify(planningModal.recipe),
        }),
      });

      if (res.ok) {
        showNotification(t.planningSaved || "Ajouté au planning", "success");
        setPlanningModal(null);
      }
    } catch (err) {
      showNotification("Erreur lors de l'ajout au planning", "error");
    }
  };

  const translateFood = (food: string) => {
    const map: Record<string, string> = {
      Poisson: t.fish,
      Poulet: t.chicken,
      "Pâtes de blé": t.wheatPasta,
      Porc: t.pork,
      Bœuf: t.beef,
      Veau: t.veal,
      Saucisses: t.sausages,
      "Pâtes fraîches ou plat vegan": t.veganPasta,
      Dinde: t.turkey,
      Agneau: t.lamb,
      "Stock résiduel ou Salade de pâtes": t.residualPasta,
      "Plat ++": t.premiumDish,
      "Stock résiduel ou Salade de riz": t.residualRice,
      "Omelette ou œufs brouillés": t.eggs,
      Canard: t.duck,
      Lapin: t.rabbit,
      Omelette: t.omelette,
    };
    return map[food] || food;
  };

  const translateDay = (day: string) => {
    if (!day) return "";
    const lowerDay = day.toLowerCase();
    const map: Record<string, string> = {
      lundi: t.monday,
      monday: t.monday,
      mardi: t.tuesday,
      tuesday: t.tuesday,
      mercredi: t.wednesday,
      wednesday: t.wednesday,
      jeudi: t.thursday,
      thursday: t.thursday,
      vendredi: t.friday,
      friday: t.friday,
      samedi: t.saturday,
      saturday: t.saturday,
      dimanche: t.sunday,
      sunday: t.sunday,
    };
    return map[lowerDay] || day;
  };

  const saveGeneratedRecipes = async (recipes: any[]) => {
    try {
      for (const recipe of recipes) {
        // Robust extraction of name and ingredients
        const recipeName =
          recipe.name ||
          recipe.nom ||
          recipe.recette ||
          recipe.title ||
          recipe.plat_creatif;
        if (!recipeName) continue;

        const rawIngredients =
          recipe.ingredients || recipe.fiche_technique || [];
        const ingredients = (
          Array.isArray(rawIngredients) ? rawIngredients : []
        ).map((ing: any) => ({
          inventory_name: ing.name || ing.nom || ing.ingredient || "Ingrédient",
          quantity_per_person: ing.quantite || ing.qte || 0,
          unit: ing.unite || ing.unit || "g",
        }));

        await fetch("/api/recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: recipeName,
            category: recipe.category || "decompose",
            dish_type: recipe.dish_type || "plat",
            ingredients: ingredients,
            preparation_steps:
              recipe.preparation_steps || recipe.preparation || null,
            source_image_url: recipe.source_image_url || null,
            allergens: recipe.allergens || [],
            skip_svg: true,
          }),
        });
      }
      // Notification de synchronisation
      alert(
        t.syncFTSuccess ||
          "✅ Fiches techniques synchronisées instantanément avec l'onglet dédié.",
      );
    } catch (error) {
      console.error(
        "Erreur lors de la sauvegarde des fiches techniques:",
        error,
      );
    }
  };

  const exportMenuToPDF = (
    titre: string,
    menuArray: any[],
    menuType: "creative" | "gastronomic" | "traditional",
  ) => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(59, 130, 246); // Blueish
    doc.text(titre, 20, 20);

    let y = 35;

    menuArray.forEach((jourMenu, idx) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(16);
      doc.setTextColor(31, 41, 55);
      const dayText =
        translateDay(jourMenu.jour) || t.chefMenu || "MENU DU CHEF";
      doc.text(dayText, 20, y);
      y += 10;

      doc.setFontSize(12);
      doc.setTextColor(107, 114, 128);

      if (menuType === "creative") {
        const renderMeals = (mealObj: any, title: string) => {
          if (!mealObj) return;
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          doc.setFont("helvetica", "bold");
          doc.text(title, 20, y);
          y += 6;
          doc.setFont("helvetica", "normal");

          if (mealObj.plat_creatif || mealObj.description) {
            const text = doc.splitTextToSize(
              mealObj.plat_creatif || mealObj.description || "",
              170,
            );
            doc.text(text, 25, y);
            y += text.length * 6 + 5;
          } else {
            ["entree", "plat", "dessert"].forEach((course) => {
              const dish = mealObj[course];
              if (dish) {
                if (y > 270) {
                  doc.addPage();
                  y = 20;
                }
                doc.setFont("helvetica", "bold");
                const cTitle =
                  course === "entree"
                    ? t.starter || "Entrée"
                    : course === "plat"
                      ? t.mainCourse || "Plat"
                      : t.dessert || "Dessert";
                doc.text(`- ${cTitle}:`, 25, y);
                doc.setFont("helvetica", "normal");
                const text = doc.splitTextToSize(
                  dish.nom || dish.name || dish.plat_creatif || "",
                  150,
                );
                doc.text(text, 50, y);
                y += text.length * 6 + 2;
              }
            });
            y += 5;
          }
        };
        renderMeals(jourMenu.dejeuner, t.lunch || "Déjeuner");
        renderMeals(jourMenu.diner, t.dinner || "Dîner");
      } else {
        ["entree", "plat", "dessert"].forEach((type) => {
          const dish = jourMenu[type];
          if (dish) {
            if (y > 270) {
              doc.addPage();
              y = 20;
            }
            doc.setFont("helvetica", "bold");
            doc.text(
              type === "entree"
                ? t.entree || "Entrée"
                : type === "plat"
                  ? t.plat || "Plat"
                  : t.dessert || "Dessert",
              20,
              y,
            );
            y += 6;
            doc.setFont("helvetica", "normal");
            const platText = doc.splitTextToSize(
              dish.nom || dish.name || "",
              170,
            );
            doc.text(platText, 25, y);
            y += platText.length * 6 + 5;
          }
        });
        y += 5;
      }
    });

    doc.save(`${titre.replace(/\s+/g, "_").toLowerCase()}.pdf`);
  };

  const exportToPDF = (fiche: any) => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129); // Emerald 500
    doc.text(t.recipeFT || "FICHE TECHNIQUE", 20, 20);

    doc.setFontSize(16);
    doc.setTextColor(31, 41, 55); // Gray 800
    doc.text(fiche.recette, 20, 35);

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128); // Gray 500
    doc.text(
      `${t.guests || "Couverts"} : ${typeof guestCount !== "undefined" ? guestCount : 1} | ${t.estimatedLoss || "Perte estimée"} : ${fiche.perte || "10%"}`,
      20,
      45,
    );

    doc.setDrawColor(229, 231, 235);
    doc.line(20, 50, 190, 50);

    let y = 60;

    // Allergens
    if (fiche.allergens && fiche.allergens.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text(t.allergens || "Allergènes :", 20, y);
      y += 8;
      doc.setFontSize(10);
      doc.setTextColor(75, 85, 99);
      doc.text(fiche.allergens.join(", "), 20, y);
      y += 15;
    }

    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text(t.requiredIngredients || "Ingrédients requis :", 20, y);

    // Ingredients Table
    const ingredientsList = fiche.ingredients || fiche.fiche_technique || [];
    const count = typeof guestCount !== "undefined" ? guestCount : 1;

    const tableData = ingredientsList.map((ing: any) => {
      const name = ing.name || ing.ingredient;
      const qte = ing.qte || ing.quantite;
      const unit = ing.unit || ing.unite;

      let totalQte = qte * count;
      let displayUnit = unit;

      if ((unit === "g" || unit === "ml") && totalQte >= 1000) {
        totalQte = totalQte / 1000;
        displayUnit = unit === "g" ? "kg" : "L";
      }

      return [
        name,
        `${totalQte.toFixed(unit === "g" || (unit === "ml" && totalQte >= 1) ? 2 : 0)} ${displayUnit}`,
      ];
    });

    autoTable(doc, {
      startY: y + 5,
      head: [[t.ingredient || "Ingrédient", t.quantity || "Quantité"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129] },
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    // Preparation Steps
    if (fiche.preparation_steps || fiche.instructions) {
      if (finalY > 250) {
        doc.addPage();
        finalY = 20;
      }
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text(t.preparationSteps || "Étapes de préparation :", 20, finalY);
      finalY += 8;
      doc.setFontSize(10);
      doc.setTextColor(75, 85, 99);
      const stepsText = doc.splitTextToSize(
        fiche.preparation_steps || fiche.instructions || "",
        170,
      );
      doc.text(stepsText, 20, finalY);
    }

    doc.save(`Fiche_Technique_${fiche.recette.replace(/\s+/g, "_")}.pdf`);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    await processFile(file);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await processFile(file);
  };

  const handleGenerateCreative = async (dishType?: "entree" | "plat" | "dessert") => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setCreativeMenu(null); // Reset current category data before starting
    try {
      const response = await fetch("/api/generate-creative-menu", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dishType }),
      });
      const data = await response.json();
      if (data.status === "success") {
        setCreativeMenu(data.creative_menu);
        // Sauvegarde automatique des fiches techniques générées
        const allRecipes: any[] = [];
        data.creative_menu.forEach((day: any) => {
          if (day.dejeuner) {
            if (day.dejeuner.plat_creatif)
              allRecipes.push({ ...day.dejeuner, category: "creative", dish_type: "plat" });
            else {
              if (day.dejeuner.entree)
                allRecipes.push({
                  ...day.dejeuner.entree,
                  category: "creative",
                  dish_type: "entree",
                });
              if (day.dejeuner.plat)
                allRecipes.push({ ...day.dejeuner.plat, category: "creative", dish_type: "plat" });
              if (day.dejeuner.dessert)
                allRecipes.push({
                  ...day.dejeuner.dessert,
                  category: "creative",
                  dish_type: "dessert",
                });
            }
          }
          if (day.diner) {
            if (day.diner.plat_creatif)
              allRecipes.push({ ...day.diner, category: "creative", dish_type: "plat" });
            else {
              if (day.diner.entree)
                allRecipes.push({ ...day.diner.entree, category: "creative", dish_type: "entree" });
              if (day.diner.plat)
                allRecipes.push({ ...day.diner.plat, category: "creative", dish_type: "plat" });
              if (day.diner.dessert)
                allRecipes.push({ ...day.diner.dessert, category: "creative", dish_type: "dessert" });
            }
          }
          // New format without dejeuner/diner wrappers
          if (day.entree)
            allRecipes.push({
              ...day.entree,
              category: "creative",
              dish_type: "entree",
              jour: day.jour,
            });
          if (day.plat)
            allRecipes.push({
              ...day.plat,
              category: "creative",
              dish_type: "plat",
              jour: day.jour,
            });
          if (day.dessert)
            allRecipes.push({
              ...day.dessert,
              category: "creative",
              dish_type: "dessert",
              jour: day.jour,
            });
        });
        saveGeneratedRecipes(allRecipes);
      } else {
        alert(
          "Erreur lors de la création : " +
            (data.error || data.message || "Erreur serveur ou IA"),
        );
      }
    } catch (error) {
      console.error("Erreur backend:", error);
      alert(
        "Erreur de connexion au serveur IA (Ollama).",
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateGastronomic = async (dishType?: "entree" | "plat" | "dessert") => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setGastronomicMenu(null);
    try {
      const response = await fetch("/api/generate-gastronomic-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dishType }),
      });
      const data = await response.json();
      if (data.status === "success") {
        setGastronomicMenu(data.gastronomic_menu);
        // Sauvegarde automatique
        const allRecipes: any[] = [];
        data.gastronomic_menu.slice(0, 1).forEach((menu: any) => {
          if (menu.entree)
            allRecipes.push({ ...menu.entree, category: "gastronomic", dish_type: "entree" });
          if (menu.plat)
            allRecipes.push({ ...menu.plat, category: "gastronomic", dish_type: "plat" });
          if (menu.dessert)
            allRecipes.push({ ...menu.dessert, category: "gastronomic", dish_type: "dessert" });
        });
        saveGeneratedRecipes(allRecipes);
      } else {
        alert(
          "Erreur lors de la création : " +
            (data.error || data.message || "Erreur serveur ou IA"),
        );
      }
    } catch (error) {
      console.error("Erreur backend:", error);
      alert("Erreur de connexion au serveur de l'IA.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateTraditional = async (dishType?: "entree" | "plat" | "dessert") => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setTraditionalMenu(null);
    try {
      const response = await fetch("/api/generate-traditional-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week: selectedWeek, dishType }),
      });
      const data = await response.json();
      if (data.status === "success") {
        setTraditionalMenu(data.traditional_menu);
        const allRecipes: any[] = [];
        data.traditional_menu.forEach((day: any) => {
          if (day.entree)
            allRecipes.push({
              ...day.entree,
              category: "traditional",
              dish_type: "entree",
              id: `entree-${day.jour}-${Date.now()}`,
            });
          if (day.plat)
            allRecipes.push({
              ...day.plat,
              category: "traditional",
              dish_type: "plat",
              id: `plat-${day.jour}-${Date.now()}`,
            });
          if (day.dessert)
            allRecipes.push({
              ...day.dessert,
              category: "traditional",
              dish_type: "dessert",
              id: `dessert-${day.jour}-${Date.now()}`,
            });
        });
        saveGeneratedRecipes(allRecipes);
      } else {
        alert(
          "Erreur lors de la création : " +
            (data.error || data.message || "Erreur serveur ou IA"),
        );
      }
    } catch (error) {
      console.error("Erreur backend:", error);
      alert("Erreur de connexion au serveur de l'IA.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processFile = async (file: File) => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);

    // Reset data based on mode
    if (analysisMode === "decompose") setFichesTechniques(null);
    else setCreativeMenu(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("week", selectedWeek.toString());
    formData.append(
      "rotation_data",
      JSON.stringify(MENU_ROTATION[selectedWeek as keyof typeof MENU_ROTATION]),
    );

    try {
      if (analysisMode === "decompose") {
        const response = await fetch("/api/analyze-menu", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (data.status === "success") {
          setFichesTechniques(data.fiches_techniques);
          saveGeneratedRecipes(data.fiches_techniques);
        } else {
          alert(
            "Erreur lors de l'analyse : " +
              (data.error || data.message || "Erreur serveur ou IA"),
          );
        }
      } else if (analysisMode === "creative") {
        const response = await fetch("/api/generate-creative-menu", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (data.status === "success") {
          setCreativeMenu(data.creative_menu);
          const allRecipes: any[] = [];
          data.creative_menu.forEach((day: any) => {
            if (day.dejeuner) {
              if (day.dejeuner.plat_creatif) allRecipes.push(day.dejeuner);
              else {
                if (day.dejeuner.entree) allRecipes.push(day.dejeuner.entree);
                if (day.dejeuner.plat) allRecipes.push(day.dejeuner.plat);
                if (day.dejeuner.dessert) allRecipes.push(day.dejeuner.dessert);
              }
            }
            if (day.diner) {
              if (day.diner.plat_creatif) allRecipes.push(day.diner);
              else {
                if (day.diner.entree) allRecipes.push(day.diner.entree);
                if (day.diner.plat) allRecipes.push(day.diner.plat);
                if (day.diner.dessert) allRecipes.push(day.diner.dessert);
              }
            }
            // New format without dejeuner/diner wrappers
            if (day.entree)
              allRecipes.push({
                ...day.entree,
                category: "creative",
                jour: day.jour,
              });
            if (day.plat)
              allRecipes.push({
                ...day.plat,
                category: "creative",
                jour: day.jour,
              });
            if (day.dessert)
              allRecipes.push({
                ...day.dessert,
                category: "creative",
                jour: day.jour,
              });
          });
          saveGeneratedRecipes(allRecipes);
        } else {
          alert(
            "Erreur lors de la création : " +
              (data.error || data.message || "Erreur serveur ou IA"),
          );
        }
      } else if (analysisMode === "gastronomic") {
        const response = await fetch("/api/generate-gastronomic-menu", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (data.status === "success") {
          setGastronomicMenu(data.gastronomic_menu);
          const allRecipes: any[] = [];
          data.gastronomic_menu.forEach((menu: any) => {
            if (menu.entree) allRecipes.push(menu.entree);
            if (menu.plat) allRecipes.push(menu.plat);
            if (menu.dessert) allRecipes.push(menu.dessert);
          });
          saveGeneratedRecipes(allRecipes);
        } else {
          alert(
            "Erreur lors de la création : " +
              (data.error || data.message || "Erreur serveur ou IA"),
          );
        }
      } else {
        // Mode traditionnel
        const response = await fetch("/api/generate-traditional-menu", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (data.status === "success") {
          setTraditionalMenu(data.traditional_menu);
          const allRecipes: any[] = [];
          data.traditional_menu.forEach((day: any) => {
            if (day.entree) allRecipes.push(day.entree);
            if (day.plat) allRecipes.push(day.plat);
            if (day.dessert) allRecipes.push(day.dessert);
          });
          saveGeneratedRecipes(allRecipes);
        } else {
          alert(
            "Erreur lors de la création : " +
              (data.error || data.message || "Erreur serveur ou IA"),
          );
        }
      }
    } catch (error) {
      console.error("Erreur backend:", error);
      alert(
        "Erreur de connexion au serveur IA (Ollama).",
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveFicheToBook = async (fiche: any) => {
    try {
      const recipe = {
        name: fiche.recette || "Nouvelle Recette",
        category: fiche.categorie || fiche.jour || "Non classé",
        ingredients: (fiche.ingredients || []).map((ing: any) => ({
          inventory_name: ing.name || ing.ingredient,
          quantity_per_person: ing.qte || ing.quantite || 0,
          inventory_id: null
        })),
        preparation_steps: fiche.etapes || [{ step_order: 1, instructions: "À définir" }]
      };
      
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });

      if (res.ok) {
        alert("Fiche technique enregistrée dans le Livre de recettes !");
      } else {
        alert("Erreur lors de l'enregistrement de la fiche.");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur de connexion.");
    }
  };

  return (
    <div className="led-glow-container h-full flex flex-col animate-in fade-in duration-500 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 blur-[100px] rounded-full pointer-events-none"></div>

      <div className="flex justify-between items-center mb-10 relative z-10 p-8">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">
            {t.menuEngineering || "Ingénierie des Menus"}
          </h2>
          <p className="text-slate-500 mt-1">
            {t.menuAnalysisSubtitle ||
              "Analyse intelligente et planification stratégique de l'IA"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {analysisMode && !isAnalyzing && (
            <button
              onClick={() => {
                setAnalysisMode(null);
                setFichesTechniques(null);
                setCreativeMenu(null);
                setGastronomicMenu(null);
                setTraditionalMenu(null);
              }}
              className="px-6 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl text-sm font-bold hover:bg-white/10 transition-all"
            >
              {t.backToModes || "Retour aux modes"}
            </button>
          )}
        </div>
      </div>

      {!analysisMode ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-7xl">
            <motion.div
              whileHover={{ y: -5, scale: 1.02 }}
              onClick={() => {
                setAnalysisMode("decompose");
                setFichesTechniques(null);
                setCreativeMenu(null);
                setGastronomicMenu(null);
                setTraditionalMenu(null);
              }}
              className="glass-panel p-6 relative overflow-hidden group cursor-pointer transition-all duration-500 led-glow-emerald border-brand-500/30 flex flex-col min-h-[280px] max-h-[350px]"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
                <UploadCloud className="w-10 h-10 text-brand-500" />
              </div>
              <h3 className="text-caption font-bold text-slate-500 uppercase tracking-widest mb-3">
                {t.mode01 || "Mode 01"}
              </h3>
              <h4 className="text-lg font-black text-white tracking-tighter mb-2">
                {t.modeDecompose || "Décomposition Menu"}
              </h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {t.modeDecomposeDesc ||
                  "Analysez vos menus existants et générez automatiquement les fiches techniques."}
              </p>
              <div className="mt-auto pt-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></div>
                <span className="text-caption font-mono text-slate-500 uppercase tracking-widest">
                  {t.aiAnalysisActive || "IA Analyse Active"}
                </span>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -5, scale: 1.02 }}
              onClick={() => {
                setAnalysisMode("creative");
                setFichesTechniques(null);
                setCreativeMenu(null);
                setGastronomicMenu(null);
                setTraditionalMenu(null);
              }}
              className="glass-panel p-6 relative overflow-hidden group cursor-pointer transition-all duration-500 border-blue-500/30 hover:border-blue-500/50 shadow-[0_0_25px_rgba(59,130,246,0.15)] hover:shadow-[0_0_40px_rgba(59,130,246,0.25)] flex flex-col min-h-[280px] max-h-[350px]"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
                <Clock className="w-10 h-10 text-blue-500" />
              </div>
              <h3 className="text-caption font-bold text-slate-500 uppercase tracking-widest mb-3">
                {t.mode02 || "Mode 02"}
              </h3>
              <h4 className="text-lg font-black text-white tracking-tighter mb-2">
                {t.modeCreative || "Cuisine Créative"}
              </h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {t.modeCreativeDesc ||
                  "Cuisine d'auteur, associations audacieuses et techniques d'avant-garde."}
              </p>
              <div className="mt-auto pt-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                <span className="text-caption font-mono text-slate-500 uppercase tracking-widest">
                  {t.creativeConcept || "Concept Créatif"}
                </span>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -5, scale: 1.02 }}
              onClick={() => {
                setAnalysisMode("gastronomic");
                setFichesTechniques(null);
                setCreativeMenu(null);
                setGastronomicMenu(null);
                setTraditionalMenu(null);
              }}
              className="glass-panel p-6 relative overflow-hidden group cursor-pointer transition-all duration-500 border-purple-500/30 hover:border-purple-500/50 shadow-[0_0_25px_rgba(168,85,247,0.15)] hover:shadow-[0_0_40px_rgba(168,85,247,0.25)] flex flex-col min-h-[280px] max-h-[350px]"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
                <Sparkles className="w-10 h-10 text-purple-500" />
              </div>
              <h3 className="text-caption font-bold text-slate-500 uppercase tracking-widest mb-3">
                {t.mode03 || "Mode 03"}
              </h3>
              <h4 className="text-lg font-black text-white tracking-tighter mb-2">
                {t.modeGastronomic || "Haute Gastronomie"}
              </h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {t.modeGastronomicDesc ||
                  "Créez des plats élaborés et des menus signatures avec l'aide de l'IA créative."}
              </p>
              <div className="mt-auto pt-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></div>
                <span className="text-caption font-mono text-slate-500 uppercase tracking-widest">
                  {t.highGastronomy || "Haute Gastronomie"}
                </span>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -5, scale: 1.02 }}
              onClick={() => {
                setAnalysisMode("traditional");
                setFichesTechniques(null);
                setCreativeMenu(null);
                setGastronomicMenu(null);
                setTraditionalMenu(null);
              }}
              className="glass-panel p-6 relative overflow-hidden group cursor-pointer transition-all duration-500 border-amber-500/30 hover:border-amber-500/50 shadow-[0_0_25px_rgba(245,158,11,0.15)] hover:shadow-[0_0_40px_rgba(245,158,11,0.25)] flex flex-col min-h-[280px] max-h-[350px]"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-40 transition-opacity">
                <ChefHat className="w-10 h-10 text-amber-500" />
              </div>
              <h3 className="text-caption font-bold text-slate-500 uppercase tracking-widest mb-3">
                {t.mode04 || "Mode 04"}
              </h3>
              <h4 className="text-lg font-black text-white tracking-tighter mb-2">
                {t.modeTraditional || "Bistro Chic"}
              </h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {t.modeTraditionalDesc ||
                  "Générez des menus hebdomadaires équilibrés et classiques."}
              </p>
              <div className="mt-auto pt-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                <span className="text-caption font-mono text-slate-500 uppercase tracking-widest">
                  {t.traditionalCooking || "Cuisine Bistro Chic"}
                </span>
              </div>
            </motion.div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-auto custom-scrollbar">
          {(!fichesTechniques && analysisMode === "decompose") ||
          (!creativeMenu && analysisMode === "creative") ||
          (!gastronomicMenu && analysisMode === "gastronomic") ||
          (!traditionalMenu && analysisMode === "traditional") ? (
            <div className="flex-1 flex flex-col lg:flex-row gap-8 overflow-hidden">
              <div
                onDragOver={
                  analysisMode === "decompose" ? handleDragOver : undefined
                }
                onDragLeave={
                  analysisMode === "decompose" ? handleDragLeave : undefined
                }
                onDrop={analysisMode === "decompose" ? handleDrop : undefined}
                className={`flex-1 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all duration-500 relative group bg-black ${
                  isDragging && analysisMode === "decompose"
                    ? "border-brand-500 bg-brand-500/5 scale-[1.01]"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                {isAnalyzing ? (
                  <div className="text-center">
                    <div
                      className={`w-20 h-20 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-8 ${analysisMode === "decompose" ? "border-brand-500" : analysisMode === "creative" ? "border-blue-500" : analysisMode === "gastronomic" ? "border-purple-500" : "border-amber-500"}`}
                    ></div>
                    <p
                      className={`font-black text-2xl tracking-tighter ${analysisMode === "decompose" ? "text-brand-500" : analysisMode === "creative" ? "text-blue-500" : analysisMode === "gastronomic" ? "text-purple-500" : "text-amber-500"}`}
                    >
                      {analysisMode === "decompose"
                        ? t.analysisInProgress || "ANALYSE EN COURS..."
                        : analysisMode === "creative"
                          ? t.generatingCreative ||
                            "L'IA GÉNÈRE VOTRE MENU..."
                          : analysisMode === "gastronomic"
                            ? t.creatingGastronomic ||
                              "CRÉATION GASTRONOMIQUE..."
                            : t.generatingTraditional ||
                              "GÉNÉRATION BISTRO CHIC..."}
                    </p>
                    <p className="mt-3 text-slate-500 font-medium max-w-xs mx-auto">
                      {analysisMode === "decompose"
                        ? t.decomposeAnalysisDesc ||
                          "Extraction des données et génération des fiches techniques."
                        : analysisMode === "creative"
                          ? t.creativeAnalysisDesc ||
                            "Optimisation nutritionnelle et créative basée sur le cycle de 4 semaines."
                          : analysisMode === "gastronomic"
                            ? t.gastronomicAnalysisDesc ||
                              "Élaboration de recettes complexes et raffinées par l'IA."
                            : t.traditionalAnalysisDesc ||
                              "Préparation de menus classiques et conviviaux."}
                    </p>
                  </div>
                ) : analysisMode === "decompose" ? (
                  <div className="text-center p-10">
                    <div
                      className={`w-24 h-24 mx-auto mb-8 rounded-3xl flex items-center justify-center transition-all duration-500 shadow-2xl ${isDragging ? "bg-brand-500 text-obsidian rotate-12" : "bg-white/5 text-slate-500 group-hover:text-brand-500 group-hover:scale-110"}`}
                    >
                      <UploadCloud className="w-12 h-12" />
                    </div>
                    <h3 className="font-black text-2xl text-white tracking-tight mb-3">
                      {t.importMenu || "Importer un Menu"}
                    </h3>
                    <p className="text-slate-500 max-w-xs mx-auto leading-relaxed mb-10">
                      {t.importMenuDesc ||
                        "Glissez votre fichier ici ou utilisez le bouton ci-dessous. PDF, Excel, Word ou Images supportés."}
                    </p>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                      accept=".pdf,.xlsx,.docx,image/*"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-10 py-4 bg-white text-obsidian rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-brand-500 transition-all shadow-xl active:scale-95"
                    >
                      {t.browseFiles || "Parcourir les fichiers"}
                    </button>
                  </div>
                ) : analysisMode === "creative" ? (
                  <div className="text-center p-10 w-full max-w-lg">
                    <div className="w-24 h-24 mx-auto mb-8 rounded-3xl flex items-center justify-center bg-blue-500/10 text-blue-500 shadow-2xl ring-1 ring-blue-500/20">
                      <Sparkles className="w-12 h-12" />
                    </div>
                    <h3 className="font-black text-2xl text-white tracking-tight mb-4">
                      {t.creativeConcept || "Concept Créatif"}
                    </h3>
                    <p className="text-slate-400 font-medium mb-10 leading-relaxed max-w-sm mx-auto">
                      {t.creativeAnalysisDesc ||
                        "L'IA va élaborer 1 menu créatif signature inspiré de la Cuisine du Monde."}
                    </p>

                    <div className="grid grid-cols-3 gap-4">
                      <button
                        onClick={() => handleGenerateCreative("entree")}
                        className="w-full py-4 bg-blue-600/20 border border-blue-500/50 text-blue-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-xl hover:led-glow-blue active:scale-[0.98]"
                      >
                        {t.starter || "Entrée"}
                      </button>
                      <button
                        onClick={() => handleGenerateCreative("plat")}
                        className="w-full py-4 bg-blue-600/20 border border-blue-500/50 text-blue-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-xl hover:led-glow-blue active:scale-[0.98]"
                      >
                        {t.mainCourse || "Plat"}
                      </button>
                      <button
                        onClick={() => handleGenerateCreative("dessert")}
                        className="w-full py-4 bg-blue-600/20 border border-blue-500/50 text-blue-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-xl hover:led-glow-blue active:scale-[0.98]"
                      >
                        {t.dessert || "Dessert"}
                      </button>
                    </div>
                  </div>
                ) : analysisMode === "gastronomic" ? (
                  <div className="text-center p-10 w-full max-w-lg">
                    <div className="w-24 h-24 mx-auto mb-8 rounded-3xl flex items-center justify-center bg-purple-500/10 text-purple-500 shadow-2xl ring-1 ring-purple-500/20">
                      <Sparkles className="w-12 h-12" />
                    </div>
                    <h3 className="font-black text-2xl text-white tracking-tight mb-8">
                      {t.highGastronomy || "Haute Gastronomie"}
                    </h3>
                    <p className="text-slate-500 mb-10">
                      {t.gastronomicAIPrompt ||
                        "L'IA va élaborer 1 menu signature complet avec des techniques avancées."}
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      <button
                        onClick={() => handleGenerateGastronomic("entree")}
                        className="w-full py-4 bg-purple-600/20 border border-purple-500/50 text-purple-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all shadow-xl hover:led-glow-purple active:scale-[0.98]"
                      >
                        {t.starter || "Entrée"}
                      </button>
                      <button
                        onClick={() => handleGenerateGastronomic("plat")}
                        className="w-full py-4 bg-purple-600/20 border border-purple-500/50 text-purple-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all shadow-xl hover:led-glow-purple active:scale-[0.98]"
                      >
                        {t.mainCourse || "Plat"}
                      </button>
                      <button
                        onClick={() => handleGenerateGastronomic("dessert")}
                        className="w-full py-4 bg-purple-600/20 border border-purple-500/50 text-purple-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all shadow-xl hover:led-glow-purple active:scale-[0.98]"
                      >
                        {t.dessert || "Dessert"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-10 w-full max-w-lg">
                    <div className="w-24 h-24 mx-auto mb-8 rounded-3xl flex items-center justify-center bg-amber-500/10 text-amber-500 shadow-2xl ring-1 ring-amber-500/20">
                      <ChefHat className="w-12 h-12" />
                    </div>
                    <h3 className="font-black text-2xl text-white tracking-tight mb-8">
                      {t.modeTraditional || "Bistro Chic"}
                    </h3>
                    <p className="text-slate-500 mb-10">
                      {t.traditionalRecipesPrompt ||
                        "L'IA va élaborer des menus hebdomadaires de bistronomie."}
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      <button
                        onClick={() => handleGenerateTraditional("entree")}
                        className="w-full py-4 bg-amber-600/20 border border-amber-500/50 text-amber-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all shadow-xl hover:led-glow-amber active:scale-[0.98]"
                      >
                        {t.starter || "Entrée"}
                      </button>
                      <button
                        onClick={() => handleGenerateTraditional("plat")}
                        className="w-full py-4 bg-amber-600/20 border border-amber-500/50 text-amber-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all shadow-xl hover:led-glow-amber active:scale-[0.98]"
                      >
                        {t.mainCourse || "Plat"}
                      </button>
                      <button
                        onClick={() => handleGenerateTraditional("dessert")}
                        className="w-full py-4 bg-amber-600/20 border border-amber-500/50 text-amber-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all shadow-xl hover:led-glow-amber active:scale-[0.98]"
                      >
                        {t.dessert || "Dessert"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {analysisMode === "creative" && !isAnalyzing && (
                <div className="w-full lg:w-80 bg-white/[0.02] border border-white/5 rounded-3xl p-6 overflow-y-auto custom-scrollbar">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-6 tracking-widest">
                    {t.basePlan || "Inspirations"}
                  </h4>
                  <div className="space-y-4">
                    <div className="p-6 rounded-3xl bg-blue-500/5 border border-blue-500/10 text-center">
                      <Sparkles className="w-8 h-8 text-blue-400 mx-auto mb-4" />
                      <p className="text-sm text-slate-400 leading-relaxed italic">
                        {settings.language === "fr"
                          ? "La génération créative ne suit plus de cycle fixe pour garantir une exclusivité totale à chaque service."
                          : settings.language === "es"
                            ? "La generación creativa ya no sigue un ciclo fijo para garantizar la exclusividad total de cada servicio."
                            : settings.language === "de"
                              ? "Die kreative Generierung folgt keinem festen Zyklus mehr, um für jeden Service absolute Exklusivität zu gewährleisten."
                              : "Creative generation no longer follows a fixed cycle to ensure total exclusivity for each service."}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : analysisMode === "decompose" && fichesTechniques ? (
            <div className="flex-1 overflow-auto pr-2">
              <div className="flex items-center mb-8 text-emerald-700 bg-emerald-50/80 p-5 rounded-2xl ring-1 ring-emerald-500/20">
                <div className="bg-emerald-500 text-white p-2 rounded-full mr-4 shadow-lg shadow-black/20">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-lg tracking-tight">
                    {t.analysisSuccess || "Analyse terminée avec succès"}
                  </p>
                  <p className="text-emerald-600/90 mt-0.5">
                    {(
                      t.recipesIdentified ||
                      "{count} recettes identifiées et décomposées."
                    ).replace("{count}", fichesTechniques.length.toString())}
                  </p>
                </div>
                <button
                  onClick={() => setFichesTechniques(null)}
                  className="ml-auto px-4 py-2 bg-black border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium hover:bg-emerald-50 transition-colors shadow-lg shadow-black/20"
                >
                  {t.analyzeAnother || "Analyser un autre menu"}
                </button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {fichesTechniques.map((fiche: any, idx) => (
                  <div
                    key={idx}
                    className="border border-white/10 rounded-2xl p-6 bg-black shadow-lg shadow-black/20 hover:shadow-md transition-shadow duration-300"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center">
                        <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl mr-4">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-xl text-white tracking-tight">
                            {fiche.recette}
                          </h3>
                          {(fiche.jour || fiche.categorie) && (
                            <div className="flex gap-2 mt-2">
                              {fiche.jour && (
                                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] font-bold rounded uppercase tracking-widest">
                                  {translateDay(fiche.jour)}
                                </span>
                              )}
                              {fiche.categorie && (
                                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded uppercase tracking-widest">
                                  {fiche.categorie}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => exportToPDF(fiche)}
                          className="p-2.5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-colors ring-1 ring-transparent hover:ring-emerald-500/30"
                          title={t.download || "Exporter en PDF"}
                        >
                          <Download className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleSaveFicheToBook(fiche)}
                          className="p-2.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-colors ring-1 ring-transparent hover:ring-blue-500/30"
                          title={
                            t.saveToBook ||
                            "Enregistrer dans le livre des recettes"
                          }
                        >
                          <Bookmark className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() =>
                            setFichesTechniques(
                              fichesTechniques.filter((_, i) => i !== idx),
                            )
                          }
                          className="p-2.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors ring-1 ring-transparent hover:ring-red-500/30"
                          title={t.delete || "Supprimer"}
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm text-slate-500 mb-2 p-4 bg-[#0A0A0A] rounded-xl border border-white/5">
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">
                          {t.status || "Statut"}
                        </span>
                        <span className="font-bold text-emerald-500 text-sm">
                          {t.readyForFT || "Prêt pour Fiche Technique"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : analysisMode === "creative" && creativeMenu ? (
            <div className="flex-1 overflow-auto pr-2">
              <div className="flex items-center mb-8 text-white bg-black/40 p-6 rounded-3xl ring-1 ring-white/10 led-glow-blue-subtle group hover:led-glow-blue transition-all duration-500">
                <div className="bg-blue-500/20 text-blue-400 p-3 rounded-2xl mr-5 shadow-inner ring-1 ring-blue-500/30">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-black text-xl tracking-tight text-white">
                    {t.creativeMenuGenerated || "Menu Créatif Généré"}
                  </p>
                  <p className="text-slate-500 mt-1 text-sm font-medium">
                    {t.ftDedicatedTab ||
                      "Les fiches techniques sont disponibles dans l'onglet dédié."}
                  </p>
                </div>
                <div className="ml-auto flex gap-3">
                  <button
                    onClick={() => setCreativeMenu(null)}
                    className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all shadow-2xl active:scale-95"
                  >
                    {t.generateAnother || "Générer un autre menu"}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">
                {creativeMenu
                  .filter(
                    (m) =>
                      m.entree || m.plat || m.dessert || m.dejeuner || m.diner,
                  )
                  .map((jourMenu, idx) => (
                    <div
                      key={idx}
                      className="border border-white/10 rounded-3xl p-8 bg-black shadow-xl shadow-black/40 hover:shadow-2xl transition-shadow duration-300 relative overflow-hidden ring-1 ring-white/5"
                    >
                      <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Sparkles className="w-48 h-48 text-blue-500" />
                      </div>
                      <div className="relative z-10">
                        <h3 className="font-bold text-2xl text-white tracking-tight mb-8 border-b border-white/10 pb-4 flex items-center justify-between">
                          <div className="flex items-center">
                            <span className="bg-blue-500/20 text-blue-400 px-4 py-2 rounded-xl mr-3 text-sm font-black uppercase tracking-wider">
                              {jourMenu.jour
                                ? translateDay(jourMenu.jour)
                                : t.creativeMenuGenerated || "MENU CRÉATIF"}
                            </span>
                          </div>
                        </h3>

                        <div className="space-y-6">
                          {jourMenu.dejeuner && (
                            <div className="bg-[#0A0A0A] p-4 rounded-xl ring-1 ring-white/5 space-y-3">
                              <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                  {t.lunch || "Déjeuner"}
                                </span>
                              </div>

                              {/* Backward compatibility for old format */}
                              {jourMenu.dejeuner.plat_creatif && (
                                <div>
                                  <p className="text-slate-300 font-medium leading-relaxed">
                                    {jourMenu.dejeuner.plat_creatif}
                                  </p>
                                  {jourMenu.dejeuner.allergens &&
                                    !!jourMenu.dejeuner.allergens.length && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {jourMenu.dejeuner.allergens.map(
                                          (all: string, i: number) => (
                                            <span
                                              key={i}
                                              className="text-caption font-bold uppercase tracking-wider px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded"
                                            >
                                              {all}
                                            </span>
                                          ),
                                        )}
                                      </div>
                                    )}
                                </div>
                              )}

                              {/* New format */}
                              {["entree", "plat", "dessert"].map((course) => {
                                const item = jourMenu.dejeuner[course];
                                if (!item)
                                  return (
                                    <div
                                      key={course}
                                      className="mb-2 opacity-40"
                                    >
                                      <span className="text-[10px] text-blue-400/80 uppercase font-black tracking-widest block mb-1">
                                        {course === "entree"
                                          ? t.starter || "Entrée"
                                          : course === "plat"
                                            ? t.mainCourse || "Plat"
                                            : t.dessert || "Dessert"}
                                      </span>
                                      <p className="text-slate-500 text-xs italic">
                                        Génération en cours ou indisponible
                                      </p>
                                    </div>
                                  );
                                return (
                                  <div key={course} className="mb-2">
                                    <span className="text-[10px] text-blue-400/80 uppercase font-black tracking-widest block mb-1">
                                      {course === "entree"
                                        ? t.starter || "Entrée"
                                        : course === "plat"
                                          ? t.mainCourse || "Plat"
                                          : t.dessert || "Dessert"}
                                    </span>
                                    <p className="text-slate-300 font-medium leading-relaxed">
                                      {item.nom ||
                                        item.name ||
                                        item.plat_creatif ||
                                        "Nom à générer..."}
                                    </p>
                                    {item.allergens &&
                                      !!item.allergens.length && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {item.allergens.map(
                                            (all: string, i: number) => (
                                              <span
                                                key={i}
                                                className="text-caption font-bold uppercase tracking-wider px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded"
                                              >
                                                {all}
                                              </span>
                                            ),
                                          )}
                                        </div>
                                      )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {jourMenu.diner && (
                            <div className="bg-[#0A0A0A] p-4 rounded-xl ring-1 ring-white/5 space-y-3">
                              <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                  {t.dinner || "Dîner"}
                                </span>
                              </div>

                              {/* Backward compatibility */}
                              {jourMenu.diner.plat_creatif && (
                                <div>
                                  <p className="text-slate-300 font-medium leading-relaxed">
                                    {jourMenu.diner.plat_creatif}
                                  </p>
                                  {jourMenu.diner.allergens &&
                                    !!jourMenu.diner.allergens.length && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {jourMenu.diner.allergens.map(
                                          (all: string, i: number) => (
                                            <span
                                              key={i}
                                              className="text-caption font-bold uppercase tracking-wider px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded"
                                            >
                                              {all}
                                            </span>
                                          ),
                                        )}
                                      </div>
                                    )}
                                </div>
                              )}

                              {/* New format */}
                              {["entree", "plat", "dessert"].map((course) => {
                                const item = jourMenu.diner[course];
                                if (!item)
                                  return (
                                    <div
                                      key={course}
                                      className="mb-2 opacity-40"
                                    >
                                      <span className="text-[10px] text-blue-400/80 uppercase font-black tracking-widest block mb-1">
                                        {course === "entree"
                                          ? t.starter || "Entrée"
                                          : course === "plat"
                                            ? t.mainCourse || "Plat"
                                            : t.dessert || "Dessert"}
                                      </span>
                                      <p className="text-slate-500 text-xs italic">
                                        Génération en cours ou indisponible
                                      </p>
                                    </div>
                                  );
                                return (
                                  <div key={course} className="mb-2">
                                    <span className="text-[10px] text-blue-400/80 uppercase font-black tracking-widest block mb-1">
                                      {course === "entree"
                                        ? t.starter || "Entrée"
                                        : course === "plat"
                                          ? t.mainCourse || "Plat"
                                          : t.dessert || "Dessert"}
                                    </span>
                                    <p className="text-slate-300 font-medium leading-relaxed">
                                      {item.nom ||
                                        item.name ||
                                        item.plat_creatif ||
                                        "Nom à générer..."}
                                    </p>
                                    {item.allergens &&
                                      !!item.allergens.length && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {item.allergens.map(
                                            (all: string, i: number) => (
                                              <span
                                                key={i}
                                                className="text-caption font-bold uppercase tracking-wider px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded"
                                              >
                                                {all}
                                              </span>
                                            ),
                                          )}
                                        </div>
                                      )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {!jourMenu.dejeuner &&
                            !jourMenu.diner &&
                            (jourMenu.entree ||
                              jourMenu.plat ||
                              jourMenu.dessert) && (
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {["entree", "plat", "dessert"].map((course) => {
                                  const item =
                                    jourMenu[course as keyof typeof jourMenu];
                                  if (!item)
                                    return (
                                      <div
                                        key={course}
                                        className="bg-[#0A0A0A] p-6 rounded-2xl ring-1 ring-white/5 flex flex-col items-center justify-center h-full min-h-[120px] opacity-30"
                                      >
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                          {course === "entree"
                                            ? t.entree
                                            : course === "plat"
                                              ? t.plat
                                              : t.dessert}
                                        </p>
                                        <p className="text-xs mt-2 italic text-slate-600">
                                          Génération en cours ou indisponible
                                        </p>
                                      </div>
                                    );
                                  return (
                                    <div
                                      key={course}
                                      className="bg-[#0A0A0A] p-6 rounded-2xl ring-1 ring-white/10 flex flex-col h-full hover:ring-blue-500/50 transition-all"
                                    >
                                      <p className="text-[11px] font-black text-blue-400 uppercase tracking-widest mb-3 flex-shrink-0">
                                        {course === "entree"
                                          ? t.entree
                                          : course === "plat"
                                            ? t.plat
                                            : t.dessert}
                                      </p>
                                      <h4 className="text-white font-bold text-lg leading-snug flex-1">
                                        {item.nom ||
                                          item.name ||
                                          item.plat_creatif ||
                                          "Nom à générer..."}
                                      </h4>
                                      {item.allergens &&
                                        !!item.allergens.length && (
                                          <div className="mt-6 flex flex-wrap gap-1.5 flex-shrink-0">
                                            {item.allergens.map(
                                              (all: string, i: number) => (
                                                <span
                                                  key={i}
                                                  className="text-caption font-bold uppercase tracking-wider px-2 py-1 bg-red-500/10 text-red-500 rounded"
                                                >
                                                  {all}
                                                </span>
                                              ),
                                            )}
                                          </div>
                                        )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : analysisMode === "gastronomic" && gastronomicMenu ? (
            <div className="flex-1 overflow-auto pr-2">
              <div className="flex items-center mb-8 text-white bg-black/40 p-6 rounded-3xl ring-1 ring-white/10 led-glow-purple-subtle group hover:led-glow-purple transition-all duration-500">
                <div className="bg-purple-500/20 text-purple-400 p-3 rounded-2xl mr-5 shadow-inner ring-1 ring-purple-500/30">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-black text-xl tracking-tight text-white">
                    {t.gastronomicMenusGenerated ||
                      "Menus Gastronomiques Générés"}
                  </p>
                  <p className="text-slate-500 mt-1 text-sm font-medium">
                    {t.ftDedicatedTab ||
                      "Les fiches techniques sont disponibles dans l'onglet dédié."}
                  </p>
                </div>
                <div className="ml-auto flex gap-3">
                  <button
                    onClick={() => setGastronomicMenu(null)}
                    className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all shadow-2xl active:scale-95"
                  >
                    {t.generateAnother || "Générer d'autres menus"}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">
                {gastronomicMenu
                  .filter((m) => m.entree || m.plat || m.dessert)
                  .slice(0, 1)
                  .map((menu, idx) => (
                    <div
                      key={idx}
                      className="border border-white/10 rounded-3xl p-8 bg-black shadow-xl shadow-black/40 hover:shadow-2xl transition-shadow duration-300 relative overflow-hidden ring-1 ring-white/5"
                    >
                      <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Sparkles className="w-48 h-48 text-purple-500" />
                      </div>
                      <div className="relative z-10">
                        <h3 className="font-bold text-2xl text-white tracking-tight mb-8 border-b border-white/10 pb-4 flex items-center justify-between">
                          <div className="flex items-center">
                            <span className="bg-purple-500/20 text-purple-400 px-4 py-2 rounded-xl mr-3 text-sm font-black uppercase tracking-wider">
                              {menu.jour
                                ? translateDay(menu.jour)
                                : t.chefMenu || "MENU DU CHEF"}
                            </span>
                          </div>
                        </h3>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          {["entree", "plat", "dessert"].map((type) => {
                            const dish = (menu as any)[type];
                            if (!dish)
                              return (
                                <div
                                  key={type}
                                  className="bg-[#0A0A0A] p-6 rounded-2xl ring-1 ring-white/5 flex flex-col items-center justify-center h-full min-h-[120px] opacity-30"
                                >
                                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {type === "entree"
                                      ? t.entree
                                      : type === "plat"
                                        ? t.plat
                                        : t.dessert}
                                  </p>
                                  <p className="text-xs mt-2 italic text-slate-600">
                                    Génération en cours ou indisponible
                                  </p>
                                </div>
                              );
                            return (
                              <div
                                key={type}
                                className="bg-[#0A0A0A] p-6 rounded-2xl ring-1 ring-white/10 flex flex-col h-full hover:ring-purple-500/50 transition-all"
                              >
                                <p className="text-[11px] font-black text-purple-400 uppercase tracking-widest mb-3 flex-shrink-0">
                                  {type === "entree"
                                    ? t.entree
                                    : type === "plat"
                                      ? t.plat
                                      : t.dessert}
                                </p>
                                <h4 className="text-white font-bold text-lg leading-snug flex-1">
                                  {dish.nom ||
                                    dish.name ||
                                    dish.plat_creatif ||
                                    "Nom à générer..."}
                                </h4>
                                {dish.allergens && !!dish.allergens.length && (
                                  <div className="mt-6 flex flex-wrap gap-1.5 flex-shrink-0">
                                    {dish.allergens.map(
                                      (all: string, i: number) => (
                                        <span
                                          key={i}
                                          className="text-caption font-bold uppercase tracking-wider px-2 py-1 bg-red-500/10 text-red-500 rounded"
                                        >
                                          {all}
                                        </span>
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : analysisMode === "traditional" && traditionalMenu ? (
            <div className="flex-1 overflow-auto pr-2">
              <div className="flex items-center mb-8 text-white bg-black/40 p-6 rounded-3xl ring-1 ring-white/10 led-glow-amber-subtle group hover:led-glow-amber transition-all duration-500">
                <div className="bg-amber-500/20 text-amber-400 p-3 rounded-2xl mr-5 shadow-inner ring-1 ring-amber-500/30">
                  <ChefHat className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-black text-xl tracking-tight text-white">
                    {t.traditionalMenusGenerated || "Menus Bistro Chic Générés"}
                  </p>
                  <p className="text-slate-500 mt-1 text-sm font-medium">
                    {t.ftDedicatedTab ||
                      "Les fiches techniques sont disponibles dans l'onglet dédié."}
                  </p>
                </div>
                <div className="ml-auto flex gap-3">
                  <button
                    onClick={() => setTraditionalMenu(null)}
                    className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all shadow-2xl active:scale-95"
                  >
                    {t.generateAnother || "Générer d'autres menus"}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">
                {traditionalMenu
                  .filter((m) => m.entree || m.plat || m.dessert)
                  .map((day, idx) => (
                    <div
                      key={idx}
                      className="border border-white/10 rounded-3xl p-8 bg-black shadow-xl shadow-black/40 hover:shadow-2xl transition-shadow duration-300 relative overflow-hidden ring-1 ring-white/5"
                    >
                      <div className="absolute top-0 right-0 p-8 opacity-5">
                        <ChefHat className="w-48 h-48 text-amber-500" />
                      </div>
                      <div className="relative z-10">
                        <h3 className="font-bold text-2xl text-white tracking-tight mb-8 border-b border-white/10 pb-4 flex items-center justify-between">
                          <div className="flex items-center">
                            <span className="bg-amber-500/20 text-amber-400 px-4 py-2 rounded-xl mr-3 text-sm font-black uppercase tracking-wider">
                              {day.jour
                                ? translateDay(day.jour)
                                : "MENU BISTRO"}
                            </span>
                          </div>
                        </h3>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          {["entree", "plat", "dessert"].map((type) => {
                            const dish = (day as any)[type];
                            if (!dish)
                              return (
                                <div
                                  key={type}
                                  className="bg-[#0A0A0A] p-6 rounded-2xl ring-1 ring-white/5 flex flex-col items-center justify-center h-full min-h-[120px] opacity-30"
                                >
                                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {type === "entree"
                                      ? t.entree
                                      : type === "plat"
                                        ? t.plat
                                        : t.dessert}
                                  </p>
                                  <p className="text-xs mt-2 italic text-slate-600">
                                    Génération en cours ou indisponible
                                  </p>
                                </div>
                              );
                            return (
                              <div
                                key={type}
                                className="bg-[#0A0A0A] p-6 rounded-2xl ring-1 ring-white/10 flex flex-col h-full hover:ring-amber-500/50 transition-all"
                              >
                                <p className="text-[11px] font-black text-amber-500 uppercase tracking-widest mb-3 flex-shrink-0">
                                  {type === "entree"
                                    ? t.entree
                                    : type === "plat"
                                      ? t.plat
                                      : t.dessert}
                                </p>
                                <h4 className="text-white font-bold text-lg leading-snug flex-1">
                                  {dish.nom || dish.name || dish.plat_creatif}
                                </h4>
                                {dish.allergens && !!dish.allergens.length && (
                                  <div className="mt-6 flex flex-wrap gap-1.5 flex-shrink-0">
                                    {dish.allergens.map(
                                      (all: string, i: number) => (
                                        <span
                                          key={i}
                                          className="text-caption font-bold uppercase tracking-wider px-2 py-1 bg-red-500/10 text-red-500 rounded"
                                        >
                                          {all}
                                        </span>
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
