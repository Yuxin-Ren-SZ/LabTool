/**
 * Unit tests for the workflow layer v2 (assets/js/labtools-workflow.js).
 * Run: node --test tests/unit/
 *
 * labtools-workflow.js is pure logic that reuses the artifact layer
 * (assets/js/labtools-artifact.js) for handoff envelopes and field-port
 * wiring. Both files are loaded into the SAME VM context, mirroring a page
 * that loads the two scripts in order.
 *
 * Cross-realm note: objects created inside the VM sandbox have the sandbox
 * realm's prototypes, so comparisons use deepEqualJson (JSON-serializing) and
 * thrown TypeErrors are matched by `{ name: 'TypeError' }` (a VM TypeError is
 * not `instanceof` the host TypeError).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserJs, deepEqualJson } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Artifact + workflow share one VM context, like a page loading both scripts.
const ctx = loadBrowserJs('assets/js/labtools-artifact.js');
vm.runInContext(
  readFileSync(join(ROOT, 'assets/js/labtools-workflow.js'), 'utf8'),
  ctx,
  { filename: 'assets/js/labtools-workflow.js' },
);
const workflow = ctx.window.labtools.workflow;
const { labtoolsBuildArtifact, labtoolsMatchWiring } = ctx;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// ── Chain graph ─────────────────────────────────────────────────────────────

test('labtools.workflow exposes the full API surface', () => {
  const api = ['defineChain', 'nextFor', 'allChains', 'path',
    'newSession', 'appendStep', 'buildHandoffEnvelope', 'applyHandoff'];
  api.forEach((name) => assert.equal(typeof workflow[name], 'function', name));
});

test('defineChain registers next steps and nextFor returns them (or [])', () => {
  workflow.defineChain('chain-a', [{ tool: 'chain-b', label: 'to B' }, { tool: 'chain-c', label: 'to C' }]);
  assert.ok(deepEqualJson(workflow.nextFor('chain-a'), [
    { tool: 'chain-b', label: 'to B' },
    { tool: 'chain-c', label: 'to C' },
  ]));
  // unregistered tool -> empty list
  assert.ok(deepEqualJson(workflow.nextFor('never-registered'), []));
  // label is optional and normalizes to ''
  workflow.defineChain('chain-nolabel', [{ tool: 'chain-b' }]);
  assert.ok(deepEqualJson(workflow.nextFor('chain-nolabel'), [{ tool: 'chain-b', label: '' }]));
});

test('defineChain overwrites a previous registration', () => {
  workflow.defineChain('chain-over', [{ tool: 'old', label: 'old' }]);
  workflow.defineChain('chain-over', [{ tool: 'new', label: 'new' }]);
  assert.ok(deepEqualJson(workflow.nextFor('chain-over'), [{ tool: 'new', label: 'new' }]));
});

test('defineChain accepts an empty next list (dead-end tool)', () => {
  workflow.defineChain('chain-deadend', []);
  assert.ok(deepEqualJson(workflow.nextFor('chain-deadend'), []));
});

test('defineChain rejects invalid arguments with TypeError', () => {
  assert.throws(() => workflow.defineChain('', [{ tool: 'b' }]), { name: 'TypeError' });
  assert.throws(() => workflow.defineChain(42, [{ tool: 'b' }]), { name: 'TypeError' });
  assert.throws(() => workflow.defineChain('a'), { name: 'TypeError' });                // next missing
  assert.throws(() => workflow.defineChain('a', 'not-an-array'), { name: 'TypeError' });
  assert.throws(() => workflow.defineChain('a', [{}]), { name: 'TypeError' });          // item missing tool
  assert.throws(() => workflow.defineChain('a', [{ label: 'no tool' }]), { name: 'TypeError' });
  assert.throws(() => workflow.defineChain('a', [{ tool: '' }]), { name: 'TypeError' });
  assert.throws(() => workflow.defineChain('a', [{ tool: 7 }]), { name: 'TypeError' });
  assert.throws(() => workflow.defineChain('a', ['foo']), { name: 'TypeError' });       // not an object
});

test('allChains returns a detached snapshot', () => {
  workflow.defineChain('snap-a', [{ tool: 'x', label: 'X' }]);
  const before = workflow.allChains();
  const shot = workflow.allChains();
  // Mutating the snapshot must not leak into the registry.
  shot['snap-a'][0].tool = 'mutated';
  shot['snap-a'][0].label = 'mutated';
  shot['snap-a'].push({ tool: 'y', label: 'Y' });
  shot['brand-new'] = [{ tool: 'z', label: 'Z' }];
  const after = workflow.allChains();
  assert.ok(deepEqualJson(before, after), 'mutating the snapshot changed internals');
  assert.ok(deepEqualJson(after['snap-a'], [{ tool: 'x', label: 'X' }]));
  assert.ok(!('brand-new' in after), 'snapshot-only keys leaked into the registry');
});

// ── path (BFS shortest route) ────────────────────────────────────────────────

test('path walks a linear chain including both endpoints', () => {
  workflow.defineChain('LA', [{ tool: 'LB' }]);
  workflow.defineChain('LB', [{ tool: 'LC' }]);
  assert.ok(deepEqualJson(workflow.path('LA', 'LC'), ['LA', 'LB', 'LC']));
  assert.ok(deepEqualJson(workflow.path('LA', 'LB'), ['LA', 'LB']));
});

test('path on a diamond returns one shortest route of length 3', () => {
  workflow.defineChain('DA', [{ tool: 'DB' }, { tool: 'DD' }]);
  workflow.defineChain('DB', [{ tool: 'DC' }]);
  workflow.defineChain('DD', [{ tool: 'DC' }]);
  const route = workflow.path('DA', 'DC');
  assert.equal(route.length, 3, 'shortest path has 3 nodes');
  assert.equal(route[0], 'DA');
  assert.equal(route[2], 'DC');
  assert.ok(route[1] === 'DB' || route[1] === 'DD', 'middle node is one of the two branches');
});

test('path returns null when unreachable (incl. cycles) and [from] when from === to', () => {
  workflow.defineChain('UX', [{ tool: 'UY' }]);
  workflow.defineChain('UC1', [{ tool: 'UC2' }]);
  workflow.defineChain('UC2', [{ tool: 'UC1' }]); // cycle
  assert.equal(workflow.path('UX', 'UNKNOWN'), null);
  assert.equal(workflow.path('UC1', 'UNKNOWN'), null, 'cycle must not hang the BFS');
  assert.equal(workflow.path('solo', 'other'), null); // neither registered
  assert.ok(deepEqualJson(workflow.path('UX', 'UX'), ['UX']));
  assert.ok(deepEqualJson(workflow.path('solo', 'solo'), ['solo']), 'from === to works even when unregistered');
});

// ── Sessions ─────────────────────────────────────────────────────────────────

test('newSession generates unique uuid-v4 ids and timestamps', () => {
  const s1 = workflow.newSession();
  const s2 = workflow.newSession();
  assert.notEqual(s1.id, s2.id);
  assert.match(s1.id, UUID_V4);
  assert.equal(typeof s1.createdAt, 'number');
  assert.ok(s1.createdAt > 0);
  assert.equal(s1.updatedAt, s1.createdAt);
  assert.equal(s1.tool, '');
  assert.equal(s1.label, '');
  assert.ok(deepEqualJson(s1.steps, []));
});

test('newSession honors provided parts and defaults the rest', () => {
  const s = workflow.newSession({ id: 'custom-id', tool: 'seeding-calc', label: 'P3 seed 2e4' });
  assert.equal(s.id, 'custom-id');
  assert.equal(s.tool, 'seeding-calc');
  assert.equal(s.label, 'P3 seed 2e4');
  assert.ok(deepEqualJson(s.steps, []));
  assert.ok(s.createdAt > 0 && s.updatedAt === s.createdAt);
});

// ── appendStep ───────────────────────────────────────────────────────────────

test('appendStep mutates in place, normalizes fields, fills at, bumps updatedAt', () => {
  const s = workflow.newSession({ id: 'sess-1' });
  const before = s.updatedAt;
  const ret = workflow.appendStep(s, {
    tool: 'seeding-calc',
    contract: 'seeding-plan',
    recordId: 'rec-1',
    resolvedInputs: { 'cell-count': 4e6 },
  });
  assert.equal(ret, s, 'appendStep returns the same session object');
  assert.equal(s.steps.length, 1);
  const step = s.steps[0];
  assert.equal(step.tool, 'seeding-calc');
  assert.equal(step.contract, 'seeding-plan');
  assert.equal(step.recordId, 'rec-1');
  assert.ok(deepEqualJson(step.resolvedInputs, { 'cell-count': 4e6 }));
  assert.ok(deepEqualJson(step.missing, []), 'missing defaults to []');
  assert.equal(typeof step.at, 'number', 'at is auto-filled with a timestamp');
  assert.ok(step.at > 0);
  assert.ok(s.updatedAt >= before, 'updatedAt is bumped');
  // second hop appends, keeping the first
  workflow.appendStep(s, { tool: 'qpcr-analysis', recordId: 'rec-2', at: 12345, missing: ['cq'] });
  assert.equal(s.steps.length, 2);
  assert.equal(s.steps[1].at, 12345, 'explicit at is preserved');
  assert.ok(deepEqualJson(s.steps[1].missing, ['cq']));
});

test('appendStep throws TypeError on invalid tool/recordId/session', () => {
  const s = workflow.newSession();
  assert.throws(() => workflow.appendStep(s, { tool: '', recordId: 'r' }), { name: 'TypeError' });
  assert.throws(() => workflow.appendStep(s, { tool: 'a', recordId: '' }), { name: 'TypeError' });
  assert.throws(() => workflow.appendStep(s, { recordId: 'r' }), { name: 'TypeError' });   // tool missing
  assert.throws(() => workflow.appendStep(s, { tool: 'a' }), { name: 'TypeError' });      // recordId missing
  assert.throws(() => workflow.appendStep(s, { tool: 7, recordId: 'r' }), { name: 'TypeError' });
  assert.throws(() => workflow.appendStep(s, { tool: 'a', recordId: 42 }), { name: 'TypeError' });
  assert.throws(() => workflow.appendStep(null, { tool: 'a', recordId: 'r' }), { name: 'TypeError' });
  assert.throws(() => workflow.appendStep([], { tool: 'a', recordId: 'r' }), { name: 'TypeError' });
});

// ── Handoff envelope ─────────────────────────────────────────────────────────

test('buildHandoffEnvelope returns an artifact envelope plus meta.label', () => {
  const env = workflow.buildHandoffEnvelope('cell-count', { concentration: 100, count: 42 }, 'Handoff 1');
  assert.equal(env.schemaVersion, 1);
  assert.equal(env.tool, 'cell-count');
  assert.ok(deepEqualJson(env.params, {}));
  assert.ok(deepEqualJson(env.inputs, {}));
  assert.ok(deepEqualJson(env.outputs, { concentration: 100, count: 42 }));
  assert.ok(deepEqualJson(env.meta, { label: 'Handoff 1' }));
  // label defaults to ''
  const bare = workflow.buildHandoffEnvelope('cell-count', { concentration: 100 });
  assert.ok(deepEqualJson(bare.meta, { label: '' }));
});

test('buildHandoffEnvelope throws when labtoolsBuildArtifact is unavailable', () => {
  const saved = ctx.window.labtoolsBuildArtifact;
  delete ctx.window.labtoolsBuildArtifact;
  try {
    assert.throws(
      () => workflow.buildHandoffEnvelope('p', { a: 1 }, 'L'),
      /labtools-workflow: labtools-artifact\.js required/,
    );
  } finally {
    ctx.window.labtoolsBuildArtifact = saved;
  }
  // restored: works again
  assert.equal(workflow.buildHandoffEnvelope('p', { a: 1 }).tool, 'p');
});

// ── applyHandoff (wiring) ────────────────────────────────────────────────────

test('applyHandoff matches, reports missing required, ignores extras, skips optional unmatched', () => {
  const env = workflow.buildHandoffEnvelope('cell-count', { concentration: 100, extra: 'x' }, 'H');
  const ports = [
    { field: 'concentration', required: true },
    { field: 'volume', required: true },   // required, unmatched -> missing
    { field: 'temperature' },              // optional, unmatched -> absent
  ];
  const { resolved, missing, ignored } = workflow.applyHandoff(env, ports);
  assert.ok(deepEqualJson(resolved, { concentration: 100 }));
  assert.ok(deepEqualJson(missing, ['volume']));
  assert.ok(deepEqualJson(ignored, ['extra']));
  assert.ok(!('temperature' in resolved), 'unmatched optional port is not resolved');
});

test('applyHandoff throws when labtoolsMatchWiring is unavailable', () => {
  const env = workflow.buildHandoffEnvelope('p', { a: 1 }, 'L');
  const saved = ctx.window.labtoolsMatchWiring;
  delete ctx.window.labtoolsMatchWiring;
  try {
    assert.throws(
      () => workflow.applyHandoff(env, []),
      /labtools-workflow: labtools-artifact\.js required/,
    );
  } finally {
    ctx.window.labtoolsMatchWiring = saved;
  }
});

// ── Consistency with the artifact layer ──────────────────────────────────────

test('applyHandoff equals labtoolsMatchWiring for the same outputs/ports', () => {
  const outputs = { a: 1, b: 'x', c: null };
  const ports = [
    { field: 'a', required: true },
    { field: 'c' },                   // matched, null value -> resolved (not missing)
    { field: 'd', required: true },   // -> missing
    { field: 'e' },                   // optional, unmatched -> absent
  ];
  const env = workflow.buildHandoffEnvelope('producer', outputs, 'L');
  const viaWorkflow = workflow.applyHandoff(env, ports);
  const direct = labtoolsMatchWiring(outputs, ports);
  assert.ok(deepEqualJson(viaWorkflow, direct), 'applyHandoff must not diverge from labtoolsMatchWiring');
  assert.ok(deepEqualJson(viaWorkflow.resolved, { a: 1, c: null }), 'null values resolve, not missing');
  assert.ok(deepEqualJson(viaWorkflow.missing, ['d']));
  assert.ok(deepEqualJson(viaWorkflow.ignored, ['b']));
});
