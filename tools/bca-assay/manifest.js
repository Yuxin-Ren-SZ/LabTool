'use strict';

window.labtoolsToolManifest = {
  id: 'bca-assay', name: 'BCA Assay Calculator', icon: '🧪',
  description: 'Fit a linear standard curve from BSA standards, then interpolate protein concentration for unknown samples. Supports replicates, CSV import, and SVG chart export.',
  category: 'Assays & Protein',
  produces: ['conc-data'], consumes: ['plate-layout'],
  outputFields: [
    { id: 'concentration', label: 'BCA concentrations' },
  ],
  inputPorts: [
    { field: 'plate-layout' },
  ],
  next: [
    { tool: 'rt-calc', label: 'RT Calculator' },
    { tool: 'seeding-calc', label: 'Seeding Calculator' },
  ],
};
