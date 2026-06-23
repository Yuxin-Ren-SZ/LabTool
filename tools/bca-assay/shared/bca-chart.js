'use strict';
/* ════════════════════════════════════════════════════════════════
   BCA CHART — standard-curve SVG renderer (linear & quadratic).
   BCAChart.draw(svgEl, {fit, stdPts, samples, unit, w, h, accent})
   ════════════════════════════════════════════════════════════════ */
(function (root) {
  const E = root.BCAEngine;

  function draw(svg, o) {
    const W = o.w || 360, H = o.h || 200;
    const ML = 56, MR = 16, MT = 14, MB = 42;
    const PW = W - ML - MR, PH = H - MT - MB;
    const std = o.stdPts, fit = o.fit, samples = o.samples || [];
    const unit = o.unit || 'µg/mL';
    const cStd = '#3366cc', cSmp = '#e07832', cFit = '#5c8dff';

    const maxX = Math.max(...std.map(p => p.x)) * 1.08 || 8;
    const maxY = Math.max(...std.map(p => p.y), ...samples.filter(s => !isNaN(s.od)).map(s => s.od)) * 1.12 || 1;
    const xS = v => ML + (Math.max(0, v) / maxX) * PW;
    const yS = v => MT + PH - (Math.max(0, v) / maxY) * PH;
    const xT = E.niceTicks(0, maxX, 5), yT = E.niceTicks(0, maxY, 4);

    let s = '';
    s += `<rect x="${ML}" y="${MT}" width="${PW}" height="${PH}" fill="var(--surface-subtle)" rx="4"/>`;
    yT.forEach(t => s += `<line x1="${ML}" y1="${yS(t)}" x2="${ML + PW}" y2="${yS(t)}" stroke="var(--border-subtle)"/>`);
    xT.forEach(t => s += `<line x1="${xS(t)}" y1="${MT}" x2="${xS(t)}" y2="${MT + PH}" stroke="var(--border-subtle)"/>`);

    // fit curve
    if (fit) {
      let d = '';
      const N = 48;
      for (let i = 0; i <= N; i++) {
        const x = (maxX * i) / N, y = fit.predict(x);
        d += (i === 0 ? 'M' : 'L') + xS(x) + ',' + yS(Math.max(0, Math.min(y, maxY * 1.2)));
      }
      s += `<path d="${d}" fill="none" stroke="${cFit}" stroke-width="1.8" stroke-opacity="0.55" stroke-dasharray="${fit.type === 'quadratic' ? '0' : '5 3'}"/>`;
    }
    // sample drop-lines + diamonds
    samples.forEach(r => {
      if (isNaN(r.od)) return;
      const rx = fit ? fit.invert(r.od) : 0;
      const cx = xS(Math.max(0, Math.min(rx, maxX))), cy = yS(Math.max(0, Math.min(r.od, maxY))), z = 4.5;
      s += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${MT + PH}" stroke="${cSmp}" stroke-width="1" stroke-opacity="0.3" stroke-dasharray="2 2"/>`;
      s += `<polygon points="${cx},${cy - z} ${cx + z},${cy} ${cx},${cy + z} ${cx - z},${cy}" fill="${cSmp}" stroke="#fff" stroke-width="1.2"/>`;
    });
    // standard points
    std.forEach(p => s += `<circle cx="${xS(p.x)}" cy="${yS(p.y)}" r="4.5" fill="${cStd}" stroke="#fff" stroke-width="1.3"/>`);

    // axes
    s += `<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + PH}" stroke="var(--border)" stroke-width="1.2"/>`;
    s += `<line x1="${ML}" y1="${MT + PH}" x2="${ML + PW}" y2="${MT + PH}" stroke="var(--border)" stroke-width="1.2"/>`;
    xT.forEach(t => s += `<text x="${xS(t)}" y="${MT + PH + 14}" text-anchor="middle" font-size="9.5" fill="var(--text-muted)">${fmtTk(t)}</text>`);
    yT.forEach(t => s += `<text x="${ML - 7}" y="${yS(t) + 3}" text-anchor="end" font-size="9.5" fill="var(--text-muted)">${t.toFixed(2)}</text>`);
    s += `<text x="${ML + PW / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-secondary)" font-weight="600">Concentration (${unit})</text>`;
    s += `<text x="13" y="${MT + PH / 2}" text-anchor="middle" font-size="10" fill="var(--text-secondary)" font-weight="600" transform="rotate(-90,13,${MT + PH / 2})">OD 562 nm</text>`;

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = s;
  }

  function fmtTk(v) { return v === 0 ? '0' : v >= 1000 ? (v / 1000) + 'k' : v % 1 === 0 ? String(v) : v.toFixed(1); }

  root.BCAChart = { draw };
})(window);
