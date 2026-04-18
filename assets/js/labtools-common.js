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
