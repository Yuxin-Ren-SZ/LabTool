# Handoff: Label Generator Redesign

## Overview

This is a redesign of the **Label Generator** tool in the LabTools codebase
(`tools/label-generator/`). The existing tool uses a 3‑step wizard
(Data Import → Label Designer → Preview & Export) that hides everything outside
the current step and forces a strictly linear workflow. The redesign replaces
the wizard with a **single‑screen workspace** where CSV data, label canvas,
field properties, sheet placement, and the export action are all visible
simultaneously — so users can iterate on a template while watching the live
sample preview and the sheet plan update.

All existing functionality is preserved: CSV import + delimiter detection,
laser-sheet and thermal modes, the shared preset list (incl. CryoClear /
CryoBaby / 9185-series), DataMatrix + CSV + Static field types, drag/resize
on a snap-to-grid canvas, per-sheet placement planning, browser-saved
templates, and PDF generation through `pdf-lib` + `bwip-js`.

## About the Design Files

The files in `design/` are **design references built in HTML with
React + Babel** for prototyping speed. They are **not production code** to
copy verbatim. The LabTools codebase has strict architectural rules
(see `CLAUDE.md` in the repo root):

- **Zero dependencies. No build step. No framework. No bundler. No package
  manager.** Tools are static `index.html` files loaded directly in a
  browser.
- Shared styles live in `assets/css/labtools.css`. Tool-specific overrides
  go in a `<style>` block inside the tool's `index.html`.
- Browser helpers live in `assets/js/labtools-common.js`. Pure calc helpers
  live in `assets/js/labtools-calc.js`.
- Tools must not import from one another. Logic that's genuinely shared
  goes into the two shared `assets/js/` files only.

**Your task: rebuild the redesigned UI in vanilla JS, in the LabTools
idiom**, replacing the contents of `tools/label-generator/index.html` and
`tools/label-generator/tool.js`. The React/JSX in `design/` exists only to
make the design legible — translate it to plain DOM construction
(`document.createElement`, `innerHTML`, event listeners, a small render
function over a state object). The current `tool.js` already follows this
pattern; mirror its structure.

## Fidelity

**High-fidelity.** Colors, spacing, type, layout, and interaction details
are all final. Match the design pixel-for-pixel, using LabTools design
tokens (`var(--blue-dark)`, `var(--border-subtle)`, etc.) wherever they
correspond — the redesign was intentionally built on top of those tokens
so the new UI continues to look like it belongs in LabTools.

## Files in `design/`

| File                  | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| `Label Generator.html`| Page shell, font/script imports, root mount, `TWEAK_DEFAULTS`. |
| `app.jsx`             | Top-level App, state, sample CSV, `parseCsv`, `gridForLabel`.   |
| `canvas.jsx`          | `LabelCanvas`, `FieldBlock`, drag/resize logic, samples strip.  |
| `rails.jsx`           | Left rail (data + format), right rail (fields + placement).    |
| `components.jsx`      | Icon SVG set used throughout.                                   |
| `styles.css`          | Base tokens + shared component CSS (forked from labtools.css). |
| `extra.css`           | Additions for the new layout (top nav, bottom bar, sheet mini).|
| `tweaks-panel.jsx`    | Prototype-only — the in-page Tweaks toggle. **Do not ship.**   |
| `preset-config.js`    | Already in the repo under `tools/label-generator/`.            |

To run the design in a browser: `python3 -m http.server` from the
`design/` directory, then open `Label Generator.html`. The Tweaks panel is
a prototype-only affordance and should be omitted from the shipped tool.

## Top-Level Structure

