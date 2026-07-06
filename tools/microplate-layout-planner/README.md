# Microplate Layout Planner

Interactive planner for laying out **one or more** multi-well plates, tagging each well
with a colored group plus any number of custom fields (Sample ID, Gene/Target, Dose,
Timepoint, …). Part of the [LabTools](../../) collection. Layouts export to a CSV that
round-trips back into the planner and drops straight into the qPCR Analysis tool.

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

## Multiple Plates

The plate tab bar holds every plate in the session. `+ Add plate` appends a new plate,
clicking a tab switches to it, double-clicking renames it, and the `×` removes it. Each
plate keeps its own size and corner marks, so a 96-well and a 384-well plate can live in
the same session (and the same CSV). **View All** shows every plate side-by-side in a
read-only overview (also used for print and multi-plate PNG); the button toggles back to
**Edit Plate**.

## Fields

Every well carries a record of **fields**. The default fields are `Group` (a category
field that colors the wells), `Sample ID`, and `Gene` (free text). In the Fields panel you
can rename fields, add your own (**Category** for colored value sets, **Text** for free
values), and delete them — at least one category field is always required.

- **Color by** chooses which category field colors the wells.
- **Label by** chooses which field's value prints on the well face.

To label wells: select them (click, drag, shift-click a rectangle, or click a row/column
header), pick a field, choose or type its value, and press **Assign** (or **Apply** for a
text field). **Clear** empties the selected wells. **Copy**/**Paste** move a well pattern —
the copied shape and all field values are preserved; wells that would land off the plate
are skipped.

Larger plate formats reduce label density so the layout stays readable: small plates show
well IDs and the label value, 96-well plates use compact initials, and 384-/1536-well
plates rely primarily on color.

## Orientation Corners

Corner toggles mark cut or notched plate corners for physical orientation. They are stored
per plate and appear in the on-screen frame, the overview, and the print layout summary.

## Export, Import, Print, Reset

`Export CSV` downloads `microplate-layout-planner-<plate>-well.csv` (single plate) or
`microplate-layout-planner-<n>-plates.csv` (multiple). The header is built from the current
fields:

```csv
plate_type,plate,row,column,well,group,sample,gene,group_color
```

- `plate_type` (per row) and `well` are always present; `plate` is added only when there is
  more than one plate.
- Each field contributes one data column named by its key (default keys `group`, `sample`,
  `gene`; custom fields are slugged from their name). Every **category** field also emits a
  `<key>_color` column so the palette round-trips.

`Import CSV` rebuilds plates and fields from a file in this format. Columns are matched by
header name (order-tolerant). Structural columns (`plate_type`, `plate`, `row`, `column`,
`well`) and derived columns (`*_color`, legacy `*_abbreviation`) frame the data; every other
column becomes a field — a **category** when a matching `<key>_color` column exists (or the
legacy `group`), otherwise text. Rows are grouped into plates by the `plate` column. An
exported layout round-trips exactly, except that a single-plate export omits the `plate`
column, so that one plate reimports as `Plate 1` (rename it from the tab if needed). Older
single-plate exports (which used a `group_abbreviation` column) still load — that column is
ignored.

Because the default fields export literal `group`, `sample`, and `gene` columns, the file is
recognized directly by the **qPCR Analysis** tool, which reads each well's `sample` as its
sample name, `group` as a group override, and `gene` as its target.

`Print Layout` prints every plate (the overview) with a per-plate summary and a legend for
the active color field. Use the browser's save-as-PDF option if a PDF is needed.

`Export PNG` downloads a 1920 x 1080 landscape PNG with all plates arranged in a grid and a
legend for the active color field.

`Reset Plate` clears the layout on the active plate after confirmation.
