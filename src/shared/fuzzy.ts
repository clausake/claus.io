// Matching flou d'ingrédients (normalisation + distance de Levenshtein).
// Utilisé pour mapper les noms extraits par l'IA (factures, scans) vers les
// articles existants de l'inventaire.

function textNormalizer(text: string): string {
  if (!text) return "";
  let str = text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // strip accents

  // Replace symbols/punctuation with spaces
  str = str.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'\"’]/g, " ");

  const stopwords = new Set(["de", "la", "le", "les", "du", "en", "au", "aux", "pour", "and", "with", "des", "un", "une", "d", "l"]);
  const states = new Set([
    "frais", "fraiche", "fraiches", "fresh",
    "rape", "rapes", "rapee", "rapees",
    "seche", "seches", "sechees", "dried",
    "moulu", "moulus", "moulue", "moulues", "ground",
    "powder", "poudre", "bio", "organic", "organique",
    "rouge", "rouges", "vert", "verts", "blanc", "blancs", "jaune", "jaunes", "noir", "noirs"
  ]);

  let words = str.split(/\s+/).map(w => w.trim()).filter(Boolean);
  const filteredWords = words.filter(w => !stopwords.has(w) && !states.has(w));
  if (filteredWords.length > 0) {
    words = filteredWords;
  }

  // Basic singularization
  words = words.map(w => {
    if (w.length > 3) {
      if (w.endsWith("s") && !["ananas", "couscous", "os", "jus"].includes(w)) {
        return w.slice(0, -1);
      }
      if (w.endsWith("x") && !["prix", "noix"].includes(w)) {
        return w.slice(0, -1);
      }
    }
    return w;
  });

  return words.join(" ").trim();
}

function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost  // substitution
      );
    }
  }
  return matrix[len1][len2];
}

function computeSimilarity(s1: string, s2: string): number {
  const norm1 = textNormalizer(s1);
  const norm2 = textNormalizer(s2);

  if (!norm1 && !norm2) return 1.0;
  if (!norm1 || !norm2) return 0.0;
  if (norm1 === norm2) return 1.0;

  // Substring match heuristic
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const minLen = Math.min(norm1.length, norm2.length);
    const maxLen = Math.max(norm1.length, norm2.length);
    if (minLen / maxLen >= 0.6) {
      return 0.92;
    }
  }

  const distance = levenshteinDistance(norm1, norm2);
  const maxLength = Math.max(norm1.length, norm2.length);
  return 1 - distance / maxLength;
}

// Cherche dans l'inventaire l'article correspondant à inputName (match exact
// d'abord, puis flou avec seuil 0.78). Retourne null si rien ne correspond.
export interface InventoryRow {
  id: string;
  name: string;
  unit: string;
}

export interface DbConn {
  all(sql: string, params?: unknown[]): Promise<InventoryRow[]>;
}

export async function findMatchingInventoryItem(dbConn: DbConn, inputName: string): Promise<InventoryRow | null> {
  if (!inputName) return null;
  const items = await dbConn.all("SELECT id, name, unit FROM inventory");

  let bestMatch: InventoryRow | null = null;
  let highestScore = 0;

  for (const item of items) {
    // First, check exact match (case-insensitive)
    if (item.name.toLowerCase().trim() === inputName.toLowerCase().trim()) {
      return item;
    }

    const score = computeSimilarity(inputName, item.name);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = item;
    }
  }

  // Threshold score is 0.78 for mapping matches
  if (highestScore >= 0.78 && bestMatch) {
    console.log(`[FUZZY MATCH] Mapped "${inputName}" to "${bestMatch.name}" with score ${highestScore.toFixed(2)}`);
    return bestMatch;
  }
  return null;
}
