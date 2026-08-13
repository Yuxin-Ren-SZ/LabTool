# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

LabTools is a collection of zero-dependency, static HTML tools for cell biology bench work. Each tool is browser-runnable and mostly self-contained, with shared assets for common styling, pure calculation utilities, and small browser helpers.

**Dependency policy:** the *shipped* tools have no build step, bundler, or runtime dependency — that is a hard rule. The *dev/test tooling* is the one carve-out: `package.json` declares `puppeteer` as a devDependency so the headless e2e suite (`tests/e2e/`) can drive real tool pages in CI. Nothing under `tools/` or `assets/` may import it.

## Development And Deployment

Hosted on GitHub Pages from the `dev` branch. Open any `index.html` directly in a browser for development. An optional `python3 -m http.server` can be used when testing browser navigation or secure-context behavior is not required.

## Architecture

```text
LabTools/
├── index.html                         # Hub page; add new tools here
├── assets/
│   ├── css/labtools.css               # Shared design system
│   └── js/
│       ├── labtools-calc.js           # Shared pure-function utilities
│       ├── labtools-common.js         # Shared browser utilities (download/clipboard/escape/decode/fit)
│       ├── labtools-types.js          # Data-contract registry (workbench payload schemas)
│       ├── labtools-contracts.js      # v2 contract registry + legacy type mapping
│       ├── labtools-store.js          # Pluggable IndexedDB storage core (memory backend for tests)
│       ├── labtools-workflow.js       # Chain graph + session records + handoff wiring
│       ├── labtools-runtime.js        # Load-order self-check + manifest validation
│       ├── labtools-workbench.js      # Workbench: store-backed drawer UI (single storage path)
│       ├── labtools-artifact.js       # Artifact model: params↔CSV/JSON codec + tool bridge
│       └── labtools-artifact-ui.js    # Artifact control cluster + field-port wiring UI
├── tools/
│   ├── cell-count/index.html          # Hemocytometer calculator
│   ├── seeding-calc/index.html        # Count-to-dilution workflow
│   ├── microplate-layout-planner/index.html   # Microplate Layout Planner
│   ├── stain-timer/index.html         # Staining protocol timer
│   ├── thermal-to-laser/index.html    # Thermal PDF to laser sheet converter
│   ├── drug-dosage/index.html         # Per-animal dose calculator and log
│   ├── qpcr-plate-planner/index.html  # Sample-combination → multi-plate qPCR layout generator
│   └── qpcr-analysis/index.html       # Agilent qPCR analyzer (multi-plate, QC, curves, ΔΔCq, stats, MIQE)
└── docs/
    ├── counting-modes.html            # Hemocytometer mode reference
    └── plate-dimensions.template.json # Plate geometry reference template
```

## Shared Calculation Library

`assets/js/labtools-calc.js` exposes plain globals and has no DOM dependency. Tools load it with a relative script tag when needed.

Key exports include:

- `avgTwo(a, b)`, `fmt(n)`, and `fmtSig(n)`
- `bestVolumeDisplay(mL)` and `autoBestConcUnit(cellsPerML)`
- `convertBodyWeight(value, fromUnit, toUnit)`
- `calcDoseFromBodyWeight(doseValue, doseWeightUnit, bodyWeightValue, bodyWeightUnit)`
- `restrictToNumeric(event)`
- `calcCellDensity(count, multiplier, df)`, `calcTotalCells(density, volML)`, and `calcViabilityPct(live, dead)`
- `makeDiagram(largeHL, smallHL)`
- `MODES`, `SMALL_ALL`, and `SMALL_5`
- qPCR statistics (used by `tools/qpcr-analysis/`): `parseSampleAnnotation(name)`,
  `tTestTwoSided(a, b, opts)`, `studentTPvalue(t, df)`, `tCritical(df, alpha)`,
  `stdCurveFit(points)`, and `genormM(cqByGene)`
