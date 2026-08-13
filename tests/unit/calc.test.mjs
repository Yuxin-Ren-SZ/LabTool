/**
 * Unit tests for assets/js/labtools-calc.js — the shared pure-function library.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserJs } from './helpers.mjs';

const ctx = loadBrowserJs('assets/js/labtools-calc.js', ['MODES', 'SMALL_ALL', 'SMALL_5']);

test('calcCellDensity: hemocytometer formula', () => {
  // avgCount × multiplier × DF × 10⁴
  assert.equal(ctx.calcCellDensity(80, 0.25, 20), 4000000);  // 4 corner squares, DF=20
  assert.equal(ctx.calcCellDensity(100, 1, 20), 20000000);   // all-25 mode, DF=20
  assert.equal(ctx.calcCellDensity(50, 5, 2), 5000000);      // 5 small squares, DF=2
  assert.ok(Number.isNaN(ctx.calcCellDensity(-1, 0.25, 20))); // negative count
  assert.ok(Number.isNaN(ctx.calcCellDensity(80, 0.25, 0)));  // zero DF
  assert.ok(Number.isNaN(ctx.calcCellDensity(NaN, 0.25, 20)));// NaN input
});

test('calcTotalCells: density × volume', () => {
  assert.equal(ctx.calcTotalCells(2e6, 1.5), 3000000);
  assert.equal(ctx.calcTotalCells(2e6, 0), NaN);
  assert.equal(ctx.calcTotalCells(NaN, 1.5), NaN);
});

test('calcViabilityPct: live/(live+dead)', () => {
  assert.equal(ctx.calcViabilityPct(80, 20), 80);
  assert.equal(ctx.calcViabilityPct(80, 0), 100);
  assert.ok(Number.isNaN(ctx.calcViabilityPct(0, 0)));   // no cells counted
  assert.ok(Number.isNaN(ctx.calcViabilityPct(-5, 20))); // negative dead
});

test('avgTwo: handles missing values', () => {
  // Compare field-by-field: VM-realm objects fail cross-realm deepStrictEqual.
  const a = ctx.avgTwo(80, 90);
  assert.equal(a.val, 85); assert.equal(a.n, 2);
  const b = ctx.avgTwo(80, NaN);
  assert.equal(b.val, 80); assert.equal(b.n, 1);
  const c = ctx.avgTwo(NaN, NaN);
  assert.ok(Number.isNaN(c.val)); assert.equal(c.n, 0);
});

test('fmt: thousands commas + dash placeholder', () => {
  assert.equal(ctx.fmt(2000000), '2,000,000');
  assert.equal(ctx.fmt(NaN), '—');
  assert.equal(ctx.fmt(0), '0');
});

test('fmtSig: significant-figure display rules', () => {
  assert.equal(ctx.fmtSig(0.00012), '1.20e-4');
  assert.equal(ctx.fmtSig(1.5), '1.50');
  assert.equal(ctx.fmtSig(12.5), '12.5');
  assert.equal(ctx.fmtSig(1234567), '1,234,567');
  assert.equal(ctx.fmtSig(0), '0');
  assert.equal(ctx.fmtSig(NaN), '—');
});

test('autoBestConcUnit: cell concentration unit scaling', () => {
  const check = (cellsPerML, mult, label, pillText) => {
    const r = ctx.autoBestConcUnit(cellsPerML);
    assert.equal(r.mult, mult); assert.equal(r.label, label); assert.equal(r.pillText, pillText);
  };
  check(2e6, 1e6, 'M/mL', 'M');
  check(1500, 1e3, 'K/mL', 'K');
  check(100, 1, 'cells/mL', 'cells');
  check(2e9, 1e9, 'B/mL', 'B');
});

test('bestVolumeDisplay: mL → readable unit', () => {
  const check = (mL, val, unit) => {
    const r = ctx.bestVolumeDisplay(mL);
    assert.equal(r.val, val); assert.equal(r.unit, unit);
  };
  check(0.5, 500, 'µL');
  check(2, 2, 'mL');
  check(2000, 2, 'L');
});

test('convertBodyWeight + calcDoseFromBodyWeight', () => {
  assert.equal(ctx.convertBodyWeight(25, 'g', 'kg'), 0.025);
  assert.equal(ctx.convertBodyWeight(0.25, 'kg', 'g'), 250);
  assert.equal(ctx.calcDoseFromBodyWeight(5, 'kg', 25, 'g'), 0.125);
  assert.equal(ctx.calcDoseFromBodyWeight(10, 'kg', 0.25, 'kg'), 2.5);
  assert.ok(Number.isNaN(ctx.calcDoseFromBodyWeight(5, 'kg', 0, 'g')));
});

test('parseSampleAnnotation: group + biological replicate', () => {
  const check = (input, group, bioRep) => {
    const r = ctx.parseSampleAnnotation(input);
    assert.equal(r.group, group, `group for "${input}"`);
    assert.equal(r.bioRep, bioRep, `bioRep for "${input}"`);
  };
  check('Control_2', 'Control', '2');
  check('KO rep3', 'KO', '3');
  check('Vehicle', 'Vehicle', '1');
  check('', '', '');
});

test('tTestTwoSided: two-sample t-test p-value', () => {
  const res = ctx.tTestTwoSided([1, 2, 3], [4, 5, 6]);
  assert.ok(res.p > 0 && res.p < 1);
  assert.ok(Math.abs(res.p - 0.0213) < 0.005, `p=${res.p} expected ~0.0213`);
});

test('stdCurveFit: efficiency from standard curve', () => {
  const fit = ctx.stdCurveFit([
    { quantity: 1, cq: 30 },
    { quantity: 10, cq: 26.68 },
    { quantity: 100, cq: 23.36 },
  ]);
  assert.ok(Math.abs(fit.E - 2.0) < 0.05, `E=${fit.E} expected ~2.0`);
});

test('genormM: geNorm M from Cq data', () => {
  // genormM returns { M: {gene: m}, ranked: [...] } — stable genes → low M.
  const stable = { G1: [20, 20.1, 20.2], G2: [21, 21.1, 21.2] };
  const unstable = { G1: [20, 22, 24], G2: [21, 24, 27] };
  const mStable = ctx.genormM(stable).M;
  const mUnstable = ctx.genormM(unstable).M;
  assert.ok(mStable.G1 < mUnstable.G1, 'stable gene should have lower M');
  assert.ok(mStable.G2 < mUnstable.G2, 'stable gene 2 should have lower M');
});

test('MODES: 4 counting modes with expected multipliers', () => {
  assert.equal(ctx.MODES.length, 4);
  assert.equal(ctx.MODES[0].multiplier, 1);    // all 25 small
  assert.equal(ctx.MODES[1].multiplier, 5);    // 5 small
  assert.equal(ctx.MODES[2].multiplier, 0.25); // 4 corners
  assert.equal(ctx.MODES[3].multiplier, 1);    // 1 corner
  assert.equal(ctx.SMALL_ALL, 'all');
  assert.equal(ctx.SMALL_5.length, 5);
});

test('makeDiagram: SVG output contains expected structure', () => {
  const svg = ctx.makeDiagram([[0, 0]], 'all');
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('</svg>'));
  assert.ok(svg.includes('width='));
});