The page is a CSS Grid with three columns and a sticky bottom bar:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔬 LabTools  /  Label Generator        [pills]   [Save template]│  ← lg-nav (52px)
├──────────────┬─────────────────────────────┬────────────────────┤
│              │ Canvas header (title, dim)  │                    │
│ DATA SOURCE  │                             │ LABEL CONTENT      │
│  CSV chip    │                             │   + add cards (3)  │
│  (or empty)  │     LIVE LABEL CANVAS       │   field list       │
│              │     (drag + resize)         │                    │
│ OUTPUT       │                             │ PROPERTIES         │
│ FORMAT       ├─────────────────────────────┤   (selected field) │
│  laser/therm │ SAMPLE PREVIEW              │                    │
│  preset      │  ⬛ label ⬛ label ⬛ label  │ SHEET PLACEMENT    │
│  dimensions  │                             │   mini-grid + stats│
├──────────────┴─────────────────────────────┴────────────────────┤
│ 8 labels · 1 sheet · 85 cells          [Preview] [Generate PDF] │  ← lg-bottom-bar (64px)
└─────────────────────────────────────────────────────────────────┘
```

Grid: `grid-template-columns: 296px minmax(0, 1fr) 340px` at ≥1280px.
At narrower widths the rails tighten (260 / 1fr / 304 at ≤1280, 232 / 1fr / 280
at ≤1100) and finally collapse to a single column at ≤820px with the rails
stacked above and below the canvas.

## Design Tokens

All tokens come from `assets/css/labtools.css` (the LabTools shared system).
The redesign uses these existing tokens; no new color values are required.

### Color

| Token              | Hex       | Use                                          |
| ------------------ | --------- | -------------------------------------------- |
| `--bg`             | `#f7f7f5` | Page background                              |
| `--surface`        | `#ffffff` | Card / rail / nav surface                    |
| `--surface-subtle` | `#fafafa` | Inset section background                     |
| `--text`           | `#37352f` | Body text                                    |
| `--text-secondary` | `#6b6b6b` | Labels, captions                             |
| `--text-muted`     | `#9b9a97` | Section headers, metadata                    |
| `--text-dim`       | `#b6b5b2` | Fine print, monospace stamps                 |
| `--border`         | `#e3e2df` | Input/card stroke                            |
| `--border-subtle`  | `#f0efed` | Dividers, inset sections                     |
| `--blue`           | `#5c8dff` | Active accent                                |
| `--blue-dark`      | `#3366cc` | Primary text on light backgrounds            |
| `--blue-bg`        | `#eef3ff` | CSV-field fill, selected field card         |
| `--blue-border`    | `#c8d9ff` | CSV-field border                             |
| `--green`          | `#57a85a` | DataMatrix-field accent, sheet "start" cell  |
| `--green-dark`     | `#2d7a2d` | DataMatrix-field text                        |
| `--green-bg`       | `#efffef` | DataMatrix-field fill, CSV-loaded card       |
| `--green-border`   | `#b8e8b8` | DataMatrix-field border                      |
| `--yellow`         | `#d97706` | Static-field accent (= LabTools yellow)      |
| `--yellow-bg`      | `#fffbeb` | Static-field fill                            |
| `--yellow-border`  | `#fcd34d` | Static-field border                          |
| `--red`            | `#e03e3e` | Destructive (remove, clear)                  |
| `--red-bg`         | `#fffafa` | Destructive hover fill                       |

> **Note:** `extra.css` introduces a `mono` and `forest` accent variant
> for the Tweaks panel. These are prototype-only — ship only the default
> `blue` accent.

### Radius / Shadow / Type

| Token             | Value                                          |
| ----------------- | ---------------------------------------------- |
| `--radius-xs`     | `4px` (badges, chips)                          |
| `--radius-sm`     | `6px` (small inputs)                           |
| `--radius-md`     | `8px` (inputs, buttons, cards)                 |
| `--radius-lg`     | `12px` (page cards)                            |
| `--shadow-sm`     | `0 1px 4px rgba(0,0,0,0.10)`                   |
| `--shadow-card`   | `0 2px 12px rgba(0,0,0,0.08)`                  |
| `--font`          | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| `--font-mono`     | `'SF Mono', 'Fira Code', 'Fira Mono', monospace` |

The new layout uses an additional system font size hierarchy
(documented per-component below). Add new sizes inline; do not introduce
new CSS variables for them.

## Screens / Views

There is only one view. Each region is broken out below.

---

### 1. Top Nav  (`.lg-nav`, height 52px)

Sticky top bar, blurred translucent background.

- **Background**: `rgba(247,247,245,0.86)` with `backdrop-filter: blur(10px)`.
- **Bottom border**: `1px solid var(--border-subtle)`.
- **Padding**: `0 20px`. Gap between children: `14px`.

Children, left to right:

1. **Brand** (`.lg-nav-brand`) — `🔬 LabTools` link to `../../index.html`.
   Font 0.92rem / 700.
2. **Separator** (`.lg-nav-sep`) — `/` at `var(--text-dim)`.
3. **Page name** (`.lg-nav-page`) — `Label Generator`. 0.86rem / 500 /
   `var(--text-muted)`.
