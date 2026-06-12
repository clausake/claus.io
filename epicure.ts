import fs from "fs";
import path from "path";

// String distance algorithm for high-performance fuzzy matching
function editDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return d[m][n];
}

export function stringSimilarity(s1: string, s2: string): number {
  const l1 = s1.length;
  const l2 = s2.length;
  const maxLen = Math.max(l1, l2);
  if (maxLen === 0) return 1.0;
  return (maxLen - editDistance(s1.toLowerCase(), s2.toLowerCase())) / maxLen;
}

// Multilingual translations for ingredients to align them with vocab keys
const LANGUAGE_TRANSLATIONS: Record<string, Record<string, string>> = {
  fr: {
    "tomate": "tomato",
    "tomates": "tomato",
    "ail": "garlic",
    "oignon": "onion",
    "oignons": "onion",
    "echalote": "shallot",
    "echalotes": "shallot",
    "poulet": "chicken",
    "boeuf": "beef",
    "porc": "pork",
    "agneau": "lamb",
    "veau": "veal",
    "canard": "duck",
    "saumon": "salmon",
    "thon": "tuna",
    "crevette": "shrimp",
    "crevettes": "shrimp",
    "homard": "lobster",
    "huitre": "oyster",
    "huitres": "oyster",
    "moule": "mussel",
    "moules": "mussel",
    "fraise": "strawberry",
    "fraises": "strawberry",
    "framboise": "raspberry",
    "framboises": "raspberry",
    "cerise": "cherry",
    "cerises": "cherry",
    "pomme": "apple",
    "pommes": "apple",
    "poire": "pear",
    "poires": "pear",
    "basilic": "basil",
    "thym": "thyme",
    "romarin": "rosemary",
    "persil": "parsley",
    "coriandre": "coriander",
    "ciboulette": "chive",
    "menthe": "mint",
    "origan": "oregano",
    "beurre": "butter",
    "lait": "milk",
    "creme": "cream",
    "creme liquide": "cream",
    "yaourt": "yogurt",
    "oeuf": "egg",
    "oeufs": "egg",
    "fromage": "cheese",
    "miel": "honey",
    "sucre": "sugar",
    "farine": "flour",
    "sel": "salt",
    "poivre": "black_pepper",
    "moutarde": "mustard",
    "mayonnaise": "mayonnaise",
    "huile": "vegetable_oil",
    "huile d'olive": "olive_oil",
    "vinaigre": "vinegar",
    "vin blanc": "white_wine",
    "vin rouge": "red_wine",
    "chocolat": "chocolate",
    "vanille": "vanilla",
    "cannelle": "cinnamon",
    "gingembre": "ginger",
    "pomme de terre": "potato",
    "pommes de terre": "potato",
    "carotte": "carrot",
    "carottes": "carrot",
    "champignon": "mushroom",
    "champignons": "mushroom",
    "courgettes": "zucchini",
    "courgette": "zucchini",
    "aubergine": "eggplant",
    "aubergines": "eggplant",
    "poivron": "bell_pepper",
    "poivrons": "bell_pepper",
    "citron": "lemon",
    "citron vert": "lime",
    "avocat": "avocado",
    "mangue": "mango",
    "ananas": "pineapple",
    "truffe": "black_truffle",
    "lardon": "bacon",
    "lardons": "bacon",
    "pain": "bread",
    "jambon": "ham"
  },
  es: {
    "tomate": "tomato",
    "ajo": "garlic",
    "cebolla": "onion",
    "chalote": "shallot",
    "pollo": "chicken",
    "ternera": "beef",
    "carne de res": "beef",
    "cerdo": "pork",
    "cordero": "lamb",
    "pato": "duck",
    "salmon": "salmon",
    "atun": "tuna",
    "camaron": "shrimp",
    "fresa": "strawberry",
    "frambuesa": "raspberry",
    "manzana": "apple",
    "pera": "pear",
    "albahaca": "basil",
    "tomillo": "thyme",
    "romero": "rosemary",
    "perejil": "parsley",
    "cilantro": "coriander",
    "menta": "mint",
    "mantequilla": "butter",
    "leche": "milk",
    "nata": "cream",
    "crema": "cream",
    "huevo": "egg",
    "queso": "cheese",
    "miel": "honey",
    "azucar": "sugar",
    "harina": "flour",
    "sal": "salt",
    "pimienta": "black_pepper",
    "mostaza": "mustard",
    "mayonesa": "mayonnaise",
    "aceite": "vegetable_oil",
    "aceite de oliva": "olive_oil",
    "vinagre": "vinegar",
    "vino blanco": "white_wine",
    "vino tinto": "red_wine",
    "chocolate": "chocolate",
    "vainilla": "vanilla",
    "canela": "cinnamon",
    "jengibre": "ginger",
    "patata": "potato",
    "zanahoria": "carrot",
    "champiñon": "mushroom",
    "calabacin": "zucchini",
    "berenjena": "eggplant",
    "pimiento": "bell_pepper",
    "limon": "lemon"
  },
  it: {
    "pomodoro": "tomato",
    "aglio": "garlic",
    "cipolla": "onion",
    "scalogno": "shallot",
    "pollo": "chicken",
    "manzo": "beef",
    "maiale": "pork",
    "agnello": "lamb",
    "anatra": "duck",
    "salmone": "salmon",
    "tonno": "tuna",
    "gambero": "shrimp",
    "fragola": "strawberry",
    "lampone": "raspberry",
    "mela": "apple",
    "pera": "pear",
    "basilico": "basil",
    "timo": "thyme",
    "rosmarino": "rosemary",
    "prezzemolo": "parsley",
    "cilantro": "coriander",
    "menta": "mint",
    "burro": "butter",
    "latte": "milk",
    "panna": "cream",
    "uovo": "egg",
    "formaggio": "cheese",
    "miele": "honey",
    "zucchero": "sugar",
    "farina": "flour",
    "sale": "salt",
    "pepe": "black_pepper",
    "senape": "mustard",
    "maionese": "mayonnaise",
    "olio": "vegetable_oil",
    "olio d'oliva": "olive_oil",
    "aceto": "vinegar",
    "vino bianco": "white_wine",
    "vino rosso": "red_wine",
    "cioccolato": "chocolate",
    "vaniglia": "vanilla",
    "cannella": "cinnamon",
    "zenzero": "ginger",
    "patata": "potato",
    "carota": "carota",
    "fungo": "mushroom",
    "zucchina": "zucchini",
    "melanzana": "eggplant",
    "peperone": "bell_pepper",
    "limone": "lemon"
  },
  de: {
    "tomate": "tomato",
    "knoblauch": "garlic",
    "zwiebel": "onion",
    "schalotte": "shallot",
    "hühnchen": "chicken",
    "rindfleisch": "beef",
    "schweinefleisch": "pork",
    "lamm": "lamb",
    "ente": "duck",
    "lachs": "salmon",
    "thunfisch": "tuna",
    "garnele": "shrimp",
    "erdbeere": "strawberry",
    "himbeere": "raspberry",
    "apfel": "apple",
    "birne": "pear",
    "basilikum": "basil",
    "thymian": "thyme",
    "rosmarin": "rosemary",
    "petersilie": "parsley",
    "koriander": "coriander",
    "minze": "mint",
    "butter": "butter",
    "milch": "milk",
    "sahne": "cream",
    "ei": "egg",
    "käse": "cheese",
    "honig": "honey",
    "zucker": "sugar",
    "mehl": "flour",
    "salz": "salt",
    "pfeffer": "black_pepper",
    "senf": "mustard",
    "mayonnaise": "mayonnaise",
    "öl": "vegetable_oil",
    "olivenöl": "olive_oil",
    "essig": "vinegar",
    "weißwein": "white_wine",
    "rotwein": "red_wine",
    "schokolade": "chocolate",
    "vanille": "vanilla",
    "zimt": "cinnamon",
    "ingwer": "ginger",
    "kartoffel": "potato",
    "karotte": "carrot",
    "pilz": "mushroom",
    "zucchini": "zucchini",
    "aubergine": "eggplant",
    "paprika": "bell_pepper",
    "zitrone": "lemon"
  }
};

