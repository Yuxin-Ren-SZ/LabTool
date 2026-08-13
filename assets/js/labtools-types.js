/**
 * LabTools — Data Contract Registry
 * ===================================
 * Central definition of every workbench data type: what shape the payload
 * must have, which tools produce it, and which tools consume it.
 *
 * The registry is the SINGLE SOURCE OF TRUTH for data shapes. Tools declare
 * which types they produce/consume via `labtoolsRegisterToolTypes`, and the
 * unit tests verify that every declared type exists here and that fixtures
 * validate against these schemas (strict mode).
 *
 * Loaded via <script src="../../assets/js/labtools-types.js"> BEFORE
 * labtools-workbench.js in every page that uses the workbench.
 *
 * Exposes:
 *   window.DATA_TYPES                 — type -> { name, icon, color, description, producers, consumers, schema }
 *   window.labtoolsRegisterToolTypes  — tool -> { produces: [], consumes: [] }
 *   window.validateWorkbenchType(type, data) -> { valid, errors }
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Schema mini-language
// ─────────────────────────────────────────────────────────────────────────────
// A schema is a plain object with:
//   type:       'object' | 'array' | 'map' | 'string' | 'number' | 'integer'
//               | 'boolean' | 'any'
//   required:   bool (for object props / array items / map values)
//   props:      { key: schema }            (type 'object')
//   items:      schema                     (type 'array')
//   keyPattern: RegExp                     (type 'map' — well-id keys etc.)
//   values:     schema                     (type 'map')
//   enum:       [allowed values]           (strings/numbers)
//   nullable:   bool — also accept null     (default false)

function checkType(v, schema, errors, path) {
  if (v === null || v === undefined) {
    if (schema.nullable) return;
    errors.push(`${path}: expected ${schema.type}, got ${v === null ? 'null' : 'undefined'}`);
    return;
  }

  switch (schema.type) {
    case 'any':
      return;

    case 'string':
      if (typeof v !== 'string') errors.push(`${path}: expected string, got ${typeof v}`);
      else if (schema.enum && !schema.enum.includes(v)) {
        errors.push(`${path}: value "${v}" not in [${schema.enum.join(', ')}]`);
      }
      return;

    case 'number':
      if (typeof v !== 'number' || Number.isNaN(v)) errors.push(`${path}: expected number, got ${typeof v}`);
      else if (schema.enum && !schema.enum.includes(v)) {
        errors.push(`${path}: value ${v} not in [${schema.enum.join(', ')}]`);
      }
      return;

    case 'integer':
      if (!Number.isInteger(v)) errors.push(`${path}: expected integer, got ${v}`);
      return;

    case 'boolean':
      if (typeof v !== 'boolean') errors.push(`${path}: expected boolean, got ${typeof v}`);
      return;

    case 'object': {
      if (typeof v !== 'object' || Array.isArray(v)) {
        errors.push(`${path}: expected object, got ${Array.isArray(v) ? 'array' : typeof v}`);
        return;
      }
      const props = schema.props || {};
      for (const [key, sub] of Object.entries(props)) {
        if (v[key] === undefined || v[key] === null) {
          if (sub.required) errors.push(`${path}.${key}: required`);
          else if (!sub.nullable && v[key] === null) errors.push(`${path}.${key}: expected ${sub.type}, got null`);
          continue;
        }
        checkType(v[key], sub, errors, `${path}.${key}`);
      }
      return;
    }

    case 'array': {
      if (!Array.isArray(v)) { errors.push(`${path}: expected array, got ${typeof v}`); return; }
      if (schema.items) {
        v.forEach((item, i) => checkType(item, schema.items, errors, `${path}[${i}]`));
      }
      return;
    }

    case 'map': {
      if (typeof v !== 'object' || Array.isArray(v)) {
        errors.push(`${path}: expected map/object, got ${Array.isArray(v) ? 'array' : typeof v}`);
        return;
      }
      for (const [key, val] of Object.entries(v)) {
        const kp = `${path}["${key}"]`;
        if (schema.keyPattern && !schema.keyPattern.test(key)) {
          errors.push(`${kp}: key "${key}" does not match ${schema.keyPattern}`);
        }
        checkType(val, schema.values, errors, kp);
      }
      return;
    }

    default:
      errors.push(`${path}: unknown schema type "${schema.type}"`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Data type definitions
// ─────────────────────────────────────────────────────────────────────────────

const DATA_TYPES = {

  // ── Microplate layout (produced by microplate-layout-planner) ─────────────
  'plate-layout': {
    name: 'Microplate Layout',
    icon: '📋',
    color: '#5c8dff',
    description: 'One or more plates with per-well assignments (group, sample, gene, custom fields).',
    producers: ['microplate-layout-planner', 'qpcr-plate-planner'],
    consumers: ['qpcr-analysis', 'bca-assay', 'microplate-layout-planner', 'thermal-to-laser'],
    schema: {
      type: 'object',
      props: {
        plates: {
          type: 'array', required: true,
          items: {
            type: 'object',
            props: {
              name:       { type: 'string', required: true },
              plateType:  { type: 'string', enum: ['6', '12', '24', '48', '96', '384', '1536'], required: true },
              cutCorners: { type: 'array', items: { type: 'string' } },
              assignments: {
                type: 'map', required: true,
                // Well IDs across all plate formats: rows A–Z and AA–AF (1536),
                // columns 1–48. Row A–H only would reject 384/1536 layouts.
                keyPattern: /^[A-Z]{1,2}[0-9]{1,3}$/,
                values: { type: 'object' },
              },
            },
          },
        },
        fields: { type: 'array', items: { type: 'object' } },
        categoriesByField: { type: 'object' },
      },
    },
  },

  // ── Sample list (RNA/DNA concentrations; produced by rt-calc, cell-count) ─
  'sample-list': {
    name: 'Sample List',
    icon: '🧪',
    color: '#57a85a',
    description: 'Named samples with concentration and optional purity ratios.',
    producers: ['rt-calc', 'cell-count'],
    consumers: ['qpcr-analysis', 'seeding-calc', 'rt-calc'],
    schema: {
      type: 'object',
      props: {
        samples: {
          type: 'array', required: true,
          items: {
            type: 'object',
            props: {
              name:      { type: 'string', required: true },
              conc:      { type: 'number', nullable: true },
              unit:      { type: 'string' },
              a260_280:  { type: 'number', nullable: true },
              a260_230:  { type: 'number', nullable: true },
            },
          },
        },
      },
    },
  },

  // ── Concentration results (BCA/ELISA; produced by bca-assay) ──────────────
  'conc-data': {
    name: 'Concentration Data',
    icon: '📊',
    color: '#d97706',
    description: 'Calculated sample concentrations (e.g. BCA protein assay).',
    producers: ['bca-assay'],
    consumers: ['rt-calc', 'seeding-calc'],
    schema: {
      type: 'object',
      props: {
        results: {
          type: 'array', required: true,
          items: {
            type: 'object',
            props: {
              sample: { type: 'string', required: true },
              // Producers (e.g. bca-assay) emit null for blank/invalid rows,
              // so conc is nullable — required:true would reject those saves.
              conc:   { type: 'number', nullable: true },
              unit:   { type: 'string' },
              flag:   { type: 'string' },
              cv:     { type: 'number', nullable: true },
            },
          },
        },
        unit:     { type: 'string' },
        model:    { type: 'any' },
        fitModel: { type: 'string' },
      },
    },
  },

  // ── qPCR results (produced by qpcr-analysis) ──────────────────────────────
  'qpcr-results': {
    name: 'qPCR Results',
    icon: '📈',
    color: '#e03e3e',
    description: 'Analyzed qPCR run: per-well labels, plate layout, notes.',
    producers: ['qpcr-analysis'],
    consumers: [],
    schema: {
      type: 'object',
      props: {
        expName:    { type: 'string' },
        plateCount: { type: 'integer' },
        dyes:       { type: 'array', items: { type: 'string' } },
        targets:    { type: 'array', items: { type: 'string' } },
        wellCount:  { type: 'integer' },
        wells:      { type: 'map', values: { type: 'object' } },
        notes:      { type: 'string' },
      },
    },
  },

  // ── Seeding plan (produced by seeding-calc) ───────────────────────────────
  'seeding-plan': {
    name: 'Seeding Plan',
    icon: '⚗️',
    color: '#8e44ad',
    description: 'Stock concentration and dilution volumes (C1V1 = C2V2).',
    producers: ['seeding-calc'],
    consumers: [],
    schema: {
      type: 'object',
      props: {
        stockConc:       { type: 'number', nullable: true },
        unit:            { type: 'string' },
        c1:              { type: 'string', nullable: true },
        c2:              { type: 'string', nullable: true },
        v1:              { type: 'string', nullable: true },
        v2:              { type: 'string', nullable: true },
        step1TotalVolML: { type: 'number', nullable: true },
      },
    },
  },

  // ── Staining protocol (produced/consumed by stain-timer) ──────────────────
  protocol: {
    name: 'Protocol',
    icon: '⏱',
    color: '#2c7fb8',
    description: 'Ordered protocol steps with durations and slots.',
    producers: ['stain-timer'],
    consumers: ['stain-timer'],
    schema: {
      type: 'object',
      props: {
        steps: {
          type: 'array', required: true,
          items: {
            type: 'object',
            props: {
              solution:     { type: 'string', required: true },
              durationMin:  { type: 'number', required: true },
              durationSec:  { type: 'number', required: true },
              slot:         { type: 'string', required: true },
            },
          },
        },
      },
    },
  },

  // ── Universal tool artifact (params + declared outputs) ───────────────────
  // The canonical envelope every migrated tool stores/exports. `params` is the
  // full control state (recovers the tool); `outputs` carries wireable field
  // values (see docs/output-fields.md). Wiring/discovery is by output field-id,
  // not by this type — this type only pins the envelope's storage shape.
  artifact: {
    name: 'Artifact',
    icon: '🧷',
    color: '#6b7280',
    description: 'Canonical tool artifact: full params for recovery + declared output fields.',
    producers: [],
    consumers: [],
    schema: {
      type: 'object',
      props: {
        schemaVersion: { type: 'integer', required: true },
        tool:          { type: 'string', required: true },
        params:        { type: 'object', required: true },
        inputs:        { type: 'object' },
        outputs:       { type: 'object' },
      },
    },
  },

  // ── Catch-all for ad-hoc data ──────────────────────────────────────────────
  generic: {
    name: 'Generic',
    icon: '📄',
    color: '#9b9a97',
    description: 'Unstructured data — any JSON-serializable payload.',
    producers: [],
    consumers: [],
    schema: { type: 'any' },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a payload against a data type's schema.
 * @param {string} type  e.g. 'plate-layout'
 * @param {*} data       the payload
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateWorkbenchType(type, data) {
  const def = DATA_TYPES[type] || DATA_TYPES.generic;
  if (def.schema.type === 'any') return { valid: true, errors: [] };
  const errors = [];
  checkType(data, def.schema, errors, 'data');
  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool declarations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Declare which data types a tool produces and consumes.
 * The unit tests assert every declared type exists in DATA_TYPES.
 *
 * @param {string} toolName  e.g. 'qpcr-analysis'
 * @param {string[]} produces  types this tool can save to the workbench
 * @param {string[]} consumes  types this tool can load from the workbench
 */
function labtoolsRegisterToolTypes(toolName, produces, consumes) {
  window.__labtoolsToolTypes = window.__labtoolsToolTypes || {};
  window.__labtoolsToolTypes[toolName] = {
    produces: produces || [],
    consumes: consumes || [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

window.DATA_TYPES = DATA_TYPES;
window.labtoolsRegisterToolTypes = labtoolsRegisterToolTypes;
window.validateWorkbenchType = validateWorkbenchType;
(window.__labtoolsLoadOrder = window.__labtoolsLoadOrder || []).push('labtools-types');
