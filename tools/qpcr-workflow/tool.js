'use strict';

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const COLUMNS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WELLS_PER_PLATE = 96;
const COMMON_REFERENCE_GENES = ['actin', 'gapdh', 'b2m', '18s', 'rplp0', 'tbp', 'hprt1'];

const state = {
  samples: [],
  assays: [],
  plateMap: [],
  primerMix: [],
  sampleMix: [],
  nucleicRows: [],
  ddctRows: [],
  ddctSummary: [],
  layout: {
    layoutName: 'Waiting for input',
    guide: 'Enter samples and assays to generate a plate map.',
    warnings: [],
  },
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  [
    'samplesInput',
    'assaysInput',
    'referenceInput',
    'controlInput',
    'replicatesInput',
    'layoutModeInput',
    'masterMixInput',
    'forwardPrimerInput',
    'reversePrimerInput',
    'waterInput',
    'cdnaInput',
    'assayExtraInput',
    'assayOveragePctInput',
    'sampleExtraInput',
    'sampleOveragePctInput',
    'nucleicTypeInput',
    'targetMassInput',
    'finalVolumeInput',
    'ratio280MinInput',
    'ratio230MinInput',
    'nucleicInput',
    'nucleicFileInput',
    'cqInput',
    'cqFileInput',
    'efficiencyInput',
    'efficiencyModeInput',
    'sampleCount',
    'assayCount',
    'wellCount',
    'layoutName',
    'warningBox',
    'platePreview',
    'loadingGuide',
    'primerTable',
    'sampleMixTable',
    'nucleicTable',
    'ddctViz',
    'ddctSummaryTable',
    'ddctTable',
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  document.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener('keydown', restrictToNumeric);
  });

  [
    els.samplesInput,
    els.assaysInput,
    els.referenceInput,
    els.controlInput,
    els.replicatesInput,
    els.layoutModeInput,
    els.masterMixInput,
    els.forwardPrimerInput,
    els.reversePrimerInput,
    els.waterInput,
    els.cdnaInput,
    els.assayExtraInput,
    els.assayOveragePctInput,
    els.sampleExtraInput,
    els.sampleOveragePctInput,
    els.nucleicTypeInput,
    els.targetMassInput,
    els.finalVolumeInput,
    els.ratio280MinInput,
    els.ratio230MinInput,
    els.nucleicInput,
    els.cqInput,
    els.efficiencyInput,
    els.efficiencyModeInput,
  ].forEach((input) => {
    input.addEventListener('input', updateAll);
    input.addEventListener('change', updateAll);
  });

  document.querySelectorAll('.page-nav-btn').forEach((button) => {
    button.addEventListener('click', () => setPage(button.dataset.page));
  });

  els.nucleicFileInput.addEventListener('change', () => readFileIntoTextarea(els.nucleicFileInput, els.nucleicInput));
  els.cqFileInput.addEventListener('change', () => readFileIntoTextarea(els.cqFileInput, els.cqInput));

  document.getElementById('clearSetupBtn').addEventListener('click', clearSetup);
  document.getElementById('downloadTemplateBtn').addEventListener('click', downloadTemplates);
  document.getElementById('clearNucleicBtn').addEventListener('click', () => {
    els.nucleicInput.value = '';
    els.nucleicFileInput.value = '';
    updateAll();
  });
  document.getElementById('clearCqBtn').addEventListener('click', () => {
    els.cqInput.value = '';
    els.cqFileInput.value = '';
    updateAll();
  });

  document.getElementById('exportPlateBtn').addEventListener('click', () => exportCsv('qpcr-plate-map.csv', state.plateMap));
  document.getElementById('exportPrimerBtn').addEventListener('click', () => exportCsv('qpcr-primer-mastermix.csv', state.primerMix));
  document.getElementById('exportSampleMixBtn').addEventListener('click', () => exportCsv('qpcr-sample-cdna-h2o-mix.csv', state.sampleMix));
  document.getElementById('exportNucleicBtn').addEventListener('click', () => exportCsv('qpcr-nucleic-acid-calculation.csv', state.nucleicRows));
  document.getElementById('exportDdctBtn').addEventListener('click', () => exportCsv('qpcr-ddct-results.csv', state.ddctRows));

  updateAll();
});

function updateAll() {
  const config = getConfig();
  state.samples = parseSamples(els.samplesInput.value);
  state.assays = parseAssays(els.assaysInput.value, config.referenceGenes);
  state.layout = designPlateLayout(state.samples, state.assays, config);
  state.plateMap = state.layout.records;
  state.primerMix = calculatePrimerMix(state.plateMap, config);
  state.sampleMix = calculateSampleMix(state.plateMap, config);
  state.nucleicRows = calculateNucleicRows(parseDelimited(els.nucleicInput.value), config);

  const ddct = analyzeDdctRows(parseDelimited(els.cqInput.value), state.assays, config);
  state.ddctRows = ddct.rows;
  state.ddctSummary = ddct.summary;

  renderMetrics();
  renderPlatePreview();
  renderReagents();
  renderTable(els.nucleicTable, state.nucleicRows, {
    empty: 'Paste or upload concentration rows to calculate target sample and diluent volumes.',
  });
  renderDdct();
}

