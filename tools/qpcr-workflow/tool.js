'use strict';

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const COLUMNS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WELLS_PER_PLATE = 96;

const state = {
  samples: [],
  assays: [],
  plateMap: [],
  primerMix: [],
  sampleMix: [],
  rnaRows: [],
  cqRows: [],
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  [
    'samplesInput',
    'assaysInput',
    'replicatesInput',
    'controlInput',
    'assayOverageInput',
    'sampleOverageInput',
    'referenceInput',
    'efficiencyInput',
    'sampleCount',
    'assayCount',
    'wellCount',
    'layoutName',
    'warningBox',
    'plateGrid',
    'loadingGuide',
    'reagentTable',
    'rnaInput',
    'rnaTable',
    'cqInput',
    'cqTable',
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  document.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener('keydown', restrictToNumeric);
  });

  [
    els.samplesInput,
    els.assaysInput,
    els.replicatesInput,
    els.controlInput,
    els.assayOverageInput,
    els.sampleOverageInput,
    els.referenceInput,
    els.efficiencyInput,
    els.rnaInput,
    els.cqInput,
  ].forEach((input) => {
    input.addEventListener('input', updateAll);
  });

  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
  });

  document.getElementById('loadExampleBtn').addEventListener('click', loadExample);
  document.getElementById('exportPlateBtn').addEventListener('click', () => exportCsv('qpcr-plate-map.csv', state.plateMap));
  document.getElementById('exportPrimerBtn').addEventListener('click', () => exportCsv('qpcr-primer-mastermix.csv', state.primerMix));
  document.getElementById('exportSampleMixBtn').addEventListener('click', () => exportCsv('qpcr-sample-cdna-h2o-mix.csv', state.sampleMix));
  document.getElementById('exportRnaBtn').addEventListener('click', () => exportCsv('qpcr-rna-calculation.csv', state.rnaRows));
  document.getElementById('exportCqBtn').addEventListener('click', () => exportCsv('qpcr-ddct-results.csv', state.cqRows));

  loadExample();
});

function loadExample() {
  els.samplesInput.value = 'MR1_siNC, MR1_siWNT5A.1, MR1_siWNT5A.2, MR2_siNC, MR2_siWNT5A.1, MR2_siWNT5A.2, OE_siNC, OE_siMAPK8.2, OE_siMAPK8.3';
  els.assaysInput.value = 'Actin, WNT5A, MAPK8';
  els.replicatesInput.value = '3';
  els.controlInput.value = 'siNC';
  els.assayOverageInput.value = '2';
  els.sampleOverageInput.value = '2';
  els.referenceInput.value = 'Actin';
  els.efficiencyInput.value = '2';
  els.rnaInput.value = [
    'sample_name,concentration_ng_per_uL,A260_A280,A260_A230',
    'MR1_siNC,780,2.04,2.18',
    'MR1_siWNT5A.1,640,1.95,2.05',
    'MR2_siNC,520,1.82,1.96',
  ].join('\n');
  els.cqInput.value = exampleCqCsv();
  updateAll();
}

function updateAll() {
  const config = getConfig();
  state.samples = parseSamples(els.samplesInput.value);
  state.assays = parseAssays(els.assaysInput.value);

  const layout = designPlateLayout(state.samples, state.assays, config.replicates);
  state.plateMap = layout.records;
  state.primerMix = calculatePrimerMix(state.plateMap, config.assayOverage);
  state.sampleMix = calculateSampleMix(state.plateMap, config.sampleOverage);
  state.rnaRows = calculateRnaRows(parseCsv(els.rnaInput.value));
  state.cqRows = analyzeCqRows(parseCsv(els.cqInput.value), config);

  renderMetrics(layout, config);
  renderPlate(state.plateMap);
  renderGuide(layout);
  renderReagents();
  renderTable(els.rnaTable, state.rnaRows);
  renderTable(els.cqTable, state.cqRows);
}

function getConfig() {
  return {
    replicates: clampInt(Number(els.replicatesInput.value), 1, 12, 3),
    controlTreatment: (els.controlInput.value || 'siNC').trim(),
    assayOverage: Math.max(0, Math.floor(Number(els.assayOverageInput.value) || 0)),
    sampleOverage: Math.max(0, Math.floor(Number(els.sampleOverageInput.value) || 0)),
    referenceGene: (els.referenceInput.value || 'Actin').trim(),
    efficiency: Math.max(1, Number(els.efficiencyInput.value) || 2),
  };
}

