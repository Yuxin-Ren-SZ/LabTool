'use strict';

/**
 * LabTools — hub renderer (manifest-driven)
 * ==========================================
 * Renders the tool cards (grouped by category + live search), the workflow
 * chain section, and the recent-sessions / continue section from
 * assets/js/labtools-hub-config.js and labtools-workflow.js session storage.
 * index.html keeps only the hero, containers, and footer.
 *
 * Element contract (index.html):
 *   #toolSearch, #toolSearchEmpty, #toolGroups   — search + grouped cards
 *   #hubChains, #hubSessions                     — workflow + session sections
 */

(function (root) {
  (root.__labtoolsLoadOrder = root.__labtoolsLoadOrder || []).push('labtools-hub');

  const TOOLS = root.LABTOOLS_HUB_TOOLS || [];
  const CHAINS = root.LABTOOLS_HUB_CHAINS || [];
  const NAME_BY_ID = {};
  TOOLS.forEach(t => { NAME_BY_ID[t.id] = t; });

  // Register the chain graph with the shared workflow module (when loaded).
  if (typeof labtools !== 'undefined' && labtools.workflow && labtools.workflow.defineChain) {
    const byFrom = {};
    CHAINS.forEach(edge => { (byFrom[edge.from] = byFrom[edge.from] || []).push({ tool: edge.to, label: edge.label }); });
    Object.keys(byFrom).forEach(from => labtools.workflow.defineChain(from, byFrom[from]));
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function buildCard(tool) {
    const a = document.createElement('a');
    a.className = 'tool-card';
    a.href = tool.href;
    a.setAttribute('data-search',
      (tool.name + ' ' + tool.desc + ' ' + tool.category).toLowerCase());
    a.innerHTML =
      '<div class="tool-card-icon">' + tool.icon + '</div>' +
      '<div class="tool-card-name"></div>' +
      '<div class="tool-card-desc"></div>' +
      '<div class="tool-card-footer">' +
        '<span class="lt-badge ' + (tool.badge === 'Live' ? 'lt-badge-green' : 'lt-badge-default') + '"></span>' +
        '<span class="tool-card-launch">Open →</span>' +
      '</div>';
    a.querySelector('.tool-card-name').textContent = tool.name;
    a.querySelector('.tool-card-desc').textContent = tool.desc;
    a.querySelector('.lt-badge').textContent = tool.badge;
    return a;
  }

  function renderGroups(host) {
    const categories = [];
    TOOLS.forEach(t => { if (categories.indexOf(t.category) === -1) categories.push(t.category); });

    categories.forEach(category => {
      const group = el('div', 'tool-group');
      group.setAttribute('data-group', '');
      group.appendChild(el('div', 'lt-section-label', category));
      const grid = el('div', 'tools-grid');
      TOOLS.filter(t => t.category === category).forEach(t => grid.appendChild(buildCard(t)));
      group.appendChild(grid);
      host.appendChild(group);
    });
  }

  function renderChains(host) {
    host.innerHTML = '';
    // Group edges by source tool for compact "A → B · C" lines.
    const byFrom = {};
    CHAINS.forEach(edge => { (byFrom[edge.from] = byFrom[edge.from] || []).push(edge); });
    const lines = Object.keys(byFrom);
    if (!lines.length) { host.hidden = true; return; }

    lines.forEach(from => {
      const row = el('div', 'chain-row');
      const src = NAME_BY_ID[from];
      row.appendChild(el('span', 'chain-tool', src ? src.icon + ' ' + src.name : from));
      byFrom[from].forEach(edge => {
        const dst = NAME_BY_ID[edge.to];
        const link = el('a', 'chain-link', ' → ' + (dst ? dst.name : edge.to));
        link.href = 'tools/' + edge.to + '/index.html';
        link.title = edge.label;
        row.appendChild(link);
      });
      host.appendChild(row);
    });
  }

  function renderSessions(host) {
    host.innerHTML = '';
    const wf = (typeof labtools !== 'undefined' && labtools.workflow) ? labtools.workflow : null;
    if (!wf || !wf.loadSessions) { host.hidden = true; return; }
    const sessions = wf.loadSessions().slice(0, 5);
    if (!sessions.length) { host.hidden = true; return; }
    host.hidden = false;

    sessions.forEach(session => {
      const row = el('div', 'session-row');
      const info = el('div', 'session-info');
      info.appendChild(el('span', 'session-label', session.label || 'Workflow'));
      const crumbs = (session.steps || []).map(step => {
        const tool = NAME_BY_ID[step.tool];
        return tool ? tool.name : step.tool;
      });
      info.appendChild(el('span', 'session-crumbs', crumbs.join(' → ')));
      row.appendChild(info);

      const last = (session.steps || []).slice(-1)[0];
      const nexts = last && wf.nextFor ? wf.nextFor(last.tool) : [];
      if (last && last.recordId && nexts.length) {
        const cont = el('a', 'lt-btn lt-btn-ghost session-continue',
          '继续 → ' + (NAME_BY_ID[nexts[0].tool] ? NAME_BY_ID[nexts[0].tool].name : nexts[0].tool));
        cont.href = 'tools/' + nexts[0].tool + '/index.html?wbLoad=' + encodeURIComponent(last.recordId) +
          '&wbSession=' + encodeURIComponent(session.id);
        row.appendChild(cont);
      } else if (last && !nexts.length) {
        row.appendChild(el('span', 'lt-badge lt-badge-green', '已完成'));
      }
      host.appendChild(row);
    });
  }

  function wireSearch() {
    const search = document.getElementById('toolSearch');
    const empty = document.getElementById('toolSearchEmpty');
    const groups = Array.prototype.slice.call(document.querySelectorAll('[data-group]'));
    const cards = Array.prototype.slice.call(document.querySelectorAll('.tool-card'));
    if (!search) return;

    search.addEventListener('input', function () {
      const q = search.value.trim().toLowerCase();
      cards.forEach(c => {
        const ds = c.getAttribute('data-search');
        c.hidden = !!(q && (ds == null || ds.indexOf(q) === -1));
      });
      groups.forEach(g => { g.hidden = !g.querySelector('.tool-card:not([hidden])'); });
      const any = cards.some(c => !c.hidden);
      if (empty) {
        empty.hidden = !!any;
        if (!any) empty.querySelector('span').textContent = search.value.trim();
      }
    });
  }

  function init() {
    renderGroups(document.getElementById('toolGroups'));
    renderChains(document.getElementById('hubChains'));
    renderSessions(document.getElementById('hubSessions'));
    wireSearch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
