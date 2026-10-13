const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
// Toute la logique de pret est un module separe, PARCE QUE ce fichier est hors
// lint : tsconfig.json exclut `electron/` et `*.cjs`, donc `npx tsc --noEmit` ne
// voit jamais ce qui y tourne (un correctif du port y serait un correctif sans
// gate). Le module, lui, est juge par npx vitest run + son autotest.
const R = require('./ready-parity.cjs');

let mainWindow;
let serverProcess;
let fenetreOuverte = false;

// Le jeton d'identite de CETTE instance. Le serveur le rend dans l'en-tete
// X-Cookdrive-Instance de chaque reponse : le confronter est la seule preuve que
// la fenetre va afficher NOTRE application, et non un tiers qui tiendrait le port.
const INSTANCE_TOKEN = crypto.randomUUID();

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "claus.io"
  });

  mainWindow.setMenuBarVisibility(false);

  // Le port est celui ANNONCE par le serveur (voir ready-parity.cjs), plus jamais
  // un 3000 codé en dur : le serveur peut glisser d'un cran sur EADDRINUSE quand
  // personne ne lui a demande de port Explicitement, et charger un 3000 codé en
  // dur reviroit alors a afficher l'application du voisin sans aucun rougissement.
  mainWindow.loadURL(url);

  // Au cas où la page ne charge pas bien, on capture l'erreur
  mainWindow.webContents.on('did-fail-load', (e, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
    // On ne montre pas de popup à chaque refresh, mais ça aide au debug interne
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// Ouvre la fenetre sur l'URL REELLE du serveur, Apres avoir prouvé que ce port
// est bien le notre. Une divergence d'identite est bloquante : afficher
// l'application d'un tiers sous le nom de claus.io est pire que n'en afficher
// aucune, parce que le cuisinier travaillerait sur des donnes qui ne sont pas
// les siennes en croyant que si.
async function ouvrirFenetre(info) {
  if (fenetreOuverte) return;
  const url = R.urlDeLaFenetre(info);
  if (info.glisse) {
    console.log(`[Serveur] le port demande etoit occupe : serveur déplace sur ${url}`);
  }
  const conforme = await R.verifierIdentite(url, INSTANCE_TOKEN);
  if (!conforme) {
    fenetreOuverte = true; // on ne rejoue pas une seconde tentative sur un intrus
    console.error(`[Serveur] IDENTITE NON CONFORME sur ${url} : le port est tenu par une application qui n'est pas claus.io. La fenetre n'est pas ouverte.`);
    dialog.showErrorBox(
      'Erreur Critique du Serveur claus.io',
      `Le port ${info.port} est occupé par une autre application.\n\nQuittez cette application ou libérez le port, puis relancez claus.io.\n\n(URL testée: ${url})`
    );
    app.quit();
    return;
  }
  fenetreOuverte = true;
  if (!mainWindow) createWindow(url);
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
      env: { ...process.env, NODE_ENV: 'development', COOKDRIVE_INSTANCE_TOKEN: INSTANCE_TOKEN }
    });

    serverProcess.stdout.on('data', (data) => {
      const brut = data.toString();
      console.log(`[Serveur] ${brut}`);
      const info = R.lireLigneDePret(brut);
      if (info) ouvrirFenetre(info);
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
    // Le serveur tourne DEDANS ce processus : il n'a pas de stdout a nous offrir.
    // Le compte-rendu de pret passe donc par un FICHIER que le serveur ecrit de
    // facon atomique (voir announceReady), que nous relisons.
    const readyFile = path.join(app.getPath('temp'), 'cookdrive-ready.json');
    try { fs.rmSync(readyFile, { force: true }); } catch (e) {}
    process.env.COOKDRIVE_READY_FILE = readyFile;
    process.env.COOKDRIVE_INSTANCE_TOKEN = INSTANCE_TOKEN;

    try {
      const serverJsPath = path.join(__dirname, '..', 'dist-server', 'server.cjs');
      // On exécute le fichier backend compilé
      require(serverJsPath);
      console.log("Serveur backend chargé avec succès en interne !");

      // On attend le compte-rendu REEL au lieu de « 2 secondes » : un sleep fixe
      // est un pari sur la vitesse de la machine (trop court sur un disque lent,
      // trop long partout), et il ne disait toujours pas SUR QUEL PORT le serveur
      // avoit fini par s'installer.
      R.attendreCompteRendu(readyFile, { deadlineMs: 30000 }).then((info) => {
        if (!info) {
          console.error('[Serveur] compte-rendu de pret jamais recu (30 s) : la fenetre ne peut pas deviner le port.');
          dialog.showErrorBox(
            'Erreur Critique du Serveur claus.io',
            "Le moteur n'a pas annonce son port dans le delai imparti.\n\nRelancez l'application."
          );
          app.quit();
          return;
        }
        ouvrirFenetre(info);
      });

    } catch (error) {
      console.error("Erreur fatale de lancement Express :", error);
      dialog.showErrorBox(
        'Erreur Critique du Serveur claus.io',
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
