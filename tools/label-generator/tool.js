'use strict';

const STORAGE_KEY = 'labtools:label-generator:user-presets:v1';

const BARCODE_SIZES = {
  'S': { scale: 3, label: 'Small (2 mm)' },
  'M': { scale: 5, label: 'Medium (4 mm)' },
  'L': { scale: 8, label: 'Large (6 mm)' },
};

const GEOMETRY_FIELD_IDS = [
  'pageWidth', 'pageHeight', 'topMargin', 'leftMargin',
  'horizontalPitch', 'verticalPitch', 'labelWidth', 'labelHeight',
  'columns', 'rows',
];

const PRESET_FIELD_ORDER = [
  'id', 'name', 'mode', 'vendor', 'sku',
  'labelWidth', 'labelHeight', 'pageWidth', 'pageHeight',
  'topMargin', 'leftMargin', 'horizontalPitch', 'verticalPitch',
  'columns', 'rows', 'notes',
];

const state = {
  csvText: '',
  csvRows: [],
  csvHeaders: [],
  csvDelimiter: ',',
  csvFirstRowHeader: true,

  barcodeCol: 0,
  textLines: [-1, -1, -1, -1],

  barcodeSize: 'M',

  layoutMode: 'thermal',
  labelWidth: 0.75,
  labelHeight: 0.5,
  showBorder: true,

  builtInPresets: [],
  userPresets: [],
  selectedPresetId: '',
  draftPreset: null,
  currentPreset: null,
  currentPresetErrors: [],
  layoutCells: [],

  outputBytes: null,
  outputUrl: '',
  outputDirty: true,
  isGenerating: false,
};

let _barcodeCanvas = null;

document.addEventListener('DOMContentLoaded', init);

function init() {
  state.builtInPresets = sanitizePresetList(
    (window.LABEL_GENERATOR_PRESET_CONFIG && window.LABEL_GENERATOR_PRESET_CONFIG.presets) || [],
    'builtin'
  );
  state.userPresets = loadUserPresets();
  state.draftPreset = makeBlankPreset();

  bindEvents();
  renderAll();
}

function bindEvents() {
  document.getElementById('csv-upload-btn').addEventListener('click', function () {
    document.getElementById('csv-file-input').click();
  });
  document.getElementById('csv-file-input').addEventListener('change', onCsvFileUpload);
  document.getElementById('csv-textarea').addEventListener('input', onCsvTextInput);

  document.getElementById('barcode-col-select').addEventListener('change', onBarcodeColChange);
  for (var i = 0; i < 4; i++) {
    (function (idx) {
      document.getElementById('text-line-' + (idx + 1) + '-select').addEventListener('change', function (e) {
        onTextLineChange(idx, e);
      });
    })(i);
  }

  document.getElementById('barcode-size-select').addEventListener('change', function (e) {
    state.barcodeSize = e.target.value;
    state.outputDirty = true;
  });

  document.getElementById('layout-mode-thermal').addEventListener('click', function () { onLayoutModeChange('thermal'); });
  document.getElementById('layout-mode-laser').addEventListener('click', function () { onLayoutModeChange('laser-sheet'); });

  document.getElementById('thermal-label-width').addEventListener('input', onThermalSizeInput);
  document.getElementById('thermal-label-height').addEventListener('input', onThermalSizeInput);
  document.getElementById('show-border').addEventListener('change', function (e) {
    state.showBorder = e.target.checked;
    state.outputDirty = true;
  });

  document.getElementById('preset-select').addEventListener('change', onPresetSelectChanged);
  document.getElementById('save-preset-btn').addEventListener('click', saveCurrentPreset);
  document.getElementById('clear-saved-presets-btn').addEventListener('click', clearUserPresets);
  document.getElementById('copy-current-btn').addEventListener('click', copyCurrentPresetConfig);
  document.getElementById('export-all-btn').addEventListener('click', exportAllPresetConfigs);

  var editorFields = document.querySelectorAll('#preset-editor input, #preset-editor textarea');
  for (var j = 0; j < editorFields.length; j++) {
    editorFields[j].addEventListener('input', onPresetEditorInput);
  }

  document.getElementById('generate-btn').addEventListener('click', generatePdf);
  document.getElementById('download-btn').addEventListener('click', downloadPdf);
}

function makeBlankPreset() {
  return {
    id: '',
    name: '',
    mode: '',
    vendor: '',
    sku: '',
    pageWidth: 8.5,
    pageHeight: 11,
    topMargin: '',
    leftMargin: '',
    verticalPitch: '',
    horizontalPitch: '',
    labelHeight: '',
    labelWidth: '',
    columns: '',
    rows: '',
    notes: '',
  };
}

function populateEditorField(id, value) {
  var el = document.getElementById(id);
  if (el) el.value = valueOrEmpty(value);
}

function parseCSV(text) {
  if (!text || !text.trim()) {
    state.csvRows = [];
    state.csvHeaders = [];
    state.csvDelimiter = ',';
    state.csvFirstRowHeader = true;
    return;
  }

  var lines = text.split(/\r?\n/);
  var nonEmptyLines = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '') nonEmptyLines.push(lines[i]);
  }
  if (nonEmptyLines.length === 0) {
    state.csvRows = [];
    state.csvHeaders = [];
    state.csvDelimiter = ',';
    state.csvFirstRowHeader = true;
    return;
  }

  var delimiters = ['\t', ';', ','];
  var bestDelimiter = ',';
  var bestScore = 0;

  for (var d = 0; d < delimiters.length; d++) {
    var delim = delimiters[d];
    var colCounts = [];
    for (var li = 0; li < nonEmptyLines.length; li++) {
      colCounts.push(nonEmptyLines[li].split(delim).length);
    }
    var allSame = true;
    for (var ci = 1; ci < colCounts.length; ci++) {
      if (colCounts[ci] !== colCounts[0]) { allSame = false; break; }
    }
    var score = allSame ? colCounts[0] * 100 + colCounts.length : colCounts[0];
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delim;
    }
  }

  state.csvDelimiter = bestDelimiter;

  var parsedRows = [];
  for (var ri = 0; ri < nonEmptyLines.length; ri++) {
    parsedRows.push(nonEmptyLines[ri].split(bestDelimiter));
  }

  var hasHeader = false;
  if (parsedRows.length >= 1) {
    var firstRowAllNonNumeric = true;
    for (var fi = 0; fi < parsedRows[0].length; fi++) {
      var cell = parsedRows[0][fi].trim();
      if (cell !== '' && !isNaN(Number(cell))) {
        firstRowAllNonNumeric = false;
        break;
      }
    }
    hasHeader = firstRowAllNonNumeric;
  }

  if (hasHeader && parsedRows.length >= 1) {
    state.csvHeaders = parsedRows[0];
    state.csvRows = parsedRows.slice(1);
    state.csvFirstRowHeader = true;
  } else {
    state.csvRows = parsedRows;
    var maxCols = 0;
    for (var m = 0; m < parsedRows.length; m++) {
      if (parsedRows[m].length > maxCols) maxCols = parsedRows[m].length;
    }
    state.csvHeaders = [];
    for (var h = 0; h < maxCols; h++) {
      state.csvHeaders.push('Col ' + (h + 1));
    }
    state.csvFirstRowHeader = false;
  }
}