4. **Spacer** (`flex: 1`).
5. **Row-count pill** (`.lg-nav-pill`) — `[database icon] N rows`.
   `5px 10px` pad, `999px` radius, `var(--border-subtle)` border on white.
   Hidden below 1100px wide.
6. **Label-size pill** — `[sheet/thermal icon] 1.28″ × 0.5″`. Same styling.
   Icon depends on the active mode. Hidden below 1100px.
7. **Save template** (`.lg-nav-action`) — Filled black-on-white button:
   `bg: var(--text)`, `color: #fff`, `radius: var(--radius-md)`,
   `padding: 6px 12px`, `font-size: 0.78rem`, `font-weight: 600`.
   Includes save icon + label.

---

### 2. Left Rail  (`.lg-rail.lg-rail-left`, width 296px)

White background, right border `1px solid var(--border-subtle)`. Scrolls
internally. Two sections, separated by a thin bottom border on the first.

#### 2a. Data source section

- **Section header** — uppercase 0.71rem / 700 / `var(--text-muted)`,
  letter-spacing `0.08em`. Right-aligned `aux` pill showing
  `{N} rows` (mono, muted).

- **Loaded state** (`.lg-csv-loaded`) — shown when the CSV has rows.
  - Container: `1px solid var(--green-border)`, `background: var(--green-bg)`,
    `radius: var(--radius-md)`, `padding: 12px`.
  - Row 1: square green icon (`28px`, radius `6px`, `bg: var(--green)`,
    file icon in white) + filename (0.82rem / 600) + meta
    (`{rows} rows · {cols} columns`, 0.71rem mono / `var(--text-secondary)`).
  - Row 2: header chips (`.lg-csv-col`) — `2px 7px`, `radius-xs`,
    `var(--green-dark)` text on `rgba(255,255,255,0.7)`,
    `1px solid rgba(75,157,82,0.25)`. Show up to 8; overflow as
    `+N more` chip.
  - Row 3: link buttons — `↑ Replace`, `🗑 Clear` (red).

- **Empty state** (`.lg-csv-empty`) — dashed border drop zone:
  `2px dashed var(--border-strong)`, hover turns blue. Centered upload
  icon in a square, "Upload CSV" / "Drag a file here, or click to pick"
  / muted hint.

- **Paste fallback** — `<details>` element with summary "Edit CSV text"
  (or "Paste CSV directly" when empty). Open by default when empty.
  Mono textarea, 88px min-height.

#### 2b. Output format section

- **Mode segmented control** (`.lg-segmented`):
  - Wrapper: `var(--surface-subtle)` bg, `1px solid var(--border-subtle)`,
    `radius: var(--radius-md)`, `padding: 3px`.
  - Two buttons (`Laser sheet` / `Thermal`) with icons. Active state has
    white background + small shadow. Inactive is transparent.

- **Preset dropdown** (`.lg-select`) — native `<select>` filtered to the
  current mode, showing `{name} · {sku}`.

- **Geometry table** (`.lg-kv`) — two-column grid, `column-gap: 16px`,
  `row-gap: 4px`. Left column = label (muted), right column = value
  (mono, right-aligned). Rows:
  - Label size — `1.28″ × 0.5″`
  - Page (laser only) — `8.5″ × 11″`
  - Grid (laser only) — `5 × 17 = 85/sheet`
  - Pitch (laser only) — `1.4″ × 0.63″`
  - Margins (laser only) — `0.24″ top · 0.77″ left`
  - Vendor (if present) — `USA Scientific Inc.`

- **Border checkbox** (`.lg-checkbox`) — small label "Show label border
  in PDF" with native checkbox.

---

### 3. Center Workspace  (`.lg-center`, fills remaining width)

Background is a soft top-glow gradient + cool linear gradient:

```css
background:
  radial-gradient(ellipse at 50% -8%, rgba(92,141,255,0.05), transparent 50%),
  linear-gradient(180deg, #f5f7fa 0%, #f1f3f6 100%);
```

#### 3a. Canvas header (`.lg-canvas-header`)

- Padding `14px 28px`, bottom border `1px solid var(--border-subtle)`,
  translucent white background with `backdrop-filter: blur(6px)`.
- Left: emoji + preset name (0.94rem / 600) + dimension chips. The
  primary dim chip is mono on white; the grid chip
  (`grid 8×3`) is muted without a border.
