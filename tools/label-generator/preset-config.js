'use strict';
window.LABEL_GENERATOR_PRESET_CONFIG = {
  version: 1,
  presets: [
    {
      id: 'thermal-cryo-128x05', name: 'Cryo Label 1.28 × 0.5 in', mode: 'thermal',
      vendor: 'Generic', sku: '',
      labelWidth: 1.28, labelHeight: 0.5, pageWidth: 1.28, pageHeight: 0.5,
      topMargin: 0, leftMargin: 0,
      horizontalPitch: 1.28, verticalPitch: 0.5,
      columns: 1, rows: 1,
      notes: 'Common cryogenic vial label size.'
    },
    {
      id: 'thermal-cryo-1x05', name: 'Cryo Label 1.0 × 0.5 in', mode: 'thermal',
      vendor: 'Generic', sku: '',
      labelWidth: 1.0, labelHeight: 0.5, pageWidth: 1.0, pageHeight: 0.5,
      topMargin: 0, leftMargin: 0,
      horizontalPitch: 1.0, verticalPitch: 0.5,
      columns: 1, rows: 1,
      notes: 'Larger cryogenic vial label.'
    },
    {
      id: 'thermal-tube-1x075', name: 'Tube Label 1.0 × 0.75 in', mode: 'thermal',
      vendor: 'Generic', sku: '',
      labelWidth: 1.0, labelHeight: 0.75, pageWidth: 1.0, pageHeight: 0.75,
      topMargin: 0, leftMargin: 0,
      horizontalPitch: 1.0, verticalPitch: 0.75,
      columns: 1, rows: 1,
      notes: 'Microcentrifuge tube label size.'
    },
    {
      id: 'thermal-cryo-0375x0375', name: 'Cryo Cap Label 0.375 × 0.375 in', mode: 'thermal',
      vendor: 'Generic', sku: '',
      labelWidth: 0.375, labelHeight: 0.375, pageWidth: 0.375, pageHeight: 0.375,
      topMargin: 0, leftMargin: 0,
      horizontalPitch: 0.375, verticalPitch: 0.375,
      columns: 1, rows: 1,
      notes: 'Small cryo vial cap label.'
    },
  ]
};
