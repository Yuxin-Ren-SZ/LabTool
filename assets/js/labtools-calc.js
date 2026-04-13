/**
 * LabTools — Shared Calculation Utilities
 * =========================================
 * Pure functions with NO DOM dependencies.
 * Safe to unit-test directly in Node.js or any browser console.
 *
 * Loaded via <script src="../../assets/js/labtools-calc.js"> in each tool.
 * All symbols are globals (no module system required for static HTML tools).
 *
 * Contents
 * ─────────
 * 1. Number formatting helpers   — avgTwo, fmt, fmtSig
 * 2. Unit display helpers        — bestVolumeDisplay, autoBestConcUnit
 * 3. Input restriction utility   — restrictToNumeric
 * 4. Cell count calculations     — calcCellDensity, calcTotalCells, calcViabilityPct
 * 5. SVG diagram generator       — makeDiagram
 * 6. Counting mode definitions   — SMALL_ALL, SMALL_5, MODES
 *
 * Quick test (paste into browser console):
 *   calcCellDensity(80, 0.25, 20)   // → 4,000,000
 *   calcViabilityPct(80, 20)        // → 80
 *   fmtSig(1234567)                 // → "1,234,567"
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Number formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Average two optional count values.
 * Handles the case where one or both inputs may be missing (NaN).
 *
 * @param {number} a
 * @param {number} b
 * @returns {{ val: number, n: number }}
 *   val = the average (NaN if both missing), n = number of valid inputs (0, 1, or 2)
 *
 * @example
 *   avgTwo(80, 90)       // → { val: 85, n: 2 }
 *   avgTwo(80, NaN)      // → { val: 80, n: 1 }
 *   avgTwo(NaN, NaN)     // → { val: NaN, n: 0 }
 */
function avgTwo(a, b) {
  const ha = !isNaN(a), hb = !isNaN(b);
  if (!ha && !hb) return { val: NaN, n: 0 };
  if (ha && !hb)  return { val: a, n: 1 };
  if (!ha && hb)  return { val: b, n: 1 };
  return { val: (a + b) / 2, n: 2 };
}

/**
 * Format a rounded integer with thousands commas.
 * Returns '—' for NaN or null (display placeholder).
 *
 * @param {number} n
 * @returns {string}
 *
 * @example
 *   fmt(2000000)   // → "2,000,000"
 *   fmt(NaN)       // → "—"
 */
function fmt(n) {
  if (isNaN(n) || n == null) return '—';
  return Math.round(n).toLocaleString('en-US');
}

/**
 * Format a number with appropriate significant figures for display.
 *
 * Rules:
 *   NaN / null       → '—'
 *   0                → '0'
 *   |n| < 0.001      → exponential notation, 2 decimal places
 *   Exact integers   → no decimal point; thousands commas if ≥ 1000
 *   0.001–0.099      → 3 decimal places  (≥ 2 sig figs)
 *   0.1–9.999        → 2 decimal places  (≥ 2 sig figs)
 *   10–999.9         → 1 decimal place   (≥ 3 sig figs)
 *   ≥ 1000           → rounded integer with thousands commas
 *
 * @param {number} n
 * @returns {string}
 *
 * @example
 *   fmtSig(0.00012)   // → "1.20e-4"
 *   fmtSig(1.5)       // → "1.50"
 *   fmtSig(12.5)      // → "12.5"
 *   fmtSig(1234567)   // → "1,234,567"
 */
function fmtSig(n) {
  if (isNaN(n) || n == null) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs < 0.001) return n.toExponential(2);
  if (Number.isInteger(n))
    return abs >= 1000 ? n.toLocaleString('en-US') : n.toString();
  if (abs < 0.1)   return n.toFixed(3);
  if (abs < 1)     return n.toFixed(2);
  if (abs < 10)    return n.toFixed(2);
  if (abs < 1000)  return n.toFixed(1);
  return Math.round(n).toLocaleString('en-US');
}


// ─────────────────────────────────────────────────────────────────────────────
// 2. Unit display helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a mL value to the most human-readable volume unit.
 *
 * @param {number} mL  Volume in millilitres
 * @returns {{ val: number, unit: string }}
 *
 * @example
 *   bestVolumeDisplay(0.5)     // → { val: 500, unit: 'µL' }
 *   bestVolumeDisplay(2)       // → { val: 2,   unit: 'mL' }
 *   bestVolumeDisplay(2000)    // → { val: 2,   unit: 'L'  }
 */
function bestVolumeDisplay(mL) {
  const abs = Math.abs(mL);
  if (abs > 0 && abs < 1)  return { val: mL * 1000, unit: 'µL' };
  if (abs >= 1000)          return { val: mL / 1000, unit: 'L'  };
  return { val: mL, unit: 'mL' };
}

