'use strict';

const POINTS_PER_INCH = 72;
const CUSTOM_LASER_ID = '__custom_laser__';
const CUSTOM_THERMAL_ID = '__custom_thermal__';
const TEMPLATE_STORAGE_KEY = 'labtools.labelGenerator.template.v1';
const THERMAL_TO_LASER_USER_PRESETS_KEY = 'labtools:thermal-to-laser:user-presets:v1';
const CSV_HEADER_AUTO = 'auto';
const CSV_HEADER_YES = 'yes';
const CSV_HEADER_NO = 'no';

const state = {
  csvText: '',
  csvRows: [],
  csvHeaders: [],
  csvDelimiter: ',',
  csvFirstRowHeader: true,
  csvHeaderMode: CSV_HEADER_AUTO,
  presets: [],
  laserPresets: [],
  thermalPresets: [],
  outputMode: 'laser-sheet',
  selectedLaserPresetId: 'labtools-9187-1258',
  selectedThermalPresetId: 'thermal-cryo-128x05',
  customLaserPreset: {
    id: CUSTOM_LASER_ID,
    name: 'Custom laser sheet',
    mode: 'laser-sheet',
    pageWidth: 8.5,
    pageHeight: 11,
    topMargin: 0.5,
    leftMargin: 0.1875,
    horizontalPitch: 2.75,
    verticalPitch: 1,
    labelWidth: 2.625,
    labelHeight: 1,
    columns: 3,
    rows: 10,
  },
  customThermalPreset: {
    id: CUSTOM_THERMAL_ID,
    name: 'Custom thermal label',
    mode: 'thermal',
    labelWidth: 1.28,
    labelHeight: 0.5,
    pageWidth: 1.28,
    pageHeight: 0.5,
    topMargin: 0,
    leftMargin: 0,
    horizontalPitch: 1.28,
    verticalPitch: 0.5,
    columns: 1,
    rows: 1,
  },
  template: {
    grid: { cols: 12, rows: 6 },
    fields: [],
  },
  selectedFieldId: '',
  layoutCells: [],
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

function init() {
  state.presets = sanitizePresetList((window.LABEL_GENERATOR_PRESET_CONFIG && window.LABEL_GENERATOR_PRESET_CONFIG.presets) || []);
  state.laserPresets = buildSharedLaserPresets();
  state.thermalPresets = state.presets.filter(function (preset) { return preset.mode === 'thermal'; });
  if (!findLaserPreset(state.selectedLaserPresetId) && state.laserPresets[0]) state.selectedLaserPresetId = state.laserPresets[0].id;
  if (!findLaserPreset(state.selectedLaserPresetId) && !state.laserPresets[0]) state.selectedLaserPresetId = CUSTOM_LASER_ID;
  if (!findThermalPreset(state.selectedThermalPresetId) && state.thermalPresets[0]) state.selectedThermalPresetId = state.thermalPresets[0].id;
  initializeDefaultTemplate();
  recomputeGrid(true);
  bindEvents();
  initializeSequentialPlan(0);
  renderAll();
}

function bindEvents() {
  document.getElementById('csv-upload-btn').addEventListener('click', function () {
    document.getElementById('csv-file-input').click();
  });
  document.getElementById('csv-file-input').addEventListener('change', onCsvFileUpload);
  document.getElementById('csv-textarea').addEventListener('input', onCsvTextInput);
  document.getElementById('csv-header-mode').addEventListener('change', onCsvHeaderModeChange);
  document.getElementById('add-datamatrix-btn').addEventListener('click', addDataMatrixField);
  document.getElementById('add-csv-text-btn').addEventListener('click', addCsvTextField);
  document.getElementById('add-static-text-btn').addEventListener('click', addStaticTextField);
  document.getElementById('save-template-btn').addEventListener('click', saveTemplateToStorage);
  document.getElementById('load-template-btn').addEventListener('click', loadTemplateFromStorage);
  document.getElementById('reset-template-btn').addEventListener('click', resetTemplate);
  document.getElementById('field-label-input').addEventListener('input', updateSelectedFieldFromEditor);
  document.getElementById('field-source-select').addEventListener('change', updateSelectedFieldFromEditor);
  document.getElementById('field-static-input').addEventListener('input', updateSelectedFieldFromEditor);
  document.getElementById('field-align-select').addEventListener('change', updateSelectedFieldFromEditor);
  document.getElementById('field-font-scale').addEventListener('input', updateSelectedFieldFromEditor);
  document.getElementById('remove-field-btn').addEventListener('click', removeSelectedField);
  document.getElementById('mode-laser-btn').addEventListener('click', function () { setOutputMode('laser-sheet'); });
  document.getElementById('mode-thermal-btn').addEventListener('click', function () { setOutputMode('thermal'); });
  document.getElementById('laser-preset-select').addEventListener('change', onLaserPresetChange);
  document.getElementById('thermal-preset-select').addEventListener('change', onThermalPresetChange);
  document.getElementById('show-border').addEventListener('change', function (event) {
    state.showBorder = event.target.checked;
    markOutputDirty();
    renderAll();
  });

  ['pageWidth', 'pageHeight', 'leftMargin', 'topMargin', 'labelWidth', 'labelHeight', 'horizontalPitch', 'verticalPitch', 'columns', 'rows'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', onCustomLaserInput);
  });
  ['thermal-label-width', 'thermal-label-height'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', onCustomThermalInput);
  });

  document.querySelectorAll('[data-placement-mode]').forEach(function (button) {
    button.addEventListener('click', function () { setPlacementMode(button.dataset.placementMode); });
  });
  document.getElementById('reset-placement-btn').addEventListener('click', function () {
    initializeSequentialPlan(0);
    markOutputDirty();
    renderAll();
  });
  document.getElementById('generate-btn').addEventListener('click', generatePdf);
  document.getElementById('download-btn').addEventListener('click', downloadPdf);
}

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
  var stored = '';
  try {
    if (!window.localStorage || !window.localStorage.getItem) return [];
    stored = window.localStorage.getItem(THERMAL_TO_LASER_USER_PRESETS_KEY);
  } catch (err) {
    return [];
  }
  if (!stored) return [];
  try {
    var parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function normalizeSharedLaserPreset(preset, index) {
  if (!preset) return null;
  var rawId = String(preset.id || 'thermal-to-laser-preset-' + index);
  var normalized = {
    id: rawId,
    name: String(preset.name || rawId || 'Preset'),
    mode: 'laser-sheet',
    vendor: String(preset.vendor || ''),
    sku: String(preset.sku || ''),
    labelWidth: numberOrDefault(preset.labelWidth, 0),
    labelHeight: numberOrDefault(preset.labelHeight, 0),
    pageWidth: numberOrDefault(preset.pageWidth, 0),
    pageHeight: numberOrDefault(preset.pageHeight, 0),
    topMargin: numberOrDefault(preset.topMargin, 0),
    leftMargin: numberOrDefault(preset.leftMargin, numberOrDefault(preset.sideMargin, 0)),
    horizontalPitch: numberOrDefault(preset.horizontalPitch, 0),
    verticalPitch: numberOrDefault(preset.verticalPitch, 0),
    columns: Math.max(1, Math.round(numberOrDefault(preset.columns, 1))),
    rows: Math.max(1, Math.round(numberOrDefault(preset.rows, 1))),
    notes: String(preset.notes || ''),
    _origin: preset._origin === 'user' ? 'user' : 'builtin',
  };
  if (!normalized.id || normalized.labelWidth <= 0 || normalized.labelHeight <= 0) return null;
  if (normalized.pageWidth <= 0 || normalized.pageHeight <= 0) return null;
  if (normalized.horizontalPitch <= 0 || normalized.verticalPitch <= 0) return null;
  return normalized;
}

function initializeDefaultTemplate() {
  state.template.fields = [
    {
      id: makeFieldId(),
      type: 'datamatrix',
      label: 'DataMatrix',
      sourceColumn: 0,
      staticText: '',
      colStart: 1,
      rowStart: 1,
      colEnd: 5,
      rowEnd: 5,
      align: 'center',
      fontScale: 1,
    },
    {
      id: makeFieldId(),
      type: 'csvText',
      label: 'Sample ID',
      sourceColumn: 0,
      staticText: '',
      colStart: 5,
      rowStart: 1,
      colEnd: 13,
      rowEnd: 3,
      align: 'left',
      fontScale: 1.1,
    },
    {
      id: makeFieldId(),
      type: 'staticText',
      label: 'Static Text',
      sourceColumn: 0,
      staticText: 'LabTools',
      colStart: 5,
      rowStart: 3,
      colEnd: 13,
      rowEnd: 5,
      align: 'left',
      fontScale: 0.9,
    },
  ];
  state.selectedFieldId = state.template.fields[0].id;
}

function parseCSV(text) {
  parseCsvWithHeaderMode(text, state.csvHeaderMode);
}

function parseCsvWithHeaderMode(text, headerMode) {
  if (!text || !text.trim()) {
    state.csvRows = [];
    state.csvHeaders = [];
    state.csvDelimiter = ',';
    state.csvFirstRowHeader = true;
    return;
  }

  var rowsByDelimiter = [',', '\t', ';'].map(function (delimiter) {
    var parsed = parseDelimitedRows(text, delimiter).filter(function (row) {
      return row.some(function (cell) { return cell.trim() !== ''; });
    });
    var width = parsed.length ? parsed[0].length : 0;
    var sameWidth = parsed.every(function (row) { return row.length === width; });
    return { delimiter: delimiter, rows: parsed, score: (sameWidth ? 1000 : 0) + width * 10 + parsed.length };
  }).sort(function (left, right) { return right.score - left.score; });

  var best = rowsByDelimiter[0];
  state.csvDelimiter = best.delimiter;
  if (!best.rows.length) {
    state.csvRows = [];
    state.csvHeaders = [];
    state.csvFirstRowHeader = true;
    return;
  }

  var firstRow = best.rows[0];
  var firstLooksLikeHeader = firstRow.every(function (cell) { return cell.trim() === '' || isNaN(Number(cell)); });
  var useHeader = headerMode === CSV_HEADER_YES || (headerMode !== CSV_HEADER_NO && firstLooksLikeHeader && best.rows.length > 1);
  if (useHeader) {
    state.csvHeaders = firstRow.map(function (cell, index) { return cell.trim() || 'Column ' + (index + 1); });
    state.csvRows = best.rows.slice(1);
    state.csvFirstRowHeader = true;
  } else {
    var maxCols = best.rows.reduce(function (max, row) { return Math.max(max, row.length); }, 0);
    state.csvHeaders = Array.from({ length: maxCols }, function (_, index) { return 'Col ' + (index + 1); });
    state.csvRows = best.rows;
    state.csvFirstRowHeader = false;
  }

  state.template.fields.forEach(function (field) {
    field.sourceColumn = clamp(field.sourceColumn, 0, Math.max(0, state.csvHeaders.length - 1));
  });
}

function parseDelimitedRows(text, delimiter) {
  var rows = [];
  var row = [];
  var cell = '';
  var inQuotes = false;

  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    var next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function onCsvTextInput() {
  state.csvText = document.getElementById('csv-textarea').value;
  parseCSV(state.csvText);
  initializeSequentialPlan(0);
  markOutputDirty();
  renderAll();
}

function onCsvHeaderModeChange(event) {
  state.csvHeaderMode = event.target.value;
  parseCSV(state.csvText);
  initializeSequentialPlan(0);
  markOutputDirty();
  renderAll();
}

function onCsvFileUpload(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    document.getElementById('csv-textarea').value = String(reader.result || '');
    onCsvTextInput();
  };
  reader.readAsText(file);
}

function addDataMatrixField() {
  if (state.template.fields.some(function (field) { return field.type === 'datamatrix'; })) return;
  addField({ type: 'datamatrix', label: 'DataMatrix', colStart: 1, rowStart: 1, colEnd: 5, rowEnd: 5, align: 'center', fontScale: 1 });
}

function addCsvTextField() {
  addField({ type: 'csvText', label: nextCsvLabel(), colStart: 5, rowStart: 1, colEnd: state.template.grid.cols + 1, rowEnd: 3, align: 'left', fontScale: 1 });
}

function addStaticTextField() {
  addField({ type: 'staticText', label: 'Static Text', staticText: 'Static text', colStart: 5, rowStart: 3, colEnd: state.template.grid.cols + 1, rowEnd: 5, align: 'left', fontScale: 1 });
}

function addField(seed) {
  var field = {
    id: makeFieldId(),
    type: seed.type,
    label: seed.label,
    sourceColumn: 0,
    staticText: seed.staticText || '',
    colStart: seed.colStart,
    rowStart: seed.rowStart,
    colEnd: seed.colEnd,
    rowEnd: seed.rowEnd,
    align: seed.align || 'left',
    fontScale: seed.fontScale || 1,
  };
  clampFieldToGrid(field);
  state.template.fields.push(field);
  state.selectedFieldId = field.id;
  markOutputDirty();
  renderAll();
}

function saveTemplateToStorage() {
  if (!hasLocalStorage()) return setStatus('template-status', 'Template storage is not available in this browser.', 'warn');
  window.localStorage.setItem(TEMPLATE_STORAGE_KEY, serializeTemplate());
  setStatus('template-status', 'Template saved in this browser.', 'success');
}

function loadTemplateFromStorage() {
  if (!hasLocalStorage()) return setStatus('template-status', 'Template storage is not available in this browser.', 'warn');
  var stored = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
  if (!stored) return setStatus('template-status', 'No saved template found in this browser.', 'warn');
  if (!loadStoredTemplate(stored)) return setStatus('template-status', 'Saved template could not be loaded.', 'danger');
  markOutputDirty();
  renderAll();
  setStatus('template-status', 'Template loaded from this browser.', 'success');
}

function resetTemplate() {
  initializeDefaultTemplate();
  recomputeGrid(false);
  markOutputDirty();
  renderAll();
  setStatus('template-status', 'Template reset to the default layout.', 'info');
}

function serializeTemplate() {
  return JSON.stringify({
    version: 1,
    grid: state.template.grid,
    fields: state.template.fields.map(function (field) {
      return {
        type: field.type,
        label: field.label,
        sourceColumn: field.sourceColumn,
        staticText: field.staticText,
        colStart: field.colStart,
        rowStart: field.rowStart,
        colEnd: field.colEnd,
        rowEnd: field.rowEnd,
        align: field.align,
        fontScale: field.fontScale,
      };
    }),
  });
}

function loadStoredTemplate(serialized) {
  var parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch (err) {
    return false;
  }
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
    id: makeFieldId(),
    type: type,
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

function removeSelectedField() {
  state.template.fields = state.template.fields.filter(function (field) { return field.id !== state.selectedFieldId; });
  state.selectedFieldId = state.template.fields[0] ? state.template.fields[0].id : '';
  markOutputDirty();
  renderAll();
}

function updateSelectedFieldFromEditor() {
  var field = getSelectedField();
  if (!field) return;
  field.label = document.getElementById('field-label-input').value.trim() || fieldTypeName(field.type);
  field.sourceColumn = Number(document.getElementById('field-source-select').value || 0);
  field.staticText = document.getElementById('field-static-input').value;
  field.align = document.getElementById('field-align-select').value;
  field.fontScale = clamp(Number(document.getElementById('field-font-scale').value || 1), 0.6, 2);
  markOutputDirty();
  renderAll();
}

function setOutputMode(mode) {
  state.outputMode = mode;
  recomputeGrid(true);
  markOutputDirty();
  renderAll();
}

function onLaserPresetChange(event) {
  state.selectedLaserPresetId = event.target.value;
  recomputeGrid(true);
  initializeSequentialPlan(0);
  markOutputDirty();
  renderAll();
}

function onThermalPresetChange(event) {
  state.selectedThermalPresetId = event.target.value;
  recomputeGrid(true);
  markOutputDirty();
  renderAll();
}

function onCustomLaserInput() {
  ['pageWidth', 'pageHeight', 'leftMargin', 'topMargin', 'labelWidth', 'labelHeight', 'horizontalPitch', 'verticalPitch'].forEach(function (id) {
    state.customLaserPreset[id] = numberOrDefault(document.getElementById(id).value, state.customLaserPreset[id]);
  });
  state.customLaserPreset.columns = Math.max(1, Math.round(numberOrDefault(document.getElementById('columns').value, state.customLaserPreset.columns)));
  state.customLaserPreset.rows = Math.max(1, Math.round(numberOrDefault(document.getElementById('rows').value, state.customLaserPreset.rows)));
  recomputeGrid(true);
  initializeSequentialPlan(0);
  markOutputDirty();
  renderAll();
}

function onCustomThermalInput() {
  state.customThermalPreset.labelWidth = numberOrDefault(document.getElementById('thermal-label-width').value, state.customThermalPreset.labelWidth);
  state.customThermalPreset.labelHeight = numberOrDefault(document.getElementById('thermal-label-height').value, state.customThermalPreset.labelHeight);
  state.customThermalPreset.pageWidth = state.customThermalPreset.labelWidth;
  state.customThermalPreset.pageHeight = state.customThermalPreset.labelHeight;
  state.customThermalPreset.horizontalPitch = state.customThermalPreset.labelWidth;
  state.customThermalPreset.verticalPitch = state.customThermalPreset.labelHeight;
  recomputeGrid(true);
  markOutputDirty();
  renderAll();
}

function recomputeGrid(remap) {
  var oldGrid = { cols: state.template.grid.cols, rows: state.template.grid.rows };
  var preset = getActivePreset();
  var nextGrid = computeDesignGrid(preset.labelWidth, preset.labelHeight);
  state.template.grid = nextGrid;
  state.template.fields.forEach(function (field) {
    if (remap && oldGrid.cols && oldGrid.rows) {
      field.colStart = Math.round((field.colStart - 1) / oldGrid.cols * nextGrid.cols) + 1;
      field.colEnd = Math.round((field.colEnd - 1) / oldGrid.cols * nextGrid.cols) + 1;
      field.rowStart = Math.round((field.rowStart - 1) / oldGrid.rows * nextGrid.rows) + 1;
      field.rowEnd = Math.round((field.rowEnd - 1) / oldGrid.rows * nextGrid.rows) + 1;
    }
    clampFieldToGrid(field);
  });
}

function computeDesignGrid(width, height) {
  var area = width * height;
  var cols = width < 1.5 ? 8 : width < 3.1 ? 12 : 16;
  var rows = height < 0.65 ? 4 : height < 1.4 ? 6 : 8;
  if (area < 0.45) return { cols: 6, rows: 4 };
  if (width / height > 4) cols += 2;
  if (height / width > 1.2) rows += 2;
  return { cols: cols, rows: rows };
}

function initializeSequentialPlan(startIndex) {
  var preset = getActiveLaserPreset();
  var cellsPerSheet = Math.max(1, preset.columns * preset.rows);
  var labelCount = state.csvRows.length;
  var totalCells = Math.max(cellsPerSheet, Math.ceil((startIndex + labelCount) / cellsPerSheet) * cellsPerSheet);
  state.layoutCells = Array.from({ length: totalCells }, function (_, index) {
    if (index < startIndex) return { mode: 'available' };
    if (index < startIndex + labelCount) return { mode: 'use' };
    return { mode: 'available' };
  });
}

function markCellForLabel(index) {
  ensureCell(index);
  state.layoutCells[index].mode = 'use';
  ensureUseCount(index, index);
  trimUnusedTrailingSheets();
}

function skipCellAndAdvance(index) {
  ensureCell(index);
  state.layoutCells[index].mode = 'skip';
  ensureUseCount(index + 1, index);
  trimUnusedTrailingSheets();
}

function ensureUseCount(preferredFrom, lockedIndex) {
  var target = state.csvRows.length;
  ensureCell(preferredFrom);
  var used = getUseIndices();
  while (used.length > target) {
    var removed = false;
    for (var i = state.layoutCells.length - 1; i >= 0; i--) {
      if (i !== lockedIndex && state.layoutCells[i].mode === 'use') {
        state.layoutCells[i].mode = 'available';
        removed = true;
        break;
      }
    }
    if (!removed) break;
    used = getUseIndices();
  }
  var cursor = Math.max(0, preferredFrom);
  while (getUseIndices().length < target) {
    ensureCell(cursor);
    if (state.layoutCells[cursor].mode === 'available') state.layoutCells[cursor].mode = 'use';
    cursor++;
  }
}

function ensureCell(index) {
  var preset = getActiveLaserPreset();
  var cellsPerSheet = Math.max(1, preset.columns * preset.rows);
  while (index >= state.layoutCells.length) {
    for (var i = 0; i < cellsPerSheet; i++) state.layoutCells.push({ mode: 'available' });
  }
}

function trimUnusedTrailingSheets() {
  var preset = getActiveLaserPreset();
  var cellsPerSheet = Math.max(1, preset.columns * preset.rows);
  while (state.layoutCells.length > cellsPerSheet) {
    var tail = state.layoutCells.slice(state.layoutCells.length - cellsPerSheet);
    if (tail.some(function (cell) { return cell.mode !== 'available'; })) break;
    state.layoutCells.splice(state.layoutCells.length - cellsPerSheet, cellsPerSheet);
  }
}

function getUseIndices() {
  var indices = [];
  state.layoutCells.forEach(function (cell, index) {
    if (cell.mode === 'use') indices.push(index);
  });
  return indices;
}

function buildLabelIndexMap() {
  var map = new Map();
  getUseIndices().forEach(function (cellIndex, labelIndex) {
    map.set(cellIndex, labelIndex);
  });
  return map;
}

function setPlacementMode(mode) {
  state.placementMode = mode;
  renderAll();
}

function onSheetCellClick(index) {
  if (!state.csvRows.length) return;
  if (state.placementMode === 'start') initializeSequentialPlan(index);
  if (state.placementMode === 'use') markCellForLabel(index);
  if (state.placementMode === 'skip') skipCellAndAdvance(index);
  markOutputDirty();
  renderAll();
}

function renderAll() {
  renderPresetSelects();
  renderCsvSummary();
  renderFieldList();
  renderFieldEditor();
  renderOutputControls();
  renderDesigner();
  renderPlacement();
  renderExportState();
}

function renderPresetSelects() {
  var laserSelect = document.getElementById('laser-preset-select');
  laserSelect.innerHTML = state.laserPresets.map(function (preset) {
    var source = preset._origin === 'user' ? ' · Saved' : '';
    return '<option value="' + escapeHtml(preset.id) + '">' + escapeHtml(preset.name + (preset.sku ? ' · ' + preset.sku : '') + source) + '</option>';
  }).join('') + '<option value="' + CUSTOM_LASER_ID + '">Custom laser sheet</option>';
  laserSelect.value = state.selectedLaserPresetId;

  var thermalSelect = document.getElementById('thermal-preset-select');
  thermalSelect.innerHTML = state.thermalPresets.map(function (preset) {
    return '<option value="' + escapeHtml(preset.id) + '">' + escapeHtml(preset.name) + '</option>';
  }).join('') + '<option value="' + CUSTOM_THERMAL_ID + '">Custom thermal label</option>';
  thermalSelect.value = state.selectedThermalPresetId;
}

function renderCsvSummary() {
  var summary = document.getElementById('csv-summary');
  document.getElementById('csv-header-mode').value = state.csvHeaderMode;
  if (!state.csvRows.length) {
    summary.innerHTML = '';
    setStatus('csv-status', 'Upload a CSV file or paste CSV text to begin.', 'info');
    return;
  }
  var delimiterLabel = state.csvDelimiter === '\t' ? 'Tab' : state.csvDelimiter === ';' ? 'Semicolon' : 'Comma';
  setStatus('csv-status', state.csvRows.length + ' row' + plural(state.csvRows.length) + ' · ' + state.csvHeaders.length + ' column' + plural(state.csvHeaders.length) + ' · ' + delimiterLabel + ' delimiter' + (state.csvFirstRowHeader ? ' · Header detected' : ' · No header'), 'success');
  var headersHtml = state.csvHeaders.map(function (header) { return '<th>' + escapeHtml(header) + '</th>'; }).join('');
  var rowsHtml = state.csvRows.slice(0, 5).map(function (row) {
    return '<tr>' + state.csvHeaders.map(function (_, index) { return '<td>' + escapeHtml((row[index] || '').trim()) + '</td>'; }).join('') + '</tr>';
  }).join('');
  summary.innerHTML = '<div class="csv-preview-wrap"><table class="csv-preview-table"><thead><tr>' + headersHtml + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
}

function renderFieldList() {
  document.getElementById('add-datamatrix-btn').disabled = state.template.fields.some(function (field) { return field.type === 'datamatrix'; });
  document.getElementById('field-list').innerHTML = state.template.fields.map(function (field) {
    var source = field.type === 'staticText' ? field.staticText : (state.csvHeaders[field.sourceColumn] || 'Column ' + (field.sourceColumn + 1));
    return '<button class="field-item ' + (field.id === state.selectedFieldId ? 'active' : '') + '" type="button" data-field-id="' + field.id + '"><span><strong>' + escapeHtml(field.label) + '</strong><span>' + escapeHtml(fieldTypeName(field.type) + ' · ' + source) + '</span></span><span>' + (field.colEnd - field.colStart) + '×' + (field.rowEnd - field.rowStart) + '</span></button>';
  }).join('') || '<div class="lt-alert lt-alert-warn">Add at least one field before exporting.</div>';
  document.querySelectorAll('[data-field-id]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.selectedFieldId = button.dataset.fieldId;
      renderAll();
    });
  });
}

