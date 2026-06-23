/* global React, Icons */
const { useRef, useEffect, useCallback } = React;

// Interactive label canvas. Renders the label surface, the grid overlay,
// and draggable+resizable field rectangles. Movement snaps to grid cells.
function LabelCanvas({ preset, grid, fields, selectedId, setSelectedId, updateField, gridMode }) {
  const stageRef = useRef(null);

  // Drag/resize bookkeeping
  const dragRef = useRef(null);

  const onPointerDown = (e, field, kind) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(field.id);

    const stage = stageRef.current;
    const rect = stage.getBoundingClientRect();
    const cellW = rect.width / grid.cols;
    const cellH = rect.height / grid.rows;

    dragRef.current = {
      id: field.id, kind,
      startCol: field.col, startRow: field.row,
      startW: field.w, startH: field.h,
      sx: e.clientX, sy: e.clientY,
      cellW, cellH,
    };

    const move = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (ev.clientX - d.sx) / d.cellW;
      const dy = (ev.clientY - d.sy) / d.cellH;
      if (d.kind === 'move') {
        const col = Math.round(d.startCol + dx);
        const row = Math.round(d.startRow + dy);
        updateField(d.id, {
          col: Math.max(0, Math.min(grid.cols - field.w, col)),
          row: Math.max(0, Math.min(grid.rows - field.h, row)),
        });
      } else {
        const w = Math.round(d.startW + dx);
        const h = Math.round(d.startH + dy);
        updateField(d.id, {
          w: Math.max(1, Math.min(grid.cols - field.col, w)),
          h: Math.max(1, Math.min(grid.rows - field.row, h)),
        });
      }
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Keyboard nudge for selected field
  useEffect(() => {
    const onKey = (e) => {
      if (!selectedId) return;
      const f = fields.find(x => x.id === selectedId);
      if (!f) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft')  dx = -1;
      else if (e.key === 'ArrowRight') dx = 1;
      else if (e.key === 'ArrowUp')    dy = -1;
      else if (e.key === 'ArrowDown')  dy = 1;
      else return;
      e.preventDefault();
      updateField(f.id, {
        col: Math.max(0, Math.min(grid.cols - f.w, f.col + dx)),
        row: Math.max(0, Math.min(grid.rows - f.h, f.row + dy)),
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fields, selectedId, grid, updateField]);

  return (
    <div className="lg-stage">
      <div className="lg-stage-meta">
        <span className="pill">{preset.labelWidth}″</span>
        <span>×</span>
        <span className="pill">{preset.labelHeight}″</span>
      </div>

      <div
        ref={stageRef}
        className="lg-stage-canvas"
        onPointerDown={() => setSelectedId('')}
      >
        <div className={`lg-stage-grid ${gridMode}`} />

        {fields.map(f => (
          <FieldBlock
            key={f.id}
            field={f}
            grid={grid}
            selected={f.id === selectedId}
            onPointerDownMove={(e) => onPointerDown(e, f, 'move')}
            onPointerDownResize={(e) => onPointerDown(e, f, 'resize')}
          />
        ))}
      </div>
    </div>
  );
}

// A single field rectangle.
function FieldBlock({ field, grid, selected, onPointerDownMove, onPointerDownResize }) {
  const style = {
    left:   `${(field.col / grid.cols) * 100}%`,
    top:    `${(field.row / grid.rows) * 100}%`,
    width:  `${(field.w   / grid.cols) * 100}%`,
    height: `${(field.h   / grid.rows) * 100}%`,
  };
  const className = `lg-field lg-field--${field.type}${selected ? ' selected' : ''}`;

  return (
    <div className={className} style={style} onPointerDown={onPointerDownMove}>
      <FieldContent field={field} />
      <div className="lg-field-meta">{field.w}×{field.h}</div>
      <div className="lg-field-handle" onPointerDown={onPointerDownResize} />
    </div>
  );
}

// What's shown inside a field.
function FieldContent({ field }) {
  if (field.type === 'datamatrix') {
    // 12×12 cell pattern that reads as a DM block (decorative, not scannable).
    const cells = [];
    // Deterministic pseudo-noise from field id
    let seed = (field.id || 'dm').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    for (let i = 0; i < 144; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const on = (seed / 233280) > 0.45;
      cells.push(<span key={i} style={{ opacity: on ? 1 : 0 }} />);
    }
    return (
      <div className="lg-field-inner dm-inner">
        <div className="lg-dm-preview">{cells}</div>
      </div>
    );
  }

  const text = field.type === 'static'
    ? (field.staticText || field.label)
    : field.label;

  const iconNode =
    field.type === 'csv'    ? Icons.Database :
    field.type === 'static' ? Icons.Type     : null;

  return (
    <div className="lg-field-inner">
      <div className="lg-field-content"
           style={{ justifyContent: field.align === 'center' ? 'center' :
                                    field.align === 'right'  ? 'flex-end' : 'flex-start' }}>
        {iconNode && <span className="lg-field-icon">{iconNode}</span>}
        <span className="label-text">{text}</span>
      </div>
    </div>
  );
}

// ─── Samples strip ──────────────────────────────────────────────
function SamplesStrip({ fields, rows, headers, grid, labelAspect, startIndex, borderInPdf }) {
  if (!rows.length) return null;
  const samples = rows.slice(0, 6);
  return (
    <div className="lg-samples">
      <div className="lg-samples-head">
        <div className="lg-samples-title">Sample preview <span className="lg-samples-sub">first {samples.length} of {rows.length}</span></div>
        <div className="lg-meta-pill">
          <span className="ico">{Icons.Eye}</span>
          starting at sheet cell {startIndex + 1}
        </div>
      </div>
      <div className="lg-samples-row">
        {samples.map((row, i) => (
          <div key={i} className={`lg-sample ${borderInPdf ? '' : 'no-border'}`}
               style={{ aspectRatio: labelAspect }}>
            {fields.map(f => {
              const style = {
                left:   `${(f.col / grid.cols) * 100}%`,
                top:    `${(f.row / grid.rows) * 100}%`,
                width:  `${(f.w   / grid.cols) * 100}%`,
                height: `${(f.h   / grid.rows) * 100}%`,
              };
              if (f.type === 'datamatrix') {
                return <div key={f.id} className="lg-sample-zone dm" style={style} />;
              }
              const txt = f.type === 'static'
                ? (f.staticText || '')
                : (row[f.source] || row[headers[0]] || '');
              return (
                <div key={f.id} className="lg-sample-zone text" style={{
                  ...style,
                  justifyContent: f.align === 'center' ? 'center'
                                : f.align === 'right'  ? 'flex-end' : 'flex-start',
                  fontFamily: f.type === 'csv' ? 'var(--font-mono)' : 'inherit',
                }}>
                  <span className="lg-sample-text">{txt}</span>
                </div>
              );
            })}
            <div className="lg-sample-counter">{i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Export to window
Object.assign(window, { LabelCanvas, SamplesStrip });
