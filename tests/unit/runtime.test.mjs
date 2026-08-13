/**
 * Unit tests for assets/js/labtools-runtime.js — the shared-layer load
 * self-check (canonical load manifest, symbol resolution, runtime/order
 * checks, manifest validation, boot wiring).
 *
 * Each test loads the module into its own fresh VM context via loadBrowserJs
 * (runtime.js is DOM-guarded, so a bare context exercises the missing-symbol
 * paths naturally). Run: node --test tests/unit/runtime.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserJs } from './helpers.mjs';

/**
 * Cross-realm plain-data conversion: values created inside the VM context carry
 * the VM realm's prototypes, which makes assert.deepStrictEqual (prototype-
 * sensitive) reject them. JSON round-trip yields host-realm plain data for
 * structural comparison.
 */
function plain(v) {
  return JSON.parse(JSON.stringify(v));
}

/** Load runtime.js in a fresh context with a silenced console recorder. */
function loadRuntime() {
  const ctx = loadBrowserJs('assets/js/labtools-runtime.js');
  const recorded = [];
  const stubConsole = {
    error: (...a) => recorded.push(['error', ...a]),
    warn: (...a) => recorded.push(['warn', ...a]),
    info: (...a) => recorded.push(['info', ...a]),
    log: (...a) => recorded.push(['log', ...a]),
  };
  ctx.console = stubConsole;
  ctx.window.console = stubConsole;
  return { ctx, recorded };
}

/** Set a symbol on the runtime root (window), supporting dotted paths. */
function inject(ctx, symbol, value) {
  const parts = symbol.split('.');
  let node = ctx.window;
  for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]];
  node[parts[parts.length - 1]] = value;
}

/** The five hard dependencies a tool page must load. */
const REQUIRED_STUBS = [
  ['DATA_TYPES', {}],
  ['workbench', {}],
  ['labtoolsDownloadText', () => {}],
  ['labtoolsDefineTool', () => {}],
  ['labtoolsMountArtifactControls', () => {}],
];

function injectRequired(ctx) {
  REQUIRED_STUBS.forEach(([symbol, value]) => inject(ctx, symbol, value));
}

// ─────────────────────────────────────────────────────────────────────────────

test('SCRIPT_ORDER declares the canonical load manifest with correct structure', () => {
  const { ctx } = loadRuntime();
  const runtime = ctx.labtools.runtime;

  assert.ok(Array.isArray(runtime.SCRIPT_ORDER));
  assert.equal(runtime.SCRIPT_ORDER.length, 10);
  assert.deepEqual(plain(runtime.SCRIPT_ORDER.map((e) => e.file)), [
    'labtools-calc.js',
    'labtools-types.js',
    'labtools-workbench.js',
    'labtools-common.js',
    'labtools-artifact.js',
    'labtools-artifact-ui.js',
    'labtools-contracts.js',
    'labtools-store.js',
    'labtools-workflow.js',
    'labtools-runtime.js',
  ]);
  runtime.SCRIPT_ORDER.forEach((entry) => {
    assert.equal(typeof entry.file, 'string');
    assert.equal(typeof entry.symbol, 'string');
    assert.equal(typeof entry.required, 'boolean');
  });

  // Exactly the five hard dependencies are required; the v2 modules and calc
  // (load-time optional) are not.
  assert.deepEqual(plain(runtime.SCRIPT_ORDER.filter((e) => e.required).map((e) => e.file)), [
    'labtools-types.js',
    'labtools-workbench.js',
    'labtools-common.js',
    'labtools-artifact.js',
    'labtools-artifact-ui.js',
  ]);
  ['labtools-calc.js', 'labtools-contracts.js', 'labtools-store.js',
    'labtools-workflow.js', 'labtools-runtime.js'].forEach((file) => {
    assert.equal(runtime.SCRIPT_ORDER.find((e) => e.file === file).required, false);
  });

  // resolveSymbol resolves dotted paths and plain names on the root.
  assert.equal(typeof runtime.resolveSymbol, 'function');
  inject(ctx, 'labtools.contracts', { v: 1 });
  assert.deepEqual(runtime.resolveSymbol('labtools.contracts'), { v: 1 });
  assert.equal(runtime.resolveSymbol('labtools.contracts.missing'), undefined);
  inject(ctx, 'workbench', { marker: true });
  assert.equal(runtime.resolveSymbol('workbench'), ctx.window.workbench);
  assert.equal(runtime.resolveSymbol('never-defined'), undefined);
  assert.equal(runtime.resolveSymbol(''), undefined);

  // The module recorded itself in the load-order trail at load time.
  assert.ok(Array.isArray(ctx.window.__labtoolsLoadOrder));
  assert.ok(ctx.window.__labtoolsLoadOrder.includes('labtools-runtime'));
});

