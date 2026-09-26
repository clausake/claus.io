# Sprint 15.d - le panneau Intelligence : le bouton Tester joue la vraie sonde, et la fuite de la clef est fermee au POST (26 sept.)

## Ce qui est consigne

Tache 9 du contrat Sprint 15 : les Reglages visibles. Le panneau
« Intelligence » est dans `src/components/SettingsView.tsx` (la vue qui regle
du produit est ce fichier, pas un `SettingsPanel.tsx` que le contrat nommait
sans qu'il existe) : trois boutons — Local (détecté), Ollama, En ligne — deux
champs (URL, nom du modèle), un bouton « Tester » et un bouton « Enregistrer »
désarmé tant que le verdict est rouge (contrat, etape 3, mot pour mot).

Les regles ne sont PAS recrites dans l'UI. `src/shared/fournisseur/reglage-llm.ts`
porte les fonctions pures — `cibleDuReglage` (du reglage lu a la cible de la
sonde ; une cible impossible est un DEFAUT NOMME : `CHOIX_ABSENT`,
`URL_ABSENTE`, `HORS_LISTE_BLANCHE`, `URL_HORS_LISTE`, jamais une URL vide),
`argvDeCible` (le format mesure `nom|style|base[|modele]`) et
`parseSortieSonde` (une ligne `SONDE VERT|ROUGE ...` par cible ; AUCUNE ligne =
verdict ROUGE — une sonde muette n'est pas une sonde verte). L'UI ne connait
que `FOURNISSEURS_BLANCS` (blanc.ts est pur) : c'est le serveur qui construit
la cible et joue la sonde, jamais l'UI qui rejouerait la regle.

Les routes (`src/routes/settings.ts`) : `/api/llm/tester` construit la cible
depuis les reglages LUS, joue la VRAIE sonde de la tache 5 (le fichier, jamais
un inline) et rend le verdict ; `/api/llm/detecter` rend les serveurs de la
tache 8 avec `AUCUN_MOTEUR_TROUVE` RENDU, jamais cache. Les valeurs de
`llm_choix` sont CELLES du contrat (tache 1) : `llamacpp`, `ollama`, ou le nom
en minuscules du fournisseur blanc — « en ligne » n'est pas une valeur libre.

Les 20 textes du panneau passent par `TRANSLATIONS`, CINQ langues (fr/en/de/
es/it), verifiees par comptage d'occurrences dans le fichier (20 cles x 5),
pas par une relecture de rendu.

## La fuite fermee au POST (anticipee de la tache 12, sans la remplacer)

`POST /api/settings` recevait `req.body` nu : tout champ nomme comme un secret
(`clef_api`, `apiKey`, `token`, `password`...) entrait dans settings.json — et
le GET le rendait. Desormais `estNomSecret()` (nom exact normalise :
minuscules, sans tiret ni souligne) BLOQUE ces champs a l'entree ; ils ne sont
ni ecrits, ni rendus. L'UI n'a aucun champ clef : le texte du panneau dit que
la clef est demandee a la premiere ouverture et rangee dans le trousseau
(Tache 10 + 12, safeStorage). La consigne de la tache 12 reste duable : le
`console.log` des reglages entiers (`settings.ts` du service, ligne 74) sort
toujours a la console — c'est la tache 12 qui la ferme, pas ce commit.

## La porte et sa morsure

`verify:reglage-llm` (package.json + DEFAUT de `run-all-gates.py`, les deux)
joue `test/banc/juge-reglage-llm.mjs` : le VRAI serveur demarre (spawn tsx,
port libre choisi par l'OS, attente ACTIVE sur /health avec le jeton
d'instance — pas un somme a l'aveugle, pas une instance heritee du port), les
reglages passes par la vraie API, et huit verdicts ecrits d'avance dont :

- la forme licite de /api/llm/detecter ({serveurs[], message} ; message nul ou
  AUCUN_MOTEUR_TROUVE, jamais muet) ;
- tester SANS reglage = defaut NOMME (CHOIX_ABSENT), jamais `vivant:true` ;
- LA MORSURE : `?test=muet` force la route a juger une sortie VIDE — elle doit
  rendre `vivant:false`. Sans ce crochet, un parseur qui rendrait « vert » sur
  une sortie vide passerait au vert ETERNELLEMENT (la classe des capteurs
  morts ; c'est la regle « un juge qui ne peut pas rougir ne juge rien ») ;
- hors liste : `groq` est accepte au STOCKAGE (le POST ne juge pas — c'est la
  cible qui rougit) et /tester nomme `HORS_LISTE_BLANCHE`, aucun appel hors
  liste ;
- anti-fuite : un POST avec `clef_api` injecte laisse `clef_api` ABSENT des
  reglages relus.

Mesure du jour sur CE poste : ollama@11434 est VIVANT mais son inventaire est
VIDE (`/api/tags` rend `{"models":[]}`), donc le verdict nominal du juge est
`MODELES_ABSENTS` — un defaut NOMME, ce qui est precisement le contrat. Le
juge accepte vivant OU defaut nomme ; il refuse le muet.

## Les fautes trouvees en ecrivant les tests (elles sont le travail)

- Le premier brouillon de la route faisait `POST /api/settings` en filtre dur
  sur les trois champs `llm_*` : il aurait DETRUIT les reglages existants a
  chaque enregistrement (App.tsx poste l'objet entier a chaque modification —
  mesure dans src/App.tsx:142). Corrige : le corps passe tel quel, seuls les
  noms secrets sont retirés.
- La morsure `?test=muet` etait d'abord ecrite comme un filtre sur la QUERY
  (`FILTRE_TEST(q)`) — elle ne forcait donc RIEN du tout : le juge serait passe
  vert sans que la morsure morde. Corrige : le filtre s'applique a la SORTIE de
  la sonde (`FILTRE_TEST(sortie, q)`), verifie par lecture du fichier.
- Le brouillon de `reglage-llm.ts` inventait la valeur `llm_choix="en-ligne"`
  (une chaine que `ReglageFournisseur` ne connait pas). Aligne sur le contrat :
  « en ligne » est le NOM du fournisseur (openai, mistral, anthropic, cohere,
  deepseek), et le test unitaire le verifie maintenant (`mistral.ai` accepted
  par domaine, `groq` refuse NOMMEEMENT — jamais 0 ni « - »).
- La morsure anti-fuite injecte un marqueur factice (`sk-secret-injecte`) :
  le juge verifie qu'il disparait des reglages relus (`clef_api=undefined`).
  Un juge qui injecterait une vraie clef pour la voir revenir ne prouverait
  qu'une fuite — la valeur du marqueur est ecrite d'avance, absente attendue.
