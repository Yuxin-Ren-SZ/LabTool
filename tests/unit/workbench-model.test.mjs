/**
 * Unit tests for the workbench data model — pure logic only.
 * IndexedDB / BroadcastChannel are NOT exercised here (browser harness does that).
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserJs } from './helpers.mjs';

// Load workbench.js with the DOM shim; only TYPE_META + pure helpers are used.
const ctx = loadBrowserJs('assets/js/labtools-workbench.js');

test('TYPE_META covers every workbench data type used by tools', () => {
  const usedTypes = [
    'plate-layout', 'sample-list', 'conc-data',
    'qpcr-results', 'seeding-plan', 'protocol', 'generic',
  ];
  usedTypes.forEach((t) => {
    assert.ok(ctx.wbTypes[t], `TYPE_META entry for ${t}`);
    assert.ok(ctx.wbTypes[t].icon, `icon for ${t}`);
    assert.ok(ctx.wbTypes[t].label, `label for ${t}`);
    assert.ok(ctx.wbTypes[t].color, `color for ${t}`);
  });
});

test('labtoolsRegisterTestHooks is exposed and registers under __labtoolsTestHooks', () => {
  assert.equal(typeof ctx.labtoolsRegisterTestHooks, 'function');
  const hooks = { serialize: () => ({}), apply: () => {} };
  ctx.labtoolsRegisterTestHooks('unit-test-tool', hooks);
  // registration mutates window.__labtoolsTestHooks (the sandbox copy is a
  // load-time snapshot, so assert on the window shim the function writes to)
  assert.equal(ctx.window.__labtoolsTestHooks['unit-test-tool'], hooks);
});

test('workbench API surface is present (methods exist on the object)', () => {
  const methods = [
    'put', 'getAll', 'getByType', 'getItem', 'findByName',
    'remove', 'clear', 'updateLabel', 'exportJSON', 'importJSON', 'onChange',
  ];
  methods.forEach((m) => {
    assert.equal(typeof ctx.workbench[m], 'function', `workbench.${m} is a function`);
  });
});

test('exportJSON envelope shape (validated via a stub getAll)', async () => {
  // Monkey-patch getAll to return sample items, then check envelope.
  const original = ctx.workbench.getAll;
  ctx.workbench.getAll = () => Promise.resolve([
    { id: 'a', type: 'conc-data', label: 'X', tool: 'bca-assay', timestamp: 1, data: { results: [] } },
  ]);
  try {
    const json = await ctx.workbench.exportJSON();
    const parsed = JSON.parse(json);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].label, 'X');
    assert.ok(typeof parsed.exportedAt === 'string');
  } finally {
    ctx.workbench.getAll = original;
  }
});

test('importJSON rejects malformed input', async () => {
  await assert.rejects(() => ctx.workbench.importJSON('{not json'));
  await assert.rejects(() => ctx.workbench.importJSON('{"foo": 1}'));
  await assert.rejects(() => ctx.workbench.importJSON('{"items": "nope"}'));
});
