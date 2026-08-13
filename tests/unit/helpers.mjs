/**
 * LabTools — unit-test helpers.
 * Loads browser-global JS files (labtools-calc.js, labtools-workbench.js)
 * into a Node context via node:vm, with a minimal DOM shim where needed.
 * Only pure functions are exercised — no DOM paths are required.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Evaluate a browser JS file in a fresh VM context and return the context.
 * @param {string} relPath  path relative to repo root, e.g. 'assets/js/labtools-calc.js'
 * @param {string[]} [extraGlobals]  top-level const/let names to surface on the
 *   returned context (function declarations land automatically, consts don't).
 * @returns {object} the sandbox context (functions land here as globals)
 */
export function loadBrowserJs(relPath, extraGlobals = []) {
  const code = readFileSync(join(ROOT, relPath), 'utf8');

  // Minimal DOM shim — only what the file touches at parse time.
  const listeners = {};
  const documentShim = {
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    createElement: () => ({
      className: '', textContent: '', innerHTML: '', style: {},
      addEventListener: () => {}, appendChild: () => {}, replaceWith: () => {},
      querySelectorAll: () => [], setAttribute: () => {}, focus: () => {}, select: () => {},
    }),
    body: { appendChild: () => {}, firstChild: null },
    querySelectorAll: () => [],
    getElementById: () => null,
  };
  const windowShim = { addEventListener: () => {}, document: documentShim };
  const sandbox = {
    window: windowShim,
    document: documentShim,
    navigator: {},
    indexedDB: undefined,   // workbench tests must not touch real IndexedDB
    BroadcastChannel: undefined,
    localStorage: undefined,
    console,
    setTimeout,
    clearTimeout,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    Blob: class {},
    FileReader: class {},
    Event: class {},
    Promise,
    JSON,
    Math,
    Date,
    isNaN,
    parseFloat,
    parseInt,
    Number,
    String,
    Array,
    Object,
    Map,
    Set,
    IDBKeyRange: undefined,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: relPath });
  // top-level `const` declarations don't land on the sandbox object, but the
  // files assign their public API to `window.*` — surface those back.
  for (const [k, v] of Object.entries(windowShim)) {
    if (!(k in sandbox)) sandbox[k] = v;
  }
  // Surface explicitly requested top-level consts (e.g. MODES, SMALL_ALL).
  if (extraGlobals.length) {
    const probe = `globalThis.__probe = { ${extraGlobals.map((g) => `${g}: ${g}`).join(', ')} };`;
    vm.runInContext(probe, sandbox, { filename: relPath + ':probe' });
    Object.assign(sandbox, sandbox.__probe);
  }
  return sandbox;
}

/** JSON-serialize with sorted keys — for stable snapshot-ish comparisons. */
export function stableStringify(value) {
  return JSON.stringify(value, (k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]]))
      : v, 2);
}

/** Deep equality that ignores undefined values (JSON semantics). */
export function deepEqualJson(a, b) {
  return stableStringify(a) === stableStringify(b);
}