function renderFieldEditor() {
  var field = getSelectedField();
  document.getElementById('field-editor-panel').style.display = field ? '' : 'none';
  if (!field) return;
  document.getElementById('field-label-input').value = field.label;
  var sourceSelect = document.getElementById('field-source-select');
  var columnOptions = state.csvHeaders.length ? state.csvHeaders : ['Col 1'];
  sourceSelect.innerHTML = columnOptions.map(function (header, index) {
    return '<option value="' + index + '">' + escapeHtml(header) + '</option>';
  }).join('');
  sourceSelect.value = String(clamp(field.sourceColumn, 0, columnOptions.length - 1));
  document.getElementById('source-column-row').style.display = field.type === 'staticText' ? 'none' : '';
  document.getElementById('static-text-row').style.display = field.type === 'staticText' ? '' : 'none';
  document.getElementById('field-static-input').value = field.staticText || '';
  document.getElementById('field-align-select').value = field.align || 'left';
  document.getElementById('field-font-scale').value = field.fontScale || 1;
}

function renderOutputControls() {
  var isLaser = state.outputMode === 'laser-sheet';
  document.getElementById('mode-laser-btn').classList.toggle('active', isLaser);
  document.getElementById('mode-thermal-btn').classList.toggle('active', !isLaser);
  document.getElementById('laser-output-controls').style.display = isLaser ? '' : 'none';
  document.getElementById('thermal-output-controls').style.display = isLaser ? 'none' : '';
  document.getElementById('placement-section').style.display = isLaser ? '' : 'none';
  document.getElementById('custom-preset-fields').style.display = state.selectedLaserPresetId === CUSTOM_LASER_ID && isLaser ? '' : 'none';
  document.getElementById('thermal-custom-fields').style.display = state.selectedThermalPresetId === CUSTOM_THERMAL_ID && !isLaser ? '' : 'none';
  seedCustomFields();

  var preset = getActivePreset();
  var geometryStatus = validatePresetGeometry(preset);
  var capacity = isLaser ? ' · capacity ' + (preset.columns * preset.rows) + ' per sheet' : '';
  setStatus('output-status', (isLaser ? 'Laser sheet' : 'Thermal labels') + ' · ' + preset.name + ' · label ' + formatDecimal(preset.labelWidth, 3) + ' × ' + formatDecimal(preset.labelHeight, 3) + ' in' + capacity + '. ' + geometryStatus.message, geometryStatus.valid ? 'info' : 'warn');
  document.getElementById('show-border').checked = state.showBorder;
}

