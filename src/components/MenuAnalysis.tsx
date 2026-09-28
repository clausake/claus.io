import React, { useRef, useState } from "react";
import {
  Bookmark,
  CheckCircle2,
  ChefHat,
  Download,
  FileText,
  MessageSquareText,
  Salad,
  UploadCloud,
  X,
} from "lucide-react";
import { MENU_ROTATION } from "../data/menuData";
import { LazyMotion, domAnimation } from "motion/react";
import * as motionSlim from "motion/react-m";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useToast } from "./ui/Toast";
import { CulinaryChat } from "./CulinaryChat";
import { parserRecette, type RecetteChat } from "../shared/recette-chat";

// L'onglet « Ingenierie des Menus » (Sprint 16).
//
// Decisions du maitre d'ouvrage (journal 22/09, sprint 14.c ; completee le
// 27/09) : la generation automatique de trois menus (creatif / gastronomique
// / traditionnel, la « diversite ») est ANNULEE. Le chef AFFINE ses recettes
// EN DISCUTANT avec l'assistant culinaire ; les fiches nees de l'echange sont
// rangees par categorie — Entrée, Plat, Dessert — dans TROIS CARTES, pretes
// a etre sauvegardees dans l'onglet Fiches Techniques (le chef valide le
// formulaire : jamais d'ecriture en base sans lui). L'empreinte optique du
// menu papier (« Analyser un menu ») est CONSERVEE.
//
// Une proposition n'entre en carte que si elle se LIT en recette complete
// (parserRecette : null = pas de carte, jamais de fiche inventee).

export type CarteRecette = "entree" | "plat" | "dessert";

interface Proposition {
  id: string;
  contenu: string;
  recette: RecetteChat;
  carte: CarteRecette;
  enregistree: boolean;
}