function getConfig() {
  return {
    referenceGenes: normalizeNames(parseList(els.referenceInput.value)),
    controlTreatment: (els.controlInput.value || '').trim(),
    replicates: clampInt(toNumber(els.replicatesInput.value), 1, 12, 3),
    layoutMode: els.layoutModeInput.value || 'auto',
    masterMix_uL: positiveNumber(els.masterMixInput.value, 10),
    forwardPrimer_uL: positiveNumber(els.forwardPrimerInput.value, 0.5),
    reversePrimer_uL: positiveNumber(els.reversePrimerInput.value, 0.5),
    water_uL: positiveNumber(els.waterInput.value, 5),
    cdna_uL: positiveNumber(els.cdnaInput.value, 4),
    assayExtra: nonNegativeInt(els.assayExtraInput.value),
    assayOveragePct: nonNegativeNumber(els.assayOveragePctInput.value),
    sampleExtra: nonNegativeInt(els.sampleExtraInput.value),
    sampleOveragePct: nonNegativeNumber(els.sampleOveragePctInput.value),
    nucleicType: els.nucleicTypeInput.value || 'RNA',
    targetMassNg: positiveNumber(els.targetMassInput.value, 4000),
    finalVolume_uL: positiveNumber(els.finalVolumeInput.value, 32),
    ratio280Min: positiveNumber(els.ratio280MinInput.value, 1.8),
    ratio230Min: positiveNumber(els.ratio230MinInput.value, 2.0),
    defaultEfficiency: Math.max(1, positiveNumber(els.efficiencyInput.value, 2)),
    efficiencyMode: els.efficiencyModeInput.value || 'assay',
  };
}

function clearSetup() {
  els.samplesInput.value = '';
  els.assaysInput.value = '';
  els.referenceInput.value = '';
  els.controlInput.value = '';
  els.replicatesInput.value = '3';
  els.layoutModeInput.value = 'auto';
  updateAll();
}

function setPage(page) {
  document.querySelectorAll('.page-nav-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === page);
  });
  document.querySelectorAll('.page-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `page-${page}`);
  });
}

function parseSamples(value) {
  const rows = parseDelimited(value);
  if (rows.length && hasAnyKey(rows[0], ['sample_name', 'sample', 'Sample', 'Sample Name'])) {
    return rows.map((row, index) => makeSample({
      sampleName: firstValue(row, ['sample_name', 'sample', 'Sample', 'Sample Name']) || `Sample ${index + 1}`,
      sampleId: firstValue(row, ['sample_id', 'Sample ID']) || `S${index + 1}`,
      cellLine: firstValue(row, ['CellLineName', 'cell_line', 'cellLine']),
      treatment: firstValue(row, ['Treatment', 'treatment', 'condition']),
      biologicalReplicate: firstValue(row, ['biological_replicate_id', 'bio_rep', 'BioRep']) || `B${index + 1}`,
    }));
  }

  return parseList(value).map((sampleName, index) => makeSample({
    sampleName,
    sampleId: `S${index + 1}`,
    biologicalReplicate: `B${index + 1}`,
  }));
}

function makeSample({ sampleName, sampleId, cellLine, treatment, biologicalReplicate }) {
  const parsed = parseSampleParts(sampleName);
  return {
    sample_id: sampleId,
    sample_name: sampleName,
    CellLineName: cellLine || parsed.CellLineName,
    Treatment: treatment || parsed.Treatment,
    group: cellLine || parsed.CellLineName,
    biological_replicate_id: biologicalReplicate || '',
  };
}

function parseSampleParts(sampleName) {
  const parts = String(sampleName || '').split('_');
  if (parts.length > 1) {
    return {
      CellLineName: parts[0].trim() || 'Unknown',
      Treatment: parts.slice(1).join('_').trim() || sampleName,
    };
  }
  return {
    CellLineName: 'Unknown',
    Treatment: sampleName || 'Unknown',
  };
}

function parseAssays(value, referenceGenes) {
  const referenceSet = new Set(referenceGenes.map((name) => name.toLowerCase()));
  const rows = parseDelimited(value);
  if (rows.length && hasAnyKey(rows[0], ['gene', 'assay/gene', 'target', 'Target'])) {
    return rows.map((row) => {
      const gene = firstValue(row, ['gene', 'assay/gene', 'target', 'Target']).trim();
      const typeValue = firstValue(row, ['assay_type', 'type']).toLowerCase();
      const efficiency = toNumber(firstValue(row, ['efficiency', 'PCR_efficiency', 'E']));
      return makeAssay(gene, typeValue, efficiency, referenceSet);
    }).filter((assay) => assay.gene);
  }

  return parseList(value).map((gene) => makeAssay(gene, '', NaN, referenceSet)).filter((assay) => assay.gene);
}

function makeAssay(gene, typeValue, efficiency, referenceSet) {
  const normalized = String(gene || '').trim();
  const lower = normalized.toLowerCase();
  const isReference = typeValue === 'reference' || referenceSet.has(lower) || (!referenceSet.size && COMMON_REFERENCE_GENES.includes(lower));
  return {
    gene: normalized,
    primer_name: normalized,
    assay_type: isReference ? 'reference' : 'target',
    efficiency: Number.isFinite(efficiency) && efficiency >= 1 ? efficiency : '',
  };
}

