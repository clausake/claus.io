// Modules PURS des fiches techniques (chantier 8, fond de liste AGENTS.md).
// Extraits de src/components/FichesTechniques.tsx SANS changer le
// comportement : la cartographie (dossiers) et l'export PDF. Aucun state,
// aucun fetch — des fonctions jouables au test unitaire.
//
// Le PDF garde les DEPENDANCES du composant en parametres (labels t,
// guestCounts, prix effectif d'un ingredient) : le module ne connait ni
// React ni le composant.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Sprint 16 : les dossiers sont les TROIS cartes Entree / Plat / Dessert
// (le plat se range par carte, plus « Fiches Importees » pour l'empreinte
// optique du menu papier). Les anciens dossiers des generations annulees
// (creative / gastronomic / traditional) ne sont plus proposes ; les lignes
// deja en base avec ces categories restent visibles via « Fiches Importees ».
export function appartientDossier(
  r: { category?: string | null; dish_type?: string | null },
  dossierId: string,
): boolean {
  const cat = r.category || "general";
  if (dossierId === "decompose") {
    return !["entree", "plat", "dessert"].includes(r.dish_type || "") ||
      cat === "general" || cat === "decompose";
  }
  const tType = r.dish_type || "plat";
  if (tType === dossierId) return true;
  // Les fiches importees sans dish_type rangees par categorie textuelle
  // (legacy « Plat ») rejoignent leur carte.
  if (dossierId === "plat" && /plat/i.test(cat)) return true;
  if (dossierId === "entree" && /entree|entrée/i.test(cat)) return true;
  if (dossierId === "dessert" && /dessert/i.test(cat)) return true;
  return false;
}

export interface RecipePdf {
  id: string;
  name?: string;
  preparation_steps?: string;
  ingredients?: Array<{
    inventory_name?: string;
    name?: string;
    quantity_per_person?: string | number;
    unit?: string;
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
}

export interface PdfLabels {
  technicalSheetFull?: string;
  untitled?: string;
  guests?: string;
  prepSteps?: string;
  requiredIngredients?: string;
  ingredient?: string;
  qtyShort?: string;
  cost?: string;
}

/** L'export PDF d'UNE fiche. `prixEffectif` = getIngredientEffectivePrice du
 *  composant (injete), `guestCount` = les couverts du state. */
export function exportSingleRecipeToPDF(
  recipe: RecipePdf,
  opts: {
    labels: PdfLabels;
    guestCount: number;
    prixEffectif: (ing: Record<string, unknown>) => number;
  },
): void {
  const { labels: t, guestCount: count, prixEffectif } = opts;
  const doc = new jsPDF();
  doc.setFontSize(22);
  doc.setTextColor(245, 158, 11); // Amber 500
  doc.text(t.technicalSheetFull || "FICHE TECHNIQUE", 20, 20);

  doc.setFontSize(16);
  doc.setTextColor(31, 41, 55); // Gray 800
  doc.text(recipe.name || t.untitled || "Recette sans nom", 20, 35);

  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128); // Gray 500
  doc.text(`${t.guests || "Couverts"} : ${count}`, 20, 45);

  doc.setDrawColor(229, 231, 235);
  doc.line(20, 50, 190, 50);

  let y = 60;

  if (recipe.preparation_steps) {
    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text(t.prepSteps || "Étapes de préparation :", 20, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    const stepsText = doc.splitTextToSize(recipe.preparation_steps, 170);
    doc.text(stepsText, 20, y);
    y += stepsText.length * 5 + 10;
  }

  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(14);
  doc.setTextColor(31, 41, 55);
  doc.text(t.requiredIngredients || "Ingrédients requis :", 20, y);

  const tableData = (recipe.ingredients || []).map((ing) => {
    const qte =
      parseFloat(
        (ing.quantity_per_person || "").toString().replace(",", "."),
      ) || 0;
    let totalQte = qte * count;
    let displayUnit = ing.unit || "kg";

    if ((displayUnit === "g" || displayUnit === "ml") && totalQte >= 1000) {
      totalQte = totalQte / 1000;
      displayUnit = displayUnit === "g" ? "kg" : "L";
    }

    return [
      ing.inventory_name || ing.name || "",
      `${totalQte.toFixed(displayUnit === "g" || (displayUnit === "ml" && totalQte > 1) ? 0 : 2)} ${displayUnit}`,
      (qte * prixEffectif(ing) * count).toFixed(2),
    ];
  });

  autoTable(doc, {
    startY: y + 5,
    head: [
      [t.ingredient || "Ingrédient", t.qtyShort || "Qte", t.cost || "Coût"],
    ],
    body: tableData,
    theme: "grid",
    headStyles: { fillColor: [245, 158, 11] },
  });

  doc.save(
    `fiche_technique_${recipe.name?.replace(/\s+/g, "_") || "recette"}.pdf`,
  );
}
