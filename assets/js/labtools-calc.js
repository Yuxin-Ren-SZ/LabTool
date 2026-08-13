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
 * 7. qPCR statistics             — parseSampleAnnotation, tTestTwoSided,
 *                                  studentTPvalue, stdCurveFit, genormM
 *
 * Quick test (paste into browser console):
 *   calcCellDensity(80, 0.25, 20)   // → 4,000,000
 *   calcViabilityPct(80, 20)        // → 80
 *   fmtSig(1234567)                 // → "1,234,567"
 *   parseSampleAnnotation('Ctrl_2') // → { group: 'Ctrl', bioRep: '2' }
 *   tTestTwoSided([1,2,3],[4,5,6]).p.toFixed(3)   // → "0.021"
 *   stdCurveFit([{quantity:1,cq:30},{quantity:10,cq:26.68},
 *                {quantity:100,cq:23.36}]).E.toFixed(2)   // → "2.00"
 */

'use strict';

if (typeof window !== 'undefined') { (window.__labtoolsLoadOrder = window.__labtoolsLoadOrder || []).push('labtools-calc'); }

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
 * Convert an animal body weight between grams and kilograms.
 *
 * @param {number} value
 * @param {string} fromUnit  'g' | 'kg'
 * @param {string} toUnit    'g' | 'kg'
 * @returns {number} Converted weight, or NaN for invalid input
 *
 * @example
 *   convertBodyWeight(25, 'g', 'kg')    // → 0.025
 *   convertBodyWeight(0.25, 'kg', 'g')  // → 250
 */
function convertBodyWeight(value, fromUnit, toUnit) {
  if (isNaN(value) || value <= 0) return NaN;
  if (!fromUnit || !toUnit) return NaN;
  if (fromUnit === toUnit) return value;
  if (fromUnit === 'g' && toUnit === 'kg') return value / 1000;
  if (fromUnit === 'kg' && toUnit === 'g') return value * 1000;
  return NaN;
}

/**
 * Calculate a final drug amount from a dose-per-body-weight value.
 *
 * Formula: doseValue × convertedBodyWeight
 *
 * @param {number} doseValue
 * @param {string} doseWeightUnit   'g' | 'kg' from the protocol row
 * @param {number} bodyWeightValue
 * @param {string} bodyWeightUnit   'g' | 'kg' from the animal input
 * @returns {number} Final amount in the numerator unit, or NaN if invalid
 *
 * @example
 *   calcDoseFromBodyWeight(5, 'kg', 25, 'g')      // → 0.125
 *   calcDoseFromBodyWeight(10, 'kg', 0.25, 'kg')  // → 2.5
 */