test('checkRuntime reports the five missing required symbols and passes once injected', () => {
  const { ctx } = loadRuntime();
  const runtime = ctx.labtools.runtime;

  // Bare context — no shared symbols present.
  const empty = runtime.checkRuntime();
  assert.equal(empty.ok, false);
  assert.deepEqual(plain(empty.missing.map((m) => m.file).sort()), [
    'labtools-artifact-ui.js',
    'labtools-artifact.js',
    'labtools-common.js',
    'labtools-types.js',
    'labtools-workbench.js',
  ]);
  empty.missing.forEach((m) => {
    assert.equal(typeof m.file, 'string');
    assert.equal(typeof m.symbol, 'string');
  });
  assert.deepEqual(plain(empty.notes), []); // notes reserved, nothing emits one yet
  // Inject the five required stubs → ok.
  injectRequired(ctx);
  const full = runtime.checkRuntime();
  assert.equal(full.ok, true);
  assert.deepEqual(plain(full.missing), []);
  assert.deepEqual(plain(full.notes), []);

  // requireAll additionally checks the optional v2 modules (and calc).
  const all = runtime.checkRuntime({ requireAll: true });
  assert.equal(all.ok, false);
  const allMissing = all.missing.map((m) => m.file);
  assert.ok(allMissing.includes('labtools-contracts.js'));
  assert.ok(allMissing.includes('labtools-store.js'));
  assert.ok(allMissing.includes('labtools-workflow.js'));
  assert.ok(allMissing.includes('labtools-calc.js'));
  // runtime itself is present, so it is never reported missing.
  assert.ok(!allMissing.includes('labtools-runtime.js'));
  assert.deepEqual(plain(all.notes), []);

  // Optional modules that ARE present do not land in missing and add no notes.
  inject(ctx, 'labtools.contracts', {});
  const all2 = runtime.checkRuntime({ requireAll: true });
  assert.ok(!all2.missing.some((m) => m.file === 'labtools-contracts.js'));
  assert.deepEqual(plain(all2.notes), []);
});

test('checkLoadOrder validates the relative script order recorded in __labtoolsLoadOrder', () => {
  const { ctx } = loadRuntime();
  const runtime = ctx.labtools.runtime;

  // No trail → ok, empty errors.
  delete ctx.window.__labtoolsLoadOrder;
  let r = runtime.checkLoadOrder();
  assert.deepEqual(plain(r), { ok: true, errors: [] });

  // Empty trail → ok.
  ctx.window.__labtoolsLoadOrder = [];
  r = runtime.checkLoadOrder();
  assert.deepEqual(plain(r), { ok: true, errors: [] });

  // Canonical relative order → ok.
  ctx.window.__labtoolsLoadOrder =
    ['labtools-types', 'labtools-workbench', 'labtools-common', 'labtools-artifact'];
  r = runtime.checkLoadOrder();
  assert.deepEqual(plain(r), { ok: true, errors: [] });

  // Reversed → error naming the pair, formatted "X loaded before Y".
  ctx.window.__labtoolsLoadOrder = ['labtools-common', 'labtools-types'];
  r = runtime.checkLoadOrder();
  assert.equal(r.ok, false);
  assert.deepEqual(plain(r.errors), ['labtools-common.js loaded before labtools-types.js']);

  // A reversed pair deeper in the list is also caught.
  ctx.window.__labtoolsLoadOrder =
    ['labtools-types', 'labtools-workbench', 'labtools-artifact', 'labtools-common'];
  r = runtime.checkLoadOrder();
  assert.equal(r.ok, false);
  assert.deepEqual(plain(r.errors), ['labtools-artifact.js loaded before labtools-common.js']);

  // Unknown entries (files not in SCRIPT_ORDER) are ignored.
  ctx.window.__labtoolsLoadOrder = ['labtools-types', 'mystery.js', 'labtools-workbench'];
  r = runtime.checkLoadOrder();
  assert.deepEqual(plain(r), { ok: true, errors: [] });

  // A repeated file does not error by itself.
  ctx.window.__labtoolsLoadOrder = ['labtools-types', 'labtools-types', 'labtools-types'];
  r = runtime.checkLoadOrder();
  assert.deepEqual(plain(r), { ok: true, errors: [] });

  // Duplicates mixed with a real inversion still report the inversion once.
  ctx.window.__labtoolsLoadOrder = ['labtools-common', 'labtools-common', 'labtools-types'];
  r = runtime.checkLoadOrder();
  assert.equal(r.ok, false);
  assert.deepEqual(plain(r.errors), ['labtools-common.js loaded before labtools-types.js']);
});

