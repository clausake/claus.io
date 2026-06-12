const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const replacements = [
  {
    search: '<h1 className="text-3xl font-black text-white tracking-widest uppercase mb-4">Période d\\\'Essai Terminée</h1>',
    replace: '<h1 className="text-3xl font-black text-white tracking-widest uppercase mb-4">{t.trialEndedTitle || "Période d\'Essai Terminée"}</h1>'
  },
  {
    search: '<label className="block text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">Entrer la clé d\\\'activation</label>',
    replace: '<label className="block text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">{t.enterActivationKey || "Entrer la clé d\'activation"}</label>'
  },
  {
    search: '<label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Modèle IA Actif</label>',
    replace: '<label className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t.activeAIModel || "Modèle IA Actif"}</label>'
  },
  {
    search: '<p className="text-[10px] text-slate-500 italic">Modèle utilisé pour toutes les analyses IA locales.</p>',
    replace: '<p className="text-[10px] text-slate-500 italic">{t.activeAIModelDesc || "Modèle utilisé pour toutes les analyses IA locales."}</p>'
  },
  {
    search: '<span className="text-xs text-slate-500 uppercase font-bold tracking-widest">Machine ID</span>',
    replace: '<span className="text-xs text-slate-500 uppercase font-bold tracking-widest">{t.machineId || "Machine ID"}</span>'
  },
  {
    search: '<div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-xl font-bold border border-emerald-500/20">CLAUS.IO est activé sur ce poste.</div>',
    replace: '<div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-xl font-bold border border-emerald-500/20">{t.clausIsActivated || "CLAUS.IO est activé sur ce poste."}</div>'
  },
  {
    search: '<div className="text-slate-500 italic">Chargement de la licence...</div>',
    replace: '<div className="text-slate-500 italic">{t.loadingLicense || "Chargement de la licence..."}</div>'
  },
  {
    search: '<p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Moteur Actif</p>',
    replace: '<p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{t.activeEngine || "Moteur Actif"}</p>'
  },
  {
    search: '<h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">Mode 01</h3>',
    replace: '<h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">{t.mode01 || "Mode 01"}</h3>'
  },
  {
    search: '<h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">Mode 02</h3>',
    replace: '<h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">{t.mode02 || "Mode 02"}</h3>'
  },
  {
    search: '<h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">Mode 03</h3>',
    replace: '<h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">{t.mode03 || "Mode 03"}</h3>'
  },
  {
    search: '<h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">Mode 04</h3>',
    replace: '<h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">{t.mode04 || "Mode 04"}</h3>'
  },
  {
    search: '<p className="text-slate-500 text-xs font-black uppercase tracking-widest">Initialisation CLAUS.IO...</p>',
    replace: '<p className="text-slate-500 text-xs font-black uppercase tracking-widest">{t.initClaus || "Initialisation CLAUS.IO..."}</p>'
  },
  {
    search: '<p className="text-slate-500 italic text-sm">Instructions détaillées non disponibles pour cette recette.</p>',
    replace: '<p className="text-slate-500 italic text-sm">{t.instructionsNotAvailable || "Instructions détaillées non disponibles pour cette recette."}</p>'
  },
  {
    search: '<h2 className="text-lg font-bold text-white uppercase tracking-tight">Source</h2>',
    replace: '<h2 className="text-lg font-bold text-white uppercase tracking-tight">{t.sourceLabel || "Source"}</h2>'
  },
  {
    search: '<th className="px-4 py-3 text-right">P.U.</th>',
    replace: '<th className="px-4 py-3 text-right">{t.puLabel || "P.U."}</th>'
  },
  {
    search: '<h3 className="text-xl font-bold text-white tracking-tight">Ajouter au Stock</h3>',
    replace: '<h3 className="text-xl font-bold text-white tracking-tight">{t.addToStockModalTitle || "Ajouter au Stock"}</h3>'
  },
  {
    search: '<label className="block text-xs font-black uppercase text-slate-500 mb-2">Désignation</label>',
    replace: '<label className="block text-xs font-black uppercase text-slate-500 mb-2">{t.designationLabel || "Désignation"}</label>'
  },
  {
    search: '<label className="block text-xs font-black uppercase text-slate-500 mb-2">Catégorie</label>',
    replace: '<label className="block text-xs font-black uppercase text-slate-500 mb-2">{t.categoryModalLabel || "Catégorie"}</label>'
  },
  {
    search: '<label className="block text-xs font-black uppercase text-slate-500 mb-2">Stock Minimum</label>',
    replace: '<label className="block text-xs font-black uppercase text-slate-500 mb-2">{t.minStockModalLabel || "Stock Minimum"}</label>'
  },
  {
    search: '<option value="" className="bg-[#1A1A1A]">Sélectionner...</option>',
    replace: '<option value="" className="bg-[#1A1A1A]">{t.selectOption || "Sélectionner..."}</option>'
  },
  {
    search: '<p className="text-slate-500">Aucune recette trouvée sur cette lettre.</p>',
    replace: '<p className="text-slate-500">{t.noRecipeLetter || "Aucune recette trouvée sur cette lettre."}</p>'
  },
  {
    search: '<p className="text-slate-500 italic mb-6">Aucune étape de préparation renseignée.</p>',
    replace: '<p className="text-slate-500 italic mb-6">{t.noPrepSteps || "Aucune étape de préparation renseignée."}</p>'
  },
  {
    search: '<option value="fr" className="bg-black text-white">Français</option>',
    replace: '<option value="fr" className="bg-black text-white">{t.frenchLang || "Français"}</option>'
  },
  {
    search: '<option value="en" className="bg-black text-white">English</option>',
    replace: '<option value="en" className="bg-black text-white">{t.englishLang || "English"}</option>'
  },
  {
    search: '<option value="es" className="bg-black text-white">Español</option>',
    replace: '<option value="es" className="bg-black text-white">{t.spanishLang || "Español"}</option>'
  },
  {
    search: '<option value="it" className="bg-black text-white">Italiano</option>',
    replace: '<option value="it" className="bg-black text-white">{t.italianLang || "Italiano"}</option>'
  },
  {
    search: '<option value="de" className="bg-black text-white">Deutsch</option>',
    replace: '<option value="de" className="bg-black text-white">{t.germanLang || "Deutsch"}</option>'
  },
  {
    search: '<label className="block text-xs font-black uppercase text-slate-500 mb-2">Unité</label>',
    replace: '<label className="block text-xs font-black uppercase text-slate-500 mb-2">{t.unitModalLabel || "Unité"}</label>'
  },
  {
    search: '<label className="block text-xs font-black uppercase text-slate-500 mb-2">Prix Unitaire Estimé</label>',
    replace: '<label className="block text-xs font-black uppercase text-slate-500 mb-2">{t.estimatedPULabel || "Prix Unitaire Estimé"}</label>'
  },
  {
    search: '<p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Identifiant Machine (à communiquer au support)</p>',
    replace: '<p className="text-xs text-slate-500 uppercase tracking-widest mb-2">{t.machineIdSupport || "Identifiant Machine (à communiquer au support)"}</p>'
  }
];

