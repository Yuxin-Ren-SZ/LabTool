/**
 * Unit tests for the data-contract registry (assets/js/labtools-types.js).
 * Run: node --test tests/unit/
 *
 * Covers:
 *   • every fixture validates against its type's schema (strict mode)
 *   • every tool's declared produce/consume types exist in the registry
 *   • schema violations are detected (negative cases)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserJs } from './helpers.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const ctx = loadBrowserJs('assets/js/labtools-types.js', ['DATA_TYPES']);
const { DATA_TYPES, validateWorkbenchType } = ctx;

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

// ── Fixture → schema validation (strict mode) ────────────────────────────────

test('every JSON fixture validates against its data-type schema', () => {
  const cases = [
    ['plate-layout-96.json', 'plate-layout'],
    ['plate-layout-8plate.json', 'plate-layout'],
    ['conc-data.json', 'conc-data'],
    ['sample-list-rt.json', 'sample-list'],
    ['sample-list-cell.json', 'sample-list'],
    ['seeding-plan.json', 'seeding-plan'],
    ['protocol.json', 'protocol'],
    ['bca-manual.json', 'generic'],        // raw tool state, not a workbench payload
    ['workbench-bundle.json', 'generic'],  // envelope, not a payload
  ];
  for (const [file, type] of cases) {
    const data = loadFixture(file);
    const check = validateWorkbenchType(type, data);
    assert.ok(check.valid, `${file} should validate as ${type}: ${check.errors.join('; ')}`);
  }
});

test('workbench-bundle items validate against their item types', () => {
  const bundle = loadFixture('workbench-bundle.json');
  for (const item of bundle.items) {
    const check = validateWorkbenchType(item.type, item.data);
    assert.ok(check.valid, `${item.label} (${item.type}) invalid: ${check.errors.join('; ')}`);
  }
});

// ── Schema details per type ──────────────────────────────────────────────────

test('plate-layout schema: well ids, plate types, required plates', () => {
  // valid 96-well keys pass
  assert.ok(validateWorkbenchType('plate-layout', {
    plates: [{ name: 'P', plateType: '96', assignments: { A1: { group: 'c1' }, H12: {} } }],
  }).valid);

  // 384/1536 well keys (rows past H, incl. two-letter AA–AF) pass —
  // regression: keyPattern [A-H] used to reject these, breaking every save.
  assert.ok(validateWorkbenchType('plate-layout', {
    plates: [{ name: 'P', plateType: '384', assignments: { I1: {}, P24: {} } }],
  }).valid, '384-well rows I–P must be accepted');
  assert.ok(validateWorkbenchType('plate-layout', {
    plates: [{ name: 'P', plateType: '1536', assignments: { AA1: {}, AF48: {} } }],
  }).valid, '1536-well rows AA–AF must be accepted');

  // genuinely malformed well key still fails (lowercase / trailing letter)
  const badKey = validateWorkbenchType('plate-layout', {
    plates: [{ name: 'P', plateType: '96', assignments: { a1: {} } }],
  });
  assert.ok(!badKey.valid && badKey.errors.some((e) => e.includes('does not match')));

  // invalid plate type fails
  const badType = validateWorkbenchType('plate-layout', {
    plates: [{ name: 'P', plateType: '1024', assignments: {} }],
  });
  assert.ok(!badType.valid && badType.errors.some((e) => e.includes('not in')));

  // missing plates fails
  const noPlates = validateWorkbenchType('plate-layout', { fields: [] });
  assert.ok(!noPlates.valid && noPlates.errors.some((e) => e.includes('required')));
});

test('plate-layout: custom fields are allowed (flexible assignments)', () => {
  const check = validateWorkbenchType('plate-layout', {
    plates: [{
      name: 'P',
      plateType: '96',
      assignments: {
        A1: { group: 'c1', sample: 'S1', gene: 'HPRT1', treatment_dose: '5 µM', passage: 12 },
      },
    }],
  });
  assert.ok(check.valid, `custom fields must be allowed: ${check.errors.join('; ')}`);
});

test('sample-list schema: name required, conc optional', () => {
  assert.ok(validateWorkbenchType('sample-list', {
    samples: [{ name: 'A', conc: 100, unit: 'ng/µL', a260_280: 1.9, a260_230: 2.1 }],
  }).valid);
  // missing name fails
  const noName = validateWorkbenchType('sample-list', { samples: [{ conc: 100 }] });
  assert.ok(!noName.valid && noName.errors.some((e) => e.includes('required')));
  // conc can be null (unknown)
  assert.ok(validateWorkbenchType('sample-list', { samples: [{ name: 'A', conc: null }] }).valid);
});

test('conc-data schema: results/sample required, conc nullable', () => {
  assert.ok(validateWorkbenchType('conc-data', {
    results: [{ sample: 'S1', conc: 124.5, unit: 'µg/mL' }],
    unit: 'µg/mL',
  }).valid);
  // conc may be null for blank/invalid rows — regression: conc:required used
  // to reject bca-assay saves whenever any sample OD was missing.
  assert.ok(validateWorkbenchType('conc-data', {
    results: [{ sample: 'S1', conc: null, unit: 'µg/mL', flag: '', cv: null }],
  }).valid, 'null conc must be accepted');
  // a non-number, non-null conc is still rejected
  const badConc = validateWorkbenchType('conc-data', { results: [{ sample: 'S1', conc: 'lots' }] });
  assert.ok(!badConc.valid && badConc.errors.some((e) => e.includes('expected number')));
  // sample is still required
  const noSample = validateWorkbenchType('conc-data', { results: [{ conc: 1 }] });
  assert.ok(!noSample.valid && noSample.errors.some((e) => e.includes('required')));
});

test('protocol schema: steps required, each with solution + durations + slot', () => {
  assert.ok(validateWorkbenchType('protocol', {
    steps: [{ solution: 'Fix', durationMin: 10, durationSec: 0, slot: '1' }],
  }).valid);
  const bad = validateWorkbenchType('protocol', { steps: [{ solution: 'Fix' }] });
  assert.ok(!bad.valid && bad.errors.some((e) => e.includes('required')));
});

test('generic accepts anything', () => {
  assert.ok(validateWorkbenchType('generic', 'just a string').valid);
  assert.ok(validateWorkbenchType('generic', { anything: [1, 2, 3] }).valid);
  assert.ok(validateWorkbenchType('generic', null).valid);
});

// ── Tool declarations ↔ registry consistency ────────────────────────────────

test('every tool type declaration exists in DATA_TYPES', () => {
  // Scan each tool page for labtoolsRegisterToolTypes('name', [...], [...])
  const toolDirs = readdirSync(join(ROOT, 'tools'))
    .filter((d) => !d.startsWith('.') && !d.includes('design'))
    .filter((d) => {
      try { readFileSync(join(ROOT, 'tools', d, 'index.html'), 'utf8'); return true; }
      catch (_) { return false; }
    });

  const declared = []; // { tool, produces, consumes }
  const stripQuotes = (s) => s.trim().replace(/^['"]|['"]$/g, '').trim();
  for (const dir of toolDirs) {
    const html = readFileSync(join(ROOT, 'tools', dir, 'index.html'), 'utf8');
    const re = /labtoolsRegisterToolTypes\(\s*'([^']+)'\s*,\s*\[([^\]]*)\]\s*,\s*\[([^\]]*)\]\s*\)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const produces = m[2].split(',').map(stripQuotes).filter(Boolean);
      const consumes = m[3].split(',').map(stripQuotes).filter(Boolean);
      declared.push({ tool: m[1], produces, consumes });
    }
  }

  assert.ok(declared.length >= 8, `expected ≥8 tools to register types, got ${declared.length}`);
  for (const d of declared) {
    for (const t of [...d.produces, ...d.consumes]) {
      assert.ok(DATA_TYPES[t], `tool ${d.tool} declared unknown type "${t}"`);
    }
    // tool name matches the folder name
    assert.ok(toolDirs.includes(d.tool), `registration tool name "${d.tool}" should match a tools/ folder`);
  }
});

test('registry producers/consumers lists match tool declarations (round-trip)', () => {
  // Every producer listed in the registry must have a tool page that declares it.
  const toolDirs = readdirSync(join(ROOT, 'tools'))
    .filter((d) => !d.startsWith('.') && !d.includes('design'));
  const declaredByTool = {};
  for (const dir of toolDirs) {
    let html;
    try { html = readFileSync(join(ROOT, 'tools', dir, 'index.html'), 'utf8'); }
    catch (_) { continue; }
    const re = /labtoolsRegisterToolTypes\(\s*'([^']+)'\s*,\s*\[([^\]]*)\]\s*,\s*\[([^\]]*)\]\s*\)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      declaredByTool[m[1]] = {
        produces: m[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '').trim()).filter(Boolean),
        consumes: m[3].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '').trim()).filter(Boolean),
      };
    }
  }

  for (const [type, def] of Object.entries(DATA_TYPES)) {
    if (type === 'generic') continue;
    for (const producer of def.producers || []) {
      assert.ok(declaredByTool[producer], `${type}: registry lists producer "${producer}" but no tool registered it`);
      assert.ok(
        declaredByTool[producer].produces.includes(type),
        `${type}: registry says "${producer}" produces it, but the tool declares produces=[${declaredByTool[producer].produces}]`
      );
    }
    for (const consumer of def.consumers || []) {
      assert.ok(declaredByTool[consumer], `${type}: registry lists consumer "${consumer}" but no tool registered it`);
      assert.ok(
        declaredByTool[consumer].consumes.includes(type),
        `${type}: registry says "${consumer}" consumes it, but the tool declares consumes=[${declaredByTool[consumer].consumes}]`
      );
    }
  }
});
