'use strict';

// Tool manifest for the shared-layer runtime (labtools.runtime.boot). Mirrors
// the labtoolsDefineTool declaration in index.html (same id / produces /
// consumes / outputFields / inputPorts) plus hub-facing metadata used by the
// stage-4 manifest-driven hub. See docs/architecture-v2-plan.md batch C1.
window.labtoolsToolManifest = {
  id: 'qpcr-plate-planner',
  name: 'qPCR Plate Planner',
  icon: '🧬',
  description: 'Generate a multi-plate qPCR layout from sample combinations (any factors — sample × timepoint × gene), skip exceptions, duplicate wells, reference anchor and NTC controls. Hands off → Layout Planner → qPCR Analysis.',
  category: 'Molecular / qPCR',
  produces: ['plate-layout'],
  consumes: ['sample-list'],
  outputFields: [
    { id: 'plate-layout', label: 'qPCR plate layout' },
  ],
  inputPorts: [
    { field: 'sample-list' },
  ],
  next: [
    { tool: 'microplate-layout-planner', label: 'Layout Planner' },
    { tool: 'qpcr-analysis', label: 'qPCR Analysis' },
  ],
};
