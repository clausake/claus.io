// La sonde qui juge les fournisseurs (Sprint 15, Tache 5).
//
// JOUEE COMME UN FICHIER, jamais en `node -e` inline: le harnais de securite du
// poste bloque l'inline, et un inline ne se relit pas (decision du contrat).
//
// Ce qu'elle tend, dans cet ordre, pour CHAQUE cible:
//   1. l'inventaire des modeles  — mais un 404 est un etat LICITE (mesure du
//      25/09: Groq rend 404 sur /v1/models sans etre en panne). Un 404 ne
//      rougit donc PAS; il rend seulement l'inventaire uninventaire.
//   2. une GENERATION REELLE de quelques tokens. C'est le seul juge: un 200
//      sur /v1/models ne prouve l'inférence de rien (la lecon du depot).
//   3. le delai total, bornee a 20 s.
//
// Elle rend VERT ou nomme le defaut (MODELES_ABSENTS, GENERATION_MUETTE,
// DELAI_DEPASSE, CLEF_ABSENTE, SERVEUR_ABSENT, REPONSE_INVALIDE).
// Elle ne rend JAMAIS un texte « vu » en cas d'echec: pas de texte de
// complaisance, pas de 200 interprete comme une reponse.
//
// La clef d'API vient du SEUL environnement. Elle n'est jamais ecrite dans un
// fichier, jamais rendue dans une sortie, jamais lue d'un reglage.

// La borne est INJECTABLE par l'environnement: sans elle, la branche
// DELAI_DEPASSE ne peut pas etre jouee au test (il faudrait attendre 20 s),
// et une branche qu'on ne joue pas est une branche qu'on ne peut pas signer.
// La valeur de LIVRAISON reste 20 s, decidee par le contrat (Tache 5).
const DELAI_MAX_MS = Number(lireEnv("SONDE_DELAI_MS", "20000"));
const NB_TOKENS_SONDE = Number(lireEnv("SONDE_TOKENS", "8"));
const LONGEUR_MIN_TEXTE = 4;

function lireEnv(cle, defaut) {
  const v = process.env[cle];
  return v === undefined || v === "" ? defaut : v;
}

/** Une requete avec mort reelle: un per meurt, un per n'attend pas.
 *
 *  Le nom de l'erreur d'annulation depend de la VOIE utilisee, mesure sur le
 *  poste (node v22.23.2, `contre-epreuve-sonde.mjs`):
 *      AbortController + abort()   -> name = "AbortError"
 *      AbortSignal.timeout(ms)     -> name = "TimeoutError"
 *  Juger sur UN seul nom est un piege: basculer de voie classerait TOUTES les
 *  expirations en SERVEUR_ABSENT, un faux diagnostic sans panne visible. On
 *  admet les deux noms, et un autre nom reste SERVEUR_ABSENT (un refus de
 *  connexion, lui, doit nommer le serveur). */
const NOMS_EXPIRATION = new Set(["AbortError", "TimeoutError"]);

