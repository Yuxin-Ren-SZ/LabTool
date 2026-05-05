# Label Generator

Generate PDF labels with DataMatrix barcodes from CSV data.

## Features

- **CSV input** — Upload a `.csv` file or paste CSV text. Auto-detects delimiter (comma, tab, semicolon) and headers.
- **DataMatrix barcodes** — Encode any column as a 2D DataMatrix code. Choose from Small / Medium / Large sizes.
- **Human-readable text** — Print up to 4 additional columns as text alongside the barcode.
- **Two layout modes**:
  - **Thermal** — One label per page. Ideal for direct thermal printers (cryo labels, tube labels, cap labels).
  - **Laser sheet** — Grid layout on letter-size sheets. Use built-in presets (Avery 5160, 5167, 5163, 5164) or enter custom geometry.
- **Preset system** — Built-in presets ship in `preset-config.js`. Save custom presets in your browser (localStorage). Copy or export presets to share.
- **PDF output** — Generates a ready-to-print PDF with barcodes and text positioned on each label.

## Usage

1. **CSV Data** — Upload a CSV file or paste CSV content. The tool auto-detects the delimiter and headers.
2. **Label Design** — Map which CSV column becomes the barcode data. Optionally add up to 4 text lines from other columns. Choose thermal or laser-sheet layout.
3. **Export** — Generate the PDF. Preview it in the browser, then download.

## CSV Format

Your CSV should have a header row and data rows. Example:

```csv
Sample ID,Name,Date,Notes
S001,Wild Type,2024-01-15,Control group
S002,Mutant A,2024-01-15,Treatment A
S003,Mutant B,2024-01-16,Treatment B
```

The "Sample ID" column can be used for the barcode, while "Name" and "Date" appear as printed text.

## Presets

### Built-in Thermal Presets
- Cryo Label 0.75 × 0.5 in
- Cryo Label 1.0 × 0.5 in
- Tube Label 1.0 × 0.75 in
- Cryo Cap Label 0.375 × 0.375 in

### Built-in Laser Sheet Presets
- Avery 5160 (30-up) — 1" × 2.625", 3×10 grid
- Avery 5167 (80-up) — 0.5" × 1.75", 4×20 grid
- Avery 5163 (10-up) — 2" × 4", 2×5 grid
- Avery 5164 (6-up) — 3.33" × 4", 2×3 grid

Add custom presets via the "Save In This Browser" button. Saved presets remain in your browser until cleared. Use "Copy Current Settings" or "Export All Presets" to transfer presets to `preset-config.js`.

## Files

- `index.html` — Tool page
- `tool.js` — Application logic
- `preset-config.js` — Shipped label sheet presets
- `bwip-js-min.js` — Barcode generation library
- `pdf-lib.min.js` — PDF generation library
