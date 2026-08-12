const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'BenSF2 - Live Sampler Workstation',
    width: 1380,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#07090e',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#07090e',
      symbolColor: '#8a99ad',
      height: 38
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
