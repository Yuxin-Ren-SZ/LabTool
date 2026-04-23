# LabTools

A growing collection of interactive browser-based utilities for the cell biology bench.
No installation required — open any tool directly in a browser or visit the GitHub Pages site.

## Tools

| Tool | Description |
|---|---|
| [Cell Count Calculator](tools/cell-count/) | Hemocytometer counting with Trypan Blue viability, 4 counting modes, and optional dual-chamber averaging |
| [Cell Seeding Calculator](tools/seeding-calc/) | Two-step workflow for cell counting and C₁V₁ = C₂V₂ dilution planning, with optional direct concentration entry |
| [Well Plate Map Generator](tools/experiment-layout/) | Multi-well plate layout planner for assigning groups to 6-, 12-, 24-, 48-, 96-, and 384-well plates |
| [Stain Timer](tools/stain-timer/) | Configurable multi-step staining protocol timer with countdown, slot tracking, CSV import/export, and audio alarms |
| [Thermal to Laser Label Converter](tools/thermal-to-laser/) | Convert thermal-printer label PDFs to laser-printer mailing-label sheet PDFs, with preset management and sheet preview |

## Structure

```
LabTools/
├── index.html                # Hub landing page
├── README.md                 # Repo overview
├── assets/
│   ├── css/labtools.css      # Shared design system
│   └── js/
│       ├── labtools-calc.js  # Shared pure calculation helpers
│       └── labtools-common.js# Shared DOM utilities
├── tools/
│   ├── cell-count/
│   │   ├── index.html
│   │   └── README.md
│   ├── seeding-calc/
│   │   ├── index.html
│   │   └── README.md
│   ├── experiment-layout/
│   │   ├── index.html
│   │   └── README.md
│   ├── stain-timer/
│   │   ├── index.html
│   │   └── README.md
│   └── thermal-to-laser/
│       ├── index.html
│       ├── README.md
│       ├── tool.js           # Main application logic
│       ├── preset-config.js  # Built-in label presets
│       └── pdf-lib.min.js    # Bundled PDF generation library
└── docs/
    └── counting-modes.html   # Hemocytometer mode reference diagrams
```

## Deployment

Hosted on GitHub Pages from the `dev` branch. Each tool is a self-contained HTML file — no build step required.

## Design

All tools share a common design system defined in `assets/css/labtools.css` and shared bench-math utilities in `assets/js/labtools-calc.js`. New tools should import those shared assets when applicable, keep tool-specific UI self-contained, and avoid introducing frameworks or build tooling.