- Right: hint text (0.74rem / muted) — "Drag fields on the label · resize
  from the corner handle · arrow keys to nudge". Hidden ≤1100px wide.

#### 3b. Stage (`.lg-stage-wrap` → `.lg-stage` → `.lg-stage-canvas`)

- Wrapper is flex-centered, `padding: 32px 28px 16px`.
- `.lg-stage` is `width: min(100%, 720px)`, `position: relative`.
- Above the canvas, `.lg-stage-meta` shows two mono pills with the actual
  label width and height (e.g. `1.28″ × 0.5″`).
- The canvas itself (`.lg-stage-canvas`):
  - `aspect-ratio: {labelWidth} / {labelHeight}` (set via CSS variable
    `--label-aspect` on the parent).
  - `border-radius: 12px`, `border: 1.5px solid var(--border)`,
    `box-shadow: 0 24px 48px rgba(15,23,42,0.10), 0 6px 14px rgba(15,23,42,0.05)`.
  - White fill.

- **Grid overlay** (`.lg-stage-grid`) — three variants:
  - `lines`: 1px translucent grid lines on `var(--grid-cols)` × `var(--grid-rows)`.
  - `dots`: small dots at every intersection.
  - `none`: hidden.

  Ship only `lines` — the others are prototype Tweaks.

- **Grid size** is derived from label aspect, not configured by the user.
  See `gridForLabel(wIn, hIn)` in `design/app.jsx`:

  ```js
  // aspect ratio → (cols, rows)
  ≥ 4.0   → 12 × 3
  ≥ 2.4   →  8 × 3
  ≥ 1.6   →  6 × 4
  ≥ 1.0   →  5 × 4
  <  1.0  →  4 × 5
  ```

  When the user switches to a preset whose label has a different aspect,
  preserve the same relative field placement by scaling each field's
  `col`, `row`, `w`, `h` proportionally (`Math.round(f.col * newCols /
  oldCols)`).

#### 3c. Field blocks on the canvas

Each field is an absolutely positioned `<div>` placed by percentage:

```js
left   = (col / gridCols) * 100%
top    = (row / gridRows) * 100%
width  = (w   / gridCols) * 100%
height = (h   / gridRows) * 100%
```

Three visual variants, each with a colored fill + border. Border becomes
solid darker shade and a focus ring appears when selected.

| Type        | Fill              | Border               | Selected border  |
| ----------- | ----------------- | -------------------- | ---------------- |
| DataMatrix  | `var(--green-bg)` | `var(--green-border)`| `var(--green)`   |
| CSV         | `var(--blue-bg)`  | `var(--blue-border)` | `var(--blue)`    |
| Static      | `var(--yellow-bg)`| `var(--yellow-border)`| `var(--yellow)` |

- Common: `border-radius: 8px`, `border-width: 1.5px`,
  `padding: 8px`, `cursor: grab` (turns to `grabbing` while dragging),
  hover adds `box-shadow: 0 0 0 3px rgba(15,23,42,0.05)`,
  selected adds `box-shadow: 0 0 0 3px rgba(47,95,211,0.18), 0 6px 16px
  rgba(15,23,42,0.08)` and `z-index: 2`.

- **Content** centered inside, displayed as icon + label. Icon comes
  from `components.jsx` (Database for CSV, Type for Static, decorative
  12×12 DataMatrix pattern for DataMatrix).

- **Resize handle** (`.lg-field-handle`) — bottom-right 12×12 px corner
  with double-line ╲ indicator. Opacity 0 → 0.85 on hover/select.

- **Meta stamp** (`.lg-field-meta`) — top-right mono `{w}×{h}` cell
  count, opacity 0 → 0.78 on hover/select.

##### Drag behavior

- Pointer down on a field → set it selected, capture mouse, record
  starting col/row/w/h and the stage's per-cell width/height in px.
- Pointer move → translate Δpx into Δcells, round, clamp to
  `0..gridCols - w` / `0..gridRows - h`, call `updateField`.
- Pointer down on the handle → same but mutates `w` / `h` instead.
- Click on empty stage → deselect.

##### Keyboard

When a field is selected and the focus is not inside an `<input>` or
`<textarea>`, arrow keys nudge the selected field by one cell (with the
same clamping). Implemented as a window-level `keydown` listener.

