import { graphExportDocument } from '../lib/graphExportScope'
import type { GraphElement } from '../lib/graphParser'
import { SelectField } from '@purescience/platform-ui/components/common/inputs/SelectField'
import { graphAttributeKeys } from '../lib/graphHtmlOptions'
import { GraphPanel, ControlRow, FieldRow } from './GraphPanel'
import { useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import type { GraphDocument } from '../lib/graphDocument'
import { graphSvg, type GraphExportOptions } from '../canvas/graphExport'
const Panel = styled(GraphPanel)`
  img { width: 100%; border: 1px solid var(--pure-chrome-line, #dce1e5); border-radius: 8px; background: repeating-conic-gradient(#eef0f2 0% 25%, white 0% 50%) 50% / 16px 16px; }
`
export function GraphExport({ document, visibleElements = document.elements, selectedIds = [], options, setOptions, onExport }: { document: GraphDocument; visibleElements?: GraphElement[]; selectedIds?: string[]; options: GraphExportOptions; setOptions: (options: GraphExportOptions) => void; onExport: (format: 'svg' | 'png' | 'json' | 'html', options: GraphExportOptions) => Promise<string> }) {
  const [preview, setPreview] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const previewDocument = useMemo(() => graphExportDocument(document, options.scope, visibleElements, selectedIds), [document, options.scope, visibleElements, selectedIds])
  useEffect(() => {
    let url = '', cancelled = false
    setPreview('')
    void graphSvg(previewDocument, options).then(svg => {
      if (cancelled) return
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); setPreview(url); setMessage('')
    }).catch(error => { if (!cancelled) { setPreview(''); setMessage(error instanceof Error ? error.message : String(error)) } })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [previewDocument, options.width, options.height, options.transparent])
  const attributes = graphAttributeKeys(document)
  const html = options.html ?? {}
  async function save(format: 'svg' | 'png' | 'json' | 'html') {
    setBusy(true)
    try { setMessage(await onExport(format, options)) } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  return <Panel aria-label="Export graph">
    <h2>Export</h2>
    <p>Share an explorable graph that opens in any browser, even offline.</p>
    <label>Export scope<SelectField aria-label="Export scope" value={options.scope ?? 'all'} options={[{ value: 'all', label: 'Whole graph' }, { value: 'view', label: 'Current filtered view' }, { value: 'selected', label: 'Selected nodes and connecting edges' }]} onValueChange={value => setOptions({ ...options, scope: value as 'all' | 'view' | 'selected' })} /></label>
    <h3>Interactive HTML</h3>
    {!!document.views?.length && <><label><span><input type="checkbox" checked={html.includeViews !== false} onChange={event => setOptions({ ...options, html: { ...html, includeViews: event.target.checked } })} /> Include saved views and captions</span></label><SelectField aria-label="HTML opening view" value={html.initialViewId ?? ''} options={[{ value: '', label: 'Open with the whole exported graph' }, ...document.views.map(view => ({ value: view.id, label: view.name }))]} onValueChange={value => setOptions({ ...options, html: { ...html, initialViewId: value } })} /></>}
    <p>Includes search, category filters, connection and path exploration, saved stories, and a keyboard-accessible data table.</p>

    {attributes.length > 0 && <details><summary>Include extra attributes ({html.attributeKeys?.length ?? 0})</summary><p>Names, categories and visual styling are always included. Choose any additional notes, sources or data to share.</p>{attributes.map(key => <label key={key}><span><input type="checkbox" checked={html.attributeKeys?.includes(key) ?? false} onChange={event => setOptions({ ...options, html: { ...html, attributeKeys: event.target.checked ? [...(html.attributeKeys ?? []), key] : html.attributeKeys?.filter(item => item !== key) } })} /> {key}</span></label>)}</details>}
    <button disabled={busy || !document.elements.length} onClick={() => void save('html')}>Save interactive HTML</button>
    <h3>Image and editable data</h3>
    <p>Image dimensions apply to SVG and PNG.</p>
    <FieldRow><label>Width<input type="number" min={100} max={8192} value={options.width} onChange={event => setOptions({ ...options, width: Number(event.target.value) })} /></label>
    <label>Height<input type="number" min={100} max={8192} value={options.height} onChange={event => setOptions({ ...options, height: Number(event.target.value) })} /></label></FieldRow>
    <label><span><input type="checkbox" checked={options.transparent} onChange={event => setOptions({ ...options, transparent: event.target.checked })} /> Transparent background</span></label>
    {preview && <img alt="Graph export preview" src={preview} />}
    <ControlRow>{(['svg', 'png', 'json'] as const).map(format => <button key={format} disabled={busy || (format !== 'json' && !preview)} onClick={() => void save(format)}>Save {format.toUpperCase()}</button>)}</ControlRow>
    <p role="status">{message}</p>
  </Panel>
}