function onCsvTextInput() {
  var textarea = document.getElementById('csv-textarea');
  state.csvText = textarea.value;
  parseCSV(state.csvText);
  state.outputDirty = true;
  state.layoutCells = [];
  computeLayoutCells();
  renderAll();
}

function onCsvFileUpload(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    document.getElementById('csv-textarea').value = reader.result;
    onCsvTextInput();
  };
  reader.onerror = function () {
    setStatus('csv-status', 'Unable to read the selected file.', 'danger');
  };
  reader.readAsText(file);
  event.target.value = '';
}

function onBarcodeColChange(event) {
  state.barcodeCol = parseInt(event.target.value, 10) || 0;
  state.outputDirty = true;
}

function onTextLineChange(lineIndex, event) {
  state.textLines[lineIndex] = parseInt(event.target.value, 10) || -1;
  state.outputDirty = true;
}

function onLayoutModeChange(mode) {
  state.layoutMode = mode;
  state.outputDirty = true;
  state.layoutCells = [];

  document.getElementById('layout-mode-thermal').classList.toggle('active', mode === 'thermal');
  document.getElementById('layout-mode-laser').classList.toggle('active', mode === 'laser-sheet');

  if (mode === 'laser-sheet') {
    if (state.selectedPresetId && !findPresetById(state.selectedPresetId)) {
      state.selectedPresetId = '';
      state.draftPreset = makeBlankPreset();
    }
    recalcPreset();
  }

  computeLayoutCells();
  renderAll();
}

function sanitizePresetList(presets, origin) {
  return (Array.isArray(presets) ? presets : [])
    .map(function (preset, index) { return sanitizePreset(preset, origin, index); })
    .filter(Boolean);
}

function sanitizePreset(preset, origin, index) {
  if (!preset || typeof preset !== 'object') return null;

  var sanitized = {
    id: preset.id != null && preset.id !== '' ? String(preset.id) : (origin === 'editor' ? '' : origin + '-preset-' + (index + 1)),
    name: preset.name != null ? String(preset.name) : (origin === 'editor' ? '' : 'Preset ' + (index + 1)),
    mode: preset.mode != null ? String(preset.mode) : '',
    vendor: preset.vendor != null ? String(preset.vendor) : '',
    sku: preset.sku != null ? String(preset.sku) : '',
    pageWidth: toNumber(preset.pageWidth),
    pageHeight: toNumber(preset.pageHeight),
    topMargin: toNumber(preset.topMargin),
    leftMargin: toNumber(preset.leftMargin),
    verticalPitch: toNumber(preset.verticalPitch),
    horizontalPitch: toNumber(preset.horizontalPitch),
    labelHeight: toNumber(preset.labelHeight),
    labelWidth: toNumber(preset.labelWidth),
    columns: toInteger(preset.columns),
    rows: toInteger(preset.rows),
    notes: preset.notes != null ? String(preset.notes) : '',
    _origin: origin,
  };

  return sanitized;
}

function loadUserPresets() {
  var raw = labtoolsSafeJsonParse(localStorage.getItem(STORAGE_KEY), []);
  return sanitizePresetList(raw, 'user');
}

function persistUserPresets() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state.userPresets.map(function (preset) { return normalizePreset(preset); }), null, 2)
  );
}

function allPresets() {
  return state.builtInPresets.concat(state.userPresets);
}

function findPresetById(id) {
  return allPresets().find(function (preset) { return preset.id === id; }) || null;
}

function clonePresetDraft(preset) {
  return sanitizePreset({
    id: preset.id || '',
    name: preset.name || '',
    mode: preset.mode || '',
    vendor: preset.vendor || '',
    sku: preset.sku || '',
    pageWidth: valueOrEmpty(preset.pageWidth),
    pageHeight: valueOrEmpty(preset.pageHeight),
    topMargin: valueOrEmpty(preset.topMargin),
    leftMargin: valueOrEmpty(preset.leftMargin),
    horizontalPitch: valueOrEmpty(preset.horizontalPitch),
    verticalPitch: valueOrEmpty(preset.verticalPitch),
    labelWidth: valueOrEmpty(preset.labelWidth),
    labelHeight: valueOrEmpty(preset.labelHeight),
    columns: valueOrEmpty(preset.columns),
    rows: valueOrEmpty(preset.rows),
    notes: preset.notes || '',
  }, 'editor', 0);
}

function validatePreset(preset) {
  var errors = [];

  if (!preset.name) {
    errors.push('Preset name is required.');
  }
  if (!(preset.pageWidth > 0) || !(preset.pageHeight > 0)) {
    errors.push('Page width and page height must be positive numbers.');
  }
  if (!(preset.labelWidth > 0) || !(preset.labelHeight > 0)) {
    errors.push('Label width and label height must be positive numbers.');
  }
  if (!(preset.horizontalPitch >= preset.labelWidth) || !(preset.verticalPitch >= preset.labelHeight)) {
    errors.push('Pitch values must be greater than or equal to the label dimensions.');
  }
  if (!(preset.columns > 0) || !(preset.rows > 0)) {
    errors.push('Columns and rows must be positive integers.');
  }
  if (!(preset.topMargin >= 0) || !(preset.leftMargin >= 0)) {
    errors.push('Margins must be zero or greater.');
  }

  var gridWidth = preset.labelWidth + (preset.columns - 1) * preset.horizontalPitch;
  var gridHeight = preset.labelHeight + (preset.rows - 1) * preset.verticalPitch;
  if (preset.leftMargin + gridWidth > preset.pageWidth + 1e-6) {
    errors.push('The labels extend beyond the page width. Reduce left margin, label width, pitch, or column count.');
  }
  if (preset.topMargin + gridHeight > preset.pageHeight + 1e-6) {
    errors.push('The labels extend beyond the page height. Reduce top margin, label height, pitch, or row count.');
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    preset: preset,
  };
}

