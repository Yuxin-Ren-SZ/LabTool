# qPCR Plate Planner

Generate a multi-plate qPCR `plate-layout` from sample combinations, then hand it
off to the Microplate Layout Planner (to view/edit) or straight to qPCR Analysis.

This is the browser version of `scripts/gen-qpcr-layout.mjs`: same proven
band-packing geometry, but the sample axis is fully general and driven from the
UI.

## Concept

- **Sample factors** — define any number of named value-lists (e.g. `Treatment`
  and `Timepoint`). Samples are the cartesian product across factors.
- **Genes** — each gene is a `reference` or `target`. The first reference is the
  **anchor**, placed on band 0 of every plate (required for inter-plate
  calibration). This invariant is enforced; a skip cannot remove the anchor.
- **Skip / exceptions** — click any generated combination to exclude it (e.g. a
  treatment with no late timepoint).
- **Layout** — genes are packed into vertical bands (`bands/plate`, default 3),
  samples fill two per row × `replicates` adjacent columns, and (optionally) an
  NTC duplicate lands in the last row of each band. Genes spill onto additional
  plates automatically; unused bands stay empty.

## Output

Produces a workbench `plate-layout` payload shaped exactly like the Microplate
Layout Planner's own export: `gene` is a coloured category field, `sample` and
`content` (reference/target/NTC role) are literal text. Consumers:

- **Save to Workbench** — store the layout.
- **Open in Layout Planner →** — visualise/tweak the plates.
- **Send to qPCR →** — label wells in qPCR Analysis (applies once a results file
  is loaded).

## Shared code

The generation logic lives as pure functions in `assets/js/labtools-calc.js`
(`qpcrBuildSamples`, `qpcrPackPlates`, `qpcrToPlateLayout`) and is covered by
`tests/unit/qpcr-planner.test.mjs`, including a well-for-well parity check
against `qpcr-layout-neuronal-8plate.csv`.