test('validateManifest enforces the required id and per-field constraints', () => {
  const { ctx } = loadRuntime();
  const vm = ctx.labtools.runtime.validateManifest;

  // Minimal legal manifest.
  let r = vm({ id: 'x' });
  assert.deepEqual(plain(r), { valid: true, errors: [] });

  // Fully populated legal manifest.
  r = vm({
    id: 'tool-a',
    produces: ['plate-layout'],
    consumes: ['sample-list'],
    readParams: () => ({}),
    applyParams: () => {},
    readInputs: () => ({}),
    readOutputs: () => ({}),
    outputFields: [{ id: 'a' }, { id: 'b' }],
    inputPorts: [{ field: 'x', required: true }, { field: 'y' }],
    next: [{ tool: 'tool-b', label: 'Next' }],
    testHooks: { serialize: () => ({}) },
  });
  assert.deepEqual(plain(r), { valid: true, errors: [] });

  // id: required non-empty string.
  assert.equal(vm({}).valid, false);
  assert.equal(vm({ id: '' }).valid, false);
  assert.equal(vm({ id: '   ' }).valid, false);
  assert.equal(vm({ id: 42 }).valid, false);
  assert.equal(vm(null).valid, false);
  assert.equal(vm('x').valid, false);
  assert.equal(vm([]).valid, false);

  // produces / consumes: string arrays.
  assert.equal(vm({ id: 'x', produces: 'plate-layout' }).valid, false);
  assert.equal(vm({ id: 'x', produces: [1] }).valid, false);
  assert.equal(vm({ id: 'x', consumes: ['ok', 2] }).valid, false);

  // read*/apply* hooks: functions.
  assert.equal(vm({ id: 'x', readParams: {} }).valid, false);
  assert.equal(vm({ id: 'x', applyParams: 'nope' }).valid, false);
  assert.equal(vm({ id: 'x', readInputs: null }).valid, false);
  assert.equal(vm({ id: 'x', readOutputs: 7 }).valid, false);

  // outputFields: [{ id: non-empty string }], ids unique.
  assert.equal(vm({ id: 'x', outputFields: 'nope' }).valid, false);
  assert.equal(vm({ id: 'x', outputFields: [{}] }).valid, false);
  assert.equal(vm({ id: 'x', outputFields: [{ id: '' }] }).valid, false);
  assert.equal(vm({ id: 'x', outputFields: [{ id: 'a' }, { id: 'a' }] }).valid, false);
  assert.equal(vm({ id: 'x', outputFields: [{ id: 'a' }, { id: 'b' }] }).valid, true);

  // inputPorts: [{ field: non-empty string, required?: boolean }], fields unique.
  assert.equal(vm({ id: 'x', inputPorts: 'nope' }).valid, false);
  assert.equal(vm({ id: 'x', inputPorts: [{}] }).valid, false);
  assert.equal(vm({ id: 'x', inputPorts: [{ field: '' }] }).valid, false);
  assert.equal(vm({ id: 'x', inputPorts: [{ field: 'a' }, { field: 'a' }] }).valid, false);
  assert.equal(vm({ id: 'x', inputPorts: [{ field: 'a', required: 'yes' }] }).valid, false);
  assert.equal(vm({ id: 'x', inputPorts: [{ field: 'a', required: true }] }).valid, true);

  // next: [{ tool: non-empty string, label?: string }], tools unique.
  assert.equal(vm({ id: 'x', next: 'nope' }).valid, false);
  assert.equal(vm({ id: 'x', next: [{}] }).valid, false);
  assert.equal(vm({ id: 'x', next: [{ tool: '' }] }).valid, false);
  assert.equal(vm({ id: 'x', next: [{ tool: 'b' }, { tool: 'b' }] }).valid, false);
  assert.equal(vm({ id: 'x', next: [{ tool: 'b', label: 3 }] }).valid, false);
  assert.equal(vm({ id: 'x', next: [{ tool: 'b', label: 'Next' }] }).valid, true);

  // testHooks: object.
  assert.equal(vm({ id: 'x', testHooks: [] }).valid, false);
  assert.equal(vm({ id: 'x', testHooks: 'nope' }).valid, false);
  assert.equal(vm({ id: 'x', testHooks: null }).valid, false);
  assert.equal(vm({ id: 'x', testHooks: {} }).valid, true);

  // Every invalid case reports a human-readable error string.
  const bad = vm({ id: '', outputFields: [{ id: 'a' }, { id: 'a' }] });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.length >= 2);
  bad.errors.forEach((e) => assert.equal(typeof e, 'string'));
});