function seedCustomFields() {
  ['pageWidth', 'pageHeight', 'leftMargin', 'topMargin', 'labelWidth', 'labelHeight', 'horizontalPitch', 'verticalPitch', 'columns', 'rows'].forEach(function (id) {
    document.getElementById(id).value = state.customLaserPreset[id];
  });
  document.getElementById('thermal-label-width').value = state.customThermalPreset.labelWidth;
  document.getElementById('thermal-label-height').value = state.customThermalPreset.labelHeight;
}

function renderDesigner() {
  var stage = document.getElementById('label-stage');
  var preset = getActivePreset();
  var grid = state.template.grid;
  var overlapIds = getOverlapFieldIds();
  stage.style.setProperty('--label-aspect', preset.labelWidth + ' / ' + preset.labelHeight);
  stage.style.setProperty('--grid-cols', grid.cols);
  stage.style.setProperty('--grid-rows', grid.rows);
  var html = '<div class="label-stage-grid"></div>';
  state.template.fields.forEach(function (field) {
    var left = ((field.colStart - 1) / grid.cols) * 100;
    var top = ((field.rowStart - 1) / grid.rows) * 100;
    var width = ((field.colEnd - field.colStart) / grid.cols) * 100;
    var height = ((field.rowEnd - field.rowStart) / grid.rows) * 100;
    var classes = 'label-field-block' + (field.id === state.selectedFieldId ? ' active' : '') + (overlapIds.has(field.id) ? ' overlap' : '');
    html += '<div class="' + classes + '" data-drag-field="' + field.id + '" data-type="' + field.type + '" tabindex="0" role="button" aria-label="' + escapeHtml(field.label + ' field') + '" style="left:' + left + '%;top:' + top + '%;width:' + width + '%;height:' + height + '%;text-align:' + field.align + ';">' + escapeHtml(field.label) + '<span class="field-resize-handle" data-resize-field="' + field.id + '"></span></div>';
  });
  stage.innerHTML = html;
  stage.querySelectorAll('[data-drag-field]').forEach(function (block) {
    block.addEventListener('pointerdown', startFieldDrag);
    block.addEventListener('keydown', onFieldKeyDown);
  });
  stage.querySelectorAll('[data-resize-field]').forEach(function (handle) {
    handle.addEventListener('pointerdown', startFieldResize);
  });

  setStatus('geometry-status', 'Grid ' + grid.cols + ' × ' + grid.rows + ' · label ' + formatDecimal(preset.labelWidth, 3) + ' × ' + formatDecimal(preset.labelHeight, 3) + ' in. Drag fields or resize from the lower-right corner.', 'info');
  var warning = document.getElementById('overlap-warning');
  if (overlapIds.size) {
    warning.style.display = '';
    warning.textContent = 'Warning: overlapping fields are highlighted. Export is still allowed.';
  } else {
    warning.style.display = 'none';
    warning.textContent = '';
  }
  renderSamplePreview();
}