/**
 * Choose the best concentration unit scale for a raw cells/mL value.
 *
 * @param {number} cellsPerML
 * @returns {{ mult: number, label: string, pillText: string }}
 *
 * @example
 *   autoBestConcUnit(2e6)   // → { mult: 1e6, label: 'M/mL', pillText: 'M' }
 *   autoBestConcUnit(500)   // → { mult: 1e3, label: 'K/mL', pillText: 'K' }
 */
function autoBestConcUnit(cellsPerML) {
  if (cellsPerML >= 1e9) return { mult: 1e9, label: 'B/mL', pillText: 'B' };
  if (cellsPerML >= 1e6) return { mult: 1e6, label: 'M/mL', pillText: 'M' };
  if (cellsPerML >= 1e3) return { mult: 1e3, label: 'K/mL', pillText: 'K' };
  return { mult: 1, label: 'cells/mL', pillText: 'cells' };
}


// ─────────────────────────────────────────────────────────────────────────────
// 3. Input restriction utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keydown handler that restricts a numeric input field to only the characters
 * that make sense in a scientific number: digits, decimal point, plus and minus.
 *
 * Usage (apply once at page init, not inline on each element):
 *   document.querySelectorAll('input[type="number"]')
 *     .forEach(el => el.addEventListener('keydown', restrictToNumeric));
 *
 * Allowed through:
 *   • Digits           0–9
 *   • Decimal point    .
 *   • Sign characters  +  -
 *   • Navigation keys  Backspace Delete Tab Enter Escape Home End Arrow*
 *   • Modifier combos  Ctrl/Cmd+A/C/V/X/Z (select-all, copy, paste, cut, undo)
 *
 * @param {KeyboardEvent} e
 */
function restrictToNumeric(e) {
  // Always pass through: Ctrl / Cmd combos (copy, paste, select-all, …)
  if (e.ctrlKey || e.metaKey) return;

  // Always pass through: navigation and editing keys
  const navigationKeys = [
    'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End',
  ];
  if (navigationKeys.includes(e.key)) return;

  // Allow: digits, decimal point, plus and minus signs
  if (/^[0-9+\-.]$/.test(e.key)) return;

  // Block everything else (letters, symbols, etc.)
  e.preventDefault();
}


// ─────────────────────────────────────────────────────────────────────────────
// 4. Core hemocytometer calculations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a hemocytometer average count into Final Concentration (cells/mL).
 *
 * Formula: avgCount × multiplier × dilutionFactor × 10⁴
 *
 * The multiplier is mode-specific and normalises the raw count to
 * "cells per one large-square equivalent" before applying the formula.
 *
 * @param {number} avgCount   Raw count from the counting mode (≥ 0)
 * @param {number} multiplier Mode-specific scaling factor (from MODES array)
 * @param {number} df         Dilution factor (> 0)
 * @returns {number} Rounded cells/mL, or NaN if any input is invalid or out of range
 *
 * @example
 *   calcCellDensity(80, 0.25, 20)   // → 4000000  (4 corner squares, DF=20)
 *   calcCellDensity(100, 1, 20)     // → 20000000 (all-25 mode, DF=20)
 */
function calcCellDensity(avgCount, multiplier, df) {
  if (isNaN(avgCount) || isNaN(multiplier) || isNaN(df)) return NaN;
  if (avgCount < 0 || df <= 0) return NaN;
  return Math.round(avgCount * multiplier * df * 1e4);
}

/**
 * Calculate total cells in a resuspension volume.
 *
 * @param {number} density   Final Concentration in cells/mL
 * @param {number} volumeML  Resuspension volume in mL (> 0)
 * @returns {number} Rounded total cell count, or NaN if inputs are invalid
 *
 * @example
 *   calcTotalCells(2e6, 1.5)   // → 3000000
 */
function calcTotalCells(density, volumeML) {
  if (isNaN(density) || isNaN(volumeML) || volumeML <= 0) return NaN;
  return Math.round(density * volumeML);
}

/**
 * Calculate Trypan Blue viability percentage.
 *
 * @param {number} avgLive  Average live cell count (≥ 0)
 * @param {number} avgDead  Average dead cell count (≥ 0)
 * @returns {number} Viability % in [0, 100], or NaN if inputs are invalid
 *
 * @example
 *   calcViabilityPct(80, 20)   // → 80
 *   calcViabilityPct(80, 0)    // → 100
 *   calcViabilityPct(0, 0)     // → NaN  (no cells counted)
 */
function calcViabilityPct(avgLive, avgDead) {
  if (isNaN(avgLive) || isNaN(avgDead)) return NaN;
  if (avgLive < 0 || avgDead < 0)       return NaN;
  const total = avgLive + avgDead;
  if (total === 0) return NaN;
  return (avgLive / total) * 100;
}


// ─────────────────────────────────────────────────────────────────────────────
// 5. SVG hemocytometer diagram generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate an inline SVG depicting the selected counting mode
 * on a Neubauer improved hemocytometer.
 *
 * The chamber is rendered as a 3×3 grid of large squares.
 * The centre large square is subdivided into a 5×5 grid of small squares.
 *
 * @param {Array<[number,number]>} largeHL  Large squares to highlight, e.g. [[0,0],[0,2]]
 * @param {Array<[number,number]>|'all'} smallHL
 *   Small squares (within the centre large square) to highlight,
 *   or the string 'all' to highlight all 25.
 * @returns {string} SVG markup string (safe to set as innerHTML)
 */