export function MenuAnalysis({
  setActiveTab,
  t,
  settings,
  showNotification,
  onOuvrirFiche,
}: {
  setActiveTab?: any;
  t: any;
  settings: any;
  showNotification: (m: string, type?: any) => void;
  // Ouvre l'onglet Fiches Techniques avec le formulaire VALIDÉ PAR LE CHEF :
  // la fiche née du chat y est pré-remplie, le chef corrige texte/quantités
  // puis enregistre. Absent = le bouton de sauvegarde reste caché.
  onOuvrirFiche?: (recette: RecetteChat, carte: CarteRecette) => void;
}) {
  const toast = useToast();
  const [vue, setVue] = useState<"chat" | "analyser">("chat");
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fichesTechniques, setFichesTechniques] = useState<any[] | null>(null);
  const [guestCount] = useState<number>(1);
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const carteLabels: Record<CarteRecette, string> = {
    entree: t.starter || "Entrée",
    plat: t.mainCourse || "Plat",
    dessert: t.dessert || "Dessert",
  };

  // A chaque reponse de l'assistant, le chat nous remet son contenu brut :
  // ici on la LIT (parserRecette) et seule une lecture complete devient une
  // carte. Le contenu brut est re-luu a l'ouverture de la fiche : une
  // proposition editee dans le chat par le chef est enregistree dans l'etat
  // OU elle est, pas dans un copie-colle perime.
  const handleProposition = (contenu: string) => {
    const recette = parserRecette(contenu);
    if (!recette) return;
    setPropositions((prev) => {
      if (prev.some((p) => p.contenu === contenu)) return prev;
      return [
        ...prev,
        {
          id: "prop-" + prev.length + "-" + Date.now(),
          contenu,
          recette,
          carte: "plat" as CarteRecette,
          enregistree: false,
        },
      ];
    });
  };

  const ouvrirFormulaire = (p: Proposition) => {
    const recette = parserRecette(p.contenu);
    if (!recette) {
      toast(
        t.ficheIllisible ||
          "Cette proposition n'est plus lisible en fiche complète.",
        "error",
      );
      return;
    }
    if (onOuvrirFiche) {
      onOuvrirFiche(recette, p.carte);
      setPropositions((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, enregistree: true } : x)),
      );
    } else {
      toast(
        t.ongletFichesInjoignable ||
          "L'onglet Fiches Techniques est injoignable depuis cet écran.",
        "error",
      );
    }
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
      toast(
        t.syncFTSuccess ||
          "✅ Fiches techniques synchronisées instantanément avec l'onglet dédié.",
        "success",
      );
    } catch (error) {
      console.error(
        "Erreur lors de la sauvegarde des fiches techniques:",
        error,
      );
    }
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
      `${t.guests || "Couverts"} : ${guestCount} | ${t.estimatedLoss || "Perte estimée"} : ${fiche.perte || "10%"}`,
      20,
      45,
    );

    doc.setDrawColor(229, 231, 235);
    doc.line(20, 50, 190, 50);

    let y = 60;

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

    const ingredientsList = fiche.ingredients || fiche.fiche_technique || [];
    const tableData = ingredientsList.map((ing: any) => {
      const name = ing.name || ing.ingredient;
      const qte = ing.qte || ing.quantite;
      const unit = ing.unit || ing.unite;

      let totalQte = qte * guestCount;
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

  const processFile = async (file: File) => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setFichesTechniques(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("week", "1");
    formData.append(
      "rotation_data",
      JSON.stringify(MENU_ROTATION[1 as keyof typeof MENU_ROTATION]),
    );

    try {
      const response = await fetch("/api/analyze-menu", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.status === "success") {
        setFichesTechniques(data.fiches_techniques);
        saveGeneratedRecipes(data.fiches_techniques);
      } else {
        toast(
          "Erreur lors de l'analyse : " +
            (data.error || data.message || "Erreur serveur ou IA"),
          "error",
        );
      }
    } catch (error) {
      console.error("Erreur backend:", error);
      toast("Erreur de connexion au serveur IA (Ollama).", "error");
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
          inventory_id: null,
        })),
        preparation_steps: fiche.etapes || [
          { step_order: 1, instructions: "À définir" },
        ],
      };

      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });

      if (res.ok) {
        toast(
          t.ficheEnregistree ||
            "Fiche technique enregistrée dans le Livre de recettes !",
          "success",
        );
      } else {
        toast(t.erreurEnregistrement || "Erreur lors de l'enregistrement de la fiche.", "error");
      }
    } catch (e) {
      console.error(e);
      toast(t.erreurConnexion || "Erreur de connexion.", "error");
    }
  };

  return (
    <LazyMotion features={domAnimation}>
      <div className="led-glow-container h-full flex flex-col animate-in fade-in duration-150 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 blur-[100px] rounded-full pointer-events-none"></div>

        <div className="flex justify-between items-center mb-6 relative z-10 p-8 pb-4">
          <div>
            <h2 className="text-3xl font-black text-white tracking-tight">
              {t.menuEngineering || "Ingénierie des Menus"}
            </h2>
            <p className="text-slate-500 mt-1">
              {t.menuChatSubtitle ||
                "Discutez vos recettes avec l'assistant ; les fiches prêtes se rangent en Entrée, Plat, Dessert."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setVue(vue === "chat" ? "analyser" : "chat")}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
            >
              {vue === "chat" ? (
                <>
                  <UploadCloud className="w-4 h-4 text-brand-500" />
                  {t.analyzeMenu || "Analyser un menu"}
                </>
              ) : (
                <>
                  <MessageSquareText className="w-4 h-4 text-emerald-500" />
                  {t.backToChat || "Retour au chat culinaire"}
                </>
              )}
            </button>
          </div>
        </div>

        {vue === "chat" ? (
          <div className="flex-1 flex overflow-hidden px-8 pb-8 gap-6">
            {/* Le chat culinaire : l'atelier ou le chef affine ses recettes. */}
            <div className="flex-1 min-w-0 rounded-3xl border border-white/10 bg-[#0A0A0A] overflow-hidden">
              <CulinaryChat t={t} settings={settings} onProposition={handleProposition} />
            </div>

            {/* Les TROIS cartes : Entree, Plat, Dessert. Une fiche ne part
                dans l'onglet Fiches Techniques que par le geste du chef
                (bouton), et jamais inventee : elle doit se lire complete. */}
            <div className="w-full lg:w-[340px] shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                {t.cartesFichesPretes || "Fiches prêtes à sauvegarder"}
              </h3>
              {(["entree", "plat", "dessert"] as CarteRecette[]).map((carte) => {
                const items = propositions.filter((p) => p.carte === carte);
                const Icon = carte === "entree" ? Salad : carte === "dessert" ? Bookmark : ChefHat;
                const accent =
                  carte === "entree"
                    ? "text-emerald-400 border-emerald-500/30"
                    : carte === "dessert"
                      ? "text-amber-400 border-amber-500/30"
                      : "text-blue-400 border-blue-500/30";
                return (
                  <div
                    key={carte}
                    className={`rounded-2xl border bg-black/60 p-4 ${accent.split(" ")[1]}`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="w-4 h-4" />
                      <span className="text-xs font-black uppercase tracking-widest text-white">
                        {carteLabels[carte]}
                      </span>
                      <span className="ml-auto text-[10px] font-mono text-slate-500">
                        {items.length}
                      </span>
                    </div>
                    {items.length === 0 ? (
                      <p className="text-[11px] text-slate-600 italic">
                        {t.carteVide || "Affinez une recette dans le chat : elle apparaîtra ici."}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {items.map((p) => (
                          <motionSlim.div
                            key={p.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                          >
                            <p className="text-sm font-bold text-white leading-snug">
                              {p.recette.nom || t.sansNom || "Sans nom"}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {p.recette.ingredients.length}{" "}
                              {t.ingredientsLabel || "ingrédients"} ·{" "}
                              {p.recette.etapes.length} {t.etapesLabel || "étapes"}
                            </p>
                            <div className="flex gap-1 mt-2">
                              {(["entree", "plat", "dessert"] as CarteRecette[]).map((c) => (
                                <button
                                  key={c}
                                  onClick={() =>
                                    setPropositions((prev) =>
                                      prev.map((x) =>
                                        x.id === p.id ? { ...x, carte: c } : x,
                                      ),
                                    )
                                  }
                                  className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider transition-all ${
                                    p.carte === c
                                      ? "bg-white text-black"
                                      : "bg-white/5 text-slate-400 hover:bg-white/10"
                                  }`}
                                >
                                  {carteLabels[c].slice(0, 4)}
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={() => ouvrirFormulaire(p)}
                              disabled={p.enregistree}
                              className={`mt-2 w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                p.enregistree
                                  ? "bg-emerald-500/10 text-emerald-500 cursor-default"
                                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
                              }`}
                            >
                              {p.enregistree
                                ? t.ficheEnvoyee || "✓ Envoyée à valider"
                                : t.sauvegarderEnFiche || "Sauvegarder en fiche technique"}
                            </button>
                          </motionSlim.div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                onClick={() => setActiveTab && setActiveTab("recipes")}
                className="py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
              >
                {t.ouvrirOngletFiches || "Ouvrir l'onglet Fiches Techniques →"}
              </button>
            </div>
          </div>
        ) : isAnalyzing ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-8 border-brand-500"></div>
              <p className="font-black text-2xl tracking-tighter text-brand-500">
                {t.analysisInProgress || "ANALYSE EN COURS..."}
              </p>
              <p className="mt-3 text-slate-500 font-medium max-w-xs mx-auto">
                {t.decomposeAnalysisDesc ||
                  "Extraction des données et génération des fiches techniques."}
              </p>
            </div>
          </div>
        ) : fichesTechniques ? (
          <div className="flex-1 overflow-auto px-8 pb-8">
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
                          t.saveToBook || "Enregistrer dans le livre des recettes"
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
        ) : (
          <div className="flex-1 flex items-center justify-center px-8 pb-8">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`w-full max-w-3xl border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all duration-150 relative group bg-black py-20 ${
                isDragging
                  ? "border-brand-500 bg-brand-500/5 scale-[1.01]"
                  : "border-white/10 hover:border-white/20"
              }`}
            >
              <div
                className={`w-24 h-24 mx-auto mb-8 rounded-3xl flex items-center justify-center transition-all duration-150 shadow-2xl ${isDragging ? "bg-brand-500 text-obsidian rotate-12" : "bg-white/5 text-slate-500 group-hover:text-brand-500 group-hover:scale-110"}`}
              >
                <UploadCloud className="w-12 h-12" />
              </div>
              <h3 className="font-black text-2xl text-white tracking-tight mb-3">
                {t.importMenu || "Importer un Menu"}
              </h3>
              <p className="text-slate-500 max-w-xs mx-auto leading-relaxed mb-10 text-center">
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
          </div>
        )}
      </div>
    </LazyMotion>
  );
}
