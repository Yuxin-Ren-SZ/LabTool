/* global React, ReactDOM, Icons, TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakToggle, TweakSelect, LabelCanvas, LeftRail, RightRail, SamplesStrip, SheetMini */
const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ─── Sample CSV (the standard test set) ────────────────────────
const SAMPLE_CSV = `Sample ID,Name,Date,Group,Passage,Cell Line,Concentration,Volume uL,Storage,Operator
LG-0001,Wild Type A,2026-05-09,Control,P03,HEK293,1.2e6,250,"Box A, Slot 01",YX
LG-0002,Wild Type B,2026-05-09,Control,P03,HEK293,1.1e6,250,"Box A, Slot 02",YX
LG-0003,Mutant Alpha,2026-05-09,Treatment A,P04,HEK293,9.8e5,200,"Box A, Slot 03",YX
LG-0004,Mutant Beta,2026-05-09,Treatment A,P04,HEK293,1.0e6,200,"Box A, Slot 04",YX
LG-0005,Mutant Gamma,2026-05-09,Treatment A,P04,HEK293,1.3e6,200,"Box A, Slot 05",YX
LG-0006,Clone 7,2026-05-10,Treatment B,P02,A549,8.5e5,150,"Box A, Slot 06",AL
LG-0007,Clone 8,2026-05-10,Treatment B,P02,A549,8.7e5,150,"Box A, Slot 07",AL
LG-0008,Clone 9,2026-05-10,Treatment B,P02,A549,8.9e5,150,"Box A, Slot 08",AL`;

function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const split = (l) => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (q && l[i+1] === '"') { cur += '"'; i++; } else { q = !q; } }
      else if (c === ',' && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map(l => {
    const cells = split(l);
    const o = {};
    headers.forEach((h, i) => { o[h] = cells[i] || ''; });
    return o;
  });
  return { headers, rows };
}

// ─── Geometry: pick a sane grid from label aspect ──────────────
function gridForLabel(wIn, hIn) {
  const r = wIn / hIn;
  // Aim for cells roughly square-ish; clamp to readable values.
  let cols, rows;
  if (r >= 4)        { cols = 12; rows = 3; }
  else if (r >= 2.4) { cols = 8;  rows = 3; }
  else if (r >= 1.6) { cols = 6;  rows = 4; }
  else if (r >= 1)   { cols = 5;  rows = 4; }
  else               { cols = 4;  rows = 5; }
  return { cols, rows };
}

// ─── Field templates (start sizes that fit cleanly) ────────────
const FIELD_DEFAULTS = {
  datamatrix: (g) => ({ type: 'datamatrix', label: 'DataMatrix', source: 'Sample ID', col: 0, row: 0, w: Math.min(3, g.cols), h: Math.min(3, g.rows) }),
  csv:        (g) => ({ type: 'csv',        label: 'Sample ID',  source: 'Sample ID', col: Math.min(3, g.cols-3), row: 0, w: Math.max(3, g.cols - 3), h: 1, align: 'left', scale: 1 }),
  static:     (g) => ({ type: 'static',     label: 'Static Text', staticText: 'LabTools',  col: Math.min(3, g.cols-3), row: Math.max(1, g.rows-2), w: Math.max(3, g.cols - 3), h: 1, align: 'left', scale: 0.9 }),
};

