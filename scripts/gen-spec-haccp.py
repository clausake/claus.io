#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genere test/e2e/haccp-contract.spec.ts (Sprint 11).

POURQUOI UN GENRATEUR ET PAS UNE FRAPPE DIRECTE. Le poste mute identifiants ET
ponctuation au RENDU (consigne du depot: read_file a deja rendu un fichier de
181 lignes comme VIDE). Recopier a la main une tete d'harnais depuis un rendu
introduirait du faux code sans erreur visible. On copie donc la TETE EXACTE
(imports + port libre + attente d'instance + afterAll) du spec du Sprint 8 par
OCTETS, on n'y remplace que DEUX tokens de contextes (compte verifie), et on
ajoute des corps qui ne manient que `request`/`expect` (fixture `request` seul,
aucun navigateur lance)."""
import os, re, sys

BASE = os.path.expanduser("~/cookdrive-project")
SRC = os.path.join(BASE, "test", "e2e", "consume-contract.spec.ts")
DST = os.path.join(BASE, "test", "e2e", "haccp-contract.spec.ts")

tete = open(SRC, encoding="utf-8").read()
m = re.search(r"test\.afterAll\(async \(\) => \{.*?\n\}\);\n", tete, re.S)
if not m:
    print("ABSTENTION: tete d'harnais non decoupee"); sys.exit(2)
tete = tete[:m.end()]

for vieux, neuf in [('test", "tmp-consume', 'test", "tmp-haccp'),
                    ('"consume-contract"', '"haccp-contract"')]:
    c = tete.count(vieux)
    if c != 1:
        print("ABSTENTION: token %r compte=%d (attendu 1)" % (vieux, c)); sys.exit(2)
    tete = tete.replace(vieux, neuf, 1)
if "tmp-haccp" not in tete:
    print("ABSTENTION: substitution non appliquee"); sys.exit(2)

CORPS = r"""
// Contrat des routes d'ECRITURE du domaine HACCP (Sprint 11).
//
// POURQUOI CE SPEC EXISTE. HACCP est le seul domaine du produit qui porte une
// obligation reglementaire (regl. (CE) n 852/2004 art. 5: l'exploitant doit
// pouvoir PRESENTER a l'auditeur ses releves, ses lots traces et ses actions
// correctives). Ses routes d'ecriture etaient les dernieres sans contrat: la
// carte par octets (scripts/carte-voies-haccp.py) rend 12 voies d'ecriture et
// routes.spec.ts n'en jouait AUCUNE en ecriture (ses 5 tests HACCP sont des GET
// nominaux: status 200 + Array.isArray — un PASS creux, la classe punie ici).
//
// L'angle mort qui rendait le defaut invisible: les VOIES DE LECTURE de ces
// tables sont des JOIN INTERNES (relues a l'octet):
//   GET /api/haccp/batches           -> JOIN inventory (interne)
//   GET /api/haccp/production-history-> JOIN recipes    (interne)
// Une ligne dont la clef ne joint rien n'est pas une erreur: elle est ECRITE
// puis DISPARAIT de l'ecran du chef, sans 500. Et le PRAGMA foreign_keys n'est
// jamais declenche par src/db/init.ts (prouve par sonde: un orphelin est
// ACCEPTE, changes=1) — la clef du schema ne protege rien. corrective_actions
// n'avait AUCUN SELECT dans src/ (0 voie): la preuve etait ecrite, jamais relue.
//
// Regle du depot: un PASS qui ne peut pas devenir FAIL n'est pas une mesure.
// Chaque regle est jugee par DELTA (poster par la MEME route que l'UI, exiger le
// mouvement EXACT relu en base) puis en RETRAIT (les tentatives invalides
// n'ont rien ecrit). Les payloads sont ceux que l'UI emet REELLEMENT
// (scripts/carte-payloads-haccp.py), pas des payloads inventes.

type Corps = Record<string, any>;

let req: any;

async function lire(url: string): Promise<any> {
  const r = await req.get(`${BASE}${url}`);
  expect(r.status(), url + " -> " + r.status()).toBe(200);
  return await r.json();
}

async function poste(url: string, corps: unknown): Promise<{ code: number; corps: Corps }> {
  const r = await req.post(`${BASE}${url}`, { data: corps });
  let json: Corps = {};
  try { json = (await r.json()) as Corps; } catch { /* corps vide */ }
  return { code: r.status(), corps: json };
}

async function nouveauArticle(nom: string): Promise<string> {
  const { code, corps } = await poste("/api/inventory", {
    name: nom, quantity: 5, minStock: 1, unit: "kg", category: "test-haccp",
  });
  expect(code, "creation article (" + nom + ")").toBe(200);
  const id = corps.id ?? (await lire("/api/inventory")).find((i: any) => i.name === nom)?.id;
  expect(id, "id de l'article cree").toBeTruthy();
  return id as string;
}

async function nouvelleRecette(nom: string): Promise<string> {
  const { code, corps } = await poste("/api/recipes", {
    name: nom, category: "Plat", dish_type: "plat", ingredients: [], preparation_steps: "test",
  });
  expect(code, "creation recette (" + nom + ")").toBe(200);
  const id = corps.id ?? (await lire("/api/recipes")).find((r: any) => r.name === nom)?.id;
  expect(id, "id de la recette creee").toBeTruthy();
  return id as string;
}

test("C1 releve du chef: texte/blanc/nul refuses, la valeur valide est relue en base", async ({ request }) => {
  req = request;
  const nom = "Frigo C1 " + Date.now();
  const bon = await poste("/api/haccp/temperature", {
    equipment_name: nom, temperature: 4.2, user: "SYSTME",
  });
  expect(bon.code, "releve valide acceptee").toBe(200);
  expect(typeof bon.corps.id, "la creation rend la clef ECITEE").toBe("string");
  const relu = (await lire("/api/haccp/temperatures")).find((l: any) => l.id === bon.corps.id);
  expect(relu, "la releve ressort de la liste").toBeTruthy();
  expect(relu.temperature, "temperature relue identique").toBe(4.2);
  expect(relu.equipment_name).toBe(nom);
  expect(relu.entry_type, "voie manuelle signee manuelle").toBe("manuel");
  expect(relu.sensor_mode, "repli sur le defaut du schema").toBe("online");

  const texte = await poste("/api/haccp/temperature", { equipment_name: nom, temperature: "vingt degres" });
  expect(texte.code, "un texte dans la colonne REAL est refuse").toBe(400);
  expect(texte.corps.refused ?? [], "le champ est NOMME").toContain("temperature");

  const blanc = await poste("/api/haccp/temperature", { equipment_name: nom, temperature: null });
  expect(blanc.code, "le NaN serialise arrive comme null et se refuse").toBe(400);
  expect(blanc.corps.refused ?? []).toContain("temperature");

  const borne = await poste("/api/haccp/temperature", { equipment_name: nom, temperature: -450 });
  expect(borne.code, "hors plage physique refuse").toBe(400);

  const vide = await poste("/api/haccp/temperature", { equipment_name: "   ", temperature: 4 });
  expect(vide.code).toBe(400);
  expect(vide.corps.refused ?? []).toContain("equipment_name");

  const usurpe = await poste("/api/haccp/temperature", {
    equipment_name: nom, temperature: 3, entry_type: "iot", sensor_mode: "online",
  });
  expect(usurpe.code, "une saisie manuelle ne peut pas se signer 'iot'").toBe(400);

  const lignes = (await lire("/api/haccp/temperatures")).filter((l: any) => l.equipment_name === nom);
  expect(lignes.length, "aucune ligne invalide n'a ete ecrite").toBe(1);
});

test("C2 production: la JOIN interne de l'historique est verifiee, pas supposée", async ({ request }) => {
  req = request;
  const tag = "C2 " + Date.now();
  const recette = await nouvelleRecette("Recette " + tag);
  const article = await nouveauArticle("Article " + tag);
  const lot = await poste("/api/haccp/batches", {
    inventory_id: article, lot_number: "LOT-" + tag, expiration_date: "2030-01-01",
    quantity: 3, unit: "kg",
  });
  expect(lot.code, "lot cree").toBe(200);

  const bon = await poste("/api/haccp/production", { recipe_id: recette, batch_ids: [lot.corps.id] });
  expect(bon.code, "production valide acceptee").toBe(200);
  expect(typeof bon.corps.productionId, "la clef creee est rendue").toBe("string");
  const hist = await lire("/api/haccp/production-history");
  const trace = hist.find((h: any) => h.id === bon.corps.productionId);
  expect(trace, "la production parait dans l'historique (sinon ecrite ET perdue)").toBeTruthy();
  expect(String(trace.batches ?? "")).toContain("LOT-" + tag);

  const fausse = await poste("/api/haccp/production", { recipe_id: "REC-INEXISTANTE", batch_ids: [lot.corps.id] });
  expect(fausse.code, "une recette inexistante est refusee (JOIN interne)").toBe(400);
  expect(fausse.corps.refused ?? []).toContain("recipe_id");

  const lotFaux = await poste("/api/haccp/production", { recipe_id: recette, batch_ids: ["LOT-INEXISTANT"] });
  expect(lotFaux.code, "un lot inexistante est refuse").toBe(400);
  expect(lotFaux.corps.refused ?? []).toContain("batch_ids");
  expect(lotFaux.corps.inconnus, "les lots fautifs sont NOMMES").toEqual(["LOT-INEXISTANT"]);

  const pasTableau = await poste("/api/haccp/production", { recipe_id: recette, batch_ids: { a: 1 } });
  expect(pasTableau.code, "batch_ids non tableau = 400 et non 500").toBe(400);
  const vide = await poste("/api/haccp/production", { recipe_id: recette, batch_ids: [] });
  expect(vide.code, "liste vide refusee").toBe(400);

  const hist2 = await lire("/api/haccp/production-history");
  expect(hist2.length, "aucune production fantome n'a ete ecrite").toBe(hist.length);
});

test("C3 lot de traçabilite: article inconnu et quantite texte refuses", async ({ request }) => {
  req = request;
  const tag = "C3 " + Date.now();
  const article = await nouveauArticle("Article lot " + tag);
  const bon = await poste("/api/haccp/batches", {
    inventory_id: article, lot_number: "L" + tag, expiration_date: "2030-06-01",
    quantity: 2.5, unit: "kg", reception_temp: 3.8, packaging_ok: true,
  });
  expect(bon.code, "lot valide").toBe(200);
  const relu = (await lire("/api/haccp/batches")).find((b: any) => b.id === bon.corps.id);
  expect(relu, "le lot ressort de la liste (JOIN inventory satisfaite)").toBeTruthy();
  expect(relu.product_name, "la jointure a un nom d'article").toBe("Article lot " + tag);
  expect(relu.quantity).toBe(2.5);
  expect(relu.reception_temp, "temperature a reception conservee").toBe(3.8);

  const inconnu = await poste("/api/haccp/batches", {
    inventory_id: "UNKNOWN", lot_number: "X", expiration_date: "2030-01-01", quantity: 1,
  });
  expect(inconnu.code, "une clef 'UNKNOWN' n'est pas une clef").toBe(400);
  expect(inconnu.corps.refused ?? []).toContain("inventory_id");

  const texte = await poste("/api/haccp/batches", {
    inventory_id: article, lot_number: "Y", expiration_date: "2030-01-01", quantity: "deux",
  });
  expect(texte.code, "un texte dans la REAL de quantite est refuse").toBe(400);
  expect(texte.corps.refused ?? []).toContain("quantity");

  const date = await poste("/api/haccp/batches", {
    inventory_id: article, lot_number: "Z", expiration_date: "31/12/2030", quantity: 1,
  });
  // ⚠ Le cas a ete ROUGE a la premier course et c'etait un defaut du CONTRAT,
  // pas du test: la premiere version faisait `dateISO(...) ?? lireTexte(...)` et
  // le repli texte laissait passer « 31/12/2030 » dans une colonne TEXT trie
  // lexicographiquement — un DLC dans ce format ne se filtre pas et le tableau
  // du chef le rend vide sans erreur. La date de_peremption n'est donc une
  // preuve que si elle est ISO.
  expect(date.code, "une date non ISO est refusee (tri lexicographique)").toBe(400);
  expect(date.corps.refused ?? []).toContain("expiration_date");

  const nomBlank = await poste("/api/haccp/batches", {
    inventory_id: article, lot_number: "   ", expiration_date: "2030-01-01",
  });
  expect(nomBlank.code).toBe(400);
});

test("C4 actions correctives: la preuve est ecrite ET relisible (lecteur cree)", async ({ request }) => {
  req = request;
  const tag = "C4 " + Date.now();
  const releve = await poste("/api/haccp/temperature", { equipment_name: "Vitrine " + tag, temperature: 11.5 });
  expect(releve.code).toBe(200);

  const avant = await lire("/api/haccp/corrective-actions");
  expect(Array.isArray(avant), "la voie de lecture existe desorais").toBe(true);

  const bon = await poste("/api/haccp/corrective-action", {
    log_id: releve.corps.id, action_taken: "Evacuation et nettoyage " + tag,
  });
  expect(bon.code, "action valide").toBe(200);
  expect(typeof bon.corps.id).toBe("string");

  const relu = (await lire("/api/haccp/corrective-actions")).find((a: any) => a.id === bon.corps.id);
  expect(relu, "l'action corrective est RE-LISIBLE par l'auditeur").toBeTruthy();
  expect(relu.action_taken).toContain(tag);
  expect(relu.equipment_name, "rattachee a la releve d'origine").toBe("Vitrine " + tag);
  expect(relu.temperature).toBe(11.5);

  const orpheline = await poste("/api/haccp/corrective-action", {
    log_id: "RELEVE-INEXISTANTE", action_taken: "action sans objet",
  });
  expect(orpheline.code, "une action orphelinee est refusee").toBe(400);
  expect(orpheline.corps.refused ?? []).toContain("log_id");

  const vide = await poste("/api/haccp/corrective-action", { log_id: releve.corps.id, action_taken: "   " });
  expect(vide.code).toBe(400);
});

test("C5 capteur: clef cryptographique et collision", async ({ request }) => {
  req = request;
  const id = "cap-" + Date.now();
  const bon = await poste("/api/haccp/iot-sensors", {
    id, name: "Congelateur C5", type: "ambient", equipment_type: "Froid",
  });
  expect(bon.code, "capteur valide").toBe(200);
  expect(typeof bon.corps.token).toBe("string");
  expect((bon.corps.token as string).length, "le jeton a l'entropie d'un secret").toBeGreaterThanOrEqual(15);

  const dup = await poste("/api/haccp/iot-sensors", { id, name: "Doublon", type: "ambient", equipment_type: "Froid" });
  expect(dup.code, "une collision n'est pas un 500 muet").toBe(409);

  const vide = await poste("/api/haccp/iot-sensors", { id: "   ", name: "X", type: "ambient", equipment_type: "Froid" });
  expect(vide.code).toBe(400);
  expect(vide.corps.refused ?? []).toContain("id");

  const typeFaux = await poste("/api/haccp/iot-sensors", { id: "cap2-" + Date.now(), name: "X", type: "invention", equipment_type: "Froid" });
  expect(typeFaux.code, "un type hors liste est refuse").toBe(400);
  expect(typeFaux.corps.refused ?? []).toContain("type");
});

test("C6 webhook: le jeton est EXIGE (l'ancien 'if (token && ...)' laissait poster sans jeton)", async ({ request }) => {
  req = request;
  const id = "wh-" + Date.now();
  const reg = await poste("/api/haccp/iot-sensors", { id, name: "Sas C6", type: "probe", equipment_type: "Chaud" });
  expect(reg.code).toBe(200);
  const token = reg.corps.token as string;

  const sans = await poste("/api/haccp/webhook/iot-report", { id, temperature: 3.4 });
  expect(sans.code, "un poste qui omet le jeton ne poste pas").toBe(403);
  const faux = await poste("/api/haccp/webhook/iot-report", { id, token: "jeton-invente", temperature: 3.4 });
  expect(faux.code).toBe(403);
  const hors = await poste("/api/haccp/webhook/iot-report", { id: "capteur-absent", token, temperature: 3.4 });
  expect(hors.code).toBe(404);
  const bon = await poste("/api/haccp/webhook/iot-report", { id, token, temperature: 3.4, battery: 90 });
  expect(bon.code, "le chemin valide fonctionne toujours").toBe(200);
  const aberrant = await poste("/api/haccp/webhook/iot-report", { id, token, temperature: -450 });
  expect(aberrant.code, "releve hors plage refusee").toBe(400);
  const abus = await poste("/api/haccp/webhook/iot-report", { id, token, temperature: 3.4, battery: 900 });
  expect(abus.code, "batterie impossible refusee").toBe(400);

  const logs = (await lire("/api/haccp/temperatures")).filter((l: any) => String(l.equipment_name).includes("Sas C6"));
  expect(logs.length, "une seule releve valide en base").toBe(1);
  expect(logs[0].temperature).toBe(3.4);
  expect(logs[0].entry_type, "l'ingestion IoT est signee iot").toBe("iot");
});

test("C7 nettoyage: une zone blanche ne fait pas une ligne de registre", async ({ request }) => {
  req = request;
  const tag = "C7 " + Date.now();
  const vide = await poste("/api/haccp/cleaning", { zone_name: "   " });
  expect(vide.code).toBe(400);
  expect(vide.corps.refused ?? []).toContain("zone_name");
  const absent = await poste("/api/haccp/cleaning", {});
  expect(absent.code).toBe(400);
  const bon = await poste("/api/haccp/cleaning", { zone_name: "Plonge " + tag });
  expect(bon.code).toBe(200);
  const relu = (await lire("/api/haccp/cleaning")).find((c: any) => c.zone_name === "Plonge " + tag);
  expect(relu, "le nettoyage est relu par la voie de l'app").toBeTruthy();
});

test("C8 la voie NON contractee (scan OCR) reste jouable, pas masquee", async ({ request }) => {
  req = request;
  const res = await request.post(`${BASE}/api/haccp/scan`, { data: {} });
  expect([200, 400, 415, 500], "la voie OCR repond et n'a pas disparu du routeur").toContain(res.status());
});
"""

out = tete + CORPS
open(DST, "w", encoding="utf-8").write(out)
bal = out.count("{") - out.count("}")
n = len(out.encode())
if bal != 0 or n < 3000:
    print("ABSTENTION: fichier desequilibre balancier=%d octets=%d" % (bal, n)); sys.exit(3)
print("ECRIT %s | %d octets | %d tests | balancier=%d | tete_verbatim=%d oct" % (
    os.path.relpath(DST, BASE), n, out.count("\ntest("), bal, len(tete.encode())))
