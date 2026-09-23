## Sprint 14.b - la voie bulk de l'auditeur : un 404 cru en succes, et deux ancres devenues ambigues (23 sept.)
Le 404 de l'audit (C3) n'etait pas une panne du serveur : c'etait une route
qui n'existait pas. src/components/InventoryAudit.tsx:156 poste { items } a
POST /api/inventory/bulk ; src/routes/inventory.ts ne declaroit aucune route
de ce nom. Express repond 404, et l'auditeur affichoit un succes.

IMPLANTATION au contrat TOUT-OU-RIEN (src/routes/inventory.ts), dans le MEME
commit que les portes :
- rien n'est ecrit si une seule ligne est refusee (pas de lot a demi-inporte) ;
- chaque refus est nomme ligne:champ (ex. 1:quantity), jamais un compte sec ;
- relecture en base apres ecriture : ce que la route affirme avoir ecrit est
  relu chez elle, et la reponse porte le nom des entrees reellement en base ;
- memes regles de forme que le POST d'unite (source UNIQUE des regles de
  forme, helpers partages : statutDeparse, les bornes de quantite et minimum).

DEUX PORTES BRANCHEES dans le MEME commit (regle 6 : package.json ET le
DEFAUT de scripts/run-all-gates.py) :
- verify:inventory-bulk -> 12 verdicts sur SERVEUR REEL, 12/12 ;
- verify:inventory-bulk-mord -> 7 mutations, 7/7 MORDENT, chacune nommant le
  verdict qu'elle vise ; ancrage unique verifie sur les OCTETS avant playback.

PITFALL CONSIGNE. Reproduce mot pour mot l'idiom de validation du statut du
POST d'unite a rendu DEUX ancres du harnais soeur
negative-test-post-inventory-contract.py AMBIGUES : MOTIF AMBIGU (2 vus, 1
attendu), 9/11 seulement. Le harnais soeur est passe au rouge PAR CE GESTE et
sans aucun rapport avec la fonction bulk : ces harnais ancrent par SOUS-
CHAINE (src.count(motif)), donc la copie d'une voie bulk fait passer une
ancre mono-ligne de 1 a 2 vues. Remede dans la convention DEJA etablie de ces
fichiers (M5/M6/M7/M9) : etendre l'ancre d'une ligne de contexte
(refus.push("status")) jusqu'a la rendre unique, puis verifier l'INDEX de la
trouvee pour prouver qu'elle ne mute que la soeur visee. Le capteur qui
tranche est le CHARGEUR DE MODULE (importlib.util + getattr(mod,MUTATIONS)),
JAMAIS un regex maison : un regex mal forme rend 0 mutations et sourit (faux
negatif). Ne jamais affaiblir le harnais (< 2) ni retoucher l'indentation de
la copie pour esquiver la collision : ce seroit falsifier la mesure pour
contenter l'observation.

C2 RE-MESUREE sur ce HEAD (re-mesurer, pas heritage) : 58 routes mutables
(57 a la campagne + la bulk) et requireAuth 0 occurrence dans src/. La bulk
est la 58e sans garde d'identite : la voie que j'ai ouverte elargit la surface
non garde d'une unite. Le verrou d'identite reste l'article 1 des articles
ouverts de l'audit ; cela ne se regle pas par la voie bulk.

TRACE. Commit 3809b1b (7 fichiers, +610/-24). Le sceau du journal
(decouper-phases.py --check) a D'ABORD ROUGI contre un Append direct dans
l'archive gelee du Sprint 14 : VERDICT anti-perte: ECHEC. Le sceau avait
raison : une archive de sprint est immuable. La voie sanctionnee est l'AJOUT
d'une archive + son stub, puis le RECALCUL de l'ancre par la boucle du juge.
