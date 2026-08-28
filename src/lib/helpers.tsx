import React from "react";
import { INGREDIENT_TRANSLATIONS, INGREDIENT_TRANSLATIONS_DE, INGREDIENT_TRANSLATIONS_ES, INGREDIENT_TRANSLATIONS_IT } from "../data/ingredientTranslations";
import VOCAB_TRANSLATIONS from "../../vocab_translations.json";

export const MediaDisplay = ({ src, alt, className, interactive = false, onClick, ...props }: any) => {
  if (!src) return null;
  const isPdf = src.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    return (
      <iframe
        src={`${src}#view=FitH&toolbar=0`}
        title={alt}
        className={`${className} ${!interactive ? 'pointer-events-none h-full' : 'min-h-[500px] h-[90vh]'} border-none w-full block`}
        onClick={onClick}
        {...props}
      />
    );
  }
  return <img src={src} alt={alt} className={className} referrerPolicy="no-referrer" onClick={onClick} {...props} />;
};

export const getSupplierForIngredient = (ingredientName: string) => {
  const name = ingredientName.toLowerCase();
  if (
    name.match(
      /(pomme|poire|banane|fraise|framboise|orange|citron|légume|carotte|tomate|oignon|ail|échalote|salade|laitue|mâche|courgette|aubergine|poivron|chou|brocoli|épinard|haricot|petit pois|champignon|radis|navet|poireau|céleri|avocat|mangue|ananas|kiwi|raisin|pêche|abricot|cerise|melon|pastèque|herbe|persil|ciboulette|basilic|menthe|coriandre|thym|romarin|laurier|fruit)/,
    )
  ) {
    return "TerreAzur";
  }
  if (
    name.match(
      /(viande|boeuf|bœuf|veau|porc|agneau|mouton|volaille|poulet|dinde|canard|poisson|saumon|cabillaud|colin|thon|crevette|fruit de mer|surgelé|glace|beurre|crème|lait|fromage|yaourt|oeuf|œuf|charcuterie|jambon|saucisse|lard|bacon)/,
    )
  ) {
    return "Passion Froid";
  }
  if (
    name.match(
      /(farine|sucre|sel|poivre|épice|curry|cumin|paprika|huile|vinaigre|pâte|riz|semoule|céréale|lentille|pois chiche|conserve|bocal|moutarde|mayonnaise|ketchup|sauce|bouillon|café|thé|chocolat|cacao|biscuit|gâteau|levure|amande|noix|noisette)/,
    )
  ) {
    return "EpiSaveurs";
  }
  return "Charles Martin";
};

