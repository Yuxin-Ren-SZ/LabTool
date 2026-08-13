/**
 * Unit tests for generated fixtures — schema validation + stability.
 * Run: node --test tests/unit/   (after `node scripts/gen-fixtures.mjs`)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

function load(name) {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

// ── Workbench item schemas ───────────────────────────────────────────────────

function assertWorkbenchItemShape(item, type) {
  assert.equal(item.type, type, `item.type should be ${type}`);
  assert.ok(typeof item.label === 'string' && item.label.length > 0, 'label is non-empty string');
  assert.ok(typeof item.timestamp === 'number', 'timestamp is number');
  assert.ok(item.data && typeof item.data === 'object', 'data is object');
  assert.ok(!item.metadata || typeof item.metadata === 'object', 'metadata is object or absent');
}

test('plate-layout-96.json: valid single-plate layout', () => {
  const data = load('plate-layout-96.json');
  assert.ok(Array.isArray(data.plates) && data.plates.length === 1);
  const plate = data.plates[0];
  assert.equal(plate.plateType, '96');
  assert.ok(plate.assignments && typeof plate.assignments === 'object');
  const wells = Object.keys(plate.assignments);
  assert.ok(wells.length >= 40, `expected ~60% of 96 wells assigned, got ${wells.length}`);
  // well IDs are A1..H12
  wells.forEach((w) => assert.match(w, /^[A-H]([1-9]|1[0-2])$/));
  // assignments carry group (category id), sample, gene
  const rec = plate.assignments[wells[0]];
  assert.ok('group' in rec, 'assignment has group');
  assert.ok('sample' in rec, 'assignment has sample');
  assert.ok('gene' in rec, 'assignment has gene');
  assert.ok(data.categoriesByField.group.length >= 3, '≥3 groups defined');
  // fields shape
  assert.ok(Array.isArray(data.fields));
  data.fields.forEach((f) => {
    assert.ok(['category', 'text'].includes(f.kind));
    assert.ok(f.id && f.key && f.name);
  });
});

test('plate-layout-8plate.json: 8 plates, HPRT1 anchor on every plate', () => {
  const data = load('plate-layout-8plate.json');
  assert.equal(data.plates.length, 8);
  data.plates.forEach((plate) => {
    assert.equal(plate.plateType, '96');
    const wells = Object.keys(plate.assignments);
    assert.ok(wells.length > 20, `plate ${plate.name} has wells`);
    // every plate has HPRT1 assignments
    const genes = new Set(Object.values(plate.assignments).map((a) => a.gene));
    assert.ok(genes.has('HPRT1'), `plate ${plate.name} anchors HPRT1`);
  });
});

test('conc-data.json: known concentrations match linear fit', () => {
  const data = load('conc-data.json');
  assert.ok(Array.isArray(data.results) && data.results.length === 6);
  data.results.forEach((r) => {
    assert.ok(r.sample && typeof r.sample === 'string');
    assert.ok(typeof r.conc === 'number' && r.conc > 0);
    assert.equal(r.unit, 'µg/mL');
  });
  // OD = 0.0008·conc + 0.06 → conc = (OD−0.06)/0.0008
  const expected = [0.350, 0.520, 0.780, 1.040, 0.610, 0.890].map((od) => (od - 0.06) / 0.0008);
  data.results.forEach((r, i) => {
    assert.ok(Math.abs(r.conc - expected[i]) < 0.11, `conc[${i}] ≈ ${expected[i]}, got ${r.conc}`);
  });
});

test('sample-list-rt.json: valid rt-calc payload', () => {
  const data = load('sample-list-rt.json');
  assert.ok(data.samples.length === 6);
  data.samples.forEach((s) => {
    assert.ok(s.name);
    assert.ok(typeof s.conc === 'number' && s.conc > 0);
    assert.equal(s.unit, 'ng/µL');
    assert.ok(s.a260_280 >= 1.7 && s.a260_280 <= 2.2);
    assert.ok(s.a260_230 >= 1.2 && s.a260_230 <= 2.5);
  });
});

test('sample-list-cell.json: single cell-suspension sample', () => {
  const data = load('sample-list-cell.json');
  assert.equal(data.samples.length, 1);
  assert.equal(data.samples[0].name, 'Cell Suspension');
  assert.equal(data.samples[0].unit, 'cells/mL');
  assert.ok(Number.isInteger(data.samples[0].conc));
});

test('seeding-plan.json: valid seeding-calc payload', () => {
  const data = load('seeding-plan.json');
  assert.equal(data.unit, 'cells/mL');
  assert.ok(data.stockConc > 0);
  assert.ok(data.c1 && data.c2 && data.v1 && data.v2);
});

test('protocol.json: 6 steps with durations + slots', () => {
  const data = load('protocol.json');
  assert.equal(data.steps.length, 6);
  data.steps.forEach((s) => {
    assert.ok(s.solution);
    assert.ok(typeof s.durationMin === 'number');
    assert.ok(typeof s.durationSec === 'number');
    assert.ok(s.slot);
  });
});

test('workbench-bundle.json: export envelope round-trips', () => {
  const bundle = load('workbench-bundle.json');
  assert.equal(bundle.version, 1);
  assert.ok(typeof bundle.exportedAt === 'string');
  assert.ok(Array.isArray(bundle.items) && bundle.items.length === 2);
  bundle.items.forEach((item) => {
    assert.ok(item.id && item.label && item.tool);
    assert.ok(typeof item.timestamp === 'number');
  });
  // Items match their types
  assertWorkbenchItemShape(bundle.items[0], 'plate-layout');
  assertWorkbenchItemShape(bundle.items[1], 'conc-data');
});

// ── Raw instrument exports ───────────────────────────────────────────────────

test('aria-mx-tabular.txt: parses into expected row count', () => {
  const text = readFileSync(join(FIXTURES, 'aria-mx-tabular.txt'), 'utf8');
  // NOTE: not .trim() — the final NRT row legitimately ends with empty
  // fields (trailing tabs); trim would silently drop them.
  const lines = text.replace(/\n$/, '').split('\n');
  assert.equal(lines[0].split('\t')[0], 'Well');
  // header + 3 targets × (6 samples × 2 reps) + 3 NTC + 1 NRT
  assert.equal(lines.length - 1, 3 * 12 + 4);
  // tab-separated with 16 columns
  lines.slice(1).forEach((l) => assert.equal(l.split('\t').length, 16));
});

test('aria-mx-tabular-crlf.txt: CRLF variant has identical content modulo EOL', () => {
  const lf = readFileSync(join(FIXTURES, 'aria-mx-tabular.txt'), 'utf8');
  const crlf = readFileSync(join(FIXTURES, 'aria-mx-tabular-crlf.txt'), 'utf8');
  assert.equal(crlf.replace(/\r\n/g, '\n'), lf);
  assert.ok(crlf.includes('\r\n'), 'CRLF file actually uses CRLF');
});

test('aria-mx-platesetup.txt: header well + sample name', () => {
  const text = readFileSync(join(FIXTURES, 'aria-mx-platesetup.txt'), 'utf8');
  const header = text.trim().split('\n')[0].split('\t');
  assert.ok(header.includes('Well'));
  assert.ok(header.includes('Sample Name'));
});

test('nanodrop.csv: tab-separated with expected header', () => {
  const text = readFileSync(join(FIXTURES, 'nanodrop.csv'), 'utf8');
  const lines = text.trim().split('\n');
  const header = lines[0].split('\t');
  assert.ok(header.includes('Nucleic Acid(ng/uL)'));
  assert.ok(header.includes('A260/A280'));
  assert.equal(lines.length - 1, 6);
});

test('bca-raw.txt: SoftMax-style with Temperature header + 8 data rows', () => {
  const text = readFileSync(join(FIXTURES, 'bca-raw.txt'), 'utf8');
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const hi = lines.findIndex((l) => l.includes('Temperature'));
  assert.ok(hi >= 0, 'has Temperature line');
  const dataRows = lines.slice(hi + 1).filter((l) => l.trim() && !l.startsWith('~'));
  assert.equal(dataRows.length, 8);
  dataRows.forEach((l) => {
    const cols = l.split('\t');
    assert.ok(cols.length >= 14, 'row has 2 meta cols + 12 ODs');
    cols.slice(2, 14).forEach((v) => assert.ok(!Number.isNaN(parseFloat(v))));
  });
});

test('bca-manual.json: valid manual-mode state', () => {
  const data = load('bca-manual.json');
  assert.ok(Array.isArray(data.stdRows) && data.stdRows.length === 9);
  assert.ok(Array.isArray(data.smpRows) && data.smpRows.length === 6);
  data.stdRows.forEach((s) => assert.ok(typeof s.conc === 'number'));
  data.smpRows.forEach((s) => assert.ok(s.name && typeof s.df === 'number'));
});

// ── Determinism / stability ──────────────────────────────────────────────────

test('fixtures are complete (all expected files present)', () => {
  const expected = [
    'plate-layout-96.json', 'plate-layout-8plate.json',
    'aria-mx-tabular.txt', 'aria-mx-tabular-crlf.txt', 'aria-mx-platesetup.txt',
    'nanodrop.csv', 'bca-raw.txt', 'bca-manual.json',
    'conc-data.json', 'sample-list-rt.json', 'sample-list-cell.json',
    'seeding-plan.json', 'protocol.json', 'workbench-bundle.json',
  ];
  const actual = readdirSync(FIXTURES).sort();
  expected.forEach((f) => assert.ok(actual.includes(f), `missing fixture ${f}`));
});
