# LabTools Testing Pipeline — Example Data + Automated Checks + Human Review

Status: plan (not yet implemented)
Scope: workbench cross-tool data flows + shared calc library
Constraint: **zero-dependency** — no npm packages, no build step. Node ≥ 18
(`node --test` is built-in) and a browser are the only tools used.

---

## Goal

1. Generate realistic **example data** for every tool and workbench data type.
2. **Automatically verify** that data serializes, round-trips, and flows between
   tools without corruption.
3. Produce a **human-reviewable report** (checklist + JSON) so a person signs off
   on the result instead of trusting the machine blindly.

---

## Architecture

```
scripts/gen-fixtures.mjs        → tests/fixtures/*           (deterministic, seeded RNG)
tests/unit/*.test.mjs           → node --test                (pure logic, no DOM)
tests/index.html                → browser harness            (iframes + IndexedDB, automated)
tests/reports/<run>.json        → human review artifact      (checklist + results + sign-off)
tests/snapshots/*.json          → committed expected outputs (diffable in PR review)
```

Pipeline (one command):

```sh
node scripts/gen-fixtures.mjs      # 1. regenerate fixtures (deterministic)
node --test tests/unit/            # 2. unit tests for pure logic (labtools-calc, schemas)
python3 -m http.server 8000        # 3. serve repo (required for same-origin iframes + IndexedDB)
# open http://localhost:8000/tests/index.html?run=auto
#    → harness runs in-browser integration checks
#    → renders PASS/FAIL matrix + human review checklist
#    → downloads tests/reports/<timestamp>.json for sign-off
```

GitHub Actions can run steps 1–2 headlessly (`node --test` only, no browser).

---

## 1. Fixture Generation — `scripts/gen-fixtures.mjs`

Deterministic (seeded PRNG, fixed date) so regenerating produces byte-identical
files. All fixtures written to `tests/fixtures/`.

### Fixture catalog

| Fixture | Format | Producer shape | Consumer(s) exercised |
|---|---|---|---|
| `plate-layout-96.json` | workbench `plate-layout` | microplate-layout-planner | qpcr-analysis, bca-assay |
| `plate-layout-8plate.json` | workbench `plate-layout` | planner (from gen-qpcr-layout.mjs, 8 plates × 3 genes) | qpcr-analysis multi-plate |
| `aria-mx-tabular.txt` | raw AriaMx Tabular Results export (tab-sep) | instrument | qpcr-analysis parser |
| `aria-mx-platesetup.txt` | raw Plate Setup export | instrument | qpcr-analysis parser |
| `nanodrop.csv` | raw Nanodrop CSV | instrument | rt-calc |
| `bca-raw.txt` | raw BCA plate file (block format) | instrument | bca-assay raw mode |
| `bca-manual.json` | manual-mode state (stdRows + smpRows) | bca-assay | bca-assay manual mode |
| `conc-data.json` | workbench `conc-data` | bca-assay | rt-calc, seeding-calc |
| `sample-list-rt.json` | workbench `sample-list` | rt-calc | qpcr-analysis, seeding-calc |
| `sample-list-cell.json` | workbench `sample-list` | cell-count | rt-calc |
| `seeding-plan.json` | workbench `seeding-plan` | seeding-calc | — (archive) |
| `protocol.json` | workbench `protocol` | stain-timer | stain-timer round-trip |
| `workbench-bundle.json` | full workbench export (version 1 envelope) | exportJSON | importJSON |

### Realism rules (so review is meaningful)

- **plate-layout-96**: 96-well, ≥3 groups (Control/Treatment A/Treatment B),
  sample names like `Ctrl_1…Ctrl_3`, gene field populated, colors from the
  planner palette, ~60% wells assigned.
- **plate-layout-8plate**: reuse the layout logic from `scripts/gen-qpcr-layout.mjs`
  (HPRT1 anchor + targets, NTC row H) — parse its CSV output back into the
  planner JSON shape so the two generators agree.
- **aria-mx-tabular**: ~48 rows, 3 targets + NTC/NRT wells, Cq values 18–38
  with plausible spreads, `Well Type` column, Threshold column, no tabs→tabs
  quirks, LF-only line endings (Windows exports use CRLF — include a CRLF
  variant fixture `aria-mx-tabular-crlf.txt` to pin parser behavior).
- **nanodrop.csv**: 6–8 samples, conc 50–1500 ng/µL, A260/280 ≈ 1.8–2.1,
  A260/230 ≈ 1.5–2.3, header row matching real Nanodrop export.
- **bca-raw.txt**: `##BLOCKS=` header block, standards in duplicate,
  8 unknowns, OD 0.05–1.8 (within Pierce 2000 µg/mL range).
- **conc-data**: results with known concentrations so consumers can be checked
  against expected values (e.g. sample X → 124.5 µg/mL).
- **protocol**: 6 steps, mixed `durationMin`/`durationSec`, slots 1–3 reused.

### Fixture schema self-check (in unit tests)

