/**
 * e2e: the deep-link workflow handoff performs a real cross-page round trip —
 * click a button on the producer, land on the consumer, data is applied.
 *
 * Covers cell-count → seeding-calc, which exercises the identical
 * labtoolsHandoffTo / labtoolsConsumeHandoff path every other chain reuses. The
 * critical thing under test is durability: workbench.put must commit (IndexedDB
 * transaction.oncomplete) before navigation, or the destination loads empty.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, teardown, withTool } from './harness.mjs';

before(boot);
after(teardown);

test('cell-count → seeding-calc: hand off a counted concentration', async () => {
  await withTool('cell-count', async (page) => {
    // Enter a live count so the tool has a concentration to hand off.
    await page.evaluate(() => { document.getElementById('live1').value = '100'; });

    // Click "Save & continue to Seeding →" and follow the navigation.
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load' }),
      page.click('#wb-continue-seeding-btn'),
    ]);

    // We should now be on seeding-calc with ?wbLoad in the URL momentarily.
    assert.match(page.url(), /seeding-calc\/index\.html/);

    // The consumer auto-applies the sample-list into bypass concentration.
    await page.waitForFunction(() => {
      const el = document.getElementById('bypass-conc');
      return el && el.value && parseFloat(el.value) > 0;
    }, { timeout: 8000 });

    const conc = await page.$eval('#bypass-conc', (el) => parseFloat(el.value));
    assert.ok(conc > 0, 'handed-off concentration applied on seeding-calc');

    // The wbLoad param is stripped so a refresh does not re-apply.
    assert.ok(!/wbLoad/.test(page.url()), 'wbLoad param removed after apply');
  });
});
