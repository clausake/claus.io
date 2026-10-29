@echo off
setlocal
title Agent Culinaire OS - Demarrage Automatique
cls

:: NODE_ENV n'est VOLONTAIREMENT pas pose ici.
:: `npm install` lit cette variable : avec NODE_ENV=production, npm ne telecharge
:: PAS les devDependencies — et vite, tsx, esbuild et electron en font partie.
:: C'etait exactement la cause de « 'vite' n'est pas reconnu en tant que commande »
:: au premier lancement : les librairies installees etaient incompletes alors que
:: `npm install` avait rendu 0. NODE_ENV=production est pose plus bas, juste avant
:: `npm start`, seul moment ou il sert (le serveur sert alors dist/ au lieu de vite).

echo ================================================================
echo   Agent Culinaire OS - Assistant de Lancement Automatique
echo ================================================================
echo.

:: 1. Verification de Node.js
where node >nul 2>nul
if errorlevel 1 goto NO_NODE

:: 2. Verification de package.json
if not exist package.json goto NO_PACKAGE

:CHECK_DEPS
:: 3. Dependances : on juge le BINAIRE, pas le dossier.
::    Un node_modules vide ou tronque (installation interrompue) passait le test
::    « if exist node_modules » et cassait la compilation juste apres.
if exist "node_modules\vite\package.json" if exist "node_modules\tsx\package.json" goto CHECK_DIST
echo [INFO] Installation des librairies (vite, tsx, esbuild...).
echo Cette operation prend quelques minutes et necessite internet.
echo.
:: --include=dev : meme si un .npmrc de la machine force la production.
call npm install --include=dev
if errorlevel 1 goto INSTALL_ERROR
if not exist "node_modules\vite\package.json" goto INSTALL_ERROR
if not exist "node_modules\tsx\package.json" goto INSTALL_ERROR
echo [SUCCES] Librairies installees avec succes !
echo.

:CHECK_DIST
:: 4. Verification de la compilation du frontend
if exist "dist\index.html" goto LAUNCH_APP
echo [INFO] Compilation initiale de l'interface graphique...
call npm run build
if errorlevel 1 goto BUILD_ERROR
if not exist "dist\index.html" goto BUILD_ERROR
echo [SUCCES] Compilation terminee avec succes !
echo.

:LAUNCH_APP
:: 5. Lancement. C'est SEULEMENT maintenant que la production est demandee :
::    le serveur sert dist/ (pas de compilation a la volee) et lit la base.
set NODE_ENV=production
echo [INFO] Demarrage du serveur intelligent Agent Culinaire OS...
echo ================================================================
echo   L'APPLICATION EST PRETE ET DEMARRE !
echo   Vous pouvez y acceder sur de nombreux navigateurs :
echo   URL : http://localhost:3000
echo ================================================================
echo.

:: Le navigateur s'ouvre APRES le demarrage du serveur : ouvert avant, il tombait
:: sur « connexion refusee » pendant que la base s'initialisait.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 8; Start-Process 'http://localhost:3000'"

:: Demarrer l'application Express
call npm start
goto END


:NO_NODE
echo [ERREUR] Node.js n'a pas ete detecte sur votre systeme.
echo Veuillez installer Node.js (version LTS, 22 ou plus) gratuitement depuis :
echo https://nodejs.org/
echo.
echo Une fois installe, fermez cette fenetre et relancez ce fichier.
echo.
pause
exit /b 1

:NO_PACKAGE
echo [ERREUR] Impossible de trouver le fichier package.json.
echo Assurez-vous d'avoir bien extrait TOUS les fichiers du ZIP avant de lancer.
echo.
pause
exit /b 1

:INSTALL_ERROR
echo [ERREUR] Echec lors de l'installation des librairies.
echo.
echo A essayer, dans l'ordre :
echo   1. verifier la connexion internet ;
echo   2. supprimer le dossier node_modules puis relancer ce fichier ;
echo   3. si le message parle de Visual Studio / node-gyp, installer les
echo      "Desktop development with C++" des Build Tools Microsoft.
echo.
pause
exit /b 1

:BUILD_ERROR
echo [ERREUR] Echec lors de la compilation du frontend.
echo.
echo Supprimer le dossier dist puis relancer ce fichier. Si l'erreur persiste,
echo copier le message ci-dessus : sans dist, l'application n'a aucune interface.
echo.
pause
exit /b 1

:END
echo.
echo [INFO] Le serveur s'est arrete normalement.
pause
