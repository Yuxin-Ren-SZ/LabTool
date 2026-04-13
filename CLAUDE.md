# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LabTools is a collection of zero-dependency, static HTML tools for cell biology bench work. No build step, no bundler, no framework — each tool is a self-contained HTML file with inline CSS and a shared JS utility script.

## Deployment

Hosted on GitHub Pages. Opening any `index.html` directly in a browser is all that's needed for development. There are no dev servers, package managers, or build commands.

## Architecture

```
LabTools/
├── index.html                    # Hub landing page — add new tools here
├── assets/
│   ├── css/labtools.css          # Shared design system (CSS custom properties + component classes)
│   └── js/labtools-calc.js       # Shared pure-function utilities (no DOM, testable in any console)
├── tools/
│   ├── cell-count/index.html     # Standalone hemocytometer calculator
│   └── seeding-calc/index.html   # Two-step guided tool: cell count → dilution (C₁V₁ = C₂V₂)
└── docs/
    └── counting-modes.html       # Reference diagrams for hemocytometer counting modes
```

### Shared library: `assets/js/labtools-calc.js`

All math lives here as plain globals (no modules). Each tool loads it via `<script src="../../assets/js/labtools-calc.js">`. Key exports:

- `avgTwo(a, b)` — average two optional counts (handles NaN)
- `fmt(n)` — integer with thousands commas, `'—'` for NaN
- `fmtSig(n)` — significant-figure-aware display formatting
- `bestVolumeDisplay(mL)` / `autoBestConcUnit(cellsPerML)` — smart unit selection
- `restrictToNumeric(input)` — limits an `<input>` to numeric characters
- `calcCellDensity(count, multiplier, df)` — core hemocytometer formula
- `calcTotalCells(density, volML)` / `calcViabilityPct(live, dead)`
- `makeDiagram(mode)` — generates SVG hemocytometer diagrams
- `MODES` / `SMALL_ALL` / `SMALL_5` — counting mode definitions

Quick tests can be run by pasting calls into any browser console (e.g. `calcCellDensity(80, 0.25, 20)` → `4000000`).

### Shared design system: `assets/css/labtools.css`

Notion-inspired aesthetic driven by CSS custom properties. Key conventions:

- Use `var(--token)` for all colors, spacing, and radii — never hardcode values
- Use `lt-` prefixed classes for layout/structural components (`.lt-card`, `.lt-btn`, `.lt-badge`, `.lt-label`, `.lt-nav`, `.lt-footer`, `.lt-divider`)
- Tool-specific overrides go in a `<style>` block inside each tool's `index.html`
- Shared component classes (counting mode selector, result boxes, group blocks) live in the lower half of `labtools.css` and are reused across tools without renaming

### Independence between tools

`tools/seeding-calc/` contains its own copy of the cell count UI and does **not** import from `tools/cell-count/`. Both tools load `labtools-calc.js` for shared math but are otherwise independent.

## Adding a New Tool

1. Create `tools/<tool-name>/index.html` — link `../../assets/css/labtools.css` and `../../assets/js/labtools-calc.js`
2. Add a tool card entry to the grid in the root `index.html`
3. Add a README at `tools/<tool-name>/README.md`
4. Use existing CSS custom properties and `lt-` component classes; add tool-specific styles inline

## Counting Mode Formulas

```
Final Density (cells/mL) = avg_count × multiplier × DF × 10⁴
```

| Mode | Multiplier |
|---|---|
| All 25 small squares | × 1 |
| 5 small squares | × 5 |
| 4 corner squares | ÷ 4 |
| 1 corner square | × 1 |

The `× 10⁴` factor comes from the hemocytometer large-square volume of 0.1 µL = 10⁻⁴ mL.
