'use strict';

/**
 * LabTools — Runtime Loader & Load Self-Check
 * ============================================
 * Shared-layer bootstrapping for every tool page. Loads after the other shared
 * scripts and verifies that (a) the scripts a tool actually needs are present
 * and (b) they were loaded in the canonical relative order — so a missing or
 * mis-ordered <script> tag fails loudly with a visible banner instead of
 * silently breaking at the first call site (see architecture-v2-plan.md §1.4
 * "共享层需提供统一加载自检").
 *
 * Zero dependencies, no import/export: loaded via a plain <script> tag,
 * exposes `window.labtools.runtime`. Safe to load in environments without a
 * DOM — all DOM work (the alert banner) is guarded by a runtime check.
 *
 * Exposes:
 *   window.labtools.runtime.SCRIPT_ORDER
 *   window.labtools.runtime.resolveSymbol(symbol)      -> value | undefined
 *   window.labtools.runtime.checkRuntime(opts)         -> { ok, missing, notes }
 *   window.labtools.runtime.checkLoadOrder()           -> { ok, errors }
 *   window.labtools.runtime.validateManifest(m)        -> { valid, errors }
 *   window.labtools.runtime.boot(opts)                 -> report
 */

(function (root) {
  const lt = root.labtools = root.labtools || {};
  (root.__labtoolsLoadOrder = root.__labtoolsLoadOrder || []).push('labtools-runtime');

  // ─────────────────────────────────────────────────────────────────────────────
  // Canonical load manifest
  // ─────────────────────────────────────────────────────────────────────────────
  // Ordered list of every shared-layer script. `required: true` entries are the
  // hard dependencies a tool page must load; `required: false` entries are the
  // new v2 modules (and this module itself) that exist only once shipped.
  // `symbol` may be a plain global name or a dotted path resolved on the root
  // (window / globalThis) — e.g. 'labtools.contracts'.
  const SCRIPT_ORDER = [
    { file: 'labtools-calc.js',        symbol: 'MODES',                         required: false },
    { file: 'labtools-types.js',       symbol: 'DATA_TYPES',                    required: true },
    { file: 'labtools-workbench.js',   symbol: 'workbench',                     required: true },
    { file: 'labtools-common.js',      symbol: 'labtoolsDownloadText',          required: true },
    { file: 'labtools-artifact.js',    symbol: 'labtoolsDefineTool',            required: true },
    { file: 'labtools-artifact-ui.js', symbol: 'labtoolsMountArtifactControls', required: true },
    { file: 'labtools-contracts.js',   symbol: 'labtools.contracts',            required: false },
    { file: 'labtools-store.js',       symbol: 'labtools.store',                required: false },
    { file: 'labtools-workflow.js',    symbol: 'labtools.workflow',             required: false },
    { file: 'labtools-runtime.js',     symbol: 'labtools.runtime',              required: false },
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // Symbol resolution
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Resolve a symbol (plain global name or dotted path) on the runtime root —
   * `window` when present, otherwise `globalThis`.
   * @param {string} symbol  e.g. 'DATA_TYPES' or 'labtools.contracts'
   * @returns {*} the value, or undefined when any segment is missing
   */
  function resolveSymbol(symbol) {
    if (typeof symbol !== 'string' || symbol.length === 0) return undefined;
    let node = root;
    const parts = symbol.split('.');
    for (let i = 0; i < parts.length; i++) {
      if (node === null || node === undefined) return undefined;
      node = node[parts[i]];
    }
    return node;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Runtime checks
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Verify that every required shared-layer symbol is present. With
   * opts.requireAll the optional v2 modules are checked as well.
   * @param {Object} [opts]  { requireAll?: boolean }
   * @returns {{ ok: boolean, missing: Array<{file:string,symbol:string}>, notes: string[] }}
   */
  function checkRuntime(opts) {
    opts = opts || {};
    const requireAll = !!opts.requireAll;
    const missing = [];
    SCRIPT_ORDER.forEach(function (entry) {
      if (!entry.required && !requireAll) return;
      if (resolveSymbol(entry.symbol) === undefined) {
        missing.push({ file: entry.file, symbol: entry.symbol });
      }
    });
    // `notes` is reserved for future diagnostics (e.g. present-but-suspicious
    // optional modules); nothing produces a note yet.
    return { ok: missing.length === 0, missing: missing, notes: [] };
  }

  /**
   * Verify that the files recorded in root.__labtoolsLoadOrder were loaded in
   * the same relative order as SCRIPT_ORDER. Unknown entries and entries not
   * in SCRIPT_ORDER are ignored; a repeated file never errors by itself.
   * @returns {{ ok: boolean, errors: string[] }}
   */
  function checkLoadOrder() {
    const loaded = root.__labtoolsLoadOrder;
    if (!loaded) return { ok: true, errors: [] };
    // Load-order markers push names WITHOUT the .js suffix ('labtools-common')
    // while SCRIPT_ORDER file names carry it ('labtools-common.js') — index both
    // forms so the trail matches. Error messages always use the SCRIPT_ORDER name.
    const indexByKey = {};
    const keyToFile = {};
    SCRIPT_ORDER.forEach(function (entry, i) {
      indexByKey[entry.file] = i;
      keyToFile[entry.file] = entry.file;
      indexByKey[entry.file.replace(/\.js$/, '')] = i;
      keyToFile[entry.file.replace(/\.js$/, '')] = entry.file;
    });
    const errors = [];
    let lastIndex = -1;
    loaded.forEach(function (file) {
      const idx = indexByKey[file];
      if (idx === undefined) return; // unknown entry — ignore
      if (idx < lastIndex) {
        // `file` came after `SCRIPT_ORDER[lastIndex].file` in the load sequence
        // but should have come before it — state the (wrong) factual order.
        errors.push(SCRIPT_ORDER[lastIndex].file + ' loaded before ' + keyToFile[file]);
      }
      if (idx > lastIndex) lastIndex = idx;
    });
    return { ok: errors.length === 0, errors: errors };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Manifest validation
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Validate a tool manifest (architecture-v2-plan.md D4). Required: `id`
   * (non-empty string). Optional: produces/consumes (string arrays),
   * readParams/applyParams/readInputs/readOutputs (functions),
   * outputFields (array of { id: non-empty string }, ids unique),
   * inputPorts (array of { field: non-empty string, required?: boolean },
   *   fields unique), next (array of { tool: non-empty string, label?: string },
   *   tools unique), testHooks (object). Every violation is reported.
   * @param {*} m  the candidate manifest
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateManifest(m) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      return { valid: false, errors: ['manifest must be an object'] };
    }
    const errors = [];

    if (typeof m.id !== 'string' || m.id.trim() === '') {
      errors.push('manifest.id: required non-empty string');
    }

    ['produces', 'consumes'].forEach(function (key) {
      if (m[key] === undefined) return;
      if (!Array.isArray(m[key]) || m[key].some(function (x) { return typeof x !== 'string'; })) {
        errors.push('manifest.' + key + ': expected array of strings');
      }
    });

    ['readParams', 'applyParams', 'readInputs', 'readOutputs'].forEach(function (key) {
      if (m[key] !== undefined && typeof m[key] !== 'function') {
        errors.push('manifest.' + key + ': expected function');
      }
    });

    if (m.outputFields !== undefined) {
      if (!Array.isArray(m.outputFields)) {
        errors.push('manifest.outputFields: expected array');
      } else {
        const seen = {};
        m.outputFields.forEach(function (f, i) {
          if (!f || typeof f !== 'object' || typeof f.id !== 'string' || f.id.trim() === '') {
            errors.push('manifest.outputFields[' + i + '].id: required non-empty string');
          } else if (seen[f.id]) {
            errors.push('manifest.outputFields: duplicate id "' + f.id + '"');
          } else {
            seen[f.id] = true;
          }
        });
      }
    }

    if (m.inputPorts !== undefined) {
      if (!Array.isArray(m.inputPorts)) {
        errors.push('manifest.inputPorts: expected array');
      } else {
        const seen = {};
        m.inputPorts.forEach(function (p, i) {
          if (!p || typeof p !== 'object' || typeof p.field !== 'string' || p.field.trim() === '') {
            errors.push('manifest.inputPorts[' + i + '].field: required non-empty string');
          } else if (seen[p.field]) {
            errors.push('manifest.inputPorts: duplicate field "' + p.field + '"');
          } else {
            seen[p.field] = true;
          }
          if (p.required !== undefined && typeof p.required !== 'boolean') {
            errors.push('manifest.inputPorts[' + i + '].required: expected boolean');
          }
        });
      }
    }

    if (m.next !== undefined) {
      if (!Array.isArray(m.next)) {
        errors.push('manifest.next: expected array');
      } else {
        const seen = {};
        m.next.forEach(function (n, i) {
          if (!n || typeof n !== 'object' || typeof n.tool !== 'string' || n.tool.trim() === '') {
            errors.push('manifest.next[' + i + '].tool: required non-empty string');
          } else if (seen[n.tool]) {
            errors.push('manifest.next: duplicate tool "' + n.tool + '"');
          } else {
            seen[n.tool] = true;
          }
          if (n.label !== undefined && typeof n.label !== 'string') {
            errors.push('manifest.next[' + i + '].label: expected string');
          }
        });
      }
    }

    if (m.testHooks !== undefined &&
        (typeof m.testHooks !== 'object' || m.testHooks === null || Array.isArray(m.testHooks))) {
      errors.push('manifest.testHooks: expected object');
    }

    return { valid: errors.length === 0, errors: errors };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Boot
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Inject a visible alert banner listing every runtime problem at the top of
   * <body>. Only called when a real DOM exists (guarded in boot()).
   * @param {string[]} lines
   */
  function injectBanner(lines) {
    const banner = document.createElement('div');
    banner.className = 'lt-alert lt-alert-danger'; // shared design tokens
    banner.setAttribute('role', 'alert');
    banner.setAttribute('data-lt-runtime-check', 'error');

    const title = document.createElement('strong');
    title.textContent = 'LabTools runtime check failed — missing or mis-ordered shared scripts.';
    banner.appendChild(title);

    const list = document.createElement('ul');
    list.style.margin = '6px 0 0 18px';
    list.style.padding = '0';
    lines.forEach(function (line) {
      const li = document.createElement('li');
      li.textContent = line;
      list.appendChild(li);
    });
    banner.appendChild(list);

    const body = document.body;
    // Prepend above everything else (feature-detected so the banner still works
    // in any DOM shim / minimal environment).
    if (typeof body.prependChild === 'function') body.prependChild(banner);
    else if (typeof body.insertBefore === 'function') body.insertBefore(banner, body.firstChild);
    else if (typeof body.prepend === 'function') body.prepend(banner);
    else if (typeof body.appendChild === 'function') body.appendChild(banner);
  }

  /**
   * Boot a tool page against the shared layer:
   *   1. checkRuntime + checkLoadOrder;
   *   2. if opts.manifest is present, validate it and — when valid — register
   *      the tool's data types (labtoolsRegisterToolTypes) and test hooks
   *      (labtoolsRegisterTestHooks) when those registries are available;
   *   3. on any missing module or load-order error: console.error each problem
   *      and, when a DOM is present, inject a visible banner at the top of body.
   * @param {Object} [opts]  { toolName?: string, manifest?: Object }
   * @returns {{ runtime: {ok:boolean,missing:Array,notes:Array}, order: {ok:boolean,errors:Array}, manifest: Object|null }}
   */
  function boot(opts) {
    opts = opts || {};
    const runtimeCheck = checkRuntime(opts);
    const orderCheck = checkLoadOrder();
    let manifestResult = null;

    if (opts.manifest) {
      manifestResult = validateManifest(opts.manifest);
      if (manifestResult.valid) {
        if (typeof root.labtoolsRegisterToolTypes === 'function') {
          root.labtoolsRegisterToolTypes(opts.manifest.id,
            opts.manifest.produces || [], opts.manifest.consumes || []);
        }
        if (opts.manifest.testHooks && typeof root.labtoolsRegisterTestHooks === 'function') {
          root.labtoolsRegisterTestHooks(opts.manifest.id, opts.manifest.testHooks);
        }
      }
    }

    const problems = [];
    runtimeCheck.missing.forEach(function (m) {
      problems.push('missing shared module: ' + m.file + ' (symbol "' + m.symbol + '")');
    });
    orderCheck.errors.forEach(function (e) { problems.push(e); });

    if (problems.length > 0) {
      if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
        problems.forEach(function (p) { console.error('[labtools-runtime] ' + p); });
      }
      if (typeof document !== 'undefined' && document && document.body) {
        injectBanner(problems);
      }
    }

    return {
      runtime: { ok: runtimeCheck.ok, missing: runtimeCheck.missing, notes: runtimeCheck.notes },
      order: orderCheck,
      manifest: manifestResult,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Exports
  // ─────────────────────────────────────────────────────────────────────────────

  lt.runtime = {
    SCRIPT_ORDER: SCRIPT_ORDER,        // read-only reference to the manifest
    resolveSymbol: resolveSymbol,
    checkRuntime: checkRuntime,
    checkLoadOrder: checkLoadOrder,
    validateManifest: validateManifest,
    boot: boot,
  };
})(typeof window !== 'undefined' ? window : globalThis);