// Map vocab English keys to their beautiful display terms in different target languages
const REVERSE_TRANSLATIONS: Record<string, Record<string, string>> = {
  fr: {
    "tomato": "Tomate",
    "garlic": "Ail",
    "onion": "Oignon",
    "shallot": "Échalote",
    "chicken": "Poulet",
    "beef": "Bœuf",
    "pork": "Porc",
    "lamb": "Agneau",
    "veal": "Veau",
    "duck": "Canard",
    "salmon": "Saumon",
    "tuna": "Thon",
    "shrimp": "Crevette",
    "lobster": "Homard",
    "oyster": "Huître",
    "mussel": "Moule",
    "strawberry": "Fraise",
    "raspberry": "Framboise",
    "cherry": "Cerise",
    "apple": "Pomme",
    "pear": "Poire",
    "basil": "Basilic",
    "thyme": "Thym",
    "rosemary": "Romarin",
    "parsley": "Persil",
    "coriander": "Coriandre",
    "chive": "Ciboulette",
    "mint": "Menthe",
    "oregano": "Origan",
    "butter": "Beurre",
    "milk": "Lait",
    "cream": "Crème",
    "yogurt": "Yaourt",
    "egg": "Œuf",
    "cheese": "Fromage",
    "honey": "Miel",
    "sugar": "Sucre",
    "flour": "Farine",
    "salt": "Sel",
    "black_pepper": "Poivre noir",
    "mustard": "Moutarde",
    "mayonnaise": "Mayonnaise",
    "vegetable_oil": "Huile végétale",
    "olive_oil": "Huile d'olive",
    "vinegar": "Vinaigre",
    "white_wine": "Vin blanc",
    "red_wine": "Vin rouge",
    "chocolate": "Chocolat",
    "vanilla": "Vanille",
    "cinnamon": "Cannelle",
    "ginger": "Gingembre",
    "potato": "Pomme de terre",
    "carrot": "Carotte",
    "mushroom": "Champignon",
    "zucchini": "Courgette",
    "eggplant": "Aubergine",
    "bell_pepper": "Poivron",
    "lemon": "Citron",
    "lime": "Citron vert",
    "avocado": "Avocat",
    "mango": "Mangue",
    "pineapple": "Ananas",
    "black_truffle": "Truffe noire",
    "bacon": "Lardon / Bacon",
    "bread": "Pain",
    "ham": "Jambon"
  },
  es: {
    "tomato": "Tomate",
    "garlic": "Ajo",
    "onion": "Cebolla",
    "shallot": "Chalote",
    "chicken": "Pollo",
    "beef": "Ternera",
    "pork": "Cerdo",
    "lamb": "Cordero",
    "duck": "Pato",
    "salmon": "Salmón",
    "tuna": "Atún",
    "shrimp": "Camarón",
    "strawberry": "Fresa",
    "raspberry": "Frambuesa",
    "apple": "Manzana",
    "pear": "Pera",
    "basil": "Albahaca",
    "thyme": "Tomillo",
    "rosemary": "Romero",
    "parsley": "Perejil",
    "coriander": "Cilantro",
    "mint": "Menta",
    "butter": "Mantequilla",
    "milk": "Leche",
    "cream": "Crema",
    "egg": "Huevo",
    "cheese": "Queso",
    "honey": "Miel",
    "sugar": "Azúcar",
    "flour": "Harina",
    "salt": "Sal",
    "black_pepper": "Pimienta negra",
    "mustard": "Mostaza",
    "olive_oil": "Aceite de oliva",
    "white_wine": "Vino blanco",
    "red_wine": "Vino tinto",
    "chocolate": "Chocolate",
    "vanilla": "Vainilla",
    "cinnamon": "Canela",
    "ginger": "Jengibre",
    "potato": "Patata",
    "carrot": "Zanahoria",
    "mushroom": "Champiñón",
    "zucchini": "Calabacín",
    "eggplant": "Berenjena",
    "bell_pepper": "Pimiento",
    "lemon": "Limón"
  },
  it: {
    "tomato": "Pomodoro",
    "garlic": "Aglio",
    "onion": "Cipolla",
    "shallot": "Scalogno",
    "chicken": "Pollo",
    "beef": "Manzo",
    "pork": "Maiale",
    "lamb": "Agnello",
    "duck": "Anatra",
    "salmon": "Salmone",
    "tuna": "Tonno",
    "shrimp": "Gambero",
    "strawberry": "Fragola",
    "raspberry": "Lampone",
    "apple": "Mela",
    "pear": "Pera",
    "basil": "Basilico",
    "thyme": "Timo",
    "rosemary": "Rosmarino",
    "parsley": "Prezzemolo",
    "coriander": "Cilantro",
    "mint": "Menta",
    "butter": "Burro",
    "milk": "Latte",
    "cream": "Panna",
    "egg": "Uovo",
    "cheese": "Formaggio",
    "honey": "Miele",
    "sugar": "Zucchero",
    "flour": "Farina",
    "salt": "Sale",
    "black_pepper": "Pepe nero",
    "mustard": "Senape",
    "olive_oil": "Olio d'oliva",
    "white_wine": "Vino bianco",
    "red_wine": "Vino rosso",
    "chocolate": "Cioccolato",
    "vanilla": "Vaniglia",
    "cinnamon": "Cannella",
    "ginger": "Zenzero",
    "potato": "Patata",
    "carrot": "Carota",
    "mushroom": "Champignon",
    "zucchini": "Zucchina",
    "eggplant": "Melanzana",
    "bell_pepper": "Peperone",
    "lemon": "Limone"
  },
  de: {
    "tomato": "Tomate",
    "garlic": "Knoblauch",
    "onion": "Zwiebel",
    "shallot": "Schalotte",
    "chicken": "Hühnchen",
    "beef": "Rindfleisch",
    "pork": "Schweinefleisch",
    "lamb": "Lamm",
    "duck": "Ente",
    "salmon": "Lachs",
    "tuna": "Thunfisch",
    "shrimp": "Garnele",
    "strawberry": "Erdbeere",
    "raspberry": "Himbeere",
    "apple": "Apfel",
    "pear": "Birne",
    "basil": "Basilikum",
    "thyme": "Thymian",
    "rosemary": "Rosmarin",
    "parsley": "Petersilie",
    "coriander": "Koriander",
    "mint": "Minze",
    "butter": "Butter",
    "milk": "Milch",
    "cream": "Sahne",
    "egg": "Ei",
    "cheese": "Käse",
    "honey": "Honig",
    "sugar": "Zucker",
    "flour": "Mehl",
    "salt": "Salz",
    "black_pepper": "Schwarzer Pfeffer",
    "mustard": "Senf",
    "olive_oil": "Olivenöl",
    "white_wine": "Weißwein",
    "red_wine": "Rotwein",
    "chocolate": "Schokolade",
    "vanilla": "Vanille",
    "cinnamon": "Zimt",
    "ginger": "Ingwer",
    "potato": "Kartoffel",
    "carrot": "Karotte",
    "mushroom": "Pilz",
    "zucchini": "Zucchini",
    "eggplant": "Aubergine",
    "bell_pepper": "Paprika",
    "lemon": "Zitrone"
  }
};