function designPlateLayout(samples, assays, config) {
  const warnings = [];
  const totalWells = samples.length * assays.length * config.replicates;
  if (!samples.length || !assays.length) {
    return {
      records: [],
      layoutName: 'Waiting for input',
      guide: 'Enter samples and assays on the Setup page to generate a plate map.',
      warnings,
    };
  }
  if (totalWells > WELLS_PER_PLATE) {
    warnings.push(`This setup needs ${totalWells} wells, so it cannot fit on one 96-well plate.`);
  }

  if (config.layoutMode === 'sampleRows') {
    const result = sampleRowsLayout(samples, assays, config.replicates, warnings, 'Sample rows / target column groups');
    return result || cleanSplitLayout(samples, assays, config.replicates, warnings, 'Clean split fallback');
  }
  if (config.layoutMode === 'targetRows') {
    const result = targetRowsLayout(samples, assays, config.replicates, warnings, 'Target rows / sample column groups');
    return result || cleanSplitLayout(samples, assays, config.replicates, warnings, 'Clean split fallback');
  }
  if (config.layoutMode === 'compact') {
    warnings.push('Compact fill was explicitly selected. Use this only when a clean manual-pipetting matrix is not required.');
    return compactLayout(samples, assays, config.replicates, warnings, 'Compact fill, only as a fallback');
  }

  return (
    sampleRowsLayout(samples, assays, config.replicates, warnings, 'Pipetting-friendly auto layout') ||
    targetRowsLayout(samples, assays, config.replicates, warnings, 'Pipetting-friendly auto layout') ||
    cleanSplitLayout(samples, assays, config.replicates, warnings, 'Clean split fallback')
  );
}

function sampleRowsLayout(samples, assays, replicates, warnings, requestedMode) {
  const targetWidth = assays.length * replicates;
  if (targetWidth > COLUMNS.length) {
    warnings.push(`${assays.length} targets x ${replicates} replicates = ${targetWidth} columns, so sample-row layout cannot fit all targets in one row.`);
    return null;
  }

  const records = [];
  const rightStart = targetWidth + 1;
  const overflowLanes = Math.max(0, Math.floor((COLUMNS.length - targetWidth) / replicates));
  const overflowSamplesPerPlate = assays.length ? Math.floor(ROWS.length / assays.length) * overflowLanes : 0;
  let sampleIndex = 0;
  let plateNumber = 1;
  const guideParts = [
    `Chosen layout: ${requestedMode === 'Pipetting-friendly auto layout' ? 'sample rows / target column groups' : requestedMode}.`,
    'Why: targets x replicates fit within 12 columns, so each sample can stay in one row and each target can stay in an adjacent column group.',
  ];

  while (sampleIndex < samples.length) {
    const plateStartIndex = sampleIndex;
    const primary = samples.slice(sampleIndex, sampleIndex + ROWS.length);
    primary.forEach((sample, rowIndex) => {
      assays.forEach((assay, assayIndex) => {
        const firstCol = assayIndex * replicates + 1;
        for (let rep = 1; rep <= replicates; rep += 1) {
          records.push(makeRecord({
            plateNumber,
            row: ROWS[rowIndex],
            column: firstCol + rep - 1,
            sample,
            assay,
            replicate: rep,
            blockType: plateNumber === 1 ? 'primary_matrix' : 'second_plate',
            loadingGroup: `sample_row_${ROWS[rowIndex]}`,
            sampleGroup: `sample_${sampleIndex + rowIndex + 1}`,
            targetGroup: `target_columns_${firstCol}_${firstCol + replicates - 1}`,
          }));
        }
      });
    });
    sampleIndex += primary.length;

    const overflowRecords = [];
    if (sampleIndex < samples.length && overflowSamplesPerPlate > 0) {
      const overflow = samples.slice(sampleIndex, sampleIndex + overflowSamplesPerPlate);
      overflow.forEach((sample, overflowIndex) => {
        const laneIndex = overflowIndex % overflowLanes;
        const blockIndex = Math.floor(overflowIndex / overflowLanes);
        const firstCol = rightStart + laneIndex * replicates;
        assays.forEach((assay, assayIndex) => {
          const rowIndex = blockIndex * assays.length + assayIndex;
          for (let rep = 1; rep <= replicates; rep += 1) {
            const record = makeRecord({
              plateNumber,
              row: ROWS[rowIndex],
              column: firstCol + rep - 1,
              sample,
              assay,
              replicate: rep,
              blockType: plateNumber === 1 ? 'right_overflow_matrix' : 'second_plate',
              loadingGroup: `overflow_sample_${sampleIndex + overflowIndex + 1}`,
              sampleGroup: `sample_${sampleIndex + overflowIndex + 1}`,
              targetGroup: `target_rows_${ROWS[rowIndex]}`,
            });
            records.push(record);
            overflowRecords.push(record);
          }
        });
      });
      sampleIndex += overflow.length;
    }

    guideParts.push(sampleRowsGuideSection({
      plateNumber,
      samples,
      assays,
      replicates,
      targetWidth,
      rightStart,
      primaryStartIndex: plateStartIndex,
      primaryCount: primary.length,
      overflowRecords,
    }));

    if (sampleIndex < samples.length) plateNumber += 1;
  }

  return {
    records,
    layoutName: 'Sample rows / target groups',
    guide: guideParts.filter(Boolean).join('\n\n'),
    warnings,
  };
}