function startFieldDrag(event) {
  if (event.target.dataset.resizeField) return;
  var field = findField(event.currentTarget.dataset.dragField);
  if (!field) return;
  state.selectedFieldId = field.id;
  dragState = {
    type: 'move',
    pointerId: event.pointerId,
    fieldId: field.id,
    startX: event.clientX,
    startY: event.clientY,
    startField: cloneField(field),
    stageRect: document.getElementById('label-stage').getBoundingClientRect(),
  };
  document.addEventListener('pointermove', onFieldDragMove);
  document.addEventListener('pointerup', endFieldDrag);
  document.addEventListener('pointercancel', endFieldDrag);
  event.preventDefault();
  renderAll();
}

function startFieldResize(event) {
  var field = findField(event.target.dataset.resizeField);
  if (!field) return;
  state.selectedFieldId = field.id;
  dragState = {
    type: 'resize',
    pointerId: event.pointerId,
    fieldId: field.id,
    startX: event.clientX,
    startY: event.clientY,
    startField: cloneField(field),
    stageRect: document.getElementById('label-stage').getBoundingClientRect(),
  };
  document.addEventListener('pointermove', onFieldDragMove);
  document.addEventListener('pointerup', endFieldDrag);
  document.addEventListener('pointercancel', endFieldDrag);
  event.stopPropagation();
  event.preventDefault();
}

