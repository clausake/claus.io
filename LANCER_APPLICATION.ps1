# Agent Culinaire OS - Démarrage Automatique (PowerShell)
$Host.UI.RawUI.WindowTitle = "Agent Culinaire OS - Démarrage Automatique"
Clear-Host

# NODE_ENV n'est VOLONTAIREMENT pas posé ici : `npm install` lit cette variable et,
# avec NODE_ENV=production, npm ne télécharge PAS les devDependencies — vite, tsx,
# esbuild, electron en font partie. C'était la cause de « 'vite' n'est pas reconnu »
# au premier lancement (les librairies installées étaient incomplètes alors que
# npm install avait rendu 0). Il est posé plus bas, juste avant `npm start`.

Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "  Agent Culinaire OS - Assistant de Lancement Automatique (PS)" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host ""

# 1. Vérification de Node.js
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Host "[ERREUR] Node.js n'a pas été détecté sur votre système." -ForegroundColor Red
    Write-Host "Veuillez installer Node.js (version LTS, 22 ou plus) gratuitement depuis :" -ForegroundColor Gray
    Write-Host "https://nodejs.org/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Une fois installé, fermez cette fenêtre et relancez ce fichier." -ForegroundColor Gray
    Write-Host ""
    Read-Host "Appuyez sur Entrée pour quitter..."
    exit 1
}

# 2. Vérification de package.json
if (-not (Test-Path "package.json")) {
    Write-Host "[ERREUR] Impossible de trouver le fichier package.json." -ForegroundColor Red
    Write-Host "Assurez-vous d'avoir bien extrait TOUS les fichiers du ZIP avant de lancer." -ForegroundColor Gray
    Write-Host ""
    Read-Host "Appuyez sur Entrée pour quitter..."
    exit 1
}

# 3. Dépendances : on juge le BINAIRE, pas le dossier (un node_modules vide ou
#    tronqué passait le test « Test-Path node_modules » et cassait le build).
if (-not ((Test-Path "node_modules/vite/package.json") -and (Test-Path "node_modules/tsx/package.json"))) {
    Write-Host "[INFO] Installation des librairies (vite, tsx, esbuild...)..." -ForegroundColor Cyan
    Write-Host "Cette opération prend quelques minutes et nécessite internet." -ForegroundColor Gray
    Write-Host ""
    # --include=dev : même si un .npmrc de la machine force la production.
    npm install --include=dev
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path "node_modules/vite/package.json")) {
        Write-Host "[ERREUR] Échec lors de l'installation des librairies." -ForegroundColor Red
        Write-Host "Vérifiez la connexion internet, supprimez node_modules, puis relancez." -ForegroundColor Gray
        Write-Host ""
        Read-Host "Appuyez sur Entrée pour quitter..."
        exit 1
    }
    Write-Host "[SUCCÈS] Librairies installées avec succès !" -ForegroundColor Green
    Write-Host ""
}

# 4. Vérification de la compilation du frontend
if (-not (Test-Path "dist/index.html")) {
    Write-Host "[INFO] Compilation initiale de l'interface graphique..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path "dist/index.html")) {
        Write-Host "[ERREUR] Échec lors de la compilation du frontend." -ForegroundColor Red
        Write-Host "Supprimez le dossier dist puis relancez ce fichier." -ForegroundColor Gray
        Write-Host ""
        Read-Host "Appuyez sur Entrée pour quitter..."
        exit 1
    }
    Write-Host "[SUCCÈS] Compilation terminée avec succès !" -ForegroundColor Green
    Write-Host ""
}

# 5. Lancement : NODE_ENV=production SEULEMENT ici (le serveur sert dist/).
$env:NODE_ENV = "production"
Write-Host "[INFO] Démarrage du serveur intelligent Agent Culinaire OS..." -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  L'APPLICATION EST PRÊTE ET DÉMARRE !" -ForegroundColor Green
Write-Host "  Vous pouvez y accéder sur de nombreux navigateurs :" -ForegroundColor Green
Write-Host "  URL : http://localhost:3000" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""

# Le navigateur s'ouvre APRÈS le démarrage du serveur (ouvert avant, il tombait
# sur « connexion refusée » pendant l'initialisation de la base).
Start-Job -ScriptBlock { Start-Sleep -Seconds 8; Start-Process "http://localhost:3000" } | Out-Null

# Démarrer l'application Express
npm start

Write-Host ""
Write-Host "[INFO] Le serveur s'est arrêté normalement." -ForegroundColor Gray
Read-Host "Appuyez sur Entrée pour quitter..."
