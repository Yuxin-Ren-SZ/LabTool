'use strict';

/**
 * LabTools — Contracts (shared layer v2)
 * ======================================
 * The v2 contract registry replaces DATA_TYPES as the single source of truth
 * for workbench payload shapes. A CONTRACT is:
 *
 *   {
 *     id: 'plate-layout',            // stable id (legacy types keep their key)
 *     name: 'Microplate Layout',     // display name (defaults to id)
 *     icon: '📋', color: '#5c8dff', description: '...',
 *     version: 1,                    // contract version, default 1
 *     fields: { fieldId: schema },   // flat output-field schema map
 *   }
 *
 * A payload is a FLAT `{ fieldId: value }` map (same shape as artifact
 * outputs); each field value may itself be a nested structure. `fields`
 * declared with `required: true` are enforced only in strict mode
 * (opts.partial === false).
 *
 * Schema v2 extends the labtools-types.js mini-language with:
 *   string  : enum, pattern (RegExp or string)
 *   number  : min, max, enum            integer: min, max, enum
 *   array   : items (schema), minItems
 *   map     : keyPattern (RegExp or string), values (schema)
 *   object  : props { key: { type, required?, nullable?, ... } }
 *   any     : any value
 *   anyOf/oneOf on any schema (anyOf: ≥1 branch passes; oneOf: exactly 1)
 *   validate(value, ctx) custom hook on any schema — return true or an
 *     error string (ctx = { path }); runs first, short-circuits on failure.
 *
 * Legacy mapping: syncLegacy() translates every DATA_TYPES[type].schema into
 * a v2 schema and registers a contract with `fields = { [type]: schema }`, so
 * a legacy payload rides as a single field under its type id. Type/props
 * (required, nullable)/items/enum/map (keyPattern, values) map 1:1; 'any'
 * stays 'any'. Existing contracts with the same id are NOT overwritten.
 *
 * Pure logic — no DOM, no storage. Loads as a global-script namespace module
 * and registers itself in __labtoolsLoadOrder for the runtime self-check.
 *
 * Exposes (window.labtools.contracts):
 *   SCHEMA_VERSION      — 1
 *   define(def)         -> def (normalized, in place)  register/overwrite
 *   get(id)             -> def | null
 *   has(id)             -> boolean
 *   list()              -> [{id, name, icon, color, version, fieldCount}]
 *   validate(id, payload, opts) -> { valid, errors }  (errors: path strings)
 *   checkValue(value, schema, errors, path) -> void    (public, composable)
 *   fromLegacy(type)    -> contractId | null           (default: same id)
 *   syncLegacy()        -> { mapped, missing }
 */

