// Chantier 39-B — kit d'exemples pré-rempli, effaçable par le client.
//
// But : sur une base vierge, chaque onglet montre UN exemple concret :
//  1 élément en stock, 1 fiche en production, 1 document scanné, 1 doc HACCP.
// Le client peut effacer le kit (POST /api/demo/supprimer) — c'est SA
// suppression, pas celle de l'agent : l'agent n'écrit jamais (§8).
//
// Le kit est TRACE dans la table demo_kit (une ligne par entité semée + une
// ligne-marque « marque » qui SURVIT à la purge : elle empêche le
// re-semage automatique après une purge voulue par le client).
//
// Aucune IA ici : INSERT/DELETE déterministes, dans le même ordre de
// colonnes que les INSERT des routes métier (inventory.ts, recipes.ts,
// documents.ts, haccp.ts, menuplanning.ts).
import { Router } from "express";
import type { Database } from "sqlite";
import type { AuditLogger } from "../services/audit.js";

/** Les lignes du kit (ids stables, lisibles, nommés par la table demo_kit). */
export const KIT = {
  inventaire: "demo-inventaire",
  recette: "demo-recette",
  ingredient: "demo-ingredient",
  planning: "demo-planning",
  document: "demo-document",
  documentItem1: "demo-document-item-1",
  documentItem2: "demo-document-item-2",
  haccp: "demo-haccp",
} as const;

/** Le métier est-il vierge (les 4 surfaces des onglets) ? */
export async function metierVierge(db: Database): Promise<boolean> {
  const [inv, rec, doc, haccp] = await Promise.all([
    db.get("SELECT COUNT(*) AS n FROM inventory"),
    db.get("SELECT COUNT(*) AS n FROM recipes"),
    db.get("SELECT COUNT(*) AS n FROM documents"),
    db.get("SELECT COUNT(*) AS n FROM haccp_documents"),
  ]);
  return (
    Number((inv as { n?: number })?.n ?? 0) === 0 &&
    Number((rec as { n?: number })?.n ?? 0) === 0 &&
    Number((doc as { n?: number })?.n ?? 0) === 0 &&
    Number((haccp as { n?: number })?.n ?? 0) === 0
  );
}

/** La marque du kit est-elle posée (kit déjà semé une fois) ? */
export async function dejaSeme(db: Database): Promise<boolean> {
  const marque = await db.get(
    "SELECT id FROM demo_kit WHERE entite = 'marque' LIMIT 1",
  );
  return marque !== null && marque !== undefined;
}

/** Sème le kit (6 surfaces, 8 lignes) + la marque. Idempotent par la marque. */
export async function semer(db: Database): Promise<{ creees: string[] }> {
  if (await dejaSeme(db)) return { creees: [] };

  const date = new Date().toISOString().slice(0, 10);
  const tracees: string[] = [];
  const tracer = async (entite: string, entiteId: string) => {
    await db.run("INSERT INTO demo_kit (entite, entite_id) VALUES (?, ?)", [
      entite,
      entiteId,
    ]);
    tracees.push(entiteId);
  };

  // 1) Inventaire — 1 élément en stock.
  await db.run(
    "INSERT INTO inventory (id, name, quantity, minStock, unit, status, category, unit_price, yield_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [KIT.inventaire, "Filet de canard (exemple)", 4, 2, "kg", "ok", "Viandes", 18.9, 100],
  );
  await tracer("inventory", KIT.inventaire);

  // 2) Fiche en production — 1 fiche technique enregistrée + 1 ligne de plan.
  await db.run(
    "INSERT INTO recipes (id, name, category, dish_type, preparation_steps, source_image_url, allergens, language, is_saved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      KIT.recette,
      "Magret de canard aux navets (exemple)",
      "Plats",
      "plat",
      "1. Saisir le magret côté peau. 2. Cuire les navets glacés. 3. Dresser.",
      null,
      "[]",
      "fr",
      1,
    ],
  );
  await tracer("recipes", KIT.recette);
  await db.run(
    "INSERT INTO recipe_ingredients (id, recipe_id, inventory_id, quantity_per_person) VALUES (?, ?, ?, ?)",
    [KIT.ingredient, KIT.recette, KIT.inventaire, 0.15],
  );
  await tracer("recipe_ingredients", KIT.ingredient);
  await db.run(
    "INSERT INTO menu_planning (id, date, meal_type, recipe_id, title, recipe_json, language) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      KIT.planning,
      date,
      "lunch",
      KIT.recette,
      "Magret de canard aux navets (exemple)",
      JSON.stringify({ couverts: 4, fiches: ["Magret de canard aux navets (exemple)"] }),
      "fr",
    ],
  );
  await tracer("menu_planning", KIT.planning);

  // 3) Document scanné — 1 facture en attente de validation, 2 lignes.
  await db.run(
    "INSERT INTO documents (id, type, supplier, date, total_amount, source_image_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [KIT.document, "FACTURE", "Auguste (exemple)", date, 45.8, null, "PENDING"],
  );
  await tracer("documents", KIT.document);
  await db.run(
    "INSERT INTO document_items (id, document_id, inventory_id, original_name, quantity, unit_price, unit_price_brut, lot_number, dlc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [KIT.documentItem1, KIT.document, null, "Filet de canard", 2.5, 17.8, 17.8, null, null],
  );
  await tracer("document_items", KIT.documentItem1);
  await db.run(
    "INSERT INTO document_items (id, document_id, inventory_id, original_name, quantity, unit_price, unit_price_brut, lot_number, dlc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [KIT.documentItem2, KIT.document, null, "Navets", 1.5, 2.2, 2.2, null, null],
  );
  await tracer("document_items", KIT.documentItem2);

  // 4) Doc HACCP — 1 plan.
  await db.run(
    "INSERT INTO haccp_documents (id, type, name, file_url) VALUES (?, ?, ?, ?)",
    [KIT.haccp, "PLAN", "Exemple — plan de nettoyage", null],
  );
  await tracer("haccp_documents", KIT.haccp);

  // La marque : posee EN DERNIER. Si le script est coupé avant, la prochaine
  // semence reprend ; les INSERT sont idempotents par id PRIMARY KEY.
  await db.run("INSERT INTO demo_kit (entite, entite_id) VALUES (?, ?)", [
    "marque",
    "demo-kit-v1",
  ]);
  return { creees: tracees };
}

