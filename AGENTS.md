# Repository Guidelines

## Project Structure & Module Organization

LabTools is a zero-dependency static site. The root `index.html` is the tool hub. Shared styling lives in `assets/css/labtools.css`, shared calculation helpers live in `assets/js/labtools-calc.js`, shared browser utilities live in `assets/js/labtools-common.js`, the workbench data-contract registry lives in `assets/js/labtools-types.js`, and the workbench store/drawer lives in `assets/js/labtools-workbench.js` (storage delegates to `assets/js/labtools-store.js` when loaded). Stage-1 v2 shared-layer modules — `labtools-contracts.js` (v2 contracts), `labtools-store.js` (storage core), `labtools-workflow.js` (chains/sessions), `labtools-runtime.js` (load-order self-check + manifest validation) — are additive and live under the `window.labtools.*` namespace; see `docs/architecture-v2-plan.md` for the staged migration plan. Each shipped tool is self-contained under `tools/<tool-name>/` with its own `index.html` and `README.md`.

Current tools are `cell-count`, `seeding-calc`, `microplate-layout-planner`, `stain-timer`, `thermal-to-laser`, and `drug-dosage`. Reference content belongs in `docs/`. Built-in browser-editable data lives in tool config files such as `tools/thermal-to-laser/preset-config.js` and `tools/drug-dosage/protocol-config.js`.

## Build, Test, And Development Commands

Shipped tools have no build step or runtime dependency. The only carve-out is dev/test tooling: `package.json` declares `puppeteer` (devDependency) for the headless e2e suite. Never import it from `tools/` or `assets/`.

- `open index.html`
  Opens the hub locally in a browser.
- `open tools/cell-count/index.html`
  Opens a specific tool for development and manual verification.
- `python3 -m http.server`
  Optional local server if you want navigation to behave more like GitHub Pages.
- `git status` and `git diff`
  Review only the files you intended to change before opening a PR.

## Coding Style & Naming Conventions

Use 2-space indentation in HTML, CSS, and JavaScript. Keep tools self-contained and framework-free. Put reusable math in `assets/js/labtools-calc.js` as pure global functions with no DOM dependencies. Put reusable browser helpers in `assets/js/labtools-common.js`. Use the shared design tokens in `labtools.css`; prefer `var(--token)` over hardcoded colors or spacing. Shared UI classes use the `lt-` prefix. Tool folders use kebab-case names such as `stain-timer`.

## Testing Guidelines

Automated tests are not configured. Open the affected `index.html`, exercise the changed workflow, check the browser console, and confirm outputs against expected formulas or sample values. For shared math helpers, quick browser-console smoke tests are expected, for example `calcCellDensity(80, 0.25, 20)` or `calcDoseFromBodyWeight(5, 'kg', 25, 'g')`.

### Automated test pipeline

Node ≥ 18. Fixtures + unit tests are zero-dependency; the e2e suite uses the
`puppeteer` devDependency (`npm ci`).

- `node scripts/gen-fixtures.mjs` — regenerate deterministic fixtures in `tests/fixtures/`
- `node scripts/gen-fixtures.mjs --check` — verify fixtures are up to date (CI)
- `npm run test:unit` (`node --test tests/unit/*.test.mjs`) — headless unit tests (calc library, fixture schemas, workbench data model)
- `npm run test:e2e` — headless-Chromium integration suite (`tests/e2e/`) that drives real
  tool pages via `__labtoolsTestHooks`, using condition-polling (no fixed sleeps).
  Covers apply→serialize round-trips, parsers (authoritative regenerable snapshots in
  `tests/snapshots/`), the real IndexedDB workbench (CRUD / export-import / strict rejection),
  and a per-producer live-serialize → `validateWorkbenchType` safety net. Runs in CI (gates merges).
- `npm test` — unit then e2e.
- After an intentional parser-output change, rebaseline snapshots with
  `npm run test:e2e:update` and commit them.
- Human visual-QA (drawer animation, cross-tab visuals) is a separate page:
  `python3 -m http.server 8000`, open `http://localhost:8000/tests/review.html`.

### Test hooks convention

Tools register stable test hooks so the harness never reaches into globals:

```js
labtoolsRegisterTestHooks('tool-name', {
  serialize: serializeForWorkbench,   // output the tool's workbench payload
  apply: applyFromWorkbench,          // inject a workbench payload
  state: function () { return { ... }; }, // summary state for assertions
});
```

`labtoolsRegisterTestHooks` is provided by `assets/js/labtools-workbench.js`. Every tool
that has workbench integration must register hooks; the harness fails loudly if a tool's
hooks are missing.

## Commit & Pull Request Guidelines

Target the `dev` branch, not `main`. Use concise Conventional Commit-style subjects such as `feat(stain-timer): ...`, `fix(seeding-calc): ...`, or `docs(README): ...` when possible. Keep one concern per PR. Include a clear summary, linked issue when applicable, and screenshots for UI changes. If you add a new tool, also update root `index.html`, add a tool-level `README.md`, and update issue-template tool lists.

## Security & Configuration Tips

Do not introduce build tooling or external dependencies without discussion. Keep the site portable for GitHub Pages and browser-file usage. Browser-saved presets, protocols, and logs use `localStorage`; they stay local and do not rewrite checked-in config files. Config export/copy features generate text for manual review before committing.
