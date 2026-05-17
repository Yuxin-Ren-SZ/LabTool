'use strict';

const POINTS_PER_INCH = 72;
const CUSTOM_LASER_ID = '__custom_laser__';
const CUSTOM_THERMAL_ID = '__custom_thermal__';
const TEMPLATE_STORAGE_KEY = 'labtools.labelGenerator.template.v1';
const THERMAL_TO_LASER_USER_PRESETS_KEY = 'labtools:thermal-to-laser:user-presets:v1';
const CSV_HEADER_AUTO = 'auto';
const CSV_HEADER_YES = 'yes';
const CSV_HEADER_NO = 'no';

// ─── Inline SVG icon strings ───────────────────────────────────
const SVG_ATTR = 'width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const Icons = {
  Sheet:    '<svg ' + SVG_ATTR + '><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
  Thermal:  '<svg ' + SVG_ATTR + '><rect x="5" y="6" width="14" height="12" rx="2"/><path d="M3 10v4M21 10v4M9 12h6"/></svg>',
  Upload:   '<svg ' + SVG_ATTR + '><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>',
  File:     '<svg ' + SVG_ATTR + '><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  Trash:    '<svg ' + SVG_ATTR + '><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  Save:     '<svg ' + SVG_ATTR + '><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  Database: '<svg ' + SVG_ATTR + '><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>',
  Type:     '<svg ' + SVG_ATTR + '><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
  Grid:     '<svg ' + SVG_ATTR + '><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  Eye:      '<svg ' + SVG_ATTR + '><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  Download: '<svg ' + SVG_ATTR + '><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  X:        '<svg ' + SVG_ATTR + '><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
};

// DataMatrix 12×12 decorative pattern (border + checkerboard)
const DM_PATTERN = (function () {
  var cells = '';
  for (var r = 0; r < 12; r++) {
    for (var c = 0; c < 12; c++) {
      var on = r === 0 || c === 0 || (r === 11 && c % 2 === 0) || (c === 11 && r % 2 !== 0) || (r > 0 && c > 0 && r < 11 && c < 11 && (r + c) % 4 === 0);
      cells += '<span style="opacity:' + (on ? '1' : '0') + '"></span>';
    }
  }
  return '<div class="lg-dm-preview" style="color:#1a1a1a;">' + cells + '</div>';
}());

// ─── State ────────────────────────────────────────────────────
const state = {
  csvText: '',
  csvRows: [],
  csvHeaders: [],
  csvDelimiter: ',',
  csvFirstRowHeader: true,
  csvHeaderMode: CSV_HEADER_AUTO,
  fileName: '',
  presets: [],
  laserPresets: [],
  thermalPresets: [],
  outputMode: 'laser-sheet',
  selectedLaserPresetId: 'labtools-9187-1258',
  selectedThermalPresetId: 'thermal-cryo-128x05',
  customLaserPreset: {
    id: CUSTOM_LASER_ID, name: 'Custom laser sheet', mode: 'laser-sheet',
    pageWidth: 8.5, pageHeight: 11, topMargin: 0.5, leftMargin: 0.1875,
    horizontalPitch: 2.75, verticalPitch: 1,
    labelWidth: 2.625, labelHeight: 1, columns: 3, rows: 10,
  },
  customThermalPreset: {
    id: CUSTOM_THERMAL_ID, name: 'Custom thermal label', mode: 'thermal',
    labelWidth: 1.28, labelHeight: 0.5, pageWidth: 1.28, pageHeight: 0.5,
    topMargin: 0, leftMargin: 0, horizontalPitch: 1.28, verticalPitch: 0.5,
    columns: 1, rows: 1,
  },
  template: { grid: { cols: 8, rows: 3 }, fields: [] },
  selectedFieldId: '',
  plan: [],
  startCell: 0,
  placementMode: 'start',
  showBorder: true,
  outputBytes: null,
  outputUrl: '',
  outputDirty: true,
  isGenerating: false,
  barcodeIssues: [],
};

let barcodeCanvas = null;
let dragState = null;

document.addEventListener('DOMContentLoaded', init);

// ─── Init ─────────────────────────────────────────────────────
function init() {
  state.presets = sanitizePresetList((window.LABEL_GENERATOR_PRESET_CONFIG && window.LABEL_GENERATOR_PRESET_CONFIG.presets) || []);
  state.laserPresets = buildSharedLaserPresets();
  state.thermalPresets = state.presets.filter(function (p) { return p.mode === 'thermal'; });
  if (!findLaserPreset(state.selectedLaserPresetId) && state.laserPresets[0]) state.selectedLaserPresetId = state.laserPresets[0].id;
  if (!findLaserPreset(state.selectedLaserPresetId) && !state.laserPresets[0]) state.selectedLaserPresetId = CUSTOM_LASER_ID;
  if (!findThermalPreset(state.selectedThermalPresetId) && state.thermalPresets[0]) state.selectedThermalPresetId = state.thermalPresets[0].id;
  initializeDefaultTemplate();
  recomputeGrid(false);
  initPlan();
  bindEvents();
  renderAll();
}

// ─── Events ───────────────────────────────────────────────────
function bindEvents() {
  // Nav
  document.getElementById('save-template-btn').addEventListener('click', saveTemplateToStorage);

  // CSV file input
  document.getElementById('csv-upload-btn') && document.getElementById('csv-upload-btn').addEventListener('click', function () {
    document.getElementById('csv-file-input').click();
  });
  document.getElementById('csv-file-input').addEventListener('change', onCsvFileUpload);

  // CSV drop zone (delegated — element is rendered by renderCsvSection)
  document.getElementById('csv-section').addEventListener('click', function (e) {
    var dropZone = e.target.closest('#csv-drop-zone');
    if (dropZone) document.getElementById('csv-file-input').click();
    var replaceBtn = e.target.closest('#replace-csv-btn');
    if (replaceBtn) document.getElementById('csv-file-input').click();
    var clearBtn = e.target.closest('#clear-csv-btn');
    if (clearBtn) { state.csvText = ''; state.fileName = ''; state.csvRows = []; state.csvHeaders = []; document.getElementById('csv-textarea').value = ''; initPlan(); markOutputDirty(); renderAll(); }
  });
  document.getElementById('csv-section').addEventListener('dragover', function (e) {
    var dz = e.target.closest('#csv-drop-zone');
    if (dz) { e.preventDefault(); dz.classList.add('drag-over'); }
  });
  document.getElementById('csv-section').addEventListener('dragleave', function (e) {
    var dz = e.target.closest('#csv-drop-zone');
    if (dz) dz.classList.remove('drag-over');
  });
  document.getElementById('csv-section').addEventListener('drop', function (e) {
    var dz = e.target.closest('#csv-drop-zone');
    if (!dz) return;
    e.preventDefault(); dz.classList.remove('drag-over');
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    readCsvFile(file);
  });

  // CSV textarea / parse options
  document.getElementById('csv-textarea').addEventListener('input', onCsvTextInput);
  document.getElementById('delimiter-select').addEventListener('change', onDelimiterChange);
  document.getElementById('first-row-header').addEventListener('change', onFirstRowHeaderChange);

  // Mode buttons
  document.getElementById('laser-mode-btn').addEventListener('click', function () { setOutputMode('laser-sheet'); });
  document.getElementById('thermal-mode-btn').addEventListener('click', function () { setOutputMode('thermal'); });

  // Preset select
  document.getElementById('unified-preset-select').addEventListener('change', onUnifiedPresetChange);

  // Show border
  document.getElementById('show-border').addEventListener('change', function (e) {
    state.showBorder = e.target.checked;
    markOutputDirty();
    renderAll();
  });

  // Custom preset form inputs — laser
  function bindCustomNum(id, setter) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function () {
      var v = parseFloat(this.value);
      if (!isNaN(v) && v > 0) { setter(v); recomputeGrid(true); resetPlan(); markOutputDirty(); renderAll(); }
    });
  }
  bindCustomNum('cp-label-w',    function (v) { state.customLaserPreset.labelWidth      = v; });
  bindCustomNum('cp-label-h',    function (v) { state.customLaserPreset.labelHeight     = v; });
  bindCustomNum('cp-page-w',     function (v) { state.customLaserPreset.pageWidth       = v; });
  bindCustomNum('cp-page-h',     function (v) { state.customLaserPreset.pageHeight      = v; });
  bindCustomNum('cp-cols',       function (v) { state.customLaserPreset.columns         = Math.max(1, Math.round(v)); });
  bindCustomNum('cp-rows',       function (v) { state.customLaserPreset.rows            = Math.max(1, Math.round(v)); });
  bindCustomNum('cp-top-margin', function (v) { state.customLaserPreset.topMargin       = v; });
  bindCustomNum('cp-left-margin',function (v) { state.customLaserPreset.leftMargin      = v; });
  bindCustomNum('cp-h-pitch',    function (v) { state.customLaserPreset.horizontalPitch = v; });
  bindCustomNum('cp-v-pitch',    function (v) { state.customLaserPreset.verticalPitch   = v; });
  // Custom preset form inputs — thermal
  bindCustomNum('cp-t-label-w',  function (v) { state.customThermalPreset.labelWidth    = v; state.customThermalPreset.pageWidth  = v; state.customThermalPreset.horizontalPitch = v; });
  bindCustomNum('cp-t-label-h',  function (v) { state.customThermalPreset.labelHeight   = v; state.customThermalPreset.pageHeight = v; state.customThermalPreset.verticalPitch   = v; });

  // Template actions
  document.getElementById('load-template-btn').addEventListener('click', loadTemplateFromStorage);
  document.getElementById('reset-template-btn').addEventListener('click', resetTemplate);

  // Add field cards
  document.getElementById('add-datamatrix-btn').addEventListener('click', function () { addField('datamatrix'); });
  document.getElementById('add-csv-btn').addEventListener('click', function () { addField('csvText'); });
  document.getElementById('add-static-btn').addEventListener('click', function () { addField('staticText'); });

  // Field list: delegation for select + remove
  document.getElementById('field-list').addEventListener('click', function (e) {
    var card = e.target.closest('[data-field-id]');
    var xBtn = e.target.closest('[data-remove-field]');
    if (xBtn) {
      e.stopPropagation();
      var id = xBtn.dataset.removeField;
      state.template.fields = state.template.fields.filter(function (f) { return f.id !== id; });
      if (state.selectedFieldId === id) state.selectedFieldId = state.template.fields[0] ? state.template.fields[0].id : '';
      markOutputDirty(); renderAll(); return;
    }
    if (card) { state.selectedFieldId = card.dataset.fieldId; renderAll(); }
  });

  // Properties panel
  document.getElementById('field-label-input').addEventListener('input', updateSelectedFieldFromEditor);
  document.getElementById('field-source-select').addEventListener('change', updateSelectedFieldFromEditor);
  document.getElementById('field-static-input').addEventListener('input', updateSelectedFieldFromEditor);
  document.getElementById('field-align-select').addEventListener('change', updateSelectedFieldFromEditor);
  document.getElementById('field-font-scale').addEventListener('input', updateSelectedFieldFromEditor);
  document.getElementById('remove-field-btn').addEventListener('click', removeSelectedField);

  // Canvas: click empty area to deselect
  document.getElementById('lg-stage-canvas').addEventListener('click', function (e) {
    if (!e.target.closest('[data-drag-field]')) { state.selectedFieldId = ''; renderAll(); }
  });

  // Sheet placement: delegated listener for mode buttons + cell clicks
  document.getElementById('placement-content').addEventListener('click', function (e) {
    var modeBtn = e.target.closest('[data-placement-mode]');
    if (modeBtn) { state.placementMode = modeBtn.dataset.placementMode; renderSheetPlacement(); return; }
    var cell = e.target.closest('[data-cell-index]');
    if (cell) onSheetCellClick(Number(cell.dataset.cellIndex));
  });

  // Window arrow keys for nudge
  window.addEventListener('keydown', onGlobalKeyDown);

  // Bottom bar
  document.getElementById('generate-btn').addEventListener('click', generatePdf);
  document.getElementById('download-btn').addEventListener('click', downloadPdf);

  // PDF modal close
  document.getElementById('pdf-modal-close').addEventListener('click', function () {
    document.getElementById('pdf-modal').classList.remove('open');
  });
  document.getElementById('pdf-modal').addEventListener('click', function (e) {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });
}

