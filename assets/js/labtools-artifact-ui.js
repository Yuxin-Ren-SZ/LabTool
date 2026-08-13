'use strict';

/**
 * LabTools — Artifact UI
 * ======================
 * Shared, user-facing wiring for the artifact model (assets/js/labtools-artifact.js):
 *
 *   • labtoolsMountArtifactControls(tool, opts)
 *       Injects a uniform control cluster — Save state, Export state (CSV),
 *       Import state (CSV), Load state — that persist/recover the WHOLE tool via
 *       the artifact envelope (full control state, not just the legacy payload).
 *
 *   • labtoolsResolveInputs(tool, upstreamOutputs) -> Promise<resolvedMap>
 *       Field-port wiring: auto-matches an upstream tool's outputs to this tool's
 *       inputPorts (by field-id), pops a manual-fill dialog for unmatched REQUIRED
 *       ports, and drops extras. Implements the workflow rule end-to-end.
 *
 * Depends (lazily, all guarded) on: labtools-artifact.js, labtools-workbench.js,
 * labtools-common.js. Self-contained modal/picker — no per-tool showPicker needed.
 */

// ─── small DOM helpers ───────────────────────────────────────────────────────

function ltaEl(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function ltaToast(msg) { if (typeof showToast === 'function') showToast(msg); }

function ltaDateLabel(id) {
  // new Date() is fine in a browser page (only workflow scripts forbid it).
  return id + ' ' + new Date().toISOString().slice(0, 10);
}

// ─── modal (self-contained, lt- themed) ──────────────────────────────────────

function ltaModal(title, bodyBuilder) {
  var scrim = ltaEl('div', 'lta-scrim');
  scrim.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);' +
    'display:flex;align-items:center;justify-content:center;z-index:9999;';
  var card = ltaEl('div', 'lt-card');
  card.style.cssText = 'max-width:440px;width:92%;max-height:80vh;overflow:auto;' +
    'padding:18px;background:var(--surface,#fff);border-radius:var(--radius,10px);';
  var close = function () { if (scrim.parentNode) scrim.parentNode.removeChild(scrim); };
  card.appendChild(ltaEl('h3', null, title));
  bodyBuilder(card, close);
  scrim.appendChild(card);
  scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);
  return close;
}

// ─── control cluster ─────────────────────────────────────────────────────────

/**
 * @param {Object} tool  the object returned by labtoolsDefineTool(...)
 * @param {Object} [opts]
 * @param {string|Element} opts.container   where to append the buttons
 * @param {string} [opts.fileBase]          CSV filename base (default tool.id)
 * @param {function():string} [opts.suggestLabel]  default save label
 */
function labtoolsMountArtifactControls(tool, opts) {
  opts = opts || {};
  var host = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
  if (!host || !tool) return;
  var fileBase = opts.fileBase || tool.id;
  var suggest = function () { return opts.suggestLabel ? opts.suggestLabel() : ltaDateLabel(tool.id); };

  var save = ltaEl('button', 'lt-btn lt-btn-ghost', '💾 Save state'); save.type = 'button';
  save.addEventListener('click', function () {
    var label = prompt('Name this saved state:', suggest());
    if (!label || !label.trim()) return;
    label = label.trim();
    Promise.resolve(tool.save(label))
      .then(function () { ltaToast('✓ Saved state "' + label + '"'); })
      .catch(function (e) { ltaToast('✗ ' + (e && e.message || e)); });
  });

  var exp = ltaEl('button', 'lt-btn lt-btn-ghost', '⬇ Export state (CSV)'); exp.type = 'button';
  exp.addEventListener('click', function () {
    try { tool.exportCsv(fileBase + '-state.csv'); ltaToast('✓ State exported'); }
    catch (e) { ltaToast('✗ ' + (e && e.message || e)); }
  });

  var file = ltaEl('input'); file.type = 'file'; file.accept = '.csv,text/csv'; file.style.display = 'none';
  var imp = ltaEl('button', 'lt-btn lt-btn-ghost', '📂 Import state (CSV)'); imp.type = 'button';
  imp.addEventListener('click', function () { file.value = ''; file.click(); });
  file.addEventListener('change', function () {
    var f = file.files && file.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try { tool.fromCsv(String(r.result)); ltaToast('✓ State imported'); }
      catch (e) { ltaToast('✗ ' + (e && e.message || e)); }
    };
    r.onerror = function () { ltaToast('✗ Could not read file'); };
    r.readAsText(f);
  });

  var load = ltaEl('button', 'lt-btn lt-btn-ghost', '📂 Load state'); load.type = 'button';
  load.addEventListener('click', function () { ltaOpenLoadPicker(tool); });

  [save, exp, imp, load, file].forEach(function (el) { host.appendChild(el); });
}