// ─── Main App ──────────────────────────────────────────────────
function App() {
  const [tweak, setTweak] = useTweaks(window.TWEAK_DEFAULTS);

  // Data
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [fileName, setFileName] = useState('test-label-data.csv');
  const { headers, rows } = useMemo(() => parseCsv(csvText), [csvText]);

  // Format
  const presets = window.LABEL_GENERATOR_PRESET_CONFIG.presets;
  const [mode, setMode] = useState('laser-sheet'); // or 'thermal'
  const [presetId, setPresetId] = useState('labtools-9125-0170');
  const preset = useMemo(() =>
    presets.find(p => p.id === presetId) || presets[0], [presetId, presets]);
  const [borderInPdf, setBorderInPdf] = useState(true);

  // Reset preset when mode flips
  useEffect(() => {
    const valid = presets.filter(p => p.mode === mode);
    if (!valid.some(p => p.id === presetId)) setPresetId(valid[0].id);
  }, [mode]); // eslint-disable-line

  // Grid + fields
  const grid = useMemo(() => gridForLabel(preset.labelWidth, preset.labelHeight), [preset]);
  const [fields, setFields] = useState(() => [
    { id: 'f1', ...FIELD_DEFAULTS.datamatrix(gridForLabel(1.28, 0.5)) },
    { id: 'f2', ...FIELD_DEFAULTS.csv(gridForLabel(1.28, 0.5)) },
    { id: 'f3', ...FIELD_DEFAULTS.static(gridForLabel(1.28, 0.5)) },
  ]);
  // When grid changes from a new preset, scale field rects proportionally.
  const lastGridRef = useRef(grid);
  useEffect(() => {
    const prev = lastGridRef.current;
    if (prev.cols === grid.cols && prev.rows === grid.rows) return;
    setFields(fs => fs.map(f => ({
      ...f,
      col: Math.round(f.col * grid.cols / prev.cols),
      row: Math.round(f.row * grid.rows / prev.rows),
      w:   Math.max(1, Math.round(f.w * grid.cols / prev.cols)),
      h:   Math.max(1, Math.round(f.h * grid.rows / prev.rows)),
    })));
    lastGridRef.current = grid;
  }, [grid]);

  const [selectedId, setSelectedId] = useState('f1');
  const selected = fields.find(f => f.id === selectedId) || null;

  const updateField = useCallback((id, patch) => {
    setFields(fs => fs.map(f => f.id === id ? { ...f, ...patch } : f));
  }, []);

  const addField = (type) => {
    const id = 'f' + (fields.length + 1) + '-' + Math.random().toString(36).slice(2, 6);
    const f = { id, ...FIELD_DEFAULTS[type](grid) };
    if (type === 'csv' && headers[0]) { f.source = headers[0]; f.label = headers[0]; }
    setFields([...fields, f]);
    setSelectedId(id);
  };

  const removeField = (id) => {
    setFields(fs => fs.filter(f => f.id !== id));
    if (selectedId === id) setSelectedId('');
  };

  // Sheet placement plan (laser-sheet mode)
  const totalCells = preset.columns * preset.rows;
  const [plan, setPlan] = useState(() => Array(8 * 17).fill('use'));
  useEffect(() => {
    setPlan(Array(totalCells).fill('use'));
  }, [totalCells]);
  const [startCell, setStartCell] = useState(0);

  const togglePlanCell = (i) => {
    setPlan(p => {
      const np = [...p];
      np[i] = np[i] === 'skip' ? 'use' : 'skip';
      return np;
    });
  };
  const setStart = (i) => setStartCell(i);

  // Sheet capacity calculations
  const usableCells = plan.slice(startCell).filter(s => s !== 'skip').length;
  const sheetsNeeded = mode === 'thermal' ? rows.length :
    Math.max(1, Math.ceil(Math.max(0, rows.length - usableCells) / Math.max(1, totalCells)) + 1);

  // ─── UI ──────────────────────────────────────────────────────
  const labelAspect = `${preset.labelWidth} / ${preset.labelHeight}`;
  const stageStyle = {
    '--label-aspect': labelAspect,
    '--grid-cols': grid.cols,
    '--grid-rows': grid.rows,
  };

  return (
    <div className={`app accent-${tweak.accent} density-${tweak.density} grid-${tweak.grid} fstyle-${tweak.labelStyle}`}>
      <TopNav fileName={fileName} rows={rows.length} preset={preset} mode={mode} />

      <div className="lg-workspace">
        <LeftRail
          csvText={csvText} setCsvText={setCsvText}
          fileName={fileName} setFileName={setFileName}
          headers={headers} rows={rows}
          mode={mode} setMode={setMode}
          presetId={presetId} setPresetId={setPresetId}
          presets={presets} preset={preset}
          borderInPdf={borderInPdf} setBorderInPdf={setBorderInPdf}
        />

        <main className="lg-center" style={stageStyle}>
          <CenterTopBar preset={preset} grid={grid} mode={mode} totalRows={rows.length} />

          <div className="lg-stage-wrap">
            <LabelCanvas
              preset={preset}
              grid={grid}
              fields={fields}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              updateField={updateField}
              gridMode={tweak.grid}
            />
          </div>

          {tweak.showSamples && (
            <SamplesStrip
              fields={fields}
              rows={rows}
              headers={headers}
              grid={grid}
              labelAspect={labelAspect}
              startIndex={startCell}
              borderInPdf={borderInPdf}
            />
          )}
        </main>

        <RightRail
          fields={fields}
          selected={selected}
          setSelectedId={setSelectedId}
          updateField={updateField}
          removeField={removeField}
          addField={addField}
          headers={headers}
          mode={mode}
          preset={preset}
          plan={plan}
          startCell={startCell}
          togglePlanCell={togglePlanCell}
          setStart={setStart}
          rowsCount={rows.length}
          usableCells={usableCells}
          sheetsNeeded={sheetsNeeded}
          showSheet={tweak.showSheet}
        />
      </div>

      <BottomActions
        rows={rows.length}
        usableCells={usableCells}
        sheetsNeeded={sheetsNeeded}
        mode={mode}
        fields={fields}
      />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Canvas" />
        <TweakRadio label="Grid"
          value={tweak.grid}
          options={['lines', 'dots', 'none']}
          onChange={(v) => setTweak('grid', v)} />
        <TweakRadio label="Field style"
          value={tweak.labelStyle}
          options={['color', 'minimal']}
          onChange={(v) => setTweak('labelStyle', v)} />

        <TweakSection label="Layout" />
        <TweakRadio label="Density"
          value={tweak.density}
          options={['compact', 'regular']}
          onChange={(v) => setTweak('density', v)} />
        <TweakToggle label="Sample preview"
          value={tweak.showSamples}
          onChange={(v) => setTweak('showSamples', v)} />
        <TweakToggle label="Sheet placement"
          value={tweak.showSheet}
          onChange={(v) => setTweak('showSheet', v)} />

        <TweakSection label="Theme" />
        <TweakRadio label="Accent"
          value={tweak.accent}
          options={['blue', 'mono', 'forest']}
          onChange={(v) => setTweak('accent', v)} />
      </TweaksPanel>
    </div>
  );
}

