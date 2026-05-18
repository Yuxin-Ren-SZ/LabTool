# RT-qPCR Workflow Assistant

Browser-only RT-qPCR planning and relative-expression helper for LabTools. It supports 96-well plate planning, reagent scaling, nucleic-acid concentration calculations, and exploratory ΔΔCt analysis from pasted or uploaded CSV-style data.

Part of the [LabTools](../../) collection.

## Scope

This tool is intended for:

- planning 96-well RT-qPCR layouts before pipetting
- calculating primer master mix and sample cDNA/H2O mix volumes
- calculating RNA, DNA, or other nucleic-acid input volume from concentration data
- running single- or multi-reference ΔΔCt calculations from tidy Cq rows
- exporting browser-generated CSV tables for manual review

This tool is not intended for:

- diagnostic interpretation
- instrument-specific binary file parsing
- automatic validation against a kit, primer set, or thermocycler protocol
- replacing final manual review of the exported plate map and calculations

All work happens in the browser. The page has no build step, server dependency, or external runtime package.

## Workflow

1. Open the **Scope** page to confirm the workflow matches the intended use.
2. Enter samples, assays, reference genes, control treatment, technical replicates, and layout mode on **Setup**.
3. Review the generated plate map and loading guide on **Plate**.
4. Edit reagent recipe and overage assumptions on **Reagents**.
5. Paste or upload concentration rows on **Nucleic Acid**.
6. Paste or upload tidy Cq rows on **ΔΔCt**.
7. Export the generated CSV tables needed for review.

The page starts blank by design. Template downloads and placeholders describe accepted formats, but no test dataset is loaded into the tool.

## Input Formats

Samples can be entered as a comma-separated list or one sample per line:

```text
CellLine_control, CellLine_treatment
```

Assays can be entered as a comma-separated list or as CSV:

```text
gene,assay_type,efficiency
ReferenceGene,reference,2
TargetGene,target,1.95
```

Nucleic-acid measurement CSV accepts common headers such as `concentration_ng_per_uL`, `Concentration`, `Conc.`, `Nucleic Acid`, `Nucleic Acid ng/uL`, `A260/A280`, and `A260/A230`.

Tidy Cq CSV accepts headers such as `sample_name`, `sample`, `Sample`, `assay/gene`, `target`, `Target`, `gene`, `Cq`, `Ct`, `CellLineName`, and `Treatment`.

## Plate Layout

The current tool supports 96-well plates. Layout modes are:

- `Auto: pipetting-friendly`
- `Sample rows / assay column groups`
- `Assay rows / sample column groups`
- `Compact fill`

The plate preview is rendered as a fixed HTML table to reduce browser differences. It should still be manually checked in the target browser and on the target machine before relying on the layout for pipetting.

## Reagents And Overage

Prepared reaction count is explicit:

```text
prepared reactions = wells + extra reactions + ceiling(wells x overage percent)
```

Primer master mix is calculated per assay from editable per-reaction volumes:

```text
master mix uL = master mix per reaction x prepared reactions
forward primer uL = forward primer per reaction x prepared reactions
reverse primer uL = reverse primer per reaction x prepared reactions
```

Sample cDNA/H2O mix is calculated per sample:

```text
H2O uL = water per reaction x prepared reactions
cDNA uL = cDNA per reaction x prepared reactions
```

## Nucleic Acid Calculation

The nucleic-acid page is not Nanodrop-specific. It can use Nanodrop, Qubit, plate reader, or manual concentration rows if the concentration is represented as ng/uL.

```text
sample volume uL = target mass ng / concentration ng/uL
diluent uL = final volume uL - sample volume uL
```

QC flags mark missing concentration, sample volume greater than final volume, negative diluent, and purity ratios below the configured thresholds.

## ΔΔCt Analysis

Reference genes are customizable. One or more reference genes can be used. Multiple references use the mean reference Cq per sample for ΔCt.

```text
ΔCt = mean target Cq - mean reference Cq
ΔΔCt = ΔCt - mean control ΔCt within the same CellLineName and target
fold change = PCR efficiency ^ -ΔΔCt
```

PCR efficiency is configurable. `2.0` represents ideal 100% amplification efficiency. Assay CSV rows can define per-target efficiency, or the page can use one default efficiency for every target.

The ΔΔCt page includes a compact visualization of mean ΔΔCt by cell line, treatment, and target. Exported CSV keeps the underlying rows for review.