async function fetchAvecDelai(url, options, delaiMs) {
  const ctl = new AbortController();
  const minuteur = setTimeout(() => ctl.abort(), delaiMs);
  try {
    const reponse = await fetch(url, { ...options, signal: ctl.signal });
    return { ok: true, statut: reponse.status, json: async () => reponse.json() };
  } catch (e) {
    const motif = NOMS_EXPIRATION.has(e?.name) ? "DELAI_DEPASSE" : "SERVEUR_ABSENT";
    return { ok: false, motif, detail: `${e?.name ?? "?"} ${String(e?.message ?? e)}` };
  } finally {
    clearTimeout(minuteur);
  }
}
async function sonderOpenAI(cible) {
  const t0 = Date.now();
  const entetes = {};
  if (cible.clef) entetes.authorization = `Bearer ${cible.clef}`;
  const base = cible.base.replace(/\/+$/, "");

  // (1) L'inventaire: licite, utile, mais NON juge de la vie. Un 404 n'est pas
  // une panne (mesure: Groq rend 404 sur /v1/models sans etre en panne).
  let nbModeles = null;
  let invMotif = null;                       // l'echec de CONNEXION de l'inventaire
  let modele = cible.modele ?? null;
  const inv = await fetchAvecDelai(`${base}/v1/models`, { method: "GET", headers: entetes }, 5_000);
  if (inv.ok && inv.statut === 200) {
    const corps = await inv.json().catch(() => null);
    const liste = Array.isArray(corps?.data) ? corps.data : Array.isArray(corps) ? corps : [];
    nbModeles = liste.length;
    modele = modele ?? liste[0]?.id ?? null;
  } else if (!inv.ok) {
    invMotif = inv.motif;                    // le serveurs n'a pas repondu: ce n'est
  }                                        // PAS la meme faute qu'un sans-modeles

  if (modele === null) {
    // Distinguer les deux verites: « personne ne repond » et « il n'a aucun
    // modele ». Les confondre enverrait un panne de reseau en defaut d'installation.
    const defaut = invMotif ?? "MODELES_ABSENTS";
    return { cible: cible.nom, vivant: false, defaut,
             nbModeles, duree_ms: Date.now() - t0 };
  }

  // (2) LA generation: le seul juge.
  const gen = await fetchAvecDelai(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...entetes },
    body: JSON.stringify({
      model: modele,
      messages: [{ role: "user", content: "Reponds seulement par les quatre caractères: OK12" }],
      temperature: 0,
      max_tokens: NB_TOKENS_SONDE,
      stream: false,
    }),
  }, DELAI_MAX_MS);
  if (!gen.ok) {
    return { cible: cible.nom, vivant: false, defaut: gen.motif, nbModeles,
             modele, duree_ms: Date.now() - t0, detail: gen.detail };
  }
  if (gen.statut === 401 || gen.statut === 403) {
    return { cible: cible.nom, vivant: false, defaut: "CLEF_ABSENTE", nbModeles,
             modele, duree_ms: Date.now() - t0 };
  }
  if (gen.statut !== 200) {
    return { cible: cible.nom, vivant: false, defaut: `HTTP_${gen.statut}`,
             nbModeles, modele, duree_ms: Date.now() - t0 };
  }
  const corps = await gen.json().catch(() => null);
  // Le champ n'est PAS présumé: il est LU, et son absence est nommée.
  //
  // LA LEÇON MESURÉE du 25/09 sur le poste: le serveurs vLLM (Qwen3.8-Flash-Next,
  // :8888) repond 200 avec `content: null` et le texte dans `message.reasoning`
  // (un modele a raisonnement qui a consumé les huit tokens de la sonde dans son
  // raisonnement). Juger la vie d'un serveurs sur le SEUL `content` declare donc
  // un serveurs PARFAITEMENT VIVANT comme MORT: la plus mauvaise classe de faute,
  // parce qu'elle est silencieuse et qu'elle est du cote du mensonge.
  // La question de la sonde est « le serveurs infère-t-il ? », pas « le texte est-il
  //beau ? ». On admet les DEUX champs, et on rend lequel a servi.
  const message = corps?.choices?.[0]?.message;
  const champs = [message?.content, message?.reasoning];
  const texte = champs.find((c) => typeof c === "string" && c.trim() !== "");
  if (texte === undefined) {
    const vus = Object.keys(message ?? {}).filter((k) => message?.[k] !== null
      && message?.[k] !== undefined);
    return { cible: cible.nom, vivant: false, defaut: "REPONSE_INVALIDE",
             nbModeles, modele, duree_ms: Date.now() - t0,
             detail: `content/reasoning absents ou vuides (cles non nulles: ${vus.join(",") || "aucune"})` };
  }
  const champUtilise = texte === message?.content ? "content" : "reasoning";
  if (texte.trim().length < LONGEUR_MIN_TEXTE) {
    return { cible: cible.nom, vivant: false, defaut: "GENERATION_MUETTE",
             nbModeles, modele, duree_ms: Date.now() - t0, rendu: texte };
  }
  const duree = Date.now() - t0;
  if (duree > DELAI_MAX_MS) {
    return { cible: cible.nom, vivant: false, defaut: "DELAI_DEPASSE",
             nbModeles, modele, duree_ms: duree };
  }
  return { cible: cible.nom, vivant: true, nbModeles, modele, duree_ms: duree };
}

