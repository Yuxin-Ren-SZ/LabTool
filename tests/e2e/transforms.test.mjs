/**
 * Transform flows — apply→serialize round-trips and cross-tool imports.
 * Gated by invariant assertions (round-trip identity, "N labeled wells", …),
 * not snapshots: robust to cosmetic output changes, self-documenting.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  boot, teardown, withTool, callHook, waitFor, feedFile, fixture, fixtureJson, normalize,
} from './harness.mjs';

before(boot);
after(teardown);

const PLANNER = 'microplate-layout-planner';

test('planner: apply→serialize is identity (96-well)', async () => {
  await withTool(PLANNER, async (page, errors) => {
    const data = fixtureJson('plate-layout-96.json');
    await callHook(page, PLANNER, 'apply', data, 'plate-layout');
    const out = await callHook(page, PLANNER, 'serialize');
    assert.equal(normalize(out), normalize(data), 'round-trip must preserve the layout');
    assert.deepEqual(errors, []);
  });
});

test('planner: apply→serialize is identity (8-plate)', async () => {
  await withTool(PLANNER, async (page, errors) => {
    const data = fixtureJson('plate-layout-8plate.json');
    await callHook(page, PLANNER, 'apply', data, 'plate-layout');
    const out = await callHook(page, PLANNER, 'serialize');
    assert.equal(normalize(out), normalize(data));
    assert.deepEqual(errors, []);
  });
});

test('stain-timer: apply→serialize is identity (protocol)', async () => {
  await withTool('stain-timer', async (page, errors) => {
    const data = fixtureJson('protocol.json');
    await callHook(page, 'stain-timer', 'apply', data, 'protocol');
    const out = await callHook(page, 'stain-timer', 'serialize');
    assert.equal(normalize(out), normalize(data));
    assert.deepEqual(errors, []);
  });
});

test('rt-calc: parse Nanodrop then apply conc-data fills concentrations', async () => {
  await withTool('rt-calc', async (page, errors) => {
    // Create samples via the real parser path (apply(sample-list) is broken —
    // rt-calc:1036 references an undefined `sampleScale`; tracked separately).
    await feedFile(page, '#fileInput', 'nanodrop.csv', fixture('nanodrop.csv'), 'text/csv');
    await waitFor(page, () => { const b = document.getElementById('btnParse'); return b && !b.disabled; });
    await page.evaluate(() => document.getElementById('btnParse').click());
    await waitFor(page, () => window.__labtoolsTestHooks['rt-calc'].state().sampleCount > 0);
    await callHook(page, 'rt-calc', 'apply', fixtureJson('conc-data.json'), 'conc-data');
    const out = await callHook(page, 'rt-calc', 'serialize');
    const withConc = (out.samples || []).filter((s) => s.conc != null);
    assert.ok(withConc.length > 0, 'at least one sample should receive a concentration');
    assert.deepEqual(errors, []);
  });
});

test('seeding-calc: apply conc-data sets stock density + bypass mode', async () => {
  await withTool('seeding-calc', async (page, errors) => {
    await callHook(page, 'seeding-calc', 'apply', fixtureJson('conc-data.json'), 'conc-data');
    const state = await callHook(page, 'seeding-calc', 'state');
    assert.ok(state.density > 0, 'density should be set');
    assert.ok(state.bypassOn, 'bypass toggle should be on');
    assert.deepEqual(errors, []);
  });
});

test('qpcr-analysis: apply plate-layout labels wells (after parsing a plate)', async () => {
  await withTool('qpcr-analysis', async (page, errors) => {
    await feedFile(page, '#fileInput', 'tabular.txt', fixture('aria-mx-tabular.txt'));
    await waitFor(page, () => window.__labtoolsTestHooks['qpcr-analysis'].state().wellCount > 0);
    await callHook(page, 'qpcr-analysis', 'apply', fixtureJson('plate-layout-96.json'), 'plate-layout');
    const out = await callHook(page, 'qpcr-analysis', 'serialize');
    const named = Object.values(out.wells || {}).filter((w) => w.sample).length;
    assert.ok(named > 0, 'plate-layout import should name wells');
    assert.deepEqual(errors, []);
  });
});

test('qpcr-analysis: apply sample-list labels wells (after parsing a plate)', async () => {
  await withTool('qpcr-analysis', async (page, errors) => {
    await feedFile(page, '#fileInput', 'tabular.txt', fixture('aria-mx-tabular.txt'));
    await waitFor(page, () => window.__labtoolsTestHooks['qpcr-analysis'].state().wellCount > 0);
    await callHook(page, 'qpcr-analysis', 'apply', fixtureJson('sample-list-rt.json'), 'sample-list');
    const out = await callHook(page, 'qpcr-analysis', 'serialize');
    const named = Object.values(out.wells || {}).filter((w) => w.sample).length;
    assert.ok(named > 0, 'sample-list import should name wells');
    assert.deepEqual(errors, []);
  });
});

test('cell-count: serialize produces a positive concentration', async () => {
  await withTool('cell-count', async (page, errors) => {
    // Drive the tool's own globals (count 80 live / 20 dead, mode 3, DF 20).
    await page.evaluate(() => {
      window.selectMode(3);
      document.getElementById('live1').value = '80';
      document.getElementById('dead1').value = '20';
      document.getElementById('df').value = '20';
      window.calculate();
    });
    await waitFor(page, () => {
      const out = window.__labtoolsTestHooks['cell-count'].serialize();
      return out && out.samples[0] && out.samples[0].conc > 0;
    });
    const out = await callHook(page, 'cell-count', 'serialize');
    assert.ok(out.samples[0].conc > 0);
    assert.deepEqual(errors, []);
  });
});
