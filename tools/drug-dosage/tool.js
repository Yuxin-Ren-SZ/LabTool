'use strict';

const STORAGE_KEY = 'labtools:drug-dosage:user-protocols:v1';
const ENTRY_STORAGE_KEY = 'labtools:drug-dosage:operation-entries:v1';
const LAST_SELECTED_PROTOCOL_KEY = 'labtools:drug-dosage:last-selected-protocol:v1';
const CONFIG_PATH = window.DRUG_DOSAGE_PROTOCOL_CONFIG_PATH || 'tools/drug-dosage/protocol-config.js';

const BUILTIN_AMOUNT_UNITS = ['g', 'mg', 'ug', 'ng', 'L', 'mL', 'uL', 'U', 'IU'];
const WEIGHT_UNITS = ['g', 'kg'];

let rowKeyCounter = 0;

const state = {
  builtInProtocols: [],
  userProtocols: [],
  operationEntries: [],
  selectedProtocolId: '__draft__',
  draftProtocol: makeBlankProtocol(),
  operation: makeBlankOperation(),
  currentPanel: 'setup',
  dragSrcIndex: null,
  logSavePromptVisible: false,
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  state.builtInProtocols = sanitizeProtocolList(
    (window.DRUG_DOSAGE_PROTOCOL_CONFIG && window.DRUG_DOSAGE_PROTOCOL_CONFIG.protocols) || [],
    'builtin'
  );
  state.userProtocols = loadUserProtocols();
  state.operationEntries = loadOperationEntries();

  bindEvents();
  restoreSelectedProtocol();
  renderProtocolOptions();
  seedTopLevelFields();
  seedOperationFields();
  renderAll({ rerenderTable: true });
  setDefaultProtocolStatus();
  setDefaultLogStatus();
  showPanel('setup');
}

function bindEvents() {
  document.getElementById('protocol-select').addEventListener('change', onProtocolSelectChanged);
  document.getElementById('protocolName').addEventListener('input', onProtocolMetaInput);
  document.getElementById('iacucProtocolId').addEventListener('input', onProtocolMetaInput);
  document.getElementById('protocolNotes').addEventListener('input', onProtocolMetaInput);

  document.getElementById('new-draft-btn').addEventListener('click', startNewDraft);
  document.getElementById('save-protocol-btn').addEventListener('click', saveCurrentProtocol);
  document.getElementById('clear-saved-btn').addEventListener('click', clearSavedProtocols);
  document.getElementById('copy-current-btn').addEventListener('click', copyCurrentProtocolConfig);
  document.getElementById('export-all-btn').addEventListener('click', exportAllProtocolConfigs);
  document.getElementById('add-drug-btn').addEventListener('click', addDrugRow);
  document.getElementById('btn-to-operation').addEventListener('click', goToOperation);
  document.getElementById('btn-back-to-setup').addEventListener('click', goToSetup);

  document.getElementById('animalId').addEventListener('input', onOperationTextInput);
  document.getElementById('animalWeight').addEventListener('input', onAnimalWeightInput);
  document.getElementById('animalWeightUnit').addEventListener('change', onAnimalWeightUnitChange);
  document.getElementById('operatorName').addEventListener('input', onOperationTextInput);
  document.getElementById('operatorId').addEventListener('input', onOperationTextInput);
  document.getElementById('results-list').addEventListener('input', onResultsListInput);

  document.getElementById('save-entry-btn').addEventListener('click', saveCurrentOperationEntries);
  document.getElementById('copy-entries-btn').addEventListener('click', copyCurrentOperationEntries);
  document.getElementById('export-entries-btn').addEventListener('click', exportCurrentOperationEntries);
  document.getElementById('clear-entries-btn').addEventListener('click', clearCurrentOperationEntries);
  document.getElementById('save-protocol-from-log-btn').addEventListener('click', saveProtocolFromLogPrompt);

  const tbody = document.getElementById('proto-body');
  tbody.addEventListener('input', onProtocolTableInput);
  tbody.addEventListener('change', onProtocolTableChange);
  tbody.addEventListener('click', onProtocolTableClick);
}

function restoreSelectedProtocol() {
  const lastSelectedId = localStorage.getItem(LAST_SELECTED_PROTOCOL_KEY);
  if (!lastSelectedId) {
    state.selectedProtocolId = '__draft__';
    state.draftProtocol = makeBlankProtocol();
    return;
  }

  const protocol = findProtocolById(lastSelectedId);
  if (!protocol) {
    state.selectedProtocolId = '__draft__';
    state.draftProtocol = makeBlankProtocol();
    localStorage.removeItem(LAST_SELECTED_PROTOCOL_KEY);
    return;
  }

  state.selectedProtocolId = protocol.id;
  state.draftProtocol = cloneProtocolDraft(protocol);
}

function allProtocols() {
  return [...state.builtInProtocols, ...state.userProtocols];
}

function findProtocolById(id) {
  return allProtocols().find((protocol) => protocol.id === id) || null;
}

function currentPersistedProtocol() {
  if (!state.selectedProtocolId || state.selectedProtocolId === '__draft__') {
    return null;
  }
  return findProtocolById(state.selectedProtocolId);
}

function buildPersistedProtocolStorageKey(protocol) {
  return `${protocol._origin || 'saved'}:${protocol.id}`;
}

function makeBlankProtocol() {
  return {
    id: '',
    name: '',
    iacucProtocolId: '',
    notes: '',
    drugs: [makeBlankDrug()],
  };
}

function makeBlankDrug() {
  return {
    id: '',
    rowKey: nextRowKey(),
    name: '',
    administrationRoute: '',
    controlledSubstance: false,
    notes: '',
    minDose: '',
    exactDose: '',
    maxDose: '',
    amountUnit: 'mg',
    weightUnit: 'g',
  };
}

function makeBlankOperation() {
  return {
    animalId: '',
    animalWeight: '',
    animalWeightUnit: 'g',
    operatorName: '',
    operatorId: '',
    actualAmounts: {},
  };
}

function nextRowKey() {
  rowKeyCounter += 1;
  return `row-${Date.now()}-${rowKeyCounter}`;
}

function cloneProtocolDraft(protocol) {
  const sanitized = sanitizeProtocol(protocol, 'editor', 0);
  return {
    id: sanitized.id || '',
    name: sanitized.name || '',
    iacucProtocolId: sanitized.iacucProtocolId || '',
    notes: sanitized.notes || '',
    drugs: sanitized.drugs.length
      ? sanitized.drugs.map((drug) => ({
        id: drug.id || '',
        rowKey: nextRowKey(),
        name: drug.name || '',
        administrationRoute: drug.administrationRoute || '',
        controlledSubstance: !!drug.controlledSubstance,
        notes: drug.notes || '',
        minDose: valueOrEmpty(drug.minDose),
        exactDose: valueOrEmpty(drug.exactDose),
        maxDose: valueOrEmpty(drug.maxDose),
        amountUnit: drug.amountUnit || 'mg',
        weightUnit: drug.weightUnit || 'g',
      }))
      : [makeBlankDrug()],
  };
}

function sanitizeProtocolList(protocols, origin) {
  return (Array.isArray(protocols) ? protocols : [])
    .map((protocol, index) => sanitizeProtocol(protocol, origin, index))
    .filter(Boolean);
}

function sanitizeProtocol(protocol, origin, index) {
  if (!protocol || typeof protocol !== 'object') return null;

  return {
    id: protocol.id != null && protocol.id !== '' ? String(protocol.id) : `${origin}-protocol-${index + 1}`,
    name: protocol.name != null ? String(protocol.name).trim() : '',
    iacucProtocolId: protocol.iacucProtocolId != null
      ? String(protocol.iacucProtocolId).trim()
      : (protocol.iacucId != null ? String(protocol.iacucId).trim() : ''),
    notes: protocol.notes != null ? String(protocol.notes).trim() : '',
    drugs: sanitizeDrugList(protocol.drugs, origin),
    _origin: origin,
  };
}

function sanitizeDrugList(drugs, origin) {
  return (Array.isArray(drugs) ? drugs : [])
    .map((drug, index) => sanitizeDrug(drug, origin, index))
    .filter(Boolean);
}

function sanitizeDrug(drug, origin, index) {
  if (!drug || typeof drug !== 'object') return null;

  const amountUnit = drug.amountUnit != null ? String(drug.amountUnit).trim() : '';
  const weightUnit = WEIGHT_UNITS.includes(drug.weightUnit) ? drug.weightUnit : 'g';
  const route = drug.administrationRoute != null
    ? String(drug.administrationRoute).trim()
    : (drug.route != null ? String(drug.route).trim() : '');

  return {
    id: drug.id != null && drug.id !== '' ? String(drug.id) : `${origin}-drug-${index + 1}`,
    name: drug.name != null ? String(drug.name).trim() : '',
    administrationRoute: route,
    controlledSubstance: parseBoolean(drug.controlledSubstance),
    notes: drug.notes != null ? String(drug.notes).trim() : '',
    minDose: sanitizeNumericInput(drug.minDose),
    exactDose: sanitizeNumericInput(drug.exactDose),
    maxDose: sanitizeNumericInput(drug.maxDose),
    amountUnit: amountUnit || 'mg',
    weightUnit,
  };
}

function loadUserProtocols() {
  const raw = labtoolsSafeJsonParse(localStorage.getItem(STORAGE_KEY), []);
  return sanitizeProtocolList(raw, 'user');
}

function loadOperationEntries() {
  const raw = labtoolsSafeJsonParse(localStorage.getItem(ENTRY_STORAGE_KEY), []);
  return (Array.isArray(raw) ? raw : [])
    .map(sanitizeOperationEntry)
    .filter(Boolean);
}

function sanitizeOperationEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;

  return {
    id: entry.id != null && entry.id !== '' ? String(entry.id) : `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: entry.timestamp != null ? String(entry.timestamp) : new Date().toISOString(),
    protocolStorageKey: entry.protocolStorageKey != null ? String(entry.protocolStorageKey) : '',
    protocolOrigin: entry.protocolOrigin != null ? String(entry.protocolOrigin) : '',
    protocolId: entry.protocolId != null ? String(entry.protocolId) : '',
    protocolName: entry.protocolName != null ? String(entry.protocolName).trim() : '',
    iacucProtocolId: entry.iacucProtocolId != null ? String(entry.iacucProtocolId).trim() : '',
    animalId: entry.animalId != null ? String(entry.animalId).trim() : '',
    animalWeight: sanitizeNumericInput(entry.animalWeight),
    animalWeightUnit: WEIGHT_UNITS.includes(entry.animalWeightUnit) ? entry.animalWeightUnit : 'g',
    animalWeightGrams: sanitizeNumericInput(entry.animalWeightGrams),
    operatorName: entry.operatorName != null ? String(entry.operatorName).trim() : '',
    operatorId: entry.operatorId != null ? String(entry.operatorId).trim() : '',
    drugId: entry.drugId != null ? String(entry.drugId) : '',
    drugName: entry.drugName != null ? String(entry.drugName).trim() : '',
    administrationRoute: entry.administrationRoute != null ? String(entry.administrationRoute).trim() : '',
    controlledSubstance: parseBoolean(entry.controlledSubstance),
    plannedMinAmount: sanitizeNumericInput(entry.plannedMinAmount),
    plannedExactAmount: sanitizeNumericInput(entry.plannedExactAmount),
    plannedMaxAmount: sanitizeNumericInput(entry.plannedMaxAmount),
    actualAmountGiven: sanitizeNumericInput(entry.actualAmountGiven),
    amountUnit: entry.amountUnit != null ? String(entry.amountUnit).trim() : '',
    doseWeightUnit: WEIGHT_UNITS.includes(entry.doseWeightUnit) ? entry.doseWeightUnit : 'g',
    protocolNotes: entry.protocolNotes != null ? String(entry.protocolNotes).trim() : '',
    drugNotes: entry.drugNotes != null ? String(entry.drugNotes).trim() : '',
  };
}

function persistUserProtocols() {
  const normalized = state.userProtocols.map((protocol) => normalizeProtocol(protocol));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized, null, 2));
}

function persistOperationEntries() {
  if (!state.operationEntries.length) {
    localStorage.removeItem(ENTRY_STORAGE_KEY);
    return;
  }
  localStorage.setItem(ENTRY_STORAGE_KEY, JSON.stringify(state.operationEntries, null, 2));
}

function persistSelectedProtocol() {
  if (state.selectedProtocolId && state.selectedProtocolId !== '__draft__') {
    localStorage.setItem(LAST_SELECTED_PROTOCOL_KEY, state.selectedProtocolId);
    return;
  }
  localStorage.removeItem(LAST_SELECTED_PROTOCOL_KEY);
}

function setDefaultProtocolStatus() {
  setStatus(
    'protocol-status',
    `Built-in protocols ship from ${CONFIG_PATH}. Browser-saved protocols stay local until you clear or export them.`,
    'info'
  );
}

function setDefaultLogStatus() {
  setStatus(
    'log-status',
    'Saved entries stay only in your current browser until you clear or export them.',
    'info'
  );
}

function seedTopLevelFields() {
  document.getElementById('protocolName').value = state.draftProtocol.name || '';
  document.getElementById('iacucProtocolId').value = state.draftProtocol.iacucProtocolId || '';
  document.getElementById('protocolNotes').value = state.draftProtocol.notes || '';
}

function seedOperationFields() {
  document.getElementById('animalId').value = state.operation.animalId || '';
  document.getElementById('animalWeight').value = valueOrEmpty(state.operation.animalWeight);
  document.getElementById('animalWeightUnit').value = state.operation.animalWeightUnit;
  document.getElementById('operatorName').value = state.operation.operatorName || '';
  document.getElementById('operatorId').value = state.operation.operatorId || '';
}

function renderAll(options) {
  const config = options || {};
  pruneOperationActualAmounts();
  renderDraftSummary();
  if (config.rerenderTable) {
    renderDrugTable();
  }
  renderSetupStatus();
  applyValidationClasses();
  renderOperationProtocolSummary();
  renderOperationSummary();
  renderOperationStatus();
  renderResults();
  renderSavedEntries();
  updateActionButtons();
}

function updateActionButtons() {
  document.getElementById('btn-to-operation').disabled = false;
  document.getElementById('save-entry-btn').disabled = false;
  document.getElementById('copy-entries-btn').disabled = false;
  document.getElementById('export-entries-btn').disabled = false;
  document.getElementById('clear-entries-btn').disabled = false;
  renderLogSavePrompt();
}

function renderProtocolOptions() {
  const select = document.getElementById('protocol-select');
  const note = document.getElementById('protocol-select-note');
  const persistedProtocols = allProtocols();

  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = persistedProtocols.length
    ? 'Load a shipped or browser-saved protocol'
    : 'No shipped or browser-saved protocols available';
  select.appendChild(placeholder);

  if (state.builtInProtocols.length) {
    const builtInGroup = document.createElement('optgroup');
    builtInGroup.label = 'Built-in protocols';
    state.builtInProtocols.forEach((protocol) => {
      builtInGroup.appendChild(makeProtocolOption(protocol));
    });
    select.appendChild(builtInGroup);
  }

  if (state.userProtocols.length) {
    const userGroup = document.createElement('optgroup');
    userGroup.label = 'Saved in this browser';
    state.userProtocols.forEach((protocol) => {
      userGroup.appendChild(makeProtocolOption(protocol));
    });
    select.appendChild(userGroup);
  }

  const selectedProtocol = currentPersistedProtocol();
  select.disabled = !persistedProtocols.length;
  select.value = selectedProtocol ? selectedProtocol.id : '';

  if (!persistedProtocols.length) {
    note.textContent = 'No loadable protocols are available yet. Build a draft below, then save it in this browser when you want it to appear here.';
    return;
  }

  if (selectedProtocol) {
    note.textContent = `Loaded now: ${selectedProtocol.name || 'Untitled protocol'} (${describeProtocolSource(selectedProtocol)}). Unsaved drafts are edited directly in the fields below.`;
    return;
  }

  note.textContent = 'Unsaved drafts stay in the editor only. Use this menu to load a shipped or browser-saved protocol.';
}

function renderLogSavePrompt() {
  const wrap = document.getElementById('log-save-required');
  const note = document.getElementById('log-save-required-note');
  const shouldShow = state.logSavePromptVisible && !currentPersistedProtocol();
  wrap.hidden = !shouldShow;
  if (!shouldShow) return;
  note.textContent = 'Save this protocol in the current browser before logging, copying, or exporting entries. Your current animal and actual-amount inputs will be kept.';
}

function showLogSavePrompt(message) {
  state.logSavePromptVisible = true;
  renderLogSavePrompt();
  setStatus('log-status', message, 'warn');
  document.getElementById('save-protocol-from-log-btn').focus();
}

function hideLogSavePrompt() {
  state.logSavePromptVisible = false;
  renderLogSavePrompt();
}

function makeProtocolOption(protocol) {
  const option = document.createElement('option');
  option.value = protocol.id;
  option.textContent = `${protocol.name || 'Untitled protocol'} · ${protocol.drugs.length} drug${protocol.drugs.length === 1 ? '' : 's'}`;
  return option;
}

function renderDraftSummary() {
  const container = document.getElementById('draft-summary');
  const evaluation = evaluateProtocolDraft();
  const selectedProtocol = findProtocolById(state.selectedProtocolId);
  const sourceLabel = selectedProtocol ? describeProtocolSource(selectedProtocol) : 'Unsaved draft';

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Protocol</div>
      <div class="summary-value">${escapeHtml(state.draftProtocol.name || 'Untitled draft')}</div>
      <div class="summary-note">${escapeHtml(sourceLabel)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">IACUC ID</div>
      <div class="summary-value">${escapeHtml(state.draftProtocol.iacucProtocolId || 'Not set')}</div>
      <div class="summary-note">${escapeHtml(state.draftProtocol.notes || 'No additional notes recorded for this protocol.')}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Active Drugs</div>
      <div class="summary-value">${evaluation.activeRows.length}</div>
      <div class="summary-note">${evaluation.activeRows.length ? 'Only non-blank rows are used in validation and page 2 calculations.' : 'Blank rows are ignored until you fill them in.'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Save State</div>
      <div class="summary-value">${evaluation.canUseProtocol ? 'Ready' : 'Needs review'}</div>
      <div class="summary-note">${escapeHtml(evaluation.canUseProtocol ? 'This protocol can be saved and used on page 2.' : (evaluation.setupIssues[0] || 'Protocol name and at least one valid drug row are required.'))}</div>
    </div>
  `;
}

