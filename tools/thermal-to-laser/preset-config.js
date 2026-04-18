'use strict';

window.THERMAL_TO_LASER_PRESET_CONFIG_PATH = 'tools/thermal-to-laser/preset-config.js';

window.THERMAL_TO_LASER_PRESET_CONFIG = {
  version: 1,
  presets: [
    {
      id: 'labtools-9125-0170',
      name: 'Catalog 9125-0170',
      vendor: 'LabTools sample',
      sku: '9125-0170',
      pageWidth: 8.5,
      pageHeight: 11,
      topMargin: 0.24,
      leftMargin: 0.77,
      verticalPitch: 0.63,
      horizontalPitch: 1.4,
      labelHeight: 0.5,
      labelWidth: 1.28,
      columns: 5,
      rows: 17,
      notes: 'Verified from the existing pdf_label_test.html prototype.',
    },
    {
      id: 'labtools-9125-0238',
      name: 'Catalog 9125-0238',
      vendor: 'LabTools sample',
      sku: '9125-0238',
      pageWidth: 8.5,
      pageHeight: 11,
      topMargin: 0.24,
      leftMargin: 0.56,
      verticalPitch: 0.63,
      horizontalPitch: 1.07,
      labelHeight: 0.5,
      labelWidth: 0.94,
      columns: 7,
      rows: 17,
      notes: 'Verified from the existing pdf_label_test.html prototype.',
    },
  ],
};