function collectPresetFromEditor() {
  return sanitizePreset(
    {
      id: state.selectedPresetId && state.selectedPresetId !== '__manual__' ? state.selectedPresetId : '',
      name: document.getElementById('presetName').value.trim(),
      vendor: document.getElementById('presetVendor').value.trim(),
      sku: document.getElementById('presetSku').value.trim(),
      pageWidth: document.getElementById('pageWidth').value,
      pageHeight: document.getElementById('pageHeight').value,
      topMargin: document.getElementById('topMargin').value,
      leftMargin: document.getElementById('leftMargin').value,
      horizontalPitch: document.getElementById('horizontalPitch').value,
      verticalPitch: document.getElementById('verticalPitch').value,
      labelWidth: document.getElementById('labelWidth').value,
      labelHeight: document.getElementById('labelHeight').value,
      columns: document.getElementById('columns').value,
      rows: document.getElementById('rows').value,
      notes: document.getElementById('presetNotes').value.trim(),
    },
    'editor',
    0
  );
}

function seedEditorFromPreset(preset) {
  populateEditorField('presetName', preset.name);
  populateEditorField('presetVendor', preset.vendor);
  populateEditorField('presetSku', preset.sku);
  populateEditorField('pageWidth', preset.pageWidth);
  populateEditorField('pageHeight', preset.pageHeight);
  populateEditorField('topMargin', preset.topMargin);
  populateEditorField('leftMargin', preset.leftMargin);
  populateEditorField('horizontalPitch', preset.horizontalPitch);
  populateEditorField('verticalPitch', preset.verticalPitch);
  populateEditorField('labelWidth', preset.labelWidth);
  populateEditorField('labelHeight', preset.labelHeight);
  populateEditorField('columns', preset.columns);
  populateEditorField('rows', preset.rows);
  populateEditorField('presetNotes', preset.notes);
}

function onPresetSelectChanged(event) {
  var selectedId = event.target.value;
  state.selectedPresetId = selectedId;

  if (!selectedId) {
    state.draftPreset = makeBlankPreset();
    seedEditorFromPreset(state.draftPreset);
    recalcPreset();
    setStatus('design-status', 'Select a preset or enter custom geometry manually.', 'info');
    renderAll();
    return;
  }

  if (selectedId === '__manual__') {
    if (!document.getElementById('presetName').value.trim()) {
      state.draftPreset = makeBlankPreset();
      seedEditorFromPreset(state.draftPreset);
    }
    state.draftPreset = collectPresetFromEditor();
    recalcPreset();
    setStatus('design-status', 'Editing custom sheet geometry.', 'info');
    renderAll();
    return;
  }

  var preset = findPresetById(selectedId);
  if (!preset) return;
  state.draftPreset = clonePresetDraft(preset);
  seedEditorFromPreset(state.draftPreset);
  recalcPreset();
  setStatus('design-status', 'Loaded preset: ' + preset.name + '.', 'info');
  renderAll();
}

function onPresetEditorInput(event) {
  var selectedPreset = state.selectedPresetId ? findPresetById(state.selectedPresetId) : null;

  if (selectedPreset) {
    state.selectedPresetId = '__manual__';
    document.getElementById('preset-select').value = '__manual__';
  }

  state.draftPreset = collectPresetFromEditor();
  recalcPreset();
  renderAll();
}

function recalcPreset() {
  if (state.layoutMode === 'thermal') {
    state.currentPreset = null;
    state.currentPresetErrors = [];
    state.outputDirty = true;
    computeLayoutCells();
    return;
  }

  var validation = validatePreset(state.draftPreset);
  state.currentPreset = validation.valid ? validation.preset : null;
  state.currentPresetErrors = validation.errors;
  state.outputDirty = true;
  computeLayoutCells();
}

function computeLayoutCells() {
  if (state.layoutMode === 'thermal') {
    state.layoutCells = [];
    return;
  }

  if (!state.currentPreset) {
    state.layoutCells = [];
    return;
  }

  var cellsPerSheet = state.currentPreset.columns * state.currentPreset.rows;
  if (!cellsPerSheet) {
    state.layoutCells = [];
    return;
  }

  var dataCount = state.csvRows.length;
  if (!dataCount) {
    state.layoutCells = [];
    return;
  }

  var sheetCount = Math.ceil(dataCount / cellsPerSheet);
  var totalCells = sheetCount * cellsPerSheet;
  state.layoutCells = [];
  for (var i = 0; i < totalCells; i++) {
    state.layoutCells.push(i < dataCount ? 'use' : 'available');
  }
}

function saveCurrentPreset() {
  if (state.layoutMode !== 'laser-sheet') {
    setStatus('design-status', 'Switch to laser-sheet mode to save a preset.', 'warn');
    return;
  }

  state.draftPreset = collectPresetFromEditor();
  var validation = validatePreset(state.draftPreset);

  if (!validation.valid) {
    setStatus('design-status', validation.errors[0] || 'The preset is incomplete.', 'danger');
    return;
  }

  var sourceId = state.selectedPresetId;
  var isUpdatingUserPreset = sourceId && state.userPresets.some(function (preset) { return preset.id === sourceId; });

  var id = isUpdatingUserPreset
    ? sourceId
    : 'user-' + slugify(state.currentPreset.name || 'preset') + '-' + Date.now();

  var presetToSave = sanitizePreset({
    id: id,
    name: state.currentPreset.name,
    vendor: state.currentPreset.vendor,
    sku: state.currentPreset.sku,
    pageWidth: state.currentPreset.pageWidth,
    pageHeight: state.currentPreset.pageHeight,
    topMargin: state.currentPreset.topMargin,
    leftMargin: state.currentPreset.leftMargin,
    horizontalPitch: state.currentPreset.horizontalPitch,
    verticalPitch: state.currentPreset.verticalPitch,
    labelWidth: state.currentPreset.labelWidth,
    labelHeight: state.currentPreset.labelHeight,
    columns: state.currentPreset.columns,
    rows: state.currentPreset.rows,
    notes: state.currentPreset.notes,
    mode: 'laser-sheet',
  }, 'user', state.userPresets.length);

  if (isUpdatingUserPreset) {
    state.userPresets = state.userPresets.map(function (preset) {
      return preset.id === id ? presetToSave : preset;
    });
  } else {
    state.userPresets.push(presetToSave);
  }

  persistUserPresets();
  state.selectedPresetId = id;
  state.draftPreset = clonePresetDraft(presetToSave);
  state.currentPreset = sanitizePreset(presetToSave, 'editor', 0);
  recalcPreset();
  renderPresetSelect();
  document.getElementById('preset-select').value = id;
  setStatus('design-status', 'Saved in this browser. Stays local until cleared. Does not sync to other browsers or machines.', 'success');
  renderAll();
}

