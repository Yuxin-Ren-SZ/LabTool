'use strict';
/* ════════════════════════════════════════════════════════════════
   BCA APP — interactive controller, import-first.
   createBcaApp(rootEl, { layout })  layout: 'twopane' | 'flow' | 'stepper'
   Reuses BCAEngine (logic) + BCAChart (curve). Fully closure-scoped so
   multiple instances / iframes never collide.
   ════════════════════════════════════════════════════════════════ */
(function (root) {
  const E = root.BCAEngine, Chart = root.BCAChart;
  const { ROWS, N_R, N_C, PRESETS, PLATE_TPLS, CV_WARN } = E;

  root.createBcaApp = function createBcaApp(host, opts) {
    opts = opts || {};
    const layout = opts.layout || 'twopane';

    /* ── State ── */
    const S = {
      layout,
      source: 'file',          // 'file' | 'grid' | 'manual'
      mode: 'plate',           // 'plate' (file/grid) | 'manual'
      preset: 'pierce',
      numReps: 1,
      fitType: 'linear',
      plateMatrix: null,
      wellAssigns: {},
      selWells: new Set(),
      dragging: false, dragAnchor: null,
      tplId: 'pierce', tplActive: [], tplStep: -1,
      stdRows: [], smpRows: [],
      currentFit: null, lastResult: null,
      step: 0,                 // stepper: 0 import, 1 map, 2 results
    };

    /* ── Build scaffold ── */
    host.classList.add('bca-app', 'bca-' + layout);
    host.innerHTML = scaffold(layout);
    const $ = sel => host.querySelector(sel);
    const $$ = sel => Array.from(host.querySelectorAll(sel));

    // initial data
    S.smpRows = [newSmp(0), newSmp(1), newSmp(2)];
    loadPreset('pierce');
    initTpl();
    renderSourceToggle();
    renderImport();
    renderManual();
    renderResults();
    refreshLayout();

    /* ════════ SCAFFOLDS ════════ */
    function scaffold(L) {
      const toggle = `<div class="bca-source-row" data-region="source"></div>`;
      const importB = `<div class="bca-import" data-region="import"></div>`;
      const plate = `<div class="bca-plate" data-region="plate"></div>`;
      const assign = `<div class="bca-assign" data-region="assign"></div>`;
      const manual = `<div class="bca-manual" data-region="manual"></div>`;
      const results = `<div class="bca-results" data-region="results"></div>`;

      if (L === 'twopane') {
        return `
          <div class="bca-head">
            <h1 class="bca-title">BCA Protein Assay</h1>
            <p class="bca-sub">Drop in a plate-reader file, map your wells, read concentrations.</p>
          </div>
          ${toggle}
          <div class="bca-2col">
            <div class="bca-left">${importB}${plate}${assign}${manual}</div>
            <div class="bca-right"><div class="bca-right-sticky">${results}</div></div>
          </div>`;
      }
      if (L === 'flow') {
        return `
          <div class="bca-head">
            <h1 class="bca-title">BCA Protein Assay</h1>
            <p class="bca-sub">Drop in a plate-reader file, map your wells, read concentrations.</p>
          </div>
          ${toggle}
          <div class="bca-flow">
            <section class="bca-flow-sec">${importB}</section>
            <section class="bca-flow-sec" data-region="mapwrap">${plate}${assign}${manual}</section>
            <section class="bca-flow-sec" data-region="reswrap">${results}</section>
          </div>`;
      }
      // stepper
      return `
        <div class="bca-head">
          <h1 class="bca-title">BCA Protein Assay</h1>
          <p class="bca-sub">Drop in a plate-reader file, map your wells, read concentrations.</p>
        </div>
        <div class="step-bar" data-region="stepbar">
          <div class="step-pip" data-step="0"><div class="dot">1</div> Import</div>
          <div class="step-connector" data-conn="0"></div>
          <div class="step-pip" data-step="1"><div class="dot">2</div> Map wells</div>
          <div class="step-connector" data-conn="1"></div>
          <div class="step-pip" data-step="2"><div class="dot">3</div> Results</div>
        </div>
        <div class="bca-steps">
          <div class="bca-step" data-panel="0">${toggle}${importB}</div>
          <div class="bca-step" data-panel="1">${plate}${assign}${manual}</div>
          <div class="bca-step" data-panel="2">${results}</div>
        </div>
        <div class="bca-step-nav" data-region="stepnav"></div>`;
    }

    /* ════════ SOURCE TOGGLE ════════ */
    function renderSourceToggle() {
      const r = $('[data-region="source"]'); if (!r) return;
      r.innerHTML = `
        <div class="bca-seg">
          <button class="bca-seg-btn${S.source === 'file' ? ' on' : ''}" data-act="src:file">📂 Plate file (.txt)</button>
          <button class="bca-seg-btn${S.source === 'grid' ? ' on' : ''}" data-act="src:grid">⊞ Paste grid</button>
          <button class="bca-seg-btn${S.source === 'manual' ? ' on' : ''}" data-act="src:manual">⌨ Manual</button>
        </div>
        <span class="bca-seg-hint">${S.source === 'manual' ? 'Type standards & samples by hand' : S.source === 'grid' ? 'Paste an 8×12 OD block from Excel' : 'SoftMax Pro / SpectraMax export'}</span>`;
    }

    /* ════════ IMPORT PANEL ════════ */
    function renderImport() {
      const r = $('[data-region="import"]'); if (!r) return;
      if (S.source === 'manual') { r.innerHTML = ''; return; }
      const parsed = !!S.plateMatrix;
      if (parsed) {
        r.innerHTML = `<div class="bca-reimport">
          <span class="bca-reimport-ok">✓ Plate loaded — 96 wells</span>
          <button class="lt-btn lt-btn-ghost bca-mini-btn" data-act="reparse">Replace data</button>
        </div>`;
        return;
      }
      const isFile = S.source === 'file';
      r.innerHTML = `
        <div class="bca-import-card">
          ${isFile ? `<div class="bca-drop" data-act="openfile">
              <input type="file" accept=".txt,.csv,.tsv" data-field="filepick" hidden>
              <div class="bca-drop-icon">📂</div>
              <div class="bca-drop-title">Open plate-reader export</div>
              <div class="bca-drop-sub">SoftMax Pro / SpectraMax .txt — or paste below</div>
            </div>` : `<div class="bca-import-label">Paste the 8 × 12 OD block (tab- or comma-separated)</div>`}
          <textarea class="bca-textarea" data-field="paste" spellcheck="false" placeholder="${isFile ? '##BLOCKS= 1\nPlate:\t…' : '0.370\t0.408\t0.382 …'}"></textarea>
          <div class="bca-import-actions">
            <button class="lt-btn lt-btn-primary" data-act="parse">Parse plate →</button>
            <span class="bca-err" data-region="err"></span>
          </div>
        </div>`;
    }

    /* ════════ PLATE GRID ════════ */
    function renderPlate() {
      const r = $('[data-region="plate"]'); if (!r) return;
      if (!S.plateMatrix || S.mode === 'manual') { r.innerHTML = ''; return; }
      const all = S.plateMatrix.flat(), mn = Math.min(...all), mx = Math.max(...all);
      let cells = '<div class="pw-corner"></div>';
      for (let c = 1; c <= N_C; c++) cells += `<div class="pw-col">${c}</div>`;
      for (let rI = 0; rI < N_R; rI++) {
        cells += `<div class="pw-row">${ROWS[rI]}</div>`;
        for (let c = 0; c < N_C; c++) {
          const k = ROWS[rI] + (c + 1), od = S.plateMatrix[rI][c];
          cells += `<div class="pw" data-key="${k}" data-r="${rI}" data-c="${c}"
            style="background:${odColor(od, mn, mx)}" title="${k}: ${od.toFixed(4)}">
            <span class="pw-od">${od.toFixed(3)}</span><span class="pw-lab" data-lab="${k}"></span></div>`;
        }
      }
      r.innerHTML = `
        <div class="bca-section-label">96-well plate — OD 562 nm</div>
        <div class="pw-outer"><div class="pw-grid">${cells}</div></div>
        <div class="pw-legend">
          <span>Low</span><div class="pw-legend-bar"></div><span>High</span>
          <span class="pw-sel" data-region="selcount">Click or drag to select wells</span>
          <span class="pw-tools">
            <button class="lt-btn lt-btn-ghost bca-mini-btn" data-act="plateAll">All</button>
            <button class="lt-btn lt-btn-ghost bca-mini-btn" data-act="plateClear">Clear</button>
            <button class="lt-btn lt-btn-ghost bca-mini-btn bca-danger" data-act="plateUnassign">Unassign</button>
          </span>
        </div>`;
      wireWells();
      refreshWells();
      updateSelCount();
    }

    function wireWells() {
      const grid = $('.pw-grid'); if (!grid) return;
      grid.addEventListener('mousedown', e => {
        const w = e.target.closest('.pw'); if (!w) return;
        e.preventDefault(); S.dragging = true; S.dragAnchor = w;
        if (!e.shiftKey && !e.metaKey && !e.ctrlKey) S.selWells.clear();
        S.selWells.add(w.dataset.key); refreshWells(); updateSelCount();
      });
      grid.addEventListener('mouseover', e => {
        if (!S.dragging || !S.dragAnchor) return;
        const w = e.target.closest('.pw'); if (!w) return;
        const r1 = +S.dragAnchor.dataset.r, c1 = +S.dragAnchor.dataset.c, r2 = +w.dataset.r, c2 = +w.dataset.c;
        S.selWells.clear();
        for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
          for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) S.selWells.add(ROWS[r] + (c + 1));
        refreshWells(); updateSelCount();
      });
    }
    document.addEventListener('mouseup', () => { S.dragging = false; });

    function refreshWells() {
      $$('.pw').forEach(el => {
        const k = el.dataset.key;
        el.classList.remove('sel', 'a-std', 'a-smp');
        const lab = el.querySelector('[data-lab]');
        if (S.selWells.has(k)) el.classList.add('sel');
        const a = S.wellAssigns[k];
        if (a) {
          if (a.type === 'std') { el.classList.add('a-std'); if (lab) lab.textContent = a.conc; }
          else { el.classList.add('a-smp'); if (lab) lab.textContent = (a.name || '').slice(0, 4); }
        } else if (lab) lab.textContent = '';
      });
    }
    function updateSelCount() {
      const el = $('[data-region="selcount"]'); if (!el) return;
      const n = S.selWells.size, keys = [...S.selWells].sort();
      el.textContent = n === 0 ? 'Click or drag to select wells'
        : `${n} well${n > 1 ? 's' : ''}: ${keys.slice(0, 8).join(', ')}${n > 8 ? ' …' : ''}`;
      updatePlateNav();
    }

    /* ════════ ASSIGN PANEL ════════ */
    function renderAssign() {
      const r = $('[data-region="assign"]'); if (!r) return;
      if (!S.plateMatrix || S.mode === 'manual') { r.innerHTML = ''; return; }
      const tpl = PLATE_TPLS.find(t => t.id === S.tplId);
      r.innerHTML = `
        <div class="bca-section-label" style="margin-top:18px">Standard template</div>
        <p class="bca-note">Uncheck unused points, then assign each concentration to its wells.</p>
        <div class="bca-seg bca-seg-sm">
          ${PLATE_TPLS.map(t => `<button class="bca-seg-btn${t.id === S.tplId ? ' on' : ''}" data-act="tplTab:${t.id}">${t.name}</button>`).join('')}
        </div>
        <div class="bca-plate-nav" data-region="platenav" style="display:none"></div>
        <div class="tpl-list" data-region="tpllist"></div>
        <div class="lt-divider"></div>
        <div class="bca-section-label">Assign selected wells</div>
        <div class="assign-grid">
          <div class="assign-card a-std-card">
            <div class="assign-card-h">◼ Standard <span data-region="stdunit">(${tpl.unit})</span></div>
            <div class="assign-card-row">
              <input class="lt-input bca-in" type="number" min="0" step="any" data-field="stdconc" placeholder="conc">
              <button class="lt-btn lt-btn-ghost bca-assign-btn std" data-act="assignStd">Assign →</button>
            </div>
          </div>
          <div class="assign-card a-smp-card">
            <div class="assign-card-h">◆ Sample</div>
            <div class="assign-card-row">
              <input class="lt-input bca-in" type="text" data-field="smpname" placeholder="name">
              <input class="lt-input bca-in bca-in-sm" type="number" min="1" step="1" value="1" data-field="smpdf" placeholder="DF">
              <button class="lt-btn lt-btn-ghost bca-assign-btn smp" data-act="assignSmp">Assign →</button>
            </div>
          </div>
        </div>
        <div class="assign-sum" data-region="assignsum"></div>`;
      renderTplList();
      updateAssignSummary();
    }

    function renderTplList() {
      const el = $('[data-region="tpllist"]'); if (!el) return;
      const tpl = PLATE_TPLS.find(t => t.id === S.tplId);
      updatePlateNav();
      el.innerHTML = tpl.concs.map((c, i) => {
        const on = S.tplActive[i], isS = S.tplStep === i;
        const assigned = Object.values(S.wellAssigns).filter(a => a.type === 'std' && a.conc === c).length;
        const done = assigned > 0;
        let rc = 'tpl-row';
        if (!on) rc += ' tpl-skip'; else if (isS) rc += ' tpl-active'; else if (done) rc += ' tpl-done';
        const st = on && done ? `✓ ${assigned} well${assigned > 1 ? 's' : ''}` : '';
        const bl = isS ? '← selecting…' : (done ? '↺ re-select' : '→ select wells');
        return `<div class="${rc}">
          <label class="tpl-check"><input type="checkbox" ${on ? 'checked' : ''} data-act="tplToggle:${i}"><span class="tpl-conc">${c} ${tpl.unit}</span></label>
          <span class="tpl-status">${st}</span>
          ${on ? `<button class="lt-btn lt-btn-ghost tpl-btn${isS ? ' on' : ''}" data-act="tplStep:${i}">${bl}</button>` : ''}
        </div>`;
      }).join('') + `<div class="tpl-reset-row"><button class="lt-btn lt-btn-ghost bca-mini-btn bca-danger" data-act="tplReset">Reset standards</button></div>`;
    }

    function updatePlateNav() {
      const nav = $('[data-region="platenav"]'); if (!nav || !S.plateMatrix) return;
      const tpl = PLATE_TPLS.find(t => t.id === S.tplId);
      const active = tpl.concs.map((c, i) => ({ c, i, on: S.tplActive[i] })).filter(s => s.on);
      if (!active.length) { nav.style.display = 'none'; return; }
      const done = active.filter(s => Object.values(S.wellAssigns).some(a => a.type === 'std' && a.conc === s.c)).length;
      nav.style.display = 'flex';
      if (S.tplStep >= 0) {
        const sn = active.findIndex(s => s.i === S.tplStep) + 1, c = tpl.concs[S.tplStep];
        if (S.selWells.size > 0) {
          nav.className = 'bca-plate-nav ready';
          nav.innerHTML = `<span>Step ${sn}/${active.length}: <b>${c} ${tpl.unit}</b> — ${S.selWells.size} well${S.selWells.size > 1 ? 's' : ''} selected</span>
            <button class="bca-nav-btn go" data-act="assignStd">Assign as ${c} ${tpl.unit} →</button>`;
        } else {
          nav.className = 'bca-plate-nav';
          nav.innerHTML = `<span>Step ${sn}/${active.length}: <b>${c} ${tpl.unit}</b> — select wells above</span><button class="bca-nav-btn" disabled>selecting…</button>`;
        }
      } else if (done === active.length) {
        nav.className = 'bca-plate-nav done';
        nav.innerHTML = `<span>✓ All ${active.length} standards assigned</span>`;
      } else {
        const nxt = active.find(s => !Object.values(S.wellAssigns).some(a => a.type === 'std' && a.conc === s.c));
        const sn = active.findIndex(s => s.i === nxt.i) + 1;
        nav.className = 'bca-plate-nav';
        nav.innerHTML = `<span>Next: step ${sn}/${active.length} — <b>${nxt.c} ${tpl.unit}</b></span><button class="bca-nav-btn" data-act="tplStep:${nxt.i}">→ select wells</button>`;
      }
    }

    function updateAssignSummary() {
      const el = $('[data-region="assignsum"]'); if (!el) return;
      const { stdG, smpG, ua } = groupWells();
      const sw = [...stdG.values()].reduce((s, a) => s + a.length, 0);
      const smw = [...smpG.values()].reduce((s, g) => s + g.ods.length, 0);
      el.innerHTML = `
        <div class="sum-card"><div class="sum-label">Standards</div><div class="sum-val">${stdG.size} group${stdG.size !== 1 ? 's' : ''}</div><div class="sum-note">${sw} well${sw !== 1 ? 's' : ''}</div></div>
        <div class="sum-card"><div class="sum-label">Samples</div><div class="sum-val">${smpG.size} group${smpG.size !== 1 ? 's' : ''}</div><div class="sum-note">${smw} well${smw !== 1 ? 's' : ''}</div></div>
        <div class="sum-card"><div class="sum-label">Unassigned</div><div class="sum-val">${ua}</div><div class="sum-note">background / unused</div></div>`;
    }

    function groupWells() {
      const stdG = new Map(), smpG = new Map(); let ua = 0;
      for (let r = 0; r < N_R; r++) for (let c = 0; c < N_C; c++) {
        const k = ROWS[r] + (c + 1), a = S.wellAssigns[k];
        if (!a) { ua++; continue; }
        const od = S.plateMatrix ? S.plateMatrix[r][c] : 0;
        if (a.type === 'std') { if (!stdG.has(a.conc)) stdG.set(a.conc, []); stdG.get(a.conc).push(od); }
        else { const kk = a.name + '||' + a.df; if (!smpG.has(kk)) smpG.set(kk, { name: a.name, df: a.df, ods: [] }); smpG.get(kk).ods.push(od); }
      }
      return { stdG, smpG, ua };
    }

    /* ════════ MANUAL TABLES ════════ */
    function renderManual() {
      const r = $('[data-region="manual"]'); if (!r) return;
      if (S.mode !== 'manual') { r.innerHTML = ''; return; }
      const unit = PRESETS[S.preset].unit;
      r.innerHTML = `
        <div class="bca-row-between">
          <div class="bca-seg bca-seg-sm">
            ${['pierce', 'basic', 'custom'].map(p => `<button class="bca-seg-btn${S.preset === p ? ' on' : ''}" data-act="preset:${p}">${PRESETS[p].name}</button>`).join('')}
          </div>
          <div class="bca-reps"><span>Reps</span>
            ${[1, 2, 3].map(n => `<button class="bca-rep${S.numReps === n ? ' on' : ''}" data-act="reps:${n}">${n}</button>`).join('')}
          </div>
        </div>
        <div class="bca-section-label" style="margin-top:6px">Standard curve</div>
        <div class="dt-shell">${stdTableHTML(unit)}<div class="dt-foot"><button class="lt-btn lt-btn-ghost bca-mini-btn" data-act="addStd">+ Row</button><span class="dt-hint">↵ moves down · paste a column fills ↓</span></div></div>
        <div class="bca-section-label" style="margin-top:16px">Samples</div>
        <div class="dt-shell">${smpTableHTML(unit)}<div class="dt-foot"><button class="lt-btn lt-btn-ghost bca-mini-btn" data-act="addSmp">+ Sample</button><span class="dt-hint">↵ in last row adds a sample</span></div></div>`;
      updateManualConcs();
    }

    function repCols(n) { return [0, 1, 2].map(i => i < S.numReps ? '' : ' hide').map((h, i) => ({ i, h })); }

    function stdTableHTML(unit) {
      const isCustom = S.preset === 'custom';
      const head = `<tr><th class="t-r" style="width:96px">Conc (${unit})</th>
        <th class="t-r" style="width:70px">OD 1</th>
        <th class="t-r r2${S.numReps < 2 ? ' hide' : ''}" style="width:70px">OD 2</th>
        <th class="t-r r3${S.numReps < 3 ? ' hide' : ''}" style="width:70px">OD 3</th>
        <th class="t-c" style="width:60px">Avg</th>
        <th class="t-c" style="width:54px">CV%</th><th style="width:26px"></th></tr>`;
      const body = S.stdRows.map((row, i) => {
        const concCell = isCustom
          ? `<td><input class="ci t-r" type="number" min="0" step="any" value="${row.conc}" placeholder="0" data-tbl="std" data-row="${i}" data-col="conc"></td>`
          : `<td><span class="ci-ro">${row.conc}</span></td>`;
        const cv = E.cv(row.ods.slice(0, S.numReps));
        return `<tr>${concCell}${odCells('std', i, row)}
          <td class="t-c"><span class="avg-c" data-avg="std-${i}">${fmtA(E.mean(row.ods.slice(0, S.numReps)))}</span></td>
          <td class="t-c"><span class="cv-c${!isNaN(cv) && cv > CV_WARN ? ' hi' : ''}" data-cv="std-${i}">${E.fmtCV(cv)}</span></td>
          <td class="t-c"><button class="del-b" data-act="delStd:${i}">×</button></td></tr>`;
      }).join('');
      return `<table class="dt"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    }

    function smpTableHTML(unit) {
      const head = `<tr><th style="min-width:110px">Name</th>
        <th class="t-r" style="width:70px">OD 1</th>
        <th class="t-r r2${S.numReps < 2 ? ' hide' : ''}" style="width:70px">OD 2</th>
        <th class="t-r r3${S.numReps < 3 ? ' hide' : ''}" style="width:70px">OD 3</th>
        <th class="t-r" style="width:48px">DF</th>
        <th class="t-r" style="width:84px">Conc</th><th style="width:26px"></th></tr>`;
      const body = S.smpRows.map((row, i) => `<tr>
        <td><input class="ci t-l" type="text" value="${esc(row.name)}" placeholder="Sample name" data-tbl="smp" data-row="${i}" data-col="name"></td>
        ${odCells('smp', i, row)}
        <td><input class="ci t-r" type="number" min="1" step="1" value="${row.df}" placeholder="1" data-tbl="smp" data-row="${i}" data-col="df"></td>
        <td class="t-r"><span class="smp-conc" data-conc="${i}">—</span></td>
        <td class="t-c"><button class="del-b" data-act="delSmp:${i}">×</button></td></tr>`).join('');
      return `<table class="dt"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    }

    function odCells(tbl, i, row) {
      return [0, 1, 2].map(j => {
        const hide = j >= S.numReps ? ' hide' : '';
        const cls = j === 1 ? 'r2' : j === 2 ? 'r3' : '';
        return `<td class="${cls}${hide}"><input class="ci t-r" type="number" min="0" step="0.001" value="${row.ods[j] != null ? row.ods[j] : ''}" placeholder="${j === 0 ? '0.000' : '—'}" data-tbl="${tbl}" data-row="${i}" data-col="od" data-rep="${j}"></td>`;
      }).join('');
    }

    function updateManualConcs() {
      if (S.mode !== 'manual') return;
      const f = S.currentFit;
      S.stdRows.forEach((row, i) => {
        const a = $(`[data-avg="std-${i}"]`), cvEl = $(`[data-cv="std-${i}"]`);
        if (a) a.textContent = fmtA(E.mean(row.ods.slice(0, S.numReps)));
        const cv = E.cv(row.ods.slice(0, S.numReps));
        if (cvEl) { cvEl.textContent = E.fmtCV(cv); cvEl.classList.toggle('hi', !isNaN(cv) && cv > CV_WARN); }
      });
      S.smpRows.forEach((row, i) => {
        const el = $(`[data-conc="${i}"]`); if (!el) return;
        const od = E.mean(row.ods.slice(0, S.numReps));
        if (!f || isNaN(od)) { el.textContent = '—'; el.className = 'smp-conc'; return; }
        const raw = f.invert(od), conc = raw * (Number(row.df) || 1);
        if (isNaN(raw) || raw < 0 || conc < 0) { el.textContent = '< 0'; el.className = 'smp-conc low'; }
        else if (od < f.minOD || od > f.maxOD) { el.textContent = E.fmtConc(conc); el.className = 'smp-conc warn'; }
        else { el.textContent = E.fmtConc(conc); el.className = 'smp-conc ok'; }
      });
    }

    /* ════════ RESULTS ════════ */
    function renderResults() {
      const r = $('[data-region="results"]'); if (!r) return;
      r.innerHTML = `
        <div class="res-head">
          <span class="bca-section-label" style="margin:0">Results</span>
          <span class="res-status" data-region="status">Waiting for data…</span>
        </div>
        <div class="res-empty" data-region="resempty">
          <div class="res-empty-icon">📈</div>
          <div>${S.mode === 'manual' ? 'Enter standards & samples to see results.' : 'Assign standards & samples to see results.'}</div>
        </div>
        <div class="res-body" data-region="resbody" style="display:none">
          <div class="fit-toggle-row">
            <div class="bca-seg bca-seg-xs">
              <button class="bca-seg-btn${S.fitType === 'linear' ? ' on' : ''}" data-act="fit:linear">Linear</button>
              <button class="bca-seg-btn${S.fitType === 'quadratic' ? ' on' : ''}" data-act="fit:quadratic">Quadratic</button>
            </div>
            <span class="lt-badge" data-region="r2badge">—</span>
          </div>
          <div class="fit-eq" data-region="eq">—</div>
          <div class="mini-stats" data-region="ministats"></div>
          <div class="chart-card"><svg data-region="chart"></svg>
            <div class="chart-legend">
              <span class="lg"><span class="lg-dot" style="background:#3366cc"></span>Standards</span>
              <span class="lg"><span class="lg-dia" style="background:#e07832"></span>Samples</span>
              <span class="lg"><span class="lg-line"></span>Fit</span>
            </div>
          </div>
          <div class="bca-section-label" style="margin-bottom:6px">Sample concentrations</div>
          <div class="res-table-shell"><table class="res-table">
            <thead><tr><th>Sample</th><th class="t-r">Avg OD</th><th class="t-r">CV</th><th class="t-r">DF</th><th class="t-r" data-region="concH">Conc</th><th>Flag</th></tr></thead>
            <tbody data-region="restbody"></tbody>
          </table></div>
          <div class="res-export">
            <button class="lt-btn lt-btn-ghost bca-mini-btn" data-act="export">Export CSV</button>
            <button class="lt-btn lt-btn-ghost bca-mini-btn" data-act="copy">Copy table</button>
          </div>
        </div>`;
    }

    function recompute() {
      const groups = gatherGroups();
      const unit = S.mode === 'manual' ? PRESETS[S.preset].unit : (PLATE_TPLS.find(t => t.id === S.tplId)?.unit || 'µg/mL');
      const res = E.compute(groups.std, groups.smp, { fitType: S.fitType, unit });
      S.lastResult = res.ok ? res : null;
      S.currentFit = res.ok ? Object.assign(res.fit, { minOD: res.minOD, maxOD: res.maxOD, minC: res.minC, maxC: res.maxC }) : null;
      paintResults(res);
      updateManualConcs();
      if (S.mode !== 'manual') { updateAssignSummary(); updatePlateNav(); }
      updateStepNav();
    }

    function gatherGroups() {
      if (S.mode === 'manual') {
        return {
          std: S.stdRows.map(r => ({ conc: r.conc, ods: r.ods.slice(0, S.numReps) })),
          smp: S.smpRows.map(r => ({ name: r.name, df: r.df, ods: r.ods.slice(0, S.numReps) })),
        };
      }
      const { stdG, smpG } = groupWells();
      return {
        std: [...stdG.entries()].sort((a, b) => a[0] - b[0]).map(([conc, ods]) => ({ conc, ods })),
        smp: [...smpG.values()].map(g => ({ name: g.name, df: g.df, ods: g.ods })),
      };
    }

    function setStatus(msg, type) {
      const el = $('[data-region="status"]'); if (!el) return;
      el.textContent = msg; el.className = 'res-status' + (type ? ' ' + type : '');
    }

    function paintResults(res) {
      const empty = $('[data-region="resempty"]'), body = $('[data-region="resbody"]');
      if (!res.ok) {
        if (empty) empty.style.display = '';
        if (body) body.style.display = 'none';
        setStatus(res.reason === 'need2' ? `${res.nStd} standard point — need ≥ 2` : res.reason === 'singular' ? 'Cannot fit — check standards' : 'Waiting for data…', res.reason === 'need2' ? 'warn' : '');
        return;
      }
      if (empty) empty.style.display = 'none';
      if (body) body.style.display = '';
      const f = res.fit;
      $('[data-region="eq"]').textContent = f.equation;
      const badge = $('[data-region="r2badge"]');
      const r2 = f.r2;
      if (r2 >= 0.99) { badge.className = 'lt-badge lt-badge-green'; badge.textContent = `R² ${r2.toFixed(4)} ✓`; setStatus(`Good fit · ${res.samples.length} sample${res.samples.length !== 1 ? 's' : ''}`, 'ok'); }
      else if (r2 >= 0.95) { badge.className = 'lt-badge lt-badge-yellow'; badge.textContent = `R² ${r2.toFixed(4)}`; setStatus('Acceptable fit — review standards', 'warn'); }
      else { badge.className = 'lt-badge lt-badge-red'; badge.textContent = `R² ${r2.toFixed(4)}`; setStatus('Poor fit — try the other curve model', 'err'); }

      // mini stats
      const stats = f.type === 'linear'
        ? [['Slope', E.fmtSci(f.b)], ['Intercept', f.a.toFixed(4)], ['R²', r2.toFixed(4)], ['Points', res.stdPts.length]]
        : [['Curvature', E.fmtSci(f.c)], ['Linear', E.fmtSci(f.b)], ['R²', r2.toFixed(4)], ['Points', res.stdPts.length]];
      $('[data-region="ministats"]').innerHTML = stats.map(s => `<div class="ms"><div class="ms-l">${s[0]}</div><div class="ms-v">${s[1]}</div></div>`).join('');

      // chart
      Chart.draw($('[data-region="chart"]'), { fit: f, stdPts: res.stdPts, samples: res.samples, unit: res.unit, w: chartW(), h: chartH() });

      // table
      $('[data-region="concH"]').textContent = `Conc (${res.unit})`;
      const tb = $('[data-region="restbody"]');
      tb.innerHTML = res.samples.length ? res.samples.map(r => {
        const flags = r.flags.map(fl => fl === 'extrap' ? '<span class="flag warn">Extrap</span>' : fl === 'low' ? '<span class="flag low">Low</span>' : fl === 'cv' ? '<span class="flag cv">High CV</span>' : '').join(' ') || '—';
        return `<tr><td>${esc(r.name)}</td><td class="t-r mono">${E.fmtOD(r.od)}</td><td class="t-r mono${!isNaN(r.cv) && r.cv > CV_WARN ? ' cvhi' : ''}">${E.fmtCV(r.cv)}</td><td class="t-r">${r.df}×</td><td class="t-r conc-v">${E.fmtConc(r.conc)}</td><td>${flags}</td></tr>`;
      }).join('') : `<tr><td colspan="6" class="res-none">No samples ${S.mode === 'manual' ? 'entered' : 'assigned'} yet</td></tr>`;
    }
    function chartW() { return S.layout === 'flow' ? 420 : S.layout === 'stepper' ? 460 : 360; }
    function chartH() { return S.layout === 'flow' ? 240 : S.layout === 'stepper' ? 250 : 200; }

    /* ════════ STEPPER NAV ════════ */
    function updateStepNav() {
      if (S.layout !== 'stepper') return;
      $$('.bca-step').forEach(p => p.classList.toggle('on', +p.dataset.panel === S.step));
      $$('[data-step]').forEach(p => {
        const n = +p.dataset.step;
        p.classList.toggle('active', n === S.step);
        p.classList.toggle('done', n < S.step);
      });
      $$('[data-conn]').forEach(c => c.classList.toggle('done', +c.dataset.conn < S.step));
      const nav = $('[data-region="stepnav"]'); if (!nav) return;
      const canNext = S.step === 0 ? (S.mode === 'manual' || !!S.plateMatrix) : S.step === 1 ? !!S.lastResult : false;
      const labels = ['Import', 'Map wells', 'Results'];
      nav.innerHTML = `
        ${S.step > 0 ? `<button class="lt-btn lt-btn-ghost" data-act="back">← Back</button>` : '<span></span>'}
        <span class="step-crumb">${labels[S.step]}</span>
        ${S.step < 2 ? `<button class="lt-btn lt-btn-primary" data-act="next" ${canNext ? '' : 'disabled'}>${S.step === 0 ? 'Map wells →' : 'See results →'}</button>` : '<span></span>'}`;
    }

    /* ════════ LAYOUT REFRESH ════════ */
    function refreshLayout() {
      S.mode = S.source === 'manual' ? 'manual' : 'plate';
      renderImport(); renderPlate(); renderAssign(); renderManual();
      // visibility for flow's map wrapper: hide until ready
      recompute();
      updateStepNav();
    }

    /* ════════ ACTIONS ════════ */
    function loadPreset(pid) {
      const prev = S.stdRows.map(r => r.ods.slice());
      S.preset = pid;
      const p = PRESETS[pid];
      if (pid === 'custom') {
        if (!S.stdRows.length || S.stdRows.every(r => r.conc !== '')) S.stdRows = [newStd(), newStd()];
      } else {
        S.stdRows = p.concs.map((c, i) => ({ conc: String(c), ods: prev[i] ? prev[i].slice() : [] }));
      }
    }
    function newStd() { return { conc: '', ods: [] }; }
    function newSmp(n) { return { name: n > 0 ? `Sample ${n + 1}` : '', df: '1', ods: [] }; }

    function initTpl() {
      S.tplId = 'pierce';
      S.tplActive = PLATE_TPLS[0].concs.map(() => true);
      S.tplStep = -1;
    }
    function setTpl(id) {
      S.tplId = id;
      S.tplActive = PLATE_TPLS.find(t => t.id === id).concs.map(() => true);
      S.tplStep = -1;
      const u = PLATE_TPLS.find(t => t.id === id).unit;
      const su = $('[data-region="stdunit"]'); if (su) su.textContent = `(${u})`;
      renderAssign();
    }

    function doParse() {
      const ta = $('[data-field="paste"]'); const err = $('[data-region="err"]');
      if (err) { err.textContent = ''; err.style.display = 'none'; }
      const text = (ta ? ta.value : '').trim();
      if (!text) { showErr('Nothing to parse — open a file or paste the OD block.'); return; }
      try {
        S.plateMatrix = S.source === 'file' ? E.parseRaw(text) : E.parseGrid(text);
        S.wellAssigns = {}; S.selWells = new Set(); initTpl();
        S.mode = 'plate';
        renderImport(); renderPlate(); renderAssign();
        recompute();
        if (S.layout === 'stepper') { S.step = 1; updateStepNav(); }
      } catch (e) { showErr('Parse error: ' + e.message); }
    }
    function showErr(m) { const err = $('[data-region="err"]'); if (err) { err.textContent = m; err.style.display = 'block'; } }

    function assignStd() {
      if (!S.selWells.size) { flashNav('Select wells first'); return; }
      const inp = $('[data-field="stdconc"]'); const c = parseFloat(inp.value);
      if (isNaN(c)) { inp.focus(); inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 400); return; }
      S.selWells.forEach(k => { S.wellAssigns[k] = { type: 'std', conc: c }; });
      tplAdvance();
      S.selWells.clear();
      refreshWells(); updateSelCount(); renderTplList(); recompute();
    }
    function assignSmp() {
      if (!S.selWells.size) { flashNav('Select wells first'); return; }
      const name = $('[data-field="smpname"]').value.trim();
      const df = parseFloat($('[data-field="smpdf"]').value) || 1;
      if (!name) { $('[data-field="smpname"]').focus(); return; }
      S.selWells.forEach(k => { S.wellAssigns[k] = { type: 'smp', name, df }; });
      $('[data-field="smpname"]').value = '';
      S.selWells.clear();
      refreshWells(); updateSelCount(); recompute();
    }
    function flashNav(msg) {
      const el = $('[data-region="selcount"]'); if (el) { el.textContent = msg; }
    }
    function tplAdvance() {
      if (S.tplStep < 0) return;
      const tpl = PLATE_TPLS.find(t => t.id === S.tplId);
      let next = -1;
      for (let i = S.tplStep + 1; i < tpl.concs.length; i++) if (S.tplActive[i]) { next = i; break; }
      S.tplStep = next;
      const inp = $('[data-field="stdconc"]');
      if (next >= 0 && inp) inp.value = tpl.concs[next];
      else if (inp) inp.value = '';
    }
    function tplSetStep(i) {
      S.tplStep = i;
      const tpl = PLATE_TPLS.find(t => t.id === S.tplId);
      const inp = $('[data-field="stdconc"]'); if (inp) inp.value = tpl.concs[i];
      renderTplList();
    }
    function unassignSelected() {
      S.selWells.forEach(k => delete S.wellAssigns[k]);
      S.selWells.clear(); refreshWells(); updateSelCount(); renderTplList(); recompute();
    }
    function resetStandards() {
      Object.keys(S.wellAssigns).forEach(k => { if (S.wellAssigns[k].type === 'std') delete S.wellAssigns[k]; });
      S.tplStep = -1; const inp = $('[data-field="stdconc"]'); if (inp) inp.value = '';
      refreshWells(); renderTplList(); recompute();
    }

    /* ════════ EVENT DELEGATION ════════ */
    host.addEventListener('click', e => {
      const t = e.target.closest('[data-act]'); if (!t) return;
      const act = t.dataset.act;
      const [cmd, arg] = act.split(':');
      switch (cmd) {
        case 'src': S.source = arg; if (arg !== 'manual') S.mode = 'plate'; else S.mode = 'manual'; if (arg === 'manual') { S.plateMatrix = S.plateMatrix; } renderSourceToggle(); refreshLayout(); break;
        case 'openfile': { const fp = $('[data-field="filepick"]'); if (fp) fp.click(); break; }
        case 'parse': doParse(); break;
        case 'reparse': S.plateMatrix = null; S.wellAssigns = {}; S.selWells = new Set(); renderImport(); renderPlate(); renderAssign(); recompute(); break;
        case 'preset': loadPreset(arg); renderManual(); recompute(); break;
        case 'reps': S.numReps = +arg; renderManual(); recompute(); break;
        case 'addStd': S.stdRows.push(newStd()); renderManual(); focusCell('std', S.stdRows.length - 1, 'od', 0); break;
        case 'addSmp': S.smpRows.push(newSmp(S.smpRows.length)); renderManual(); focusCell('smp', S.smpRows.length - 1, 'name'); break;
        case 'delStd': if (S.stdRows.length > 2) { S.stdRows.splice(+arg, 1); renderManual(); recompute(); } break;
        case 'delSmp': S.smpRows.splice(+arg, 1); if (!S.smpRows.length) S.smpRows.push(newSmp(0)); renderManual(); recompute(); break;
        case 'tplTab': setTpl(arg); break;
        case 'tplToggle': S.tplActive[+arg] = !S.tplActive[+arg]; if (S.tplStep === +arg) S.tplStep = -1; renderTplList(); break;
        case 'tplStep': tplSetStep(+arg); break;
        case 'tplReset': resetStandards(); break;
        case 'plateAll': for (let r = 0; r < N_R; r++) for (let c = 0; c < N_C; c++) S.selWells.add(ROWS[r] + (c + 1)); refreshWells(); updateSelCount(); break;
        case 'plateClear': S.selWells.clear(); refreshWells(); updateSelCount(); break;
        case 'plateUnassign': unassignSelected(); break;
        case 'assignStd': assignStd(); break;
        case 'assignSmp': assignSmp(); break;
        case 'fit': S.fitType = arg; renderResults(); recompute(); break;
        case 'export': doExport(); break;
        case 'copy': doCopy(t); break;
        case 'next': S.step = Math.min(2, S.step + 1); updateStepNav(); break;
        case 'back': S.step = Math.max(0, S.step - 1); updateStepNav(); break;
      }
    });

    host.addEventListener('change', e => {
      const fp = e.target.closest('[data-field="filepick"]');
      if (fp && fp.files && fp.files[0]) {
        const f = fp.files[0], rd = new FileReader();
        rd.onload = ev => { const ta = $('[data-field="paste"]'); if (ta) ta.value = ev.target.result; doParse(); };
        rd.readAsText(f); fp.value = '';
      }
      const cb = e.target.closest('[data-act^="tplToggle"]');
      if (cb) { /* handled by click on label */ }
    });

    host.addEventListener('input', e => {
      const c = e.target.closest('[data-tbl]');
      if (c) {
        const { tbl, row, col, rep } = c.dataset;
        const i = +row;
        const rows = tbl === 'std' ? S.stdRows : S.smpRows;
        if (col === 'od') rows[i].ods[+rep] = c.value;
        else rows[i][col] = c.value;
        if (col === 'od' || col === 'conc') { updateManualConcs(); }
        scheduleCalc();
        return;
      }
    });

    // Enter / paste behaviour in manual cells
    host.addEventListener('keydown', e => {
      const c = e.target.closest('[data-tbl]'); if (!c) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const { tbl, row, col, rep } = c.dataset; const i = +row;
      const rows = tbl === 'std' ? S.stdRows : S.smpRows;
      if (i === rows.length - 1) {
        if (tbl === 'std') S.stdRows.push(newStd()); else S.smpRows.push(newSmp(S.smpRows.length));
        renderManual();
      }
      const next = host.querySelector(`[data-tbl="${tbl}"][data-row="${i + 1}"][data-col="${col}"]${col === 'od' ? `[data-rep="${rep}"]` : ''}`);
      if (next) next.focus();
    });

    host.addEventListener('paste', e => {
      const c = e.target.closest('[data-tbl]'); if (!c) return;
      const raw = (e.clipboardData || window.clipboardData).getData('text');
      const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length <= 1) return;
      e.preventDefault();
      const { tbl, row, col, rep } = c.dataset; let i = +row;
      const rows = tbl === 'std' ? S.stdRows : S.smpRows;
      lines.forEach((line, off) => {
        const v = parseFloat(line.split(/[\t,]/)[0]);
        if (isNaN(v) && col !== 'name') return;
        while (rows.length <= i + off) rows.push(tbl === 'std' ? newStd() : newSmp(rows.length));
        if (col === 'od') rows[i + off].ods[+rep] = String(v);
        else if (col === 'name') rows[i + off][col] = line.split(/[\t,]/)[0];
        else rows[i + off][col] = String(v);
      });
      renderManual(); recompute();
    });

    function focusCell(tbl, row, col, rep) {
      setTimeout(() => {
        const sel = `[data-tbl="${tbl}"][data-row="${row}"][data-col="${col}"]${col === 'od' ? `[data-rep="${rep}"]` : ''}`;
        const el = host.querySelector(sel); if (el) el.focus();
      }, 0);
    }

    let calcTimer = null;
    function scheduleCalc() { clearTimeout(calcTimer); calcTimer = setTimeout(recompute, 240); }

    /* ════════ EXPORT ════════ */
    function doExport() {
      if (!S.lastResult) return;
      if (root.labtoolsDownloadText) root.labtoolsDownloadText('bca-results.csv', E.buildCSV(S.lastResult), 'text/csv');
    }
    function doCopy(btn) {
      if (!S.lastResult) return;
      const txt = E.buildTSV(S.lastResult);
      const done = () => { const o = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(() => btn.textContent = o, 1200); };
      if (root.labtoolsCopyText) root.labtoolsCopyText(txt).then(done).catch(done); else done();
    }

    /* ════════ small utils ════════ */
    function odColor(od, mn, mx) {
      const t = mx > mn ? Math.max(0, Math.min(1, (od - mn) / (mx - mn))) : 0;
      return `rgb(${Math.round(247 - t * 196)},${Math.round(247 - t * 145)},${Math.round(245 - t * 41)})`;
    }
    function fmtA(v) { return isNaN(v) ? '—' : v.toFixed(3); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    return { state: S, recompute };
  };
})(window);
