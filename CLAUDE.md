# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

LabTools is a collection of zero-dependency, static HTML tools for cell biology bench work. There is no build step, bundler, package manager, or framework. Each tool is browser-runnable and mostly self-contained, with shared assets for common styling, pure calculation utilities, and small browser helpers.

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
│       └── labtools-common.js         # Shared browser utilities
├── tools/
│   ├── cell-count/index.html          # Hemocytometer calculator
│   ├── seeding-calc/index.html        # Count-to-dilution workflow
│   ├── experiment-layout/index.html   # Multi-well plate mapper
│   ├── stain-timer/index.html         # Staining protocol timer
│   ├── thermal-to-laser/index.html    # Thermal PDF to laser sheet converter
│   └── drug-dosage/index.html         # Per-animal dose calculator and log
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

Quick console checks:

```js
calcCellDensity(80, 0.25, 20)  // 4000000
calcDoseFromBodyWeight(5, 'kg', 25, 'g')  // 0.125
```

## Shared Browser Utilities

`assets/js/labtools-common.js` contains DOM/browser helpers used by larger tools:

- `labtoolsDownloadBlob(filename, blob)`
- `labtoolsDownloadText(filename, content, mimeType)`
- `labtoolsReadFileAsArrayBuffer(file)`
- `labtoolsCopyText(text)`
- `labtoolsSafeJsonParse(raw, fallback)`

Keep these generic and dependency-free.

## Shared Design System

`assets/css/labtools.css` defines CSS custom properties and `lt-` prefixed component classes such as `.lt-card`, `.lt-btn`, `.lt-badge`, `.lt-label`, `.lt-nav`, `.lt-footer`, `.lt-divider`, alerts, segmented controls, sheet previews, and result blocks.

Use `var(--token)` for colors, spacing, and radii. Tool-specific overrides belong in a `<style>` block inside the tool page unless the pattern is shared across tools.

## Tool Independence

Tools should not import from each other. For example, `tools/seeding-calc/` contains its own count UI instead of importing from `tools/cell-count/`. Shared logic belongs in `assets/js/labtools-calc.js` or `assets/js/labtools-common.js` only when it is genuinely reusable.

Browser-saved presets, protocols, and logs use `localStorage`. Built-in config files are normal checked-in JavaScript files, but browser save actions do not rewrite them directly.

## Adding A New Tool

1. Create `tools/<tool-name>/index.html`.
2. Link `../../assets/css/labtools.css` and any shared JS needed.
3. Add a card to root `index.html`.
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
