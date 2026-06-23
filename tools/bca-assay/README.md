# BCA Assay Calculator

Browser-based protein concentration calculator using the BCA (Bicinchoninic Acid) method.

## What it does

1. Accepts a BSA standard curve (up to 7 points, 1–3 OD replicates each)
2. Fits a linear regression (OD vs. concentration)
3. Interpolates protein concentration for unknown samples
4. Flags extrapolated or below-detection results

## Inputs

- Standard concentrations (µg/mL) + absorbance readings at 562 nm
- Sample name, OD readings, and optional dilution factor
- CSV paste from plate reader export

## Outputs

- Curve equation, R², slope, intercept
- SVG standard curve plot with sample overlay
- Per-sample protein concentration (µg/mL) with quality flags
- CSV export

## Default standards

Pierce/Thermo BSA series: 0, 25, 125, 250, 500, 1000, 2000 µg/mL
