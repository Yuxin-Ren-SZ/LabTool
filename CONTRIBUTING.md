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

When opening an issue on GitHub, select the matching template. The templates include the current shipped tools: `cell-count`, `seeding-calc`, `experiment-layout`, `stain-timer`, `thermal-to-laser`, and `drug-dosage`.

## Pull Requests

Target the `dev` branch, not `main`.

Use concise Conventional Commit-style subjects when possible:

```text
feat(seeding-calc): add bypass mode for known concentrations
fix(cell-count): correct multiplier for 5-square mode
enhance(experiment-layout): improve 1536-well readability
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

## Manual Validation

For UI changes, open the affected tool, exercise the changed workflow, check the browser console, and verify a narrow mobile viewport if layout changed.

For calculation changes, compare outputs against the documented formula or a known sample value. Shared math helpers can be smoke-tested in the browser console, for example:

```js
calcCellDensity(80, 0.25, 20)
calcDoseFromBodyWeight(5, 'kg', 25, 'g')
```

For export changes, confirm the downloaded CSV, PDF, or config snippet has the expected filename and content. Browser-saved protocols, presets, and logs are local to the current browser and should not be treated as checked-in data.
