'use strict';

/**
 * LabTools — Shared storage core (v2)
 * ==================================================================
 * IndexedDB-shaped record store with a pluggable backend. Pure logic,
 * no DOM: the browser IndexedDB adapter is created lazily (this file
 * loads fine in a VM with no `indexedDB` global), and an in-memory
 * backend with identical open/upgrade/transaction semantics makes the
 * whole store — migrations, indexes, CRUD — unit-testable in Node.
 *
 * Loaded via <script src="../../assets/js/labtools-store.js">.
 * Exposes window.labtools.store = { createStore, createMemoryBackend, newRecord }.
 *
 * createStore(opts) manages one object store of v2 records. With the default
 * opts.timestamps=true, put() auto-fills missing createdAt/updatedAt and
 * update()/upsert() refresh updatedAt. With opts.timestamps=false the store
 * stores records exactly as the caller provided them (no timestamp
 * injection) — the legacy byte-compatible mode the workbench refactor needs.
 *
 * Backend interface (implemented by both backends):
 *   backend.open(name, version, upgradeCb) -> Promise<db>
 *     upgradeCb(db, oldVersion, newVersion) is called exactly when the
 *     requested version exceeds the stored version (browser: onupgradeneeded).
 *   db.close()
 *   db.storeExists(name) -> boolean          // internal helper (native IDB: objectStoreNames.contains)
 *   db.createObjectStore({ name, keyPath, indexes })   // only inside upgradeCb
 *   db.store(name) -> { get, put, delete, clear, getAll, index(name).getAll }
 */

