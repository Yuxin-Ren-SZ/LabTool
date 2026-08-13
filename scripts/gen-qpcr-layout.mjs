#!/usr/bin/env node
// Generate an importable CSV for tools/microplate-layout-planner/ encoding the
// "HPRT1-anchor" 8-plate qPCR layout (13 samples x duplicate, sample maximization).
// See plan: qPCR Plate Layout — Neuronal/Glial Panel.
//
// Layout per 96-well plate (rows A-H x cols 1-12):
//   3 vertical gene bands, 4 cols each (gene0->1-4, gene1->5-8, gene2->9-12).
//   sample s (0..12): row = floor(s/2) (A..G), pair = s%2.
//     pair0 -> band cols {base+1, base+2}; pair1 -> band cols {base+3, base+4}
//   row H = that gene's NTC (duplicate, first pair position).
//
// Usage: node scripts/gen-qpcr-layout.mjs > qpcr-layout-neuronal-8plate.csv

import { writeFileSync } from 'node:fs';

const PLATE_TYPE = '96';
const ROWS = 8;   // A..H
const COLS = 12;

// 13 biological samples: control + 4 treatments x 3 timepoints (rename on import).
const SAMPLES = [
  'Ctrl',
  'T1_TP1', 'T1_TP2', 'T1_TP3',
  'T2_TP1', 'T2_TP2', 'T2_TP3',
  'T3_TP1', 'T3_TP2', 'T3_TP3',
  'T4_TP1', 'T4_TP2', 'T4_TP3',
];

// Per-plate gene bands: [band0, band1, band2]. null = empty band (spare slot).
// role: 'reference' | 'target'. HPRT1 is the anchor -> present on every plate.
const REF = (name) => ({ name, role: 'reference' });
const TGT = (name) => ({ name, role: 'target' });
const PLATES = [
  { name: 'Plate 1', bands: [REF('HPRT1'), TGT('MAP2'),    TGT('GFAP')] },
  { name: 'Plate 2', bands: [REF('HPRT1'), TGT('SLC17A7'), TGT('SLC32A1')] },
  { name: 'Plate 3', bands: [REF('HPRT1'), TGT('PAX6'),    TGT('SOX2')] },
  { name: 'Plate 4', bands: [REF('HPRT1'), TGT('OLIG2'),   TGT('STX1A')] },
  { name: 'Plate 5', bands: [REF('HPRT1'), TGT('KCNMA1'),  TGT('KCNN2')] },   // BK, SK
  { name: 'Plate 6', bands: [REF('HPRT1'), TGT('HCN1'),    TGT('PVALB')] },   // HCN
  { name: 'Plate 7', bands: [REF('HPRT1'), TGT('SST'),     null] },           // spare band
  { name: 'Ref',     bands: [REF('HPRT1'), REF('ACTB'),    REF('GAPDH')] },
];

// Stable color per gene (references cool blues/teal, targets a varied palette).
const GENE_COLOR = {
  HPRT1: '#1f5fbf', ACTB: '#2f8f8f', GAPDH: '#4a4ab0',        // references
  MAP2: '#c0392b', GFAP: '#e67e22', SLC17A7: '#16a085', SLC32A1: '#27ae60',
  PAX6: '#8e44ad', SOX2: '#9b59b6', OLIG2: '#d35400', STX1A: '#c0399b',
  KCNMA1: '#2c7fb8', KCNN2: '#41b6c4', HCN1: '#7fcdbb', PVALB: '#b8860b',
  SST: '#a0522d', NTC: '#9aa0a6',
};

const rowLabel = (r) => String.fromCharCode(65 + r); // 0->A
const wellId = (r, c) => `${rowLabel(r)}${c + 1}`;

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Build assignments for one plate -> Map(wellId -> {gene, sample, content, color}).
function buildPlate(bands) {
  const a = new Map();
  bands.forEach((gene, b) => {
    if (!gene) return;                 // empty/spare band
    const base = b * 4;                // 0-indexed col base: bands at cols 0-3,4-7,8-11
    const color = GENE_COLOR[gene.name] || '#666666';
    // 13 samples in duplicate
    SAMPLES.forEach((sample, s) => {
      const r = Math.floor(s / 2);     // A..G
      const pair = s % 2;              // 0 -> cols base+0,base+1 ; 1 -> base+2,base+3
      const c0 = base + pair * 2;
      [c0, c0 + 1].forEach((c) => {
        a.set(wellId(r, c), { gene: gene.name, sample, content: gene.role, color });
      });
    });
    // NTC duplicate in row H (index 7), first pair position of the band.
    [base, base + 1].forEach((c) => {
      a.set(wellId(7, c), { gene: 'NTC', sample: '', content: 'NTC', color: GENE_COLOR.NTC });
    });
  });
  return a;
}

const header = ['plate_type', 'plate', 'row', 'column', 'well', 'gene', 'sample', 'content', 'gene_color'];
const lines = [header.join(',')];

for (const plate of PLATES) {
  const a = buildPlate(plate.bands);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = wellId(r, c);
      const rec = a.get(id) || {};
      lines.push([
        PLATE_TYPE, plate.name, rowLabel(r), String(c + 1), id,
        rec.gene || '', rec.sample || '', rec.content || '', rec.color || '',
      ].map(csvCell).join(','));
    }
  }
}

const out = lines.join('\n') + '\n';
const target = new URL('../qpcr-layout-neuronal-8plate.csv', import.meta.url);
writeFileSync(target, out);

// Quick self-check summary to stderr.
const dataRows = lines.length - 1;
console.error(`Wrote ${target.pathname}`);
console.error(`plates=${PLATES.length} rows=${dataRows} (expect ${PLATES.length * ROWS * COLS})`);
