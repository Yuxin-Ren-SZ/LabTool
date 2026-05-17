# Label Generator

Generate laser sheet or thermal PDF labels from CSV data using one reusable label template.

## Features

- **Laser-first workflow** — Choose a laser sheet preset shared with the Thermal To Laser converter, design one label, then place labels on the sheet.
- **Reusable template** — The same template exports to laser sheets or one-label-per-page thermal PDFs.
- **Automatic design grid** — The tool chooses the internal grid from label dimensions; users drag and resize fields instead of configuring rows and columns.
- **Interactive fields** — Add CSV text, static text, and one DataMatrix field. Drag, touch-drag, keyboard-move, or resize fields on the label preview with grid snapping.
- **Browser-saved templates** — Save, reload, or reset the current label template in local browser storage.
- **CSV header control** — Auto-detect headers, or force the first row to be treated as header/data.
- **Overlap warnings** — Overlapping fields are highlighted and warned, but PDF export remains available.
- **Geometry validation** — Custom laser sheet values are checked before export so labels do not run off the page.
- **Sheet placement** — Pick a starting cell, mark cells to use, skip partially used labels, and reset placement.
- **PDF output** — Generates 100% scale PDFs with the bundled `pdf-lib` and `bwip-js` files. No build step or external dependency is required.

## Basic Workflow

1. Upload or paste CSV data.
2. Confirm whether the first row should be treated as headers.
3. Choose a laser sheet preset, or switch to thermal labels if needed.
4. Add or edit label fields.
5. Drag fields on the design preview, resize with the lower-right handle, or use arrow keys to move the selected field.
6. For laser sheets, choose the first cell or skip used cells in the placement preview.
7. Generate the PDF, preview it, then download.

## CSV Format

Header rows are detected automatically. Comma, tab, and semicolon delimiters are supported, including quoted CSV cells.

```csv
Sample ID,Name,Date,Notes
S001,Wild Type,2024-01-15,Control group
S002,Mutant A,2024-01-15,Treatment A
S003,Mutant B,2024-01-16,Treatment B
```

The DataMatrix field can encode `Sample ID`. Human-readable code text should be added separately as a CSV text field if desired.

Blank DataMatrix values block export so a printable but meaningless code is not generated. Very long encoded values warn before export because dense codes may scan poorly on small cryogenic labels.

## Printing Guidance

- Print laser sheet PDFs at **Actual size** or **100% scale**.
- Disable browser/printer options such as "Fit to page", "Shrink oversized pages", or custom scaling.
- For laser label sheets, test on plain paper first and hold it behind the label stock to confirm alignment.
- Thermal mode creates one PDF page per label using the selected label dimensions.

## Built-in Presets

### Laser Sheet (USA Scientific)

- CryoClear 1.28×0.5" — 5 × 17 grid
- CryoClear 0.94×0.5" — 7 × 17 grid
- CryoBaby 1.50×0.75" — 5 × 12 grid
- CryoBaby 1.69×0.75" — 4 × 13 grid
- CryoBaby 2.625×1.00" — 3 × 10 grid
- CryoBaby 1.50×0.25" — 4 × 39 grid
- Catalog 9185-1000 (0.38×0.38") — 12 × 16 grid
- Catalog 9185-2000 (0.50×0.50") — 12 × 16 grid
- Catalog 9185-3000 (0.75×0.75") — 9 × 12 grid
- Catalog 9185-4000 (1.00×1.00") — 7 × 9 grid
- Catalog 9185-5000 (0.44×0.44") — 13 × 18 grid

Browser-saved Thermal To Laser presets also appear in the preset dropdown when available.

### Thermal

- Cryo Label 1.28" × 0.5"
- Cryo Label 1.0" × 0.5"
- Tube Label 1.0" × 0.75"
- Cryo Cap Label 0.375" × 0.375"

## Files

- `index.html` — Tool page and local styles
- `tool.js` — CSV parsing, template designer, placement, and PDF generation
- `preset-config.js` — Shipped thermal presets for one-label-per-page output
- `../thermal-to-laser/preset-config.js` — Shared laser sheet presets
- `bwip-js-min.js` — DataMatrix rendering library
- `pdf-lib.min.js` — PDF generation library