// ─── Preset helpers (verbatim) ────────────────────────────────
function sanitizePresetList(rawPresets) {
  return rawPresets.map(function (preset) {
    return {
      id: String(preset.id || ''),
      name: String(preset.name || preset.id || 'Preset'),
      mode: preset.mode === 'thermal' ? 'thermal' : 'laser-sheet',
      vendor: String(preset.vendor || ''),
      sku: String(preset.sku || ''),
      labelWidth: numberOrDefault(preset.labelWidth, 0),
      labelHeight: numberOrDefault(preset.labelHeight, 0),
      pageWidth: numberOrDefault(preset.pageWidth, preset.labelWidth || 0),
      pageHeight: numberOrDefault(preset.pageHeight, preset.labelHeight || 0),
      topMargin: numberOrDefault(preset.topMargin, 0),
      leftMargin: numberOrDefault(preset.leftMargin, 0),
      horizontalPitch: numberOrDefault(preset.horizontalPitch, preset.labelWidth || 0),
      verticalPitch: numberOrDefault(preset.verticalPitch, preset.labelHeight || 0),
      columns: Math.max(1, Math.round(numberOrDefault(preset.columns, 1))),
      rows: Math.max(1, Math.round(numberOrDefault(preset.rows, 1))),
      notes: String(preset.notes || ''),
    };
  }).filter(function (preset) {
    return preset.id && preset.labelWidth > 0 && preset.labelHeight > 0;
  });
}

function buildSharedLaserPresets() {
  var shipped = (window.THERMAL_TO_LASER_PRESET_CONFIG && window.THERMAL_TO_LASER_PRESET_CONFIG.presets) || [];
  var user = readThermalToLaserUserPresets();
  var seenIds = new Set();
  return shipped.map(function (preset, index) {
    return Object.assign({}, preset, { _origin: 'builtin', _sourceIndex: index });
  }).concat(user.map(function (preset, index) {
    return Object.assign({}, preset, { _origin: 'user', _sourceIndex: index });
  })).map(function (preset, index) {
    var normalized = normalizeSharedLaserPreset(preset, index);
    if (!normalized || seenIds.has(normalized.id)) return null;
    seenIds.add(normalized.id);
    return normalized;
  }).filter(Boolean);
}

function readThermalToLaserUserPresets() {
  try {
    if (!window.localStorage || !window.localStorage.getItem) return [];
    var stored = window.localStorage.getItem(THERMAL_TO_LASER_USER_PRESETS_KEY);
    if (!stored) return [];
    var parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) { return []; }
}

function normalizeSharedLaserPreset(preset, index) {
  if (!preset) return null;
  var rawId = String(preset.id || 'thermal-to-laser-preset-' + index);
  var normalized = {
    id: rawId, name: String(preset.name || rawId || 'Preset'),
    mode: 'laser-sheet', vendor: String(preset.vendor || ''), sku: String(preset.sku || ''),
    labelWidth: numberOrDefault(preset.labelWidth, 0), labelHeight: numberOrDefault(preset.labelHeight, 0),
    pageWidth: numberOrDefault(preset.pageWidth, 0), pageHeight: numberOrDefault(preset.pageHeight, 0),
    topMargin: numberOrDefault(preset.topMargin, 0),
    leftMargin: numberOrDefault(preset.leftMargin, numberOrDefault(preset.sideMargin, 0)),
    horizontalPitch: numberOrDefault(preset.horizontalPitch, 0),
    verticalPitch: numberOrDefault(preset.verticalPitch, 0),
    columns: Math.max(1, Math.round(numberOrDefault(preset.columns, 1))),
    rows: Math.max(1, Math.round(numberOrDefault(preset.rows, 1))),
    notes: String(preset.notes || ''), _origin: preset._origin === 'user' ? 'user' : 'builtin',
  };
  if (!normalized.id || normalized.labelWidth <= 0 || normalized.labelHeight <= 0) return null;
  if (normalized.pageWidth <= 0 || normalized.pageHeight <= 0) return null;
  if (normalized.horizontalPitch <= 0 || normalized.verticalPitch <= 0) return null;
  return normalized;
}

// ─── CSV parsing (verbatim) ───────────────────────────────────
function parseCSV(text, options) {
  options = options || {};
  if (!text || !text.trim()) {
    state.csvRows = []; state.csvHeaders = []; state.csvDelimiter = ','; state.csvFirstRowHeader = true;
    return;
  }
  var best;
  if (options.forceDelimiter) {
    var forcedRows = parseDelimitedRows(text, options.forceDelimiter).filter(function (row) {
      return row.some(function (cell) { return cell.trim() !== ''; });
    });
    best = { delimiter: options.forceDelimiter, rows: forcedRows };
  } else {
    var rowsByDelimiter = [',', '\t', ';'].map(function (delimiter) {
      var parsed = parseDelimitedRows(text, delimiter).filter(function (row) {
        return row.some(function (cell) { return cell.trim() !== ''; });
      });
      var width = parsed.length ? parsed[0].length : 0;
      var sameWidth = parsed.every(function (row) { return row.length === width; });
      return { delimiter: delimiter, rows: parsed, score: (sameWidth ? 1000 : 0) + width * 10 + parsed.length };
    }).sort(function (left, right) { return right.score - left.score; });
    best = rowsByDelimiter[0];
  }
  state.csvDelimiter = best.delimiter;
  if (!best.rows.length) { state.csvRows = []; state.csvHeaders = []; state.csvFirstRowHeader = true; return; }

  if (options.forceHeader !== undefined) {
    var useHeader = options.forceHeader && best.rows.length > 1;
    if (useHeader) {
      state.csvHeaders = best.rows[0].map(function (cell, index) { return cell.trim() || 'Column ' + (index + 1); });
      state.csvRows = best.rows.slice(1);
      state.csvFirstRowHeader = true;
    } else {
      var maxCols = best.rows.reduce(function (max, row) { return Math.max(max, row.length); }, 0);
      state.csvHeaders = Array.from({ length: maxCols }, function (_, index) { return 'Col ' + (index + 1); });
      state.csvRows = best.rows;
      state.csvFirstRowHeader = false;
    }
  } else {
    var firstRow = best.rows[0];
    var firstLooksLikeHeader = firstRow.every(function (cell) { return cell.trim() === '' || isNaN(Number(cell)); });
    if (firstLooksLikeHeader && best.rows.length > 1) {
      state.csvHeaders = firstRow.map(function (cell, index) { return cell.trim() || 'Column ' + (index + 1); });
      state.csvRows = best.rows.slice(1);
      state.csvFirstRowHeader = true;
    } else {
      var maxCols2 = best.rows.reduce(function (max, row) { return Math.max(max, row.length); }, 0);
      state.csvHeaders = Array.from({ length: maxCols2 }, function (_, index) { return 'Col ' + (index + 1); });
      state.csvRows = best.rows;
      state.csvFirstRowHeader = false;
    }
  }
  state.template.fields.forEach(function (field) {
    field.sourceColumn = clamp(field.sourceColumn, 0, Math.max(0, state.csvHeaders.length - 1));
  });
}