export class EpicureModel {
  vocab: Record<string, number> = {};
  vocabList: string[] = [];
  chemEmbeddings: Float32Array;
  coocEmbeddings: Float32Array;
  coreEmbeddings: Float32Array;
  vocabTranslations: Record<string, Record<string, string>> = { fr: {}, es: {}, it: {}, de: {} };
  isLoaded = false;

  constructor() {
    try {
      this.vocab = JSON.parse(fs.readFileSync("vocab.json", "utf-8"));
      this.vocabList = Object.keys(this.vocab).sort((a, b) => this.vocab[a] - this.vocab[b]);
      
      const transPath = "vocab_translations.json";
      if (fs.existsSync(transPath)) {
        try {
          this.vocabTranslations = JSON.parse(fs.readFileSync(transPath, "utf-8"));
          console.log("EpicureModel loaded 1790 translated terms dictionary.");
        } catch (e1) {
          console.error("Error parsing vocab_translations.json:", e1);
        }
      }

      this.chemEmbeddings = this.loadEmbeddings("embeddings.safetensors");
      this.coocEmbeddings = this.loadEmbeddings("embeddings (1).safetensors");
      this.coreEmbeddings = this.loadEmbeddings("embeddings (2).safetensors");
      this.isLoaded = true;
      console.log("EpicureModel loaded 1790 ingredients and vectors successful.");
    } catch (err) {
      console.error("CRITICAL error loading EpicureModel embedding files:", err);
      // Fallback arrays to avoid server startup crash if files missing during build
      this.chemEmbeddings = new Float32Array(1790 * 300);
      this.coocEmbeddings = new Float32Array(1790 * 300);
      this.coreEmbeddings = new Float32Array(1790 * 300);
    }
  }

