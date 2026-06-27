# qPCR Analysis

Browser-based viewer and analyzer for **Agilent qPCR** text exports (AriaMx /
Stratagene Mx software). Drop the exported `.txt` files and get a plate overview,
sortable Cq results, amplification-curve plots, replicate summaries, and ΔΔCq relative
quantification. Everything runs locally in the browser — no files are uploaded.

## What it parses

The Agilent software exports a run as a folder of tab-separated `.txt` files. The tool
**auto-detects each file by its contents** (not the filename) and accepts any subset
dropped in any order:

| Export | Role |
|---|---|
| **Tabular Results** | **Required.** One row per well × dye: Cq, Final Call, Target, Threshold, Baseline, Efficiency, etc. |
| **Amplification Plots** | Optional. Per-well ΔR-vs-cycle traces — enables the curve viewer. |
| **Plate Setup** | Optional. Pre-fills sample names. |
| **Thermal Profile** | Optional. Shown as a one-line cycling summary. |
| **Experiment Notes** | Optional. Shown in the run summary. |
| **Well Plate Map Generator `.csv`** | Optional. A layout exported by the [Well Plate Map Generator](../experiment-layout/) tool (`plate_type,row,column,well,group,…`); the `group` of each well is imported as its sample name. |

UTF-8 and UTF-16 (with BOM) encodings are both handled.

## Features

- **Run summary** — experiment name, dyes, targets, well/positive counts, thermal profile.
- **Plate overview** — 96-well (or detected size) heatmap, colored by Final Call,
  Cq gradient, target, or assigned sample. Export as PNG.
- **Multi-well selection & bulk assignment** — drag a rectangle across the plate, click
  row/column headers, or tick table rows (Shift-click for ranges). Then assign a
  **Sample** name or a **Gene** label to the whole selection at once. Gene labels apply to
  the current plate dye, so you can name the assay each well carries even though the
  Agilent export only records the dye.
- **Adjustable threshold** — override the instrument threshold per dye; Cq and Final Call
  are **recomputed from the amplification curves** (interpolated threshold crossing) and
  flow through to every table and the ΔΔCq. Reset restores the instrument values.
  (Requires the Amplification Plots export.)
- **Results table** — sortable and filterable (by dye / call). Sample names editable inline.
- **Amplification curves** — plot the selected wells' ΔR traces with the threshold line,
  linear or log scale. **Color by** sample, gene, sample × gene, call, or well — each group
  gets a distinct color — and choose **Together** (one overlaid chart) or **Separate**
  (one small-multiple panel per group). Export as PNG.
- **Per-sample / target summary** — n, positives, mean Cq, SD Cq per (sample, gene, dye).
- **ΔΔCq relative quantification** — choose **one or more reference genes** (their Cq are
  averaged, geNorm-style), a calibrator sample, then **Recalculate** to get ΔCq, ΔΔCq, and
  fold change (2^−ΔΔCq). Updates automatically as you assign samples/genes or change the
  threshold; the section explains what's missing until it can compute.

## Outputs

- Results table → **CSV download** or **copy as CSV** (paste into Excel / Prism).
- ΔΔCq table → CSV download.
- Plate heatmap and amplification chart → **PNG**.

## Notes

- By default it shows the Cq, calls, and thresholds the Agilent software computed. When you
  set a custom threshold it recomputes Cq by interpolating the ΔR curve crossing (it does
  not re-baseline the raw fluorescence); Reset returns to the instrument values.
- No data is persisted between sessions — reload starts fresh. Sample/gene labels, custom
  thresholds, and ΔΔCq choices live in memory for the current session only.