function parseDelimitedRows(text, delimiter) {
  var rows = [], row = [], cell = '', inQuotes = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i], next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { cell += '"'; i++; } else { inQuotes = !inQuotes; }
    } else if (ch === delimiter && !inQuotes) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else { cell += ch; }
  }
  row.push(cell); rows.push(row);
  return rows;
}

function onCsvTextInput() {
  state.csvText = document.getElementById('csv-textarea').value;
  state.fileName = '';
  parseCSV(state.csvText);
  var headerEl = document.getElementById('first-row-header');
  if (headerEl) headerEl.checked = state.csvFirstRowHeader;
  initPlan(); markOutputDirty(); renderAll();
}

function onDelimiterChange() {
  var delimEl = document.getElementById('delimiter-select');
  var headerEl = document.getElementById('first-row-header');
  var opts = { forceHeader: headerEl ? headerEl.checked : state.csvFirstRowHeader };
  if (delimEl.value !== 'auto') opts.forceDelimiter = delimEl.value;
  parseCSV(state.csvText, opts);
  initPlan(); markOutputDirty(); renderAll();
}

function onFirstRowHeaderChange() {
  var delimEl = document.getElementById('delimiter-select');
  var headerEl = document.getElementById('first-row-header');
  var opts = { forceHeader: headerEl.checked };
  if (delimEl && delimEl.value !== 'auto') opts.forceDelimiter = delimEl.value;
  parseCSV(state.csvText, opts);
  initPlan(); markOutputDirty(); renderAll();
}

function onCsvFileUpload(event) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;
  readCsvFile(file);
  event.target.value = '';
}

function readCsvFile(file) {
  state.fileName = file.name;
  var reader = new FileReader();
  reader.onload = function () {
    state.csvText = String(reader.result || '');
    document.getElementById('csv-textarea').value = state.csvText;
    parseCSV(state.csvText);
    var headerEl = document.getElementById('first-row-header');
    if (headerEl) headerEl.checked = state.csvFirstRowHeader;
    initPlan(); markOutputDirty(); renderAll();
  };
  reader.readAsText(file);
}

// ─── Template storage (verbatim, with setStatus adapted) ──────
function saveTemplateToStorage() {
  if (!hasLocalStorage()) return showExportStatus('Template storage not available.', 'warn');
  window.localStorage.setItem(TEMPLATE_STORAGE_KEY, serializeTemplate());
  showExportStatus('Template saved.', 'ok');
}

function loadTemplateFromStorage() {
  if (!hasLocalStorage()) return showExportStatus('Template storage not available.', 'warn');
  var stored = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
  if (!stored) return showExportStatus('No saved template found.', 'warn');
  if (!loadStoredTemplate(stored)) return showExportStatus('Could not load template.', 'err');
  markOutputDirty(); renderAll();
  showExportStatus('Template loaded.', 'ok');
}

function resetTemplate() {
  initializeDefaultTemplate(); recomputeGrid(false); markOutputDirty(); renderAll();
}

function serializeTemplate() {
  return JSON.stringify({
    version: 1, grid: state.template.grid,
    fields: state.template.fields.map(function (field) {
      return { type: field.type, label: field.label, sourceColumn: field.sourceColumn,
        staticText: field.staticText, colStart: field.colStart, rowStart: field.rowStart,
        colEnd: field.colEnd, rowEnd: field.rowEnd, align: field.align, fontScale: field.fontScale };
    }),
  });
}

function loadStoredTemplate(serialized) {
  var parsed;
  try { parsed = JSON.parse(serialized); } catch (err) { return false; }
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.fields)) return false;
  var fields = parsed.fields.map(sanitizeStoredField).filter(Boolean);
  if (!fields.length) return false;
  state.template.fields = fields;
  state.selectedFieldId = fields[0].id;
  recomputeGrid(false);
  return true;
}

function sanitizeStoredField(rawField) {
  var type = rawField && rawField.type;
  if (type !== 'datamatrix' && type !== 'csvText' && type !== 'staticText') return null;
  var field = {
    id: makeFieldId(), type: type,
    label: String(rawField.label || fieldTypeName(type)),
    sourceColumn: Math.max(0, Math.round(numberOrDefault(rawField.sourceColumn, 0))),
    staticText: String(rawField.staticText || ''),
    colStart: Math.round(numberOrDefault(rawField.colStart, 1)),
    rowStart: Math.round(numberOrDefault(rawField.rowStart, 1)),
    colEnd: Math.round(numberOrDefault(rawField.colEnd, 2)),
    rowEnd: Math.round(numberOrDefault(rawField.rowEnd, 2)),
    align: ['left', 'center', 'right'].indexOf(rawField.align) >= 0 ? rawField.align : 'left',
    fontScale: clamp(numberOrDefault(rawField.fontScale, 1), 0.6, 2),
  };
  clampFieldToGrid(field);
  return field;
}

// ─── Template initialization ──────────────────────────────────
function initializeDefaultTemplate() {
  state.template.fields = [
    { id: makeFieldId(), type: 'datamatrix', label: 'DataMatrix',
      sourceColumn: 0, staticText: '', colStart: 1, rowStart: 1, colEnd: 4, rowEnd: 4, align: 'center', fontScale: 1 },
    { id: makeFieldId(), type: 'csvText', label: 'Sample ID',
      sourceColumn: 0, staticText: '', colStart: 4, rowStart: 1, colEnd: 9, rowEnd: 2, align: 'left', fontScale: 1.1 },
    { id: makeFieldId(), type: 'staticText', label: 'Static Text',
      sourceColumn: 0, staticText: 'LabTools', colStart: 4, rowStart: 2, colEnd: 9, rowEnd: 4, align: 'left', fontScale: 0.9 },
  ];
  state.selectedFieldId = state.template.fields[0].id;
}

// ─── Grid computation (new algorithm) ────────────────────────
function gridForLabel(w, h) {
  var r = w / h;
  if (r >= 4.0) return { cols: 12, rows: 3 };
  if (r >= 2.4) return { cols: 8,  rows: 3 };
  if (r >= 1.6) return { cols: 6,  rows: 4 };
  if (r >= 1.0) return { cols: 5,  rows: 4 };
  return               { cols: 4,  rows: 5 };
}

function recomputeGrid(remap) {
  var oldGrid = { cols: state.template.grid.cols, rows: state.template.grid.rows };
  var preset = getActivePreset();
  var nextGrid = gridForLabel(preset.labelWidth, preset.labelHeight);
  state.template.grid = nextGrid;
  state.template.fields.forEach(function (field) {
    if (remap && oldGrid.cols && oldGrid.rows) {
      field.colStart = Math.round((field.colStart - 1) / oldGrid.cols * nextGrid.cols) + 1;
      field.colEnd   = Math.round((field.colEnd   - 1) / oldGrid.cols * nextGrid.cols) + 1;
      field.rowStart = Math.round((field.rowStart - 1) / oldGrid.rows * nextGrid.rows) + 1;
      field.rowEnd   = Math.round((field.rowEnd   - 1) / oldGrid.rows * nextGrid.rows) + 1;
    }
    clampFieldToGrid(field);
  });
}

// ─── Sheet placement (new plan/startCell model) ───────────────
function initPlan() {
  var preset = getActiveLaserPreset();
  var total = Math.max(1, preset.columns * preset.rows);
  if (state.plan.length !== total) {
    state.plan = Array(total).fill('use');
    state.startCell = 0;
  }
}

function resetPlan() {
  var preset = getActiveLaserPreset();
  var total = Math.max(1, preset.columns * preset.rows);
  state.plan = Array(total).fill('use');
  state.startCell = 0;
}

function computeUsableCells() {
  return state.plan.slice(state.startCell).filter(function (s) { return s !== 'skip'; }).length;
}

function computeSheetsNeeded() {
  if (state.outputMode === 'thermal') return state.csvRows.length;
  var preset = getActiveLaserPreset();
  var total = Math.max(1, preset.columns * preset.rows);
  var usable = computeUsableCells();
  return Math.max(1, Math.ceil(Math.max(0, state.csvRows.length - usable) / total) + 1);
}

function buildNewLabelIndexMap() {
  var preset = getActiveLaserPreset();
  var total = Math.max(1, preset.columns * preset.rows);
  var map = new Map();
  var labelIdx = 0;
  // Sheet 1: respect startCell + plan
  for (var i = state.startCell; i < total && labelIdx < state.csvRows.length; i++) {
    if (state.plan[i] !== 'skip') map.set(i, labelIdx++);
  }
  // Sheets 2+: all cells in order
  var cell = total;
  while (labelIdx < state.csvRows.length) {
    map.set(cell++, labelIdx++);
  }
  return map;
}

function onSheetCellClick(index) {
  var mode = state.placementMode;
  if (mode === 'start') {
    state.startCell = index;
    state.plan = Array(state.plan.length).fill('use');
  } else if (mode === 'use') {
    if (index < state.startCell) return;
    state.plan[index] = 'use';
  } else if (mode === 'skip') {
    if (index < state.startCell) return;
    state.plan[index] = 'skip';
  }
  markOutputDirty(); renderAll();
}

