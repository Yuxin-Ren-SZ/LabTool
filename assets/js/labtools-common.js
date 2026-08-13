'use strict';

/**
 * Trigger a browser download for an arbitrary Blob.
 *
 * @param {string} filename
 * @param {Blob} blob
 */
function labtoolsDownloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Trigger a browser download for plain text content.
 *
 * @param {string} filename
 * @param {string} content
 * @param {string} [mimeType]
 */
function labtoolsDownloadText(filename, content, mimeType) {
  const blob = new Blob([content], {
    type: mimeType || 'text/plain;charset=utf-8',
  });
  labtoolsDownloadBlob(filename, blob);
}

/**
 * Read a File object as ArrayBuffer.
 *
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
function labtoolsReadFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Copy text to the clipboard with a legacy fallback for non-secure contexts.
 *
 * @param {string} text
 * @returns {Promise<void>}
 */
function labtoolsCopyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'readonly');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('Copy command was rejected.');
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Parse JSON safely and fall back when parsing fails.
 *
 * @param {string|null} raw
 * @param {*} fallback
 * @returns {*}
 */
function labtoolsSafeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

// ─── Workflow deep-link handoff ──────────────────────────────────────────────
// One-click chaining between tools: the producer saves its payload to the shared
// workbench (same-origin IndexedDB, so the id is readable on the next page) then
// navigates to the consumer with `?wbLoad=<id>`; the consumer applies it on load.
// Requires labtools-workbench.js (global `workbench`) on both pages.

/**
 * Save a payload to the workbench and navigate to the next tool, passing the new
 * item id as `?wbLoad=<id>` so the destination auto-loads it.
 *
 * @param {string} nextUrl   relative/absolute URL of the next tool
 * @param {string} type      workbench data type (must be in the registry)
 * @param {string} label     human label for the saved item
 * @param {Object} data      payload (validated against the type schema)
 * @param {Object} [metadata]
 * @param {string} [tool]    producing tool name
 * @returns {Promise<string>} resolves with the saved id just before navigating
 */
function labtoolsHandoffTo(nextUrl, type, label, data, metadata, tool) {
  if (typeof workbench === 'undefined' || !workbench || !workbench.put) {
    return Promise.reject(new Error('Workbench unavailable — cannot hand off.'));
  }
  return workbench.put(type, label, data, metadata || null, tool || null).then(function (id) {
    var u = new URL(nextUrl, window.location.href);
    u.searchParams.set('wbLoad', id);
    window.location.href = u.href;
    return id;
  });
}

/**
 * On page load, if `?wbLoad=<id>` is present, fetch that workbench item and hand
 * it to applyFn(data, type, item). The param is stripped from the URL afterward
 * so a refresh does not re-apply. A brief toast/banner announces the source.
 *
 * @param {function(Object, string, Object):void} applyFn
 * @returns {Promise<boolean>} resolves true if an item was applied
 */
function labtoolsConsumeHandoff(applyFn) {
  var params = new URLSearchParams(window.location.search);
  var id = params.get('wbLoad');
  if (!id) return Promise.resolve(false);
  if (typeof workbench === 'undefined' || !workbench || !workbench.getItem) {
    return Promise.resolve(false);
  }
  return workbench.getItem(id).then(function (item) {
    // Strip the param regardless, so refresh is clean.
    params.delete('wbLoad');
    var clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState(null, '', clean);
    if (!item) return false;
    applyFn(item.data, item.type, item);
    var from = item.tool ? ' from ' + item.tool : '';
    if (typeof showToast === 'function') showToast('✓ Loaded "' + item.label + '"' + from);
    return true;
  }).catch(function (e) {
    if (typeof console !== 'undefined') console.error('Handoff load error:', e);
    return false;
  });
}

// ─── Shared extras (stage-1 gap filling; see docs/architecture-v2-plan.md §1.4) ──
// Additive only: existing tools keep their own copies until a later migration
// batch switches them over.

/**
 * Escape a string for safe HTML interpolation: & < > " '.
 * Same mapping as labtools-workbench.js's escapeHtml (including ' → &#39;).
 *
 * @param {*} s
 * @returns {string}
 */
function labtoolsEscapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

/**
 * Decode a file buffer to text, ported from tools/qpcr-analysis decodeBuffer:
 *   FF FE BOM → UTF-16LE; FE FF BOM → UTF-16BE; otherwise UTF-8, and when the
 *   UTF-8 result contains a NUL character, retry as UTF-16LE (BOM-less UTF-16LE
 *   files read as UTF-8 text peppered with NULs).
 *
 * Degradation note: the UTF-16 paths need the TextDecoder (Encoding API)
 * global. Where it is unavailable we throw an explicit error rather than
 * silently mis-decoding binary content; a manual UTF-8-only fallback is not
 * attempted because the BOM-less UTF-16 detection depends on TextDecoder's
 * replacement-char/NUL semantics.
 *
 * @param {ArrayBuffer} buf
 * @returns {string}
 */
