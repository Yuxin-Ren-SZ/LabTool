/**
 * Desktop smoke suite — launches the real Electron shell and loads the hub plus
 * every tool page under tools/, asserting the app:// shell serves them cleanly.
 *
 * Run from desktop/: `npm test` (or `node --test tests/*.test.mjs`).
 * Playwright's `_electron` drives the electron binary from node_modules;
 * no separate browser download is required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const DESKTOP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_ROOT = join(DESKTOP_DIR, '..');
const PKG = JSON.parse(readFileSync(join(DESKTOP_DIR, 'package.json'), 'utf8'));

const TOOLS = readdirSync(join(WEB_ROOT, 'tools'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

test(`hub + ${TOOLS.length} tools load in the desktop shell without errors`, async () => {
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: DESKTOP_DIR,
    env: {
      ...process.env,
      // Restricted-environment accommodations (see src/main.js): Chromium cannot
      // self-sandbox or write to ~/Library/Application Support inside the DSH
      // sandbox; keep all app data inside the workspace for the test run.
      LABTOOLS_NO_SANDBOX: '1',
      LABTOOLS_DISABLE_GPU: '1',
      LABTOOLS_USER_DATA_DIR: join(DESKTOP_DIR, '.test-user-data'),
    },
  });
  const page = await electronApp.firstWindow();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err}`));

  try {
    // Preload bridge is live and reports the expected versions.
    const versions = await page.evaluate(() => window.labtoolsDesktop.getVersions());
    assert.equal(versions.app, PKG.version, 'preload bridge reports app version');
    assert.match(versions.electron, /^\d+\./, 'preload bridge reports electron version');

    // 1. Hub
    await page.goto('app://bundle/index.html');
    await page.waitForLoadState('domcontentloaded');
    assert.match(page.url(), /^app:\/\/bundle\/index\.html/, 'hub served over app://');
    assert.match(await page.title(), /LabTools/i, 'hub has a title');
    const hubText = await page.evaluate(() => document.body.innerText.length);
    assert.ok(hubText > 100, `hub renders content (${hubText} chars)`);
    assert.deepEqual(errors, [], 'hub console is clean');

    // 2. Every tool page
    for (const tool of TOOLS) {
      errors.length = 0;
      await page.goto(`app://bundle/tools/${tool}/index.html`);
      await page.waitForLoadState('domcontentloaded');
      const state = await page.evaluate(() => ({
        title: document.title,
        textLen: document.body ? document.body.innerText.length : 0,
        runtimeAlert: Boolean(document.querySelector('.lt-alert-error')),
      }));
      assert.ok(state.title, `${tool}: page has a title`);
      assert.ok(state.textLen > 20, `${tool}: page renders content`);
      assert.equal(state.runtimeAlert, false, `${tool}: no runtime self-check banner`);
      assert.deepEqual(errors, [], `${tool}: console is clean`);
    }
  } finally {
    await electronApp.close();
  }
});
