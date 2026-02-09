const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  checkGit: () => ipcRenderer.invoke('check-git'),
  installGit: () => ipcRenderer.invoke('install-git'),
  checkBrew: () => ipcRenderer.invoke('check-brew'),
  installBrew: () => ipcRenderer.invoke('install-brew'),
  runBootstrap: (repoUrl) => ipcRenderer.invoke('run-bootstrap', repoUrl),
  onLogOutput: (callback) => ipcRenderer.on('log-output', (event, data) => callback(data))
});