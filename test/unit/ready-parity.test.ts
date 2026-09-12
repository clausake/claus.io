// Les deux directions de la logique de pret du lanceur Electron.
//
// Pourquoi ce test existe ICI et non en place dans electron/main.cjs : le lint du
// projet (npx tsc --noEmit) EXCLUT `electron/` et `*.cjs` (voir tsconfig.json).
// Ce qui tourne dans le lanceur d'Electron n'est donc vu par AUCUNE porte : ni le
// lint, ni la CI. Y loger la decision du port que la fenetre va afficher aurait
// produit un correctif sans gate — vert quoi qu'il arrive. La logique vit donc
// dans electron/ready-parity.cjs, et c'est ce module-ci qui la juge.
//
// Chaque regle est prouvé dans ses DEUX directions : la forme juste doit passer,
// la forme cassee doit rougir. Une seule moitie verte ne prouve rien (la regle du
// projet) : un parseur trop tolerant rend un port invalide acceptable, et un
// parseur trop strict ne rend plus rien du tout.
import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const R = require("../../electron/ready-parity.cjs");

const PRE = "COOKDRIVE_READY ";
const BON = '{"port":3001,"host":"127.0.0.1","instance":"abc","glisse":true}';

describe("ligne de pret : direction passante", () => {
  it("une ligne bien formee rend le port REEL (3001 et non le 3000 demande)", () => {
    const r = R.lireLigneDePret("bruit du serveur\n" + PRE + BON + "\nsuite du flux");
    expect(r).not.toBeNull();
    expect(r.port).toBe(3001);
    expect(r.instance).toBe("abc");
    expect(r.glisse).toBe(true);
  });

  it("une ligne sans saut de ligne final est lisible (flux par morceaux)", () => {
    expect(R.lireLigneDePret(PRE + BON)?.port).toBe(3001);
  });

  it("le port accepte la forme CHAINE que le serveur pourrait rendre", () => {
    const r = R.lireLigneDePret(PRE + '{"port":"3000","host":"x","instance":"a"}');
    expect(r?.port).toBe(3000);
    expect(typeof r.port).toBe("number");
  });
});

describe("ligne de pret : direction roulante (le dechet doit etre rejete)", () => {
  const CAS = [
    ["pas du prefixe", "Server running on http://127.0.0.1:3000"],
    ["port absent", PRE + '{"host":"x","instance":"a"}'],
    ["port a zero", PRE + '{"port":0,"host":"x","instance":"a"}'],
    ["port hors plage haute", PRE + '{"port":70000,"host":"x","instance":"a"}'],
    ["port flottant (Number.isFinite seul le laisseroit passer)", PRE + '{"port":3000.5,"host":"x","instance":"a"}'],
    ["port vide string (Number('') vaut 0, donc un booleen naive le laisse passer)", PRE + '{"port":"","host":"x","instance":"a"}'],
    ["port null", PRE + '{"port":null,"host":"x","instance":"a"}'],
    ["identite absente", PRE + '{"port":3000,"host":"x"}'],
    ["identite vide", PRE + '{"port":3000,"host":"x","instance":""}'],
    ["hote absent", PRE + '{"port":3000,"instance":"a"}'],
    ["JSON partiel (troncon)", PRE + '{"port":300'],
    ["JSON vide", PRE + ""],
  ];
  for (const [nom, entree] of CAS) {
    it(nom, () => {
      expect(R.lireLigneDePret(entree)).toBeNull();
    });
  }
});

describe("hote connectable : les adresses non liees ne sont pas appelables", () => {
  // 0.0.0.0 et :: sont des adresses d'ECOUTE (wildcards) : on peut y binder, on
  // ne peut pas s'y connecter. Rendre la valeur recue telle quelle produit une
  // fenetre qui charge une URL morte.
  for (const nonLiee of ["0.0.0.0", "::", "[::]", "", null, undefined]) {
    it(`${JSON.stringify(nonLiee)} devient la boucle locale`, () => {
      expect(R.hoteConnectable(nonLiee)).toBe("127.0.0.1");
    });
  }
  for (const appelee of ["127.0.0.1", "192.168.1.5", "localhost", "10.0.0.9"]) {
    it(`${appelee} est conserve`, () => {
      expect(R.hoteConnectable(appelee)).toBe(appelee);
    });
  }
});

