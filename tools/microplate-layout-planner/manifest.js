'use strict';

window.labtoolsToolManifest = {
  id: 'microplate-layout-planner', name: 'Microplate Layout Planner', icon: '🧫',
  description: 'Lay out one or more 6- to 1536-well plates, tag wells with a colored group plus custom fields (Sample ID, Gene, …), and import or export CSV or print-ready layouts.',
  category: 'Molecular / qPCR',
  produces: ['plate-layout'], consumes: ['plate-layout'],
  outputFields: [
    { id: 'plate-layout', label: 'Plate layout' },
  ],
  inputPorts: [
    { field: 'plate-layout' },
  ],
  next: [{ tool: 'qpcr-analysis', label: 'qPCR Analysis' }],
};