function renderDrugTable() {
  const tbody = document.getElementById('proto-body');
  tbody.innerHTML = '';

  state.draftProtocol.drugs.forEach((drug, index) => {
    const amountUnitSelectValue = BUILTIN_AMOUNT_UNITS.includes(drug.amountUnit) ? drug.amountUnit : '__custom__';
    const customAmountUnit = amountUnitSelectValue === '__custom__' ? (drug.amountUnit || '') : '';

    const tr = document.createElement('tr');
    tr.className = 'proto-row';
    tr.dataset.index = index;
    tr.dataset.rowKey = drug.rowKey;
    tr.draggable = true;
    tr.innerHTML = `
      <td class="col-drag"><span class="drag-handle" title="Drag to reorder">⠿</span></td>
      <td class="col-num">${index + 1}</td>
      <td>
        <input class="lt-input name-input" type="text" data-field="name" placeholder="Drug name" value="${escapeAttribute(drug.name)}"/>
      </td>
      <td>
        <input class="lt-input route-input" type="text" data-field="administrationRoute" placeholder="e.g. IP, SC, PO" value="${escapeAttribute(drug.administrationRoute)}"/>
      </td>
      <td class="checkbox-cell">
        <label class="checkbox-wrap">
          <input type="checkbox" data-field="controlledSubstance"${drug.controlledSubstance ? ' checked' : ''}/>
          <span class="checkbox-label">${drug.controlledSubstance ? 'Yes' : 'No'}</span>
        </label>
      </td>
      <td>
        <input class="lt-input dose-input" type="number" inputmode="decimal" min="0" step="any" data-field="minDose" placeholder="optional" value="${valueOrEmpty(drug.minDose)}"/>
      </td>
      <td>
        <input class="lt-input dose-input" type="number" inputmode="decimal" min="0" step="any" data-field="exactDose" placeholder="optional" value="${valueOrEmpty(drug.exactDose)}"/>
      </td>
      <td>
        <input class="lt-input dose-input" type="number" inputmode="decimal" min="0" step="any" data-field="maxDose" placeholder="optional" value="${valueOrEmpty(drug.maxDose)}"/>
      </td>
      <td class="unit-cell">
        <div class="unit-stack">
          <div class="unit-inline">
            <select class="lt-select" data-field="amountUnitSelect">
              ${buildAmountUnitOptions(amountUnitSelectValue)}
            </select>
            <span class="unit-divider">/</span>
            <select class="lt-select" data-field="weightUnit">
              ${WEIGHT_UNITS.map((unit) => `<option value="${unit}"${drug.weightUnit === unit ? ' selected' : ''}>${unit}</option>`).join('')}
            </select>
          </div>
          <input class="lt-input custom-unit-input" type="text" data-field="amountUnitCustom" placeholder="Custom amount unit" value="${escapeAttribute(customAmountUnit)}"${amountUnitSelectValue === '__custom__' ? '' : ' hidden'}/>
        </div>
      </td>
      <td>
        <input class="lt-input notes-input" type="text" data-field="notes" placeholder="Optional notes" value="${escapeAttribute(drug.notes)}"/>
      </td>
      <td>
        <div class="acts-cell">
          <button class="act-btn" type="button" data-action="move-up" title="Move up"${index === 0 ? ' disabled' : ''}>↑</button>
          <button class="act-btn" type="button" data-action="move-down" title="Move down"${index === state.draftProtocol.drugs.length - 1 ? ' disabled' : ''}>↓</button>
          <button class="act-btn del" type="button" data-action="delete" title="Delete">🗑</button>
        </div>
      </td>
    `;

    tr.addEventListener('dragstart', onDragStart);
    tr.addEventListener('dragover', onDragOver);
    tr.addEventListener('dragleave', onDragLeave);
    tr.addEventListener('drop', onDrop);
    tr.addEventListener('dragend', onDragEnd);
    tbody.appendChild(tr);
  });
}

function buildAmountUnitOptions(selectedValue) {
  const builtInOptions = BUILTIN_AMOUNT_UNITS.map((unit) =>
    `<option value="${unit}"${selectedValue === unit ? ' selected' : ''}>${unit}</option>`
  ).join('');

  return `${builtInOptions}<option value="__custom__"${selectedValue === '__custom__' ? ' selected' : ''}>Custom</option>`;
}

function renderSetupStatus() {
  const evaluation = evaluateProtocolDraft();

  if (!evaluation.activeRows.length) {
    setStatus('setup-status', 'Add at least one valid drug row before continuing.', 'info');
    return;
  }

  if (evaluation.protocolNameError) {
    setStatus('setup-status', 'Protocol name is required before continuing to page 2.', 'danger');
    return;
  }

  if (evaluation.rowIssues.length) {
    setStatus('setup-status', evaluation.rowIssues[0], 'danger');
    return;
  }

  setStatus(
    'setup-status',
    `Ready to calculate ${evaluation.activeRows.length} drug${evaluation.activeRows.length === 1 ? '' : 's'} on page 2.`,
    'success'
  );
}

