// Sonde du contrat ECRIT/LUE de PUT /api/inventory/:id.
//
// La regle du projet: une route qui filtre/ecrit une colonne est jugee contre ce
// que la voie D'ECRITURE y depose reellement, et une reponse ne prouve rien si la
// valeur qu'elle rend n'a pas ete relue depuis la base.
//
// Ce que la sonde mesure, dans l'ordre, sur un serveur REEL (spawn tsx, port
// impose, garde d'identite confrontee):
//   S1 PUT PARTIEL : le client ne change QUE le nom (payload legitime, le cas
//      "je n'envoie pas les colonnes que je ne touche pas"). Verdict attendu
//      aujourd'hui: 500, parce que la route passe les champs ABSENTS au UPDATE
//      et que node-sqlite3 refuse un `undefined` lie. Un 500 sur un payload
//      legal n'est pas une validation: c'est un accident de liaison, et le
//      contraire (undefined converti en NULL) viderait la ligne.
//   S2 TYPE INVALIDE : quantity = "abc". Verdict attendu aujourd'hui: 200 et la
//      colonne stocke du TEXTE (affinite dynamique de SQLite), ce qui rend les
//      comparaisons `quantity <= minStock` fausses — donc le badge de l'audit
//      ment sans qu'aucune erreur ne sorte. C'est la classe du KPI fige du 10/09.
//   S3 STATUT INVENTE : status = "defile". La route le recrache tel quel: le
//      badge de l'audit est une chaine que le client choisit, plus un statut.
//
// Rendu: une ligne de TOKENS et des CHIFFRES. Le rendu de ce poste altere les
// identifiants (piege consigne dans PHASES.md), donc le verdict ne se lit pas
// dans un tableau de resultats mais dans des compteurs.
//   RESULTATS <cle>=<valeur> ...  ; un token COLONNES_VIDES=... nomme l'accident.
import { spawn } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const BIN = join(process.cwd(), "node_modules", ".bin", "tsx");
const OUT = join(process.cwd(), "test", "tmp-probe-invput");
const PORT = Number(process.env.PROBE_PORT || 4177);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "probe-invput";

const CREER = {
  name: "Sonde Farine",
  quantity: 12.5,
  unit: "kg",
  minStock: 2,
  category: "Epicerie",
  unit_price: 3.4,
  status: "ok",
  lot_number: "L1",
  dlc: "2027-01-01",
};

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const child = spawn(process.execPath, [BIN, "server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      USER_DATA_PATH: OUT,
      NODE_ENV: "production",
      COOKDRIVE_INSTANCE_TOKEN: TOKEN,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });

  const put = async (id, body) => {
    const r = await fetch(`${BASE}/api/inventory/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let corps = null;
    try { corps = await r.json(); } catch {}
    return { code: r.status, corps };
  };

  const lire = async (id) => {
    const r = await fetch(`${BASE}/api/inventory`);
    const brut = await r.json();
    const liste = Array.isArray(brut) ? brut : brut?.items || [];
    return liste.find((x) => x.id === id) || null;
  };

  const creer = async (nom) => {
    const r = await fetch(`${BASE}/api/inventory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...CREER, name: nom }),
    });
    let corps = null;
    try { corps = await r.json(); } catch {}
    const id = corps?.id || corps?.item?.id;
    return typeof id === "string" ? id : null;
  };

  try {
    let pret = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      try {
        const r = await fetch(`${BASE}/api/settings`,
          { headers: { "X-Cookdrive-Instance": TOKEN } });
        // ⚠ `.status` est une PROPRIETE sur un fetch (undici), pas une methode.
        if (r.ok && r.headers.get("x-cookdrive-instance") === TOKEN) { pret = true; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!pret) { console.log("RESULTATS SERVEUR_ABSENT=1"); process.exitCode = 2; return; }

    const tokens = ["SERVEUR_ABSENT=0"];

    // --- S1 : PUT partiel (une seule colonne changee) -----------------------
    const a = await creer("Sonde Partiel");
    if (!a) { console.log("RESULTATS CREATION_IMPOSSIBLE=1"); process.exitCode = 2; return; }
    const avantS1 = await lire(a);
    const r1 = await put(a, { name: "Sonde Partiel Renomme" });
    const apresS1 = await lire(a);
    const vides = Object.keys(CREER).filter((c) =>
      c !== "name" && avantS1?.[c] != null && (apresS1?.[c] === null || apresS1?.[c] === undefined));
    tokens.push("S1_CODE=" + r1.code);
    tokens.push("S1_NOM=" + (apresS1?.name === "Sonde Partiel Renomme" ? 1 : 0));
    tokens.push("S1_COLONNES_VIDES=" + (vides.join("+") || "aucune"));
    tokens.push("S1_QUANT=" + JSON.stringify(apresS1?.quantity));

    // --- S2 : quantity = "abc" (le texte doit etre refuse, pas stocke) ------
    const b = await creer("Sonde Type");
    const r2 = await put(b, { ...CREER, name: "Sonde Type", quantity: "abc" });
    const apresS2 = await lire(b);
    const estTexte = typeof apresS2?.quantity === "string";
    tokens.push("S2_CODE=" + r2.code);
    tokens.push("S2_QUANT_TYPE=" + (estTexte ? "texte" : typeof apresS2?.quantity));
    tokens.push("S2_QUANT_VALEUR=" + JSON.stringify(apresS2?.quantity));
    // le badge de l'audit se decide sur cette comparaison: texte vs reel
    tokens.push("S2_COMPARAISON_FAUSSE=" + (((apresS2?.quantity ?? 0) <= (apresS2?.minStock ?? 0)) ? 0 : 1));

    // --- S3 : status invente -------------------------------------------------
    const c = await creer("Sonde Statut");
    const r3 = await put(c, { ...CREER, name: "Sonde Statut", status: "defile" });
    const apresS3 = await lire(c);
    tokens.push("S3_CODE=" + r3.code);
    tokens.push("S3_STATUT=" + JSON.stringify(apresS3?.status));

    // --- S4 : corps de reponse vs relecture (la reponse ne doit pas mentir) --
    const d = await creer("Sonde Relure");
    const r4 = await put(d, { quantity: 7 });
    tokens.push("S4_CODE=" + r4.code);
    tokens.push("S4_REPONSE_REND_LA_VALEUR=" +
      (JSON.stringify(r4.corps?.quantity) === "7" || JSON.stringify(r4.corps?.item?.quantity) === "7" ? 1 : 0));
    tokens.push("S4_RELECTURE=" + JSON.stringify((await lire(d))?.quantity));

    console.log("RESULTATS " + tokens.join(" "));
  } finally {
    child.kill("SIGKILL");
    await new Promise((r) => child.on("exit", r));
    rmSync(OUT, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.log("RESULTATS PLANTE=1 DETAIL=" + String(e).replace(/\s+/g, " ").slice(0, 90));
  process.exitCode = 3;
});
