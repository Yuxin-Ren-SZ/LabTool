/**
 * LabTools Workbench — Shared Data Clipboard & Cross-Tool Transport
 * ==================================================================
 * Persistent data store + left-side slide-out drawer UI. All tools on
 * the same origin share the same database; BroadcastChannel keeps
 * multiple tabs in sync.
 *
 * Drawer / picker / toast markup uses the canonical lt- prefixed classes
 * (lt-workbench-*, lt-picker-*, lt-toast) defined in assets/css/labtools.css.
 *
 * Storage layer (v2): storage goes through the shared storage core
 * assets/js/labtools-store.js — REQUIRED, page load order
 * types → store → workbench. The store is created via
 * window.labtools.store.createStore({...}) with timestamps:false so the
 * legacy record shape {id,type,label,tool,timestamp,data,metadata} is
 * stored byte-identically (no createdAt/updatedAt injection).
 *
 * The database is version 2 and carries a second object store `records`
 * (V2_STORE_NAME) holding v2 record envelopes {id, kind, tool, contract,
 * label, schemaVersion, payload, meta, createdAt, updatedAt}. Both stores
 * build their schema through the shared upgradeV2() function (schema only —
 * no data copy inside the upgrade transaction). Legacy `items` are copied
 * into `records` lazily at runtime as kind:'legacy' records via
 * window.__labtoolsV2Records.copyLegacyToRecords() — idempotent, and the
 * official entry point for v2 consumers (also used by unit tests).
 *
 * Test injection point (unit tests only, never set by production pages):
 *   window.__labtoolsWorkbenchBackend — when set before the first store
 *   operation it is passed as opts.backend to createStore (tests inject
 *   labtools.store.createMemoryBackend(); default undefined → the store's
 *   own browser IndexedDB adapter). Both getStore() and getRecordsStore()
 *   read the same injection point, so items and records share one backend.
 *
 * Loaded via <script src="../../assets/js/labtools-workbench.js">
 * (AFTER labtools-store.js). Exposes the global `workbench` API and
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

if (typeof window !== 'undefined') { (window.__labtoolsLoadOrder = window.__labtoolsLoadOrder || []).push('labtools-workbench'); }

// ─────────────────────────────────────────────────────────────────────────────
// 1. Constants
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME      = 'labtools-workbench';
const DB_VERSION   = 2;   // v2: adds the `records` store (see upgradeV2)
const STORE_NAME   = 'items';
const V2_STORE_NAME = 'records';
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
// 3. Storage layer — shared-store bridge + inline IndexedDB fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a legacy workbench item (the v1 `items` shape) to a v2 record
 * envelope, preserving every field losslessly:
 *   {id,type,label,tool,timestamp,data,metadata}
 *   → {id, kind:'legacy', tool, contract:type, label, schemaVersion:2,
 *      payload:data, meta:metadata, createdAt, updatedAt}
 * Pure function — no store access. Globally exposed for unit tests and
 * the phase 3+ migration (labtoolsLegacyToV2Record).
 */
