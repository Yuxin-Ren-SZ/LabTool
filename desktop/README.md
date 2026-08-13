# LabTools Desktop

Electron desktop shell for LabTools (Windows / macOS / Linux). The shell adds no
tool logic — it serves the repo's existing zero-dependency web assets
(`../index.html`, `../tools/`, `../assets/`) over a privileged `app://bundle/`
scheme, so the web tree remains the single source of truth and picks up every
refactor commit automatically.

See `../docs/desktop-app-plan.md` for the full architecture and phase plan.

## Requirements

- Node ≥ 20 and npm.

## Develop

```sh
npm install   # pulls Electron (bundled binary) + Playwright
npm start     # launches the shell from the checkout
npm test      # smoke suite: hub + every tool page, console-clean
```

`LABTOOLS_WEB_ROOT` can point the shell at a different web-root checkout
(defaults to the repository root of this branch).

## Phase status

1. **Shell** (this phase) — window, `app://` serving, native menus, preload
   bridge, smoke suite.
   Known phase-1 behavior: blob downloads (CSV/PDF exports) land in the OS
   default Downloads folder.
2. **Native integrations** — save/open dialogs, recent files, print-to-PDF
   (not yet built).
3. **Packaging** — electron-builder targets: NSIS (Windows), DMG (macOS),
   AppImage + deb (Linux) (not yet built).

## Layout

```
desktop/
├── package.json
├── src/main.js        # app window, app:// protocol, menus, IPC
├── src/preload.cjs    # contextBridge: platform + versions (CJS for sandbox)
├── tests/smoke.test.mjs
└── README.md
```