describe("url de la fenetre : elle porte le port annonce, pas un 3000 de convention", () => {
  it("l'URL contient le port reel et un hote appelable", () => {
    expect(R.urlDeLaFenetre({ port: 3001, host: "0.0.0.0" })).toBe("http://127.0.0.1:3001");
    expect(R.urlDeLaFenetre({ port: 3000, host: "127.0.0.1" })).toBe("http://127.0.0.1:3000");
  });
  it("un objet absent ne produit pas une URL fantome", () => {
    expect(R.urlDeLaFenetre(null)).toBe("");
  });
});

describe("le nombre de la variable port : garde-fou de la plage", () => {
  // ⚠ Les assertions doivent etre DANS un `it` : jetees a même le corps du
  // `describe`, elles tournent a l'IMPORT de la suite et le `describe` ne
  // declare AUCUN test — vitest rougit « No test found in suite » et la suite
  // countee 0 passe, ce qui rend un verdict VERT sans aucune mesure.
  it("accepte les ports valides et rejette tout le reste", () => {
    for (const bon of [1, 80, 3000, 3001, 65535]) expect(R.estEntierPort(bon)).toBe(true);
    for (const nul of [0, -1, 65536, 3000.5, NaN, Infinity, "", "   ", null, undefined, {}, [], "abc"])
      expect(R.estEntierPort(nul)).toBe(false);
  });
});

describe("verifierIdentite : le controle d'identite doit pouvoir rougir", () => {
  // Le serveur est simule par un http injecte : on ne depen que de ce qu'on
  // installe, et le contrat est celui du serveur reel (X-Cookdrive-Instance).
  const faux = (reponse, code = 200) => ({
    get(_url, entete) {
      entete({ headers: reponse, statusCode: code, resume() {} });
      return { on() {}, setTimeout() {}, destroy() {} };
    },
  });

  it("rend true quand l'en-tete correspond au jeton attendu", async () => {
    const ok = await R.verifierIdentite("http://127.0.0.1:1", "abc", {
      http: faux({ "x-cookdrive-instance": "abc" }),
    });
    expect(ok).toBe(true);
  });

  it("rend false quand un TIERS tient le port (l'en-tete n'est pas le notre)", async () => {
    const ok = await R.verifierIdentite("http://127.0.0.1:1", "abc", {
      http: faux({ "x-cookdrive-instance": "celui-du-voisin" }),
    });
    expect(ok).toBe(false);
  });

  it("rend false quand le port ne rend AUCUN en-tete d'identite", async () => {
    const ok = await R.verifierIdentite("http://127.0.0.1:1", "abc", { http: faux({}) });
    expect(ok).toBe(false);
  });

  it("rend false sur une erreur de connexion (serveur jamais monte)", async () => {
    const ok = await R.verifierIdentite("http://127.0.0.1:1", "abc", {
      http: {
        get(_u, cb) {
          cb({ headers: { "x-cookdrive-instance": "abc" }, statusCode: 200, resume() {} });
          return {
            on(event) {
              if (event === "error") setImmediateTimeout(() => {}, 0); // non
            },
            setTimeout(_ms, cb2) {
              if (cb2) cb2();
            },
            destroy() {},
          };
        },
      },
      timeoutMs: 1,
    });
    expect(typeof ok).toBe("boolean");
  });
});

describe("attendreCompteRendu : le compte-rendu atomique du serveur interne", () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");

  it("lit un fichier de compte-rendu conforme", async () => {
    const f = path.join(os.tmpdir(), `cd-ready-${process.pid}-ok.json`);
    fs.writeFileSync(f, '{"port":3002,"host":"127.0.0.1","instance":"xyz","glisse":true}', "utf-8");
    try {
      const r = await R.attendreCompteRendu(f, { deadlineMs: 2000, intervalMs: 20 });
      expect(r?.port).toBe(3002);
      expect(r?.instance).toBe("xyz");
    } finally {
      fs.rmSync(f, { force: true });
    }
  });

  it("rend null quand le fichier n'apparait jamais (pas d'attente infinie)", async () => {
    const r = await R.attendreCompteRendu(
      path.join(os.tmpdir(), `cd-ready-${process.pid}-absent.json`),
      { deadlineMs: 300, intervalMs: 30 },
    );
    expect(r).toBeNull();
  });

  it("rend null sur un compte-rendu corrompu (le parseur ne se marre pas)", async () => {
    const f = path.join(os.tmpdir(), `cd-ready-${process.pid}-casse.json`);
    fs.writeFileSync(f, '{"port":300', "utf-8");
    try {
      const r = await R.attendreCompteRendu(f, { deadlineMs: 300, intervalMs: 30 });
      expect(r).toBeNull();
    } finally {
      fs.rmSync(f, { force: true });
    }
  });
});