// ─── Field management ─────────────────────────────────────────
const FIELD_DEFAULTS = {
  datamatrix: function (g) { return { type: 'datamatrix', label: 'DataMatrix', sourceColumn: 0, staticText: '', colStart: 1, rowStart: 1, colEnd: Math.min(4, g.cols) + 1, rowEnd: Math.min(3, g.rows) + 1, align: 'center', fontScale: 1 }; },
  csvText:    function (g) { return { type: 'csvText',    label: 'CSV Field',  sourceColumn: 0, staticText: '', colStart: Math.min(4, g.cols - 1), rowStart: 1, colEnd: g.cols + 1, rowEnd: 2, align: 'left', fontScale: 1 }; },
  staticText: function (g) { return { type: 'staticText', label: 'Static Text', sourceColumn: 0, staticText: 'LabTools', colStart: Math.min(4, g.cols - 1), rowStart: Math.max(1, g.rows - 1), colEnd: g.cols + 1, rowEnd: g.rows + 1, align: 'left', fontScale: 0.9 }; },
};

function addField(type) {
  if (type === 'datamatrix' && state.template.fields.some(function (f) { return f.type === 'datamatrix'; })) return;
  var g = state.template.grid;
  var seed = FIELD_DEFAULTS[type](g);
  if ((type === 'csvText' || type === 'datamatrix') && state.csvHeaders.length) {
    var nextIdx = Math.min(state.template.fields.filter(function (f) { return f.type === type; }).length, state.csvHeaders.length - 1);
    seed.sourceColumn = nextIdx;
    if (type === 'csvText') seed.label = state.csvHeaders[nextIdx] || 'CSV Field';
  }
  var field = Object.assign({ id: makeFieldId() }, seed);
  clampFieldToGrid(field);
  state.template.fields.push(field);
  state.selectedFieldId = field.id;
  markOutputDirty(); renderAll();
}

function removeSelectedField() {
  state.template.fields = state.template.fields.filter(function (f) { return f.id !== state.selectedFieldId; });
  state.selectedFieldId = state.template.fields[0] ? state.template.fields[0].id : '';
  markOutputDirty(); renderAll();
}

function updateSelectedFieldFromEditor() {
  var field = getSelectedField();
  if (!field) return;
  field.label = document.getElementById('field-label-input').value.trim() || fieldTypeName(field.type);
  field.sourceColumn = Number(document.getElementById('field-source-select').value || 0);
  field.staticText = document.getElementById('field-static-input').value;
  field.align = document.getElementById('field-align-select').value;
  field.fontScale = clamp(Number(document.getElementById('field-font-scale').value || 1), 0.6, 2);
  markOutputDirty(); renderAll();
}

// ─── Preset switching ─────────────────────────────────────────
function setOutputMode(mode) {
  var oldTotal = getActiveLaserPreset().columns * getActiveLaserPreset().rows;
  state.outputMode = mode;
  recomputeGrid(true);
  var newTotal = getActiveLaserPreset().columns * getActiveLaserPreset().rows;
  if (newTotal !== oldTotal) resetPlan();
  markOutputDirty(); renderAll();
}

function onUnifiedPresetChange(event) {
  var id = event.target.value;
  var isLaser = id === CUSTOM_LASER_ID || !!findLaserPreset(id);
  var oldTotal = getActiveLaserPreset().columns * getActiveLaserPreset().rows;
  state.outputMode = isLaser ? 'laser-sheet' : 'thermal';
  if (isLaser) state.selectedLaserPresetId = id;
  else state.selectedThermalPresetId = id;
  recomputeGrid(true);
  var newTotal = getActiveLaserPreset().columns * getActiveLaserPreset().rows;
  if (newTotal !== oldTotal) resetPlan();
  markOutputDirty(); renderAll();
}

// ─── Drag / resize (same logic, updated element ID) ───────────
function startFieldDrag(event) {
  if (event.target.dataset.resizeField) return;
  var field = findField(event.currentTarget.dataset.dragField);
  if (!field) return;
  state.selectedFieldId = field.id;
  dragState = {
    type: 'move', pointerId: event.pointerId, fieldId: field.id,
    startX: event.clientX, startY: event.clientY,
    startField: cloneField(field),
    stageRect: document.getElementById('lg-stage-canvas').getBoundingClientRect(),
  };
  document.addEventListener('pointermove', onFieldDragMove);
  document.addEventListener('pointerup', endFieldDrag);
  document.addEventListener('pointercancel', endFieldDrag);
  event.preventDefault();
  renderStage();
}

function startFieldResize(event) {
  var field = findField(event.target.dataset.resizeField);
  if (!field) return;
  state.selectedFieldId = field.id;
  dragState = {
    type: 'resize', pointerId: event.pointerId, fieldId: field.id,
    startX: event.clientX, startY: event.clientY,
    startField: cloneField(field),
    stageRect: document.getElementById('lg-stage-canvas').getBoundingClientRect(),
  };
  document.addEventListener('pointermove', onFieldDragMove);
  document.addEventListener('pointerup', endFieldDrag);
  document.addEventListener('pointercancel', endFieldDrag);
  event.stopPropagation(); event.preventDefault();
}

function onFieldDragMove(event) {
  if (!dragState) return;
  if (dragState.pointerId != null && event.pointerId !== dragState.pointerId) return;
  var field = findField(dragState.fieldId);
  var grid = state.template.grid;
  var dx = Math.round((event.clientX - dragState.startX) / dragState.stageRect.width * grid.cols);
  var dy = Math.round((event.clientY - dragState.startY) / dragState.stageRect.height * grid.rows);
  var width  = dragState.startField.colEnd - dragState.startField.colStart;
  var height = dragState.startField.rowEnd - dragState.startField.rowStart;
  if (dragState.type === 'move') {
    field.colStart = dragState.startField.colStart + dx;
    field.rowStart = dragState.startField.rowStart + dy;
    field.colEnd   = field.colStart + width;
    field.rowEnd   = field.rowStart + height;
  } else {
    field.colEnd = dragState.startField.colEnd + dx;
    field.rowEnd = dragState.startField.rowEnd + dy;
  }
  clampFieldToGrid(field);
  markOutputDirty(); renderStage();
}

function endFieldDrag() {
  dragState = null;
  document.removeEventListener('pointermove', onFieldDragMove);
  document.removeEventListener('pointerup', endFieldDrag);
  document.removeEventListener('pointercancel', endFieldDrag);
  renderAll();
}

function onGlobalKeyDown(event) {
  if (!state.selectedFieldId) return;
  if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT')) return;
  var field = getSelectedField();
  if (!field) return;
  var resize = event.shiftKey, delta = event.altKey ? 2 : 1, handled = true;
  if      (event.key === 'ArrowLeft')  moveOrResizeField(field, resize, -delta, 0);
  else if (event.key === 'ArrowRight') moveOrResizeField(field, resize,  delta, 0);
  else if (event.key === 'ArrowUp')    moveOrResizeField(field, resize, 0, -delta);
  else if (event.key === 'ArrowDown')  moveOrResizeField(field, resize, 0,  delta);
  else handled = false;
  if (!handled) return;
  markOutputDirty(); renderAll(); event.preventDefault();
}

function moveOrResizeField(field, resize, dx, dy) {
  if (resize) { field.colEnd += dx; field.rowEnd += dy; }
  else {
    var w = field.colEnd - field.colStart, h = field.rowEnd - field.rowStart;
    field.colStart += dx; field.rowStart += dy;
    field.colEnd = field.colStart + w; field.rowEnd = field.rowStart + h;
  }
  clampFieldToGrid(field);
}

// ─── Render: top level ────────────────────────────────────────
function renderAll() {
  renderNavPills();
  renderCsvSection();
  renderFormatSection();
  renderCanvasHeader();
  renderStage();
  renderSamples();
  renderFieldList();
  renderPropsPanel();
  renderSheetPlacement();
  renderBottomBar();
}

// ─── Render: nav ──────────────────────────────────────────────
function renderNavPills() {
  var saveBtn = document.getElementById('save-template-btn');
  saveBtn.innerHTML = Icons.Save + ' Save template';

  var rowPill = document.getElementById('nav-pill-rows');
  rowPill.innerHTML = Icons.Database + ' <b>' + state.csvRows.length + '</b> rows';
  rowPill.style.display = state.csvRows.length ? 'inline-flex' : 'none';

  var preset = getActivePreset();
  var sizePill = document.getElementById('nav-pill-size');
  var modeIcon = state.outputMode === 'thermal' ? Icons.Thermal : Icons.Sheet;
  sizePill.innerHTML = modeIcon + ' <b>' + formatDecimal(preset.labelWidth, 2) + '″ × ' + formatDecimal(preset.labelHeight, 2) + '″</b>';
  sizePill.style.display = 'inline-flex';
}

