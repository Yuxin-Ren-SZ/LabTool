'use strict';

/**
 * LabTools — Workflow layer v2
 * ============================
 * Pure-logic shared layer for chaining tools into workflows. No DOM, no
 * IndexedDB — storage and navigation live in other layers; this module owns
 * three pieces:
 *
 *   • Chain graph     — tools declare `next: [{tool, label}]`; shortest-path
 *                       routing answers "how do I get from A to C".
 *   • Sessions        — a plain-data record `{ id, tool, label, createdAt,
 *                       updatedAt, steps: [...] }` that a workflow run appends
 *                       to as it hops tools (the future `kind:'session'`
 *                       workbench record).
 *   • Handoff + wiring — hand an upstream tool's outputs to a downstream
 *                       tool's input ports via the artifact envelope and
 *                       field-id wiring (labtoolsMatchWiring semantics).
 *
 * Depends lazily on assets/js/labtools-artifact.js (labtoolsBuildArtifact,
 * labtoolsMatchWiring) — only when a handoff/wiring call is actually made,
 * never at load time. Exposes window.labtools.workflow.
 */

(function (root) {
  const lt = root.labtools = root.labtools || {};
  (root.__labtoolsLoadOrder = root.__labtoolsLoadOrder || []).push('labtools-workflow');

  // ─────────────────────────────────────────────────────────────────────────
  // Guarded access to the artifact module (assets/js/labtools-artifact.js).
  // labtools-artifact.js attaches its API to the same root object this module
  // was handed (window in browsers), so the check is against that surface.
  // This module must load without artifact.js present — only the calls below
  // check.
  // ─────────────────────────────────────────────────────────────────────────

  function hasArtifactApi(name) {
    return typeof root[name] === 'function';
  }

  function requireArtifactApi(name) {
    if (!hasArtifactApi(name)) {
      throw new Error('labtools-workflow: labtools-artifact.js required (' + name + ' missing)');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Chain graph — tools declare their "next" steps; routing is BFS shortest
  // path over the declared edges.
  // ─────────────────────────────────────────────────────────────────────────

  /** @type {Object<string, Array<{tool:string, label:string}>>} */
  const chains = {};

  function cloneChainEntry(item) {
    return { tool: item.tool, label: item.label == null ? '' : String(item.label) };
  }

  function cloneChainList(list) {
    return list.map(cloneChainEntry);
  }

  /**
   * Register (or overwrite) the next-step list for a tool id.
   * @param {string} toolId
   * @param {Array<{tool:string, label?:string}>} next
   */
  function defineChain(toolId, next) {
    if (typeof toolId !== 'string' || !toolId) {
      throw new TypeError('labtools-workflow: defineChain(toolId, next): toolId must be a non-empty string');
    }
    if (!Array.isArray(next)) {
      throw new TypeError('labtools-workflow: defineChain(toolId, next): next must be an array of { tool, label }');
    }
    next.forEach(function (item) {
      if (!item || typeof item !== 'object' || typeof item.tool !== 'string' || !item.tool) {
        throw new TypeError('labtools-workflow: defineChain(toolId, next): every next item must have a non-empty string `tool`');
      }
    });
    chains[toolId] = cloneChainList(next);
  }

  /** @param {string} toolId @returns {Array<{tool:string, label:string}>} */
  function nextFor(toolId) {
    return chains[toolId] ? cloneChainList(chains[toolId]) : [];
  }

  /** Shallow snapshot: a fresh map of fresh lists (mutating it cannot touch internals). */
  function allChains() {
    const out = {};
    Object.keys(chains).forEach(function (k) { out[k] = cloneChainList(chains[k]); });
    return out;
  }

  /**
   * BFS shortest path from `from` to `to`, endpoints included.
   * @param {string} from
   * @param {string} to
   * @returns {Array<string>|null} [from, ..., to], or null when unreachable
   */
  function path(from, to) {
    if (from === to) return [from];
    const queue = [from];
    const seen = new Set([from]);
    const prev = {};
    while (queue.length) {
      const cur = queue.shift();
      const nexts = chains[cur] || [];
      for (let i = 0; i < nexts.length; i++) {
        const n = nexts[i].tool;
        if (seen.has(n)) continue;
        seen.add(n);
        prev[n] = cur;
        if (n === to) {
          const route = [to];
          let p = to;
          while (p !== from) { p = prev[p]; route.unshift(p); }
          return route;
        }
        queue.push(n);
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sessions — plain-data construction/mutation (no storage here).
  // ─────────────────────────────────────────────────────────────────────────

  /** UUID v4 (Math.random-based — no crypto dependency in shipped runtime). */
  function uuidV4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /**
   * Create a session record.
   * @param {{id?:string, tool?:string, label?:string}} [parts]
   * @returns {{id:string, tool:string, label:string, createdAt:number, updatedAt:number, steps:Array}}
   */
  function newSession(parts) {
    const p = parts || {};
    const now = Date.now();
    return {
      id: typeof p.id === 'string' && p.id ? p.id : uuidV4(),
      tool: typeof p.tool === 'string' ? p.tool : '',
      label: typeof p.label === 'string' ? p.label : '',
      createdAt: now,
      updatedAt: now,
      steps: [],
    };
  }

  /**
   * Append one hop to a session IN PLACE and return the same session object.
   * @param {Object} session  a session from newSession (steps array is ensured)
   * @param {{tool:string, contract?:string, recordId:string, resolvedInputs?:Object, missing?:Array, at?:number}} step
   * @returns {Object} the same session (mutated)
   */
  function appendStep(session, step) {
    if (!session || typeof session !== 'object' || Array.isArray(session)) {
      throw new TypeError('labtools-workflow: appendStep(session, step): session must be an object');
    }
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new TypeError('labtools-workflow: appendStep(session, step): step must be an object');
    }
    if (typeof step.tool !== 'string' || !step.tool) {
      throw new TypeError('labtools-workflow: appendStep: step.tool must be a non-empty string');
    }
    if (typeof step.recordId !== 'string' || !step.recordId) {
      throw new TypeError('labtools-workflow: appendStep: step.recordId must be a non-empty string');
    }
    if (!Array.isArray(session.steps)) session.steps = [];
    session.steps.push({
      tool: step.tool,
      contract: typeof step.contract === 'string' ? step.contract : '',
      recordId: step.recordId,
      resolvedInputs: step.resolvedInputs || {},
      missing: step.missing || [],
      at: step.at == null ? Date.now() : step.at,
    });
    session.updatedAt = Date.now();
    return session;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Handoff envelope + wiring (reuses the artifact layer; guarded).
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Wrap a producer's outputs into an artifact envelope tagged with a label,
   * ready for field-port wiring downstream.
   * @param {string} producerId
   * @param {Object<string,*>} outputs
   * @param {string} [label]
   * @returns {Object} artifact envelope + meta.label
   */
  function buildHandoffEnvelope(producerId, outputs, label) {
    requireArtifactApi('labtoolsBuildArtifact');
    const env = labtoolsBuildArtifact({ tool: producerId, outputs: outputs || {} });
    env.meta = { label: label == null ? '' : String(label) };
    return env;
  }

  /**
   * Wire an envelope's outputs against a consumer's input ports. Exactly the
   * labtoolsMatchWiring semantics: matched -> resolved, required-unmatched ->
   * missing, upstream extras -> ignored. Optional unmatched ports are absent.
   * @param {Object} envelope  from buildHandoffEnvelope (or any artifact)
   * @param {Array<{field:string, required?:boolean}>} inputPorts
   * @returns {{resolved:Object<string,*>, missing:string[], ignored:string[]}}
   */
  function applyHandoff(envelope, inputPorts) {
    requireArtifactApi('labtoolsMatchWiring');
    const outputs = (envelope && envelope.outputs) || {};
    return labtoolsMatchWiring(outputs, inputPorts);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Exports
  // ─────────────────────────────────────────────────────────────────────────

  lt.workflow = {
    defineChain: defineChain,
    nextFor: nextFor,
    allChains: allChains,
    path: path,
    newSession: newSession,
    appendStep: appendStep,
    buildHandoffEnvelope: buildHandoffEnvelope,
    applyHandoff: applyHandoff,
  };
})(typeof window !== 'undefined' ? window : globalThis);