function clampInt(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function parseList(value) {
  return value
    .replace(/\n/g, ',')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSamples(value) {
  return parseList(value).map((sampleName, index) => {
    const parts = sampleName.split('_');
    const hasParts = parts.length > 1;
    return {
      sample_id: `S${index + 1}`,
      sample_name: sampleName,
      CellLineName: hasParts ? parts[0].trim() || 'Unknown' : 'Unknown',
      Treatment: hasParts ? parts.slice(1).join('_').trim() || sampleName : sampleName,
      group: hasParts ? parts[0].trim() || 'Unknown' : 'Unknown',
      biological_replicate_id: `B${index + 1}`,
    };
  });
}

function parseAssays(value) {
  return parseList(value).map((gene) => ({
    gene,
    primer_name: gene,
    assay_type: gene.toLowerCase() === 'actin' ? 'reference' : 'target',
    efficiency: 2,
  }));
}

function designPlateLayout(samples, assays, replicates) {
  const warnings = [];
  const totalWells = samples.length * assays.length * replicates;
  if (!samples.length || !assays.length) {
    return {
      records: [],
      layoutName: 'Waiting for input',
      guide: 'Enter samples and assays to generate a plate map.',
      warnings,
    };
  }
  if (totalWells > WELLS_PER_PLATE) {
    warnings.push(`This setup needs ${totalWells} wells, so it cannot fit on one 96-well plate.`);
  }

  const targetWidth = assays.length * replicates;
  if (targetWidth <= COLUMNS.length) {
    return sampleRowsLayout(samples, assays, replicates, warnings);
  }

  warnings.push(`${assays.length} assays x ${replicates} replicates needs ${targetWidth} columns, so compact fill was used.`);
  return compactLayout(samples, assays, replicates, warnings);
}

function sampleRowsLayout(samples, assays, replicates, warnings) {
  const records = [];
  const targetWidth = assays.length * replicates;
  const rightStart = targetWidth + 1;
  const overflowLanes = Math.max(0, Math.floor((COLUMNS.length - targetWidth) / replicates));
  const overflowSamplesPerPlate = assays.length ? Math.floor(ROWS.length / assays.length) * overflowLanes : 0;
  let sampleIndex = 0;
  let plateNumber = 1;

  while (sampleIndex < samples.length) {
    const primary = samples.slice(sampleIndex, sampleIndex + ROWS.length);
    primary.forEach((sample, rowIndex) => {
      assays.forEach((assay, assayIndex) => {
        const firstCol = assayIndex * replicates + 1;
        for (let rep = 1; rep <= replicates; rep += 1) {
          records.push(makeRecord(plateNumber, ROWS[rowIndex], firstCol + rep - 1, sample, assay, rep, 'primary_matrix'));
        }
      });
    });
    sampleIndex += primary.length;

    if (sampleIndex < samples.length && overflowSamplesPerPlate > 0) {
      const overflow = samples.slice(sampleIndex, sampleIndex + overflowSamplesPerPlate);
      overflow.forEach((sample, overflowIndex) => {
        const laneIndex = overflowIndex % overflowLanes;
        const blockIndex = Math.floor(overflowIndex / overflowLanes);
        const firstCol = rightStart + laneIndex * replicates;
        assays.forEach((assay, assayIndex) => {
          const rowIndex = blockIndex * assays.length + assayIndex;
          for (let rep = 1; rep <= replicates; rep += 1) {
            records.push(makeRecord(plateNumber, ROWS[rowIndex], firstCol + rep - 1, sample, assay, rep, 'right_overflow_matrix'));
          }
        });
      });
      sampleIndex += overflow.length;
    }

    if (sampleIndex < samples.length) plateNumber += 1;
  }

  const guideLines = [
    'Chosen layout: sample rows / target column groups.',
    '',
    `Primary matrix: rows A-H are samples; every ${replicates} adjacent columns are one assay lane.`,
  ];
  assays.forEach((assay, index) => {
    const start = index * replicates + 1;
    guideLines.push(`Columns ${start}-${start + replicates - 1}: ${assay.gene}`);
  });
  if (overflowLanes > 0) {
    guideLines.push('', `Overflow samples use columns ${rightStart}-12 with assays stacked down rows.`);
  }

  return {
    records,
    layoutName: 'Sample rows',
    guide: guideLines.join('\n'),
    warnings,
  };
}

function compactLayout(samples, assays, replicates, warnings) {
  const records = [];
  let index = 0;
  samples.forEach((sample) => {
    assays.forEach((assay) => {
      for (let rep = 1; rep <= replicates; rep += 1) {
        const plateOffset = index % WELLS_PER_PLATE;
        const plateNumber = Math.floor(index / WELLS_PER_PLATE) + 1;
        const row = ROWS[Math.floor(plateOffset / COLUMNS.length)];
        const column = COLUMNS[plateOffset % COLUMNS.length];
        records.push(makeRecord(plateNumber, row, column, sample, assay, rep, 'compact_fill'));
        index += 1;
      }
    });
  });
  return {
    records,
    layoutName: 'Compact fill',
    guide: 'Chosen layout: compact fill. Wells are assigned left-to-right, top-to-bottom.',
    warnings,
  };
}

function makeRecord(plateNumber, row, column, sample, assay, replicate, blockType) {
  return {
    plate: `Plate ${plateNumber}`,
    plate_id: `Plate ${plateNumber}`,
    well: `${row}${column}`,
    row,
    column,
    sample: sample.sample_name,
    target: assay.gene,
    replicate,
    CellLineName: sample.CellLineName,
    Treatment: sample.Treatment,
    block_type: blockType,
    sample_id: sample.sample_id,
    sample_name: sample.sample_name,
    group: sample.group,
    'assay/gene': assay.gene,
    assay_type: assay.assay_type,
    technical_replicate_number: replicate,
    biological_replicate_id: sample.biological_replicate_id,
  };
}

function calculatePrimerMix(plateMap, assayOverage) {
  const groups = groupBy(plateMap, (row) => row['assay/gene']);
  return Object.keys(groups).map((assay) => {
    const wells = groups[assay].length;
    const reactions = wells + assayOverage;
    return {
      'assay/gene': assay,
      number_of_wells: wells,
      extra_reactions: assayOverage,
      total_reactions_to_prepare: reactions,
      SsoFast_uL: round3(10 * reactions),
      forward_primer_uL: round3(0.5 * reactions),
      reverse_primer_uL: round3(0.5 * reactions),
      total_primer_mastermix_tube_volume_uL: round3(11 * reactions),
    };
  });
}

function calculateSampleMix(plateMap, sampleOverage) {
  const groups = groupBy(plateMap, (row) => `${row.sample_id}|||${row.sample_name}`);
  return Object.keys(groups).map((key) => {
    const first = groups[key][0];
    const wells = groups[key].length;
    const reactions = wells + sampleOverage;
    return {
      sample_id: first.sample_id,
      sample_name: first.sample_name,
      number_of_wells: wells,
      extra_reactions: sampleOverage,
      total_reactions_to_prepare: reactions,
      H2O_uL: round3(5 * reactions),
      cDNA_uL: round3(4 * reactions),
      total_sample_mix_volume_uL: round3(9 * reactions),
    };
  });
}

function calculateRnaRows(rows) {
  return rows.map((row, index) => {
    const sampleName = firstValue(row, ['sample_name', 'Sample Name', 'Sample ID', 'sample_id']) || `Sample ${index + 1}`;
    const concentration = toNumber(firstValue(row, [
      'concentration_ng_per_uL',
      'concentration ng/uL',
      'concentration ng/ul',
      'Concentration',
      'Conc.',
      'Nucleic Acid',
      'Nucleic Acid ng/uL',
      'Nucleic Acid ng/ul',
    ]));
    const a260280 = toNumber(firstValue(row, ['A260_A280', 'A260/A280', '260/280']));
    const a260230 = toNumber(firstValue(row, ['A260_A230', 'A260/A230', '260/230']));
    const rnaVolume = concentration > 0 ? 4000 / concentration : NaN;
    const water = Number.isFinite(rnaVolume) ? 32 - rnaVolume : NaN;
    const flags = [];
    if (!Number.isFinite(concentration)) flags.push('missing_concentration');
    if (Number.isFinite(rnaVolume) && rnaVolume > 32) flags.push('rna_volume_over_32uL');
    if (Number.isFinite(a260280) && !(a260280 > 1.8)) flags.push('unusual_A260_A280');
    if (Number.isFinite(a260230) && !(a260230 > 2.0)) flags.push('unusual_A260_A230');
    return {
      sample_name: sampleName,
      concentration_ng_per_uL: Number.isFinite(concentration) ? concentration : '',
      A260_A280: Number.isFinite(a260280) ? a260280 : '',
      A260_A230: Number.isFinite(a260230) ? a260230 : '',
      volume_for_4ug_RNA_uL: Number.isFinite(rnaVolume) ? round3(rnaVolume) : '',
      water_to_32uL_uL: Number.isFinite(water) ? round3(water) : '',
      QC_flag: flags.length ? flags.join(';') : 'ok',
    };
  });
}

function analyzeCqRows(rows, config) {
  const tidy = rows.map((row, index) => {
    const sampleName = firstValue(row, ['sample_name', 'sample', 'Sample']) || '';
    const target = firstValue(row, ['assay/gene', 'target', 'Target', 'gene']) || '';
    const cq = toNumber(firstValue(row, ['Cq', 'Ct', 'cq', 'ct']));
    const parts = sampleName.split('_');
    return {
      sample_id: firstValue(row, ['sample_id']) || sampleName || `row_${index + 1}`,
      sample_name: sampleName,
      CellLineName: firstValue(row, ['CellLineName']) || (parts.length > 1 ? parts[0] : 'Unknown'),
      Treatment: firstValue(row, ['Treatment']) || (parts.length > 1 ? parts.slice(1).join('_') : sampleName),
      target,
      Cq: cq,
      Replicate: firstValue(row, ['Replicate', 'replicate']) || '',
    };
  }).filter((row) => row.sample_name && row.target && Number.isFinite(row.Cq));

  if (!tidy.length) return [];

  const referenceGene = config.referenceGene.toLowerCase();
  const refMeans = meanBy(
    tidy.filter((row) => row.target.toLowerCase() === referenceGene),
    (row) => row.sample_name,
    (row) => row.Cq,
  );
  const targetRows = tidy.filter((row) => row.target.toLowerCase() !== referenceGene);
  const withDelta = targetRows.map((row) => {
    const meanRef = refMeans[row.sample_name];
    return {
      ...row,
      HousekeepingTarget: config.referenceGene,
      mean_Cq_reference: meanRef,
      DeltaCt: Number.isFinite(meanRef) ? row.Cq - meanRef : NaN,
    };
  });
  const controls = withDelta.filter((row) => row.Treatment === config.controlTreatment);
  const controlDelta = meanBy(
    controls,
    (row) => `${row.CellLineName}|||${row.target}`,
    (row) => row.DeltaCt,
  );

  return withDelta.map((row) => {
    const control = controlDelta[`${row.CellLineName}|||${row.target}`];
    const deltaDelta = Number.isFinite(row.DeltaCt) && Number.isFinite(control) ? row.DeltaCt - control : NaN;
    const foldChange = Number.isFinite(deltaDelta) ? config.efficiency ** (-deltaDelta) : NaN;
    const flags = [];
    if (!Number.isFinite(row.mean_Cq_reference)) flags.push('missing_reference_cq');
    if (!Number.isFinite(control)) flags.push(`missing_control_treatment_${config.controlTreatment}`);
    return {
      sample_name: row.sample_name,
      CellLineName: row.CellLineName,
      Treatment: row.Treatment,
      Target: row.target,
      Ct: round3(row.Cq),
      HousekeepingTarget: row.HousekeepingTarget,
      mean_Cq_reference: fmtCell(row.mean_Cq_reference),
      DeltaCt: fmtCell(row.DeltaCt),
      DeltaDeltaCt: fmtCell(deltaDelta),
      FoldChange: fmtCell(foldChange),
      QC_flags: flags.join(';') || 'ok',
    };
  });
}

function renderMetrics(layout) {
  els.sampleCount.textContent = state.samples.length;
  els.assayCount.textContent = state.assays.length;
  els.wellCount.textContent = state.plateMap.length;
  els.layoutName.textContent = layout.layoutName;

  const warnings = layout.warnings || [];
  els.warningBox.textContent = warnings.join(' ');
  els.warningBox.classList.toggle('active', warnings.length > 0);
}

function renderPlate(plateMap) {
  const wells = new Map(plateMap.filter((row) => row.plate_id === 'Plate 1').map((row) => [row.well, row]));
  els.plateGrid.innerHTML = '';
  els.plateGrid.appendChild(makeDiv('axis', ''));
  COLUMNS.forEach((column) => els.plateGrid.appendChild(makeDiv('axis', column)));
  ROWS.forEach((rowName) => {
    els.plateGrid.appendChild(makeDiv('axis', rowName));
    COLUMNS.forEach((column) => {
      const wellId = `${rowName}${column}`;
      const record = wells.get(wellId);
      const cell = makeDiv('well', record ? `${record.sample_id}\n${record.target}` : '');
      if (record) {
        cell.classList.add('filled');
        if (record.assay_type === 'reference') cell.classList.add('reference');
        cell.title = `${record.well}: ${record.sample_name} / ${record.target} rep ${record.replicate}`;
      }
      els.plateGrid.appendChild(cell);
    });
  });
}

function renderGuide(layout) {
  els.loadingGuide.textContent = layout.guide || '';
}

function renderReagents() {
  const rows = [
    ...state.primerMix.map((row) => ({ calculation_type: 'primer_mastermix', ...row })),
    ...state.sampleMix.map((row) => ({ calculation_type: 'sample_cdna_h2o_mix', ...row })),
  ];
  renderTable(els.reagentTable, rows);
}

function renderTable(container, rows) {
  if (!rows.length) {
    container.innerHTML = '<div class="hint" style="padding: 14px;">No rows yet.</div>';
    return;
  }
  const columns = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set()));
  const thead = `<thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>`;
  const tbody = rows.map((row) => (
    `<tr>${columns.map((column) => `<td>${escapeHtml(row[column] == null ? '' : row[column])}</td>`).join('')}</tr>`
  )).join('');
  container.innerHTML = `<table class="data-table">${thead}<tbody>${tbody}</tbody></table>`;
}

function setTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  });
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const rows = lines.map(parseCsvLine);
  const headers = rows.shift().map((header) => header.trim());
  return rows.map((values) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] == null ? '' : values[index].trim();
    });
    return row;
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function exportCsv(filename, rows) {
  if (!rows.length) return;
  labtoolsDownloadText(filename, toCsv(rows), 'text/csv;charset=utf-8');
}

function toCsv(rows) {
  const columns = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set()));
  const header = columns.map(csvEscape).join(',');
  const body = rows.map((row) => columns.map((column) => csvEscape(row[column] == null ? '' : row[column])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

function csvEscape(value) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function groupBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function meanBy(rows, keyFn, valueFn) {
  const groups = groupBy(rows, keyFn);
  return Object.keys(groups).reduce((acc, key) => {
    const values = groups[key].map(valueFn).filter(Number.isFinite);
    acc[key] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
    return acc;
  }, {});
}

function firstValue(row, keys) {
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return row[key];
  }
  return '';
}

function toNumber(value) {
  if (value == null || value === '') return NaN;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function fmtCell(value) {
  return Number.isFinite(value) ? round3(value) : '';
}

function makeDiv(className, text) {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return div;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function exampleCqCsv() {
  const samples = ['MR1_siNC', 'MR1_siWNT5A.1', 'MR1_siWNT5A.2', 'MR2_siNC', 'MR2_siWNT5A.1', 'MR2_siWNT5A.2'];
  const assays = ['Actin', 'WNT5A', 'MAPK8'];
  const rows = ['sample_name,assay/gene,Cq'];
  samples.forEach((sample, sampleIndex) => {
    assays.forEach((assay, assayIndex) => {
      for (let rep = 0; rep < 3; rep += 1) {
        const base = assay === 'Actin' ? 19.7 : 24.2 + assayIndex + sampleIndex * 0.35;
        rows.push(`${sample},${assay},${(base + rep * 0.12).toFixed(2)}`);
      }
    });
  });
  return rows.join('\n');
}