test('boot reports failures without a DOM, injects a banner with one, and registers valid manifests', () => {
  const { ctx, recorded } = loadRuntime();
  const runtime = ctx.labtools.runtime;

  // (a) No DOM + missing required deps → no throw, runtime.ok === false,
  //     console.error called once per problem, no banner injection attempted.
  delete ctx.document;
  delete ctx.window.document;
  const report = runtime.boot();
  assert.equal(report.runtime.ok, false);
  assert.equal(report.runtime.missing.length, 5);
  assert.equal(report.manifest, null);
  assert.equal(report.order.ok, true);
  assert.ok(recorded.some(([level]) => level === 'error'));
  assert.equal(recorded.filter(([level]) => level === 'error').length, report.runtime.missing.length);

  // (b) With a DOM whose body records insertion, boot injects the banner at top.
  const prepended = [];
  ctx.document = {
    createElement: () => ({ className: '', style: {}, setAttribute() {}, appendChild() {} }),
    body: {
      firstChild: null,
      prependChild: (el) => { prepended.push(el); },
    },
  };
  ctx.window.document = ctx.document;
  runtime.boot();
  assert.equal(prepended.length, 1);
  assert.equal(prepended[0].className, 'lt-alert lt-alert-danger');

  // (c) Valid manifest + registry stubs → both registries called with the
  //     manifest's id, produces, consumes, and testHooks.
  injectRequired(ctx);
  const calls = [];
  ctx.window.labtoolsRegisterToolTypes = (...a) => calls.push(['types', ...a]);
  ctx.window.labtoolsRegisterTestHooks = (...a) => calls.push(['hooks', ...a]);
  const manifest = {
    id: 'unit-tool',
    produces: ['conc-data'],
    consumes: ['plate-layout'],
    testHooks: { serialize: () => ({}), apply: () => {} },
  };
  const okReport = runtime.boot({ manifest });
  assert.equal(okReport.manifest.valid, true);
  assert.equal(okReport.runtime.ok, true);
  assert.deepEqual(plain(calls), [
    ['types', 'unit-tool', ['conc-data'], ['plate-layout']],
    // testHooks is an object whose members are functions — JSON round-trip
    // (plain) drops them, so compare against the plain form of the hooks object.
    ['hooks', 'unit-tool', plain(manifest.testHooks)],
  ]);

  // (d) Invalid manifest → nothing registered.
  calls.length = 0;
  const badReport = runtime.boot({ manifest: { id: '' } });
  assert.equal(badReport.manifest.valid, false);
  assert.deepEqual(plain(calls), []);

  // (e) Valid manifest without produces/consumes → defaults to empty arrays.
  calls.length = 0;
  runtime.boot({ manifest: { id: 'unit-tool-2' } });
  assert.deepEqual(plain(calls), [['types', 'unit-tool-2', [], []]]);

  // (f) When the registries are absent, a valid manifest still boots cleanly.
  delete ctx.window.labtoolsRegisterToolTypes;
  delete ctx.window.labtoolsRegisterTestHooks;
  const noReg = runtime.boot({ manifest: { id: 'unit-tool-3' } });
  assert.equal(noReg.manifest.valid, true);
  assert.equal(noReg.runtime.ok, true);
});

test('shipped shared files push their load-order markers when loaded in a browser-like VM', () => {
  // The marker line added to each shipped file must execute under
  // `typeof window !== 'undefined'` and record onto __labtoolsLoadOrder.
  const artifactCtx = loadBrowserJs('assets/js/labtools-artifact.js');
  assert.ok(Array.isArray(artifactCtx.__labtoolsLoadOrder));
  assert.ok(artifactCtx.__labtoolsLoadOrder.includes('labtools-artifact'));

  const uiCtx = loadBrowserJs('assets/js/labtools-artifact-ui.js');
  assert.ok(uiCtx.__labtoolsLoadOrder.includes('labtools-artifact-ui'));

  const calcCtx = loadBrowserJs('assets/js/labtools-calc.js');
  assert.ok(calcCtx.__labtoolsLoadOrder.includes('labtools-calc'));

  const wbCtx = loadBrowserJs('assets/js/labtools-workbench.js');
  assert.ok(wbCtx.__labtoolsLoadOrder.includes('labtools-workbench'));
});

test('a full shared-layer page sequence passes checkRuntime + checkLoadOrder end to end', () => {
  // Simulate a tool page loading the shared layer in canonical order, then boot.
  const { ctx } = loadRuntime();
  injectRequired(ctx);
  const trail = ctx.window.__labtoolsLoadOrder;
  trail.length = 0;
  // NOTE: artifacts of the real page are loaded AFTER runtime.js in practice;
  // here the markers are replayed so the order check has a realistic trail.
  trail.push(
    'labtools-calc', 'labtools-types', 'labtools-workbench',
    'labtools-common', 'labtools-artifact', 'labtools-artifact-ui',
    'labtools-runtime',
  );
  const report = ctx.labtools.runtime.boot({ manifest: { id: 'page-tool' } });
  assert.equal(report.runtime.ok, true);
  assert.equal(report.order.ok, true);
  assert.deepEqual(plain(report.order.errors), []);
  assert.equal(report.manifest.valid, true);
});
