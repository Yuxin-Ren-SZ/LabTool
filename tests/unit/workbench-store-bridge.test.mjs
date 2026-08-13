/**
 * Bridge tests: workbench.js delegating to the shared storage core
 * (assets/js/labtools-store.js) via the getStore() bridge.
 * Run: node --test tests/unit/
 *
 * labtools-types.js → labtools-store.js → labtools-workbench.js are loaded
 * into ONE VM context (vm.runInContext, same trick as workflow.test.mjs),
 * mirroring a page that loads the three scripts in order. The store backend
 * is injected through the workbench's test injection point
 * (window.__labtoolsWorkbenchBackend = labtools.store.createMemoryBackend()),
 * so every store operation runs against the in-memory backend — if the
 * fallback path were hit instead, put() would reject (no indexedDB in the
 * shim), which the first test's success proves is not the case.
 *
 * Cross-realm note: objects created inside the VM have the sandbox realm's
 * prototypes, so comparisons use JSON serialization (deepEqualJson / string
 * checks) rather than instanceof or Object.keys identity.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserJs, deepEqualJson } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadBridgeContext() {
  const ctx = loadBrowserJs('assets/js/labtools-types.js');
  vm.runInContext(
    readFileSync(join(ROOT, 'assets/js/labtools-store.js'), 'utf8'),
    ctx,
    { filename: 'assets/js/labtools-store.js' },
  );
  vm.runInContext(
    readFileSync(join(ROOT, 'assets/js/labtools-workbench.js'), 'utf8'),
    ctx,
    { filename: 'assets/js/labtools-workbench.js' },
  );
  // Test injection point: route the workbench's store through the in-memory
  // backend (set before the first store operation; getStore() reads it lazily).
  ctx.window.__labtoolsWorkbenchBackend = ctx.window.labtools.store.createMemoryBackend();
  return ctx;
}

const ctx = loadBridgeContext();
const workbench = ctx.window.workbench;
const storeApi  = ctx.window.labtools.store;

const VALID_PROTOCOL = {
  steps: [{ solution: 'A', durationMin: 1, durationSec: 0, slot: '1' }],
};
const INVALID_PROTOCOL = { steps: [{ solution: 'A' }] }; // missing required step fields
const VALID_SAMPLE_LIST = { samples: [{ name: 'S1', conc: 100, unit: 'ng/µL' }] };

const LEGACY_KEYS = ['data', 'id', 'label', 'metadata', 'timestamp', 'tool', 'type'];

// ── ① put → store path: id returned, byte-compatible record (no v2 timestamps)

test('put valid protocol returns id; getAll sees one item; no createdAt/updatedAt injected', async () => {
  const id = await workbench.put('protocol', 'P1', VALID_PROTOCOL, { wellCount: 4 }, 'stain-timer');
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 0);
  // put resolving at all proves the store path is active — the inline fallback
  // would reject here (the VM shim has no indexedDB).
  assert.equal(typeof storeApi.createStore, 'function');

  const all = await workbench.getAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, id);
  assert.equal(all[0].type, 'protocol');
  assert.equal(all[0].label, 'P1');
  assert.equal(all[0].tool, 'stain-timer');
  assert.equal(all[0].metadata.wellCount, 4);
  assert.ok(deepEqualJson(all[0].data, VALID_PROTOCOL));
  assert.equal(typeof all[0].timestamp, 'number');
  // byte-compat: timestamps:false → no v2 timestamp fields on the record
  assert.equal(JSON.stringify(all[0]).includes('createdAt'), false);
  assert.equal(JSON.stringify(all[0]).includes('updatedAt'), false);
  assert.ok(deepEqualJson(Object.keys(all[0]).sort(), LEGACY_KEYS));
});

// ── ② lookups + rename

test('getByType / getItem / findByName work; updateLabel refreshes label+timestamp, keeps shape', async () => {
  await workbench.clear();
  const id1 = await workbench.put('protocol', 'P1', VALID_PROTOCOL, {}, 'stain-timer');
  const id2 = await workbench.put('sample-list', 'S1', VALID_SAMPLE_LIST, {}, 'seeding-calc');

  // getByType filters by type
  const protocols = await workbench.getByType('protocol');
  assert.equal(protocols.length, 1);
  assert.equal(protocols[0].id, id1);
  const samples = await workbench.getByType('sample-list');
  assert.equal(samples.length, 1);
  assert.equal(samples[0].id, id2);

  // getItem by id / missing
  const item = await workbench.getItem(id1);
  assert.ok(item);
  assert.equal(item.id, id1);
  assert.ok(deepEqualJson(item.data, VALID_PROTOCOL));
  assert.equal(await workbench.getItem('missing-id'), null);

  // findByName exact match / missing
  const found = await workbench.findByName('P1');
  assert.ok(found);
  assert.equal(found.id, id1);
  assert.equal(await workbench.findByName('nope'), null);

  // duplicate labels — findByName returns the first match
  await workbench.put('protocol', 'Dup', VALID_PROTOCOL, {}, 'stain-timer');
  await workbench.put('sample-list', 'Dup', VALID_SAMPLE_LIST, {}, 'seeding-calc');
  const dup = await workbench.findByName('Dup');
  assert.ok(dup, 'duplicate label resolves');
  assert.equal(dup.type, 'protocol', 'first inserted match wins');

  // updateLabel refreshes label + timestamp, record shape unchanged
  const before = item.timestamp;
  await workbench.updateLabel(id1, 'P1-renamed');
  const renamed = await workbench.getItem(id1);
  assert.equal(renamed.label, 'P1-renamed');
  assert.ok(renamed.timestamp >= before, 'timestamp refreshed');
  assert.equal(JSON.stringify(renamed).includes('createdAt'), false);
  assert.equal(JSON.stringify(renamed).includes('updatedAt'), false);
  assert.ok(deepEqualJson(Object.keys(renamed).sort(), LEGACY_KEYS));

  // missing id rejects with the exact legacy message
  await assert.rejects(() => workbench.updateLabel('missing-id', 'x'), /Item not found/);
});

// ── ③ strict validation unchanged on the store path

test('put invalid payload rejects with strict-mode schema violation message', async () => {
  const before = await workbench.getAll();
  const err = await workbench.put('protocol', 'Bad', INVALID_PROTOCOL, {}, 'stain-timer')
    .then(() => null, (e) => e);
  assert.ok(err && typeof err.message === 'string');
  assert.match(err.message, /schema violation/);
  assert.match(err.message, /^Invalid protocol data — \d+ schema violation\(s\):/);
  // nothing was written
  assert.equal((await workbench.getAll()).length, before.length);
});

// ── ④ onChange event bridge + unsubscribe

test('onChange receives put/update/remove/clear; unsubscribe stops delivery', async () => {
  await workbench.clear();
  const events = [];
  const unsubscribe = workbench.onChange((e) => events.push(e));

  const id = await workbench.put('protocol', 'Evt', VALID_PROTOCOL, {}, 'stain-timer');
  await workbench.updateLabel(id, 'Evt-2');
  await workbench.remove(id);
  await workbench.clear();

  assert.equal(events.map((e) => e.action).join(','), 'put,update,remove,clear');
  assert.equal(events[0].item.id, id);
  assert.equal(events[0].item.label, 'Evt');
  assert.equal(events[1].item.label, 'Evt-2');
  assert.equal(events[2].item.id, id);
  assert.equal(events[3].item, null);

  unsubscribe();
  const before = events.length;
  await workbench.put('protocol', 'Silent', VALID_PROTOCOL, {}, 'stain-timer');
  assert.equal(events.length, before, 'no events after unsubscribe');
  await workbench.clear();
});

// ── ⑤ export envelope → clear → import round-trip (imported=1, re-import skipped=1)

test('exportJSON envelope; clear then importJSON round-trips (imported=1) and re-import skips', async () => {
  await workbench.clear();
  const id = await workbench.put('protocol', 'Exp', VALID_PROTOCOL, { a: 1 }, 'stain-timer');

  const json = await workbench.exportJSON();
  const parsed = JSON.parse(json);
  assert.equal(parsed.version, 1);
  assert.ok(typeof parsed.exportedAt === 'string');
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].id, id);
  assert.equal(parsed.items[0].label, 'Exp');

  await workbench.clear();
  assert.equal((await workbench.getAll()).length, 0);

  const first = await workbench.importJSON(json);
  assert.equal(first.imported, 1);
  assert.equal(first.skipped, 0);
  assert.equal((await workbench.getAll()).length, 1);
  const restored = await workbench.findByName('Exp');
  assert.ok(restored);
  assert.ok(deepEqualJson(restored.data, VALID_PROTOCOL));

  // same export again → duplicate ids skipped
  const second = await workbench.importJSON(json);
  assert.equal(second.imported, 0);
  assert.equal(second.skipped, 1);
});

// ── ⑥ remove leaves the store empty

test('remove deletes the item and getAll returns empty', async () => {
  await workbench.clear();
  const id = await workbench.put('protocol', 'Del', VALID_PROTOCOL, {}, 'stain-timer');
  assert.equal((await workbench.getAll()).length, 1);

  await workbench.remove(id);
  assert.equal((await workbench.getAll()).length, 0);
  assert.equal(await workbench.getItem(id), null);
});

// ── ⑦ v2 record envelope: labtoolsLegacyToV2Record pure mapping ───────────────

test('labtoolsLegacyToV2Record maps a legacy item to the v2 record envelope', () => {
  const map = ctx.window.labtoolsLegacyToV2Record;
  assert.equal(typeof map, 'function');

  const item = {
    id: 'rec-1', type: 'plate-layout', label: 'Layout A',
    tool: 'microplate-layout-planner', timestamp: 123456,
    data: { wells: ['A1'] }, metadata: { wellCount: 96 },
  };
  const rec = map(item);
  assert.equal(rec.id, 'rec-1');
  assert.equal(rec.kind, 'legacy');
  assert.equal(rec.tool, 'microplate-layout-planner');
  assert.equal(rec.contract, 'plate-layout');   // contract = type
  assert.equal(rec.label, 'Layout A');
  assert.equal(rec.schemaVersion, 2);
  assert.ok(deepEqualJson(rec.payload, { wells: ['A1'] }));  // payload = data
  assert.ok(deepEqualJson(rec.meta, { wellCount: 96 }));     // meta = metadata
  assert.equal(rec.createdAt, 123456);          // createdAt = timestamp
  assert.equal(rec.updatedAt, 123456);          // updatedAt = timestamp

  // fallbacks: missing tool / metadata / timestamp
  const before = Date.now();
  const bare = map({ id: 'rec-2', type: 'sample-list', label: 'S', data: 42 });
  assert.equal(bare.tool, '');
  assert.equal(bare.contract, 'sample-list');
  assert.equal(bare.meta, null);
  assert.equal(bare.payload, 42);
  assert.ok(bare.createdAt >= before && bare.createdAt <= Date.now());
  assert.equal(bare.updatedAt, bare.createdAt);
});

// ── ⑧ v2 upgrade creates the records store; copyLegacyToRecords copies
//      legacy items losslessly and is idempotent ───────────────────────────────

test('records store created by upgrade; copyLegacyToRecords copies 2 legacy items losslessly and idempotently', async () => {
  await workbench.clear();
  const id1 = await workbench.put('protocol', 'P1', VALID_PROTOCOL, { wellCount: 4 }, 'stain-timer');
  const id2 = await workbench.put('sample-list', 'S1', VALID_SAMPLE_LIST, { unit: 'ng/µL' }, 'seeding-calc');

  const v2 = ctx.window.__labtoolsV2Records;
  assert.ok(v2 && typeof v2.copyLegacyToRecords === 'function');

  const first = await v2.copyLegacyToRecords();
  assert.equal(first.copied, 2);
  assert.equal(first.existing, 0);

  // idempotent: second call copies nothing
  const second = await v2.copyLegacyToRecords();
  assert.equal(second.copied, 0);
  assert.equal(second.existing, 2);

  // records store exists and is writable — reopen it on the same backend
  const records = ctx.window.labtools.store.createStore({
    dbName: 'labtools-workbench', version: 2, storeName: 'records',
    backend: ctx.window.__labtoolsWorkbenchBackend,
  });
  const all = await records.getAll({ index: null });
  assert.equal(all.length, 2);
  const rec1 = all.find((r) => r.id === id1);
  const rec2 = all.find((r) => r.id === id2);
  assert.ok(rec1, 'record for id1 exists');
  assert.ok(rec2, 'record for id2 exists');
  assert.equal(rec1.kind, 'legacy');
  assert.equal(rec1.contract, 'protocol');
  assert.equal(rec1.tool, 'stain-timer');
  assert.equal(rec1.label, 'P1');
  assert.equal(rec1.schemaVersion, 2);
  assert.equal(rec1.meta.wellCount, 4);
  assert.ok(deepEqualJson(rec1.payload, VALID_PROTOCOL));
  assert.equal(rec2.kind, 'legacy');
  assert.ok(deepEqualJson(rec2.payload, VALID_SAMPLE_LIST));

  // lossless: payload === legacy data; timestamps === legacy timestamp
  const item1 = await workbench.getItem(id1);
  assert.ok(deepEqualJson(rec1.payload, item1.data));
  assert.equal(rec1.createdAt, item1.timestamp);
  assert.equal(rec1.updatedAt, item1.timestamp);
});

// ── ⑨ legacy workbench API unaffected by the v2 records copy ──────────────────

test('copyLegacyToRecords does not change the legacy workbench API surface', async () => {
  await workbench.clear();
  await workbench.put('protocol', 'P3', VALID_PROTOCOL, {}, 'stain-timer');
  await workbench.put('sample-list', 'S3', VALID_SAMPLE_LIST, {}, 'seeding-calc');
  await ctx.window.__labtoolsV2Records.copyLegacyToRecords();

  const all = await workbench.getAll();
  assert.equal(all.length, 2);
  all.forEach((item) => {
    // legacy shape only — no v2 createdAt/updatedAt injected on items
    assert.equal(JSON.stringify(item).includes('createdAt'), false);
    assert.equal(JSON.stringify(item).includes('updatedAt'), false);
    assert.ok(deepEqualJson(Object.keys(item).sort(), LEGACY_KEYS));
  });
});
