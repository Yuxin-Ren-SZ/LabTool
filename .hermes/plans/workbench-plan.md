# LabTools Workbench — Shared Data Clipboard & Cross-Tool Transport

## Overview

A shared workbench that allows users to move data between LabTools without
copy-pasting CSV files. Think of it as a universal clipboard for lab data:
**put** data from any tool, **get** it in any other tool.

### User Story

1. Design a 96-well plate layout in **experiment-layout**
2. Click "↑ To Workbench" → plate layout saved
3. Switch to **qpcr-analysis**, click "↓ From Workbench"
4. Choose the plate layout → imported as sample/gene groups
   (depending on current mode selection)
5. Run analysis, put results back to workbench
6. Switch to **seeding-calc**, pull the BCA concentration data

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  assets/js/labtools-workbench.js                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Public API:  put / getByType / getAll / remove /  │  │
│  │  exportJSON / importJSON / onChange                │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌─────────────────┐  ┌──────────────────────────────┐   │
│  │  IndexedDB       │  │  BroadcastChannel            │   │
│  │  (persistence)   │  │  (cross-tab real-time sync) │   │
│  └─────────────────┘  └──────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
         ▲                              ▲
         │ put / get                    │ onChange
    ┌────┴────┐                    ┌────┴────────┐
    │  Tool A │                    │  root        │
    │ e.g.    │                    │  index.html  │
    │ bca     │                    │  ┌──────────┐│
    └─────────┘                    │  │ Workbench ││
         ▲                         │  │ Drawer   ││
    ┌────┴────┐                    │  │ (manage  ││
    │  Tool B │                    │  │  items)  ││
    │ e.g.    │                    │  └──────────┘│
    │ qpcr    │                    └──────────────┘
    └─────────┘
```

### Why IndexedDB (not localStorage)

| Concern | localStorage | IndexedDB |
|---------|-------------|-----------|
| Size limit | ~5 MB | Hundreds of MB |
| Structure | Flat strings | Object stores with indexes |
| Sync access | Blocking | Async (non-blocking) |
| Complex queries | Manual | Index-based filtering |
| Binary data | No | Yes (if needed later) |

All tools run on the same origin (`/tools/<name>/index.html`), so they
share the same IndexedDB database. Cross-tab sync uses `BroadcastChannel`.

---

## Data Model

### Workbench Item

```ts
interface WorkbenchItem {
  id:        string;    // UUID v4
  type:      string;    // Data type (see below)
  label:     string;    // User-readable name, editable
  tool:      string;    // Source tool name, e.g. "bca-assay"
  timestamp: number;    // Unix ms
  data:      any;       // Tool-specific payload (JSON-serializable)
  metadata?: {
    wellCount?: number;
    sampleCount?: number;
    plateFormat?: string;  // e.g. "96", "384"
    unit?: string;
  };
}
```

### Standard Data Types

| Type | Shape | Producer(s) | Consumer(s) |
|------|-------|------------|-------------|
| `plate-layout` | `{ wells: Record<WellID, {group, color, label?}>, groups: Group[] }` | experiment-layout | qpcr-analysis, bca-assay, seeding-calc |
| `sample-list` | `{ samples: {name: string, conc?: number, a260_280?: number, a260_230?: number}[] }` | rt-calc, bca-assay (from Nanodrop) | qpcr-analysis, seeding-calc |
| `conc-data` | `{ results: {well: string, sample: string, conc: number, unit: string}[] }` | bca-assay | seeding-calc, rt-calc |
| `qpcr-results` | `{ runs: RunData[], deltaCq?: DeltaCqResult[] }` | qpcr-analysis | — (archive / export) |
| `rt-config` | `{ kit: string, targetRNA: number, maxRNAVol: number, reagentVols: Record<string,number> }` | rt-calc | — (protocol reuse) |
| `protocol` | `{ steps: {name, durationMin, durationSec, slot?}[] }` | stain-timer | — |
| `seeding-plan` | `{ wells: {well, density, volume, media}[] }` | seeding-calc | experiment-layout |
| `generic` | `any` | any tool | any tool (user-specified) |

### Well ID Convention

All tools use the same well ID format: `A1`, `B12`, etc. (row letter + column number,
1-indexed). This is the key to cross-tool plate data compatibility.

---

## API Design (`labtools-workbench.js`)

### Core CRUD

```js
// Put data — returns item id
workbench.put(type: string, label: string, data: any,
              metadata?: object, tool?: string): Promise<string>

