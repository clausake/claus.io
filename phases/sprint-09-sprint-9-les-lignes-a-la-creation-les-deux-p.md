## Sprint 9 - Les lignes a la creation: les DEUX portes restantes de `document_items` (13 sept.)

### 9.1 La carte des routes jugees avait un angle mort, et il etait GROS

Le Sprint 8 avait apprime a faire la carte des routes jugees en comparant les
chemins declares de `src/routes/*.ts` aux chemins cites dans `test/e2e/`. Cette
carte rendait `documents.ts` "couvert": le spec `documents-validate.spec.ts`
joue `POST /api/documents` avec **une ligne PARFAITE** et verifie que le
document sort. Il nomme donc le chemin dans le texte du spec, et la carte le
croit juge.

Le premier calcul de ce sprint a rendu une liste de cinq chemins "sans spec";
**quatre etaient des faux positifs** (couverts ailleurs, regex inadaptee aux
gabarits). Le cinquieme, `POST /api/purchasing-flow/...`, etait reel. Et
surtout: **etre cite dans un spec ne veut pas dire etre juge**. La porte
`POST /api/documents` etait citee en acceptant `quantity: "beaucoup"`,
`unit_price: "abc"`, `inventory_id: "cle-inexistante"` et `items: {}`.

La lecon se consigne: **la carte des routes jugees doit etre jugee au CONTENU
des assertions, pas a la presence du chemin dans le spec.** Une route "couverte"
par un seul cas nomimal est une route non couverte avec un compte-rendu
rassurant.

### 9.2 Ce que la sonde a rendu AVANT (fait, pas raisonne)

`node scripts/probe-document-items-voices.mjs`, sur l'instance reelle:

| Entree | Avant | Sens du defaut |
|---|---|---|
| `quantity: -5` | `200`, ligne ecrite **`-5`** | solde et total partent en negatif |
| `quantity: "beaucoup"` | `200`, ligne ecrite **`0`** | commande perd 3 douzaines SANS message |
| `unit_price: "vingt-cinq"` | `200`, prix **`NULL`** | facture amputee; et `unit_price` sert DEUX usages (prix facture / tarif propose) |
| `inventory_id: "cle-qui-n-existe-pas"` | `200`, ligne **orpheline** | rien ne dit que le prix n'a jamais pu etre repris |
| `quantity: "  "` / `""` | `200`, prix **`0`** (le vide devient gratuit) | l'UI faisait `parseFloat(x)||0` AVANT d'envoyer |
| `total_amount: "mille deux"` | `200`, total **`0.00`** | le document est VERT et fausx |
| `items: {}` (non-tableau) | **`500`** | un payload mal forme de l'app peut tuer le travial du chef |

Le cas le plus cher n'est pas la 500: c'est `beaucoup -> 0`. Il produit un
**200** avec un document vert, une ligne a zero, et aucun moyen, cote chef, de
savoir que la facture ne dit pas la verite.

### 9.3 Le contrat (et pourquoi il n'est PAS un rejet sec)

Le patron du depot est le "triade" du Sprint 7 (`import-confirm`): ce qui ne
passe pas est **nomme a la reponse**, pas perdu. Mais les lignes de document
portaient DEUX contrats consignés que le patron du Sprint 7 ne peut pas
ecraser:

- **V2**: une ligne au prix inexpleitable doit SURVIVRE en base et etre nommee
  par `/validate` (`prix_non_exploitables`).
- **V3**: la valeur brute doit rester en base telle quelle.

Le premier brouillon de `jugerLignesDeDocument` jetait la ligne (400 sec). C'eut
ete un regress de contrat, et il eut ete invisible: les 84 tests jouaient la
voie nominale. Le contrat final:

1. la ligne **reste**; seul le champ inexpleitable se neutralise,
2. le **BRUT est conserve** dans `unit_price_brut` (nouvelle colonne,
   `ensureColumn`) pour que `/validate` puisse encore la nommer AVEC la valeur
   lue,
3. un prix neutralise **n'ecrase plus le tarif de reference** de l'article (le
   piege du `NULL` silencieus de node-sqlite3: `unit_price: null` dans le `SET`
   aurait efface un prix sain),
4. le quantite invalide est **refusee** (`400`): une ligne a `0` est une
   ligne-mensonge, et une ligne negative est un solde fausx — la, le triad
   cede la place au refus sec parce qu'il n'existe pas de "quantite brute"
   exploitable plus tard,
5. `items` non-tableau -> `400` et non `500`, et la transaction est **annulee**:
   `items` etant un champ OPTIONNEL, l'ancien code laissait vivre le document
   SANS lignes (defaut G).

La clef `inventory_id` est jugee **contre la base** et non contre la forme:
l'app envoie des clefs qui ont pu sortir de l'inventaire depuis la commande,
et l'app sait deja afficher ces lignes-la ("article sorti de l'inventaire
depuis la commande"). Un rejet sec eut casse le flux du chef.

### 9.4 La porte que personne ne regardait: le parse cote CLIENT

