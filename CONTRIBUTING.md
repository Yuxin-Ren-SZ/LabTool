# Contributing To LabTools

LabTools is a collection of zero-dependency, static HTML tools for cell biology bench work. This guide covers issues, pull requests, and manual validation. For coding-agent guidance, see [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md).

## Issue Format

Every issue title should follow this pattern:

```text
type: short description
```

Use lowercase type, colon, space, and a brief phrase. Do not add a scope suffix.

| Type | When to use | Example title |
|---|---|---|
| `bug` | Wrong output, broken UI, crash, or browser error | `bug: seeding calc shows NaN when bypass mode is active` |
| `feat` | New standalone tool or net-new capability | `feat: add protein dilution calculator tool` |
| `enhance` | UX or workflow improvement to existing behavior | `enhance: show recommended seeding range based on cell line` |
| `docs` | Wrong, missing, or unclear documentation | `docs: counting-modes diagram missing 5-square description` |
| `question` | Science, formula, or expected behavior question | `question: why does 4-corner mode divide rather than multiply` |

When opening an issue on GitHub, select the matching template. The templates include the current shipped tools: `cell-count`, `seeding-calc`, `microplate-layout-planner`, `stain-timer`, `thermal-to-laser`, and `drug-dosage`.

## Pull Requests

Target the `dev` branch, not `main`.

Use concise Conventional Commit-style subjects when possible:

```text
feat(seeding-calc): add bypass mode for known concentrations
fix(cell-count): correct multiplier for 5-square mode
enhance(microplate-layout-planner): improve 1536-well readability
docs(thermal-to-laser): document preset export behavior
style(css): align card padding tokens
```

Keep one concern per PR. If you add a new tool, update the root `index.html`, add `tools/<tool-name>/README.md`, and add the tool to relevant docs/templates.

## Development Workflow

The shipped tools need no build step, bundler, or runtime dependency — open the affected page directly in a browser. (The automated test suite is the one exception: it uses `puppeteer` as a devDependency; see below.) Open a tool:

```sh
open index.html
open tools/cell-count/index.html
```

Use an optional static server only when needed:

```sh
python3 -m http.server
```

## Automated Tests + Human Review

Run before opening a PR (Node ≥ 18):

```sh
node scripts/gen-fixtures.mjs --check   # fixtures up to date? (zero-dep)
npm ci                                  # dev deps (puppeteer + Chromium), once
npm test                                # unit + headless e2e; both gate CI
```

- **Unit** (`npm run test:unit`) — calc, schemas, workbench model. Zero-dep, fast.
- **e2e** (`npm run test:e2e`) — drives real tool pages in headless Chromium via
  `__labtoolsTestHooks`, with condition-polling (no fixed sleeps). Covers
  apply→serialize round-trips, parsers (authoritative snapshots in
  `tests/snapshots/`), the real IndexedDB workbench, and a per-producer
  live-serialize → `validateWorkbenchType` safety net.

If a change intentionally alters a parser's output, rebaseline the affected
snapshot with `npm run test:e2e:update` and commit it — a snapshot mismatch in
CI otherwise (correctly) fails the build.

Human visual-QA — drawer animation, cross-tab sync, and other things a machine
can't judge — lives on its own page. Serve the repo and walk the checklist:

```sh
python3 -m http.server 8000
# open http://localhost:8000/tests/review.html
```

Download the signed review into `tests/reports/` (gitignored).

## Manual Validation

For UI changes, open the affected tool, exercise the changed workflow, check the browser console, and verify a narrow mobile viewport if layout changed.

For calculation changes, compare outputs against the documented formula or a known sample value. Shared math helpers can be smoke-tested in the browser console, for example:

```js
calcCellDensity(80, 0.25, 20)
calcDoseFromBodyWeight(5, 'kg', 25, 'g')
```

For export changes, confirm the downloaded CSV, PDF, or config snippet has the expected filename and content. Browser-saved protocols, presets, and logs are local to the current browser and should not be treated as checked-in data.
