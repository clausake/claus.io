## Sprint 11 - HACCP: deux regles que le produit laissait au client, et un harnais qui contamine ses propres bras (16 sept.)

**Ouvreur:** une autre session du meme projet a ecrit le contrat HACCP
(`test/e2e/haccp-contract.spec.ts`, 8 CHEMINS C1..C8) et les deux tests de
`routes.spec.ts` (guide LFS, `agent/command`). Ce qui etait dans l'arbre etait
VERT mais NON JOUE: aucun gate ne citait le spec HACCP, aucune morsure
n'existait, et deux des assertions du spec rougissaient sur le PRODUIT. Ce
chat-la a: joue les rouges, tranche produit-vs-harnais, pose les portes, et
solde une assertion qui n'etait pas portee par le code.

### 11.1 Les deux rouges etaient le produit, pas le harnais

| # | Ce qui etait rendu | Ce qui a ete exige |
|---|---|---|
| T1 | `POST /api/haccp/temperature` laissait le **client** declarer `entry_type`/`sensor_mode` | 400 nomme quand l'appelant les PORTE; la provenance est declaree par le serveur (`manuel`/`online`) |
| T2 | `POST /api/haccp/batches` faisait `dateISO(...) ?? lireTexte(..., 40)` | plus de repli TEXTE sur une date de registre |

Pourquoi ce n'etait pas de la decorative, juge par les EMETTEURS (non par l'UI):
- T1: `Haccp.tsx` L263-271, l'unique emetteur de cette route, n'envoie NI
  l'un NI l'autre. Une saisie de clavier signee `iot` faisait donc passer une
  frappe pour une trace machine — et le badge IoT de `Haccp.tsx:821` le
  affichait comme une preuve automatique. La voie d'ingestion reelle a sa
  PROPRE route (`POST .../webhook/iot-report`), qui signe `iot`: la voie
  humaine na pas a recevoir la clef du mensonge. Le 400 (et non l'ignore
  silencieux) est le seul signal qu'une usurpation ou qu'un bug client est arrive.
- T2: `HaccpModules.tsx` poste `dlc` et `dlc` est AUSSI populate par l'OCR
  (`if (data.dlc) setDlc(data.dlc)`), done par une sortie d'IA au format non
  controlle. La colonne est un TEXT compare lexicographiquement: un
  `31/12/2030` y vivait sans bruit et rendait le tri muet.

### 11.2 M7: un angle mort du CONTRAT, pas des donnees

`verif` rendait 11/12, `M7` (retirer la confrontation `SELECT id FROM
inventory WHERE id = ?`) faisait `NE_MORD_PAS`. Cause lue dans les octets: le
seul cas de C3 etait `inventory_id: "UNKNOWN"`, happe par la regex de
`clefEtrangere` AVANT la table — donc la branche etait **inexercee par le
contrat lui-même**, et la ligne `fantome` (ecrite puis avalee par le JOIN
interne de `GET /api/haccp/batches`) passait. Le piege: cette forme de
silence ressemble en tous points a un harnais faible. Correctif: un cas
`clef bien formee mais absente de inventory` + `aucune ligne fantome ecrite`.
M7 MORD desormais (12/12).

### 11.3 Trois defauts d'HARNAIS qui m'etaient propres, trouvés par mes portes

| Defaut | Ce qu'il rendait | Ce qui la dit |
|---|---|---|
| copie de la copie isolee en LISTE BLANCHE de fichiers (package.json, server.ts, tsconfig…) | serveur mort au demarrage: `ERR_MODULE_NOT_FOUND /…/epicure` | le **témoin** sans mutation etait rouge; sans lui j'aurais rendu « 0 morsure prononcee » pour une raison d'infrastructure. Remplace par TOUS les fichiers racine |
| `retablir()` ne restaurait que le fichier de l'iteration courante | 3 faux `MORD_AVEC_BRUIT` (M8 survit dans M9; M9, qui mute le module PARTAGE `haccp-fields.ts`, survit dans M10/M11) | ces trois bruits etaient MES FILS, pas le produit. La premiere lecture « le contrat touche deux regles » etait fausse des deux tiers |
| compteur d'accolades avec toggle de chaine | solde +1 sur un bloc equilibre; deux `ABSTENTION` avant que `tsc` juge | les apostrophes francaises (`n'est pas` … `n'a ete`) AVALEMENT tout entre elles et masquent six accolades. Verifie en rejouant les deux variantes du compteur |

Loi qui en sort: **un harnais doit retablir TOUS ses bras mutables avant chaque
cas, et son temoin doit etre vert avant qu'un seul verdict soit prononce.** Une
contamination entre bras rend des verdicts faux et parfaitement lisibles.

