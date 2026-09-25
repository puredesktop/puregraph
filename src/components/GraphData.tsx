import { GraphField } from './GraphField'
import { GraphPanel, ControlRow } from './GraphPanel'
import { useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import type { GraphElement } from '../lib/graphParser'
import { isEdge, type GraphCommand } from '../lib/graphCommands'
import { mergeGraphElements, previewGraphImport } from '../lib/graphImport'

const Surface = styled(GraphPanel)`
  textarea { min-height: 96px; resize: vertical; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { color: var(--pure-chrome-muted, #67727d); font-size: 11px; font-weight: 500; }
  th, td { text-align: left; padding: 5px 3px; }
  th:first-child, td:first-child { width: 28px; }
  td input:not([type=checkbox]) { min-width: 64px; padding: 6px; }
`
export function GraphData({ elements, documentKey, onCommand, selected, onSelect }: {
  elements: GraphElement[]; documentKey: string; selected: string[]; onSelect: (ids: string[]) => void; onCommand: (commands: GraphCommand[]) => void
}) {
  const [kind, setKind] = useState<'nodes' | 'edges'>('nodes'), [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const setSelected = onSelect
  const [text, setText] = useState(''), [preview, setPreview] = useState<ReturnType<typeof previewGraphImport> | null>(null)
  const [error, setError] = useState(''), [label, setLabel] = useState('')
  const generation = useRef(0)
  const draftRef = useRef({ text: '', query: '' })
  draftRef.current = { text, query }
  useEffect(() => {
    generation.current++; setPreview(null); setPage(0)
    try { const draft = JSON.parse(localStorage.getItem(`puregraph.import:${documentKey}`) || '{}'); setText(draft.text || ''); setQuery(draft.query || '') } catch { setText(''); setQuery('') }
    return () => { generation.current++; try { localStorage.setItem(`puregraph.import:${documentKey}`, JSON.stringify(draftRef.current)) } catch { /* A draft remains available while the panel is mounted. */ } }
  }, [documentKey])
  const filtered = useMemo(() => elements.filter(element => (isEdge(element) ? 'edges' : 'nodes') === kind && JSON.stringify(element.data).toLowerCase().includes(query.toLowerCase())), [elements, kind, query])
  const effectivePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 30) - 1))
  useEffect(() => setPage(effectivePage), [effectivePage])
  const visible = filtered.slice(effectivePage * 30, effectivePage * 30 + 30)
  function run(action: () => void) { try { action(); setError('') } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) } }
  function commit(commands: GraphCommand[]) { run(() => onCommand(commands)) }
  async function file(file: File | undefined) {
    if (!file) return
    const ticket = ++generation.current
    try {
      const content = await file.text()
      if (ticket !== generation.current) return
      setText(content); setPreview(previewGraphImport(content)); setError('')
    } catch (failure) { if (ticket === generation.current) setError(String(failure)) }
  }
  return <Surface aria-label="Graph data editor">
    <h2>Data</h2>
    <p>Edit your nodes and connections, or import a table.</p>
    <ControlRow>{(['nodes', 'edges'] as const).map(value => <button key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setPage(0); setSelected([]) }}>{value}</button>)}</ControlRow>
    <label>Search<input value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /></label>
    <p>{filtered.length} {kind} · {selected.length} selected</p>
    <button onClick={() => setSelected(visible.map(element => element.data.id!))}>Select this page</button>
    <div style={{ overflowX: 'auto' }}><table aria-label={`${kind} table`}>
      <thead><tr><th aria-label="Select"></th><th>ID</th><th>Label</th>{kind === 'nodes' && <th>Category</th>}{kind === 'edges' && <><th>Source</th><th>Target</th></>}</tr></thead>
      <tbody>{visible.map(element => <tr key={element.data.id}>
        <td><input type="checkbox" aria-label={`Select ${element.data.id}`} checked={selected.includes(element.data.id!)} onChange={event => setSelected(event.target.checked ? [...selected, element.data.id!] : selected.filter(id => id !== element.data.id))} /></td>
        {['id', 'label', ...(kind === 'edges' ? ['source', 'target'] : ['category'])].map(field => <td key={field}><GraphField label={`${element.data.id} ${field}`} value={String(element.data[field] ?? '')} onCommit={value => {
          onCommand([field === 'id' ? { type: 'rename', id: element.data.id!, nextId: value } : { type: 'update', ids: [element.data.id!], data: { [field]: value } }])
          if (field === 'id') onSelect(selected.map(id => id === element.data.id ? value : id))
        }} /></td>)}
      </tr>)}</tbody>
    </table></div>
    <ControlRow><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button> <button disabled={(page + 1) * 30 >= filtered.length} onClick={() => setPage(page + 1)}>Next</button></ControlRow>
    {selected.length > 0 && <>
      <label>Label for selected elements<input value={label} onChange={event => setLabel(event.target.value)} /></label>
      <button onClick={() => commit([{ type: 'update', ids: selected, data: { label } }])}>Apply label to selected</button>
      <button onClick={() => run(() => { onCommand([{ type: 'remove', ids: selected }]); setSelected([]) })}>Delete selected and connected edges</button>
    </>}
    <h3>Import data</h3>
    <label>Paste JSON, CSV or TSV<textarea aria-label="Import data" value={text} onChange={event => { generation.current++; setText(event.target.value); setPreview(null) }} placeholder={'id,label\na,First node\nb,Second node'} /></label>
    <label>Import file<input type="file" accept=".json,.csv,.tsv" onChange={event => void file(event.target.files?.[0])} /></label>
    <button onClick={() => run(() => setPreview(previewGraphImport(text)))}>Preview import</button>
    {preview && <>
      <p>{preview.elements.filter(element => !isEdge(element)).length} nodes · {preview.elements.filter(isEdge).length} edges ready.</p>
      {preview.notes.map(note => <p key={note}>{note}</p>)}
      <p>Replace removes the current {elements.length} elements. Merge keeps existing elements with matching IDs and rejects conflicting edges.</p>
      <button onClick={() => run(() => { onCommand([{ type: 'replace', elements: mergeGraphElements(elements, preview.elements) }]); setPreview(null) })}>Merge into graph</button>
      <button onClick={() => run(() => { onCommand([preview.document ? { type: 'document', document: preview.document } : { type: 'replace', elements: preview.elements }]); setPreview(null) })}>Replace graph</button>
      <button onClick={() => setPreview(null)}>Cancel import</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </Surface>
}
