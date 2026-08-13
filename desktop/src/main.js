/**
 * LabTools desktop shell — Electron main process.
 *
 * Serves the zero-dependency web assets (repo root: index.html, tools/, assets/)
 * over a privileged `app://bundle/` scheme so localStorage, IndexedDB, fetch and
 * the `?wbLoad=` workflow handoffs behave exactly as they do on the web.
 *
 * The web tree is the single source of truth: this shell contains no tool logic.
 */
import { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session, shell } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// From source: desktop/src → repo root. Packaged (phase 3): the staging layout
// keeps the web files at the app root (app.getAppPath()). LABTOOLS_WEB_ROOT
// overrides for unusual layouts.
const WEB_ROOT = process.env.LABTOOLS_WEB_ROOT
  ? path.resolve(process.env.LABTOOLS_WEB_ROOT)
  : app.isPackaged
    ? app.getAppPath()
    : path.resolve(__dirname, '..', '..');

const SCHEME = 'app';
const HOST = 'bundle';

// Opt-in accommodations for restricted/CI environments (set by the smoke suite
// via electron.launch env). Never on for normal desktop runs.
if (process.env.LABTOOLS_NO_SANDBOX) app.commandLine.appendSwitch('no-sandbox');
if (process.env.LABTOOLS_DISABLE_GPU) app.commandLine.appendSwitch('disable-gpu');
if (process.env.LABTOOLS_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.LABTOOLS_USER_DATA_DIR));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf',
};

// Must run before app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

/** Map app://bundle/<path> → files under WEB_ROOT, with traversal protection. */
async function serveWebRoot(request) {
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';
  const filePath = path.normalize(path.join(WEB_ROOT, pathname));
  const rel = path.relative(WEB_ROOT, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    const buf = await fs.readFile(filePath);
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type':
          MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

/** Native "Export Page as PDF…" — uses the page's own print stylesheet. */
async function exportPageAsPdf() {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (!win) return;
  const base = (win.getTitle() || 'labtools').replace(/[^\w\s.-]+/g, '').trim();
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export page as PDF',
    defaultPath: path.join(app.getPath('documents'), `${base}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return;
  const pdf = await win.webContents.printToPDF({ printBackground: true });
  await fs.writeFile(filePath, pdf);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Export Page as PDF…', accelerator: 'CmdOrCtrl+Shift+P', click: exportPageAsPdf },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'About LabTools',
          click: () =>
            dialog.showMessageBox({
              type: 'info',
              title: 'About LabTools',
              message: 'LabTools',
              detail: `Version ${app.getVersion()}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'LabTools',
    backgroundColor: '#f5f7fa',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Keep navigation inside the bundled scheme; hand external links to the OS browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}/`)) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.loadURL(`${SCHEME}://${HOST}/index.html`);
  return mainWindow;
}

// Single instance: a second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    protocol.handle(SCHEME, serveWebRoot);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(['clipboard-sanitized-write', 'clipboard-read', 'fullscreen'].includes(permission));
    });

    // Native save dialog for every renderer download (CSV/JSON exports, blob
    // downloads from the tools' existing labtoolsDownload* helpers).
    session.defaultSession.on('will-download', (event, item, webContents) => {
      const owner = BrowserWindow.fromWebContents(webContents) ?? mainWindow;
      const suggested = item.getFilename() || 'export.txt';
      const choice = dialog.showSaveDialogSync(owner, {
        title: 'Save exported file',
        defaultPath: path.join(app.getPath('downloads'), suggested),
      });
      if (!choice.canceled && choice.filePath) item.setSavePath(choice.filePath);
      else item.cancel();
    });

    // Phase 1 IPC surface: app/engine versions for the preload bridge.
    // (invoked via ipcRenderer.invoke in preload.cjs)
    ipcMain.handle('labtools:get-versions', () => ({
      app: app.getVersion(),
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
    }));

    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