function onFieldDragMove(event) {
  if (!dragState) return;
  if (dragState.pointerId != null && event.pointerId !== dragState.pointerId) return;
  var field = findField(dragState.fieldId);
  var grid = state.template.grid;
  var dx = Math.round((event.clientX - dragState.startX) / dragState.stageRect.width * grid.cols);
  var dy = Math.round((event.clientY - dragState.startY) / dragState.stageRect.height * grid.rows);
  var width = dragState.startField.colEnd - dragState.startField.colStart;
  var height = dragState.startField.rowEnd - dragState.startField.rowStart;
  if (dragState.type === 'move') {
    field.colStart = dragState.startField.colStart + dx;
    field.rowStart = dragState.startField.rowStart + dy;
    field.colEnd = field.colStart + width;
    field.rowEnd = field.rowStart + height;
  } else {
    field.colEnd = dragState.startField.colEnd + dx;
    field.rowEnd = dragState.startField.rowEnd + dy;
  }
  clampFieldToGrid(field);
  markOutputDirty();
  renderDesigner();
}

function endFieldDrag() {
  dragState = null;
  document.removeEventListener('pointermove', onFieldDragMove);
  document.removeEventListener('pointerup', endFieldDrag);
  document.removeEventListener('pointercancel', endFieldDrag);
  renderAll();
}

