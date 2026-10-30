// La cle primaire fabriquee par le serveur est UNIQUE, meme dans la meme
// milliseconde. Ce test est la version deterministe de la mesure de terrain
// (scripts/probe-ids-uniques.mjs) : la, 40 ecritures en parallele sur le VRAI
// serveur ; ici, 5000 appels dans la meme boucle, ce qui force la fenetre que
// `Date.now().toString()` ne savait pas distinguer.
//
// Pourquoi les deux : un test unitaire seul ne prouve pas que les ROUTES
// utilisent le generateur ; une sonde de terrain seule peut tomber sur une
// machine lente (aucune collision, donc aucun defaut exerce). L'un mesure la
// regle, l'autre mesure son branchement.
import { describe, expect, it } from "vitest";
import { nouvelId } from "../../src/shared/util.js";

describe("nouvelId : la cle primaire ne collisionne pas sous rafale", () => {
  it("rend 5000 identifiants DISTINCTS dans une seule rafale", () => {
    const vus = new Set<string>();
    for (let i = 0; i < 5000; i++) vus.add(nouvelId());
    expect(vus.size).toBe(5000);
  });

  it("garde l'horodatage en prefixe : les ids restent tries dans le temps", () => {
    const premier = nouvelId();
    const second = nouvelId();
    const t = (id: string) => Number(id.split("-")[0]);
    expect(t(second)).toBeGreaterThanOrEqual(t(premier));
    // Le prefixe est l'horodatage de l'appel, pas une valeur inventee.
    expect(Math.abs(t(premier) - Date.now())).toBeLessThan(5000);
  });

  it("reste sans tiret quand aucun doublon ne se presente (forme historique)", () => {
    // La forme `Date.now().toString()` est conservee pour le premier appel de
    // chaque milliseconde : les identifiants deja en base restent de la meme
    // famille, aucun lecteur ne voit apparaitre un format inconnu.
    let trouve = false;
    for (let i = 0; i < 2000; i++) {
      const id = nouvelId();
      if (!id.includes("-")) { trouve = true; break; }
      // on laisse passer un tour de boucle pour changer de milliseconde
      const jusqua = Date.now() + 2;
      while (Date.now() < jusqua) { /* attente active courte */ }
    }
    expect(trouve).toBe(true);
  });

  it("ne rend jamais la meme valeur que le generateur nu dans la meme ms", () => {
    // Le defaut d'origine, reproduit ici : `Date.now().toString()` deux fois de
    // suite dans la meme milliseconde rend DEUX FOIS la meme chaine.
    const nu = new Set([Date.now().toString(), Date.now().toString()]);
    expect(nu.size).toBe(1); // <- le defaut est reel
    const sur = new Set([nouvelId(), nouvelId()]);
    expect(sur.size).toBe(2); // <- et il est corrige
  });
});
