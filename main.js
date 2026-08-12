const { app, BrowserWindow } = require('electron');
const path = require('path');

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
      webSecurity: true
    },
    icon: path.join(__dirname, 'assets/icon-512.png')
  });

  mainWindow.loadFile('index.html');

  // Remover menu de aplicativo padrão do Windows para manter estética pura DAW
  mainWindow.setMenuBarVisibility(false);
}

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