function renderOperationProtocolSummary() {
  const container = document.getElementById('operation-protocol-summary');
  const evaluation = evaluateProtocolDraft();
  const selectedProtocol = currentPersistedProtocol();
  const sourceLabel = selectedProtocol ? describeProtocolSource(selectedProtocol) : 'Unsaved draft';
  const scopeNote = selectedProtocol
    ? 'Saved entries, plain-text copy, and CSV export are scoped to this protocol.'
    : 'Calculations work for drafts, but save the protocol in this browser before logging, copying, or exporting entries.';

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Protocol</div>
      <div class="summary-value">${escapeHtml(state.draftProtocol.name || 'Untitled draft')}</div>
      <div class="summary-note">${escapeHtml(state.draftProtocol.notes || 'No additional protocol notes.')}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">IACUC ID</div>
      <div class="summary-value">${escapeHtml(state.draftProtocol.iacucProtocolId || 'Not set')}</div>
      <div class="summary-note">${escapeHtml(sourceLabel)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Drugs</div>
      <div class="summary-value">${evaluation.activeRows.length}</div>
      <div class="summary-note">${evaluation.activeRows.length ? 'One saved entry can be logged for each drug with an actual amount.' : 'Return to page 1 and add at least one drug row.'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Current Scope</div>
      <div class="summary-value">${escapeHtml(currentProtocolLabel())}</div>
      <div class="summary-note">${escapeHtml(scopeNote)}</div>
    </div>
  `;
}

function renderOperationSummary() {
  const container = document.getElementById('operation-summary');
  const animalWeight = toNumber(state.operation.animalWeight);
  const weightInGrams = animalWeight > 0 ? convertBodyWeight(animalWeight, state.operation.animalWeightUnit, 'g') : NaN;
  const weightInKilograms = animalWeight > 0 ? convertBodyWeight(animalWeight, state.operation.animalWeightUnit, 'kg') : NaN;
  const entryCount = currentProtocolEntries().length;
  const persistedProtocol = currentPersistedProtocol();

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Animal ID</div>
      <div class="summary-value">${escapeHtml(state.operation.animalId || 'Waiting')}</div>
      <div class="summary-note">${state.operation.animalId ? 'Animal ID will be saved with each logged drug entry.' : 'Animal ID is required before saving entries.'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Entered Weight</div>
      <div class="summary-value">${animalWeight > 0 ? `${formatDoseAmount(animalWeight)} ${state.operation.animalWeightUnit}` : 'Waiting'}</div>
      <div class="summary-note">${animalWeight > 0 ? `${formatDoseAmount(weightInGrams)} g · ${formatDoseAmount(weightInKilograms)} kg` : 'Enter a positive weight to unlock live dose calculations.'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Operator</div>
      <div class="summary-value">${escapeHtml(formatOperatorDisplay(state.operation.operatorName, state.operation.operatorId) || 'Not set')}</div>
      <div class="summary-note">Operator name and ID are optional but saved when provided.</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Saved Entries</div>
      <div class="summary-value">${entryCount}</div>
      <div class="summary-note">${persistedProtocol
        ? (entryCount ? 'Entries shown below are stored locally for this protocol only.' : 'No saved entries yet for the current protocol.')
        : 'Save this draft in the current browser to unlock the per-protocol entry log.'}</div>
    </div>
  `;
}

function renderOperationStatus() {
  const evaluation = evaluateOperation();

  if (!evaluation.protocolEvaluation.canUseProtocol) {
    setStatus(
      'operation-status',
      evaluation.protocolEvaluation.setupIssues[0] || 'Review the protocol on page 1 before calculating doses.',
      'danger'
    );
    return;
  }

  if (!(evaluation.animalWeight > 0)) {
    setStatus('operation-status', 'Enter a positive animal weight in grams or kilograms to calculate doses.', 'info');
    return;
  }

  if (!currentPersistedProtocol()) {
    setStatus(
      'operation-status',
      `Calculations are live for ${evaluation.resultRows.length} drug${evaluation.resultRows.length === 1 ? '' : 's'}, but save this protocol in the current browser before logging, copying, or exporting entries.`,
      'warn'
    );
    return;
  }

  setStatus(
    'operation-status',
    `Ready to calculate ${evaluation.resultRows.length} drug${evaluation.resultRows.length === 1 ? '' : 's'} for ${formatDoseAmount(evaluation.animalWeight)} ${state.operation.animalWeightUnit}. Animal ID and at least one actual amount are required before saving.`,
    'success'
  );
}

function renderResults() {
  const summary = document.getElementById('results-summary');
  const list = document.getElementById('results-list');
  const evaluation = evaluateOperation();

  if (!evaluation.protocolEvaluation.activeRows.length) {
    summary.innerHTML = `
      <div class="summary-card">
        <div class="summary-label">Results</div>
        <div class="summary-value">Waiting</div>
        <div class="summary-note">Return to page 1 and add one or more drugs to the protocol.</div>
      </div>
    `;
    list.innerHTML = '';
    return;
  }

  if (!evaluation.protocolEvaluation.canUseProtocol) {
    summary.innerHTML = `
      <div class="summary-card">
        <div class="summary-label">Results</div>
        <div class="summary-value">Blocked</div>
        <div class="summary-note">${escapeHtml(evaluation.protocolEvaluation.setupIssues[0] || 'Review the protocol on page 1 before calculating doses.')}</div>
      </div>
    `;
    list.innerHTML = '';
    return;
  }

  if (!(evaluation.animalWeight > 0)) {
    summary.innerHTML = `
      <div class="summary-card">
        <div class="summary-label">Results</div>
        <div class="summary-value">Waiting</div>
        <div class="summary-note">Enter a positive animal weight to calculate output amounts.</div>
      </div>
    `;
    list.innerHTML = '';
    return;
  }

  summary.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Protocol</div>
      <div class="summary-value">${escapeHtml(state.draftProtocol.name || 'Untitled draft')}</div>
      <div class="summary-note">${evaluation.resultRows.length} drug${evaluation.resultRows.length === 1 ? '' : 's'} included in the live output.</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Animal Weight</div>
      <div class="summary-value">${formatDoseAmount(evaluation.animalWeight)} ${state.operation.animalWeightUnit}</div>
      <div class="summary-note">${formatDoseAmount(evaluation.weightInGrams)} g · ${formatDoseAmount(evaluation.weightInKilograms)} kg</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Output</div>
      <div class="summary-value">Ready</div>
      <div class="summary-note">Each calculated amount and actual amount field uses the drug row’s numerator unit.</div>
    </div>
  `;

  list.innerHTML = evaluation.resultRows
    .map((row) => buildResultCard(row, evaluation.actualAmountErrors[row.rowKey]))
    .join('');
}

function buildResultCard(row, hasActualError) {
  const resultBlocks = [];

  if (row.minAmount !== '') {
    resultBlocks.push(buildDoseBlock('Min', row.minAmount, row.drug.amountUnit, row.drug.minDose, row.drug.weightUnit));
  }
  if (row.exactAmount !== '') {
    resultBlocks.push(buildDoseBlock('Exact', row.exactAmount, row.drug.amountUnit, row.drug.exactDose, row.drug.weightUnit));
  }
  if (row.maxAmount !== '') {
    resultBlocks.push(buildDoseBlock('Max', row.maxAmount, row.drug.amountUnit, row.drug.maxDose, row.drug.weightUnit));
  }

  return `
    <article class="result-card">
      <div class="result-card-top">
        <div class="result-title">${escapeHtml(row.drug.name)}</div>
        <div class="result-meta">
          <span class="lt-badge lt-badge-blue">${escapeHtml(row.drug.amountUnit)}/${row.drug.weightUnit}</span>
          ${row.drug.administrationRoute ? `<span class="lt-badge lt-badge-default">${escapeHtml(row.drug.administrationRoute)}</span>` : ''}
          ${row.drug.controlledSubstance ? '<span class="lt-badge lt-badge-red">Controlled</span>' : ''}
        </div>
      </div>
      <div class="result-source-line">
        Protocol basis: ${buildProtocolDoseSummary(row.drug)}
      </div>
      <div class="dose-grid">
        ${resultBlocks.join('')}
      </div>
      <div class="actual-row">
        <label class="actual-label" for="actual-${escapeAttribute(row.rowKey)}">Actual Amount Given</label>
        <div class="actual-input-wrap">
          <input
            class="lt-input${hasActualError ? ' error' : ''}"
            id="actual-${escapeAttribute(row.rowKey)}"
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            placeholder="Optional until saved"
            data-row-key="${escapeAttribute(row.rowKey)}"
            value="${valueOrEmpty(state.operation.actualAmounts[row.rowKey])}"
          />
          <span class="actual-unit">${escapeHtml(row.drug.amountUnit)}</span>
        </div>
      </div>
      ${row.drug.notes ? `<div class="result-note">${escapeHtml(row.drug.notes)}</div>` : ''}
    </article>
  `;
}

function buildDoseBlock(label, outputValue, amountUnit, doseValue, weightUnit) {
  return `
    <div class="dose-chip">
      <div class="dose-chip-label">${label}</div>
      <div class="dose-chip-value">${formatDoseAmount(outputValue)} ${escapeHtml(amountUnit)}</div>
      <div class="dose-chip-sub">${formatDoseAmount(doseValue)} ${escapeHtml(amountUnit)}/${weightUnit}</div>
    </div>
  `;
}

function renderSavedEntries() {
  const persistedProtocol = currentPersistedProtocol();
  const entries = currentProtocolEntries();
  const summary = document.getElementById('entries-summary');
  const tableShell = document.getElementById('entries-table-shell');
  const emptyState = document.getElementById('entries-empty');
  const tbody = document.getElementById('entries-body');

  if (!persistedProtocol) {
    summary.innerHTML = `
      <div class="summary-card">
        <div class="summary-label">Entries</div>
        <div class="summary-value">Locked</div>
        <div class="summary-note">Save this draft in the current browser before logging or exporting saved entries.</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Scope</div>
        <div class="summary-value">${escapeHtml(currentProtocolLabel())}</div>
        <div class="summary-note">Drafts do not get a stable entry log until they are saved.</div>
      </div>
    `;
    tbody.innerHTML = '';
    tableShell.hidden = true;
    emptyState.textContent = 'Save this protocol in the current browser to unlock the per-protocol entry log.';
    emptyState.hidden = false;
    return;
  }

  if (!entries.length) {
    summary.innerHTML = `
      <div class="summary-card">
        <div class="summary-label">Entries</div>
        <div class="summary-value">0</div>
        <div class="summary-note">Save one or more drug administrations on this page to build the local log.</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Latest Save</div>
        <div class="summary-value">Waiting</div>
        <div class="summary-note">Plain-text copy and CSV export are enabled after the first saved entry.</div>
      </div>
    `;
    tbody.innerHTML = '';
    tableShell.hidden = true;
    emptyState.textContent = 'No saved entries for this protocol yet.';
    emptyState.hidden = false;
    return;
  }

  const latest = entries[0];

  summary.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Entries</div>
      <div class="summary-value">${entries.length}</div>
      <div class="summary-note">One saved line is stored for each drug row with an actual amount.</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Latest Save</div>
      <div class="summary-value">${escapeHtml(formatTimestamp(latest.timestamp))}</div>
      <div class="summary-note">${escapeHtml(latest.animalId || 'No animal ID')} · ${escapeHtml(latest.drugName || 'Unnamed drug')}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Scope</div>
      <div class="summary-value">${escapeHtml(currentProtocolLabel())}</div>
      <div class="summary-note">Only entries for the current protocol appear here.</div>
    </div>
  `;

  tbody.innerHTML = entries.map((entry) => buildEntryTableRow(entry)).join('');
  tableShell.hidden = false;
  emptyState.hidden = true;
}

function buildEntryTableRow(entry) {
  return `
    <tr>
      <td>${escapeHtml(formatTimestamp(entry.timestamp))}</td>
      <td>${escapeHtml(entry.animalId || '—')}</td>
      <td class="entry-weight">${escapeHtml(formatEntryWeight(entry))}</td>
      <td>${escapeHtml(entry.drugName || '—')}</td>
      <td class="entry-planned">${escapeHtml(formatPlannedAmount(entry))}</td>
      <td>${escapeHtml(formatDoseAmount(entry.actualAmountGiven))} ${escapeHtml(entry.amountUnit)}</td>
      <td>${escapeHtml(entry.administrationRoute || '—')}</td>
      <td class="entry-operator">${escapeHtml(formatOperatorDisplay(entry.operatorName, entry.operatorId) || '—')}</td>
      <td>${entry.controlledSubstance ? 'Yes' : 'No'}</td>
    </tr>
  `;
}

function evaluateProtocolDraft() {
  const rowStates = state.draftProtocol.drugs.map((drug) => evaluateDrugRow(drug));
  const activeRows = [];
  const rowIssues = [];

  rowStates.forEach((rowState, index) => {
    if (rowState.blank) return;
    activeRows.push({ rowIndex: index, drug: state.draftProtocol.drugs[index] });
    rowIssues.push(...rowState.issues);
  });

  const protocolNameError = !state.draftProtocol.name.trim();
  const setupIssues = [];

  if (protocolNameError) {
    setupIssues.push('Protocol name is required before continuing.');
  }
  if (!activeRows.length) {
    setupIssues.push('Add at least one valid drug row before continuing.');
  }
  setupIssues.push(...rowIssues);

  return {
    rowStates,
    activeRows,
    rowIssues,
    protocolNameError,
    setupIssues,
    canUseProtocol: setupIssues.length === 0,
  };
}

function evaluateDrugRow(drug) {
  const errors = {
    name: false,
    minDose: false,
    exactDose: false,
    maxDose: false,
    amountUnit: false,
    weightUnit: false,
  };
  const issues = [];
  const blank = isDrugBlank(drug);

  if (blank) {
    return { blank: true, errors, issues };
  }

  const hasMin = drug.minDose !== '';
  const hasExact = drug.exactDose !== '';
  const hasMax = drug.maxDose !== '';
  const hasAnyDose = hasMin || hasExact || hasMax;

  if (!drug.name.trim()) {
    errors.name = true;
    issues.push('Each non-blank drug row needs a drug name.');
  }

  if (!hasAnyDose) {
    errors.minDose = true;
    errors.exactDose = true;
    errors.maxDose = true;
    issues.push(`"${drug.name || 'Unnamed drug'}" needs at least one of Min, Exact, or Max dose.`);
  }

  ['minDose', 'exactDose', 'maxDose'].forEach((field) => {
    const value = drug[field];
    if (value === '') return;
    if (value < 0) {
      errors[field] = true;
      issues.push(`"${drug.name || 'Unnamed drug'}" has a negative ${field.replace('Dose', '')} dose.`);
    }
  });

  if (hasMin && hasExact && drug.minDose > drug.exactDose) {
    errors.minDose = true;
    errors.exactDose = true;
    issues.push(`"${drug.name || 'Unnamed drug'}" must satisfy min <= exact.`);
  }
  if (hasExact && hasMax && drug.exactDose > drug.maxDose) {
    errors.exactDose = true;
    errors.maxDose = true;
    issues.push(`"${drug.name || 'Unnamed drug'}" must satisfy exact <= max.`);
  }
  if (hasMin && hasMax && drug.minDose > drug.maxDose) {
    errors.minDose = true;
    errors.maxDose = true;
    issues.push(`"${drug.name || 'Unnamed drug'}" must satisfy min <= max.`);
  }

  if (!String(drug.amountUnit || '').trim()) {
    errors.amountUnit = true;
    issues.push(`"${drug.name || 'Unnamed drug'}" needs an amount unit.`);
  }

  if (!WEIGHT_UNITS.includes(drug.weightUnit)) {
    errors.weightUnit = true;
    issues.push(`"${drug.name || 'Unnamed drug'}" needs a valid body-weight unit.`);
  }

  return {
    blank: false,
    errors,
    issues,
  };
}

function evaluateOperation() {
  const protocolEvaluation = evaluateProtocolDraft();
  const animalWeight = toNumber(state.operation.animalWeight);
  const animalWeightUnit = WEIGHT_UNITS.includes(state.operation.animalWeightUnit) ? state.operation.animalWeightUnit : 'g';
  const canCalculate = protocolEvaluation.canUseProtocol && animalWeight > 0;
  const weightInGrams = animalWeight > 0 ? convertBodyWeight(animalWeight, animalWeightUnit, 'g') : NaN;
  const weightInKilograms = animalWeight > 0 ? convertBodyWeight(animalWeight, animalWeightUnit, 'kg') : NaN;
  const resultRows = canCalculate
    ? protocolEvaluation.activeRows.map(({ rowIndex, drug }) => buildCalculatedRow(drug, rowIndex, animalWeight, animalWeightUnit))
    : [];

  const saveIssues = [];
  const actualAmountErrors = {};
  const entryDrafts = [];
  const protocolSnapshot = normalizeProtocol(state.draftProtocol);
  const sourceProtocol = currentPersistedProtocol();
  const protocolStorageKey = sourceProtocol ? buildPersistedProtocolStorageKey(sourceProtocol) : '';

  if (!protocolEvaluation.canUseProtocol) {
    saveIssues.push(protocolEvaluation.setupIssues[0] || 'Review the protocol on page 1 before saving an entry.');
  }
  if (!(animalWeight > 0)) {
    saveIssues.push('Enter a positive animal weight before saving an entry.');
  }
  if (!String(state.operation.animalId || '').trim()) {
    saveIssues.push('Animal ID is required before saving an entry.');
  }

  resultRows.forEach((row) => {
    const actualValue = state.operation.actualAmounts[row.rowKey];
    if (actualValue === '') return;

    if (!Number.isFinite(actualValue) || actualValue < 0) {
      actualAmountErrors[row.rowKey] = true;
      saveIssues.push(`"${row.drug.name || 'Unnamed drug'}" actual amount must be 0 or greater.`);
      return;
    }

    entryDrafts.push({
      protocolStorageKey,
      protocolOrigin: sourceProtocol ? sourceProtocol._origin : '',
      protocolId: sourceProtocol ? sourceProtocol.id : '',
      protocolName: protocolSnapshot.name,
      iacucProtocolId: protocolSnapshot.iacucProtocolId || '',
      animalId: String(state.operation.animalId || '').trim(),
      animalWeight,
      animalWeightUnit,
      animalWeightGrams: weightInGrams,
      operatorName: String(state.operation.operatorName || '').trim(),
      operatorId: String(state.operation.operatorId || '').trim(),
      drugId: row.drug.id || '',
      drugName: row.drug.name,
      administrationRoute: row.drug.administrationRoute || '',
      controlledSubstance: !!row.drug.controlledSubstance,
      plannedMinAmount: row.minAmount,
      plannedExactAmount: row.exactAmount,
      plannedMaxAmount: row.maxAmount,
      actualAmountGiven: actualValue,
      amountUnit: row.drug.amountUnit,
      doseWeightUnit: row.drug.weightUnit,
      protocolNotes: protocolSnapshot.notes || '',
      drugNotes: row.drug.notes || '',
    });
  });

  if (!entryDrafts.length) {
    saveIssues.push('Enter at least one actual amount given before saving an entry.');
  }

  return {
    protocolEvaluation,
    animalWeight,
    animalWeightUnit,
    weightInGrams,
    weightInKilograms,
    canCalculate,
    resultRows,
    saveIssues,
    canSaveEntries: saveIssues.length === 0,
    actualAmountErrors,
    entryDrafts,
  };
}

function buildCalculatedRow(drug, rowIndex, animalWeight, animalWeightUnit) {
  return {
    rowIndex,
    rowKey: drug.rowKey,
    drug,
    minAmount: drug.minDose !== '' ? calcDoseFromBodyWeight(drug.minDose, drug.weightUnit, animalWeight, animalWeightUnit) : '',
    exactAmount: drug.exactDose !== '' ? calcDoseFromBodyWeight(drug.exactDose, drug.weightUnit, animalWeight, animalWeightUnit) : '',
    maxAmount: drug.maxDose !== '' ? calcDoseFromBodyWeight(drug.maxDose, drug.weightUnit, animalWeight, animalWeightUnit) : '',
  };
}

function applyValidationClasses() {
  const evaluation = evaluateProtocolDraft();
  const topNameInput = document.getElementById('protocolName');
  topNameInput.classList.toggle('error', evaluation.protocolNameError && evaluation.activeRows.length > 0);

  document.querySelectorAll('#proto-body .proto-row').forEach((row) => {
    const index = parseInt(row.dataset.index, 10);
    const stateForRow = evaluation.rowStates[index];
    if (!stateForRow) return;

    toggleFieldError(row, 'name', stateForRow.errors.name);
    toggleFieldError(row, 'minDose', stateForRow.errors.minDose);
    toggleFieldError(row, 'exactDose', stateForRow.errors.exactDose);
    toggleFieldError(row, 'maxDose', stateForRow.errors.maxDose);
    toggleFieldError(row, 'weightUnit', stateForRow.errors.weightUnit);
    toggleFieldError(row, 'amountUnitSelect', stateForRow.errors.amountUnit);
    toggleFieldError(row, 'amountUnitCustom', stateForRow.errors.amountUnit);
  });
}

function toggleFieldError(row, fieldName, enabled) {
  const field = row.querySelector(`[data-field="${fieldName}"]`);
  if (!field) return;
  field.classList.toggle('error', !!enabled);
}

function focusFirstProtocolIssue(evaluation) {
  if (evaluation.protocolNameError) {
    document.getElementById('protocolName').focus();
    return;
  }

  if (!evaluation.activeRows.length) {
    document.getElementById('add-drug-btn').focus();
    return;
  }

  const fieldOrder = ['name', 'minDose', 'exactDose', 'maxDose', 'amountUnitSelect', 'amountUnitCustom', 'weightUnit'];
  for (let index = 0; index < evaluation.rowStates.length; index += 1) {
    const rowState = evaluation.rowStates[index];
    if (!rowState || rowState.blank) continue;

    for (let offset = 0; offset < fieldOrder.length; offset += 1) {
      const fieldName = fieldOrder[offset];
      const errorKey = fieldName === 'amountUnitSelect' || fieldName === 'amountUnitCustom'
        ? 'amountUnit'
        : fieldName;
      if (!rowState.errors[errorKey]) continue;

      const row = document.querySelector(`#proto-body .proto-row[data-index="${index}"]`);
      const field = row && row.querySelector(`[data-field="${fieldName}"]`);
      if (field) {
        field.focus();
        return;
      }
    }
  }
}

function focusFirstOperationIssue(evaluation) {
  if (!evaluation.protocolEvaluation.canUseProtocol) {
    showPanel('setup', true);
    focusFirstProtocolIssue(evaluation.protocolEvaluation);
    return;
  }

  if (!(evaluation.animalWeight > 0)) {
    document.getElementById('animalWeight').focus();
    return;
  }

  if (!String(state.operation.animalId || '').trim()) {
    document.getElementById('animalId').focus();
    return;
  }

  for (let index = 0; index < evaluation.resultRows.length; index += 1) {
    const row = evaluation.resultRows[index];
    if (evaluation.actualAmountErrors[row.rowKey]) {
      const input = document.querySelector(`#results-list [data-row-key="${row.rowKey}"]`);
      if (input) {
        input.focus();
        return;
      }
    }
  }

  if (!evaluation.entryDrafts.length) {
    const firstInput = document.querySelector('#results-list [data-row-key]');
    if (firstInput) {
      firstInput.focus();
    }
  }
}

function isDrugBlank(drug) {
  return !String(drug.name || '').trim()
    && !String(drug.administrationRoute || '').trim()
    && !drug.controlledSubstance
    && !String(drug.notes || '').trim()
    && drug.minDose === ''
    && drug.exactDose === ''
    && drug.maxDose === '';
}

function goToOperation() {
  const evaluation = evaluateProtocolDraft();
  renderAll();

  if (!evaluation.canUseProtocol) {
    setStatus('setup-status', evaluation.setupIssues[0] || 'Review the protocol before continuing.', 'danger');
    focusFirstProtocolIssue(evaluation);
    return;
  }

  showPanel('operation');
}

function goToSetup() {
  showPanel('setup', true);
}

function showPanel(name, back) {
  state.currentPanel = name;
  document.querySelectorAll('.step-panel').forEach((panel) => {
    panel.classList.remove('active', 'slide-back');
  });

  const target = document.getElementById(`panel-${name}`);
  if (back) {
    target.classList.add('slide-back');
  }
  target.classList.add('active');

  const setupPip = document.getElementById('pip-setup');
  const operationPip = document.getElementById('pip-operation');
  const connector = document.getElementById('conn-setup-operation');

  if (name === 'setup') {
    setupPip.classList.add('active');
    setupPip.classList.remove('done');
    operationPip.classList.remove('active', 'done');
    connector.classList.remove('done');
    return;
  }

  setupPip.classList.remove('active');
  setupPip.classList.add('done');
  operationPip.classList.add('active');
  connector.classList.add('done');
}

function onProtocolMetaInput(event) {
  if (event.target.id === 'protocolName') {
    state.draftProtocol.name = event.target.value;
  } else if (event.target.id === 'iacucProtocolId') {
    state.draftProtocol.iacucProtocolId = event.target.value;
  } else if (event.target.id === 'protocolNotes') {
    state.draftProtocol.notes = event.target.value;
  }

  markBuiltInEditAsDraft();
  renderAll();
}

function onProtocolSelectChanged(event) {
  const selectedId = event.target.value;
  if (!selectedId) {
    renderProtocolOptions();
    return;
  }

  const protocol = findProtocolById(selectedId);
  if (!protocol) return;

  state.selectedProtocolId = protocol.id;
  state.draftProtocol = cloneProtocolDraft(protocol);
  resetOperationState();
  hideLogSavePrompt();
  persistSelectedProtocol();
  renderProtocolOptions();
  seedTopLevelFields();
  seedOperationFields();
  renderAll({ rerenderTable: true });
  showPanel('setup', true);
  setStatus('protocol-status', `Loaded protocol: ${protocol.name}.`, 'success');
}

function onProtocolTableInput(event) {
  const row = event.target.closest('.proto-row');
  if (!row) return;

  const index = parseInt(row.dataset.index, 10);
  const drug = state.draftProtocol.drugs[index];
  const field = event.target.dataset.field;
  if (!drug || !field) return;

  if (field === 'name' || field === 'administrationRoute' || field === 'notes') {
    drug[field] = event.target.value;
  } else if (field === 'minDose' || field === 'exactDose' || field === 'maxDose') {
    drug[field] = event.target.value === '' ? '' : parseFloat(event.target.value);
  } else if (field === 'amountUnitCustom') {
    drug.amountUnit = event.target.value.trim();
  }

  markBuiltInEditAsDraft();
  renderAll();
}

function onProtocolTableChange(event) {
  const row = event.target.closest('.proto-row');
  if (!row) return;

  const index = parseInt(row.dataset.index, 10);
  const drug = state.draftProtocol.drugs[index];
  const field = event.target.dataset.field;
  if (!drug || !field) return;

  if (field === 'amountUnitSelect') {
    if (event.target.value === '__custom__') {
      if (BUILTIN_AMOUNT_UNITS.includes(drug.amountUnit)) {
        drug.amountUnit = '';
      }
    } else {
      drug.amountUnit = event.target.value;
    }
    markBuiltInEditAsDraft();
    renderAll({ rerenderTable: true });
    return;
  }

  if (field === 'weightUnit') {
    drug.weightUnit = event.target.value;
    markBuiltInEditAsDraft();
    renderAll();
    return;
  }

  if (field === 'controlledSubstance') {
    drug.controlledSubstance = !!event.target.checked;
    markBuiltInEditAsDraft();
    renderAll({ rerenderTable: true });
  }
}

function onProtocolTableClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const row = event.target.closest('.proto-row');
  if (!row) return;

  const index = parseInt(row.dataset.index, 10);
  const action = button.dataset.action;

  if (action === 'move-up') {
    moveDrugRow(index, -1);
  } else if (action === 'move-down') {
    moveDrugRow(index, 1);
  } else if (action === 'delete') {
    deleteDrugRow(index);
  }
}

function onOperationTextInput(event) {
  if (event.target.id === 'animalId') {
    state.operation.animalId = event.target.value;
  } else if (event.target.id === 'operatorName') {
    state.operation.operatorName = event.target.value;
  } else if (event.target.id === 'operatorId') {
    state.operation.operatorId = event.target.value;
  }

  renderOperationSummary();
  updateActionButtons();
}

function onAnimalWeightInput(event) {
  state.operation.animalWeight = event.target.value === '' ? '' : parseFloat(event.target.value);
  renderOperationSummary();
  renderOperationStatus();
  renderResults();
  updateActionButtons();
}

function onAnimalWeightUnitChange(event) {
  state.operation.animalWeightUnit = event.target.value;
  renderOperationSummary();
  renderOperationStatus();
  renderResults();
  updateActionButtons();
}

function onResultsListInput(event) {
  const rowKey = event.target.dataset.rowKey;
  if (!rowKey) return;

  state.operation.actualAmounts[rowKey] = event.target.value === '' ? '' : parseFloat(event.target.value);
  const evaluation = evaluateOperation();
  event.target.classList.toggle('error', !!evaluation.actualAmountErrors[rowKey]);
  updateActionButtons();
}

function addDrugRow() {
  state.draftProtocol.drugs.push(makeBlankDrug());
  markBuiltInEditAsDraft();
  renderAll({ rerenderTable: true });
}

function deleteDrugRow(index) {
  const removed = state.draftProtocol.drugs[index];
  if (removed) {
    delete state.operation.actualAmounts[removed.rowKey];
  }

  if (state.draftProtocol.drugs.length === 1) {
    state.draftProtocol.drugs = [makeBlankDrug()];
  } else {
    state.draftProtocol.drugs.splice(index, 1);
  }

  markBuiltInEditAsDraft();
  renderAll({ rerenderTable: true });
}

function moveDrugRow(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= state.draftProtocol.drugs.length) return;
  [state.draftProtocol.drugs[index], state.draftProtocol.drugs[targetIndex]] =
    [state.draftProtocol.drugs[targetIndex], state.draftProtocol.drugs[index]];
  markBuiltInEditAsDraft();
  renderAll({ rerenderTable: true });
}

