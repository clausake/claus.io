// Le parseur du compte-rendu de pret (`COOKDRIVE_READY {...}`) cote client.
//
// Pourquoi ce fichier est un module CJS pur, sans dependance, et non du code ecrit
// en place dans electron/main.cjs : `tsconfig.json` EXCLUT `electron/` et `*.cjs`.
// Le lint du projet (`npx tsc --noEmit`) ne voit donc JAMAIS ce qui tourne dans le
// lanceur d'Electron. Y loger la logique du port aurait produit un correctif sans
// gate : ni la CI, ni les portes locales n'auroient rougi sur ce qui decide du port
// que la fenetre va afficher. Loge ici, la logique est reprise par
// `test/unit/ready-parity.test.ts` (`npx vitest run`) qui la juge dans ses deux
// directions ; `main.cjs` ne fait que la mener.
//
// Le format est ecrit par `src/services/ready.ts` (cote serveur) sous la forme :
//   COOKDRIVE_READY {"port":3001,"host":"127.0.0.1","instance":"...","glisse":true}
// Il n'y a qu'UNE implementation du LECTEUR (ici) ; le serveur n'a que l'ecriture.
//
// Regles de lecture, et leur motif :
//  - `port` est un ENTIER de 1 a 65535. `Number("3000.5")` et `Number("")` sont des
//    nombres valides : un garde booleen naive les laisse passer. Un port flottant ou
//    vide doit etre rejete, sinon la fenetre appelle un port inexistant et le
//    chargement echoue sans message explicite.
//  - `instance` est une chaine non vide. Sans elle, le controle d'identite n'a plus
//    d'objet : on ne peut plus distinguer notre application de celle du voisin.
//  - le port ANNONCE est le port REELLEMENT obtenu (le serveur cede un cran sur
//    EADDRINUSE quand personne ne lui a demande de port). La fenetre ne charge donc
//    pas `http://localhost:3000` par convention, mais le compte-rendu.
"use strict";

var PREFIXE = "COOKDRIVE_READY ";
var ADRESSES_NON_LIEES = ["0.0.0.0", "::", "[::]", "", "*"];

function estEntierPort(v) {
  if (typeof v === "string" && v.trim() === "") return false;
  var n = Number(v);
  if (!Number.isInteger(n)) return false;
  return n >= 1 && n <= 65535;
}

function valider(objet) {
  if (!objet || typeof objet !== "object") return null;
  if (!estEntierPort(objet.port)) return null;
  if (typeof objet.instance !== "string" || objet.instance === "") return null;
  if (typeof objet.host !== "string") return null;
  return {
    port: Number(objet.port),
    host: objet.host,
    instance: objet.instance,
    glisse: objet.glisse === true,
  };
}

// La ligne peut arriver coupee en morceaux (le flux stdout du fils n'aligne pas sur
// les limites de ligne) : on ne prend que le texte apres le prefixe jusqu'a la fin
// de la ligne, et un JSON partiel rend null (le parent attend la suite).
function lireLigneDePret(brut) {
  if (typeof brut !== "string") return null;
  var i = brut.indexOf(PREFIXE);
  if (i === -1) return null;
  var debut = i + PREFIXE.length;
  var fin = brut.indexOf("\n", debut);
  var json = (fin === -1 ? brut.slice(debut) : brut.slice(debut, fin)).trim();
  if (json === "" || json.charAt(0) !== "{") return null;
  var objet;
  try {
    objet = JSON.parse(json);
  } catch (e) {
    return null;
  }
  return valider(objet);
}

// 0.0.0.0 et :: sont des adresses NON LIEES (wildcards) : ecouter dessus se peut,
// s'y CONNECTER non. Les appeler telles quelles donne un echec de connexion.
function hoteConnectable(hoteEcoute) {
  var h = String(hoteEcoute === undefined || hoteEcoute === null ? "" : hoteEcoute).trim();
  if (ADRESSES_NON_LIEES.indexOf(h) !== -1) return "127.0.0.1";
  return h;
}

function urlDeLaFenetre(info) {
  if (!info) return "";
  return "http://" + hoteConnectable(info.host) + ":" + Number(info.port);
}

// Prouve que l'URL va afficher est NOTRE application. Sans lui, un tiers qui tient
// le port 3000 (observe : promo_resto sur ce poste) s'affiche a la place du produit,
// sans rougissement. L'en-tete X-Cookdrive-Instance est emis par chaque reponse.
function verifierIdentite(url, instance, deps) {
  var d = deps || {};
  var http = d.http || require("http");
  var timeoutMs = d.timeoutMs || 2500;
  return new Promise(function (resolve) {
    var fini = false;
    function finir(v) {
      if (fini) return;
      fini = true;
      resolve(v);
    }
    try {
      var requete = http.get(String(url) + "/api/settings", function (reponse) {
        var recu = reponse.headers["x-cookdrive-instance"];
        reponse.resume();
        finir(reponse.statusCode === 200 && recu === instance);
      });
      requete.on("error", function () {
        finir(false);
      });
      requete.setTimeout(timeoutMs, function () {
        try {
          requete.destroy();
        } catch (e) {}
        finir(false);
      });
    } catch (e) {
      finir(false);
    }
  });
}

