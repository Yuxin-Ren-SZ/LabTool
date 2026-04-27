'use strict';

(function () {
  var KEY        = 'labtools:theme:v1';
  var GITHUB_URL = 'https://github.com/yuxin-ren-sz/LabTool';

  /* ── Storage helpers ────────────────────────────────────────────
   * localStorage is the primary store (works for HTTP/HTTPS and
   * Chrome's file:// which treats all file:// as one origin).
   *
   * Firefox isolates localStorage per-file on file:// — writing
   * succeeds silently but the value is invisible from other pages.
   * window.name survives same-tab navigation across any origin, so
   * we use it as a supplementary channel when on file://.
   * ────────────────────────────────────────────────────────────── */

  function isFile() { return location.protocol === 'file:'; }

  function persist(theme) {
    try { localStorage.setItem(KEY, theme); } catch (_) {}
    if (isFile()) {
      try { window.name = JSON.stringify({ t: theme }); } catch (_) {}
    }
  }

  /* ── Core ───────────────────────────────────────────────────── */

  function enableDarkmode() {
    document.documentElement.setAttribute('data-theme', 'dark');
    persist('dark');
    updateButton(true);
  }

  function disableDarkmode() {
    document.documentElement.setAttribute('data-theme', 'light');
    persist('light');
    updateButton(false);
  }

  function toggleTheme() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    isDark ? disableDarkmode() : enableDarkmode();
  }

  /* ── Button state ───────────────────────────────────────────── */

  function updateButton(isDark) {
    var btn = document.getElementById('lt-theme-toggle');
    if (!btn) return;
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.setAttribute('aria-label',   isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('title',        isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('aria-pressed', String(isDark));
  }

  /* ── Nav injection ──────────────────────────────────────────── */

  function injectNavExtras() {
    var nav = document.querySelector('.lt-nav');
    if (!nav) return;

    if (!document.getElementById('lt-nav-spacer')) {
      var spacer = document.createElement('span');
      spacer.id = 'lt-nav-spacer';
      spacer.style.flex = '1';
      nav.appendChild(spacer);
    }

    if (!document.getElementById('lt-github-link')) {
      var gh = document.createElement('a');
      gh.id = 'lt-github-link';
      gh.className = 'lt-nav-icon';
      gh.href = GITHUB_URL;
      gh.target = '_blank';
      gh.rel = 'noopener';
      gh.setAttribute('aria-label', 'View on GitHub');
      gh.innerHTML = '<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
      nav.appendChild(gh);
    }

    if (!document.getElementById('lt-theme-toggle')) {
      var btn = document.createElement('button');
      btn.id = 'lt-theme-toggle';
      btn.className = 'lt-theme-toggle';
      btn.type = 'button';
      btn.addEventListener('click', toggleTheme);
      nav.appendChild(btn);
    }
  }

  function initDom() {
    injectNavExtras();
    updateButton(document.documentElement.getAttribute('data-theme') === 'dark');
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function withThemeParam(href) {
    try {
      var u = new URL(href, location.href);
      if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'file:') {
        u.searchParams.set('theme', currentTheme());
      }
      return u.href;
    } catch (_) {
      return href;
    }
  }

  function patchLinkClicks() {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!a) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download')) return;
      if (!a.getAttribute('href')) return;

      var href = a.getAttribute('href');
      // Ignore pure hashes and external links
      if (href[0] === '#') return;

      var next = withThemeParam(href);
      if (next && next !== href) {
        a.href = next;
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDom);
  } else {
    initDom();
  }

  patchLinkClicks();

  /* ── Cross-tab sync (localStorage storage event) ────────────── */
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    if (e.newValue === 'dark') enableDarkmode();
    else if (e.newValue === 'light') disableDarkmode();
  });

  /* ── Live OS theme change (only when no saved override) ─────── */
  var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function (e) {
      var stored;
      try { stored = localStorage.getItem(KEY); } catch (_) {}
      if (stored) return;
      if (isFile()) { try { if (JSON.parse(window.name || '{}').t) return; } catch (_) {} }
      if (e.matches) enableDarkmode();
      else disableDarkmode();
    });
  }
})();
