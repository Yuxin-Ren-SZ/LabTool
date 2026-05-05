# Well Plate Map Generator

Interactive multi-well plate layout planner for assigning treatment groups to standard plate formats. Part of the [LabTools](../../) collection.

## Plate Formats

The tool supports:

- 6-well plate: 2 x 3
- 12-well plate: 3 x 4
- 24-well plate: 4 x 6
- 48-well plate: 6 x 8
- 96-well plate: 8 x 12
- 384-well plate: 16 x 24
- 1536-well plate: 32 x 48

Plate geometry is based on millimeter reference dimensions in the tool and mirrored in [docs/plate-dimensions.template.json](../../docs/plate-dimensions.template.json). Lower-density plates render round wells; 384- and 1536-well plates render square wells for readability.

## Workflow

1. Choose a plate format.
2. Select wells by clicking, dragging, shift-clicking a rectangle, or clicking row and column headers.
3. Add or select a treatment group.
4. Assign selected wells to the active group.
5. Copy a selected pattern and paste it from a destination well.
6. Export CSV or print the visual layout.

Copy and paste preserve the copied shape. Wells that would land outside the destination plate are skipped. Copied groups are brought into the current layout if needed.

## Groups And Display

Groups have editable names and colors from the built-in palette. Larger plate formats reduce label density so the layout remains readable:

- Small plates show well IDs and group names.
- 96-well plates use compact labels.
- 384- and 1536-well plates rely primarily on color.

## Orientation Corners

Corner toggles mark cut or notched plate corners for physical orientation. Selected corners appear in the on-screen frame and print layout summary.

## Export, Print, And Reset

`Export CSV` downloads `experiment-layout-<plate>-well.csv` with:

```csv
plate_type,row,column,well,group,group_abbreviation,group_color
```

`Print Layout` opens the browser print dialog with a clean plate map, group summary, and color legend. When the visible well labels use generated abbreviations, the print legend maps each abbreviation and color back to the full group name. Use the browser's save-as-PDF option if a PDF is needed.

`Export PNG` downloads a 1920 x 1080 landscape PNG containing only the plate view and an assigned-group legend on the right side.

`Reset Plate` clears the current layout after confirmation.
