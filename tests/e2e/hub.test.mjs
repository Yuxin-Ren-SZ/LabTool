/**
 * Hub page (manifest-driven) — cards render from labtools-hub-config.js,
 * search filters, workflow chains and session sections exist.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, teardown, openRaw, waitFor } from './harness.mjs';

before(boot);
after(teardown);

async function openHub(t) {
  const { page, errors } = await openRaw('/');
  t.after(() => page.close());
  await waitFor(page, () => document.querySelectorAll('#toolGroups .tool-card').length === 11);
  return { page, errors };
}

test('hub: renders all 11 tool cards grouped by category', async (t) => {
  const { page, errors } = await openHub(t);
  const groups = await page.$$eval('#toolGroups .tool-group .lt-section-label', (els) => els.map((e) => e.textContent));
  assert.ok(groups.includes('Cell Culture') && groups.includes('Molecular / qPCR') &&
    groups.includes('Assays & Protein') && groups.includes('Lab Ops'), 'categories present');
  const links = await page.$$eval('#toolGroups .tool-card', (els) => els.map((e) => e.getAttribute('href')));
  assert.ok(links.includes('tools/cell-count/index.html') && links.includes('tools/label-generator/index.html'));
  assert.deepEqual(errors, []);
});

test('hub: search filters cards and hides empty groups', async (t) => {
  const { page } = await openHub(t);
  await page.type('#toolSearch', 'BCA');
  await waitFor(page, () => Array.prototype.filter.call(document.querySelectorAll('#toolGroups .tool-card'), (c) => !c.hidden).length === 1);
  const visible = await page.$$eval('#toolGroups .tool-card', (els) => els.filter((c) => !c.hidden).map((c) => c.querySelector('.tool-card-name').textContent));
  assert.equal(visible[0], 'BCA Assay Calculator');
  const visibleGroups = await page.$$eval('#toolGroups .tool-group', (els) => els.filter((g) => !g.hidden).length);
  assert.equal(visibleGroups, 1, 'only the matching group stays visible');
});

test('hub: workflow chains and sessions sections are wired', async (t) => {
  const { page } = await openHub(t);
  const chainRows = await page.$$eval('#hubChains .chain-row', (els) => els.length);
  assert.ok(chainRows >= 4, 'chain rows rendered from LABTOOLS_HUB_CHAINS');
  const chainLinks = await page.$$eval('#hubChains .chain-link', (els) => els.map((a) => a.getAttribute('href')));
  assert.ok(chainLinks.includes('tools/qpcr-analysis/index.html'), 'chain links point at tool pages');
  const sessionsEl = await page.$('#hubSessions');
  assert.ok(sessionsEl, 'sessions section exists');
});
