const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const axios = require('axios');
const extract = require('extract-zip');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const createDesktopShortcut = require('create-desktop-shortcuts');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 514,
    frame: false,         // usuwa natywny pasek tytułu i ramkę
    resizable: false,  
    hasShadow: true, 
    icon: path.join(__dirname, 'KCDMOD.ico'), // Ikona aplikacji
    webPreferences: {
      // Dla produkcji rozważ użycie preload script z contextIsolation
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
  });
  mainWindow.setMenu(null); // usuwa domyślne menu systemowe
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

// Funkcja pomocnicza do porównania wersji (tylko numeryczne części)
function isRemoteVersionNewer(localRaw, remoteRaw) {
  // Rozdzielamy ciągi według dwukropka: "wersja:release"
  const [localVersion, localRelease] = localRaw.split(':');
  const [remoteVersion, remoteRelease] = remoteRaw.split(':');
  
  // Porównanie numeryczne wersji
  const localParts = localVersion.split('.').map(n => parseInt(n));
  const remoteParts = remoteVersion.split('.').map(n => parseInt(n));
  
  for (let i = 0; i < Math.max(localParts.length, remoteParts.length); i++) {
    const lNum = localParts[i] || 0;
    const rNum = remoteParts[i] || 0;
    if (rNum > lNum) return true;
    if (rNum < lNum) return false;
  }
  
  // Jeśli numeryczne części są równe, można opcjonalnie porównać release (tutaj przyjmujemy, że jeśli release są różne, aktualizacja też ma sens)
  return remoteRelease !== localRelease;
}

// IPC – Sprawdzanie wersji
ipcMain.handle('check-version', async (event) => {
  try {
    // Ustalenie ścieżki do folderu instalacyjnego (np. AppData/kcdmod)
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const installDir = path.join(appData, 'kcdmod');
    
    // Jeśli folder nie istnieje, utwórz go
    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true });
    }
    
    const localVersionPath = path.join(installDir, '.version');
    
    // Jeśli plik .version nie istnieje – utwórz go z domyślną wartością "0.0.0:alpha"
    if (!fs.existsSync(localVersionPath)) {
      fs.writeFileSync(localVersionPath, "0.0.0:alpha");
    }
    
    // Odczyt lokalnej wersji
    const localRaw = fs.readFileSync(localVersionPath, 'utf8').trim();
    const [localVersion, localRelease] = localRaw.split(':');
    
    // Pobierz zdalny plik .version
    const versionUrl = 'https://github.com/KCDMOD/Versions/raw/refs/heads/main/.version';
    const remoteResponse = await axios.get(versionUrl);
    const remoteRaw = remoteResponse.data.trim(); // np. "0.0.1:alpha"
    const [remoteVersion, remoteRelease] = remoteRaw.split(':');
    
    // Porównaj wersje – jeśli zdalna jest nowsza, ustaw flagę updateNeeded
    const updateNeeded = isRemoteVersionNewer(localRaw, remoteRaw);
    
    // Jeśli aktualizacja jest potrzebna, zapisz nową wersję do lokalnego pliku
    if (updateNeeded) {
      fs.writeFileSync(localVersionPath, remoteRaw);
    }
    
    return { version: remoteVersion, release: remoteRelease, updateNeeded };
  } catch (error) {
    console.error('Error with checking version..', error);
    throw error;
  }
});

// IPC – Rozpoczęcie aktualizacji (pobiera paczkę, rozpakowuje, tworzy skrót)
ipcMain.handle('start-update', async (event) => {
  try {
    // Ścieżka tymczasowa do zapisania pliku .zip
    const tmpZipPath = path.join(os.tmpdir(), 'kcdmod.zip');
    const zipUrl = 'https://github.com/KCDMOD/Versions/raw/refs/heads/main/kcdmod.zip';
    
    // Pobierz archiwum .zip
    const response = await axios({ url: zipUrl, method: 'GET', responseType: 'stream' });
    const writer = fs.createWriteStream(tmpZipPath);
    response.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    // Ścieżka instalacyjna
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const installDir = path.join(appData, 'kcdmod');
    
    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true });
    }
    
    // Rozpakuj archiwum do folderu instalacyjnego
    await extract(tmpZipPath, { dir: installDir });
    
    // Utwórz skrót na pulpicie (używamy biblioteki create-desktop-shortcuts)
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

// IPC – Uruchomienie aplikacji
ipcMain.handle('run-app', async (event) => {
  try {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const installDir = path.join(appData, 'kcdmod');
    const exePath = path.join(installDir, 'KCDMOD.exe');
    
    execFile(exePath, (err) => {
      if (err) {
        console.error('Launch error:', err);
      }
    });
    return { success: true };
  } catch (error) {
    console.error('Error with launching application:', error);
    throw error;
  }
});