(function (root) {
  const lt = root.labtools = root.labtools || {};
  (root.__labtoolsLoadOrder = root.__labtoolsLoadOrder || []).push('labtools-store');

  // ─────────────────────────────────────────────────────────────────────────────
  // Small utilities
  // ─────────────────────────────────────────────────────────────────────────────

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // In-memory backend — mirrors the IDB shape: Map storage, version tracking,
  // upgradeCb fired when version > stored version (including first open, where
  // the stored version is 0), primary-key-ordered getAll.
  // ─────────────────────────────────────────────────────────────────────────────

  function createMemoryBackend() {
    const dbs = {};

    function cloneRecord(record) {
      return Object.assign({}, record);
    }

    function makeStoreHandle(storeState) {
      return {
        get: function (id) {
          const record = storeState.records.get(id);
          return Promise.resolve(record ? cloneRecord(record) : null);
        },
        put: function (record) {
          const key = record[storeState.keyPath];
          storeState.records.set(key, cloneRecord(record));
          return Promise.resolve(cloneRecord(record));
        },
        delete: function (id) {
          storeState.records.delete(id);
          return Promise.resolve();
        },
        clear: function () {
          storeState.records.clear();
          return Promise.resolve();
        },
        getAll: function () {
          const keys = Array.from(storeState.records.keys()).sort();
          return Promise.resolve(keys.map(function (k) {
            return cloneRecord(storeState.records.get(k));
          }));
        },
        index: function (name) {
          let idxDef = null;
          for (let i = 0; i < storeState.indexes.length; i++) {
            if (storeState.indexes[i].name === name) { idxDef = storeState.indexes[i]; break; }
          }
          if (!idxDef) throw new Error('index not found: ' + name);
          return {
            getAll: function (query) {
              const out = [];
              storeState.records.forEach(function (record) {
                const value = record[idxDef.keyPath];
                if (query == null || value === query) out.push(cloneRecord(record));
              });
              return Promise.resolve(out);
            },
          };
        },
      };
    }

    function makeDBHandle(dbState) {
      return {
        close: function () { dbState.closed = true; },
        storeExists: function (name) {
          return Object.prototype.hasOwnProperty.call(dbState.stores, name);
        },
        createObjectStore: function (cfg) {
          const name = cfg.name;
          if (dbState.stores[name]) throw new Error('store already exists: ' + name);
          dbState.stores[name] = {
            keyPath: cfg.keyPath || 'id',
            indexes: (cfg.indexes || []).map(function (i) {
              return { name: i.name, keyPath: i.keyPath, unique: !!i.unique };
            }),
            records: new Map(),
          };
          return makeStoreHandle(dbState.stores[name]);
        },
        store: function (name) {
          const state = dbState.stores[name];
          if (!state) throw new Error('store not found: ' + name);
          return makeStoreHandle(state);
        },
      };
    }

    return {
      open: function (name, version, upgradeCb) {
        return Promise.resolve().then(function () {
          let dbState = dbs[name];
          if (!dbState) {
            dbState = { name: name, version: 0, stores: {}, closed: false };
            dbs[name] = dbState;
          }
          dbState.closed = false;
          if (version > dbState.version) {
            const oldVersion = dbState.version;
            if (upgradeCb) upgradeCb(makeDBHandle(dbState), oldVersion, version);
            dbState.version = version;
          }
          return makeDBHandle(dbState);
        });
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Browser IndexedDB adapter — lazy: `indexedDB` is only touched on open().
  // Each store operation opens its own transaction (same pattern as the legacy
  // workbench's dbExec), so writes resolve only after the transaction commits.
  // ─────────────────────────────────────────────────────────────────────────────

  function idbStoreHandle(rawDB, storeName) {
    function tx(mode, fn) {
      return new Promise(function (resolve, reject) {
        let txn;
        try {
          txn = rawDB.transaction(storeName, mode);
        } catch (err) { reject(err); return; }
        const store = txn.objectStore(storeName);
        let result;
        try { result = fn(store); }
        catch (err) { reject(err); return; }
        txn.oncomplete = function () { resolve(result); };
        txn.onerror = function (e) { reject(e.target.error); };
        txn.onabort = function (e) { reject(e.target.error); };
      });
    }

    return {
      get: function (id) {
        return tx('readonly', function (store) {
          return new Promise(function (resolve, reject) {
            const req = store.get(id);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { reject(req.error); };
          });
        });
      },
      put: function (record) {
        return tx('readwrite', function (store) { store.put(record); })
          .then(function () { return record; });
      },
      delete: function (id) {
        return tx('readwrite', function (store) { store.delete(id); });
      },
      clear: function () {
        return tx('readwrite', function (store) { store.clear(); });
      },
      getAll: function () {
        return tx('readonly', function (store) {
          return new Promise(function (resolve, reject) {
            const out = [];
            const req = store.openCursor(null, 'next');
            req.onsuccess = function (e) {
              const cursor = e.target.result;
              if (cursor) { out.push(cursor.value); cursor.continue(); }
              else resolve(out);
            };
            req.onerror = function () { reject(req.error); };
          });
        });
      },
      index: function (name) {
        return {
          getAll: function (query) {
            return tx('readonly', function (store) {
              return new Promise(function (resolve, reject) {
                const range = (query == null) ? null
                  : (typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.only(query) : query);
                const out = [];
                const req = store.index(name).openCursor(range);
                req.onsuccess = function (e) {
                  const cursor = e.target.result;
                  if (cursor) { out.push(cursor.value); cursor.continue(); }
                  else resolve(out);
                };
                req.onerror = function () { reject(req.error); };
              });
            });
          },
        };
      },
    };
  }

  function idbDBHandle(rawDB) {
    return {
      close: function () { rawDB.close(); },
      storeExists: function (name) {
        return rawDB.objectStoreNames.contains(name);
      },
      createObjectStore: function (cfg) {
        const rawStore = rawDB.createObjectStore(cfg.name, { keyPath: cfg.keyPath || 'id' });
        (cfg.indexes || []).forEach(function (idx) {
          rawStore.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique });
        });
        return idbStoreHandle(rawDB, cfg.name);
      },
      store: function (name) {
        return idbStoreHandle(rawDB, name);
      },
    };
  }

  function createIDBBackend() {
    return {
      open: function (name, version, upgradeCb) {
        return new Promise(function (resolve, reject) {
          let req;
          try {
            req = indexedDB.open(name, version);
          } catch (err) { reject(err); return; }
          req.onupgradeneeded = function (e) {
            try {
              if (upgradeCb) upgradeCb(idbDBHandle(e.target.result), e.oldVersion, e.newVersion);
            } catch (err) { reject(err); }
          };
          req.onsuccess = function () {
            try { resolve(idbDBHandle(req.result)); }
            catch (err) { reject(err); }
          };
          req.onerror = function () { reject(req.error); };
        });
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Record factory
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Build a v2 record envelope with defaults. `parts` may supply any field;
   * missing fields fall back to: kind 'result', empty strings for
   * tool/contract/label, schemaVersion 2, {} payload, null meta, fresh
   * createdAt/updatedAt, and a new v4 uuid id.
   * @param {{id?:string, kind?:string, tool?:string, contract?:string,
   *          label?:string, payload?:Object, meta?:Object, schemaVersion?:number}} parts
   * @returns {Object} record
   */
  function newRecord(parts) {
    const p = parts || {};
    const now = Date.now();
    return {
      id: p.id || uuid(),
      kind: p.kind || 'result',
      tool: p.tool || '',
      contract: p.contract || '',
      label: p.label || '',
      schemaVersion: p.schemaVersion || 2,
      payload: p.payload || {},
      meta: p.meta || null,
      createdAt: now,
      updatedAt: now,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Store handle
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a store handle over one object store.
   *
   * @param {Object} [opts]
   * @param {string} [opts.dbName='labtools-workbench']
   * @param {number} [opts.version=1]
   * @param {string} [opts.storeName='items']
   * @param {Array<{name:string,keyPath:string,unique?:boolean}>} [opts.indexes]
   *        defaults to a single 'timestamp' index (legacy-compatible field)
   * @param {Object<number,function(db):void>} [opts.migrations]
   *        per-version upgrade functions, run once each in ascending order
   *        between oldVersion+1 and newVersion (inside the upgrade callback)
   * @param {function(record):{valid:boolean,errors:string[]}} [opts.validator]
   *        record-level validator enforced on put()
   * @param {Object} [opts.backend]  default: lazily-created browser IDB adapter
   * @param {boolean} [opts.timestamps=true]  when true (default), put() fills
   *        missing createdAt/updatedAt and update()/upsert() refresh
   *        updatedAt; when false, records are stored byte-for-byte as
   *        provided (legacy workbench compatibility)
   */
  function createStore(opts) {
    const o = opts || {};
    const dbName = o.dbName || 'labtools-workbench';
    const version = o.version || 1;
    const storeName = o.storeName || 'items';
    const indexes = o.indexes || [{ name: 'timestamp', keyPath: 'timestamp' }];
    const migrations = o.migrations || {};
    const validator = o.validator || null;
    const timestamps = o.timestamps !== false;
    const backend = o.backend || createIDBBackend();

    const listeners = [];
    let db = null;
    let dbPromise = null;

    function notify(action, record) {
      for (let i = 0; i < listeners.length; i++) {
        try { listeners[i]({ action: action, record: record }); } catch (_) {}
      }
    }

    function open() {
      if (!dbPromise) {
        dbPromise = backend.open(dbName, version, upgradeCb).then(function (opened) {
          db = opened;
          return opened;
        });
      }
      return dbPromise;
    }

    // Runs inside the backend's upgrade callback (browser: onupgradeneeded).
    function upgradeCb(dbHandle, oldVersion, newVersion) {
      if (!dbHandle.storeExists(storeName)) {
        dbHandle.createObjectStore({ name: storeName, keyPath: 'id', indexes: indexes });
      }
      for (let v = oldVersion + 1; v <= newVersion; v++) {
        if (migrations[v]) migrations[v](dbHandle);
      }
    }

    function sortByField(records, field, direction) {
      const dir = direction === 'prev' ? -1 : 1;
      return records.slice().sort(function (a, b) {
        const av = a[field] == null ? 0 : a[field];
        const bv = b[field] == null ? 0 : b[field];
        if (av === bv) return 0;
        return av < bv ? -dir : dir;
      });
    }

    function putInternal(record, runValidator) {
      const rec = record || {};
      if (runValidator && validator) {
        const check = validator(rec);
        if (!check.valid) {
          return Promise.reject(new Error('store put rejected: ' + check.errors.join('; ')));
        }
      }
      let full = rec;
      if (timestamps) {
        const now = Date.now();
        full = Object.assign({}, rec, {
          createdAt: rec.createdAt != null ? rec.createdAt : now,
          updatedAt: rec.updatedAt != null ? rec.updatedAt : now,
        });
      }
      return open().then(function () {
        return db.store(storeName).put(full);
      }).then(function (stored) {
        notify('put', stored);
        return stored;
      });
    }

    /** Store a record (validated when a validator is configured). */
    function put(record) {
      return putInternal(record, true);
    }

    /** Fetch a record by id, or null. */
    function get(id) {
      return open().then(function () {
        return db.store(storeName).get(id);
      });
    }

    /** Shallow-merge `patch` into the record; rejects when the id is missing.
     *  id/createdAt are never overwritten; updatedAt is refreshed (unless
     *  opts.timestamps is false — then the record keeps its fields as-is). */
    function update(id, patch) {
      return open().then(function () {
        return db.store(storeName).get(id);
      }).then(function (existing) {
        if (!existing) throw new Error('store update failed: record not found: ' + id);
        const p = patch || {};
        const merged = Object.assign({}, existing);
        Object.keys(p).forEach(function (k) {
          if (k === 'id' || k === 'createdAt') return;
          merged[k] = p[k];
        });
        if (timestamps) merged.updatedAt = Date.now();
        return db.store(storeName).put(merged);
      }).then(function (stored) {
        notify('update', stored);
        return stored;
      });
    }

    /** Find the first record matching query ({field, value}) via its index and
     *  merge `record` into it (id/createdAt preserved), or create a new record
     *  (id filled with a uuid when absent). */
    function upsert(query, record) {
      const q = query || {};
      return open().then(function () {
        const storeView = db.store(storeName);
        if (q.field && q.value !== undefined) {
          return storeView.index(q.field).getAll(q.value).then(function (matches) {
            return { storeView: storeView, hit: matches.length > 0 ? matches[0] : null };
          });
        }
        return { storeView: storeView, hit: null };
      }).then(function (r) {
        if (r.hit) {
          const merged = Object.assign({}, r.hit);
          const src = record || {};
          Object.keys(src).forEach(function (k) {
            if (k === 'id' || k === 'createdAt') return;
            merged[k] = src[k];
          });
          if (timestamps) merged.updatedAt = Date.now();
          return r.storeView.put(merged).then(function (stored) {
            notify('update', stored);
            return stored;
          });
        }
        const src = record || {};
        const created = Object.assign({}, src, { id: src.id || uuid() });
        if (timestamps) {
          const now = Date.now();
          created.createdAt = src.createdAt != null ? src.createdAt : now;
          created.updatedAt = now;
        }
        return r.storeView.put(created).then(function (stored) {
          notify('put', stored);
          return stored;
        });
      });
    }

    /** Remove a record by id. */
    function remove(id) {
      return open().then(function () {
        return db.store(storeName).delete(id);
      }).then(function () {
        notify('remove', { id: id });
      });
    }

    /** Remove every record. */
    function clear() {
      return open().then(function () {
        return db.store(storeName).clear();
      }).then(function () {
        notify('clear', null);
      });
    }

    /**
     * List records. Defaults to the 'timestamp' index descending (newest
     * first). With opts.index set, records are read via that index and sorted
     * by the field (records missing the field sort as 0). With opts.index
     * null, primary-key order is used.
     * @param {{index?:string|null, direction?:'next'|'prev'}} [opts]
     */
    function getAll(opts) {
      const o = opts || {};
      const indexName = o.index === undefined ? 'timestamp' : o.index;
      const direction = o.direction || 'prev';
      return open().then(function () {
        const storeView = db.store(storeName);
        if (indexName == null) {
          return storeView.getAll().then(function (records) {
            return direction === 'prev' ? records.slice().reverse() : records;
          });
        }
        return storeView.index(indexName).getAll(null).then(function (records) {
          return sortByField(records, indexName, direction);
        });
      });
    }

    /** Records whose indexed field exactly equals `value`. */
    function getByIndex(indexName, value) {
      return open().then(function () {
        return db.store(storeName).index(indexName).getAll(value);
      });
    }

    /** Full-scan exact filter over the record envelope fields. */
    function query(q) {
      const qq = q || {};
      return getAll({ index: null, direction: 'next' }).then(function (records) {
        return records.filter(function (r) {
          if (qq.kind !== undefined && r.kind !== qq.kind) return false;
          if (qq.tool !== undefined && r.tool !== qq.tool) return false;
          if (qq.contract !== undefined && r.contract !== qq.contract) return false;
          if (qq.label !== undefined && r.label !== qq.label) return false;
          return true;
        });
      });
    }

    /** Export envelope: { version: 1, exportedAt: ISO, records: [...] }. */
    function exportJSON() {
      return getAll({ index: null, direction: 'next' }).then(function (records) {
        return { version: 1, exportedAt: new Date().toISOString(), records: records };
      });
    }

    /**
     * Import an export envelope (object or JSON string). Records whose id
     * already exists are skipped. Each imported record goes through the put
     * path (timestamps preserved, validator bypassed).
     * @returns {Promise<{imported:number, skipped:number}>}
     */
    function importJSON(json) {
      return Promise.resolve().then(function () {
        let data = json;
        if (typeof json === 'string') {
          try { data = JSON.parse(json); }
          catch (_) { throw new Error('Invalid JSON'); }
        }
        if (!data || typeof data !== 'object' || !Array.isArray(data.records)) {
          throw new Error('Invalid store export format');
        }
        return data;
      }).then(function (data) {
        return getAll({ index: null, direction: 'next' }).then(function (existing) {
          const existingIds = {};
          existing.forEach(function (r) { existingIds[r.id] = true; });
          const toImport = data.records.filter(function (r) { return r && !existingIds[r.id]; });
          const skipped = data.records.length - toImport.length;
          return toImport.reduce(function (chain, rec) {
            return chain.then(function () { return putInternal(rec, false); });
          }, Promise.resolve()).then(function () {
            return { imported: toImport.length, skipped: skipped };
          });
        });
      });
    }

    /** Subscribe to local change events ({action, record}). Returns an
     *  unsubscribe function. Cross-tab sync is out of scope here. */
    function onChange(cb) {
      listeners.push(cb);
      return function () {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    /** Close the underlying database; the next operation reopens it. */
    function close() {
      return open().then(function () {
        if (db) db.close();
        db = null;
        dbPromise = null;
      });
    }

    return {
      put: put,
      get: get,
      update: update,
      upsert: upsert,
      remove: remove,
      clear: clear,
      getAll: getAll,
      getByIndex: getByIndex,
      query: query,
      exportJSON: exportJSON,
      importJSON: importJSON,
      onChange: onChange,
      close: close,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Exports
  // ─────────────────────────────────────────────────────────────────────────────

  lt.store = { createStore, createMemoryBackend, newRecord };
})(typeof window !== 'undefined' ? window : globalThis);
