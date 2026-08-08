/**
 * LabTools Workbench — Shared Data Clipboard & Cross-Tool Transport
 * ==================================================================
 * IndexedDB-backed persistent data store + left-side slide-out drawer UI.
 * All tools on the same origin share the same database.
 * BroadcastChannel keeps multiple tabs in sync.
 *
 * Loaded via <script src="../../assets/js/labtools-workbench.js">
 * (AFTER labtools-types.js). Exposes the global `workbench` API and
 * auto-injects the drawer into <body> on DOMContentLoaded.
 *
 * Public surface (8 tools depend on these — do not rename):
 *   window.workbench.{ put, getAll, getByType, getItem, findByName, remove,
 *                      clear, updateLabel, exportJSON, importJSON, onChange }
 *   window.showPicker(items, onSelect, types?)
 *   window.showToast(message)
 *   window.wbTypes                       — alias of window.DATA_TYPES
 *   window.labtoolsRegisterTestHooks(tool, hooks)
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Constants
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME      = 'labtools-workbench';
const DB_VERSION   = 1;
const STORE_NAME   = 'items';
const CHANNEL_NAME = 'labtools-workbench';
const EXPORT_VERSION = 1;

// ─────────────────────────────────────────────────────────────────────────────
// 2. Small utilities
// ─────────────────────────────────────────────────────────────────────────────

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const sec  = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const d = Math.floor(hr / 24);
  if (d < 30) return d + 'd ago';
  return new Date(ts).toLocaleDateString();
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Display metadata (label/icon/color per type) is derived from the
// data-contract registry (assets/js/labtools-types.js).
function typeMeta(type) {
  const def = (window.DATA_TYPES || {})[type];
  if (def) {
    return { icon: def.icon || '📄', label: (def.name || type) + 's', color: def.color || '#9b9a97' };
  }
  return { icon: '📄', label: (type || 'generic') + 's', color: '#9b9a97' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. IndexedDB helpers
// ─────────────────────────────────────────────────────────────────────────────

function openDB() {
  return new Promise(function (resolve, reject) {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function (e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('label', 'label', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = function (e) { resolve(e.target.result); };
    req.onerror   = function (e) { reject(e.target.error); };
  });
}

// Run `fn(store, tx)` inside a transaction. Resolves with fn's return value
// once the transaction completes (so writes are durable before resolving).
function dbExec(mode, fn) {
  return openDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try { result = fn(store, tx); }
      catch (err) { db.close(); reject(err); return; }
      tx.oncomplete = function () { db.close(); resolve(result); };
      tx.onerror    = function (e) { db.close(); reject(e.target.error); };
      tx.onabort    = function (e) { db.close(); reject(e.target.error); };
    });
  });
}

// Collect all rows from a cursor over the given index, newest first.
function collectDescending(indexName) {
  return dbExec('readonly', function (store) {
    return new Promise(function (resolve) {
      const items = [];
      store.index(indexName).openCursor(null, 'prev').onsuccess = function (e) {
        const cursor = e.target.result;
        if (cursor) { items.push(cursor.value); cursor.continue(); }
        else resolve(items);
      };
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Cross-tab sync (BroadcastChannel, localStorage fallback)
// ─────────────────────────────────────────────────────────────────────────────

const instanceId = uuid();
const listeners  = [];

let channel = null;
try {
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = function (event) {
    const msg = event.data || {};
    if (msg._sender === instanceId) return;
    const action = msg.action;
    if (action === 'put' || action === 'update') {
      workbench.getItem(msg.id).then(function (item) { notify(action, item); renderDrawer(); });
    } else if (action === 'remove') {
      notify(action, { id: msg.id }); renderDrawer();
    } else if (action === 'clear') {
      notify(action, null); renderDrawer();
    } else {
      renderDrawer();
    }
  };
} catch (_) {
  window.addEventListener('storage', function (e) {
    if (e.key !== '_wb_sync') return;
    try {
      const msg = JSON.parse(e.newValue);
      if (msg._sender === instanceId) return;
      renderDrawer();
    } catch (_) {}
  });
}

function broadcast(action, id) {
  const msg = { action: action, id: id, timestamp: Date.now(), _sender: instanceId };
  if (channel) {
    channel.postMessage(msg);
  } else {
    try { localStorage.setItem('_wb_sync', JSON.stringify(msg)); } catch (_) {}
  }
}

function notify(action, item) {
  listeners.forEach(function (fn) {
    try { fn({ action: action, item: item }); } catch (_) {}
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Public API
// ─────────────────────────────────────────────────────────────────────────────

const workbench = {

  /**
   * Store data in the workbench.
   * Validates the payload against the data-contract registry (strict mode):
   * rejects — and surfaces a toast — when the shape is invalid.
   *
   * @param {string} type       e.g. 'plate-layout', 'sample-list'
   * @param {string} label      user-given name
   * @param {*}      data       JSON-serializable payload
   * @param {object} [metadata] optional { wellCount, unit, ... }
   * @param {string} [tool]     source tool name, e.g. 'bca-assay'
   * @returns {Promise<string>} the new item's id
   */
  put: function (type, label, data, metadata, tool) {
    if (window.validateWorkbenchType) {
      const check = window.validateWorkbenchType(type, data);
      if (!check.valid) {
        const detail = check.errors.slice(0, 5).join('; ');
        const err = new Error('Invalid ' + type + ' data — ' +
          check.errors.length + ' schema violation(s): ' + detail);
        // Log for debugging; the rejection is returned to the caller, which is
        // responsible for the user-facing toast (every tool already does this).
        console.error('Workbench put rejected:', err.message, check.errors);
        return Promise.reject(err);
      }
    }

    const item = {
      id: uuid(),
      type: type,
      label: label,
      tool: tool || '',
      timestamp: Date.now(),
      data: data,
      metadata: metadata || null,
    };
    return dbExec('readwrite', function (store) {
      store.put(item);
      return item.id;
    }).then(function (id) {
      broadcast('put', id);
      renderDrawer();
      return id;
    });
  },

  /** All items, newest first. @returns {Promise<Array>} */
  getAll: function () {
    return collectDescending('timestamp');
  },

  /** Items of one type, newest first. @returns {Promise<Array>} */
  getByType: function (type) {
    return dbExec('readonly', function (store) {
      return new Promise(function (resolve) {
        const items = [];
        store.index('type').openCursor(IDBKeyRange.only(type), 'prev').onsuccess = function (e) {
          const cursor = e.target.result;
          if (cursor) { items.push(cursor.value); cursor.continue(); }
          else resolve(items);
        };
      });
    });
  },

  /** Single item by id, or null. @returns {Promise<object|null>} */
  getItem: function (id) {
    return dbExec('readonly', function (store) {
      return new Promise(function (resolve) {
        const req = store.get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror   = function () { resolve(null); };
      });
    });
  },

  /** First item with an exact label match, or null. @returns {Promise<object|null>} */
  findByName: function (label) {
    return dbExec('readonly', function (store) {
      return new Promise(function (resolve) {
        const req = store.index('label').get(label);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror   = function () { resolve(null); };
      });
    });
  },

  /** Remove an item by id. @returns {Promise<void>} */
  remove: function (id) {
    return dbExec('readwrite', function (store) {
      store.delete(id);
    }).then(function () {
      broadcast('remove', id);
      renderDrawer();
    });
  },

  /** Remove every item. @returns {Promise<void>} */
  clear: function () {
    return dbExec('readwrite', function (store) {
      store.clear();
    }).then(function () {
      broadcast('clear', null);
      renderDrawer();
    });
  },

  /** Rename an item. @returns {Promise<void>} */
  updateLabel: function (id, newLabel) {
    return dbExec('readwrite', function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.get(id);
        req.onsuccess = function () {
          const item = req.result;
          if (!item) { reject(new Error('Item not found')); return; }
          item.label = newLabel;
          item.timestamp = Date.now();
          store.put(item);
          resolve();
        };
        req.onerror = function () { reject(req.error); };
      });
    }).then(function () {
      broadcast('update', id);
      renderDrawer();
    });
  },

  /**
   * Export all items as a JSON string with a portable envelope.
   * @returns {Promise<string>}
   */
  exportJSON: function () {
    return workbench.getAll().then(function (items) {
      return JSON.stringify({
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        items: items,
      }, null, 2);
    });
  },

  /**
   * Import items from a previously exported JSON string. Skips duplicate ids.
   * @param {string} json
   * @returns {Promise<{imported: number, skipped: number}>}
   */
  importJSON: function (json) {
    let data;
    try { data = JSON.parse(json); }
    catch (_) { return Promise.reject(new Error('Invalid JSON')); }
    if (!data || !Array.isArray(data.items)) {
      return Promise.reject(new Error('Invalid workbench export format'));
    }

    return workbench.getAll().then(function (existing) {
      const existingIds = {};
      existing.forEach(function (item) { existingIds[item.id] = true; });

      const toImport = data.items.filter(function (item) { return item && !existingIds[item.id]; });
      const skipped  = data.items.length - toImport.length;
      if (toImport.length === 0) return { imported: 0, skipped: skipped };

      return dbExec('readwrite', function (store) {
        toImport.forEach(function (item) { store.put(item); });
      }).then(function () {
        broadcast('put', null);
        renderDrawer();
        return { imported: toImport.length, skipped: skipped };
      });
    });
  },

  /**
   * Subscribe to changes (from this tab or any other).
   * @param {function} callback  called with { action, item }
   * @returns {function} unsubscribe
   */
  onChange: function (callback) {
    listeners.push(callback);
    return function () {
      const i = listeners.indexOf(callback);
      if (i >= 0) listeners.splice(i, 1);
    };
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Toast
// ─────────────────────────────────────────────────────────────────────────────

let toastTimer = null;
let toastEl = null;

function showToast(message) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'wb-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('wb-toast--visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastEl.classList.remove('wb-toast--visible');
  }, 2200);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Picker modal — let a tool prompt the user to choose an item
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Array}    items    items to choose from
 * @param {function} onSelect called with the chosen item
 * @param {string[]} [types]  optional type list (used in the title)
 */