- qPCR plate planning (used by `tools/qpcr-plate-planner/`): `qpcrBuildSamples(factors, opts)`
  (cartesian product of factors → samples, with skip-exceptions), `qpcrPackPlates(cfg)`
  (band-packs samples×genes into plates; enforces the reference-anchor-on-every-plate
  invariant), and `qpcrToPlateLayout(packed)` (→ workbench `plate-layout` payload)

Quick console checks:

```js
calcCellDensity(80, 0.25, 20)  // 4000000
calcDoseFromBodyWeight(5, 'kg', 25, 'g')  // 0.125
parseSampleAnnotation('Control_2')  // { group: 'Control', bioRep: '2' }
tTestTwoSided([1,2,3],[4,5,6]).p  // ~0.0213 (two-tailed, on ΔCq)
stdCurveFit([{quantity:1,cq:30},{quantity:10,cq:26.68}]).E  // ~2.0
qpcrBuildSamples([{name:'T',values:['Ctrl','T1']},{name:'TP',values:['1','2']}]).length  // 4
qpcrPackPlates({plates:[{name:'P1',bands:[{name:'HPRT1',role:'reference'},null,null]}],
  samples:['S1'],referenceGenes:['HPRT1']}).plates.length  // 1
```

## Shared Browser Utilities

`assets/js/labtools-common.js` contains DOM/browser helpers used by larger tools:

- `labtoolsDownloadBlob(filename, blob)`
- `labtoolsDownloadText(filename, content, mimeType)`
- `labtoolsReadFileAsArrayBuffer(file)`
- `labtoolsCopyText(text)`
- `labtoolsSafeJsonParse(raw, fallback)`
- `labtoolsHandoffTo(nextUrl, type, label, data, metadata, tool)` — workflow
  deep-link: `workbench.put(...)` then navigate to `nextUrl?wbLoad=<id>`
- `labtoolsConsumeHandoff(applyFn)` — on load, if `?wbLoad=<id>` is present, fetch
  that workbench item, call `applyFn(data, type, item)`, and strip the param

Keep these generic and dependency-free.

## Tool Workflows (deep-link handoffs)

