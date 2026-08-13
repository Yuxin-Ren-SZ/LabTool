/**
 * Live-validation safety net — the test that would have caught the original bug.
 *
 * For each producing tool, seed a representative + edge-case state, then run the
 * tool's OWN live serialize() output through validateWorkbenchType(produces, …).
 * Because it uses live output (not hand-written fixtures), it catches drift
 * between what a tool emits and what the data-contract registry accepts.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, teardown, withTool, callHook, waitFor, feedFile, fixture, fixtureJson } from './harness.mjs';

before(boot);
after(teardown);

/** Serialize in-page and validate against the declared produce type. */
function liveValidate(page, tool, produces) {
  return page.evaluate((t, p) => {
    const out = window.__labtoolsTestHooks[t].serialize();
    const check = window.validateWorkbenchType(p, out);
    return { valid: check.valid, errors: check.errors };
  }, tool, produces);
}

test('planner → plate-layout validates (live serialize, real assignments)', async () => {
  const tool = 'microplate-layout-planner';
  await withTool(tool, async (page) => {
    await callHook(page, tool, 'apply', fixtureJson('plate-layout-96.json'), 'plate-layout');
    const out = await callHook(page, tool, 'serialize');
    const wellCount = (out.plates || []).reduce((n, p) => n + Object.keys(p.assignments || {}).length, 0);
    assert.ok(wellCount > 0, 'serialize must carry real well assignments (non-vacuous)');
    const r = await liveValidate(page, tool, 'plate-layout');
    assert.ok(r.valid, `plate-layout invalid: ${r.errors.join('; ')}`);
  });
  // NB: the 384/1536 well-ID keyPattern acceptance is locked at the schema layer
  // by tests/unit/types.test.mjs (validateWorkbenchType accepts I1/P24/AA1/AF48).
});

test('qpcr → qpcr-results validates', async () => {
  const tool = 'qpcr-analysis';
  await withTool(tool, async (page) => {
    await feedFile(page, '#fileInput', 'aria-mx-tabular.txt', fixture('aria-mx-tabular.txt'));
    await waitFor(page, () => window.__labtoolsTestHooks['qpcr-analysis'].state().wellCount > 0);
    const r = await liveValidate(page, tool, 'qpcr-results');
    assert.ok(r.valid, `qpcr-results invalid: ${r.errors.join('; ')}`);
  });
});

test('bca → conc-data validates (incl. blank row → null conc/cv)', async () => {
  const tool = 'bca-assay';
  await withTool(tool, async (page) => {
    await callHook(page, tool, 'seedManual', {
      stdRows: [
        { conc: 2000, od1: 1.90, od2: 1.92, od3: 1.88 },
        { conc: 1000, od1: 1.20, od2: 1.22, od3: 1.19 },
        { conc: 500,  od1: 0.70, od2: 0.71, od3: 0.69 },
        { conc: 0,    od1: 0.08, od2: 0.09, od3: 0.08 },
      ],
      smpRows: [
        { name: 'Valid', od1: 0.85, od2: 0.86, od3: 0.84, df: 1 },
        { name: 'Blank', od1: '',   od2: '',   od3: '',   df: 1 },
      ],
      fitModel: 'linear',
    });
    await waitFor(page, () => {
      const out = window.__labtoolsTestHooks['bca-assay'].serialize();
      return out && out.results && out.results.length >= 2;
    });
    const r = await liveValidate(page, tool, 'conc-data');
    assert.ok(r.valid, `conc-data invalid: ${r.errors.join('; ')}`);
  });
});

test('cell-count → sample-list validates', async () => {
  const tool = 'cell-count';
  await withTool(tool, async (page) => {
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
    const r = await liveValidate(page, tool, 'sample-list');
    assert.ok(r.valid, `sample-list invalid: ${r.errors.join('; ')}`);
  });
});

test('rt-calc → sample-list validates (Nanodrop parse)', async () => {
  const tool = 'rt-calc';
  await withTool(tool, async (page) => {
    await feedFile(page, '#fileInput', 'nanodrop.csv', fixture('nanodrop.csv'), 'text/csv');
    await waitFor(page, () => { const b = document.getElementById('btnParse'); return b && !b.disabled; });
    await page.evaluate(() => document.getElementById('btnParse').click());
    await waitFor(page, () => window.__labtoolsTestHooks['rt-calc'].state().sampleCount > 0);
    const r = await liveValidate(page, tool, 'sample-list');
    assert.ok(r.valid, `sample-list invalid: ${r.errors.join('; ')}`);
  });
});

test('seeding-calc → seeding-plan validates', async () => {
  const tool = 'seeding-calc';
  await withTool(tool, async (page) => {
    await callHook(page, tool, 'apply', fixtureJson('conc-data.json'), 'conc-data');
    await waitFor(page, () => window.__labtoolsTestHooks['seeding-calc'].state().density > 0);
    const r = await liveValidate(page, tool, 'seeding-plan');
    assert.ok(r.valid, `seeding-plan invalid: ${r.errors.join('; ')}`);
  });
});

test('stain-timer → protocol validates', async () => {
  const tool = 'stain-timer';
  await withTool(tool, async (page) => {
    await callHook(page, tool, 'apply', fixtureJson('protocol.json'), 'protocol');
    const r = await liveValidate(page, tool, 'protocol');
    assert.ok(r.valid, `protocol invalid: ${r.errors.join('; ')}`);
  });
});
