#!/usr/bin/env bash
# Matrice des fuseaux pour la porte D1 (test/e2e/dashboard-contract.spec.ts:115).
#
# POURQUOI QUATRE FUSEAUX, ET PAS UN SEUL. Le defaut est LATENT. A bornes
# DONNEES, generateDates() est independent du fuseau (prouve par
# scripts/juge138.mjs joue dans quatre fuseaux: les quatre tableaux sont
# IDENTIQUES). Le defaut est dans le CALCUL DES BORNES de cost-data
# (src/routes/dashboard.ts:118-119) qui emploie toISOString() -- donc UTC --
# pendant que le spec attend la date du jour en COMPOSANTS LOCAUX (l.60-63).
# Les deux ne coincident que si l'instant courant porte la MEME date en local
# et en UTC. Un run unique ne dit donc pas si un VERT est une reussite ou une
# fenetre NON-DIVERGENTE ou la porte ne peut rien juger: c'est le piege
# consigne du depot (« une porte ne prouve que la voie qu'elle arpente »).
#
# Le choix des quatre fuseaux est CALCULE, pas arbitraire:
#   UTC              temoin NON-divergent par construction (doit rester VERT)
#   Europe/Paris     le fuseau du client (CEST: divergent entre 00:00 et 02:00)
#   Asia/Tokyo       UTC+9  -> divergent dès que l'heure UTC >= 15
#   Pacific/Honolulu UTC-11 -> divergent dès que l'heure UTC <  13
# Les deux derniers se recouvrent: tout instant de la journee tombe dans au
# moins une de leurs fenetres divergentes. La matrice ne depend donc pas de
# l'heure auquel on la declenche.
#
# LE CAPTEUR DE FUSEAU EST PRUVE VIVANT AVANT LE PREMIER VERDIT (regle 2
# d'AGENTS.md): un date +%F rendu sous TZ. Il doit rendre DEUX dates
# DIFFERENTES sur deux fuseaux connus pour diverger a l'instant ou on tourne.
# S'il rend la meme date partout, il est MORT et la matrice ne vaut rien.
#
# La porte jouee est celle du depot, telle quelle (package.json:69), filtree
# sur le seul nom du test: aucun parseur de resultat n'est reimplemente ici.
set -u
cd /home/clausake/cookdrive-project || exit 2

echo "== instant dujugateur: $(date -u +'%Y-%m-%dT%H:%M:%SZ UTC')"

# --- le capteur doit d'abord prouver qu'il VOIT la divergence --------------
t1=$(TZ=UTC                date +%F)
t2=$(TZ=Pacific/Kiritimati date +%F)   # UTC+14: toujours en avance d'un jour
if [ "$t1" = "$t2" ]; then
  echo "CAPTEUR_MORT=1 (UTC=$t1 et Kiritimati=$t2 rendent la meme date: impossible)"
  echo "La matrice ne peut rien juger; abstention."
  exit 3
fi
echo "CAPTEUR_VIVANT=1  UTC=$t1  Kiritimati=$t2  (le capteur voit la divergence)"

