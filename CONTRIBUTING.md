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

There is no build step, package manager, bundler, or test runner. Open the affected page directly in a browser:

```sh
open index.html
open tools/cell-count/index.html
```

Use an optional static server only when needed:

```sh
python3 -m http.server
```

## Automated Tests + Human Review

Headless checks (Node ≥ 18, no dependencies — run before opening a PR):

```sh
node scripts/gen-fixtures.mjs --check   # fixtures up to date?
node --test 'tests/unit/*.test.mjs'     # unit tests (calc, schemas, workbench model)
```

Browser review (required when workbench data flows or tool serialization change):

```sh
python3 -m http.server 8000
# open http://localhost:8000/tests/index.html?run=auto
```

The harness loads every tool in a same-origin iframe, drives it through its
`__labtoolsTestHooks`, and diffs outputs against committed snapshots in
`tests/snapshots/`. It also renders a human-review checklist; tick each item
after visual inspection and download the report into `tests/reports/` (gitignored).

If a change intentionally alters tool output, re-capture snapshots from the
harness ("Capture Snapshots") and commit them alongside the change — a stale
snapshot diff in review means the output changed unexpectedly.

## Manual Validation

For UI changes, open the affected tool, exercise the changed workflow, check the browser console, and verify a narrow mobile viewport if layout changed.

For calculation changes, compare outputs against the documented formula or a known sample value. Shared math helpers can be smoke-tested in the browser console, for example:

```js
calcCellDensity(80, 0.25, 20)
calcDoseFromBodyWeight(5, 'kg', 25, 'g')
```

For export changes, confirm the downloaded CSV, PDF, or config snippet has the expected filename and content. Browser-saved protocols, presets, and logs are local to the current browser and should not be treated as checked-in data.
