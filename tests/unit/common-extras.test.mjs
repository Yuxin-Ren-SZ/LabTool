/**
 * Unit tests for the shared-utility extras appended to labtools-common.js:
 *   labtoolsEscapeHtml   — HTML escaping (& < > " ')
 *   labtoolsDecodeBuffer — BOM-aware text decoding (UTF-8 / UTF-16LE / UTF-16BE)
 *   labtoolsFitLinear / labtoolsFitQuadratic — least-squares fits ported from
 *     tools/bca-assay (linearRegression / quadraticFit / det3 / solve3)
 * plus the __labtoolsLoadOrder marker, and a guard that pre-existing helpers
 * are still exposed as functions.
 *
 * The file is loaded with loadBrowserJs (vm context). Standard ES intrinsics
 * (ArrayBuffer, Uint8Array) resolve inside the context, but Node's TextDecoder
 * global does not, so it is injected onto the returned sandbox after loading —
 * the decode helper only reads it at call time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserJs } from './helpers.mjs';

const ctx = loadBrowserJs('assets/js/labtools-common.js');

// vm contexts resolve standard ES built-ins but not Node's TextDecoder global.
ctx.TextDecoder = TextDecoder;

/** Build an ArrayBuffer from a byte array. */
function bytes(values) {
  return new Uint8Array(values).buffer;
}

const utf8 = (s) => new TextEncoder().encode(s);

// ─── labtoolsEscapeHtml ─────────────────────────────────────────────────────

test('labtoolsEscapeHtml: escapes all five special characters', () => {
  assert.equal(
    ctx.labtoolsEscapeHtml('<a href="x" onclick=\'y\'>&</a>'),
    '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
  );
});

test('labtoolsEscapeHtml: plain text is unchanged', () => {
  assert.equal(ctx.labtoolsEscapeHtml('plain text 123'), 'plain text 123');
  assert.equal(ctx.labtoolsEscapeHtml(''), '');
  // non-string input is stringified, matching workbench escapeHtml(String(s))
  assert.equal(ctx.labtoolsEscapeHtml(42), '42');
});