// ─── Render: left rail sections ───────────────────────────────
function renderCsvSection() {
  var rowCount = document.getElementById('csv-row-count');
  rowCount.textContent = state.csvRows.length ? state.csvRows.length + ' rows' : '';

  var pasteDetails = document.getElementById('paste-details');
  var pasteSummary = document.getElementById('paste-summary');
  pasteSummary.textContent = state.csvRows.length ? 'Edit CSV text' : 'Paste CSV directly';
  if (!state.csvRows.length && !pasteDetails.open) pasteDetails.open = true;

  var content = document.getElementById('csv-content');
  if (state.csvRows.length) {
    var cols = state.csvHeaders.slice(0, 8).map(function (h) {
      return '<span class="lg-csv-col">' + escapeHtml(h) + '</span>';
    }).join('');
    if (state.csvHeaders.length > 8) cols += '<span class="lg-csv-col more">+' + (state.csvHeaders.length - 8) + ' more</span>';
    content.innerHTML =
      '<div class="lg-csv-loaded">' +
        '<div class="lg-csv-loaded-head">' +
          '<div class="lg-csv-loaded-icon">' + Icons.File + '</div>' +
          '<div><div class="lg-csv-loaded-name">' + escapeHtml(state.fileName || 'pasted-data.csv') + '</div>' +
          '<div class="lg-csv-loaded-meta">' + state.csvRows.length + ' rows · ' + state.csvHeaders.length + ' columns</div></div>' +
        '</div>' +
        '<div class="lg-csv-cols">' + cols + '</div>' +
        '<div class="lg-csv-actions">' +
          '<button class="lg-link-btn" id="replace-csv-btn" type="button">' + Icons.Upload + ' Replace</button>' +
          '<button class="lg-link-btn danger" id="clear-csv-btn" type="button">' + Icons.Trash + ' Clear</button>' +
        '</div>' +
      '</div>';
  } else {
    content.innerHTML =
      '<div class="lg-csv-empty" id="csv-drop-zone">' +
        '<div class="ico">' + Icons.Upload + '</div>' +
        '<h4>Upload CSV</h4>' +
        '<p>Drag a file here, or click to pick</p>' +
        '<div class="alt">or paste below ↓</div>' +
      '</div>';
  }
}

function renderFormatSection() {
  // Mode buttons
  var laserBtn   = document.getElementById('laser-mode-btn');
  var thermalBtn = document.getElementById('thermal-mode-btn');
  laserBtn.innerHTML  = Icons.Sheet + ' Laser sheet';
  thermalBtn.innerHTML = Icons.Thermal + ' Thermal';
  laserBtn.classList.toggle('is-on',   state.outputMode === 'laser-sheet');
  thermalBtn.classList.toggle('is-on', state.outputMode === 'thermal');

  // Preset dropdown — filtered to current mode
  var select = document.getElementById('unified-preset-select');
  var currentId = state.outputMode === 'laser-sheet' ? state.selectedLaserPresetId : state.selectedThermalPresetId;
  if (state.outputMode === 'laser-sheet') {
    var laserOpts = state.laserPresets.map(function (p) {
      return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name + (p.sku ? ' · ' + p.sku : '')) + '</option>';
    }).join('') + '<option value="' + CUSTOM_LASER_ID + '">Custom laser sheet</option>';
    select.innerHTML = laserOpts;
  } else {
    var thermalOpts = state.thermalPresets.map(function (p) {
      return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + '</option>';
    }).join('') + '<option value="' + CUSTOM_THERMAL_ID + '">Custom thermal label</option>';
    select.innerHTML = thermalOpts;
  }
  select.value = currentId;

  // Custom preset forms
  var isCustomLaser   = currentId === CUSTOM_LASER_ID;
  var isCustomThermal = currentId === CUSTOM_THERMAL_ID;
  var laserForm   = document.getElementById('custom-laser-form');
  var thermalForm = document.getElementById('custom-thermal-form');
  if (laserForm)   laserForm.style.display   = isCustomLaser   ? '' : 'none';
  if (thermalForm) thermalForm.style.display = isCustomThermal ? '' : 'none';
  if (isCustomLaser) {
    var cl = state.customLaserPreset;
    document.getElementById('cp-label-w').value    = cl.labelWidth;
    document.getElementById('cp-label-h').value    = cl.labelHeight;
    document.getElementById('cp-page-w').value     = cl.pageWidth;
    document.getElementById('cp-page-h').value     = cl.pageHeight;
    document.getElementById('cp-cols').value       = cl.columns;
    document.getElementById('cp-rows').value       = cl.rows;
    document.getElementById('cp-top-margin').value = cl.topMargin;
    document.getElementById('cp-left-margin').value = cl.leftMargin;
    document.getElementById('cp-h-pitch').value    = cl.horizontalPitch;
    document.getElementById('cp-v-pitch').value    = cl.verticalPitch;
  }
  if (isCustomThermal) {
    var ct = state.customThermalPreset;
    document.getElementById('cp-t-label-w').value = ct.labelWidth;
    document.getElementById('cp-t-label-h').value = ct.labelHeight;
  }

  // KV table
  var preset = getActivePreset();
  var kv = document.getElementById('preset-kv');
  var rows = '<dt>Label size</dt><dd>' + formatDecimal(preset.labelWidth, 3) + '″ × ' + formatDecimal(preset.labelHeight, 3) + '″</dd>';
  if (state.outputMode === 'laser-sheet') {
    rows += '<dt>Page</dt><dd>' + preset.pageWidth + '″ × ' + preset.pageHeight + '″</dd>';
    rows += '<dt>Grid</dt><dd>' + preset.columns + ' × ' + preset.rows + ' = ' + (preset.columns * preset.rows) + '/sheet</dd>';
    rows += '<dt>Pitch</dt><dd>' + formatDecimal(preset.horizontalPitch, 3) + '″ × ' + formatDecimal(preset.verticalPitch, 3) + '″</dd>';
    rows += '<dt>Margins</dt><dd>' + formatDecimal(preset.topMargin, 3) + '″ top · ' + formatDecimal(preset.leftMargin, 3) + '″ left</dd>';
  }
  if (preset.vendor) rows += '<dt>Vendor</dt><dd>' + escapeHtml(preset.vendor) + '</dd>';
  kv.innerHTML = rows;

  // Show border checkbox sync
  document.getElementById('show-border').checked = state.showBorder;

  // Sheet placement section visibility
  var placementSection = document.getElementById('placement-section');
  if (placementSection) placementSection.style.display = state.outputMode === 'laser-sheet' ? '' : 'none';
}

// ─── Render: canvas header ────────────────────────────────────
function renderCanvasHeader() {
  var preset = getActivePreset();
  var emoji = state.outputMode === 'thermal' ? '🖨️' : '🏷️';
  document.getElementById('canvas-title').innerHTML = '<span class="lg-canvas-emoji">' + emoji + '</span>' + escapeHtml(preset.name);
  document.getElementById('canvas-dim-label').textContent = formatDecimal(preset.labelWidth, 3) + '″ × ' + formatDecimal(preset.labelHeight, 3) + '″';
  var grid = state.template.grid;
  document.getElementById('canvas-dim-grid').textContent = 'grid ' + grid.cols + '×' + grid.rows;
  document.getElementById('stage-pill-w').textContent = formatDecimal(preset.labelWidth, 3) + '″';
  document.getElementById('stage-pill-h').textContent = formatDecimal(preset.labelHeight, 3) + '″';
}

// ─── Render: stage / canvas ───────────────────────────────────
function renderStage() {
  var canvas = document.getElementById('lg-stage-canvas');
  var stage  = document.getElementById('lg-stage');
  var preset = getActivePreset();
  var grid   = state.template.grid;
  var overlapIds = getOverlapFieldIds();

  stage.style.setProperty('--label-aspect', preset.labelWidth + ' / ' + preset.labelHeight);
  canvas.style.setProperty('--label-aspect', preset.labelWidth + ' / ' + preset.labelHeight);
  canvas.style.setProperty('--grid-cols', grid.cols);
  canvas.style.setProperty('--grid-rows', grid.rows);

  var html = '<div class="lg-stage-grid lines"></div>';
  state.template.fields.forEach(function (field) {
    var left   = ((field.colStart - 1) / grid.cols) * 100;
    var top    = ((field.rowStart - 1) / grid.rows) * 100;
    var width  = ((field.colEnd   - field.colStart) / grid.cols) * 100;
    var height = ((field.rowEnd   - field.rowStart) / grid.rows) * 100;
    var typeClass = 'lg-field--' + field.type;
    var sel = field.id === state.selectedFieldId ? ' selected' : '';
    var ovr = overlapIds.has(field.id) ? ' overlap' : '';
    var stamp = (field.colEnd - field.colStart) + '×' + (field.rowEnd - field.rowStart);
    var inner;
    if (field.type === 'datamatrix') {
      inner = DM_PATTERN;
    } else {
      var typeIcon = field.type === 'csvText' ? Icons.Database : Icons.Type;
      inner = '<div class="lg-field-inner"><div class="lg-field-icon">' + typeIcon + '</div><div class="lg-field-name">' + escapeHtml(field.label) + '</div></div>';
    }
    html += '<div class="lg-field ' + typeClass + sel + ovr + '"' +
      ' data-drag-field="' + field.id + '"' +
      ' tabindex="0" role="button" aria-label="' + escapeHtml(field.label) + '"' +
      ' style="position:absolute;left:' + left + '%;top:' + top + '%;width:' + width + '%;height:' + height + '%;">' +
      inner +
      '<div class="lg-field-handle" data-resize-field="' + field.id + '"></div>' +
      '<div class="lg-field-stamp">' + stamp + '</div>' +
      '</div>';
  });
  canvas.innerHTML = html;

  canvas.querySelectorAll('[data-drag-field]').forEach(function (block) {
    block.addEventListener('pointerdown', startFieldDrag);
  });
  canvas.querySelectorAll('[data-resize-field]').forEach(function (handle) {
    handle.addEventListener('pointerdown', startFieldResize);
  });

  // Overlap warning
  var warn = document.getElementById('overlap-warning');
  if (overlapIds.size > 0) {
    warn.textContent = 'Overlapping fields detected — adjust positions before exporting.';
    warn.style.display = '';
  } else {
    warn.style.display = 'none';
  }
}

