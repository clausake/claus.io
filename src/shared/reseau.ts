// Choix de l'adresse LAN a annoncer (P4a, plan 014).
//
// Defaut mesure le 02/11 : l'ancienne route /api/network-info prenait la
// PREMIERE interface IPv4 non interne venue. Rejoue sur la machine du maitre
// comme ici, l'algorithme peut annoncer 172.17.0.1 (le pont docker0) : le QR
// « Acces Smartphone Wi-Fi » renvoie alors a une adresse morte. Un QR menteur
// est pire qu'une absence de QR.
//
// Cette fonction est PURE (les interfaces sont passees en parametre) : elle se
// juge au banc, sans dependre du poste qui l'exerce.

export interface CandidateInterface {
  /** nom d'interface (Linux/Windows) — sert a ecarter les ponts virtuels.
   *  Optionnel : `os.networkInterfaces()` ne le porte pas, et la fonction se
   *  sert de la CLE du dictionnaire (le nom), jamais de ce champ. */
  name?: string;
  family?: string;
  address?: string;
  internal?: boolean;
}

// Ponts et interfaces qui ne sont JAMAIS le Wi-Fi du maitre. Le filtre est sur
// le NOM (minuscules) : c'est la seule chose qui distingue un pont docker d'une
// vraie carte, et il n'est pas lie au poste d'un utilisateur particulier.
const NOMS_ECARTES = [
  "docker", "br-", "veth", "wsl", "vEthernet", "virtualbox",
  "tailscale", "utun", "tun", "tap",
];

function ecartee(name: string): boolean {
  const n = name.toLowerCase();
  return NOMS_ECARTES.some((t) => n.includes(t.toLowerCase()));
}

function estPriveeLienLocal(ip: string): boolean {
  return ip.startsWith("169.254.");
}

/**
 * Rend l'IPv4 a annoncer, ou `null` quand AUCUNE interface n'est une candidate
 * LAN credible. `null` est une reponse HONNETE : la route rendra
 * `{ ip: null, url: null }` et le panneau dira « aucune adresse LAN detectee »,
 * jamais une URL inventee.
 *
 * Ordre de preférence (le LAN du maitre est en 192.168) : 192.168.* > 10.* >
 * 172.16-31.*.
 */
export function choisirIpLan(
  interfaces: Record<string, CandidateInterface[] | undefined>,
): string | null {
  const candidates: string[] = [];
  for (const [name, adresses] of Object.entries(interfaces)) {
    if (ecartee(name)) continue;
    for (const iface of adresses ?? []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      const ip = (iface.address ?? "").trim();
      if (ip === "" || estPriveeLienLocal(ip)) continue;
      candidates.push(ip);
    }
  }
  if (candidates.length === 0) return null;
  const rang = (ip: string): number =>
    ip.startsWith("192.168.") ? 0
      : ip.startsWith("10.") ? 1
        : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2
          : 3;
  return [...candidates].sort((a, b) => rang(a) - rang(b))[0];
}
