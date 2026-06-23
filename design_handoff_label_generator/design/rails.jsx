/* global React, Icons */
const { useRef } = React;

// ─── Left rail: data source + sheet format ─────────────────────
function LeftRail({
  csvText, setCsvText, fileName, setFileName,
  headers, rows,
  mode, setMode, presetId, setPresetId, presets, preset,
  borderInPdf, setBorderInPdf,
}) {
  const fileInputRef = useRef(null);
  const presetsForMode = presets.filter(p => p.mode === mode);

  const onFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(String(ev.target.result || ''));
    reader.readAsText(file);
  };

  return (
    <aside className="lg-rail lg-rail-left">
      {/* DATA SOURCE */}
      <section className="lg-rail-section">
        <div className="lg-section-head">
          <div className="lg-section-title">Data source</div>
          <div className="lg-section-aux">{rows.length} rows</div>
        </div>

        {rows.length > 0 ? (
          <div className="lg-csv-loaded">
            <div className="lg-csv-loaded-head">
              <div className="lg-csv-loaded-icon">{Icons.File}</div>
              <div className="lg-csv-loaded-info">
                <div className="lg-csv-loaded-name">{fileName || 'pasted-data.csv'}</div>
                <div className="lg-csv-loaded-meta">{rows.length} rows · {headers.length} columns</div>
              </div>
            </div>
            <div className="lg-csv-cols">
              {headers.slice(0, 8).map(h =>
                <span key={h} className="lg-csv-col">{h}</span>
              )}
              {headers.length > 8 &&
                <span className="lg-csv-col more">+{headers.length - 8}</span>}
            </div>
            <div className="lg-csv-actions">
              <button className="lg-link-btn"
                      onClick={() => fileInputRef.current?.click()}>
                {Icons.Upload} Replace
              </button>
              <button className="lg-link-btn danger"
                      onClick={() => { setCsvText(''); setFileName(''); }}>
                {Icons.Trash} Clear
              </button>
            </div>
          </div>
        ) : (
          <div className="lg-csv-empty" onClick={() => fileInputRef.current?.click()}>
            <div className="ico">{Icons.Upload}</div>
            <h4>Upload CSV</h4>
            <p>Drag a file here, or click to pick</p>
            <div className="alt">or paste below ↓</div>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept=".csv,.txt,text/csv"
               hidden onChange={onFile} />

        <details className="lg-paste-details" open={!rows.length}>
          <summary>{rows.length ? 'Edit CSV text' : 'Paste CSV directly'}</summary>
          <textarea
            className="lg-input mono lg-paste-area"
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setFileName(''); }}
            placeholder="Sample ID,Name,Date…"
            rows={5}
          />
        </details>
      </section>

      {/* OUTPUT FORMAT */}
      <section className="lg-rail-section">
        <div className="lg-section-head">
          <div className="lg-section-title">Output format</div>
        </div>

        <div className="lg-segmented">
          <button className={mode === 'laser-sheet' ? 'is-on' : ''}
                  onClick={() => setMode('laser-sheet')}>
            {Icons.Sheet} Laser sheet
          </button>
          <button className={mode === 'thermal' ? 'is-on' : ''}
                  onClick={() => setMode('thermal')}>
            {Icons.Thermal} Thermal
          </button>
        </div>

        <label className="lg-field-label" style={{ marginTop: 14 }}>Preset</label>
        <select className="lg-select" value={presetId}
                onChange={(e) => setPresetId(e.target.value)}>
          {presetsForMode.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}{p.sku ? ` · ${p.sku}` : ''}
            </option>
          ))}
        </select>

        <dl className="lg-kv">
          <dt>Label size</dt><dd>{preset.labelWidth}″ × {preset.labelHeight}″</dd>
          {mode === 'laser-sheet' && (
            <>
              <dt>Page</dt><dd>{preset.pageWidth}″ × {preset.pageHeight}″</dd>
              <dt>Grid</dt><dd>{preset.columns} × {preset.rows} = {preset.columns * preset.rows}/sheet</dd>
              <dt>Pitch</dt><dd>{preset.horizontalPitch}″ × {preset.verticalPitch}″</dd>
              <dt>Margins</dt><dd>{preset.topMargin}″ top · {preset.leftMargin}″ left</dd>
            </>
          )}
          {preset.vendor && <><dt>Vendor</dt><dd>{preset.vendor}</dd></>}
        </dl>

        <label className="lg-checkbox" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={borderInPdf}
                 onChange={(e) => setBorderInPdf(e.target.checked)} />
          Show label border in PDF
        </label>
      </section>
    </aside>
  );
}

