// Routes : Admin (téléchargements guides/DB, statut backup, RPA agent)
import { Router } from "express";
import fs from "fs";
import path from "path";
import type { AuditLogger } from "../services/audit.js";

// Factory : les routes admin ont besoin du dossier de données utilisateur.
export default function adminRouter(storageDir: string, logAudit: AuditLogger) {
  const router = Router();

router.get("/api/admin/guide-download", (req, res) => {
const guidePath = path.join(process.cwd(), "public", "Executive_Guide.pdf");
if (fs.existsSync(guidePath)) {
  res.download(guidePath, "Executive_Guide.pdf");
} else {
  res.status(404).json({ error: "Guide not found" });
}
});

router.get("/api/admin/db-download", (req, res) => {
const dbFile = path.join(storageDir, "agent_culinaire.db");
if (fs.existsSync(dbFile)) {
  res.download(dbFile, "agent_culinaire.db");
} else {
  res.status(404).json({ error: "Database file not found" });
}
});
router.post("/api/backup", (req, res) => {
const dbFile = path.join(storageDir, "agent_culinaire.db");
if (fs.existsSync(dbFile)) {
  logAudit(req, res, { route: "/api/backup", action: "backup" });
  res.json({
    status: "success",
    message: "Database is healthy and persisted.",
  });
} else {
  res
    .status(500)
    .json({ status: "error", message: "Database file missing." });
}
});
router.post("/api/agent/command", async (req, res) => {
  // Le try/catch qui ferme ce bloc est CONSERVE tel quel: une erreur
  // serveur doit rester une erreur serveur (500), pas un 200 muet.
  //
  // ⚠ CE BLOC A ETE REECRIT. L'ancien lancait un navigateur, attendait
  // deux secondes, le refermait, puis presentait chaque ligne du panier
  // comme une visite fournisseur effectuee, avec un found_price egal au
  // prix QUE L'APPELANT venait d'envoyer: un devis qui se confirme
  // lui-meme. Aucun consommateur (src/lib/helpers.tsx, releve par
  // octets) ne lisait un prix renvoye: il n'y avait rien a extraire,
  // seulement un contrat a nommer.
  try {
  const payload = req.body;
  const carts = payload?.data?.carts;
  if (!Array.isArray(carts) || carts.length === 0) {
    return res.status(400).json({
      status: "error",
      refused: ["data.carts"],
      error:
        "aucun article a comparer: un succes sur zero ligne n'est pas une analyse",
    });
  }
  const rpaResults: Array<{
    item: unknown;
    status: string;
    verified: boolean;
    source: string;
    found_price: number | null;
    found_supplier: unknown;
  }> = [];
  for (const cartItem of carts) {
    rpaResults.push({
      item: cartItem?.item ?? null,
      status: "SIMULATION: echo de la saisie, aucune navigation jouee",
      verified: false,
      source: "echo-input",
      found_price: null,
      found_supplier: cartItem?.supplier ?? null,
    });
  }
  await logAudit(req, res, { route: "/api/agent/command", action: "agent_command", payload: { lignes: rpaResults.length, mode: "SIMULATION" } });
  res.json({
    status: "success",
    // Le contrat est dans le NOM: ce qui est rendu est une simulation
    mode: "SIMULATION",
    verified: false,
    message:
      rpaResults.length +
      " ligne(s) simulee(s): les prix ci-dessous sont ceux de votre saisie.",
    claus_analysis:
      "Simulation locale: les lignes ci-dessous rejouent votre saisie, " +
      "aucune comparaison fournisseur n'a ete jouee. " +
      rpaResults.map((r) => String(r.item) + ": a confirmer").join(", "),
    results: rpaResults,
  });
} catch (error) {
  console.error("Erreur:", error);
  res.status(500).json({
    status: "error",
    message: "Une erreur est survenue pendant le traitement de la commande.",
    error: String(error),
  });
}
});

  return router;
}