function targetRowsLayout(samples, assays, replicates, warnings, requestedMode) {
  const lanesPerRow = Math.floor(COLUMNS.length / replicates);
  if (lanesPerRow < 1) {
    warnings.push(`Target-row layout cannot fit cleanly: ${replicates} replicates must fit within 12 columns.`);
    return null;
  }

  const records = [];
  const guideParts = [
    `Chosen layout: ${requestedMode === 'Pipetting-friendly auto layout' ? 'target rows / sample column groups' : requestedMode}.`,
    'Why: sample-row layout could not fit all targets in one row, so targets are kept in rows and samples are kept in adjacent column groups.',
  ];

  for (let sampleStart = 0, plateNumber = 1; sampleStart < samples.length; sampleStart += lanesPerRow, plateNumber += 1) {
    const sampleChunk = samples.slice(sampleStart, sampleStart + lanesPerRow);
    const primaryTargets = assays.slice(0, ROWS.length);
    const overflowTargets = assays.slice(ROWS.length);
    const primaryWidth = sampleChunk.length * replicates;
    const rightStart = primaryWidth + 1;
    const overflowLanes = Math.floor((COLUMNS.length - primaryWidth) / replicates);
    const overflowRecords = [];

    if (overflowTargets.length) {
      const overflowBands = overflowLanes > 0 ? Math.ceil(sampleChunk.length / overflowLanes) : Infinity;
      const overflowRowsNeeded = overflowTargets.length * overflowBands;
      if (!overflowLanes || overflowRowsNeeded > ROWS.length) {
        warnings.push(`Target-row layout cannot keep ${overflowTargets.length} overflow targets on Plate ${plateNumber}; no clean right-side matrix fits.`);
        return null;
      }
    }

    primaryTargets.forEach((assay, assayIndex) => {
      const row = ROWS[assayIndex];
      sampleChunk.forEach((sample, sampleOffset) => {
        const firstCol = sampleOffset * replicates + 1;
        for (let rep = 1; rep <= replicates; rep += 1) {
          records.push(makeRecord({
            plateNumber,
            row,
            column: firstCol + rep - 1,
            sample,
            assay,
            replicate: rep,
            blockType: plateNumber === 1 ? 'primary_matrix' : 'second_plate',
            loadingGroup: `target_row_${row}`,
            sampleGroup: `sample_columns_${firstCol}_${firstCol + replicates - 1}`,
            targetGroup: `target_row_${row}`,
          }));
        }
      });
    });

    if (overflowTargets.length) {
      for (let bandIndex = 0; bandIndex < Math.ceil(sampleChunk.length / overflowLanes); bandIndex += 1) {
        const bandSamples = sampleChunk.slice(bandIndex * overflowLanes, (bandIndex + 1) * overflowLanes);
        bandSamples.forEach((sample, laneIndex) => {
          const firstCol = rightStart + laneIndex * replicates;
          overflowTargets.forEach((assay, targetOffset) => {
            const row = ROWS[bandIndex * overflowTargets.length + targetOffset];
            for (let rep = 1; rep <= replicates; rep += 1) {
              const record = makeRecord({
                plateNumber,
                row,
                column: firstCol + rep - 1,
                sample,
                assay,
                replicate: rep,
                blockType: plateNumber === 1 ? 'right_overflow_matrix' : 'second_plate',
                loadingGroup: `overflow_sample_${sampleStart + (bandIndex * overflowLanes) + laneIndex + 1}`,
                sampleGroup: `sample_${sampleStart + (bandIndex * overflowLanes) + laneIndex + 1}`,
                targetGroup: `target_rows_${row}`,
              });
              records.push(record);
              overflowRecords.push(record);
            }
          });
        });
      }
    }

    guideParts.push([
      `Plate ${plateNumber}: target rows / sample column groups.`,
      ...primaryTargets.map((assay, index) => `- Row ${ROWS[index]} contains ${assay.gene}.`),
      ...sampleChunk.map((sample, index) => {
        const start = index * replicates + 1;
        return `- Columns ${start}-${start + replicates - 1} contain ${sample.sample_name} triplicates.`;
      }),
      targetRowsOverflowGuide({
        overflowRecords,
        overflowTargets,
        rightStart,
        replicates,
      }),
    ].join('\n'));
  }

  return {
    records,
    layoutName: 'Target rows / sample groups',
    guide: guideParts.join('\n\n'),
    warnings,
  };
}

function targetRowsOverflowGuide({ overflowRecords, overflowTargets, rightStart, replicates }) {
  if (!overflowRecords.length) return '';
  const lines = [
    'Right-side overflow matrix:',
    `- Columns ${rightStart}-${rightStart + replicates - 1} and any additional right-side lanes are used for overflow targets.`,
  ];
  const bySample = groupBy(overflowRecords, (record) => record.sample_group);
  Object.keys(bySample).forEach((sampleGroup) => {
    const records = bySample[sampleGroup];
    const sampleNumber = sampleGroup.replace('sample_', '');
    const sampleLabel = records[0].sample;
    const rows = Array.from(new Set(records.map((record) => record.row)));
    lines.push(`- Rows ${rows[0]}-${rows[rows.length - 1]} contain sample ${sampleNumber} (${sampleLabel}) across overflow targets ${overflowTargets.map((assay) => assay.gene).join(', ')}.`);
    overflowTargets.forEach((assay) => {
      const targetRecords = records.filter((record) => record.target === assay.gene);
      if (!targetRecords.length) return;
      const first = targetRecords[0];
      const last = targetRecords[targetRecords.length - 1];
      lines.push(`- ${first.well}-${last.well} = ${sampleLabel} + ${assay.gene} triplicates.`);
    });
  });
  return lines.join('\n');
}

function cleanSplitLayout(samples, assays, replicates, warnings, layoutName) {
  warnings.push('Neither preferred clean matrix fit on one plate. Splitting across multiple clean sample-row plates before compact fill.');
  const records = [];
  const assaysPerPlate = Math.max(1, Math.floor(COLUMNS.length / replicates));
  let plateNumber = 1;
  for (let assayStart = 0; assayStart < assays.length; assayStart += assaysPerPlate) {
    const assayChunk = assays.slice(assayStart, assayStart + assaysPerPlate);
    for (let sampleStart = 0; sampleStart < samples.length; sampleStart += ROWS.length) {
      const sampleChunk = samples.slice(sampleStart, sampleStart + ROWS.length);
      sampleChunk.forEach((sample, rowIndex) => {
        assayChunk.forEach((assay, assayOffset) => {
          const firstCol = assayOffset * replicates + 1;
          for (let rep = 1; rep <= replicates; rep += 1) {
            records.push(makeRecord({
              plateNumber,
              row: ROWS[rowIndex],
              column: firstCol + rep - 1,
              sample,
              assay,
              replicate: rep,
              blockType: plateNumber === 1 ? 'primary_matrix' : 'second_plate',
              loadingGroup: `sample_row_${ROWS[rowIndex]}`,
              sampleGroup: `sample_${sampleStart + rowIndex + 1}`,
              targetGroup: `target_columns_${firstCol}_${firstCol + replicates - 1}`,
            }));
          }
        });
      });
      plateNumber += 1;
    }
  }

  const guide = [
    `Chosen layout: ${layoutName}.`,
    `Each split plate keeps samples in rows and up to ${assaysPerPlate} targets in adjacent column groups.`,
    'This avoids random scattered placement when a single clean matrix is not possible.',
  ].join('\n');

  return {
    records,
    layoutName,
    guide,
    warnings,
  };
}

