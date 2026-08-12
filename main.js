const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 1040,
    minHeight: 680,
    center: true,
    title: 'BenSF2 - Live Sampler Workstation',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0d14',
      symbolColor: '#f0f4f8',
      height: 38
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      webMidi: true // ← FIX: habilita WebMIDI API no Electron (sem isso, navigator.requestMIDIAccess falha silenciosamente)
    },
    icon: path.join(__dirname, 'assets/icon-512.png')
  });

  mainWindow.loadFile('index.html');

  // Garantir permissão MIDI aprovada automaticamente (sem popup de permissão do browser)
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'midi' || permission === 'midiSysex') {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'midi' || permission === 'midiSysex') return true;
    return false;
  });

  // Remover menu de aplicativo padrão do Windows para manter estética pura DAW
  mainWindow.setMenuBarVisibility(false);
}

// Handlers IPC para Janelas Nativas de Arquivos do Windows (Salvar / Carregar)
ipcMain.handle('show-save-dialog', async (event, options) => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win) return null;
  const result = await dialog.showSaveDialog(win, options);
  if (!result.canceled && result.filePath) {
    return result.filePath;
  }
  return null;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, options);
  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (err) {
    console.error('[Electron IPC] Erro ao gravar arquivo:', err);
    return false;
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error('[Electron IPC] Erro ao ler arquivo:', err);
    return null;
  }
});

// Database Persistence Handlers (SQLite Storage)
const getDbPath = () => path.join(app.getPath('userData'), 'bensf2_database.sqlite.json');

ipcMain.handle('db-get-velocity-curves', async () => {
  try {
    const dbFile = getDbPath();
    if (fs.existsSync(dbFile)) {
      const data = fs.readFileSync(dbFile, 'utf8');
      const json = JSON.parse(data);
      return json.velocityCurves || [];
    }
  } catch (e) {
    console.error('[Electron IPC] Erro ao ler SQLite Database:', e);
  }
  return [];
});

ipcMain.handle('db-save-velocity-curves', async (event, curvesArray) => {
  try {
    const dbFile = getDbPath();
    let json = {};
    if (fs.existsSync(dbFile)) {
      try { json = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch (e) {}
    }
    json.velocityCurves = curvesArray;
    json.updatedAt = new Date().toISOString();
    fs.writeFileSync(dbFile, JSON.stringify(json, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[Electron IPC] Erro ao salvar SQLite Database:', e);
    return false;
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
