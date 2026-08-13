const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const PRESET_EXTENSION = '.json';
const MAX_PRESET_BYTES = 2 * 1024 * 1024;

function isTrustedFrame(frame) {
  if (!frame || !frame.url) return false;
  try {
    const parsed = new URL(frame.url);
    const filePath = decodeURIComponent(parsed.pathname).replace(/^\/(?:([A-Za-z]:))/, '$1');
    return parsed.protocol === 'file:' && path.resolve(filePath) === path.resolve(__dirname, 'index.html');
  } catch (error) {
    return false;
  }
}

function assertTrustedIpc(event) {
  if (!isTrustedFrame(event.senderFrame)) throw new Error('IPC recusado para uma origem não confiável.');
}

function safeDialogWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow() || null;
}

function sanitizeDialogOptions(options = {}, mode = 'open') {
  const allowed = {
    title: typeof options.title === 'string' ? options.title.slice(0, 120) : undefined,
    defaultPath: typeof options.defaultPath === 'string' ? path.basename(options.defaultPath).slice(0, 180) : undefined,
    filters: [{ name: 'Preset BenSF2', extensions: ['json'] }]
  };
  if (mode === 'open') allowed.properties = ['openFile'];
  return allowed;
}

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
      sandbox: true,
      webSecurity: true,
      webMidi: true // ← FIX: habilita WebMIDI API no Electron (sem isso, navigator.requestMIDIAccess falha silenciosamente)
    },
    icon: path.join(__dirname, 'assets/icon-512.png')
  });

  const trustedEntryUrl = pathToFileURL(path.join(__dirname, 'index.html')).href;
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== trustedEntryUrl) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.loadFile('index.html');

  // Garantir permissões aprovadas automaticamente (MIDI + áudio para enumeração de dispositivos)
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const trusted = webContents === mainWindow.webContents && isTrustedFrame(webContents.mainFrame);
    callback(Boolean(trusted && permission === 'midi'));
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return webContents === mainWindow.webContents &&
      isTrustedFrame(webContents.mainFrame) &&
      permission === 'midi' &&
      typeof requestingOrigin === 'string' && requestingOrigin.startsWith('file://');
  });

  // Remover menu de aplicativo padrão do Windows para manter estética pura DAW
  mainWindow.setMenuBarVisibility(false);
}

// Capacidades atômicas: o renderer nunca recebe acesso arbitrário a caminhos.
ipcMain.handle('open-preset-file', async (event) => {
  assertTrustedIpc(event);
  const win = safeDialogWindow(event);
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, sanitizeDialogOptions({ title: 'Importar Preset BenSF2' }, 'open'));
  if (result.canceled || !result.filePaths?.[0]) return null;
  const filePath = result.filePaths[0];
  if (path.extname(filePath).toLowerCase() !== PRESET_EXTENSION) throw new Error('Apenas presets .json são permitidos.');
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile() || stat.size > MAX_PRESET_BYTES) throw new Error('Preset inválido ou maior que 2 MB.');
  return { content: await fs.promises.readFile(filePath, 'utf8'), fileName: path.basename(filePath) };
});

ipcMain.handle('save-preset-file', async (event, defaultPath, content) => {
  assertTrustedIpc(event);
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_PRESET_BYTES) {
    throw new Error('Preset inválido ou maior que 2 MB.');
  }
  const win = safeDialogWindow(event);
  if (!win) return false;
  const safeDefault = `${path.basename(String(defaultPath || 'preset-bensf2'), PRESET_EXTENSION)}${PRESET_EXTENSION}`;
  const result = await dialog.showSaveDialog(win, sanitizeDialogOptions({ title: 'Exportar Preset BenSF2', defaultPath: safeDefault }, 'save'));
  if (result.canceled || !result.filePath) return false;
  const target = result.filePath.toLowerCase().endsWith(PRESET_EXTENSION) ? result.filePath : `${result.filePath}${PRESET_EXTENSION}`;
  await fs.promises.writeFile(target, content, { encoding: 'utf8', flag: 'w' });
  return true;
});

// Database Persistence Handlers (SQLite Storage)
const getDbPath = () => path.join(app.getPath('userData'), 'bensf2_database.sqlite.json');

ipcMain.handle('db-get-velocity-curves', async (event) => {
  assertTrustedIpc(event);
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
  assertTrustedIpc(event);
  try {
    if (!Array.isArray(curvesArray) || curvesArray.length > 256) return false;
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