let replaced = 0;
for (const { search, replace } of replacements) {
    if (content.includes(search)) {
        content = content.replaceAll(search, replace);
        replaced++;
    } else {
        console.warn('Could not find:', search);
    }
}

console.log(`Replaced ${replaced} out of ${replacements.length} items in JSX.`);

// Now we want to prepend these translations to the `en: {` and `fr: {` blocks.
const frTranslations = `
    trialEndedTitle: "Période d'Essai Terminée",
    enterActivationKey: "Entrer la clé d'activation",
    clausIsActivated: "CLAUS.IO est activé sur ce poste.",
    loadingLicense: "Chargement de la licence...",
    machineIdSupport: "Identifiant Machine (à communiquer au support)",
    activeAIModel: "Modèle IA Actif",
    activeAIModelDesc: "Modèle utilisé pour toutes les analyses IA locales.",
    machineId: "Machine ID",
    activeEngine: "Moteur Actif",
    mode01: "Mode 01",
    mode02: "Mode 02",
    mode03: "Mode 03",
    mode04: "Mode 04",
    initClaus: "Initialisation CLAUS.IO...",
    instructionsNotAvailable: "Instructions détaillées non disponibles pour cette recette.",
    sourceLabel: "Source",
    puLabel: "P.U.",
    totalRowLabel: "Total",
    addToStockModalTitle: "Ajouter au Stock",
    designationLabel: "Désignation",
    unitModalLabel: "Unité",
    categoryModalLabel: "Catégorie",
    estimatedPULabel: "Prix Unitaire Estimé",
    minStockModalLabel: "Stock Minimum",
    selectOption: "Sélectionner...",
    noRecipeLetter: "Aucune recette trouvée sur cette lettre.",
    noPrepSteps: "Aucune étape de préparation renseignée.",
    frenchLang: "Français",
    englishLang: "English",
    spanishLang: "Español",
    italianLang: "Italiano",
    germanLang: "Deutsch",
`;

const enTranslations = `
    trialEndedTitle: "Trial Period Ended",
    enterActivationKey: "Enter activation key",
    clausIsActivated: "CLAUS.IO is activated on this device.",
    loadingLicense: "Loading license...",
    machineIdSupport: "Machine ID (to be communicated to support)",
    activeAIModel: "Active AI Model",
    activeAIModelDesc: "Model used for all local AI analyses.",
    machineId: "Machine ID",
    activeEngine: "Active Engine",
    mode01: "Mode 01",
    mode02: "Mode 02",
    mode03: "Mode 03",
    mode04: "Mode 04",
    initClaus: "CLAUS.IO Initialization...",
    instructionsNotAvailable: "Detailed instructions not available for this recipe.",
    sourceLabel: "Source",
    puLabel: "U.P.",
    totalRowLabel: "Total",
    addToStockModalTitle: "Add to Stock",
    designationLabel: "Designation",
    unitModalLabel: "Unit",
    categoryModalLabel: "Category",
    estimatedPULabel: "Estimated Unit Price",
    minStockModalLabel: "Minimum Stock",
    selectOption: "Select...",
    noRecipeLetter: "No recipe found for this letter.",
    noPrepSteps: "No preparation steps provided.",
    frenchLang: "Français",
    englishLang: "English",
    spanishLang: "Español",
    italianLang: "Italiano",
    germanLang: "Deutsch",
`;

// Inject into "fr: {"
content = content.replace('fr: {\n', 'fr: {\n' + frTranslations);
// Inject into "en: {"
content = content.replace('en: {\n', 'en: {\n' + enTranslations);

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx updated.');