function clearUserPresets() {
  if (!state.userPresets.length) {
    setStatus('design-status', 'No browser-saved presets were found.', 'info');
    renderAll();
    return;
  }

  var removedPresetIds = new Set();
  state.userPresets.forEach(function (preset) { removedPresetIds.add(preset.id); });

  localStorage.removeItem(STORAGE_KEY);
  state.userPresets = [];

  if (removedPresetIds.has(state.selectedPresetId)) {
    state.selectedPresetId = '';
    state.draftPreset = makeBlankPreset();
    state.currentPreset = null;
    state.currentPresetErrors = [];
    seedEditorFromPreset(state.draftPreset);
  }

  renderPresetSelect();
  setStatus('design-status', 'Cleared browser-saved presets. Shipped presets are unchanged.', 'success');
  renderAll();
}

function copyCurrentPresetConfig() {
  state.draftPreset = collectPresetFromEditor();
  var validation = validatePreset(state.draftPreset);

  if (!validation.valid) {
    setStatus('design-status', 'Enter a valid preset before copying.', 'danger');
    return;
  }

  var normalized = normalizePreset(Object.assign({}, state.currentPreset, {
    id: state.selectedPresetId && state.selectedPresetId !== '__manual__'
      ? state.selectedPresetId
      : 'custom-' + slugify(state.currentPreset.name || 'preset'),
  }));

  var lines = [];
  PRESET_FIELD_ORDER.forEach(function (field) {
    if (normalized[field] === '' || normalized[field] == null) return;
    var value = typeof normalized[field] === 'number'
      ? normalized[field]
      : JSON.stringify(String(normalized[field]));
    lines.push('  ' + field + ': ' + value + ',');
  });

  var snippet = '{\n' + lines.join('\n') + '\n}';

  labtoolsCopyText(snippet).then(function () {
    setStatus('design-status', 'Current settings copied to clipboard. Paste them into the presets array in preset-config.js.', 'success');
  }).catch(function () {
    setStatus('design-status', 'Unable to copy to clipboard. Right-click the preset notes field to copy manually.', 'warn');
  });
}

function exportAllPresetConfigs() {
  var allPresetList = [].concat(state.builtInPresets, state.userPresets);
  var normalized = allPresetList.map(function (preset) { return normalizePreset(preset); });

  var lines = [
    "'use strict';",
    '',
    'window.LABEL_GENERATOR_PRESET_CONFIG = {',
    '  version: 1,',
    '  presets: [',
  ];

  normalized.forEach(function (preset, index) {
    var presetLines = [];
    PRESET_FIELD_ORDER.forEach(function (field) {
      if (preset[field] === '' || preset[field] == null) return;
      var value = typeof preset[field] === 'number'
        ? preset[field]
        : JSON.stringify(String(preset[field]));
      presetLines.push('    ' + field + ': ' + value + ',');
    });
    var suffix = index < normalized.length - 1 ? ',' : '';
    lines.push('    {');
    lines.push.apply(lines, presetLines);
    lines.push('    }' + suffix);
  });

  lines.push('  ],');
  lines.push('};');
  lines.push('');

  labtoolsDownloadText('label-generator-presets.js', lines.join('\n'), 'application/javascript;charset=utf-8');
  setStatus('design-status', 'Exported all presets. You can merge them back into preset-config.js.', 'success');
}

function getActivePreset() {
  if (state.layoutMode === 'thermal') {
    return {
      labelWidth: state.labelWidth,
      labelHeight: state.labelHeight,
      pageWidth: state.labelWidth,
      pageHeight: state.labelHeight,
      topMargin: 0,
      leftMargin: 0,
      horizontalPitch: state.labelWidth,
      verticalPitch: state.labelHeight,
      columns: 1,
      rows: 1,
    };
  }
  return state.currentPreset;
}

function buildSheetGeometry(preset) {
  if (!preset) return { cells: [], gridLeftPct: 0, gridTopPct: 0, gridWidthPct: 0, gridHeightPct: 0 };

  var gridWidth = preset.labelWidth + (preset.columns - 1) * preset.horizontalPitch;
  var gridHeight = preset.labelHeight + (preset.rows - 1) * preset.verticalPitch;
  var cells = [];

  for (var row = 0; row < preset.rows; row++) {
    for (var col = 0; col < preset.columns; col++) {
      var left = preset.leftMargin + col * preset.horizontalPitch;
      var top = preset.topMargin + row * preset.verticalPitch;
      cells.push({
        xIn: left,
        yIn: top,
        widthIn: preset.labelWidth,
        heightIn: preset.labelHeight,
        leftPct: (left / preset.pageWidth) * 100,
        topPct: (top / preset.pageHeight) * 100,
        widthPct: (preset.labelWidth / preset.pageWidth) * 100,
        heightPct: (preset.labelHeight / preset.pageHeight) * 100,
      });
    }
  }

  return {
    gridLeftPct: (preset.leftMargin / preset.pageWidth) * 100,
    gridTopPct: (preset.topMargin / preset.pageHeight) * 100,
    gridWidthPct: (gridWidth / preset.pageWidth) * 100,
    gridHeightPct: (gridHeight / preset.pageHeight) * 100,
    cells: cells,
  };
}

function renderAll() {
  renderStepProgress();
  renderCsvSummary();
  renderColumnMapping();
  renderLayoutControls();
  renderPresetSelect();
  renderPresetSummary();
  renderSheetPreview();
  renderOutputSummary();
}