function ltaOpenLoadPicker(tool) {
  if (typeof workbench === 'undefined' || !workbench || !workbench.getByType) { ltaToast('Workbench unavailable'); return; }
  workbench.getByType('artifact').then(function (items) {
    var mine = (items || []).filter(function (it) { return it && it.data && it.data.tool === tool.id; });
    if (!mine.length) { ltaToast('No saved states for this tool'); return; }
    ltaModal('Load saved state', function (card, close) {
      mine.forEach(function (it) {
        var row = ltaEl('button', 'lt-btn lt-btn-ghost', it.label);
        row.type = 'button';
        row.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;';
        row.addEventListener('click', function () {
          try { tool.restore(it.data); ltaToast('✓ Restored "' + it.label + '"'); }
          catch (e) { ltaToast('✗ ' + (e && e.message || e)); }
          close();
        });
        card.appendChild(row);
      });
    });
  }).catch(function (e) { ltaToast('✗ ' + (e && e.message || e)); });
}

// ─── field-port wiring + manual fill ─────────────────────────────────────────

/**
 * Resolve a downstream tool's inputs from an upstream tool's outputs.
 * Auto-matched ports resolve; required ports with no match are collected from the
 * user via a manual-fill dialog; extras are ignored. Optional ports left unmatched
 * are simply absent.
 *
 * @param {Object} tool             the consumer (has .inputPorts)
 * @param {Object} upstreamOutputs  fieldId -> value
 * @returns {Promise<Object>}       resolved fieldId -> value
 */
function labtoolsResolveInputs(tool, upstreamOutputs) {
  var ports = tool.inputPorts || [];
  var m = labtoolsMatchWiring(upstreamOutputs || {}, ports);
  if (m.ignored.length && typeof console !== 'undefined') {
    console.info('[wiring] ignored unmatched upstream outputs:', m.ignored);
  }
  if (!m.missing.length) return Promise.resolve(m.resolved);

  // Only scalar-ish ports can be hand-typed; complex payloads (plate-layout,
  // sample-list) simply stay unfilled if the upstream didn't provide them.
  return new Promise(function (resolve) {
    ltaModal('Fill missing inputs', function (card, close) {
      card.appendChild(ltaEl('p', null,
        'The previous step did not provide: ' + m.missing.join(', ') + '. Enter values (or leave blank).'));
      var inputs = {};
      m.missing.forEach(function (field) {
        var lbl = ltaEl('label', 'lt-label', field); lbl.style.display = 'block'; lbl.style.marginTop = '8px';
        var inp = ltaEl('input'); inp.type = 'text'; inp.className = 'lt-input'; inp.style.width = '100%';
        inputs[field] = inp;
        lbl.appendChild(inp); card.appendChild(lbl);
      });
      var go = ltaEl('button', 'lt-btn lt-btn-primary', 'Apply'); go.type = 'button';
      go.style.marginTop = '14px';
      go.addEventListener('click', function () {
        var out = Object.assign({}, m.resolved);
        Object.keys(inputs).forEach(function (f) {
          var v = inputs[f].value.trim();
          if (v !== '') out[f] = v;
        });
        close(); resolve(out);
      });
      card.appendChild(go);
    });
  });
}

/**
 * Producer side: hand off THIS tool's declared outputs to the next tool as an
 * artifact envelope (so the consumer can field-port wire them).
 * @returns {Promise<string>} the saved id (then navigates)
 */
function labtoolsHandoffArtifact(tool, nextUrl, label) {
  if (typeof labtoolsHandoffTo !== 'function') return Promise.reject(new Error('labtools-common.js required'));
  var env = labtoolsBuildArtifact({ tool: tool.id, outputs: tool.readOutputs ? tool.readOutputs() : (tool.build().outputs) });
  return labtoolsHandoffTo(nextUrl, 'artifact', label, env, { tool: tool.id }, tool.id);
}

/**
 * Consumer side: if the page was opened with `?wbLoad=<id>` pointing at an
 * artifact envelope, field-port wire its outputs into this tool — auto-matching
 * inputPorts, manual-filling missing required ports, ignoring extras — then call
 * applyInputs(resolved). Typed (non-artifact) handoffs are left to the legacy
 * `labtoolsConsumeHandoff` path. Strips the param so refresh is clean.
 *
 * @param {Object} tool
 * @param {function(Object):void} applyInputs  maps resolved fieldId->value into the tool
 * @returns {Promise<boolean>} true if an artifact handoff was wired
 */
function labtoolsConsumeArtifactHandoff(tool, applyInputs) {
  if (typeof workbench === 'undefined' || !workbench || !workbench.getItem) return Promise.resolve(false);
  var params = new URLSearchParams(window.location.search);
  var id = params.get('wbLoad');
  if (!id) return Promise.resolve(false);
  return workbench.getItem(id).then(function (item) {
    if (!item || item.type !== 'artifact' || !item.data || !item.data.outputs) return false;
    params.delete('wbLoad');
    var clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState(null, '', clean);
    return labtoolsResolveInputs(tool, item.data.outputs).then(function (resolved) {
      applyInputs(resolved);
      ltaToast('✓ Wired inputs from ' + (item.tool || 'previous step'));
      return true;
    });
  }).catch(function (e) { ltaToast('✗ ' + (e && e.message || e)); return false; });
}

// ─── exports ─────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.labtoolsMountArtifactControls = labtoolsMountArtifactControls;
  window.labtoolsResolveInputs = labtoolsResolveInputs;
  window.labtoolsHandoffArtifact = labtoolsHandoffArtifact;
  window.labtoolsConsumeArtifactHandoff = labtoolsConsumeArtifactHandoff;
}
