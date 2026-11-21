import { graphExportDocument } from '../lib/graphExportScope'
import type { GraphElement } from '../lib/graphParser'
import { SelectField } from '@purescience/platform-ui/components/common/inputs/SelectField'
import { graphAttributeKeys } from '../lib/graphHtmlOptions'
import { GraphPanel, ControlRow, FieldRow } from './GraphPanel'
import { useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import { serializeGraphDocument, type GraphDocument } from '../lib/graphDocument'
import { graphSvg, type GraphExportOptions } from '../canvas/graphExport'
import { enterprise } from '../enterpriseLook'

const Panel = styled(GraphPanel)`
  img { width: 100%; border: 1px solid var(--pure-chrome-line, #dce1e5); border-radius: 8px; background: repeating-conic-gradient(#eef0f2 0% 25%, white 0% 50%) 50% / 16px 16px; }
  ${enterprise} & img { border-radius: 2px; }
`

export type GraphUiExportFormat = 'svg' | 'png' | 'json' | 'html' | 'csv-nodes' | 'csv-edges'

export function GraphExport({
  document,
  visibleElements = document.elements,
  selectedIds = [],
  options,
  setOptions,
  onExport,
}: {
  document: GraphDocument
  visibleElements?: GraphElement[]
  selectedIds?: string[]
  options: GraphExportOptions
  setOptions: (options: GraphExportOptions) => void
  onExport: (format: GraphUiExportFormat, options: GraphExportOptions) => Promise<string>
}) {
  const [preview, setPreview] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [widthDraft, setWidthDraft] = useState(String(options.width))
  const [heightDraft, setHeightDraft] = useState(String(options.height))
  const optionsRef = useRef(options)
  optionsRef.current = options
  const setOptionsRef = useRef(setOptions)
  setOptionsRef.current = setOptions

  useEffect(() => { setWidthDraft(String(options.width)) }, [options.width])
  useEffect(() => { setHeightDraft(String(options.height)) }, [options.height])

  useEffect(() => {
    const wTrim = widthDraft.trim()
    const hTrim = heightDraft.trim()
    if (!wTrim || !hTrim) return
    const nextWidth = Number(wTrim)
    const nextHeight = Number(hTrim)
    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) return
    if (nextWidth === optionsRef.current.width && nextHeight === optionsRef.current.height) return
    const timer = window.setTimeout(() => {
      setOptionsRef.current({
        ...optionsRef.current,
        width: nextWidth,
        height: nextHeight,
      })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [widthDraft, heightDraft])

  const previewDocument = useMemo(
    () => graphExportDocument(document, options.scope, visibleElements, selectedIds),
    [document, options.scope, visibleElements, selectedIds],
  )
  const hasNodes = previewDocument.elements.some(element => element.data.source === undefined)
  const hasEdges = previewDocument.elements.some(element => element.data.source !== undefined)

  useEffect(() => {
    let url = '', cancelled = false
    setPreview('')
    void graphSvg(previewDocument, options)
      .then(svg => {
        if (cancelled) return
        url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
        setPreview(url)
        setMessage('')
      })
      .catch(error => {
        if (!cancelled) {
          setPreview('')
          setMessage(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [previewDocument, options.width, options.height, options.transparent])

  const attributes = graphAttributeKeys(document)
  const html = options.html ?? {}

  function resolveExportOptions(): GraphExportOptions {
    const wTrim = widthDraft.trim()
    const hTrim = heightDraft.trim()
    const nextWidth = wTrim ? Number(wTrim) : options.width
    const nextHeight = hTrim ? Number(hTrim) : options.height
    if (
      Number.isFinite(nextWidth) &&
      Number.isFinite(nextHeight) &&
      (nextWidth !== options.width || nextHeight !== options.height)
    ) {
      const merged = { ...options, width: nextWidth, height: nextHeight }
      setOptions(merged)
      return merged
    }
    return options
  }

  async function save(format: GraphUiExportFormat) {
    setBusy(true)
    try {
      const effectiveOptions = resolveExportOptions()
      setMessage(await onExport(format, effectiveOptions))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function copySvg() {
    setBusy(true)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
      const effectiveOptions = resolveExportOptions()
      const svg = await graphSvg(previewDocument, effectiveOptions)
      await navigator.clipboard.writeText(svg)
      setMessage('Copied SVG to clipboard.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function copyJson() {
    setBusy(true)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
      await navigator.clipboard.writeText(serializeGraphDocument(previewDocument))
      setMessage('Copied JSON to clipboard.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel aria-label="Export graph">
      <h2>Export</h2>
      <p>Share an explorable graph that opens in any browser, even offline.</p>
      <label>
        Export scope
        <SelectField
          aria-label="Export scope"
          value={options.scope ?? 'all'}
          options={[
            { value: 'all', label: 'Whole graph' },
            { value: 'view', label: 'Current filtered view' },
            { value: 'selected', label: 'Selected nodes and connecting edges' },
          ]}
          onValueChange={value => setOptions({ ...options, scope: value as 'all' | 'view' | 'selected' })}
        />
      </label>
      <h3>Interactive HTML</h3>
      {!!document.views?.length && (
        <>
          <label>
            <span>
              <input
                type="checkbox"
                checked={html.includeViews !== false}
                onChange={event =>
                  setOptions({ ...options, html: { ...html, includeViews: event.target.checked } })
                }
              />{' '}
              Include saved views and captions
            </span>
          </label>
          <SelectField
            aria-label="HTML opening view"
            value={html.initialViewId ?? ''}
            options={[
              { value: '', label: 'Open with the whole exported graph' },
              ...document.views.map(view => ({ value: view.id, label: view.name })),
            ]}
            onValueChange={value => setOptions({ ...options, html: { ...html, initialViewId: value } })}
          />
        </>
      )}
      <p>Includes search, category filters, connection and path exploration, saved stories, and a keyboard-accessible data table.</p>

      {attributes.length > 0 && (
        <details>
          <summary>Include extra attributes ({html.attributeKeys?.length ?? 0})</summary>
          <p>Names, categories and visual styling are always included. Choose any additional notes, sources or data to share.</p>
          {attributes.map(key => (
            <label key={key}>
              <span>
                <input
                  type="checkbox"
                  checked={html.attributeKeys?.includes(key) ?? false}
                  onChange={event =>
                    setOptions({
                      ...options,
                      html: {
                        ...html,
                        attributeKeys: event.target.checked
                          ? [...(html.attributeKeys ?? []), key]
                          : html.attributeKeys?.filter(item => item !== key),
                      },
                    })
                  }
                />{' '}
                {key}
              </span>
            </label>
          ))}
        </details>
      )}
      <button type="button" disabled={busy || !hasNodes} onClick={() => void save('html')}>
        Save interactive HTML
      </button>
      <h3>Image and editable data</h3>
      <p>Image dimensions apply to SVG and PNG.</p>
      <FieldRow>
        <label>
          Width
          <input
            type="number"
            min={100}
            max={8192}
            value={widthDraft}
            onChange={event => setWidthDraft(event.target.value)}
          />
        </label>
        <label>
          Height
          <input
            type="number"
            min={100}
            max={8192}
            value={heightDraft}
            onChange={event => setHeightDraft(event.target.value)}
          />
        </label>
      </FieldRow>
      <label>
        <span>
          <input
            type="checkbox"
            checked={options.transparent}
            onChange={event => setOptions({ ...options, transparent: event.target.checked })}
          />{' '}
          Transparent background
        </span>
      </label>
      {preview && <img alt="Graph export preview" src={preview} />}
      <ControlRow>
        {(['svg', 'png', 'json'] as const).map(format => (
          <button
            type="button"
            key={format}
            disabled={busy || (format === 'json' ? !previewDocument.elements.length : !preview)}
            onClick={() => void save(format)}
          >
            Save {format.toUpperCase()}
          </button>
        ))}
      </ControlRow>
      <ControlRow>
        <button type="button" disabled={busy || !preview} onClick={() => void copySvg()}>
          Copy SVG
        </button>
        <button type="button" disabled={busy || !previewDocument.elements.length} onClick={() => void copyJson()}>
          Copy JSON
        </button>
      </ControlRow>
      <h3>Spreadsheet tables (CSV)</h3>
      <ControlRow>
        <button type="button" disabled={busy || !hasNodes} onClick={() => void save('csv-nodes')}>
          Save Nodes CSV
        </button>
        <button type="button" disabled={busy || !hasEdges} onClick={() => void save('csv-edges')}>
          Save Edges CSV
        </button>
      </ControlRow>
      <p role="status">{message}</p>
    </Panel>
  )
}