// Query
workbench.getAll(): Promise<WorkbenchItem[]>
workbench.getByType(type: string): Promise<WorkbenchItem[]>
workbench.getLatest(type: string): Promise<WorkbenchItem | null>
workbench.getItem(id: string): Promise<WorkbenchItem | null>

// Manage
workbench.remove(id: string): Promise<void>
workbench.clear(): Promise<void>
workbench.updateLabel(id: string, label: string): Promise<void>
workbench.updateData(id: string, data: any): Promise<void>
```

### Export / Import

```js
// Export entire workbench as downloadable JSON file
workbench.exportJSON(): Promise<string>

// Import from JSON (previously exported)
workbench.importJSON(json: string): Promise<{imported: number, skipped: number}>
```

### Real-time Sync

```js
// Subscribe to changes (from ANY tab)
// Returns unsubscribe function
workbench.onChange(callback: (event: {action: 'put'|'remove'|'clear'|'update',
                                       item?: WorkbenchItem}) => void): () => void
```

### Usage Example (in a tool)

```js
// Send to workbench
async function sendToWorkbench() {
  const id = await workbench.put('plate-layout', '96-well Experiment',
    { wells: currentWells, groups: currentGroups },
    { wellCount: 96, plateFormat: '96' },
    'experiment-layout');
  showToast(`Layout saved to Workbench`);
}

// Load from workbench with type filter
async function loadFromWorkbench() {
  const items = await workbench.getByType('plate-layout');
  if (items.length === 0) { showToast('No plate layouts in Workbench'); return; }
  showPicker(items); // User selects, then apply
}
```

---

## Root Page: Workbench Drawer (index.html)

### Layout

```
┌──────────┬──────────────────────────────────────────┐
│          │                                          │
│  Tool    │  Current tool content                    │
│  Links   │                                          │
│          │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
                                              [📋]  ← floating toggle button
                                       ┌──────────┐
                                       │ Workbench │
                                       │ ────────  │
                                       │           │
                                       │ 📋 Plate  │
                                       │ Layouts   │
                                       │ 96-well.. │
                                       │ 384-well..│
                                       │           │
                                       │ 🧪 Sample │
                                       │ Lists     │
                                       │ CSF bio.. │
                                       │           │
                                       │ 📊 Conc   │
                                       │ Data      │
                                       │ BCA run.. │
                                       │           │
                                       │ [Clear]   │
                                       │ [Export]  │
                                       └──────────┘
```

### Drawer Features

- **Slide-in from right**, 360px wide
- **Floating toggle button** (📋 icon, fixed bottom-right, always visible on root page)
- **Grouped by type** with type badges (color-coded)
- **Each item card**: type badge, label (editable inline), source tool, relative timestamp ("2 min ago"), delete button
- **Empty state**: "No items in Workbench. Use ↑ To Workbench in any tool to add data."
- **Bottom toolbar**: [Clear All] [Export JSON] [Import JSON]
- **Drag from drawer**: HTML5 drag-and-drop — user can drag an item card directly to a tool's drop zone (if the tool page supports it). On the root page this opens the relevant tool.
- **Live updates**: if another tab adds an item, the drawer updates in real-time

### CSS

Use existing design tokens (`--surface`, `--shadow-card`, `--blue`, etc.).
New classes prefixed with `wb-`:
- `.wb-drawer` — the slide-in panel
- `.wb-toggle` — floating button
- `.wb-group` — type group header + badge
- `.wb-card` — item card
- `.wb-card-label` — editable label
- `.wb-card-meta` — source tool + timestamp
- `.wb-card-actions` — delete / drag handle
- `.wb-toolbar` — bottom action bar
- `.wb-empty` — empty state
- `.wb-overlay` — semi-transparent backdrop when drawer is open

---

## Tool Integration Pattern

Each tool needs a minimal set of additions. The pattern is the same for all tools.

### Step 1: Load the workbench script

```html
<script src="../../assets/js/labtools-workbench.js"></script>
```

(Already loaded via existing script tags pattern)

### Step 2: Add Workbench buttons

```html
<!-- In the tool's toolbar area (top-right or next to existing export buttons) -->
<div class="wb-toolbar">
  <button class="lt-btn lt-btn-ghost" id="wb-put">↑ To Workbench</button>
  <button class="lt-btn lt-btn-ghost" id="wb-get">↓ From Workbench</button>
