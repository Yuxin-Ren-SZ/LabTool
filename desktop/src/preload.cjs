/**
 * LabTools desktop shell — preload bridge (CommonJS; sandboxed preloads run CJS).
 *
 * Exposes a tiny, explicit surface to the renderer. Phase 2 adds dialog-backed
 * file save/open helpers here; nothing else leaks into the web pages.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('labtoolsDesktop', {
  platform: process.platform,
  getVersions: () => ipcRenderer.invoke('labtools:get-versions'),
});
