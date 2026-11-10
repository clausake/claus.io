// Chantier 47 — L'ESPACE LIBRE SUR LE DISQUE, MESURE ET HONNETE.
//
// Le defaut mesure (audit senior du 09/11) : `/health` rendait TOUJOURS
// `diskFree: -1`. La route appelait `fs.statfs(...)` puis `statfsFn.sync(...)`
// — une fonction qui N'EXISTE PAS (le nom de la methode est `statfsSync`, et
// `statfs` est asynchrone). L'exception etait avalee par un `catch` muet :
// l'applicationInstalled repartait sur le poste du client en annonçant un
// disque « inconnu » alors que `fs.statfsSync()` sur le meme dossier rendait
// environ 35 Go libres. Mesure du client : « diskFree: -1 » sur
// l'application installee.
//
// Le contrat : `fs.statfsSync` (synchrone, le nom exact), et une erreur
// NOMMEE et JOURNALISEE plutot qu'un `catch` totalement muet. Un `diskFree`
// a -1 signifie « information indisponible », jamais « disque plein ».
import fs from "fs";

/** Le disque libre, en GO (arrondi). -1 = information indisponible. */
export function espaceLibreDisque(dossier: string): number {
  try {
    const stats = fs.statfsSync(dossier);
    return Math.round((stats.bavail * stats.bsize) / 1e9);
  } catch (e) {
    // Un detail, pas un silence : un disque non interrogeable se voit.
    console.error(
      `[DISQUE] espace libre indisponible pour ${dossier} :`,
      e instanceof Error ? e.message : String(e),
    );
    return -1;
  }
}
