# LabTools Desktop App — Architecture & Migration Plan

- **Branch:** `feat/desktop-app` (created from `feat/shared-layer-v2` @ `aaa337e`)
- **Worktree:** `.worktrees/desktop` (hidden from the main tree via `.git/info/exclude`)
- **Status:** PROPOSED — stack pending confirmation; implementation not started.

## 1. Goal

Ship the LabTools hub and all 11 tools as a single **desktop application** for
Windows (10/11 x64), macOS (Apple Silicon + Intel), and Linux (x64), while:

- keeping the zero-dependency web version as the single source of truth for all
  tool code (no fork, no duplicate logic);
- staying compatible with the shared-layer v2 refactor currently in flight on
  `feat/shared-layer-v2`;
- adding **no runtime dependencies** to `tools/` or `assets/`.

## 2. Stack decision (recommended)

| Layer | Choice |
| --- | --- |
| Runtime | **Electron** (latest stable, pinned as a devDependency in `desktop/package.json`) |
| Language | JavaScript — Node ESM for main/preload; tools remain vanilla browser JS |
| UI | **No new UI framework.** The shell renders the existing HTML/CSS/JS assets. Native surface (menus, dialogs) uses Electron APIs only. |
| Packaging | electron-builder → NSIS (Windows), DMG (macOS), AppImage + deb (Linux) |
| Smoke tests | Playwright `_electron` (devDependency — same carve-out rationale as the existing puppeteer test tooling) |

### Why Electron

1. **100% reuse** of the web assets the other agents are refactoring — the shell
   serves the same `index.html`, `tools/`, and `assets/`; zero porting.
2. **One toolchain** — the repo already runs Node ≥ 18 and npm for test tooling.
3. **Identical rendering on all three OSes** — bundled Chromium behaves the same
   on lab PCs, Windows WebView2/WKWebView do not (Tauri risk).
4. Mature packaging/auto-update ecosystem; no system webview dependencies on Linux.

### Rejected alternatives

- **Tauri** — adds a Rust toolchain and relies on system webviews (WebKit2GTK on
  Linux, WebView2/WKWebView elsewhere) → rendering drift across OSes/lab PCs.
  Revisit only if installer size becomes critical.
- **Qt / PySide / Flutter rewrite** — reimplementing 11 tools duplicates months
  of work and permanently diverges from the in-flight web refactor.
- **Neutralino** — lighter but a weaker packaging/update story.

## 3. Repository layout (additive only)

```
desktop/                      # NEW — the only new product code dir
├── package.json              # electron + electron-builder + playwright (devDeps)
├── electron-builder.yml      # NSIS / DMG / AppImage+deb targets
├── src/main.js               # window, app:// protocol, menus
├── src/preload.js            # contextBridge: app version, dialog/export helpers
├── tests/smoke.test.mjs      # Playwright Electron smoke suite
└── README.md                 # run / package instructions per OS
docs/desktop-app-plan.md      # this file
.github/workflows/desktop.yml # CI packaging matrix (phase 3)
```

**Hard rules for this branch:** no changes under `tools/`, `assets/`, root
`index.html`, or root `package.json`. The root `package.json` test scripts keep
running against the web tree exactly as before.

## 4. Serving strategy

- Register a privileged `app://` scheme
  (`standard, secure, supportFetchAPI, corsEnabled, stream`) so `localStorage`,
  IndexedDB, `fetch`, and cross-page handoffs behave exactly as on the web.
- `app://bundle/<path>` resolves into the checkout's web root (`index.html`,
  `tools/`, `assets/`) with path-traversal protection and correct MIME types.
- **Dev:** `npm start` inside `desktop/` launches Electron straight from the
  checkout — the shell picks up the other agents' refactor commits with no copy
  step.
- **Packaged:** electron-builder packages the same web root plus `desktop/src/`.

## 5. Native capabilities (incremental, phase 2)

- Native Save/Open dialogs wired to the existing download/upload helpers
  (`labtoolsDownloadBlob`, `labtoolsReadFileAsArrayBuffer`) via a narrow
  contextBridge API — web behavior unchanged in a browser.
- Recent files, print-to-PDF (thermal-to-laser / label-generator sheets).
- `localStorage`/IndexedDB persist in the per-user Chromium profile — no storage
  schema changes; workbench data stays local on the machine.

Not planned initially: code signing and auto-update (documented follow-ups).

## 6. Testing & parity

- Existing unit + e2e suites continue to run against the web tree unchanged —
  they remain the parity gate and CI stays green.
- New `desktop/` smoke suite: launches Electron, opens the hub, loads every tool
  page, asserts `checkRuntime()` passes and the console is error-free.
- Manual visual-QA checklist per OS before a release.

## 7. Phases

1. **Shell** — window + `app://` protocol + menus; hub and all 11 tools run
   inside Electron; smoke suite green.
2. **Native integrations** — save/open dialogs, recent files, print-to-PDF.
3. **Packaging + CI** — electron-builder config, GitHub Actions matrix producing
   Windows/macOS/Linux artifacts.
4. **(Follow-up)** — code signing, auto-update, installer polish.

## 8. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Concurrent refactor moves fast | Branch only adds `desktop/` + docs; merge `feat/shared-layer-v2` (or `dev` after it lands) into `feat/desktop-app` regularly. Shell reads assets from the checkout, so it absorbs refactor commits automatically. |
| Storage semantics differ in Electron | `app://` registered as standard+secure keeps IndexedDB/localStorage and `?wbLoad=` handoffs identical; smoke test covers handoff flows. |
| Linux packaging | AppImage + deb cover mainstream distros; bundled Chromium means no system webview deps. |
| Installer size (~90–120 MB) | Accepted trade-off for consistent rendering; Tauri documented as fallback. |
| Nested worktree hygiene | `.worktrees/` is excluded from the main tree's status; do not run `git clean -fdx` in the main checkout while it exists. |