</div>
```

### Step 3: Wire up "To Workbench" (PUT)

```js
document.getElementById('wb-put').addEventListener('click', async () => {
  // Each tool provides its own serialize function
  const payload = serializeCurrentState();  // tool-specific
  const type    = TOOL_DATA_TYPE;           // tool-specific constant
  const label   = prompt('Label for this item:', generateDefaultLabel());

  if (!label) return;
  await workbench.put(type, label, payload, buildMetadata(), TOOL_NAME);
  showToast(`✓ Saved to Workbench`);
});
```

### Step 4: Wire up "From Workbench" (GET)

```js
document.getElementById('wb-get').addEventListener('click', async () => {
  const items = await workbench.getByType(TOOL_DATA_TYPE);
  if (items.length === 0) {
    showToast('No matching data in Workbench');
    return;
  }
  // Show a picker (simple dropdown or modal list)
  const item = await pickFromList(items);
  if (!item) return;
  applyWorkbenchData(item.data);  // tool-specific deserializer
  showToast(`✓ Applied "${item.label}"`);
});
```

### Step 5: (Optional) Auto-match hint

```js
// On tool load, check if workbench has relevant data
workbench.getByType(TOOL_DATA_TYPE).then(items => {
  if (items.length > 0) {
    showBanner(`${items.length} item(s) in Workbench — click ↓ From Workbench to apply`);
  }
});
```

### Step 6: (Optional) Drag-drop receive

```js
// If the tool has a natural drop target (e.g., plate grid, sample table)
dropTarget.addEventListener('dragover', e => {
  e.preventDefault();
  if (e.dataTransfer.types.includes('application/labtools-workbench-item')) {
    dropTarget.classList.add('wb-drop-active');
  }
});

dropTarget.addEventListener('drop', async e => {
  e.preventDefault();
  dropTarget.classList.remove('wb-drop-active');
  const itemId = e.dataTransfer.getData('application/labtools-workbench-item');
  const item = await workbench.getItem(itemId);
  if (item && item.type === TOOL_DATA_TYPE) {
    applyWorkbenchData(item.data);
  }
});
```

---

## Cross-Tab Sync (BroadcastChannel)

### How it works

```
Tab A (experiment-layout)          Tab B (qpcr-analysis)
        │                                    │
        │ workbench.put(...)                  │
        │   → IndexedDB write                 │
        │   → broadcast({action:'put', id})    │
        │                                    │
        │                          onChange callback fires
        │                          → re-render get-picker
        │                          → show notification
```

`BroadcastChannel` sends a tiny message (action + item id) to all same-origin tabs.
The receiving tab reads the actual data from IndexedDB. This keeps the channel
lightweight and data consistent.

```js
const channel = new BroadcastChannel('labtools-workbench');

async function broadcast(action, id) {
  channel.postMessage({ action, id, timestamp: Date.now() });
}

