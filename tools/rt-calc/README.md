# Reverse Transcription Calculator

Calculate RNA and reagent volumes for NEB LunaScript RT reactions from Nanodrop concentration data.

## Modes

- **Super Mix**: LunaScript RT SuperMix (4 µL per 20 µL rxn)
- **Master Mix**: LunaScript RT Master Mix (4 µL) + Random Primer (2 µL) per 20 µL rxn

## Features

- Import Nanodrop CSV exports (auto-detects UTF-16 / UTF-8)
- Multi-sample batch calculation
- Per-sample reaction volume scaling (1× / 1.5× / 2×)
- Auto-scale: tries next volume level when RNA exceeds available space
- Editable reagent defaults
- Batch reagent totals for multi-reaction planning