// ─── Top nav ────────────────────────────────────────────────────
function TopNav({ rows, preset, mode }) {
  return (
    <nav className="lg-nav">
      <a className="lg-nav-brand" href="#">
        <span className="lg-brand-mark">🔬</span>
        LabTools
      </a>
      <span className="lg-nav-sep">/</span>
      <span className="lg-nav-page">Label Generator</span>
      <span className="lg-nav-spacer" />
      <span className="lg-nav-pill">
        <span className="lg-pill-icon">{Icons.Database}</span>
        <b>{rows}</b> rows
      </span>
      <span className="lg-nav-pill">
        <span className="lg-pill-icon">{mode === 'thermal' ? Icons.Thermal : Icons.Sheet}</span>
        {preset.labelWidth}″ × {preset.labelHeight}″
      </span>
      <button className="lg-nav-action">
        {Icons.Save} <span>Save template</span>
      </button>
    </nav>
  );
}

// ─── Center top bar — title, dimensions, grid ──────────────────
function CenterTopBar({ preset, grid, mode, totalRows }) {
  return (
    <div className="lg-canvas-header">
      <div className="lg-canvas-head-l">
        <div className="lg-canvas-title">
          <span className="lg-canvas-emoji">🏷</span>
          {preset.name}
        </div>
        <span className="lg-canvas-dim">{preset.labelWidth}″ × {preset.labelHeight}″</span>
        <span className="lg-canvas-dim subtle">grid {grid.cols}×{grid.rows}</span>
      </div>
      <div className="lg-canvas-hint">
        Drag fields on the label · resize from the corner handle · arrow keys to nudge
      </div>
    </div>
  );
}

// ─── Bottom action bar (sticky) ────────────────────────────────
function BottomActions({ rows, usableCells, sheetsNeeded, mode, fields }) {
  const ready = rows > 0 && fields.length > 0;
  return (
    <div className="lg-bottom-bar">
      <div className="lg-bottom-info">
        <div className="lg-bottom-stat">
          <div className="lg-bottom-stat-num">{rows}</div>
          <div className="lg-bottom-stat-lbl">labels to print</div>
        </div>
        <div className="lg-bottom-divider" />
        <div className="lg-bottom-stat">
          <div className="lg-bottom-stat-num">{sheetsNeeded}</div>
          <div className="lg-bottom-stat-lbl">{mode === 'thermal' ? 'thermal pages' : 'laser sheets'}</div>
        </div>
        {mode === 'laser-sheet' && (
          <>
            <div className="lg-bottom-divider" />
            <div className="lg-bottom-stat">
              <div className="lg-bottom-stat-num">{usableCells}</div>
              <div className="lg-bottom-stat-lbl">usable cells / sheet 1</div>
            </div>
          </>
        )}
      </div>
      <div className="lg-bottom-actions">
        <button className="lg-btn lg-btn-ghost">{Icons.Eye} Preview PDF</button>
        <button className="lg-btn lg-btn-primary" disabled={!ready}>
          {Icons.Download} Generate PDF
        </button>
      </div>
    </div>
  );
}

// Mount
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
