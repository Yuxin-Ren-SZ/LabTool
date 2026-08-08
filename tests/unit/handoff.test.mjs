/**
 * Unit tests for the workflow deep-link handoff helpers in labtools-common.js:
 *   labtoolsHandoffTo  — save to workbench, then navigate with ?wbLoad=<id>
 *   labtoolsConsumeHandoff — read ?wbLoad, fetch item, apply, strip the param
 *
 * Run in a hand-rolled vm context with stubbed workbench / location / history,
 * since these paths touch browser globals the shared helper does not provide.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CODE = readFileSync(join(ROOT, 'assets/js/labtools-common.js'), 'utf8');

function makeCtx({ search = '', item = null } = {}) {
  const nav = { href: null, replaced: null };
  const toasts = [];
  const sandbox = {
    console, Promise, JSON, Object, Array, Error,
    URL, URLSearchParams,
    workbench: {
      _put: null,
      put(type, label, data, metadata, tool) {
        this._put = { type, label, data, metadata, tool };
        return Promise.resolve('id-123');
      },
      getItem(id) { return Promise.resolve(id === 'id-123' ? item : null); },
    },
    showToast: (m) => toasts.push(m),
    window: {
      location: { href: 'https://x/tools/a/index.html', pathname: '/tools/a/index.html', search },
      history: { replaceState: (_s, _t, url) => { nav.replaced = url; } },
    },
    document: {},
  };
  sandbox.globalThis = sandbox;
  // Navigation is a setter on window.location.href — capture it.
  Object.defineProperty(sandbox.window.location, 'href', {
    get() { return nav.href || 'https://x/tools/a/index.html'; },
    set(v) { nav.href = v; },
  });
  vm.createContext(sandbox);
  vm.runInContext(CODE, sandbox, { filename: 'labtools-common.js' });
  return { sandbox, nav, toasts };
}

test('labtoolsHandoffTo: saves then navigates with ?wbLoad', async () => {
  const { sandbox, nav } = makeCtx();
  const id = await sandbox.labtoolsHandoffTo('../b/index.html', 'sample-list', 'Lbl',
    { samples: [] }, { n: 1 }, 'a');
  assert.equal(id, 'id-123');
  assert.deepEqual(sandbox.workbench._put,
    { type: 'sample-list', label: 'Lbl', data: { samples: [] }, metadata: { n: 1 }, tool: 'a' });
  assert.match(nav.href, /\/tools\/b\/index\.html\?wbLoad=id-123$/);
});

test('labtoolsConsumeHandoff: applies the item and strips the param', async () => {
  const item = { id: 'id-123', type: 'sample-list', label: 'From A', tool: 'cell-count',
    data: { samples: [{ name: 'X' }] } };
  const { sandbox, nav, toasts } = makeCtx({ search: '?wbLoad=id-123&keep=1', item });
  let applied = null;
  const ok = await sandbox.labtoolsConsumeHandoff((data, type) => { applied = { data, type }; });
  assert.equal(ok, true);
  assert.deepEqual(applied, { data: { samples: [{ name: 'X' }] }, type: 'sample-list' });
  // Other query params are preserved; wbLoad is removed.
  assert.equal(nav.replaced, '/tools/a/index.html?keep=1');
  assert.ok(toasts.some((t) => /From A|cell-count/.test(t)), 'announces the source');
});

test('labtoolsConsumeHandoff: no-op without ?wbLoad', async () => {
  const { sandbox } = makeCtx({ search: '?other=1' });
  let called = false;
  const ok = await sandbox.labtoolsConsumeHandoff(() => { called = true; });
  assert.equal(ok, false);
  assert.equal(called, false);
});

test('labtoolsConsumeHandoff: missing item resolves false, still strips param', async () => {
  const { sandbox, nav } = makeCtx({ search: '?wbLoad=id-123', item: null });
  const ok = await sandbox.labtoolsConsumeHandoff(() => { throw new Error('should not apply'); });
  assert.equal(ok, false);
  assert.equal(nav.replaced, '/tools/a/index.html');
});
