'use strict';

/**
 * LabTools — Shared counting Step-1 module (v2)
 * ==============================================
 * Shared UI + calculation layer for the hemocytometer "count cells" step,
 * extracted from tools/cell-count/index.html (authoritative source) and
 * tools/seeding-calc/index.html (former ⟳ SYNC copy). Owns:
 *
 *   • the 4-option counting-mode selector (buildModeSelector/selectMode)
 *   • the count-all toggle (onCountAllToggle)
 *   • the pure Step-1 calculation core (core)
 *   • the shared result-DOM rendering (renderResults / renderNegativeError)
 *
 * Depends on labtools-calc.js (MODES, makeDiagram, avgTwo, calcCellDensity,
 * calcTotalCells, calcViabilityPct, fmt). DOM id contract (must exist on any
 * page that uses this module — cell-count and seeding-calc share it):
 *
 *   mode-selector, mode-desc, live-hint, count-all-toggle, dead-block,
 *   live1, live2, dead1, dead2, df, vol,
 *   res-avg, res-avg-note, res-density, res-density-note,
 *   res-total, res-total-note, res-total-label,
 *   res-via, res-via-note, via-note
 *
 * Page-specific side effects (seeding-calc's step1FinalDensity/btn-next,
 * cell-count's lastResult) stay in the pages; the module renders the shared
 * result elements and returns the raw computed numbers for pages to use.
 *
 * Exposes window.labtools.counting.
 */

