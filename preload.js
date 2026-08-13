const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  openPresetFile: () => ipcRenderer.invoke('open-preset-file'),
  savePresetFile: (defaultPath, content) => ipcRenderer.invoke('save-preset-file', defaultPath, content),
  dbGetVelocityCurves: () => ipcRenderer.invoke('db-get-velocity-curves'),
  dbSaveVelocityCurves: (curves) => ipcRenderer.invoke('db-save-velocity-curves', curves)
});
