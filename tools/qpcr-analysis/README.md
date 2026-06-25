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

UTF-8 and UTF-16 (with BOM) encodings are both handled.

## Features

- **Run summary** — experiment name, dyes, targets, well/positive counts, thermal profile.
- **Plate overview** — 96-well (or detected size) heatmap, colored by Final Call,
  Cq gradient, or target. Click a well to plot its curve. Export as PNG.
- **Results table** — sortable and filterable (by dye / call). Sample names are
  **editable inline**; replicates that share a name are grouped automatically.
- **Amplification curves** — overlay selected wells' ΔR traces with per-dye threshold
  lines, linear or log scale. Export as PNG.
- **Per-sample / target summary** — n, positives, mean Cq, SD Cq per (sample, target, dye).
- **ΔΔCq relative quantification** — pick a reference (housekeeping) target and a
  calibrator sample to compute ΔCq, ΔΔCq, and fold change (2^−ΔΔCq). Requires at least
  two targets with Cq values and named samples; otherwise the section explains what's missing.

## Outputs

- Results table → **CSV download** or **copy as TSV** (paste into Excel / Prism).
- ΔΔCq table → CSV download.
- Plate heatmap and amplification chart → **PNG**.

## Notes

- The tool does not re-call Cq or re-baseline; it reads the values the Agilent software
  computed. It is an analysis/visualization layer on top of the export.
- No data is persisted between sessions — reload starts fresh. Sample-name edits live in
  memory for the current session only.