/** La voie native Ollama: seule a porter la voie `images` des factures. */
async function sonderOllama(cible) {
  const t0 = Date.now();
  const base = cible.base.replace(/\/+$/, "");

  let nbModeles = null;
  let modele = cible.modele ?? null;
  const inv = await fetchAvecDelai(`${base}/api/tags`, { method: "GET" }, 5_000);
  if (inv.ok && inv.statut === 200) {
    const corps = await inv.json().catch(() => null);
    const liste = Array.isArray(corps?.models) ? corps.models : [];
    nbModeles = liste.length;
    modele = modele ?? liste[0]?.name ?? null;
  }
  if (modele === null) {
    return { cible: cible.nom, vivant: false, defaut: "MODELES_ABSENTS",
             nbModeles, duree_ms: Date.now() - t0 };
  }

  const gen = await fetchAvecDelai(`${base}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: modele,
      prompt: "Reponds seulement par les quatre caractères: OK12",
      stream: false,
      options: { temperature: 0, num_predict: NB_TOKENS_SONDE },
    }),
  }, DELAI_MAX_MS);
  if (!gen.ok) {
    return { cible: cible.nom, vivant: false, defaut: gen.motif, nbModeles,
             modele, duree_ms: Date.now() - t0, detail: gen.detail };
  }
  if (gen.statut !== 200) {
    return { cible: cible.nom, vivant: false, defaut: `HTTP_${gen.statut}`,
             nbModeles, modele, duree_ms: Date.now() - t0 };
  }
  const corps = await gen.json().catch(() => null);
  const texte = corps?.response;
  if (typeof texte !== "string") {
    return { cible: cible.nom, vivant: false, defaut: "REPONSE_INVALIDE",
             nbModeles, modele, duree_ms: Date.now() - t0,
             detail: "corps.response absent" };
  }
  if (texte.trim().length < LONGEUR_MIN_TEXTE) {
    return { cible: cible.nom, vivant: false, defaut: "GENERATION_MUETTE",
             nbModeles, modele, duree_ms: Date.now() - t0 };
  }
  const duree = Date.now() - t0;
  if (duree > DELAI_MAX_MS) {
    return { cible: cible.nom, vivant: false, defaut: "DELAI_DEPASSE",
             nbModeles, modele, duree_ms: duree };
  }
  return { cible: cible.nom, vivant: true, nbModeles, modele, duree_ms: duree };
}

function construireCibles(argv) {
  // Les cibles viennent des arguments, pas d'une liste inventee ici.
  //   --cible nom|style|base[|modele]   (repetable)
  const cibles = [];
  for (const a of argv) {
    if (!a.startsWith("--cible=")) continue;
    const [nom, style, base, modele] = a.slice("--cible=".length).split("|");
    if (!nom || !style || !base) continue;
    cibles.push({ nom, style, base, modele: modele || null,
                  clef: lireEnv(`CLEF_${nom.toUpperCase().replace(/[^A-Z0-9]/g, "")}`, "") });
  }
  return cibles;
}

const cibles = construireCibles(process.argv.slice(2));
if (cibles.length === 0) {
  console.log("SONDE_FOURNISSEUR: AUCUNE_CIBLE");
  console.log("usage: node scripts/sonde-fournisseur.mjs --cible=nom|openai|http://hote:port[|modele]");
  process.exit(2);
}

const resultats = [];
for (const c of cibles) {
  resultats.push(c.style === "ollama" ? await sonderOllama(c) : await sonderOpenAI(c));
}

let rouges = 0;
for (const r of resultats) {
  if (!r.vivant) rouges += 1;
  const flags = [
    `cible=${r.cible}`,
    `vivant=${r.vivant ? "OUI" : "NON"}`,
    r.defaut ? `defaut=${r.defaut}` : null,
    r.nbModeles === null ? "inventaire=lisible-non-juge" : `modeles=${r.nbModeles}`,
    r.modele ? `modele=${r.modele}` : null,
    `duree_ms=${r.duree_ms}`,
    r.detail ? `detail=${r.detail}` : null,
  ].filter(Boolean).join(" ");
  console.log(`SONDE ${r.vivant ? "VERT" : "ROUGE"} ${flags}`);
}
console.log(`SONDE_FOURNISSEUR: ${rouges === 0 ? "VERT" : "ROUGE"} (rouges=${rouges}/${resultats.length})`);
process.exit(rouges === 0 ? 0 : 1);