// ─── Render: sample preview ───────────────────────────────────
function renderSamples() {
  var section = document.getElementById('samples-section');
  if (!state.csvRows.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  var grid = state.template.grid;
  var preset = getActivePreset();
  var labelAspect = preset.labelWidth + ' / ' + preset.labelHeight;
  var sampleCount = Math.min(state.csvRows.length, 6);
  var samplesHtml = '';
  for (var i = 0; i < sampleCount; i++) {
    var row = state.csvRows[i];
    var fieldsHtml = '';
    state.template.fields.forEach(function (field) {
      var left   = ((field.colStart - 1) / grid.cols) * 100;
      var top    = ((field.rowStart - 1) / grid.rows) * 100;
      var width  = ((field.colEnd   - field.colStart) / grid.cols) * 100;
      var height = ((field.rowEnd   - field.rowStart) / grid.rows) * 100;
      var style  = 'left:' + left + '%;top:' + top + '%;width:' + width + '%;height:' + height + '%;';
      if (field.type === 'datamatrix') {
        var dmText = String(getFieldValue(field, row) || '');
        var dmUrl = '';
        if (dmText) {
          try {
            var dmCanvas = document.createElement('canvas');
            bwipjs.toCanvas(dmCanvas, { bcid: 'datamatrix', text: dmText, scale: 3, includetext: false, paddingwidth: 0, paddingheight: 0 });
            dmUrl = dmCanvas.toDataURL();
          } catch (e) { /* fallback to black block */ }
        }
        if (dmUrl) {
          fieldsHtml += '<div class="lg-sample-zone dm" style="' + style + 'background:#fff;padding:2px;"><img src="' + dmUrl + '" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated;" /></div>';
        } else {
          fieldsHtml += '<div class="lg-sample-zone dm" style="' + style + '"></div>';
        }
      } else {
        var val = escapeHtml(getFieldValue(field, row) || '');
        var align = field.align || 'left';
        fieldsHtml += '<div class="lg-sample-zone text" style="' + style + 'text-align:' + align + ';"><div class="lg-sample-text">' + val + '</div></div>';
      }
    });
    samplesHtml += '<div class="lg-sample" style="--label-aspect:' + labelAspect + ';">' + fieldsHtml + '<div class="lg-sample-counter">' + (i + 1) + '</div></div>';
  }
  section.innerHTML =
    '<div class="lg-samples-head">' +
      '<div><span class="lg-samples-title">Sample preview</span><span class="lg-samples-sub">first ' + sampleCount + ' of ' + state.csvRows.length + '</span></div>' +
      '<div class="lg-meta-pill">' + Icons.Eye + ' starting at cell ' + (state.startCell + 1) + '</div>' +
    '</div>' +
    '<div class="lg-samples-row">' + samplesHtml + '</div>';
}

// ─── Render: right rail ───────────────────────────────────────
function renderFieldList() {
  var badge = document.getElementById('field-count-badge');
  badge.textContent = state.template.fields.length + ' field' + plural(state.template.fields.length);

  var addDMBtn = document.getElementById('add-datamatrix-btn');
  var hasDM = state.template.fields.some(function (f) { return f.type === 'datamatrix'; });
  addDMBtn.disabled = hasDM;
  addDMBtn.style.opacity = hasDM ? '0.4' : '';

  // Add card icons
  document.querySelector('#add-datamatrix-btn .lg-add-icon').innerHTML = Icons.Grid;
  document.querySelector('#add-csv-btn .lg-add-icon').innerHTML = Icons.Database;
  document.querySelector('#add-static-btn .lg-add-icon').innerHTML = Icons.Type;

  var list = document.getElementById('field-list');
  if (!state.template.fields.length) { list.innerHTML = '<div style="font-size:0.76rem;color:var(--text-muted);text-align:center;padding:12px 0;">No fields yet — add one above.</div>'; return; }

  list.innerHTML = state.template.fields.map(function (field) {
    var chipClass = field.type === 'datamatrix' ? 'dm' : field.type === 'csvText' ? 'csv' : 'stat';
    var chipIcon  = field.type === 'datamatrix' ? Icons.Grid : field.type === 'csvText' ? Icons.Database : Icons.Type;
    var sub = field.type === 'datamatrix' ? 'encodes col ' + (state.csvHeaders[field.sourceColumn] || field.sourceColumn)
            : field.type === 'csvText'    ? 'csv · ' + (state.csvHeaders[field.sourceColumn] || 'col ' + field.sourceColumn)
            : 'static · "' + field.staticText + '"';
    var size = (field.colEnd - field.colStart) + '×' + (field.rowEnd - field.rowStart);
    var sel = field.id === state.selectedFieldId ? ' selected' : '';
    return '<div class="lg-field-card' + sel + '" data-field-id="' + field.id + '">' +
      '<div class="lg-field-chip ' + chipClass + '">' + chipIcon + '</div>' +
      '<div class="lg-field-meta-wrap"><div class="lg-field-card-name">' + escapeHtml(field.label) + '</div><div class="lg-field-card-sub">' + escapeHtml(sub) + '</div></div>' +
      '<div class="lg-field-card-r"><span class="lg-field-size">' + size + '</span>' +
      '<button class="lg-field-x" data-remove-field="' + field.id + '" type="button" title="Remove">' + Icons.X + '</button></div>' +
      '</div>';
  }).join('');
}

function renderPropsPanel() {
  var panel = document.getElementById('props-panel');
  var field = getSelectedField();
  if (!field) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  document.getElementById('field-label-input').value = field.label;
  document.getElementById('field-align-select').value = field.align || 'left';
  document.getElementById('field-font-scale').value = field.fontScale || 1;

  var sourceRow   = document.getElementById('source-column-row');
  var staticRow   = document.getElementById('static-text-row');
  var sourceLabel = document.getElementById('source-column-label');

  if (field.type === 'staticText') {
    sourceRow.style.display = 'none';
    staticRow.style.display = '';
    document.getElementById('field-static-input').value = field.staticText || '';
  } else {
    sourceRow.style.display = '';
    staticRow.style.display = 'none';
    sourceLabel.textContent = field.type === 'datamatrix' ? 'Encodes column' : 'CSV column';
    var sel = document.getElementById('field-source-select');
    sel.innerHTML = state.csvHeaders.map(function (h, i) {
      return '<option value="' + i + '">' + escapeHtml(h) + '</option>';
    }).join('') || '<option value="0">No CSV loaded</option>';
    sel.value = field.sourceColumn;
  }

  var grid = state.template.grid;
  document.getElementById('props-geom').innerHTML =
    '<b>' + (field.colStart - 1) + ',' + (field.rowStart - 1) + '</b> position · <b>' +
    (field.colEnd - field.colStart) + '×' + (field.rowEnd - field.rowStart) + '</b> size';
}

function renderSheetPlacement() {
  var section = document.getElementById('placement-section');
  if (!section) return;
  if (state.outputMode !== 'laser-sheet') { section.style.display = 'none'; return; }
  section.style.display = '';

  var preset = getActiveLaserPreset();
  var total  = Math.max(1, preset.columns * preset.rows);
  // Ensure plan length matches
  if (state.plan.length !== total) { state.plan = Array(total).fill('use'); state.startCell = 0; }

  var badge = document.getElementById('placement-grid-badge');
  badge.textContent = preset.columns + '×' + preset.rows;

  var usable  = computeUsableCells();
  var skipped = state.plan.filter(function (s) { return s === 'skip'; }).length;

  var pm = state.placementMode;
  var modeHtml =
    '<div class="lg-segmented" style="margin-bottom:8px;">' +
      '<button type="button" data-placement-mode="start" class="' + (pm === 'start' ? 'is-on' : '') + '">Start here</button>' +
      '<button type="button" data-placement-mode="use"   class="' + (pm === 'use'   ? 'is-on' : '') + '">Use cell</button>' +
      '<button type="button" data-placement-mode="skip"  class="' + (pm === 'skip'  ? 'is-on' : '') + '">Skip cell</button>' +
    '</div>';

  var cellsHtml = '';
  for (var i = 0; i < total; i++) {
    var cls;
    if (i < state.startCell) cls = 'past';
    else if (i === state.startCell) cls = 'start';
    else cls = state.plan[i] || 'use';
    cellsHtml += '<div class="lg-sheet-cell ' + cls + '" data-cell-index="' + i + '" title="Cell ' + (i + 1) + '"></div>';
  }

  var sheetClass = 'lg-sheet' + (pm === 'start' ? ' lg-sheet--mode-start' : '');
  var statsHtml =
    '<div class="lg-sheet-stats">' +
      '<span class="lg-sheet-stat"><span class="swatch start"></span>start · cell ' + (state.startCell + 1) + '</span>' +
      '<span class="lg-sheet-stat"><span class="swatch use"></span>' + usable + ' usable</span>' +
      '<span class="lg-sheet-stat"><span class="swatch skip"></span>' + skipped + ' skipped</span>' +
    '</div>';

  var content = document.getElementById('placement-content');
  content.innerHTML =
    modeHtml +
    '<div class="' + sheetClass + '" style="aspect-ratio:' + preset.pageWidth + '/' + preset.pageHeight + ';"><div class="lg-sheet-grid" style="grid-template-columns:repeat(' + preset.columns + ',1fr);grid-template-rows:repeat(' + preset.rows + ',1fr);">' + cellsHtml + '</div></div>' +
    statsHtml +
    '<p class="lg-sheet-hint">Click a cell to apply the selected action above</p>';
}

// ─── Render: bottom bar ───────────────────────────────────────
function renderBottomBar() {
  var preset = getActivePreset();
  var sheetsNeeded = computeSheetsNeeded();
  var usable = computeUsableCells();

  var info = document.getElementById('bottom-info');
  var isLaser = state.outputMode === 'laser-sheet';
  var html =
    '<div class="lg-bottom-stat"><div class="lg-bottom-stat-num">' + state.csvRows.length + '</div><div class="lg-bottom-stat-lbl">labels to print</div></div>' +
    '<div class="lg-bottom-divider"></div>' +
    '<div class="lg-bottom-stat"><div class="lg-bottom-stat-num">' + sheetsNeeded + '</div><div class="lg-bottom-stat-lbl">' + (isLaser ? 'laser sheet' + plural(sheetsNeeded) : 'thermal page' + plural(sheetsNeeded)) + '</div></div>';
  if (isLaser) {
    html += '<div class="lg-bottom-divider"></div><div class="lg-bottom-stat"><div class="lg-bottom-stat-num">' + usable + '</div><div class="lg-bottom-stat-lbl">usable cells / sheet 1</div></div>';
  }
  info.innerHTML = html;

  // Generate button state
  var hasData = state.csvRows.length > 0;
  var hasFields = state.template.fields.length > 0;
  var hasDM = state.template.fields.some(function (f) { return f.type === 'datamatrix'; });
  var geomOk = validatePresetGeometry(getActivePreset()).valid;
  var barcodeIssues = hasData ? detectBarcodeInputIssues() : [];
  var blockingIssues = barcodeIssues.filter(function (i) { return i.severity === 'danger'; });
  var canGenerate = hasData && hasFields && hasDM && geomOk && !blockingIssues.length && !state.isGenerating;

  var genBtn = document.getElementById('generate-btn');
  var dlBtn  = document.getElementById('download-btn');
  genBtn.disabled = !canGenerate;
  genBtn.innerHTML = Icons.Grid + (state.isGenerating ? ' Generating…' : ' Generate PDF');
  dlBtn.disabled = !state.outputBytes || state.outputDirty;
  dlBtn.innerHTML = Icons.Eye + ' Preview PDF';
}

// ─── Status helper ────────────────────────────────────────────
function showExportStatus(message, level) {
  var el = document.getElementById('export-status');
  el.textContent = message;
  el.className = 'lg-export-status visible' + (level ? ' ' + level : '');
  clearTimeout(showExportStatus._timer);
  showExportStatus._timer = setTimeout(function () { el.className = 'lg-export-status'; }, 4000);
}

function setStatus(id, message, type) {
  if (id === 'export-status') {
    var lvl = type === 'success' ? 'ok' : type === 'danger' ? 'err' : type === 'warn' ? 'warn' : '';
    showExportStatus(message, lvl);
  }
}

// ─── PDF generation (verbatim + laser adaptation) ─────────────
async function generatePdf() {
  if (!state.csvRows.length) return showExportStatus('Load CSV data first.', 'warn');
  if (!state.template.fields.some(function (f) { return f.type === 'datamatrix'; })) return showExportStatus('Add a DataMatrix field first.', 'warn');
  var geometryStatus = validatePresetGeometry(getActivePreset());
  if (!geometryStatus.valid) return showExportStatus(geometryStatus.message, 'warn');
  var barcodeIssues = detectBarcodeInputIssues();
  if (barcodeIssues.some(function (i) { return i.severity === 'danger'; })) return showExportStatus(formatBarcodeIssueSummary(barcodeIssues), 'err');
  state.isGenerating = true; state.barcodeIssues = [];
  clearOutputPreview();
  showExportStatus('Generating PDF…', '');
  renderBottomBar();
  try {
    var doc = await PDFLib.PDFDocument.create();
    var font     = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    var boldFont = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    if (state.outputMode === 'thermal') await generateThermalPdf(doc, font, boldFont);
    else                                await generateLaserPdf(doc, font, boldFont);
    doc.setTitle('LabTools Labels'); doc.setProducer('LabTools'); doc.setCreator('LabTools label-generator');
    state.outputBytes = await doc.save();
    state.outputDirty = false;
    var blob = new Blob([state.outputBytes], { type: 'application/pdf' });
    state.outputUrl = URL.createObjectURL(blob);
    var msg = state.barcodeIssues.length ? 'PDF ready — ' + formatBarcodeIssueSummary(state.barcodeIssues) : 'PDF ready · ' + state.csvRows.length + ' label' + plural(state.csvRows.length) + '.';
    showExportStatus(msg, state.barcodeIssues.length ? 'warn' : 'ok');
  } catch (err) {
    showExportStatus(err && err.message ? err.message : 'Failed to generate PDF.', 'err');
  } finally {
    state.isGenerating = false; renderAll();
  }
}

async function generateThermalPdf(doc, font, boldFont) {
  var preset = getActiveThermalPreset();
  var width = inchesToPoints(preset.labelWidth), height = inchesToPoints(preset.labelHeight);
  for (var i = 0; i < state.csvRows.length; i++) {
    var page = doc.addPage([width, height]);
    await drawLabel(doc, page, font, boldFont, state.csvRows[i], { x: 0, y: 0, width: width, height: height }, i);
  }
}

async function generateLaserPdf(doc, font, boldFont) {
  var preset = getActiveLaserPreset();
  var geometry = buildSheetGeometry(preset);
  var totalCells = Math.max(1, preset.columns * preset.rows);
  var sheetsNeeded = computeSheetsNeeded();
  var labelMap = buildNewLabelIndexMap();
  var pageWidth  = inchesToPoints(preset.pageWidth);
  var pageHeight = inchesToPoints(preset.pageHeight);
  for (var sheetIndex = 0; sheetIndex < sheetsNeeded; sheetIndex++) {
    var page = doc.addPage([pageWidth, pageHeight]);
    for (var cellIndex = 0; cellIndex < totalCells; cellIndex++) {
      var globalIndex = sheetIndex * totalCells + cellIndex;
      var labelIndex = labelMap.get(globalIndex);
      if (labelIndex === undefined || !state.csvRows[labelIndex]) continue;
      var cellRect = geometry.cells[cellIndex];
      await drawLabel(doc, page, font, boldFont, state.csvRows[labelIndex], {
        x: inchesToPoints(cellRect.xIn),
        y: pageHeight - inchesToPoints(cellRect.yIn) - inchesToPoints(cellRect.heightIn),
        width: inchesToPoints(cellRect.widthIn),
        height: inchesToPoints(cellRect.heightIn),
      }, labelIndex);
    }
  }
}

async function drawLabel(doc, page, font, boldFont, row, labelRect, rowIndex) {
  if (state.showBorder) {
    page.drawRectangle({ x: labelRect.x, y: labelRect.y, width: labelRect.width, height: labelRect.height, borderWidth: 0.35, borderColor: PDFLib.rgb(0.78, 0.78, 0.78) });
  }
  var grid = state.template.grid;
  for (var i = 0; i < state.template.fields.length; i++) {
    var field = state.template.fields[i];
    var rect = fieldToPdfRect(field, grid, labelRect);
    if (field.type === 'datamatrix') {
      await drawDataMatrix(doc, page, row, field, rect, rowIndex);
    } else {
      drawTextField(page, field.type === 'staticText' ? boldFont : font, row, field, rect);
    }
  }
}

function fieldToPdfRect(field, grid, labelRect) {
  var x      = labelRect.x + ((field.colStart - 1) / grid.cols) * labelRect.width;
  var top    = ((field.rowStart - 1) / grid.rows) * labelRect.height;
  var width  = ((field.colEnd - field.colStart) / grid.cols) * labelRect.width;
  var height = ((field.rowEnd - field.rowStart) / grid.rows) * labelRect.height;
  return { x: x + 2, y: labelRect.y + labelRect.height - top - height + 2, width: Math.max(1, width - 4), height: Math.max(1, height - 4) };
}

async function drawDataMatrix(doc, page, row, field, rect, rowIndex) {
  var text = getFieldValue(field, row);
  if (!text) { state.barcodeIssues.push({ rowIndex: rowIndex, label: field.label, severity: 'danger', message: 'blank DataMatrix value' }); return; }
  var pngBytes = await renderDataMatrixToPng(text);
  if (!pngBytes) throw new Error('DataMatrix render failed for row ' + (rowIndex + 1) + ' in ' + field.label + '.');
  var png = await doc.embedPng(pngBytes);
  var size = Math.min(rect.width, rect.height);
  page.drawImage(png, { x: rect.x + (rect.width - size) / 2, y: rect.y + (rect.height - size) / 2, width: size, height: size });
}

function drawTextField(page, font, row, field, rect) {
  var text = getFieldValue(field, row);
  if (!text) return;
  var fontSize = clamp(Math.min(rect.height * 0.48, rect.width / Math.max(2, text.length) * 1.6) * (field.fontScale || 1), 4, 18);
  var truncated = truncateToWidth(text, font, fontSize, rect.width);
  var textWidth = font.widthOfTextAtSize(truncated, fontSize);
  var x = rect.x;
  if (field.align === 'center') x = rect.x + Math.max(0, (rect.width - textWidth) / 2);
  if (field.align === 'right')  x = rect.x + Math.max(0, rect.width - textWidth);
  page.drawText(truncated, { x: x, y: rect.y + Math.max(1, (rect.height - fontSize) / 2), size: fontSize, font: font, color: PDFLib.rgb(0, 0, 0), maxWidth: rect.width });
}

function truncateToWidth(text, font, fontSize, maxWidth) {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  var suffix = '...', out = text;
  while (out.length > 0 && font.widthOfTextAtSize(out + suffix, fontSize) > maxWidth) out = out.slice(0, -1);
  return out ? out + suffix : '';
}

function renderDataMatrixToPng(text) {
  return new Promise(function (resolve) {
    var canvas = getBarcodeCanvas();
    try {
      bwipjs.toCanvas(canvas, { bcid: 'datamatrix', text: String(text || ' '), scale: 4, includetext: false, paddingwidth: 0, paddingheight: 0 });
    } catch (err) { resolve(null); return; }
    canvas.toBlob(function (blob) {
      if (!blob) return resolve(null);
      var reader = new FileReader();
      reader.onload = function () { resolve(new Uint8Array(reader.result)); };
      reader.onerror = function () { resolve(null); };
      reader.readAsArrayBuffer(blob);
    });
  });
}

function getBarcodeCanvas() {
  if (!barcodeCanvas) {
    barcodeCanvas = document.createElement('canvas');
    barcodeCanvas.style.display = 'none';
    document.body.appendChild(barcodeCanvas);
  }
  return barcodeCanvas;
}

function downloadPdf() {
  if (!state.outputBytes || state.outputDirty) return;
  // Show preview modal first
  if (state.outputUrl) {
    document.getElementById('pdf-preview').src = state.outputUrl;
    document.getElementById('pdf-modal').classList.add('open');
  }
  var filename = 'labtools-labels-' + state.outputMode + '.pdf';
  var blob = new Blob([state.outputBytes], { type: 'application/pdf' });
  if (window.showSaveFilePicker) {
    window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] })
      .then(function (handle) { return handle.createWritable(); })
      .then(function (writable) { return writable.write(blob).then(function () { return writable.close(); }); })
      .catch(function (err) { if (err && err.name !== 'AbortError') fallbackDownload(blob, filename); });
    return;
  }
  fallbackDownload(blob, filename);
}