function calcDoseFromBodyWeight(doseValue, doseWeightUnit, bodyWeightValue, bodyWeightUnit) {
  if (isNaN(doseValue) || doseValue <= 0) return NaN;
  const convertedWeight = convertBodyWeight(bodyWeightValue, bodyWeightUnit, doseWeightUnit);
  if (isNaN(convertedWeight)) return NaN;
  return doseValue * convertedWeight;
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


// ─────────────────────────────────────────────────────────────────────────────
// 7. qPCR statistics (RT-qPCR data-analysis workflow, MIQE 2.0)
// ─────────────────────────────────────────────────────────────────────────────
//
// Pure numerics for the qPCR Analysis tool. Zero dependency — the p-value is
// computed from the regularized incomplete beta function (Numerical Recipes
// betacf), so no stats library is needed. All functions are side-effect free.

/**
 * Split a sample label into its experimental group and biological-replicate id
 * using a trailing-number naming convention. A biological replicate is the unit
 * of statistical n; technical replicates (wells) share a (group, bioRep).
 *
 * Recognises a trailing replicate token: an optional separator, an optional
 * "rep"/"replicate"/"r"/"#"/"no." word, then digits at the very end.
 *
 * @param {string} name  e.g. 'Control_1', 'Treat-2', 'KO rep3', 'Ctrl 1'
 * @returns {{ group: string, bioRep: string }}
 *   Falls back to { group: name, bioRep: '1' } when no trailing number is found.
 *
 * @example
 *   parseSampleAnnotation('Control_2')  // → { group: 'Control', bioRep: '2' }
 *   parseSampleAnnotation('KO rep3')    // → { group: 'KO',      bioRep: '3' }
 *   parseSampleAnnotation('Vehicle')    // → { group: 'Vehicle', bioRep: '1' }
 */
function parseSampleAnnotation(name) {
  const s = (name == null ? '' : String(name)).trim();
  if (!s) return { group: '', bioRep: '' };
  const m = /^(.*?)[\s_\-.#]*(?:rep(?:licate)?|r|#|no\.?)?[\s_\-.#]*(\d+)\s*$/i.exec(s);
  if (m && m[1].trim()) return { group: m[1].trim(), bioRep: m[2] };
  return { group: s, bioRep: '1' };
}

/** Arithmetic mean of a numeric array (NaN for empty). */
function statMean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN; }

/** Sample standard deviation (n−1 denominator; NaN for n<2). */
function statSD(a) {
  if (a.length < 2) return NaN;
  const m = statMean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

/** Natural log of the gamma function (Lanczos approximation). */
function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/** Continued-fraction expansion for the incomplete beta function (Numerical Recipes). */
function betacf(a, b, x) {
  const FPMIN = 1e-30, EPS = 3e-12, MAXIT = 200;
  let qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b), used for the t-distribution CDF. */
function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) +
                      a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? bt * betacf(a, b, x) / a
    : 1 - bt * betacf(b, a, 1 - x) / b;
}

/**
 * Two-tailed p-value for a Student's t statistic with df degrees of freedom.
 * p = P(|T| > |t|) = I_{df/(df+t²)}(df/2, 1/2).
 *
 * @param {number} t   t statistic
 * @param {number} df  degrees of freedom (> 0)
 * @returns {number} two-tailed p-value in [0, 1], or NaN if df invalid
 *
 * @example
 *   studentTPvalue(2.776, 4).toFixed(3)   // → "0.050"
 */
function studentTPvalue(t, df) {
  if (!(df > 0) || isNaN(t)) return NaN;
  return betai(df / 2, 0.5, df / (df + t * t));
}

/**
 * Critical two-tailed t value: the t such that studentTPvalue(t, df) = alpha.
 * Used for confidence intervals (default alpha 0.05 → 95% CI). Solved by
 * bisection since studentTPvalue is monotone decreasing in t.
 *
 * @param {number} df     degrees of freedom (> 0)
 * @param {number} [alpha=0.05]  two-tailed significance level
 * @returns {number} critical t (> 0), or NaN if df invalid
 *
 * @example
 *   tCritical(4).toFixed(3)    // → "2.776"  (95% CI, df=4)
 */
function tCritical(df, alpha) {
  if (!(df > 0)) return NaN;
  const a = alpha == null ? 0.05 : alpha;
  let lo = 0, hi = 1e4;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (studentTPvalue(mid, df) > a) lo = mid; else hi = mid;
    if (hi - lo < 1e-9) break;
  }
  return (lo + hi) / 2;
}

/**
 * Two-sample, two-tailed t-test. Defaults to the pooled (equal-variance)
 * Student's t-test — the same test as Excel `T.TEST(a, b, 2, 2)` used in the
 * RT-qPCR manual (§5.6.1). Pass { welch: true } for the Welch (unequal-variance)
 * variant. For qPCR, run this on ΔCq values across biological replicates, never
 * on fold change (Yuan 2006, PMID 16504059).
 *
 * @param {number[]} a  group A values (e.g. control ΔCq per biological replicate)
 * @param {number[]} b  group B values (e.g. treatment ΔCq)
 * @param {{welch?: boolean}} [opts]
 * @returns {{ t:number, df:number, p:number, meanA:number, meanB:number,
 *             nA:number, nB:number, welch:boolean } | null}
 *   null when either group has n < 2.
 *
 * @example
 *   tTestTwoSided([1,2,3],[4,5,6]).p.toFixed(3)   // → "0.021"
 */
