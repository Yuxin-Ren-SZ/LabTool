# LabTools Improvement Roadmap

Generated from comprehensive audit of all 10 tools (2026-06-27).

## ✅ DONE — Critical Bug Fixes

- [x] **seeding-calc** — bypass export writes `res-density` (true cells/mL), not raw K/M/B input (off by 10⁹)
- [x] **bca-assay** — `interpolate()` guards `slope===0`/non-finite → returns NaN on flat standards
- [x] **bca-assay** — conc-unit toggle uses shared `.lt-segmented` classes (was undefined `seg-btn`)
- [x] **rt-calc** — auto-scale verifies target fits rxnAvail before committing 2×/1.5×
- [x] **stain-timer** — dropped dead `step_complete` branch in `toggleStartPause`

## ✅ DONE — Design-System Migration

- [x] **label-generator** — migrated from custom `lg-` system to shared `lt-` shell
- [x] **bca-assay** — `.page-title/.page-sub` → `lt-tool-title/lt-tool-subtitle`
- [x] **rt-calc** — title, buttons, mode tabs → shared `lt-` classes
- [x] **qpcr-analysis** — title, buttons, segmented controls → shared `lt-` classes
- [x] **cell-count** — `btn-reset` → `lt-btn lt-btn-ghost`
- [x] **seeding-calc** — `btn-reset/btn-next/btn-back` → shared `lt-btn` variants
- [x] **stain-timer** — `btn-run/btn-start/btn-skip` → shared `lt-btn` variants

## ✅ DONE — Workbench (cross-tool data clipboard)

- [x] **labtools-workbench.js** — IndexedDB store + BroadcastChannel cross-tab sync + drawer UI
- [x] **Root page + all tools** — left drawer (toggle tab, grouped by type, rename/delete/export/import)
- [x] **microplate-layout-planner** — save/load `plate-layout`
- [x] **qpcr-analysis** — save `qpcr-results`, load `plate-layout` / `sample-list` as labels
- [x] **bca-assay** — save `conc-data`, load `plate-layout`
- [x] **rt-calc** — save `sample-list`, load `conc-data` / `sample-list`
- [x] **seeding-calc** — save `seeding-plan`, load `conc-data` / `sample-list`
- [x] **cell-count** — save `sample-list`
- [x] **stain-timer** — save/load `protocol`
- [x] **thermal-to-laser** — load `plate-layout` into preset notes
- [ ] **drag-drop from drawer** — planned, not yet implemented

## HIGH PRIORITY

- [ ] **stain-timer** — add Notification API + `visibilitychange` catch-up for background tabs
- [ ] **seeding-calc** — `restrictToNumeric` on text inputs (C₂/V₁/V₂/bypass currently type=text)
- [ ] **thermal-to-laser** — `pdf-lib.min.js` onerror fallback (currently silent `ReferenceError`)
- [ ] **qpcr-analysis** — outlier well exclusion (currently flagged but not excludable from ΔΔCq)

## MEDIUM PRIORITY

- [ ] **Shared-lib consolidation** — cell-count/seeding/stain/experiment don't load `labtools-common.js`; each reimplements download/copyText/escHtml/csvCell
- [ ] **seeding-calc** — extract shared Step-1 calc from hand-synced copy into `labtools-calc.js`
- [ ] **thermal-to-laser + drug-dosage** — move `setStatus`/`toNumber`/`slugify`/`escapeHtml` to shared
- [ ] **rt-calc** — use `labtoolsDownloadText` instead of hand-rolled `data:` URI download
- [ ] **bca-assay** — loading calculator uses raw conc ignoring display-unit toggle
- [ ] **bca-assay** — quadratic samples above curve apex mislabeled "Low" instead of "Extrap"
- [ ] **qpcr-analysis** — guard `effForGenes` against fractional efficiency (some AriaMx exports fractions)
- [ ] **drug-dosage** — CSV injection escape (leading `= + - @` in drug names)
- [ ] **stain-timer** — `parseProtocolCsv` ignores Step column, assumes fixed column order
- [ ] **label-generator** — dead code removal (`csv-upload-btn`, `setStatus`)

## NICE TO HAVE

- [ ] **Keyboard accessibility** — mode selectors, SVG plate selection, collapsible headers across all tools
- [ ] **Print CSS** — `@media print` for bca-assay and label-generator
- [ ] **qpcr-analysis** — inter-run calibration, group-mean calibrator, melt-curve support
- [ ] **rt-calc** — master-mix overage/n+1 dead-volume factor; batch totals in export
- [ ] **experiment-layout** — PNG legend column overflow, dynamic geometry from config
- [ ] **label-generator** — memoize bwip-js DataMatrix rendering for large CSVs
- [ ] **AGENTS.md** — update to list all 10 tools and document actual `lt-` shell standards

## DEFERRED

- **drug-dosage** — intentionally disabled; re-enable requires max-dose safety cap first
- **localStorage persistence** — planned as separate feature across all tools
