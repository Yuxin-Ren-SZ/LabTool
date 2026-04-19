# Stain Timer

A configurable step-by-step staining protocol timer with a countdown display, progress bar, and audio alarm.

Part of the [LabTools](../../) collection.

## Workflow

### Page 1 — Protocol Setup

Build your protocol by editing the step list:

| Field | Required | Description |
|---|---|---|
| Solution | Yes | Name of the staining solution (e.g., `95% EtOH`) |
| Duration Min | Yes | Whole minutes as a non-negative integer |
| Duration Sec | Yes | Seconds from `0` up to but not including `60` (decimals allowed) |
| Slot | No | Physical position in your stainer rack; if provided, it must be a positive integer |

- **Reorder** steps with the ↑/↓ buttons
- **Delete** a step with the 🗑 button
- **Add Step** appends a blank row at the bottom
- **Alarm buzzer** — toggle on/off; plays 3 beeps when a step completes
- **Run validation** also rejects slot conflicts: two different solution names cannot share the same slot, and conflicting solution/slot fields are highlighted in warning color

**Export Protocol** downloads a plain-text CSV you can reload later.
**Import Protocol** reads a previously exported CSV to restore a saved protocol.

The default protocol pre-loaded is a short 3-step placeholder so the table is not empty on first open. Replace it with your own steps or use **Import Protocol** to reload a previously saved CSV.

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
- Protocol columns (Solution, Duration Min, Duration Sec, Slot)
- `Started At` — wall-clock time the step began
- `Actual Duration (min)` — real elapsed time

## Export Formats

### Protocol CSV (`stain-protocol.csv`)
```
Step,Solution,Duration Min,Duration Sec,Slot
1,DD Water,3,0,1
2,70% EtOH,3,0,2
...
```

### Results CSV (`stain-results.csv`)
```
Step,Solution,Duration Min,Duration Sec,Slot,Started At,Actual Duration (min)
1,DD Water,3,0,1,14:02:05,3.08
2,70% EtOH,3,0,2,14:05:12,3.01
...
```

