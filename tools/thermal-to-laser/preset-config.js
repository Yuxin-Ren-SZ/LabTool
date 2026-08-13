'use strict';

// Thin shim: the canonical laser presets now live in
// assets/js/labtools-laser-presets.js (shared with tools/label-generator).
// The CONFIG_PATH export is kept so config-export snippets keep their
// documented location; PRESET_CONFIG delegates to the shared module.
window.THERMAL_TO_LASER_PRESET_CONFIG_PATH = 'tools/thermal-to-laser/preset-config.js';

window.THERMAL_TO_LASER_PRESET_CONFIG = (window.LABTOOLS_LASER_PRESETS && window.LABTOOLS_LASER_PRESETS.version)
  ? window.LABTOOLS_LASER_PRESETS
  : { version: 1, presets: [] };