function renderStepProgress() {
  var step1 = document.getElementById('step-csv');
  var step2 = document.getElementById('step-design');
  var step3 = document.getElementById('step-export');
  var conn1 = document.getElementById('step-conn-1');
  var conn2 = document.getElementById('step-conn-2');

  step1.className = 'step-pip';
  step2.className = 'step-pip';
  step3.className = 'step-pip';
  conn1.className = 'step-connector';
  conn2.className = 'step-connector';

  var hasData = state.csvRows.length > 0;

  if (hasData) {
    step1.classList.add('done');
  } else {
    step1.classList.add('active');
  }

  if (hasData) {
    step2.classList.add('active');
    conn1.classList.add('done');
    if (state.outputBytes && !state.outputDirty) {
      step2.classList.add('done');
      step3.classList.add('active');
      conn2.classList.add('done');
    }
  }
}

function renderCsvSummary() {
  var summary = document.getElementById('csv-summary');
  var statusEl = document.getElementById('csv-status');

  if (!state.csvRows.length) {
    summary.innerHTML = '';
    setStatus('csv-status', 'Upload a CSV file or paste CSV text to begin.', 'info');
    return;
  }

  var colCount = state.csvHeaders.length;
  var delimiterLabel = state.csvDelimiter === '\t' ? 'Tab' : state.csvDelimiter === ';' ? 'Semicolon' : 'Comma';
  setStatus('csv-status',
    state.csvRows.length + ' row' + (state.csvRows.length !== 1 ? 's' : '') + ' · ' +
    colCount + ' column' + (colCount !== 1 ? 's' : '') + ' · ' +
    delimiterLabel + ' delimiter' +
    (state.csvFirstRowHeader ? ' · Header detected' : ' · No header'),
    'success'
  );

  var previewRows = state.csvRows.slice(0, 5);
  var headersHtml = '';
  for (var h = 0; h < state.csvHeaders.length; h++) {
    headersHtml += '<th>' + escapeHtml(state.csvHeaders[h]) + '</th>';
  }

  var rowsHtml = '';
  for (var r = 0; r < previewRows.length; r++) {
    rowsHtml += '<tr>';
    var cells = previewRows[r];
    for (var c = 0; c < state.csvHeaders.length; c++) {
      rowsHtml += '<td>' + escapeHtml((cells[c] || '').trim()) + '</td>';
    }
    rowsHtml += '</tr>';
  }

  summary.innerHTML =
    '<div class="csv-preview-wrap">' +
    '<table class="csv-preview-table">' +
    '<thead><tr>' + headersHtml + '</tr></thead>' +
    '<tbody>' + rowsHtml + '</tbody>' +
    '</table>' +
    '</div>' +
    (state.csvRows.length > 5
      ? '<div class="csv-preview-note">Showing first 5 of ' + state.csvRows.length + ' rows.</div>'
      : '');
}

function renderColumnMapping() {
  var hasData = state.csvRows.length > 0;
  var barcodeSelect = document.getElementById('barcode-col-select');
  var textSelects = [
    document.getElementById('text-line-1-select'),
    document.getElementById('text-line-2-select'),
    document.getElementById('text-line-3-select'),
    document.getElementById('text-line-4-select'),
  ];

  var optionsHtml = '';
  var colCount = state.csvHeaders.length;
  if (!colCount && !hasData) {
    optionsHtml = '<option value="0" selected>— Load CSV first —</option>';
  } else {
    for (var c = 0; c < colCount; c++) {
      var selected = '';
      optionsHtml += '<option value="' + c + '"' + selected + '>' + escapeHtml(state.csvHeaders[c]) + '</option>';
    }
  }

  barcodeSelect.innerHTML = optionsHtml;
  barcodeSelect.value = Math.min(state.barcodeCol, Math.max(0, colCount - 1));
  barcodeSelect.disabled = !hasData;

  for (var i = 0; i < 4; i++) {
    var selHtml = '<option value="-1"' + '>— None —</option>';
    for (var ci = 0; ci < colCount; ci++) {
      selHtml += '<option value="' + ci + '">' + escapeHtml(state.csvHeaders[ci]) + '</option>';
    }
    textSelects[i].innerHTML = selHtml;
    textSelects[i].value = String(state.textLines[i]);
    textSelects[i].disabled = !hasData;
  }
}

function renderLayoutControls() {
  var thermalControls = document.getElementById('thermal-controls');
  var laserControls = document.getElementById('laser-controls');
  var isLaser = state.layoutMode === 'laser-sheet';

  thermalControls.style.display = isLaser ? 'none' : '';
  laserControls.style.display = isLaser ? '' : 'none';

  document.getElementById('layout-mode-thermal').classList.toggle('active', !isLaser);
  document.getElementById('layout-mode-laser').classList.toggle('active', isLaser);

  document.getElementById('thermal-label-width').value = state.labelWidth;
  document.getElementById('thermal-label-height').value = state.labelHeight;
  document.getElementById('show-border').checked = state.showBorder;
}

function renderPresetSelect() {
  var select = document.getElementById('preset-select');
  select.innerHTML =
    '<option value="">— Choose a preset —</option>' +
    '<optgroup label="Built-in presets"></optgroup>' +
    '<optgroup label="Saved in this browser"></optgroup>' +
    '<option value="__manual__">Custom parameters</option>';

  var groups = select.querySelectorAll('optgroup');
  var builtInGroup = groups[0];
  var userGroup = groups[1];

  state.builtInPresets.forEach(function (preset) {
    var opt = document.createElement('option');
    opt.value = preset.id;
    opt.textContent = preset.name + (preset.sku ? ' · ' + preset.sku : '');
    builtInGroup.appendChild(opt);
  });

  state.userPresets.forEach(function (preset) {
    var opt = document.createElement('option');
    opt.value = preset.id;
    opt.textContent = preset.name + (preset.sku ? ' · ' + preset.sku : '');
    userGroup.appendChild(opt);
  });

  if (!state.userPresets.length) {
    var opt = document.createElement('option');
    opt.disabled = true;
    opt.textContent = 'No browser-saved presets yet';
    userGroup.appendChild(opt);
  }

  select.value = state.selectedPresetId || '';
}

