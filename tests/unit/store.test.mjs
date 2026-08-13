/**
 * Unit tests for the shared storage core (assets/js/labtools-store.js).
 * Run: node --test tests/unit/
 *
 * The store is exercised entirely through createMemoryBackend() — an
 * in-memory backend with IDB-shaped open/upgrade/transaction semantics —
 * so migrations, index lookups, and CRUD are all unit-testable without a
 * browser. Loading the file with no `indexedDB` global (helpers.mjs sets
 * indexedDB: undefined) must not throw — verified by the first test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserJs, deepEqualJson } from './helpers.mjs';

const ctx = loadBrowserJs('assets/js/labtools-store.js');
const { createStore, createMemoryBackend, newRecord } = ctx.labtools.store;

/** Fresh store with the timestamp index plus label/kind indexes for queries. */
function makeStore(extra) {
  return createStore(Object.assign({
    backend: createMemoryBackend(),
    indexes: [
      { name: 'timestamp', keyPath: 'timestamp' },
      { name: 'label', keyPath: 'label' },
      { name: 'kind', keyPath: 'kind' },
    ],
  }, extra || {}));
}

// ── Module load / API surface ─────────────────────────────────────────────────

test('store module loads without indexedDB and exposes labtools.store', () => {
  assert.equal(typeof createStore, 'function');
  assert.equal(typeof createMemoryBackend, 'function');
  assert.equal(typeof newRecord, 'function');
  // load-order marker recorded for labtools-runtime's checkLoadOrder
  assert.equal(ctx.__labtoolsLoadOrder.join(','), 'labtools-store');
});

// ── put / get ─────────────────────────────────────────────────────────────────

test('put/get round-trip with automatic createdAt/updatedAt', async () => {
  const store = makeStore();
  const before = Date.now();

  const stored = await store.put({
    id: 'r1', kind: 'result', tool: 't', contract: 'c', label: 'L', payload: { x: 1 },
  });
  assert.equal(stored.id, 'r1');
  assert.ok(stored.createdAt >= before && stored.createdAt <= Date.now());
  assert.ok(stored.updatedAt >= before && stored.updatedAt <= Date.now());

  const got = await store.get('r1');
  assert.equal(got.id, 'r1');
  assert.equal(got.payload.x, 1);
  assert.equal(got.createdAt, stored.createdAt);
  assert.equal(got.updatedAt, stored.updatedAt);

  assert.equal(await store.get('missing'), null);
});

// ── validator ─────────────────────────────────────────────────────────────────

test('validator rejects invalid put without writing', async () => {
  const store = createStore({
    backend: createMemoryBackend(),
    validator: (r) => (r.kind === 'result'
      ? { valid: true, errors: [] }
      : { valid: false, errors: ['bad kind: ' + r.kind] }),
  });

  await assert.rejects(() => store.put({ id: 'x', kind: 'session' }),
    /store put rejected: bad kind: session/);
  assert.equal(await store.get('x'), null);

  const ok = await store.put({ id: 'y', kind: 'result' });
  assert.equal(ok.id, 'y');
});

// ── update ────────────────────────────────────────────────────────────────────

test('update merges patch, preserves id/createdAt, refreshes updatedAt, rejects missing id', async () => {
  const store = makeStore();
  await store.put({ id: 'u1', kind: 'result', label: 'old', payload: { a: 1 }, createdAt: 100, updatedAt: 100 });

  await assert.rejects(() => store.update('nope', { label: 'x' }), /not found/);

  const updated = await store.update('u1', { label: 'new', payload: { b: 2 } });
  assert.equal(updated.label, 'new');
  assert.ok(deepEqualJson(updated.payload, { b: 2 }));
  assert.equal(updated.createdAt, 100);           // createdAt untouched
  assert.ok(updated.updatedAt >= 100);            // refreshed

  // patch cannot rewrite id/createdAt
  await store.update('u1', { id: 'other', createdAt: 1, label: 'z' });
  const got = await store.get('u1');
  assert.equal(got.id, 'u1');
  assert.equal(got.createdAt, 100);
  assert.equal(got.label, 'z');
});

// ── timestamps: false (legacy byte-compat mode) ───────────────────────────────

