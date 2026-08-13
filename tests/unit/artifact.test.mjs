/**
 * Unit tests for the artifact model (assets/js/labtools-artifact.js).
 * Run: node --test tests/unit/
 *
 * The PRIMARY invariant: params → CSV → params is identity, and equals
 * params → JSON → params. This is what proves "JSON and CSV bare the same
 * information" and that a tool can be fully recovered from either format.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserJs, deepEqualJson } from './helpers.mjs';

const ctx = loadBrowserJs('assets/js/labtools-artifact.js');
const {
  labtoolsFlatten, labtoolsUnflatten,
  labtoolsRowsToCsv, labtoolsCsvToRows,
  labtoolsBuildArtifact, labtoolsValidateArtifact,
  labtoolsArtifactToCsv, labtoolsCsvToArtifact,
  labtoolsMatchWiring,
} = ctx;

// Representative param sets spanning the tools' control-state shapes.
const SAMPLES = {
  scalars: { mode: 'all25', df: 20, live: true, note: '', dead: null },
  nested: { plate: { plateType: '96', cutCorners: ['A1', 'H12'] } },
  arrayOfObjects: {
    samples: [
      { name: 'Ctrl_1', conc: 100.5, a260_280: 1.9 },
      { name: 'Ctrl_2', conc: null, a260_280: 2.0 },
    ],
  },
  emptyContainers: { wells: {}, tags: [], nested: { a: [], b: {} } },
  // plate-layout with a well map, null group, and an empty well
  plateLayout: {
    plates: [{
      plateType: '96',
      cutCorners: [],
      wells: { A1: { group: null, sample: 'S1', dose: '5 µM' }, B2: {} },
    }],
  },
  csvHazards: { title: 'a,b"c\nd', arr: ['x,y', 'z"w'] },
};

// ── Flatten / unflatten round-trip ───────────────────────────────────────────

test('flatten → unflatten is identity across param shapes', () => {
  for (const [name, obj] of Object.entries(SAMPLES)) {
    const back = labtoolsUnflatten(labtoolsFlatten(obj));
    assert.ok(deepEqualJson(obj, back), `${name} did not round-trip: ${JSON.stringify(back)}`);
  }
});

test('flatten preserves empty containers as sentinels', () => {
  // (compare via deepEqualJson — flatten runs in the vm sandbox, so its [] / {}
  //  have the sandbox realm's prototypes and deepStrictEqual would reject them.)
  const flat = labtoolsFlatten({ tags: [], wells: {}, x: 1 });
  assert.ok(deepEqualJson(flat.tags, []));
  assert.ok(deepEqualJson(flat.wells, {}));
  assert.equal(flat.x, 1);
});

test('flatten preserves scalar types (number vs string vs null vs bool)', () => {
  const flat = labtoolsFlatten({ a: 5, b: '5', c: null, d: false });
  assert.strictEqual(flat.a, 5);
  assert.strictEqual(flat.b, '5');
  assert.strictEqual(flat.c, null);
  assert.strictEqual(flat.d, false);
});

// ── RFC-4180 CSV rows round-trip ─────────────────────────────────────────────

test('CSV rows round-trip through quoting hazards', () => {
  const rows = [
    ['plain', 'a,b', 'has "quote"'],
    ['line\nbreak', 'trailing space ', ''],
    ['', 'x', 'y'],
  ];
  const back = labtoolsCsvToRows(labtoolsRowsToCsv(rows));
  assert.ok(deepEqualJson(back, rows));
});

// ── Artifact CSV ≡ JSON (the primary invariant) ──────────────────────────────

test('params → CSV → params is identity, and equals the JSON path', () => {
  for (const [name, params] of Object.entries(SAMPLES)) {
    const env = labtoolsBuildArtifact({ tool: 'demo', params });

    // JSON path
    const viaJson = JSON.parse(JSON.stringify(env));
    assert.ok(deepEqualJson(env, viaJson), `${name}: JSON path drifted`);

    // CSV path
    const viaCsv = labtoolsCsvToArtifact(labtoolsArtifactToCsv(env));
    assert.ok(deepEqualJson(env, viaCsv), `${name}: CSV path drifted → ${JSON.stringify(viaCsv)}`);

    // CSV ≡ JSON
    assert.ok(deepEqualJson(viaCsv, viaJson), `${name}: CSV and JSON disagree`);
  }
});

test('full envelope (params+inputs+outputs) round-trips through CSV', () => {
  const env = labtoolsBuildArtifact({
    tool: 'seeding-calc',
    params: SAMPLES.scalars,
    inputs: { 'sample-list': SAMPLES.arrayOfObjects },
    outputs: { concentration: 4000000, 'plate-layout': SAMPLES.plateLayout },
  });
  const back = labtoolsCsvToArtifact(labtoolsArtifactToCsv(env));
  assert.ok(deepEqualJson(env, back), `envelope drifted → ${JSON.stringify(back)}`);
});

// ── Envelope validation ──────────────────────────────────────────────────────

test('validateArtifact accepts a well-formed envelope and rejects bad ones', () => {
  assert.ok(labtoolsValidateArtifact(labtoolsBuildArtifact({ tool: 't' })).valid);
  assert.ok(!labtoolsValidateArtifact({ params: {}, inputs: {}, outputs: {} }).valid); // no tool
  const bad = labtoolsValidateArtifact({ tool: 't', schemaVersion: 1, params: [], inputs: {}, outputs: {} });
  assert.ok(!bad.valid && bad.errors.some((e) => e.includes('params')));
});

// ── Field-port wiring ────────────────────────────────────────────────────────

test('matchWiring resolves matches, reports missing-required, ignores extras', () => {
  const upstream = { concentration: 100, 'cell-count': 4e6, cq: 22.1 };
  const ports = [
    { field: 'concentration', required: true },
    { field: 'volume', required: true },   // not provided → manual fill
    { field: 'temperature' },              // optional, not provided → not missing
  ];
  const { resolved, missing, ignored } = labtoolsMatchWiring(upstream, ports);
  assert.ok(deepEqualJson(resolved, { concentration: 100 }));
  assert.ok(deepEqualJson(missing, ['volume']));
  assert.ok(deepEqualJson(ignored.slice().sort(), ['cell-count', 'cq']));
});

test('matchWiring passes null values through as resolved (not missing)', () => {
  const { resolved, missing } = labtoolsMatchWiring(
    { group: null },
    [{ field: 'group', required: true }],
  );
  assert.ok(deepEqualJson(resolved, { group: null }));
  assert.ok(deepEqualJson(missing, []));
});
