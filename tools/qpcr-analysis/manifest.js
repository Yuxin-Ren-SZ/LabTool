'use strict';

window.labtoolsToolManifest = {
  id: 'qpcr-analysis', name: 'qPCR Analysis', icon: '📈',
  description: 'Analyze Agilent AriaMx / Stratagene Mx exports — plate heatmap, sortable Cq results, amplification-curve overlays, replicate summaries, and ΔΔCq fold change.',
  category: 'Molecular / qPCR',
  produces: ['qpcr-results'], consumes: ['plate-layout', 'sample-list'],
  outputFields: [
    { id: 'qpcr-results', label: 'qPCR results' },
    { id: 'cq', label: 'Per-well Cq' },
    { id: 'ddcq', label: 'ΔΔCq relative expression' },
  ],
  inputPorts: [
    { field: 'plate-layout' },
    { field: 'sample-list' },
  ],
  next: [],
};
