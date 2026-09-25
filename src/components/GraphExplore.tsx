import { useMemo, useState } from 'react'
import { GraphPanel, ControlRow } from './GraphPanel'
import { GraphNodePicker } from './GraphNodePicker'
import { GraphField } from './GraphField'
import type { GraphDocument } from '../lib/graphDocument'
import type { GraphCommand } from '../lib/graphCommands'
import { connectedComponents, shortestPath } from '../lib/graphAnalysis'
import { emptyGraphView, graphCategory, graphNeighborhood, queryGraph, viewElements, compareGraphElements, type GraphViewState, type GraphSavedView } from '../lib/graphExplore'
import { previewGraphImport } from '../lib/graphImport'

export function GraphExplore({ document, selectedIds, view, onView, onSelect, onCommand, onFit, onSaveView, onOpenView }: {
  document: GraphDocument; selectedIds: string[]; view: GraphViewState; onView: (view: GraphViewState) => void; onSelect: (ids: string[]) => void; onCommand: (commands: GraphCommand[]) => void; onFit: () => void
  onSaveView: (name: string, caption: string) => void; onOpenView: (view: GraphSavedView) => void
}) {
  const [query, setQuery] = useState(''), [offset, setOffset] = useState(0), [depth, setDepth] = useState(1)
  const [start, setStart] = useState(''), [end, setEnd] = useState(''), [message, setMessage] = useState('')
  const [name, setName] = useState(''), [caption, setCaption] = useState(''), [comparison, setComparison] = useState('')
  const shown = useMemo(() => viewElements(document.elements, view), [document.elements, view])
  const matches = useMemo(() => queryGraph(document.elements, { query, offset, limit: 30 }), [document.elements, query, offset])
  const categories = [...new Set(document.elements.filter(element => !element.data.source).map(graphCategory))].sort()
  const selected = document.elements.find(element => element.data.id === selectedIds[0])
  const run = (action: () => void) => { try { action(); setMessage('') } catch (error) { setMessage(String(error)) } }
  const focus = (ids: string[]) => { onSelect(ids); onView({ ...view, focusIds: ids }) }
  function evidence(field: string, value: string) {
    if (field === 'sourceUrl' && value && !/^https?:\/\/\S+$/i.test(value)) throw new Error('Use a full http:// or https:// source URL.')
    if (field === 'confidence' && value && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1)) throw new Error('Confidence must be between 0 and 1.')
    onCommand([{ type: 'update', ids: [selected!.data.id!], data: { [field]: field === 'confidence' && value ? Number(value) : value } }])
  }
  return <GraphPanel aria-label="Explore graph">
    <h2>Explore</h2>
    <p>{shown.filter(element => !element.data.source).length} nodes · {shown.filter(element => element.data.source).length} relationships in this view</p>
    <ControlRow><button onClick={() => { onView(emptyGraphView()); onSelect([]) }}>Reset view</button><button onClick={onFit}>Fit view</button></ControlRow>
    <label>Find nodes or relationships<input value={query} onChange={event => { setQuery(event.target.value); setOffset(0) }} /></label>
    {query && <><p>{matches.total} matches</p>{matches.elements.map(element => <button key={element.data.id} onClick={() => onSelect([element.data.id!])}>{String(element.data.label || element.data.id)} · {element.data.id}</button>)}<ControlRow><button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 30))}>Previous matches</button><button disabled={matches.nextOffset === null} onClick={() => setOffset(matches.nextOffset!)}>More matches</button></ControlRow></>}
    <details><summary>Categories and focus</summary>
      {categories.map(category => <label key={category}><span><input type="checkbox" checked={!view.hiddenCategories.includes(category)} onChange={event => onView({ ...view, hiddenCategories: event.target.checked ? view.hiddenCategories.filter(item => item !== category) : [...view.hiddenCategories, category] })} /> {category}</span></label>)}
      <label><span><input type="checkbox" checked={view.mode === 'dim'} onChange={event => onView({ ...view, mode: event.target.checked ? 'dim' : 'hide' })} /> Dim excluded elements instead of hiding</span></label>
      <button disabled={!selectedIds.length} onClick={() => focus(selectedIds)}>Focus selection</button>
    </details>
    <h3>Connections</h3>
    <p>{selected && !selected.data.source ? `Around ${selected.data.label || selected.data.id}` : 'Select a node on the canvas, in search, or in Data.'}</p>
    <label>Neighborhood depth<input type="number" min={1} max={10} value={depth} onChange={event => setDepth(Number(event.target.value))} /></label>
    <ControlRow>{(['incoming', 'outgoing', 'both'] as const).map(direction => <button key={direction} disabled={!selected || !!selected.data.source} onClick={() => run(() => focus(graphNeighborhood(document.elements, selected!.data.id!, depth, direction)))}>{direction}</button>)}</ControlRow>
    <details><summary>Find a path</summary>
      <GraphNodePicker label="Path start" value={start} onChange={setStart} elements={shown} /><GraphNodePicker label="Path end" value={end} onChange={setEnd} elements={shown} />
      <p>Fewest relationships, {document.style.directed ? 'following arrows' : 'in either direction'}, within this view.</p>
      <button onClick={() => { try { const path = shortestPath(shown, start, end, document.style.directed); if (path) { focus([...path.nodes, ...path.edges]); setMessage(`${path.edges.length} relationships: ${path.nodes.join(' → ')}`) } else setMessage('No path in this view. Reset the view to search the whole graph.') } catch (error) { setMessage(String(error)) } }}>Find and focus path</button>
    </details>
    {selected && <details open key={selected.data.id}><summary>Details · {selected.data.label || selected.data.id}</summary>
      <p>{selected.data.id}{selected.data.source ? ` · ${selected.data.source} → ${selected.data.target}` : ` · ${graphCategory(selected)}`}</p>
      {['label', 'category', 'notes', 'sourceUrl', 'provenance', 'date', 'confidence'].map(field => <label key={field}>{field}<GraphField label={`Selected ${field}`} value={String(selected.data[field] ?? '')} onCommit={value => evidence(field, value)} /></label>)}
      <label><span><input type="checkbox" checked={selected.data.synthetic === true} onChange={event => onCommand([{ type: 'update', ids: [selected.data.id!], data: { synthetic: event.target.checked } }])} /> Synthetic / illustrative data</span></label>
      <p>Style source: {selected.data.color ? 'explicit element color overrides the palette' : document.style.categoryColors?.[graphCategory(selected)] ? 'category palette' : 'graph defaults or built-in category'}.</p>
      <button onClick={() => run(() => onCommand([{ type: 'update', ids: selectedIds, data: { color: undefined, shape: undefined, size: undefined, width: undefined, borderWidth: undefined } }]))}>Reset selected style overrides</button>
      <details><summary>All attributes</summary><dl>{Object.entries(selected.data).map(([key, value]) => <div key={key}><dt>{key}</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></details>
    </details>}
    <details><summary>Saved views and story</summary>
      <label>View name<input value={name} maxLength={160} onChange={event => setName(event.target.value)} /></label><label>Caption<textarea value={caption} onChange={event => setCaption(event.target.value)} /></label>
      <button onClick={() => run(() => { onSaveView(name, caption); setName(''); setCaption('') })}>Save view</button>
      {(document.views ?? []).map((saved, index) => <div key={saved.id}><button onClick={() => onOpenView(saved)}>{index + 1}. {saved.name}</button><p>{saved.caption}</p><ControlRow><button disabled={index === 0} onClick={() => { const views = [...document.views!]; [views[index - 1], views[index]] = [views[index], views[index - 1]]; onCommand([{ type: 'views', views }]) }}>Move earlier</button><button onClick={() => onCommand([{ type: 'views', views: document.views!.filter(item => item.id !== saved.id) }])}>Delete view</button></ControlRow></div>)}
      <p>Views and captions are saved with the graph and can be included in HTML exports.</p>
    </details>
    <details><summary>What-if scenario</summary><p>Temporarily exclude selected nodes or relationships. The underlying graph stays intact.</p><button disabled={!selectedIds.length} onClick={() => onView({ ...view, hiddenIds: [...new Set([...view.hiddenIds, ...selectedIds])] })}>Exclude selection</button><p>{view.hiddenIds.length} excluded · {connectedComponents(shown).length} components now; {connectedComponents(document.elements).length} in the full graph.</p><button onClick={() => onView({ ...view, hiddenIds: [] })}>Restore excluded elements</button></details>
    <details><summary>Time window</summary><p>Filter a date attribute. Undated elements remain visible; invalid dates are excluded.</p>{(['field', 'from', 'to'] as const).map(field => <label key={field}>{field}<input type={field === 'field' ? 'text' : 'date'} value={view.time?.[field] || ''} onChange={event => onView({ ...view, time: { field: '', from: '', to: '', ...view.time, [field]: event.target.value } })} /></label>)}</details>
    <details><summary>Compare another graph</summary><p>Comparison uses element IDs. Nothing is imported until you choose an import action in Data.</p><textarea aria-label="Graph comparison data" value={comparison} onChange={event => setComparison(event.target.value)} /><button onClick={() => { try { const diff = compareGraphElements(document.elements, previewGraphImport(comparison).elements); setMessage(`Added: ${diff.added.join(', ') || 'none'}. Removed: ${diff.removed.join(', ') || 'none'}. Changed: ${diff.changed.join(', ') || 'none'}.`) } catch (error) { setMessage(String(error)) } }}>Compare</button></details>
    <p role="status">{message}</p>
  </GraphPanel>
}