function startNewDraft() {
  if (hasDraftContent() && !window.confirm('Start a new blank protocol? Your current unsaved draft will be cleared.')) {
    return;
  }

  state.selectedProtocolId = '__draft__';
  state.draftProtocol = makeBlankProtocol();
  resetOperationState();
  hideLogSavePrompt();
  persistSelectedProtocol();
  renderProtocolOptions();
  seedTopLevelFields();
  seedOperationFields();
  renderAll({ rerenderTable: true });
  showPanel('setup', true);
  setStatus('protocol-status', 'Started a new blank draft. Save it in this browser when ready.', 'info');
}

async function saveCurrentProtocol(options) {
  const config = {
    preserveOperation: false,
    stayOnOperation: false,
    statusElementId: 'protocol-status',
    revealSetupOnError: false,
    ...(options || {}),
  };
  const evaluation = evaluateProtocolDraft();
  if (!evaluation.canUseProtocol) {
    setStatus(config.statusElementId, evaluation.setupIssues[0], 'danger');
    setStatus('protocol-status', evaluation.setupIssues[0], 'danger');
    renderAll();
    if (config.revealSetupOnError) {
      showPanel('setup', true);
    }
    focusFirstProtocolIssue(evaluation);
    return;
  }

  const legacySnapshot = normalizeProtocol(state.draftProtocol);
  const operationSnapshot = config.preserveOperation ? snapshotOperationState() : null;
  const sourceProtocol = findProtocolById(state.selectedProtocolId);
  const isUpdatingUserProtocol = !!(sourceProtocol && sourceProtocol._origin === 'user');
  const id = isUpdatingUserProtocol
    ? sourceProtocol.id
    : `user-${slugify(state.draftProtocol.name || 'protocol')}-${Date.now()}`;

  const protocolToSave = sanitizeProtocol({
    ...normalizeProtocol(state.draftProtocol),
    id,
  }, 'user', state.userProtocols.length);

  if (isUpdatingUserProtocol) {
    state.userProtocols = state.userProtocols.map((protocol) => (
      protocol.id === id ? protocolToSave : protocol
    ));
  } else {
    state.userProtocols.push(protocolToSave);
  }

  persistUserProtocols();
  state.selectedProtocolId = id;
  state.draftProtocol = cloneProtocolDraft(protocolToSave);
  if (config.preserveOperation) {
    restoreOperationState(operationSnapshot);
  } else {
    resetOperationState();
  }
  const migratedCount = migrateLegacyDraftEntries(legacySnapshot, protocolToSave);
  if (migratedCount) {
    persistOperationEntries();
  }
  hideLogSavePrompt();
  persistSelectedProtocol();
  renderProtocolOptions();
  seedTopLevelFields();
  seedOperationFields();
  renderAll({ rerenderTable: true });
  if (config.stayOnOperation) {
    showPanel('operation');
    setStatus(
      'log-status',
      migratedCount
        ? `Saved only in this browser and migrated ${migratedCount} legacy entr${migratedCount === 1 ? 'y' : 'ies'} to this protocol. Re-run save, copy, or export now.`
        : 'Saved only in this browser. Re-run save, copy, or export now that the protocol has a stable log scope.',
      'success'
    );
    setStatus(
      'protocol-status',
      `Saved only in this browser. It will stay local until cleared, and it did not change ${CONFIG_PATH}.`,
      'success'
    );
    return;
  }

  showPanel('setup', true);
  setStatus(
    'protocol-status',
    `Saved only in this browser. It will stay local until cleared, and it did not change ${CONFIG_PATH}.`,
    'success'
  );
}

