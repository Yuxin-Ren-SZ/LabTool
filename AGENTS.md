# Repository Guidelines

## Project Structure & Module Organization

LabTools is a zero-dependency static site. The root `index.html` is the tool hub. Shared styling lives in `assets/css/labtools.css`, shared calculation helpers live in `assets/js/labtools-calc.js`, and shared browser utilities live in `assets/js/labtools-common.js`. Each shipped tool is self-contained under `tools/<tool-name>/` with its own `index.html` and `README.md`.

Current tools are `cell-count`, `seeding-calc`, `experiment-layout`, `stain-timer`, `thermal-to-laser`, and `drug-dosage`. Reference content belongs in `docs/`. Built-in browser-editable data lives in tool config files such as `tools/thermal-to-laser/preset-config.js` and `tools/drug-dosage/protocol-config.js`.

## Build, Test, And Development Commands

There is no build step, package manager, or required dev server.

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

## Commit & Pull Request Guidelines

Target the `dev` branch, not `main`. Use concise Conventional Commit-style subjects such as `feat(stain-timer): ...`, `fix(seeding-calc): ...`, or `docs(README): ...` when possible. Keep one concern per PR. Include a clear summary, linked issue when applicable, and screenshots for UI changes. If you add a new tool, also update root `index.html`, add a tool-level `README.md`, and update issue-template tool lists.

## Security & Configuration Tips

Do not introduce build tooling or external dependencies without discussion. Keep the site portable for GitHub Pages and browser-file usage. Browser-saved presets, protocols, and logs use `localStorage`; they stay local and do not rewrite checked-in config files. Config export/copy features generate text for manual review before committing.
