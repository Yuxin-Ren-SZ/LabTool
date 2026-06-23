/**
 * tool.js — Thermal-to-Laser Label Converter
 *
 * Converts one or more thermal-printer label PDFs (one label per page) into a
 * laser-printer mailing-label sheet PDF. Key workflow:
 *
 *   1. User uploads PDFs → pages are parsed and grouped by physical label size
 *      (buildSourceGroups / applyParsedSource).
 *   2. For each size group the user selects a sheet-geometry preset — either
 *      auto-matched, chosen from the dropdown, or entered manually
 *      (onPresetSelectChanged / onPresetEditorInput / recalcGroupPresetAndMaybePlan).
 *   3. The sheet preview lets the user place labels into specific cells or skip
 *      cells; the plan is stored per-group inside state.sourceGroups[i].plan.
 *   4. Once every group has a valid preset and complete plan, the user generates
 *      the output PDF (generateOutput via pdf-lib).
 *
 * Key data structures:
 *   state            — singleton object (defined below) holding all runtime state
 *   state.sourceGroups[] — one entry per detected label size; each has:
 *                          { heightPt, widthPt, pages[], preset, plan, … }
 *   state.sourceDocuments[] — raw PDFDocument objects (one per uploaded file)
 *
 * Top-level entry points:
 *   init()           — called on DOMContentLoaded; loads presets, binds events
 *   renderAll()      — full UI refresh; call after any state change
 *   generateOutput() — builds and downloads the final PDF
 */
'use strict';

const STORAGE_KEY = 'labtools:thermal-to-laser:user-presets:v1';
const AUTO_MATCH_TOLERANCE_IN = 0.05;
const UNIFORM_SIZE_TOLERANCE_PT = 0.5;
const CONFIG_PATH = window.THERMAL_TO_LASER_PRESET_CONFIG_PATH || 'tools/thermal-to-laser/preset-config.js';

const GEOMETRY_FIELD_IDS = [
  'pageWidth',
  'pageHeight',
  'topMargin',
  'sideMargin',
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
  'sideMargin',
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
  sourceDocuments: [],
  sourcePageCount: 0,
  sourceGroups: [],
  activeGroupIndex: 0,
  sourceParseError: '',
  actionMode: 'start',
  outputBytes: null,
  outputUrl: '',
  outputDirty: true,
  isGenerating: false,
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  // Session init
  (function() {
    const sid = new URLSearchParams(location.search).get('s');
    if (sid) labtoolsSessionSetActive(sid);
    ltSessionPillRender();
  })();

  state.builtInPresets = sanitizePresetList(
    (window.THERMAL_TO_LASER_PRESET_CONFIG && window.THERMAL_TO_LASER_PRESET_CONFIG.presets) || [],
    'builtin'
  );
  state.userPresets = loadUserPresets();

  bindEvents();
  renderPresetOptions();
  seedEditor(makeBlankPreset());
  setActionMode('start');
  setDefaultPresetStatusForActiveGroup();
  renderAll();
}

