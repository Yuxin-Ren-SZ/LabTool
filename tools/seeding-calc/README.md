# Cell Seeding Calculator

A guided two-step tool for counting cells and calculating the dilution needed to reach a target seeding density. Part of the [LabTools](../../) collection.

---

## Workflow

### Step 1 — Cell Count
Identical to the standalone Cell Count Calculator. Count your cells on the hemocytometer to obtain the **Final Density** (cells/mL) of your stock suspension.

- Select counting mode (all 25 small squares → single corner)
- Enter Count 1, and optionally Count 2 (second chamber load)
- Enter Dilution Factor and Resuspension Volume
- Optionally enter dead cell counts for Trypan Blue viability
- Click **Next: Dilution →** once a Final Density is calculated

### Step 2 — Dilution (C₁V₁ = C₂V₂)
C₁ is automatically carried over from Step 1. Provide any two of the remaining three values and the fourth is solved instantly.

| Variable | Meaning | Unit |
|---|---|---|
| C₁ | Stock concentration (from Step 1) | cells/mL |
| V₁ | Volume to take from stock | mL |
| C₂ | Target seeding concentration | cells/mL |
| V₂ | Final total volume | mL |

The solved variable is highlighted in green. When solving for V₁ or V₂, a summary line also shows the volume of media to add.

---

## Navigation

- **Next: Dilution →** — enabled only when Step 1 has a valid Final Density. Carries C₁ to Step 2.
- **← Back** — returns to Step 1 with all values preserved.
- **↺ Reset dilution** — clears C₂, V₁, V₂ while keeping the C₁ prefill from Step 1.

---

## Independence from Cell Count Calculator

This tool contains its own copy of the cell count logic and does not depend on the standalone Cell Count Calculator (`tools/cell-count/`). Both tools can be used independently.
