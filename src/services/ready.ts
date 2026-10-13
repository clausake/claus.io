// L'annonce du port REELlement obtenu par le serveur.
//
// Pourquoi ce fichier existe. Le client Electron charge
// `http://localhost:3000` et attend, sur la sortie standard du serveur, la
// chaine `http://localhost:3000`. Or le serveur ne rend JAMAIS cette chaine :
// `HOST` vaut `127.0.0.1` par défaut, et surtout le port est un DEFAUT (3000) et
// non un contrat — `server.ts` fait `PORT++` sur EADDRINUSE quand personne n'a
// demandé de port Explicitement. Deux effets observes sur ce poste :
//
//  1. la comparaison Electron `.includes('http://localhost:3000')` rend false
//     meme quand tout va bien (le serveur ecrit `127.0.0.1`), et la fenetre ne
//     s'ouvre que par le filet de secours en production ;
//  2. plus grave : quand 3000 est occupe par un tiers, le serveur glisse a 3001
//     EN SILENCE et Electron, lui, charge 3000 — c'est-a-dire l'application du
//     voisin. La fenetre affiche une app qui n'est pas claus.io sans que rien
//     ne rougisse.
//
// Le correctif ne peut pas se faire cote Electron seul : il faut que le port
// obtenu soit DICT, dans un format que le parent peut relire. C'est ce role-ci.
//
// Deux canaux, parce qu'ils ne servent pas les memes appelsants :
//   - la ligne `COOKDRIVE_READY {...}` sur stdout : le canal de l'Electron en
//     developpement, qui a deja un pipe sur stdout ;
//   - un fichier de compte-rendu (`COOKDRIVE_READY_FILE` dans l'environnement,
//     pose par qui le veut) : le canal du lancement en production, ou le serveur
//     tourne DEDANS du process Electron (`require(server.cjs)`) et n'a donc
//     aucun stdout a offrir au parent.
//
// ⚠ L'annonce se fait Apres que `listen` a reussi, et elle porte le port que
// l'objet serveur a reellement obtenu (`server.address().port`), pas la variable
// PORT de la fermeture recursive : les deux divergent des qu'un cran a ete
// cede, et c'est exactement ce qui doit etre rapporte.
import fs from "fs";
import type { AddressInfo } from "net";

export interface ReadyInfo {
  /** Le port REELlement obtenu, pas celui qui avoit ete demande. */
  port: number;
  host: string;
  /** L'identite d'instance : permet au parent de verifier QUI il va afficher. */
  instance: string;
  /** Vrai si le port obtenu differe de celui qui avoit ete demande. */
  glisse: boolean;
}

export function announceReady(
  server: { address(): AddressInfo | string | null },
  opts: { host: string; demandedPort: number; instance: string },
): ReadyInfo | null {
  const addr = server.address();
  if (!addr || typeof addr === "string") return null;
  const info: ReadyInfo = {
    port: addr.port,
    host: addr.address || opts.host,
    instance: opts.instance,
    glisse: addr.port !== opts.demandedPort,
  };
  // La ligne reste LISIBLE a l'humain et parsable par la machine, et ne remplace
  // pas le log herite `Server running on ...` : des harnais (la sonde d'identite,
  // les specs) s'appuient dessus.
  console.log(`COOKDRIVE_READY ${JSON.stringify(info)}`);
  const chemin = process.env.COOKDRIVE_READY_FILE;
  if (chemin) {
    try {
      // ecriture ATOMIQUE (un `rename`, pas une ecriture en place): le parent
      // attend ce fichier et le lit des qu'il apparait. Ecrit a moitie, un JSON
      // partiel se lit comme un defaut du serveur.
      const temporaire = `${chemin}.tmp-${process.pid}`;
      fs.writeFileSync(temporaire, JSON.stringify(info), "utf-8");
      fs.renameSync(temporaire, chemin);
    } catch (e) {
      // Le compte-rendu est un confort de diagnostic: il ne doit jamais
      // empecher l'app de servir.
      console.error("[ready] compte-rendu impossible:", e);
    }
  }
  return info;
}
