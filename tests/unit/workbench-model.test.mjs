/**
 * Unit tests for the workbench data model — storage core with a memory backend
 * (real IndexedDB / BroadcastChannel are exercised by the browser e2e harness).
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadBrowserJs } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Load types.js first, then run store.js and workbench.js in the SAME vm
// context (workbench requires labtools.store — single storage path, phase 5),
// and inject a memory backend so the store core is exercised in Node.
const ctx = loadBrowserJs('assets/js/labtools-types.js', ['DATA_TYPES']);
vm.runInContext(readFileSync(join(ROOT, 'assets/js/labtools-store.js'), 'utf8'), ctx, {
  filename: 'labtools-store.js',
});
vm.runInContext(readFileSync(join(ROOT, 'assets/js/labtools-workbench.js'), 'utf8'), ctx, {
  filename: 'labtools-workbench.js',
});
ctx.window.__labtoolsWorkbenchBackend = ctx.window.labtools.store.createMemoryBackend();
const wb = ctx.window;

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

  // valid payload stores through the memory backend
  const valid = await wb.workbench.put('protocol', 'Good', {
    steps: [{ solution: 'A', durationMin: 1, durationSec: 0, slot: '1' }],
  });
  assert.equal(typeof valid, 'string');
});

test('labtoolsRegisterTestHooks is exposed and registers under __labtoolsTestHooks', () => {
  assert.equal(typeof wb.labtoolsRegisterTestHooks, 'function');
  const hooks = { serialize: () => ({}), apply: () => {} };
  wb.labtoolsRegisterTestHooks('unit-test-tool', hooks);
  assert.equal(wb.__labtoolsTestHooks['unit-test-tool'], hooks);
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

test('workbench requires labtools-store.js (no fallback in phase 5)', () => {
  // A second context WITHOUT store.js must make operations fail loudly.
  const bare = loadBrowserJs('assets/js/labtools-types.js', ['DATA_TYPES']);
  vm.runInContext(readFileSync(join(ROOT, 'assets/js/labtools-workbench.js'), 'utf8'), bare, {
    filename: 'labtools-workbench.js',
  });
  bare.window.DATA_TYPES = ctx.DATA_TYPES;
  bare.window.validateWorkbenchType = ctx.validateWorkbenchType;
  assert.throws(
    () => bare.window.workbench.getAll(),
    (e) => /labtools-store\.js required/.test(String(e && e.message)),
    'operations must throw when labtools-store.js is missing',
  );
});
