import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Search,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  Compass,
  ArrowRight,
  TrendingUp,
  FlaskConical,
  Activity,
  Award
} from "lucide-react";

interface EpicureStudioProps {
  t: any;
  settings: {
    language: string;
    model_name: string;
  };
}

interface VocabItem {
  key: string;
  localized: string;
}

interface Recommendation {
  key: string;
  localizedName: string;
  chem: number;
  cooc: number;
  core: number;
  composite: number;
}

interface AnalysisResult {
  harmonyScore: number;
  remarks: string;
  mappedCount: number;
  ingredientScores: Array<{
    key: string;
    original: string;
    localized: string;
    avgComposite: number;
    avgChem: number;
    avgCooc: number;
    avgCore: number;
  }>;
  outliers: Array<{
    outlier: string;
    original: string;
    key: string;
    currentScore: number;
    suggestions: Array<{
      key: string;
      localizedName: string;
      score: number;
    }>;
  }>;
  details: Array<{
    ingA: string;
    ingB: string;
    localA: string;
    localB: string;
    chem: number;
    cooc: number;
    core: number;
    composite: number;
  }>;
}

export function EpicureStudio({ t, settings }: EpicureStudioProps) {
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIngredient, setSelectedIngredient] = useState<string>("basil");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  // Recipe Analysis states
  const [recipeInput, setRecipeInput] = useState("Poisson blanc, Citron vert, Basilic vert, Chocolat noir");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<"pairing" | "analyzer">("pairing");

  const lang = settings.language || "fr";

  // Multi-lingual UI dictionary
  const uiTexts: Record<string, Record<string, string>> = {
    fr: {
      epicureTitle: "Studio d'Arômes Epicure AI",
      epicureDesc: "Associez les ingrédients selon la science moléculaire, le contexte culinaire et la co-occurrence historique des recettes.",
      tabPairing: "Workspace d'Accords",
      tabAnalyzer: "Analyseur de Recette Scientifique",
      searchPlaceholder: "Chercher un ingrédient...",
      selectedIngLabel: "Ingrédient Sélectionné",
      chemCategory: "Affinité Chimique (Partage Moléculaire)",
      chemDesc: "Ingrédients partageant des composés aromatiques clés (FlavorDB).",
      coreCategory: "Substitution Culinaire (Modèles Contextuels)",
      coreDesc: "Ingrédients utilisés dans des contextes et rôles culinaires similaires.",
      coocCategory: "Co-occurrence Historique (Recettes Globales)",
      coocDesc: "Ingrédients mariés le plus fréquemment dans 4 millions de recettes internationales.",
      analyzeButton: "Lancer l'Analyse Moléculaire",
      analyzePlaceholder: "Saisissez les ingrédients séparés par des virgules (ex: Fraises, Chocolat noir, Menthe fraîche)",
      harmonyScoreLabel: "Score d'Harmonie Aromatique",
      remarksLabel: "Verdict du Chef Scientifique",
      outlierTitle: "Risque d'Hallucination Détecté !",
      outlierDesc: "Ce ingrédient est discordant avec les autres profils moléculaires de la recette. Nous vous conseillons de le substituer par :",
      harmonyTable: "Matrice des Affinités Aromatiques",
      compositeScore: "Score Global d'Union",
      noOutliers: "Excellente cohérence ! Aucun ingrédient parasite ou halluciné détecté.",
      recsLoading: "Calcul des affinités chimiques terrestres...",
      analysisLoading: "Analyse des ponts moléculaires aromatiques...",
      selectPrompt: "Sélectionnez un ingrédient pour entamer le voyage sensoriel."
    },
    en: {
      epicureTitle: "Epicure AI Flavor Studio",
      epicureDesc: "Match food ingredients backed by molecular science, culinary contexts, and historical co-occurrences of recipes.",
      tabPairing: "Flavor Match Workspace",
      tabAnalyzer: "Scientific Recipe Analyst",
      searchPlaceholder: "Search ingredient...",
      selectedIngLabel: "Selected Ingredient",
      chemCategory: "Chemical Aromatic Affinity",
      chemDesc: "Ingredients sharing key volatile flavor molecules (FlavorDB).",
      coreCategory: "Culinary Substitutions (Context Graphs)",
      coreDesc: "Ingredients serving identical botanical or functional kitchen roles.",
      coocCategory: "Historical Co-occurrence (Global Legacy)",
      coocDesc: "Mapped items marrying most frequently in 4+ million recipes.",
      analyzeButton: "Run Molecular Analysis",
      analyzePlaceholder: "Enter ingredients separated by commas (e.g., Strawberry, Beef, Rosemary)",
      harmonyScoreLabel: "Aromatic Harmony Score",
      remarksLabel: "Scientific Chef Verdict",
      outlierTitle: "Hallucination Risk Detected!",
      outlierDesc: "This ingredient is mathematically incompatible with others. We recommend replacing it with:",
      harmonyTable: "Aromatic Affinities Matrix",
      compositeScore: "Composite Union Score",
      noOutliers: "Perfect balance! No incongruent or hallucinated ingredients detected.",
      recsLoading: "Calculating quantum chemical affinities...",
      analysisLoading: "Mapping aromatic molecular paths...",
      selectPrompt: "Select an ingredient to begin the sensory expedition."
    },
    es: {
      epicureTitle: "Estudio de Sabores Epicure AI",
      epicureDesc: "Combine ingredientes alimenticios respaldados por la ciencia de los aromas, el contexto de las recetas y la co-ocurrencia histórica.",
      tabPairing: "Espacio de Maridaje",
      tabAnalyzer: "Analizador Científico de Recetas",
      searchPlaceholder: "Buscar ingrediente...",
      selectedIngLabel: "Ingrediente Seleccionado",
      chemCategory: "Afinidad Química (Moléculas)",
      chemDesc: "Ingredientes que comparten compuestos de sabor volátiles (FlavorDB).",
      coreCategory: "Sustitutos Culinarios (Grafos Contextuales)",
      coreDesc: "Ingredientes con roles e interacciones botánicas idénticas en cocina.",
      coocCategory: "Co-ocurrencia Histórica (Reciclaje de Recetas)",
      coocDesc: "Ingredientes que aparecen juntos con mayor frecuencia en recetas culinarias.",
      analyzeButton: "Analizar Combinación",
      analyzePlaceholder: "Ingrese ingredientes separados por comas (ej. Fresas, Chocolate, Limón)",
      harmonyScoreLabel: "Puntuación de Armonía Aromática",
      remarksLabel: "Vedicto del Chef Científico",
      outlierTitle: "¡Riesgo de Alucinación Detectado!",
      outlierDesc: "Este ingrediente es discordante con los aromas. Recomendamos reemplazarlo con:",
      harmonyTable: "Matriz de Afinidades Aromáticas",
      compositeScore: "Unión Aromática Global",
      noOutliers: "¡Armonía total! No se detectaron ingredientes discordantes ni alucinaciones.",
      recsLoading: "Analizando afinidades cuánticas de sabor...",
      analysisLoading: "Calculando pasajes químicos de aromas...",
      selectPrompt: "Selecciona un ingrediente para iniciar el viaje sensorial."
    },
    de: {
      epicureTitle: "Epicure AI Aroma-Studio",
      epicureDesc: "Kombinieren Sie Lebensmittelzutaten basierend auf Molekularwissenschaft, kulinarischem Kontext und Rezeptmustern.",
      tabPairing: "Aroma-Kombinationsrechner",
      tabAnalyzer: "Wissenschaftlicher Rezeptprüfer",
      searchPlaceholder: "Zutat suchen...",
      selectedIngLabel: "Ausgewählte Zutat",
      chemCategory: "Chemische Aromaverwandtschaft",
      chemDesc: "Zutaten, die flüchtige Aroma-Schlüsselverbindungen teilen (FlavorDB).",
      coreCategory: "Kulinarischer Ersatz (Kontextuelle Modelle)",
      coreDesc: "Zutaten mit ähnlichen Rollen in kulinarischen Zubereitungen.",
      coocCategory: "Historisches Vorkommen (Globale Rezeptergebnisse)",
      coocDesc: "Zutaten, die am häufigsten in globalen Rezepten kombiniert werden.",
      analyzeButton: "Molekulare Harmonie prüfen",
      analyzePlaceholder: "Zutaten durch Kommas getrennt eingeben (z. B. Erdbeere, Basilikum, Schokolade)",
      harmonyScoreLabel: "Aroma-Harmonie-Score",
      remarksLabel: "Urteil des molekularen Chefkochs",
      outlierTitle: "Zutaten-Halluzinationsrisiko erkannt!",
      outlierDesc: "Diese Zutat bricht die molekulare Harmonie. Wir empfehlen, sie zu ersetzen durch:",
      harmonyTable: "Aromen-Kompatibilitätsmatrix",
      compositeScore: "Gesamter Harmonie-Score",
      noOutliers: "Hervorragende Balance! Keine unharmonischen oder fehlerhaften Zutaten erkannt.",
      recsLoading: "Berechne molekulare Affinitäten...",
      analysisLoading: "Berechne kulinarische Harmonie-Pfade...",
      selectPrompt: "Wählen Sie eine Zutat, um die Entdeckungsreise zu beginnen."
    },
    it: {
      epicureTitle: "Studio di Aromi Epicure AI",
      epicureDesc: "Abbina gli ingredienti in base alla scienza molecolare, al contesto culinario e alla co-occorrenza storica.",
      tabPairing: "Workspace degli Abbinamenti",
      tabAnalyzer: "Analizzatore Scientifico di Ricette",
      searchPlaceholder: "Cerca ingrediente...",
      selectedIngLabel: "Ingrediente Selezionato",
      chemCategory: "Affinità Chimica Aromatica",
      chemDesc: "Ingredienti che condividono composti volatili chiave (FlavorDB).",
      coreCategory: "Sostituzioni Culinarie (Grafi di Contesto)",
      coreDesc: "Ingredienti con utilizzi e posizioni gastronomiche simili.",
      coocCategory: "Co-occorrenza Storica (Eredità delle Ricette)",
      coocDesc: "Ingredienti che compaiono più frequentemente insieme nei ricettari globali.",
      analyzeButton: "Avvia Analisi Molecolare",
      analyzePlaceholder: "Inserisci ingredienti separati da virgole (es: Fragola, Cioccolato, Basilico)",
      harmonyScoreLabel: "Punteggio di Armonia Aromatica",
      remarksLabel: "Verdetto dello Chef Scientifico",
      outlierTitle: "Rischio Allucinazione Rilevato !",
      outlierDesc: "Questo ingrediente è discordante con gli altri aromi della ricetta. Consigliamo di sostituirlo con:",
      harmonyTable: "Matrice delle Affinità Aromatiche",
      compositeScore: "Unione Aromatica Globale",
      noOutliers: "Eccellente coerenza! Nessun ingrediente incoerente o allucinato rilevato.",
      recsLoading: "Calcolo delle affinità chimiche aromaterapeutiche...",
      analysisLoading: "Calcolo dei ponti d'aroma molecolari...",
      selectPrompt: "Seleziona un ingrediente per iniziare l'esplorazione sensoriale."
    }
  };

  const currentUi = uiTexts[lang] || uiTexts.en;

  // Load Translated Vocabulary list on mount/lang change
  useEffect(() => {
    fetch(`/api/epicure/vocab-list?language=${lang}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setVocab(data);
        }
      })
      .catch((err) => console.error("Error loading vocabulary:", err));
  }, [lang]);

  // Load Pairings when selected ingredient changes
  useEffect(() => {
    if (!selectedIngredient) return;
    setLoadingRecs(true);
    fetch(`/api/epicure/recommendations?ingredient=${selectedIngredient}&limit=12&language=${lang}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.recommendations) {
          setRecommendations(data.recommendations);
        }
      })
      .catch((err) => console.error("Error loading recommendations:", err))
      .finally(() => setLoadingRecs(false));
  }, [selectedIngredient, lang]);

  // Run Recipe analysis
  const handleAnalyze = () => {
    if (!recipeInput.trim()) return;
    setLoadingAnalysis(true);
    const ingList = recipeInput.split(",").map((i) => i.trim()).filter(Boolean);

    fetch("/api/epicure/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredients: ingList, language: lang })
    })
      .then((res) => res.json())
      .then((data) => {
        setAnalysisResult(data);
      })
      .catch((err) => console.error("Error analyzing recipe:", err))
      .finally(() => setLoadingAnalysis(false));
  };

  const filteredVocab = vocab.filter((v) =>
    v.localized.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group recommendations by type for visual separation
  const chemRecs = [...recommendations].sort((a, b) => b.chem - a.chem).slice(0, 4);
  const coreRecs = [...recommendations].sort((a, b) => b.core - a.core).slice(0, 4);
  const coocRecs = [...recommendations].sort((a, b) => b.cooc - a.cooc).slice(0, 4);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 animate-in fade-in duration-500">
      {/* Header Info */}
      <div className="bg-gradient-to-tr from-slate-900 via-slate-950 to-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col md:flex-row items-start md:items-center justify-between shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="space-y-2 z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-xs font-semibold uppercase tracking-wider">
            <FlaskConical className="w-3.5 h-3.5" />
            Gastronomy Science
          </div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">
            {currentUi.epicureTitle}
          </h1>
          <p className="text-slate-400 max-w-2xl font-medium text-sm">
            {currentUi.epicureDesc}
          </p>
        </div>

        <div className="flex gap-2 mt-4 md:mt-0 z-10 bg-slate-900 p-1.5 border border-slate-800 rounded-full">
          <button
            onClick={() => setActiveWorkspace("pairing")}
            className={`px-5 py-2 rounded-full text-xs font-bold tracking-wide transition-all ${
              activeWorkspace === "pairing"
                ? "bg-slate-800 text-slate-100 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Compass className="w-4 h-4 inline mr-1.5" />
            {currentUi.tabPairing}
          </button>
          <button
            onClick={() => setActiveWorkspace("analyzer")}
            className={`px-5 py-2 rounded-full text-xs font-bold tracking-wide transition-all ${
              activeWorkspace === "analyzer"
                ? "bg-slate-800 text-slate-100 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-4 h-4 inline mr-1.5" />
            {currentUi.tabAnalyzer}
          </button>
        </div>
      </div>

      {/* PAIRING WORKSPACE VIEW */}
      {activeWorkspace === "pairing" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Ingredient Explorer List */}
          <div className="lg:col-span-4 bg-slate-950/80 border border-slate-900 rounded-3xl p-6 shadow-xl flex flex-col h-[650px]">
            <div className="relative mb-4">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                <Search className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="text"
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold focus:outline-none focus:border-emerald-500/50 transition-all custom-scrollbar"
                placeholder={currentUi.searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
              {filteredVocab.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setSelectedIngredient(v.key)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left text-xs font-bold tracking-wide transition-all border ${
                    selectedIngredient === v.key
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-extrabold"
                      : "bg-transparent border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  }`}
                >
                  <span>{v.localized}</span>
                  {selectedIngredient === v.key && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Pairings Panel Card */}
          <div className="lg:col-span-8 space-y-6">
            {selectedIngredient ? (
              <>
                {/* Active selection banner */}
                <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 flex items-center justify-between shadow-lg">
                  <div>
                    <p className="text-[10px] font-black tracking-widest text-emerald-400 uppercase">
                      {currentUi.selectedIngLabel}
                    </p>
                    <h2 className="text-2xl font-black text-slate-100 mt-1 capitalize">
                      {vocab.find((v) => v.key === selectedIngredient)?.localized || selectedIngredient}
                    </h2>
                  </div>
                  <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center font-bold">
                    [AI]
                  </div>
                </div>

                {loadingRecs ? (
                  <div className="flex flex-col items-center justify-center p-20 text-slate-500 font-bold space-y-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-400" />
                    <p className="text-sm font-semibold text-slate-400">{currentUi.recsLoading}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Category 1: Molecular Chemistry */}
                    <div className="bg-gradient-to-b from-slate-950 to-slate-900 border border-slate-900 rounded-3xl p-6 shadow-xl space-y-4">
                      <div className="flex items-center gap-2 text-indigo-400 font-black text-xs uppercase tracking-wider border-b border-indigo-500/10 pb-3">
                        <FlaskConical className="w-4 h-4" />
                        {currentUi.chemCategory.split("(")[0]}
                      </div>
                      <p className="text-[10px] font-medium text-slate-400 leading-relaxed">
                        {currentUi.chemDesc}
                      </p>
                      <div className="space-y-3.5 pt-2">
                        {chemRecs.map((r) => (
                          <div key={r.key} className="space-y-1">
                            <div className="flex justify-between text-xs font-bold text-slate-300">
                              <span className="capitalize">{r.localizedName}</span>
                              <span className="text-indigo-400 font-mono text-[10px]">{(r.chem * 100).toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                                style={{ width: `${Math.max(10, r.chem * 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Category 2: Context Substitution */}
                    <div className="bg-gradient-to-b from-slate-950 to-slate-900 border border-slate-900 rounded-3xl p-6 shadow-xl space-y-4">
                      <div className="flex items-center gap-2 text-emerald-400 font-black text-xs uppercase tracking-wider border-b border-emerald-500/10 pb-3">
                        <Compass className="w-4 h-4" />
                        {currentUi.coreCategory.split("(")[0]}
                      </div>
                      <p className="text-[10px] font-medium text-slate-400 leading-relaxed">
                        {currentUi.coreDesc}
                      </p>
                      <div className="space-y-3.5 pt-2">
                        {coreRecs.map((r) => (
                          <div key={r.key} className="space-y-1">
                            <div className="flex justify-between text-xs font-bold text-slate-300">
                              <span className="capitalize">{r.localizedName}</span>
                              <span className="text-emerald-400 font-mono text-[10px]">{(r.core * 100).toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                                style={{ width: `${Math.max(10, r.core * 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Category 3: Co-occurrence */}
                    <div className="bg-gradient-to-b from-slate-950 to-slate-900 border border-slate-900 rounded-3xl p-6 shadow-xl space-y-4">
                      <div className="flex items-center gap-2 text-amber-400 font-black text-xs uppercase tracking-wider border-b border-amber-500/10 pb-3">
                        <TrendingUp className="w-4 h-4" />
                        {currentUi.coocCategory.split("(")[0]}
                      </div>
                      <p className="text-[10px] font-medium text-slate-400 leading-relaxed">
                        {currentUi.coocDesc}
                      </p>
                      <div className="space-y-3.5 pt-2">
                        {coocRecs.map((r) => (
                          <div key={r.key} className="space-y-1">
                            <div className="flex justify-between text-xs font-bold text-slate-300">
                              <span className="capitalize">{r.localizedName}</span>
                              <span className="text-amber-400 font-mono text-[10px]">{(r.cooc * 100).toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-500 rounded-full transition-all duration-1000"
                                style={{ width: `${Math.max(10, r.cooc * 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center bg-slate-950 border border-slate-900 rounded-3xl p-24 text-slate-500 font-bold justify-center space-y-4 shadow-xl">
                <Sparkles className="w-12 h-12 text-slate-600 animate-pulse" />
                <p className="text-sm font-semibold tracking-wide">{currentUi.selectPrompt}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RECIPE SCIENTIFIC ANALYZER VIEW */}
      {activeWorkspace === "analyzer" && (
        <div className="space-y-8">
          {/* Analysis Form Card */}
          <div className="bg-slate-950 border border-slate-900 rounded-3xl p-6 shadow-xl space-y-5">
            <label className="block text-[10px] font-black tracking-widest text-emerald-400 uppercase">
              {currentUi.tabAnalyzer}
            </label>
            <div className="relative">
              <textarea
                className="w-full bg-slate-900/50 border border-slate-800 text-slate-200 rounded-2xl p-5 text-sm font-bold min-h-[100px] focus:outline-none focus:border-emerald-500/50 transition-all custom-scrollbar"
                placeholder={currentUi.analyzePlaceholder}
                value={recipeInput}
                onChange={(e) => setRecipeInput(e.target.value)}
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={loadingAnalysis}
              className="w-full md:w-auto px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider transition-all disabled:opacity-50"
            >
              {loadingAnalysis ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-slate-950 inline-block mr-2" />
                  {currentUi.analysisLoading}
                </>
              ) : (
                <>
                  <FlaskConical className="w-4 h-4 inline mr-2" />
                  {currentUi.analyzeButton}
                </>
              )}
            </button>
          </div>

          {/* Analysis Output Results Container */}
          {analysisResult && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
              {/* Harmony Gauge Card & Chef Remarks */}
              <div className="lg:col-span-4 bg-slate-950 border border-slate-900 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-6">
                <div className="text-center space-y-3 pt-4">
                  <p className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
                    {currentUi.harmonyScoreLabel}
                  </p>
                  
                  <div className="relative inline-flex items-center justify-center">
                    {/* Ring score */}
                    <svg className="w-44 h-44 transform -rotate-90">
                      <circle
                        cx="88"
                        cy="88"
                        r="76"
                        stroke="currentColor"
                        strokeWidth="12"
                        fill="transparent"
                        className="text-slate-800/60"
                      />
                      <circle
                        cx="88"
                        cy="88"
                        r="76"
                        stroke="currentColor"
                        strokeWidth="12"
                        fill="transparent"
                        strokeDasharray={`${2 * Math.PI * 76}`}
                        strokeDashoffset={`${2 * Math.PI * 76 * (1 - analysisResult.harmonyScore / 100)}`}
                        className={`${
                          analysisResult.harmonyScore > 80
                            ? "text-emerald-400"
                            : analysisResult.harmonyScore > 60
                            ? "text-indigo-400"
                            : "text-rose-500"
                        } transition-all duration-1000`}
                      />
                    </svg>
                    <span className="absolute text-5xl font-black text-slate-100 font-mono">
                      {analysisResult.harmonyScore}%
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-300 uppercase tracking-wider">
                    <Award className="w-4 h-4 text-emerald-400" />
                    {currentUi.remarksLabel}
                  </div>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed">
                    {analysisResult.remarks}
                  </p>
                </div>
              </div>

              {/* OUTLIERS, SUGGESTIONS & MATRIX AFFINITIES */}
              <div className="lg:col-span-8 space-y-6">
                {/* Outliers Warning / Success Panel */}
                {analysisResult.outliers && analysisResult.outliers.length > 0 ? (
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-3xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center gap-2 text-rose-400 font-black text-sm uppercase tracking-wide">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                      {currentUi.outlierTitle}
                    </div>
                    <p className="text-xs text-slate-300 font-medium leading-relaxed">
                      {currentUi.outlierDesc}
                    </p>

                    <div className="space-y-4 mt-2">
                      {analysisResult.outliers.map((out, index) => (
                        <div key={index} className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                          <div>
                            <span className="text-[10px] font-black tracking-wider text-rose-400 uppercase">Ingredient</span>
                            <p className="text-base font-extrabold text-slate-100 uppercase">{out.outlier}</p>
                          </div>
                          
                          <ArrowRight className="w-5 h-5 text-slate-600 hidden md:block" />

                          <div className="flex-1">
                            <span className="text-[10px] font-black tracking-wider text-emerald-400 uppercase">Recommandations Scientifiques</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {out.suggestions.map((s, si) => (
                                <button
                                  key={si}
                                  onClick={() => {
                                    // Let user replace ingredient easily!
                                    const replList = recipeInput.split(",").map((item) => {
                                      const cleaned = item.trim().toLowerCase();
                                      if (cleaned.includes(out.outlier.toLowerCase()) || cleaned.includes(out.original.toLowerCase())) {
                                        return s.localizedName;
                                      }
                                      return item;
                                    }).join(", ");
                                    setRecipeInput(replList);
                                  }}
                                  className="px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-full text-xs font-bold text-emerald-400 transition-all flex items-center gap-1.5"
                                >
                                  {s.localizedName}
                                  <span className="text-caption font-mono text-emerald-500">{(s.score * 100).toFixed(0)}%</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 flex items-center gap-4 shadow-xl">
                    <CheckCircle className="w-7 h-7 text-emerald-400 flex-shrink-0" />
                    <div>
                      <p className="text-slate-200 font-extrabold text-sm">{currentUi.noOutliers}</p>
                    </div>
                  </div>
                )}

                {/* Affinity Details List Matrix */}
                {analysisResult.details && analysisResult.details.length > 0 && (
                  <div className="bg-slate-950 border border-slate-900 rounded-3xl p-6 shadow-xl space-y-4">
                    <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">
                      {currentUi.harmonyTable}
                    </h3>
                    <div className="space-y-3.5 pr-2 custom-scrollbar max-h-[300px] overflow-y-auto">
                      {analysisResult.details.map((d, index) => (
                        <div key={index} className="flex items-center justify-between border-b border-slate-900 pb-3 text-xs font-bold font-medium text-slate-400">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-200 capitalize">{d.localA}</span>
                            <span className="text-slate-600 font-normal">and</span>
                            <span className="text-slate-200 capitalize">{d.localB}</span>
                          </div>
                          <div className="flex items-center gap-4 font-mono text-[10px]">
                            <span className="text-indigo-400 font-semibold">Chem: {(d.chem * 100).toFixed(0)}%</span>
                            <span className="text-emerald-400 font-semibold">Core: {(d.core * 100).toFixed(0)}%</span>
                            <span className="text-amber-400 font-semibold">Cooc: {(d.cooc * 100).toFixed(0)}%</span>
                            <span className="text-slate-200 font-bold bg-slate-900 px-2 py-0.5 border border-slate-800 rounded">{(d.composite * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
