'use strict';

const STORAGE_KEY = 'labtools:drug-dosage:user-protocols:v1';
const LAST_SELECTED_PROTOCOL_KEY = 'labtools:drug-dosage:last-selected-protocol:v1';
const CONFIG_PATH = window.DRUG_DOSAGE_PROTOCOL_CONFIG_PATH || 'tools/drug-dosage/protocol-config.js';

const BUILTIN_AMOUNT_UNITS = ['g', 'mg', 'ug', 'ng', 'L', 'mL', 'uL', 'U', 'IU'];
const WEIGHT_UNITS = ['g', 'kg'];

const state = {
  builtInProtocols: [],
  userProtocols: [],
  selectedProtocolId: '__draft__',
  draftProtocol: makeBlankProtocol(),
  animalWeight: '',
  animalWeightUnit: 'g',
  dragSrcIndex: null,
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  state.builtInProtocols = sanitizeProtocolList(
    (window.DRUG_DOSAGE_PROTOCOL_CONFIG && window.DRUG_DOSAGE_PROTOCOL_CONFIG.protocols) || [],
    'builtin'
  );
  state.userProtocols = loadUserProtocols();

  bindEvents();
  restoreSelectedProtocol();
  seedTopLevelFields();
  renderAll({ rerenderTable: true });
  setDefaultProtocolStatus();
}

