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
| **Tabular Results** | **Required.** One row per well × dye: Cq, Final Call, Target, Threshold, Baseline, Efficiency, etc. Drop **several** to load them as **multiple plates** (see below). |
| **Amplification Plots** | Optional. Per-well ΔR-vs-cycle traces — enables the curve viewer. |
| **Plate Setup** | Optional. Pre-fills sample names. |
| **Thermal Profile** | Optional. Shown as a one-line cycling summary. |
| **Experiment Notes** | Optional. Shown in the run summary. |
| **Microplate Layout Planner `.csv`** | Optional. A layout exported by the [Microplate Layout Planner](../microplate-layout-planner/) tool (`plate_type,plate,well,group,sample,gene,…`). Each well's `sample` becomes its sample name, `group` a group override, and `gene` its target; a `plate` column maps labels onto multi-plate runs. A layout with only a `group` column still works — the `group` is used as the sample name. |

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
  Filter by **With Cq** (default — hides empty wells so a 96-well plate isn't 96 rows), **Named**,
  or **All**, plus a free-text sample/gene search and a live group count.
- **Data QC — 5 checks (MIQE)** — a pass/warning/fail panel implementing the manual's §5.2
  checklist: (1) technical-replicate Cq SD < 0.5, (2) NTC no signal, (3) NRT control,
  (4) melt-curve single peak (SYBR; needs a Tm column), (5) Cq cutoff / below-detection, plus
  biological-n and reference-count design checks. An adjustable **n.d. cutoff** (default Cq > 38)
  marks below-detection wells, which are excluded from ΔCq and statistics (never treated as 0).
- **Standard curve & efficiency** — when the export has `Well Type = Standard` wells with a
  Quantity, each gene's amplification efficiency is fitted (E = 10^−1/slope; slope/R²/E shown),
  and that E feeds the efficiency-corrected (Pfaffl) fold change.
- **ΔΔCq relative quantification** — the biological-replicate-based workflow from Chapter 5:
  - Each distinct **Sample** name is one **biological replicate**; **Group** (Control/Treatment)
    is the comparison axis, auto-read from names like `Control_1` or set explicitly with the
    **Group** assignment. Technical replicate wells are averaged first (no pseudoreplication).
  - Pick **one or more reference genes** (Cq averaged, geNorm-style) and the **control group**.
    ΔΔCq is taken against the **control-group mean** ΔCq, so the control keeps its own error bar.
  - Reports per group×gene: n (biological), mean ΔCq, ΔΔCq, fold, 95% CI, a two-tailed
    **t-test on ΔCq** (Yuan 2006) with **Holm** multiple-testing adjustment, and significance.
    A **paired-design** toggle switches control to subtract itself. A warning flags any group
    with < 3 (or n = 1) biological replicates.
  - The **fold-change chart** shows a bar per group with 95%-CI whiskers and every biological
    replicate overlaid as a dot (publication best practice), with significance stars.
- **MIQE 2.0 checklist** — the 12 essential items (Bustin et al. 2025), auto-statused where the
  run allows (references ≥ 2 + geNorm M, efficiency, biological n, stats on ΔCq, NTC/NRT/melt,
  raw-data reminder, efficiency correction, LOD/LLOQ, power).
- **Methods paragraph** — a submission-ready draft filled from the run (instrument, n per group,
  references, ΔΔCq vs Pfaffl, t-test, n.d. handling), following the §5.8.5 template.

## Multiple plates

Drop **more than one Tabular Results file** to load them together — each file becomes a **plate**
(named from its filename). The **Plate overview** shows every plate side by side; the results table
gains a **Plate** column. Wells are namespaced per plate, so identical well names (both plates have an
`A1`) never collide. The **summary, QC, standard curve, ΔΔCq, statistics, MIQE and Methods** panels all
combine the plates into one experiment.

- **Biological replicates combine across plates** by sample name and group — e.g. `Control_1…3` on plate 1
  and `Control_4…6` on plate 2 give n = 6.
- **Inter-plate calibrator (MIQE §5.7):** if the same sample name appears on ≥ 2 plates (a shared cDNA run
  on every plate), pick it as the **inter-plate calibrator**. Each plate's ΔCq is corrected by that
  calibrator's offset before replicates are pooled, removing plate-to-plate batch shift. The ΔΔCq section
  reports whether the correction was applied.
- **Batch-confound check:** a QC item flags any plate that carries only one experimental group (the
  all-control-on-one-plate design that confounds group with plate). Keep both control and treatment on
  every plate, or supply a calibrator.
- **Labels round-trip** with a **Plate** column, so `Export labels` → drop-back restores sample/group/gene
  across all plates. Amplification-curve overlay and custom-threshold recompute remain single-plate only
  (their exports are keyed by bare well label).

## Outputs

- Results table → **CSV download** or **copy as CSV** (paste into Excel / Prism).
- ΔΔCq table → CSV download (group, gene, n, ΔCq, ΔΔCq, fold, 95% CI, t/df/p, Holm-adjusted p).
- Methods paragraph → **copy** to clipboard.
- Plate heatmap, amplification chart, and fold-change chart → **PNG**.

## Notes

- By default it shows the Cq, calls, and thresholds the Agilent software computed. When you
  set a custom threshold it recomputes Cq by interpolating the ΔR curve crossing (it does
  not re-baseline the raw fluorescence); Reset returns to the instrument values.
- No data is persisted between sessions — reload starts fresh. Sample/gene labels, custom
  thresholds, and ΔΔCq choices live in memory for the current session only.
- **Re-importing labels after a refresh:** use **Export labels** to save a
  `…labels.csv` (`Well,Sample,Group,Gene`, plus a leading `Plate` column for multi-plate runs).
  After reloading the page, drop the **Tabular Results** export(s) **together with** that `labels.csv`
  (all files at once, any order). The Well, Sample, Group (explicit overrides) and Gene assignments are
  restored. Dropping the labels file
  on its own does nothing — it needs the Cq data to attach to.
