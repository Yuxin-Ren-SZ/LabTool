'use strict';

const POINTS_PER_INCH = 72;
const CUSTOM_LASER_ID = '__custom_laser__';
const CUSTOM_THERMAL_ID = '__custom_thermal__';

const state = {
  csvText: '',
  csvRows: [],
  csvHeaders: [],
  csvDelimiter: ',',
  csvFirstRowHeader: true,
  presets: [],
  laserPresets: [],
  thermalPresets: [],
  outputMode: 'laser-sheet',
  selectedLaserPresetId: 'laser-avery-5160',
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
};

let barcodeCanvas = null;
let dragState = null;
let currentStep = 1;

document.addEventListener('DOMContentLoaded', init);

function init() {
  state.presets = sanitizePresetList((window.LABEL_GENERATOR_PRESET_CONFIG && window.LABEL_GENERATOR_PRESET_CONFIG.presets) || []);
  state.laserPresets = state.presets.filter(function (preset) { return preset.mode === 'laser-sheet'; });
  state.thermalPresets = state.presets.filter(function (preset) { return preset.mode === 'thermal'; });
  if (!findLaserPreset(state.selectedLaserPresetId) && state.laserPresets[0]) state.selectedLaserPresetId = state.laserPresets[0].id;
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
  document.getElementById('add-datamatrix-btn').addEventListener('click', addDataMatrixField);
  document.getElementById('add-csv-text-btn').addEventListener('click', addCsvTextField);
  document.getElementById('add-static-text-btn').addEventListener('click', addStaticTextField);
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

  document.getElementById('delimiter-select').addEventListener('change', onDelimiterChange);
  document.getElementById('first-row-header').addEventListener('change', onFirstRowHeaderChange);
  document.getElementById('csv-drop-zone').addEventListener('dragover', onDropZoneDragOver);
  document.getElementById('csv-drop-zone').addEventListener('dragleave', function (event) {
    event.currentTarget.classList.remove('drag-over');
  });
  document.getElementById('csv-drop-zone').addEventListener('drop', onDropZoneDrop);
  document.getElementById('csv-drop-zone').addEventListener('click', function () {
    document.getElementById('csv-file-input').click();
  });

  document.getElementById('btn-next-1').addEventListener('click', goToStep2);
  document.getElementById('btn-back-2').addEventListener('click', goToStep1);
  document.getElementById('btn-next-2').addEventListener('click', goToStep3);
  document.getElementById('btn-back-3').addEventListener('click', goToStep2FromStep3);
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

function parseCSV(text, options) {
  options = options || {};
  if (!text || !text.trim()) {
    state.csvRows = [];
    state.csvHeaders = [];
    state.csvDelimiter = ',';
    state.csvFirstRowHeader = true;
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
  if (!best.rows.length) {
    state.csvRows = [];
    state.csvHeaders = [];
    state.csvFirstRowHeader = true;
    return;
  }

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
  parseCSV(state.csvText); // auto-detect delimiter and header
  // Sync the header checkbox to reflect what was detected
  var headerEl = document.getElementById('first-row-header');
  if (headerEl) headerEl.checked = state.csvFirstRowHeader;
  initializeSequentialPlan(0);
  markOutputDirty();
  renderAll();
}

function onDelimiterChange() {
  var delimEl = document.getElementById('delimiter-select');
  var headerEl = document.getElementById('first-row-header');
  var opts = { forceHeader: headerEl ? headerEl.checked : state.csvFirstRowHeader };
  if (delimEl.value !== 'auto') opts.forceDelimiter = delimEl.value;
  parseCSV(state.csvText, opts);
  initializeSequentialPlan(0);
  markOutputDirty();
  renderAll();
}

function onFirstRowHeaderChange() {
  var delimEl = document.getElementById('delimiter-select');
  var headerEl = document.getElementById('first-row-header');
  var opts = { forceHeader: headerEl.checked };
  if (delimEl && delimEl.value !== 'auto') opts.forceDelimiter = delimEl.value;
  parseCSV(state.csvText, opts);
  initializeSequentialPlan(0);
  markOutputDirty();
  renderAll();
}

function onDropZoneDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add('drag-over');
}

function onDropZoneDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    document.getElementById('csv-textarea').value = String(reader.result || '');
    onCsvTextInput();
  };
  reader.readAsText(file);
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
  if (currentStep === 1) renderStep1();
  else if (currentStep === 2) renderStep2();
  else renderStep3();
}

function renderStep1() {
  renderCsvSummary();
  renderStep1Preview();
  updateStep1NextButton();
}

function renderStep2() {
  renderPresetSelects();
  renderFieldList();
  renderFieldEditor();
  renderOutputControls();
  renderDesigner();
  renderPlacement();
  updateStep2NextButton();
}

function renderStep3() {
  renderExportState();
}