function onFieldKeyDown(event) {
  var field = findField(event.currentTarget.dataset.dragField);
  if (!field) return;
  var handled = true;
  var resize = event.shiftKey;
  var delta = event.altKey ? 2 : 1;
  if (event.key === 'ArrowLeft') moveOrResizeField(field, resize, -delta, 0);
  else if (event.key === 'ArrowRight') moveOrResizeField(field, resize, delta, 0);
  else if (event.key === 'ArrowUp') moveOrResizeField(field, resize, 0, -delta);
  else if (event.key === 'ArrowDown') moveOrResizeField(field, resize, 0, delta);
  else handled = false;
  if (!handled) return;
  state.selectedFieldId = field.id;
  markOutputDirty();
  renderAll();
  event.preventDefault();
}

function moveOrResizeField(field, resize, dx, dy) {
  if (resize) {
    field.colEnd += dx;
    field.rowEnd += dy;
  } else {
    var width = field.colEnd - field.colStart;
    var height = field.rowEnd - field.rowStart;
    field.colStart += dx;
    field.rowStart += dy;
    field.colEnd = field.colStart + width;
    field.rowEnd = field.rowStart + height;
  }
  clampFieldToGrid(field);
}

function renderSamplePreview() {
  var row = state.csvRows[0] || [];
  var items = state.template.fields.map(function (field) {
    return '<div class="field-item"><span><strong>' + escapeHtml(field.label) + '</strong><span>' + escapeHtml(getFieldValue(field, row) || 'No sample value') + '</span></span></div>';
  }).join('');
  document.getElementById('label-sample-preview').innerHTML = '<div class="panel-heading" style="margin:12px 0 8px;">First Label Values</div><div class="field-list">' + items + '</div>';
}

function renderPlacement() {
  document.querySelectorAll('[data-placement-mode]').forEach(function (button) {
    button.classList.toggle('active', button.dataset.placementMode === state.placementMode);
  });
  if (state.outputMode !== 'laser-sheet') return;
  if (!state.layoutCells.length) initializeSequentialPlan(0);
  var preset = getActiveLaserPreset();
  var geometry = buildSheetGeometry(preset);
  var cellsPerSheet = Math.max(1, preset.columns * preset.rows);
  var labelMap = buildLabelIndexMap();
  var sheetCount = Math.max(1, Math.ceil(state.layoutCells.length / cellsPerSheet));
  setStatus('placement-status', state.csvRows.length ? getUseIndices().length + ' of ' + state.csvRows.length + ' labels planned across ' + sheetCount + ' sheet' + plural(sheetCount) + '.' : 'Load CSV data to plan sheet placement.', state.csvRows.length ? 'success' : 'info');

  var html = '';
  for (var sheetIndex = 0; sheetIndex < sheetCount; sheetIndex++) {
    var sheetStart = sheetIndex * cellsPerSheet;
    var usedOnSheet = 0;
    html += '<div class="sheet-card"><h3>Sheet ' + (sheetIndex + 1) + '</h3><div class="lt-preview-frame"><div class="lt-sheet-stage" style="--sheet-aspect:' + preset.pageWidth + ' / ' + preset.pageHeight + ';">';
    html += '<div class="lt-sheet-grid-region" style="left:' + geometry.gridLeftPct + '%;top:' + geometry.gridTopPct + '%;width:' + geometry.gridWidthPct + '%;height:' + geometry.gridHeightPct + '%;"></div>';
    geometry.cells.forEach(function (rect, cellIndex) {
      var globalIndex = sheetStart + cellIndex;
      var cell = state.layoutCells[globalIndex] || { mode: 'available' };
      if (cell.mode === 'use') usedOnSheet++;
      var modeClass = cell.mode === 'use' ? 'use' : cell.mode === 'skip' ? 'skip' : 'available';
      var token = cell.mode === 'use' ? 'L' + (labelMap.get(globalIndex) + 1) : cell.mode === 'skip' ? 'Skip' : 'Cell ' + (globalIndex + 1);
      html += '<button type="button" class="lt-sheet-cell lt-sheet-cell--' + modeClass + '" data-sheet-cell="' + globalIndex + '" style="left:' + rect.leftPct + '%;top:' + rect.topPct + '%;width:' + rect.widthPct + '%;height:' + rect.heightPct + '%;">' + escapeHtml(token) + '</button>';
    });
    html += '</div></div><div class="lt-legend-row"><span class="lt-legend-item"><span class="lt-legend-swatch lt-legend-swatch--use"></span>' + usedOnSheet + ' filled</span><span class="lt-legend-item"><span class="lt-legend-swatch lt-legend-swatch--open"></span>Open</span><span class="lt-legend-item">Skip</span></div></div>';
  }
  document.getElementById('sheet-preview').innerHTML = html;
  document.querySelectorAll('[data-sheet-cell]').forEach(function (button) {
    button.addEventListener('click', function () { onSheetCellClick(Number(button.dataset.sheetCell)); });
  });
}

function renderExportState() {
  var hasData = state.csvRows.length > 0;
  var hasFields = state.template.fields.length > 0;
  var hasDataMatrix = state.template.fields.some(function (field) { return field.type === 'datamatrix'; });
  var geometryStatus = validatePresetGeometry(getActivePreset());
  var barcodeIssues = detectBarcodeInputIssues();
  var blockingBarcodeIssues = barcodeIssues.filter(function (issue) { return issue.severity === 'danger'; });
  var canGenerate = hasData && hasFields && hasDataMatrix && geometryStatus.valid && !blockingBarcodeIssues.length && !state.isGenerating;
  document.getElementById('generate-btn').disabled = !canGenerate;
  document.getElementById('download-btn').disabled = !state.outputBytes || state.outputDirty;
  var summary = state.outputMode === 'laser-sheet'
    ? 'Laser PDF · ' + getUseIndices().length + ' labels · ' + Math.max(1, Math.ceil(state.layoutCells.length / Math.max(1, getActiveLaserPreset().columns * getActiveLaserPreset().rows))) + ' sheet' + plural(Math.max(1, Math.ceil(state.layoutCells.length / Math.max(1, getActiveLaserPreset().columns * getActiveLaserPreset().rows))))
    : 'Thermal PDF · ' + state.csvRows.length + ' label page' + plural(state.csvRows.length);
  var statusHtml = '<div class="lt-alert lt-alert-info">' + escapeHtml(summary) + '</div>';
  if (!geometryStatus.valid) statusHtml += '<div class="lt-alert lt-alert-warn">' + escapeHtml(geometryStatus.message) + '</div>';
  if (barcodeIssues.length) statusHtml += '<div class="lt-alert lt-alert-' + (blockingBarcodeIssues.length ? 'danger' : 'warn') + '">' + escapeHtml(formatBarcodeIssueSummary(barcodeIssues)) + '</div>';
  document.getElementById('output-summary').innerHTML = statusHtml;
  updateOutputPreview();
}

