'use strict';

const STORAGE_KEY = 'labtools:thermal-to-laser:user-presets:v1';
const AUTO_MATCH_TOLERANCE_IN = 0.05;
const UNIFORM_SIZE_TOLERANCE_PT = 0.5;
const CONFIG_PATH = window.THERMAL_TO_LASER_PRESET_CONFIG_PATH || 'tools/thermal-to-laser/preset-config.js';

const GEOMETRY_FIELD_IDS = [
  'pageWidth',
  'pageHeight',
  'topMargin',
  'leftMargin',
  'horizontalPitch',
  'verticalPitch',
  'labelWidth',
  'labelHeight',
  'columns',
  'rows',
];

const PRESET_FIELD_ORDER = [
  'id',
  'name',
  'vendor',
  'sku',
  'pageWidth',
  'pageHeight',
  'topMargin',
  'leftMargin',
  'verticalPitch',
  'horizontalPitch',
  'labelHeight',
  'labelWidth',
  'columns',
  'rows',
  'notes',
];

const state = {
  builtInPresets: [],
  userPresets: [],
  selectedPresetId: '',
  sourceFile: null,
  sourceBytes: null,
  sourcePageCount: 0,
  sourcePageSizePts: null,
  sourceSizesUniform: true,
  sourceSizeRangePts: null,
  sourceParseError: '',
  detectedPresetIds: [],
  currentPreset: null,
  currentPresetErrors: [],
  layoutCells: [],
  actionMode: 'start',
  outputBytes: null,
  outputUrl: '',
  outputDirty: true,
  isGenerating: false,
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  state.builtInPresets = sanitizePresetList(
    (window.THERMAL_TO_LASER_PRESET_CONFIG && window.THERMAL_TO_LASER_PRESET_CONFIG.presets) || [],
    'builtin'
  );
  state.userPresets = loadUserPresets();

  bindEvents();
  renderPresetOptions();
  seedEditor(makeBlankPreset());
  setActionMode('start');
  recalcPresetAndMaybePlan({ resetPlan: true });
  renderAll();
}

function bindEvents() {
  document.getElementById('source-pdf').addEventListener('change', onSourcePdfSelected);
  document.getElementById('preset-select').addEventListener('change', onPresetSelectChanged);
  document.getElementById('save-preset-btn').addEventListener('click', saveCurrentPreset);
  document.getElementById('clear-saved-presets-btn').addEventListener('click', clearUserPresets);
  document.getElementById('copy-current-btn').addEventListener('click', copyCurrentPresetConfig);
  document.getElementById('export-all-btn').addEventListener('click', exportAllPresetConfigs);
  document.getElementById('reset-layout-btn').addEventListener('click', () => {
    if (!state.currentPreset || !state.sourcePageCount) return;
    initializeSequentialPlan(0);
    state.outputDirty = true;
    setStatus('layout-status', 'Layout reset to start from cell 1.', 'info');
    renderAll();
  });
  document.getElementById('generate-pdf-btn').addEventListener('click', generateOutputPdf);
  document.getElementById('download-pdf-btn').addEventListener('click', downloadOutputPdf);

  document.querySelectorAll('[data-action-mode]').forEach((button) => {
    button.addEventListener('click', () => setActionMode(button.dataset.actionMode));
  });

  document.querySelectorAll('#preset-editor input, #preset-editor textarea').forEach((field) => {
    field.addEventListener('input', onPresetEditorInput);
  });
}

async function onSourcePdfSelected(event) {
  const file = event.target.files && event.target.files[0];

  if (!file) {
    return;
  }

  clearSourceState();
  state.sourceFile = file;
  setStatus('source-status', 'Reading PDF…', 'info');
  renderStepProgress();

  try {
    const arrayBuffer = await labtoolsReadFileAsArrayBuffer(file);
    const bytes = new Uint8Array(arrayBuffer);
    const sourceDoc = await PDFLib.PDFDocument.load(bytes);
    const pages = sourceDoc.getPages();

    if (!pages.length) {
      throw new Error('The uploaded PDF does not contain any pages.');
    }

    const sizes = pages.map((page) => page.getSize());
    const first = sizes[0];
    const widthMin = Math.min.apply(null, sizes.map((size) => size.width));
    const widthMax = Math.max.apply(null, sizes.map((size) => size.width));
    const heightMin = Math.min.apply(null, sizes.map((size) => size.height));
    const heightMax = Math.max.apply(null, sizes.map((size) => size.height));

    state.sourceBytes = bytes;
    state.sourcePageCount = pages.length;
    state.sourcePageSizePts = { width: first.width, height: first.height };
    state.sourceSizesUniform =
      widthMax - widthMin <= UNIFORM_SIZE_TOLERANCE_PT &&
      heightMax - heightMin <= UNIFORM_SIZE_TOLERANCE_PT;
    state.sourceSizeRangePts = {
      widthMin,
      widthMax,
      heightMin,
      heightMax,
    };
    state.detectedPresetIds = detectMatchingPresetIds(first.width, first.height);

    if (!state.selectedPresetId && state.detectedPresetIds.length === 1) {
      const detected = findPresetById(state.detectedPresetIds[0]);
      if (detected) {
        state.selectedPresetId = detected.id;
        document.getElementById('preset-select').value = detected.id;
        seedEditor(detected);
        setStatus(
          'preset-status',
          `Detected a matching preset from the uploaded PDF: ${detected.name}.`,
          'success'
        );
      }
    } else if (!state.detectedPresetIds.length) {
      setStatus(
        'preset-status',
        'No shipped or saved preset matches this PDF page size. Enter the sheet geometry manually or save a new preset.',
        'warn'
      );
    } else if (state.detectedPresetIds.length > 1 && !state.selectedPresetId) {
      setStatus(
        'preset-status',
        'Multiple presets match the uploaded PDF page size. Pick the intended sheet geometry before exporting.',
        'warn'
      );
    }

    recalcPresetAndMaybePlan({ resetPlan: true });
    setStatus(
      'source-status',
      `Loaded ${state.sourcePageCount} label page${state.sourcePageCount === 1 ? '' : 's'} from ${file.name}.`,
      'success'
    );
  } catch (error) {
    state.sourceParseError = error && error.message ? error.message : 'Unable to parse the uploaded PDF.';
    setStatus('source-status', state.sourceParseError, 'danger');
  }

  renderAll();
}