function makeDiagram(largeHL, smallHL) {
  const S = 22, G = 1.5;
  const W = S * 3 + G * 4;
  const ss = S / 5;

  const isLHL = (r, c) => largeHL.some(([a, b]) => a === r && b === c);
  const isSHL = (r, c) => {
    if (smallHL === 'all') return true;
    return Array.isArray(smallHL) && smallHL.some(([a, b]) => a === r && b === c);
  };

  let s = `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect width="${W}" height="${W}" rx="2" fill="#f7f6f3"/>`;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x = G + c * (S + G);
      const y = G + r * (S + G);
      const hl  = isLHL(r, c);
      const ctr = r === 1 && c === 1;

      s += `<rect x="${x}" y="${y}" width="${S}" height="${S}" rx="1"
              fill="${hl ? '#dce7ff' : '#fff'}"
              stroke="${ctr ? '#9b9a97' : '#ccc9c2'}"
              stroke-width="${ctr ? 0.8 : 0.6}"/>`;

      if (ctr) {
        for (let sr = 0; sr < 5; sr++) {
          for (let sc = 0; sc < 5; sc++) {
            const shl = isSHL(sr, sc);
            s += `<rect x="${x + sc * ss}" y="${y + sr * ss}" width="${ss}" height="${ss}"
                    fill="${shl ? '#c8d9ff' : '#f0efed'}"
                    stroke="#d0cfc9" stroke-width="0.3"/>`;
            if (shl) {
              s += `<circle cx="${x + sc * ss + ss / 2}" cy="${y + sr * ss + ss / 2}"
                      r="${ss * 0.22}" fill="#3366cc" opacity="0.85"/>`;
            }
          }
        }
      }

      if (hl && !ctr) {
        s += `<circle cx="${x + S / 2}" cy="${y + S / 2}" r="3.5" fill="#3366cc" opacity="0.9"/>`;
      }
    }
  }

  s += `<rect x="0.8" y="0.8" width="${W - 1.6}" height="${W - 1.6}" rx="2"
          fill="none" stroke="#37352f" stroke-width="1"/>`;
  s += '</svg>';
  return s;
}


// ─────────────────────────────────────────────────────────────────────────────
// 6. Counting mode definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each mode describes how the user counts cells and the multiplier
 * that normalises their total count to "cells per 1 large-square equivalent"
 * before the hemocytometer formula is applied.
 *
 * Formula in all modes: avgCount × multiplier × DF × 10⁴ = cells/mL
 */

/** All 25 small squares in the centre box (Mode 1 & docs reference). */
const SMALL_ALL = 'all';

/** The 5-small-square pattern: 4 corners + centre (Mode 2). */
const SMALL_5 = [[0, 0], [0, 4], [2, 2], [4, 0], [4, 4]];

const MODES = [
  {
    id: 1,
    tag: 'All 25\nsmall sq.',
    largeHL: [],
    smallHL: SMALL_ALL,
    multiplier: 1,         // 25 small sq = 1 large sq equivalent; total count = per-large-sq
    formulaNote: 'avg × DF × 10⁴',
    desc: '<strong>All 25 small squares</strong> in the center box — for very dense samples. Enter total cells counted across all 25 squares.',
    hint: 'Total cells across all 25 small squares',
  },
  {
    id: 2,
    tag: '5 small\nsq.',
    largeHL: [],
    smallHL: SMALL_5,
    multiplier: 5,         // total ÷ 5 sq × 25 sq/large = total × 5 per large-sq
    formulaNote: 'avg × 5 × DF × 10⁴',
    desc: '<strong>5 small squares</strong> (4 corners + center of inner grid) — for dense samples. Enter total cells across those 5 squares.',
    hint: 'Total cells across 5 small squares (corners + center)',
  },
  {
    id: 3,
    tag: '4 corner\nsq.',
    largeHL: [[0, 0], [0, 2], [2, 0], [2, 2]],
    smallHL: [],
    multiplier: 0.25,      // total ÷ 4 = avg per large-sq
    formulaNote: 'avg ÷ 4 × DF × 10⁴',
    desc: '<strong>4 large corner squares</strong> — standard protocol for routine cell culture. Enter total cells across all 4 corners.',
    hint: 'Total cells across all 4 corner squares',
  },
  {
    id: 4,
    tag: '1 corner\nsq.',
    largeHL: [[0, 0]],
    smallHL: [],
    multiplier: 1,         // single square = per-large-sq directly
    formulaNote: 'count × DF × 10⁴',
    desc: '<strong>Single corner square</strong> — quickest estimate when sample density is adequate.',
    hint: 'Cells in one corner square',
  },
];
