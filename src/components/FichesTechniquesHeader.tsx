// T3.2 : extrait de src/components/FichesTechniques.tsx (extraction pure, byte-exact).
// Barre de titre + boutons d'action (grille/livre, nouveau, scan IA, importer, rafraîchir).
// JSX sans hook interne ; props = variables/handlers MESURÉS sur la plage. fileInputRef
// (useRef du parent, aussi lu par handleFileScan) est passé en prop : le <input ref>
// part avec le bloc, le ref RESTERAIT valide car c'est le MÊME objet. JSX Copié tel quel.
import { BookOpen, FolderOpen, Plus, RefreshCw, Sparkles } from 'lucide-react';

export function FichesTechniquesHeader({ viewMode, setViewMode, selectedCategory, setActiveLetter, setSelectedRecipeForModal, fileInputRef, handleFileScan, fetchRecipes, t }: {
  viewMode: string; setViewMode: (v: any) => void;
  selectedCategory: string; setActiveLetter: (v: any) => void;
  setSelectedRecipeForModal: (v: any) => void;
  fileInputRef: any; handleFileScan: (e: any) => void; fetchRecipes: () => void;
  t: Record<string, string>;
}) {
  return (
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
  );
}
