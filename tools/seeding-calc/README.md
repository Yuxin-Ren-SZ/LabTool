# Cell Seeding Calculator

A two-step tool for calculating stock cell concentration, then solving a C1V1 = C2V2 dilution plan. Part of the [LabTools](../../) collection.

## Workflow

### Step 1: Cell Count

Use the same hemocytometer workflow as the standalone Cell Count Calculator:

- Select one of the four counting modes.
- Enter live Count 1 and optional Count 2.
- Enter dilution factor and resuspension volume.
- Optionally enter dead-cell counts for Trypan Blue viability.
- Use `Copy Results`, `Export CSV`, or `Reset` for the count step.
- Continue with `Next: Dilution` after a valid final concentration is available.

If the stock concentration is already known, enable bypass mode and enter it directly. The bypass input supports cells/mL, K/mL, M/mL, and B/mL unit pills.

### Step 2: Dilution

C1 is carried forward from Step 1. Enter any two of the remaining three variables and click `Calculate`; the missing value is solved.

| Variable | Meaning | Base unit |
|---|---|---|
| C1 | Stock concentration | cells/mL |
| V1 | Stock volume to transfer | mL |
| C2 | Target seeding concentration | cells/mL |
| V2 | Final total volume | mL |

Concentration fields support cells, K, M, and B unit pills. Volume fields support uL, mL, and L. The solved value is highlighted, and volume solves also show the media volume to add where applicable.

## Rules And Validation

- Exactly one of C2, V1, and V2 must be blank when solving Step 2.
- If all dilution fields are filled, clear the value you want the tool to solve.
- `Next: Dilution` is disabled until Step 1 has a valid stock concentration.
- `Back` returns to Step 1 with existing values preserved.
- `Reset dilution` clears C2, V1, and V2 while keeping the carried C1 value.

## Export

- Step 1 `Export CSV` downloads `cell-count-results.csv`.
- Step 2 `Export All CSV` downloads `seeding-calc-results.csv`.
- Copy actions produce plain-text summaries for the count-only or full workflow results.

## Independence

This tool contains its own cell-count UI and does not import from `tools/cell-count/`. Both tools use shared helpers from `assets/js/labtools-calc.js`.
