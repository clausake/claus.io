====================================================================
        claus.io — AGENT CULINAIRE OS — GUIDE DE LANCEMENT LOCAL
====================================================================

Deux façons de lancer l'application, selon ce que vous avez téléchargé
depuis les Releases GitHub (https://github.com/clausake/claus.io/releases).

--------------------------------------------------------------------
A. L'INSTALLEUR (le plus simple, rien à installer d'autre)
--------------------------------------------------------------------

1. Télécharger claus.io.Setup.0.1.x.exe (Windows), claus.io-0.1.x-arm64.dmg
   (Mac Apple Silicon), ou le .AppImage / .deb (Linux).
2. Lancer l'installeur.
   - Windows : « Informations complémentaires » -> « Exécuter quand même »
     (l'application n'est pas signée par un certificat commercial).
   - macOS   : clic droit -> Ouvrir la première fois (non signée).
3. Ouvrir claus.io depuis le menu Démarrer / Applications.
   La fenêtre affiche l'application : le serveur démarre tout seul et la
   base est créée dans votre dossier de données utilisateur.

Il n'y a PAS besoin de Node.js pour cette voie.

--------------------------------------------------------------------
B. LE DOSSIER ZIP (développement / exécution depuis les sources)
--------------------------------------------------------------------

Prérequis : Node.js 22 ou plus — https://nodejs.org/ (version LTS).

1. Extraire le ZIP ENTIER (ne pas lancer depuis l'aperçu du ZIP de Windows :
   les fichiers ne seraient pas tous là).
2. Double-cliquer sur LANCER_APPLICATION.bat
   (ou LANCER_APPLICATION.ps1 si vous préférez PowerShell).

Le script fait, dans cet ordre :
   - vérifie Node.js et package.json ;
   - installe les librairies si besoin (npm install --include=dev) ;
   - compile l'interface si besoin (npm run build) ;
   - démarre le serveur et ouvre http://localhost:3000.

Premier lancement : 3 à 10 minutes (téléchargement des librairies).
Les fois suivantes : quelques secondes.

--------------------------------------------------------------------
C. SI ÇA COINCE
--------------------------------------------------------------------

« 'vite' n'est pas reconnu en tant que commande interne ou externe »
   -> node_modules est incomplet (installation interrompue) ou a été installé
      avec NODE_ENV=production, ce qui saute les devDependencies (vite, tsx).
      Correctif appliqué dans le .bat / .ps1 fournis : supprimer node_modules
      puis relancer le script.

« Node.js n'a pas été détecté »
   -> installer Node.js LTS, FERMER la fenêtre, relancer le .bat.
      (Un terminal ouvert avant l'installation ne voit pas le nouveau PATH.)

Fenêtre « Not Found »
   -> c'était un défaut de l'installeur 0.1.0 : le serveur cherchait son
      dossier dist dans le dossier courant au lieu de l'archive de
      l'application. Corrigé depuis (src/services/chemin-ressources.ts) ;
      télécharger l'installeur 0.1.1 ou plus récent.

Le port 3000 est occupé
   -> fermer l'autre application, ou lancer avec un autre port :
      sous Windows :  set PORT=3001 && npm start
      sous Linux/Mac : PORT=3001 npm start

Logs
   - voie ZIP : tout s'affiche dans la fenêtre du .bat.
   - voie installeur : les traces du serveur vont dans la fenêtre Electron
     (menu Affichage -> Outils de développement -> Console).

====================================================================
Bonne cuisine avec votre Agent Culinaire OS !
====================================================================
