/* Standalone viewer: embedded verbatim, with no imports or network dependencies. */
(() => {
  'use strict';
  const originalHtml = '<!doctype html>' + document.documentElement.outerHTML;
  const payload = JSON.parse(document.getElementById('graph-data').textContent);
  const el = id => document.getElementById(id);
  const make = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const button = (text, action) => { const node = make('button', text); node.addEventListener('click', action); return node; };
  const label = item => String(item.data('label') || item.id());
  const category = item => String(item.data('category') ?? item.data('cluster') ?? 'Nodes');
  el('title').textContent = payload.title;
  document.title = `${payload.title} · PureGraph`;
  el('graph').style.backgroundColor = payload.background;
  const cy = cytoscape({ container: el('graph'), elements: payload.elements.filter(item => item.data.source === undefined), style: payload.styles, layout: { name: 'preset' }, autoungrabify: true, minZoom: 0.05, maxZoom: 8 });
  cy.nodes().boundingBox(); cy.style().update();
  cy.add(payload.elements.filter(item => item.data.source !== undefined));
  cy.fit(undefined, 45);
  let focusIds = null, pathStart = null;
  const savedViews = payload.views || [];
  (payload.legend || []).forEach(entry => el('encoding-legend').append(make('p', entry.label)));
  // Saved views are embedded in the artifact; downloading a new copy persists additions.
  const hiddenCategories = new Set();
  const categoryInputs = new Map();
  const visible = () => cy.elements().filter(item => item.visible());
  const say = text => { el('status').textContent = text; };
  function updateTable() {
    if (el('table-panel').hidden) return;
    el('rows').replaceChildren();
    visible().forEach(item => {
      const row = make('tr'), name = make('td');
      name.append(button(label(item), () => inspect(item)));
      row.append(name, make('td', item.isEdge() ? label(item.source()) : '—'), make('td', item.isEdge() ? label(item.target()) : '—'), make('td', item.isNode() ? category(item) : 'Relationship'));
      el('rows').append(row);
    });
  }
  function applyFilter() {
    cy.batch(() => {
      cy.nodes().forEach(node => node.style('display', !hiddenCategories.has(category(node)) && (!focusIds || focusIds.includes(node.id())) ? 'element' : 'none'));
      cy.edges().forEach(edge => edge.style('display', edge.source().style('display') !== 'none' && edge.target().style('display') !== 'none' && (!focusIds || focusIds.includes(edge.id())) ? 'element' : 'none'));
    });
    const shown = visible();
    say(`${shown.nodes().length} of ${cy.nodes().length} nodes · ${shown.edges().length} of ${cy.edges().length} relationships`);
    updateSearch(); updateTable();
  }
  function fit() { const shown = visible(); if (shown.length) cy.fit(shown, 45); }
  function inspect(item) {
    cy.elements().unselect(); item.select();
    const panel = el('details'); panel.replaceChildren(make('h2', label(item)));
    panel.append(make('p', item.isNode() ? category(item) : `${label(item.source())} → ${label(item.target())}`));
    const actions = make('div'); actions.className = 'detail-actions';
    actions.append(button('Locate in graph', () => { el('table-panel').hidden = true; el('table-toggle').textContent = 'Show data table'; el('table-toggle').setAttribute('aria-expanded', 'false'); cy.animate({ center: { eles: item }, duration: 200 }); }));
    if (item.isNode()) {
      actions.append(button('Show immediate connections', () => {
        focusIds = item.closedNeighborhood().map(part => part.id()); applyFilter(); fit();
      }));
      actions.append(button('Start a path here', () => { pathStart = item.id(); say(`Path starts at ${label(item)}. Select another node and choose “Find path to here”.`); inspect(item); }));
      if (pathStart && pathStart !== item.id()) actions.append(button('Find path to here', () => {
        const root = cy.getElementById(pathStart);
        if (!root.visible()) { say('The starting node is hidden. Reset the view or choose a visible starting node.'); return; }
        const result = visible().dijkstra({ root, directed: payload.directed });
        if (!Number.isFinite(result.distanceTo(item))) { say('No path in this view. Reset the view to search the whole graph.'); return; }
        const path = result.pathTo(item); focusIds = path.map(part => part.id()); applyFilter(); fit();
        say(`${path.edges().length} relationship${path.edges().length === 1 ? '' : 's'} in this ${payload.directed ? 'directed' : 'undirected'} path.`);
      }));
      const connections = make('div'); connections.append(make('h2', 'Connected nodes'));
      item.neighborhood().nodes().filter(node => node.visible()).forEach(node => connections.append(button(label(node), () => inspect(node))));
      panel.append(actions, connections);
    } else panel.append(actions);
    const details = make('dl');
    Object.entries(item.data()).forEach(([key, value]) => {
      details.append(make('dt', key)); const dd = make('dd');
      const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      // Links are opt-in navigation; never interpret arbitrary data as markup.
      if (/^https?:\/\/\S+$/i.test(text)) {
        const link = make('a', text); link.href = text; link.target = '_blank'; link.rel = 'noopener noreferrer'; dd.append(link);
      } else dd.textContent = text;
      details.append(dd);
    });
    panel.append(details);
  }
  function updateSearch() {
    const query = el('search').value.trim().toLocaleLowerCase(); el('results').replaceChildren();
    if (!query) return;
    const matches = cy.nodes().filter(node => node.visible() && JSON.stringify(node.data()).toLocaleLowerCase().includes(query));
    matches.slice(0, 60).forEach(node => el('results').append(button(label(node), () => { inspect(node); cy.center(node); })));
    el('results').append(make('small', `${matches.length} matches${matches.length > 60 ? ' · first 60 shown; refine your search' : ''}`));
  }
  [...new Set(cy.nodes().map(category))].sort().forEach(name => {
    const row = make('label'), input = make('input'); input.type = 'checkbox'; input.checked = true;
    const dot = make('span'); dot.className = 'swatch'; dot.style.backgroundColor = cy.nodes().filter(node => category(node) === name)[0].style('background-color');
    input.addEventListener('change', () => { input.checked ? hiddenCategories.delete(name) : hiddenCategories.add(name); applyFilter(); });
    categoryInputs.set(name, input); row.append(input, dot, document.createTextNode(name)); el('categories').append(row);
  });
  el('search').addEventListener('input', updateSearch);
  el('fit').addEventListener('click', fit);
  el('reset').addEventListener('click', () => {
    hiddenCategories.clear(); categoryInputs.forEach(input => { input.checked = true; }); focusIds = null; pathStart = null; el('search').value = '';
    cy.elements().unselect(); el('details').replaceChildren(make('h2', 'Explore a connection'), make('p', 'Select a node or relationship to see its details.')); applyFilter(); fit();
  });
  el('table-toggle').addEventListener('click', () => {
    el('table-panel').hidden = !el('table-panel').hidden;
    el('table-toggle').textContent = el('table-panel').hidden ? 'Show data table' : 'Show graph';
    el('table-toggle').setAttribute('aria-expanded', String(!el('table-panel').hidden)); updateTable();
  });
  function openSaved(saved) {
    hiddenCategories.clear(); (saved.hidden || []).forEach(name => hiddenCategories.add(name)); categoryInputs.forEach((input, name) => { input.checked = !hiddenCategories.has(name); });
    focusIds = saved.focus; applyFilter();
    if (saved.pan && saved.zoom) cy.viewport({ zoom: saved.zoom, pan: saved.pan }); else fit();
    cy.elements().unselect(); (saved.selectedIds || []).forEach(id => cy.getElementById(id).select());
    say(`${saved.caption || saved.name} · ${el('status').textContent}`);
  }
  function renderViews() {
    el('views').replaceChildren();
    savedViews.forEach(saved => {
      const row = make('div'); row.append(button(saved.name, () => openSaved(saved)), button('Remove', () => { savedViews.splice(savedViews.indexOf(saved), 1); renderViews(); }));
      if (saved.caption && saved.caption !== saved.name) row.append(make('small', saved.caption));
      el('views').append(row);
    });
  }
  el('save-view').addEventListener('click', () => {
    const caption = el('view-name').value.trim(); if (!caption) { say('Give this view a caption first.'); el('view-name').focus(); return; }
    savedViews.push({ id: crypto.randomUUID(), name: caption, caption, hidden: [...hiddenCategories], focus: focusIds ? [...focusIds] : null, pan: { ...cy.pan() }, zoom: cy.zoom(), selectedIds: cy.$(':selected').map(item => item.id()) });
    renderViews(); el('view-name').value = ''; say(`Saved view: ${caption}. Download a new HTML copy to keep it.`);
  });
  el('download-views').addEventListener('click', () => {
    const copy = new DOMParser().parseFromString(originalHtml, 'text/html');
    copy.getElementById('graph-data').textContent = JSON.stringify({ ...payload, views: savedViews }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
    const url = URL.createObjectURL(new Blob(['<!doctype html>' + copy.documentElement.outerHTML], { type: 'text/html' }));
    const link = make('a'); link.href = url; link.download = (payload.title.replace(/[^a-z0-9_-]+/gi, '_') || 'graph') + '.html'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  renderViews();
  cy.on('tap', 'node, edge', event => inspect(event.target));
  new ResizeObserver(() => { cy.resize(); fit(); }).observe(el('graph'));
  applyFilter();
  const initial = savedViews.find(view => view.id === payload.initialViewId);
  if (initial) openSaved(initial);
})();
