/**
 * Parser flows — file-import parsing whose exact structured output is worth
 * pinning. Gated by authoritative, regenerable snapshots (UPDATE_SNAPSHOTS=1).
 * A mismatch always fails.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  boot, teardown, withTool, callHook, waitFor, feedFile, fixture, fixtureJson, matchSnapshot,
} from './harness.mjs';

before(boot);
after(teardown);

test('qpcr: AriaMx Tabular parser (LF)', async () => {
  await withTool('qpcr-analysis', async (page, errors) => {
    await feedFile(page, '#fileInput', 'aria-mx-tabular.txt', fixture('aria-mx-tabular.txt'));
    await waitFor(page, () => window.__labtoolsTestHooks['qpcr-analysis'].state().wellCount > 0);
    const state = await callHook(page, 'qpcr-analysis', 'state');
    assert.ok(state.wellCount > 0);
    matchSnapshot('qpcr-ariamx-lf.json', state);
    assert.deepEqual(errors, []);
  });
});

test('qpcr: AriaMx Tabular parser (CRLF)', async () => {
  await withTool('qpcr-analysis', async (page, errors) => {
    await feedFile(page, '#fileInput', 'aria-mx-tabular-crlf.txt', fixture('aria-mx-tabular-crlf.txt'));
    await waitFor(page, () => window.__labtoolsTestHooks['qpcr-analysis'].state().wellCount > 0);
    const state = await callHook(page, 'qpcr-analysis', 'state');
    matchSnapshot('qpcr-ariamx-crlf.json', state);
    assert.deepEqual(errors, []);
  });
});

test('rt-calc: Nanodrop parser', async () => {
  await withTool('rt-calc', async (page, errors) => {
    await feedFile(page, '#fileInput', 'nanodrop.csv', fixture('nanodrop.csv'), 'text/csv');
    await waitFor(page, () => { const b = document.getElementById('btnParse'); return b && !b.disabled; });
    await page.evaluate(() => document.getElementById('btnParse').click());
    await waitFor(page, () => window.__labtoolsTestHooks['rt-calc'].state().sampleCount > 0);
    const state = await callHook(page, 'rt-calc', 'state');
    matchSnapshot('nanodrop-rt.json', state);
    assert.deepEqual(errors, []);
  });
});

test('bca-assay: raw SoftMax-Pro plate parser', async () => {
  await withTool('bca-assay', async (page, errors) => {
    await page.evaluate((text) => {
      window.switchMode('raw');
      document.getElementById('plate-textarea').value = text;
      window.parsePlate();
    }, fixture('bca-raw.txt'));
    await waitFor(page, () => {
      const s = window.__labtoolsTestHooks['bca-assay'].state();
      return s.mode === 'raw' && !!s.plateMatrix;
    });
    const state = await callHook(page, 'bca-assay', 'state');
    matchSnapshot('bca-raw.json', state);
    assert.deepEqual(errors, []);
  });
});

test('bca-assay: manual-mode calculation', async () => {
  await withTool('bca-assay', async (page, errors) => {
    await callHook(page, 'bca-assay', 'seedManual', fixtureJson('bca-manual.json'));
    await waitFor(page, () => {
      const out = window.__labtoolsTestHooks['bca-assay'].serialize();
      return out && out.results && out.results.length > 0;
    });
    const out = await callHook(page, 'bca-assay', 'serialize');
    matchSnapshot('bca-manual.json', out);
    assert.deepEqual(errors, []);
  });
});
