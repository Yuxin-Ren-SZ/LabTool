'use strict';

/**
 * LabTools — hub registry & workflow chains (manifest-driven hub)
 * ================================================================
 * Single source of truth for the tool cards on the hub page and the
 * workflow chain graph. index.html renders entirely from this registry via
 * assets/js/labtools-hub.js; adding a tool = one entry here + its folder.
 *
 * Exposes:
 *   window.LABTOOLS_HUB_TOOLS  — [{ id, name, icon, desc, category, href, badge }]
 *   window.LABTOOLS_HUB_CHAINS — [{ from, to, label }] (defines the chain graph)
 */

window.LABTOOLS_HUB_TOOLS = [
  {
    id: 'cell-count', name: 'Cell Count Calculator', icon: '🧮', badge: 'Live',
    category: 'Cell Culture', href: 'tools/cell-count/index.html',
    desc: 'Hemocytometer counting with Trypan Blue viability analysis. Supports single or duplicate chamber counts across 4 counting modes.',
  },
  {
    id: 'seeding-calc', name: 'Cell Seeding Calculator', icon: '⚗️', badge: 'Live',
    category: 'Cell Culture', href: 'tools/seeding-calc/index.html',
    desc: 'Count your cells, then calculate the dilution needed to reach a target seeding density. Guided two-step workflow with C₁V₁ = C₂V₂ solver.',
  },
  {
    id: 'stain-timer', name: 'Stain Timer', icon: '⏱', badge: 'Live',
    category: 'Cell Culture', href: 'tools/stain-timer/index.html',
    desc: 'Configurable step-by-step staining protocol timer with alarm. Design your protocol, then run it with countdown and audio cues.',
  },
  {
    id: 'rt-calc', name: 'RT Calculator', icon: '🧬', badge: 'Live',
    category: 'Molecular / qPCR', href: 'tools/rt-calc/index.html',
    desc: 'Reverse transcription setup from Nanodrop CSV. NEB LunaScript RT — auto-scales reaction volume (1×/1.5×/2×) when RNA exceeds available space. Batch reagent totals.',
  },
  {
    id: 'qpcr-plate-planner', name: 'qPCR Plate Planner', icon: '🧬', badge: 'Live',
    category: 'Molecular / qPCR', href: 'tools/qpcr-plate-planner/index.html',
    desc: 'Generate a multi-plate qPCR layout from sample combinations (any factors — sample × timepoint × gene), skip exceptions, duplicate wells, reference anchor and NTC controls. Hands off → Layout Planner → qPCR Analysis.',
  },
  {
    id: 'qpcr-analysis', name: 'qPCR Analysis', icon: '📈', badge: 'Live',
    category: 'Molecular / qPCR', href: 'tools/qpcr-analysis/index.html',
    desc: 'Analyze Agilent AriaMx / Stratagene Mx exports — plate heatmap, sortable Cq results, amplification-curve overlays, replicate summaries, and ΔΔCq fold change.',
  },
  {
    id: 'microplate-layout-planner', name: 'Microplate Layout Planner', icon: '🧫', badge: 'Live',
    category: 'Molecular / qPCR', href: 'tools/microplate-layout-planner/index.html',
    desc: 'Lay out one or more 6- to 1536-well plates, tag wells with a colored group plus custom fields (Sample ID, Gene, …), and import or export CSV or print-ready layouts.',
  },
  {
    id: 'bca-assay', name: 'BCA Assay Calculator', icon: '🧪', badge: 'Live',
    category: 'Assays & Protein', href: 'tools/bca-assay/index.html',
    desc: 'Fit a linear standard curve from BSA standards, then interpolate protein concentration for unknown samples. Supports replicates, CSV import, and SVG chart export.',
  },
  {
    id: 'drug-dosage', name: 'Drug Dosage Calculator', icon: '💊', badge: 'Live',
    category: 'Lab Ops', href: 'tools/drug-dosage/index.html',
    desc: 'Save named multi-drug protocols and calculate minimum, exact, and maximum per-animal dose amounts from body weight, with browser-local protocol reuse and a max-dose safety cap.',
  },
  {
    id: 'thermal-to-laser', name: 'Thermal To Laser Label Converter', icon: '🏷️', badge: 'Live',
    category: 'Lab Ops', href: 'tools/thermal-to-laser/index.html',
    desc: 'Convert a one-label-per-page thermal printer PDF into a mailing-label-sheet PDF for laser printing, with preset detection, sheet preview, and cell-by-cell placement control.',
  },
  {
    id: 'label-generator', name: 'Label Generator', icon: '🏷️', badge: 'Live',
    category: 'Lab Ops', href: 'tools/label-generator/index.html',
    desc: 'Generate PDF labels with DataMatrix barcodes from CSV data. Supports thermal-printer labels and laser-sheet grids.',
  },
];

window.LABTOOLS_HUB_CHAINS = [
  { from: 'cell-count', to: 'seeding-calc', label: 'Seeding Calculator' },
  { from: 'rt-calc', to: 'qpcr-analysis', label: 'qPCR Analysis' },
  { from: 'qpcr-plate-planner', to: 'microplate-layout-planner', label: 'Layout Planner' },
  { from: 'qpcr-plate-planner', to: 'qpcr-analysis', label: 'qPCR Analysis' },
  { from: 'microplate-layout-planner', to: 'qpcr-analysis', label: 'qPCR Analysis' },
  { from: 'bca-assay', to: 'rt-calc', label: 'RT Calculator' },
  { from: 'bca-assay', to: 'seeding-calc', label: 'Seeding Calculator' },
];
