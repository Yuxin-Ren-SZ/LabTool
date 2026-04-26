'use strict';

/**
 * LabTools — navigation extras and shared theme state.
 *
 * Load this script in <head> before the stylesheet. It applies the theme
 * immediately, then injects nav controls after the document is ready.
 */
(function () {
  var KEY = 'labtools:theme:v1';
  var THEME_PARAM = 'theme';
  var DARK = 'dark';
  var LIGHT = 'light';
  var GITHUB_URL = 'https://github.com/yuxin-ren-sz/LabTool';

  var MOON = '🌙';
  var SUN = '☀️';

  function validTheme(value) {
    return value === DARK || value === LIGHT ? value : null;
  }

  function getStored() {
    try { return validTheme(window.localStorage.getItem(KEY)); } catch (_) { return null; }
  }

  function setStored(theme) {
    try { window.localStorage.setItem(KEY, theme); } catch (_) {}
  }

  function getUrlTheme() {
    try {
      return validTheme(new URL(window.location.href).searchParams.get(THEME_PARAM));
    } catch (_) {
      return null;
    }
  }

  function systemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return DARK;
    }
    return LIGHT;
  }

  function resolveTheme() {
    return getUrlTheme() || getStored() || systemTheme();
  }

  function currentTheme() {
    return validTheme(document.documentElement.getAttribute('data-theme')) || LIGHT;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function updateButton(theme) {
    var btn = document.getElementById('lt-theme-toggle');
    var isDark = theme === DARK;
    if (!btn) return;
    btn.textContent = isDark ? SUN : MOON;
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  }

  function syncCurrentUrl(theme) {
    if (!window.history || !window.history.replaceState) return;
    try {
      var url = new URL(window.location.href);
      url.searchParams.set(THEME_PARAM, theme);
      window.history.replaceState(window.history.state, '', url.href);
    } catch (_) {}
  }

  function isPageHref(url) {
    var path = url.pathname;
    return path === '' || path.endsWith('/') || path.endsWith('.html');
  }

  function isSameSiteUrl(url) {
    if (window.location.protocol === 'file:') return url.protocol === 'file:';
    return url.origin === window.location.origin;
  }

  function shouldDecorateLink(anchor) {
    var raw = anchor.getAttribute('href');
    var url;

    if (!raw) return false;
    raw = raw.trim();
    if (
      raw === '' ||
      raw.charAt(0) === '#' ||
      /^(?:blob|data|javascript|mailto|tel):/i.test(raw) ||
      anchor.hasAttribute('download')
    ) {
      return false;
    }

    try {
      url = new URL(raw, window.location.href);
    } catch (_) {
      return false;
    }

    if (!isSameSiteUrl(url)) return false;
    if (!isPageHref(url)) return false;
    return true;
  }

  function decorateLinks(theme) {
    var links = document.querySelectorAll('a[href]');
    links.forEach(function (anchor) {
      if (!shouldDecorateLink(anchor)) return;

      try {
        var url = new URL(anchor.getAttribute('href'), window.location.href);
        url.searchParams.set(THEME_PARAM, theme);
        anchor.href = url.href;
      } catch (_) {}
    });
  }

  function setTheme(theme, options) {
    var opts = options || {};
    var next = validTheme(theme) || LIGHT;

    applyTheme(next);
    if (opts.persist !== false) setStored(next);
    if (opts.syncUrl) syncCurrentUrl(next);
    updateButton(next);
    decorateLinks(next);
  }

  function toggleTheme() {
    setTheme(currentTheme() === DARK ? LIGHT : DARK, { syncUrl: true });
  }

  function injectNavExtras() {
    var nav = document.querySelector('.lt-nav');
    var spacer;
    var gh;
    var btn;

    if (!nav) return;

    if (!document.getElementById('lt-nav-spacer')) {
      spacer = document.createElement('span');
      spacer.id = 'lt-nav-spacer';
      spacer.style.flex = '1';
      nav.appendChild(spacer);
    }

    if (!document.getElementById('lt-github-link')) {
      gh = document.createElement('a');
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
      btn = document.createElement('button');
      btn.id = 'lt-theme-toggle';
      btn.className = 'lt-theme-toggle';
      btn.type = 'button';
      btn.addEventListener('click', toggleTheme);
      nav.appendChild(btn);
    }
  }

  function initDom() {
    injectNavExtras();
    updateButton(currentTheme());
    decorateLinks(currentTheme());
  }

  setTheme(resolveTheme(), { persist: !!getUrlTheme() });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDom);
  } else {
    initDom();
  }

  window.addEventListener('storage', function (event) {
    var theme = validTheme(event.newValue);
    if (event.key !== KEY || !theme) return;
    setTheme(theme, { persist: false, syncUrl: true });
  });
})();