#### 3d. Sample preview strip (`.lg-samples`)

Below the stage, only shown when CSV has rows.

- Padding `22px 28px 24px`, top border, translucent white background
  (`rgba(255,255,255,0.65)`).
- Header row: uppercase title "Sample preview" + a small mono sub
  `first {n} of {total}` (0.72rem / `var(--text-dim)`). Right-side
  meta-pill `[eye icon] starting at sheet cell {N}`.
- Horizontally scrolling row of up to 6 sample labels (`.lg-sample`):
  220px wide, `aspect-ratio: var(--label-aspect)`,
  `border: 1px solid var(--border)`, `radius: 8px`, `var(--shadow-sm)`.
- Inside each sample, fields are placed at the same percentages as on
  the design canvas, but rendered as:
  - DataMatrix → solid dark block (`#1a1a1a`) with a faint texture
    suggesting a DM code. (Real bwip-js render happens at PDF time.)
  - Text fields → 9px monochrome text at the field's alignment.
- Bottom-right corner counter `{i+1}` in mono.

---

### 4. Right Rail  (`.lg-rail.lg-rail-right`, width 340px)

White background, left border. Three stacked sections.

#### 4a. Label content section

- Header — `LABEL CONTENT` + `{n} fields` aux pill.

- **Add field cards** — a 3-column grid (`.lg-add-grid`, gap 6px):

  | Card        | Title         | Sub             | Icon bg              |
  | ----------- | ------------- | --------------- | -------------------- |
  | DataMatrix  | `DataMatrix`  | `scannable code`| `var(--green-bg)`    |
  | CSV         | `CSV field`   | `from column`   | `var(--blue-bg)`     |
  | Static      | `Static`      | `fixed text`    | `var(--yellow-bg)`   |

  Each card has `padding: 10px 6px 8px`, hover translates `-1px` and
  adds `shadow-sm`. Icon square is 28×28, `radius: 7px`. Title
  0.74rem / 600. Sub 0.66rem / muted.

- **Field cards list** (`.lg-field-list`, vertical gap 6px) — one card
  per field. Each `.lg-field-card`:
  - Grid: `28px 1fr auto`, gap `10px`, padding `9px 10px`.
  - Border `1px solid var(--border-subtle)`, radius-md, white bg.
  - Selected state: `var(--blue-border)` border, `var(--blue-bg)` fill,
    `0 0 0 3px rgba(92,141,255,0.10)` shadow.
  - Left chip — 28×28, the same colored fill as the field type
    (`.dm`/`.csv`/`.stat`) with that type's icon.
  - Middle — name (0.82rem / 600) over subtitle:
    - DataMatrix → `encodes {column}`
    - CSV → `csv · {column}`
    - Static → `static · "{text}"`
    (subtitle in mono, muted)
  - Right — size pill `{w}×{h}` (mono on `var(--surface-subtle)`) + ×
    button. The × button is 22×22, transparent until hover (then
    `var(--red-bg)` + `var(--red-border)`).

- **Properties panel** (`.lg-props`) — shows ONLY when a field is
  selected.
  - Container: `var(--surface-subtle)` bg, subtle border, padding 14px.
  - Title row: `Properties` + red `Remove` link button.
  - Form fields (one per row):
    - `Field name` — text input.
    - `CSV column` / `Encodes column` (CSV and DM only) — `<select>`
      over CSV headers.
    - `Static text` (static only) — text input.
    - Two-up: `Alignment` (left/center/right) + `Font scale` (0.6 – 2.0,
      step 0.1).
  - Geometry strip at the bottom: `{col},{row} position · {w}×{h} size`
    in muted mono.

#### 4b. Sheet placement section (laser-sheet mode only)

- Header — `SHEET PLACEMENT` + `{cols}×{rows}` aux pill.

- **Mini sheet** (`.lg-sheet`) — `aspect-ratio: {pageW} / {pageH}`,
  white card with a CSS-grid inside, `gap: 1px`.

  Each cell is small (1–6 px on the long side depending on preset)
  with one of four states:

  | State   | Style                                                                                       |
  | ------- | ------------------------------------------------------------------------------------------- |
  | `use`   | `var(--blue-bg)` fill, `var(--blue-border)` border. Hover: solid `var(--blue-border)`.      |
  | `skip`  | Diagonal hatch (`repeating-linear-gradient(135deg, transparent 0 2px, rgba(0,0,0,0.10) 2px 4px)`). |
  | `past`  | `var(--surface-subtle)` fill at `opacity: 0.4`. Cursor `not-allowed`.                       |
  | `start` | Solid `var(--green)` fill, `var(--green-dark)` border, `0 0 0 2px var(--green-bg)` shadow.  |

  - **Click** on a non-past cell → toggle `use` ↔ `skip`.
  - **Shift+Click** on any cell → set it as the new start cell.

