/**
 * e2e: qPCR Plate Planner generates a schema-valid plate-layout in a real
 * browser, honours skip-exceptions, and enforces the reference-anchor invariant.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, teardown, withTool, callHook } from './harness.mjs';

before(boot);
after(teardown);

test('planner: default state produces a schema-valid plate-layout', async () => {
  await withTool('qpcr-plate-planner', async (page, errors) => {
    const layout = await callHook(page, 'qpcr-plate-planner', 'serialize');

    // Validate against the workbench registry in-page (authoritative check).
    const check = await page.evaluate((l) => validateWorkbenchType('plate-layout', l), layout);
    assert.equal(check.valid, true, 'plate-layout valid: ' + JSON.stringify(check.errors));

    // gene is a coloured category; sample/content are literal text.
    const geneField = layout.fields.find((f) => f.id === 'gene');
    assert.equal(geneField.kind, 'category');
    const names = (layout.categoriesByField.gene || []).map((c) => c.name);
    assert.ok(names.includes('HPRT1'), 'anchor gene present in categories');

    // Default: 3 samples, 4 genes → 2 plates; anchor on every plate.
    const st = await callHook(page, 'qpcr-plate-planner', 'state');
    assert.equal(st.samples, 3);
    assert.equal(st.genes, 4);
    assert.ok(st.plates >= 2);
    layout.plates.forEach((p) => {
      const geneCats = layout.categoriesByField.gene;
      const anchorId = geneCats.find((c) => c.name === 'HPRT1').id;
      const hasAnchor = Object.keys(p.assignments).some((w) => p.assignments[w].gene === anchorId);
      assert.ok(hasAnchor, p.name + ' carries the HPRT1 anchor');
    });

    assert.deepEqual(errors, [], 'no console/page errors');
  });
});

test('planner: clicking a combination excludes it (skip-exceptions)', async () => {
  await withTool('qpcr-plate-planner', async (page) => {
    const before = await page.$$eval('#combos .combo-chip.included', (els) => els.length);
    await page.click('#combos .combo-chip');   // first chip → exclude
    const after = await page.$$eval('#combos .combo-chip.included', (els) => els.length);
    assert.equal(after, before - 1, 'one fewer included combination');

    const st = await callHook(page, 'qpcr-plate-planner', 'state');
    assert.equal(st.samples, before - 1, 'excluded sample dropped from packing');
  });
});
