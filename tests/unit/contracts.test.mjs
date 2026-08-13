/**
 * Unit tests for the shared-layer v2 contracts module
 * (assets/js/labtools-contracts.js).
 * Run: node --test tests/unit/
 *
 * Covers:
 *   • schema v2 primitives: string enum/pattern, number/integer min/max/enum,
 *     array items+minItems, map keyPattern, object required/nullable rules
 *   • unions: anyOf (any branch), oneOf (exactly one branch)
 *   • custom validate hooks (true / error string / ctx.path)
 *   • public checkValue with types.js path format
 *   • top-level payload validation: partial mode, strict mode, version guard
 *   • define/get/has/list registry surface
 *   • legacy mapping: fromLegacy, syncLegacy (fixture→validate round-trip),
 *     no-DATA_TYPES degradation (VM shim and bare Node load)
 *   • __labtoolsLoadOrder self-registration
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadBrowserJs, deepEqualJson } from './helpers.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Context WITHOUT window.DATA_TYPES — pure schema/API tests + degradation tests.
const ctx = loadBrowserJs('assets/js/labtools-contracts.js');
const contracts = ctx.labtools.contracts;

// Context WITH DATA_TYPES injected into the same VM (workbench-model trick):
// types.js loads first, then its registry is handed to the contracts context.
const legacyCtx = loadBrowserJs('assets/js/labtools-contracts.js');
const typesCtx = loadBrowserJs('assets/js/labtools-types.js', ['DATA_TYPES']);
legacyCtx.window.DATA_TYPES = typesCtx.DATA_TYPES;
const legacyContracts = legacyCtx.labtools.contracts;

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

// ── Registry surface ─────────────────────────────────────────────────────────

test('define/get/has/list registry surface', () => {
  const def = contracts.define({
    id: 'demo',
    name: 'Demo',
    icon: '🧪',
    color: '#123456',
    description: 'a demo contract',
    fields: { a: { type: 'string' } },
  });
  assert.equal(def, contracts.get('demo'), 'define returns the registered def');
  assert.equal(def.version, 1, 'version defaults to 1');
  assert.equal(def.name, 'Demo');
  assert.ok(contracts.has('demo'));
  assert.equal(contracts.has('nope'), false);
  assert.equal(contracts.get('nope'), null);

  const entry = contracts.list().find((c) => c.id === 'demo');
  assert.ok(deepEqualJson(entry, {
    id: 'demo', name: 'Demo', icon: '🧪', color: '#123456', version: 1, fieldCount: 1,
  }), `list entry: ${JSON.stringify(entry)}`);

  // idempotent overwrite
  contracts.define({ id: 'demo', fields: { a: { type: 'number' }, b: { type: 'boolean' } } });
  assert.equal(contracts.get('demo').fields.a.type, 'number');
  const overwritten = contracts.list().find((c) => c.id === 'demo');
  assert.equal(overwritten.fieldCount, 2);
  assert.equal(overwritten.name, 'demo', 'name defaults to id when omitted');
});

test('define rejects malformed definitions', () => {
  // regex match (not TypeError identity): the error is created in the VM realm
  assert.throws(() => contracts.define(null), /expected a contract definition object/);
  assert.throws(() => contracts.define({ name: 'no id' }), /non-empty string id/);
  assert.throws(() => contracts.define('plate-layout'), /expected a contract definition object/);
});

test('SCHEMA_VERSION is exposed as 1', () => {
  assert.equal(contracts.SCHEMA_VERSION, 1);
});

test('module registers itself in __labtoolsLoadOrder', () => {
  assert.ok(ctx.window.__labtoolsLoadOrder.includes('labtools-contracts'));
});

// ── Schema v2 primitives ─────────────────────────────────────────────────────

test('string: enum and pattern (RegExp and string forms)', () => {
  contracts.define({
    id: 'str-test',
    fields: {
      size: { type: 'string', enum: ['S', 'M', 'L'] },
      code: { type: 'string', pattern: /^[A-Z]{2}\d{3}$/ },
      codeStr: { type: 'string', pattern: '^[A-Z]{2}\\d{3}$' },
    },
  });
  assert.ok(contracts.validate('str-test', { size: 'M' }).valid);
  assert.ok(contracts.validate('str-test', { size: 'L' }).valid);
  const badEnum = contracts.validate('str-test', { size: 'XL' });
  assert.ok(!badEnum.valid && badEnum.errors.some((e) => e.includes('not in')));
  assert.ok(contracts.validate('str-test', { code: 'AB123' }).valid);
  const badPat = contracts.validate('str-test', { code: 'abc' });
  assert.ok(!badPat.valid && badPat.errors.some((e) => e.includes('does not match')));
  assert.ok(contracts.validate('str-test', { codeStr: 'XY999' }).valid, 'string pattern compiles');
  const notStr = contracts.validate('str-test', { size: 5 });
  assert.ok(!notStr.valid && notStr.errors.some((e) => e.includes('expected string')));
});

test('number: min/max/enum', () => {
  contracts.define({
    id: 'num-test',
    fields: {
      n: { type: 'number', min: 0, max: 100 },
      e: { type: 'number', enum: [0.5, 1, 2] },
    },
  });
  assert.ok(contracts.validate('num-test', { n: 50 }).valid);
  assert.ok(contracts.validate('num-test', { n: 0 }).valid, 'min is inclusive');
  assert.ok(contracts.validate('num-test', { n: 100 }).valid, 'max is inclusive');
  assert.ok(!contracts.validate('num-test', { n: -1 }).valid, 'below min fails');
  assert.ok(!contracts.validate('num-test', { n: 101 }).valid, 'above max fails');
  assert.ok(contracts.validate('num-test', { e: 0.5 }).valid);
  assert.ok(!contracts.validate('num-test', { e: 3 }).valid, 'not in enum fails');
  assert.ok(!contracts.validate('num-test', { n: '50' }).valid, 'string is not a number');
  assert.ok(!contracts.validate('num-test', { n: NaN }).valid, 'NaN is not a valid number');
});

test('integer: rejects fractions, honors min/max', () => {
  contracts.define({
    id: 'int-test',
    fields: { i: { type: 'integer', min: 1, max: 384 } },
  });
  assert.ok(contracts.validate('int-test', { i: 96 }).valid);
  assert.ok(contracts.validate('int-test', { i: 1 }).valid);
  assert.ok(!contracts.validate('int-test', { i: 96.5 }).valid, 'fraction fails');
  assert.ok(!contracts.validate('int-test', { i: 0 }).valid, 'below min fails');
  assert.ok(!contracts.validate('int-test', { i: 385 }).valid, 'above max fails');
  assert.ok(!contracts.validate('int-test', { i: '96' }).valid, 'string fails');
  assert.ok(!contracts.validate('int-test', { i: NaN }).valid, 'NaN fails');
});

test('array: items schema + minItems', () => {
  contracts.define({
    id: 'arr-test',
    fields: {
      wells: { type: 'array', minItems: 2, items: { type: 'string', pattern: /^[A-H]\d{1,2}$/ } },
    },
  });
  assert.ok(contracts.validate('arr-test', { wells: ['A1', 'B2', 'H12'] }).valid);
  assert.ok(!contracts.validate('arr-test', { wells: ['A1'] }).valid, 'below minItems fails');
  assert.ok(!contracts.validate('arr-test', { wells: ['A1', 'B2', 'Z9'] }).valid, 'bad item fails');
  assert.ok(!contracts.validate('arr-test', { wells: 'A1' }).valid, 'not an array fails');
});

test('map: keyPattern (RegExp/string) + values schema', () => {
  contracts.define({
    id: 'map-test',
    fields: {
      wells: {
        type: 'map',
        keyPattern: /^[A-H][1-9][0-2]?$/,
        values: { type: 'object' },
      },
      named: {
        type: 'map',
        keyPattern: '^[a-z]{2,}$',
        values: { type: 'number' },
      },
    },
  });
  assert.ok(contracts.validate('map-test', { wells: { A1: {}, B12: { group: 'c1' } } }).valid);
  const badKey = contracts.validate('map-test', { wells: { a1: {} } });
  assert.ok(!badKey.valid && badKey.errors.some((e) => e.includes('does not match')));
  const badVal = contracts.validate('map-test', { wells: { A1: 'nope' } });
  assert.ok(!badVal.valid && badVal.errors.some((e) => e.includes('expected object')));
  assert.ok(contracts.validate('map-test', { named: { ab: 1, cde: 2 } }).valid);
  const badNamed = contracts.validate('map-test', { named: { AB: 1 } });
  assert.ok(!badNamed.valid && badNamed.errors.some((e) => e.includes('does not match')));
});

test('object: required/optional/nullable prop rules', () => {
  contracts.define({
    id: 'obj-test',
    fields: {
      plate: {
        type: 'object',
        props: {
          name: { type: 'string', required: true },
          note: { type: 'string' },
          conc: { type: 'number', nullable: true },
        },
      },
    },
  });
  assert.ok(contracts.validate('obj-test', { plate: { name: 'P1' } }).valid, 'optional absent passes');
  const noName = contracts.validate('obj-test', { plate: { note: 'x' } });
  assert.ok(!noName.valid && noName.errors.some((e) => e.includes('required')), 'missing required name fails');
  assert.ok(contracts.validate('obj-test', { plate: { name: 'P1', conc: null } }).valid, 'nullable null passes');
  const badNull = contracts.validate('obj-test', { plate: { name: 'P1', note: null } });
  assert.ok(!badNull.valid && badNull.errors.some((e) => e.includes('got null')), 'non-nullable null fails');
  const wrongType = contracts.validate('obj-test', { plate: { name: 42 } });
  assert.ok(!wrongType.valid && wrongType.errors.some((e) => e.includes('expected string')));
  assert.ok(!contracts.validate('obj-test', { plate: 'nope' }).valid, 'not an object fails');
  assert.ok(!contracts.validate('obj-test', { plate: null }).valid, 'null object fails (not nullable)');
});

// ── Unions ───────────────────────────────────────────────────────────────────

test('anyOf: any one branch passing is enough', () => {
  contracts.define({
    id: 'union-any',
    fields: { v: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
  });
  assert.ok(contracts.validate('union-any', { v: 'x' }).valid);
  assert.ok(contracts.validate('union-any', { v: 42 }).valid);
  const bad = contracts.validate('union-any', { v: true });
  assert.ok(!bad.valid && bad.errors.some((e) => e.includes('any of')), bad.errors.join('; '));
});

test('oneOf: exactly one branch must match (not zero, not two)', () => {
  contracts.define({
    id: 'union-one',
    fields: { v: { oneOf: [{ type: 'number' }, { type: 'integer' }] } },
  });
  // 5.5 matches only number → exactly one → pass
  assert.ok(contracts.validate('union-one', { v: 5.5 }).valid);
  // 5 matches BOTH number and integer → fail (exactly-one semantic)
  const both = contracts.validate('union-one', { v: 5 });
  assert.ok(!both.valid && both.errors.some((e) => e.includes('exactly one')));
  // 'x' matches neither → fail
  const none = contracts.validate('union-one', { v: 'x' });
  assert.ok(!none.valid && none.errors.some((e) => e.includes('exactly one')));
});

test('oneOf with disjoint branches behaves like a discriminated choice', () => {
  contracts.define({
    id: 'union-one2',
    fields: { v: { oneOf: [{ type: 'string' }, { type: 'integer' }] } },
  });
  assert.ok(contracts.validate('union-one2', { v: 7 }).valid);
  assert.ok(!contracts.validate('union-one2', { v: 7.5 }).valid, 'matches no branch');
});

// ── Custom validate hooks ────────────────────────────────────────────────────

test('custom validate hook: true passes, error string fails', () => {
  contracts.define({
    id: 'hook-test',
    fields: {
      dose: {
        type: 'number',
        validate: function (value) {
          if (value <= 0) return 'dose must be positive';
          return true;
        },
      },
    },
  });
  assert.ok(contracts.validate('hook-test', { dose: 5 }).valid);
  assert.ok(contracts.validate('hook-test', { dose: 0.5 }).valid);
  const bad = contracts.validate('hook-test', { dose: -3 });
  assert.ok(!bad.valid && bad.errors.some((e) => e.includes('dose must be positive')));
});

test('validate hook receives ctx with the error path', () => {
  let seenPath = null;
  contracts.define({
    id: 'hook-ctx',
    fields: {
      x: { type: 'number', validate: function (v, c) { seenPath = c.path; return true; } },
    },
  });
  contracts.validate('hook-ctx', { x: 1 });
  assert.equal(seenPath, 'data.x');
});

// ── Public checkValue ────────────────────────────────────────────────────────

test('checkValue is public, composable, and uses types.js path format', () => {
  const schema = {
    type: 'object',
    props: {
      samples: {
        type: 'array', required: true,
        items: { type: 'object', props: { name: { type: 'string', required: true } } },
      },
    },
  };
  const errors = [];
  contracts.checkValue({ samples: [{ name: 'A' }, {}] }, schema, errors, 'data');
  assert.deepEqual(errors, ['data.samples[1].name: required']);

  const ok = [];
  contracts.checkValue({ samples: [{ name: 'A' }] }, schema, ok, 'data');
  assert.equal(ok.length, 0);

  // nested path format matches v1: dotted props, indices, quoted map keys
  const keyErrors = [];
  contracts.checkValue({ a1: 'x' },
    { type: 'map', keyPattern: /^[A-Z]+\d+$/, values: { type: 'string' } }, keyErrors, 'data');
  assert.deepEqual(keyErrors, ['data["a1"]: key "a1" does not match /^[A-Z]+\\d+$/']);

  const nested = [];
  contracts.checkValue({ A1: 'ok', B2: 5 },
    { type: 'map', keyPattern: /^[A-Z]+\d+$/, values: { type: 'string' } }, nested, 'data.wells');
  assert.deepEqual(nested, ['data.wells["B2"]: expected string, got number']);
});

// ── Top-level payload validation ─────────────────────────────────────────────

test('validate: partial mode ignores unknown fields (default)', () => {
  contracts.define({ id: 'partial-test', fields: { known: { type: 'string' } } });
  assert.ok(contracts.validate('partial-test', { known: 'a' }).valid);
  assert.ok(contracts.validate('partial-test', { known: 'a', extra: 123, other: 'x' }).valid,
    'unknown fields ignored in partial mode');
  assert.ok(contracts.validate('partial-test', { extra: { nested: true } }).valid,
    'only fields present are checked');
  assert.ok(contracts.validate('partial-test', {}).valid, 'empty payload passes in partial mode');
  // partial:false rejects unknown fields
  const strict = contracts.validate('partial-test', { known: 'a', extra: 1 }, { partial: false });
  assert.ok(!strict.valid && strict.errors.some((e) => e.includes('unknown field')));
  // …and requires declared required fields
  contracts.define({
    id: 'strict-test',
    fields: { need: { type: 'string', required: true }, maybe: { type: 'number' } },
  });
  const missing = contracts.validate('strict-test', { maybe: 1 }, { partial: false });
  assert.ok(!missing.valid && missing.errors.some((e) => e.includes('data.need: required')));
  assert.ok(contracts.validate('strict-test', { need: 'x', maybe: 1 }, { partial: false }).valid);
});

test('validate: opts.version above contract version errors, at/below passes', () => {
  contracts.define({ id: 'ver-test', version: 1, fields: { a: { type: 'string' } } });
  assert.ok(contracts.validate('ver-test', { a: 'x' }).valid, 'no version option → no guard');
  assert.ok(contracts.validate('ver-test', { a: 'x' }, { version: 1 }).valid, 'equal version ok');
  assert.ok(contracts.validate('ver-test', { a: 'x' }, { version: 0 }).valid, 'lower version ok');
  const future = contracts.validate('ver-test', { a: 'x' }, { version: 2 });
  assert.ok(!future.valid && future.errors.some((e) => e.includes('version')),
    `future version must fail: ${future.errors.join('; ')}`);
});

test('validate on an undefined contract reports an error', () => {
  const check = contracts.validate('no-such-contract', { a: 1 });
  assert.ok(!check.valid);
  assert.ok(check.errors.some((e) => e.includes('not defined')));
});

test('validate rejects a non-object payload', () => {
  contracts.define({ id: 'shape-test', fields: { a: { type: 'string' } } });
  assert.ok(!contracts.validate('shape-test', 'just a string').valid);
  assert.ok(!contracts.validate('shape-test', null).valid);
  assert.ok(!contracts.validate('shape-test', [1, 2]).valid);
});

// ── Degradation without window.DATA_TYPES ────────────────────────────────────

test('fromLegacy returns null when window.DATA_TYPES is absent', () => {
  assert.equal(contracts.fromLegacy('plate-layout'), null);
  assert.equal(contracts.fromLegacy('anything'), null);
});

test('syncLegacy is a safe no-op when window.DATA_TYPES is absent', () => {
  const result = contracts.syncLegacy();
  assert.equal(result.mapped, 0);
  assert.equal(result.missing.length, 0);
});

test('bare Node load (no window, no DATA_TYPES): module loads and degrades safely', () => {
  const code = readFileSync(join(ROOT, 'assets/js/labtools-contracts.js'), 'utf8');
  const sandbox = { console: console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'assets/js/labtools-contracts.js' });
  const c = sandbox.labtools.contracts;
  assert.equal(typeof c.define, 'function');
  assert.equal(c.fromLegacy('plate-layout'), null);
  const result = c.syncLegacy();
  assert.equal(result.mapped, 0);
  assert.equal(result.missing.length, 0);
  // registry still fully usable in the bare environment
  c.define({ id: 'x', fields: { a: { type: 'integer' } } });
  assert.ok(c.validate('x', { a: 1 }).valid);
  assert.ok(!c.validate('x', { a: 1.5 }).valid);
});

// ── Legacy mapping (DATA_TYPES injected into the same VM context) ────────────

test('labtools-types.js also registers itself in __labtoolsLoadOrder', () => {
  assert.ok(typesCtx.window.__labtoolsLoadOrder.includes('labtools-types'));
});

test('fromLegacy maps a registered legacy type to its contract id', () => {
  assert.equal(legacyContracts.fromLegacy('plate-layout'), 'plate-layout');
  assert.equal(legacyContracts.fromLegacy('protocol'), 'protocol');
  assert.equal(legacyContracts.fromLegacy('no-such-type'), null);
});

test('syncLegacy creates a contract for every DATA_TYPES key', () => {
  const keys = Object.keys(typesCtx.DATA_TYPES);
  const result = legacyContracts.syncLegacy();
  assert.equal(result.mapped, keys.length);
  assert.equal(result.missing.length, 0);
  for (const type of keys) {
    assert.ok(legacyContracts.has(type), `missing contract for ${type}`);
    const def = legacyContracts.get(type);
    const legacy = typesCtx.DATA_TYPES[type];
    assert.equal(def.id, type);
    assert.equal(def.name, legacy.name);
    assert.equal(def.icon, legacy.icon);
    assert.equal(def.color, legacy.color);
    assert.equal(def.description, legacy.description);
    assert.equal(def.version, 1);
    assert.ok(deepEqualJson(Object.keys(def.fields), [type]),
      `contract ${type} should expose one field under its own id`);
  }
});

test('syncLegacy: legacy fixtures validate against their synced contracts', () => {
  const cases = [
    ['plate-layout-96.json', 'plate-layout'],
    ['plate-layout-8plate.json', 'plate-layout'],
    ['sample-list-rt.json', 'sample-list'],
    ['sample-list-cell.json', 'sample-list'],
    ['conc-data.json', 'conc-data'],
    ['seeding-plan.json', 'seeding-plan'],
    ['protocol.json', 'protocol'],
  ];
  for (const [file, type] of cases) {
    const data = loadFixture(file);
    // legacy payloads ride as a single field under their type id
    const check = legacyContracts.validate(type, { [type]: data });
    assert.ok(check.valid, `${file} should validate as ${type}: ${check.errors.join('; ')}`);
  }

  // the translation is structural, not a rubber stamp
  const badPlate = legacyContracts.validate('plate-layout', { 'plate-layout': { plates: 'nope' } });
  assert.ok(!badPlate.valid, 'corrupt plate-layout payload must fail');
  const badProto = legacyContracts.validate('protocol', { protocol: { steps: [{ solution: 'Fix' }] } });
  assert.ok(!badProto.valid && badProto.errors.some((e) => e.includes('required')),
    'translated schema still enforces required props');
  const badWell = legacyContracts.validate('plate-layout', {
    'plate-layout': { plates: [{ name: 'P', plateType: '96', assignments: { a1: {} } }] },
  });
  assert.ok(!badWell.valid && badWell.errors.some((e) => e.includes('does not match')),
    'translated keyPattern still rejects malformed well ids');
});

test('syncLegacy does not overwrite an existing contract with the same id (gaps only)', () => {
  // fresh context: pre-define one id, then sync — only the missing keys map
  const freshCtx = loadBrowserJs('assets/js/labtools-contracts.js');
  freshCtx.window.DATA_TYPES = typesCtx.DATA_TYPES;
  const fresh = freshCtx.labtools.contracts;
  fresh.define({
    id: 'seeding-plan',
    name: 'Custom Seeding',
    fields: { custom: { type: 'string' } },
  });
  const result = fresh.syncLegacy();
  const def = fresh.get('seeding-plan');
  assert.equal(def.name, 'Custom Seeding');
  assert.ok(deepEqualJson(Object.keys(def.fields), ['custom']), 'existing contract untouched');
  // every OTHER DATA_TYPES key gets mapped on this pass
  assert.equal(result.mapped, Object.keys(typesCtx.DATA_TYPES).length - 1);
});