test('timestamps:false stores records byte-compatible (no createdAt/updatedAt injection)', async () => {
  const store = makeStore({ timestamps: false });

  // put injects neither timestamp field
  const stored = await store.put({ id: 'ts1', kind: 'result', label: 'L', payload: { x: 1 } });
  assert.equal(JSON.stringify(stored).includes('createdAt'), false);
  assert.equal(JSON.stringify(stored).includes('updatedAt'), false);
  const got = await store.get('ts1');
  assert.equal(JSON.stringify(got).includes('createdAt'), false);
  assert.equal(JSON.stringify(got).includes('updatedAt'), false);

  // update does not inject updatedAt either
  const updated = await store.update('ts1', { label: 'L2' });
  assert.equal(JSON.stringify(updated).includes('updatedAt'), false);
  assert.equal(updated.label, 'L2');

  // upsert neither refreshes an existing record nor injects timestamps on create
  const hit = await store.upsert({ field: 'label', value: 'L2' }, { label: 'L3' });
  assert.equal(hit.id, 'ts1');
  assert.equal(JSON.stringify(hit).includes('updatedAt'), false);
  const created = await store.upsert({ field: 'label', value: 'fresh' }, { kind: 'result', label: 'fresh' });
  assert.equal(JSON.stringify(created).includes('createdAt'), false);
  assert.equal(JSON.stringify(created).includes('updatedAt'), false);

  // caller-provided timestamps are preserved byte-for-byte, never refreshed
  const legacy = await store.put({ id: 'ts2', kind: 'legacy', timestamp: 123, createdAt: 1, updatedAt: 2 });
  assert.equal(legacy.timestamp, 123);
  assert.equal(legacy.createdAt, 1);
  assert.equal(legacy.updatedAt, 2);
  const legacyUpdated = await store.update('ts2', { label: 'legacy2' });
  assert.equal(legacyUpdated.updatedAt, 2);
  assert.equal(legacyUpdated.createdAt, 1);
});

// ── upsert ────────────────────────────────────────────────────────────────────

test('upsert merges on hit (preserving id/createdAt) and creates on miss', async () => {
  const store = makeStore();
  await store.put({
    id: 's1', kind: 'result', tool: 'a', contract: 'c1', label: 'dup',
    payload: { n: 1 }, createdAt: 42, updatedAt: 42,
  });

  const merged = await store.upsert({ field: 'label', value: 'dup' },
    { id: 'different-id', kind: 'result', tool: 'b', label: 'dup', payload: { n: 2 } });
  assert.equal(merged.id, 's1');        // id preserved on hit
  assert.equal(merged.createdAt, 42);   // createdAt preserved on hit
  assert.equal(merged.tool, 'b');
  assert.equal(merged.payload.n, 2);
  assert.equal(merged.label, 'dup');
  assert.equal((await store.getAll({ index: null, direction: 'next' })).length, 1); // no duplicate

  const created = await store.upsert({ field: 'label', value: 'nope' }, { kind: 'result', label: 'nope' });
  assert.ok(typeof created.id === 'string' && created.id.length > 0); // uuid filled
  assert.ok(created.createdAt > 0);
  assert.equal(created.label, 'nope');
  assert.equal(created.id, (await store.get(created.id)).id);
});

// ── getAll ────────────────────────────────────────────────────────────────────

test('getAll defaults to timestamp descending; next direction ascends; missing field sorts as 0', async () => {
  const store = makeStore();
  await store.put({ id: 't1', timestamp: 100, label: 'old' });
  await store.put({ id: 't2', timestamp: 300, label: 'newest' });
  await store.put({ id: 't3', timestamp: 200, label: 'mid' });

  const desc = await store.getAll();
  assert.equal(desc.map((r) => r.id).join(','), 't2,t3,t1');

  const asc = await store.getAll({ direction: 'next' });
  assert.equal(asc.map((r) => r.id).join(','), 't1,t3,t2');

  // records missing the sorted field are treated as 0 → last in desc order
  await store.put({ id: 't4', label: 'no-ts' });
  const desc2 = await store.getAll();
  assert.equal(desc2.map((r) => r.id).join(','), 't2,t3,t1,t4');
});

// ── getByIndex ────────────────────────────────────────────────────────────────

test('getByIndex exact matching', async () => {
  const store = makeStore();
  await store.put({ id: 'i1', kind: 'result', tool: 'a' });
  await store.put({ id: 'i2', kind: 'result', tool: 'b' });
  await store.put({ id: 'i3', kind: 'snapshot', tool: 'a' });

  const results = await store.getByIndex('kind', 'result');
  assert.equal(results.length, 2);
  assert.equal(results.map((r) => r.id).sort().join(','), 'i1,i2');

  const snap = await store.getByIndex('kind', 'snapshot');
  assert.equal(snap.length, 1);
  assert.equal(snap[0].id, 'i3');

  assert.equal((await store.getByIndex('kind', 'session')).length, 0);
});

// ── query ─────────────────────────────────────────────────────────────────────

test('query filters exactly by kind/tool/contract/label', async () => {
  const store = makeStore();
  await store.put({ id: 'q1', kind: 'result', tool: 'a', contract: 'c1', label: 'L1' });
  await store.put({ id: 'q2', kind: 'result', tool: 'b', contract: 'c1', label: 'L2' });
  await store.put({ id: 'q3', kind: 'snapshot', tool: 'a', contract: 'c2', label: 'L3' });

  assert.equal((await store.query({ kind: 'result' })).length, 2);
  assert.equal((await store.query({ kind: 'result', tool: 'a' }))[0].id, 'q1');
  assert.equal((await store.query({ contract: 'c1' })).length, 2);
  assert.equal((await store.query({ label: 'L3' }))[0].id, 'q3');
  assert.equal((await store.query({})).length, 3);
  assert.equal((await store.query({ tool: 'zzz' })).length, 0);
});

