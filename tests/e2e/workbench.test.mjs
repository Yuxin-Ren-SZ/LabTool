/**
 * Workbench flows — exercised against the REAL in-browser IndexedDB workbench
 * (not the node vm shim used by tests/unit/workbench-model.test.mjs), so the
 * actual storage + strict-validation path is covered.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { boot, teardown, withTool } from './harness.mjs';

before(boot);
after(teardown);

// The workbench is auto-injected on every tool page; use one as the host.
const HOST = 'microplate-layout-planner';

async function clean(page) {
  await page.evaluate(async () => { try { await window.workbench.clear(); } catch {} });
}

test('workbench: put / findByName / getByType / remove', async () => {
  await withTool(HOST, async (page) => {
    await clean(page);
    const result = await page.evaluate(async () => {
      const id = await window.workbench.put('generic', 'crud-item', { hello: 'world' }, {}, 'e2e');
      const found = await window.workbench.findByName('crud-item');
      const byType = await window.workbench.getByType('generic');
      await window.workbench.remove(id);
      const after = await window.workbench.findByName('crud-item');
      return { id, foundId: found && found.id, byType: byType.length, removed: after === null };
    });
    assert.equal(result.foundId, result.id);
    assert.ok(result.byType >= 1);
    assert.ok(result.removed);
  });
});

test('workbench: export → clear → import round-trip', async () => {
  await withTool(HOST, async (page) => {
    await clean(page);
    const result = await page.evaluate(async () => {
      await window.workbench.put('generic', 'export-item', { n: 42 }, {}, 'e2e');
      const json = await window.workbench.exportJSON();
      const exported = JSON.parse(json).items.length;
      await window.workbench.clear();
      const emptyBefore = (await window.workbench.getAll()).length;
      const imp = await window.workbench.importJSON(json);
      const restored = await window.workbench.findByName('export-item');
      await window.workbench.clear();
      return { exported, emptyBefore, imported: imp.imported, restored: !!restored };
    });
    assert.ok(result.exported > 0);
    assert.equal(result.emptyBefore, 0);
    assert.ok(result.imported > 0);
    assert.ok(result.restored);
  });
});

test('workbench: strict put() rejects invalid, accepts valid', async () => {
  await withTool(HOST, async (page) => {
    await clean(page);
    const result = await page.evaluate(async () => {
      const rejected = await window.workbench
        .put('protocol', 'bad', { steps: [{ solution: 'X' }] })
        .then(() => null, (e) => e.message);
      const acceptedId = await window.workbench
        .put('protocol', 'good', { steps: [{ solution: 'Fix', durationMin: 10, durationSec: 0, slot: '1' }] })
        .then((id) => id, () => null);
      if (acceptedId) await window.workbench.remove(acceptedId);
      return { rejected, accepted: !!acceptedId };
    });
    assert.match(result.rejected || '', /schema violation/, 'invalid payload must be rejected');
    assert.ok(result.accepted, 'valid payload must be accepted');
  });
});