export const gerer_flux_culinaire = async (jsonData: string, notify?: (msg: string, type?: string) => void) => {
  try {
    const payload = {
      source: "mobile",
      type: "MANUAL",
      data: { action: "review_carts", carts: JSON.parse(jsonData) },
      timestamp: new Date().toISOString(),
    };

    console.log("Transmission au serveur local (Asus G16) :", payload);

    // Appel API vers le cerveau Agent Culinaire OS
    const response = await fetch("/api/agent/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("Réponse du serveur :", result);

    if (result.claus_analysis) {
      notify?.(`✅ Ordre transmis avec succès !

🧠 Avis de l'Assistant IA :
${result.claus_analysis}`, "success");
    } else {
      notify?.("✅ Ordre transmis avec succès !", "success");
    }
  } catch (error) {
    console.error("Erreur de transmission:", error);
    notify?.(
      "❌ Erreur de connexion au serveur Agent Culinaire OS. Vérifiez que le backend est lancé.",
      "error"
    );
  }
};

export const translateIngredientHelper = (name: string, language: string) => {
  if (!name) return name;
  const trimmed = name.trim();
  const lowerTrimmed = trimmed.toLowerCase();
  const snakeKey = lowerTrimmed.replace(/[\s-]+/g, "_");

  // Type-safe cast of imported JSON translations
  const vt = VOCAB_TRANSLATIONS as any;

  // Let's check if we can find a matching key via our 1790-term VOCAB_TRANSLATIONS dictionary first
  let matchedKey: string | null = null;

  // 1. Is the snakeKey an exact vocabulary key?
  if (vt && vt.fr && vt.fr[snakeKey] !== undefined) {
    matchedKey = snakeKey;
  } else if (vt) {
    // 2. Or is the name a translated or original value currently under any language in our vocab dictionary?
    const checkLangs = ["fr", "es", "it", "de"];
    for (const lang of checkLangs) {
      const dict = vt[lang];
      if (dict) {
        const found = Object.keys(dict).find(
          (k) => dict[k] && dict[k].toLowerCase() === lowerTrimmed
        );
        if (found) {
          matchedKey = found;
          break;
        }
      }
    }
    // Also check standard English string spacing with titlecase or clean name match
    if (!matchedKey) {
      const keys = Object.keys(vt.fr || {});
      const foundEng = keys.find(k => k.replace(/_/g, " ") === lowerTrimmed);
      if (foundEng) {
        matchedKey = foundEng;
      }
    }
  }

  // If a vocabulary key is identified, return the translated form for the targeted language!
  if (matchedKey && vt) {
    if (language === "en") {
      return matchedKey.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
    const dict = vt[language];
    if (dict && dict[matchedKey]) {
      return dict[matchedKey];
    }
  }

  // 3. Fallback: Use our smaller handcoded tables
  const frenchMatch = Object.keys(INGREDIENT_TRANSLATIONS).find(
    (k) => k.toLowerCase() === lowerTrimmed
  );

  if (language === "fr") {
    // If input is in English and we need French
    const rKey = Object.keys(INGREDIENT_TRANSLATIONS).find(
      (k) => INGREDIENT_TRANSLATIONS[k].toLowerCase() === lowerTrimmed
    );
    if (rKey) return rKey;
    return trimmed;
  }

  if (language === "es") {
    if (frenchMatch) return INGREDIENT_TRANSLATIONS_ES[frenchMatch];
    const rKey = Object.keys(INGREDIENT_TRANSLATIONS).find(
      (k) => INGREDIENT_TRANSLATIONS[k].toLowerCase() === lowerTrimmed
    );
    if (rKey && INGREDIENT_TRANSLATIONS_ES[rKey]) return INGREDIENT_TRANSLATIONS_ES[rKey];
    return trimmed;
  }

  if (language === "it") {
    if (frenchMatch) return INGREDIENT_TRANSLATIONS_IT[frenchMatch];
    const rKey = Object.keys(INGREDIENT_TRANSLATIONS).find(
      (k) => INGREDIENT_TRANSLATIONS[k].toLowerCase() === lowerTrimmed
    );
    if (rKey && INGREDIENT_TRANSLATIONS_IT[rKey]) return INGREDIENT_TRANSLATIONS_IT[rKey];
    return trimmed;
  }

  if (language === "de") {
    if (frenchMatch) return INGREDIENT_TRANSLATIONS_DE[frenchMatch];
    const rKey = Object.keys(INGREDIENT_TRANSLATIONS).find(
      (k) => INGREDIENT_TRANSLATIONS[k].toLowerCase() === lowerTrimmed
    );
    if (rKey && INGREDIENT_TRANSLATIONS_DE[rKey]) return INGREDIENT_TRANSLATIONS_DE[rKey];
    return trimmed;
  }

  if (language === "en") {
    if (frenchMatch) return INGREDIENT_TRANSLATIONS[frenchMatch];
    return trimmed;
  }

  return name;
};

export function translateAlertMessage(
  message: string,
  t: any,
  translateIngredientHelper: any,
) {
  if (t.language === "fr") return message;

  const matchStock = message.match(
    /Stock d'alerte\s*:\s*(.*?)\s*\((.*?)\s+(.*?)\s+restant pour un minimum de\s+(.*?)\s+(.*?)\s+param/,
  );
  if (matchStock) {
    const itemTranslated = translateIngredientHelper(
      matchStock[1].trim(),
      t.language,
    );
    if (t.language === "en")
      return `Low Stock: ${itemTranslated} (${matchStock[2]} ${matchStock[3]} remaining, minimum set at ${matchStock[4]} ${matchStock[5]})`;
    if (t.language === "es")
      return `Stock Crítico: ${itemTranslated} (${matchStock[2]} ${matchStock[3]} restante de ${matchStock[4]} ${matchStock[5]} mínimo configurado)`;
    if (t.language === "de")
      return `Kritischer Bestand: ${itemTranslated} (${matchStock[2]} ${matchStock[3]} verbleibend von ${matchStock[4]} ${matchStock[5]} konfiguriertem Minimum)`;
    if (t.language === "it")
      return `Scorta Critica: ${itemTranslated} (${matchStock[2]} ${matchStock[3]} rimanenti rispetto al minimo di ${matchStock[4]} ${matchStock[5]})`;
  }

  const matchRupture = message.match(/Rupture imminente\s*:\s*(.*)/);
  if (matchRupture) {
    const itemTranslated = translateIngredientHelper(
      matchRupture[1].trim(),
      t.language,
    );
    if (t.language === "en") return `Imminent Shortage: ${itemTranslated}`;
    if (t.language === "es") return `Ruptura inminente: ${itemTranslated}`;
    if (t.language === "de") return `Drohender Engpass: ${itemTranslated}`;
    if (t.language === "it") return `Esaurimento imminente: ${itemTranslated}`;
  }

  const matchPrice = message.match(
    /Hausse de prix >10% sur le (.*?)\s*\(Fournisseur A\)/,
  );
  if (matchPrice) {
    const itemTranslated = translateIngredientHelper(
      matchPrice[1].trim(),
      t.language,
    );
    if (t.language === "en")
      return `Price increase >10% on ${itemTranslated} (Supplier A)`;
    if (t.language === "es")
      return `Aumento de precio >10% en ${itemTranslated} (Proveedor A)`;
    if (t.language === "de")
      return `Preisanstieg >10% bei ${itemTranslated} (Lieferant A)`;
    if (t.language === "it")
      return `Aumento del prezzo >10% su ${itemTranslated} (Fornitore A)`;
  }

  return message;
}

export const getCostModifier = (unit?: string) => {
  const u = (unit || '').toLowerCase().trim();
  if (u === 'g' || u === 'ml') return 0.001;
  if (u === 'cl') return 0.01;
  if (u === 'mg') return 0.000001;
  return 1;
};

export const getIngredientEffectivePrice = (ing: any) => {
  const basePrice = (ing.unit_price || ing.price || 0) * getCostModifier(ing.unit);
  const yieldPercent = (ing.yield_percent !== undefined) ? ing.yield_percent : 100;
  if (yieldPercent <= 0) return basePrice;
  return basePrice / (yieldPercent / 100);
};