Every workbench fixture validates against its type's schema:
`type`, `label`, `tool`, `timestamp`, `data` (shape per type), `metadata`.
Missing/mistyped fields fail the test — this catches generator drift early.

---

## 2. Unit Tests (headless, zero-dep) — `tests/unit/`

Run with the built-in runner: `node --test tests/unit/`. No DOM, no server.

| File | Covers |
|---|---|
| `calc.test.mjs` | labtools-calc.js pure functions: `calcCellDensity`, `calcViabilityPct`, `avgTwo`, `fmt`/`fmtSig`, `autoBestConcUnit`, `bestVolumeDisplay`, `calcTotalCells`, `calcDoseFromBodyWeight`, `parseSampleAnnotation`, `tTestTwoSided`, `stdCurveFit`, `genormM` (uses a small VM/`eval` loader to pull functions out of the browser-style file) |
| `fixtures.test.mjs` | schema validation for every fixture in `tests/fixtures/`; stable-hash check (fixtures unchanged since last snapshot); round-trip JSON.stringify→parse |
| `workbench-model.test.mjs` | pure parts of workbench data model: label conflict rules, `TYPE_META` completeness (every type used by a tool has an entry), export envelope shape |

Note: `labtools-calc.js` and `labtools-workbench.js` are plain browser globals;
unit tests load them via `node:vm` with a minimal `window`/`document` shim
(only the pure functions are exercised — no DOM paths).

---

## 3. Browser Integration Harness — `tests/index.html`

The heart of the pipeline. Served same-origin (`http://localhost:8000`), so:
- iframes share the same IndexedDB → the workbench is real
- each tool's `window.__labtoolsTestHooks[<tool>]` (registered via
  `labtoolsRegisterTestHooks` in labtools-workbench.js) exposes a stable
  `serialize()` / `apply(data, type)` / optional state accessors — the
  harness drives tools through these hooks only

### Tool hook registration (one block per tool)

```js
// in each tool, after its workbench integration functions
labtoolsRegisterTestHooks('microplate-layout-planner', {
  serialize: serializeForWorkbench,
  apply: applyFromWorkbench,
  state: function () { return { plates: plates, fields: fields }; },
});
```

`labtoolsRegisterTestHooks` lives in `labtools-workbench.js`:

```js
function labtoolsRegisterTestHooks(toolName, hooks) {
  window.__labtoolsTestHooks = window.__labtoolsTestHooks || {};
  window.__labtoolsTestHooks[toolName] = hooks;
}
window.labtoolsRegisterTestHooks = labtoolsRegisterTestHooks;
```

### How it runs

1. `?run=auto` → harness clears IndexedDB, seeds fixtures via `workbench.put`,
   then for each tool flow:
   a. loads the tool in a hidden iframe,
   b. waits for its `DOMContentLoaded` + init,
   c. **injects** fixture data via the tool's own `applyFromWorkbench`
      (or sets `state` directly where no apply path exists),
   d. **extracts** via the tool's own `serializeForWorkbench` (or DOM reads),
   e. compares against `tests/snapshots/*.json` (loaded via fetch),
   f. records pass/fail with the actual diff.
2. Renders a matrix: flow → PASS/FAIL → diff (click to expand).
3. Renders the **human review checklist** (below).
4. `Download report` button → `tests/reports/<ISO-timestamp>.json`.

### Automated flows (the matrix)

| # | Flow | Verify |
|---|---|---|
| 1 | planner serialize → qpcr apply (single plate) | sample/gene/group maps on correct wells, `userNamed` set |
| 2 | planner serialize → qpcr apply (8-plate) | multi-plate well resolution (`plate␟A1`), genes per dye |
| 3 | planner serialize → planner apply (self round-trip) | plates/fields/categories identical after JSON round-trip |
| 4 | bca serialize (conc-data) → rt-calc apply | sample conc values land in the right rows; µg/mL→ng/µL equivalence |
| 5 | bca serialize → seeding-calc apply | bypass concentration populated, unit selected |
| 6 | rt-calc serialize (sample-list) → qpcr apply | sample names applied to wells |
| 7 | cell-count serialize → rt-calc apply | single-sample conc lands in row 1 |
| 8 | stain-timer serialize → stain-timer apply | protocol steps identical after round-trip |
| 9 | seeding-calc serialize (seeding-plan) | payload shape + values correct |
| 10 | workbench core: put/get/findByName/remove/clear | CRUD + duplicate-label overwrite prompt path |
| 11 | exportJSON → importJSON round-trip | bundle survives, duplicates skipped, ids stable |
| 12 | aria-mx parser on `aria-mx-tabular.txt` (LF + CRLF) | records parsed, wells/Cq/threshold correct |
| 13 | nanodrop parser on `nanodrop.csv` | sample table populated |
| 14 | bca raw-mode parser on `bca-raw.txt` | standards + unknowns parsed, curve fits, conc results match snapshot |

Each flow asserts **exact values** against snapshots where the fixture has
known numbers (e.g. conc-data sample X = 124.5 µg/mL), and **structural
equality** elsewhere.

### Human review checklist (rendered on the harness page)

