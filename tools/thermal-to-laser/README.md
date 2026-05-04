# Thermal To Laser Label Converter

Convert one or more one-label-per-page thermal-printer PDFs into a laser-printer mailing-label sheet PDF. Part of the [LabTools](../../) collection.

## Workflow

1. Upload one or more source PDFs.
2. The tool reads every page as one label.
3. If uploaded labels have different physical sizes, pages are split into size groups ordered from taller labels to shorter labels.
4. For each size group, use an auto-detected preset, select a preset, or enter custom sheet geometry.
5. Review the sheet preview and adjust placement.
6. Generate the output PDF.
7. Download or save the generated PDF and print it at 100% scale.

When multiple PDFs are selected, file order and page order are preserved within each detected size group. The final PDF exports size groups from taller labels to shorter labels.

## Presets And Geometry

Built-in presets ship from [preset-config.js](./preset-config.js). Browser-saved presets use `localStorage` and stay only in the current browser.

Preset fields describe the target laser-label sheet:

- Page width and height
- Top and side margins
- Horizontal and vertical pitch
- Label width and height
- Column and row count
- Optional vendor, SKU, and notes

Auto-detection matches uploaded label page size against built-in and browser-saved presets. If multiple presets match, choose the intended one. If none match, enter custom geometry.

## Sheet Layout

The layout mode controls what clicking a sheet cell does:

| Mode | Behavior |
|---|---|
| Start Here | Resets the plan and fills labels sequentially from the clicked cell. Earlier cells are treated as already used. |
| Use Cell | Forces a pending label into the clicked cell. |
| Skip Cell | Marks a cell unavailable and advances the next pending label. |

More sheet previews appear automatically when labels do not fit on the currently planned sheets.

## Export And Persistence

- `Save In This Browser` stores the current preset locally.
- `Clear Saved Presets` removes browser-saved presets only.
- `Copy Current Settings` copies a preset snippet for manual review.
- `Export All Presets` downloads a replacement preset config file containing built-in and browser-saved presets.
- `Generate Output PDF` embeds source PDF pages into a new PDF so text and barcodes remain sharp.
- `Download PDF` saves `thermal-to-laser-output.pdf`.

In browsers that support the File System Access API in a secure context, upload/save dialogs prefer Downloads. Other browsers use normal file picker and download behavior.
