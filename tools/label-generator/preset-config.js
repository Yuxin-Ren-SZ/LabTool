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
      id: 'labtools-9125-0170', name: 'CryoClear 1.28x0.5"', mode: 'laser-sheet',
      vendor: 'USA Scientific Inc.', sku: '9125-0170',
      labelWidth: 1.28, labelHeight: 0.5, pageWidth: 8.5, pageHeight: 11,
      topMargin: 0.24, leftMargin: 0.77,
      horizontalPitch: 1.4, verticalPitch: 0.63,
      columns: 5, rows: 17,
      notes: ''
    },
    {
      id: 'labtools-9125-0238', name: 'CryoClear 0.94x0.5"', mode: 'laser-sheet',
      vendor: 'USA Scientific Inc.', sku: '9125-0238',
      labelWidth: 0.94, labelHeight: 0.5, pageWidth: 8.5, pageHeight: 11,
      topMargin: 0.24, leftMargin: 0.56,
      horizontalPitch: 1.07, verticalPitch: 0.63,
      columns: 7, rows: 17,
      notes: ''
    },
    {
      id: 'labtools-9187-1200', name: 'CryoBaby 1.50x0.75"', mode: 'laser-sheet',
      vendor: 'USA Scientific Inc.', sku: '9187-1200',
      labelWidth: 1.50, labelHeight: 0.75, pageWidth: 8.5, pageHeight: 11,
      topMargin: 0.31, leftMargin: 0.25,
      horizontalPitch: 1.63, verticalPitch: 0.88,
      columns: 5, rows: 12,
      notes: ''
    },
    {
      id: 'labtools-9187-1100', name: 'CryoBaby 1.69x0.75"', mode: 'laser-sheet',
      vendor: 'USA Scientific Inc.', sku: '9187-1100',
      labelWidth: 1.69, labelHeight: 0.75, pageWidth: 8.5, pageHeight: 11,
      topMargin: 0.63, leftMargin: 0.70,
      horizontalPitch: 1.80, verticalPitch: 0.75,
      columns: 4, rows: 13,
      notes: ''
    },
    {
      id: 'labtools-9187-1258', name: 'CryoBaby 2.625x1.00"', mode: 'laser-sheet',
      vendor: 'USA Scientific Inc.', sku: '9187-1258',
      labelWidth: 2.625, labelHeight: 1.00, pageWidth: 8.5, pageHeight: 11,
      topMargin: 0.50, leftMargin: 0.19,
      horizontalPitch: 2.75, verticalPitch: 1.00,
      columns: 3, rows: 10,
      notes: ''
    },
    {
      id: 'labtools-9187-7433', name: 'CryoBaby 1.50x0.25"', mode: 'laser-sheet',
      vendor: 'USA Scientific Inc.', sku: '9187-7433',
      labelWidth: 1.50, labelHeight: 0.25, pageWidth: 8.5, pageHeight: 11,
      topMargin: 0.62, leftMargin: 0.50,
      horizontalPitch: 2.00, verticalPitch: 0.25,
      columns: 4, rows: 39,
      notes: ''
    },
    {
      id: 'labtools-9185-1000', name: 'Catalog 9185-1000', mode: 'laser-sheet',
      vendor: 'USA Scientific Inc.', sku: '9185-1000',
      labelWidth: 0.38, labelHeight: 0.38, pageWidth: 8.5, pageHeight: 11,
      topMargin: 0.62, leftMargin: 0.69,
      horizontalPitch: 0.63, verticalPitch: 0.63,
      columns: 12, rows: 16,
      notes: ''
    },
    {
      id: 'labtools-9185-2000', name: 'Catalog 9185-2000', mode: 'laser-sheet',
      vendor: 'USA Scientific Inc.', sku: '9185-2000',
      labelWidth: 0.50, labelHeight: 0.50, pageWidth: 8.5, pageHeight: 11,
      topMargin: 0.52, leftMargin: 0.52,
      horizontalPitch: 0.63, verticalPitch: 0.63,
      columns: 12, rows: 16,
      notes: ''
    },
    {
      id: 'labtools-9185-3000', name: 'Catalog 9185-3000', mode: 'laser-sheet',
      vendor: 'USA Scientific Inc.', sku: '9185-3000',
      labelWidth: 0.75, labelHeight: 0.75, pageWidth: 8.5, pageHeight: 11,
      topMargin: 0.31, leftMargin: 0.35,
      horizontalPitch: 0.88, verticalPitch: 0.88,
      columns: 9, rows: 12,
      notes: ''
    },
    {
      id: 'labtools-9185-4000', name: 'Catalog 9185-4000', mode: 'laser-sheet',
      vendor: 'USA Scientific Inc.', sku: '9185-4000',
      labelWidth: 1.00, labelHeight: 1.00, pageWidth: 8.5, pageHeight: 11,
      topMargin: 0.50, leftMargin: 0.35,
      horizontalPitch: 1.13, verticalPitch: 1.13,
      columns: 7, rows: 9,
      notes: ''
    },
    {
      id: 'labtools-9185-5000', name: 'Catalog 9185-5000', mode: 'laser-sheet',
      vendor: 'USA Scientific Inc.', sku: '9185-5000',
      labelWidth: 0.44, labelHeight: 0.44, pageWidth: 8.5, pageHeight: 11,
      topMargin: 0.44, leftMargin: 0.59,
      horizontalPitch: 0.57, verticalPitch: 0.57,
      columns: 13, rows: 18,
      notes: ''
    },
  ]
};
