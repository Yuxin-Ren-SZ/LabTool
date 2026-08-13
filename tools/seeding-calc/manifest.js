'use strict';

window.labtoolsToolManifest = {
  id: 'seeding-calc', name: 'Cell Seeding Calculator', icon: '⚗️',
  description: 'Count your cells, then calculate the dilution needed to reach a target seeding density. Guided two-step workflow with C₁V₁ = C₂V₂ solver.',
  category: 'Cell Culture',
  produces: ['seeding-plan'], consumes: ['conc-data', 'sample-list'],
  outputFields: [
    { id: 'seeding-plan', label: 'Seeding plan (stock + dilution)' },
  ],
  inputPorts: [
    { field: 'cell-density' },
    { field: 'concentration' },
    { field: 'sample-list' },
  ],
  next: [],
};