function clearSavedProtocols() {
  if (!state.userProtocols.length) {
    setStatus('protocol-status', `No browser-saved protocols were found. Shipped entries in ${CONFIG_PATH} are unchanged.`, 'info');
    return;
  }

  if (!window.confirm('Clear all browser-saved protocols? This does not affect the checked-in config file.')) {
    return;
  }

  const removedIds = new Set(state.userProtocols.map((protocol) => protocol.id));
  state.userProtocols = [];
  state.operationEntries = state.operationEntries.filter((entry) => (
    !(entry.protocolOrigin === 'user' && removedIds.has(entry.protocolId))
  ));

  if (removedIds.has(state.selectedProtocolId)) {
    state.selectedProtocolId = '__draft__';
    resetOperationState();
    hideLogSavePrompt();
  }

  localStorage.removeItem(STORAGE_KEY);
  persistOperationEntries();
  persistSelectedProtocol();
  renderProtocolOptions();
  seedTopLevelFields();
  seedOperationFields();
  renderAll({ rerenderTable: true });
  setStatus('protocol-status', `Cleared browser-saved protocols. Shipped entries in ${CONFIG_PATH} are unchanged.`, 'success');
}

async function copyCurrentProtocolConfig() {
  const evaluation = evaluateProtocolDraft();
  if (!evaluation.canUseProtocol) {
    setStatus('protocol-status', evaluation.setupIssues[0], 'danger');
    return;
  }

  const normalized = normalizeProtocol({
    ...state.draftProtocol,
    id: state.selectedProtocolId && state.selectedProtocolId !== '__draft__'
      ? state.selectedProtocolId
      : `custom-${slugify(state.draftProtocol.name || 'protocol')}`,
  });
  const snippet = buildSingleProtocolSnippet(normalized, false);

  try {
    await labtoolsCopyText(snippet);
    setStatus('protocol-status', `Current protocol copied as a config snippet for ${CONFIG_PATH}.`, 'success');
  } catch (error) {
    setStatus('protocol-status', 'The browser blocked clipboard access. Try again in a secure context or use Export All Protocols instead.', 'warn');
  }
}

