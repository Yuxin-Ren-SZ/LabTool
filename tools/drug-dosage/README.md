# Drug Dosage Calculator

Build dosing protocols, calculate per-animal dose amounts from body weight, and keep a browser-local administration log. Part of the [LabTools](../../) collection.

## Workflow

1. Create a new protocol or load one from the built-in config or current browser.
2. Enter protocol metadata: name, IACUC protocol ID, and notes.
3. Add one row per drug with route, controlled-substance flag, dose values, units, and notes.
4. Continue to the operation page.
5. Enter animal and operator details.
6. Review min, exact, and max calculated amounts.
7. Enter actual amounts given.
8. Save, copy, export, or clear browser-local log entries.

## Protocol Setup

Protocol rows support:

- Drug name
- Administration route
- Controlled-substance checkbox
- Minimum, exact, and maximum dose values
- Numerator amount unit: built-in options or a custom label
- Denominator body-weight unit: `g` or `kg`
- Notes

A usable protocol requires a protocol name and at least one nonblank drug row with a drug name, amount unit, denominator unit, and at least one positive dose value. Built-in protocols ship from [protocol-config.js](./protocol-config.js). The checked-in config currently starts empty unless a project maintainer adds protocols.

## Calculation

For each populated dose value:

```text
final amount = dose value x animal weight converted to the drug row's denominator unit
```

Examples:

- `5 mg/kg` for a `25 g` animal = `0.125 mg`
- `10 uL/g` for a `30 g` animal = `300 uL`

The tool does not calculate administration volume from stock concentration. It only calculates final amount from dose-per-body-weight values.

## Logging And Persistence

Browser-saved protocols and operation entries use `localStorage` in the current browser only. They do not sync and do not rewrite `protocol-config.js`.

Saved entries are scoped to a saved protocol. Calculations can run for an unsaved draft, but logging, copying saved entries, and exporting saved entries require saving the protocol first so the log has a stable scope.

## Export And Reuse

- `Save In This Browser` stores or updates the current protocol locally.
- `Clear Saved Protocols` removes browser-saved protocols, not checked-in config entries.
- `Copy Current Protocol` copies a JavaScript config snippet for manual review.
- `Export All Protocols` downloads a replacement config file containing built-in and browser-saved protocols.
- `Copy as Plain Text` copies saved administration entries for the current protocol.
- `Export CSV` downloads saved entries as `drug-dosage-log-<protocol>.csv`.

Verify every dose and administration record against the approved protocol before use.