function onPresetSelectChanged(event) {
  const selectedId = event.target.value;
  state.selectedPresetId = selectedId;

  if (!selectedId) {
    if (state.detectedPresetIds.length === 1) {
      const detected = findPresetById(state.detectedPresetIds[0]);
      if (detected) {
        seedEditor(detected);
      }
    }
    recalcPresetAndMaybePlan({ resetPlan: true });
    renderAll();
    return;
  }

  if (selectedId === '__manual__') {
    if (!document.getElementById('presetName').value.trim()) {
      seedEditor(makeBlankPreset());
    }
    recalcPresetAndMaybePlan({ resetPlan: true });
    renderAll();
    return;
  }

  const preset = findPresetById(selectedId);
  if (!preset) return;
  seedEditor(preset);
  recalcPresetAndMaybePlan({ resetPlan: true });
  setStatus('preset-status', `Loaded preset: ${preset.name}.`, 'info');
  renderAll();
}

function onPresetEditorInput(event) {
  const selectedPreset = state.selectedPresetId ? findPresetById(state.selectedPresetId) : null;
  const resetPlan = GEOMETRY_FIELD_IDS.includes(event.target.id);

  if (selectedPreset) {
    state.selectedPresetId = '__manual__';
    document.getElementById('preset-select').value = '__manual__';
    setStatus(
      'preset-status',
      `Preset selection cleared. ${selectedPreset.name} is now being edited as custom parameters.`,
      'info'
    );
  }

  recalcPresetAndMaybePlan({ resetPlan });
  if (resetPlan && state.sourcePageCount && state.currentPreset) {
    setStatus('layout-status', 'Layout refreshed to reflect the updated sheet geometry.', 'info');
  }
  renderAll();
}

function recalcPresetAndMaybePlan(options) {
  const preset = collectPresetFromEditor();
  const validation = validatePreset(preset);
  state.currentPreset = validation.valid ? validation.preset : null;
  state.currentPresetErrors = validation.errors;
  state.outputDirty = true;
  clearOutputPreview();

  if (!state.currentPreset) {
    state.layoutCells = [];
    return;
  }

  if (!state.sourcePageCount) {
    state.layoutCells = [];
    return;
  }

  if (options && options.resetPlan) {
    initializeSequentialPlan(0);
  } else {
    ensureUseCount(0, -1);
    trimUnusedTrailingSheets();
  }
}

function clearSourceState() {
  state.sourceFile = null;
  state.sourceBytes = null;
  state.sourcePageCount = 0;
  state.sourcePageSizePts = null;
  state.sourceSizesUniform = true;
  state.sourceSizeRangePts = null;
  state.sourceParseError = '';
  state.detectedPresetIds = [];
  state.layoutCells = [];
  state.outputDirty = true;
  clearOutputPreview();
}

function sanitizePresetList(presets, origin) {
  return (Array.isArray(presets) ? presets : [])
    .map((preset, index) => sanitizePreset(preset, origin, index))
    .filter(Boolean);
}

function sanitizePreset(preset, origin, index) {
  if (!preset || typeof preset !== 'object') return null;

  const sanitized = {
    id: preset.id != null && preset.id !== '' ? String(preset.id) : (origin === 'editor' ? '' : `${origin}-preset-${index + 1}`),
    name: preset.name != null ? String(preset.name) : (origin === 'editor' ? '' : `Preset ${index + 1}`),
    vendor: preset.vendor != null ? String(preset.vendor) : '',
    sku: preset.sku != null ? String(preset.sku) : '',
    pageWidth: toNumber(preset.pageWidth),
    pageHeight: toNumber(preset.pageHeight),
    topMargin: toNumber(preset.topMargin),
    leftMargin: toNumber(
      preset.leftMargin != null ? preset.leftMargin : preset.sideMargin
    ),
    verticalPitch: toNumber(preset.verticalPitch),
    horizontalPitch: toNumber(preset.horizontalPitch),
    labelHeight: toNumber(preset.labelHeight),
    labelWidth: toNumber(preset.labelWidth),
    columns: toInteger(preset.columns != null ? preset.columns : preset.across),
    rows: toInteger(preset.rows != null ? preset.rows : preset.down),
    notes: preset.notes != null ? String(preset.notes) : '',
    _origin: origin,
  };

  return sanitized;
}

function makeBlankPreset() {
  return {
    id: '',
    name: '',
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

function loadUserPresets() {
  const raw = labtoolsSafeJsonParse(localStorage.getItem(STORAGE_KEY), []);
  return sanitizePresetList(raw, 'user');
}

function persistUserPresets() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state.userPresets.map((preset) => normalizePreset(preset)), null, 2)
  );
}