function tTestTwoSided(a, b, opts) {
  const welch = !!(opts && opts.welch);
  a = a.filter(v => v != null && !isNaN(v));
  b = b.filter(v => v != null && !isNaN(v));
  const nA = a.length, nB = b.length;
  if (nA < 2 || nB < 2) return null;
  const mA = statMean(a), mB = statMean(b);
  const vA = statSD(a) ** 2, vB = statSD(b) ** 2;
  let t, df;
  if (welch) {
    const sA = vA / nA, sB = vB / nB;
    t = (mA - mB) / Math.sqrt(sA + sB);
    df = (sA + sB) ** 2 / (sA * sA / (nA - 1) + sB * sB / (nB - 1));
  } else {
    const sp2 = ((nA - 1) * vA + (nB - 1) * vB) / (nA + nB - 2);
    t = (mA - mB) / Math.sqrt(sp2 * (1 / nA + 1 / nB));
    df = nA + nB - 2;
  }
  return { t, df, p: studentTPvalue(t, df), meanA: mA, meanB: mB, nA, nB, welch };
}

/**
 * Fit a qPCR standard curve: linear regression of Cq on log10(quantity), then
 * amplification efficiency E = 10^(−1/slope). Slope ≈ −3.32 → E ≈ 2.0 (100%).
 *
 * @param {Array<{quantity:number, cq:number}>} points  dilution-series wells
 * @returns {{ slope:number, intercept:number, r2:number, E:number,
 *             effPct:number, n:number } | null}
 *   null when fewer than 2 distinct-quantity points with positive quantity.
 *
 * @example
 *   stdCurveFit([{quantity:1,cq:30},{quantity:10,cq:26.68},
 *                {quantity:100,cq:23.36}]).slope.toFixed(2)   // → "-3.32"
 */
function stdCurveFit(points) {
  const pts = (points || [])
    .filter(p => p && p.quantity > 0 && p.cq != null && !isNaN(p.cq))
    .map(p => ({ x: Math.log10(p.quantity), y: p.cq }));
  if (pts.length < 2) return null;
  const n = pts.length;
  const mx = statMean(pts.map(p => p.x)), my = statMean(pts.map(p => p.y));
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2; }
  if (sxx === 0) return null;                       // all points at one dilution
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  const E = Math.pow(10, -1 / slope);
  return { slope, intercept, r2, E, effPct: (E - 1) * 100, n };
}

/**
 * geNorm reference-gene stability M (Vandesompele 2002). Lower M = more stable;
 * the accepted stability threshold is M < 0.5 (heterogeneous samples < 1.0).
 * Works directly in Cq space: log2(quantity ratio) of genes j,k for a sample
 * equals (Cq_k − Cq_j), whose across-sample SD is the pairwise variation V_jk.
 * M_j is the mean V_jk over all other genes k.
 *
 * @param {Object<string, number[]>} cqByGene  gene → Cq array aligned by sample
 * @returns {{ M:Object<string,number>, ranked:Array<{gene:string,m:number}> }}
 *   ranked is ascending by M (most stable first); empty when < 2 usable genes.
 *
 * @example
 *   genormM({ GAPDH:[20,20.1,19.9], ACTB:[22,22.2,21.8] }).ranked[0].gene  // → 'GAPDH' or 'ACTB'
 */