function renderPresetSummary() {
  var summary = document.getElementById('preset-summary');

  if (state.layoutMode === 'thermal') {
    var thermalPreset = getActivePreset();
    summary.innerHTML =
      '<div class="preset-summary-panel preset-summary-panel--info">' +
      '<div class="preset-summary-top">' +
      '<div>' +
      '<div class="preset-summary-eyebrow">Thermal Label Mode</div>' +
      '<div class="preset-summary-title">' + formatDecimal(thermalPreset.labelWidth, 3) + ' × ' + formatDecimal(thermalPreset.labelHeight, 3) + ' in</div>' +
      '<div class="preset-summary-subtitle">One label per page. ' + state.csvRows.length + ' label' + (state.csvRows.length !== 1 ? 's' : '') + ' will be generated.</div>' +
      '</div>' +
      '<span class="preset-summary-chip">Thermal</span>' +
      '</div>' +
      '</div>';
    return;
  }

  if (!state.currentPreset) {
    var errMsg = state.currentPresetErrors[0] || 'Enter valid sheet geometry or select a preset.';
    summary.innerHTML =
      '<div class="preset-summary-panel preset-summary-panel--warn">' +
      '<div class="preset-summary-top">' +
      '<div>' +
      '<div class="preset-summary-eyebrow">Laser Sheet Mode</div>' +
      '<div class="preset-summary-title">Geometry Required</div>' +
      '<div class="preset-summary-subtitle">' + escapeHtml(errMsg) + '</div>' +
      '</div>' +
      '<span class="preset-summary-chip">' + (state.currentPresetErrors.length ? 'Incomplete' : 'Waiting') + '</span>' +
      '</div>' +
      '</div>';
    return;
  }

  var preset = state.currentPreset;
  var capacity = preset.columns * preset.rows;
  var selectedPreset = state.selectedPresetId ? findPresetById(state.selectedPresetId) : null;
  var sourceLabel = selectedPreset
    ? (selectedPreset._origin === 'user' ? 'Saved in this browser' : 'Shipped in preset-config.js')
    : 'Manual values';

  summary.innerHTML =
    '<div class="preset-summary-panel preset-summary-panel--success">' +
    '<div class="preset-summary-top">' +
    '<div>' +
    '<div class="preset-summary-eyebrow">Laser Sheet Mode</div>' +
    '<div class="preset-summary-title">' + escapeHtml(preset.name) + '</div>' +
    '<div class="preset-summary-subtitle">' + escapeHtml(sourceLabel) + '</div>' +
    '</div>' +
    '<span class="preset-summary-chip">Ready</span>' +
    '</div>' +
    '<div class="preset-summary-facts">' +
    '<div class="preset-summary-fact">' +
    '<div class="preset-summary-fact-label">Sheet Capacity</div>' +
    '<div class="preset-summary-fact-value">' + capacity + '</div>' +
    '<div class="preset-summary-fact-note">' + preset.columns + ' columns × ' + preset.rows + ' rows</div>' +
    '</div>' +
    '<div class="preset-summary-fact">' +
    '<div class="preset-summary-fact-label">Label Size</div>' +
    '<div class="preset-summary-fact-value">' + formatDecimal(preset.labelWidth, 3) + ' × ' + formatDecimal(preset.labelHeight, 3) + ' in</div>' +
    '<div class="preset-summary-fact-note">' + state.csvRows.length + ' label' + (state.csvRows.length !== 1 ? 's' : '') + ' · Page ' + formatDecimal(preset.pageWidth, 3) + ' × ' + formatDecimal(preset.pageHeight, 3) + ' in</div>' +
    '</div>' +
    '<div class="preset-summary-fact">' +
    '<div class="preset-summary-fact-label">Pitch</div>' +
    '<div class="preset-summary-fact-value">' + formatDecimal(preset.horizontalPitch, 3) + ' × ' + formatDecimal(preset.verticalPitch, 3) + ' in</div>' +
    '<div class="preset-summary-fact-note">Margins ' + formatDecimal(preset.leftMargin, 3) + ' / ' + formatDecimal(preset.topMargin, 3) + ' in</div>' +
    '</div>' +
    '</div>' +
    '</div>';
}

function renderSheetPreview() {
  var container = document.getElementById('sheet-preview');

  if (state.layoutMode === 'thermal') {
    var tw = state.labelWidth;
    var th = state.labelHeight;
    var aspect = tw / th;
    container.innerHTML =
      '<div class="sheet-preview-container">' +
      '<div class="lt-sheet-stage" style="--sheet-aspect:' + aspect + '; max-width: 280px;">' +
      '<div class="lt-sheet-cell lt-sheet-cell--use" style="left:4%;top:4%;width:92%;height:92%;">' +
      '<span class="lt-sheet-cell-id">Label 1</span>' +
      '<span class="lt-sheet-cell-token">' + formatDecimal(tw, 2) + ' × ' + formatDecimal(th, 2) + ' in</span>' +
      '</div>' +
      '</div>' +
      '</div>';
    return;
  }

  if (!state.currentPreset || !state.layoutCells.length) {
    container.innerHTML =
      '<div class="lt-preview-frame">' +
      '<div class="lt-alert lt-alert-info">The sheet preview appears after CSV data is loaded and a valid sheet preset is selected or entered.</div>' +
      '</div>';
    return;
  }

  var preset = state.currentPreset;
  var geometry = buildSheetGeometry(preset);
  var cellsPerSheet = geometry.cells.length;
  if (!cellsPerSheet) {
    container.innerHTML = '';
    return;
  }

  var sheetCount = Math.max(1, Math.ceil(state.layoutCells.length / cellsPerSheet));
  var html = '';

  for (var sheetIndex = 0; sheetIndex < sheetCount; sheetIndex++) {
    var sheetStart = sheetIndex * cellsPerSheet;
    var sheetCells = state.layoutCells.slice(sheetStart, sheetStart + cellsPerSheet);
    var usedOnSheet = sheetCells.filter(function (c) { return c === 'use'; }).length;

    html += '<div class="sheet-card">';
    html += '<div class="sheet-card-header"><h3>Sheet ' + (sheetIndex + 1) + '</h3><p>' + usedOnSheet + ' label' + (usedOnSheet !== 1 ? 's' : '') + ' · ' + sheetCells.length + ' cell' + (sheetCells.length !== 1 ? 's' : '') + '</p></div>';

    html += '<div class="lt-preview-frame">';
    html += '<div class="lt-sheet-stage" style="--sheet-aspect:' + preset.pageWidth + ' / ' + preset.pageHeight + ';">';

    var regionLeft = geometry.gridLeftPct;
    var regionTop = geometry.gridTopPct;
    var regionW = geometry.gridWidthPct;
    var regionH = geometry.gridHeightPct;
    html += '<div class="lt-sheet-grid-region" style="left:' + regionLeft + '%;top:' + regionTop + '%;width:' + regionW + '%;height:' + regionH + '%;"></div>';

    html += '<div class="lt-sheet-grid">';
    geometry.cells.forEach(function (rect, cellIndex) {
      var globalIndex = sheetStart + cellIndex;
      var mode = sheetCells[cellIndex] || 'available';
      var cellClass = 'lt-sheet-cell lt-sheet-cell--' + (mode === 'use' ? 'use' : 'available');
      html += '<div class="' + cellClass + '" style="left:' + rect.leftPct + '%;top:' + rect.topPct + '%;width:' + rect.widthPct + '%;height:' + rect.heightPct + '%;">';
      html += '<span class="lt-sheet-cell-id">Cell ' + (globalIndex + 1) + '</span>';
      if (mode === 'use') {
        html += '<span class="lt-sheet-cell-token">L' + (globalIndex + 1) + '</span>';
      }
      html += '</div>';
    });
    html += '</div>';

    html += '</div>';

    html += '<div class="lt-legend-row">' +
      '<span class="lt-legend-item"><span class="lt-legend-swatch lt-legend-swatch--use"></span>Filled</span>' +
      '<span class="lt-legend-item"><span class="lt-legend-swatch lt-legend-swatch--open"></span>Available</span>' +
      '</div>';

    html += '</div>';
    html += '</div>';
  }

  container.innerHTML = html;
}

