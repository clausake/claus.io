const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "CLAUS.IO - Agent Culinaire"
  });

  mainWindow.setMenuBarVisibility(false);

  // Load the Express server we start in the background.
  mainWindow.loadURL('http://localhost:3000');

  // Au cas où la page ne charge pas bien, on capture l'erreur
  mainWindow.webContents.on('did-fail-load', (e, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
    // On ne montre pas de popup à chaque refresh, mais ça aide au debug interne
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function startServer() {
  const isDev = !app.isPackaged;
  const userDataPath = app.getPath('userData');
  process.env.USER_DATA_PATH = userDataPath;

  if (isDev) {
    const scriptPath = path.join(__dirname, '..', 'server.ts');
    console.log('Démarrage du serveur interne (Dev)...', scriptPath);

    serverProcess = spawn('npx', ['tsx', scriptPath], {
      shell: true,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development' }
    });

    serverProcess.stdout.on('data', (data) => {
      console.log(`[Serveur] ${data}`);
      if (data.toString().includes('http://localhost:3000')) {
          if (!mainWindow) createWindow();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Serveur Erreur] ${data}`);
    });
  } else {
    // EN PRODUCTION : On lance le code Express DIRECTEMENT dans le logiciel Electron !
    // Cela réactive la magie "ASAR" d'Electron pour lire les fichiers HTML compressés
    // et trouver SQLite, sans utiliser de processus Node distant aveugle.
    console.log('Démarrage d\'Express fusionné (Production)...');
    process.env.NODE_ENV = 'production';

    try {
      const serverJsPath = path.join(__dirname, '..', 'dist-server', 'server.cjs');
      // On exécute le fichier backend compilé
      require(serverJsPath);
      console.log("Serveur backend chargé avec succès en interne !");
      
      // On laisse 2 secondes à Express pour bien démarrer sur le port 3000
      setTimeout(() => {
        if (!mainWindow) createWindow();
      }, 2000);

    } catch (error) {
      console.error("Erreur fatale de lancement Express :", error);
      dialog.showErrorBox(
        'Erreur Critique du Serveur CLAUS.IO',
        `Impossible de démarrer le moteur. Capture d'écran requise pour l'ingénieur :\n\n${error.toString()}\n\nDétails de la stack:\n${error.stack}`
      );
    }
  }
}

app.on('ready', () => {
    startServer();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (serverProcess) {
    try {
      if (process.platform === 'win32') {
        const { exec } = require('child_process');
        exec('taskkill /pid ' + serverProcess.pid + ' /T /F');
      } else {
        process.kill(-serverProcess.pid);
      }
    } catch(e) {}
  }
});