/** Purge le kit : supprime exactement les lignes tracées, CONSERVE la marque. */
export async function purger(db: Database): Promise<{ supprimees: string[] }> {
  const lignes = (await db.all(
    "SELECT entite, entite_id FROM demo_kit WHERE entite != 'marque'",
  )) as Array<{ entite: string; entite_id: string }>;
  const supprimees: string[] = [];
  for (const l of lignes) {
    switch (l.entite) {
      case "inventory":
        await db.run("DELETE FROM recipe_ingredients WHERE inventory_id = ?", [
          l.entite_id,
        ]);
        await db.run("DELETE FROM inventory WHERE id = ?", [l.entite_id]);
        break;
      case "recipes":
        await db.run("DELETE FROM recipe_ingredients WHERE recipe_id = ?", [
          l.entite_id,
        ]);
        await db.run("DELETE FROM menu_planning WHERE recipe_id = ?", [l.entite_id]);
        await db.run("DELETE FROM recipes WHERE id = ?", [l.entite_id]);
        break;
      case "recipe_ingredients":
      case "document_items":
        await db.run(`DELETE FROM ${l.entite} WHERE id = ?`, [l.entite_id]);
        break;
      case "menu_planning":
        await db.run("DELETE FROM menu_planning WHERE id = ?", [l.entite_id]);
        break;
      case "documents":
        await db.run("DELETE FROM document_items WHERE document_id = ?", [
          l.entite_id,
        ]);
        await db.run("DELETE FROM documents WHERE id = ?", [l.entite_id]);
        break;
      case "haccp_documents":
        await db.run("DELETE FROM haccp_documents WHERE id = ?", [l.entite_id]);
        break;
    }
    await db.run("DELETE FROM demo_kit WHERE entite = ? AND entite_id = ?", [
      l.entite,
      l.entite_id,
    ]);
    supprimees.push(l.entite_id);
  }
  return { supprimees };
}

export default function createDemoRouter(db: Database, logAudit: AuditLogger) {
  const router = Router();

  // GET /api/demo/etat — lecture libre : le kit est-il présent ?
  router.get("/api/demo/etat", async (_req, res) => {
    try {
      const lignes = (await db.all("SELECT entite, entite_id FROM demo_kit")) as Array<{
        entite: string;
        entite_id: string;
      }>;
      res.json({
        status: "ok",
        present: lignes.some((l) => l.entite !== "marque"),
        seme: lignes.some((l) => l.entite === "marque"),
        entites: lignes.filter((l) => l.entite !== "marque").map((l) => l.entite_id),
      });
    } catch (e) {
      res
        .status(500)
        .json({ status: "error", message: `Etat du kit impossible : ${String(e)}` });
    }
  });

  // POST /api/demo/semence — sème si la marque est absente. Idempotent.
  router.post("/api/demo/semence", async (req, res) => {
    try {
      const r = await semer(db);
      await logAudit(req, res, {
        route: "/api/demo/semence",
        action: r.creees.length ? "create" : "noop",
        entite: "demo-kit",
        payload: { creees: r.creees },
      });
      res.json({ status: "ok", creees: r.creees });
    } catch (e) {
      res
        .status(500)
        .json({ status: "error", message: `Semence impossible : ${String(e)}` });
    }
  });

  // POST /api/demo/supprimer — le CLIENT efface le kit (ses lignes tracées,
  // jamais les données réelles). La marque reste : pas de re-semage surprise.
  router.post("/api/demo/supprimer", async (req, res) => {
    try {
      const r = await purger(db);
      await logAudit(req, res, {
        route: "/api/demo/supprimer",
        action: "delete",
        entite: "demo-kit",
        payload: { supprimees: r.supprimees },
      });
      res.json({ status: "ok", supprimees: r.supprimees });
    } catch (e) {
      res
        .status(500)
        .json({ status: "error", message: `Purge impossible : ${String(e)}` });
    }
  });

  return router;
}
