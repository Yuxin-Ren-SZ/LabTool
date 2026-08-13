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
npm run dist:dir   # validate packaging locally (unpacked app in dist/)
npm run dist       # full installers (dmg/zip, nsis exe, AppImage+deb)
```

`LABTOOLS_WEB_ROOT` can point the shell at a different web-root checkout
(defaults to the repository root of this branch).

## Phase status

1. **Shell** — done: window, `app://` serving, native menus, preload bridge,
   smoke suite.
2. **Native integrations** — done: every download/export gets a native save
   dialog; File → "Export Page as PDF…". Deferred: per-tool open-dialog wiring
   and recent files (needs the artifact UI, which is still in flight upstream).
3. **Packaging** — in progress: electron-builder targets NSIS (Windows),
   DMG + zip (macOS, x64/arm64), AppImage + deb (Linux); CI matrix in
   `.github/workflows/desktop.yml`. Unsigned for now; code signing and
   auto-update are follow-ups.

## Layout

```
desktop/
├── package.json
├── electron-builder.yml  # NSIS / DMG+zip / AppImage+deb targets
├── scripts/stage.mjs     # assembles build-stage/ (app + web root) for packaging
├── src/main.js           # app window, app:// protocol, menus, IPC, downloads
├── src/preload.cjs       # contextBridge: platform + versions (CJS for sandbox)
├── tests/smoke.test.mjs
└── README.md
```