// Voie de production : le serveur tourne DEDANS du process Electron
// (`require(server.cjs)`) et n'a aucun stdout a offrir au pere. On relit alors le
// compte-rendu atomique ecrit par `announceReady`.
function attendreCompteRendu(chemin, opts) {
  var fs = require("fs");
  var o = opts || {};
  var echeance = o.deadlineMs || 30000;
  var pas = o.intervalMs || 200;
  var t0 = Date.now();
  return new Promise(function (resolve) {
    (function tour() {
      try {
        var brut = fs.readFileSync(chemin, "utf-8");
        var info = valider(JSON.parse(brut));
        if (info) return resolve(info);
      } catch (e) {}
      if (Date.now() - t0 >= echeance) return resolve(null);
      setTimeout(tour, pas);
    })();
  });
}

module.exports = {
  PREFIXE: PREFIXE,
  valider: valider,
  estEntierPort: estEntierPort,
  lireLigneDePret: lireLigneDePret,
  hoteConnectable: hoteConnectable,
  urlDeLaFenetre: urlDeLaFenetre,
  verifierIdentite: verifierIdentite,
  attendreCompteRendu: attendreCompteRendu,
};

// Le garde-fou du module : il se juge lui-même, rendu par des CHIFFRES et un seul
// MOT, parce que sur ce poste le rendu des outils ALTERE les identifiants (piege
// consigne dans PHASES.md) — lire un tableau de resultats n'est pas lire un verdict.
// Un nombre et « OK »/« KO » survivent a l'affichage ; pas les noms de checks.
if (typeof require === "function" && require.main === module) {
  var fail = 0;
  var checks = 0;
  function ck(lab, cond) {
    checks++;
    if (!cond) {
      fail++;
      console.log("  KO " + lab);
    }
  }
  var BON = '{"port":3001,"host":"127.0.0.1","instance":"abc","glisse":true}';
  var g = lireLigneDePret("bruit\n" + PREFIXE + BON + "\nsuite");
  ck("A1 ligne valide -> port 3001", !!g && g.port === 3001 && g.instance === "abc");
  ck("A2 ligne valide -> glisse vrai", !!g && g.glisse === true);
  ck("B1 absence de prefixe -> null", lireLigneDePret("Server running on x") === null);
  ck("B2 port absent -> null", lireLigneDePret(PREFIXE + '{"host":"x","instance":"a"}') === null);
  ck("B3 port 0 -> null", lireLigneDePret(PREFIXE + '{"port":0,"host":"x","instance":"a"}') === null);
  ck("B4 port 70000 -> null", lireLigneDePret(PREFIXE + '{"port":70000,"host":"x","instance":"a"}') === null);
  ck("B5 port 3000.5 -> null", lireLigneDePret(PREFIXE + '{"port":3000.5,"host":"x","instance":"a"}') === null);
  ck("B6 port vide -> null", lireLigneDePret(PREFIXE + '{"port":"","host":"x","instance":"a"}') === null);
  ck("B7 instance vide -> null", lireLigneDePret(PREFIXE + '{"port":3000,"host":"x","instance":""}') === null);
  ck("B8 JSON partiel -> null", lireLigneDePret(PREFIXE + '{"port":300') === null);
  ck("C1 port en chaine '3000' -> 3000", (function () { var r = lireLigneDePret(PREFIXE + '{"port":"3000","host":"x","instance":"a"}'); return !!r && r.port === 3000; })());
  ck("D1 0.0.0.0 -> 127.0.0.1", hoteConnectable("0.0.0.0") === "127.0.0.1");
  ck("D2 :: -> 127.0.0.1", hoteConnectable("::") === "127.0.0.1");
  ck("D3 vide -> 127.0.0.1", hoteConnectable("") === "127.0.0.1");
  ck("D4 adresse publique conservee", hoteConnectable("192.168.1.5") === "192.168.1.5");
  ck("E1 url porte le port reel", urlDeLaFenetre({ port: 3001, host: "0.0.0.0" }) === "http://127.0.0.1:3001");
  ck("E2 url d'un objet nul -> chaine vide", urlDeLaFenetre(null) === "");
  console.log("AUTOTEST checks=" + checks + " fail=" + fail + " " + (fail === 0 ? "OK" : "KO"));
  process.exit(fail === 0 ? 0 : 1);
}