function bindEvents() {
  document.getElementById('source-pdf-trigger').addEventListener('click', promptForSourceFiles);
  document.getElementById('source-pdf').addEventListener('change', onSourcePdfSelected);
  document.getElementById('group-prev-btn').addEventListener('click', () => setActiveGroup(state.activeGroupIndex - 1));
  document.getElementById('group-next-btn').addEventListener('click', () => setActiveGroup(state.activeGroupIndex + 1));
  document.getElementById('preset-select').addEventListener('change', onPresetSelectChanged);
  document.getElementById('save-preset-btn').addEventListener('click', saveCurrentPreset);
  document.getElementById('clear-saved-presets-btn').addEventListener('click', clearUserPresets);
  document.getElementById('copy-current-btn').addEventListener('click', copyCurrentPresetConfig);
  document.getElementById('export-all-btn').addEventListener('click', exportAllPresetConfigs);
  document.getElementById('reset-layout-btn').addEventListener('click', () => {
    const group = getActiveGroup();
    if (!group || !group.currentPreset || !group.sourcePageCount) return;
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

function getRequiredPresetEditorField(fieldId) {
  const field = document.getElementById(fieldId);
  if (!field) {
    throw new Error(`Preset editor field "#${fieldId}" was not found in the DOM.`);
  }
  return field;
}

function getActiveGroup() {
  return state.sourceGroups[state.activeGroupIndex] || null;
}

function getGroupLabel(group, index) {
  const resolvedIndex = typeof index === 'number'
    ? index
    : state.sourceGroups.indexOf(group);
  return `Group ${resolvedIndex + 1}`;
}

function formatGroupSize(group) {
  if (!group) return '';
  return `${formatDecimal(pointsToInches(group.widthPts), 3)} × ${formatDecimal(pointsToInches(group.heightPts), 3)} in`;
}

function clonePresetDraft(preset) {
  return sanitizePreset({
    id: preset.id || '',
    name: preset.name || '',
    vendor: preset.vendor || '',
    sku: preset.sku || '',
    pageWidth: valueOrEmpty(preset.pageWidth),
    pageHeight: valueOrEmpty(preset.pageHeight),
    topMargin: valueOrEmpty(preset.topMargin),
    sideMargin: valueOrEmpty(preset.leftMargin),
    horizontalPitch: valueOrEmpty(preset.horizontalPitch),
    verticalPitch: valueOrEmpty(preset.verticalPitch),
    labelWidth: valueOrEmpty(preset.labelWidth),
    labelHeight: valueOrEmpty(preset.labelHeight),
    columns: valueOrEmpty(preset.columns),
    rows: valueOrEmpty(preset.rows),
    notes: preset.notes || '',
  }, 'editor', 0);
}

function createSourceGroup(seed, index) {
  return {
    id: `size-group-${index + 1}`,
    widthPts: seed.widthPts,
    heightPts: seed.heightPts,
    widthMinPts: seed.widthPts,
    widthMaxPts: seed.widthPts,
    heightMinPts: seed.heightPts,
    heightMaxPts: seed.heightPts,
    firstOrder: seed.originalOrder,
    pages: [],
    sourceDocumentIndexes: new Set(),
    sourcePageCount: 0,
    sourceDocumentCount: 0,
    detectedPresetIds: [],
    selectedPresetId: '',
    draftPreset: makeBlankPreset(),
    currentPreset: null,
    currentPresetErrors: [],
    layoutCells: [],
  };
}

function finalizeSourceGroup(group, index) {
  const detectedPresetIds = detectMatchingPresetIds(group.widthPts, group.heightPts);
  const autoPreset = detectedPresetIds.length === 1 ? findPresetById(detectedPresetIds[0]) : null;

  group.id = `size-group-${index + 1}`;
  group.pages.sort((left, right) => left.originalOrder - right.originalOrder);
  group.sourcePageCount = group.pages.length;
  group.sourceDocumentCount = group.sourceDocumentIndexes.size;
  group.detectedPresetIds = detectedPresetIds;
  group.selectedPresetId = autoPreset ? autoPreset.id : '';
  group.draftPreset = autoPreset ? clonePresetDraft(autoPreset) : makeBlankPreset();
  delete group.sourceDocumentIndexes;
  recalcGroupPresetAndMaybePlan(group, { resetPlan: true });
  return group;
}

function buildSourceGroups(pageEntries) {
  const tolerancePts = UNIFORM_SIZE_TOLERANCE_PT;
  const groups = [];

  pageEntries.forEach((entry) => {
    let match = null;

    for (const group of groups) {
      if (
        Math.abs(group.widthPts - entry.widthPts) <= tolerancePts &&
        Math.abs(group.heightPts - entry.heightPts) <= tolerancePts
      ) {
        match = group;
        break;
      }
    }

    if (!match) {
      match = createSourceGroup(entry, groups.length);
      groups.push(match);
    }

    match.pages.push(entry);
    match.sourceDocumentIndexes.add(entry.sourceDocumentIndex);
    match.widthMinPts = Math.min(match.widthMinPts, entry.widthPts);
    match.widthMaxPts = Math.max(match.widthMaxPts, entry.widthPts);
    match.heightMinPts = Math.min(match.heightMinPts, entry.heightPts);
    match.heightMaxPts = Math.max(match.heightMaxPts, entry.heightPts);
    match.firstOrder = Math.min(match.firstOrder, entry.originalOrder);
  });

  return groups
    .sort((left, right) =>
      (right.heightPts - left.heightPts)
      || (right.widthPts - left.widthPts)
      || (left.firstOrder - right.firstOrder)
    )
    .map((group, index) => finalizeSourceGroup(group, index));
}

function setDefaultPresetStatusForActiveGroup() {
  const group = getActiveGroup();
  const message = group
    ? `${getGroupLabel(group)} can use a shipped preset, a browser-saved preset, or custom geometry. Browser-saved changes stay local until you copy or export them back into ${CONFIG_PATH}.`
    : `Built-in presets ship from ${CONFIG_PATH}. Browser-saved presets stay local until you copy or export them back into that file.`;
  setStatus('preset-status', message, 'info');
}

function seedEditorFromGroup(group) {
  seedEditor(group ? group.draftPreset : makeBlankPreset());
}

function setActiveGroup(index) {
  if (!state.sourceGroups.length) return;

  const clamped = Math.max(0, Math.min(index, state.sourceGroups.length - 1));
  if (clamped === state.activeGroupIndex) return;

  state.activeGroupIndex = clamped;
  seedEditorFromGroup(getActiveGroup());
  renderPresetOptions();
  setDefaultPresetStatusForActiveGroup();
  renderAll();
}

async function promptForSourceFiles() {
  if (!canUseOpenFilePicker()) {
    document.getElementById('source-pdf').click();
    return;
  }

  try {
    const handles = await window.showOpenFilePicker({
      id: 'thermal-to-laser-source-pdfs',
      multiple: true,
      startIn: 'downloads',
      types: [
        {
          description: 'PDF documents',
          accept: {
            'application/pdf': ['.pdf'],
          },
        },
      ],
    });
    const files = await Promise.all(handles.map((handle) => handle.getFile()));
    if (!files.length) return;
    await loadSourceFiles(files);
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    document.getElementById('source-pdf').click();
  }
}

async function onSourcePdfSelected(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';

  if (!files.length) {
    return;
  }

  await loadSourceFiles(files);
}

async function loadSourceFiles(files) {
  setStatus('source-status', files.length === 1 ? 'Reading PDF…' : `Reading ${files.length} PDFs…`, 'info');
  renderStepProgress();

  let parsedSource;
  try {
    parsedSource = await parseSourceFiles(files);
  } catch (error) {
    setStatus(
      'source-status',
      error && error.message ? error.message : 'Unable to parse the selected PDF files.',
      'danger'
    );
    renderAll();
    return;
  }

  try {
    applyParsedSource(parsedSource);
    renderPresetOptions();
    seedEditorFromGroup(getActiveGroup());
    setDefaultPresetStatusForActiveGroup();
    setStatus(
      'source-status',
      buildLoadedSourceMessage(),
      'success'
    );
  } catch (error) {
    console.error('Unexpected thermal-to-laser UI error while loading source PDFs.', error);
    setStatus(
      'source-status',
      'The PDFs were read, but the tool could not refresh the preset editor. Reload the page and try again.',
      'danger'
    );
  }

  renderAll();
}

async function parseSourceFiles(files) {
  const sourceDocuments = [];
  const pageEntries = [];

  for (let sourceDocumentIndex = 0; sourceDocumentIndex < files.length; sourceDocumentIndex += 1) {
    const file = files[sourceDocumentIndex];
    const arrayBuffer = await labtoolsReadFileAsArrayBuffer(file);
    const bytes = new Uint8Array(arrayBuffer);
    let sourceDoc;

    try {
      sourceDoc = await PDFLib.PDFDocument.load(bytes);
    } catch (error) {
      throw new Error(`Unable to parse "${file.name}" as a PDF.`);
    }

    const pages = sourceDoc.getPages();
    if (!pages.length) {
      throw new Error(`"${file.name}" does not contain any pages.`);
    }

    sourceDocuments.push({
      fileName: file.name,
      bytes,
      pageCount: pages.length,
    });

    pages.forEach((page, pageIndex) => {
      const size = page.getSize();
      pageEntries.push({
        sourceDocumentIndex,
        pageIndex,
        fileName: file.name,
        widthPts: size.width,
        heightPts: size.height,
        originalOrder: pageEntries.length,
      });
    });
  }

  return {
    sourceDocuments,
    sourcePageCount: pageEntries.length,
    sourceGroups: buildSourceGroups(pageEntries),
  };
}

function applyParsedSource(parsedSource) {
  clearSourceState();
  state.sourceDocuments = parsedSource.sourceDocuments;
  state.sourcePageCount = parsedSource.sourcePageCount;
  state.sourceGroups = parsedSource.sourceGroups;
  state.activeGroupIndex = 0;
}

function onPresetSelectChanged(event) {
  const group = getActiveGroup();
  if (!group) return;

  const selectedId = event.target.value;
  group.selectedPresetId = selectedId;

  if (!selectedId) {
    if (group.detectedPresetIds.length === 1) {
      const detected = findPresetById(group.detectedPresetIds[0]);
      if (detected) {
        group.draftPreset = clonePresetDraft(detected);
        seedEditorFromGroup(group);
      }
    }
    recalcGroupPresetAndMaybePlan(group, { resetPlan: true });
    setDefaultPresetStatusForActiveGroup();
    renderAll();
    return;
  }

  if (selectedId === '__manual__') {
    if (!document.getElementById('presetName').value.trim()) {
      group.draftPreset = makeBlankPreset();
      seedEditorFromGroup(group);
    }
    group.draftPreset = collectPresetFromEditor();
    recalcGroupPresetAndMaybePlan(group, { resetPlan: true });
    setStatus('preset-status', `${getGroupLabel(group)} is now using custom parameters.`, 'info');
    renderAll();
    return;
  }

  const preset = findPresetById(selectedId);
  if (!preset) return;
  group.draftPreset = clonePresetDraft(preset);
  seedEditorFromGroup(group);
  recalcGroupPresetAndMaybePlan(group, { resetPlan: true });
  setStatus('preset-status', `Loaded preset for ${getGroupLabel(group)}: ${preset.name}.`, 'info');
  renderAll();
}

function onPresetEditorInput(event) {
  const group = getActiveGroup();
  if (!group) return;

  const selectedPreset = group.selectedPresetId ? findPresetById(group.selectedPresetId) : null;
  const resetPlan = GEOMETRY_FIELD_IDS.includes(event.target.id);

  if (selectedPreset) {
    group.selectedPresetId = '__manual__';
    document.getElementById('preset-select').value = '__manual__';
    setStatus(
      'preset-status',
      `${getGroupLabel(group)} cleared the preset selection. ${selectedPreset.name} is now being edited as custom parameters.`,
      'info'
    );
  }

  group.draftPreset = collectPresetFromEditor();
  recalcGroupPresetAndMaybePlan(group, { resetPlan });
  if (resetPlan && group.sourcePageCount && group.currentPreset) {
    setStatus('layout-status', 'Layout refreshed to reflect the updated sheet geometry.', 'info');
  }
  renderAll();
}

function recalcGroupPresetAndMaybePlan(group, options) {
  if (!group) return;

  const validation = validatePreset(group.draftPreset);
  group.currentPreset = validation.valid ? validation.preset : null;
  group.currentPresetErrors = validation.errors;
  state.outputDirty = true;
  clearOutputPreview();

  if (!group.currentPreset) {
    group.layoutCells = [];
    return;
  }

  if (!group.sourcePageCount) {
    group.layoutCells = [];
    return;
  }

  if (options && options.resetPlan) {
    initializeSequentialPlan(0, group);
  } else {
    ensureUseCount(0, -1, group);
    trimUnusedTrailingSheets(group);
  }
}

function clearSourceState() {
  state.sourceDocuments = [];
  state.sourcePageCount = 0;
  state.sourceGroups = [];
  state.activeGroupIndex = 0;
  state.sourceParseError = '';
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
  getRequiredPresetEditorField('presetName').value = preset.name || '';
  getRequiredPresetEditorField('presetVendor').value = preset.vendor || '';
  getRequiredPresetEditorField('presetSku').value = preset.sku || '';
  getRequiredPresetEditorField('pageWidth').value = valueOrEmpty(preset.pageWidth);
  getRequiredPresetEditorField('pageHeight').value = valueOrEmpty(preset.pageHeight);
  getRequiredPresetEditorField('topMargin').value = valueOrEmpty(preset.topMargin);
  getRequiredPresetEditorField('sideMargin').value = valueOrEmpty(preset.leftMargin);
  getRequiredPresetEditorField('horizontalPitch').value = valueOrEmpty(preset.horizontalPitch);
  getRequiredPresetEditorField('verticalPitch').value = valueOrEmpty(preset.verticalPitch);
  getRequiredPresetEditorField('labelWidth').value = valueOrEmpty(preset.labelWidth);
  getRequiredPresetEditorField('labelHeight').value = valueOrEmpty(preset.labelHeight);
  getRequiredPresetEditorField('columns').value = valueOrEmpty(preset.columns);
  getRequiredPresetEditorField('rows').value = valueOrEmpty(preset.rows);
  getRequiredPresetEditorField('presetNotes').value = preset.notes || '';
}

function collectPresetFromEditor() {
  const group = getActiveGroup();
  return sanitizePreset(
    {
      id: group && group.selectedPresetId && group.selectedPresetId !== '__manual__'
        ? group.selectedPresetId
        : '',
      name: getRequiredPresetEditorField('presetName').value.trim(),
      vendor: getRequiredPresetEditorField('presetVendor').value.trim(),
      sku: getRequiredPresetEditorField('presetSku').value.trim(),
      pageWidth: getRequiredPresetEditorField('pageWidth').value,
      pageHeight: getRequiredPresetEditorField('pageHeight').value,
      topMargin: getRequiredPresetEditorField('topMargin').value,
      leftMargin: getRequiredPresetEditorField('sideMargin').value,
      horizontalPitch: getRequiredPresetEditorField('horizontalPitch').value,
      verticalPitch: getRequiredPresetEditorField('verticalPitch').value,
      labelWidth: getRequiredPresetEditorField('labelWidth').value,
      labelHeight: getRequiredPresetEditorField('labelHeight').value,
      columns: getRequiredPresetEditorField('columns').value,
      rows: getRequiredPresetEditorField('rows').value,
      notes: getRequiredPresetEditorField('presetNotes').value.trim(),
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
  renderGroupNavigation();
  renderPresetOptions();
  renderPresetSummary();
  renderLayoutSummary();
  renderSheetPages();
  renderOutputSummary();
}

function renderGroupNavigation() {
  const container = document.getElementById('group-navigation');
  const status = document.getElementById('group-nav-status');
  const note = document.getElementById('group-nav-note');
  const previousButton = document.getElementById('group-prev-btn');
  const nextButton = document.getElementById('group-next-btn');
  const group = getActiveGroup();

  if (!group) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  previousButton.disabled = state.activeGroupIndex === 0;
  nextButton.disabled = state.activeGroupIndex === state.sourceGroups.length - 1;
  status.textContent = state.sourceGroups.length === 1
    ? 'Single label-size group'
    : `${getGroupLabel(group)} of ${state.sourceGroups.length}`;
  note.textContent = `${formatGroupSize(group)} · ${group.sourcePageCount} label${group.sourcePageCount === 1 ? '' : 's'} · ${group.sourceDocumentCount} PDF${group.sourceDocumentCount === 1 ? '' : 's'} · export order runs taller to shorter labels.`;
}

function allGroupsReadyForExport() {
  return state.sourceGroups.length > 0 && state.sourceGroups.every((group) =>
    group.currentPreset && getUseIndices(group).length === group.sourcePageCount
  );
}

function collectIncompleteGroups() {
  return state.sourceGroups.filter((group) =>
    !group.currentPreset || getUseIndices(group).length !== group.sourcePageCount
  );
}

function renderStepProgress() {
  const step1 = document.getElementById('step-mini-0');
  const step2 = document.getElementById('step-mini-1');
  const step3 = document.getElementById('step-mini-2');

  step1.className = 'lt-step-mini__item';
  step2.className = 'lt-step-mini__item';
  step3.className = 'lt-step-mini__item';

  if (state.sourcePageCount) {
    step1.classList.add('done');
  } else {
    step1.classList.add('active');
  }

  if (state.sourcePageCount && allGroupsReadyForExport()) {
    step2.classList.add('active');
    if (state.outputBytes && !state.outputDirty) {
      step2.classList.add('done');
      step3.classList.add('active');
    }
  }
}

function renderSourceSummary() {
  const meta = document.getElementById('source-meta');
  if (state.sourceParseError) {
    meta.innerHTML = '';
    return;
  }

  if (!state.sourcePageCount || !state.sourceGroups.length) {
    meta.innerHTML = `
      <div class="meta-card">
        <div class="meta-card-label">Waiting For Input</div>
        <div class="meta-card-value">Upload one or more PDFs</div>
        <div class="meta-card-note">Each PDF page should be one thermal label. Files are combined in the order you select them.</div>
      </div>
    `;
    return;
  }

  const groupSummaryNote = state.sourceGroups.length === 1
    ? `All uploaded labels share one detected size: ${formatGroupSize(state.sourceGroups[0])}.`
    : `${state.sourceGroups.length} label-size groups were detected. Export splits them automatically from taller labels to shorter labels.`;

  meta.innerHTML = `
    <div class="meta-card">
      <div class="meta-card-label">Source Pages</div>
      <div class="meta-card-value">${state.sourcePageCount}</div>
      <div class="meta-card-note">Labels required on the mailing-label sheet.</div>
    </div>
    <div class="meta-card">
      <div class="meta-card-label">Input Files</div>
      <div class="meta-card-value">${state.sourceDocuments.length}</div>
      <div class="meta-card-note">Processed in the order shown below for layout and export.</div>
    </div>
    <div class="meta-card">
      <div class="meta-card-label">Size Groups</div>
      <div class="meta-card-value">${state.sourceGroups.length}</div>
      <div class="meta-card-note">${escapeHtml(groupSummaryNote)}</div>
    </div>
    <div class="meta-card meta-card--files">
      <div class="meta-card-label">Detected Label Sizes</div>
      <ol class="source-file-list">
        ${state.sourceGroups.map((group, index) => `
          <li class="source-file-item">
            <span class="source-file-order">${index + 1}.</span>
            <span class="source-file-name">${escapeHtml(formatGroupSize(group))}</span>
            <span class="source-file-pages">${group.sourcePageCount} label${group.sourcePageCount === 1 ? '' : 's'} · ${group.sourceDocumentCount} PDF${group.sourceDocumentCount === 1 ? '' : 's'}</span>
          </li>
        `).join('')}
      </ol>
      <div class="meta-card-note">Each size group gets its own preset, sheet preview, and export pages.</div>
    </div>
    <div class="meta-card meta-card--files">
      <div class="meta-card-label">File Order</div>
      <ol class="source-file-list">
        ${state.sourceDocuments.map((item, index) => `
          <li class="source-file-item">
            <span class="source-file-order">${index + 1}.</span>
            <span class="source-file-name">${escapeHtml(item.fileName)}</span>
            <span class="source-file-pages">${item.pageCount} page${item.pageCount === 1 ? '' : 's'}</span>
          </li>
        `).join('')}
      </ol>
      <div class="meta-card-note">Labels are combined using this file order and each file’s original page order.</div>
    </div>
  `;
}

function renderPresetSummary() {
  const summary = document.getElementById('preset-summary');
  const group = getActiveGroup();
  const detected = group ? group.detectedPresetIds.map((id) => findPresetById(id)).filter(Boolean) : [];

  if (!group) {
    summary.innerHTML = `
      <div class="preset-summary-panel preset-summary-panel--info">
        <div class="preset-summary-top">
          <div>
            <div class="preset-summary-eyebrow">Preset Summary</div>
            <div class="preset-summary-title">Enter or load a sheet preset</div>
            <div class="preset-summary-subtitle">Upload PDFs, then choose a shipped preset or enter custom geometry to unlock the layout preview.</div>
          </div>
          <span class="preset-summary-chip">Waiting</span>
        </div>
      </div>
    `;
    return;
  }

  if (!group.currentPreset) {
    const hasMultipleMatches = detected.length > 1;
    const needsCustomEntry = !detected.length;
    const badge = hasMultipleMatches
      ? 'Multiple matches'
      : needsCustomEntry
        ? 'No match'
        : 'Custom';
    const panelVariant = group.currentPresetErrors.length ? 'warn' : 'info';
    const title = hasMultipleMatches
      ? 'Choose the intended preset'
      : needsCustomEntry
        ? 'No preset matched this label size'
        : (group.draftPreset.name || 'Finish the custom geometry');
    const subtitle = group.currentPresetErrors[0]
      || (hasMultipleMatches
        ? 'Pick one preset or finish entering custom geometry before the sheet preview can be generated.'
        : 'Enter the remaining geometry fields to unlock this group’s layout preview.');
    const matchNote = hasMultipleMatches
      ? `Matching presets for ${formatGroupSize(group)}: ${detected.map((item) => item.name).join(', ')}.`
      : needsCustomEntry
        ? `No shipped or browser-saved preset matched ${formatGroupSize(group)}.`
        : '';
    summary.innerHTML = `
      <div class="preset-summary-panel preset-summary-panel--${panelVariant}">
        <div class="preset-summary-top">
          <div>
            <div class="preset-summary-eyebrow">${escapeHtml(getGroupLabel(group))} <span>•</span> <span>${escapeHtml(formatGroupSize(group))}</span></div>
            <div class="preset-summary-title">${escapeHtml(title)}</div>
            <div class="preset-summary-subtitle">${escapeHtml(subtitle)}</div>
          </div>
          <span class="preset-summary-chip">${escapeHtml(badge)}</span>
        </div>
        ${matchNote ? `<div class="preset-summary-match-note">${escapeHtml(matchNote)}</div>` : ''}
      </div>
    `;
    return;
  }

  const preset = group.currentPreset;
  const capacity = preset.columns * preset.rows;
  const selectedPreset = group.selectedPresetId ? findPresetById(group.selectedPresetId) : null;
  const exactDetectedPreset = group.detectedPresetIds.length === 1
    ? findPresetById(group.detectedPresetIds[0])
    : null;
  const autoDetected = !!(
    exactDetectedPreset
    && presetsMatch(exactDetectedPreset, preset)
    && (!selectedPreset || selectedPreset.id === exactDetectedPreset.id)
  );
  const sourceLabel = selectedPreset
    ? (presetsMatch(selectedPreset, preset)
        ? describePresetSource(selectedPreset)
        : `Edited from ${selectedPreset.name}`)
    : autoDetected && exactDetectedPreset
      ? describePresetSource(exactDetectedPreset)
      : 'Manual values';
  const badge = autoDetected
    ? 'Auto-detected'
    : selectedPreset
      ? 'Selected preset'
      : 'Custom';
  const panelVariant = autoDetected ? 'success' : 'info';
  const matchNote = group.detectedPresetIds.length > 1
    ? `Other matching presets for this label size: ${detected.map((item) => item.name).join(', ')}.`
    : !group.detectedPresetIds.length
      ? (selectedPreset
          ? `This label size did not auto-match a preset, so ${preset.name} is being used manually.`
          : 'This label size did not match any shipped or browser-saved preset, so the current sheet geometry is custom.')
      : autoDetected
        ? `Matched the uploaded PDF to ${preset.name}.`
        : '';

  summary.innerHTML = `
    <div class="preset-summary-panel preset-summary-panel--${panelVariant}">
      <div class="preset-summary-top">
        <div>
          <div class="preset-summary-eyebrow">${escapeHtml(getGroupLabel(group))} <span>•</span> <span>${escapeHtml(formatGroupSize(group))}</span></div>
          <div class="preset-summary-title">${escapeHtml(preset.name)}</div>
          <div class="preset-summary-subtitle">${escapeHtml(sourceLabel)}</div>
        </div>
        <span class="preset-summary-chip">${escapeHtml(badge)}</span>
      </div>
      <div class="preset-summary-facts">
        <div class="preset-summary-fact">
          <div class="preset-summary-fact-label">Sheet Capacity</div>
          <div class="preset-summary-fact-value">${capacity}</div>
          <div class="preset-summary-fact-note">${preset.columns} columns × ${preset.rows} rows</div>
        </div>
        <div class="preset-summary-fact">
          <div class="preset-summary-fact-label">Geometry</div>
          <div class="preset-summary-fact-value">${formatDecimal(preset.labelWidth, 3)} × ${formatDecimal(preset.labelHeight, 3)} in</div>
          <div class="preset-summary-fact-note">${group.sourcePageCount} label${group.sourcePageCount === 1 ? '' : 's'} in this size group</div>
        </div>
        <div class="preset-summary-fact">
          <div class="preset-summary-fact-label">Pitch</div>
          <div class="preset-summary-fact-value">${formatDecimal(preset.horizontalPitch, 3)} × ${formatDecimal(preset.verticalPitch, 3)} in</div>
          <div class="preset-summary-fact-note">Page ${formatDecimal(preset.pageWidth, 3)} × ${formatDecimal(preset.pageHeight, 3)} in · margins ${formatDecimal(preset.leftMargin, 3)} / ${formatDecimal(preset.topMargin, 3)} in</div>
        </div>
      </div>
      ${matchNote ? `<div class="preset-summary-match-note">${escapeHtml(matchNote)}</div>` : ''}
    </div>
  `;
}

function renderLayoutSummary() {
  const summary = document.getElementById('layout-summary');
  const group = getActiveGroup();

  if (!state.sourcePageCount) {
    summary.innerHTML = '<div class="lt-alert lt-alert-info">Upload source PDFs to plan the label placement.</div>';
    return;
  }

  if (!group || !group.currentPreset) {
    summary.innerHTML = `<div class="lt-alert lt-alert-warn">${escapeHtml(group ? (group.currentPresetErrors[0] || 'Enter a valid preset to continue.') : 'Enter a valid preset to continue.')}</div>`;
    return;
  }

  const useCount = getUseIndices(group).length;
  const skipCount = group.layoutCells.filter((cell) => cell.mode === 'skip').length;
  const pastCount = group.layoutCells.filter((cell) => cell.mode === 'past').length;
  const sheetCount = Math.max(1, Math.ceil(group.layoutCells.length / getCellsPerSheet(group)));
  const remaining = Math.max(0, group.sourcePageCount - useCount);

  summary.innerHTML = `
    <div class="meta-grid meta-grid--tight">
      <div class="meta-card">
        <div class="meta-card-label">Assigned Labels</div>
        <div class="meta-card-value">${useCount} / ${group.sourcePageCount}</div>
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
  const group = getActiveGroup();
  container.innerHTML = '';

  if (!state.sourcePageCount || !group || !group.currentPreset) {
    container.innerHTML = `
      <div class="lt-preview-frame">
        <div class="lt-alert lt-alert-info">
          The sheet preview appears after the PDF is loaded and the sheet geometry is valid.
        </div>
      </div>
    `;
    return;
  }

  const geometry = buildSheetGeometry(group.currentPreset);
  const cellsPerSheet = geometry.cells.length;
  const labelIndexMap = buildLabelIndexMap(group);
  const sheetCount = Math.max(1, Math.ceil(group.layoutCells.length / cellsPerSheet));

  for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex += 1) {
    const sheetStart = sheetIndex * cellsPerSheet;
    const sheetCells = group.layoutCells.slice(sheetStart, sheetStart + cellsPerSheet);
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

    const rulerWrap = document.createElement('div');
    rulerWrap.className = 'sheet-preview-ruler-wrap';

    const stage = document.createElement('div');
    stage.className = 'lt-sheet-stage';
    stage.style.setProperty('--sheet-aspect', `${group.currentPreset.pageWidth} / ${group.currentPreset.pageHeight}`);
    rulerWrap.style.setProperty('--sheet-aspect', `${group.currentPreset.pageWidth} / ${group.currentPreset.pageHeight}`);

    const region = document.createElement('div');
    region.className = 'lt-sheet-grid-region';
    region.style.left = `${geometry.gridLeftPct}%`;
    region.style.top = `${geometry.gridTopPct}%`;
    region.style.width = `${geometry.gridWidthPct}%`;
    region.style.height = `${geometry.gridHeightPct}%`;
    stage.appendChild(region);
    appendSheetRulers(rulerWrap, geometry, group.currentPreset);

    const overlay = document.createElement('div');
    overlay.className = 'lt-sheet-grid';

    geometry.cells.forEach((rect, cellIndex) => {
      const globalIndex = sheetStart + cellIndex;
      ensureCellExists(globalIndex, group);
      const cellState = group.layoutCells[globalIndex];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `lt-sheet-cell lt-sheet-cell--${cellState.mode}`;
      button.style.left = `${rect.leftPct}%`;
      button.style.top = `${rect.topPct}%`;
      button.style.width = `${rect.widthPct}%`;
      button.style.height = `${rect.heightPct}%`;

      const labelNumber = labelIndexMap.get(globalIndex) || '';
      const cellNumber = globalIndex + 1;
      const rowNumber = Math.floor(cellIndex / group.currentPreset.columns) + 1;
      const columnNumber = (cellIndex % group.currentPreset.columns) + 1;
      const visibleToken = cellState.mode === 'use' && labelNumber ? `L${labelNumber}` : '';
      const cellStateLabel = cellState.mode === 'use'
        ? `label ${labelNumber || 'assigned'}`
        : cellState.mode === 'skip'
          ? 'skipped'
          : cellState.mode === 'past'
            ? 'already used before start'
            : 'open';

      button.innerHTML = `
        <span class="lt-sheet-cell-id">Cell ${cellNumber}</span>
        ${visibleToken ? `<span class="lt-sheet-cell-token">${visibleToken}</span>` : ''}
      `;
      button.title = describeCellAction(cellState.mode, cellNumber);
      button.setAttribute('aria-label', `Sheet ${sheetIndex + 1}, row ${rowNumber}, column ${columnNumber}, cell ${cellNumber}, ${cellStateLabel}`);
      button.addEventListener('click', () => onSheetCellClick(globalIndex));
      overlay.appendChild(button);
    });

    stage.appendChild(overlay);
    rulerWrap.appendChild(stage);
    frame.appendChild(rulerWrap);
    frame.insertAdjacentHTML(
      'beforeend',
      `
        <div class="lt-legend-row">
          <span class="lt-legend-item"><span class="lt-legend-swatch lt-legend-swatch--use"></span>Placed label</span>
          <span class="lt-legend-item"><span class="lt-legend-swatch lt-legend-swatch--skip"></span>Skipped slot</span>
          <span class="lt-legend-item"><span class="lt-legend-swatch lt-legend-swatch--past"></span>Used before start</span>
          <span class="lt-legend-item"><span class="lt-legend-swatch lt-legend-swatch--open"></span>Open slot</span>
        </div>
      `
    );

    card.appendChild(frame);
    container.appendChild(card);
  }
}

function appendSheetRulers(rulerWrap, geometry, preset) {
  for (let column = 0; column < preset.columns; column += 1) {
    const rect = geometry.cells[column];
    const label = document.createElement('span');
    label.className = 'sheet-axis-label sheet-axis-label--column';
    label.textContent = String(column + 1);
    label.setAttribute('aria-hidden', 'true');
    label.style.left = `${rect.leftPct}%`;
    label.style.width = `${rect.widthPct}%`;
    rulerWrap.appendChild(label);
  }

  for (let row = 0; row < preset.rows; row += 1) {
    const rect = geometry.cells[row * preset.columns];
    const label = document.createElement('span');
    label.className = 'sheet-axis-label sheet-axis-label--row';
    label.textContent = String(row + 1);
    label.setAttribute('aria-hidden', 'true');
    label.style.top = `${rect.topPct}%`;
    label.style.height = `${rect.heightPct}%`;
    rulerWrap.appendChild(label);
  }
}

function renderOutputSummary() {
  const summary = document.getElementById('output-summary');
  const preview = document.getElementById('output-preview');
  const downloadButton = document.getElementById('download-pdf-btn');
  const generateButton = document.getElementById('generate-pdf-btn');
  generateButton.disabled = !state.sourceGroups.length || !state.sourcePageCount || state.isGenerating;

  if (!state.sourcePageCount || !state.sourceGroups.length) {
    summary.innerHTML = '<div class="lt-alert lt-alert-info">Export becomes available after the source PDFs and sheet layout are ready.</div>';
    preview.innerHTML = '';
    downloadButton.disabled = true;
    return;
  }

  if (state.outputDirty || !state.outputBytes) {
    const incompleteGroups = collectIncompleteGroups();
    summary.innerHTML = `
      <div class="lt-alert lt-alert-${incompleteGroups.length ? 'warn' : 'info'}">
        ${incompleteGroups.length
          ? `Finish ${incompleteGroups.map((group) => `${getGroupLabel(group)} (${formatGroupSize(group)})`).join(', ')} before exporting. Each size group needs its own valid preset and complete sheet layout.`
          : `Generate a PDF after reviewing the sheet previews. The exported document combines ${state.sourceGroups.length} size group${state.sourceGroups.length === 1 ? '' : 's'} in taller-to-shorter label order.`}
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
  const group = getActiveGroup();
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

  select.value = group ? (group.selectedPresetId || '') : '';
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
  const group = getActiveGroup();
  if (!group || !group.currentPreset || !group.sourcePageCount) return;

  if (state.actionMode === 'start') {
    initializeSequentialPlan(index, group);
    setStatus('layout-status', `${getGroupLabel(group)} now starts at cell ${index + 1}. Earlier cells are treated as already used.`, 'info');
  } else if (state.actionMode === 'use') {
    markCellForLabel(index, group);
    setStatus('layout-status', `${getGroupLabel(group)} assigned a label to cell ${index + 1}.`, 'info');
  } else if (state.actionMode === 'skip') {
    skipCellAndAdvance(index, group);
    setStatus('layout-status', `${getGroupLabel(group)} skipped cell ${index + 1} and advanced the next label.`, 'info');
  }

  state.outputDirty = true;
  clearOutputPreview();
  renderAll();
}

function initializeSequentialPlan(startIndex, group) {
  const targetGroup = group || getActiveGroup();
  const cellsPerSheet = getCellsPerSheet(targetGroup);
  if (!cellsPerSheet) return;

  const requiredCellCount = startIndex + targetGroup.sourcePageCount;
  const requiredSheets = Math.max(1, Math.ceil(requiredCellCount / cellsPerSheet));
  const totalCells = requiredSheets * cellsPerSheet;

  targetGroup.layoutCells = Array.from({ length: totalCells }, (_, index) => {
    if (index < startIndex) return { mode: 'past' };
    if (index < startIndex + targetGroup.sourcePageCount) return { mode: 'use' };
    return { mode: 'available' };
  });
}

function markCellForLabel(index, group) {
  const targetGroup = group || getActiveGroup();
  ensureCellExists(index, targetGroup);
  const cell = targetGroup.layoutCells[index];
  if (cell.mode === 'past' || cell.mode === 'use') return;
  cell.mode = 'use';
  ensureUseCount(index + 1, index, targetGroup);
}

function skipCellAndAdvance(index, group) {
  const targetGroup = group || getActiveGroup();
  ensureCellExists(index, targetGroup);
  const cell = targetGroup.layoutCells[index];
  if (cell.mode === 'past') return;
  cell.mode = 'skip';
  ensureUseCount(index + 1, -1, targetGroup);
}

function ensureUseCount(preferredFrom, lockedIndex, group) {
  const targetGroup = group || getActiveGroup();
  const target = targetGroup ? targetGroup.sourcePageCount : 0;
  if (!target || !targetGroup || !targetGroup.currentPreset) return;

  while (getUseIndices(targetGroup).length < target) {
    let nextIndex = findNextCellByMode('available', preferredFrom, targetGroup);
    if (nextIndex === -1) {
      expandByOneSheet(targetGroup);
      nextIndex = findNextCellByMode('available', preferredFrom, targetGroup);
    }
    if (nextIndex === -1) break;
    targetGroup.layoutCells[nextIndex].mode = 'use';
  }

  while (getUseIndices(targetGroup).length > target) {
    const removeIndex = findLastUseCandidate(lockedIndex, preferredFrom, targetGroup);
    if (removeIndex === -1) break;
    targetGroup.layoutCells[removeIndex].mode = 'available';
  }

  trimUnusedTrailingSheets(targetGroup);
}

function expandByOneSheet(group) {
  const targetGroup = group || getActiveGroup();
  const cellsPerSheet = getCellsPerSheet(targetGroup);
  if (!cellsPerSheet) return;
  for (let i = 0; i < cellsPerSheet; i += 1) {
    targetGroup.layoutCells.push({ mode: 'available' });
  }
}

function findNextCellByMode(mode, preferredFrom, group) {
  const targetGroup = group || getActiveGroup();
  for (let index = Math.max(0, preferredFrom); index < targetGroup.layoutCells.length; index += 1) {
    if (targetGroup.layoutCells[index].mode === mode) return index;
  }

  for (let index = 0; index < Math.max(0, preferredFrom); index += 1) {
    if (targetGroup.layoutCells[index].mode === mode) return index;
  }

  return -1;
}

function findLastUseCandidate(lockedIndex, preferredFrom, group) {
  const targetGroup = group || getActiveGroup();
  for (let index = targetGroup.layoutCells.length - 1; index >= preferredFrom; index -= 1) {
    if (targetGroup.layoutCells[index].mode === 'use' && index !== lockedIndex) return index;
  }

  for (let index = targetGroup.layoutCells.length - 1; index >= 0; index -= 1) {
    if (targetGroup.layoutCells[index].mode === 'use' && index !== lockedIndex) return index;
  }

  return -1;
}

function ensureCellExists(index, group) {
  const targetGroup = group || getActiveGroup();
  const cellsPerSheet = getCellsPerSheet(targetGroup);
  if (!cellsPerSheet) return;
  while (targetGroup.layoutCells.length <= index) {
    expandByOneSheet(targetGroup);
  }
}

function trimUnusedTrailingSheets(group) {
  const targetGroup = group || getActiveGroup();
  const cellsPerSheet = getCellsPerSheet(targetGroup);
  if (!cellsPerSheet || !targetGroup.layoutCells.length) return;

  let lastRelevant = -1;
  targetGroup.layoutCells.forEach((cell, index) => {
    if (cell.mode !== 'available') lastRelevant = index;
  });

  const sheetsToKeep = Math.max(1, Math.ceil((lastRelevant + 1) / cellsPerSheet));
  targetGroup.layoutCells = targetGroup.layoutCells.slice(0, sheetsToKeep * cellsPerSheet);
}

function getCellsPerSheet(group) {
  const targetGroup = group || getActiveGroup();
  if (!targetGroup || !targetGroup.currentPreset) return 0;
  return targetGroup.currentPreset.columns * targetGroup.currentPreset.rows;
}

function getUseIndices(group) {
  const targetGroup = group || getActiveGroup();
  if (!targetGroup) return [];
  return targetGroup.layoutCells
    .map((cell, index) => (cell.mode === 'use' ? index : -1))
    .filter((index) => index !== -1);
}

function buildLabelIndexMap(group) {
  const map = new Map();
  getUseIndices(group).forEach((cellIndex, labelIndex) => {
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
  const group = getActiveGroup();
  if (!group || !group.currentPreset) {
    setStatus('preset-status', group ? (group.currentPresetErrors[0] || 'The preset is incomplete.') : 'The preset is incomplete.', 'danger');
    return;
  }

  const sourceId = group.selectedPresetId;
  const isUpdatingUserPreset = sourceId && state.userPresets.some((preset) => preset.id === sourceId);
  const id = isUpdatingUserPreset
    ? sourceId
    : `user-${slugify(group.currentPreset.name || 'preset')}-${Date.now()}`;

  const presetToSave = sanitizePreset({
    ...group.currentPreset,
    id,
  }, 'user', state.userPresets.length);

  if (isUpdatingUserPreset) {
    state.userPresets = state.userPresets.map((preset) => (preset.id === id ? presetToSave : preset));
  } else {
    state.userPresets.push(presetToSave);
  }

  persistUserPresets();
  group.selectedPresetId = id;
  group.draftPreset = clonePresetDraft(presetToSave);
  group.currentPreset = sanitizePreset(presetToSave, 'editor', 0);
  renderPresetOptions();
  document.getElementById('preset-select').value = id;
  setStatus(
    'preset-status',
    `Saved only in this browser. It will stay local until cleared, will not sync to other browsers or machines, and did not change ${CONFIG_PATH}.`,
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

  const removedPresetIds = new Set(state.userPresets.map((preset) => preset.id));

  localStorage.removeItem(STORAGE_KEY);
  state.userPresets = [];

  state.sourceGroups.forEach((group) => {
    if (removedPresetIds.has(group.selectedPresetId)) {
      group.selectedPresetId = '__manual__';
    }
  });

  document.getElementById('copy-fallback').hidden = true;
  renderPresetOptions();
  setStatus(
    'preset-status',
    `Cleared browser-saved presets. Shipped presets in ${CONFIG_PATH} are unchanged.`,
    'success'
  );
  renderAll();
}

async function copyCurrentPresetConfig() {
  const group = getActiveGroup();
  if (!group || !group.currentPreset) {
    setStatus('preset-status', 'Enter a valid preset before copying the config snippet.', 'danger');
    return;
  }

  const snippet = buildPresetPropertySnippet(normalizePreset({
    ...group.currentPreset,
    id: group.selectedPresetId && group.selectedPresetId !== '__manual__'
      ? group.selectedPresetId
      : `custom-${slugify(group.currentPreset.name || 'preset')}`,
  }));

  try {
    await labtoolsCopyText(snippet);
    document.getElementById('copy-fallback').hidden = true;
    setStatus(
      'preset-status',
      `Current settings copied as preset lines. Paste them into the presets array in ${CONFIG_PATH}.`,
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
  if (!state.sourceGroups.length || !state.sourceDocuments.length || !state.sourcePageCount) {
    setStatus('output-status', 'Load source PDFs and complete each size group before generating the output.', 'danger');
    return;
  }

  const incompleteGroups = collectIncompleteGroups();
  if (incompleteGroups.length) {
    setStatus(
      'output-status',
      `Finish ${incompleteGroups.map((group) => `${getGroupLabel(group)} (${formatGroupSize(group)})`).join(', ')} before exporting.`,
      'danger'
    );
    return;
  }

  state.isGenerating = true;
  setStatus('output-status', 'Generating the output PDF…', 'info');
  renderAll();

  try {
    const outputDoc = await PDFLib.PDFDocument.create();
    const embeddedPagesByDocument = [];
    for (const sourceDocument of state.sourceDocuments) {
      const sourceDoc = await PDFLib.PDFDocument.load(sourceDocument.bytes);
      embeddedPagesByDocument.push(await outputDoc.embedPages(sourceDoc.getPages()));
    }

    let totalOutputSheetCount = 0;
    const groupPageSummaries = [];

    state.sourceGroups.forEach((group) => {
      const cellsPerSheet = getCellsPerSheet(group);
      const geometry = buildSheetGeometry(group.currentPreset);
      const useIndices = getUseIndices(group);
      const maxUseIndex = useIndices[useIndices.length - 1];
      const outputSheetCount = Math.floor(maxUseIndex / cellsPerSheet) + 1;
      const pageWidthPts = inchesToPoints(group.currentPreset.pageWidth);
      const pageHeightPts = inchesToPoints(group.currentPreset.pageHeight);
      const outputPages = [];

      totalOutputSheetCount += outputSheetCount;
      groupPageSummaries.push(`${getGroupLabel(group)} ${formatGroupSize(group)}: ${outputSheetCount} page${outputSheetCount === 1 ? '' : 's'}`);

      for (let pageIndex = 0; pageIndex < outputSheetCount; pageIndex += 1) {
        outputPages.push(outputDoc.addPage([pageWidthPts, pageHeightPts]));
      }

      useIndices.forEach((cellIndex, labelIndex) => {
        const sheetIndex = Math.floor(cellIndex / cellsPerSheet);
        const cellRect = geometry.cells[cellIndex % cellsPerSheet];
        const page = outputPages[sheetIndex];
        const sourcePage = group.pages[labelIndex];
        const embedded = embeddedPagesByDocument[sourcePage.sourceDocumentIndex][sourcePage.pageIndex];
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
    });

    outputDoc.setTitle(`${buildSourceDocumentTitle()} · laser layout`);
    outputDoc.setProducer('LabTools');
    outputDoc.setCreator('LabTools thermal-to-laser');

    state.outputBytes = await outputDoc.save();
    state.outputDirty = false;
    updateOutputPreview();
    setStatus(
      'output-status',
      `Generated ${totalOutputSheetCount} output page${totalOutputSheetCount === 1 ? '' : 's'} across ${state.sourceGroups.length} size group${state.sourceGroups.length === 1 ? '' : 's'} (${groupPageSummaries.join('; ')}). Print at 100% scale on the target label sheet.`,
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
  if (canUseSaveFilePicker()) {
    saveOutputPdfWithPicker(blob);
    return;
  }
  labtoolsDownloadBlob('thermal-to-laser-output.pdf', blob);
  setStatus('output-status', 'Output PDF downloaded. Your browser controls the save location in this environment.', 'success');
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

async function saveOutputPdfWithPicker(blob) {
  try {
    const handle = await window.showSaveFilePicker({
      id: 'thermal-to-laser-output-pdf',
      startIn: 'downloads',
      suggestedName: 'thermal-to-laser-output.pdf',
      types: [
        {
          description: 'PDF document',
          accept: {
            'application/pdf': ['.pdf'],
          },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    setStatus('output-status', 'Output PDF saved.', 'success');
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    labtoolsDownloadBlob('thermal-to-laser-output.pdf', blob);
    setStatus('output-status', 'Output PDF downloaded. Your browser controls the save location in this environment.', 'success');
  }
}

function canUseOpenFilePicker() {
  return !!(window.isSecureContext && typeof window.showOpenFilePicker === 'function');
}

function canUseSaveFilePicker() {
  return !!(window.isSecureContext && typeof window.showSaveFilePicker === 'function');
}

function buildLoadedSourceMessage() {
  const pageLabel = `${state.sourcePageCount} label page${state.sourcePageCount === 1 ? '' : 's'}`;
  if (state.sourceGroups.length > 1) {
    return `Loaded ${pageLabel} from ${state.sourceDocuments.length} PDFs across ${state.sourceGroups.length} detected label sizes. Groups will export from taller labels to shorter labels.`;
  }
  if (state.sourceDocuments.length === 1) {
    return `Loaded ${pageLabel} from ${state.sourceDocuments[0].fileName}.`;
  }
  return `Loaded ${pageLabel} from ${state.sourceDocuments.length} PDFs in the selected order.`;
}

function buildSourceDocumentTitle() {
  if (!state.sourceDocuments.length) return 'labels';
  if (state.sourceDocuments.length === 1) return state.sourceDocuments[0].fileName;
  return `${state.sourceDocuments[0].fileName} + ${state.sourceDocuments.length - 1} more`;
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
  const lines = ['{', ...buildPresetPropertyLines(preset)];
  lines.push(`}${trailingComma === false ? '' : ','}`);
  return lines.join('\n');
}

function buildPresetPropertySnippet(preset) {
  return buildPresetPropertyLines(preset).join('\n');
}

function buildPresetPropertyLines(preset) {
  const lines = [];
  PRESET_FIELD_ORDER.forEach((field) => {
    if (preset[field] === '' || preset[field] == null) return;
    const value = typeof preset[field] === 'number'
      ? preset[field]
      : JSON.stringify(String(preset[field]));
    lines.push(`  ${field}: ${value},`);
  });
  return lines;
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
