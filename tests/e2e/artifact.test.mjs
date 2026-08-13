/**
 * Artifact model — live full-state recovery on a real tool page.
 *
 * Proves the pure-function model end-to-end in a browser: capture every control
 * as a param, mutate the tool, then restore params (from the artifact and from
 * its CSV encoding) and confirm the controls AND derived outputs come back
 * identically. This is the browser-side counterpart to tests/unit/artifact.test.mjs.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, teardown, withTool, callHook, waitFor, feedFile, fixture, fixtureJson } from './harness.mjs';

before(boot);
after(teardown);

const TOOL = 'cell-count';

// Drive the tool into a known non-default state (mode 3, 80 live / 20 dead, DF 20).
async function driveState(page) {
  await page.evaluate(() => {
    window.selectMode(3);
    document.getElementById('count-all-toggle').checked = false;
    document.getElementById('df').value = '20';
    document.getElementById('vol').value = '5';
    document.getElementById('live1').value = '80';
    document.getElementById('live2').value = '82';
    document.getElementById('dead1').value = '20';
    document.getElementById('dead2').value = '';
    window.calculate();
  });
  await waitFor(page, () => window.__labtoolsTestHooks['cell-count'].readOutputs()['cell-density'] > 0);
}

test('cell-count: artifact captures full control state as params', async () => {
  await withTool(TOOL, async (page, errors) => {
    await driveState(page);
    const art = await callHook(page, TOOL, 'buildArtifact');
    assert.equal(art.tool, 'cell-count');
    assert.equal(art.schemaVersion, 1);
    assert.deepEqual(art.params, {
      modeId: 3, countAll: false, df: '20', vol: '5',
      live1: '80', live2: '82', dead1: '20', dead2: '',
    });
    assert.ok(art.outputs['cell-density'] > 0, 'cell-density output present');
    assert.deepEqual(errors, []);
  });
});

test('cell-count: restore(params) reproduces controls and outputs', async () => {
  await withTool(TOOL, async (page, errors) => {
    await driveState(page);
    const before = await callHook(page, TOOL, 'buildArtifact');

    // Wipe the tool to a different state.
    await page.evaluate(() => {
      window.selectMode(1);
      document.getElementById('df').value = '1';
      document.getElementById('live1').value = '5';
      document.getElementById('live2').value = '';
      document.getElementById('vol').value = '1';
      window.calculate();
    });

    // Restore params from the artifact; controls + outputs must return.
    await callHook(page, TOOL, 'applyParams', before.params);
    const after = await callHook(page, TOOL, 'buildArtifact');
    assert.deepEqual(after.params, before.params, 'params restored');
    assert.deepEqual(after.outputs, before.outputs, 'outputs recomputed identically');
    assert.deepEqual(errors, []);
  });
});

test('cell-count: CSV round-trip restores the tool (JSON ≡ CSV)', async () => {
  await withTool(TOOL, async (page, errors) => {
    await driveState(page);
    const before = await callHook(page, TOOL, 'buildArtifact');
    const csv = await callHook(page, TOOL, 'toCsv');
    assert.ok(/(^|\r\n)params,modeId,/.test(csv), 'CSV carries params');

    // Change state, then restore purely from the CSV text.
    await page.evaluate(() => { document.getElementById('live1').value = '3'; window.calculate(); });
    await callHook(page, TOOL, 'fromCsv', csv);

    const after = await callHook(page, TOOL, 'buildArtifact');
    assert.deepEqual(after.params, before.params, 'params restored from CSV');
    assert.deepEqual(after.outputs, before.outputs, 'outputs match after CSV restore');
    assert.deepEqual(errors, []);
  });
});

// ── every migrated tool mounts the artifact controls without console errors ──

for (const tool of [
  'cell-count', 'seeding-calc', 'rt-calc', 'bca-assay',
  'qpcr-analysis', 'microplate-layout-planner', 'qpcr-plate-planner', 'stain-timer',
]) {
  test(`${tool}: mounts artifact controls (Save/Export/Import/Load)`, async () => {
    await withTool(tool, async (page, errors) => {
      const labels = await page.evaluate(() => {
        var host = document.getElementById('lt-artifact-controls');
        return host ? Array.prototype.map.call(host.querySelectorAll('button'), function (b) { return b.textContent; }) : [];
      });
      assert.ok(labels.some((l) => l.includes('Save state')), 'Save state button present');
      assert.ok(labels.some((l) => l.includes('Export state')), 'Export state button present');
      assert.ok(labels.some((l) => l.includes('Import state')), 'Import state button present');
      assert.ok(labels.some((l) => l.includes('Load state')), 'Load state button present');
      assert.deepEqual(errors, []);
    });
  });
}

// ── cell-count: the REAL Save→Load path through the mounted UI controls ──────
// (Exercises the shipped buttons + workbench artifact storage, not test hooks.)

async function clickBtnByText(page, containerSel, text) {
  await page.evaluate((sel, t) => {
    var btns = Array.prototype.slice.call(document.querySelectorAll(sel + ' button'));
    var b = btns.find(function (x) { return x.textContent.indexOf(t) >= 0; });
    if (!b) throw new Error('no button "' + t + '"');
    b.click();
  }, containerSel, text);
}

async function artifactCount(page, toolId) {
  return page.evaluate(async (t) => {
    var items = await window.workbench.getByType('artifact');
    return items.filter(function (i) { return i && i.data && i.data.tool === t; }).length;
  }, toolId);
}

test('cell-count: mounted Save → Load restores full state (real UI + workbench)', async () => {
  await withTool('cell-count', async (page, errors) => {
    // Stub the native prompt/confirm the Save button uses.
    await page.evaluate(() => { window.prompt = () => 'E2E State'; window.confirm = () => true; });

    // Clean any prior artifact rows so the picker is unambiguous.
    await page.evaluate(async () => { await window.workbench.clear(); });

    // Drive a known state through the tool's own controls.
    await page.evaluate(() => {
      window.selectMode(3);
      document.getElementById('df').value = '20';
      document.getElementById('live1').value = '80';
      document.getElementById('live2').value = '82';
      window.calculate();
    });
    const before = await callHook(page, 'cell-count', 'readParams');

    // Click the mounted "Save state" button; wait until the artifact is stored.
    await clickBtnByText(page, '#lt-artifact-controls', 'Save state');
    let n = 0;
    for (let i = 0; i < 60 && n === 0; i++) {
      n = await artifactCount(page, 'cell-count');
      if (!n) await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(n, 1, 'artifact saved to workbench via the button');

    // Scramble the tool to a different state.
    await page.evaluate(() => {
      window.selectMode(1);
      document.getElementById('df').value = '1';
      document.getElementById('live1').value = '3';
      document.getElementById('live2').value = '';
      window.calculate();
    });

    // Click "Load state"; the modal opens after the async workbench read.
    await clickBtnByText(page, '#lt-artifact-controls', 'Load state');
    await page.waitForSelector('.lta-scrim');
    // Click the saved-state row inside the modal.
    await page.evaluate(() => {
      var rows = Array.prototype.slice.call(document.querySelectorAll('.lta-scrim button'));
      var r = rows.find(function (x) { return x.textContent.indexOf('E2E State') >= 0; });
      if (!r) throw new Error('saved state row not found');
      r.click();
    });

    const after = await callHook(page, 'cell-count', 'readParams');
    assert.deepEqual(after, before, 'full state restored through the real Load path');
    assert.deepEqual(errors, []);
  });
});

// ── seeding-calc: a heavier control surface (count UI + bypass + unit pills) ──

const SEED = 'seeding-calc';

// Drive seeding-calc into bypass mode with non-default dilution units.
async function driveSeed(page) {
  await page.evaluate(() => {
    document.getElementById('bypass-toggle').checked = true;
    window.onBypassToggle();
    window.setBypassUnit('M');
    document.getElementById('bypass-conc').value = '2';
    window.setUnit('c2', 'K');
    document.getElementById('c2').value = '50';
    window.setUnit('v2', 'mL');
    document.getElementById('v2').value = '10';
    window.calcStep1();
    window.calcDilution();
  });
  await waitFor(page, () => window.__labtoolsTestHooks['seeding-calc'].readParams().bypassConc === '2');
}

test('seeding-calc: params capture count/bypass/unit-pill state', async () => {
  await withTool(SEED, async (page, errors) => {
    await driveSeed(page);
    const p = await callHook(page, SEED, 'readParams');
    assert.equal(p.bypassOn, true);
    assert.equal(p.bypassConc, '2');
    assert.equal(p.bypassUnit, 'M');
    assert.equal(p.dil.c2.unit, 'K');
    assert.equal(p.dil.v2.unit, 'mL');
    assert.deepEqual(errors, []);
  });
});

test('seeding-calc: CSV round-trip restores full state incl. unit pills', async () => {
  await withTool(SEED, async (page, errors) => {
    await driveSeed(page);
    const before = await callHook(page, SEED, 'buildArtifact');
    const csv = await callHook(page, SEED, 'toCsv');

    // Scramble: leave bypass, change units + values.
    await page.evaluate(() => {
      window.setUnit('c2', 'M');
      document.getElementById('c2').value = '999';
      document.getElementById('bypass-conc').value = '7';
      window.calcStep1(); window.calcDilution();
    });

    await callHook(page, SEED, 'fromCsv', csv);
    const after = await callHook(page, SEED, 'buildArtifact');
    assert.deepEqual(after.params, before.params, 'params restored from CSV (units + values)');
    assert.deepEqual(after.outputs, before.outputs, 'seeding-plan output matches after restore');
    assert.deepEqual(errors, []);
  });
});

// ── rt-calc: sample rows + kit config + mode/collapse ────────────────────────

const RT = 'rt-calc';
const RT_PARAMS = {
  mode: 'master',
  primerName: 'Oligo-d(T)',
  cfgPreset: 'e3010',
  collapsed: true,
  samples: [
    { name: 'S1', conc: 120.5, a260_280: 1.9, a260_230: 2.1, scale: -1 },
    // conc must be numeric (rt-calc renders every row); ratios are nullable.
    { name: 'S2', conc: 88, a260_280: null, a260_230: null, scale: 1 },
  ],
  cfg: { targetRNA: '1000', maxRNAVol: '19', reactions: '2', superMix: '4', masterMix: '4', randomPrimer: '1', baseVol: '20' },
};

test('rt-calc: applyParams → readParams is identity', async () => {
  await withTool(RT, async (page, errors) => {
    await callHook(page, RT, 'applyParams', RT_PARAMS);
    const p = await callHook(page, RT, 'readParams');
    assert.deepEqual(p, RT_PARAMS);
    assert.deepEqual(errors, []);
  });
});

test('rt-calc: CSV round-trip restores full state (samples + config + mode)', async () => {
  await withTool(RT, async (page, errors) => {
    await callHook(page, RT, 'applyParams', RT_PARAMS);
    const before = await callHook(page, RT, 'buildArtifact');
    const csv = await callHook(page, RT, 'toCsv');

    // Scramble to a completely different state.
    await callHook(page, RT, 'applyParams', {
      mode: 'super', primerName: 'Random Primer', collapsed: false, samples: [], cfg: {},
    });

    await callHook(page, RT, 'fromCsv', csv);
    const after = await callHook(page, RT, 'buildArtifact');
    assert.deepEqual(after.params, before.params, 'params restored from CSV');
    assert.deepEqual(after.outputs, before.outputs, 'sample-list output matches after restore');
    assert.deepEqual(errors, []);
  });
});

// ── bca-assay: manual mode (standard/sample rows + preset + fit + QC) ─────────

const BCA = 'bca-assay';
const BCA_PARAMS = {
  currentMode: 'manual',
  stdRows: [
    { conc: '2000', od1: '1.20', od2: '1.22', od3: '' },
    { conc: '1000', od1: '0.70', od2: '0.71', od3: '' },
    { conc: '500',  od1: '0.40', od2: '0.41', od3: '' },
    { conc: '0',    od1: '0.05', od2: '0.05', od3: '' },
  ],
  smpRows: [
    { name: 'Lysate A', od1: '0.55', od2: '0.56', od3: '', df: '2' },
    { name: 'Lysate B', od1: '0.33', od2: '', od3: '', df: '1' },
  ],
  currentPreset: 'pierce',
  numReps: 2,
  fitModel: 'linear',
  qcCvThr: 15,
  exclConcs: [],
  wellVolume: 0.2,
  concUnit: 'µg/mL',
  plateMatrix: null,
  wellAssigns: {},
  plateTplId: 'basic',
  plateTplActive: [],
  plateTextarea: '',
};

test('bca-assay: applyParams → readParams is identity (manual mode)', async () => {
  await withTool(BCA, async (page, errors) => {
    await callHook(page, BCA, 'applyParams', BCA_PARAMS);
    const p = await callHook(page, BCA, 'readParams');
    assert.deepEqual(p, BCA_PARAMS);
    assert.deepEqual(errors, []);
  });
});

test('bca-assay: CSV round-trip restores manual state', async () => {
  await withTool(BCA, async (page, errors) => {
    await callHook(page, BCA, 'applyParams', BCA_PARAMS);
    const before = await callHook(page, BCA, 'buildArtifact');
    const csv = await callHook(page, BCA, 'toCsv');

    // Scramble to a different state.
    await callHook(page, BCA, 'applyParams', {
      currentMode: 'manual', stdRows: [], smpRows: [], currentPreset: 'basic',
      numReps: 1, fitModel: 'quadratic', qcCvThr: 20, exclConcs: ['500'],
      wellVolume: 0.1, concUnit: 'mg/mL', plateMatrix: null, wellAssigns: {},
      plateTplId: 'basic', plateTplActive: [], plateTextarea: '',
    });

    await callHook(page, BCA, 'fromCsv', csv);
    const after = await callHook(page, BCA, 'buildArtifact');
    assert.deepEqual(after.params, before.params, 'params restored from CSV');
    assert.deepEqual(errors, []);
  });
});

// ── qpcr-analysis: real ingested run (records + labels + analysis settings) ───

const QPCR = 'qpcr-analysis';

test('qpcr-analysis: CSV round-trip restores a full ingested run', async () => {
  await withTool(QPCR, async (page, errors) => {
    // Ingest a real Agilent tabular results file (same fixture the parser tests use).
    await feedFile(page, '#fileInput', 'aria-mx-tabular.txt', fixture('aria-mx-tabular.txt'));
    await waitFor(page, () => window.__labtoolsTestHooks['qpcr-analysis'].state().wellCount > 0);

    // Apply some user state (labels + an analysis toggle) so restore has real work.
    await callHook(page, QPCR, 'apply', fixtureJson('plate-layout-96.json'), 'plate-layout');
    await page.evaluate(() => {
      const h = window.__labtoolsTestHooks['qpcr-analysis'];
      const p = h.readParams();
      p.plateMode = 'cq'; p.qcSdThr = 0.75; p.ddEffCorr = true;
      h.applyParams(p);
    });

    const before = await callHook(page, QPCR, 'buildArtifact');
    const csv = await callHook(page, QPCR, 'toCsv');

    // Wipe the tool, then restore purely from CSV.
    await page.evaluate(() => {
      window.__labtoolsTestHooks['qpcr-analysis'].applyParams({});
    });
    await callHook(page, QPCR, 'fromCsv', csv);

    const after = await callHook(page, QPCR, 'buildArtifact');
    assert.deepEqual(after.params, before.params, 'full run restored from CSV');
    assert.deepEqual(after.outputs, before.outputs, 'qpcr-results output matches after restore');
    assert.deepEqual(errors, []);
  });
});

// ── microplate-layout-planner: plates + fields + categories + view selectors ─

const MPL = 'microplate-layout-planner';

test('microplate: CSV round-trip restores plates + fields + view selectors', async () => {
  await withTool(MPL, async (page, errors) => {
    await callHook(page, MPL, 'apply', fixtureJson('plate-layout-96.json'), 'plate-layout');
    const before = await callHook(page, MPL, 'buildArtifact');
    const csv = await callHook(page, MPL, 'toCsv');

    // Scramble: replace with a fresh minimal state via apply.
    await callHook(page, MPL, 'apply', { plates: [], fields: [], categoriesByField: {} }, 'plate-layout');

    await callHook(page, MPL, 'fromCsv', csv);
    const after = await callHook(page, MPL, 'buildArtifact');
    assert.deepEqual(after.params, before.params, 'plates/fields/selectors restored from CSV');
    assert.deepEqual(after.outputs, before.outputs, 'plate-layout output matches after restore');
    assert.deepEqual(errors, []);
  });
});

// ── qpcr-plate-planner: the whole design state ───────────────────────────────

const QPP = 'qpcr-plate-planner';
const QPP_PARAMS = {
  factors: [
    { name: 'Sample', valuesRaw: 'S1, S2, S3' },
    { name: 'Time', valuesRaw: '0h, 24h' },
  ],
  genes: [
    { name: 'HPRT1', role: 'reference' },
    { name: 'MAP2', role: 'target' },
    { name: 'GFAP', role: 'target' },
  ],
  replicates: 3,
  bandsPerPlate: 3,
  ntc: false,
  plateType: '96',
  skip: { 'S2|24h': true },
};

test('qpcr-plate-planner: applyParams → readParams is identity', async () => {
  await withTool(QPP, async (page, errors) => {
    await callHook(page, QPP, 'applyParams', QPP_PARAMS);
    const p = await callHook(page, QPP, 'readParams');
    assert.deepEqual(p, QPP_PARAMS);
    assert.deepEqual(errors, []);
  });
});

test('qpcr-plate-planner: CSV round-trip restores design + layout output', async () => {
  await withTool(QPP, async (page, errors) => {
    await callHook(page, QPP, 'applyParams', QPP_PARAMS);
    const before = await callHook(page, QPP, 'buildArtifact');
    const csv = await callHook(page, QPP, 'toCsv');

    await callHook(page, QPP, 'applyParams', {
      factors: [{ name: 'X', valuesRaw: 'a' }], genes: [{ name: 'ACTB', role: 'reference' }],
      replicates: 1, bandsPerPlate: 3, ntc: true, plateType: '96', skip: {},
    });

    await callHook(page, QPP, 'fromCsv', csv);
    const after = await callHook(page, QPP, 'buildArtifact');
    assert.deepEqual(after.params, before.params, 'design restored from CSV');
    assert.deepEqual(after.outputs, before.outputs, 'plate-layout output matches after restore');
    assert.deepEqual(errors, []);
  });
});

// ── stain-timer: protocol design (timer runtime excluded) ────────────────────

const STAIN = 'stain-timer';
const STAIN_PARAMS = {
  protocol: [
    { solution: 'Cresyl Violet', durationMin: 5, durationSec: 30, slot: '1' },
    { solution: 'Wash', durationMin: 0, durationSec: 45, slot: '2' },
    { solution: 'Differentiate', durationMin: 2, durationSec: 0, slot: '3' },
  ],
};

test('stain-timer: applyParams → readParams is identity', async () => {
  await withTool(STAIN, async (page, errors) => {
    await callHook(page, STAIN, 'applyParams', STAIN_PARAMS);
    const p = await callHook(page, STAIN, 'readParams');
    assert.deepEqual(p, STAIN_PARAMS);
    assert.deepEqual(errors, []);
  });
});

test('stain-timer: CSV round-trip restores the protocol', async () => {
  await withTool(STAIN, async (page, errors) => {
    await callHook(page, STAIN, 'applyParams', STAIN_PARAMS);
    const before = await callHook(page, STAIN, 'buildArtifact');
    const csv = await callHook(page, STAIN, 'toCsv');

    await callHook(page, STAIN, 'applyParams', { protocol: [{ solution: 'X', durationMin: 1, durationSec: 0, slot: '1' }] });
    await callHook(page, STAIN, 'fromCsv', csv);

    const after = await callHook(page, STAIN, 'buildArtifact');
    assert.deepEqual(after.params, before.params, 'protocol restored from CSV');
    assert.deepEqual(after.outputs, before.outputs, 'protocol output matches after restore');
    assert.deepEqual(errors, []);
  });
});
