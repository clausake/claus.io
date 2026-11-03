import { describe, it, expect, vi } from "vitest";
import {
  sAbonner, instantane, envoyer, reinitialiser, poserEtat, poserBienvenue, CAP_MESSAGES,
} from "../../src/shared/atelier-chat.js";

// P3 (plan 014) — le store qui répare « l'IA écrit, je change d'onglet ».
// Ce que ces tests jugent : abonnement/instantane (contrat useSyncExternalStore),
// envoi y compris APRES demontage du composant (le fetch est dans le store),
// refus du second envoi pendant enCours, borne R4 (200), reset, et
// l'idempotence de la redrivaison (R3) via la cle derniereReponse.

function reponse(ok: boolean, corps: Record<string, unknown>) {
  return async () => ({ ok, status: ok ? 200 : 500, json: async () => corps });
}

describe("atelier-chat (le store qui survit au demontage)", () => {
  it("instantane a une reference stable entre les notifications", () => {
    const avant = instantane();
    let appelee = 0;
    const off = sAbonner(() => { appelee++; });
    reinitialiser();
    expect(appelee).toBe(1);
    expect(instantane()).not.toBe(avant);      // un nouveau remplacement change la reference
    expect(instantane()).toBe(instantane());    // ... mais elle est stable entre deux lectures
    off();
    reinitialiser();
    expect(appelee).toBe(1);                    // desabonne = plus de notification
  });

  it("l'etat initial porte le message d'accueil (plus d'effet dans le composant)", () => {
    reinitialiser();
    const e = instantane();
    expect(e.messages).toHaveLength(1);
    expect(e.messages[0].role).toBe("assistant");
    expect(e.messages[0].content).toContain("assistant culinaire");
  });

  it("envoyer depose la reponse MEME si l'appelant est demonte : le fetch vit dans le store", async () => {
    reinitialiser();
    const transport = vi.fn(reponse(true, { response: "OK12 la reponse du moteur" }));
    // On n'attend PAS le composant : seule la promesse du store compte.
    const p = envoyer("une question", { transport });
    // enCours est pose immediatement (le composant montre le spinner)...
    expect(instantane().enCours).toBe(true);
    const r = await p;
    expect(r.envoye).toBe(true);
    const e = instantane();
    expect(e.enCours).toBe(false);
    expect(e.messages.map((m) => m.content)).toEqual([
      expect.stringContaining("assistant culinaire"),
      "une question",
      "OK12 la reponse du moteur",
    ]);
    expect(e.derniereReponse).toBe("OK12 la reponse du moteur");
    // la cle de redrivaison (R3) : c'est ce que MenuAnalysis compare au remontage
    expect(instantane().derniereReponse).toBe(e.derniereReponse);
  });

  it("un second envoi est REFUSE tant que enCours est vrai", async () => {
    reinitialiser();
    let relacher: (() => void) | null = null;
    const lent = () => new Promise<{ ok: boolean; status: number; json: () => Promise<Record<string, unknown>> }>(
      (res) => { relacher = () => res({ ok: true, status: 200, json: async () => ({ response: "fin" }) }); });
    const p = envoyer("premiere", { transport: lent });
    const second = await envoyer("seconde question", { transport: lent });
    expect(second).toEqual({ envoye: false, erreur: "ENVOI_EN_COURS" });
    expect(instantane().messages.filter((m) => m.content === "seconde question")).toHaveLength(0);
    relacher!();
    await p;
    expect(instantane().messages.some((m) => m.content === "premiere")).toBe(true);
  });

  it("message vide refuse sans toucher l'etat ; erreur serveur rend un texte nomme", async () => {
    reinitialiser();
    expect(await envoyer("   ", { transport: reponse(true, { response: "x" }) })).toEqual({ envoye: false, erreur: "MESSAGE_VIDE" });
    const r = await envoyer("question", { transport: () => Promise.reject(new Error("reseau")), t: { chatServerError: "Le serveur n'a pas repondu." } });
    expect(r.erreur).toBe("SERVEUR");
    expect(instantane().messages.at(-1)?.content).toBe("Le serveur n'a pas repondu.");
    expect(instantane().enCours).toBe(false);
  });

  it("R4 : la borne de session est CAP_MESSAGES, les plus vieux sortent", async () => {
    reinitialiser();
    const gros: { role: "user"; content: string }[] = [];
    for (let i = 0; i < CAP_MESSAGES + 40; i++) gros.push({ role: "user", content: "m" + i });
    // pousser() est la seule voie d'ajout : la borne s'y applique (le store ne
    // grossit pas sans limite sur une session de 12 h).
    poserEtat({ messages: gros });
    await envoyer("le plus recent", { transport: reponse(true, { response: "reponse" }) });
    const e = instantane();
    expect(e.messages.length).toBeLessThanOrEqual(CAP_MESSAGES);
    expect(e.messages.at(-1)?.content).toBe("reponse");
    expect(e.messages.some((m) => m.content === "m0")).toBe(false);
  });

  it("l'historique envoye au serveur passe par historiqueSur (fenetre 12, contrat serveur)", async () => {
    reinitialiser();
    const vus: { history: unknown[]; message: string }[] = [];
    await envoyer("question", {
      transport: (body) => {
        vus.push(body as { history: unknown[]; message: string });
        return reponse(true, { response: "r" })();
      },
      historiqueSur: (m) => m.slice(-12),
    });
    expect(vus.length).toBe(1);
    expect(vus[0].message).toBe("question");
    expect(vus[0].history.length).toBeLessThanOrEqual(12);
  });

  it("reinitialiser remet l'etat d'accueil (bouton nouvelle conversation)", async () => {
    await envoyer("q", { transport: reponse(true, { response: "r" }) });
    reinitialiser();
    expect(instantane().messages).toHaveLength(1);
    expect(instantane().derniereReponse).toBeNull();
  });

  // A3 : l'accueil suit la langue (t.chatWelcome), sans ecraser un echange.
  it("A3 : poserBienvenue localise l'accueil tant que la conversation est vierge", () => {
    reinitialiser();
    poserBienvenue("Hello! I am your culinary assistant.");
    expect(instantane().messages).toEqual([
      { role: "assistant", content: "Hello! I am your culinary assistant." },
    ]);
    // no-op sur chaine vide ou blanche
    poserBienvenue("   ");
    expect(instantane().messages[0].content).toBe("Hello! I am your culinary assistant.");
  });

  it("A3 : poserBienvenue ne touche PAS une conversation deja engagee", async () => {
    reinitialiser();
    await envoyer("q", { transport: reponse(true, { response: "r" }) });
    poserBienvenue("DEPLACE");
    const e = instantane();
    expect(e.messages.map((m) => m.content)).toEqual([
      expect.stringContaining("assistant culinaire"), "q", "r",
    ]);
    expect(e.messages.some((m) => m.content === "DEPLACE")).toBe(false);
  });
});
