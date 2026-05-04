# LabTools

A zero-dependency collection of interactive browser tools for cell biology bench work.
Open any tool directly in a browser or use the GitHub Pages site; there is no install, build, package manager, or dev server requirement.

## Tools

| Tool | Description |
|---|---|
| [Cell Count Calculator](tools/cell-count/) | Hemocytometer counting with Trypan Blue viability, four counting modes, optional dual-chamber averaging, copy, and CSV export. |
| [Cell Seeding Calculator](tools/seeding-calc/) | Two-step cell count and C1V1 = C2V2 dilution workflow, with optional direct stock concentration entry and unit scaling. |
| [Well Plate Map Generator](tools/experiment-layout/) | Multi-well plate layout planner for assigning treatment groups to 6-, 12-, 24-, 48-, 96-, 384-, and 1536-well plates. |
| [Stain Timer](tools/stain-timer/) | Configurable multi-step staining protocol timer with countdown, slot tracking, CSV import/export, result logging, and audio alarms. |
| [Thermal To Laser Label Converter](tools/thermal-to-laser/) | Convert one-label-per-page thermal-printer PDFs into laser-printer mailing-label sheet PDFs with preset management and sheet preview. |
| [Drug Dosage Calculator](tools/drug-dosage/) | Save named multi-drug dosing protocols and calculate min, exact, and max per-animal dose amounts from body weight. |

## Structure

```text
LabTools/
├── index.html                         # Tool hub
├── README.md                          # Repo overview
├── CONTRIBUTING.md                    # Issue and PR workflow
├── AGENTS.md                          # Coding-agent repository guidance
├── CLAUDE.md                          # Claude Code repository guidance
├── assets/
│   ├── css/labtools.css               # Shared design system
│   └── js/
│       ├── labtools-calc.js           # Shared pure calculation helpers
│       └── labtools-common.js         # Shared browser utilities
├── tools/
│   ├── cell-count/
│   ├── seeding-calc/
│   ├── experiment-layout/
│   ├── stain-timer/
│   ├── drug-dosage/
│   │   ├── protocol-config.js         # Built-in dosing protocols
│   │   └── tool.js
│   └── thermal-to-laser/
│       ├── preset-config.js           # Built-in label-sheet presets
│       ├── pdf-lib.min.js             # Bundled PDF library
│       └── tool.js
└── docs/
    ├── counting-modes.html            # Hemocytometer mode reference diagrams
    └── plate-dimensions.template.json # Plate geometry reference template
```

Each tool folder contains an `index.html` and `README.md`. Tools are intentionally self-contained, with shared styling and pure helper functions imported only when useful.

## Development

Open files directly in a browser:

```sh
open index.html
open tools/cell-count/index.html
```

An optional static server can be used when you want browser navigation to behave more like GitHub Pages:

```sh
python3 -m http.server
```

Before sending a change, review only the intended files:

```sh
git status
git diff
```

## Deployment

The site is hosted on GitHub Pages from the `dev` branch. PRs should target `dev`, not `main`.

## Design And Data

Shared UI tokens and `lt-` component classes live in `assets/css/labtools.css`. Shared bench-math helpers live in `assets/js/labtools-calc.js` as plain global functions with no DOM dependencies. Shared browser utilities for download, clipboard, file reading, and safe JSON parsing live in `assets/js/labtools-common.js`.

Browser-saved presets, protocols, and logs use `localStorage`; they stay in the current browser and do not rewrite checked-in config files. Tools that expose config export or copy actions generate snippets/files for manual review before committing.