async function generatePdf() {
  if (!state.csvRows.length) return setStatus('export-status', 'Load CSV data first.', 'warn');
  if (!state.template.fields.some(function (field) { return field.type === 'datamatrix'; })) return setStatus('export-status', 'Add one DataMatrix field before exporting.', 'warn');
  var geometryStatus = validatePresetGeometry(getActivePreset());
  if (!geometryStatus.valid) return setStatus('export-status', geometryStatus.message, 'warn');
  var barcodeIssues = detectBarcodeInputIssues();
  if (barcodeIssues.some(function (issue) { return issue.severity === 'danger'; })) return setStatus('export-status', formatBarcodeIssueSummary(barcodeIssues), 'danger');
  state.isGenerating = true;
  state.barcodeIssues = [];
  clearOutputPreview();
  setStatus('export-status', 'Generating PDF...', 'info');
  renderExportState();

  try {
    var doc = await PDFLib.PDFDocument.create();
    var font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    var boldFont = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    if (state.outputMode === 'thermal') {
      await generateThermalPdf(doc, font, boldFont);
    } else {
      await generateLaserPdf(doc, font, boldFont);
    }
    doc.setTitle('LabTools Labels');
    doc.setProducer('LabTools');
    doc.setCreator('LabTools label-generator');
    state.outputBytes = await doc.save();
    state.outputDirty = false;
    var blob = new Blob([state.outputBytes], { type: 'application/pdf' });
    state.outputUrl = URL.createObjectURL(blob);
    if (state.barcodeIssues.length) {
      setStatus('export-status', 'Generated PDF, but ' + formatBarcodeIssueSummary(state.barcodeIssues), 'warn');
    } else {
      setStatus('export-status', 'Generated PDF with ' + state.csvRows.length + ' label' + plural(state.csvRows.length) + '.', 'success');
    }
  } catch (err) {
    setStatus('export-status', err && err.message ? err.message : 'Failed to generate PDF.', 'danger');
  } finally {
    state.isGenerating = false;
    renderAll();
  }
}

async function generateThermalPdf(doc, font, boldFont) {
  var preset = getActiveThermalPreset();
  var width = inchesToPoints(preset.labelWidth);
  var height = inchesToPoints(preset.labelHeight);
  for (var i = 0; i < state.csvRows.length; i++) {
    var page = doc.addPage([width, height]);
    await drawLabel(doc, page, font, boldFont, state.csvRows[i], { x: 0, y: 0, width: width, height: height }, i);
  }
}

