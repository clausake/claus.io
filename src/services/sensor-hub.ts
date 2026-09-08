// Hub de diffusion des capteurs HACCP (Server-Sent Events).
//
// Pourquoi ce fichier : le tableau de bord HACCP etait en polling a 4 s. Trois
// consequences mesurees (scripts/audit-perf.mjs, scripts/verify-ratelimit.mjs) :
//   1. latence capteur->ecran de 4 s en moyenne (0.5 s dans le pire cas) ;
//   2. 15 req/min par tablette, la cause directe du 429 global de l'app ;
//   3. une tablette endormie continuait a frapper la base, et une tablette
//      activee voyait la ligne d'un capteur muet sans rien de signalant.
// Le serveur connait deja l'instant exact ou un capteur poste (le webhook
// /api/haccp/webhook/iot-report) : il n'a pas besoin qu'on lui demande, il peut
// le dire. C'est le chemin le plus court et le plus honeste.
//
// Un seul hub pour tout le serveur, les clients s'enregistrent par requete SSE.
// Pas de deduplication a l'emission : un webhook poste est un fait HACCP, il est
// toujours diffuse (une chambre qui reste a 3.4 degres doit pouvoir rafraichir
// son horodatage). La de-dup, si elle servait un jour, se ferait a l'ingestion,
// pas ici ou elle avalerait silencieusement une releve.
import type { Response, Request } from "express";

export type SensorReading = {
  id: string;
  name: string;
  type?: string;
  equipment_type?: string;
  temperature: number;
  battery?: number;
  last_reading_at: string;
};

export type StaleSensor = {
  id: string;
  name: string;
  last_reading_at: string;
  silence_seconds: number;
};

type Client = { res: Response; close: () => void };

/** Un serveur peut avoir plusieurs hubs (un par surface) ; ici un seul, exporte. */
export class SensorHub {
  private clients = new Set<Client>();

  size(): number {
    return this.clients.size;
  }

  /**
   * Attache une reponse comme client SSE. Ecrit l'en-tete d'ouverture, un
   * commentaire d'attention (keep-alive), puis laisse le flux ouvert.
   * Retourne une fonction de detachement appelee sur la fermeture du flux.
   */
  attach(req: Request, res: Response): () => void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-cache : un flux qui serait mis en cache afficherait de vieusses
      // temperatures, le pire resultat pour un suivi HACCP.
      "Cache-Control": "no-cache, no-transform",
      // Pas de header Connection : c'est un header hop-by-hop que Node tient au
      // niveau protocole (http.Server.keepAliveTimeout) et qu'un reverse proxy
      // est tenu de ne pas relayer. L'hard-coder ici serait a la fois ignore et
      // trompeur. Le maintien en vie est assure par heartbeat() + "retry:".
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    });
    // Forcer l'envoi des en-tetes : sans un premier octet, certains proxies
    // (et le dev-middleware de Vite) tamponnent jusqu'a une taille de bloc.
    res.write("retry: 2500\n\n");

    const client: Client = {
      res,
      close: () => {
        if (this.clients.delete(client)) {
          try { res.end(); } catch { /* flux deja mort */ }
        }
      },
    };
    this.clients.add(client);

    // Le navigateur ne ferme pas la requete quand l'onglet est ferme : on se
    // detache sur la fermeture cote socket, sinon les clients s'accumulent.
    req.on("close", client.close);
    return client.close;
  }

  private frame(event: string, data: unknown): boolean {
    if (this.clients.size === 0) return false;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of this.clients) {
      try {
        // Un ecriture qui echoue = flux mort : on le retire sans faire tomber
        // la diffusion pour les autres clients.
        c.res.write(payload);
      } catch {
        c.close();
      }
    }
    return true;
  }

  /**
   * Pousse une releve de capteur. Un webhook poste est un fait HACCP: il est
   * toujours diffuse (jamais absorbe silencieusement), meme si un autre client
   * a vu une valeur identique. Il n'y a pas de deduplication ici: le contrat est
   * "le serveur dit ce que le capteur vient d'emttre", pas "le client recoit des
   * valeurs uniques".
   */
  publishReading(reading: SensorReading): boolean {
    return this.frame("sensor", reading);
  }

  /** Pousse la liste complete (apres un register/delete de capteur). */
  publishList(sensors: SensorReading[]): boolean {
    return this.frame("sensors", sensors);
  }

  /**
   * Pousse les capteurs qui n'ont plus emis depuis le seuil. C'est l'absence de
   * mesure qui est l'alerte : sans ceci, un capteur a pile morte est
   * indiscernable d'une chambre froide conforme le jour d'un controle.
   *
   * On publie AUSSI quand la liste est vide. "Plus aucun capteur muet" est un
   * changement d'etat : sans cette emission, un capteur qui reparait apres un
   * blanc garderait son fanion muet pour toujours cote client, et la LED ambre
   * mentirait sur une mesure pourtant fraiche. Le client reconstruit son
   * ensemble a chaque frame : la derniere emission fait foi.
   */
  publishStale(stale: StaleSensor[]): boolean {
    return this.frame("stale", stale);
  }

  /** Commentaire de maintien en vie : traverse les proxies sans etre un evenement. */
  heartbeat(): void {
    for (const c of this.clients) {
      try { c.res.write(": ping\n\n"); } catch { c.close(); }
    }
  }

  detachAll(): void {
    for (const c of [...this.clients]) c.close();
    this.clients.clear();
  }
}

export const sensorHub = new SensorHub();
