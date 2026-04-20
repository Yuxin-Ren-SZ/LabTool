# Drug Dosage Calculator

Build dosing protocols on page 1, then calculate and log per-animal administrations on page 2.

## Workflow

1. Set up or load a protocol on page 1.
2. Enter protocol metadata such as protocol name, IACUC ID, and additional notes.
3. Add one row per drug with route, controlled-substance status, dose values, units, and notes.
4. Continue to page 2 and enter the operation details for one animal.
5. Review the calculated min, exact, and max amounts.
6. Enter one or more actual amounts given, then save the entries in this browser.
7. Copy the saved entries as plain text or export them as CSV if needed.

## Page 1: Protocol Setup

- Protocols can be loaded from the checked-in config file or from browser-local saved protocols.
- Protocol-level fields:
  - protocol name
  - IACUC protocol ID
  - additional notes
- Each drug row supports:
  - drug name
  - administration route
  - controlled substance checkbox
  - minimum dose
  - exact dose
  - maximum dose
  - numerator unit such as `mg`, `mL`, `U`, or a custom label
  - denominator body-weight unit: `g` or `kg`
  - optional notes
- New drug rows default to `g` as the denominator body-weight unit.

## Page 2: Calculation And Logging

- Operation fields:
  - animal ID
  - animal weight
  - animal weight unit (`g` by default)
  - operator name
  - operator ID
- Actual amount given is entered per drug row in the drug’s numerator unit.
- Saving creates one browser-local log line per drug with an entered actual amount.
- Saved entries can be:
  - copied as plain text
  - exported as CSV with one entry per line
  - cleared for the current protocol

## Saving And Reuse

- Built-in protocols ship from [protocol-config.js](./protocol-config.js).
- Browser-saved protocols and saved entries are stored only in this browser with `localStorage`.
- `Copy Protocol Snippet` copies the current protocol as a config snippet for manual reuse.
- `Export All Protocols` downloads a replacement config file containing built-in and browser-saved protocols.

## Notes

- This tool calculates final amounts from dose-per-body-weight values only.
- It does not calculate administration volume from stock concentration.
- Verify every dose and administration record against your approved protocol before use.