function findPresetById(id) {
  return allPresets().find((preset) => preset.id === id) || null;
}

function allPresets() {
  return [...state.builtInPresets, ...state.userPresets];
}

function seedEditor(preset) {
  document.getElementById('presetName').value = preset.name || '';
  document.getElementById('presetVendor').value = preset.vendor || '';
  document.getElementById('presetSku').value = preset.sku || '';
  document.getElementById('pageWidth').value = valueOrEmpty(preset.pageWidth);
  document.getElementById('pageHeight').value = valueOrEmpty(preset.pageHeight);
  document.getElementById('topMargin').value = valueOrEmpty(preset.topMargin);
  document.getElementById('leftMargin').value = valueOrEmpty(preset.leftMargin);
  document.getElementById('horizontalPitch').value = valueOrEmpty(preset.horizontalPitch);
  document.getElementById('verticalPitch').value = valueOrEmpty(preset.verticalPitch);
  document.getElementById('labelWidth').value = valueOrEmpty(preset.labelWidth);
  document.getElementById('labelHeight').value = valueOrEmpty(preset.labelHeight);
  document.getElementById('columns').value = valueOrEmpty(preset.columns);
  document.getElementById('rows').value = valueOrEmpty(preset.rows);
  document.getElementById('presetNotes').value = preset.notes || '';
}