- **Stats row** below the grid — three inline items with little color
  swatches: `start · cell {N}`, `{n} usable`, `{n} skipped`.

- **Hint paragraph** (0.7rem / muted) reiterates the click vs
  shift-click affordance.

---

### 5. Bottom Action Bar  (`.lg-bottom-bar`, height ~64px)

Sticky at the bottom of the viewport. Translucent white,
`backdrop-filter: blur(10px)`, `box-shadow: 0 -4px 12px rgba(15,23,42,0.04)`.

Left side — three stats with mono numerals and tiny labels under each,
separated by 1px vertical dividers (32px tall, `var(--border-subtle)`).

- `{rows.length}` — `labels to print`
- `{sheetsNeeded}` — `laser sheets` (or `thermal pages` in thermal mode)
- `{usableCells}` — `usable cells / sheet 1` (laser mode only)

Numeral: 1.35rem / 700, tabular-nums.

Right side — two buttons:

- `Preview PDF` — ghost button: white bg, `1px solid var(--border)`,
  `var(--text-secondary)` text. With eye icon.
- `Generate PDF` — primary button: `var(--text)` bg, white text. With
  download icon. Disabled (no opacity) when CSV is empty or no fields.

`.lg-btn` shared shape: `padding: 8px 14px`, `radius: var(--radius-md)`,
`font-size: 0.82rem`, `font-weight: 600`. Hover on primary: `opacity: 0.88`.

## Interactions & Behavior

### CSV import

- **File upload** — hidden `<input type="file">` triggered by clicks on
  either the empty drop zone or the "Replace" link button. Read as text
  via `FileReader`, set into state.
- **Paste** — the `<details>` block contains a textarea bound directly
  to the same `csvText` state.
- **Parsing** — see `parseCsv` in `design/app.jsx`. Splits on `\n`,
  honors `"`-quoted cells with `""` escapes, comma delimiter. The
  existing `tool.js` has a more complete parser that also handles tab
  and semicolon delimiters with auto-detection and a "first row is
  header" toggle — **keep that parser**. Just feed its output into the
  new UI's `{headers, rows}` shape.

### Preset switching

- When the mode (laser/thermal) flips, reset `presetId` to the first
  preset in that mode if the current one doesn't match.
- When the preset changes, recompute the grid via `gridForLabel(...)`.
  If the grid shape changed, scale every field's `col/row/w/h`
  proportionally before re-rendering.

### Field add / remove

- Adding a field assigns a unique id, picks a default position+size
  from `FIELD_DEFAULTS[type](grid)`, and auto-selects the new field.
- For CSV fields, the default `source` is `headers[0]` (and the label
  defaults to the same column name).
- Removing a field unselects if it was selected.

### Sheet placement

- `plan` is an array of length `preset.columns * preset.rows`, each
  value either `"use"` or `"skip"`.
- `startCell` is an integer cell index. Cells `0..startCell-1` render
  as `past` (un-clickable).
- Recompute `plan` to all-`use` whenever `totalCells` (cols*rows)
  changes.
- `usableCells = plan.slice(startCell).filter(s => s !== 'skip').length`.
- `sheetsNeeded` (laser) = `max(1, ceil(max(0, rows.length -
  usableCells) / totalCells) + 1)`.
- `sheetsNeeded` (thermal) = `rows.length` (one page per label).

### Template save / load (existing functionality)

- Save / Load / Reset Template still use `localStorage` under the key
  `labtools.labelGenerator.template.v1` — see the constant in the
  current `tool.js`. The redesign exposes only "Save template" in the
  top nav for now; keep Load and Reset reachable from a menu or
  rail action.

### PDF generation (existing functionality)

The existing `tool.js` handles PDF generation with `pdf-lib` and
`bwip-js`. **Do not rewrite it.** Wire the new "Generate PDF" button
to the same routine. Show generation status in a small toast or in
place of the bottom-bar stats while generating (no blocking modal).