function getBarcodeCanvas() {
  if (!_barcodeCanvas) {
    _barcodeCanvas = document.createElement('canvas');
    _barcodeCanvas.style.display = 'none';
    document.body.appendChild(_barcodeCanvas);
  }
  return _barcodeCanvas;
}

function renderBarcodeToPng(data, sizeKey) {
  return new Promise(function (resolve) {
    var text = (data && data.trim()) ? data.trim() : ' ';
    var sizeConfig = BARCODE_SIZES[sizeKey] || BARCODE_SIZES['M'];
    var canvas = getBarcodeCanvas();

    try {
      bwipjs.toCanvas(canvas, {
        bcid: 'datamatrix',
        text: text,
        scale: sizeConfig.scale,
        includetext: false,
      });
    } catch (err) {
      setStatus('export-status', 'Barcode rendering failed for: ' + escapeHtml(text.substring(0, 30)), 'warn');
      resolve(null);
      return;
    }

    canvas.toBlob(function (blob) {
      if (!blob) {
        setStatus('export-status', 'Unable to convert barcode canvas to PNG.', 'warn');
        resolve(null);
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        resolve(new Uint8Array(reader.result));
      };
      reader.onerror = function () {
        resolve(null);
      };
      reader.readAsArrayBuffer(blob);
    });
  });
}

function inchesToPoints(value) {
  return value * 72;
}

function pdfLabelFontSize(labelHeightIn) {
  if (labelHeightIn <= 0.5) return 5;
  if (labelHeightIn <= 1.0) return 7;
  return 9;
}

async function generatePdf() {
  if (!state.csvRows.length) {
    setStatus('export-status', 'Load CSV data first.', 'warn');
    return;
  }

  if (state.layoutMode === 'laser-sheet' && !state.currentPreset) {
    setStatus('export-status', 'Enter valid sheet geometry or select a preset in laser-sheet mode.', 'warn');
    return;
  }

  if (state.barcodeCol < 0 || state.barcodeCol >= state.csvHeaders.length) {
    setStatus('export-status', 'Select a valid barcode column.', 'warn');
    return;
  }

  state.isGenerating = true;
  setStatus('export-status', 'Generating PDF…', 'info');
  renderOutputSummary();

  try {
    var doc = await PDFLib.PDFDocument.create();
    var font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);

    var preset = getActivePreset();
    if (!preset) throw new Error('No valid layout configuration.');

    var totalLabels = state.csvRows.length;

    if (state.layoutMode === 'thermal') {
      var labelW = inchesToPoints(preset.labelWidth);
      var labelH = inchesToPoints(preset.labelHeight);

      for (var i = 0; i < totalLabels; i++) {
        var page = doc.addPage([labelW, labelH]);
        var row = state.csvRows[i];
        var barcodeData = (row[state.barcodeCol] || '').trim();
        await drawLabelOnPage(doc, page, font, barcodeData, row, 0, 0, labelW, labelH, preset);
      }
    } else {
      var cellsPerSheet = preset.columns * preset.rows;
      var geometry = buildSheetGeometry(preset);
      var sheetCount = Math.ceil(totalLabels / cellsPerSheet);
      var pageW = inchesToPoints(preset.pageWidth);
      var pageH = inchesToPoints(preset.pageHeight);

      for (var sheetIdx = 0; sheetIdx < sheetCount; sheetIdx++) {
        var sheetPage = doc.addPage([pageW, pageH]);
        var sheetStart = sheetIdx * cellsPerSheet;

        for (var cellIdx = 0; cellIdx < cellsPerSheet; cellIdx++) {
          var globalIdx = sheetStart + cellIdx;
          if (globalIdx >= totalLabels) break;

          var cellRect = geometry.cells[cellIdx];
          var cellX = inchesToPoints(cellRect.xIn);
          var cellY = pageH - inchesToPoints(cellRect.yIn) - inchesToPoints(cellRect.heightIn);
          var cellW = inchesToPoints(cellRect.widthIn);
          var cellH = inchesToPoints(cellRect.heightIn);
          var row = state.csvRows[globalIdx];
          var barcodeData = (row[state.barcodeCol] || '').trim();

          await drawLabelOnPage(doc, sheetPage, font, barcodeData, row, cellX, cellY, cellW, cellH, preset);
        }
      }
    }

    doc.setTitle('Labels');
    doc.setProducer('LabTools');
    doc.setCreator('LabTools label-generator');

    state.outputBytes = await doc.save();
    state.outputDirty = false;

    if (state.outputUrl) {
      URL.revokeObjectURL(state.outputUrl);
    }
    var blob = new Blob([state.outputBytes], { type: 'application/pdf' });
    state.outputUrl = URL.createObjectURL(blob);

    setStatus('export-status', 'Generated ' + (state.layoutMode === 'thermal' ? totalLabels : Math.ceil(totalLabels / (preset.columns * preset.rows))) + ' page' + (totalLabels > 1 && state.layoutMode === 'thermal' ? 's' : (state.layoutMode === 'laser-sheet' && sheetCount > 1 ? 's' : '')) + ' with ' + totalLabels + ' label' + (totalLabels !== 1 ? 's' : '') + '.', 'success');
  } catch (err) {
    setStatus('export-status', err && err.message ? err.message : 'Failed to generate the PDF.', 'danger');
  } finally {
    state.isGenerating = false;
    renderAll();
  }
}

