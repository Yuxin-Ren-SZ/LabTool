# Well Plate Map Generator

Interactive multi-well plate layout planner for LabTools.

## What it does

Use this tool to assign named treatment groups to common plate formats:

- 6-well plate: 2 x 3
- 12-well plate: 3 x 4
- 24-well plate: 4 x 6
- 48-well plate: 6 x 8
- 96-well plate: 8 x 12
- 384-well plate: 16 x 24
- 1536-well plate: 32 x 48

The plate map uses color to distinguish groups. Larger wells show well IDs and group names, 96-well plates show compact group initials, and 384- and 1536-well plates use color only.

## Workflow

1. Choose a plate size.
2. Select wells by clicking, dragging, shift-clicking a rectangle, or selecting row and column headers.
3. Add or select a group.
4. Assign the selected wells to the active group.
5. Copy a selected pattern and paste it from another destination well.

Copy and paste preserve the copied shape. Any wells that would land outside the destination plate are skipped.

## Orientation Corners

Use the corner toggles to mark which plate corners are cut for orientation. The selected corners appear on the visual plate frame and are included in the print layout.

## Export

**Export CSV** downloads a machine-readable well map with these columns:

```csv
plate_type,row,column,well,group
```

**Print Layout** opens the browser print dialog with a clean visual plate map and group summary. Use the browser's save-as-PDF option when a PDF is needed.