async function generateLaserPdf(doc, font, boldFont) {
  var preset = getActiveLaserPreset();
  var geometry = buildSheetGeometry(preset);
  var cellsPerSheet = Math.max(1, preset.columns * preset.rows);
  var labelMap = buildLabelIndexMap();
  var sheetCount = Math.max(1, Math.ceil(state.layoutCells.length / cellsPerSheet));
  var pageWidth = inchesToPoints(preset.pageWidth);
  var pageHeight = inchesToPoints(preset.pageHeight);
  for (var sheetIndex = 0; sheetIndex < sheetCount; sheetIndex++) {
    var page = doc.addPage([pageWidth, pageHeight]);
    for (var cellIndex = 0; cellIndex < cellsPerSheet; cellIndex++) {
      var globalIndex = sheetIndex * cellsPerSheet + cellIndex;
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
  var x = labelRect.x + ((field.colStart - 1) / grid.cols) * labelRect.width;
  var top = ((field.rowStart - 1) / grid.rows) * labelRect.height;
  var width = ((field.colEnd - field.colStart) / grid.cols) * labelRect.width;
  var height = ((field.rowEnd - field.rowStart) / grid.rows) * labelRect.height;
  return { x: x + 2, y: labelRect.y + labelRect.height - top - height + 2, width: Math.max(1, width - 4), height: Math.max(1, height - 4) };
}

async function drawDataMatrix(doc, page, row, field, rect, rowIndex) {
  var text = getFieldValue(field, row);
  if (!text) {
    state.barcodeIssues.push({ rowIndex: rowIndex, label: field.label, severity: 'danger', message: 'blank DataMatrix value' });
    return;
  }
  var pngBytes = await renderDataMatrixToPng(text);
  if (!pngBytes) {
    throw new Error('DataMatrix render failed for row ' + (rowIndex + 1) + ' in ' + field.label + '.');
  }
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
  if (field.align === 'right') x = rect.x + Math.max(0, rect.width - textWidth);
  page.drawText(truncated, { x: x, y: rect.y + Math.max(1, (rect.height - fontSize) / 2), size: fontSize, font: font, color: PDFLib.rgb(0, 0, 0), maxWidth: rect.width });
}

function truncateToWidth(text, font, fontSize, maxWidth) {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  var suffix = '...';
  var out = text;
  while (out.length > 0 && font.widthOfTextAtSize(out + suffix, fontSize) > maxWidth) out = out.slice(0, -1);
  return out ? out + suffix : '';
}

function renderDataMatrixToPng(text) {
  return new Promise(function (resolve) {
    var canvas = getBarcodeCanvas();
    try {
      bwipjs.toCanvas(canvas, { bcid: 'datamatrix', text: String(text || ' '), scale: 4, includetext: false, paddingwidth: 0, paddingheight: 0 });
    } catch (err) {
      resolve(null);
      return;
    }
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
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 500);
}

function updateOutputPreview() {
  var preview = document.getElementById('pdf-preview');
  if (!state.outputUrl || state.outputDirty) {
    preview.innerHTML = '';
    return;
  }
  preview.innerHTML = '<embed class="output-embed" src="' + state.outputUrl + '" type="application/pdf" />';
}

function clearOutputPreview() {
  if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  state.outputUrl = '';
  state.outputBytes = null;
  document.getElementById('pdf-preview').innerHTML = '';
}

function markOutputDirty() {
  state.outputDirty = true;
  state.barcodeIssues = [];
  clearOutputPreview();
}

function validatePresetGeometry(preset) {
  var issues = [];
  ['pageWidth', 'pageHeight', 'labelWidth', 'labelHeight', 'horizontalPitch', 'verticalPitch'].forEach(function (key) {
    if (!Number.isFinite(Number(preset[key])) || Number(preset[key]) <= 0) issues.push(key + ' must be greater than 0');
  });
  if (!Number.isFinite(Number(preset.leftMargin)) || Number(preset.leftMargin) < 0) issues.push('left margin must be 0 or greater');
  if (!Number.isFinite(Number(preset.topMargin)) || Number(preset.topMargin) < 0) issues.push('top margin must be 0 or greater');
  if (!Number.isFinite(Number(preset.columns)) || Number(preset.columns) < 1) issues.push('columns must be at least 1');
  if (!Number.isFinite(Number(preset.rows)) || Number(preset.rows) < 1) issues.push('rows must be at least 1');
  if (issues.length) return { valid: false, message: issues[0] + '.' };

  if (preset.mode === 'laser-sheet') {
    var gridWidth = preset.leftMargin + (preset.columns - 1) * preset.horizontalPitch + preset.labelWidth;
    var gridHeight = preset.topMargin + (preset.rows - 1) * preset.verticalPitch + preset.labelHeight;
    if (gridWidth > preset.pageWidth + 0.0001) issues.push('label grid extends past the page width');
    if (gridHeight > preset.pageHeight + 0.0001) issues.push('label grid extends past the page height');
    if (preset.horizontalPitch < preset.labelWidth) issues.push('horizontal pitch is smaller than label width');
    if (preset.verticalPitch < preset.labelHeight) issues.push('vertical pitch is smaller than label height');
    return {
      valid: !issues.length,
      message: issues.length ? issues.join('; ') + '.' : 'Geometry fits the page.',
    };
  }

  return { valid: true, message: 'Geometry fits the label page.' };
}

function detectBarcodeInputIssues() {
  var dataMatrixFields = state.template.fields.filter(function (field) { return field.type === 'datamatrix'; });
  var issues = [];
  dataMatrixFields.forEach(function (field) {
    state.csvRows.forEach(function (row, rowIndex) {
      var value = getFieldValue(field, row);
      if (!value) {
        issues.push({ rowIndex: rowIndex, label: field.label, severity: 'danger', message: 'blank DataMatrix value' });
      } else if (value.length > 120) {
        issues.push({ rowIndex: rowIndex, label: field.label, severity: 'warn', message: 'long DataMatrix value may scan poorly' });
      }
    });
  });
  return issues;
}

function formatBarcodeIssueSummary(issues) {
  if (!issues.length) return '';
  var first = issues[0];
  var rowText = first.rowIndex == null ? '' : 'row ' + (first.rowIndex + 1) + ' ';
  var suffix = issues.length > 1 ? ' and ' + (issues.length - 1) + ' more issue' + plural(issues.length - 1) : '';
  return rowText + first.message + ' in ' + first.label + suffix + '.';
}

function buildSheetGeometry(preset) {
  var cells = [];
  for (var row = 0; row < preset.rows; row++) {
    for (var col = 0; col < preset.columns; col++) {
      var xIn = preset.leftMargin + col * preset.horizontalPitch;
      var yIn = preset.topMargin + row * preset.verticalPitch;
      cells.push({
        xIn: xIn,
        yIn: yIn,
        widthIn: preset.labelWidth,
        heightIn: preset.labelHeight,
        leftPct: (xIn / preset.pageWidth) * 100,
        topPct: (yIn / preset.pageHeight) * 100,
        widthPct: (preset.labelWidth / preset.pageWidth) * 100,
        heightPct: (preset.labelHeight / preset.pageHeight) * 100,
      });
    }
  }
  return {
    cells: cells,
    gridLeftPct: (preset.leftMargin / preset.pageWidth) * 100,
    gridTopPct: (preset.topMargin / preset.pageHeight) * 100,
    gridWidthPct: ((preset.columns - 1) * preset.horizontalPitch + preset.labelWidth) / preset.pageWidth * 100,
    gridHeightPct: ((preset.rows - 1) * preset.verticalPitch + preset.labelHeight) / preset.pageHeight * 100,
  };
}

function getOverlapFieldIds() {
  var ids = new Set();
  for (var i = 0; i < state.template.fields.length; i++) {
    for (var j = i + 1; j < state.template.fields.length; j++) {
      if (fieldsOverlap(state.template.fields[i], state.template.fields[j])) {
        ids.add(state.template.fields[i].id);
        ids.add(state.template.fields[j].id);
      }
    }
  }
  return ids;
}

function fieldsOverlap(a, b) {
  return a.colStart < b.colEnd && a.colEnd > b.colStart && a.rowStart < b.rowEnd && a.rowEnd > b.rowStart;
}

function clampFieldToGrid(field) {
  var grid = state.template.grid;
  var width = Math.max(1, field.colEnd - field.colStart);
  var height = Math.max(1, field.rowEnd - field.rowStart);
  field.colStart = clamp(field.colStart, 1, grid.cols);
  field.rowStart = clamp(field.rowStart, 1, grid.rows);
  field.colEnd = clamp(field.colStart + width, field.colStart + 1, grid.cols + 1);
  field.rowEnd = clamp(field.rowStart + height, field.rowStart + 1, grid.rows + 1);
  if (field.colEnd > grid.cols + 1) {
    field.colEnd = grid.cols + 1;
    field.colStart = Math.max(1, field.colEnd - width);
  }
  if (field.rowEnd > grid.rows + 1) {
    field.rowEnd = grid.rows + 1;
    field.rowStart = Math.max(1, field.rowEnd - height);
  }
}

function getFieldValue(field, row) {
  if (field.type === 'staticText') return field.staticText || '';
  return String((row && row[field.sourceColumn]) || '').trim();
}

function getActivePreset() {
  return state.outputMode === 'thermal' ? getActiveThermalPreset() : getActiveLaserPreset();
}

function getActiveLaserPreset() {
  return state.selectedLaserPresetId === CUSTOM_LASER_ID ? state.customLaserPreset : findLaserPreset(state.selectedLaserPresetId) || state.customLaserPreset;
}

function getActiveThermalPreset() {
  return state.selectedThermalPresetId === CUSTOM_THERMAL_ID ? state.customThermalPreset : findThermalPreset(state.selectedThermalPresetId) || state.customThermalPreset;
}

function findLaserPreset(id) {
  return state.laserPresets.find(function (preset) { return preset.id === id; }) || null;
}

function findThermalPreset(id) {
  return state.thermalPresets.find(function (preset) { return preset.id === id; }) || null;
}

function getSelectedField() {
  return findField(state.selectedFieldId);
}

function findField(id) {
  return state.template.fields.find(function (field) { return field.id === id; }) || null;
}

function cloneField(field) {
  return Object.assign({}, field);
}

function nextCsvLabel() {
  if (state.csvHeaders.length) return state.csvHeaders[Math.min(state.template.fields.length, state.csvHeaders.length - 1)];
  return 'CSV Text';
}

function fieldTypeName(type) {
  if (type === 'datamatrix') return 'DataMatrix';
  if (type === 'staticText') return 'Static text';
  return 'CSV text';
}

function makeFieldId() {
  return 'field-' + Math.random().toString(36).slice(2, 10);
}

function inchesToPoints(value) {
  return value * POINTS_PER_INCH;
}

function numberOrDefault(value, fallback) {
  var parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasLocalStorage() {
  try {
    return !!(window.localStorage && window.localStorage.setItem && window.localStorage.getItem);
  } catch (err) {
    return false;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function plural(count) {
  return count === 1 ? '' : 's';
}

function formatDecimal(value, digits) {
  return Number(value).toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function setStatus(id, message, type) {
  var el = document.getElementById(id);
  if (!el) return;
  el.className = 'lt-alert lt-alert-' + (type || 'info');
  el.textContent = message;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