function sampleRowsGuideSection({ plateNumber, samples, assays, replicates, targetWidth, rightStart, primaryStartIndex, primaryCount, overflowRecords }) {
  const primaryLines = [
    `Plate ${plateNumber} primary matrix:`,
    `- Rows A-${ROWS[primaryCount - 1]} contain samples ${primaryStartIndex + 1}-${primaryStartIndex + primaryCount}.`,
    ...assays.map((assay, index) => {
      const start = index * replicates + 1;
      return `- Columns ${start}-${start + replicates - 1} contain ${assay.gene} triplicates.`;
    }),
  ];

  const overflowLines = [];
  if (overflowRecords.length) {
    const overflowBySample = groupBy(overflowRecords, (record) => record.sample_group);
    overflowLines.push('Right-side overflow matrix:');
    overflowLines.push(`- Columns ${rightStart}-12 are used for overflow samples.`);
    Object.keys(overflowBySample).forEach((sampleGroup) => {
      const records = overflowBySample[sampleGroup];
      const sampleLabel = records[0].sample;
      const sampleNumber = sampleGroup.replace('sample_', '');
      const rows = Array.from(new Set(records.map((record) => record.row)));
      overflowLines.push(`- Rows ${rows[0]}-${rows[rows.length - 1]} contain sample ${sampleNumber} (${sampleLabel}) across targets ${assays.map((assay) => assay.gene).join(', ')}.`);
      assays.forEach((assay) => {
        const assayRecords = records.filter((record) => record.target === assay.gene);
        if (!assayRecords.length) return;
        const first = assayRecords[0];
        const last = assayRecords[assayRecords.length - 1];
        overflowLines.push(`- ${first.well}-${last.well} = sample ${sampleNumber} + ${assay.gene} triplicates.`);
      });
    });
  } else if (rightStart <= COLUMNS.length) {
    primaryLines.push(`- Columns ${rightStart}-12 remain available for a right-side overflow mini matrix if more samples are added.`);
  }

  if (targetWidth === COLUMNS.length) {
    primaryLines.push('- No right-side overflow area remains on this plate.');
  }

  return [...primaryLines, ...overflowLines].join('\n');
}

function compactLayout(samples, assays, replicates, warnings, layoutName) {
  const records = [];
  let index = 0;
  samples.forEach((sample) => {
    assays.forEach((assay) => {
      for (let rep = 1; rep <= replicates; rep += 1) {
        const plateOffset = index % WELLS_PER_PLATE;
        const plateNumber = Math.floor(index / WELLS_PER_PLATE) + 1;
        const row = ROWS[Math.floor(plateOffset / COLUMNS.length)];
        const column = COLUMNS[plateOffset % COLUMNS.length];
        records.push(makeRecord({
          plateNumber,
          row,
          column,
          sample,
          assay,
          replicate: rep,
          blockType: 'compact_fill',
          loadingGroup: `compact_plate_${plateNumber}`,
          sampleGroup: `sample_${sample.sample_id}`,
          targetGroup: `target_${assay.gene}`,
        }));
        index += 1;
      }
    });
  });
  return {
    records,
    layoutName: layoutName || 'Compact fill',
    guide: 'Chosen layout: compact fill. Wells are assigned left-to-right and top-to-bottom, splitting to additional plates as needed.',
    warnings,
  };
}

function makeRecord({ plateNumber, row, column, sample, assay, replicate, blockType, loadingGroup, sampleGroup, targetGroup }) {
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
    loading_group: loadingGroup,
    sample_group: sampleGroup,
    target_group: targetGroup,
    sample_id: sample.sample_id,
    sample_name: sample.sample_name,
    group: sample.group,
    'assay/gene': assay.gene,
    assay_type: assay.assay_type,
    PCR_efficiency: assay.efficiency || '',
    technical_replicate_number: replicate,
    biological_replicate_id: sample.biological_replicate_id,
  };
}

function calculatePrimerMix(plateMap, config) {
  const groups = groupBy(plateMap, (row) => row['assay/gene']);
  return Object.keys(groups).map((assay) => {
    const wells = groups[assay].length;
    const percentExtra = Math.ceil(wells * (config.assayOveragePct / 100));
    const reactions = wells + config.assayExtra + percentExtra;
    return {
      'assay/gene': assay,
      wells,
      extra_reactions: config.assayExtra,
      overage_percent: config.assayOveragePct,
      percent_overage_reactions: percentExtra,
      total_reactions: reactions,
      master_mix_uL: round3(config.masterMix_uL * reactions),
      forward_primer_uL: round3(config.forwardPrimer_uL * reactions),
      reverse_primer_uL: round3(config.reversePrimer_uL * reactions),
      total_primer_mix_uL: round3((config.masterMix_uL + config.forwardPrimer_uL + config.reversePrimer_uL) * reactions),
    };
  });
}

