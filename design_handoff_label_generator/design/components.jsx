/* global React */
const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ─── Icons ──────────────────────────────────────────────────────
const Icon = ({ d, size = 14, stroke = 1.6, fill = 'none' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

const Icons = {
  Microscope:  <Icon d={<><path d="M6 18h12"/><path d="M9 18V8a3 3 0 0 1 6 0v10"/><path d="M12 5V3"/><path d="M9 14h6"/></>} />,
  Tag:         <Icon d={<><path d="M20 12 12 4H4v8l8 8z"/><circle cx="8.5" cy="8.5" r="1"/></>} />,
  Printer:     <Icon d={<><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></>} />,
  Sheet:       <Icon d={<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></>} />,
  Thermal:     <Icon d={<><rect x="5" y="6" width="14" height="12" rx="2"/><path d="M3 10v4M21 10v4M9 12h6"/></>} />,
  Upload:      <Icon d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></>} />,
  File:        <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>} />,
  Check:       <Icon d={<polyline points="20 6 9 17 4 12"/>} />,
  X:           <Icon d={<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>} />,
  Plus:        <Icon d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>} />,
  Grid:        <Icon d={<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>} />,
  Dots:        <Icon d={<><circle cx="5" cy="5" r="1.2"/><circle cx="12" cy="5" r="1.2"/><circle cx="19" cy="5" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/><circle cx="5" cy="19" r="1.2"/><circle cx="12" cy="19" r="1.2"/><circle cx="19" cy="19" r="1.2"/></>} fill="currentColor" stroke="none" />,
  Eye:         <Icon d={<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>} />,
  EyeOff:      <Icon d={<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.5 0-10-7-10-7a17.7 17.7 0 0 1 4.06-4.93"/><path d="M9.9 4.24A10 10 0 0 1 12 4c6.5 0 10 7 10 7a16.3 16.3 0 0 1-2.05 2.94"/><line x1="2" y1="2" x2="22" y2="22"/></>} />,
  QR:          <Icon d={<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14" y2="14.01"/><line x1="20" y1="14" x2="20" y2="14.01"/><line x1="14" y1="20" x2="14" y2="20.01"/><line x1="20" y1="20" x2="20" y2="20.01"/><line x1="17" y1="17" x2="17" y2="17.01"/></>} />,
  Type:        <Icon d={<><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></>} />,
  Database:    <Icon d={<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></>} />,
  Trash:       <Icon d={<><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></>} />,
  Save:        <Icon d={<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>} />,
  Folder:      <Icon d={<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>} />,
  RotateCw:    <Icon d={<><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>} />,
  Download:    <Icon d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>} />,
  ChevronDown: <Icon d={<polyline points="6 9 12 15 18 9"/>} />,
  Sparkles:    <Icon d={<><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z"/></>} />,
  AlertCircle: <Icon d={<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>} />,
};

// ─── Sample preview (renders 4-5 actual rows) ──────────────────
function SamplePreview({ fields, rows, headers, totalCells, dmRatio }) {
  const sampleCount = Math.min(rows.length || 0, 5);
  if (sampleCount === 0) return null;
  const samples = rows.slice(0, sampleCount);
  return (
    <div className="lg-samples">
      <div className="lg-samples-head">
        <div className="lg-samples-title">Sample preview — first {sampleCount} rows</div>
        <div className="lg-meta-pill">
          {Icons.Database} {rows.length} rows × {totalCells} cells available
        </div>
      </div>
      <div className="lg-samples-row">
        {samples.map((row, i) => (
          <div key={i} className="lg-sample">
            {fields.map(f => {
              const style = {
                left: `${(f.col / dmRatio.cols) * 100}%`,
                top: `${(f.row / dmRatio.rows) * 100}%`,
                width: `${(f.w / dmRatio.cols) * 100}%`,
                height: `${(f.h / dmRatio.rows) * 100}%`,
              };
              if (f.type === 'datamatrix') {
                return <div key={f.id} className="lg-sample-zone dm" style={style}></div>;
              }
              const text = f.type === 'static' ? (f.staticText || f.label) : (row[f.source] || row[headers[0]]);
              return (
                <div key={f.id} className="lg-sample-zone" style={{ ...style, fontSize: '9px', textAlign: 'left', justifyContent: 'flex-start', alignItems: 'center' }}>
                  <span style={{ fontFamily: f.type === 'csv' ? 'var(--font-mono)' : 'inherit', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{text}</span>
                </div>
              );
            })}
            <div className="lg-sample-counter">{i + 1}/{rows.length}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sheet placement thumbnail ─────────────────────────────────
function SheetPreview({ preset, plan, onCellClick }) {
  const cells = [];
  for (let r = 0; r < preset.rows; r++) {
    for (let c = 0; c < preset.columns; c++) {
      const idx = r * preset.columns + c;
      const state = plan[idx] || 'use';
      cells.push(
        <div key={idx}
          className={`lg-sheet-cell ${state}`}
          onClick={() => onCellClick(idx)}
          title={`Cell ${idx + 1}`}>
        </div>
      );
    }
  }
  const useCount = plan.filter(s => s === 'use' || s === 'start').length;
  return (
    <div className="lg-sheet">
      <div className="lg-sheet-head">
        <div className="lg-section-title" style={{ color: 'var(--text-secondary)' }}>Sheet placement</div>
        <div className="lg-sheet-stats">
          <span className="stat"><span className="swatch start"></span>start</span>
          <span className="stat"><span className="swatch use"></span>{useCount}</span>
          <span className="stat"><span className="swatch skip"></span>{plan.filter(s => s === 'skip').length}</span>
        </div>
      </div>
      <div className="lg-sheet-grid"
        style={{ gridTemplateColumns: `repeat(${preset.columns}, 1fr)`, gridTemplateRows: `repeat(${preset.rows}, 1fr)` }}>
        {cells}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
        Click cells to toggle <b style={{ color: 'var(--text-secondary)' }}>use</b> / <b style={{ color: 'var(--text-secondary)' }}>skip</b> · long-press to set start
      </div>
    </div>
  );
}

// Export to window
Object.assign(window, { Icons, Icon, SamplePreview, SheetPreview });
