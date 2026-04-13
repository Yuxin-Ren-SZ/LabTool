# Stain Timer

A configurable step-by-step staining protocol timer with a countdown display, progress bar, and audio alarm.

## Workflow

### Page 1 — Protocol Setup

Build your protocol by editing the step list:

| Field | Required | Description |
|---|---|---|
| Solution | Yes | Name of the staining solution (e.g., `95% EtOH`) |
| Duration | Yes | Time in minutes (decimals allowed, e.g., `1.5`) |
| Slot | No | Physical position in your stainer rack |

- **Reorder** steps with the ↑/↓ buttons
- **Delete** a step with the 🗑 button
- **Add Step** appends a blank row at the bottom
- **Alarm buzzer** — toggle on/off; plays 3 beeps when a step completes

**Export Protocol** downloads a CSV you can reload later.
**Import Protocol** reads a previously exported CSV to restore a saved protocol.

The default protocol pre-loaded is the **Myelin Nissl staining** sequence (23 steps, 12 slots).

### Page 2 — Run Timer

Click **Run Protocol →** to enter the timer view.

| Button | Action |
|---|---|
| ▶ Start | Begin countdown for the current step |
| ⏸ Pause | Freeze the timer; remaining time is preserved |
| ▶ Resume | Continue from where it was paused |
| ⏭ Skip | Mark the current step as skipped and move to next |
| ↺ Reset | Return to step 1 (protocol is not changed) |
| ← Back to Protocol | Return to Page 1 to edit the protocol |

If any slots are assigned in the protocol, page 2 also shows a horizontal slot rack from `1` through the highest slot number used. The current step's slot is highlighted with a subtle pulse.

If the current step has no slot assigned, the run page says so explicitly instead of guessing where the slides are.

The browser **tab title** updates with the remaining time so you can monitor progress while working in other tabs.

When all steps finish, **Export Results** downloads a CSV that includes:
- Protocol columns (Solution, Duration, Slot)
- `Started At` — wall-clock time the step began
- `Actual Duration (min)` — real elapsed time

## Export Formats

### Protocol CSV (`stain-protocol.csv`)
```
Step,Solution,Duration (min),Slot
1,DD Water,3,1
2,70% EtOH,3,2
...
```

### Results CSV (`stain-results.csv`)
```
Step,Solution,Duration (min),Slot,Started At,Actual Duration (min)
1,DD Water,3,1,14:02:05,3.08
2,70% EtOH,3,2,14:05:12,3.01
...
```

## Default Protocol — Myelin Nissl

| # | Solution | Duration | Slot |
|---|---|---|---|
| 1 | DD Water | 3 min | 1 |
| 2 | 70% EtOH | 3 min | 2 |
| 3–4 | 95% EtOH | 3 min × 2 | 3 |
| 5–6 | 100% EtOH | 3 min × 2 | 4 |
| 7–8 | Citrisolve | 10 min × 2 | 5 |
| 9–10 | 100% EtOH | 3 min × 2 | 6 |
| 11–12 | 95% EtOH | 3 min × 2 | 7 |
| 13 | 70% EtOH | 3 min | 8 |
| 14 | DD Water | 3 min | 9 |
| 15 | Myelin Stain | 10 min | 10 |
| 16 | DD Water | 1 min | 9 |
| 17 | Diff | 1.5 min | 11 |
| 18 | DD Water | 1 min | 9 |
| 19 | Nissl | 20 min | 12 |
| 20 | DD Water | 1 min | 9 |
| 21 | 95% EtOH | 1 min | 7 |
| 22 | 100% EtOH | 1 min | 6 |
| 23 | Citrisolve | 6 min | 5 |