function calculateSampleMix(plateMap, config) {
  const groups = groupBy(plateMap, (row) => `${row.sample_id}|||${row.sample_name}`);
  return Object.keys(groups).map((key) => {
    const first = groups[key][0];
    const wells = groups[key].length;
    const percentExtra = Math.ceil(wells * (config.sampleOveragePct / 100));
    const reactions = wells + config.sampleExtra + percentExtra;
    return {
      sample_id: first.sample_id,
      sample_name: first.sample_name,
      wells,
      extra_reactions: config.sampleExtra,
      overage_percent: config.sampleOveragePct,
      percent_overage_reactions: percentExtra,
      total_reactions: reactions,
      H2O_uL: round3(config.water_uL * reactions),
      cDNA_uL: round3(config.cdna_uL * reactions),
      total_sample_mix_uL: round3((config.water_uL + config.cdna_uL) * reactions),
    };
  });
}

function calculateNucleicRows(rows, config) {
  return rows.map((row, index) => {
    const sampleName = firstValue(row, ['sample_name', 'Sample Name', 'Sample ID', 'sample_id', 'Sample']) || `Sample ${index + 1}`;
    const concentration = toNumber(firstValue(row, [
      'concentration_ng_per_uL',
      'concentration ng/uL',
      'concentration ng/ul',
      'Concentration',
      'Conc.',
      'Nucleic Acid',
      'Nucleic Acid ng/uL',
      'Nucleic Acid ng/ul',
      'ng/uL',
      'ng/ul',
    ]));
    const a260280 = toNumber(firstValue(row, ['A260_A280', 'A260/A280', '260/280']));
    const a260230 = toNumber(firstValue(row, ['A260_A230', 'A260/A230', '260/230']));
    const sampleVolume = concentration > 0 ? config.targetMassNg / concentration : NaN;
    const diluent = Number.isFinite(sampleVolume) ? config.finalVolume_uL - sampleVolume : NaN;
    const flags = [];
    if (!Number.isFinite(concentration)) flags.push('missing_concentration');
    if (Number.isFinite(sampleVolume) && sampleVolume > config.finalVolume_uL) flags.push('sample_volume_over_final_volume');
    if (Number.isFinite(diluent) && diluent < 0) flags.push('negative_diluent');
    if (Number.isFinite(a260280) && a260280 < config.ratio280Min) flags.push('low_A260_A280');
    if (Number.isFinite(a260230) && a260230 < config.ratio230Min) flags.push('low_A260_A230');
    return {
      sample_name: sampleName,
      measurement_type: config.nucleicType,
      concentration_ng_per_uL: fmtCell(concentration),
      target_mass_ng: fmtCell(config.targetMassNg),
      sample_volume_uL: fmtCell(sampleVolume),
      diluent_to_final_volume_uL: fmtCell(diluent),
      final_volume_uL: fmtCell(config.finalVolume_uL),
      A260_A280: fmtCell(a260280),
      A260_A230: fmtCell(a260230),
      QC: flags.length ? flags.join(';') : 'ok',
    };
  });
}

function analyzeDdctRows(rows, assays, config) {
  const tidy = rows.map((row, index) => {
    const sampleName = firstValue(row, ['sample_name', 'sample', 'Sample', 'Sample Name']) || '';
    const target = firstValue(row, ['assay/gene', 'target', 'Target', 'gene', 'assay']) || '';
    const cq = toNumber(firstValue(row, ['Cq', 'Ct', 'cq', 'ct']));
    const parts = parseSampleParts(sampleName);
    return {
      sample_id: firstValue(row, ['sample_id', 'Sample ID']) || sampleName || `row_${index + 1}`,
      sample_name: sampleName,
      CellLineName: firstValue(row, ['CellLineName', 'cell_line', 'cellLine']) || parts.CellLineName,
      Treatment: firstValue(row, ['Treatment', 'treatment', 'condition']) || parts.Treatment,
      target,
      Cq: cq,
    };
  }).filter((row) => row.sample_name && row.target && Number.isFinite(row.Cq));

  if (!tidy.length) return { rows: [], summary: [] };

  const assayMap = Object.fromEntries(assays.map((assay) => [assay.gene.toLowerCase(), assay]));
  let referenceGenes = config.referenceGenes;
  if (!referenceGenes.length) {
    referenceGenes = assays.filter((assay) => assay.assay_type === 'reference').map((assay) => assay.gene);
  }
  const referenceSet = new Set(referenceGenes.map((name) => name.toLowerCase()));
  if (!referenceSet.size) return { rows: [], summary: [] };

  const sampleTargetMeans = summarizeMeans(tidy, (row) => `${row.sample_name}|||${row.target}`, (row) => row.Cq);
  const sampleTargets = Object.keys(sampleTargetMeans).map((key) => {
    const [sampleName, target] = key.split('|||');
    const first = tidy.find((row) => row.sample_name === sampleName && row.target === target);
    return {
      ...first,
      mean_Cq: sampleTargetMeans[key].mean,
      technical_replicates: sampleTargetMeans[key].n,
    };
  });

  const referenceBySample = {};
  sampleTargets.filter((row) => referenceSet.has(row.target.toLowerCase())).forEach((row) => {
    if (!referenceBySample[row.sample_name]) referenceBySample[row.sample_name] = [];
    referenceBySample[row.sample_name].push(row.mean_Cq);
  });

  const targetRows = sampleTargets.filter((row) => !referenceSet.has(row.target.toLowerCase()));
  const withDelta = targetRows.map((row) => {
    const refValues = referenceBySample[row.sample_name] || [];
    const referenceMean = mean(refValues);
    return {
      ...row,
      reference_gene_count: refValues.length,
      reference_genes: referenceGenes.join(' + '),
      mean_reference_Cq: referenceMean,
      'ΔCt': Number.isFinite(referenceMean) ? row.mean_Cq - referenceMean : NaN,
    };
  });

  const controlRows = withDelta.filter((row) => config.controlTreatment && row.Treatment === config.controlTreatment);
  const controlMeans = summarizeMeans(controlRows, (row) => `${row.CellLineName}|||${row.target}`, (row) => row['ΔCt']);

  const results = withDelta.map((row) => {
    const control = controlMeans[`${row.CellLineName}|||${row.target}`];
    const controlDelta = control ? control.mean : NaN;
    const ddct = Number.isFinite(row['ΔCt']) && Number.isFinite(controlDelta) ? row['ΔCt'] - controlDelta : NaN;
    const assay = assayMap[row.target.toLowerCase()] || {};
    const efficiency = config.efficiencyMode === 'assay' && Number.isFinite(toNumber(assay.efficiency)) ? toNumber(assay.efficiency) : config.defaultEfficiency;
    const foldChange = Number.isFinite(ddct) ? efficiency ** (-ddct) : NaN;
    const flags = [];
    if (!row.reference_gene_count) flags.push('missing_reference_cq');
    if (!config.controlTreatment) flags.push('missing_control_treatment_setting');
    if (!Number.isFinite(controlDelta)) flags.push(`missing_control_treatment_${config.controlTreatment || 'blank'}`);
    return {
      sample_name: row.sample_name,
      CellLineName: row.CellLineName,
      Treatment: row.Treatment,
      Target: row.target,
      mean_Cq: fmtCell(row.mean_Cq),
      technical_replicates: row.technical_replicates,
      reference_genes: row.reference_genes,
      reference_gene_count: row.reference_gene_count,
      mean_reference_Cq: fmtCell(row.mean_reference_Cq),
      'ΔCt': fmtCell(row['ΔCt']),
      control_ΔCt: fmtCell(controlDelta),
      'ΔΔCt': fmtCell(ddct),
      FoldChange: fmtCell(foldChange),
      PCR_efficiency: fmtCell(efficiency),
      QC: flags.length ? flags.join(';') : 'ok',
    };
  });

  return {
    rows: results,
    summary: summarizeDdct(results),
  };
}

