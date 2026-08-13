/**
 * Unit tests for the qPCR plate-planning pure functions in labtools-calc.js:
 *   qpcrBuildSamples, qpcrPackPlates, qpcrToPlateLayout.
 *
 * The headline test reconstructs the exact configuration of
 * scripts/gen-qpcr-layout.mjs and asserts qpcrPackPlates reproduces
 * qpcr-layout-neuronal-8plate.csv well-for-well — proving parity with the
 * hand-written generator the tool replaces.
 *
 * DEPENDENCY: qpcr-layout-neuronal-8plate.csv (repo root) is the parity oracle
 * and MUST stay committed and in sync with scripts/gen-qpcr-layout.mjs. If the
 * gen script changes, regenerate the CSV (node scripts/gen-qpcr-layout.mjs).
 *
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBrowserJs } from './helpers.mjs';

const ctx = loadBrowserJs('assets/js/labtools-calc.js');

// Values returned from the vm sandbox carry the sandbox's Array/Object
// prototypes, so deepStrictEqual rejects them on identity. Normalize to the
// test realm via JSON before structural comparison.
const plain = (v) => JSON.parse(JSON.stringify(v));

// ── gen-qpcr-layout.mjs configuration, mirrored ──────────────────────────────
const SAMPLES = [
  'Ctrl',
  'T1_TP1', 'T1_TP2', 'T1_TP3',
  'T2_TP1', 'T2_TP2', 'T2_TP3',
  'T3_TP1', 'T3_TP2', 'T3_TP3',
  'T4_TP1', 'T4_TP2', 'T4_TP3',
];
const REF = (name) => ({ name, role: 'reference' });
const TGT = (name) => ({ name, role: 'target' });
const PLATES = [
  { name: 'Plate 1', bands: [REF('HPRT1'), TGT('MAP2'),    TGT('GFAP')] },
  { name: 'Plate 2', bands: [REF('HPRT1'), TGT('SLC17A7'), TGT('SLC32A1')] },
  { name: 'Plate 3', bands: [REF('HPRT1'), TGT('PAX6'),    TGT('SOX2')] },
  { name: 'Plate 4', bands: [REF('HPRT1'), TGT('OLIG2'),   TGT('STX1A')] },
  { name: 'Plate 5', bands: [REF('HPRT1'), TGT('KCNMA1'),  TGT('KCNN2')] },
  { name: 'Plate 6', bands: [REF('HPRT1'), TGT('HCN1'),    TGT('PVALB')] },
  { name: 'Plate 7', bands: [REF('HPRT1'), TGT('SST'),     null] },
  { name: 'Ref',     bands: [REF('HPRT1'), REF('ACTB'),    REF('GAPDH')] },
];
const GENE_COLOR = {
  HPRT1: '#1f5fbf', ACTB: '#2f8f8f', GAPDH: '#4a4ab0',
  MAP2: '#c0392b', GFAP: '#e67e22', SLC17A7: '#16a085', SLC32A1: '#27ae60',
  PAX6: '#8e44ad', SOX2: '#9b59b6', OLIG2: '#d35400', STX1A: '#c0399b',
  KCNMA1: '#2c7fb8', KCNN2: '#41b6c4', HCN1: '#7fcdbb', PVALB: '#b8860b',
  SST: '#a0522d', NTC: '#9aa0a6',
};

function parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// Reference CSV → { plateName: { wellId: {gene,sample,content,color} } } (non-empty only)
function loadReferenceCsv() {
  const text = readFileSync(new URL('../../qpcr-layout-neuronal-8plate.csv', import.meta.url), 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const h = parseCsvLine(lines[0]);
  const col = (n) => h.indexOf(n);
  const iPlate = col('plate'), iWell = col('well'), iGene = col('gene'),
    iSample = col('sample'), iContent = col('content'), iColor = col('gene_color');
  const byPlate = {};
  for (let i = 1; i < lines.length; i++) {
    const c = parseCsvLine(lines[i]);
    const plate = c[iPlate], well = c[iWell];
    const gene = c[iGene], sample = c[iSample], content = c[iContent], color = c[iColor];
    (byPlate[plate] = byPlate[plate] || {});
    if (!gene && !sample && !content) continue;   // empty well — no assignment
    byPlate[plate][well] = { gene, sample, content, color };
  }
  return byPlate;
}

test('qpcrPackPlates: reproduces gen-qpcr-layout.mjs CSV well-for-well', () => {
  const ref = loadReferenceCsv();
  const packed = ctx.qpcrPackPlates({
    plates: PLATES,
    samples: SAMPLES,
    replicates: 2,
    plateType: '96',
    ntc: true,
    referenceGenes: ['HPRT1'],
    colorForGene: (name) => GENE_COLOR[name],
  });

  assert.equal(packed.plates.length, PLATES.length);
  packed.plates.forEach((plate) => {
    const expected = ref[plate.name];
    assert.ok(expected, 'CSV has plate ' + plate.name);
    // Same set of assigned wells.
    assert.deepEqual(
      plain(Object.keys(plate.assignments)).sort(),
      Object.keys(expected).sort(),
      'assigned wells match for ' + plate.name,
    );
    // Same per-well content.
    Object.keys(expected).forEach((well) => {
      assert.deepEqual(plain(plate.assignments[well]), expected[well], plate.name + ' ' + well);
    });
  });
});

test('qpcrBuildSamples: cartesian product over multiple factors', () => {
  const s = ctx.qpcrBuildSamples([
    { name: 'Treatment', values: ['Ctrl', 'T1'] },
    { name: 'Timepoint', values: ['TP1', 'TP2', 'TP3'] },
  ]);
  assert.equal(s.length, 6);
  assert.deepEqual(plain(s.map((x) => x.id)),
    ['Ctrl_TP1', 'Ctrl_TP2', 'Ctrl_TP3', 'T1_TP1', 'T1_TP2', 'T1_TP3']);
  assert.deepEqual(plain(s[3].parts), { Treatment: 'T1', Timepoint: 'TP1' });
});

test('qpcrBuildSamples: single factor and skip-exceptions', () => {
  const s = ctx.qpcrBuildSamples([{ name: 'Sample', values: ['A', 'B', 'C'] }],
    { skip: ['B'] });
  assert.deepEqual(plain(s.map((x) => x.id)), ['A', 'C']);
  assert.deepEqual(plain(ctx.qpcrBuildSamples([])), []);
});

test('qpcrPackPlates: enforces reference-gene-on-every-plate invariant', () => {
  assert.throws(() => ctx.qpcrPackPlates({
    plates: [{ name: 'Bad', bands: [ctxTgt('MAP2'), ctxTgt('GFAP'), null] }],
    samples: ['S1'],
    referenceGenes: ['HPRT1'],
  }), /missing required reference gene "HPRT1"/);
});

test('qpcrPackPlates: rejects samples that overflow a band', () => {
  const many = Array.from({ length: 15 }, (_, i) => 'S' + i);   // 15 > 7 rows × 2
  assert.throws(() => ctx.qpcrPackPlates({
    plates: [{ name: 'P', bands: [ctxRef('HPRT1'), null, null] }],
    samples: many,
    referenceGenes: ['HPRT1'],
  }), /exceed band capacity/);
});

test('qpcrToPlateLayout: gene becomes a coloured category, sample/content literal', () => {
  const packed = ctx.qpcrPackPlates({
    plates: [{ name: 'P1', bands: [ctxRef('HPRT1'), ctxTgt('MAP2'), null] }],
    samples: ['Ctrl', 'T1'],
    referenceGenes: ['HPRT1'],
    colorForGene: (n) => GENE_COLOR[n],
  });
  const layout = ctx.qpcrToPlateLayout(packed);
  // Field contract the planner + qPCR read.
  assert.deepEqual(plain(layout.fields.map((f) => f.id)), ['sample', 'gene', 'content']);
  assert.equal(layout.fields.find((f) => f.id === 'gene').kind, 'category');
  // Gene categories carry names + colours.
  const cats = layout.categoriesByField.gene;
  const hprt = cats.find((c) => c.name === 'HPRT1');
  assert.ok(hprt && hprt.color === GENE_COLOR.HPRT1);
  // A well: sample literal, gene resolves to a category id, content literal.
  const a1 = layout.plates[0].assignments.A1;
  assert.equal(a1.sample, 'Ctrl');
  assert.equal(a1.content, 'reference');
  assert.equal(a1.gene, hprt.id);
});

// Local helpers so the tests read clearly.
function ctxRef(name) { return { name, role: 'reference' }; }
function ctxTgt(name) { return { name, role: 'target' }; }
