'use strict';

/**
 * LabTools — Artifact model
 * =========================
 * One canonical shape for everything a tool stores or exports. A tool is treated
 * as a pure function `outputs = f(inputs, params)`, where every control state
 * (button, selection, toggle, text field) is a `param`. JSON and CSV are two
 * encodings of the SAME information, so either can fully recover the tool later.
 *
 *   Artifact = {
 *     schemaVersion: 1,
 *     tool:    'seeding-calc',
 *     params:  { ... },   // CANONICAL — complete control state; reproduces the tool
 *     inputs:  { ... },   // resolved upstream field values actually consumed
 *     outputs: { ... },   // DECLARED, typed, DERIVED — must equal recompute(params, inputs)
 *   }
 *
 * `params` are canonical; `outputs` are a derived projection kept for CSV
 * readability and for field-port wiring between tools.
 *
 * This module is pure (no DOM, no IndexedDB). It exposes:
 *   window.labtoolsBuildArtifact(parts)      -> envelope
 *   window.labtoolsValidateArtifact(env)     -> { valid, errors }
 *   window.labtoolsFlatten(obj)              -> { 'dotted.path': leaf }
 *   window.labtoolsUnflatten(map)            -> nested object
 *   window.labtoolsArtifactToCsv(env)        -> string  (lossless, JSON-equivalent)
 *   window.labtoolsCsvToArtifact(text)       -> envelope
 *   window.labtoolsRowsToCsv(rows)           -> RFC-4180 CSV string
 *   window.labtoolsCsvToRows(text)           -> string[][]
 *   window.labtoolsMatchWiring(outputs, ports) -> { resolved, missing, ignored }
 */

const LABTOOLS_ARTIFACT_VERSION = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Flatten / unflatten — lossless nesting <-> flat dotted-path map
// ─────────────────────────────────────────────────────────────────────────────

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Flatten a nested object into a flat map of dotted-path -> leaf value.
 * Leaves keep their JS type (string/number/boolean/null). Empty arrays and
 * empty objects are preserved as leaf sentinels ([] and {}) so the flat form
 * can round-trip back to the exact same structure.
 *
 * @param {Object} obj
 * @returns {Object<string, *>}
 */
function labtoolsFlatten(obj) {
  const out = {};
  walkFlatten(obj, '', out);
  return out;
}

function walkFlatten(value, prefix, out) {
  if (Array.isArray(value)) {
    // Empty array is a leaf sentinel — but an empty ROOT collapses to no rows
    // (an empty section is simply absent, never a phantom key "").
    if (value.length === 0) { if (prefix !== '') out[prefix] = []; return; }
    value.forEach((v, i) => walkFlatten(v, prefix ? prefix + '.' + i : String(i), out));
    return;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) { if (prefix !== '') out[prefix] = {}; return; }
    keys.forEach((k) => walkFlatten(value[k], prefix ? prefix + '.' + k : k, out));
    return;
  }
  // scalar or null
  out[prefix] = value;
}

/**
 * Inverse of labtoolsFlatten. A node whose keys are the contiguous integers
 * 0..n-1 is reconstructed as an array; otherwise as an object. (Limitation:
 * an object whose keys happen to be "0","1",… reconstructs as an array. Rare
 * in control state; the round-trip test flags any tool that hits it.)
 *
 * @param {Object<string, *>} map
 * @returns {Object}
 */
function labtoolsUnflatten(map) {
  const root = {};
  Object.keys(map).forEach((path) => {
    const segs = path.split('.');
    let node = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i];
      if (!isPlainObject(node[seg])) node[seg] = {};
      node = node[seg];
    }
    node[segs[segs.length - 1]] = map[path];
  });
  return arrayify(root);
}

function arrayify(node) {
  if (!isPlainObject(node)) return node; // leaf, incl. sentinel [] / {}
  const keys = Object.keys(node);
  const isArrayShape = keys.length > 0 && keys.every((k, idx) => k === String(idx));
  if (isArrayShape) {
    return keys.map((k) => arrayify(node[k]));
  }
  const out = {};
  keys.forEach((k) => { out[k] = arrayify(node[k]); });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// RFC-4180 CSV rows <-> text
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode an array of rows (each an array of string cells) as RFC-4180 CSV.
 * Cells containing a comma, quote, CR or LF are wrapped in double quotes with
 * embedded quotes doubled. Uses CRLF line endings.
 *
 * @param {Array<Array<string>>} rows
 * @returns {string}
 */
function labtoolsRowsToCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value) {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * Parse RFC-4180 CSV text into an array of rows of string cells. Handles quoted
 * fields, embedded quotes/commas/newlines, and CRLF or LF line endings.
 *
 * @param {string} text
 * @returns {Array<Array<string>>}
 */
function labtoolsCsvToRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += ch; i++;
  }
  // flush trailing cell/row unless the text ended exactly on a newline
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Artifact envelope
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a canonical artifact envelope. Missing sections default to {}.
 *
 * @param {{tool:string, params?:Object, inputs?:Object, outputs?:Object, schemaVersion?:number}} parts
 * @returns {Object} envelope
 */