function collectPresetFromEditor() {
  return sanitizePreset(
    {
      id: state.selectedPresetId && state.selectedPresetId !== '__manual__'
        ? state.selectedPresetId
        : '',
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

function validatePreset(preset) {
  const errors = [];

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

  const gridWidth = preset.labelWidth + (preset.columns - 1) * preset.horizontalPitch;
  const gridHeight = preset.labelHeight + (preset.rows - 1) * preset.verticalPitch;
  if (preset.leftMargin + gridWidth > preset.pageWidth + 1e-6) {
    errors.push('The labels extend beyond the page width. Reduce the left margin, label width, pitch, or column count.');
  }
  if (preset.topMargin + gridHeight > preset.pageHeight + 1e-6) {
    errors.push('The labels extend beyond the page height. Reduce the top margin, label height, pitch, or row count.');
  }

  return {
    valid: errors.length === 0,
    errors,
    preset,
  };
}

function renderAll() {
  renderStepProgress();
  renderSourceSummary();
  renderPresetSummary();
  renderLayoutSummary();
  renderSheetPages();
  renderOutputSummary();
}

function renderStepProgress() {
  const step1 = document.getElementById('step-source');
  const step2 = document.getElementById('step-layout');
  const step3 = document.getElementById('step-export');
  const connector1 = document.getElementById('step-connector-1');
  const connector2 = document.getElementById('step-connector-2');

  step1.className = 'step-pip';
  step2.className = 'step-pip';
  step3.className = 'step-pip';
  connector1.className = 'step-connector';
  connector2.className = 'step-connector';

  if (state.sourcePageCount) {
    step1.classList.add('done');
  } else {
    step1.classList.add('active');
  }

  if (state.sourcePageCount && state.currentPreset && getUseIndices().length === state.sourcePageCount) {
    step2.classList.add('active');
    connector1.classList.add('done');
    if (state.outputBytes && !state.outputDirty) {
      step2.classList.add('done');
      step3.classList.add('active');
      connector2.classList.add('done');
    }
  }
}

function renderSourceSummary() {
  const meta = document.getElementById('source-meta');
  if (state.sourceParseError) {
    meta.innerHTML = '';
    return;
  }

  if (!state.sourcePageCount || !state.sourcePageSizePts) {
    meta.innerHTML = `
      <div class="meta-card">
        <div class="meta-card-label">Waiting For Input</div>
        <div class="meta-card-value">Upload a multi-page PDF</div>
        <div class="meta-card-note">Each PDF page should be one thermal label.</div>
      </div>
    `;
    return;
  }

  const widthIn = pointsToInches(state.sourcePageSizePts.width);
  const heightIn = pointsToInches(state.sourcePageSizePts.height);
  const uniformText = state.sourceSizesUniform
    ? 'All pages share the same size.'
    : `Pages vary from ${formatDecimal(pointsToInches(state.sourceSizeRangePts.widthMin), 3)}–${formatDecimal(pointsToInches(state.sourceSizeRangePts.widthMax), 3)} in wide and ${formatDecimal(pointsToInches(state.sourceSizeRangePts.heightMin), 3)}–${formatDecimal(pointsToInches(state.sourceSizeRangePts.heightMax), 3)} in tall.`;

  meta.innerHTML = `
    <div class="meta-card">
      <div class="meta-card-label">Source Pages</div>
      <div class="meta-card-value">${state.sourcePageCount}</div>
      <div class="meta-card-note">Labels required on the mailing-label sheet.</div>
    </div>
    <div class="meta-card">
      <div class="meta-card-label">Detected Label Size</div>
      <div class="meta-card-value">${formatDecimal(widthIn, 3)} × ${formatDecimal(heightIn, 3)} in</div>
      <div class="meta-card-note">${uniformText}</div>
    </div>
  `;
}

function renderPresetSummary() {
  const summary = document.getElementById('preset-summary');
  const detected = state.detectedPresetIds.map((id) => findPresetById(id)).filter(Boolean);

  if (!state.currentPreset) {
    summary.innerHTML = `
      <div class="lt-alert lt-alert-info">
        Enter or load a complete sheet preset to unlock the layout preview.
      </div>
    `;
    return;
  }

  const preset = state.currentPreset;
  const capacity = preset.columns * preset.rows;
  const selectedPreset = state.selectedPresetId ? findPresetById(state.selectedPresetId) : null;
  const sourceLabel = selectedPreset
    ? (presetsMatch(selectedPreset, preset)
        ? describePresetSource(selectedPreset)
        : `Edited from ${selectedPreset.name}`)
    : 'Manual values';
  const detectedLine = detected.length
    ? `Detected matches: ${detected.map((item) => item.name).join(', ')}.`
    : 'No matching preset was detected from the source PDF size.';

  summary.innerHTML = `
    <div class="meta-grid meta-grid--tight">
      <div class="meta-card">
        <div class="meta-card-label">Active Sheet</div>
        <div class="meta-card-value">${escapeHtml(preset.name)}</div>
        <div class="meta-card-note">${escapeHtml(sourceLabel)}</div>
      </div>
      <div class="meta-card">
        <div class="meta-card-label">Sheet Capacity</div>
        <div class="meta-card-value">${capacity}</div>
        <div class="meta-card-note">${preset.columns} columns × ${preset.rows} rows</div>
      </div>
      <div class="meta-card">
        <div class="meta-card-label">Geometry</div>
        <div class="meta-card-value">${formatDecimal(preset.labelWidth, 3)} × ${formatDecimal(preset.labelHeight, 3)} in</div>
        <div class="meta-card-note">Pitch ${formatDecimal(preset.horizontalPitch, 3)} × ${formatDecimal(preset.verticalPitch, 3)} in</div>
      </div>
    </div>
    <div class="lt-alert lt-alert-info tool-alert-inline">
      ${escapeHtml(detectedLine)}
    </div>
  `;
}

function renderLayoutSummary() {
  const summary = document.getElementById('layout-summary');

  if (!state.sourcePageCount) {
    summary.innerHTML = '<div class="lt-alert lt-alert-info">Upload the source PDF to plan the label placement.</div>';
    return;
  }

  if (!state.currentPreset) {
    summary.innerHTML = `<div class="lt-alert lt-alert-warn">${escapeHtml(state.currentPresetErrors[0] || 'Enter a valid preset to continue.')}</div>`;
    return;
  }

  const useCount = getUseIndices().length;
  const skipCount = state.layoutCells.filter((cell) => cell.mode === 'skip').length;
  const pastCount = state.layoutCells.filter((cell) => cell.mode === 'past').length;
  const sheetCount = Math.max(1, Math.ceil(state.layoutCells.length / getCellsPerSheet()));
  const remaining = Math.max(0, state.sourcePageCount - useCount);

  summary.innerHTML = `
    <div class="meta-grid meta-grid--tight">
      <div class="meta-card">
        <div class="meta-card-label">Assigned Labels</div>
        <div class="meta-card-value">${useCount} / ${state.sourcePageCount}</div>
        <div class="meta-card-note">${remaining ? `${remaining} label${remaining === 1 ? '' : 's'} still need cells.` : 'The layout is ready to export.'}</div>
      </div>
      <div class="meta-card">
        <div class="meta-card-label">Skipped Cells</div>
        <div class="meta-card-value">${skipCount}</div>
        <div class="meta-card-note">${pastCount} cells are treated as already used before the chosen start.</div>
      </div>
      <div class="meta-card">
        <div class="meta-card-label">Output Sheets</div>
        <div class="meta-card-value">${sheetCount}</div>
        <div class="meta-card-note">More sheets appear automatically if the remaining labels do not fit.</div>
      </div>
    </div>
  `;
}

function renderSheetPages() {
  const container = document.getElementById('sheet-pages');
  container.innerHTML = '';

  if (!state.sourcePageCount || !state.currentPreset) {
    container.innerHTML = `
      <div class="lt-preview-frame">
        <div class="lt-alert lt-alert-info">
          The sheet preview appears after the PDF is loaded and the sheet geometry is valid.
        </div>
      </div>
    `;
    return;
  }

  const geometry = buildSheetGeometry(state.currentPreset);
  const cellsPerSheet = geometry.cells.length;
  const labelIndexMap = buildLabelIndexMap();
  const sheetCount = Math.max(1, Math.ceil(state.layoutCells.length / cellsPerSheet));

  for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex += 1) {
    const sheetStart = sheetIndex * cellsPerSheet;
    const sheetCells = state.layoutCells.slice(sheetStart, sheetStart + cellsPerSheet);
    const assignedOnSheet = sheetCells.filter((cell) => cell.mode === 'use').length;

    const card = document.createElement('section');
    card.className = 'sheet-card';
    card.innerHTML = `
      <div class="sheet-card-header">
        <div>
          <h3>Sheet ${sheetIndex + 1}</h3>
          <p>${assignedOnSheet} label${assignedOnSheet === 1 ? '' : 's'} assigned on this page.</p>
        </div>
      </div>
    `;

    const frame = document.createElement('div');
    frame.className = 'lt-preview-frame';

    const stage = document.createElement('div');
    stage.className = 'lt-sheet-stage';
    stage.style.setProperty('--sheet-aspect', `${state.currentPreset.pageWidth} / ${state.currentPreset.pageHeight}`);

    const region = document.createElement('div');
    region.className = 'lt-sheet-grid-region';
    region.style.left = `${geometry.gridLeftPct}%`;
    region.style.top = `${geometry.gridTopPct}%`;
    region.style.width = `${geometry.gridWidthPct}%`;
    region.style.height = `${geometry.gridHeightPct}%`;
    stage.appendChild(region);

    const overlay = document.createElement('div');
    overlay.className = 'lt-sheet-grid';

    geometry.cells.forEach((rect, cellIndex) => {
      const globalIndex = sheetStart + cellIndex;
      ensureCellExists(globalIndex);
      const cellState = state.layoutCells[globalIndex];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `lt-sheet-cell lt-sheet-cell--${cellState.mode}`;
      button.style.left = `${rect.leftPct}%`;
      button.style.top = `${rect.topPct}%`;
      button.style.width = `${rect.widthPct}%`;
      button.style.height = `${rect.heightPct}%`;

      const labelNumber = labelIndexMap.get(globalIndex) || '';
      const cellNumber = globalIndex + 1;
      const token = cellState.mode === 'use'
        ? `L${labelNumber}`
        : cellState.mode === 'skip'
          ? 'Skip'
          : cellState.mode === 'past'
            ? 'Used'
            : 'Open';

      button.innerHTML = `
        <span class="lt-sheet-cell-id">Cell ${cellNumber}</span>
        <span class="lt-sheet-cell-token">${token}</span>
      `;
      button.title = describeCellAction(cellState.mode, cellNumber);
      button.setAttribute('aria-label', `Sheet ${sheetIndex + 1}, cell ${cellNumber}, ${token}`);
      button.addEventListener('click', () => onSheetCellClick(globalIndex));
      overlay.appendChild(button);
    });

    stage.appendChild(overlay);
    frame.appendChild(stage);
    frame.insertAdjacentHTML(
      'beforeend',
      `
        <div class="lt-legend-row">
          <span class="lt-legend-item"><span class="lt-legend-swatch lt-legend-swatch--use"></span>Label placed</span>
          <span class="lt-legend-item"><span class="lt-legend-swatch lt-legend-swatch--skip"></span>Skipped cell</span>
          <span class="lt-legend-item"><span class="lt-legend-swatch lt-legend-swatch--past"></span>Already used before start</span>
          <span class="lt-legend-item"><span class="lt-legend-swatch lt-legend-swatch--open"></span>Open cell</span>
        </div>
      `
    );

    card.appendChild(frame);
    container.appendChild(card);
  }
}

function renderOutputSummary() {
  const summary = document.getElementById('output-summary');
  const preview = document.getElementById('output-preview');
  const downloadButton = document.getElementById('download-pdf-btn');
  const generateButton = document.getElementById('generate-pdf-btn');
  generateButton.disabled = !state.currentPreset || !state.sourcePageCount || state.isGenerating;

  if (!state.sourcePageCount || !state.currentPreset) {
    summary.innerHTML = '<div class="lt-alert lt-alert-info">Export becomes available after the source PDF and sheet layout are ready.</div>';
    preview.innerHTML = '';
    downloadButton.disabled = true;
    return;
  }

  if (state.outputDirty || !state.outputBytes) {
    summary.innerHTML = `
      <div class="lt-alert lt-alert-info">
        Generate a PDF after reviewing the sheet preview. The exported document uses the exact page and cell geometry from the active preset.
      </div>
    `;
    preview.innerHTML = '';
    downloadButton.disabled = true;
    return;
  }

  summary.innerHTML = `
    <div class="lt-alert lt-alert-success">
      Output PDF ready. Download it directly or inspect the embedded preview before printing on the laser-label sheet.
    </div>
  `;
  preview.innerHTML = `
    <object data="${state.outputUrl}" type="application/pdf" class="output-embed">
      <div class="lt-alert lt-alert-info">
        Your browser cannot embed the generated PDF preview here. Use the download button instead.
      </div>
    </object>
  `;
  downloadButton.disabled = false;
}

function renderPresetOptions() {
  const select = document.getElementById('preset-select');
  select.innerHTML = `
    <option value="">Auto-detect from PDF / manual entry</option>
    <optgroup label="Built-in presets"></optgroup>
    <optgroup label="Saved in this browser"></optgroup>
    <option value="__manual__">Custom parameters</option>
  `;

  const [builtInGroup, userGroup] = select.querySelectorAll('optgroup');
  state.builtInPresets.forEach((preset) => {
    builtInGroup.appendChild(makePresetOption(preset));
  });
  state.userPresets.forEach((preset) => {
    userGroup.appendChild(makePresetOption(preset));
  });

  if (!state.userPresets.length) {
    const option = document.createElement('option');
    option.disabled = true;
    option.textContent = 'No browser-saved presets yet';
    userGroup.appendChild(option);
  }

  select.value = state.selectedPresetId || '';
}

function makePresetOption(preset) {
  const option = document.createElement('option');
  option.value = preset.id;
  option.textContent = `${preset.name}${preset.sku ? ` · ${preset.sku}` : ''}`;
  return option;
}

function describePresetSource(preset) {
  if (!preset) return 'Manual values';
  if (preset._origin === 'user') return 'Saved in this browser';
  if (preset._origin === 'builtin') return 'Shipped in preset-config.js';
  return 'Manual values';
}

function setActionMode(mode) {
  state.actionMode = mode;
  document.querySelectorAll('[data-action-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.actionMode === mode);
  });
}

function onSheetCellClick(index) {
  if (!state.currentPreset || !state.sourcePageCount) return;

  if (state.actionMode === 'start') {
    initializeSequentialPlan(index);
    setStatus('layout-status', `The layout now starts at cell ${index + 1}. Earlier cells are treated as already used.`, 'info');
  } else if (state.actionMode === 'use') {
    markCellForLabel(index);
    setStatus('layout-status', `Cell ${index + 1} is now assigned to a label.`, 'info');
  } else if (state.actionMode === 'skip') {
    skipCellAndAdvance(index);
    setStatus('layout-status', `Cell ${index + 1} was skipped and the next open cell picked up the label.`, 'info');
  }

  state.outputDirty = true;
  clearOutputPreview();
  renderAll();
}

function initializeSequentialPlan(startIndex) {
  const cellsPerSheet = getCellsPerSheet();
  if (!cellsPerSheet) return;

  const requiredCellCount = startIndex + state.sourcePageCount;
  const requiredSheets = Math.max(1, Math.ceil(requiredCellCount / cellsPerSheet));
  const totalCells = requiredSheets * cellsPerSheet;

  state.layoutCells = Array.from({ length: totalCells }, (_, index) => {
    if (index < startIndex) return { mode: 'past' };
    if (index < startIndex + state.sourcePageCount) return { mode: 'use' };
    return { mode: 'available' };
  });
}

function markCellForLabel(index) {
  ensureCellExists(index);
  const cell = state.layoutCells[index];
  if (cell.mode === 'past' || cell.mode === 'use') return;
  cell.mode = 'use';
  ensureUseCount(index + 1, index);
}

function skipCellAndAdvance(index) {
  ensureCellExists(index);
  const cell = state.layoutCells[index];
  if (cell.mode === 'past') return;
  cell.mode = 'skip';
  ensureUseCount(index + 1, -1);
}

function ensureUseCount(preferredFrom, lockedIndex) {
  const target = state.sourcePageCount;
  if (!target || !state.currentPreset) return;

  while (getUseIndices().length < target) {
    let nextIndex = findNextCellByMode('available', preferredFrom);
    if (nextIndex === -1) {
      expandByOneSheet();
      nextIndex = findNextCellByMode('available', preferredFrom);
    }
    if (nextIndex === -1) break;
    state.layoutCells[nextIndex].mode = 'use';
  }

  while (getUseIndices().length > target) {
    const removeIndex = findLastUseCandidate(lockedIndex, preferredFrom);
    if (removeIndex === -1) break;
    state.layoutCells[removeIndex].mode = 'available';
  }

  trimUnusedTrailingSheets();
}

function expandByOneSheet() {
  const cellsPerSheet = getCellsPerSheet();
  if (!cellsPerSheet) return;
  for (let i = 0; i < cellsPerSheet; i += 1) {
    state.layoutCells.push({ mode: 'available' });
  }
}

function findNextCellByMode(mode, preferredFrom) {
  for (let index = Math.max(0, preferredFrom); index < state.layoutCells.length; index += 1) {
    if (state.layoutCells[index].mode === mode) return index;
  }

  for (let index = 0; index < Math.max(0, preferredFrom); index += 1) {
    if (state.layoutCells[index].mode === mode) return index;
  }

  return -1;
}

function findLastUseCandidate(lockedIndex, preferredFrom) {
  for (let index = state.layoutCells.length - 1; index >= preferredFrom; index -= 1) {
    if (state.layoutCells[index].mode === 'use' && index !== lockedIndex) return index;
  }

  for (let index = state.layoutCells.length - 1; index >= 0; index -= 1) {
    if (state.layoutCells[index].mode === 'use' && index !== lockedIndex) return index;
  }

  return -1;
}

function ensureCellExists(index) {
  const cellsPerSheet = getCellsPerSheet();
  if (!cellsPerSheet) return;
  while (state.layoutCells.length <= index) {
    expandByOneSheet();
  }
}

function trimUnusedTrailingSheets() {
  const cellsPerSheet = getCellsPerSheet();
  if (!cellsPerSheet || !state.layoutCells.length) return;

  let lastRelevant = -1;
  state.layoutCells.forEach((cell, index) => {
    if (cell.mode !== 'available') lastRelevant = index;
  });

  const sheetsToKeep = Math.max(1, Math.ceil((lastRelevant + 1) / cellsPerSheet));
  state.layoutCells = state.layoutCells.slice(0, sheetsToKeep * cellsPerSheet);
}

function getCellsPerSheet() {
  if (!state.currentPreset) return 0;
  return state.currentPreset.columns * state.currentPreset.rows;
}

function getUseIndices() {
  return state.layoutCells
    .map((cell, index) => (cell.mode === 'use' ? index : -1))
    .filter((index) => index !== -1);
}

function buildLabelIndexMap() {
  const map = new Map();
  getUseIndices().forEach((cellIndex, labelIndex) => {
    map.set(cellIndex, labelIndex + 1);
  });
  return map;
}

function buildSheetGeometry(preset) {
  const gridWidth = preset.labelWidth + (preset.columns - 1) * preset.horizontalPitch;
  const gridHeight = preset.labelHeight + (preset.rows - 1) * preset.verticalPitch;
  const cells = [];

  for (let row = 0; row < preset.rows; row += 1) {
    for (let column = 0; column < preset.columns; column += 1) {
      const left = preset.leftMargin + column * preset.horizontalPitch;
      const top = preset.topMargin + row * preset.verticalPitch;
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
    cells,
  };
}

function detectMatchingPresetIds(widthPts, heightPts) {
  const tolerancePts = inchesToPoints(AUTO_MATCH_TOLERANCE_IN);
  return allPresets()
    .filter((preset) =>
      Math.abs(inchesToPoints(preset.labelWidth) - widthPts) <= tolerancePts &&
      Math.abs(inchesToPoints(preset.labelHeight) - heightPts) <= tolerancePts
    )
    .map((preset) => preset.id);
}

async function saveCurrentPreset() {
  if (!state.currentPreset) {
    setStatus('preset-status', state.currentPresetErrors[0] || 'The preset is incomplete.', 'danger');
    return;
  }

  const sourceId = state.selectedPresetId;
  const isUpdatingUserPreset = sourceId && state.userPresets.some((preset) => preset.id === sourceId);
  const id = isUpdatingUserPreset
    ? sourceId
    : `user-${slugify(state.currentPreset.name || 'preset')}-${Date.now()}`;

  const presetToSave = sanitizePreset({
    ...state.currentPreset,
    id,
  }, 'user', state.userPresets.length);

  if (isUpdatingUserPreset) {
    state.userPresets = state.userPresets.map((preset) => (preset.id === id ? presetToSave : preset));
  } else {
    state.userPresets.push(presetToSave);
  }

  persistUserPresets();
  state.selectedPresetId = id;
  renderPresetOptions();
  document.getElementById('preset-select').value = id;
  setStatus(
    'preset-status',
    `Saved in this browser. To make it part of the shipped config, copy or export the preset and paste it into ${CONFIG_PATH}.`,
    'success'
  );
  renderAll();
}

function clearUserPresets() {
  if (!state.userPresets.length) {
    document.getElementById('copy-fallback').hidden = true;
    setStatus(
      'preset-status',
      `No browser-saved presets were found. Shipped presets in ${CONFIG_PATH} are unchanged.`,
      'info'
    );
    renderAll();
    return;
  }

  const activeUserPresetSelected = state.selectedPresetId
    && state.userPresets.some((preset) => preset.id === state.selectedPresetId);

  localStorage.removeItem(STORAGE_KEY);
  state.userPresets = [];

  if (activeUserPresetSelected) {
    state.selectedPresetId = '__manual__';
  }

  document.getElementById('copy-fallback').hidden = true;
  renderPresetOptions();
  document.getElementById('preset-select').value = state.selectedPresetId || '';
  setStatus(
    'preset-status',
    `Cleared browser-saved presets. Shipped presets in ${CONFIG_PATH} are unchanged.`,
    'success'
  );
  renderAll();
}

async function copyCurrentPresetConfig() {
  if (!state.currentPreset) {
    setStatus('preset-status', 'Enter a valid preset before copying the config snippet.', 'danger');
    return;
  }

  const snippet = buildSinglePresetSnippet(normalizePreset({
    ...state.currentPreset,
    id: state.selectedPresetId && state.selectedPresetId !== '__manual__'
      ? state.selectedPresetId
      : `custom-${slugify(state.currentPreset.name || 'preset')}`,
  }));

  try {
    await labtoolsCopyText(snippet);
    document.getElementById('copy-fallback').hidden = true;
    setStatus(
      'preset-status',
      `Current settings copied. Paste the snippet into the presets array in ${CONFIG_PATH}.`,
      'success'
    );
  } catch (error) {
    setStatus('preset-status', 'The browser blocked clipboard access. Copy from the text area manually instead.', 'warn');
    const fallback = document.getElementById('copy-fallback');
    fallback.value = snippet;
    fallback.hidden = false;
    fallback.focus();
    fallback.select();
  }
}

function exportAllPresetConfigs() {
  const content = buildPresetConfigFileContent([...state.builtInPresets, ...state.userPresets]);
  labtoolsDownloadText('thermal-to-laser-presets.js', content, 'application/javascript;charset=utf-8');
  document.getElementById('copy-fallback').hidden = true;
  setStatus(
    'preset-status',
    `Exported all presets as a replacement config file. You can merge it back into ${CONFIG_PATH}.`,
    'success'
  );
}

async function generateOutputPdf() {
  if (!state.currentPreset || !state.sourceBytes || !state.sourcePageCount) {
    setStatus('output-status', 'Load a source PDF and a valid preset before generating the output.', 'danger');
    return;
  }

  const assigned = getUseIndices().length;
  if (assigned !== state.sourcePageCount) {
    setStatus(
      'output-status',
      `The sheet plan currently assigns ${assigned} of ${state.sourcePageCount} labels. Finish the layout before exporting.`,
      'danger'
    );
    return;
  }

  state.isGenerating = true;
  setStatus('output-status', 'Generating the output PDF…', 'info');
  renderAll();

  try {
    const sourceDoc = await PDFLib.PDFDocument.load(state.sourceBytes);
    const outputDoc = await PDFLib.PDFDocument.create();
    const embeddedPages = await outputDoc.embedPages(sourceDoc.getPages());
    const cellsPerSheet = getCellsPerSheet();
    const geometry = buildSheetGeometry(state.currentPreset);
    const useIndices = getUseIndices();
    const maxUseIndex = useIndices[useIndices.length - 1];
    const outputSheetCount = Math.floor(maxUseIndex / cellsPerSheet) + 1;
    const pageWidthPts = inchesToPoints(state.currentPreset.pageWidth);
    const pageHeightPts = inchesToPoints(state.currentPreset.pageHeight);

    const outputPages = [];
    for (let pageIndex = 0; pageIndex < outputSheetCount; pageIndex += 1) {
      outputPages.push(outputDoc.addPage([pageWidthPts, pageHeightPts]));
    }

    useIndices.forEach((cellIndex, labelIndex) => {
      const sheetIndex = Math.floor(cellIndex / cellsPerSheet);
      const cellRect = geometry.cells[cellIndex % cellsPerSheet];
      const page = outputPages[sheetIndex];
      const embedded = embeddedPages[labelIndex];
      const fitted = fitWithinBox(
        embedded.width,
        embedded.height,
        inchesToPoints(cellRect.widthIn),
        inchesToPoints(cellRect.heightIn)
      );

      const boxX = inchesToPoints(cellRect.xIn);
      const boxY = pageHeightPts - inchesToPoints(cellRect.yIn) - inchesToPoints(cellRect.heightIn);
      const drawX = boxX + (inchesToPoints(cellRect.widthIn) - fitted.width) / 2;
      const drawY = boxY + (inchesToPoints(cellRect.heightIn) - fitted.height) / 2;

      page.drawPage(embedded, {
        x: drawX,
        y: drawY,
        width: fitted.width,
        height: fitted.height,
      });
    });

    outputDoc.setTitle(`${state.sourceFile ? state.sourceFile.name : 'labels'} · laser layout`);
    outputDoc.setProducer('LabTools');
    outputDoc.setCreator('LabTools thermal-to-laser');

    state.outputBytes = await outputDoc.save();
    state.outputDirty = false;
    updateOutputPreview();
    setStatus(
      'output-status',
      `Generated ${outputSheetCount} output page${outputSheetCount === 1 ? '' : 's'}. Print at 100% scale on the target label sheet.`,
      'success'
    );
  } catch (error) {
    setStatus(
      'output-status',
      error && error.message ? error.message : 'Failed to generate the output PDF.',
      'danger'
    );
  } finally {
    state.isGenerating = false;
    renderAll();
  }
}

function downloadOutputPdf() {
  if (!state.outputBytes) return;
  const blob = new Blob([state.outputBytes], { type: 'application/pdf' });
  labtoolsDownloadBlob('thermal-to-laser-output.pdf', blob);
  setStatus('output-status', 'Output PDF downloaded.', 'success');
}

function updateOutputPreview() {
  clearOutputPreview();
  const blob = new Blob([state.outputBytes], { type: 'application/pdf' });
  state.outputUrl = URL.createObjectURL(blob);
}

function clearOutputPreview() {
  if (state.outputUrl) {
    URL.revokeObjectURL(state.outputUrl);
    state.outputUrl = '';
  }
}

function buildPresetConfigFileContent(presets) {
  const normalized = presets.map((preset) => normalizePreset(preset));
  const lines = [
    `'use strict';`,
    '',
    `window.THERMAL_TO_LASER_PRESET_CONFIG_PATH = '${CONFIG_PATH}';`,
    '',
    'window.THERMAL_TO_LASER_PRESET_CONFIG = {',
    '  version: 1,',
    '  presets: [',
  ];

  normalized.forEach((preset, index) => {
    lines.push(indentLines(buildSinglePresetSnippet(preset, false), 4) + (index < normalized.length - 1 ? ',' : ''));
  });

  lines.push('  ],');
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

function buildSinglePresetSnippet(preset, trailingComma) {
  const lines = ['{'];
  PRESET_FIELD_ORDER.forEach((field) => {
    if (preset[field] === '' || preset[field] == null) return;
    const value = typeof preset[field] === 'number'
      ? preset[field]
      : JSON.stringify(String(preset[field]));
    lines.push(`  ${field}: ${value},`);
  });
  lines.push(`}${trailingComma === false ? '' : ','}`);
  return lines.join('\n');
}

function normalizePreset(preset) {
  const normalized = {};
  PRESET_FIELD_ORDER.forEach((field) => {
    if (preset[field] === '' || preset[field] == null) return;
    normalized[field] = preset[field];
  });
  return normalized;
}

function presetsMatch(a, b) {
  if (!a || !b) return false;
  return PRESET_FIELD_ORDER.every((field) => {
    const left = a[field] == null ? '' : String(a[field]);
    const right = b[field] == null ? '' : String(b[field]);
    return left === right;
  });
}

function fitWithinBox(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
}

function describeCellAction(mode, cellNumber) {
  if (state.actionMode === 'start') {
    return `Start here from cell ${cellNumber}. Earlier cells will be treated as already used.`;
  }
  if (state.actionMode === 'use') {
    return mode === 'past'
      ? `Cell ${cellNumber} is before the selected starting point. Choose Start Here to reset the layout.`
      : `Assign a label to cell ${cellNumber}.`;
  }
  return mode === 'past'
    ? `Cell ${cellNumber} is before the selected starting point. Choose Start Here to reset the layout.`
    : `Skip cell ${cellNumber} and advance the next pending label.`;
}

function setStatus(elementId, message, variant) {
  const el = document.getElementById(elementId);
  el.className = `lt-alert lt-alert-${variant}`;
  el.textContent = message;
}

function toNumber(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function toInteger(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function valueOrEmpty(value) {
  return Number.isFinite(value) ? value : '';
}

function inchesToPoints(value) {
  return value * 72;
}

function pointsToInches(value) {
  return value / 72;
}

function formatDecimal(value, digits) {
  return Number(value).toFixed(digits).replace(/\.?0+$/, '');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'preset';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function indentLines(text, spaces) {
  const indent = ' '.repeat(spaces);
  return text.split('\n').map((line) => indent + line).join('\n');
}