function renderPresetSelects() {
  var laserSelect = document.getElementById('laser-preset-select');
  laserSelect.innerHTML = state.laserPresets.map(function (preset) {
    return '<option value="' + escapeHtml(preset.id) + '">' + escapeHtml(preset.name + (preset.sku ? ' · ' + preset.sku : '')) + '</option>';
  }).join('') + '<option value="' + CUSTOM_LASER_ID + '">Custom laser sheet</option>';
  laserSelect.value = state.selectedLaserPresetId;

  var thermalSelect = document.getElementById('thermal-preset-select');
  thermalSelect.innerHTML = state.thermalPresets.map(function (preset) {
    return '<option value="' + escapeHtml(preset.id) + '">' + escapeHtml(preset.name) + '</option>';
  }).join('') + '<option value="' + CUSTOM_THERMAL_ID + '">Custom thermal label</option>';
  thermalSelect.value = state.selectedThermalPresetId;
}

function renderCsvSummary() {
  if (!state.csvRows.length) {
    setStatus('csv-status', 'Upload a CSV file or paste CSV text to begin.', 'info');
    return;
  }
  var delimiterLabel = state.csvDelimiter === '\t' ? 'Tab' : state.csvDelimiter === ';' ? 'Semicolon' : 'Comma';
  setStatus('csv-status',
    state.csvRows.length + ' row' + plural(state.csvRows.length) + ' · ' +
    state.csvHeaders.length + ' column' + plural(state.csvHeaders.length) + ' · ' +
    delimiterLabel + ' delimiter' + (state.csvFirstRowHeader ? ' · Header row detected' : ' · No header'),
    'success');
}

function renderStep1Preview() {
  var section = document.getElementById('csv-preview-section');
  if (!section) return;
  if (!state.csvRows.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  var colLetters = state.csvHeaders.map(function (_, i) {
    return i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
  });

  var headHtml = '<thead><tr><th>#</th>' +
    state.csvHeaders.map(function (h, i) {
      return '<th>' + escapeHtml(colLetters[i]) + '<br><span style="font-weight:400;">' + escapeHtml(h) + '</span></th>';
    }).join('') + '</tr></thead>';

  var bodyHtml = '<tbody>' + state.csvRows.slice(0, 10).map(function (row, ri) {
    return '<tr><td>' + (ri + 1) + '</td>' +
      state.csvHeaders.map(function (_, ci) {
        return '<td>' + escapeHtml((row[ci] || '').trim()) + '</td>';
      }).join('') + '</tr>';
  }).join('') + '</tbody>';

  var tableEl = document.getElementById('csv-preview-table');
  if (tableEl) tableEl.innerHTML = headHtml + bodyHtml;

  var summaryEl = document.getElementById('csv-col-summary');
  if (summaryEl) {
    summaryEl.innerHTML = state.csvHeaders.map(function (header, ci) {
      var values = state.csvRows.map(function (r) { return (r[ci] || '').trim(); }).filter(function (v) { return v !== ''; });
      var allNumeric = values.length > 0 && values.every(function (v) { return !isNaN(Number(v)); });
      var uniqueCount = new Set(values).size;
      var hint = allNumeric ? 'numeric' :
                 uniqueCount === 1 ? 'all same' :
                 uniqueCount === values.length ? 'all unique' :
                 uniqueCount + ' unique';
      return '<span class="col-badge">' + escapeHtml(colLetters[ci]) + ': ' + escapeHtml(header) + ' · ' + hint + '</span>';
    }).join('');
  }
}

function updateStep1NextButton() {
  var btn = document.getElementById('btn-next-1');
  if (btn) btn.disabled = !state.csvRows.length;
}

function updateStep2NextButton() {
  var btn = document.getElementById('btn-next-2');
  if (btn) btn.disabled = !state.template.fields.some(function (f) { return f.type === 'datamatrix'; });
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
  setStatus('output-status', (isLaser ? 'Laser sheet' : 'Thermal labels') + ' · ' + preset.name + ' · label ' + formatDecimal(preset.labelWidth, 3) + ' × ' + formatDecimal(preset.labelHeight, 3) + ' in', 'info');
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
    html += '<div class="' + classes + '" data-drag-field="' + field.id + '" data-type="' + field.type + '" style="left:' + left + '%;top:' + top + '%;width:' + width + '%;height:' + height + '%;text-align:' + field.align + ';">' + escapeHtml(field.label) + '<span class="field-resize-handle" data-resize-field="' + field.id + '"></span></div>';
  });
  stage.innerHTML = html;
  stage.querySelectorAll('[data-drag-field]').forEach(function (block) {
    block.addEventListener('mousedown', startFieldDrag);
  });
  stage.querySelectorAll('[data-resize-field]').forEach(function (handle) {
    handle.addEventListener('mousedown', startFieldResize);
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
    fieldId: field.id,
    startX: event.clientX,
    startY: event.clientY,
    startField: cloneField(field),
    stageRect: document.getElementById('label-stage').getBoundingClientRect(),
  };
  document.addEventListener('mousemove', onFieldDragMove);
  document.addEventListener('mouseup', endFieldDrag);
  event.preventDefault();
  renderAll();
}