(function (root) {
  const lt = root.labtools = root.labtools || {};
  (root.__labtoolsLoadOrder = root.__labtoolsLoadOrder || []).push('labtools-contracts');

  const SCHEMA_VERSION = 1;

  /** Contract registry: id -> normalized definition. */
  const registry = {};

  // ───────────────────────────────────────────────────────────────────────────
  // Small helpers
  // ───────────────────────────────────────────────────────────────────────────

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  // Cross-realm-safe RegExp test (schemas may come from another VM realm).
  function isRegExp(v) {
    return Object.prototype.toString.call(v) === '[object RegExp]';
  }

  /**
   * Normalize a pattern to a RegExp. Accepts an existing RegExp (returned
   * as-is) or a string compiled with `new RegExp`. Throws on invalid strings.
   * @param {RegExp|string} pattern
   * @returns {RegExp}
   */
  function toRegExp(pattern) {
    return isRegExp(pattern) ? pattern : new RegExp(pattern);
  }

  function describeType(schema) {
    return schema && typeof schema.type === 'string' ? schema.type : 'value';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Schema v2 checker
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Check one value against a v2 schema, appending human-readable errors to
   * the caller's array. Path format matches labtools-types.js ("data.foo",
   * "data.list[0].bar", 'data.map["key"]'). At most one error is pushed per
   * value, except nested structures which recurse (same as the v1 checker).
   *
   * @param {*} value
   * @param {Object} schema
   * @param {string[]} errors  array to append to (mutated in place)
   * @param {string} path      dotted path prefix, e.g. "data" or "data.wells"
   */
  function checkValue(value, schema, errors, path) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      errors.push(path + ': invalid schema');
      return;
    }

    // null / undefined — honored whenever the schema is nullable (v1 compat:
    // nullable also lives directly on schemas, not only on object props).
    if (value === null || value === undefined) {
      if (schema.nullable) return;
      errors.push(path + ': expected ' + describeType(schema) +
        ', got ' + (value === null ? 'null' : 'undefined'));
      return;
    }

    // Custom validate hook — runs first and short-circuits on failure.
    if (typeof schema.validate === 'function') {
      let verdict;
      try {
        verdict = schema.validate(value, { path: path });
      } catch (e) {
        errors.push(path + ': validate hook threw: ' + (e && e.message ? e.message : e));
        return;
      }
      if (verdict !== true) {
        errors.push(path + ': ' + (typeof verdict === 'string' ? verdict : 'validate hook rejected value'));
        return;
      }
    }

    // Unions take precedence over a plain `type` when present.
    if (Array.isArray(schema.anyOf)) {
      for (let i = 0; i < schema.anyOf.length; i++) {
        const subErrors = [];
        checkValue(value, schema.anyOf[i], subErrors, path);
        if (subErrors.length === 0) return; // any branch passes
      }
      errors.push(path + ': value does not match any of [' +
        schema.anyOf.map(describeType).join(', ') + ']');
      return;
    }

    if (Array.isArray(schema.oneOf)) {
      let matched = 0;
      for (let i = 0; i < schema.oneOf.length; i++) {
        const subErrors = [];
        checkValue(value, schema.oneOf[i], subErrors, path);
        if (subErrors.length === 0) matched++;
      }
      if (matched !== 1) {
        errors.push(path + ': value must match exactly one of [' +
          schema.oneOf.map(describeType).join(', ') + '], matched ' + matched);
      }
      return;
    }

    switch (schema.type) {
      case 'any':
        return;

      case 'string':
        if (typeof value !== 'string') {
          errors.push(path + ': expected string, got ' + typeof value);
          return;
        }
        if (Array.isArray(schema.enum) && schema.enum.indexOf(value) === -1) {
          errors.push(path + ': value "' + value + '" not in [' + schema.enum.join(', ') + ']');
          return;
        }
        if (schema.pattern !== undefined) {
          try {
            const re = toRegExp(schema.pattern);
            re.lastIndex = 0;
            if (!re.test(value)) {
              errors.push(path + ': value "' + value + '" does not match ' + re);
            }
          } catch (e) {
            errors.push(path + ': invalid pattern ' + schema.pattern);
          }
        }
        return;

      case 'number':
      case 'integer': {
        const isNumber = typeof value === 'number' && !Number.isNaN(value);
        if (schema.type === 'integer') {
          if (!isNumber || !Number.isInteger(value)) {
            errors.push(path + ': expected integer, got ' + (isNumber ? value : typeof value));
            return;
          }
        } else if (!isNumber) {
          errors.push(path + ': expected number, got ' + typeof value);
          return;
        }
        if (Array.isArray(schema.enum) && schema.enum.indexOf(value) === -1) {
          errors.push(path + ': value ' + value + ' not in [' + schema.enum.join(', ') + ']');
          return;
        }
        if (schema.min !== undefined && value < schema.min) {
          errors.push(path + ': value ' + value + ' < min ' + schema.min);
        } else if (schema.max !== undefined && value > schema.max) {
          errors.push(path + ': value ' + value + ' > max ' + schema.max);
        }
        return;
      }

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(path + ': expected boolean, got ' + typeof value);
        }
        return;

      case 'object': {
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(path + ': expected object, got ' +
            (Array.isArray(value) ? 'array' : typeof value));
          return;
        }
        const props = schema.props || {};
        for (const key of Object.keys(props)) {
          const sub = props[key];
          const present = Object.prototype.hasOwnProperty.call(value, key);
          const v = value[key];
          if (!present || v === null || v === undefined) {
            // required wins over nullable, matching the v1 checker semantics
            if (sub && sub.required) {
              errors.push(path + '.' + key + ': required');
            } else if (v === null && !(sub && sub.nullable)) {
              errors.push(path + '.' + key + ': expected ' + describeType(sub) + ', got null');
            }
            continue;
          }
          checkValue(v, sub, errors, path + '.' + key);
        }
        return;
      }

      case 'array': {
        if (!Array.isArray(value)) {
          errors.push(path + ': expected array, got ' + typeof value);
          return;
        }
        if (schema.minItems !== undefined && value.length < schema.minItems) {
          errors.push(path + ': expected at least ' + schema.minItems + ' items, got ' + value.length);
          return;
        }
        if (schema.items) {
          for (let i = 0; i < value.length; i++) {
            checkValue(value[i], schema.items, errors, path + '[' + i + ']');
          }
        }
        return;
      }

      case 'map': {
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(path + ': expected map/object, got ' +
            (Array.isArray(value) ? 'array' : typeof value));
          return;
        }
        for (const key of Object.keys(value)) {
          const kp = path + '["' + key + '"]';
          if (schema.keyPattern !== undefined) {
            try {
              const re = toRegExp(schema.keyPattern);
              re.lastIndex = 0;
              if (!re.test(key)) {
                // v1 semantics: report the bad key AND still check the value
                errors.push(kp + ': key "' + key + '" does not match ' + re);
              }
            } catch (e) {
              errors.push(kp + ': invalid keyPattern ' + schema.keyPattern);
            }
          }
          checkValue(value[key], schema.values, errors, kp);
        }
        return;
      }

      default:
        errors.push(path + ': unknown schema type "' + schema.type + '"');
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Registry API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Register (or overwrite) a contract. Normalizes defaults in place and
   * returns the same object, so `define(def) === def`.
   *
   * @param {Object} def
   * @param {string} def.id
   * @param {string} [def.name]          defaults to id
   * @param {string} [def.icon]
   * @param {string} [def.color]
   * @param {string} [def.description]
   * @param {number} [def.version]       defaults to 1
   * @param {Object<string,Object>} [def.fields]  fieldId -> schema v2
   * @returns {Object} the registered (normalized) definition
   */
  function define(def) {
    if (!def || typeof def !== 'object' || Array.isArray(def)) {
      throw new TypeError('labtools.contracts.define: expected a contract definition object');
    }
    if (typeof def.id !== 'string' || def.id === '') {
      throw new TypeError('labtools.contracts.define: contract requires a non-empty string id');
    }
    if (def.version === undefined) def.version = 1;
    if (def.name === undefined) def.name = def.id;
    if (def.icon === undefined) def.icon = '';
    if (def.color === undefined) def.color = '';
    if (def.description === undefined) def.description = '';
    if (def.fields === undefined || def.fields === null) def.fields = {};
    registry[def.id] = def;
    return def;
  }

  /** @param {string} id @returns {Object|null} registered definition or null */
  function get(id) {
    return Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : null;
  }

  /** @param {string} id @returns {boolean} */
  function has(id) {
    return Object.prototype.hasOwnProperty.call(registry, id);
  }

  /**
   * Catalog entries for UI/derivation — never the raw definitions.
   * @returns {Array<{id:string,name:string,icon:string,color:string,version:number,fieldCount:number}>}
   */
  function list() {
    return Object.keys(registry).map(function (id) {
      const d = registry[id];
      return {
        id: id,
        name: d.name,
        icon: d.icon,
        color: d.color,
        version: d.version,
        fieldCount: Object.keys(d.fields || {}).length,
      };
    });
  }

  /**
   * Validate a flat `{ fieldId: value }` payload against a contract.
   *
   * @param {string} id
   * @param {Object<string,*>} payload
   * @param {Object} [opts]
   * @param {boolean} [opts.partial=true]
   *   partial: only fields present in the payload are checked and unknown
   *   fields are ignored. partial=false additionally requires every declared
   *   `required` field to be present and rejects unknown fields.
   * @param {number} [opts.version]
   *   if given and greater than the contract's version, validation fails
   *   (incompatible-version guard).
   * @returns {{valid:boolean, errors:string[]}}
   */
  function validate(id, payload, opts) {
    const errors = [];
    const def = get(id);
    if (!def) {
      errors.push('contract "' + id + '" is not defined');
      return { valid: false, errors: errors };
    }
    const o = opts || {};
    const partial = o.partial !== false;

    if (o.version !== undefined && o.version !== null && o.version > def.version) {
      errors.push('data: contract "' + id + '" version ' + def.version +
        ' < requested version ' + o.version);
    }
    if (!isPlainObject(payload)) {
      errors.push('data: expected object payload, got ' +
        (payload === null ? 'null' : Array.isArray(payload) ? 'array' : typeof payload));
      return { valid: errors.length === 0, errors: errors };
    }

    const fields = def.fields || {};
    for (const fieldId of Object.keys(fields)) {
      if (!Object.prototype.hasOwnProperty.call(payload, fieldId)) {
        if (!partial && fields[fieldId] && fields[fieldId].required) {
          errors.push('data.' + fieldId + ': required');
        }
        continue;
      }
      checkValue(payload[fieldId], fields[fieldId], errors, 'data.' + fieldId);
    }
    if (!partial) {
      for (const key of Object.keys(payload)) {
        if (!Object.prototype.hasOwnProperty.call(fields, key)) {
          errors.push('data.' + key + ': unknown field (not declared in contract "' + id + '")');
        }
      }
    }
    return { valid: errors.length === 0, errors: errors };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Legacy (DATA_TYPES) mapping
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Translate a v1 schema (labtools-types.js mini-language) into a v2 schema.
   * type/props(required, nullable)/items/enum/map(keyPattern, values) map
   * 1:1; 'any' stays 'any'; unmentioned legacy features are not translated.
   * @param {Object} schema
   * @returns {Object} v2 schema (new object; nested schemas are deep-copied)
   */
  function translateSchema(schema) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return { type: 'any' };
    }
    const out = {};
    if (schema.type !== undefined) out.type = schema.type;
    if (schema.enum !== undefined) out.enum = schema.enum;
    if (schema.nullable !== undefined) out.nullable = schema.nullable;
    if (schema.required !== undefined) out.required = schema.required;
    if (schema.pattern !== undefined) out.pattern = schema.pattern;
    if (schema.min !== undefined) out.min = schema.min;
    if (schema.max !== undefined) out.max = schema.max;
    if (schema.minItems !== undefined) out.minItems = schema.minItems;
    if (schema.keyPattern !== undefined) out.keyPattern = schema.keyPattern;
    if (schema.props !== undefined) {
      out.props = {};
      for (const key of Object.keys(schema.props)) {
        out.props[key] = translateSchema(schema.props[key]);
      }
    }
    if (schema.items !== undefined) out.items = translateSchema(schema.items);
    if (schema.values !== undefined) out.values = translateSchema(schema.values);
    if (Array.isArray(schema.anyOf)) out.anyOf = schema.anyOf.map(translateSchema);
    if (Array.isArray(schema.oneOf)) out.oneOf = schema.oneOf.map(translateSchema);
    if (schema.validate !== undefined) out.validate = schema.validate;
    return out;
  }

  /**
   * Map a legacy DATA_TYPES key to a v2 contract id. Default mapping is the
   * identity (same id). Returns null when window.DATA_TYPES is absent or the
   * type is not registered there.
   * @param {string} legacyType
   * @returns {string|null}
   */
  function fromLegacy(legacyType) {
    if (!root.DATA_TYPES || typeof root.DATA_TYPES !== 'object') return null;
    const def = root.DATA_TYPES[legacyType];
    if (!def || !def.schema) return null;
    return legacyType; // default mapping: same id
  }

  /**
   * Generate/complete a v2 contract for every key in window.DATA_TYPES.
   * Each contract gets `fields = { [type]: translateSchema(DATA_TYPES[type].schema) }`
   * and inherits name/icon/color/description. Existing contracts with the
   * same id are never overwritten (gaps only). Safe no-op returning
   * { mapped: 0, missing: [] } when window.DATA_TYPES is absent.
   *
   * @returns {{mapped:number, missing:string[]}}
   *   mapped  — how many NEW contracts were registered on this call
   *   missing — DATA_TYPES keys that could not be mapped (no schema)
   */
  function syncLegacy() {
    if (!root.DATA_TYPES || typeof root.DATA_TYPES !== 'object') {
      return { mapped: 0, missing: [] };
    }
    const missing = [];
    let mapped = 0;
    for (const type of Object.keys(root.DATA_TYPES)) {
      const legacy = root.DATA_TYPES[type];
      if (!legacy || !legacy.schema) {
        missing.push(type);
        continue;
      }
      if (has(type)) continue; // 只补缺 — never overwrite an existing contract
      define({
        id: type,
        name: legacy.name,
        icon: legacy.icon,
        color: legacy.color,
        description: legacy.description,
        fields: { [type]: translateSchema(legacy.schema) },
      });
      mapped++;
    }
    return { mapped: mapped, missing: missing };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Exports
  // ───────────────────────────────────────────────────────────────────────────

  lt.contracts = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    define: define,
    get: get,
    has: has,
    list: list,
    validate: validate,
    checkValue: checkValue,
    fromLegacy: fromLegacy,
    syncLegacy: syncLegacy,
  };
})(typeof window !== 'undefined' ? window : globalThis);