function labtoolsDecodeBuffer(buf) {
  var bytes = new Uint8Array(buf);
  if (typeof TextDecoder === 'undefined') {
    throw new Error('labtoolsDecodeBuffer: TextDecoder unavailable — cannot decode UTF-16 content in this environment.');
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  var text = new TextDecoder('utf-8').decode(bytes);
  if (text.indexOf('\0') !== -1) {
    text = new TextDecoder('utf-16le').decode(bytes);
  }
  return text;
}

/**
 * Ordinary least-squares linear fit y = slope·x + intercept, ported from
 * tools/bca-assay linearRegression. Returns null when there are fewer than 2
 * points or all x are identical (den === 0 — the slope is undefined).
 * r2 = 1 - ssr/sst; when sst === 0 (all y equal) r2 is defined as 1.
 *
 * @param {Array<{x: number, y: number}>} points
 * @returns {{slope: number, intercept: number, r2: number}|null}
 */
function labtoolsFitLinear(points) {
  var n = points.length;
  if (n < 2) return null;
  var sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (var i = 0; i < n; i++) {
    sx += points[i].x;
    sy += points[i].y;
    sxy += points[i].x * points[i].y;
    sx2 += points[i].x * points[i].x;
  }
  var den = n * sx2 - sx * sx;
  if (den === 0) return null;
  var slope = (n * sxy - sx * sy) / den;
  var intercept = (sy - slope * sx) / n;
  var ym = sy / n, sst = 0, ssr = 0;
  for (var j = 0; j < n; j++) {
    var dy = points[j].y - ym;
    var residual = points[j].y - (slope * points[j].x + intercept);
    sst += dy * dy;
    ssr += residual * residual;
  }
  return { slope: slope, intercept: intercept, r2: sst === 0 ? 1 : 1 - ssr / sst };
}

/**
 * Least-squares quadratic fit y = a·x² + b·x + c, ported from tools/bca-assay
 * quadraticFit/det3/solve3: 3×3 normal equations solved via Cramer's rule.
 * det3/solve3 stay local to this function so they cannot collide with the
 * same-named globals inside tools/bca-assay. Returns null when there are fewer
 * than 3 points or the system is singular (|det| < 1e-15, e.g. all x equal).
 * r2 = 1 - ssr/sst; when sst === 0 (all y equal) r2 is defined as 1.
 *
 * @param {Array<{x: number, y: number}>} points
 * @returns {{a: number, b: number, c: number, r2: number}|null}
 */
function labtoolsFitQuadratic(points) {
  var n = points.length;
  if (n < 3) return null;

  function det3(m) {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
      - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
      + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  }

  function solve3(M, V) {
    var det = det3(M);
    if (Math.abs(det) < 1e-15) return null;
    function col(j) {
      return M.map(function (row, i) {
        return row.map(function (v, k) { return k === j ? V[i] : v; });
      });
    }
    return [det3(col(0)) / det, det3(col(1)) / det, det3(col(2)) / det];
  }

  var Sx = 0, Sx2 = 0, Sx3 = 0, Sx4 = 0, Sy = 0, Sxy = 0, Sx2y = 0;
  for (var i = 0; i < n; i++) {
    var x = points[i].x, y = points[i].y, x2 = x * x;
    Sx += x;
    Sx2 += x2;
    Sx3 += x2 * x;
    Sx4 += x2 * x2;
    Sy += y;
    Sxy += x * y;
    Sx2y += x2 * y;
  }
  var sol = solve3([[Sx4, Sx3, Sx2], [Sx3, Sx2, Sx], [Sx2, Sx, n]], [Sx2y, Sxy, Sy]);
  if (!sol) return null;
  var a = sol[0], b = sol[1], c = sol[2];
  var ym = Sy / n, sst = 0, ssr = 0;
  for (var j = 0; j < n; j++) {
    var dy = points[j].y - ym;
    var pred = a * points[j].x * points[j].x + b * points[j].x + c;
    sst += dy * dy;
    ssr += (points[j].y - pred) * (points[j].y - pred);
  }
  return { a: a, b: b, c: c, r2: sst === 0 ? 1 : 1 - ssr / sst };
}

// 加载顺序标记（labtools-runtime 的加载自检用）
(window.__labtoolsLoadOrder = window.__labtoolsLoadOrder || []).push('labtools-common');
