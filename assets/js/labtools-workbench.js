/**
 * LabTools Workbench — Shared Data Clipboard & Cross-Tool Transport
 * ==================================================================
 * IndexedDB-backed persistent data store + left-side slide-out drawer UI.
 * All tools on the same origin share the same database.
 * BroadcastChannel keeps multiple tabs in sync.
 *
 * Loaded via <script src="../../assets/js/labtools-workbench.js">
 * Exposes global `workbench` API + auto-injects the drawer into <body>.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Constants
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME    = 'labtools-workbench';
const DB_VERSION = 1;
const STORE_NAME = 'items';
const CHANNEL_NAME = 'labtools-workbench';

const TYPE_META = {
  'plate-layout':   { icon: '📋', label: 'Plate Layouts',   color: '#5c8dff' },
  'sample-list':    { icon: '🧪', label: 'Sample Lists',    color: '#57a85a' },
  'conc-data':      { icon: '📊', label: 'Concentration Data', color: '#d97706' },
  'qpcr-results':   { icon: '📈', label: 'qPCR Results',    color: '#e03e3e' },
  'seeding-plan':   { icon: '⚗️', label: 'Seeding Plans',   color: '#8e44ad' },
  'protocol':       { icon: '⏱', label: 'Protocols',        color: '#2c7fb8' },
  'generic':        { icon: '📄', label: 'Other',            color: '#9b9a97' },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Utilities
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

function dbExec(mode, fn) {
  return openDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const result = fn(store, tx);
      tx.oncomplete = function () { db.close(); resolve(result); };
      tx.onerror    = function (e) { db.close(); reject(e.target.error); };
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. BroadcastChannel cross-tab sync
// ─────────────────────────────────────────────────────────────────────────────

const instanceId = uuid();
const listeners = [];

let channel = null;
try {
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = function (event) {
    if (event.data._sender === instanceId) return;
    // Re-read from DB to get the authoritative state
    const action = event.data.action;
    if (action === 'put' || action === 'update') {
      workbench.getItem(event.data.id).then(function (item) {
        notify(action, item);
        renderDrawer();
      });
    } else if (action === 'remove') {
      notify(action, { id: event.data.id });
      renderDrawer();
    } else if (action === 'clear') {
      notify(action, null);
      renderDrawer();
    }
  };
} catch (_) {
  // BroadcastChannel not available — fall back to localStorage event
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
    // localStorage fallback
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
   * Put data into the workbench.
   * @param {string}  type     e.g. 'plate-layout', 'sample-list'
   * @param {string}  label    User-given name
   * @param {*}       data     Tool-specific JSON-serializable payload
   * @param {object}  [metadata] Optional { wellCount, plateFormat, unit, ... }
   * @param {string}  [tool]   Source tool name, e.g. 'bca-assay'
   * @returns {Promise<string>} The new item's id
   */
  put: function (type, label, data, metadata, tool) {
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

  /**
   * Get all items, sorted newest first.
   * @returns {Promise<Array>}
   */
  getAll: function () {
    return dbExec('readonly', function (store) {
      return new Promise(function (resolve) {
        const items = [];
        const idx = store.index('timestamp');
        idx.openCursor(null, 'prev').onsuccess = function (e) {
          const cursor = e.target.result;
          if (cursor) { items.push(cursor.value); cursor.continue(); }
          else resolve(items);
        };
      });
    });
  },

  /**
   * Get items filtered by type.
   * @param {string} type
   * @returns {Promise<Array>}
   */
  getByType: function (type) {
    return dbExec('readonly', function (store) {
      return new Promise(function (resolve) {
        const items = [];
        const idx = store.index('type');
        idx.openCursor(IDBKeyRange.only(type), 'prev').onsuccess = function (e) {
          const cursor = e.target.result;
          if (cursor) { items.push(cursor.value); cursor.continue(); }
          else resolve(items);
        };
      });
    });
  },

  /**
   * Get a single item by id.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  getItem: function (id) {
    return dbExec('readonly', function (store) {
      return new Promise(function (resolve) {
        const req = store.get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror   = function () { resolve(null); };
      });
    });
  },

  /**
   * Find an item by exact label match. Returns null if none found.
   * @param {string} label
   * @returns {Promise<object|null>}
   */
  findByName: function (label) {
    return dbExec('readonly', function (store) {
      return new Promise(function (resolve) {
        const idx = store.index('label');
        const req = idx.get(label);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror   = function () { resolve(null); };
      });
    });
  },

  /**
   * Remove an item by id.
   * @param {string} id
   * @returns {Promise<void>}
   */
  remove: function (id) {
    return dbExec('readwrite', function (store) {
      store.delete(id);
    }).then(function () {
      broadcast('remove', id);
      renderDrawer();
    });
  },

  /**
   * Clear all items.
   * @returns {Promise<void>}
   */
  clear: function () {
    return dbExec('readwrite', function (store) {
      store.clear();
    }).then(function () {
      broadcast('clear', null);
      renderDrawer();
    });
  },

  /**
   * Rename an item.
   * @param {string} id
   * @param {string} newLabel
   * @returns {Promise<void>}
   */
  updateLabel: function (id, newLabel) {
    return dbExec('readwrite', function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.get(id);
        req.onsuccess = function () {
          const item = req.result;
          if (!item) return reject(new Error('Item not found'));
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
   * Export all items as a JSON string.
   * @returns {Promise<string>}
   */
  exportJSON: function () {
    return workbench.getAll().then(function (items) {
      return JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        items: items,
      }, null, 2);
    });
  },

  /**
   * Import items from a previously exported JSON string.
   * Skips duplicate IDs. Returns counts.
   * @param {string} json
   * @returns {Promise<{imported: number, skipped: number}>}
   */
  importJSON: function (json) {
    var data;
    try { data = JSON.parse(json); } catch (_) {
      return Promise.reject(new Error('Invalid JSON'));
    }
    if (!data || !Array.isArray(data.items)) {
      return Promise.reject(new Error('Invalid workbench export format'));
    }

    // Get existing IDs to skip duplicates
    return workbench.getAll().then(function (existing) {
      var existingIds = {};
      existing.forEach(function (item) { existingIds[item.id] = true; });

      var toImport = data.items.filter(function (item) { return !existingIds[item.id]; });
      var skipped  = data.items.length - toImport.length;

      if (toImport.length === 0) return { imported: 0, skipped: skipped };

      return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE_NAME, 'readwrite');
          var store = tx.objectStore(STORE_NAME);
          toImport.forEach(function (item) { store.put(item); });
          tx.oncomplete = function () {
            db.close();
            broadcast('put', null);
            renderDrawer();
            resolve({ imported: toImport.length, skipped: skipped });
          };
          tx.onerror = function (e) { db.close(); reject(e.target.error); };
        });
      });
    });
  },

  /**
   * Subscribe to changes (from any tab).
   * Returns an unsubscribe function.
   * @param {function} callback  Called with { action, item }
   * @returns {function} unsubscribe
   */
  onChange: function (callback) {
    listeners.push(callback);
    return function () {
      var i = listeners.indexOf(callback);
      if (i >= 0) listeners.splice(i, 1);
    };
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Toast notification
// ─────────────────────────────────────────────────────────────────────────────

var toastTimer = null;
var toastEl = null;

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
// 7. Picker Modal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Show a picker modal so the user can select a workbench item.
 * @param {Array}    items    WorkbenchItem[]
 * @param {function} onSelect Called with the selected item
 * @param {string[]} [types]  Optional list of type strings for the title
 */
function showPicker(items, onSelect, types) {
  // Remove any existing picker
  var existing = document.querySelector('.wb-picker-overlay');
  if (existing) existing.remove();

  var typeLabel = types ? types.join(', ') : 'all types';

  var overlay = document.createElement('div');
  overlay.className = 'wb-picker-overlay';

  var html = '<div class="wb-picker-modal">';
  html += '<div class="wb-picker-header">';
  html += '<span>Select item from Workbench</span>';
  html += '<button class="wb-picker-close" title="Cancel">&times;</button>';
  html += '</div>';
  html += '<div class="wb-picker-body">';

  if (items.length === 0) {
    html += '<div class="wb-empty">No matching items in Workbench.</div>';
  } else {
    items.forEach(function (item) {
      var meta = TYPE_META[item.type] || TYPE_META['generic'];
      html += '<div class="wb-picker-item" data-id="' + escapeHtml(item.id) + '">';
      html += '<span class="wb-picker-item-icon">' + meta.icon + '</span>';
      html += '<div class="wb-picker-item-info">';
      html += '<span class="wb-picker-item-label">' + escapeHtml(item.label) + '</span>';
      html += '<span class="wb-picker-item-meta">' +
        escapeHtml(item.tool || '') + ' &middot; ' + relativeTime(item.timestamp) +
        '</span>';
      html += '</div>';
      html += '<span class="lt-badge lt-badge-default" style="margin-left:auto">' + escapeHtml(item.type) + '</span>';
      html += '</div>';
    });
  }

  html += '</div></div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  // Click item → select
  overlay.querySelectorAll('.wb-picker-item').forEach(function (el) {
    el.addEventListener('click', function () {
      var id = el.getAttribute('data-id');
      var item = items.find(function (it) { return it.id === id; });
      if (item) {
        overlay.remove();
        onSelect(item);
      }
    });
  });

  // Click overlay background → cancel
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.remove();
  });

  // Close button → cancel
  overlay.querySelector('.wb-picker-close').addEventListener('click', function () {
    overlay.remove();
  });

  // Escape key → cancel
  function onKey(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
  }
  document.addEventListener('keydown', onKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Drawer UI
// ─────────────────────────────────────────────────────────────────────────────

var drawerOpen = false;
var drawerEl = null;
var toggleEl = null;
var overlayEl = null;
var bodyEl = null;

function initDrawer() {
  if (drawerEl) return; // already initialized

  // Container
  var container = document.createElement('div');
  container.className = 'wb-drawer-container';

  // Toggle button (collapsed tab)
  toggleEl = document.createElement('button');
  toggleEl.className = 'wb-toggle';
  toggleEl.title = 'Workbench';
  toggleEl.innerHTML = '<span class="wb-toggle-icon">📋</span>';
  toggleEl.addEventListener('click', toggleDrawer);

  // Drawer panel
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

  // Overlay
  overlayEl = document.createElement('div');
  overlayEl.className = 'wb-overlay';
  overlayEl.addEventListener('click', function () { if (drawerOpen) toggleDrawer(); });

  container.appendChild(toggleEl);
  container.appendChild(drawerEl);
  container.appendChild(overlayEl);
  document.body.appendChild(container);

  // Wire footer buttons
  setTimeout(function () {
    var clearBtn = document.getElementById('wb-clear-all');
    var exportBtn = document.getElementById('wb-export');
    var importBtn = document.getElementById('wb-import');
    var closeBtn = drawerEl.querySelector('.wb-drawer-close');

    if (closeBtn) closeBtn.addEventListener('click', function () { if (drawerOpen) toggleDrawer(); });

    if (clearBtn) clearBtn.addEventListener('click', function () {
      if (confirm('Delete all items from Workbench? This cannot be undone.')) {
        workbench.clear();
      }
    });

    if (exportBtn) exportBtn.addEventListener('click', function () {
      workbench.exportJSON().then(function (json) {
        var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href = url;
        a.download = 'labtools-workbench-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      }).catch(function (e) {
        showToast('Export failed: ' + e.message);
      });
    });

    if (importBtn) importBtn.addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', function () {
        var file = input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          workbench.importJSON(reader.result).then(function (r) {
            showToast('Imported ' + r.imported + ' item(s)' + (r.skipped ? ', ' + r.skipped + ' skipped (duplicate)' : ''));
          }).catch(function (e) {
            showToast('Import failed: ' + e.message);
          });
        };
        reader.readAsText(file);
      });
      input.click();
    });
  }, 0);

  // Body wrapper for shift when drawer opens
  bodyEl = document.createElement('div');
  bodyEl.className = 'wb-body-wrapper';
  while (document.body.firstChild) {
    bodyEl.appendChild(document.body.firstChild);
  }
  document.body.appendChild(bodyEl);
}

