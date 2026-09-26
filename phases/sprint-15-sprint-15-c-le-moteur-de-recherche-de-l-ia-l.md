# Sprint 15.c - le moteur de recherche de l'IA locale, et la porte au jumeau deterministe (26 sept.)

## Ce qui est consigne

Tache 8 du contrat Sprint 15 : le serveur LLM local livre avec l'app. Le parti
est celui du contrat (point 2) : AUCUN binaire de 100 Mo embarque. Le livrable
livre le MOTEUR DE RECHERCHE — `src/shared/fournisseur/serveurs-locaux.ts`
detecte les serveurs sur les ports d'usage (11434 Ollama, 8080 et 1234
llama.cpp) par `GET /v1/models` et les rend au menu des Reglages (tache 9).

Mesure de l'existant sur CE poste (26/09, commande jouee dans le tour) :
llama-server, llama-cli, llama-bench, exllama-server, vllm-server ABSENTS
(`command -v`) ; ollama present, `ollama list` ne rend que l'en-tete (modeles
vides). Le detecteur est donc ecrit pour un poste ou RIEN ne repond — l'etat
normal d'installation. L'outil a main `test/banc/outil-etat-moteur.mjs` a joue
la voie du produit sur le poste : `SERVEURS: [ollama@11434, modeles vides]`,
message nul (le 200 d'Ollama avec inventaire vide est un serveur VIVANT).

Les trois regles du code, chacune mesuree ou licite par une mesure existante :
- un 404 est un serveur VIVANT a inventaire non public (l'etat mesure du
  25/09 sur la liste blanche : un 404 n'est PAS une panne) ;
- la forme de `GET /v1/models` est LUE sans rien presumer (`data[].id`,
  `data[].model`, `models[]` de chaines) — la lecon du spike OCR ;
- rien trouve -> `MESSAGE_AUCUN_MOTEUR` nomme les TROIS voies de recours
  (contrat point 4 : jamais un tableau muet). Les Reglages et l'assistant
  appellent `etatMoteurLocal()`, JAMAIS `detecterServeursLocaux` directement.

## La porte et son jumeau (la regle des portes vivantes)

`verify:serveurs-locaux` (package.json + DEFAUT, les deux, consignes a
l'endroit) joue `test/banc/juge-serveurs-locaux.mjs` : de VRAIS serveurs
`node:http` sur ports ephemeres choisis par l'OS, le VRAI fetch, le code du
detecteur tel quel. Les ports d'usage reels (11434/8080/1234) ne sont JAMAIS
joues par la porte : un serveur qu'un humain lance ou stoppe rend un verdict
qui depend de l'infrastructure d'autrui — c'est un outil a main (l'outil
ci-dessus), pas une porte. Le jumeau deterministe juge la voie ; l'outil
interroge l'etat du jour.

La porte porte DEUX morsures dont le verdict est ecrit d'avance : le muet 500
n'est pas trouve (un detecteur qui compte les muets rougit), et un serveur qui
pend meurt au delai de 1,5 s (mesure : port libre refuse en ~0 ms, serveur
vivant repond en ~5 ms — le delai couvre un demarrage a froid sans trainer).

## Les fautes trouvees en ecrivant les tests (elles sont le travail)

- `as const` sur un message construit par `+` : TS1355 (la assertion ne porte
  que les litteraux). Le message est une donnee du produit, pas un type.
- `.sort()` sans comparateur sur des numeros rend un tri de CHAINES :
  11434 passe avant 1234. Le test qui pretendait ordonner les ports d'usage
  rougissoit sur le test, pas sur le produit. Un tri de numeros se joue avec
  `(a, b) => a - b`.
- Le premier brouillon du juge empilait une abstraction de ports (`dPort`,
  `detecteurSurPorts`, une Map globale) au point de ne plus ressembler a ce
  qu'il jouait. Reecrit droit : un stub = un serveur ephemere, un fetch injecte
  = le lien URL d'usage -> stub. Le juge fait 90 lignes lisibles et 7 verdicts.
