# Thermal To Laser Label Converter

Convert a multi-page thermal-printer label PDF into a laser-printer mailing-label sheet PDF.

## Workflow

1. Upload a PDF where each page is one label.
2. Let the tool auto-detect a matching preset, or choose / enter the sheet geometry manually.
3. Review the sheet preview and choose:
   - `Start Here` to reset the plan and fill cells sequentially from a chosen cell
   - `Use Cell` to force a label into a specific cell
   - `Skip Cell` to mark a cell unavailable and advance the next pending label
4. Generate and download the output PDF.

## Presets

- Built-in presets ship from [preset-config.js](/Users/yuxinren/Code/LabTools/tools/thermal-to-laser/preset-config.js)
- Browser-saved presets are stored locally with `localStorage`
- The browser cannot rewrite repo files directly, so use:
  - `Copy Current Settings` to copy one preset as a snippet for manual pasting into `preset-config.js`
  - `Export All Presets` to download a replacement config file containing all built-in and browser-saved presets

## Notes

- The output PDF uses the exact page size and cell geometry from the active preset.
- Source PDF pages are embedded into the output PDF as PDF pages rather than raster images, so barcodes and text remain sharp.
- Print the final PDF at `100%` scale on the target laser-label sheet.
