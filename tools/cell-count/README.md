# Cell Count Calculator

Interactive hemocytometer cell count calculator for the Neubauer improved chamber.
Part of the [LabTools](../../) collection.

---

## What it does

Enter your raw cell counts from the hemocytometer and the tool calculates:

- **Final Density** — concentration of cells in your stock suspension (cells/mL)
- **Total Live Cells** — total cells in your tube (requires resuspension volume)
- **Viability %** — live cell fraction via Trypan Blue exclusion (optional)

---

## Counting Modes

Select the mode that matches your protocol by clicking the hemocytometer diagram.

| Mode | Squares counted | Best for |
|---|---|---|
| All 25 small squares | All 25 inner squares of center box | Very dense samples |
| 5 small squares | 4 corners + center of inner grid | Dense samples |
| 4 corner squares | 4 large corner squares | Standard routine counting |
| 1 corner square | 1 large corner square | Quick estimate |

---

## Inputs

### Count 1 / Count 2
Enter the **total cells counted** across all squares in your chosen mode — not a per-square average. The tool handles the averaging and area scaling internally.

**Count 2 is optional.** Use it when loading the hemocytometer twice (two chambers) without cleaning between loads. The two counts are averaged before calculating.

The same Count 1 / Count 2 structure applies to dead cells.

### Dilution Factor
How much you diluted your sample before loading. For example, mixing 10 µL cells + 10 µL Trypan Blue gives a dilution factor of 2.

Default is **20** (common for 1:20 dilution with Trypan Blue + media).

### Resuspension Volume (mL)
The volume of media your cell pellet was resuspended in — i.e., the total volume of your stock tube at the time of sampling. This is used to convert concentration → total cell count.

---

## Formulas

```
Final Density (cells/mL) = avg_count × multiplier × DF × 10⁴

Total Live Cells = Final Density × Resuspension Volume (mL)
```

Where `multiplier` depends on counting mode:

| Mode | Multiplier | Reason |
|---|---|---|
| All 25 small squares | × 1 | 25 small sq = 1 large sq in area |
| 5 small squares | × 5 | Scale 5 small → 25 small (1 large sq) |
| 4 corner squares | ÷ 4 | Average across 4 large squares |
| 1 corner square | × 1 | Direct read from 1 large square |

The hemocytometer large square volume is 0.1 µL = 10⁻⁴ mL, giving the × 10⁴ factor.

---

## Count All Cells mode

Check **"Count all cells (no Trypan Blue)"** in the live cell section if you are not using a viability dye. This disables and greys out the dead cell inputs. The result is labelled "Total Cells" instead of "Total Live Cells" and viability is not calculated.

---

## Notion integration

A companion Cell Count Calculator database lives in the MEA Chip Project notebook:

| Page | URL |
|---|---|
| MEA Chip Project | https://www.notion.so/1fa040a9a3d7801292cdd28b698f14b7 |
| Claude's Template | https://www.notion.so/336040a9a3d781cb8766cec519f83014 |
| Dissociation Procedure | https://www.notion.so/336040a9a3d781e0aed2da906b8ac1bb |
| Cell Count Calculator DB | https://www.notion.so/b4a5a6740d41432e9517744a5fca651f |
