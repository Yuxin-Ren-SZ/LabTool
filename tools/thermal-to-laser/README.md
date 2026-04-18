# Thermal To Laser Label Converter

Convert one or more multi-page thermal-printer label PDFs into a laser-printer mailing-label sheet PDF.

## Workflow

1. Upload one or more PDFs where each page is one label.
2. Let the tool auto-detect a matching preset, or choose / enter the sheet geometry manually.
3. Review the sheet preview and choose:
   - `Start Here` to reset the plan and fill cells sequentially from a chosen cell
   - `Use Cell` to force a label into a specific cell
   - `Skip Cell` to mark a cell unavailable and advance the next pending label
4. Generate and download the output PDF.

When multiple PDFs are selected, the tool combines them into one label stream using the file picker order.

## Presets

- Built-in presets ship from [preset-config.js](/Users/yuxinren/Code/LabTools/tools/thermal-to-laser/preset-config.js)
- Browser-saved presets are stored only in this browser with `localStorage`
- They persist locally until cleared and do not sync to other browsers or machines
- Saving in the browser does not rewrite `preset-config.js`
- `Clear Saved Presets` removes all browser-saved presets without affecting the built-in presets shipped in `preset-config.js`
- The browser cannot rewrite repo files directly, so use:
  - `Copy Current Settings` to copy one preset as a snippet for manual pasting into `preset-config.js`
  - `Export All Presets` to download a replacement config file containing all built-in and browser-saved presets

## Notes

- In supporting browsers running in a secure context, the upload and save dialogs prefer the Downloads folder.
- In unsupported browsers or non-secure contexts, the tool falls back to the browser’s normal file picker and download location behavior.
- The output PDF uses the exact page size and cell geometry from the active preset.
- Source PDF pages are embedded into the output PDF as PDF pages rather than raster images, so barcodes and text remain sharp.
- Print the final PDF at `100%` scale on the target laser-label sheet.