function toggleDrawer() {
  drawerOpen = !drawerOpen;
  if (drawerOpen) {
    drawerEl.classList.add('open');
    overlayEl.classList.add('open');
    toggleEl.classList.add('open');
    document.body.classList.add('wb-drawer-open');
    renderDrawer();
  } else {
    drawerEl.classList.remove('open');
    overlayEl.classList.remove('open');
    toggleEl.classList.remove('open');
    document.body.classList.remove('wb-drawer-open');
  }
}

function renderDrawer() {
  var body = document.getElementById('wb-drawer-body');
  if (!body) return;

  workbench.getAll().then(function (items) {
    if (items.length === 0) {
      body.innerHTML = '<div class="wb-empty">No items in Workbench.<br><small>Use &ldquo;Save to Workbench&rdquo; in any tool to add data.</small></div>';
      return;
    }

    // Group by type
    var groups = {};
    items.forEach(function (item) {
      var t = item.type || 'generic';
      if (!groups[t]) groups[t] = [];
      groups[t].push(item);
    });

    var html = '';
    Object.keys(groups).forEach(function (type) {
      var meta = TYPE_META[type] || TYPE_META['generic'];
      var groupItems = groups[type];
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
          escapeHtml(item.tool || '') + ' &middot; ' + relativeTime(item.timestamp) +
          '</div>';
        html += '</div>';
      });

      html += '</div>';
    });

    // Check if the mouse is inside the drawer body to avoid re-render while
    // user is interacting with items (e.g., editing a label)
    body.innerHTML = html;

    // Wire delete buttons
    body.querySelectorAll('.wb-card-delete').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var card = btn.closest('.wb-card');
        var id = card.getAttribute('data-id');
        workbench.remove(id);
      });
    });

    // Wire double-click to rename
    body.querySelectorAll('.wb-card-label').forEach(function (label) {
      label.addEventListener('dblclick', function () {
        var card = label.closest('.wb-card');
        var id = card.getAttribute('data-id');
        var current = label.textContent;
        var input = document.createElement('input');
        input.type = 'text';
        input.value = current;
        input.className = 'lt-input';
        input.style.cssText = 'font-size:0.82rem;padding:4px 8px;';

        label.replaceWith(input);
        input.focus();
        input.select();

        function finish() {
          var newLabel = input.value.trim();
          input.replaceWith(label);
          if (newLabel && newLabel !== current) {
            workbench.updateLabel(id, newLabel);
          }
        }

        input.addEventListener('blur', finish);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { input.blur(); }
          if (e.key === 'Escape') { input.value = current; input.blur(); }
        });
      });
    });
  }).catch(function (err) {
    console.error('Workbench render error:', err);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Initialize on DOM ready
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  initDrawer();
});

// Expose globally
window.workbench  = workbench;
window.showPicker = showPicker;
window.showToast  = showToast;
window.wbTypes    = TYPE_META;
