# Repository Guidelines

## Project Structure & Module Organization
LabTools is a zero-dependency static site. The root [index.html](/Users/yuxinren/Code/LabTools/index.html) is the tool hub. Shared styling lives in [assets/css/labtools.css](/Users/yuxinren/Code/LabTools/assets/css/labtools.css), and shared calculation helpers live in [assets/js/labtools-calc.js](/Users/yuxinren/Code/LabTools/assets/js/labtools-calc.js). Each tool is self-contained under `tools/<tool-name>/` with its own `index.html` and `README.md` (for example, `tools/cell-count/` or `tools/seeding-calc/`). Reference content belongs in `docs/`.

## Build, Test, and Development Commands
There is no build step, package manager, or dev server.

- `open index.html`
  Opens the hub locally in a browser.
- `open tools/cell-count/index.html`
  Opens a specific tool for development and manual verification.
- `python3 -m http.server`
  Optional local server if you want browser navigation to behave more like GitHub Pages.
- `git status` and `git diff`
  Review only the files you intended to change before opening a PR.

## Coding Style & Naming Conventions
Use 2-space indentation in HTML, CSS, and JavaScript. Keep tools self-contained and framework-free. Put reusable math in `assets/js/labtools-calc.js` as pure global functions with no DOM dependencies. Use the shared design tokens in `labtools.css`; prefer `var(--token)` over hardcoded colors or spacing. Shared UI classes use the `lt-` prefix. Tool folders use kebab-case names such as `stain-timer`.

## Testing Guidelines
Automated tests are not configured here, so validation is manual. Open the affected `index.html` file, exercise the changed workflow, and confirm outputs against expected formulas or sample values. For shared math helpers, quick smoke tests in the browser console are expected, for example `calcCellDensity(80, 0.25, 20)`.

## Commit & Pull Request Guidelines
Target the `dev` branch, not `main`. Recent history uses concise Conventional Commit-style subjects such as `feat(stain-timer): ...` and `fix(seeding-calc): ...`; follow `type(scope): short description` when possible. Keep one concern per PR. Include a clear summary, linked issue when applicable, and screenshots for UI changes. If you add a new tool, also update the root `index.html` and include a tool-level `README.md`.

## Security & Configuration Tips
Do not introduce build tooling or external dependencies without discussion. Keep the site portable for GitHub Pages and browser-file usage.
