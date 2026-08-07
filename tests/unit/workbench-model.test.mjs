/**
 * Unit tests for the workbench data model — pure logic only.
 * IndexedDB / BroadcastChannel are NOT exercised here (browser harness does that).
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserJs } from './helpers.mjs';

// Load labtools-types.js first, then workbench.js, in one shared context so
// workbench can read DATA_TYPES (strict validation + derived display meta).
const ctx = loadBrowserJs('assets/js/labtools-types.js', ['DATA_TYPES']);
const workbenchCtx = loadBrowserJs('assets/js/labtools-workbench.js');
// share the registry into the workbench context
workbenchCtx.window.DATA_TYPES = ctx.DATA_TYPES;
workbenchCtx.window.validateWorkbenchType = ctx.validateWorkbenchType;
const wb = workbenchCtx;

test('DATA_TYPES covers every workbench data type used by tools', () => {
  const usedTypes = [
    'plate-layout', 'sample-list', 'conc-data',
    'qpcr-results', 'seeding-plan', 'protocol', 'generic',
  ];
  usedTypes.forEach((t) => {
    assert.ok(ctx.DATA_TYPES[t], `DATA_TYPES entry for ${t}`);
    assert.ok(ctx.DATA_TYPES[t].icon, `icon for ${t}`);
    assert.ok(ctx.DATA_TYPES[t].name, `name for ${t}`);
    assert.ok(ctx.DATA_TYPES[t].color, `color for ${t}`);
    assert.ok(ctx.DATA_TYPES[t].schema, `schema for ${t}`);
  });
});

test('validateWorkbenchType is exposed and strict', () => {
  assert.equal(typeof ctx.validateWorkbenchType, 'function');
  const ok = ctx.validateWorkbenchType('protocol', {
    steps: [{ solution: 'A', durationMin: 1, durationSec: 0, slot: '1' }],
  });
  assert.equal(ok.valid, true);
  const bad = ctx.validateWorkbenchType('protocol', { steps: [{ solution: 'A' }] });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.length > 0);
});

test('workbench.put rejects invalid payloads in strict mode', async () => {
  const invalid = await wb.workbench.put('protocol', 'Bad', { steps: [{ solution: 'A' }] })
    .then(() => null, (e) => e);
  // NOTE: cross-realm Error — check message, not `instanceof` (VM realm differs)
  assert.ok(invalid && typeof invalid.message === 'string');
  assert.match(invalid.message, /schema violation/);

  // valid payload still works (IndexedDB stub rejects, but validation passes first)
  const valid = await wb.workbench.put('protocol', 'Good', {
    steps: [{ solution: 'A', durationMin: 1, durationSec: 0, slot: '1' }],
  }).then((id) => id, (e) => e);
  // without a real IndexedDB the dbExec promise rejects — that's fine,
  // the point is validation did not reject first.
  assert.ok(valid == null || /indexedDB|undefined/i.test(valid.message || ''));
});

test('labtoolsRegisterTestHooks is exposed and registers under __labtoolsTestHooks', () => {
  assert.equal(typeof wb.labtoolsRegisterTestHooks, 'function');
  const hooks = { serialize: () => ({}), apply: () => {} };
  wb.labtoolsRegisterTestHooks('unit-test-tool', hooks);
  // registration mutates window.__labtoolsTestHooks (the sandbox copy is a
  // load-time snapshot, so assert on the window shim the function writes to)
  assert.equal(wb.window.__labtoolsTestHooks['unit-test-tool'], hooks);
});

test('workbench API surface is present (methods exist on the object)', () => {
  const methods = [
    'put', 'getAll', 'getByType', 'getItem', 'findByName',
    'remove', 'clear', 'updateLabel', 'exportJSON', 'importJSON', 'onChange',
  ];
  methods.forEach((m) => {
    assert.equal(typeof wb.workbench[m], 'function', `workbench.${m} is a function`);
  });
});

test('exportJSON envelope shape (validated via a stub getAll)', async () => {
  // Monkey-patch getAll to return sample items, then check envelope.
  const original = wb.workbench.getAll;
  wb.workbench.getAll = () => Promise.resolve([
    { id: 'a', type: 'conc-data', label: 'X', tool: 'bca-assay', timestamp: 1, data: { results: [] } },
  ]);
  try {
    const json = await wb.workbench.exportJSON();
    const parsed = JSON.parse(json);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].label, 'X');
    assert.ok(typeof parsed.exportedAt === 'string');
  } finally {
    wb.workbench.getAll = original;
  }
});

test('importJSON rejects malformed input', async () => {
  await assert.rejects(() => wb.workbench.importJSON('{not json'));
  await assert.rejects(() => wb.workbench.importJSON('{"foo": 1}'));
  await assert.rejects(() => wb.workbench.importJSON('{"items": "nope"}'));
});