test('labtoolsEscapeHtml: double escaping is safe (& escaped first)', () => {
  const once = ctx.labtoolsEscapeHtml('a & b');
  assert.equal(once, 'a &amp; b');
  // re-escaping the output must not leave a raw & behind — the & of &amp;
  // itself is escaped, so no unescaped special character can appear.
  assert.equal(ctx.labtoolsEscapeHtml(once), 'a &amp;amp; b');
  assert.ok(!/[&<>"']/.test(ctx.labtoolsEscapeHtml(once).replace(/&(amp|lt|gt|quot|#39);/g, 'X')));
});

// ─── labtoolsDecodeBuffer ───────────────────────────────────────────────────

test('labtoolsDecodeBuffer: pure ASCII without BOM decodes unchanged', () => {
  assert.equal(ctx.labtoolsDecodeBuffer(bytes([0x68, 0x69, 0x21])), 'hi!');
  assert.equal(ctx.labtoolsDecodeBuffer(bytes([])), '');
});

test('labtoolsDecodeBuffer: UTF-8 BOM (EF BB BF) is stripped', () => {
  const buf = bytes([0xEF, 0xBB, 0xBF, ...utf8('中文 text')]);
  assert.equal(ctx.labtoolsDecodeBuffer(buf), '中文 text');
});

test('labtoolsDecodeBuffer: UTF-16LE BOM (FF FE) decodes Chinese text', () => {
  // '中文!' in UTF-16LE: 2D 4E 87 65 21 00, prefixed with FF FE
  const buf = bytes([0xFF, 0xFE, 0x2D, 0x4E, 0x87, 0x65, 0x21, 0x00]);
  assert.equal(ctx.labtoolsDecodeBuffer(buf), '中文!');
});

test('labtoolsDecodeBuffer: UTF-16BE BOM (FE FF) decodes Chinese text', () => {
  // '中文!' in UTF-16BE: 4E 2D 65 87 00 21, prefixed with FE FF
  const buf = bytes([0xFE, 0xFF, 0x4E, 0x2D, 0x65, 0x87, 0x00, 0x21]);
  assert.equal(ctx.labtoolsDecodeBuffer(buf), '中文!');
});

test('labtoolsDecodeBuffer: BOM-less UTF-16LE (NUL bytes) uses the fallback path', () => {
  // ASCII pairs char + 0x00 read as UTF-8 give 'h\0e\0l\0l\0o\0' — the NUL
  // triggers the UTF-16LE retry, which decodes the original 'hello'.
  const buf = bytes([0x68, 0x00, 0x65, 0x00, 0x6C, 0x00, 0x6C, 0x00, 0x6F, 0x00]);
  assert.equal(ctx.labtoolsDecodeBuffer(buf), 'hello');
});

// ─── labtoolsFitLinear ──────────────────────────────────────────────────────

test('labtoolsFitLinear: exact line y = 2x + 1', () => {
  const fit = ctx.labtoolsFitLinear([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }]);
  assert.ok(fit);
  assert.equal(fit.slope, 2);
  assert.equal(fit.intercept, 1);
  assert.equal(fit.r2, 1);
});

test('labtoolsFitLinear: noisy data gives r2 strictly between 0 and 1', () => {
  const fit = ctx.labtoolsFitLinear([
    { x: 0, y: 1.2 }, { x: 1, y: 2.9 }, { x: 2, y: 4.8 }, { x: 3, y: 7.3 },
  ]);
  assert.ok(fit);
  assert.ok(fit.r2 > 0 && fit.r2 < 1, `r2 in (0,1), got ${fit.r2}`);
});

test('labtoolsFitLinear: fewer than 2 points → null', () => {
  assert.equal(ctx.labtoolsFitLinear([{ x: 1, y: 2 }]), null);
  assert.equal(ctx.labtoolsFitLinear([]), null);
});

test('labtoolsFitLinear: identical x (den === 0) → null', () => {
  assert.equal(ctx.labtoolsFitLinear([{ x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 4 }]), null);
});

// ─── labtoolsFitQuadratic ───────────────────────────────────────────────────

test('labtoolsFitQuadratic: y = x² over five points', () => {
  const fit = ctx.labtoolsFitQuadratic([-2, -1, 0, 1, 2].map((x) => ({ x, y: x * x })));
  assert.ok(fit);
  assert.ok(Math.abs(fit.a - 1) < 1e-9, `a ≈ 1, got ${fit.a}`);
  assert.ok(Math.abs(fit.b) < 1e-9, `b ≈ 0, got ${fit.b}`);
  assert.ok(Math.abs(fit.c) < 1e-9, `c ≈ 0, got ${fit.c}`);
  assert.ok(Math.abs(fit.r2 - 1) < 1e-9, `r2 ≈ 1, got ${fit.r2}`);
});

test('labtoolsFitQuadratic: noisy data gives r2 strictly between 0 and 1', () => {
  // Deterministic non-quadratic jitter so a parabola cannot fit perfectly.
  const jitter = [0.03, -0.02, 0.04, -0.01, 0.02];
  const fit = ctx.labtoolsFitQuadratic(
    [-2, -1, 0, 1, 2].map((x, i) => ({ x, y: x * x + 0.1 * x + 0.05 + jitter[i] })),
  );
  assert.ok(fit);
  assert.ok(fit.r2 > 0 && fit.r2 < 1, `r2 in (0,1), got ${fit.r2}`);
});

test('labtoolsFitQuadratic: fewer than 3 points → null', () => {
  assert.equal(ctx.labtoolsFitQuadratic([{ x: 0, y: 0 }, { x: 1, y: 1 }]), null);
  assert.equal(ctx.labtoolsFitQuadratic([]), null);
});

test('labtoolsFitQuadratic: singular system (all x equal) → null', () => {
  assert.equal(ctx.labtoolsFitQuadratic([
    { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 1, y: 4 }, { x: 1, y: 5 },
  ]), null);
});

// ─── Regression guards ──────────────────────────────────────────────────────

test('pre-existing helpers are unaffected; new helpers are exposed', () => {
  for (const name of [
    'labtoolsDownloadBlob', 'labtoolsDownloadText', 'labtoolsReadFileAsArrayBuffer',
    'labtoolsCopyText', 'labtoolsSafeJsonParse', 'labtoolsHandoffTo',
    'labtoolsConsumeHandoff',
  ]) {
    assert.equal(typeof ctx[name], 'function', `${name} should remain a function`);
  }
  for (const name of ['labtoolsEscapeHtml', 'labtoolsDecodeBuffer', 'labtoolsFitLinear', 'labtoolsFitQuadratic']) {
    assert.equal(typeof ctx[name], 'function', `${name} should be a function`);
  }
});

test('load-order marker records labtools-common', () => {
  // The array is created by the vm context's own Array, so compare element-wise
  // (deepStrictEqual would fail on the cross-realm prototype).
  assert.deepEqual([...ctx.window.__labtoolsLoadOrder], ['labtools-common']);
});
