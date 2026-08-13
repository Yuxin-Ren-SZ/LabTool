'use strict';

window.labtoolsToolManifest = {
  id: 'cell-count', name: 'Cell Count Calculator', icon: '🧮',
  description: 'Hemocytometer counting with Trypan Blue viability analysis. Supports single or duplicate chamber counts across 4 counting modes.',
  category: 'Cell Culture',
  produces: ['sample-list'], consumes: [],
  outputFields: [
    { id: 'cell-density', label: 'Cell density (cells/mL)' },
    { id: 'total-cells',  label: 'Total live cells' },
    { id: 'viability',    label: 'Viability (%)' },
  ],
  inputPorts: [],
  next: [{ tool: 'seeding-calc', label: 'Seeding Calculator' }],
};
