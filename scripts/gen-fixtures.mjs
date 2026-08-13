#!/usr/bin/env node
/**
 * LabTools — deterministic test-fixture generator.
 *
 * Generates every example-data file in tests/fixtures/ used by the
 * automated test pipeline (node --test unit tests + browser harness).
 *
 * Determinism rules:
 *   • seeded PRNG (mulberry32) — regenerate → byte-identical files
 *   • fixed timestamps (no Date.now())
 *
 * Usage:
 *   node scripts/gen-fixtures.mjs            # write fixtures (default)
 *   node scripts/gen-fixtures.mjs --check    # verify fixtures match (CI)
 *   node scripts/gen-fixtures.mjs --update-snapshots  # (reserved; snapshots are
 *                                                    #  captured from the browser harness)
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = join(ROOT, 'tests', 'fixtures');

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fixed "now" so fixtures are stable across regenerations.
const NOW = Date.UTC(2026, 6, 31, 12, 0, 0); // 2026-07-31T12:00:00Z
const T0 = NOW - 3600e3;                     // 1 hour earlier

// ── Small helpers ───────────────────────────────────────────────────────────
function escCsv(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function fmt(n, d = 2) { return Number(n.toFixed(d)); }
function rowLabel(r) { return String.fromCharCode(65 + r); }
function wellId(r, c) { return `${rowLabel(r)}${c + 1}`; }

// ─────────────────────────────────────────────────────────────────────────────
// 1. plate-layout-96.json — single 96-well plate from microplate-layout-planner
// ─────────────────────────────────────────────────────────────────────────────
function genPlateLayout96() {
  const rng = mulberry32(0xC0FFEE);
  const GROUP_COLORS = ['#5c8dff', '#e07832', '#57a85a'];
  const groups = [
    { id: 'c1', name: 'Control', color: GROUP_COLORS[0] },
    { id: 'c2', name: 'Treatment A', color: GROUP_COLORS[1] },
    { id: 'c3', name: 'Treatment B', color: GROUP_COLORS[2] },
  ];
  const genes = ['HPRT1', 'MAP2', 'GFAP'];

  const assignments = {};
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 12; c++) {
      // ~60% of wells assigned; controls in rows A-C, treatments in D-H
      if (rng() > 0.6) continue;
      const isCtrl = r <= 2;
      const g = isCtrl ? groups[0] : (r % 2 === 0 ? groups[1] : groups[2]);
      const bioRep = (c % 3) + 1;
      assignments[wellId(r, c)] = {
        group: g.id,
        sample: `${g.name.replace(/ /g, '')}_${bioRep}`,
        gene: genes[c % 3],
      };
    }
  }

  return {
    plates: [
      {
        name: 'Plate 1',
        plateType: '96',
        cutCorners: ['top-left'],
        assignments,
      },
    ],
    fields: [
      { id: 'group', key: 'group', name: 'Group', kind: 'category' },
      { id: 'sample', key: 'sample', name: 'Sample ID', kind: 'text' },
      { id: 'gene', key: 'gene', name: 'Gene', kind: 'text' },
    ],
    categoriesByField: { group: groups },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. plate-layout-8plate.json — 8 plates × 3 gene bands (HPRT1 anchor + NTC)
//    Mirrors scripts/gen-qpcr-layout.mjs band layout.
// ─────────────────────────────────────────────────────────────────────────────
function genPlateLayout8Plate() {
  const REF = (name) => ({ name, role: 'reference' });
  const TGT = (name) => ({ name, role: 'target' });
  const PLATES = [
    { name: 'Plate 1', bands: [REF('HPRT1'), TGT('MAP2'), TGT('GFAP')] },
    { name: 'Plate 2', bands: [REF('HPRT1'), TGT('SLC17A7'), TGT('SLC32A1')] },
    { name: 'Plate 3', bands: [REF('HPRT1'), TGT('PAX6'), TGT('SOX2')] },
    { name: 'Plate 4', bands: [REF('HPRT1'), TGT('OLIG2'), TGT('STX1A')] },
    { name: 'Plate 5', bands: [REF('HPRT1'), TGT('KCNMA1'), TGT('KCNN2')] },
    { name: 'Plate 6', bands: [REF('HPRT1'), TGT('HCN1'), TGT('PVALB')] },
    { name: 'Plate 7', bands: [REF('HPRT1'), TGT('SST'), null] },
    { name: 'Ref', bands: [REF('HPRT1'), REF('ACTB'), REF('GAPDH')] },
  ];
  const GENE_COLOR = {
    HPRT1: '#1f5fbf', ACTB: '#2f8f8f', GAPDH: '#4a4ab0',
    MAP2: '#c0392b', GFAP: '#e67e22', SLC17A7: '#16a085', SLC32A1: '#27ae60',
    PAX6: '#8e44ad', SOX2: '#9b59b6', OLIG2: '#d35400', STX1A: '#c0399b',
    KCNMA1: '#2c7fb8', KCNN2: '#41b6c4', HCN1: '#7fcdbb', PVALB: '#b8860b',
    SST: '#a0522d', NTC: '#9aa0a6',
  };
  const SAMPLES = [
    'Ctrl', 'T1_TP1', 'T1_TP2', 'T1_TP3',
    'T2_TP1', 'T2_TP2', 'T2_TP3',
    'T3_TP1', 'T3_TP2', 'T3_TP3',
    'T4_TP1', 'T4_TP2', 'T4_TP3',
  ];

  const outPlates = [];
  PLATES.forEach((plate, bi) => {
    const assignments = {};
    plate.bands.forEach((gene, b) => {
      if (!gene) return;
      const base = b * 4;
      const color = GENE_COLOR[gene.name] || '#666666';
      SAMPLES.forEach((sample, s) => {
        const r = Math.floor(s / 2);       // A..G
        const pair = s % 2;
        const c0 = base + pair * 2;
        [c0, c0 + 1].forEach((c) => {
          assignments[wellId(r, c)] = { group: sample, sample, gene: gene.name, gene_color: color };
        });
      });
      // NTC duplicate in row H
      [base, base + 1].forEach((c) => {
        assignments[wellId(7, c)] = { group: 'NTC', sample: '', gene: 'NTC', gene_color: GENE_COLOR.NTC };
      });
    });
    outPlates.push({ name: plate.name, plateType: '96', cutCorners: ['top-left'], assignments });
  });

  return {
    plates: outPlates,
    fields: [
      { id: 'group', key: 'group', name: 'Group', kind: 'category' },
      { id: 'sample', key: 'sample', name: 'Sample ID', kind: 'text' },
      { id: 'gene', key: 'gene', name: 'Gene', kind: 'text' },
    ],
    categoriesByField: { group: SAMPLES.map((s, i) => ({ id: `c${i + 1}`, name: s, color: GENE_COLOR[s] || '#5c8dff' })) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. aria-mx-tabular.txt (+ CRLF variant) — Agilent AriaMx Tabular Results
// ─────────────────────────────────────────────────────────────────────────────
function genAriaMxTabular(crlf = false) {
  const rng = mulberry32(0xABCDEF);
  const header = [
    'Well', 'Well Type', 'Well Name', 'Dye', 'Target', 'Replicate',
    'Cq', 'Final Call', 'Threshold', 'Baseline Start', 'Baseline End',
    'Quantity', 'Efficiency', 'Cq Avg', 'Cq SD', 'Tm',
  ].join('\t');

  // 3 targets × (3 samples × 2 replicates) + NTC + NRT, on a 96-well plate
  const targets = ['HPRT1', 'MAP2', 'GFAP'];
  const samples = ['Ctrl_1', 'Ctrl_2', 'Ctrl_3', 'T1_1', 'T1_2', 'T1_3'];
  const baseCq = { HPRT1: 21, MAP2: 26, GFAP: 25 };

  const rows = [];
  let r = 0, c = 0;
  const nextWell = () => { const w = wellId(r, c); c++; if (c >= 12) { c = 0; r++; } return w; };

  targets.forEach((target, ti) => {
    samples.forEach((sample, si) => {
      const b = baseCq[target] + (si % 3) * 0.8;
      for (let rep = 0; rep < 2; rep++) {
        const cq = fmt(b + (rng() - 0.5) * 0.4, 2);
        rows.push([
          nextWell(), 'Unknown', sample, 'SYBR', target, String(rep + 1),
          cq, '+', '200.0', '2', '5', '', '2.00', '', '', fmt(82 + rng() * 2, 1),
        ]);
      }
    });
    // NTC per target
    rows.push([nextWell(), 'NTC', '', 'SYBR', target, '1', 'Undetermined', '-', '200.0', '2', '5', '', '2.00', '', '', '']);
  });
  // One NRT well
  rows.push([nextWell(), 'NRT', '', 'SYBR', 'HPRT1', '1', 'Undetermined', '-', '200.0', '2', '5', '', '2.00', '', '', '']);

  const eol = crlf ? '\r\n' : '\n';
  return [header, ...rows.map((row) => row.map(escCsv).join('\t'))].join(eol) + eol;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. aria-mx-platesetup.txt — Agilent Plate Setup export
// ─────────────────────────────────────────────────────────────────────────────
function genAriaMxPlateSetup() {
  const header = ['Well', 'Sample Name', 'Well Type'].join('\t');
  const rows = [];
  let r = 0, c = 0;
  const nextWell = () => { const w = wellId(r, c); c++; if (c >= 12) { c = 0; r++; } return w; };
  const samples = ['Ctrl_1', 'Ctrl_1', 'Ctrl_2', 'Ctrl_2', 'Ctrl_3', 'Ctrl_3',
    'T1_1', 'T1_1', 'T1_2', 'T1_2', 'T1_3', 'T1_3'];
  samples.forEach((s) => rows.push([nextWell(), s, 'Unknown']));
  rows.push([nextWell(), 'NTC', 'NTC']);
  return [header, ...rows.map((row) => row.join('\t'))].join('\n') + '\n';
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. nanodrop.csv — Nanodrop tab-separated export for rt-calc
// ─────────────────────────────────────────────────────────────────────────────
function genNanodropCsv() {
  const rng = mulberry32(0xBEEF);
  const header = ['Sample Name', 'Nucleic Acid(ng/uL)', 'A260/A280', 'A260/A230'].join('\t');
  const names = ['CSF_01', 'CSF_02', 'CSF_03', 'CSF_04', 'CSF_05', 'CSF_06'];
  const rows = names.map((name, i) => {
    const conc = fmt(50 + rng() * 1450, 1);
    const r280 = fmt(1.8 + rng() * 0.3, 2);
    const r230 = fmt(1.5 + rng() * 0.8, 2);
    return [name, conc, r280, r230].join('\t');
  });
  return [header, ...rows].join('\n') + '\n';
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. bca-raw.txt — SoftMax Pro BCA plate export (raw mode)
//    Format: "Temperature" header line, then 8 rows × (2 meta cols + 12 ODs)
// ─────────────────────────────────────────────────────────────────────────────
function genBcaRaw() {
  const rng = mulberry32(0x0DAD);
  // Pierce BCA: linear-ish OD response to 0–2000 µg/mL BSA
  const stdConcs = [2000, 1500, 1000, 750, 500, 250, 125, 25, 0];
  const odFor = (conc) => fmt(0.06 + (conc / 2000) * 1.6 + (rng() - 0.5) * 0.02, 3);

  const lines = [];
  lines.push('##BLOCKS= 1');
  lines.push('Plate:\tRead 1');
  lines.push('Instrument: SpectraMax i3x');
  lines.push('Wavelength\t562');
  lines.push('Temperature\t37.0');
  lines.push('~\t~');

  // Row A: standards (2 reps, 9 concs, 3 blank wells)
  const rowA = ['A', '1', ...stdConcs.map(odFor), ...stdConcs.map(odFor), odFor(0), odFor(0), odFor(0)];
  lines.push(rowA.join('\t'));

  // Rows B–H: unknowns in duplicate (6 samples per row)
  const unknowns = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12'];
  for (let r = 1; r < 8; r++) {
    const row = [rowLabel(r), '1'];
    for (let i = 0; i < 12; i++) {
      const base = 0.06 + (rng() * 0.4 + (i % 3) * 0.25);
      row.push(fmt(base + (rng() - 0.5) * 0.02, 3));
    }
    lines.push(row.join('\t'));
  }

  return lines.join('\n') + '\n';
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. bca-manual.json — bca-assay manual-mode state (stdRows + smpRows)
// ─────────────────────────────────────────────────────────────────────────────
function genBcaManual() {
  const rng = mulberry32(0x51DE);
  const stdConcs = [2000, 1500, 1000, 750, 500, 250, 125, 25, 0];
  const odFor = (conc) => fmt(0.06 + (conc / 2000) * 1.6 + (rng() - 0.5) * 0.02, 3);

  const stdRows = stdConcs.map((conc) => ({ conc, od1: odFor(conc), od2: odFor(conc), od3: NaN }));
  const smpRows = Array.from({ length: 6 }, (_, i) => ({
    name: `Unknown ${i + 1}`,
    od1: fmt(0.2 + rng() * 1.2, 3),
    od2: fmt(0.2 + rng() * 1.2, 3),
    od3: NaN,
    df: 1,
  }));
  return { stdRows, smpRows, currentPreset: 'pierce', numReps: 2, fitModel: 'linear', qcCvThr: 15 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. conc-data.json — bca-assay workbench payload (known concentrations)
// ─────────────────────────────────────────────────────────────────────────────
function genConcData() {
  const rng = mulberry32(0xC0FF00);
  // Linear fit: OD = 0.0008 × conc + 0.06  →  conc = (OD − 0.06) / 0.0008
  const samples = ['CSF_01', 'CSF_02', 'CSF_03', 'CSF_04', 'CSF_05', 'CSF_06'];
  const ods = [0.350, 0.520, 0.780, 1.040, 0.610, 0.890];
  return {
    results: samples.map((sample, i) => {
      const conc = fmt((ods[i] - 0.06) / 0.0008, 1);
      return { sample, conc, unit: 'µg/mL', flag: '', cv: fmt(rng() * 3 + 1, 1) };
    }),
    unit: 'µg/mL',
    model: 'linear',
    fitModel: 'linear',
    timestamp: T0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. sample-list-rt.json — rt-calc workbench payload
// ─────────────────────────────────────────────────────────────────────────────
function genSampleListRt() {
  const rng = mulberry32(0x1234);
  return {
    samples: Array.from({ length: 6 }, (_, i) => ({
      name: `CSF_0${i + 1}`,
      conc: fmt(50 + rng() * 1450, 1),
      unit: 'ng/µL',
      a260_280: fmt(1.8 + rng() * 0.3, 2),
      a260_230: fmt(1.5 + rng() * 0.8, 2),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. sample-list-cell.json — cell-count workbench payload
// ─────────────────────────────────────────────────────────────────────────────
function genSampleListCell() {
  return {
    samples: [{ name: 'Cell Suspension', conc: 4250000, unit: 'cells/mL' }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. seeding-plan.json — seeding-calc workbench payload
// ─────────────────────────────────────────────────────────────────────────────
function genSeedingPlan() {
  return {
    stockConc: 4250000,
    unit: 'cells/mL',
    c1: '4.25',
    c2: '0.5',
    v1: '0.24',
    v2: '2.04',
    step1TotalVolML: 1.5,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. protocol.json — stain-timer workbench payload
// ─────────────────────────────────────────────────────────────────────────────
function genProtocol() {
  return {
    steps: [
      { solution: 'Fixation (4% PFA)', durationMin: 10, durationSec: 0, slot: '1' },
      { solution: 'Permeabilization (0.1% Triton X-100)', durationMin: 15, durationSec: 0, slot: '1' },
      { solution: 'Blocking (5% BSA)', durationMin: 30, durationSec: 0, slot: '1' },
      { solution: 'Primary antibody', durationMin: 60, durationSec: 0, slot: '2' },
      { solution: 'Wash (PBS ×3)', durationMin: 0, durationSec: 30, slot: '3' },
      { solution: 'Secondary antibody', durationMin: 45, durationSec: 0, slot: '2' },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. workbench-bundle.json — full export envelope (importJSON round-trip)
// ─────────────────────────────────────────────────────────────────────────────
function genWorkbenchBundle() {
  return {
    version: 1,
    exportedAt: new Date(NOW).toISOString(),
    items: [
      {
        id: 'f1b1a1a1-0000-4000-8000-000000000001',
        type: 'plate-layout',
        label: '96-well Neuronal Panel',
        tool: 'microplate-layout-planner',
        timestamp: T0,
        data: genPlateLayout96(),
        metadata: { wellCount: 58, plateCount: 1, plateFormat: '96' },
      },
      {
        id: 'f1b1a1a1-0000-4000-8000-000000000002',
        type: 'conc-data',
        label: 'BCA Run 2026-07-31',
        tool: 'bca-assay',
        timestamp: T0 + 600e3,
        data: genConcData(),
        metadata: { sampleCount: 6, unit: 'µg/mL' },
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Writer
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURES = {
  'plate-layout-96.json': () => JSON.stringify(genPlateLayout96(), null, 2) + '\n',
  'plate-layout-8plate.json': () => JSON.stringify(genPlateLayout8Plate(), null, 2) + '\n',
  'aria-mx-tabular.txt': () => genAriaMxTabular(false),
  'aria-mx-tabular-crlf.txt': () => genAriaMxTabular(true),
  'aria-mx-platesetup.txt': () => genAriaMxPlateSetup(),
  'nanodrop.csv': () => genNanodropCsv(),
  'bca-raw.txt': () => genBcaRaw(),
  'bca-manual.json': () => JSON.stringify(genBcaManual(), null, 2) + '\n',
  'conc-data.json': () => JSON.stringify(genConcData(), null, 2) + '\n',
  'sample-list-rt.json': () => JSON.stringify(genSampleListRt(), null, 2) + '\n',
  'sample-list-cell.json': () => JSON.stringify(genSampleListCell(), null, 2) + '\n',
  'seeding-plan.json': () => JSON.stringify(genSeedingPlan(), null, 2) + '\n',
  'protocol.json': () => JSON.stringify(genProtocol(), null, 2) + '\n',
  'workbench-bundle.json': () => JSON.stringify(genWorkbenchBundle(), null, 2) + '\n',
};

const mode = process.argv.includes('--check') ? 'check' : 'write';

if (mode === 'write') mkdirSync(FIXTURES_DIR, { recursive: true });

let changed = 0;
let written = 0;
for (const [name, gen] of Object.entries(FIXTURES)) {
  const content = gen();
  const path = join(FIXTURES_DIR, name);
  if (mode === 'check') {
    if (!existsSync(path)) { console.error(`MISSING fixture: ${name}`); changed++; continue; }
    const current = readFileSync(path, 'utf8');
    if (current !== content) { console.error(`STALE fixture: ${name} (run gen-fixtures.mjs)`); changed++; }
  } else {
    writeFileSync(path, content);
    written++;
  }
}

if (mode === 'check') {
  if (changed > 0) { console.error(`\n${changed} fixture(s) out of date.`); process.exit(1); }
  console.log(`All ${Object.keys(FIXTURES).length} fixtures up to date.`);
} else {
  console.log(`Wrote ${written} fixtures to tests/fixtures/.`);
}