  private loadEmbeddings(filePath: string): Float32Array {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Embedding file ${filePath} does not exist`);
    }
    const buffer = fs.readFileSync(filePath);
    const headerSize = Number(buffer.readBigUInt64LE(0));
    const offsetStart = 8 + headerSize;
    const sizeNeeded = 1790 * 300 * 4;
    const tensorBuf = buffer.subarray(offsetStart, offsetStart + sizeNeeded);
    return new Float32Array(
      tensorBuf.buffer,
      tensorBuf.byteOffset,
      1790 * 300
    );
  }

  getVector(index: number, type: "chem" | "cooc" | "core"): Float32Array {
    const embeddings =
      type === "chem"
        ? this.chemEmbeddings
        : type === "cooc"
        ? this.coocEmbeddings
        : this.coreEmbeddings;
    return embeddings.subarray(index * 300, (index + 1) * 300);
  }

  cosineSimilarity(vecA: Float32Array, vecB: Float32Array): number {
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < 300; i++) {
      const a = vecA[i];
      const b = vecB[i];
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  getSimilarity(ingA: string, ingB: string, type: "chem" | "cooc" | "core"): number {
    const idxA = this.vocab[ingA];
    const idxB = this.vocab[ingB];
    if (idxA === undefined || idxB === undefined) return 0;
    const vecA = this.getVector(idxA, type);
    const vecB = this.getVector(idxB, type);
    return this.cosineSimilarity(vecA, vecB);
  }

  // Multilingual, smart normalization and mapping
  mapToVocab(ingredientName: string, lang = "fr"): string | null {
    if (!ingredientName) return null;
    let name = ingredientName.toLowerCase().trim();
    
    // Remove accents
    name = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Remove plurals/modifiers with word boundaries to avoid truncating words like 'fraises'
    name = name.replace(/\b(un|une|des|le|la|les|de|la|du|et|frais|fraiche|fraiches|entier|entiere|bio|poudre|moulu|grille|seche|seches|sauvage|verts|vert|noir|noire|blanc|blanche|rouge)\b/gi, "");
    name = name.replace(/\s+/g, " ").trim();

    // Try matching in full vocabTranslations with accent/normalization
    const langMap = this.vocabTranslations[lang];
    if (langMap) {
      for (const [englishKey, translatedValue] of Object.entries(langMap)) {
        if (!translatedValue) continue;
        const normTrans = translatedValue
          .toLowerCase()
          .trim()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\b(un|une|des|le|la|les|de|la|du|et|frais|fraiche|fraiches|entier|entiere|bio|poudre|moulu|grille|seche|seches|sauvage|verts|vert|noir|noire|blanc|blanche|rouge)\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        if (normTrans === name || englishKey.replace(/_/g, " ") === name) {
          return englishKey;
        }
      }
    }

    // Try word-by-word tokenized translations
    const customMap = LANGUAGE_TRANSLATIONS[lang] || {};
    const words = name.split(/\s+/).filter(Boolean);
    const translatedWords = words.map(w => customMap[w] || w);
    const translatedJoined = translatedWords.join("_");

    if (this.vocab[translatedJoined] !== undefined) {
      return translatedJoined;
    }

    // Try finding if any single translated word is in vocab (preferring nouns)
    for (const w of translatedWords) {
      if (this.vocab[w] !== undefined && w.length > 2) {
        return w;
      }
    }

    if (customMap[name]) {
      return customMap[name];
    }

    // Try finding exact or partial snake_case matches in the vocab keys
    let formatted = name.replace(/[\s-]+/g, "_");
    if (this.vocab[formatted] !== undefined) {
      return formatted;
    }

    // Strip "s" at the end for plural matches
    if (formatted.endsWith("s")) {
      const singular = formatted.slice(0, -1);
      if (this.vocab[singular] !== undefined) {
        return singular;
      }
    }

    // Try matching sub-words or doing fuzzy lookup
    let bestMatch: string | null = null;
    let maxSim = 0.0;
    for (const key of this.vocabList) {
      // Direct substring match
      if (key.includes(formatted) || formatted.includes(key)) {
        return key;
      }
      // Fuzzy match
      const sim = stringSimilarity(formatted, key);
      if (sim > maxSim) {
        maxSim = sim;
        bestMatch = key;
      }
    }

    // Threshold high confidence fuzzy matches
    if (maxSim > 0.75 && bestMatch) {
      return bestMatch;
    }

    return null;
  }

  // Get localized name for keys
  getLocalizedName(vocabKey: string, lang = "fr"): string {
    const map = REVERSE_TRANSLATIONS[lang] || {};
    if (map[vocabKey]) return map[vocabKey];
    
    // Check if we have it in our full vocabTranslations dictionary
    if (this.vocabTranslations[lang] && this.vocabTranslations[lang][vocabKey]) {
      return this.vocabTranslations[lang][vocabKey];
    }

    // Fallback: format snake_case to capitalized Title Case
    return vocabKey
      .split("_")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  // Find top compatible ingredients
  getRecommendations(ing: string, limit = 10, lang = "fr") {
    const vocabKey = this.vocab[ing] !== undefined ? ing : this.mapToVocab(ing, lang);
    if (!vocabKey) return [];
    
    const recommendations: Array<{
      key: string;
      localizedName: string;
      chem: number;
      cooc: number;
      core: number;
      composite: number;
    }> = [];

    const idx = this.vocab[vocabKey];
    const vecChem = this.getVector(idx, "chem");
    const vecCooc = this.getVector(idx, "cooc");
    const vecCore = this.getVector(idx, "core");

    for (const key of this.vocabList) {
      if (key === vocabKey) continue;
      const targetIdx = this.vocab[key];
      const tChem = this.getVector(targetIdx, "chem");
      const tCooc = this.getVector(targetIdx, "cooc");
      const tCore = this.getVector(targetIdx, "core");

      const simChem = this.cosineSimilarity(vecChem, tChem);
      const simCooc = this.cosineSimilarity(vecCooc, tCooc);
      const simCore = this.cosineSimilarity(vecCore, tCore);

      // Weighted composite score (Flavor chemistry matches are highly valued)
      const composite = (simChem * 0.4 + simCooc * 0.3 + simCore * 0.3);

      recommendations.push({
        key,
        localizedName: this.getLocalizedName(key, lang),
        chem: simChem,
        cooc: simCooc,
        core: simCore,
        composite
      });
    }

    // Sort by composite pairing compatibility
    return recommendations
      .sort((a, b) => b.composite - a.composite)
      .slice(0, limit);
  }

  // Analyze recipe harmony and return statistics
  analyzeRecipe(ingredients: string[], lang = "fr") {
    // Map ingredients to vocabulary keys
    const mapped = ingredients
      .map(ing => ({
        original: ing,
        mappedKey: this.mapToVocab(ing, lang)
      }))
      .filter(item => item.mappedKey !== null) as Array<{ original: string; mappedKey: string }>;

    if (mapped.length < 2) {
      return {
        harmonyScore: 100,
        remarks: "Ajoutez au moins deux ingrédients valides pour l'analyse aromatique.",
        details: [],
        outliers: [],
        mappedCount: mapped.length
      };
    }

    const details: Array<{
      ingA: string;
      ingB: string;
      localA: string;
      localB: string;
      chem: number;
      cooc: number;
      core: number;
      composite: number;
    }> = [];

    // Compute pairwise affinities
    for (let i = 0; i < mapped.length; i++) {
      for (let j = i + 1; j < mapped.length; j++) {
        const keyA = mapped[i].mappedKey;
        const keyB = mapped[j].mappedKey;

        const chem = this.getSimilarity(keyA, keyB, "chem");
        const cooc = this.getSimilarity(keyA, keyB, "cooc");
        const core = this.getSimilarity(keyA, keyB, "core");
        const composite = chem * 0.4 + cooc * 0.3 + core * 0.3;

        details.push({
          ingA: keyA,
          ingB: keyB,
          localA: this.getLocalizedName(keyA, lang),
          localB: this.getLocalizedName(keyB, lang),
          chem,
          cooc,
          core,
          composite
        });
      }
    }

    // Calculate individual scores for each mapped ingredient to identify outliers
    const ingredientAverages = mapped.map(item => {
      const pairs = details.filter(d => d.ingA === item.mappedKey || d.ingB === item.mappedKey);
      const avgComposite = pairs.reduce((sum, p) => sum + p.composite, 0) / (pairs.length || 1);
      const avgChem = pairs.reduce((sum, p) => sum + p.chem, 0) / (pairs.length || 1);
      const avgCooc = pairs.reduce((sum, p) => sum + p.cooc, 0) / (pairs.length || 1);
      const avgCore = pairs.reduce((sum, p) => sum + p.core, 0) / (pairs.length || 1);

      return {
        key: item.mappedKey,
        original: item.original,
        localized: this.getLocalizedName(item.mappedKey, lang),
        avgComposite,
        avgChem,
        avgCooc,
        avgCore
      };
    });

    // Sort ingredients by their composite average similarity. Lower scores = potential outliers.
    const sortedAverages = [...ingredientAverages].sort((a, b) => a.avgComposite - b.avgComposite);
    
    // Outliers are items having compatibility below a certain threshold relative to others
    const outliers = sortedAverages.filter(item => item.avgComposite < 0.12 || (item.avgCooc < 0.02 && item.avgChem < 0.08 && sortedAverages.length >= 3));

    // Generate alternative recommendations for outliers
    const outlierRecommendations = outliers.map(outlier => {
      // Find other ingredients that would have the best compatibility with current mapped ingredients excluding the outlier
      const others = mapped.filter(item => item.mappedKey !== outlier.key).map(item => item.mappedKey);
      
      const candidates: Array<{ key: string; score: number }> = [];
      
      for (const key of this.vocabList) {
        if (others.includes(key) || key === outlier.key) continue;
        let sum = 0;
        for (const oKey of others) {
          const comp = this.getSimilarity(key, oKey, "chem") * 0.4 +
                       this.getSimilarity(key, oKey, "cooc") * 0.3 +
                       this.getSimilarity(key, oKey, "core") * 0.3;
          sum += comp;
        }
        candidates.push({ key, score: sum / others.length });
      }

      const topCandidates = candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(c => ({
          key: c.key,
          localizedName: this.getLocalizedName(c.key, lang),
          score: c.score
        }));

      return {
        outlier: outlier.localized,
        original: outlier.original,
        key: outlier.key,
        currentScore: outlier.avgComposite,
        suggestions: topCandidates
      };
    });

    // Calculate recipe-wide average harmony score scaled between 0 and 100
    const rawAverage = details.reduce((sum, d) => sum + d.composite, 0) / (details.length || 1);
    
    // Map raw composite average (typically between -0.05 and 0.45) to a clean 0-100 score
    // An average composite score of 0.25+ is incredibly harmonious
    let harmonyScore = Math.round(((rawAverage + 0.05) / 0.3) * 100);
    if (harmonyScore > 100) harmonyScore = 100;
    if (harmonyScore < 10) harmonyScore = 10;

    let remarks = "";
    if (harmonyScore > 85) {
      remarks = lang === "fr" ? "Harmonie aromatique exceptionnelle ! Accord gastronomique scientifiquement validé." :
                lang === "es" ? "¡Armonía aromática excepcional! Combinación gastronómica científicamente validada." :
                lang === "de" ? "Außergewöhnliche aromatische Harmonie! Wissenschaftlich bestätigte gastronomische Kombination." :
                lang === "it" ? "Armonia aromatica eccezionale! Abbinamento gastronomico scientificamente convalidato." :
                "Exceptional aromatic harmony! Scientifically validated culinary pairing.";
    } else if (harmonyScore > 60) {
      remarks = lang === "fr" ? "Bon accord classique de saveurs. Équilibré et fiable." :
                lang === "es" ? "Buena combinación clásica de sabores. Equilibrada y confiable." :
                lang === "de" ? "Gute klassische Geschmackskombination. Ausgewogen und zuverlässig." :
                lang === "it" ? "Buon abbinamento classico di sapori. Equilibrato e affidabile." :
                "Good classic flavor pairing. Balanced and reliable.";
    } else {
      remarks = lang === "fr" ? "Attention Chef : combinaisons aromatiques insolites ou potentiellement discordantes détectées." :
                lang === "es" ? "Atención Chef: se detectaron combinaciones aromáticas inusuales o discordantes de sabores." :
                lang === "de" ? "Achtung Chef: Ungewöhnliche oder potenziell unharmonische Aromenkombinationen erkannt." :
                lang === "it" ? "Attenzione Chef: rilevate combinazioni aromatiche insolite o potenzialmente discordanti." :
                "Attention Chef: unusual or potentially discordant flavor matches detected.";
    }

    return {
      harmonyScore,
      remarks,
      details,
      outliers: outlierRecommendations,
      ingredientScores: ingredientAverages,
      mappedCount: mapped.length
    };
  }
}