function showPicker(items, onSelect, types) {
  const existing = document.querySelector('.wb-picker-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'wb-picker-overlay';

  let html = '<div class="wb-picker-modal">';
  html += '<div class="wb-picker-header">';
  html += '<span>Select item from Workbench</span>';
  html += '<button class="wb-picker-close" title="Cancel">&times;</button>';
  html += '</div>';
  html += '<div class="wb-picker-body">';

  if (!items.length) {
    html += '<div class="wb-empty">No matching items in Workbench.</div>';
  } else {
    items.forEach(function (item) {
      const meta = typeMeta(item.type);
      html += '<div class="wb-picker-item" data-id="' + escapeHtml(item.id) + '">';
      html += '<span class="wb-picker-item-icon">' + meta.icon + '</span>';
      html += '<div class="wb-picker-item-info">';
      html += '<span class="wb-picker-item-label">' + escapeHtml(item.label) + '</span>';
      html += '<span class="wb-picker-item-meta">' +
        escapeHtml(item.tool || '') + ' &middot; ' + relativeTime(item.timestamp) + '</span>';
      html += '</div>';
      html += '<span class="lt-badge lt-badge-default" style="margin-left:auto">' + escapeHtml(item.type) + '</span>';
      html += '</div>';
    });
  }

  html += '</div></div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  overlay.querySelectorAll('.wb-picker-item').forEach(function (el) {
    el.addEventListener('click', function () {
      const id = el.getAttribute('data-id');
      const item = items.find(function (it) { return it.id === id; });
      if (item) { overlay.remove(); onSelect(item); }
    });
  });

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector('.wb-picker-close').addEventListener('click', function () {
    overlay.remove();
  });

  function onKey(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
  }
  document.addEventListener('keydown', onKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Drawer UI
// ─────────────────────────────────────────────────────────────────────────────

let drawerOpen = false;
let drawerEl   = null;
let toggleEl   = null;
let bodyWrapEl = null;

function initDrawer() {
  if (drawerEl) return; // already initialized

  // (1) Move the page's existing content into a wrapper FIRST, so the wrapper
  //     can be margin-shifted when the drawer opens. Do this before creating
  //     the drawer container so the container is NOT swept into the wrapper
  //     (that ordering bug shifted the drawer along with the page content).
  bodyWrapEl = document.createElement('div');
  bodyWrapEl.className = 'wb-body-wrapper';
  while (document.body.firstChild) {
    bodyWrapEl.appendChild(document.body.firstChild);
  }
  document.body.appendChild(bodyWrapEl);

  // (2) Build the fixed drawer container as a direct child of <body>,
  //     a sibling of the wrapper (so it stays put while content shifts).
  const container = document.createElement('div');
  container.className = 'wb-drawer-container';

  toggleEl = document.createElement('button');
  toggleEl.className = 'wb-toggle';
  toggleEl.title = 'Workbench';
  toggleEl.innerHTML = '<span class="wb-toggle-icon">📋</span>';
  toggleEl.addEventListener('click', toggleDrawer);

  drawerEl = document.createElement('div');
  drawerEl.className = 'wb-drawer';
  drawerEl.innerHTML =
    '<div class="wb-drawer-header">' +
      '<span class="wb-drawer-title">Workbench</span>' +
      '<button class="wb-drawer-close" title="Close">&times;</button>' +
    '</div>' +
    '<div class="wb-drawer-body" id="wb-drawer-body">' +
      '<div class="wb-empty">No items in Workbench.</div>' +
    '</div>' +
    '<div class="wb-drawer-footer">' +
      '<button class="lt-btn lt-btn-ghost" id="wb-clear-all" style="font-size:0.78rem">Clear All</button>' +
      '<button class="lt-btn lt-btn-ghost" id="wb-export" style="font-size:0.78rem">Export JSON</button>' +
      '<button class="lt-btn lt-btn-ghost" id="wb-import" style="font-size:0.78rem">Import JSON</button>' +
    '</div>';

  container.appendChild(toggleEl);
  container.appendChild(drawerEl);
  document.body.appendChild(container);

  // (3) Wire drawer controls directly — the elements exist now, so there is
  //     no need for the old setTimeout(…, 0) deferral.
  drawerEl.querySelector('.wb-drawer-close').addEventListener('click', function () {
    if (drawerOpen) toggleDrawer();
  });

  drawerEl.querySelector('#wb-clear-all').addEventListener('click', function () {
    if (confirm('Delete all items from Workbench? This cannot be undone.')) {
      workbench.clear();
    }
  });

  drawerEl.querySelector('#wb-export').addEventListener('click', function () {
    workbench.exportJSON().then(function (json) {
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = 'labtools-workbench-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }).catch(function (e) { showToast('Export failed: ' + e.message); });
  });

  drawerEl.querySelector('#wb-import').addEventListener('click', function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', function () {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        workbench.importJSON(reader.result).then(function (r) {
          showToast('Imported ' + r.imported + ' item(s)' +
            (r.skipped ? ', ' + r.skipped + ' skipped (duplicate)' : ''));
        }).catch(function (e) { showToast('Import failed: ' + e.message); });
      };
      reader.readAsText(file);
    });
    input.click();
  });

  renderDrawer();
}