function bindEvents() {
  document.getElementById('animalWeight').addEventListener('input', onAnimalWeightInput);
  document.getElementById('animalWeightUnit').addEventListener('change', onAnimalWeightUnitChange);
  document.getElementById('protocol-select').addEventListener('change', onProtocolSelectChanged);
  document.getElementById('protocolName').addEventListener('input', onProtocolMetaInput);
  document.getElementById('protocolNotes').addEventListener('input', onProtocolMetaInput);

  document.getElementById('new-draft-btn').addEventListener('click', startNewDraft);
  document.getElementById('save-protocol-btn').addEventListener('click', saveCurrentProtocol);
  document.getElementById('clear-saved-btn').addEventListener('click', clearSavedProtocols);
  document.getElementById('copy-current-btn').addEventListener('click', copyCurrentProtocolConfig);
  document.getElementById('export-all-btn').addEventListener('click', exportAllProtocolConfigs);
  document.getElementById('add-drug-btn').addEventListener('click', addDrugRow);

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

function makeBlankProtocol() {
  return {
    id: '',
    name: '',
    notes: '',
    drugs: [makeBlankDrug()],
  };
}

function makeBlankDrug() {
  return {
    id: '',
    name: '',
    notes: '',
    minDose: '',
    exactDose: '',
    maxDose: '',
    amountUnit: 'mg',
    weightUnit: 'kg',
  };
}

function cloneProtocolDraft(protocol) {
  const sanitized = sanitizeProtocol(protocol, 'editor', 0);
  return {
    id: sanitized.id || '',
    name: sanitized.name || '',
    notes: sanitized.notes || '',
    drugs: sanitized.drugs.length
      ? sanitized.drugs.map((drug) => ({
        id: drug.id || '',
        name: drug.name || '',
        notes: drug.notes || '',
        minDose: valueOrEmpty(drug.minDose),
        exactDose: valueOrEmpty(drug.exactDose),
        maxDose: valueOrEmpty(drug.maxDose),
        amountUnit: drug.amountUnit || 'mg',
        weightUnit: drug.weightUnit || 'kg',
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

  const sanitized = {
    id: protocol.id != null && protocol.id !== '' ? String(protocol.id) : `${origin}-protocol-${index + 1}`,
    name: protocol.name != null ? String(protocol.name).trim() : '',
    notes: protocol.notes != null ? String(protocol.notes).trim() : '',
    drugs: sanitizeDrugList(protocol.drugs, origin),
    _origin: origin,
  };

  return sanitized;
}

function sanitizeDrugList(drugs, origin) {
  return (Array.isArray(drugs) ? drugs : [])
    .map((drug, index) => sanitizeDrug(drug, origin, index))
    .filter(Boolean);
}

function sanitizeDrug(drug, origin, index) {
  if (!drug || typeof drug !== 'object') return null;

  const amountUnit = drug.amountUnit != null ? String(drug.amountUnit).trim() : '';
  const weightUnit = WEIGHT_UNITS.includes(drug.weightUnit) ? drug.weightUnit : 'kg';

  return {
    id: drug.id != null && drug.id !== '' ? String(drug.id) : `${origin}-drug-${index + 1}`,
    name: drug.name != null ? String(drug.name).trim() : '',
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

function persistUserProtocols() {
  const normalized = state.userProtocols.map((protocol) => normalizeProtocol(protocol));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized, null, 2));
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

function seedTopLevelFields() {
  document.getElementById('animalWeight').value = valueOrEmpty(state.animalWeight);
  document.getElementById('animalWeightUnit').value = state.animalWeightUnit;
  document.getElementById('protocolName').value = state.draftProtocol.name || '';
  document.getElementById('protocolNotes').value = state.draftProtocol.notes || '';
}

function renderAll(options) {
  const config = options || {};
  renderProtocolOptions();
  renderAnimalSummary();
  renderDraftSummary();
  if (config.rerenderTable) {
    renderDrugTable();
  }
  renderValidationState();
  renderResults();
}

function renderProtocolOptions() {
  const select = document.getElementById('protocol-select');
  select.innerHTML = `
    <option value="__draft__">Current Draft</option>
    <optgroup label="Built-in protocols"></optgroup>
    <optgroup label="Saved in this browser"></optgroup>
  `;

  const [builtInGroup, userGroup] = select.querySelectorAll('optgroup');

  state.builtInProtocols.forEach((protocol) => {
    builtInGroup.appendChild(makeProtocolOption(protocol));
  });
  state.userProtocols.forEach((protocol) => {
    userGroup.appendChild(makeProtocolOption(protocol));
  });

  if (!state.builtInProtocols.length) {
    const option = document.createElement('option');
    option.disabled = true;
    option.textContent = 'No built-in protocols';
    builtInGroup.appendChild(option);
  }

  if (!state.userProtocols.length) {
    const option = document.createElement('option');
    option.disabled = true;
    option.textContent = 'No browser-saved protocols yet';
    userGroup.appendChild(option);
  }

  const optionValue = findProtocolById(state.selectedProtocolId) ? state.selectedProtocolId : '__draft__';
  select.value = optionValue;
}

function makeProtocolOption(protocol) {
  const option = document.createElement('option');
  option.value = protocol.id;
  option.textContent = `${protocol.name || 'Untitled protocol'} · ${protocol.drugs.length} drug${protocol.drugs.length === 1 ? '' : 's'}`;
  return option;
}

function renderAnimalSummary() {
  const container = document.getElementById('animal-summary');
  const weightValue = toNumber(state.animalWeight);
  const weightInGrams = convertBodyWeight(weightValue, state.animalWeightUnit, 'g');
  const weightInKilograms = convertBodyWeight(weightValue, state.animalWeightUnit, 'kg');

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Entered Weight</div>
      <div class="summary-value">${weightValue > 0 ? `${formatDoseAmount(weightValue)} ${state.animalWeightUnit}` : 'Waiting'}</div>
      <div class="summary-note">Use one animal at a time in this version.</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Equivalent</div>
      <div class="summary-value">${weightValue > 0 ? `${formatDoseAmount(weightInGrams)} g` : '—'}</div>
      <div class="summary-note">${weightValue > 0 ? `${formatDoseAmount(weightInKilograms)} kg` : 'Enter a positive weight to unlock calculations.'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Dose Basis</div>
      <div class="summary-value">${state.animalWeightUnit === 'g' ? 'Gram entry' : 'Kilogram entry'}</div>
      <div class="summary-note">Each drug row can still use either <code>g</code> or <code>kg</code> in the denominator.</div>
    </div>
  `;
}

function renderDraftSummary() {
  const container = document.getElementById('draft-summary');
  const evaluation = evaluateDraft();
  const selectedProtocol = findProtocolById(state.selectedProtocolId);
  const sourceLabel = selectedProtocol
    ? describeProtocolSource(selectedProtocol)
    : 'Unsaved draft';

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Protocol</div>
      <div class="summary-value">${escapeHtml(state.draftProtocol.name || 'Untitled draft')}</div>
      <div class="summary-note">${escapeHtml(sourceLabel)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Active Drugs</div>
      <div class="summary-value">${evaluation.activeRows.length}</div>
      <div class="summary-note">${evaluation.activeRows.length ? 'Only non-blank rows are used in validation and calculation.' : 'Blank rows are ignored until you fill them in.'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Save State</div>
      <div class="summary-value">${evaluation.canSave ? 'Ready' : 'Needs review'}</div>
      <div class="summary-note">${escapeHtml(evaluation.canSave ? 'This draft can be saved in the browser.' : (evaluation.saveIssues[0] || 'Protocol name and at least one valid drug row are required.'))}</div>
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
    tr.draggable = true;
    tr.innerHTML = `
      <td class="col-drag"><span class="drag-handle" title="Drag to reorder">⠿</span></td>
      <td class="col-num">${index + 1}</td>
      <td>
        <input class="lt-input name-input" type="text" data-field="name" placeholder="Drug name" value="${escapeAttribute(drug.name)}"/>
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

  applyValidationClasses();
}

function buildAmountUnitOptions(selectedValue) {
  const builtInOptions = BUILTIN_AMOUNT_UNITS.map((unit) =>
    `<option value="${unit}"${selectedValue === unit ? ' selected' : ''}>${unit}</option>`
  ).join('');

  return `${builtInOptions}<option value="__custom__"${selectedValue === '__custom__' ? ' selected' : ''}>Custom</option>`;
}

function renderValidationState() {
  const evaluation = evaluateDraft();
  const animalWeight = toNumber(state.animalWeight);

  if (!evaluation.activeRows.length) {
    setStatus('validation-status', 'Add at least one drug row to start calculating doses.', 'info');
  } else if (evaluation.rowIssues.length) {
    setStatus('validation-status', evaluation.rowIssues[0], 'danger');
  } else if (!(animalWeight > 0)) {
    setStatus('validation-status', 'Enter a positive animal weight to calculate output amounts.', 'info');
  } else {
    setStatus(
      'validation-status',
      `Ready to calculate ${evaluation.activeRows.length} drug${evaluation.activeRows.length === 1 ? '' : 's'} for ${formatDoseAmount(animalWeight)} ${state.animalWeightUnit}.`,
      'success'
    );
  }

  applyValidationClasses();
}

function applyValidationClasses() {
  const evaluation = evaluateDraft();
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
    toggleFieldError(row, 'notes', false);
  });
}

function toggleFieldError(row, fieldName, enabled) {
  const field = row.querySelector(`[data-field="${fieldName}"]`);
  if (!field) return;
  field.classList.toggle('error', !!enabled);
}

function renderResults() {
  const summary = document.getElementById('results-summary');
  const list = document.getElementById('results-list');
  const evaluation = evaluateDraft();
  const animalWeight = toNumber(state.animalWeight);

  if (!evaluation.activeRows.length) {
    summary.innerHTML = `
      <div class="summary-card">
        <div class="summary-label">Results</div>
        <div class="summary-value">Waiting</div>
        <div class="summary-note">Add one or more drugs to the protocol editor.</div>
      </div>
    `;
    list.innerHTML = '';
    return;
  }

  if (evaluation.rowIssues.length) {
    summary.innerHTML = `
      <div class="summary-card">
        <div class="summary-label">Results</div>
        <div class="summary-value">Blocked</div>
        <div class="summary-note">${escapeHtml(evaluation.rowIssues[0])}</div>
      </div>
    `;
    list.innerHTML = '';
    return;
  }

  if (!(animalWeight > 0)) {
    summary.innerHTML = `
      <div class="summary-card">
        <div class="summary-label">Results</div>
        <div class="summary-value">Waiting</div>
        <div class="summary-note">Enter a positive animal body weight to calculate output amounts.</div>
      </div>
    `;
    list.innerHTML = '';
    return;
  }

  const weightInGrams = convertBodyWeight(animalWeight, state.animalWeightUnit, 'g');
  const weightInKilograms = convertBodyWeight(animalWeight, state.animalWeightUnit, 'kg');

  summary.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Protocol</div>
      <div class="summary-value">${escapeHtml(state.draftProtocol.name || 'Untitled draft')}</div>
      <div class="summary-note">${evaluation.activeRows.length} drug${evaluation.activeRows.length === 1 ? '' : 's'} included in the live output.</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Animal Weight</div>
      <div class="summary-value">${formatDoseAmount(animalWeight)} ${state.animalWeightUnit}</div>
      <div class="summary-note">${formatDoseAmount(weightInGrams)} g · ${formatDoseAmount(weightInKilograms)} kg</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Output</div>
      <div class="summary-value">Ready</div>
      <div class="summary-note">Each result is shown in the protocol’s numerator unit.</div>
    </div>
  `;

  list.innerHTML = evaluation.activeRows.map((entry) => buildResultCard(entry.drug, animalWeight)).join('');
}

function buildResultCard(drug, animalWeight) {
  const resultBlocks = [];

  if (drug.minDose !== '') {
    resultBlocks.push(buildDoseBlock('Min', drug.minDose, drug, animalWeight));
  }
  if (drug.exactDose !== '') {
    resultBlocks.push(buildDoseBlock('Exact', drug.exactDose, drug, animalWeight));
  }
  if (drug.maxDose !== '') {
    resultBlocks.push(buildDoseBlock('Max', drug.maxDose, drug, animalWeight));
  }

  return `
    <article class="result-card">
      <div class="result-card-top">
        <div class="result-title">${escapeHtml(drug.name)}</div>
        <span class="lt-badge lt-badge-blue">${escapeHtml(drug.amountUnit)}/${drug.weightUnit}</span>
      </div>
      <div class="result-source-line">
        Protocol basis: ${buildProtocolDoseSummary(drug)}
      </div>
      <div class="dose-grid">
        ${resultBlocks.join('')}
      </div>
      ${drug.notes ? `<div class="result-note">${escapeHtml(drug.notes)}</div>` : ''}
    </article>
  `;
}

function buildDoseBlock(label, doseValue, drug, animalWeight) {
  const outputValue = calcDoseFromBodyWeight(doseValue, drug.weightUnit, animalWeight, state.animalWeightUnit);
  return `
    <div class="dose-chip">
      <div class="dose-chip-label">${label}</div>
      <div class="dose-chip-value">${formatDoseAmount(outputValue)} ${escapeHtml(drug.amountUnit)}</div>
      <div class="dose-chip-sub">${formatDoseAmount(doseValue)} ${escapeHtml(drug.amountUnit)}/${drug.weightUnit}</div>
    </div>
  `;
}

function buildProtocolDoseSummary(drug) {
  const parts = [];
  if (drug.minDose !== '') parts.push(`min ${formatDoseAmount(drug.minDose)}`);
  if (drug.exactDose !== '') parts.push(`exact ${formatDoseAmount(drug.exactDose)}`);
  if (drug.maxDose !== '') parts.push(`max ${formatDoseAmount(drug.maxDose)}`);
  return `${parts.join(' · ')} ${escapeHtml(drug.amountUnit)}/${drug.weightUnit}`;
}

function evaluateDraft() {
  const rowStates = state.draftProtocol.drugs.map((drug) => evaluateDrugRow(drug));
  const activeRows = [];
  const rowIssues = [];

  rowStates.forEach((rowState, index) => {
    if (rowState.blank) return;
    activeRows.push({ rowIndex: index, drug: state.draftProtocol.drugs[index] });
    rowIssues.push(...rowState.issues);
  });

  const protocolNameError = !state.draftProtocol.name.trim();
  const saveIssues = [];

  if (protocolNameError) {
    saveIssues.push('Protocol name is required before saving.');
  }
  if (!activeRows.length) {
    saveIssues.push('Add at least one valid drug row before saving.');
  }
  saveIssues.push(...rowIssues);

  return {
    rowStates,
    activeRows,
    rowIssues,
    protocolNameError,
    saveIssues,
    canSave: saveIssues.length === 0,
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
    if (!(value > 0)) {
      errors[field] = true;
      issues.push(`"${drug.name || 'Unnamed drug'}" has a non-positive ${field.replace('Dose', '')} dose.`);
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

function isDrugBlank(drug) {
  return !String(drug.name || '').trim()
    && !String(drug.notes || '').trim()
    && drug.minDose === ''
    && drug.exactDose === ''
    && drug.maxDose === '';
}

function onAnimalWeightInput(event) {
  state.animalWeight = event.target.value === '' ? '' : parseFloat(event.target.value);
  renderAll();
}

function onAnimalWeightUnitChange(event) {
  state.animalWeightUnit = event.target.value;
  renderAll();
}

function onProtocolMetaInput(event) {
  if (event.target.id === 'protocolName') {
    state.draftProtocol.name = event.target.value;
  } else if (event.target.id === 'protocolNotes') {
    state.draftProtocol.notes = event.target.value;
  }

  if (selectedProtocolIsBuiltIn()) {
    state.selectedProtocolId = '__draft__';
    persistSelectedProtocol();
    renderProtocolOptions();
    setStatus('protocol-status', 'Editing a shipped protocol created a new draft. Save it in this browser to keep your version.', 'info');
  }

  renderAll();
}

function onProtocolSelectChanged(event) {
  const selectedId = event.target.value;
  if (selectedId === '__draft__') {
    state.selectedProtocolId = '__draft__';
    persistSelectedProtocol();
    renderProtocolOptions();
    setDefaultProtocolStatus();
    return;
  }

  const protocol = findProtocolById(selectedId);
  if (!protocol) return;

  state.selectedProtocolId = protocol.id;
  state.draftProtocol = cloneProtocolDraft(protocol);
  persistSelectedProtocol();
  seedTopLevelFields();
  renderAll({ rerenderTable: true });
  setStatus('protocol-status', `Loaded protocol: ${protocol.name}.`, 'success');
}

function onProtocolTableInput(event) {
  const row = event.target.closest('.proto-row');
  if (!row) return;

  const index = parseInt(row.dataset.index, 10);
  const drug = state.draftProtocol.drugs[index];
  const field = event.target.dataset.field;
  if (!drug || !field) return;

  if (field === 'name' || field === 'notes') {
    drug[field] = event.target.value;
  } else if (field === 'minDose' || field === 'exactDose' || field === 'maxDose') {
    drug[field] = event.target.value === '' ? '' : parseFloat(event.target.value);
  } else if (field === 'amountUnitCustom') {
    drug.amountUnit = event.target.value.trim();
  }

  if (selectedProtocolIsBuiltIn()) {
    state.selectedProtocolId = '__draft__';
    persistSelectedProtocol();
    renderProtocolOptions();
    setStatus('protocol-status', 'Editing a shipped protocol created a new draft. Save it in this browser to keep your version.', 'info');
  }

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
    if (selectedProtocolIsBuiltIn()) {
      state.selectedProtocolId = '__draft__';
      persistSelectedProtocol();
      setStatus('protocol-status', 'Editing a shipped protocol created a new draft. Save it in this browser to keep your version.', 'info');
    }
    renderAll({ rerenderTable: true });
    return;
  }

  if (field === 'weightUnit') {
    drug.weightUnit = event.target.value;
    renderAll();
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

function addDrugRow() {
  state.draftProtocol.drugs.push(makeBlankDrug());
  renderAll({ rerenderTable: true });
}

function deleteDrugRow(index) {
  if (state.draftProtocol.drugs.length === 1) {
    state.draftProtocol.drugs = [makeBlankDrug()];
  } else {
    state.draftProtocol.drugs.splice(index, 1);
  }
  renderAll({ rerenderTable: true });
}

function moveDrugRow(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= state.draftProtocol.drugs.length) return;
  [state.draftProtocol.drugs[index], state.draftProtocol.drugs[targetIndex]] =
    [state.draftProtocol.drugs[targetIndex], state.draftProtocol.drugs[index]];
  renderAll({ rerenderTable: true });
}

function startNewDraft() {
  if (hasDraftContent() && !window.confirm('Start a new blank protocol? Your current unsaved draft will be cleared.')) {
    return;
  }

  state.selectedProtocolId = '__draft__';
  state.draftProtocol = makeBlankProtocol();
  persistSelectedProtocol();
  seedTopLevelFields();
  renderAll({ rerenderTable: true });
  setStatus('protocol-status', 'Started a new blank draft. Save it in this browser when ready.', 'info');
}

async function saveCurrentProtocol() {
  const evaluation = evaluateDraft();
  if (!evaluation.canSave) {
    setStatus('protocol-status', evaluation.saveIssues[0], 'danger');
    renderAll();
    return;
  }

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
  persistSelectedProtocol();
  seedTopLevelFields();
  renderAll({ rerenderTable: true });
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
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LAST_SELECTED_PROTOCOL_KEY);
  state.userProtocols = [];

  if (removedIds.has(state.selectedProtocolId)) {
    state.selectedProtocolId = '__draft__';
  }

  document.getElementById('copy-fallback').hidden = true;
  persistSelectedProtocol();
  renderAll({ rerenderTable: true });
  setStatus('protocol-status', `Cleared browser-saved protocols. Shipped entries in ${CONFIG_PATH} are unchanged.`, 'success');
}

async function copyCurrentProtocolConfig() {
  const evaluation = evaluateDraft();
  if (!evaluation.canSave) {
    setStatus('protocol-status', evaluation.saveIssues[0], 'danger');
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
    document.getElementById('copy-fallback').hidden = true;
    setStatus('protocol-status', `Current protocol copied as a config snippet. Paste it into the protocols array in ${CONFIG_PATH}.`, 'success');
  } catch (error) {
    const fallback = document.getElementById('copy-fallback');
    fallback.value = snippet;
    fallback.hidden = false;
    fallback.focus();
    fallback.select();
    setStatus('protocol-status', 'The browser blocked clipboard access. Copy the snippet from the text area manually instead.', 'warn');
  }
}

function exportAllProtocolConfigs() {
  const protocols = [...state.builtInProtocols, ...state.userProtocols].map((protocol) => normalizeProtocol(protocol));
  const content = buildProtocolConfigFileContent(protocols);
  labtoolsDownloadText('drug-dosage-protocols.js', content, 'application/javascript;charset=utf-8');
  document.getElementById('copy-fallback').hidden = true;
  setStatus('protocol-status', `Exported all protocols as a replacement config file. You can merge it back into ${CONFIG_PATH}.`, 'success');
}

function normalizeProtocol(protocol) {
  const normalized = {
    id: protocol.id || `custom-${slugify(protocol.name || 'protocol')}`,
    name: String(protocol.name || '').trim(),
    drugs: stripBlankDrugs(protocol.drugs).map((drug, index) => normalizeDrug(drug, index)),
  };

  const notes = String(protocol.notes || '').trim();
  if (notes) normalized.notes = notes;

  return normalized;
}

function normalizeDrug(drug, index) {
  const normalized = {
    id: drug.id || `drug-${slugify(drug.name || `row-${index + 1}`)}`,
    name: String(drug.name || '').trim(),
    amountUnit: String(drug.amountUnit || '').trim(),
    weightUnit: WEIGHT_UNITS.includes(drug.weightUnit) ? drug.weightUnit : 'kg',
  };

  if (drug.minDose !== '') normalized.minDose = drug.minDose;
  if (drug.exactDose !== '') normalized.exactDose = drug.exactDose;
  if (drug.maxDose !== '') normalized.maxDose = drug.maxDose;

  const notes = String(drug.notes || '').trim();
  if (notes) normalized.notes = notes;

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

function indentBlock(text, spaces) {
  const prefix = ' '.repeat(spaces);
  return text.split('\n').map((line) => `${prefix}${line}`).join('\n');
}

function hasDraftContent() {
  return !!state.draftProtocol.name.trim()
    || !!state.draftProtocol.notes.trim()
    || state.draftProtocol.drugs.some((drug) => !isDrugBlank(drug));
}

function selectedProtocolIsBuiltIn() {
  const selected = findProtocolById(state.selectedProtocolId);
  return !!(selected && selected._origin === 'builtin');
}

function describeProtocolSource(protocol) {
  if (!protocol) return 'Unsaved draft';
  if (protocol._origin === 'user') return 'Saved in this browser';
  if (protocol._origin === 'builtin') return 'Shipped in protocol-config.js';
  return 'Unsaved draft';
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
