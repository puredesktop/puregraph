import { viewElements } from '../lib/graphExplore'
import { encodingLegend } from '../lib/graphEncoding'
import { encodedGraphDocument } from '../lib/graphEncoding'
import cytoscapeRuntime from 'puregraph-cytoscape-runtime?raw'
import viewerRuntime from './graphHtmlViewer.js?raw'
import viewerCss from './graphHtmlViewer.css?raw'
import type { GraphDocument } from '../lib/graphDocument'
import { buildStyle } from './graphStyle'

import { visualKeys, type GraphHtmlOptions } from '../lib/graphHtmlOptions'
export { graphAttributeKeys, type GraphHtmlOptions } from '../lib/graphHtmlOptions'

/** JSON is embedded as inert script text, never HTML or executable source. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}
export function graphHtmlPayload(document: GraphDocument, options: GraphHtmlOptions = {}, selectedIds: string[] = []) {
  document = encodedGraphDocument(document)
  const selected = new Set(selectedIds)
  const nodes = document.elements.filter(element => element.data.source === undefined && (!options.selectedOnly || selected.has(String(element.data.id))))
  if (!nodes.length) throw new Error(options.selectedOnly ? 'Select at least one node to export.' : 'Add nodes before exporting HTML.')
  const ids = new Set(nodes.map(node => node.data.id))
  const elements = [...nodes, ...document.elements.filter(element => element.data.source !== undefined && ids.has(element.data.source) && ids.has(element.data.target))]
  const allowed = new Set(options.attributeKeys ?? [])
  const sourceStyles = buildStyle(document.style)
  const styles = sourceStyles.map(rule => ({ selector: rule.selector, style: Object.fromEntries(Object.entries(rule.style).filter(([, value]) => typeof value !== 'function')) }))
  const exported = elements.map((element, index) => {
    const data = Object.fromEntries(Object.entries(element.data).filter(([key]) => visualKeys.has(key) || allowed.has(key)))
    // Resolve the editor's function-valued styles before serialization. No eval
    // or duplicate palette implementation is needed in the offline viewer.
    if (element.data.source === undefined) {
      for (const rule of sourceStyles) {
        if (rule.selector !== 'node' && rule.selector !== 'node[size]') continue
        if (rule.selector === 'node[size]' && element.data.size === undefined) continue
        const computed = Object.fromEntries(Object.entries(rule.style).filter(([, value]) => typeof value === 'function').map(([key, value]) => [key, (value as Function)({ data: (key?: string) => key ? element.data[key] : element.data })]))
        styles.push({ selector: `.export-${index}`, style: computed })
      }
    }
    return { data, position: element.position ? { ...element.position } : undefined, classes: `export-${index}` }
  })
  const exportedIds = new Set(exported.map(element => element.data.id))
  const views = options.includeViews === false ? [] : (document.views ?? []).map(view => ({ id: view.id, name: view.name, caption: view.caption, hidden: [], focus: viewElements(document.elements, view.state).map(element => element.data.id).filter(id => exportedIds.has(id)), selectedIds: view.selectedIds.filter(id => exportedIds.has(id)) }))
  return { views, initialViewId: options.initialViewId, legend: encodingLegend(document), title: document.title, background: document.style.backgroundColor, directed: document.style.directed, elements: exported, styles }
}
export function graphHtml(document: GraphDocument, options: GraphHtmlOptions = {}, selectedIds: string[] = []): string {
  const payload = graphHtmlPayload(document, options, selectedIds)
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'">
<title>PureGraph · Interactive graph</title><style>${viewerCss}</style></head>
<body><header><div><p class="eyebrow">PUREGRAPH · EXPLORER</p><h1 id="title"></h1></div><button id="reset">Reset view</button></header>
<main><aside aria-label="Explore graph"><label for="search">Find a node</label><input id="search" type="search" placeholder="Search labels, IDs, or included attributes"><div id="results"></div>
<div id="encoding-legend"></div><fieldset><legend>Categories</legend><div id="categories"></div></fieldset>
<div class="actions"><button id="fit">Fit visible graph</button><button id="table-toggle" aria-expanded="false">Show data table</button></div>
<fieldset><legend>Saved views</legend><label for="view-name">Caption</label><input id="view-name" maxlength="160" placeholder="A view worth returning to"><button id="save-view">Save this view</button><div id="views"></div><button id="download-views">Download HTML with saved views</button><small>Download a new copy to keep your views and captions.</small></fieldset>
<p id="status" role="status" aria-live="polite"></p><small>Drag to pan. Scroll or pinch to zoom. Use search or the table to explore with a keyboard. This file works offline.</small></aside>
<section class="stage" aria-label="Graph viewer"><div id="graph" role="img" aria-label="Interactive relationship graph; use search or the data table for keyboard access"></div><div id="table-panel" hidden><h2>Visible graph data</h2><table><caption>Nodes and relationships in the current view</caption><thead><tr><th>Element</th><th>From</th><th>To</th><th>Category</th></tr></thead><tbody id="rows"></tbody></table></div></section>
<aside id="details" aria-label="Element details"><h2>Explore a connection</h2><p>Select a node or relationship to see its details. Search and category filters help narrow the graph.</p></aside></main>
<script id="graph-data" type="application/json">${scriptJson(payload)}</script>
<script>${cytoscapeRuntime.replace(/<\/script/gi, '<\\/script')}</script><script>${viewerRuntime}</script></body></html>`
}
