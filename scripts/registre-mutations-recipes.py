#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REGISTRE des mutations du contrat RECETTES (Sprint 12).

Pourquoi un fichier et non des litteraux dans le script: le poste rogne et
double les emissions longues, et une ancre mal transcrite ne mord JAMAIS — ce
qui se presente comme « la mutation ne mord pas » alors que c'est l'ancre qui
est morte (la faute consignee du 09/09). Les ancres vivent donc dans un fichier
de DONNEES, et chaque ancre est comptee sur les octets relus avant de juger.

Les ancres du POST et du PUT /api/recipes/:id se ressemblent (les branches de
validation sont identiques); pour muter la BRANCH d'un SEUL bloc, chaque ancre
porte les lignes DISTINCTES de son bloc (le POST a son comment avant la boucle,
le PUT a la branche ingredients juste avant).
"""
import os

BASE = os.path.expanduser("~/cookdrive-project")
RT = os.path.join(BASE, "src", "routes", "recipes.ts")

NL = chr(10)


def L(*lignes):
    return NL.join(list(lignes))


MUTATIONS = [
    dict(id="M1", fichier=RT, attendu="S2",
         titre="un texte de quantity_per_person redevient accepte (colonne REAL)",
         avant=L(
             '    // quantity_per_person : absent = defaut EXPLICITE 0; un texte/negatif/',
             '    // non-fini est REJETE (colonne REAL NOT NULL; l\'affinite dynamique stocke',
             '    // du TEXTE dans une colonne REAL sans se plaindre — sonde S2 \'beaucoup\').',
             '    let qte: number | undefined;',
             '    const brutQte = ing?.quantity_per_person;',
             '    if (brutQte === undefined || brutQte === null || brutQte === "") {',
             '      qte = 0;',
             '    } else {',
             '      const n = typeof brutQte === "number" ? brutQte : (typeof brutQte === "string" && brutQte.trim() !== "" ? Number(brutQte) : NaN);',
             '      if (!Number.isFinite(n) || n < 0) {',
             '        rejetees.push({ index: i, raison: "quantity_per_person_inexploitable" });',
             '        continue;',
             '      }',
             '      qte = n;',
             '    }',
         ),
         apres=L(
             '    // quantity_per_person : absent = defaut EXPLICITE 0; un texte/negatif/',
             '    // non-fini est REJETE (colonne REAL NOT NULL; l\'affinite dynamique stocke',
             '    // du TEXTE dans une colonne REAL sans se plaindre — sonde S2 \'beaucoup\').',
             '    let qte: number | undefined;',
             '    const brutQte = ing?.quantity_per_person;',
             '    if (brutQte === undefined || brutQte === null || brutQte === "") {',
             '      qte = 0;',
             '    } else {',
             '      qte = Number(brutQte) || 0;',
             '    }',
         )),
    dict(id="M2", fichier=RT, attendu="S3b",
         titre="inventory_name absent redevient une ligne inventory NON NULL (500)",
         avant=L(
             '    const nomBrut = ing?.inventory_name;',
             '    if (typeof nomBrut !== "string" || nomBrut.trim() === "") {',
             '      rejetees.push({ index: i, raison: "inventory_name_absent_vide" });',
             '      continue;',
             '    }',
             '    // quantity_per_person : absent = defaut EXPLICITE 0; un texte/negatif/',
         ),
         apres=L(
             '    const nomBrut = ing?.inventory_name;',
             '    if (false) {',
             '      rejetees.push({ index: i, raison: "inventory_name_absent_vide" });',
             '      continue;',
             '    }',
             '    // quantity_per_person : absent = defaut EXPLICITE 0; un texte/negatif/',
         )),
    dict(id="M3", fichier=RT, attendu="S8",
         titre="allergens non-tableau redevient garbage JSON.stringify",
         avant=L(
             '  // allergens : tableau (ou absent -> []). Une chaine JSON.stringify entre comme',
             '  // garbage et la relecture JSON.parse(« gluten ») JETTE, ce qui casse l\'Allergens',
             '  // Display de la UI qui attend un tableau.',
             '  let allergensVal: unknown = allergens;',
             '  if (allergens !== undefined && allergens !== null && !Array.isArray(allergens)) {',
             '    return res.status(400).json({ status: "error", refused: ["allergens"] });',
             '  }',
         ),
         apres=L(
             '  // allergens : tableau (ou absent -> []). Une chaine JSON.stringify entre comme',
             '  // garbage et la relecture JSON.parse(« gluten ») JETTE, ce qui casse l\'Allergens',
             '  // Display de la UI qui attend un tableau.',
             '  let allergensVal: unknown = allergens;',
             '  if (false) {',
             '    return res.status(400).json({ status: "error", refused: ["allergens"] });',
             '  }',
         )),
    dict(id="M4", fichier=RT, attendu="S9",
         titre="language non-chaine redevient un nombre inconnu dans WHERE language",
         avant=L(
             '  let recipeLang: string | undefined;',
             '  if (language !== undefined && language !== null) {',
             '    if (typeof language !== "string") {',
             '      return res.status(400).json({ status: "error", refused: ["language"] });',
             '    }',
             '    recipeLang = language;',
             '  }',
         ),
         apres=L(
             '  let recipeLang: string | undefined;',
             '  if (language !== undefined && language !== null) {',
             '    recipeLang = String(language);',
             '  }',
         )),
    dict(id="M5", fichier=RT, attendu="S2b",
         titre="ingredients non-tableau redevient avalé silencieusement",
         avant=L(
             '  // ingredients : un tableau. Un non-tableau ne rendait AUCUN ingredient (le',
             '  // for(...) sur `ingredients || []` avalait tout sans rien nommer).',
             '  if (ingredients !== undefined && ingredients !== null && !Array.isArray(ingredients)) {',
             '    return res.status(400).json({ status: "error", refused: ["ingredients"] });',
             '  }',
         ),
         apres=L(
             '  // ingredients : un tableau. Un non-tableau ne rendait AUCUN ingredient (le',
             '  // for(...) sur `ingredients || []` avalait tout sans rien nommer).',
             '  if (false) {',
             '    return res.status(400).json({ status: "error", refused: ["ingredients"] });',
             '  }',
         )),
    dict(id="M6", fichier=RT, attendu="P2",
         titre="name absent redevient UPDATE recipes SET name = undefined",
         avant=L(
             '  if (typeof name !== "string" || name.trim() === "") {',
             '    return res.status(400).json({ status: "error", refused: ["name"] });',
             '  }',
         ),
         apres=L(
             '  if (false) {',
             '    return res.status(400).json({ status: "error", refused: ["name"] });',
             '  }',
         )),
    dict(id="M7", fichier=RT, attendu="P3",
         titre="preparation_steps non-chaine redevient une colonne TEXT de garbage",
         avant=L(
             '  let prepSteps = "";',
             '  if (preparation_steps !== undefined && preparation_steps !== null) {',
             '    if (typeof preparation_steps !== "string") {',
             '      return res.status(400).json({ status: "error", refused: ["preparation_steps"] });',
             '    }',
             '    prepSteps = preparation_steps;',
             '  }',
         ),
         apres=L(
             '  let prepSteps = "";',
             '  if (preparation_steps !== undefined && preparation_steps !== null) {',
             '    prepSteps = String(preparation_steps);',
             '  }',
         )),
    dict(id="M8", fichier=RT, attendu="P4",
         titre="quantity_per_person non-number redevient accepte dans le PUT",
         avant=L(
             '  const lignes = Array.isArray(ingredients) ? ingredients : [];',
             '  if (ingredients !== undefined && ingredients !== null && !Array.isArray(ingredients)) {',
             '    return res.status(400).json({ status: "error", refused: ["ingredients"] });',
             '  }',
             '  const rejetees: Array<{ index: number; raison: string }> = [];',
             '  const lignesValides: Array<{ inventory_name: string; unit: string | null; qte: number }> = [];',
             '  for (let i = 0; i < lignes.length; i++) {',
             '    const ing = lignes[i] as any;',
             '    const nomBrut = ing?.inventory_name;',
             '    if (typeof nomBrut !== "string" || nomBrut.trim() === "") {',
             '      rejetees.push({ index: i, raison: "inventory_name_absent_vide" });',
             '      continue;',
             '    }',
             '    let qte: number | undefined;',
             '    const brutQte = ing?.quantity_per_person;',
             '    if (brutQte === undefined || brutQte === null || brutQte === "") {',
             '      qte = 0;',
             '    } else {',
             '      const n = typeof brutQte === "number" ? brutQte : (typeof brutQte === "string" && brutQte.trim() !== "" ? Number(brutQte) : NaN);',
             '      if (!Number.isFinite(n) || n < 0) {',
             '        rejetees.push({ index: i, raison: "quantity_per_person_inexploitable" });',
             '        continue;',
             '      }',
             '      qte = n;',
             '    }',
         ),
         apres=L(
             '  const lignes = Array.isArray(ingredients) ? ingredients : [];',
             '  if (ingredients !== undefined && ingredients !== null && !Array.isArray(ingredients)) {',
             '    return res.status(400).json({ status: "error", refused: ["ingredients"] });',
             '  }',
             '  const rejetees: Array<{ index: number; raison: string }> = [];',
             '  const lignesValides: Array<{ inventory_name: string; unit: string | null; qte: number }> = [];',
             '  for (let i = 0; i < lignes.length; i++) {',
             '    const ing = lignes[i] as any;',
             '    const nomBrut = ing?.inventory_name;',
             '    if (typeof nomBrut !== "string" || nomBrut.trim() === "") {',
             '      rejetees.push({ index: i, raison: "inventory_name_absent_vide" });',
             '      continue;',
             '    }',
             '    let qte: number | undefined;',
             '    const brutQte = ing?.quantity_per_person;',
             '    if (brutQte === undefined || brutQte === null || brutQte === "") {',
             '      qte = 0;',
             '    } else {',
             '      qte = Number(brutQte) || 0;',
             '    }',
         )),
    dict(id="M9", fichier=RT, attendu="P5",
         titre="inventory_name absent redevient une ligne inventory NON NULL dans le PUT (500)",
         avant=L(
             '  const lignes = Array.isArray(ingredients) ? ingredients : [];',
             '  if (ingredients !== undefined && ingredients !== null && !Array.isArray(ingredients)) {',
             '    return res.status(400).json({ status: "error", refused: ["ingredients"] });',
             '  }',
             '  const rejetees: Array<{ index: number; raison: string }> = [];',
             '  const lignesValides: Array<{ inventory_name: string; unit: string | null; qte: number }> = [];',
             '  for (let i = 0; i < lignes.length; i++) {',
             '    const ing = lignes[i] as any;',
             '    const nomBrut = ing?.inventory_name;',
             '    if (typeof nomBrut !== "string" || nomBrut.trim() === "") {',
             '      rejetees.push({ index: i, raison: "inventory_name_absent_vide" });',
             '      continue;',
             '    }',
             '    let qte: number | undefined;',
         ),
         apres=L(
             '  const lignes = Array.isArray(ingredients) ? ingredients : [];',
             '  if (ingredients !== undefined && ingredients !== null && !Array.isArray(ingredients)) {',
             '    return res.status(400).json({ status: "error", refused: ["ingredients"] });',
             '  }',
             '  const rejetees: Array<{ index: number; raison: string }> = [];',
             '  const lignesValides: Array<{ inventory_name: string; unit: string | null; qte: number }> = [];',
             '  for (let i = 0; i < lignes.length; i++) {',
             '    const ing = lignes[i] as any;',
             '    const nomBrut = ing?.inventory_name;',
             '    if (false) {',
             '      rejetees.push({ index: i, raison: "inventory_name_absent_vide" });',
             '      continue;',
             '    }',
             '    let qte: number | undefined;',
         )),
    dict(id="M10", fichier=RT, attendu="P6",
         titre="ingredients non-tableau redevient avalé silencieusement dans le PUT",
         avant=L(
             '  const lignes = Array.isArray(ingredients) ? ingredients : [];',
             '  if (ingredients !== undefined && ingredients !== null && !Array.isArray(ingredients)) {',
             '    return res.status(400).json({ status: "error", refused: ["ingredients"] });',
             '  }',
             '  const rejetees: Array<{ index: number; raison: string }> = [];',
         ),
         apres=L(
             '  const lignes = Array.isArray(ingredients) ? ingredients : [];',
             '  if (false) {',
             '    return res.status(400).json({ status: "error", refused: ["ingredients"] });',
             '  }',
             '  const rejetees: Array<{ index: number; raison: string }> = [];',
         )),
    dict(id="M11", fichier=RT, attendu="P8",
         titre="PUT sur un id absent redevient un 200 muet + lignes fantomes",
         avant=L(
             '  const recetteExistante = await db.get(',
             '    "SELECT id FROM recipes WHERE id = ?",',
             '    [req.params.id],',
             '  );',
             '  if (!recetteExistante) return res.status(404).json({ status: "error", message: "Recipe not found" });',
             '  if (typeof name !== "string" || name.trim() === "") {',
         ),
         apres=L(
             '  const recetteExistante = { id: req.params.id };',
             '  if (false) return res.status(404).json({ status: "error", message: "Recipe not found" });',
             '  if (typeof name !== "string" || name.trim() === "") {',
         )),
    dict(id="M12", fichier=RT, attendu="S5",
         titre="DELETE sur un id absent redevient un 200 muet",
         avant=L(
             '  const recetteExistante = await db.get(',
             '    "SELECT id FROM recipes WHERE id = ?",',
             '    [req.params.id],',
             '  );',
             '  if (!recetteExistante) return res.status(404).json({ status: "error", message: "Recipe not found" });',
             '  const ingredientsRelus = await db.all(',
         ),
         apres=L(
             '  const recetteExistante = { id: req.params.id };',
             '  if (false) return res.status(404).json({ status: "error", message: "Recipe not found" });',
             '  const ingredientsRelus = await db.all(',
         )),
    dict(id="M13", fichier=RT, attendu="R6",
         titre="les lignes d'inventaire creees par la recette redevient non enlevees",
         avant=L(
             '  const idsAEnlever = ingredientsRelus.map((r: any) => r.inventory_id);',
             '  let enlevees: string[] = [];',
             '  for (const invId of idsAEnlever) {',
             '    const autres = await db.get(',
             '      "SELECT id FROM recipe_ingredients WHERE inventory_id = ? AND recipe_id != ? LIMIT 1",',
             '      [invId, req.params.id],',
             '    );',
             '    if (!autres) {',
             '      const inv = await db.get("SELECT id, name FROM inventory WHERE id = ?", [invId]);',
             '      if (inv) {',
             '        await db.run("DELETE FROM inventory WHERE id = ?", [invId]);',
             '        enlevees.push(inv.name);',
             '      }',
             '    }',
             '  }',
         ),
         apres=L(
             '  const idsAEnlever = ingredientsRelus.map((r: any) => r.inventory_id);',
             '  let enlevees: string[] = [];',
             '  for (const invId of idsAEnlever) {',
             '    if (false) {',
             '      const inv = await db.get("SELECT id, name FROM inventory WHERE id = ?", [invId]);',
             '      if (inv) {',
             '        await db.run("DELETE FROM inventory WHERE id = ?", [invId]);',
             '        enlevees.push(inv.name);',
             '      }',
             '    }',
             '  }',
         )),
    dict(id="M14", fichier=RT, attendu="R7",
         titre="PUT /save sur un id absent redevient un 200 muet",
         avant=L(
             '  const recetteExistante = await db.get(',
             '    "SELECT id FROM recipes WHERE id = ?",',
             '    [req.params.id],',
             '  );',
             '  if (!recetteExistante) return res.status(404).json({ status: "error", message: "Recipe not found" });',
             '  await db.run("UPDATE recipes SET is_saved = 1 WHERE id = ?", [',
         ),
         apres=L(
             '  const recetteExistante = { id: req.params.id };',
             '  if (false) return res.status(404).json({ status: "error", message: "Recipe not found" });',
             '  await db.run("UPDATE recipes SET is_saved = 1 WHERE id = ?", [',
         )),
]


def controler():
    """Chaque ancre doit etre vue EXACTEMENT une fois sur les octets relus."""
    lacs = []
    for m in MUTATIONS:
        octets = open(m["fichier"], encoding="utf-8").read()
        n = octets.count(m["avant"])
        lignes = octets.splitlines()
        dans_commentaire = any(l.strip().startswith("//") and m["avant"].strip() in l
                              for l in lignes)
        if n != 1:
            lacs.append("%s: ancre vue %d fois%s" % (
                m["id"], n, " (et uniquement dans un COMMENTAIRE: la mutation ne "
                            "peut pas rougir le produit)" if dans_commentaire else ""))
    return lacs


if __name__ == "__main__":
    lacs = controler()
    for m in MUTATIONS:
        print("%-4s %-3s %s" % (m["id"], m["attendu"], m["titre"]))
    print("ANCRE_MORTE" if lacs else "ANCRE_ES_ALL_VERT", len(MUTATIONS), "mutations")
    for l in lacs:
        print("  " + l)
    raise SystemExit(1 if lacs else 0)