// ─── Right rail: fields + properties + sheet placement ─────────
function RightRail({
  fields, selected, setSelectedId, updateField, removeField, addField,
  headers, mode, preset,
  plan, startCell, togglePlanCell, setStart,
  rowsCount, usableCells, sheetsNeeded, showSheet,
}) {
  return (
    <aside className="lg-rail lg-rail-right">

      {/* LABEL CONTENT */}
      <section className="lg-rail-section">
        <div className="lg-section-head">
          <div className="lg-section-title">Label content</div>
          <div className="lg-section-aux">{fields.length} fields</div>
        </div>

        <div className="lg-add-grid">
          <button className="lg-add-card" onClick={() => addField('datamatrix')}>
            <div className="lg-add-icon dm">{Icons.QR}</div>
            <div className="lg-add-title">DataMatrix</div>
            <div className="lg-add-sub">scannable code</div>
          </button>
          <button className="lg-add-card" onClick={() => addField('csv')}>
            <div className="lg-add-icon csv">{Icons.Database}</div>
            <div className="lg-add-title">CSV field</div>
            <div className="lg-add-sub">from column</div>
          </button>
          <button className="lg-add-card" onClick={() => addField('static')}>
            <div className="lg-add-icon stat">{Icons.Type}</div>
            <div className="lg-add-title">Static</div>
            <div className="lg-add-sub">fixed text</div>
          </button>
        </div>

        <div className="lg-field-list">
          {fields.length === 0 && (
            <div className="lg-field-empty">No fields yet — add one above.</div>
          )}
          {fields.map(f => (
            <FieldCard
              key={f.id}
              field={f}
              selected={f.id === (selected && selected.id)}
              onSelect={() => setSelectedId(f.id)}
              onRemove={() => removeField(f.id)}
            />
          ))}
        </div>

        {selected && (
          <FieldProperties
            field={selected}
            update={(p) => updateField(selected.id, p)}
            remove={() => removeField(selected.id)}
            headers={headers}
          />
        )}
      </section>

      {/* SHEET PLACEMENT */}
      {showSheet && mode === 'laser-sheet' && (
        <section className="lg-rail-section">
          <div className="lg-section-head">
            <div className="lg-section-title">Sheet placement</div>
            <div className="lg-section-aux">{preset.columns}×{preset.rows}</div>
          </div>

          <SheetMini
            preset={preset}
            plan={plan}
            startCell={startCell}
            onCellClick={togglePlanCell}
            onCellShiftClick={setStart}
          />

          <div className="lg-sheet-stats">
            <span className="lg-sheet-stat">
              <span className="swatch start" />
              start · cell {startCell + 1}
            </span>
            <span className="lg-sheet-stat">
              <span className="swatch use" />
              {usableCells} usable
            </span>
            <span className="lg-sheet-stat">
              <span className="swatch skip" />
              {plan.filter(s => s === 'skip').length} skipped
            </span>
          </div>

          <p className="lg-sheet-hint">
            <b>Click</b> to skip a cell · <b>Shift-click</b> sets where printing starts
          </p>
        </section>
      )}

    </aside>
  );
}