async function drawLabelOnPage(doc, page, font, barcodeData, row, cellX, cellY, cellW, cellH, preset) {
  var padding = 4;
  var innerX = cellX + padding;
  var innerY = cellY + padding;
  var innerW = cellW - padding * 2;
  var innerH = cellH - padding * 2;

  var barcodeW = innerW * 0.38;
  var textX = innerX + innerW * 0.42;
  var textW = innerW * 0.56;

  var fontSize = pdfLabelFontSize(preset.labelHeight);

  if (barcodeData) {
    var pngBytes = await renderBarcodeToPng(barcodeData, state.barcodeSize);
    if (pngBytes) {
      try {
        var pngImage = await doc.embedPng(pngBytes);
        var pngAspect = pngImage.width / pngImage.height;
        var barcodeDrawW, barcodeDrawH;

        if (barcodeW / innerH > pngAspect) {
          barcodeDrawH = innerH;
          barcodeDrawW = innerH * pngAspect;
        } else {
          barcodeDrawW = barcodeW;
          barcodeDrawH = barcodeW / pngAspect;
        }

        var barcodeDrawX = innerX + (barcodeW - barcodeDrawW) / 2;
        var barcodeDrawY = innerY + (innerH - barcodeDrawH) / 2;

        page.drawImage(pngImage, {
          x: barcodeDrawX,
          y: barcodeDrawY,
          width: barcodeDrawW,
          height: barcodeDrawH,
        });

        var barcodeLabelText = barcodeData.substring(0, 20);
        page.drawText(barcodeLabelText, {
          x: innerX,
          y: Math.max(cellY + padding, barcodeDrawY - 5),
          size: 4,
          font: font,
          color: PDFLib.rgb(0.5, 0.5, 0.5),
          maxWidth: barcodeW,
          lineHeight: 4,
        });
      } catch (embedErr) {
        setStatus('export-status', 'Unable to embed barcode image: ' + (embedErr.message || ''), 'warn');
      }
    }
  }

  var lineHeight = fontSize + 2;
  var textY = innerY + innerH - fontSize;

  for (var i = 0; i < 4; i++) {
    var colIdx = state.textLines[i];
    if (colIdx < 0 || colIdx >= (row ? row.length : 0)) continue;
    var text = (row[colIdx] || '').trim();
    if (!text) continue;
    try {
      page.drawText(text, {
        x: textX,
        y: textY,
        size: fontSize,
        font: font,
        color: PDFLib.rgb(0, 0, 0),
        maxWidth: textW,
        lineHeight: fontSize + 1,
      });
    } catch (drawErr) {
      // Character may not be available in Helvetica — skip silently
    }
    textY -= lineHeight;
  }

  if (state.showBorder) {
    page.drawRectangle({
      x: cellX,
      y: cellY,
      width: cellW,
      height: cellH,
      borderColor: PDFLib.rgb(0.5, 0.5, 0.5),
      borderWidth: 0.5,
    });
  }
}

function downloadPdf() {
  if (!state.outputBytes) return;
  var blob = new Blob([state.outputBytes], { type: 'application/pdf' });
  labtoolsDownloadBlob('labels.pdf', blob);
  setStatus('export-status', 'PDF downloaded.', 'success');
}

function renderOutputSummary() {
  var summary = document.getElementById('output-summary');
  var generateBtn = document.getElementById('generate-btn');
  var downloadBtn = document.getElementById('download-btn');
  var preview = document.getElementById('pdf-preview');

  var hasData = state.csvRows.length > 0;
  var hasPreset = state.layoutMode === 'thermal' || !!state.currentPreset;
  generateBtn.disabled = !hasData || !hasPreset || state.isGenerating;

  if (!hasData) {
    summary.innerHTML = '<div class="lt-alert lt-alert-info">Load CSV data in Step 1 first.</div>';
    preview.innerHTML = '';
    downloadBtn.disabled = true;
    return;
  }

  if (!hasPreset) {
    summary.innerHTML = '<div class="lt-alert lt-alert-warn">Enter valid sheet geometry or select a preset in Step 2 before generating.</div>';
    preview.innerHTML = '';
    downloadBtn.disabled = true;
    return;
  }

  if (state.outputDirty || !state.outputBytes) {
    summary.innerHTML = '<div class="lt-alert lt-alert-info">Click Generate PDF to create the output.</div>';
    preview.innerHTML = '';
    downloadBtn.disabled = true;
    return;
  }

  summary.innerHTML = '<div class="lt-alert lt-alert-success">PDF is ready. Preview below or download directly.</div>';
  preview.innerHTML =
    '<object data="' + state.outputUrl + '" type="application/pdf" class="output-embed">' +
    '<div class="lt-alert lt-alert-info">Your browser cannot display the PDF preview inline. Use the download button instead.</div>' +
    '</object>';
  downloadBtn.disabled = false;
}

function getThermalLabelCells() {
  return state.csvRows.map(function (_, i) { return { index: i, mode: 'use' }; });
}

function onThermalSizeInput() {
  state.labelWidth = parseFloat(document.getElementById('thermal-label-width').value) || 0.75;
  state.labelHeight = parseFloat(document.getElementById('thermal-label-height').value) || 0.5;
  state.outputDirty = true;
}

function valueOrEmpty(val) {
  return Number.isFinite(val) && !isNaN(val) ? val : '';
}

function toNumber(value) {
  var parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function toInteger(value) {
  var parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatDecimal(val, places) {
  return Number(val).toFixed(places).replace(/\.?0+$/, '');
}

function pointsToInches(pts) {
  return pts / 72;
}

function setStatus(elementId, message, type) {
  var el = document.getElementById(elementId);
  if (!el) return;
  el.className = 'lt-alert lt-alert-' + type;
  el.textContent = message;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'preset';
}

function normalizePreset(preset) {
  var normalized = {};
  PRESET_FIELD_ORDER.forEach(function (field) {
    if (preset[field] === '' || preset[field] == null) return;
    normalized[field] = preset[field];
  });
  return normalized;
}
