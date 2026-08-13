# Output Fields Catalog

Central catalog of **output field-ids** used for tool-to-tool workflow wiring.

Tools declare their own outputs (`outputFields`) and inputs (`inputPorts`) locally — there is
no hard central registry in code. This document is the coordination point: it standardizes the
**field-ids** so an upstream tool's output matches a downstream tool's input port by string id.

Wiring rule (see `labtoolsMatchWiring` in `assets/js/labtools-artifact.js`):
- upstream output id **matches** a downstream input port id → wired automatically
- required input port with **no match** → user fills it manually
- upstream output with **no matching port** → ignored

Every artifact also carries full `params` (control state) for recovery; that is separate from the
wireable `outputs` listed here.

## Field-ids

| field-id        | meaning                                   | value shape                                              | produced by            | consumed by            |
|-----------------|-------------------------------------------|----------------------------------------------------------|------------------------|------------------------|
| `cell-density`  | Cell concentration                        | number, cells/mL                                         | cell-count             | seeding-calc           |
| `total-cells`   | Total cells in suspension                 | number                                                   | cell-count             | seeding-calc           |
| `viability`     | Trypan-blue viability                     | number, %                                                | cell-count             | —                      |
| `concentration` | Nucleic-acid / protein concentration      | `[{ sample, conc, unit }]` (per-sample) or scalar        | rt-calc, bca-assay     | seeding-calc, rt-calc  |
| `sample-list`   | Named samples + optional purity ratios    | `[{ name, conc?, unit?, a260_280?, a260_230? }]`         | cell-count, rt-calc    | qpcr-analysis, seeding-calc |
| `cq`            | Per-well quantification cycle             | `{ <wellId>: number }`                                   | qpcr-analysis          | —                      |
| `ddcq`          | ΔΔCq relative expression                  | `[{ target, group, sample, ddcq, fold }]`                | qpcr-analysis          | —                      |
| `plate-layout`  | Microwell plate + per-well assignments    | see below                                                | microplate-layout-planner, qpcr-plate-planner | qpcr-analysis, bca-assay |
| `seeding-plan`  | Stock conc + dilution volumes (C1V1=C2V2) | `{ stockConc?, unit?, c1?, c2?, v1?, v2?, step1TotalVolML? }` | seeding-calc      | —                      |
| `protocol`      | Ordered staining steps                    | `[{ solution, durationMin, durationSec, slot }]`         | stain-timer            | stain-timer            |

### `plate-layout` value shape

```js
{
  plates: [{
    name: 'Plate 1',
    plateType: '6'|'12'|'24'|'48'|'96'|'384'|'1536',
    cutCorners: [ '<wellId>', ... ],       // optional
    wells: {                                // a.k.a. assignments
      '<wellId>': { group?, sample?, gene?, ...customFields }  // any field nullable; empty well = {}
    }
  }],
  fields?: [ ... ],            // field definitions (id, key, name, kind)
  categoriesByField?: { ... }  // category id → name resolution
}
```

- Well-ids match `^[A-Z]{1,2}[0-9]{1,3}$` (rows A–Z, AA–AF for 1536; columns 1–48).
- **Groups are optional and any group value may be `null`.** A well may be entirely empty (`{}`).
- Multiple groups per plate are allowed.

## Adding a new output field

1. Pick a stable, lowercase, hyphenated `field-id`. Reuse an existing id if the meaning matches —
   that is what makes cross-tool wiring work.
2. Add a row here (meaning, value shape, producers, consumers).
3. Declare it in the tool's `labtoolsDefineTool({ outputFields: [...] })` (producer) and/or
   `inputPorts: [...]` (consumer).
