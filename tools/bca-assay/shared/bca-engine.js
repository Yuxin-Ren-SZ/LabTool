'use strict';
/* ════════════════════════════════════════════════════════════════
   BCA ENGINE — pure logic, no DOM.
   Parsing · regression (linear + quadratic) · interpolation ·
   replicate stats (CV%) · formatting · export builders.
   Exposed as window.BCAEngine.
   ════════════════════════════════════════════════════════════════ */
(function (root) {

  const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const N_R = 8, N_C = 12;

  /* Standard presets for manual entry */
  const PRESETS = {
    pierce: { id: 'pierce', name: 'Pierce BCA', unit: 'µg/mL',  concs: [2000, 1500, 1000, 750, 500, 250, 125, 25, 0] },
    basic:  { id: 'basic',  name: 'Basic',      unit: 'µg/well', concs: [4, 2, 1, 0.5, 0] },
    custom: { id: 'custom', name: 'Custom',     unit: 'µg/mL',   concs: [] },
  };
  /* Plate-mode assignment templates */
  const PLATE_TPLS = [
    { id: 'pierce', name: 'Pierce BCA Kit',      unit: 'µg/mL',   concs: [2000, 1000, 500, 250, 125, 25, 0] },
    { id: 'basic',  name: 'Basic (0–4 µg/well)', unit: 'µg/well', concs: [4, 2, 1, 0.5, 0] },
  ];

  const CV_WARN = 15; // % — replicate spread above this is flagged

  /* ── Parsing ──────────────────────────────────────────────── */
  function parseRaw(text) {
    const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
    let hi = lines.findIndex(l => /temperature/i.test(l));
    if (hi < 0) {
      // fall back: first line that looks like a 12-number data row
      hi = lines.findIndex(l => numericCells(l).length >= N_C) - 1;
    }
    if (hi < 0) throw new Error('Could not find the plate data block. Is this a SoftMax Pro / SpectraMax .txt export?');
    const dl = lines.slice(hi + 1).filter(l => l.trim() && !l.startsWith('~'));
    if (dl.length < N_R) throw new Error(`Expected ${N_R} data rows after the header, found ${dl.length}.`);
    return dl.slice(0, N_R).map((line, ri) => {
      // SoftMax rows: <Temp>\t<RowLabel>\t v1 .. v12 — skip 2 lead cells
      let cells = line.split('\t');
      let nums = cells.slice(2, 2 + N_C).map(v => parseFloat(v.trim()));
      if (nums.some(isNaN)) {
        // try: take the last 12 numeric cells of the line
        const all = numericCells(line);
        if (all.length >= N_C) nums = all.slice(0, N_C);
      }
      if (nums.length < N_C || nums.some(isNaN))
        throw new Error(`Row ${ROWS[ri]}: expected 12 numeric values.`);
      return nums;
    });
  }

  function parseGrid(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const dl = lines.filter(l => numericCells(l).length >= N_C);
    if (!dl.length) throw new Error('No rows with 12+ numeric values found. Paste the 8×12 OD block.');
    if (dl.length < N_R) throw new Error(`Found ${dl.length} numeric row(s) — a full plate needs ${N_R}.`);
    return dl.slice(0, N_R).map(line => numericCells(line).slice(0, N_C));
  }

  function numericCells(line) {
    return line.split(/[\t,;]+/).map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
  }

  /* ── Replicate stats ──────────────────────────────────────── */
  function clean(arr) { return (arr || []).map(Number).filter(v => !isNaN(v) && v >= 0); }
  function mean(arr) { const a = clean(arr); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN; }
  function sd(arr) {
    const a = clean(arr); if (a.length < 2) return NaN;
    const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
  }
  function cv(arr) { const m = mean(arr), s = sd(arr); return (isNaN(s) || m === 0) ? NaN : (s / m) * 100; }

  /* ── Regression ───────────────────────────────────────────── */
  function linFit(pts) {
    const n = pts.length;
    const sx = sum(pts, p => p.x), sy = sum(pts, p => p.y);
    const sxy = sum(pts, p => p.x * p.y), sx2 = sum(pts, p => p.x * p.x);
    const den = n * sx2 - sx * sx;
    if (den === 0) return null;
    const b = (n * sxy - sx * sy) / den;
    const a = (sy - b * sx) / n;
    const predict = x => a + b * x;
    const r2 = rSquared(pts, predict);
    return {
      type: 'linear', a, b, r2, predict,
      invert: y => (y - a) / b,
      coef: { intercept: a, slope: b },
      equation: `OD = ${fmtSci(b)}·C ${a >= 0 ? '+' : '−'} ${Math.abs(a).toFixed(4)}`,
    };
  }

  function quadFit(pts) {
    if (pts.length < 3) return null;
    // Solve normal equations for y = a + b x + c x^2  (3x3)
    const X = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const Y = [0, 0, 0];
    for (const p of pts) {
      const xs = [1, p.x, p.x * p.x];
      for (let i = 0; i < 3; i++) {
        Y[i] += xs[i] * p.y;
        for (let j = 0; j < 3; j++) X[i][j] += xs[i] * xs[j];
      }
    }
    const sol = solve3(X, Y);
    if (!sol) return null;
    const [a, b, c] = sol;
    const predict = x => a + b * x + c * x * x;
    const r2 = rSquared(pts, predict);
    const xs = pts.map(p => p.x), xmin = Math.min(...xs), xmax = Math.max(...xs);
    return {
      type: 'quadratic', a, b, c, r2, predict,
      invert: y => invertQuad(a, b, c, y, xmin, xmax),
      coef: { c0: a, c1: b, c2: c },
      equation: `OD = ${fmtSci(c)}·C² ${b >= 0 ? '+' : '−'} ${fmtSci(Math.abs(b))}·C ${a >= 0 ? '+' : '−'} ${Math.abs(a).toFixed(4)}`,
    };
  }

  function invertQuad(a, b, c, y, xmin, xmax) {
    if (Math.abs(c) < 1e-12) return (y - a) / b;
    const disc = b * b - 4 * c * (a - y);
    if (disc < 0) return NaN;
    const r = Math.sqrt(disc);
    const r1 = (-b + r) / (2 * c), r2 = (-b - r) / (2 * c);
    const cand = [r1, r2].filter(v => isFinite(v));
    // prefer root inside [xmin-margin, xmax+margin] & non-negative
    const span = (xmax - xmin) || 1;
    const inRange = cand.filter(v => v >= -0.001 && v >= xmin - span && v <= xmax + span);
    if (inRange.length) return inRange.sort((u, v) => Math.abs(u - mid(xmin, xmax)) - Math.abs(v - mid(xmin, xmax)))[0];
    const nonNeg = cand.filter(v => v >= 0);
    return nonNeg.length ? Math.min(...nonNeg) : cand[0];
  }
  function mid(a, b) { return (a + b) / 2; }

  function fit(pts, type) {
    if (pts.length < 2) return null;
    if (type === 'quadratic' && pts.length >= 3) return quadFit(pts) || linFit(pts);
    return linFit(pts);
  }

  function rSquared(pts, predict) {
    const ym = sum(pts, p => p.y) / pts.length;
    const sst = sum(pts, p => (p.y - ym) ** 2);
    const ssr = sum(pts, p => (p.y - predict(p.x)) ** 2);
    return sst === 0 ? 1 : 1 - ssr / sst;
  }
  function sum(arr, f) { return arr.reduce((s, v) => s + f(v), 0); }

  function solve3(A, b) {
    // Gaussian elimination with partial pivoting on a 3×3 system
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < 3; col++) {
      let piv = col;
      for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12) return null;
      [M[col], M[piv]] = [M[piv], M[col]];
      for (let r = 0; r < 3; r++) {
        if (r === col) continue;
        const f = M[r][col] / M[col][col];
        for (let k = col; k < 4; k++) M[r][k] -= f * M[col][k];
      }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  }

  /* ── Build a complete result object from std/sample groups ──
     std:   [{conc, ods:[]}]
     smp:   [{name, df, ods:[]}]
     opts:  {fitType, unit}
     returns {ok, fit, stdPts, samples, unit, warnings}            */
  function compute(std, smp, opts) {
    const unit = opts.unit || 'µg/mL';
    const fitType = opts.fitType || 'linear';
    const stdPts = std
      .map(s => ({ conc: Number(s.conc), ods: clean(s.ods), x: Number(s.conc), y: mean(s.ods), cv: cv(s.ods), n: clean(s.ods).length }))
      .filter(p => !isNaN(p.x) && !isNaN(p.y));

    if (stdPts.length < 2) {
      return { ok: false, reason: stdPts.length === 0 ? 'empty' : 'need2', nStd: stdPts.length, unit };
    }
    const f = fit(stdPts.map(p => ({ x: p.x, y: p.y })), fitType);
    if (!f) return { ok: false, reason: 'singular', unit };

    const odVals = stdPts.map(p => p.y);
    const minOD = Math.min(...odVals), maxOD = Math.max(...odVals);
    const concVals = stdPts.map(p => p.x);
    const minC = Math.min(...concVals), maxC = Math.max(...concVals);

    const samples = smp.map(s => {
      const ods = clean(s.ods);
      const od = mean(ods);
      const df = Number(s.df) || 1;
      if (isNaN(od)) return { name: s.name || '—', od: NaN, df, conc: NaN, raw: NaN, cv: NaN, n: ods.length, flags: [] };
      const raw = f.invert(od);
      const conc = raw * df;
      const flags = [];
      if (isNaN(raw) || raw < 0 || conc < 0) flags.push('low');
      else if (od < minOD || od > maxOD || raw < minC || raw > maxC) flags.push('extrap');
      const c = cv(ods);
      if (!isNaN(c) && c > CV_WARN) flags.push('cv');
      return { name: s.name || '—', od, df, conc, raw, cv: c, n: ods.length, flags };
    }).filter(r => r.name !== '—' || !isNaN(r.od));

    return { ok: true, fit: f, stdPts, samples, unit, fitType, minOD, maxOD, minC, maxC };
  }

  /* ── Formatting ───────────────────────────────────────────── */
  function fmtSci(v) { return (v === 0 || isNaN(v)) ? '0' : v.toExponential(3); }
  function fmtConc(v) { if (isNaN(v)) return '—'; const a = Math.abs(v); return a >= 100 ? v.toFixed(1) : v.toFixed(2); }
  function fmtOD(v) { return isNaN(v) ? '—' : v.toFixed(4); }
  function fmtCV(v) { return isNaN(v) ? '—' : v.toFixed(1) + '%'; }

  function niceNum(x, round) {
    const e = Math.floor(Math.log10(x)), f = x / Math.pow(10, e);
    const nf = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) : (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
    return nf * Math.pow(10, e);
  }
  function niceTicks(mn, mx, n) {
    if (mx <= mn) mx = mn + 1;
    const step = niceNum((mx - mn) / (n - 1), true);
    const lo = Math.floor(mn / step) * step, hi = Math.ceil(mx / step) * step;
    const t = [];
    for (let v = lo; v <= hi + step * 0.5; v += step)
      if (v >= mn - 1e-9 && v <= mx + 1e-9) t.push(parseFloat(v.toPrecision(10)));
    return t;
  }

  /* ── Export builders ──────────────────────────────────────── */
  function buildCSV(res) {
    const f = res.fit;
    const head = ['# BCA Assay Results', `# Fit,${f.type}`, `# Equation,"${f.equation}"`,
      `# R2,${f.r2.toFixed(6)}`, ''];
    head.push(`Sample,Avg OD,n,CV%,Dilution,Protein (${res.unit}),Flag`);
    const rows = res.samples.map(r => [
      `"${(r.name || '').replace(/"/g, '""')}"`,
      isNaN(r.od) ? '' : r.od.toFixed(4),
      r.n || '',
      isNaN(r.cv) ? '' : r.cv.toFixed(1),
      r.df,
      isNaN(r.conc) ? '' : r.conc.toFixed(2),
      flagText(r.flags),
    ].join(','));
    return head.concat(rows).join('\r\n');
  }
  function buildTSV(res) {
    const lines = [`Sample\tAvg OD\tn\tCV%\tDilution\tProtein (${res.unit})\tFlag`];
    res.samples.forEach(r => lines.push([
      r.name || '', isNaN(r.od) ? '' : r.od.toFixed(4), r.n || '',
      isNaN(r.cv) ? '' : r.cv.toFixed(1), r.df,
      isNaN(r.conc) ? '' : r.conc.toFixed(2), flagText(r.flags),
    ].join('\t')));
    return lines.join('\n');
  }
  function flagText(flags) {
    if (!flags || !flags.length) return '';
    return flags.map(f => f === 'low' ? 'Below range' : f === 'extrap' ? 'Extrapolated' : f === 'cv' ? 'High CV' : f).join('; ');
  }

  root.BCAEngine = {
    ROWS, N_R, N_C, PRESETS, PLATE_TPLS, CV_WARN,
    parseRaw, parseGrid, numericCells,
    mean, sd, cv, clean,
    linFit, quadFit, fit, compute,
    fmtSci, fmtConc, fmtOD, fmtCV, niceTicks, niceNum,
    buildCSV, buildTSV, flagText,
  };
})(window);