channel.onmessage = async (event) => {
  const { action, id } = event.data;
  // Ignore own messages
  if (event.data._sender === instanceId) return;

  // Re-read from DB to stay consistent
  const item = action === 'remove' ? null : await getItem(id);
  notifyListeners({ action, item });
};
```

### Fallback

If `BroadcastChannel` is not available (older browsers), fall back to
`localStorage` `storage` event. The channel name is used as the localStorage key.

---

## Export / Import

### Export

User clicks **[Export JSON]** in the drawer. Downloads a `.labtools-workbench.json` file:

```json
{
  "version": 1,
  "exportedAt": "2026-06-27T12:00:00Z",
  "items": [
    {
      "id": "uuid-1",
      "type": "plate-layout",
      "label": "96-well Experiment",
      "tool": "experiment-layout",
      "timestamp": 1719000000000,
      "data": { ... },
      "metadata": { "wellCount": 96 }
    }
  ]
}
```

### Import

User clicks **[Import JSON]**, selects a `.labtools-workbench.json` file.
Items are merged into the current workbench (duplicate IDs are skipped).

---

## Per-Tool Serialization Specs

### experiment-layout → `plate-layout`

```js
function serializeCurrentState() {
  return {
    wells: currentLayout, // { A1: {group:'Control', color:'#eee'}, ... }
    groups: currentGroups // [{ name:'Control', color:'#eee' }, ...]
  };
}
```

Consumer: `applyWorkbenchData(data)` overwrites `currentLayout` and `currentGroups`,
then re-renders the plate grid.

### bca-assay → `conc-data`

```js
function serializeCurrentState() {
  // Export only calculated concentration results (not raw ODs)
  return {
    results: results.map(r => ({
      well: r.well, sample: r.sample, conc: r.conc, unit: concUnit
    }))
  };
}
```

Consumer: if user is in the plate-based import flow, populate wells.
Otherwise, populate the manual-mode sample list.

### rt-calc → `sample-list`

```js
function serializeCurrentState() {
  return {
    samples: samples.map(s => ({
      name: s.name, conc: s.conc, a260_280: s.a260_280, a260_230: s.a260_230
    }))
  };
}
```

### qpcr-analysis → consumer of `plate-layout`

```js
function applyWorkbenchData(data) {
  // Map plate-layout groups to sample groups or gene groups
  // depending on current mode (check current segment/tab)
  if (currentMode === 'sample') {
    data.groups.forEach(g => assignSampleGroup(g.name, g.wells));
  } else if (currentMode === 'gene') {
    data.groups.forEach(g => assignGeneGroup(g.name, g.wells));
  }
  renderPlate(); // re-render the 96-well SVG plate
}
```

### stain-timer → `protocol`

```js
function serializeCurrentState() {
  return { steps: protocol.map(s => ({ ...s })) };
}
```

### cell-count → `sample-list` (partial)

```js
function serializeCurrentState() {
  const density = document.getElementById('res-density').textContent;
  return {
    samples: [{ name: 'Cell Suspension', conc: parseDensityForConc(density) }]
  };
}
```

---

## Implementation Plan

### Phase 1: Core Library + Root Drawer (foundation)

**Files to create/modify:**
1. `assets/js/labtools-workbench.js` — full API, IndexedDB, BroadcastChannel
2. `index.html` — workbench drawer UI (CSS + HTML + JS)
3. `assets/css/labtools.css` — `.wb-*` CSS classes

**Deliverable:** Working workbench drawer on root page. Can manually add items
via browser console. Export/Import works.

### Phase 2: Integrate First 3 Tools (validation)

Pick 3 tools with clear producer/consumer relationships:

1. **experiment-layout** (producer: plate-layout)
2. **qpcr-analysis** (consumer: plate-layout)
3. **bca-assay** (producer: conc-data)

**Verify:** Design plate in experiment-layout → send to workbench →
switch to qpcr-analysis → apply as sample groups → plate SVG updates.
Then run BCA → send results → verify they appear in workbench drawer.

### Phase 3: Integrate Remaining Tools

4. **rt-calc** — producer of `sample-list`, consumer of `conc-data`
5. **seeding-calc** — consumer of `conc-data` + `sample-list`, producer of `seeding-plan`
6. **cell-count** — producer of `sample-list` (single-sample)
7. **stain-timer** — producer of `protocol`
8. **thermal-to-laser** — consumer of `plate-layout` (well positions → laser targets)

### Phase 4: Polish

- Drag-drop from drawer to tool drop zones
- Auto-match banner hints
- Undo support for import operations
- Item search/filter in drawer
- Keyboard shortcuts

---

## File Manifest

| File | Action | Description |
|------|--------|-------------|
| `assets/js/labtools-workbench.js` | **Create** | Core API + IndexedDB + BroadcastChannel |
| `assets/css/labtools.css` | **Modify** | Add `.wb-*` CSS (~80 lines) |
| `index.html` | **Modify** | Add drawer HTML/CSS/JS + toggle button |
| `tools/experiment-layout/index.html` | **Modify** | Add wb-put + wb-get buttons + serialize |
| `tools/qpcr-analysis/index.html` | **Modify** | Add wb-get with mode-aware import |
| `tools/bca-assay/index.html` | **Modify** | Add wb-put (conc-data) + wb-get (plate-layout) |
| `tools/rt-calc/index.html` | **Modify** | Add wb-put (sample-list) + wb-get (conc-data) |
| `tools/seeding-calc/index.html` | **Modify** | Add wb-get (conc-data, sample-list) + wb-put (seeding-plan) |
| `tools/cell-count/index.html` | **Modify** | Add wb-put (sample-list) |
| `tools/stain-timer/index.html` | **Modify** | Add wb-put (protocol) |
| `tools/thermal-to-laser/index.html` | **Modify** | Add wb-get (plate-layout) |
| `TODO.md` | **Modify** | Add workbench to roadmap |

---

## Open Design Decisions

1. **Plate generator integration** — you mentioned "well plate generator" as a source.
   Is this a new tool you want Claude to build, or does experiment-layout cover this?

2. **Auto-pick behavior** — when qpcr-analysis has gene mode active and user pulls
   a plate-layout, should it auto-apply to "gene groups" without asking, or always
   show a mode selector (sample vs gene)?

3. **Duplicate handling** — if user sends the same plate layout twice, keep both
   (with different timestamps) or replace the previous one of the same type+label?

4. **Workbench drawer on tool pages too?** — should individual tool pages also show
   the full drawer, or only the root page? (I recommend root page only, tools get
   the compact put/get buttons)

5. **`drug-dosage`** — skip for now since it's disabled?
