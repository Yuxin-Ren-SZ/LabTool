# Drug Dosage Calculator

Save named multi-drug dosing protocols in the browser and calculate per-animal doses from body weight.

## Workflow

1. Enter the animal body weight in `g` or `kg`.
2. Build or load a named protocol in the editor.
3. For each drug, enter any combination of `Min`, `Exact`, and `Max` dose values.
4. Choose the dose unit as `amount / body weight`, for example `mg / kg` or `mL / kg`.
5. Review the live calculated output amounts for the current animal.
6. Save the protocol in this browser for later reuse.

## Protocol Editor

- Each drug row supports:
  - drug name
  - optional notes
  - minimum dose
  - exact dose
  - maximum dose
  - numerator unit such as `mg`, `mL`, `U`, or a custom label
  - denominator body-weight unit: `g` or `kg`
- Rows can be added, reordered, and deleted.
- At least one of `Min`, `Exact`, or `Max` is required for each non-blank drug row.
- When multiple limits are provided, the editor enforces `min <= exact <= max`.

## Saving And Reuse

- Built-in protocols ship from [protocol-config.js](./protocol-config.js)
- Browser-saved protocols are stored only in this browser with `localStorage`
- They persist locally until cleared and do not sync to other browsers or machines
- Saving in the browser does not rewrite `protocol-config.js`
- `Clear Saved Protocols` removes browser-saved entries without affecting checked-in config
- `Copy Current Protocol` copies one protocol snippet for manual pasting into `protocol-config.js`
- `Export All Protocols` downloads a replacement config file containing checked-in and browser-saved protocols

## Notes

- This tool calculates final amounts from dose-per-body-weight values only.
- It does not calculate administration volume from stock concentration.
- Verify every dose against your approved protocol before use.
