// main.js
require('dotenv').config(); // Ładowanie zmiennych z .env

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const extract = require('extract-zip');
const { execFile } = require('child_process');
const createDesktopShortcut = require('create-desktop-shortcuts');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 514,
    frame: false, // usuwa natywny pasek tytułu i ramkę
    resizable: false,
    icon: path.join(__dirname, 'KCDMOD.ico'), // ikona aplikacji
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));

  ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window-close', () => {
    mainWindow.close();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Funkcja pomocnicza do porównania wersji
function isRemoteVersionNewer(localRaw, remoteRaw) {
  const [localVersion, localRelease] = localRaw.split(':');
  const [remoteVersion, remoteRelease] = remoteRaw.split(':');

  const localParts = localVersion.split('.').map(n => parseInt(n));
  const remoteParts = remoteVersion.split('.').map(n => parseInt(n));

  for (let i = 0; i < Math.max(localParts.length, remoteParts.length); i++) {
    const lNum = localParts[i] || 0;
    const rNum = remoteParts[i] || 0;
    if (rNum > lNum) return true;
    if (rNum < lNum) return false;
  }
  // Jeśli numeryczne części są równe, porównujemy część "release"
  return remoteRelease !== localRelease;
}

// IPC – Sprawdzanie wersji aplikacji
ipcMain.handle('check-version', async () => {
  try {
    // Ustalenie ścieżki do folderu instalacyjnego
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const installDir = path.join(appData, 'kcdmod');

    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true });
    }

    const localVersionPath = path.join(installDir, '.version');

    // Jeśli plik .version nie istnieje, utwórz go z domyślną wartością
    if (!fs.existsSync(localVersionPath)) {
      fs.writeFileSync(localVersionPath, "0.0.0:alpha");
    }

    const localRaw = fs.readFileSync(localVersionPath, 'utf8').trim();

    // Pobieranie pliku .version z prywatnego repozytorium organizacji przy użyciu GitHub API
    const token = process.env.GITHUB_TOKEN;
    const organization = process.env.GITHUB_ORG;
    const repository = process.env.GITHUB_REPO;

    if (!token || !organization || !repository) {
      throw new Error('Error with token at .env');
    }

    const versionUrl = `https://api.github.com/repos/${organization}/${repository}/contents/.version?ref=main`;

    const remoteResponse = await axios.get(versionUrl, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3.raw'
      }
    });

    let remoteRaw;
    if (remoteResponse.data.content) {
      remoteRaw = Buffer.from(remoteResponse.data.content, 'base64').toString('utf8').trim();
    } else {
      remoteRaw = remoteResponse.data.trim();
    }

    const updateNeeded = isRemoteVersionNewer(localRaw, remoteRaw);

    // Jeśli aktualizacja jest potrzebna, zapisz nową wersję do pliku lokalnego
    if (updateNeeded) {
      fs.writeFileSync(localVersionPath, remoteRaw);
    }

    return { version: remoteRaw.split(':')[0], release: remoteRaw.split(':')[1], updateNeeded };
  } catch (error) {
    console.error('Error with version checking', error);
    throw error;
  }
});

// IPC – Rozpoczęcie aktualizacji (pobieranie paczki ZIP, rozpakowywanie, tworzenie skrótu)
ipcMain.handle('start-update', async () => {
  try {
    const token = process.env.GITHUB_TOKEN;
    const organization = process.env.GITHUB_ORG;
    const repository = process.env.GITHUB_REPO;

    if (!token || !organization || !repository) {
      throw new Error('Problem with .env');
    }

    // Pobieranie pliku ZIP z repozytorium
    const zipUrl = `https://api.github.com/repos/${organization}/${repository}/contents/kcdmod.zip?ref=main`;
    const tmpZipPath = path.join(os.tmpdir(), 'kcdmod.zip');

    const zipResponse = await axios.get(zipUrl, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3.raw'
      },
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(tmpZipPath);
    zipResponse.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const installDir = path.join(appData, 'kcdmod');

    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true });
    }

    // Rozpakowywanie pobranego archiwum ZIP
    await extract(tmpZipPath, { dir: installDir });

    // Tworzenie skrótu na pulpicie
    createDesktopShortcut({
      onlyCurrentOS: true,
      windows: {
        filePath: path.join(installDir, 'KCDMOD.exe'),
        outputPath: path.join(os.homedir(), 'Desktop'),
        execAsAdministrator: true
      },
      linux: {
        filePath: path.join(installDir, 'KCDMOD.exe'),
        outputPath: path.join(os.homedir(), 'Desktop'),
        execAsAdministrator: true
      },
      osx: {
        filePath: path.join(installDir, 'KCDMOD.exe'),
        outputPath: path.join(os.homedir(), 'Desktop'),
        execAsAdministrator: true
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Błąd aktualizacji:', error);
    throw error;
  }
});

// IPC – Uruchamianie aplikacji (pliku EXE)
ipcMain.handle('run-app', async () => {
  try {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const installDir = path.join(appData, 'kcdmod');
    const exePath = path.join(installDir, 'KCDMOD.exe');

    execFile(exePath, (err) => {
      if (err) {
        console.error('Error with running application:', err);
      }
    });
    return { success: true };
  } catch (error) {
    console.error('Error with running application:', error);
    throw error;
  }
});