# ⚠ Le rc est capture DIRECTEMENT, pas a travers un pipeline: en bash le $?
# d'un pipeline est celui du DERNIER maillon, donc un grep qui filtre bien
# ferait rendre rc=0 a une porte ROUGE (et ${PIPESTATUS[0]} est du zsh, pas
# du bash: sous `set -u` il aborterait la boucle entiere). Les sorties vont
# dans un fichier, le rc se lit dans la variable, et le fichier est relit.
OUTDIR="test/tmp-matrice-fuseaux"          # gitignore (test/tmp-*/)
mkdir -p "$OUTDIR" || exit 2
rouges=0
divergentes=0
jouees=0
# ⚠ Le JEU DE FUSEAUX N'EST PAS UN GOUT ESTHETIQUE. juge-couverture-fuseaux-d1.py
# balaie les 24 heures d'un jour UTC et compte les heures ou AU MOINS un
# fuseau du jeu diverge de UTC. Le jeu historique (UTC, Paris, Tokyo,
# Honolulu) rend COUVERTURE=19/24: entre 10Z et 14Z, ces quatre rendent
# tous la MEME date -- la matrice y dirait VERT sans RIEN mesurer (angle
# mort consigne au vert, exactement le piege que la regle 2 d'AGENTS.md
# interdit). Il en faut DEUX aux deux bouts pour fermer le cercle:
# Etc/GMT+12 (mesure UTC-12 par le noyau, jamais devine) couvre les heures
# creuses du matin UTC, Pacific/Kiritimati (UTC+14) celles de l'apres-midi.
# Mesure, non suppose: sans Kiritimati le juge rend COUVERTURE=21/24,
# HEURES_NUES=[12,13,14] -- trois heures ou la matrice dirait VERT sans RIEN
# mesurer. La liste est relue par le juge A CHAQUE EXECUTION (c'est ICI
# qu'est sa source unique): un drift vers un sous-jeu muet est rouge.
for tz in UTC Europe/Paris Asia/Tokyo Pacific/Honolulu Etc/GMT+12 Pacific/Kiritimati; do
  local_date=$(TZ="$tz" date +%F)
  utc_date=$(TZ=UTC date +%F)
  if [ "$local_date" = "$utc_date" ]; then diver=0; else diver=1; fi
  nom=$(printf '%s' "$tz" | tr '/' '_')
  log="$OUTDIR/$nom.log"
  echo "----------------------------------------------------------------"
  echo "TZ=$tz  local=$local_date  utc=$utc_date  DIVERGENT=$diver"
  # ⚠ le motif est passe en `--grep=D1` (UN seul jeton, sans espace): en
  # `--grep "D1 "`, npm decape l'argument et Playwright peut lire "D1" comme
  # un motif valide mais le reste du nom; avec un motif qui ne matche AUCUN
  # test, Playwright rend "0 tests" et rc=0 -- un faux PASS. Le motif "D1"
  # est non-ambigu (les autres tests de la spec sont D2..D5, S1, S2).
  TZ="$tz" npm run verify:dashboard --silent -- --grep=D1 > "$log" 2>&1
  rc=$?
  jouees=$((jouees + 1))
  [ "$rc" != 0 ] && rouges=$((rouges + 1))
  [ "$diver" = 1 ] && divergentes=$((divergentes + 1))
  grep -E '[0-9]+ (passed|failed)|Error:' "$log" | sed "s|^|  [$tz] |"
  echo "  [$tz] D1_RC=$rc  octets_log=$(stat -c%s "$log" 2>/dev/null || echo 0)"
done
echo "================================================================"
# Le compte est DERIVE de la boucle, jamais recopie a la main: un `4` fige
# qui survit a l'ajout d'un cinquieme fuseau annoncerait 4 zones jouees
# quand le fichier en joue 5 -- un mensonge dans la seule ligne que l'humain
# lit du verdict.
echo "MATRICE: zones_jouees=$jouees rouges=$rouges zones_divergentes=$divergentes"
if [ "$divergentes" = 0 ]; then
  echo "VERDIT=MATRICE_MUETTE: aucune zone divergente a l'instant dujugateur."
  echo "Un vert ici ne serait PAS une reussite mais une absence de mesure;"
  echo "rejouer dans le creneau divergent (voir juge-couverture-fuseaux-d1.py)."
  echo MATRICE_NON_PRONONCEE
  exit 4
fi
if [ "$rouges" != 0 ]; then
  echo "VERDIT=ROUGE ($rouges zone(s) en echec) -- logs dans $OUTDIR/"
  echo MATRICE_TERMINEE
  exit 1
fi
echo "VERDIT=VERT ($divergentes zone(s) divergente(s) ont juge la porte D1)"
echo MATRICE_TERMINEE
