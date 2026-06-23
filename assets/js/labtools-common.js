'use strict';

/**
 * Trigger a browser download for an arbitrary Blob.
 *
 * @param {string} filename
 * @param {Blob} blob
 */
function labtoolsDownloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Trigger a browser download for plain text content.
 *
 * @param {string} filename
 * @param {string} content
 * @param {string} [mimeType]
 */
function labtoolsDownloadText(filename, content, mimeType) {
  const blob = new Blob([content], {
    type: mimeType || 'text/plain;charset=utf-8',
  });
  labtoolsDownloadBlob(filename, blob);
}

/**
 * Read a File object as ArrayBuffer.
 *
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
function labtoolsReadFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Copy text to the clipboard with a legacy fallback for non-secure contexts.
 *
 * @param {string} text
 * @returns {Promise<void>}
 */
function labtoolsCopyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'readonly');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('Copy command was rejected.');
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Parse JSON safely and fall back when parsing fails.
 *
 * @param {string|null} raw
 * @param {*} fallback
 * @returns {*}
 */
function labtoolsSafeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

// ── Session model ─────────────────────────────────────────────────
// Storage keys
const _LT_SESSIONS_KEY = 'lt-sessions';
const _LT_ACTIVE_KEY   = 'lt-active';

function labtoolsSessionList() {
  return labtoolsSafeJsonParse(localStorage.getItem(_LT_SESSIONS_KEY), []);
}

function labtoolsSessionGet(id) {
  return labtoolsSessionList().find(function(s) { return s.id === id; }) || null;
}

function labtoolsSessionActive() {
  var id = localStorage.getItem(_LT_ACTIVE_KEY) || '';
  return id ? labtoolsSessionGet(id) : null;
}

function labtoolsSessionCreate(name) {
  var sessions = labtoolsSessionList();
  var session  = {
    id:      's_' + Date.now(),
    name:    (name || 'Session').slice(0, 32),
    created: Date.now(),
    scratch: {}
  };
  sessions.push(session);
  localStorage.setItem(_LT_SESSIONS_KEY, JSON.stringify(sessions));
  localStorage.setItem(_LT_ACTIVE_KEY, session.id);
  return session;
}

function labtoolsSessionSetActive(id) {
  localStorage.setItem(_LT_ACTIVE_KEY, id);
}

function labtoolsSessionScratchWrite(id, key, value) {
  var sessions = labtoolsSessionList();
  var s = sessions.find(function(s) { return s.id === id; });
  if (!s) return;
  s.scratch[key] = value;
  localStorage.setItem(_LT_SESSIONS_KEY, JSON.stringify(sessions));
}

function labtoolsSessionScratchRead(id, key, fallback) {
  var s = labtoolsSessionGet(id);
  if (s && Object.prototype.hasOwnProperty.call(s.scratch, key)) return s.scratch[key];
  return fallback !== undefined ? fallback : null;
}

function labtoolsSessionDelete(id) {
  var sessions = labtoolsSessionList().filter(function(s) { return s.id !== id; });
  localStorage.setItem(_LT_SESSIONS_KEY, JSON.stringify(sessions));
  var active = localStorage.getItem(_LT_ACTIVE_KEY);
  if (active === id) {
    localStorage.setItem(_LT_ACTIVE_KEY, sessions.length ? sessions[sessions.length - 1].id : '');
  }
}

// ── Session nav pill (DOM) ────────────────────────────────────────
function ltSessionPillRender() {
  var pill    = document.getElementById('session-pill');
  var nameEl  = document.getElementById('session-pill-name');
  var popover = document.getElementById('session-popover');
  if (!pill) return;

  var active   = labtoolsSessionActive();
  var sessions = labtoolsSessionList();

  nameEl.textContent = active ? active.name : 'No session';

  var html = '';
  sessions.forEach(function(s) {
    var isActive = active && s.id === active.id;
    html += '<div class="lt-session-popover__item' +
      (isActive ? ' lt-session-popover__item--active' : '') +
      '" onclick="ltSessionSwitchTo(\'' + s.id + '\')">' +
      (isActive ? '✓ ' : '') + _ltEscHtml(s.name) + '</div>';
  });
  html += '<div class="lt-session-popover__divider"></div>';
  html += '<div class="lt-session-popover__action" onclick="ltSessionNew()">＋ New session…</div>';
  if (active) {
    html += '<div class="lt-session-popover__action" onclick="ltSessionClear()">↺ Clear scratch data</div>';
    html += '<div class="lt-session-popover__action" onclick="ltSessionRemove(\'' + active.id + '\')">✕ Delete session</div>';
  }
  popover.innerHTML = html;
}

function ltSessionPillToggle() {
  var popover = document.getElementById('session-popover');
  if (!popover) return;
  popover.hidden = !popover.hidden;
}

function ltSessionNew() {
  var name = prompt('Session name (e.g. "HEK293 passage 4"):', '');
  if (name === null) return;
  labtoolsSessionCreate(name.trim() || 'Session');
  ltSessionPillRender();
  var popover = document.getElementById('session-popover');
  if (popover) popover.hidden = true;
}

function ltSessionSwitchTo(id) {
  labtoolsSessionSetActive(id);
  var url = new URL(location.href);
  url.searchParams.set('s', id);
  location.href = url.toString();
}

function ltSessionClear() {
  var active = labtoolsSessionActive();
  if (!active) return;
  var sessions = labtoolsSessionList().map(function(s) {
    if (s.id === active.id) s.scratch = {};
    return s;
  });
  localStorage.setItem(_LT_SESSIONS_KEY, JSON.stringify(sessions));
  ltSessionPillRender();
  var popover = document.getElementById('session-popover');
  if (popover) popover.hidden = true;
}

function ltSessionRemove(id) {
  if (!confirm('Delete this session?')) return;
  labtoolsSessionDelete(id);
  var url = new URL(location.href);
  url.searchParams.delete('s');
  location.href = url.toString();
}

function _ltEscHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Close popover when clicking outside
document.addEventListener('click', function(e) {
  var wrap = document.querySelector('.lt-session-pill-wrap');
  if (wrap && !wrap.contains(e.target)) {
    var pop = document.getElementById('session-popover');
    if (pop) pop.hidden = true;
  }
});