Tools chain into **workflows** without importing each other's code: a producer
calls `labtoolsHandoffArtifact(tool, nextUrl, label)` (artifact envelope →
workbench → navigate with `?wbLoad=<id>&wbSession=<sid>`), and the consumer
calls `labtoolsConsumeArtifactHandoff(tool, applyInputs)` on load to wire the
upstream outputs into its input ports (field-id matching; missing required
ports get a manual-fill dialog). Sessions are recorded via
`labtools.workflow.recordStep` and surface on the hub as "Recent Sessions /
continue". Current chains: `cell-count → seeding-calc`, `rt-calc →
qpcr-analysis`, `qpcr-plate-planner → microplate-layout-planner →
qpcr-analysis`, `bca-assay → rt-calc / seeding-calc`. qpcr-analysis stashes a
handoff until a results file is loaded (`pendingHandoffLayout`).

## Data Contract Registry

`assets/js/labtools-types.js` is the single source of truth for workbench data
shapes. It defines `DATA_TYPES` (per type: name, icon, color, description,
producers, consumers, and a validation schema) plus two helpers:

- `validateWorkbenchType(type, data)` — strict schema check returning
  `{ valid, errors }`
- `labtoolsRegisterToolTypes(toolName, produces, consumes)` — tools declare
  which data types they can save/load

`workbench.put()` validates payloads against the registry and **rejects**
schema-violating data (strict mode). Each tool declares its types once:

```js
labtoolsRegisterToolTypes('qpcr-analysis', ['qpcr-results'], ['plate-layout', 'sample-list']);
```

Load `labtools-types.js` BEFORE `labtools-workbench.js` in every page that
uses the workbench. Unit tests (`tests/unit/types.test.mjs`) enforce that every
declared type exists in the registry and that fixtures validate.

## Shared Layer v2 (fully wired — stages 1–4 shipped)

Five new zero-dependency modules under the `window.labtools.*` namespace, each
registering itself in `window.__labtoolsLoadOrder` (the load-order self-check
reads it). All are additive; existing tool pages are unchanged.

- `labtools-contracts.js` — v2 contract registry (`labtools.contracts`): schema
  v2 mini-language (enum/pattern/min/max/anyOf/oneOf/custom validate), flat
  field-map validation, `syncLegacy()` maps every `DATA_TYPES` type to a
  contract. See `docs/architecture-v2-plan.md` §3.3.
- `labtools-store.js` — storage core (`labtools.store`): `createStore(opts)`
  with pluggable backend (lazy browser IndexedDB adapter), migration functions,
  record validator, and `timestamps:false` mode that stores records
  byte-identically (used to keep legacy workbench records unchanged).
  `createMemoryBackend()` makes migrations/CRUD unit-testable in Node.
- `labtools-workflow.js` — chain graph (`defineChain`/`nextFor`/`path`),
  session records (`newSession`/`appendStep`), and artifact-envelope handoff
  wiring (`buildHandoffEnvelope`/`applyHandoff`). Pure logic.
- `labtools-runtime.js` — `SCRIPT_ORDER` + `checkRuntime`/`checkLoadOrder`
  self-checks, `validateManifest`, and `boot()` (registers types/test hooks,
  injects a visible alert banner when required scripts are missing).
- `labtools-workbench.js` — storage goes through the shared storage core
  (`labtools.store`, REQUIRED — load order `types → store → workbench`).
  `timestamps:false` keeps the legacy record shape
  `{id,type,label,tool,timestamp,data,metadata}` byte-identical. The phase-5
  inline IndexedDB fallback is gone; operations throw when `labtools-store.js`
  is missing. `window.__labtoolsWorkbenchBackend` is the unit-test injection
  point.
  **Phase 2:** the database is version 2 with a second object store
  `records` (v2 envelopes, `upgradeV2` builds the schema for both stores);
  `window.__labtoolsV2Records.copyLegacyToRecords()` lazily copies legacy
  `items` into `records` as `kind:'legacy'` (idempotent). Drawer/picker/
  toast UI uses canonical `lt-` classes (`lt-workbench-*`/`lt-toast`/
  `lt-picker-*`) — the old `wb-` classes are gone.

`labtools-common.js` also gained `labtoolsEscapeHtml`, `labtoolsDecodeBuffer`
(UTF-8/UTF-16 BOM), and `labtoolsFitLinear`/`labtoolsFitQuadratic` (least
squares, ported from bca-assay).

## Artifact Model (full-state recovery + output wiring)

`assets/js/labtools-artifact.js` treats each tool as a pure function
`outputs = f(inputs, params)`, where **every control (button, selection, toggle,
field) is a `param`**. One canonical envelope —
`{ schemaVersion, tool, params, inputs, outputs }` — is saved/exported, and JSON
and CSV are two encodings of the *same* information, so either fully recovers the
tool. `params` are canonical; `outputs` are a derived projection kept for CSV
readability and for field-port wiring. Output field-ids are cataloged in
`docs/output-fields.md` (wiring matches by id string).

Exposes: `labtoolsFlatten`/`labtoolsUnflatten` (lossless nesting↔flat, type- and
empty-container-preserving), `labtoolsRowsToCsv`/`labtoolsCsvToRows` (RFC-4180),
`labtoolsArtifactToCsv`/`labtoolsCsvToArtifact`, `labtoolsBuildArtifact`/
`labtoolsValidateArtifact`, `labtoolsMatchWiring(outputs, ports)` →
`{ resolved, missing, ignored }`, and the **`labtoolsDefineTool(spec)`** bridge
(registers types + provides `build`/`toCsv`/`fromCsv`/`restore`/`exportCsv`/`save`).

A migrated tool declares `readParams`/`applyParams`/`readOutputs` (explicit,
per-tool — capture ALL control state, restore it, let the existing reactive render
recompute) plus `outputFields`/`inputPorts`, then instantiates the bridge. The
`artifact` workbench type validates the envelope. **Migrated** (with e2e
`params→CSV→params` identity in `tests/e2e/artifact.test.mjs`): cell-count,
seeding-calc, rt-calc, bca-assay, qpcr-analysis, microplate-layout-planner,
qpcr-plate-planner, stain-timer. Legacy `serializeForWorkbench`/`applyFromWorkbench`
paths are kept alongside (coexistence), and each tool keeps an explicit
`labtoolsRegisterToolTypes(...)` line (the static `types.test` scans for it; the
bridge also registers at runtime — idempotent). **Intentionally NOT migrated:**
`thermal-to-laser` and `label-generator` — PDF/label generators whose output is not
wireable data and whose config has its own localStorage persistence.

Load order per page (workbench pages): `labtools-types.js` → `labtools-store.js`
→ `labtools-workbench.js` → `labtools-common.js` → `labtools-artifact.js` →
`labtools-artifact-ui.js` → [`labtools-workflow.js` (chain tools)] →
`labtools-runtime.js` → `manifest.js`.

**Integration status:** the artifact model is fully wired to the UI. Every
migrated tool mounts `labtoolsMountArtifactControls` (Save/Export/Import/Load
state buttons), producers hand off via `labtoolsHandoffArtifact` (artifact
envelope + session), consumers wire via `labtoolsConsumeArtifactHandoff`
(field-port matching + manual-fill dialog for unmatched required ports), and
the hub renders from `assets/js/labtools-hub-config.js`. Legacy
`serializeForWorkbench`/`applyFromWorkbench`/typed Save-Load remain as a
frozen compatibility layer (see docs/architecture-v2-plan.md stage-5 note) —
they still power the typed Save/Load buttons and the e2e contract tests.
bca-assay's plate/raw mode `applyParams` is implemented but only manual-mode
is e2e-verified.

## Shared Design System

`assets/css/labtools.css` defines CSS custom properties and `lt-` prefixed component classes such as `.lt-card`, `.lt-btn`, `.lt-badge`, `.lt-label`, `.lt-nav`, `.lt-footer`, `.lt-divider`, alerts, segmented controls, sheet previews, and result blocks.

Use `var(--token)` for colors, spacing, and radii. Tool-specific overrides belong in a `<style>` block inside the tool page unless the pattern is shared across tools.

## Tool Independence

Tools should not import from each other. For example, `tools/seeding-calc/` contains its own count UI instead of importing from `tools/cell-count/`. Shared logic belongs in `assets/js/labtools-calc.js` or `assets/js/labtools-common.js` only when it is genuinely reusable.

Browser-saved presets, protocols, and logs use `localStorage`. Built-in config files are normal checked-in JavaScript files, but browser save actions do not rewrite them directly.

## Adding A New Tool

1. Create `tools/<tool-name>/` with `index.html` and `manifest.js`
   (`window.labtoolsToolManifest` — id/name/icon/desc/category/produces/
   consumes/outputFields/inputPorts/next).
2. Link `../../assets/css/labtools.css` and the shared JS in canonical order
   (types → store → workbench → common → artifact → artifact-ui →
   [workflow] → runtime → manifest).
3. Add an entry to `assets/js/labtools-hub-config.js` (`LABTOOLS_HUB_TOOLS`,
   plus `LABTOOLS_HUB_CHAINS` edges if it joins a workflow).
4. Add `tools/<tool-name>/README.md`.
5. Update top-level docs and GitHub issue-template tool lists.
6. Manually verify the page in a browser and check the console.

## Counting Mode Formula

```text
Final Concentration (cells/mL) = avg_count x multiplier x DF x 10^4
```

| Mode | Multiplier |
|---|---:|
| All 25 small squares | 1 |
| 5 small squares | 5 |
| 4 corner squares | 0.25 |
| 1 corner square | 1 |

The `10^4` factor comes from the hemocytometer large-square volume of 0.1 uL = 10^-4 mL.
