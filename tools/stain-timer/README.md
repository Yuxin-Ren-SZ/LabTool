# Stain Timer

A configurable staining protocol timer with setup, countdown, slot tracking, CSV import/export, result logging, and optional audio alarms. Part of the [LabTools](../../) collection.

## Page 1: Protocol Setup

Build or import a protocol as a table of steps.

| Field | Required | Description |
|---|---|---|
| Solution | Yes | Staining solution name, such as `95% EtOH`. |
| Duration Min | Yes | Whole minutes as a non-negative integer. |
| Duration Sec | Yes | Seconds from 0 up to but not including 60; decimals are allowed. |
| Slot | No | Physical rack slot. When provided, it must be a positive integer. |

Actions:

- Move steps up or down.
- Delete steps; the last remaining step is preserved.
- Add a blank step.
- Toggle the alarm buzzer.
- Export protocol CSV.
- Import a previously exported protocol CSV.

Validation blocks running when required fields are missing or invalid. Slot conflicts are also rejected when different solution names share the same slot.

## Page 2: Run Timer

`Run Protocol` opens the timer view.

| Button | Action |
|---|---|
| Start | Begin the current step countdown. |
| Pause | Freeze the countdown and preserve remaining time. |
| Resume | Continue a paused step. |
| Skip | Mark the current step as skipped and move to the next step. |
| Reset | Return to step 1 without changing the protocol. |
| Back to Protocol | Return to setup with the protocol preserved. |

The active step, progress bar, and browser tab title update while the timer runs. If any step has a slot number, the run view shows a slot rack from 1 through the highest used slot and highlights the current step's slot.

## Exports

Protocol CSV (`stain-protocol.csv`):

```csv
Step,Solution,Duration Min,Duration Sec,Slot
1,DD Water,3,0,1
2,70% EtOH,3,0,2
```

Results CSV (`stain-results.csv`) includes the protocol fields plus:

- `Started At`
- `Actual Duration (min)`

Actual duration is based on elapsed wall-clock time for each started step.
