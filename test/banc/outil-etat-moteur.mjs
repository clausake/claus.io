// L'OUTIL a main (jamais une porte) : etat des serveurs reels du poste sur les
// ports d'usage, par la voie du produit. A lancer a la main avant l'assistant.
import { etatMoteurLocal } from "../../src/shared/fournisseur/index.js";

const { serveurs, message } = await etatMoteurLocal();
console.log("SERVEURS:", JSON.stringify(serveurs));
console.log("MESSAGE:", message === null ? "(nul)" : message.slice(0, 80) + "...");