function summarizeDdct(results) {
  const valid = results.filter((row) => Number.isFinite(toNumber(row['ΔΔCt'])));
  const groups = groupBy(valid, (row) => `${row.CellLineName}|||${row.Treatment}|||${row.Target}`);
  return Object.keys(groups).map((key) => {
    const [cellLine, treatment, target] = key.split('|||');
    const ddctValues = groups[key].map((row) => toNumber(row['ΔΔCt'])).filter(Number.isFinite);
    const foldValues = groups[key].map((row) => toNumber(row.FoldChange)).filter(Number.isFinite);
    return {
      CellLineName: cellLine,
      Treatment: treatment,
      Target: target,
      n: ddctValues.length,
      mean_ΔΔCt: fmtCell(mean(ddctValues)),
      sd_ΔΔCt: fmtCell(sd(ddctValues)),
      mean_FoldChange: fmtCell(mean(foldValues)),
    };
  });
}

function renderMetrics() {
  els.sampleCount.textContent = state.samples.length;
  els.assayCount.textContent = state.assays.length;
  els.wellCount.textContent = state.plateMap.length;
  els.layoutName.textContent = state.layout.layoutName;
  els.loadingGuide.textContent = state.layout.guide || '';

  const warnings = state.layout.warnings || [];
  els.warningBox.textContent = warnings.join(' ');
  els.warningBox.classList.toggle('active', warnings.length > 0);
}

function renderPlatePreview() {
  if (!state.plateMap.length) {
    els.platePreview.innerHTML = '<div class="empty-state">No plate preview yet. Enter samples and assays on the Setup page.</div>';
    return;
  }

  const plates = groupBy(state.plateMap, (row) => row.plate_id);
  els.platePreview.innerHTML = Object.keys(plates).map((plateId) => renderPlateTable(plateId, plates[plateId])).join('');
}

function renderPlateTable(plateId, rows) {
  const wells = new Map(rows.map((row) => [row.well, row]));
  const header = `<tr><th>${escapeHtml(plateId)}</th>${COLUMNS.map((column) => `<th>${column}</th>`).join('')}</tr>`;
  const body = ROWS.map((rowName) => {
    const cells = COLUMNS.map((column) => {
      const record = wells.get(`${rowName}${column}`);
      if (!record) return '<td class="plate-well"></td>';
      const classes = ['plate-well', 'filled'];
      if (record.assay_type === 'reference') classes.push('reference');
      return [
        `<td class="${classes.join(' ')}" title="${escapeHtml(`${record.well}: ${record.sample_name} / ${record.target} rep ${record.replicate}`)}">`,
        `<span class="well-sample">${escapeHtml(record.sample_name)}</span>`,
        `<span class="well-target">${escapeHtml(record.target)}</span>`,
        `<span class="well-rep">rep ${escapeHtml(record.replicate)}</span>`,
        '</td>',
      ].join('');
    }).join('');
    return `<tr><th>${rowName}</th>${cells}</tr>`;
  }).join('');
  return `<table class="plate-table">${header}${body}</table>`;
}

function renderReagents() {
  renderTable(els.primerTable, state.primerMix, {
    empty: 'Enter setup data to calculate primer master mix.',
  });
  renderTable(els.sampleMixTable, state.sampleMix, {
    empty: 'Enter setup data to calculate sample cDNA/H2O mix.',
  });
}