function fallbackDownload(blob, filename) {
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 500);
}

function markOutputDirty() {
  state.outputDirty = true; state.barcodeIssues = [];
  clearOutputPreview();
}

function clearOutputPreview() {
  if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  state.outputUrl = ''; state.outputBytes = null;
}

// ─── Geometry helpers (verbatim) ──────────────────────────────
function validatePresetGeometry(preset) {
  var issues = [];
  ['pageWidth', 'pageHeight', 'labelWidth', 'labelHeight', 'horizontalPitch', 'verticalPitch'].forEach(function (key) {
    if (!Number.isFinite(Number(preset[key])) || Number(preset[key]) <= 0) issues.push(key + ' must be > 0');
  });
  if (!Number.isFinite(Number(preset.leftMargin)) || Number(preset.leftMargin) < 0) issues.push('left margin must be ≥ 0');
  if (!Number.isFinite(Number(preset.topMargin))  || Number(preset.topMargin)  < 0) issues.push('top margin must be ≥ 0');
  if (!Number.isFinite(Number(preset.columns)) || Number(preset.columns) < 1) issues.push('columns must be ≥ 1');
  if (!Number.isFinite(Number(preset.rows))    || Number(preset.rows)    < 1) issues.push('rows must be ≥ 1');
  if (issues.length) return { valid: false, message: issues[0] + '.' };
  if (preset.mode === 'laser-sheet') {
    var gridW = preset.leftMargin + (preset.columns - 1) * preset.horizontalPitch + preset.labelWidth;
    var gridH = preset.topMargin  + (preset.rows    - 1) * preset.verticalPitch   + preset.labelHeight;
    if (gridW > preset.pageWidth  + 0.0001) issues.push('label grid extends past page width');
    if (gridH > preset.pageHeight + 0.0001) issues.push('label grid extends past page height');
    if (preset.horizontalPitch < preset.labelWidth)  issues.push('horizontal pitch < label width');
    if (preset.verticalPitch   < preset.labelHeight) issues.push('vertical pitch < label height');
    return { valid: !issues.length, message: issues.length ? issues.join('; ') + '.' : 'Geometry fits the page.' };
  }
  return { valid: true, message: 'Geometry fits the label page.' };
}

