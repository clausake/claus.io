// Sonden la DIVERGENCE de l'echelle qui fit la date des bornes de
// /api/dashboard/cost-data (defaut consigne au Sprint 14.f).
//
// LE DEFAUT. Les deux bornes de la fenetre « les 7 derniers jours » etaient
// calculees par `new Date(...).toISOString().split('T')[0]`, donc sur la
// date UTC, pendant que le calendrier que D1 attend est le calendrier CIVIL
// LOCAL. Sous Europe/Paris, entre 00:00 et 02:00, UTC est ENCORE LA VEILLE:
// la fenetre perdait le jour en cours et le tableau affichait une journee
// fantome. La porte D1 etait verte environ 22 h sur 24: un defaut LATENT,
// et une seule course ne le dit pas.
//
// CETTE SONDE ne depend PAS de l'heure ou on la joue. Elle FIGE son instant
// (INSTANT_FIXE, un instant du creneau maudit) et rend, pour chaque fuseau,
// la date que rendroient LES DEUX voies: celle d'avant (UTC, par
// toISOString) et celle d'apres (les composants locaux). Elle dit si elles
// divergent. Ainsi le verdict est reproductible a toute heure du jour, ce
// que la matrice (qui joue la VRAIE porte, a l'heure REELLE) ne peut pas
// faire hors du creneau.
//
// Lancement: node scripts/probe-fuseau-cost-data.mjs
// Sortie: un TOKEN par fuseau, puis DIVERGENT= et VERDIT=.

// Un instant du creneau maudit: 00:13 a Paris, soit 22:13z la veille.
const INSTANT_FIXE = Date.parse("2026-09-24T22:13:00Z");

// Minutes de decalage avec UTC, hors jour, hors changement d'heure.
// Figees a la main et NON pas lues dans une bibliotheque de fuseaux: cette
// sonde ne juge que DEUX echelles sur UN meme instant, un decalage fautif
// ferait disparaitre la divergence et rendrait un faux vert. La liste des
// zones JOUEES, elle, est verifiee par scripts/juge-couverture-fuseaux-d1.py
// contre le noyau (`date`), pas contre cette table.
const FUSEAUX = [
  ["UTC", 0],
  ["Europe/Paris", 120],
  ["Asia/Tokyo", 540],
  ["Pacific/Honolulu", -600],
  ["Pacific/Kiritimati", 840],
];

const deux = (n) => String(n).padStart(2, "0");

// LA VOIE D'AVANT: la date UTC, telle que la rend toISOString().
function jourUTC(decal) {
  return new Date(INSTANT_FIXE - decal * 86_400_000)
    .toISOString()
    .split("T")[0];
}

// LA VOIE D'APRES: les composants locaux, telle que les rend jourLocalISO().
// On decompose l'instant en heures UTC APRES y avoir ajoute le decalage du
// fuseau: c'est exactement ce que fait le noyau quand TZ est pose.
function jourLocal(decal, minutes) {
  const d = new Date(INSTANT_FIXE - decal * 86_400_000 + minutes * 60_000);
  return (
    d.getUTCFullYear() +
    "-" +
    deux(d.getUTCMonth() + 1) +
    "-" +
    deux(d.getUTCDate())
  );
}

let divergents = 0;
for (const [nom, minutes] of FUSEAUX) {
  const avant = jourUTC(0);
  const apres = jourLocal(0, minutes);
  const divergence = avant !== apres;
  if (divergence) divergents += 1;
  console.log(
    `FUSEAU=${nom.padEnd(20)} utc=${avant} local=${apres} ` +
      `${divergence ? "DIVERGENT" : "conformes"}`,
  );
}

// Et l'amplitude de la fenetre: sept jours calendriers, dans les deux
// voies, dans tous les fuseaux. Un correctif de fuseau qui retrecirait la
// fenetre jugerait un autre objet que celui qu'il pretend juger.
let amplitudes = [];
for (const [nom, minutes] of FUSEAUX) {
  const a = Date.parse(jourLocal(7, minutes));
  const b = Date.parse(jourLocal(0, minutes));
  amplitudes.push((b - a) / 86_400_000);
}
const amplitude_fausse = amplitudes.filter((n) => n !== 7).length;
console.log(`AMPLITUDES=${amplitudes.join(",")} FAUSSES=${amplitude_fausse}`);
console.log(`FUSEAUX=${FUSEAUX.length} DIVERGENTS=${divergents}`);
console.log(
  "VERDIT=" +
    (divergents === 0
      ? "AUCUNE_DIVERGENCE (la sonde ne peut rien demontrer)"
      : amplitude_fausse === 0
        ? "DIVERGENCE_MONTREE_ET_AMPLITUDE_PRESERVEE"
        : "AMPLITUDE_DEGRADEE"),
);
