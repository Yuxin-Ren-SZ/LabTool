/*
 * labtools-glyphs.js — Custom lab glyph set (design spec A4)
 *
 * Usage:
 *   <script src="../../assets/js/labtools-glyphs.js"></script>
 *   someElement.appendChild(labGlyph('count'));
 *   someElement.innerHTML = labGlyphHTML('seed');
 *
 * All glyphs: 24×24 viewBox, 1.6 px stroke, currentColor, round joins.
 */

const _LT_GLYPHS = {
  count: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 8h16M4 12h16M4 16h16M8 4v16M12 4v16M16 4v16"/>',
  seed:  '<path d="M12 3v6M9 3h6M8 9h8l-3 6v6h-2v-6z"/>',
  plate: '<circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 1h6"/>',
  label: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M7 9v6M9 9v6M11 9v6M14 9v6M17 9v6"/>',
  sheet: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M7 9v6M11 9v6M14 9v6"/>',
  dose:  '<path d="M7 3v6l-3 8a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-3-8V3"/><path d="M6 3h12"/>',
};

/**
 * Return an <svg> DOM element for the named glyph.
 * @param {string} name  One of: count, seed, plate, timer, label, sheet, dose
 * @param {number} [size=20]  Width/height in px
 * @returns {SVGSVGElement}
 */
function labGlyph(name, size) {
  const sz = size || 20;
  const inner = _LT_GLYPHS[name] || _LT_GLYPHS['count'];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', sz);
  svg.setAttribute('height', sz);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = inner;
  return svg;
}

/**
 * Return the outer HTML string of the glyph SVG — for use in innerHTML.
 * @param {string} name
 * @param {number} [size=20]
 * @returns {string}
 */
function labGlyphHTML(name, size) {
  return labGlyph(name, size).outerHTML;
}