function labtoolsLegacyToV2Record(item) {
  const ts = item.timestamp || Date.now();
  return {
    id: item.id,
    kind: 'legacy',
    tool: item.tool || '',
    contract: item.type,
    label: item.label,
    schemaVersion: 2,
    payload: item.data,
    meta: item.metadata || null,
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * v2 schema upgrade — shared by BOTH storage paths (the shared-store
 * bridge via the migrations mechanism, and the inline IndexedDB fallback
 * via a raw upgrade handle) so both build byte-identical databases.
 * Only creates schema (stores + indexes). Data migration (items → records)
 * happens lazily at runtime through copyLegacyToRecords() — never inside
 * the versionchange upgrade, because store methods open their own
 * transactions and cannot run inside the upgrade transaction.
 *
 * @param {{storeExists: function(string): boolean,
 *          createObjectStore: function(object): object}} dbHandle
 */
function upgradeV2(dbHandle) {
  if (!dbHandle.storeExists(STORE_NAME)) {
    dbHandle.createObjectStore({ name: STORE_NAME, keyPath: 'id',
      indexes: [{ name: 'type', keyPath: 'type' }, { name: 'label', keyPath: 'label' },
                { name: 'timestamp', keyPath: 'timestamp' }] });
  }
  if (!dbHandle.storeExists(V2_STORE_NAME)) {
    dbHandle.createObjectStore({ name: V2_STORE_NAME, keyPath: 'id',
      indexes: [{ name: 'kind', keyPath: 'kind' }, { name: 'tool', keyPath: 'tool' },
                { name: 'contract', keyPath: 'contract' }, { name: 'label', keyPath: 'label' },
                { name: 'updatedAt', keyPath: 'updatedAt' }] });
  }
}

let storeHandle = null;

/**
 * Storage handle over the legacy `items` object store via the shared storage
 * core (labtools-store.js — REQUIRED, load order types → store → workbench).
 * Lazily created on first use with timestamps:false so legacy records
 * {id,type,label,tool,timestamp,data,metadata} are stored byte-identically.
 *
 * Test injection point: window.__labtoolsWorkbenchBackend — when set before
 * the first store operation it is passed as opts.backend (unit tests inject
 * labtools.store.createMemoryBackend()). Undefined in production → the
 * store's browser IndexedDB adapter.
 */
function getStore() {
  if (!(typeof window !== 'undefined' && window.labtools && window.labtools.store &&
      typeof window.labtools.store.createStore === 'function')) {
    throw new Error('labtools-workbench: labtools-store.js required — load it before labtools-workbench.js');
  }
  if (!storeHandle) {
    const opts = { dbName: DB_NAME, version: DB_VERSION, storeName: STORE_NAME,
      indexes: [{ name: 'type', keyPath: 'type' }, { name: 'label', keyPath: 'label' },
                { name: 'timestamp', keyPath: 'timestamp' }],
      migrations: { 2: upgradeV2 },   // v2 schema: adds the `records` store
      timestamps: false };   // legacy 记录 {id,type,label,tool,timestamp,data,metadata} 字节兼容
    if (window.__labtoolsWorkbenchBackend) opts.backend = window.__labtoolsWorkbenchBackend;  // 测试注入点
    storeHandle = window.labtools.store.createStore(opts);
  }
  return storeHandle;
}

let recordsHandle = null;

/**
 * v2 records store — second object store (`records`) of the same database,
 * holding v2 record envelopes with automatic createdAt/updatedAt timestamps
 * (timestamps:true). Same backend injection point as getStore().
 */
function getRecordsStore() {
  if (!recordsHandle) {
    const opts = { dbName: DB_NAME, version: DB_VERSION, storeName: V2_STORE_NAME,
      indexes: [{ name: 'kind', keyPath: 'kind' }, { name: 'tool', keyPath: 'tool' },
                { name: 'contract', keyPath: 'contract' }, { name: 'label', keyPath: 'label' },
                { name: 'updatedAt', keyPath: 'updatedAt' }],
      migrations: { 2: upgradeV2 },
      timestamps: true };   // v2 记录默认时间戳语义
    if (window.__labtoolsWorkbenchBackend) opts.backend = window.__labtoolsWorkbenchBackend;  // 测试注入点
    recordsHandle = window.labtools.store.createStore(opts);
  }
  return recordsHandle;
}

/**
 * Idempotent, lossless copy of legacy `items` into v2 `records` as
 * kind:'legacy' records (via labtoolsLegacyToV2Record). Runs lazily at
 * runtime — never inside the upgrade transaction, because store methods
 * open their own transactions and cannot run inside a versionchange
 * upgrade. Record ids already present in `records` are skipped, so
 * repeated calls are no-ops.
 *
 * Rejects with an explicit error when the shared store is not loaded
 * (getStore()/getRecordsStore() return null on the inline fallback path).
 *
 * @returns {Promise<{copied:number, existing:number}>}
 */
function copyLegacyToRecords() {
  const recs = getRecordsStore();
  const items = getStore();
  if (!recs || !items) {
    return Promise.reject(new Error(
      'labtools-store.js not loaded — cannot copy legacy items into v2 records'));
  }
  // {index:null} → primary-key order; the records store has no 'timestamp'
  // index (it uses updatedAt), so the default 'timestamp' index would throw.
  return recs.getAll({ index: null }).then(function (existing) {
    const ids = {};
    existing.forEach(function (r) { ids[r.id] = true; });
    return items.getAll({ index: 'timestamp', direction: 'prev' }).then(function (list) {
      const todo = list.filter(function (it) { return !ids[it.id]; });
      if (!todo.length) return { copied: 0, existing: existing.length };
      return todo.reduce(function (chain, it) {
        return chain.then(function () { return recs.put(labtoolsLegacyToV2Record(it)); });
      }, Promise.resolve()).then(function () {
        return { copied: todo.length, existing: existing.length };
      });
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

    const storeApi = getStore();
    return storeApi.put(item).then(function () {
      // Local listeners see the same event shape as the cross-tab path.
      notify('put', item);
      return item.id;
    }).then(function (id) {
      broadcast('put', id);
      renderDrawer();
      return id;
    });
  },

  /** All items, newest first. @returns {Promise<Array>} */
  getAll: function () {
    return getStore().getAll({ index: 'timestamp', direction: 'prev' });
  },

  /** Items of one type, newest first. @returns {Promise<Array>} */
  getByType: function (type) {
    // getByIndex is unordered — sort by timestamp descending (newest first).
    return getStore().getByIndex('type', type).then(function (items) {
      return items.slice().sort(function (a, b) {
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
    });
  },

  /** Single item by id, or null. @returns {Promise<object|null>} */
  getItem: function (id) {
    return getStore().get(id);
  },

  /** First item with an exact label match, or null. @returns {Promise<object|null>} */
  findByName: function (label) {
    return getStore().getByIndex('label', label).then(function (matches) {
      return matches && matches.length > 0 ? matches[0] : null;
    });
  },

  /** Remove an item by id. @returns {Promise<void>} */
  remove: function (id) {
    return getStore().remove(id).then(function () {
      notify('remove', { id: id });
      broadcast('remove', id);
      renderDrawer();
    });
  },

  /** Remove every item. @returns {Promise<void>} */
  clear: function () {
    return getStore().clear().then(function () {
      notify('clear', null);
      broadcast('clear', null);
      renderDrawer();
    });
  },

  /** Rename an item. @returns {Promise<void>} */
  updateLabel: function (id, newLabel) {
    const storeApi = getStore();
    return storeApi.get(id).then(function (item) {
      if (!item) throw new Error('Item not found');
      item.label = newLabel;
      item.timestamp = Date.now();
      return storeApi.put(item);
    }).then(function (item) {
      // Local listeners see the same event shape as the cross-tab path.
      notify('update', item);
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

      const storeApi = getStore();
      return toImport.reduce(function (chain, item) {
        return chain.then(function () { return storeApi.put(item); });
      }, Promise.resolve()).then(function () {
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
    toastEl.className = 'lt-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('lt-toast--visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastEl.classList.remove('lt-toast--visible');
  }, 2200);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Picker modal — let a tool prompt the user to choose an item
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the picker modal HTML (pure string builder — no DOM access). Item
 * display metadata comes from a per-id map so the builder stays side-effect
 * free.
 * @param {Array}  items     items to render as rows
 * @param {object} metaById  item.id → { icon, label, ... } display metadata
 */
function buildPickerModal(items, metaById) {
  let html = '<div class="lt-picker-modal">';
  html += '<div class="lt-picker-header">';
  html += '<span>Select item from Workbench</span>';
  html += '<button class="lt-picker-close" aria-label="Close" title="Cancel">&times;</button>';
  html += '</div>';
  html += '<div class="lt-picker-body">';

  if (!items.length) {
    html += '<div class="lt-workbench-empty">No matching items in Workbench.</div>';
  } else {
    items.forEach(function (item) {
      const meta = metaById[item.id];
      html += '<div class="lt-picker-item" data-id="' + escapeHtml(item.id) + '" tabindex="0">';
      html += '<span class="lt-picker-item-icon">' + meta.icon + '</span>';
      html += '<div class="lt-picker-item-info">';
      html += '<span class="lt-picker-item-label">' + escapeHtml(item.label) + '</span>';
      html += '<span class="lt-picker-item-meta">' +
        escapeHtml(item.tool || '') + ' &middot; ' + relativeTime(item.timestamp) + '</span>';
      html += '</div>';
      html += '<span class="lt-badge lt-badge-default">' + escapeHtml(item.type) + '</span>';
      html += '</div>';
    });
  }

  html += '</div></div>';
  return html;
}

/**
 * @param {Array}    items    items to choose from
 * @param {function} onSelect called with the chosen item
 * @param {string[]} [types]  optional type list (used in the title)
 */
function showPicker(items, onSelect, types) {
  const existing = document.querySelector('.lt-picker-overlay');
  if (existing) existing.remove();

  const metaById = {};
  items.forEach(function (item) { metaById[item.id] = typeMeta(item.type); });

  const overlay = document.createElement('div');
  overlay.className = 'lt-picker-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Select item from Workbench');
  overlay.innerHTML = buildPickerModal(items, metaById);
  document.body.appendChild(overlay);

  // Shared select path — click and Enter/Space keyboard activation both call it.
  function choose(el) {
    const id = el.getAttribute('data-id');
    const item = items.find(function (it) { return it.id === id; });
    if (item) { overlay.remove(); onSelect(item); }
  }

  overlay.querySelectorAll('.lt-picker-item').forEach(function (el) {
    el.addEventListener('click', function () { choose(el); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(el); }
    });
  });

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector('.lt-picker-close').addEventListener('click', function () {
    overlay.remove();
  });

  function onKey(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
  }
  document.addEventListener('keydown', onKey);

  // Keyboard users land on the first row.
  const firstItem = overlay.querySelector('.lt-picker-item');
  if (firstItem) firstItem.focus();
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Drawer UI
// ─────────────────────────────────────────────────────────────────────────────

let drawerOpen = false;
let drawerEl   = null;
let toggleEl   = null;
let bodyWrapEl = null;

function buildDrawerShell() {
  return '<div class="lt-workbench-drawer-header">' +
    '<span class="lt-workbench-drawer-title">Workbench</span>' +
    '<button class="lt-workbench-drawer-close" aria-label="Close workbench" title="Close">&times;</button>' +
    '</div>' +
    '<div class="lt-workbench-drawer-body" id="lt-workbench-drawer-body">' +
    '<div class="lt-workbench-empty">No items in Workbench.</div>' +
    '</div>' +
    '<div class="lt-workbench-drawer-footer">' +
    '<button class="lt-btn lt-btn-ghost lt-btn-compact" id="lt-workbench-clear-all">Clear All</button>' +
    '<button class="lt-btn lt-btn-ghost lt-btn-compact" id="lt-workbench-export">Export JSON</button>' +
    '<button class="lt-btn lt-btn-ghost lt-btn-compact" id="lt-workbench-import">Import JSON</button>' +
    '</div>';
}

function initDrawer() {
  if (drawerEl) return; // already initialized

  // (1) Move the page's existing content into a wrapper FIRST, so the wrapper
  //     can be margin-shifted when the drawer opens. Do this before creating
  //     the drawer container so the container is NOT swept into the wrapper
  //     (that ordering bug shifted the drawer along with the page content).
  bodyWrapEl = document.createElement('div');
  bodyWrapEl.className = 'lt-workbench-body';
  while (document.body.firstChild) {
    bodyWrapEl.appendChild(document.body.firstChild);
  }
  document.body.appendChild(bodyWrapEl);

  // (2) Build the fixed drawer container as a direct child of <body>,
  //     a sibling of the wrapper (so it stays put while content shifts).
  const container = document.createElement('div');
  container.className = 'lt-workbench-container';

  toggleEl = document.createElement('button');
  toggleEl.className = 'lt-workbench-toggle';
  toggleEl.title = 'Workbench';
  toggleEl.setAttribute('aria-expanded', 'false');
  toggleEl.setAttribute('aria-controls', 'lt-workbench-drawer');
  toggleEl.innerHTML = '<span class="lt-workbench-toggle-icon">📋</span>';
  toggleEl.addEventListener('click', toggleDrawer);

  drawerEl = document.createElement('div');
  drawerEl.className = 'lt-workbench-drawer';
  drawerEl.id = 'lt-workbench-drawer';
  drawerEl.setAttribute('role', 'dialog');
  drawerEl.setAttribute('aria-label', 'Workbench');
  drawerEl.setAttribute('aria-modal', 'false');
  drawerEl.innerHTML = buildDrawerShell();

  container.appendChild(toggleEl);
  container.appendChild(drawerEl);
  document.body.appendChild(container);

  // (3) Wire drawer controls directly — the elements exist now, so there is
  //     no need for the old setTimeout(…, 0) deferral.
  drawerEl.querySelector('.lt-workbench-drawer-close').addEventListener('click', function () {
    if (drawerOpen) toggleDrawer();
  });

  drawerEl.querySelector('#lt-workbench-clear-all').addEventListener('click', function () {
    if (confirm('Delete all items from Workbench? This cannot be undone.')) {
      workbench.clear();
    }
  });

  drawerEl.querySelector('#lt-workbench-export').addEventListener('click', function () {
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

  drawerEl.querySelector('#lt-workbench-import').addEventListener('click', function () {
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
  toggleEl.setAttribute('aria-expanded', String(drawerOpen));
  document.body.classList.toggle('lt-workbench-open', drawerOpen);
  if (drawerOpen) renderDrawer();
}

function buildDrawerGroupsHtml(groups) {
  let html = '';
  Object.keys(groups).forEach(function (type) {
    const meta = typeMeta(type);
    const groupItems = groups[type];
    html += '<div class="lt-workbench-group">';
    html += '<div class="lt-workbench-group-header">';
    html += '<span class="lt-workbench-group-icon">' + meta.icon + '</span>';
    html += '<span class="lt-workbench-group-label">' + escapeHtml(meta.label) + '</span>';
    html += '<span class="lt-badge lt-badge-default">' + groupItems.length + '</span>';
    html += '</div>';
    groupItems.forEach(function (item) {
      html += '<div class="lt-workbench-card" data-id="' + escapeHtml(item.id) + '">';
      html += '<div class="lt-workbench-card-top">';
      html += '<span class="lt-workbench-card-label" title="Double-click to rename">' + escapeHtml(item.label) + '</span>';
      html += '<button class="lt-workbench-card-delete" title="Delete">&times;</button>';
      html += '</div>';
      html += '<div class="lt-workbench-card-meta">' +
        escapeHtml(item.tool || '') + ' &middot; ' + relativeTime(item.timestamp) + '</div>';
      html += '</div>';
    });
    html += '</div>';
  });
  return html;
}

function renderDrawer() {
  const body = document.getElementById('lt-workbench-drawer-body');
  if (!body) return;

  workbench.getAll().then(function (items) {
    if (!items.length) {
      body.innerHTML = '<div class="lt-workbench-empty">No items in Workbench.<br>' +
        '<small>Use &ldquo;Save to Workbench&rdquo; in any tool to add data.</small></div>';
      return;
    }

    // Group by type
    const groups = {};
    items.forEach(function (item) {
      const t = item.type || 'generic';
      (groups[t] || (groups[t] = [])).push(item);
    });

    body.innerHTML = buildDrawerGroupsHtml(groups);

    // Delete
    body.querySelectorAll('.lt-workbench-card-delete').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const card = btn.closest('.lt-workbench-card');
        workbench.remove(card.getAttribute('data-id'));
      });
    });

    // Double-click to rename
    body.querySelectorAll('.lt-workbench-card-label').forEach(function (label) {
      label.addEventListener('dblclick', function () {
        const card = label.closest('.lt-workbench-card');
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
// v2 record mapping (pure function) + v2 records copy entry point
// (tests + the phase 3+ official migration path).
window.labtoolsLegacyToV2Record = labtoolsLegacyToV2Record;
window.__labtoolsV2Records = { copyLegacyToRecords: copyLegacyToRecords };

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