function exportAllProtocolConfigs() {
  const protocols = [...state.builtInProtocols, ...state.userProtocols].map((protocol) => normalizeProtocol(protocol));
  const content = buildProtocolConfigFileContent(protocols);
  labtoolsDownloadText('drug-dosage-protocols.js', content, 'application/javascript;charset=utf-8');
  setStatus('protocol-status', `Exported all protocols as a replacement config file. You can merge it back into ${CONFIG_PATH}.`, 'success');
}

function normalizeProtocol(protocol) {
  const normalized = {
    id: protocol.id || `custom-${slugify(protocol.name || 'protocol')}`,
    name: String(protocol.name || '').trim(),
    drugs: stripBlankDrugs(protocol.drugs).map((drug, index) => normalizeDrug(drug, index)),
  };

  const iacucProtocolId = String(protocol.iacucProtocolId || '').trim();
  if (iacucProtocolId) {
    normalized.iacucProtocolId = iacucProtocolId;
  }

  const notes = String(protocol.notes || '').trim();
  if (notes) {
    normalized.notes = notes;
  }

  return normalized;
}

function normalizeDrug(drug, index) {
  const normalized = {
    id: drug.id || `drug-${slugify(drug.name || `row-${index + 1}`)}`,
    name: String(drug.name || '').trim(),
    amountUnit: String(drug.amountUnit || '').trim(),
    weightUnit: WEIGHT_UNITS.includes(drug.weightUnit) ? drug.weightUnit : 'g',
    controlledSubstance: !!drug.controlledSubstance,
  };

  if (drug.minDose !== '') normalized.minDose = drug.minDose;
  if (drug.exactDose !== '') normalized.exactDose = drug.exactDose;
  if (drug.maxDose !== '') normalized.maxDose = drug.maxDose;

  const administrationRoute = String(drug.administrationRoute || '').trim();
  if (administrationRoute) {
    normalized.administrationRoute = administrationRoute;
  }

  const notes = String(drug.notes || '').trim();
  if (notes) {
    normalized.notes = notes;
  }

  return normalized;
}

function stripBlankDrugs(drugs) {
  return (Array.isArray(drugs) ? drugs : []).filter((drug) => !isDrugBlank(drug));
}