function detectBarcodeInputIssues() {
  var dmFields = state.template.fields.filter(function (f) { return f.type === 'datamatrix'; });
  var issues = [];
  dmFields.forEach(function (field) {
    state.csvRows.forEach(function (row, rowIndex) {
      var value = getFieldValue(field, row);
      if (!value) issues.push({ rowIndex: rowIndex, label: field.label, severity: 'danger', message: 'blank DataMatrix value' });
      else if (value.length > 120) issues.push({ rowIndex: rowIndex, label: field.label, severity: 'warn', message: 'long DataMatrix value may scan poorly' });
    });
  });
  return issues;
}

function formatBarcodeIssueSummary(issues) {
  if (!issues.length) return '';
  var first = issues[0];
  var rowText = first.rowIndex == null ? '' : 'row ' + (first.rowIndex + 1) + ' ';
  var suffix  = issues.length > 1 ? ' and ' + (issues.length - 1) + ' more issue' + plural(issues.length - 1) : '';
  return rowText + first.message + ' in ' + first.label + suffix + '.';
}

function buildSheetGeometry(preset) {
  var cells = [];
  for (var row = 0; row < preset.rows; row++) {
    for (var col = 0; col < preset.columns; col++) {
      var xIn = preset.leftMargin + col * preset.horizontalPitch;
      var yIn = preset.topMargin  + row * preset.verticalPitch;
      cells.push({ xIn: xIn, yIn: yIn, widthIn: preset.labelWidth, heightIn: preset.labelHeight,
        leftPct: (xIn / preset.pageWidth) * 100, topPct: (yIn / preset.pageHeight) * 100,
        widthPct: (preset.labelWidth / preset.pageWidth) * 100, heightPct: (preset.labelHeight / preset.pageHeight) * 100 });
    }
  }
  return { cells: cells,
    gridLeftPct: (preset.leftMargin / preset.pageWidth) * 100,
    gridTopPct:  (preset.topMargin  / preset.pageHeight) * 100,
    gridWidthPct:  ((preset.columns - 1) * preset.horizontalPitch + preset.labelWidth) / preset.pageWidth  * 100,
    gridHeightPct: ((preset.rows    - 1) * preset.verticalPitch   + preset.labelHeight) / preset.pageHeight * 100 };
}

// ─── Field geometry helpers ───────────────────────────────────
function getOverlapFieldIds() {
  var ids = new Set();
  for (var i = 0; i < state.template.fields.length; i++)
    for (var j = i + 1; j < state.template.fields.length; j++)
      if (fieldsOverlap(state.template.fields[i], state.template.fields[j])) {
        ids.add(state.template.fields[i].id); ids.add(state.template.fields[j].id);
      }
  return ids;
}

function fieldsOverlap(a, b) {
  return a.colStart < b.colEnd && a.colEnd > b.colStart && a.rowStart < b.rowEnd && a.rowEnd > b.rowStart;
}

function clampFieldToGrid(field) {
  var grid = state.template.grid;
  var w = Math.max(1, field.colEnd - field.colStart);
  var h = Math.max(1, field.rowEnd - field.rowStart);
  field.colStart = clamp(field.colStart, 1, grid.cols);
  field.rowStart = clamp(field.rowStart, 1, grid.rows);
  field.colEnd   = clamp(field.colStart + w, field.colStart + 1, grid.cols + 1);
  field.rowEnd   = clamp(field.rowStart + h, field.rowStart + 1, grid.rows + 1);
  if (field.colEnd > grid.cols + 1) { field.colEnd = grid.cols + 1; field.colStart = Math.max(1, field.colEnd - w); }
  if (field.rowEnd > grid.rows + 1) { field.rowEnd = grid.rows + 1; field.rowStart = Math.max(1, field.rowEnd - h); }
}

// ─── Getters ──────────────────────────────────────────────────
function getFieldValue(field, row) {
  if (field.type === 'staticText') return field.staticText || '';
  return String((row && row[field.sourceColumn]) || '').trim();
}

function getActivePreset()        { return state.outputMode === 'thermal' ? getActiveThermalPreset() : getActiveLaserPreset(); }
function getActiveLaserPreset()   { return state.selectedLaserPresetId   === CUSTOM_LASER_ID   ? state.customLaserPreset   : findLaserPreset(state.selectedLaserPresetId)   || state.customLaserPreset; }
function getActiveThermalPreset() { return state.selectedThermalPresetId === CUSTOM_THERMAL_ID ? state.customThermalPreset : findThermalPreset(state.selectedThermalPresetId) || state.customThermalPreset; }
function findLaserPreset(id)   { return state.laserPresets.find(function (p)   { return p.id === id; }) || null; }
function findThermalPreset(id) { return state.thermalPresets.find(function (p) { return p.id === id; }) || null; }
function getSelectedField()    { return findField(state.selectedFieldId); }
function findField(id)         { return state.template.fields.find(function (f) { return f.id === id; }) || null; }
function cloneField(f)         { return Object.assign({}, f); }

// ─── Utilities (verbatim) ─────────────────────────────────────
function fieldTypeName(type) {
  if (type === 'datamatrix')  return 'DataMatrix';
  if (type === 'staticText')  return 'Static text';
  return 'CSV text';
}

function makeFieldId() { return 'field-' + Math.random().toString(36).slice(2, 10); }
function inchesToPoints(value) { return value * POINTS_PER_INCH; }
function numberOrDefault(value, fallback) { var n = Number(value); return Number.isFinite(n) ? n : fallback; }
function hasLocalStorage() { try { return !!window.localStorage && !!window.localStorage.getItem; } catch (e) { return false; } }
function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
function plural(count) { return count === 1 ? '' : 's'; }
function formatDecimal(value, digits) { var s = Number(value).toFixed(digits); return s.replace(/\.?0+$/, ''); }
function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