function labtoolsBuildArtifact(parts) {
  const p = parts || {};
  return {
    schemaVersion: p.schemaVersion || LABTOOLS_ARTIFACT_VERSION,
    tool: p.tool || '',
    params: p.params || {},
    inputs: p.inputs || {},
    outputs: p.outputs || {},
  };
}

/**
 * Structural check of an artifact envelope.
 * @param {*} env
 * @returns {{valid:boolean, errors:string[]}}
 */
function labtoolsValidateArtifact(env) {
  const errors = [];
  if (!isPlainObject(env)) return { valid: false, errors: ['artifact: expected object'] };
  if (typeof env.tool !== 'string' || !env.tool) errors.push('artifact.tool: required non-empty string');
  if (!Number.isInteger(env.schemaVersion)) errors.push('artifact.schemaVersion: required integer');
  ['params', 'inputs', 'outputs'].forEach((k) => {
    if (!isPlainObject(env[k])) errors.push('artifact.' + k + ': expected object');
  });
  return { valid: errors.length === 0, errors };
}

// ─── CSV <-> artifact (3-column: section,key,value) ─────────────────────────
// A fully general, lossless encoding: one row per flattened leaf, with the leaf
// value JSON-encoded so its type survives. Meta (tool, schemaVersion) rides in a
// `__meta` section. Because it is a straight projection of the flattened JSON,
// CSV and JSON carry byte-for-byte equivalent information.

const CSV_HEADER = ['section', 'key', 'value'];

/**
 * Serialize an artifact envelope to CSV. Round-trips via labtoolsCsvToArtifact.
 * @param {Object} env
 * @returns {string}
 */
function labtoolsArtifactToCsv(env) {
  const rows = [CSV_HEADER.slice()];
  rows.push(['__meta', 'tool', JSON.stringify(env.tool)]);
  rows.push(['__meta', 'schemaVersion', JSON.stringify(env.schemaVersion)]);
  ['params', 'inputs', 'outputs'].forEach((section) => {
    const flat = labtoolsFlatten(env[section] || {});
    Object.keys(flat).forEach((key) => {
      rows.push([section, key, JSON.stringify(flat[key])]);
    });
  });
  return labtoolsRowsToCsv(rows);
}

/**
 * Parse CSV produced by labtoolsArtifactToCsv back into an artifact envelope.
 * @param {string} text
 * @returns {Object} envelope
 */