function buildProtocolConfigFileContent(protocols) {
  const lines = [
    '\'use strict\';',
    '',
    `window.DRUG_DOSAGE_PROTOCOL_CONFIG_PATH = ${JSON.stringify(CONFIG_PATH)};`,
    '',
    'window.DRUG_DOSAGE_PROTOCOL_CONFIG = {',
    '  version: 1,',
    '  protocols: [',
  ];

  protocols.forEach((protocol, index) => {
    lines.push(indentBlock(buildSingleProtocolSnippet(protocol, index !== protocols.length - 1), 4));
  });

  lines.push('  ],');
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

function buildSingleProtocolSnippet(protocol, trailingComma) {
  const lines = ['{'];
  lines.push(`  id: ${JSON.stringify(protocol.id)},`);
  lines.push(`  name: ${JSON.stringify(protocol.name)},`);
  if (protocol.iacucProtocolId) {
    lines.push(`  iacucProtocolId: ${JSON.stringify(protocol.iacucProtocolId)},`);
  }
  if (protocol.notes) {
    lines.push(`  notes: ${JSON.stringify(protocol.notes)},`);
  }
  lines.push('  drugs: [');
  protocol.drugs.forEach((drug, index) => {
    lines.push(indentBlock(buildSingleDrugSnippet(drug, index !== protocol.drugs.length - 1), 4));
  });
  lines.push('  ],');
  lines.push(`}${trailingComma === false ? '' : ','}`);
  return lines.join('\n');
}

function buildSingleDrugSnippet(drug, trailingComma) {
  const lines = ['{'];
  lines.push(`  id: ${JSON.stringify(drug.id)},`);
  lines.push(`  name: ${JSON.stringify(drug.name)},`);
  if (drug.administrationRoute) {
    lines.push(`  administrationRoute: ${JSON.stringify(drug.administrationRoute)},`);
  }
  lines.push(`  controlledSubstance: ${drug.controlledSubstance ? 'true' : 'false'},`);
  if (drug.notes) {
    lines.push(`  notes: ${JSON.stringify(drug.notes)},`);
  }
  if (drug.minDose != null) {
    lines.push(`  minDose: ${drug.minDose},`);
  }
  if (drug.exactDose != null) {
    lines.push(`  exactDose: ${drug.exactDose},`);
  }
  if (drug.maxDose != null) {
    lines.push(`  maxDose: ${drug.maxDose},`);
  }
  lines.push(`  amountUnit: ${JSON.stringify(drug.amountUnit)},`);
  lines.push(`  weightUnit: ${JSON.stringify(drug.weightUnit)},`);
  lines.push(`}${trailingComma === false ? '' : ','}`);
  return lines.join('\n');
}

async function saveCurrentOperationEntries() {
  if (!currentPersistedProtocol()) {
    const protocolEvaluation = evaluateProtocolDraft();
    if (!protocolEvaluation.canUseProtocol) {
      setStatus('log-status', protocolEvaluation.setupIssues[0], 'danger');
      setStatus('protocol-status', protocolEvaluation.setupIssues[0], 'danger');
      showPanel('setup', true);
      focusFirstProtocolIssue(protocolEvaluation);
      return;
    }

    showLogSavePrompt('Save this protocol in the current browser before logging entries.');
    return;
  }

  const evaluation = evaluateOperation();
  if (!evaluation.canSaveEntries) {
    renderResults();
    updateActionButtons();
    setStatus('log-status', evaluation.saveIssues[0], 'danger');
    focusFirstOperationIssue(evaluation);
    return;
  }

  const timestamp = new Date().toISOString();
  const newEntries = evaluation.entryDrafts.map((entry, index) => sanitizeOperationEntry({
    ...entry,
    id: `entry-${Date.now()}-${index + 1}`,
    timestamp,
  }));

  state.operationEntries = [...newEntries, ...state.operationEntries];
  persistOperationEntries();
  resetOperationAfterSave();
  seedOperationFields();
  renderAll();
  setStatus(
    'log-status',
    `Saved ${newEntries.length} entr${newEntries.length === 1 ? 'y' : 'ies'} for ${state.draftProtocol.name || 'the current protocol'}.`,
    'success'
  );
}

async function saveProtocolFromLogPrompt() {
  await saveCurrentProtocol({
    preserveOperation: true,
    stayOnOperation: true,
    statusElementId: 'log-status',
    revealSetupOnError: true,
  });
}

async function copyCurrentOperationEntries() {
  if (!currentPersistedProtocol()) {
    showLogSavePrompt('Save this protocol in the current browser before copying saved entries.');
    return;
  }

  const entries = currentProtocolEntries();
  if (!entries.length) {
    setStatus('log-status', 'No saved entries are available to copy for the current protocol.', 'info');
    return;
  }

  const text = entries.map(buildEntryPlainText).join('\n');

  try {
    await labtoolsCopyText(text);
    setStatus('log-status', `Copied ${entries.length} saved entr${entries.length === 1 ? 'y' : 'ies'} as plain text.`, 'success');
  } catch (error) {
    setStatus('log-status', 'The browser blocked clipboard access. Use Export CSV instead.', 'warn');
  }
}

function exportCurrentOperationEntries() {
  if (!currentPersistedProtocol()) {
    showLogSavePrompt('Save this protocol in the current browser before exporting saved entries.');
    return;
  }

  const entries = currentProtocolEntries();
  if (!entries.length) {
    setStatus('log-status', 'No saved entries are available to export for the current protocol.', 'info');
    return;
  }

  const rows = [
    [
      'timestamp',
      'protocol_name',
      'iacuc_protocol_id',
      'animal_id',
      'animal_weight_entered',
      'animal_weight_unit',
      'animal_weight_g',
      'operator_name',
      'operator_id',
      'drug_name',
      'administration_route',
      'controlled_substance',
      'planned_min_amount',
      'planned_exact_amount',
      'planned_max_amount',
      'actual_amount_given',
      'amount_unit',
      'dose_weight_unit',
      'protocol_notes',
      'drug_notes',
    ],
    ...entries.map((entry) => ([
      entry.timestamp,
      entry.protocolName,
      entry.iacucProtocolId,
      entry.animalId,
      entry.animalWeight,
      entry.animalWeightUnit,
      entry.animalWeightGrams,
      entry.operatorName,
      entry.operatorId,
      entry.drugName,
      entry.administrationRoute,
      entry.controlledSubstance ? 'Yes' : 'No',
      entry.plannedMinAmount,
      entry.plannedExactAmount,
      entry.plannedMaxAmount,
      entry.actualAmountGiven,
      entry.amountUnit,
      entry.doseWeightUnit,
      entry.protocolNotes,
      entry.drugNotes,
    ])),
  ];

  const csv = makeCsv(rows);
  const filename = `drug-dosage-log-${slugify(state.draftProtocol.name || 'protocol')}.csv`;
  labtoolsDownloadText(filename, csv, 'text/csv;charset=utf-8');
  setStatus('log-status', `Exported ${entries.length} saved entr${entries.length === 1 ? 'y' : 'ies'} as CSV.`, 'success');
}

function clearCurrentOperationEntries() {
  if (!currentPersistedProtocol()) {
    setStatus('log-status', 'No saved entries are available for this unsaved draft. Save the protocol first if you want a persistent log.', 'info');
    return;
  }

  const entries = currentProtocolEntries();
  if (!entries.length) {
    setStatus('log-status', 'No saved entries are available to clear for the current protocol.', 'info');
    return;
  }

  if (!window.confirm(`Clear ${entries.length} saved entr${entries.length === 1 ? 'y' : 'ies'} for the current protocol?`)) {
    return;
  }

  const currentKey = currentProtocolStorageKey();
  state.operationEntries = state.operationEntries.filter((entry) => entry.protocolStorageKey !== currentKey);
  persistOperationEntries();
  renderAll();
  setStatus('log-status', `Cleared saved entries for ${currentProtocolLabel()}.`, 'success');
}

function currentProtocolEntries() {
  const key = currentProtocolStorageKey();
  if (!key) return [];
  return state.operationEntries
    .filter((entry) => entry.protocolStorageKey === key)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

function currentProtocolStorageKey(snapshot) {
  const selectedProtocol = snapshot && snapshot._origin
    ? snapshot
    : currentPersistedProtocol();
  return selectedProtocol ? buildPersistedProtocolStorageKey(selectedProtocol) : '';
}

function currentProtocolLabel() {
  const sourceProtocol = currentPersistedProtocol();
  const origin = sourceProtocol ? describeProtocolSource(sourceProtocol) : 'Unsaved draft';
  const name = state.draftProtocol.name || 'Untitled draft';
  return `${name} · ${origin}`;
}

function legacyDraftStorageKey(snapshot) {
  const normalized = snapshot || normalizeProtocol(state.draftProtocol);
  return `draft:${makeStorageHash(JSON.stringify(normalized))}`;
}

function resetOperationState() {
  state.operation = makeBlankOperation();
  hideLogSavePrompt();
}

function resetOperationAfterSave() {
  state.operation.animalId = '';
  state.operation.animalWeight = '';
  state.operation.animalWeightUnit = 'g';
  state.operation.actualAmounts = {};
}

function snapshotOperationState() {
  return {
    animalId: state.operation.animalId,
    animalWeight: state.operation.animalWeight,
    animalWeightUnit: state.operation.animalWeightUnit,
    operatorName: state.operation.operatorName,
    operatorId: state.operation.operatorId,
    actualAmountsByIndex: state.draftProtocol.drugs.map((drug) => {
      const value = state.operation.actualAmounts[drug.rowKey];
      return value === undefined ? '' : value;
    }),
  };
}

function restoreOperationState(snapshot) {
  if (!snapshot) {
    resetOperationState();
    return;
  }

  state.operation = {
    animalId: snapshot.animalId || '',
    animalWeight: snapshot.animalWeight === '' ? '' : sanitizeNumericInput(snapshot.animalWeight),
    animalWeightUnit: WEIGHT_UNITS.includes(snapshot.animalWeightUnit) ? snapshot.animalWeightUnit : 'g',
    operatorName: snapshot.operatorName || '',
    operatorId: snapshot.operatorId || '',
    actualAmounts: {},
  };

  state.draftProtocol.drugs.forEach((drug, index) => {
    const value = snapshot.actualAmountsByIndex[index];
    if (value !== '' && value != null) {
      state.operation.actualAmounts[drug.rowKey] = sanitizeNumericInput(value);
      return;
    }
    if (value === '') {
      state.operation.actualAmounts[drug.rowKey] = '';
    }
  });
}

function migrateLegacyDraftEntries(legacySnapshot, savedProtocol) {
  const oldKey = legacyDraftStorageKey(legacySnapshot);
  const newKey = buildPersistedProtocolStorageKey(savedProtocol);
  let migratedCount = 0;

  state.operationEntries = state.operationEntries.map((entry) => {
    if (entry.protocolStorageKey !== oldKey) {
      return entry;
    }

    migratedCount += 1;
    return sanitizeOperationEntry({
      ...entry,
      protocolStorageKey: newKey,
      protocolOrigin: savedProtocol._origin || 'user',
      protocolId: savedProtocol.id,
      protocolName: savedProtocol.name,
      iacucProtocolId: savedProtocol.iacucProtocolId || '',
      protocolNotes: savedProtocol.notes || '',
    });
  });

  return migratedCount;
}

function pruneOperationActualAmounts() {
  const validRowKeys = new Set(state.draftProtocol.drugs.map((drug) => drug.rowKey));
  Object.keys(state.operation.actualAmounts).forEach((rowKey) => {
    if (!validRowKeys.has(rowKey)) {
      delete state.operation.actualAmounts[rowKey];
    }
  });
}

function hasDraftContent() {
  return !!state.draftProtocol.name.trim()
    || !!state.draftProtocol.iacucProtocolId.trim()
    || !!state.draftProtocol.notes.trim()
    || state.draftProtocol.drugs.some((drug) => !isDrugBlank(drug));
}

function selectedProtocolIsBuiltIn() {
  const selected = findProtocolById(state.selectedProtocolId);
  return !!(selected && selected._origin === 'builtin');
}

function markBuiltInEditAsDraft() {
  if (!selectedProtocolIsBuiltIn()) return false;
  state.selectedProtocolId = '__draft__';
  persistSelectedProtocol();
  renderProtocolOptions();
  setStatus('protocol-status', 'Editing a shipped protocol created a new draft. Save it in this browser to keep your version.', 'info');
  return true;
}

function describeProtocolSource(protocol) {
  if (!protocol) return 'Unsaved draft';
  if (protocol._origin === 'user') return 'Saved in this browser';
  if (protocol._origin === 'builtin') return 'Shipped in protocol-config.js';
  return 'Unsaved draft';
}

function buildProtocolDoseSummary(drug) {
  const parts = [];
  if (drug.minDose !== '') parts.push(`min ${formatDoseAmount(drug.minDose)}`);
  if (drug.exactDose !== '') parts.push(`exact ${formatDoseAmount(drug.exactDose)}`);
  if (drug.maxDose !== '') parts.push(`max ${formatDoseAmount(drug.maxDose)}`);
  return `${parts.join(' · ')} ${escapeHtml(drug.amountUnit)}/${drug.weightUnit}`;
}

function buildEntryPlainText(entry) {
  const operator = formatOperatorDisplay(entry.operatorName, entry.operatorId) || 'not recorded';
  return [
    formatTimestamp(entry.timestamp),
    `Protocol ${entry.protocolName || 'Untitled protocol'}`,
    entry.iacucProtocolId ? `IACUC ${entry.iacucProtocolId}` : null,
    `Animal ${entry.animalId || '—'}`,
    `Weight ${formatEntryWeight(entry)}`,
    `Drug ${entry.drugName || '—'}`,
    `Planned ${formatPlannedAmount(entry)}`,
    `Actual ${formatDoseAmount(entry.actualAmountGiven)} ${entry.amountUnit}`,
    `Route ${entry.administrationRoute || '—'}`,
    `Operator ${operator}`,
    `Controlled ${entry.controlledSubstance ? 'Yes' : 'No'}`,
  ].filter(Boolean).join(' | ');
}

function formatEntryWeight(entry) {
  if (!(entry.animalWeight > 0)) return '—';
  return `${formatDoseAmount(entry.animalWeight)} ${entry.animalWeightUnit}`;
}

function formatPlannedAmount(entry) {
  if (entry.plannedExactAmount !== '') {
    return `${formatDoseAmount(entry.plannedExactAmount)} ${entry.amountUnit}`;
  }
  if (entry.plannedMinAmount !== '' && entry.plannedMaxAmount !== '') {
    return `${formatDoseAmount(entry.plannedMinAmount)}-${formatDoseAmount(entry.plannedMaxAmount)} ${entry.amountUnit}`;
  }
  if (entry.plannedMinAmount !== '') {
    return `min ${formatDoseAmount(entry.plannedMinAmount)} ${entry.amountUnit}`;
  }
  if (entry.plannedMaxAmount !== '') {
    return `max ${formatDoseAmount(entry.plannedMaxAmount)} ${entry.amountUnit}`;
  }
  return '—';
}

function formatOperatorDisplay(name, id) {
  const cleanName = String(name || '').trim();
  const cleanId = String(id || '').trim();
  if (cleanName && cleanId) return `${cleanName} (${cleanId})`;
  if (cleanName) return cleanName;
  if (cleanId) return cleanId;
  return '';
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function makeCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function makeStorageHash(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 31) + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function onDragStart(event) {
  state.dragSrcIndex = parseInt(event.currentTarget.dataset.index, 10);
  event.currentTarget.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
}

function onDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('drag-over');
}

function onDragLeave(event) {
  event.currentTarget.classList.remove('drag-over');
}

function onDrop(event) {
  event.preventDefault();
  const destinationIndex = parseInt(event.currentTarget.dataset.index, 10);
  event.currentTarget.classList.remove('drag-over');

  if (state.dragSrcIndex == null || state.dragSrcIndex === destinationIndex) {
    return;
  }

  const [moved] = state.draftProtocol.drugs.splice(state.dragSrcIndex, 1);
  state.draftProtocol.drugs.splice(destinationIndex, 0, moved);
  state.dragSrcIndex = null;
  renderAll({ rerenderTable: true });
}

function onDragEnd(event) {
  event.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.proto-row').forEach((row) => row.classList.remove('drag-over'));
  state.dragSrcIndex = null;
}

function setStatus(elementId, message, variant) {
  const element = document.getElementById(elementId);
  element.className = `lt-alert lt-alert-${variant}`;
  element.textContent = message;
}

function indentBlock(text, spaces) {
  const prefix = ' '.repeat(spaces);
  return text.split('\n').map((line) => `${prefix}${line}`).join('\n');
}

function parseBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function sanitizeNumericInput(value) {
  if (value === '' || value == null) return '';
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : '';
}

function toNumber(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function valueOrEmpty(value) {
  return Number.isFinite(value) ? value : '';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'protocol';
}

function formatDoseAmount(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';

  const abs = Math.abs(value);
  if (abs < 0.001) return value.toExponential(3);
  if (abs < 0.01) return trimFixed(value, 5);
  if (abs < 0.1) return trimFixed(value, 4);
  if (abs < 10) return trimFixed(value, 3);
  if (abs < 1000) return trimFixed(value, 2);
  return trimFixed(value, 1);
}

function trimFixed(value, digits) {
  return Number(value).toFixed(digits).replace(/\.?0+$/, '');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
