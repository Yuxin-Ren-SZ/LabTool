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
    {
      id: 'laser-avery-5160', name: 'Avery 5160 (30-up)', mode: 'laser-sheet',
      vendor: 'Avery', sku: '5160',
      labelWidth: 1.0, labelHeight: 2.625, pageWidth: 8.5, pageHeight: 11.0,
      topMargin: 0.5, leftMargin: 0.19,
      horizontalPitch: 2.75, verticalPitch: 1.0,
      columns: 3, rows: 10,
      notes: '30 address labels per sheet.'
    },
    {
      id: 'laser-avery-5167', name: 'Avery 5167 (80-up)', mode: 'laser-sheet',
      vendor: 'Avery', sku: '5167',
      labelWidth: 0.5, labelHeight: 1.75, pageWidth: 8.5, pageHeight: 11.0,
      topMargin: 0.5, leftMargin: 0.69,
      horizontalPitch: 1.75, verticalPitch: 0.5,
      columns: 4, rows: 20,
      notes: '80 return address labels per sheet.'
    },
    {
      id: 'laser-avery-5163', name: 'Avery 5163 (10-up)', mode: 'laser-sheet',
      vendor: 'Avery', sku: '5163',
      labelWidth: 2.0, labelHeight: 4.0, pageWidth: 8.5, pageHeight: 11.0,
      topMargin: 0.5, leftMargin: 0.25,
      horizontalPitch: 4.0, verticalPitch: 2.0,
      columns: 2, rows: 5,
      notes: '10 large shipping labels per sheet.'
    },
    {
      id: 'laser-avery-5164', name: 'Avery 5164 (6-up)', mode: 'laser-sheet',
      vendor: 'Avery', sku: '5164',
      labelWidth: 3.33, labelHeight: 4.0, pageWidth: 8.5, pageHeight: 11.0,
      topMargin: 0.5, leftMargin: 0.69,
      horizontalPitch: 3.5, verticalPitch: 4.0,
      columns: 2, rows: 3,
      notes: '6 large shipping labels per sheet.'
    },
  ]
};