## Responsive Behavior

| Width      | Layout                                                  |
| ---------- | ------------------------------------------------------- |
| ≥ 1280px   | Full: 296 / 1fr / 340. Nav pills + canvas hint visible. |
| ≤ 1280px   | Rails tighten to 260 / 1fr / 304.                       |
| ≤ 1100px   | Rails 232 / 1fr / 280. Nav pills + canvas hint hidden. Stage padding shrinks. |
| ≤ 820px    | Single column. Rails stack above and below the canvas.  |

## Things to Preserve from the Old Tool

- CSV parser with delimiter auto-detect (`,`, `\t`, `;`) and quoted
  cells.
- The "first row is header" override.
- Overlap detection — overlapping fields get a yellow warning border
  and the overlap warning bar appears (you can reuse `.lt-alert-warn`
  or render an inline strip below the stage).
- Geometry validation for custom laser presets (errors block export).
- DataMatrix length warnings for tiny labels.
- Browser-saved laser presets from the Thermal-To-Laser tool
  (`localStorage` key `labtools:thermal-to-laser:user-presets:v1`).
- The custom-laser and custom-thermal preset editors. The redesign
  doesn't surface them yet — put them behind a "Custom…" option at the
  bottom of the preset dropdown and reveal a small form below
  the dropdown (using `.lg-kv`-style 2-column layout).
- Save/Load/Reset Template buttons.
- Generate PDF + Download PDF + inline PDF preview.

## State Shape Reference

```js
state = {
  csvText: string,
  fileName: string,
  // derived: parseCsv(csvText) → { headers: string[], rows: Object[] }

  mode: 'laser-sheet' | 'thermal',
  presetId: string,
  // derived: preset = presets.find(p => p.id === presetId)
  borderInPdf: boolean,

  // derived: grid = gridForLabel(preset.labelWidth, preset.labelHeight)
  fields: Array<{
    id: string,
    type: 'datamatrix' | 'csv' | 'static',
    label: string,
    source?: string,       // CSV column for csv/datamatrix
    staticText?: string,   // for static
    col: number, row: number, w: number, h: number,
    align?: 'left' | 'center' | 'right',
    scale?: number,
  }>,
  selectedFieldId: string,

  plan: Array<'use' | 'skip'>,
  startCell: number,
}
```

## Out-of-Scope (Do Not Ship)

- The `tweaks-panel.jsx` floating panel — that's prototype-only.
- The `accent-mono` / `accent-forest` theme variants.
- The `grid: dots` and `grid: none` variants.
- The `fstyle: minimal` field style.
- Density toggle.

Ship the default state of every Tweak: lines grid, color field style,
regular density, blue accent, both sample preview and sheet placement
visible.

## Implementation Checklist

1. Replace `tools/label-generator/index.html` with vanilla HTML
   matching the layout above. Reuse the existing `lt-nav`, `lt-btn`,
   `lt-input`, `lt-select`, `lt-checkbox-row` classes where they fit;
   add tool-local classes (`.lg-…`) in a `<style>` block for the rest.
   Mirror the CSS in `design/styles.css` + `design/extra.css`, dropping
   the tokens that already live in `assets/css/labtools.css`.
2. Rewrite `tool.js` as a single `state` object + a `render()` function
   that idempotently rebuilds each section's DOM. Bind events once
   during init; have event handlers mutate `state` and call `render()`.
   The current file already follows this pattern — keep its CSV / PDF /
   preset / storage code and replace only the wizard layer.
3. Strip the step bar (`.step-bar` etc.) and the three `.step-panel`
   wrappers. Everything is one screen.
4. Move sheet placement out of step 3 into the right rail (and only
   for laser mode).
5. Add the live sample preview row below the canvas (new — the old
   tool didn't have this).
6. Add the sticky bottom action bar (new).
7. Manually verify in Chrome, Safari, and Firefox — no console errors,
   keyboard arrow nudge works, drag/resize work, mode switch resizes
   fields proportionally, sheet placement clicks toggle correctly,
   PDF generates.
8. Update `tools/label-generator/README.md` to describe the new flow.

## Assets

Icons in `design/components.jsx` are inline SVG paths drawn in the
24×24 viewBox at 1.6px stroke. Either copy them into a small inline
helper in `tool.js`, or replace them with the codebase's existing
icon convention if there is one. No raster images are required.