function genormM(cqByGene) {
  const genes = Object.keys(cqByGene || {});
  const M = {};
  const usable = genes.filter(g => Array.isArray(cqByGene[g]));
  if (usable.length < 2) return { M, ranked: [] };
  for (const j of usable) {
    const vs = [];
    for (const k of usable) {
      if (k === j) continue;
      const diffs = [];
      const aj = cqByGene[j], ak = cqByGene[k];
      const len = Math.min(aj.length, ak.length);
      for (let i = 0; i < len; i++) {
        if (aj[i] != null && ak[i] != null && !isNaN(aj[i]) && !isNaN(ak[i])) diffs.push(ak[i] - aj[i]);
      }
      const v = statSD(diffs);
      if (!isNaN(v)) vs.push(v);
    }
    if (vs.length) M[j] = statMean(vs);
  }
  const ranked = Object.keys(M).map(g => ({ gene: g, m: M[g] })).sort((a, b) => a.m - b.m);
  return { M, ranked };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. qPCR plate planning (used by tools/qpcr-plate-planner/)
// ─────────────────────────────────────────────────────────────────────────────
// Port of scripts/gen-qpcr-layout.mjs into browser-safe pure functions. The
// generality the user needs lives in qpcrBuildSamples (any number of factors);
// qpcrPackPlates keeps the proven gen-script geometry (gene bands across columns,
// samples 2-per-row × replicate columns, NTC row, spare-band skip).

/**
 * Cartesian product of ordered factors → sample identities. General over any
 * number of factors (e.g. Treatment × Timepoint × Gene, or just Sample × Gene).
 *
 * @param {Array<{name:string, values:string[]}>} factors  ordered factor lists
 * @param {Object} [opts]
 * @param {string} [opts.sep='_']  joiner for the composite id/label
 * @param {string[]} [opts.skip=[]] sample ids (composite labels) to exclude
 * @returns {Array<{ id:string, label:string, parts:Object<string,string> }>}
 *
 * @example
 *   qpcrBuildSamples([{name:'T',values:['Ctrl','T1']},{name:'TP',values:['1','2']}])
 *   // → 4 samples: Ctrl_1, Ctrl_2, T1_1, T1_2
 */
function qpcrBuildSamples(factors, opts) {
  const o = opts || {};
  const sep = o.sep != null ? o.sep : '_';
  const skip = new Set(o.skip || []);
  const lists = (factors || []).filter(f => f && Array.isArray(f.values) && f.values.length);
  if (!lists.length) return [];
  let combos = [{}];
  for (const f of lists) {
    const next = [];
    for (const partial of combos) {
      for (const v of f.values) {
        next.push(Object.assign({}, partial, { [f.name]: v }));
      }
    }
    combos = next;
  }
  return combos
    .map(parts => {
      const label = lists.map(f => parts[f.name]).join(sep);
      return { id: label, label, parts };
    })
    .filter(s => !skip.has(s.id));
}

/**
 * Pack samples × gene bands into one or more plates. Assignment values are
 * LITERAL (gene name, sample label, content role, hex color) so the output maps
 * 1:1 onto the gen-script CSV rows — the serializer converts gene→category later.
 *
 * Geometry (per gen-qpcr-layout.mjs): each non-null band occupies
 * `2 × replicates` columns; samples fill 2 per row down the rows, each sample
 * spanning `replicates` adjacent columns; the last row holds the NTC duplicate.
 *
 * @param {Object} cfg
 * @param {Array<{name:string, bands:Array<{name:string, role:string}|null>}>} cfg.plates
 * @param {Array<{label:string}|string>} cfg.samples
 * @param {number} [cfg.replicates=2]
 * @param {string} [cfg.plateType='96']
 * @param {number} [cfg.rows=8]
 * @param {number} [cfg.cols=12]
 * @param {boolean} [cfg.ntc=true]           add an NTC duplicate row per band
 * @param {string[]} [cfg.referenceGenes=[]] anchor genes required on every plate
 * @param {function} [cfg.colorForGene]      (name, role) → hex; optional
 * @param {string} [cfg.ntcColor='#9aa0a6']
 * @returns {{ plates: Array<{name,plateType,cutCorners,assignments}> }}
 * @throws if a plate omits a required reference gene, or samples overflow a band.
 */
function qpcrPackPlates(cfg) {
  const c = cfg || {};
  const replicates = c.replicates > 0 ? Math.floor(c.replicates) : 2;
  const plateType = c.plateType || '96';
  const rows = c.rows > 0 ? c.rows : 8;
  const cols = c.cols > 0 ? c.cols : 12;
  const ntc = c.ntc !== false;
  const ntcColor = c.ntcColor || '#9aa0a6';
  const refSet = new Set((c.referenceGenes || []).map(g => (g && g.name) || g).filter(Boolean));
  const samples = (c.samples || []).map(s => (typeof s === 'string' ? { label: s } : s));

  const bandWidth = 2 * replicates;                 // columns consumed by one band
  const sampleRows = ntc ? rows - 1 : rows;         // rows available for samples
  const bandCapacity = sampleRows * 2;              // 2 samples per row
  if (samples.length > bandCapacity) {
    throw new Error('qpcrPackPlates: ' + samples.length + ' samples exceed band capacity ' +
      bandCapacity + ' (' + plateType + ', ' + replicates + '× replicates, ntc=' + ntc + ')');
  }

  const rowLabel = (r) => String.fromCharCode(65 + r);   // 0 → 'A'
  const wellId = (r, col) => rowLabel(r) + (col + 1);
  const ntcRow = rows - 1;

  const out = (c.plates || []).map((plate) => {
    const bands = plate.bands || [];
    if (bands.length * bandWidth > cols) {
      throw new Error('qpcrPackPlates: plate "' + plate.name + '" needs ' +
        (bands.length * bandWidth) + ' columns but plate has ' + cols);
    }
    // Reference-anchor invariant: every plate must carry each required reference.
    const present = new Set(bands.filter(Boolean).map(b => b.name));
    for (const ref of refSet) {
      if (!present.has(ref)) {
        throw new Error('qpcrPackPlates: plate "' + plate.name +
          '" is missing required reference gene "' + ref + '"');
      }
    }

    const assignments = {};
    bands.forEach((gene, b) => {
      if (!gene) return;                            // spare / skipped band
      const base = b * bandWidth;
      const color = gene.color || (c.colorForGene ? c.colorForGene(gene.name, gene.role) : '') || '#666666';
      samples.forEach((sample, s) => {
        const r = Math.floor(s / 2);
        const pair = s % 2;                         // 0 → first replicate block, 1 → second
        const c0 = base + pair * replicates;
        for (let k = 0; k < replicates; k++) {
          assignments[wellId(r, c0 + k)] =
            { gene: gene.name, sample: sample.label, content: gene.role || 'target', color: color };
        }
      });
      if (ntc) {
        for (let k = 0; k < replicates; k++) {
          assignments[wellId(ntcRow, base + k)] =
            { gene: 'NTC', sample: '', content: 'NTC', color: ntcColor };
        }
      }
    });

    return { name: plate.name, plateType: plateType, cutCorners: [], assignments: assignments };
  });

  return { plates: out };
}

/**
 * Convert a qpcrPackPlates result into a workbench `plate-layout` payload shaped
 * like the Microplate Layout Planner's own export: `gene` becomes a coloured
 * category field (value = category id; name/color live in categoriesByField),
 * while `sample` and `content` stay literal text fields. This is exactly the
 * shape the planner builds when it imports the gen-script CSV.
 *
 * @param {{plates:Array}} packed  output of qpcrPackPlates
 * @returns {{plates:Array, fields:Array, categoriesByField:Object}}
 */
function qpcrToPlateLayout(packed) {
  const fields = [
    { id: 'sample',  key: 'sample',  name: 'Sample ID', kind: 'text' },
    { id: 'gene',    key: 'gene',    name: 'Gene',      kind: 'category' },
    { id: 'content', key: 'content', name: 'Content',   kind: 'text' },
  ];
  const geneCats = [];
  const geneCatByName = new Map();     // gene name → category id
  let catSeq = 1;
  const geneCatId = (name, color) => {
    if (!geneCatByName.has(name)) {
      const id = 'g' + (catSeq++);
      geneCats.push({ id: id, name: name, color: color || '#666666' });
      geneCatByName.set(name, id);
    }
    return geneCatByName.get(name);
  };

  const plates = (packed.plates || []).map((p) => {
    const assignments = {};
    Object.keys(p.assignments).forEach((well) => {
      const a = p.assignments[well];
      const rec = {};
      if (a.sample)  rec.sample = a.sample;
      if (a.gene)    rec.gene = geneCatId(a.gene, a.color);
      if (a.content) rec.content = a.content;
      assignments[well] = rec;
    });
    return { name: p.name, plateType: p.plateType, cutCorners: p.cutCorners || [], assignments: assignments };
  });

  return { plates: plates, fields: fields, categoriesByField: { gene: geneCats } };
}