// ── export / import ───────────────────────────────────────────────────────────

test('exportJSON → clear → importJSON round-trip with duplicate skipping', async () => {
  const store = makeStore();
  await store.put({ id: 'e1', kind: 'result', tool: 'a', payload: { v: 1 }, createdAt: 10, updatedAt: 11 });
  await store.put({ id: 'e2', kind: 'snapshot', tool: 'b' });

  const exported = await store.exportJSON();
  assert.equal(exported.version, 1);
  assert.ok(typeof exported.exportedAt === 'string');
  assert.equal(exported.records.length, 2);

  await store.clear();
  assert.equal((await store.getAll({ index: null })).length, 0);

  const res = await store.importJSON(exported);
  assert.equal(res.imported, 2);
  assert.equal(res.skipped, 0);

  const all = await store.getAll({ index: null, direction: 'next' });
  assert.equal(all.length, 2);
  const e1 = all.find((r) => r.id === 'e1');
  assert.equal(e1.payload.v, 1);
  assert.equal(e1.createdAt, 10);   // timestamps preserved through import
  assert.equal(e1.updatedAt, 11);

  // duplicate ids are skipped on re-import
  const res2 = await store.importJSON(exported);
  assert.equal(res2.imported, 0);
  assert.equal(res2.skipped, 2);

  // shape validation
  await assert.rejects(() => store.importJSON({ foo: 1 }), /Invalid store export format/);
  await assert.rejects(() => store.importJSON('{not json'), /Invalid/);
  await assert.rejects(() => store.importJSON({ records: 'nope' }), /Invalid store export format/);
});

// ── migrations ────────────────────────────────────────────────────────────────

test('migrations run once each in ascending order and not again on reopen', async () => {
  const calls = [];
  const store = createStore({
    backend: createMemoryBackend(),
    version: 3,
    migrations: {
      2: (db) => { calls.push('fnA'); db.store('items').put({ id: 'mig-a', kind: 'legacy' }); },
      3: (db) => { calls.push('fnB'); db.store('items').put({ id: 'mig-b', kind: 'legacy' }); },
    },
  });

  await store.put({ id: 'x', kind: 'result' }); // triggers open + upgrade
  assert.deepEqual(calls, ['fnA', 'fnB']);

  const all = await store.getAll({ index: null, direction: 'next' });
  assert.equal(all.length, 3);
  assert.equal(all.map((r) => r.id).sort().join(','), 'mig-a,mig-b,x');

  // reopen at the same version must not re-run migrations
  await store.close();
  await store.put({ id: 'y', kind: 'result' });
  assert.deepEqual(calls, ['fnA', 'fnB']);
  assert.equal((await store.getAll({ index: null, direction: 'next' })).length, 4);
});

// ── onChange ──────────────────────────────────────────────────────────────────

test('onChange emits put/update/remove/clear and unsubscribe stops delivery', async () => {
  const store = makeStore();
  const events = [];
  const unsubscribe = store.onChange((e) => events.push(e));

  await store.put({ id: 'n1', kind: 'result', label: 'L1' });
  await store.update('n1', { label: 'L2' });
  const merged = await store.upsert({ field: 'label', value: 'L2' }, { id: 'ignored', kind: 'result', label: 'L3' });
  assert.equal(merged.id, 'n1'); // upsert hit → update event, id preserved
  await store.remove('n1');
  await store.clear();

  assert.equal(events.map((e) => e.action).join(','), 'put,update,update,remove,clear');
  assert.equal(events[0].record.id, 'n1');
  assert.equal(events[1].record.label, 'L2');
  assert.equal(events[2].record.label, 'L3');
  assert.equal(events[3].record.id, 'n1');
  assert.equal(events[4].record, null);

  unsubscribe();
  const before = events.length;
  await store.put({ id: 'n9', kind: 'result' });
  assert.equal(events.length, before);
});

// ── newRecord ─────────────────────────────────────────────────────────────────

test('newRecord fills defaults and honors custom id', () => {
  const r = newRecord({ kind: 'snapshot', tool: 'bca-assay', contract: 'conc-data', label: 'Run 1' });
  assert.match(r.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(r.kind, 'snapshot');
  assert.equal(r.tool, 'bca-assay');
  assert.equal(r.contract, 'conc-data');
  assert.equal(r.label, 'Run 1');
  assert.equal(r.schemaVersion, 2);
  assert.equal(Object.keys(r.payload).length, 0);
  assert.equal(r.meta, null);
  assert.ok(r.createdAt > 0);
  assert.equal(r.updatedAt, r.createdAt);

  const c = newRecord({ id: 'fixed-id' });
  assert.equal(c.id, 'fixed-id');
  assert.equal(c.kind, 'result');
  assert.equal(c.tool, '');
  assert.equal(c.contract, '');
  assert.equal(c.label, '');
  assert.equal(c.schemaVersion, 2);
  assert.equal(c.meta, null);

  const d = newRecord();
  assert.ok(d.id !== c.id, 'ids are unique');
  assert.equal(newRecord({}).schemaVersion, 2);
});
