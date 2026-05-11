# RT-qPCR Workflow Assistant

Browser-only RT-qPCR setup helper for LabTools. It turns sample and assay names into a pipetting-friendly 96-well plate map, calculates primer master mix and sample cDNA/H2O mix volumes, performs 4 ug RNA input calculations, and runs a compact single-reference Delta-Delta-Ct analysis from pasted Cq values.

Part of the [LabTools](../../) collection.

## Workflow

1. Enter samples as comma-separated `CellLineName_Treatment` names.
2. Enter assays/genes as comma-separated text. `Actin` is marked as the reference assay by default.
3. Review the generated 96-well plate map and loading guide.
4. Export plate map, primer master mix, and sample cDNA/H2O mix CSV files.
5. Paste Nanodrop rows to calculate RNA and water volumes for 4 ug RNA in 32 uL.
6. Paste tidy Cq rows to calculate DeltaCt, DeltaDeltaCt, and fold change.

## Plate Layout

The default layout mirrors the qPCR workflow source project:

- samples load by rows A-H
- assays occupy adjacent column lanes
- technical replicates stay adjacent
- overflow samples use the right-side mini-matrix when possible

For 9 samples, 3 assays, and triplicates, samples 1-8 fill rows A-H across columns 1-9. Sample 9 uses columns 10-12 with assays stacked down rows A-C.

The tool warns when the requested setup needs more than 96 wells.

## Reagent Formulas

Primer master mix is calculated per assay:

```text
total reactions = wells for assay + assay overage
SsoFast = 10 uL x total reactions
forward primer = 0.5 uL x total reactions
reverse primer = 0.5 uL x total reactions
```

Sample cDNA/H2O mix is calculated per sample:

```text
total reactions = wells for sample + sample overage
H2O = 5 uL x total reactions
cDNA = 4 uL x total reactions
```

## RNA Formula

```text
RNA volume = 4000 ng / concentration ng/uL
water to 32 uL = 32 - RNA volume
```

QC flags mark missing concentration, RNA volume above 32 uL, A260/A280 at or below 1.8, and A260/A230 at or below 2.0.

## Delta-Delta-Ct Formula

Single-reference analysis uses:

```text
DeltaCt = Cq target - mean Cq reference
DeltaDeltaCt = DeltaCt - mean control DeltaCt within the same CellLineName and target
fold change = efficiency ^ -DeltaDeltaCt
```

The default control treatment is `siNC`, and the default efficiency is `2.0`.

## Notes

This checked-in LabTool version intentionally does not include the original Streamlit app, Python package, generated PDFs, cache folders, or example output files. LabTools is a zero-dependency static site, so this implementation keeps the workflow portable for direct browser-file usage and GitHub Pages.
