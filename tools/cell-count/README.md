# Cell Count Calculator

Interactive hemocytometer calculator for Neubauer improved chambers. Part of the [LabTools](../../) collection.

## What It Does

Enter raw live and optional dead cell counts, then calculate:

- Final concentration in cells/mL
- Total live cells, or total cells when Trypan Blue is not used
- Viability percent from Trypan Blue exclusion
- Copyable plain-text results
- Downloadable `cell-count-results.csv`

## Counting Modes

Select the mode that matches the squares counted on the hemocytometer diagram.

| Mode | What to enter | Multiplier |
|---|---|---:|
| All 25 small squares | Total cells across all 25 center-grid small squares | 1 |
| 5 small squares | Total cells across the four corner small squares plus center small square | 5 |
| 4 corner squares | Total cells across all four large corner squares | 0.25 |
| 1 corner square | Cells in one large corner square | 1 |

The tool expects totals for the selected mode, not per-square averages. If Count 2 is provided, Count 1 and Count 2 are averaged before applying the mode multiplier.

## Inputs

| Input | Notes |
|---|---|
| Live Count 1 / Count 2 | Raw live-cell totals for the selected counting mode. Count 2 is optional. |
| Dead Count 1 / Count 2 | Optional Trypan Blue dead-cell totals for viability. |
| Dilution Factor | Total dilution before loading the chamber. A 10 uL cells + 10 uL Trypan Blue mix is DF 2. |
| Resuspension Volume | Stock tube volume in mL, used to convert concentration to total cells. |
| Count all cells | Disables dead-cell inputs and labels the output as total cells instead of total live cells. |

Default dilution factor is `20`.

## Formulas

```text
Final Concentration (cells/mL) = avg_count x multiplier x DF x 10^4
Total Live Cells = Final Concentration x Resuspension Volume (mL)
Viability % = live_avg / (live_avg + dead_avg) x 100
```

The `10^4` factor comes from one large hemocytometer square volume of 0.1 uL = 10^-4 mL.

## Export And Reset

- `Copy Results` copies a plain-text summary to the clipboard, with a fallback for older browser contexts.
- `Export CSV` downloads `cell-count-results.csv`.
- `Reset` clears inputs, restores defaults, and returns the output cards to the blank state.
