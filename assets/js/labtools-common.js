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
