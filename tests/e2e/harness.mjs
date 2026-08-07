/**
 * e2e harness — drives real tool pages in headless Chromium via puppeteer.
 *
 * Design goals (fixing the old tests/index.html):
 *   • deterministic waits: waitFor(predicate) instead of fixed setTimeout sleeps
 *   • authoritative snapshots: a mismatch ALWAYS fails (regenerable via
 *     UPDATE_SNAPSHOTS=1)
 *   • CI-gated: runs under `node --test`, non-zero exit on failure
 *
 * One browser + one static server is booted per test-file process (node --test
 * isolates files in separate processes). Call boot()/teardown() from each spec's
 * before()/after() hooks.
 */
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(HERE, '..', 'snapshots');
const FIXT_DIR = join(HERE, '..', 'fixtures');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

let _server = null;
let _browser = null;

export async function boot() {
  _server = await startServer();
  _browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

export async function teardown() {
  if (_browser) { await _browser.close(); _browser = null; }
  if (_server) { await _server.close(); _server = null; }
}

/** Read a fixture file from tests/fixtures/ as text. */
export function fixture(name) {
  return readFileSync(join(FIXT_DIR, name), 'utf8');
}
/** Read + parse a JSON fixture. */
export function fixtureJson(name) {
  return JSON.parse(fixture(name));
}

/**
 * Open a tool page, wait until its test hooks are registered, run fn(page),
 * then close the page. Fails if the page logged any error/pageerror.
 */
export async function withTool(tool, fn) {
  const page = await _browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // Ignore resource-load failures (e.g. a missing favicon) — not JS errors.
    if (/Failed to load resource/i.test(text)) return;
    errors.push('console.error: ' + text);
  });
  try {
    await page.goto(`${_server.baseURL}/tools/${tool}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(
      (t) => !!(window.__labtoolsTestHooks && window.__labtoolsTestHooks[t]),
      { timeout: 10000 }, tool,
    );
    return await fn(page, errors);
  } finally {
    await page.close();
  }
}

/** Call one of a tool's registered test hooks in-page; returns its result. */
export function callHook(page, tool, name, ...args) {
  return page.evaluate((t, n, a) => {
    const hooks = window.__labtoolsTestHooks[t];
    if (!hooks || typeof hooks[n] !== 'function') throw new Error(`no hook ${t}.${n}`);
    return hooks[n](...a);
  }, tool, name, args);
}

/**
 * Wait until an in-page predicate returns truthy. `predicate` is a function
 * serialized to the page; `arg` is one JSON-serializable argument.
 * Replaces every fixed-delay sleep in the old harness.
 */
export function waitFor(page, predicate, arg, timeout = 8000) {
  return page.waitForFunction(predicate, { timeout, polling: 50 }, arg);
}

/**
 * Feed a text file into a tool's <input type=file> by dispatching a change
 * event, exactly as a user drop/select would. Does NOT sleep — callers follow
 * with a waitFor() on the parse-completion predicate.
 */
export async function feedFile(page, selector, filename, text, mime = 'text/plain') {
  await page.evaluate((sel, name, txt, m) => {
    const input = document.querySelector(sel);
    if (!input) throw new Error('no file input ' + sel);
    const file = new File([txt], name, { type: m });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, filename, text, mime);
}

// ── Normalization + snapshots ────────────────────────────────────────────────
// Ported verbatim from the old harness: strip volatile timestamp/id fields and
// sort object keys so comparisons are stable. Snapshot files store this
// normalized string, making them deterministic and regenerable.

export function normalize(value) {
  const strip = (v) => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (k === 'timestamp' || k === 'id') continue;
        out[k] = strip(val);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(strip(value), (k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]]));
    }
    return v;
  }, 2);
}

/**
 * Assert `output` matches the committed snapshot `name`. With UPDATE_SNAPSHOTS=1
 * the snapshot is (re)written instead. A mismatch ALWAYS fails — fixing the old
 * gate that silently passed on snapshot drift.
 */
export function matchSnapshot(name, output) {
  const path = join(SNAP_DIR, name);
  const actual = normalize(output);
  if (UPDATE) {
    writeFileSync(path, actual + '\n');
    return;
  }
  let expected;
  try {
    expected = readFileSync(path, 'utf8').replace(/\n$/, '');
  } catch {
    throw new Error(`missing snapshot ${name} — run \`npm run test:e2e:update\``);
  }
  assert.equal(actual, expected, `snapshot mismatch: ${name} (run test:e2e:update to rebaseline)`);
}
