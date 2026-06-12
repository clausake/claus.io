@echo off
title Agent Culinaire OS - Demarrage Automatique
cls

:: Forcer le mode de production pour une stabilite locale totale (sans compilation a la volee)
set NODE_ENV=production

echo ================================================================
echo   Agent Culinaire OS - Assistant de Lancement Automatique
echo ================================================================
echo.

:: 1. Verification de Node.js
where node >nul 2>nul
if errorlevel 1 goto NO_NODE

:: 2. Verification de package.json
if not exist package.json goto NO_PACKAGE

:: 3. Verification et Installation des dependances
if exist node_modules goto CHECK_DIST
echo [INFO] Premier demarrage detecte. Telechargement des librairies...
echo Cette operation prend 1 a 2 minutes et necessite internet.
echo.
call npm install
if errorlevel 1 goto INSTALL_ERROR
echo [SUCCES] Librairies installees avec succes !
echo.

:CHECK_DIST
:: 4. Verification de la compilation du frontend
if exist dist goto LAUNCH_APP
echo [INFO] Compilation initiale de l'interface graphique...
call npm run build
if errorlevel 1 goto BUILD_ERROR
echo [SUCCES] Compilation terminee avec succes !
echo.

:LAUNCH_APP
:: 5. Lancement
echo [INFO] Demarrage du serveur intelligent Agent Culinaire OS...
echo ================================================================
echo   L'APPLICATION EST PRETE ET DEMARRE !
echo   Vous pouvez y acceder sur de nombreux navigateurs :
echo   URL : http://localhost:3000
echo ================================================================
echo.

:: Ouvrir la page web dans le navigateur par defaut
start "" "http://localhost:3000"

:: Demarrer l'application Express
call npm start
goto END


:NO_NODE
echo [ERREUR] Node.js n'a pas ete detecte sur votre systeme.
echo Veuillez installer Node.js (version LTS) gratuitement depuis :
echo https://nodejs.org/
echo.
echo Une fois installe, fermez cette fenetre et relancez ce fichier.
echo.
pause
exit /b

:NO_PACKAGE
echo [ERREUR] Impossible de trouver le fichier package.json.
echo Assurez-vous d'avoir bien extrait TOUS les fichiers du ZIP avant de lancer.
echo.
pause
exit /b

:INSTALL_ERROR
echo [ERREUR] Echec lors de l'installation des librairies.
echo Verifiez votre connexion internet et reessayez.
echo.
pause
exit /b

:BUILD_ERROR
echo [ERREUR] Echec lors de la compilation du frontend.
echo.
pause
exit /b

:END
echo.
echo [INFO] Le serveur s'est arrete normalement.
pause
