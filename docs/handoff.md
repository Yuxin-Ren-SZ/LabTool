# Handoff: LabTools / Cell Count Calculator

## Context
Yuxin is working on the **MEA Chip Project** lab notebook in Notion. We've been improving the **Claude's Template** page, specifically the **Dissociation Procedure** subpage's Cell Count section.

---

## What was built

### 1. `cell_count_calculator.html`
An interactive hemocytometer cell count calculator with two modes:

**Standard Formula mode:**
- 🟢 Live Count 1 & 2 (either or both — single count supported)
- 🔴 Dead Count 1 & 2 (optional, either or both — for Trypan Blue viability)
- Dilution Factor (default: **20**)
- Resuspension Volume (mL)
- Auto-calculates: **Average Live Count**, **Viability %**, **Total Live Cells** (avg × DF × 10⁴), **Final Density** (cells/mL)

**Custom Formula mode:**
- Same inputs as above
- Free-text formula field using variables: `l1`, `l2`, `d1`, `d2`, `avg_live`, `avg_dead`, `via`, `df`, `vol`
- Live result with error handling

### 2. Notion — Dissociation Procedure page
- The old static Cell Count table was replaced with a live **🔬 Cell Count Calculator** Notion database
- Database URL: https://www.notion.so/b4a5a6740d41432e9517744a5fca651f
- Formula properties: Average, Total Cells, Final Density (cells/mL)
- Parent page: **Dissociation Procedure** → **Claude's Template** → **MEA Chip Project**

---

## Pending task (reason for handoff)

Yuxin wants to save `cell_count_calculator.html` into **`~/Code/LabTools/`** on their Mac and initialize a git repo there.

The working directory could not be switched mid-session. **In the new session, ask Yuxin to select `~/Code/LabTools/` as the working folder** (create it first if needed: `mkdir -p ~/Code/LabTools` in Terminal), then:

1. Copy `cell_count_calculator.html` into the mounted folder
2. Run `git init` in that folder
3. Make the initial commit

The file is currently saved at:
`/sessions/.../mnt/outputs/cell_count_calculator.html`
— but that session's temp folder will be gone. **Yuxin should bring the HTML file to the new session** (it's in their outputs folder), or it can be regenerated from this doc if lost.

---

## Notion page URLs for reference

| Page | URL |
|---|---|
| MEA Chip Project | https://www.notion.so/1fa040a9a3d7801292cdd28b698f14b7 |
| Claude's Template | https://www.notion.so/336040a9a3d781cb8766cec519f83014 |
| Dissociation Procedure | https://www.notion.so/336040a9a3d781e0aed2da906b8ac1bb |
| Culture Log | https://www.notion.so/336040a9a3d7810fa658f704a5249882 |
| Cell Count Calculator DB | https://www.notion.so/b4a5a6740d41432e9517744a5fca651f |

---

## Possible future improvements (mentioned or implied)
- Further refinement of the Dissociation Procedure template content
- Improvements to the Culture Log template
- Additional tools to add to the LabTools repo
