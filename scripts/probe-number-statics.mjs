// Sonde d'une ASSERTION de la voie d'ecriture des prix fournisseurs: les
// statiques `Number.*` que le code de la route utilise existent-ils ?
//
// POURQUOI CETTE SONDE, ET CONTRE QUEL GENRE DE FAUTE Elle EXISTE. Le
// correctif de POST /api/supplier-prices garde le prix avec `Number.isNaN(prix)`
// et l'election de la comparaison avec `Number.isFinite(v)`. Pendant la session
// j'ai EMIS la these suivante, dans une réponse: « `Number.isNaN` n'appartient
// pas au standard, il vaut donc `undefined`, l'appel JETTE un TypeError avant le
// `return` du 400, le `catch` de la route l'avale et le client recoit un 500 au
// lieu du 400 nomme ». Cette these etait **FAUSSE**, et elle etait
// particulierement dangereuse parce qu'elle etait PLAUSIBLE, qu'elle designait
// un defaut réel de la famille « un 400 qui devient un 500 », et qu'elle
// n'auroit demandé qu'a etre consignée comme un verdict dans PHASES.md.
//
// LA REGLE que cette sonde rend executable: une assertion sur ce que
// l'EXECUTEUR fournie ne se tranche NI dans un souvenir, NI dans un `grep`, NI
// dans le rendu de ce poste (qui altere les identifiants et a deja rendu un
// fichier de 181 lignes comme vide). Elle se tranche en lançant l'executeur.
// Verdict MESURE (node 22): `Number.isNaN`, `Number.isFinite`,
// `Number.isInteger`, `Number.isSafeInteger` sont tous des `function`, donc la
// these etait fausse et AUCUN des 400 nommes du contrat n'est un 500 deguise.
//
// Le second volet de la sonde est ce qui fait le travail utile au-dela du
// `typeof`: les ESSAIS rejouent LA MEME FORME que la ligne 96 de la route et
// que le predicat d'election, sur les payloads que la UI envoie reellement
// (null, undefined, chaine blanche, "2,50"). Un `typeof === "function"` ne prouve
// pas qu'un predicat classe correctement; il prouve seulement qu'il ne jette pas.
//
// Rendu en TOKENS (le rendu de ce poste altere les identifiants: un nombre
// survit, un nom de variable non).
import process from "node:process";

const T = [];
const t = (v) => (typeof v === "function" ? "function" : String(v));

T.push("NODE=" + process.versions.node);
T.push("N_isNaN=" + t(Number.isNaN));
T.push("N_isFinite=" + t(Number.isFinite));
T.push("N_isInteger=" + t(Number.isInteger));
T.push("N_isSafeInteger=" + t(Number.isSafeInteger));
T.push("N_EPSILON=" + t(Number.EPSILON));
T.push("N_MAX_SAFE=" + t(Number.MAX_SAFE_INTEGER));
T.push("GLOBAL_isNaN=" + t(isNaN));
T.push("G_isFinite=" + t(isFinite));

// Ce que la route a BESOIN de savoir: un prix texte et un prix absent.
const essais = [
  ["null", null],
  ["undefined", undefined],
  ["chaine Vide", ""],
  ["deux virgule cinq", "2,50"],
  ["deux", "2"],
  ["NaN", Number.NaN],
  ["mille", 1000],
  ["moins douze", -12],
];
for (const [nom, val] of essais) {
  let nombre;
  if (typeof val === "number") nombre = val;
  else if (typeof val === "string" && val.trim() !== "") nombre = Number(val);
  else nombre = Number.NaN;
  let rejet = "n_a";
  try {
    // LA MEME FORME que la ligne 96 de src/routes/supplierprices.ts.
    rejet = String(Boolean(Number.isNaN(nombre) || nombre < 0 || nombre > 1000000));
  } catch (e) {
    rejet = "LEVE:" + String(e && e.name);
  }
  let fini = "n_a";
  try {
    // LA MEME FORME que le predicat d'election de la comparaison (ligne ~354).
    fini = String(typeof nombre === "number" && Boolean(Number.isFinite(nombre)) && nombre >= 0);
  } catch (e) {
    fini = "LEVE:" + String(e && e.name);
  }
  // ⚠ Le rendu de CETTE sonde portait le defaut qu'elle cherche chez le
  // produit: `JSON.stringify(NaN)` rend la chaine "null", donc ESSAI_null et
  // ESSAI_undefined sortaient identiques et le verdict se lisait comme une
  // confirmation du vide. C'est tres mot pour mot le defaut S1 de la route
  // (l'UI fait parseFloat -> NaN, JSON.stringify(NaN) envoie `null`, et cote
  // serveur Number(null) vaut 0: un prix OUBLIE devenait un prix GRATUIT). Une
  // sonde qui rend mal sa propre mesure ne peut pas juger celle des autres.
  // String(NaN) rend "NaN": c'est la forme qui discrimine null de NaN.
  T.push("ESSAI_" + nom.replace(/[^a-z0-9]/gi, "") + "=nombre:" + String(nombre)
       + " estNaN:" + String(Number.isNaN(nombre))
       + " refus:" + rejet + " elig:" + fini);
}

console.log("SONDE " + T.join(" "));