function startFieldResize(event) {
  var field = findField(event.target.dataset.resizeField);
  if (!field) return;
  state.selectedFieldId = field.id;
  dragState = {
    type: 'resize',
    fieldId: field.id,
    startX: event.clientX,
    startY: event.clientY,
    startField: cloneField(field),
    stageRect: document.getElementById('label-stage').getBoundingClientRect(),
  };
  document.addEventListener('mousemove', onFieldDragMove);
  document.addEventListener('mouseup', endFieldDrag);
  event.stopPropagation();
  event.preventDefault();
}

function onFieldDragMove(event) {
  if (!dragState) return;
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
  document.removeEventListener('mousemove', onFieldDragMove);
  document.removeEventListener('mouseup', endFieldDrag);
  renderAll();
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
  var canGenerate = hasData && hasFields && hasDataMatrix && !state.isGenerating;
  document.getElementById('generate-btn').disabled = !canGenerate;
  document.getElementById('download-btn').disabled = !state.outputBytes || state.outputDirty;
  var summary = state.outputMode === 'laser-sheet'
    ? 'Laser PDF · ' + getUseIndices().length + ' labels · ' + Math.max(1, Math.ceil(state.layoutCells.length / Math.max(1, getActiveLaserPreset().columns * getActiveLaserPreset().rows))) + ' sheet' + plural(Math.max(1, Math.ceil(state.layoutCells.length / Math.max(1, getActiveLaserPreset().columns * getActiveLaserPreset().rows))))
    : 'Thermal PDF · ' + state.csvRows.length + ' label page' + plural(state.csvRows.length);
  document.getElementById('output-summary').innerHTML = '<div class="lt-alert lt-alert-info">' + escapeHtml(summary) + '</div>';
  updateOutputPreview();
}

async function generatePdf() {
  if (!state.csvRows.length) return setStatus('export-status', 'Load CSV data first.', 'warn');
  if (!state.template.fields.some(function (field) { return field.type === 'datamatrix'; })) return setStatus('export-status', 'Add one DataMatrix field before exporting.', 'warn');
  state.isGenerating = true;
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
    setStatus('export-status', 'Generated PDF with ' + state.csvRows.length + ' label' + plural(state.csvRows.length) + '.', 'success');
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
    await drawLabel(doc, page, font, boldFont, state.csvRows[i], { x: 0, y: 0, width: width, height: height });
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
      });
    }
  }
}

async function drawLabel(doc, page, font, boldFont, row, labelRect) {
  if (state.showBorder) {
    page.drawRectangle({ x: labelRect.x, y: labelRect.y, width: labelRect.width, height: labelRect.height, borderWidth: 0.35, borderColor: PDFLib.rgb(0.78, 0.78, 0.78) });
  }
  var grid = state.template.grid;
  for (var i = 0; i < state.template.fields.length; i++) {
    var field = state.template.fields[i];
    var rect = fieldToPdfRect(field, grid, labelRect);
    if (field.type === 'datamatrix') {
      await drawDataMatrix(doc, page, row, field, rect);
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

async function drawDataMatrix(doc, page, row, field, rect) {
  var text = getFieldValue(field, row) || ' ';
  var pngBytes = await renderDataMatrixToPng(text);
  if (!pngBytes) return;
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
  clearOutputPreview();
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

function transitionTo(toStep) {
  if (currentStep === toStep) return;
  document.getElementById('step' + currentStep).classList.remove('active');
  var toEl = document.getElementById('step' + toStep);
  if (toStep < currentStep) {
    toEl.classList.add('slide-back');
  } else {
    toEl.classList.remove('slide-back');
  }
  toEl.classList.add('active');
  currentStep = toStep;
  updatePips();
  renderAll();
}

function updatePips() {
  [1, 2, 3].forEach(function (n) {
    var pip = document.getElementById('pip' + n);
    if (!pip) return;
    pip.classList.remove('active', 'done');
    if (n < currentStep) pip.classList.add('done');
    else if (n === currentStep) pip.classList.add('active');
    if (n < 3) {
      var conn = document.getElementById('conn' + n);
      if (conn) conn.classList.toggle('done', n < currentStep);
    }
  });
}

function goToStep1() { transitionTo(1); }
function goToStep2() { transitionTo(2); }
function goToStep3() { transitionTo(3); }
function goToStep2FromStep3() { transitionTo(2); }

function inchesToPoints(value) {
  return value * POINTS_PER_INCH;
}

function numberOrDefault(value, fallback) {
  var parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