### 11.4 La carte du script de verdit etait fausse (une classe deja consigne, forme inverse)

`scripts/verif-sprint11-haccp.py` jugiait le « contrat » d'une route par
`src.find('"<chemin>"')` SANS la methode. Pour un chemin porte par un GET et
un POST (`iot-sensors`, `cleaning`, `batches`), le premier match est le GET —
qui na pas de contrat — et le POST contracte etait declare non contracte.
Verdit rendu: `routes_contractees=6/7`, la verite est `7/7`. C'est exactement
la faute du 09/09 (« une carte jugee sur le NOM d'un chemin ») dans son autre
sens: celle-ci mentait dans le sens ALARMISTE, aussi couteuse. Corrigee: span
par (METHODE, CHEMIN). Le meme script a recu DEUX ancres de plus (M9/M10) pour
les regles de 11.1, quelles ne voyait pas du tout.

### 11.5 `agent/command`: un echo vendu comme une extraction (solde)

Les tests de `routes.spec.ts` exigeaient un contrat que le code ne portait
pas. Relu a l'octet: pour chaque ligne du panier, `status: "Navigation B2B
effectue"` + un `found_price` egal au prix QUE L'APPELANT venait d'envoyer, et
un `claus_analysis` qui affirmait « extraits en direct ». Le seul navigateur
lance faisait une attente de deux secondes puis se refermait — et c'est CE
launch qui rendait la route injouable sur un runner sans display (piege consigne
plus haut) alors que la route ne navigue pas. `carts: []` repondait `success`.
Lunique consommateur (`src/lib/helpers.tsx`, `gerer_flux_culinaire`) poste un
panier DEJA prix et n'affiche que `claus_analysis`: aucune extraction na
ete perdue. Rendu: `mode: "SIMULATION"`, `verified: false`,
`source: "echo-input"`, `found_price: null`, 400 + `refused: ["data.carts"]`
sur zero ligne, et le `catch` qui repond 500 est CONSERVE (une erreur serveur
doit rester une erreur serveur). Un mensonge qui dit son nom vaut mieux qu'un
mensonge qui s'ignore.

### 11.6 Preuves LIES (et non inferrees)

```
npx tsc --noEmit                        log de 0 octet (rc=0)
npx vitest run                          73 passed (6 fichiers)
npx playwright test                     101 passed (dont les 8 CHEMINS C1..C8)
npm run build                           build produit
npm run verify:haccp                    8 passed
npm run verify:haccp-mord               TEMONIN vert + 12/12 MORDENT
```

Les deux portes sont dans `DEFAUT` de `scripts/run-all-gates.py` (donc dans
`npm run verify:all`) et dans `package.json`; la liste des portes du lot est
LUE dans `package.json`, jamais recopiee. Les ancres de la morsure vivent dans
`scripts/registre-mutations-haccp.py` (ficher de DONNEES: le poste rogne les
emissions longues et une ancre mal transcrite se presente comme un « ne mord
pas », la faute du 09/09) et chaque ancre est COMPTE sur les octets relus avant
d'etre jugee.

### 11.7 Ouvert, consigne (et non oublie)

- **`POST /api/haccp/scan` est la TROISIEME porte decriture de `batches` et
  elle est hors contrat.** Relu a l'octet (`src/routes/haccp.ts` L168-L195):
  `let inventoryId = "UNKNOWN"`, `lotNumber = "Inconnu"`, `quantity` absent,
  puis `INSERT INTO batches` direct — sans `clefEtrangere`, sans `dateISO`.
  Ces lignes ne remontent JAMAIS dans `GET /api/haccp/batches` (JOIN interne):
  c'est la classe exacte du defaut T2/Sprint 7 (« une colonne a TROIS portes,
  une seule gardee »), consignee ici faute de fixture: la route exige Ollama
  (relue: `400/415/500` sans modele), donc `C8` ne peut que verifier quelle
  SURVIT. Juger cette porte demande un faux modele Ollama ou linjection de la
  sortie — a poser avec son fixture, pas en relachant la porte de `batches`.
- Les chemins de lecture `documents/upload` (voie multer) et `scan` restent
  NOMINAUX: ils ne sont pas juges, seulement declares vivants par C8.
- `verify:all` est lance avec les deux nouvelles portes; son etat doit etre lu
  dans sa sortie, pas deduit de 11.6.
- Reproduction CI: le runner GitLab est x86_64, `binfmt/qemu` non enregistre
  sur ce poste → le delta d'architecture reste **non testable ici** (piege
  deja consigne).