function renderDdct() {
  renderDdctViz(state.ddctSummary);
  renderTable(els.ddctSummaryTable, state.ddctSummary, {
    empty: 'No ΔΔCt summary yet. Paste Cq rows and set reference genes/control treatment.',
  });
  renderTable(els.ddctTable, state.ddctRows, {
    empty: 'No ΔΔCt results yet. Paste tidy Cq rows to calculate results.',
  });
}

function renderDdctViz(summary) {
  const rows = summary.filter((row) => Number.isFinite(toNumber(row.mean_ΔΔCt)));
  if (!rows.length) {
    els.ddctViz.innerHTML = '<div class="viz-empty">No finite ΔΔCt values to visualize yet.</div>';
    return;
  }

  const maxAbs = Math.max(1, ...rows.map((row) => Math.abs(toNumber(row.mean_ΔΔCt))));
  els.ddctViz.innerHTML = '';
  rows.forEach((row) => {
    const value = toNumber(row.mean_ΔΔCt);
    const width = Math.min(50, Math.abs(value) / maxAbs * 50);
    const left = value < 0 ? 50 - width : 50;

    const wrap = document.createElement('div');
    wrap.className = 'ddct-row';

    const label = document.createElement('div');
    label.className = 'ddct-label';
    label.innerHTML = `<strong>${escapeHtml(row.Target)}</strong>${escapeHtml(`${row.CellLineName} / ${row.Treatment}`)}`;

    const track = document.createElement('div');
    track.className = 'ddct-track';
    const bar = document.createElement('div');
    bar.className = `ddct-bar${value < 0 ? ' negative' : ''}`;
    bar.style.left = `${left}%`;
    bar.style.width = `${width}%`;
    track.appendChild(bar);

    const number = document.createElement('div');
    number.className = 'ddct-value';
    number.textContent = fmtCell(value);

    wrap.append(label, track, number);
    els.ddctViz.appendChild(wrap);
  });
}

function renderTable(container, rows, options = {}) {
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(options.empty || 'No rows yet.')}</div>`;
    return;
  }

  const columns = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set()));
  const thead = `<thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>`;
  const tbody = rows.map((row) => (
    `<tr>${columns.map((column) => `<td>${formatTableCell(column, row[column])}</td>`).join('')}</tr>`
  )).join('');
  container.innerHTML = `<table class="data-table">${thead}<tbody>${tbody}</tbody></table>`;
}

function formatTableCell(column, value) {
  const text = value == null ? '' : String(value);
  if (column === 'QC') {
    const cls = text === 'ok' ? 'qc-ok' : 'qc-warn';
    return `<span class="${cls}">${escapeHtml(text || 'blank')}</span>`;
  }
  return escapeHtml(text);
}

function parseList(value) {
  return String(value || '')
    .replace(/\n/g, ',')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDelimited(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const parsed = lines.map((line) => parseDelimitedLine(line, delimiter));
  const headers = parsed.shift().map((header) => header.trim());
  if (!headers.length) return [];
  return parsed.map((values) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] == null ? '' : values[index].trim();
    });
    return row;
  }).filter((row) => Object.values(row).some((value) => value !== ''));
}

function parseDelimitedLine(line, delimiter) {
  if (delimiter === '\t') return line.split('\t');
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

function looksLikeDelimited(text) {
  const first = String(text || '').split(/\r?\n/).find((line) => line.trim()) || '';
  return first.includes(',') || first.includes('\t');
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

function readFileIntoTextarea(fileInput, textarea) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    textarea.value = reader.result || '';
    updateAll();
  };
  reader.readAsText(file);
}

function downloadTemplates() {
  const content = [
    '# qPCR import templates',
    '',
    'Samples can be pasted as a comma-separated list:',
    'CellLine_control, CellLine_treatment',
    '',
    'Assay CSV:',
    'gene,assay_type,efficiency',
    'ReferenceGene,reference,2',
    'TargetGene,target,2',
    '',
    'Nucleic acid measurement CSV:',
    'sample_name,concentration_ng_per_uL,A260_A280,A260_A230',
    'CellLine_control,500,1.95,2.10',
    '',
    'Tidy Cq CSV:',
    'sample_name,assay/gene,Cq',
    'CellLine_control,ReferenceGene,19.8',
    'CellLine_control,TargetGene,25.2',
  ].join('\n');
  labtoolsDownloadText('qpcr-import-templates.txt', content, 'text/plain;charset=utf-8');
}

function groupBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function summarizeMeans(rows, keyFn, valueFn) {
  const groups = groupBy(rows, keyFn);
  return Object.keys(groups).reduce((acc, key) => {
    const values = groups[key].map(valueFn).filter(Number.isFinite);
    acc[key] = {
      mean: mean(values),
      n: values.length,
    };
    return acc;
  }, {});
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return NaN;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function sd(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length < 2) return NaN;
  const avg = mean(valid);
  const variance = valid.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (valid.length - 1);
  return Math.sqrt(variance);
}

function firstValue(row, keys) {
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return String(row[key]);
  }
  return '';
}

function hasAnyKey(row, keys) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(row, key));
}

function normalizeNames(names) {
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
}

function toNumber(value) {
  if (value == null || value === '') return NaN;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function positiveNumber(value, fallback) {
  const parsed = toNumber(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function nonNegativeNumber(value) {
  const parsed = toNumber(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function nonNegativeInt(value) {
  const parsed = toNumber(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function clampInt(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function fmtCell(value) {
  return Number.isFinite(value) ? round3(value) : '';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
