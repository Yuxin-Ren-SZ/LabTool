# Contributing to LabTools

LabTools is a collection of zero-dependency, static HTML tools for cell biology bench work. This guide covers how to file issues and submit pull requests. For how to build or modify a tool, see [CLAUDE.md](CLAUDE.md).

This guide is written for both human contributors and AI agents.

---

## Issue format

Every issue title must follow this pattern:

```
type: short description
```

Lowercase type, colon, space, brief phrase. No scope suffix.

| Type | When to use | Example title |
|---|---|---|
| `bug` | Wrong output or broken behavior | `bug: seeding calc shows NaN when bypass mode is active` |
| `feat` | New tool or net-new capability | `feat: add protein dilution calculator tool` |
| `enhance` | UX or flow improvement to an existing tool | `enhance: show recommended seeding range based on cell line` |
| `docs` | Wrong or missing documentation | `docs: counting-modes diagram missing 5-square description` |
| `question` | Science or tool behavior question | `question: why does 4-corner mode divide rather than multiply` |

When opening an issue on GitHub, select the matching template — it pre-fills the body structure for you.

---

## Issue types in detail

**`bug`** — The tool produces wrong results, crashes, or behaves unexpectedly. Include steps to reproduce, what you expected, and what actually happened. Paste any browser console errors.

**`feat`** — You want something that does not exist yet: a new standalone tool, a new calculation mode, or a capability the tool has never had. Describe the bench workflow gap it fills and the formula or scientific basis if relevant.

**`enhance`** — The tool works correctly but could be better. Examples: clearer labels, additional unit options, smarter defaults, improved layout on mobile. If the tool is producing wrong output, use `bug` instead. If you want a wholly new capability, use `feat` instead.

**`docs`** — A README, the counting-modes reference, or any other written documentation is incorrect, incomplete, or misleading. If the tool itself computes the wrong answer, that is a `bug`, not a `docs` issue.

**`question`** — You want to understand the science behind a formula, why a particular design decision was made, or what a specific output means. Questions are welcome and do not require a code change to be resolved.

---

## Opening a pull request

**Base branch: `dev`** — never target `main` directly.

**Commit message format:** `type(scope): short description`

The scope is typically the tool name or the shared asset being changed:

```
feat(seeding-calc): add bypass mode for known concentrations
fix(cell-count): correct multiplier for 5-square mode
enhance(seeding-calc): highlight warning when V₁ exceeds stock volume
docs(README): add link to counting-modes reference
style(css): align card padding tokens
```

**One concern per PR.** Do not bundle an unrelated bug fix into a feature PR.

**No build step.** Open the affected `index.html` directly in a browser to verify your change. There is no package manager, bundler, or test runner to run. See [CLAUDE.md](CLAUDE.md) for the full development workflow and design system conventions.
