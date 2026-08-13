/**
 * Unit tests for the shared counting Step-1 module (assets/js/labtools-counting.js).
 * Pure core() semantics are exercised against the formulas of labtools-calc.js;
 * DOM rendering stays covered by the tool-page e2e suites (cell-count / seeding-calc).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserJs } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Load calc.js first, then run counting.js in the SAME vm context so the
// module sees MODES / avgTwo / calcCellDensity / … (workflow.test.mjs pattern).
const ctx = loadBrowserJs('assets/js/labtools-calc.js', ['MODES', 'SMALL_ALL', 'SMALL_5']);
vm.runInContext(readFileSync(join(ROOT, 'assets/js/labtools-counting.js'), 'utf8'), ctx, {
  filename: 'labtools-counting.js',
});
const counting = ctx.window.labtools.counting;

test('core: mode 3 (4 corners, DF 20) with dual live + single dead', () => {
  const r = counting.core({
    modeId: 3, isAll: false,
    live1: 80, live2: 82, dead1: 20, dead2: NaN,
    df: 20, vol: 5,
  });
  assert.equal(r.error, null);
  assert.equal(r.avgLive, 81);
  assert.equal(r.liveN, 2);
  assert.equal(r.avgDead, 20);
  assert.equal(r.deadN, 1);
  assert.equal(r.density, 4050000);           // 81 × 0.25 × 20 × 10⁴
  assert.equal(r.totalCells, 20250000);        // density × 5 mL
  assert.ok(Math.abs(r.viability - 80.198) < 0.01); // 81/(81+20)×100
});

test('core: count-all mode ignores dead counts for viability', () => {
  const r = counting.core({
    modeId: 1, isAll: true,
    live1: 100, live2: NaN, dead1: NaN, dead2: NaN,
    df: 20, vol: 1,
  });
  assert.equal(r.error, null);
  assert.ok(Number.isNaN(r.viability));
  assert.equal(r.density, 20000000); // 100 × 1 × 20 × 10⁴
});

test('core: single live count (n=1) averages through', () => {
  const r = counting.core({
    modeId: 4, isAll: false,
    live1: 50, live2: NaN, dead1: 5, dead2: NaN,
    df: 2, vol: 2,
  });
  assert.equal(r.liveN, 1);
  assert.equal(r.density, 1000000); // 50 × 1 × 2 × 10⁴
  assert.equal(r.viability, (50 / 55) * 100);
});

test('core: negative guard flags error and nulls outputs', () => {
  const r = counting.core({
    modeId: 3, isAll: false,
    live1: -1, live2: 80, dead1: NaN, dead2: NaN,
    df: 20, vol: 5,
  });
  assert.equal(r.error, 'negative');
  assert.ok(Number.isNaN(r.density));
});

test('core: empty inputs produce NaN results without error', () => {
  const r = counting.core({
    modeId: 1, isAll: false,
    live1: NaN, live2: NaN, dead1: NaN, dead2: NaN,
    df: NaN, vol: NaN,
  });
  assert.equal(r.error, null);
  assert.ok(Number.isNaN(r.avgLive));
  assert.ok(Number.isNaN(r.density));
  assert.ok(Number.isNaN(r.totalCells));
  assert.ok(Number.isNaN(r.viability));
});

test('core: matches direct labtools-calc formulas (3 sampled inputs)', () => {
  const cases = [
    { modeId: 1, mult: 1, live: [60, 64], dead: [], df: 10, vol: 0.5 },
    { modeId: 2, mult: 5, live: [30, 30], dead: [2, 4], df: 40, vol: 3 },
    { modeId: 3, mult: 0.25, live: [90, NaN], dead: [10, NaN], df: 5, vol: 0.2 },
  ];
  for (const c of cases) {
    const liveVals = c.live.filter((v) => !isNaN(v));
    const deadVals = c.dead.filter((v) => !isNaN(v));
    const liveAvg = liveVals.reduce((s, v) => s + v, 0) / liveVals.length;
    const deadAvg = deadVals.length
      ? deadVals.reduce((s, v) => s + v, 0) / deadVals.length : NaN;
    const r = counting.core({
      modeId: c.modeId, isAll: c.dead.length === 0,
      live1: c.live[0], live2: c.live.length > 1 ? c.live[1] : NaN,
      dead1: c.dead[0] || NaN, dead2: c.dead.length > 1 ? c.dead[1] : NaN,
      df: c.df, vol: c.vol,
    });
    assert.equal(r.density, ctx.calcCellDensity(liveAvg, c.mult, c.df));
    assert.equal(r.totalCells, ctx.calcTotalCells(r.density, c.vol));
    if (c.dead.length) {
      assert.equal(r.viability, ctx.calcViabilityPct(liveAvg, deadAvg));
    }
  }
});

test('module registers its load-order marker', () => {
  assert.ok(Array.isArray(ctx.window.__labtoolsLoadOrder));
  assert.ok(ctx.window.__labtoolsLoadOrder.includes('labtools-counting'));
});
