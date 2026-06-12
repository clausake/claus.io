# Agent Culinaire OS - Démarrage Automatique (PowerShell)
$Host.UI.RawUI.WindowTitle = "Agent Culinaire OS - Démarrage Automatique"
Clear-Host

# Forcer le mode de production pour une stabilité locale totale (sans compilation à la volée)
$env:NODE_ENV = "production"

Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "  Agent Culinaire OS - Assistant de Lancement Automatique (PS)" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host ""

# 1. Vérification de Node.js
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Host "[ERREUR] Node.js n'a pas été détecté sur votre système." -ForegroundColor Red
    Write-Host "Veuillez installer Node.js (version LTS) gratuitement depuis :" -ForegroundColor Gray
    Write-Host "https://nodejs.org/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Une fois installé, fermez cette fenêtre et relancez ce fichier." -ForegroundColor Gray
    Write-Host ""
    Read-Host "Appuyez sur Entrée pour quitter..."
    exit
}

# 2. Vérification de package.json
if (-not (Test-Path "package.json")) {
    Write-Host "[ERREUR] Impossible de trouver le fichier package.json." -ForegroundColor Red
    Write-Host "Assurez-vous d'avoir bien extrait TOUS les fichiers du ZIP avant de lancer." -ForegroundColor Gray
    Write-Host ""
    Read-Host "Appuyez sur Entrée pour quitter..."
    exit
}

# 3. Vérification et Installation des dépendances
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Premier démarrage détecté. Téléchargement des librairies..." -ForegroundColor Cyan
    Write-Host "Cette opération prend 1 à 2 minutes et nécessite internet." -ForegroundColor Gray
    Write-Host ""
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERREUR] Échec lors de l'installation des librairies." -ForegroundColor Red
        Write-Host "Vérifiez votre connexion internet et réessayez." -ForegroundColor Gray
        Write-Host ""
        Read-Host "Appuyez sur Entrée pour quitter..."
        exit
    }
    Write-Host "[SUCCÈS] Librairies installées avec succès !" -ForegroundColor Green
    Write-Host ""
}

# 4. Vérification de la compilation du frontend
if (-not (Test-Path "dist")) {
    Write-Host "[INFO] Compilation initiale de l'interface graphique..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERREUR] Échec lors de la compilation du frontend." -ForegroundColor Red
        Write-Host ""
        Read-Host "Appuyez sur Entrée pour quitter..."
        exit
    }
    Write-Host "[SUCCÈS] Compilation terminée avec succès !" -ForegroundColor Green
    Write-Host ""
}

# 5. Lancement
Write-Host "[INFO] Démarrage du serveur intelligent Agent Culinaire OS..." -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  L'APPLICATION EST PRÊTE ET DÉMARRE !" -ForegroundColor Green
Write-Host "  Vous pouvez y accéder sur de nombreux navigateurs :" -ForegroundColor Green
Write-Host "  URL : http://localhost:3000" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""

# Ouvrir la page web dans le navigateur par défaut
Start-Process "http://localhost:3000"

# Démarrer l'application Express
npm start

Write-Host ""
Write-Host "[INFO] Le serveur s'est arrêté normalement." -ForegroundColor Gray
Read-Host "Appuyez sur Entrée pour quitter..."
