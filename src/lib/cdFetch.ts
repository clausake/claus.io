// Garde de session cote client (chantier 1). Toute requete qui passe par ici
// et revient 401 (AUTH_REQUISE : session expiree, revoquee, ou jamais ouverte)
// leve un evenement global : AuthGate l'ecoute et ramene l'utilisateur a
// l'ecran de connexion. Sans ce relais, une session morte en base laisse l'UI
// croire qu'on est encore connecte — chaque POST echoue en silence et
// l'operateur croit avoir enregistre ce qu'il n'a pas enregistre.
//
// Le 401 n'est intercepte QUE pour l'identite : un GET libre ne passe jamais
// en 401 cote serveur (la gate de session ne juge que les mutations), donc
// l'evenement ne peut pas etre leve par un simple refus de lecture.
export function cdFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init).then((res) => {
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent("cd-auth-expiree"));
    }
    return res;
  });
}
