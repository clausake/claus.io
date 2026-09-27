# La banque de factures reels du chef (Tache 11)
#
# Deposer ici 10 a 20 factures reelles (png/jpg/pdf converti) avec leur
# `.attendus.json` jumeau (les sept champs, cf. facture-synthetique.attendus.json).
# Ces pieces portent des prix et des noms de fournisseurs : elles restent
# HORS GIT (.gitignore). Le juge `scripts/juge-ocr.py` les joue par moteur,
# piece par piece. Tant que le repertoire est vide, le juge ne joue QUE la
# facture synthetique — et le dit : aucun moteur ne peut etre declare « pret »
# sur la seule synthetique (contrat, etape 3).

## Les pieces publiques versees le 27/09 (essai du juge sur pieces reelles)

Source : le jeu public `mouadhamri/invoice_dataset` (github, 9 modeles x 100
factures facturees). Le sol (`.attendus.json`) est construit par
`~/.hermes/cache/scratch/factures-src/preparer-banque.py` : l'arithmetique du
contrat filtre d'ABORD les pieces (qte x pu, Σ==HT, HT+TVA==TTC) — le XML du
jeu portoit un `total_amount` faux sur model_1, la garde l'a ecartee — puis
les valeurs sont lues des ANNOTATIONS humaines `.tsv` du jeu (label
TOTAL_UNTAXED/TAX_AMOUNT/TOTAL_AMOUNT/SUPPLIER/INVOICE_*). Le champ SIRET est
`ABSENT DE LA PIECE` : ces factures n'en portent pas, le juge le nomme NA
(compter MANQUE falsifierait le score). Ces pieces sont un ENTRAINEUR : les
factures du chef (fournisseurs reellement factures) restent le vrai banc.