function labtoolsCsvToArtifact(text) {
  const rows = labtoolsCsvToRows(text);
  const flatBySection = { params: {}, inputs: {}, outputs: {} };
  let tool = '';
  let schemaVersion = LABTOOLS_ARTIFACT_VERSION;
  for (let r = 0; r < rows.length; r++) {
    const [section, key, value] = rows[r];
    if (section === 'section' && key === 'key') continue; // header
    if (section === undefined) continue;
    const parsed = value === undefined || value === '' ? undefined : JSON.parse(value);
    if (section === '__meta') {
      if (key === 'tool') tool = parsed;
      else if (key === 'schemaVersion') schemaVersion = parsed;
      continue;
    }
    if (flatBySection[section]) flatBySection[section][key] = parsed;
  }
  return {
    schemaVersion: schemaVersion,
    tool: tool,
    params: labtoolsUnflatten(flatBySection.params),
    inputs: labtoolsUnflatten(flatBySection.inputs),
    outputs: labtoolsUnflatten(flatBySection.outputs),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Field-port wiring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Match an upstream tool's declared outputs against a downstream tool's input
 * ports, by field id. Implements the workflow rule:
 *   • matched ports        -> resolved (wired automatically)
 *   • required, unmatched  -> missing  (user fills manually)
 *   • upstream outputs with no port -> ignored
 *
 * @param {Object<string,*>} upstreamOutputs  merged fieldId -> value
 * @param {Array<{field:string, required?:boolean}>} inputPorts
 * @returns {{resolved:Object<string,*>, missing:string[], ignored:string[]}}
 */
function labtoolsMatchWiring(upstreamOutputs, inputPorts) {
  const outputs = upstreamOutputs || {};
  const ports = inputPorts || [];
  const resolved = {};
  const missing = [];
  const claimed = new Set();
  ports.forEach((port) => {
    const field = port.field;
    if (Object.prototype.hasOwnProperty.call(outputs, field)) {
      resolved[field] = outputs[field];
      claimed.add(field);
    } else if (port.required) {
      missing.push(field);
    }
  });
  const ignored = Object.keys(outputs).filter((f) => !claimed.has(f));
  return { resolved: resolved, missing: missing, ignored: ignored };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool bridge — one declaration wires a tool to storage / export / wiring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Declare a tool once. Returns an object with methods that build, save, export,
 * and restore the tool's artifact. The heavy dependencies (workbench, download,
 * type registration) are referenced lazily so this module still loads in a pure
 * (no-DOM) context; methods that need them throw only when actually called.
 *
 * @param {Object} spec
 * @param {string}   spec.id             tool id (matches its folder name)
 * @param {string[]} [spec.produces]     legacy workbench types produced (registry)
 * @param {string[]} [spec.consumes]     legacy workbench types consumed (registry)
 * @param {function():Object} spec.readParams    capture ALL control state
 * @param {function(Object):void} spec.applyParams  restore control state
 * @param {function():Object} [spec.readInputs]  resolved upstream inputs used
 * @param {function():Object} [spec.readOutputs] declared output field values
 * @param {Array<{field:string,required?:boolean}>} [spec.inputPorts]
 * @param {Array<{id:string,label?:string}>} [spec.outputFields]
 * @returns {Object} tool bridge
 */
function labtoolsDefineTool(spec) {
  const id = spec.id;
  if (typeof window !== 'undefined' && typeof window.labtoolsRegisterToolTypes === 'function') {
    window.labtoolsRegisterToolTypes(id, spec.produces || [], spec.consumes || []);
  }

  function build() {
    return labtoolsBuildArtifact({
      tool: id,
      params: spec.readParams ? spec.readParams() : {},
      inputs: spec.readInputs ? spec.readInputs() : {},
      outputs: spec.readOutputs ? spec.readOutputs() : {},
    });
  }

  return {
    id: id,
    inputPorts: spec.inputPorts || [],
    outputFields: spec.outputFields || [],

    /** Build the current artifact envelope. */
    build: build,

    /** Serialize the current state to CSV (lossless, JSON-equivalent). */
    toCsv: function () { return labtoolsArtifactToCsv(build()); },

    /** Restore control state from an artifact envelope. */
    restore: function (env) {
      if (spec.applyParams) spec.applyParams((env && env.params) || {});
      return env;
    },

    /** Restore control state from CSV text. */
    fromCsv: function (text) { return this.restore(labtoolsCsvToArtifact(text)); },

    /** Trigger a CSV download of the current state. */
    exportCsv: function (filename) {
      if (typeof labtoolsDownloadText !== 'function') {
        throw new Error('labtools-common.js required for CSV export');
      }
      labtoolsDownloadText(filename || (id + '.csv'), labtoolsArtifactToCsv(build()),
        'text/csv;charset=utf-8');
    },

    /** Upsert the current artifact into the workbench under the given label. */
    save: function (label, metadata) {
      if (typeof workbench === 'undefined' || !workbench || !workbench.put) {
        return Promise.reject(new Error('Workbench unavailable'));
      }
      const art = build();
      return workbench.findByName(label).then(function (existing) {
        if (existing) return workbench.remove(existing.id);
      }).then(function () {
        return workbench.put('artifact', label, art, metadata || { tool: id }, id);
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') { (window.__labtoolsLoadOrder = window.__labtoolsLoadOrder || []).push('labtools-artifact'); }

if (typeof window !== 'undefined') {
  window.labtoolsDefineTool = labtoolsDefineTool;
  window.labtoolsFlatten = labtoolsFlatten;
  window.labtoolsUnflatten = labtoolsUnflatten;
  window.labtoolsRowsToCsv = labtoolsRowsToCsv;
  window.labtoolsCsvToRows = labtoolsCsvToRows;
  window.labtoolsBuildArtifact = labtoolsBuildArtifact;
  window.labtoolsValidateArtifact = labtoolsValidateArtifact;
  window.labtoolsArtifactToCsv = labtoolsArtifactToCsv;
  window.labtoolsCsvToArtifact = labtoolsCsvToArtifact;
  window.labtoolsMatchWiring = labtoolsMatchWiring;
  window.LABTOOLS_ARTIFACT_VERSION = LABTOOLS_ARTIFACT_VERSION;
}