function toggleDrawer() {
  drawerOpen = !drawerOpen;
  drawerEl.classList.toggle('open', drawerOpen);
  toggleEl.classList.toggle('open', drawerOpen);
  document.body.classList.toggle('wb-drawer-open', drawerOpen);
  if (drawerOpen) renderDrawer();
}

function renderDrawer() {
  const body = document.getElementById('wb-drawer-body');
  if (!body) return;

  workbench.getAll().then(function (items) {
    if (!items.length) {
      body.innerHTML = '<div class="wb-empty">No items in Workbench.<br>' +
        '<small>Use &ldquo;Save to Workbench&rdquo; in any tool to add data.</small></div>';
      return;
    }

    // Group by type
    const groups = {};
    items.forEach(function (item) {
      const t = item.type || 'generic';
      (groups[t] || (groups[t] = [])).push(item);
    });

    let html = '';
    Object.keys(groups).forEach(function (type) {
      const meta = typeMeta(type);
      const groupItems = groups[type];
      html += '<div class="wb-group">';
      html += '<div class="wb-group-header">';
      html += '<span class="wb-group-icon">' + meta.icon + '</span>';
      html += '<span class="wb-group-label">' + escapeHtml(meta.label) + '</span>';
      html += '<span class="lt-badge lt-badge-default">' + groupItems.length + '</span>';
      html += '</div>';
      groupItems.forEach(function (item) {
        html += '<div class="wb-card" data-id="' + escapeHtml(item.id) + '">';
        html += '<div class="wb-card-top">';
        html += '<span class="wb-card-label" title="Double-click to rename">' + escapeHtml(item.label) + '</span>';
        html += '<button class="wb-card-delete" title="Delete">&times;</button>';
        html += '</div>';
        html += '<div class="wb-card-meta">' +
          escapeHtml(item.tool || '') + ' &middot; ' + relativeTime(item.timestamp) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    });

    body.innerHTML = html;

    // Delete
    body.querySelectorAll('.wb-card-delete').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const card = btn.closest('.wb-card');
        workbench.remove(card.getAttribute('data-id'));
      });
    });

    // Double-click to rename
    body.querySelectorAll('.wb-card-label').forEach(function (label) {
      label.addEventListener('dblclick', function () {
        const card = label.closest('.wb-card');
        const id = card.getAttribute('data-id');
        const current = label.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = current;
        input.className = 'lt-input';
        input.style.cssText = 'font-size:0.82rem;padding:4px 8px;';
        label.replaceWith(input);
        input.focus();
        input.select();

        function finish() {
          const newLabel = input.value.trim();
          input.replaceWith(label);
          if (newLabel && newLabel !== current) workbench.updateLabel(id, newLabel);
        }
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') { input.value = current; input.blur(); }
        });
      });
    });
  }).catch(function (err) {
    console.error('Workbench render error:', err);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Bootstrap + global exposure
// ─────────────────────────────────────────────────────────────────────────────

// Scripts load in <head> before DOMContentLoaded, so the listener is the
// normal path; the interactive/complete branch only covers late/dynamic
// injection. (In a non-browser shim readyState is undefined → neither runs.)
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  initDrawer();
} else {
  document.addEventListener('DOMContentLoaded', initDrawer);
}

window.workbench  = workbench;
window.showPicker = showPicker;
window.showToast  = showToast;
window.wbTypes    = (window.DATA_TYPES || {});

/**
 * Register stable test hooks for a tool so the integration harness
 * (tests/index.html) can drive it without reaching into globals.
 *
 * @param {string} toolName  e.g. 'bca-assay'
 * @param {object} hooks     { serialize?, apply?, state?, describe? }
 */
function labtoolsRegisterTestHooks(toolName, hooks) {
  window.__labtoolsTestHooks = window.__labtoolsTestHooks || {};
  window.__labtoolsTestHooks[toolName] = hooks;
}
window.labtoolsRegisterTestHooks = labtoolsRegisterTestHooks;