(function (root) {
  const lt = root.labtools = root.labtools || {};
  (root.__labtoolsLoadOrder = root.__labtoolsLoadOrder || []).push('labtools-counting');

  /** Currently selected counting mode ID (1–4, matching MODES[].id). */
  let currentModeId = 1;

  /**
   * Pure Step-1 core: average counts, guard negatives, and compute density,
   * total cells, and viability with the exact same semantics as
   * cell-count's calculate(). NaN is preserved (pages normalize to null
   * where their contracts require it).
   *
   * @param {{modeId:number, isAll:boolean, live1:number, live2:number,
   *          dead1:number, dead2:number, df:number, vol:number}} counts
   * @returns {{error:string|null, modeId:number, isAll:boolean,
   *            avgLive:number, avgDead:number, liveN:number, deadN:number,
   *            density:number, totalCells:number, viability:number}}
   */
  function core(counts) {
    const c = counts || {};
    const mode = MODES.find(m => m.id === (c.modeId || 1)) || MODES[0];
    const isAll = !!c.isAll;

    const liveAvg = avgTwo(c.live1, c.live2);
    const deadAvg = avgTwo(c.dead1, c.dead2);
    const avgLive = liveAvg.val;
    const avgDead = deadAvg.val;

    if ((!isNaN(c.live1) && c.live1 < 0) || (!isNaN(c.live2) && c.live2 < 0) ||
        (!isNaN(c.dead1) && c.dead1 < 0) || (!isNaN(c.dead2) && c.dead2 < 0)) {
      return {
        error: 'negative', modeId: mode.id, isAll: isAll,
        avgLive: avgLive, avgDead: avgDead, liveN: liveAvg.n, deadN: deadAvg.n,
        density: NaN, totalCells: NaN, viability: NaN,
      };
    }

    const finalDensity = calcCellDensity(avgLive, mode.multiplier, c.df);
    const totalCells = calcTotalCells(finalDensity, c.vol);
    const hasDeadAny = !isAll && deadAvg.n > 0;
    const viability = hasDeadAny ? calcViabilityPct(avgLive, avgDead) : NaN;

    return {
      error: null, modeId: mode.id, isAll: isAll,
      avgLive: avgLive, avgDead: avgDead, liveN: liveAvg.n, deadN: deadAvg.n,
      density: finalDensity, totalCells: totalCells, viability: viability,
    };
  }

  /** Read the counting inputs from the shared DOM ids into a core() argument. */
  function readCounts() {
    const el = id => document.getElementById(id);
    return {
      modeId: currentModeId,
      isAll: el('count-all-toggle').checked,
      live1: parseFloat(el('live1').value),
      live2: parseFloat(el('live2').value),
      dead1: parseFloat(el('dead1').value),
      dead2: parseFloat(el('dead2').value),
      df: parseFloat(el('df').value),
      vol: parseFloat(el('vol').value),
    };
  }

  /**
   * Render the 4-option mode selector grid from the MODES array.
   * Called once on init; selectMode() handles subsequent updates.
   */
  function buildModeSelector() {
    const container = document.getElementById('mode-selector');
    container.innerHTML = '';
    MODES.forEach(m => {
      const div = document.createElement('div');
      div.className = 'mode-option' + (m.id === currentModeId ? ' active' : '');
      const tagHtml = m.tag.replace('\n', '<br>');
      div.innerHTML = `${makeDiagram(m.largeHL, m.smallHL)}<span class="mode-tag">${tagHtml}</span>`;
      div.onclick = () => selectMode(m.id, null);
      container.appendChild(div);
    });
  }

  /**
   * Activate a counting mode by ID: mark the option active, update the
   * description strip, then notify the page (onChanged) so it recomputes.
   * @param {number} id  Mode ID from MODES[].id (1–4)
   * @param {function} [onChanged]  page recompute callback (calculate/calcStep1)
   */
  function selectMode(id, onChanged) {
    currentModeId = id;
    document.querySelectorAll('.mode-option').forEach((el, i) => {
      el.classList.toggle('active', MODES[i].id === id);
    });
    const m = MODES.find(x => x.id === id);
    document.getElementById('mode-desc').innerHTML =
      `<span class="formula-inline">${m.formulaNote}</span>${m.desc}`;
    document.getElementById('live-hint').textContent = m.hint;
    if (onChanged) onChanged();
  }

  /**
   * Handle the "Count all cells" checkbox: disable/clear the dead-cell
   * block, then notify the page. Identical to cell-count's onCountAllToggle.
   * @param {function} [onChanged]  page recompute callback
   */
  function onCountAllToggle(onChanged) {
    const isAll = document.getElementById('count-all-toggle').checked;
    const deadBlock = document.getElementById('dead-block');
    deadBlock.classList.toggle('disabled', isAll);
    if (isAll) {
      document.getElementById('dead1').value = '';
      document.getElementById('dead2').value = '';
    }
    if (onChanged) onChanged();
  }

  /** Render the shared negative-count error display. */
  function renderNegativeError() {
    document.getElementById('res-avg').textContent = '—';
    document.getElementById('res-density').textContent = '—';
    document.getElementById('res-total').textContent = '—';
    document.getElementById('via-note').textContent = '⚠ Counts cannot be negative.';
    document.getElementById('via-note').className = 'via-note';
  }

  /**
   * Write the shared result elements from a core() result. Renders exactly
   * what cell-count's calculate() renders (authoritative); page-specific
   * side effects stay in the page.
   * @param {Object} r  a core() result (with a `vol` passthrough for notes)
   */
  function renderResults(r, vol) {
    // ── Avg count display ──
    if (!isNaN(r.avgLive)) {
      document.getElementById('res-avg').textContent = r.avgLive.toFixed(1);
      document.getElementById('res-avg-note').textContent =
        r.liveN === 2 ? 'avg of 2 counts' : 'single count';
    } else {
      document.getElementById('res-avg').textContent = '—';
      document.getElementById('res-avg-note').textContent = 'from counts';
    }

    // ── Viability display — four mutually exclusive branches ──
    if (r.isAll) {
      document.getElementById('res-via').textContent = 'N/A';
      document.getElementById('res-via-note').textContent = 'count-all mode';
      document.getElementById('via-note').textContent =
        'Dead cell counting disabled — all cells counted as live.';
      document.getElementById('via-note').className = 'via-note';
    } else if (!isNaN(r.viability)) {
      document.getElementById('res-via').textContent = r.viability.toFixed(1) + '%';
      document.getElementById('res-via-note').textContent =
        r.deadN === 2 ? 'avg of 2 dead counts' : 'from dead count';
      document.getElementById('via-note').textContent = `✓ Viability: ${r.viability.toFixed(1)}%`;
      document.getElementById('via-note').className = 'via-note computed';
    } else if (r.deadN > 0) {
      document.getElementById('res-via').textContent = '—';
      document.getElementById('res-via-note').textContent = 'waiting for live count';
      document.getElementById('via-note').textContent = 'Waiting for live count to compute viability.';
      document.getElementById('via-note').className = 'via-note';
    } else {
      document.getElementById('res-via').textContent = '—';
      document.getElementById('res-via-note').textContent = 'enter dead counts above';
      document.getElementById('via-note').textContent =
        'Enter dead counts above to auto-calculate viability.';
      document.getElementById('via-note').className = 'via-note';
    }

    // ── Total label ──
    document.getElementById('res-total-label').textContent =
      r.isAll ? 'Total Cells' : 'Total Live Cells';

    // ── Final Concentration ──
    document.getElementById('res-density').textContent = fmt(r.density);
    document.getElementById('res-density-note').textContent = 'cells/mL';

    // ── Total cells in tube ──
    document.getElementById('res-total').textContent = fmt(r.totalCells);
    document.getElementById('res-total-note').textContent =
      !isNaN(r.density) && !isNaN(vol) && vol > 0
        ? 'conc. × ' + vol + ' mL'
        : !isNaN(r.density) ? 'enter resuspension vol' : '—';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Exports
  // ─────────────────────────────────────────────────────────────────────────────

  lt.counting = {
    core: core,
    readCounts: readCounts,
    getCurrentModeId: function () { return currentModeId; },
    buildModeSelector: buildModeSelector,
    selectMode: selectMode,
    onCountAllToggle: onCountAllToggle,
    renderNegativeError: renderNegativeError,
    renderResults: renderResults,
  };
})(typeof window !== 'undefined' ? window : globalThis);