// ─── Field card (in the right rail list) ───────────────────────
function FieldCard({ field, selected, onSelect, onRemove }) {
  const chipClass =
    field.type === 'datamatrix' ? 'dm' :
    field.type === 'csv'        ? 'csv' : 'stat';
  const iconNode =
    field.type === 'datamatrix' ? Icons.QR :
    field.type === 'csv'        ? Icons.Database : Icons.Type;
  const sub =
    field.type === 'datamatrix' ? `encodes ${field.source || '—'}` :
    field.type === 'csv'        ? `csv · ${field.source || '—'}` :
                                  `static · "${field.staticText || ''}"`;

  return (
    <div className={`lg-field-card ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className={`lg-field-chip ${chipClass}`}>{iconNode}</div>
      <div className="lg-field-meta-wrap">
        <div className="lg-field-name">{field.label}</div>
        <div className="lg-field-sub">{sub}</div>
      </div>
      <div className="lg-field-card-r">
        <span className="lg-field-size">{field.w}×{field.h}</span>
        <button className="lg-field-x"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                title="Remove">
          {Icons.X}
        </button>
      </div>
    </div>
  );
}

// ─── Field properties panel ────────────────────────────────────
function FieldProperties({ field, update, headers, remove }) {
  return (
    <div className="lg-props">
      <div className="lg-props-head">
        <div className="lg-props-title">Properties</div>
        <button className="lg-link-btn danger" onClick={remove}>
          {Icons.Trash} Remove
        </button>
      </div>
      <div className="lg-props-grid">
        <label className="lg-field-label">Field name</label>
        <input className="lg-input" type="text" value={field.label}
               onChange={(e) => update({ label: e.target.value })} />

        {field.type === 'csv' && (
          <>
            <label className="lg-field-label">CSV column</label>
            <select className="lg-select" value={field.source || ''}
                    onChange={(e) => update({ source: e.target.value })}>
              {headers.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </>
        )}

        {field.type === 'datamatrix' && (
          <>
            <label className="lg-field-label">Encodes column</label>
            <select className="lg-select" value={field.source || ''}
                    onChange={(e) => update({ source: e.target.value })}>
              {headers.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </>
        )}

        {field.type === 'static' && (
          <>
            <label className="lg-field-label">Static text</label>
            <input className="lg-input" type="text" value={field.staticText || ''}
                   onChange={(e) => update({ staticText: e.target.value })} />
          </>
        )}

        {field.type !== 'datamatrix' && (
          <div className="lg-props-row-2">
            <div>
              <label className="lg-field-label">Alignment</label>
              <select className="lg-select" value={field.align || 'left'}
                      onChange={(e) => update({ align: e.target.value })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div>
              <label className="lg-field-label">Font scale</label>
              <input className="lg-input" type="number" step="0.1" min="0.6" max="2"
                     value={field.scale || 1}
                     onChange={(e) => update({ scale: parseFloat(e.target.value) })} />
            </div>
          </div>
        )}

        <div className="lg-props-geom">
          <span><b>{field.col},{field.row}</b> position</span>
          <span>·</span>
          <span><b>{field.w}×{field.h}</b> size</span>
        </div>
      </div>
    </div>
  );
}

// ─── Sheet mini thumbnail (laser placement preview) ────────────
function SheetMini({ preset, plan, startCell, onCellClick, onCellShiftClick }) {
  const cells = [];
  for (let i = 0; i < preset.columns * preset.rows; i++) {
    const past = i < startCell;
    const skipped = plan[i] === 'skip';
    const isStart = i === startCell;
    const cls = isStart ? 'start' : past ? 'past' : skipped ? 'skip' : 'use';
    cells.push(
      <div
        key={i}
        className={`lg-sheet-cell ${cls}`}
        onClick={(e) => {
          if (e.shiftKey) onCellShiftClick(i);
          else if (!past) onCellClick(i);
        }}
        title={`Cell ${i + 1} · ${isStart ? 'start' : past ? 'past' : skipped ? 'skipped' : 'will print'}`}
      />
    );
  }
  // Sheet aspect — actual page dimensions.
  const aspect = `${preset.pageWidth} / ${preset.pageHeight}`;
  return (
    <div className="lg-sheet" style={{ aspectRatio: aspect }}>
      <div
        className="lg-sheet-grid"
        style={{
          gridTemplateColumns: `repeat(${preset.columns}, 1fr)`,
          gridTemplateRows:    `repeat(${preset.rows}, 1fr)`,
        }}
      >
        {cells}
      </div>
    </div>
  );
}

// Export to window
Object.assign(window, { LeftRail, RightRail, SheetMini, FieldCard, FieldProperties });