`DocumentManager.tsx` faisait:

```ts
quantity: parseFloat((item.quantity as any)?.replace(",", ".") ?? "") || 0,
unit_price: parseFloat((item.unit_price as any)?.replace(",", ".") ?? "") || 0,
```

Trois defauts dans une ligne:
- `|| 0`: le **vide devient gratuit** (0, pas "pas de prix"),
- `parseFloat`: du texte devient 0,
- le `replace(",", ".")` est **cote UI**: une autre voie d'appel (et la sonde)
  n'a pas cette conversion et casse.

Corrigé: **les champs partent bruts**, la conversion francaise (`2,5`) vit
desorais dans le serveur (`nombreDecimal` accepte les deux ecritures), et
l'UI n'invente plus jamais un `0`. C'est le meme enseignement que le Sprint 8
("la clef du serveur est un contrat, pas une convention"): la validation qui
vit dans le composant n'est pas une validation, c'est une habitude.

### 9.5 Preuves

- `npx tsc --noEmit`: **0 erreur** (verifie par octets: fichier de log de
  0 octet, `TSC_RC=0` au reel — un `TSC_RC=1` rendu au meme instant etait le
  rendu corrompu d'un resultat perime, d'ou la regle "trancher par les octets
  du fichier de log, jamais par le rendu").
- `test/e2e/document-items-contract.spec.ts`: **7/7** (K1 huit saisies, K2
  solde non-vide, K3 clef absente, K4 melange/partial, K5 total + `items`
  non-tableau, K6 negative, K7 orphelines + non-regress de la chaine d'achat).
- `scripts/negative-test-document-items.py`: **12/12 mutations MORDENT**.
  Quatre groupes joues en parallele par fichier source; les groupes qui
  touchent `documents.ts` portent le verrou d'instance (`instance-guard.mjs`,
  `EADDRINUSE` -> mort) parce qu'un fils residuel rend un PASS rendu par
  l'instance d'un autre.
- Suite existante rejouee apres le changeement: `73/73` unitaires, `84/84`
  e2e, `npm run build` vert, sonde `probe-document-items-voices.mjs` verte.
  **Aucun des 157 tests consignes n'a bouge**: le contrat nouveau n'a casse un
  seul verdict precedant (V1-V6 du validateur, G de la chaine d'achat).
- Trois portes au manifeste: `verify:document-items`,
  `verify:document-items-mord`, et le contrat `verify:document-items-voices`
  (celui-ci etait dans `DEFAUT` sans etre dans les `scripts` du manifeste).

### 9.6 Pieges traverses (ce qui a menti pendant le sprint)

- Le **poste corrompt le rendu** et **rogne les emissions longues**: deux
  versions d'un patcheur ont ete ecrites "a l'air correctes" dans le rendu et
  etaient cassees sur le disque. Trancher par `sha256` + compteurs de motifs
  dans le kernel, jamais par ce qui s'affiche.
- Le **patcheur a flou-matche** trois sites d'un seul coup (`|| 0` / `?? ""` /
  `parseFloat`) et a introduit du faux dans trois fichiers. D'ou: substitutions
  par **chaine exacte verifiee** (`count == 1`) dans un script, et jamais le
  flou-matching pour une zone qui porte un contrat consigne.
- Un "editeur concurrent" accuse a tort: `diag-manifeste.py` a prouvé que
  `package.json` etait **identique a HEAD** — c'etait MA propre insertion
  fautive (virgule trainante avant `}`), et le rendu "manifeste en place:
  3 CLES ALIGNEES" etait un compte-rendu que je n'avais jamais joue. La garde
  d'abention du script a empedché l'ecrasement; la regle d'attribution a du
  etre corrigee DEUX fois (mes lignes ajouteses etaient declarees
  "etrangeres"). **Une mesure qui contredit un verdict consigne se re-mesure;
  le script n'avait pas raison de rester faux pour me contenter.**
- La garde des caracteres a refuse `0xFE0F`: c'etait un selecteur de variation
  **preexistant** (les `⚠` des textes FR). Elle controlait l'heritage du
  fichier au lieu de ce que j'ecris. Corrigee en: verifier mes lignes inserées
  + exiger qu'aucun caractere anormal ne soit INTRODUIT.

### 9.7 Ce qui reste ouvert (consigne, pas oublie)

- La voie `PUT /api/documents/:id` et `PATCH` (modification d'un document
  existant) partagent-elles le module? A verifier par la carte au CONTENU, pas
  par la presence du chemin dans un spec.
- Les lignes "orphelines legitimes" (article sorti de l'inventaire depuis la
  commande) sont rendues visibles par l'app; elles ne sont PAS encore un etat
  nomme dans `/validate`.
- La porte `POST /api/purchasing-flow/{id}/to-supply` (deuxieme porte) est
  gardee par le MEME module; elle n'a pas son propre spec de contrat — seule
  sa mutation `P1 bis` prouve qu'elle est reliee, pas qu'elle est jugee dans
  ses details.