Each item is a checkbox the reviewer ticks after visual inspection; the report
records checked/unchecked + reviewer name + notes:

- [ ] Drawer opens from left tab on root page; content groups render
- [ ] Drawer opens on a tool page; item cards show label/tool/time
- [ ] Rename (double-click) and delete work from the drawer
- [ ] Export JSON download opens; Import JSON re-imports (same browser)
- [ ] Flow 1: qPCR plate heatmap shows groups/genes after import
- [ ] Flow 4: RT sample table shows concentrations after import
- [ ] Flow 8: stain protocol table shows imported steps
- [ ] Duplicate-label save prompts "Overwrite?" and replaces
- [ ] Two browser tabs: save in tab A appears in tab B's drawer (BroadcastChannel)
- [ ] No console errors on any tool page during the flows

---

## 4. Human Review Workflow

1. Developer/CI runs `node scripts/gen-fixtures.mjs && node --test tests/unit/`
   — headless gate, must be green before browser review.
2. Developer opens the harness, clicks **Run**, reviews the matrix + checklist,
   ticks items, downloads `tests/reports/<timestamp>.json`.
3. **Snapshots**: expected outputs are committed (`tests/snapshots/`). A PR
   that changes tool output shows up as a snapshot diff → reviewer decides if
   the change is intended (update snapshot) or a regression (fix code).
4. Optionally commit the review report alongside a PR as evidence of sign-off.

### Snapshot update policy

- Snapshot files are **committed** (like the existing `qpcr-layout-*.csv`).
- `node scripts/gen-fixtures.mjs --update-snapshots` regenerates both fixtures
  and snapshots when an output change is intentional (documented in the PR).
- `--check` mode (default in CI) fails when fixtures/snapshots drift.

---

## 5. Files To Create

| File | Kind | Purpose |
|---|---|---|
| `scripts/gen-fixtures.mjs` | create | deterministic fixture generator |
| `tests/fixtures/*` | create (generated) | 14 fixture files above |
| `tests/unit/calc.test.mjs` | create | calc-library unit tests |
| `tests/unit/fixtures.test.mjs` | create | schema + stability tests |
| `tests/unit/workbench-model.test.mjs` | create | workbench data-model tests |
| `tests/unit/helpers.mjs` | create | vm loader for browser-global JS |
| `tests/index.html` | create | browser integration harness (manual review) |
| `tests/snapshots/*.json` | create (generated) | committed expected outputs |
| `assets/js/labtools-workbench.js` | modify | add `labtoolsRegisterTestHooks` helper |
| 8 tool pages | modify | register `__labtoolsTestHooks` per tool |
| `.gitignore` | modify | ignore `tests/reports/*.json` |
| `AGENTS.md` | modify | document testing commands + hooks convention |
| `CONTRIBUTING.md` | modify | add "run the test pipeline" to PR workflow |
| `.github/workflows/test.yml` | create | CI: fixtures + unit tests on push/PR (no browser) |

No new dependencies anywhere. Node ≥ 18 for `node --test`; CI runner uses
`actions/setup-node` (no npm install — nothing to install).

---

## Decisions (user-confirmed 2026-07-31)

1. **Test hooks** — each tool registers an explicit
   `window.__labtoolsTestHooks[<tool>]` via a shared helper
   (`labtoolsRegisterTestHooks(toolName, hooks)` in labtools-workbench.js).
   Harness drives tools through these hooks only — never by reaching into
   globals. Convention documented in AGENTS.md; a future tool that wraps its
   script in a closure only needs to add the registration call.
2. **Reports** — `tests/reports/` is **gitignored** (local review evidence).
   Committed snapshots (`tests/snapshots/`) remain the regression-diffing
   mechanism.
3. **No CI browser step** — GitHub Actions runs fixtures + unit tests only
   (headless, zero-dep). The browser harness is manual: a human opens
   `tests/index.html`, reviews the flows, and ticks the checklist in the
   browser.

---

## Rollout Order

1. `scripts/gen-fixtures.mjs` + fixtures + schema unit tests (headless green).
2. `tests/index.html` harness with flows 10–14 (workbench core + parsers —
   no tool integration needed yet).
3. Tool integration flows 1–9 (needs the workbench integration code that now
   exists on `feat/workbench`).
4. Snapshots + `--update-snapshots`/`--check` modes.
5. CI workflow + CONTRIBUTING/AGENTS docs.
6. Human review checklist polish (screenshots in reports via canvas export).

---

## Open Questions

1. **Harness iframe access** — tools expose globals today; if a future tool
   wraps its script in a closure, the harness breaks. Accept (documented
   convention) or add a tiny `window.__labtoolsTestHooks` to each tool?
   (Recommend: accept for now, note in AGENTS.md.)
2. **Report storage** — keep `tests/reports/` gitignored (local evidence) or
   commit a `latest.json` for PR diff review? (Recommend: gitignore; snapshots
   already cover regression diffing.)
3. **CI browser step** — headless browser (Playwright) would let CI run the
   harness too, but adds a dependency. (Recommend: defer; unit tests + human
   harness cover the pipeline for now.)
