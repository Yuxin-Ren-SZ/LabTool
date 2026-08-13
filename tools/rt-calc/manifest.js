'use strict';

window.labtoolsToolManifest = {
  id: 'rt-calc', name: 'RT Calculator', icon: '🧬',
  description: 'Reverse transcription setup from Nanodrop CSV. NEB LunaScript RT — auto-scales reaction volume (1×/1.5×/2×) when RNA exceeds available space. Batch reagent totals.',
  category: 'Molecular / qPCR',
  produces: ['sample-list'], consumes: ['conc-data', 'sample-list'],
  outputFields: [
    { id: 'sample-list', label: 'RT sample list' },
  ],
  inputPorts: [
    { field: 'concentration' },
    { field: 'sample-list' },
    { field: 'cell-density' },
  ],
  next: [{ tool: 'qpcr-analysis', label: 'qPCR Analysis' }],
};
