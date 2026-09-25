import { CrossAppDragHandle } from '@purescience/platform-ui/components/assets/CrossAppDragHandle'
import { svgAssetDataUrl } from '@purescience/platform-editor'
import { graphExportDocument } from '../lib/graphExportScope'
import { layoutGraphAsync } from '../lib/graphLayoutAsync'
import { applyGraphCommands } from '../lib/graphCommands'
import { GraphEncodings } from './GraphEncodings'
import { graphPalettePlan } from '../lib/graphPalette'
import { GraphExplore } from './GraphExplore'
import { GraphNodePicker } from './GraphNodePicker'
import { emptyGraphView, viewElements, queryGraph, analyzeGraph, type GraphSavedView, type GraphViewState } from '../lib/graphExplore'
import { GraphProposalReview } from './GraphProposalReview'
import { SelectField } from '@purescience/platform-ui/components/common/inputs/SelectField'
import { GraphStylePresets } from './GraphStylePresets'
import { graphLegend } from '../lib/graphLegend'
import type { GraphProposal } from '../lib/graphProposal'
import { GraphExport } from './GraphExport'
import { graphSvg, pngFromGraphSvg, DEFAULT_EXPORT_OPTIONS, type GraphExportOptions } from '../canvas/graphExport'
import { buildStyle } from '../canvas/graphStyle'
import { GraphData } from './GraphData'
import { GraphReview } from './GraphReview'
import type { GraphCommand } from '../lib/graphCommands'
import cytoscape from 'cytoscape'
import type {
  Core,
} from 'cytoscape'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import {
  AppSidebar,
  EditorToolbar,
  MetaText,
  SidebarSectionLabel,
} from '@purescience/platform-ui/components/common/containers/AppChrome'
import {
  DEFAULT_GRAPH_EXPORT_NAME,
  SUPPORTED_CURVE_STYLES,
  SUPPORTED_LAYOUTS,
  SUPPORTED_NODE_SHAPES,
  type GraphCurveStyle,
  type GraphLayoutName,
  type GraphNodeShape,
} from '../constants'
import { usePureGraphAgentTools } from '../hooks/usePureGraphAgentTools'
import type {
  GraphContextSummary,
  GraphStyleState,
  PureGraphAgentContext,
} from '../agents/context'
import { GraphToolError } from '../agents/context'
import {
  readTextFile,
  writeBinaryFile,
  writeTextFile,
  updateAssetMetadata,
} from '../bridge/platformBridge'
import {
  SAMPLE_GRAPHS,
  type GraphElement,
  type GraphSample,
} from '../lib/graphParser'
import { restoreGraphCanvas, fromCyElements } from '../canvas/graphCanvas'
import { serializeGraphDocument, type GraphDocument } from '../lib/graphDocument'
import { summarizeGraphContext } from '../lib/graphContext'
import { readableTextColor } from '../lib/contrast'
import { graphAssetExportPath, isGraphPackagePath } from '../lib/graphPaths'
import { graphFingerprint, livePathFor, withLiveSource } from '@purescience/platform-ui/components/assets/asset-library/model/live'
import { GRAPH_APP_SLUG, GRAPH_ASSET_FIGURES_DIR } from '../constants'
import type { PureGraphBootState } from '../types'

interface GraphWorkspaceProps {
  proposal: GraphProposal | null
  onPropose: (title: string, commands: GraphCommand[]) => string
  onApplyProposal: (proposalId?: string) => void
  onDiscardProposal: (proposalId?: string) => void
  currentDocument: GraphDocument
  boot: PureGraphBootState
  documentPath: string | null
  documentTitle: string
  loadedDocument: { document: GraphDocument; nonce: number; resetView?: boolean } | null
  /** A notice from the document layer (open/import errors) for the status line. */
  message: string | null
  onSaveDocument: () => Promise<string | null>
  /** A sample is an explicit ask: it opens as its own new graph, never over the open one. */
  onCreateGraph: (document: GraphDocument) => Promise<void>
  onLoadSample: (sample: GraphSample) => Promise<void>
  ready: boolean
  saveStatus: string
  onRetrySave: () => void
  onCommand: (commands: GraphCommand[]) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

// One map instead of eleven near-identical selectors, so the label colour can
// resolve the same cascade the background does.
/** Typed loosely on purpose: styled-components' attrs rejects data-* literals. */
const chrome = (kind: string): Record<string, string> => ({ 'data-chrome': kind })

// One chrome for every app: measures, faces and colours are the platform's
// --pure-chrome-* tokens; the app accent is the shell's (--app-acc), relit
// for the dark theme by --pure-chrome-accent. The graph itself keeps the
// document's own colours.
const Root = styled.div`
  --canvas: var(--platform-colors-bg, #f5f7f8);
  --ink-faint: var(--pure-chrome-muted, #67727d);
  --surface: var(--pure-chrome-surface);

  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--canvas);
  color: var(--platform-colors-text, #29333d);
  font-family: var(--platform-typography-font-family, system-ui);
  font-size: var(--pure-chrome-ui-size, 13px);
`

// The status + actions bar is the 36px editor toolbar.
const Header = styled(EditorToolbar)`
  && {
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  flex-wrap: nowrap;
  margin: 0 12px 12px;

  }
`

const Status = styled(MetaText)`
  && {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: inherit;

  }
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
`

// The primary control: the accent, used once per row.
const Button = styled.button`
  min-height: 32px;
  border: 1px solid var(--pure-chrome-accent);
  border-radius: 7px;
  background: var(--pure-chrome-accent);
  padding: 0 10px;
  color: var(--pure-chrome-on-accent);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;

  &:hover:not(:disabled),
  &:focus-visible:not(:disabled) {
    filter: brightness(0.94);
    outline: 2px solid var(--pure-chrome-accent);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`

const GhostButton = styled(Button)`
  border-color: var(--pure-chrome-line);
  background: var(--pure-chrome-surface);
  color: var(--platform-colors-text, #29333d);

  &:hover:not(:disabled),
  &:focus-visible:not(:disabled) {
    filter: none;
    background: var(--pure-chrome-hover);
  }
`

const Navigation = styled.nav`
  display: flex;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--pure-chrome-line, #dce1e5);
  border-radius: 10px;
  background: var(--pure-chrome-well, #eef1f3);
  button {
    flex: 1;
    min-width: 0;
    padding: 0 5px;
    border-color: transparent;
    background: transparent;
    font-size: 12px;
  }
  button[aria-pressed='true'] {
    background: var(--pure-chrome-surface, white);
    border-color: var(--pure-chrome-line, #dce1e5);
    box-shadow: 0 1px 3px #0000000a;
    font-weight: 600;
  }
`

const Workspace = styled.div`
  button[aria-pressed='true'] { font-weight: 600; background: var(--pure-chrome-hover, #e8eeee); }
  button:focus-visible, input:focus-visible, textarea:focus-visible, summary:focus-visible {
    outline: 2px solid var(--pure-chrome-accent, #267b66);
    outline-offset: 2px;
  }
  display: grid;
  grid-template-columns: minmax(0, var(--graph-panel-width, 360px)) minmax(120px, 1fr);
  @media (max-width: 700px) { grid-template-columns: minmax(0, min(var(--graph-panel-width, 320px), calc(100vw - 140px))) minmax(120px, 1fr); }
  min-width: 0;
  min-height: 0;
`

// Give graph tables and controls room while keeping the canvas primary.
const Panel = styled(AppSidebar)`
  && {
  display: grid;
  align-content: start;
  gap: 20px;
  overflow-y: auto;
  scrollbar-width: thin;
  min-width: 0;
  padding: 0 16px 24px;
  width: auto;
  box-sizing: border-box;
  border: 0;
  background: transparent;

  }
`

const Section = styled.section`
  &[hidden] { display: none; }
  display: grid;
  gap: 10px;
`

// The sidebar already carries the inset, so section labels sit flush.
const SectionTitle = styled(SidebarSectionLabel).attrs({ as: 'h2' })`
  && {
  margin: 0;
  padding: 0;

  }
`

const Label = styled.label`
  display: grid;
  gap: 4px;
  color: var(--pure-chrome-muted, #67727d);
  font-size: var(--pure-chrome-ui-size, 13px);
  font-weight: 500;
`

const Input = styled.input.attrs(chrome('field'))`
  min-width: 0;
`

const RangeInput = styled.input`
  width: 100%;
  height: 18px;
  accent-color: var(--pure-chrome-accent);
`

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  color: var(--pure-chrome-soft);
  font-size: var(--pure-chrome-ui-size, 13px);
`

const Details = styled.details`
  border: 1px solid var(--pure-chrome-line);
  border-radius: var(--pure-chrome-radius);
  background: var(--pure-chrome-surface);
  padding: 10px 12px;

  &[open] {
    display: grid;
    gap: 12px;
  }
`

const Summary = styled(SidebarSectionLabel).attrs({ as: 'summary' })`
  && {
  display: list-item;
  padding: 4px 0;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: normal;
  cursor: pointer;

  }
`

const ColorRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
`

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
`

const Stat = styled.div`
  min-width: 0;
  border: 1px solid var(--pure-chrome-line);
  border-radius: var(--pure-chrome-radius);
  background: var(--pure-chrome-well);
  padding: 6px 8px;
`

const StatValue = styled.div`
  color: var(--platform-colors-text, #29333d);
  font-size: var(--pure-type-body-size);
  font-weight: 600;
  line-height: 1;
`

const StatLabel = styled(SidebarSectionLabel)`
  && {
  margin-top: 4px;
  padding: 0;

  }
`

const Inspector = styled.div`
  display: grid;
  gap: 6px;
  border: 1px solid var(--pure-chrome-line);
  border-radius: var(--pure-chrome-radius);
  background: var(--pure-chrome-surface);
  padding: 8px 10px;
`

const InspectorMeta = styled(MetaText)`
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
`

const ColorInput = styled.input`
  width: 100%;
  height: var(--pure-chrome-field-height);
  border: 1px solid var(--pure-chrome-line);
  border-radius: var(--pure-chrome-radius);
  background: var(--pure-chrome-surface);
  padding: 3px;
`

const ButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

// The paper slab under the graph; the document's own background colour is
// painted on the cytoscape container above it.
const GraphHost = styled.main`
  position: relative;
  min-width: 0;
  min-height: 0;
  background: var(--pure-chrome-paper);
  margin: 0 12px 12px 0;
  border: 1px solid var(--pure-chrome-line, #dce1e5);
  border-radius: 12px;
  overflow: hidden;
`

const GraphCanvas = styled.div`
  width: 100%;
  height: 100%;
`

const EmptyOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  padding: 24px;
  color: var(--ink-faint);
  text-align: center;
  font-size: var(--pure-chrome-ui-size, 13px);
  pointer-events: none;
  button { pointer-events: auto; }
`

function sanitizeFileName(raw: string, extension: string): string {
  const safe = (raw || DEFAULT_GRAPH_EXPORT_NAME)
    .trim()
    // An export name carrying the other format's extension ("graph.png" asked
    // for as JSON) must not become "graph.png.json".
    .replace(/\.(png|svg|json|html)$/i, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const base = safe || DEFAULT_GRAPH_EXPORT_NAME
  return `${base}.${extension}`
}

export function GraphWorkspace({
  currentDocument, proposal, onPropose, onApplyProposal, onDiscardProposal,
  documentPath,
  documentTitle,
  loadedDocument,
  message,
  onSaveDocument,
  onLoadSample, onCreateGraph,
  ready,
  boot,
  canUndo, canRedo, onUndo, onRedo, saveStatus, onRetrySave, onCommand,
}: GraphWorkspaceProps): React.ReactElement {
  const [activePanel, setActivePanel] = useState('Graph')
  const [panelWidth, setPanelWidth] = useState(360), [collapsed, setCollapsed] = useState(false)
  const [view, setView] = useState(emptyGraphView)
  const [layoutBusy, setLayoutBusy] = useState(false)
  const layoutAbort = useRef<AbortController | null>(null)
  const liveDocument = useRef(currentDocument); liveDocument.current = currentDocument

  useEffect(() => () => layoutAbort.current?.abort(), [])
  const selectionRef = useRef<string[]>([])
  const visibleElements = useMemo(() => viewElements(currentDocument.elements, view), [currentDocument.elements, view])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<Core | null>(null)
  const suppressDocumentChangeRef = useRef(false)
  const [cyReady, setCyReady] = useState(false)
  const [status, setStatus] = useState('Ready')
  // Clear arms on the first click and fires on the second: a native
  // confirm() dialog is suppressed inside the shell's sandboxed iframe.
  const { layout, style: styleState } = currentDocument
  const { nodeColor, edgeColor, backgroundColor, nodeShape, curveStyle, nodeSize, edgeWidth, labelSize, showLabels, directed } = styleState
  const [layoutScope, setLayoutScope] = useState<'all' | 'selected'>('all')
  const [layoutDirection, setLayoutDirection] = useState<'down' | 'right'>('down')
  const commandRef = useRef(onCommand)
  commandRef.current = onCommand
  const [graphVersion, setGraphVersion] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Export and cross-app dragging share one set of image settings.
  const [exportOptions, setExportOptions] = useState(DEFAULT_EXPORT_OPTIONS)
  const dragRequest = useMemo(() => ({ document: currentDocument, options: exportOptions, visibleElements, selectedIds }), [currentDocument, exportOptions, visibleElements, selectedIds])
  const [dragSnapshot, setDragSnapshot] = useState<{ request: typeof dragRequest; dataUrl: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const document = graphExportDocument(dragRequest.document, dragRequest.options.scope, dragRequest.visibleElements, dragRequest.selectedIds)
        const svg = await graphSvg(document, dragRequest.options)
        if (!cancelled) setDragSnapshot({ request: dragRequest, dataUrl: svgAssetDataUrl(svg) })
      })().catch(() => { if (!cancelled) setDragSnapshot(null) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [dragRequest])
  const [draftNodeId, setDraftNodeId] = useState('')
  const [draftNodeLabel, setDraftNodeLabel] = useState('')
  const [draftEdgeSource, setDraftEdgeSource] = useState('')
  const [draftEdgeTarget, setDraftEdgeTarget] = useState('')
  const [draftEdgeLabel, setDraftEdgeLabel] = useState('')
  const [selectedLabel, setSelectedLabel] = useState('')

  const getCy = useCallback((): Core => {
    if (!cyRef.current) throw new GraphToolError('Graph is not ready.')
    return cyRef.current
  }, [])

  const selectElements = useCallback((ids: string[]) => {
    selectionRef.current = ids; setSelectedIds(ids)
    if (!cyRef.current) return
    suppressDocumentChangeRef.current = true
    cyRef.current.elements().unselect()
    ids.forEach(id => cyRef.current!.getElementById(id).select())
    suppressDocumentChangeRef.current = false
  }, [])
  const fitChangedView = useRef(false)
  const changeExploreView = useCallback((next: GraphViewState) => {
    fitChangedView.current = true
    setView(next)
  }, [])
  const openView = useCallback((saved: GraphSavedView) => {
    fitChangedView.current = !saved.viewport
    setView(saved.state); selectElements(saved.selectedIds)
    if (saved.viewport) getCy().viewport(saved.viewport)
    setStatus(saved.caption || saved.name)
  }, [getCy, selectElements])
  const saveView = useCallback((name: string, caption: string) => {
    if (!name.trim()) throw new Error('Give this view a name.')
    if ((currentDocument.views?.length ?? 0) >= 100) throw new Error('This graph has 100 saved views. Remove a view before saving another.')
    const cy = getCy()
    onCommand([{ type: 'views', views: [...(currentDocument.views ?? []), { id: crypto.randomUUID(), name: name.trim(), caption, state: view, selectedIds, viewport: { zoom: cy.zoom(), pan: { ...cy.pan() } } }] }])
  }, [currentDocument.views, view, selectedIds, getCy, onCommand])
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const included = new Set(visibleElements.map(element => element.data.id))
    cy.batch(() => cy.elements().forEach(element => { element.removeClass('explore-hidden explore-dim'); if (!included.has(element.id())) element.addClass(view.mode === 'dim' ? 'explore-dim' : 'explore-hidden') }))
    if (fitChangedView.current) {
      fitChangedView.current = false
      const shown = cy.elements().filter(element => included.has(element.id()))
      if (shown.length) cy.fit(shown, 32)
    }
  }, [visibleElements, view.mode, loadedDocument, cyReady, graphVersion])

  const prepareLayout = useCallback(async (document: GraphDocument, name: GraphLayoutName, ids?: string[], direction: 'down' | 'right' = 'down') => {
    layoutAbort.current?.abort()
    const controller = new AbortController(); layoutAbort.current = controller; setLayoutBusy(true)
    try { return await layoutGraphAsync(document, name, ids, direction, controller.signal) }
    finally { if (layoutAbort.current === controller) setLayoutBusy(false) }
  }, [])
  const runLayout = useCallback(async (name: GraphLayoutName): Promise<string> => {
    const base = currentDocument
    const next = await prepareLayout(base, name, layoutScope === 'selected' ? selectedIds : undefined, layoutDirection)
    if (liveDocument.current !== base) throw new Error('The graph changed while laying out. Your edit was kept; run the layout again.')
    onCommand([{ type: 'document', document: next }])
    return `Applied ${name} layout.`
  }, [onCommand, layoutScope, selectedIds, layoutDirection, currentDocument, prepareLayout])
  const prepareProposal = useCallback(async (title: string, commands: GraphCommand[]) => {
    if (proposal) throw new Error(`Proposal ${proposal.id} is pending. Apply or discard it before preparing another.`)
    if (!Array.isArray(commands) || !commands.length || commands.length > 1000) throw new Error('Provide between 1 and 1000 commands.')
    const base = currentDocument
    let next = base
    for (const command of commands) next = command.type === 'layout' ? await prepareLayout(next, command.name, command.ids, command.direction) : applyGraphCommands(next, [command])
    if (liveDocument.current !== base) throw new Error('The document changed while preparing this proposal. Read context and prepare it again.')
    return onPropose(title, [{ type: 'document', document: next }])
  }, [currentDocument, onPropose, prepareLayout, proposal])

  const applyGraphElements = useCallback(async (elements: GraphElement[], source: string | undefined, options: { replace?: boolean; layout?: GraphLayoutName } = {}): Promise<string> => {
    if (currentDocument.elements.length && !options.replace) throw new GraphToolError('The graph is not empty. Use replace: true to replace it.')
    const commands: GraphCommand[] = [{ type: 'replace', elements }]
    if (options.layout) commands.push({ type: 'layout', name: options.layout })
    onCommand(commands)
    return `Loaded ${elements.length} elements${source ? ` from ${source}` : ''}.`
  }, [onCommand, currentDocument])

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: buildStyle(styleState),
    })
    cy.on('select unselect', () => {
      if (suppressDocumentChangeRef.current) return
      selectionRef.current = cy.$(':selected').map(element => element.id())
      setSelectedIds(selectionRef.current)
      setGraphVersion(version => version + 1)
    })
    cy.on('dragfree', () => {
      if (suppressDocumentChangeRef.current) return
      const positions = Object.fromEntries(cy.nodes().map(node => [node.id(), { ...node.position() }]))
      commandRef.current([{ type: 'positions', positions }])
    })
    const observer = new ResizeObserver(() => cy.resize())
    observer.observe(containerRef.current)
    cyRef.current = cy
    setCyReady(true)
    setGraphVersion(version => version + 1)
    return () => {
      observer.disconnect()
      cy.destroy()
      cyRef.current = null
      setCyReady(false)
    }
    // Mount once; later style and layout changes are applied by the effects
    // below and by explicit layout runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (message) setStatus(message)
  }, [message])

  useEffect(() => {
    if (!cyRef.current) return
    cyRef.current.style(buildStyle(styleState)).update()
    cyRef.current.container()?.style.setProperty('background', backgroundColor)
  }, [backgroundColor, styleState])

  useEffect(() => {
    if (!loadedDocument || !cyRef.current) return
    const { document } = loadedDocument
    suppressDocumentChangeRef.current = true
    try {
      const cy = cyRef.current
      restoreGraphCanvas(cy, document, loadedDocument.resetView !== false)
      if (loadedDocument.resetView !== false) { selectionRef.current = []; setView(emptyGraphView()) }
      cy.elements().unselect()
      selectionRef.current = selectionRef.current.filter(id => cy.getElementById(id).nonempty())
      selectionRef.current.forEach(id => cy.getElementById(id).select())
      setSelectedIds(selectionRef.current)
      setGraphVersion(version => version + 1)
      setStatus(
        document.elements.length
          ? `Opened ${document.title}`
          : `${document.title} — paste data, import a file, or add a node to begin.`,
      )
    } finally {
      suppressDocumentChangeRef.current = false
    }
  }, [loadedDocument])

  useEffect(() => {
    const selected = selectedIds[0]
    if (!selected || !cyRef.current) {
      setSelectedLabel('')
      return
    }
    const element = cyRef.current.getElementById(selected)
    setSelectedLabel(String(element.data('label') ?? ''))
  }, [selectedIds])

  const graphContext = useCallback((): GraphContextSummary => {
    const cy = getCy()
    const nodes = cy.nodes().map(node => ({
      data: { category: node.data('category'), cluster: node.data('cluster'), pinned: node.data('pinned'), synthetic: node.data('synthetic') }, position: { ...node.position() },
      id: node.id(),
      label: String(node.data('label') ?? node.id()),
    }))
    const edges = cy.edges().map(edge => ({
      id: edge.id(),
      source: String(edge.data('source') ?? ''),
      target: String(edge.data('target') ?? ''),
      label: edge.data('label') ? String(edge.data('label')) : null,
    }))
    return summarizeGraphContext({
      title: documentTitle,
      documentPath,
      edges,
      layout,
      nodes,
      selectedIds,
      style: styleState,
    })
    // graphVersion tracks Cytoscape mutations the React state does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentPath, documentTitle, getCy, graphVersion, layout, selectedIds, styleState])

  const addNode = useCallback(async ({ id, label }: { id?: string; label?: string }): Promise<string> => {
    const nodeId = id || `n${crypto.randomUUID()}`
    const extent = getCy().extent()
    onCommand([{ type: 'add', elements: [{ group: 'nodes', data: { id: nodeId, label: label || nodeId },
      position: { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 } }] }])
    return `Added node ${label || nodeId}.`
  }, [getCy, onCommand])

  const addEdge = useCallback(async ({ id, label, source, target }: {
    id?: string; label?: string; source: string; target: string
  }): Promise<string> => {
    onCommand([{ type: 'add', elements: [{ group: 'edges', data: { id: id || `e${crypto.randomUUID()}`, source, target, label: label || '' } }] }])
    return `Connected ${source} to ${target}.`
  }, [onCommand])

  const setElementLabel = useCallback(async (id: string, label: string): Promise<string> => {
    onCommand([{ type: 'update', ids: [id], data: { label } }])
    return `Updated ${id}.`
  }, [onCommand])

  const removeElement = useCallback(async (id: string): Promise<string> => {
    onCommand([{ type: 'remove', ids: [id] }])
    return `Removed ${id} and its connected edges.`
  }, [onCommand])

  const setStyle = useCallback(async (input: Partial<GraphStyleState>): Promise<string> => {
    onCommand([{ type: 'style', style: input }])
    return 'Updated graph style.'
  }, [onCommand])

  const clearGraph = useCallback(
    async ({ confirm }: { confirm?: boolean }): Promise<string> => {
      const cy = getCy()
      const count = cy.elements().length
      if (!count) {
        const message = 'The graph is already empty.'
        setStatus(message)
        return message
      }
      if (confirm !== true) {
        throw new GraphToolError(
          `The graph holds ${cy.nodes().length} node${cy.nodes().length === 1 ? '' : 's'} and ${cy.edges().length} edge${cy.edges().length === 1 ? '' : 's'}. Resend with confirm: true only when the user asked to start over; to delete one element use removeElement with its id.`,
        )
      }
      onCommand([{ type: 'replace', elements: [] }])
      const message = `Cleared the graph (${count} elements removed).`
      return message
    },
    [getCy, onCommand],
  )

  const exportGraph = useCallback(async ({ filename, format = 'png', options = DEFAULT_EXPORT_OPTIONS }: {
    filename?: string; format?: 'png' | 'svg' | 'json' | 'html'; options?: GraphExportOptions
  }): Promise<string> => {
    const exportDocument = graphExportDocument(currentDocument, options.scope, visibleElements, getCy().nodes(':selected').map(node => node.id()))
    if (!exportDocument.elements.length && options.scope && options.scope !== 'all') throw new Error('This export scope has no elements. Select nodes or reset the view.')
    const safeName = sanitizeFileName(filename || currentDocument.title, format)
    const path = graphAssetExportPath(documentPath, safeName, boot.prefs.workingDirectory)
    if (format === 'html') {
      const { graphHtml } = await import('../canvas/graphHtml')
      await writeTextFile(path, graphHtml(exportDocument, options.html, getCy().nodes(':selected').map(node => node.id())))
    }
    else if (format === 'json') await writeTextFile(path, serializeGraphDocument(exportDocument))
    else {
      const svg = await graphSvg(exportDocument, options)
      if (format === 'svg') await writeTextFile(path, svg)
      else await writeBinaryFile(path, await pngFromGraphSvg(svg, options))
      // A figure in the package is a linked one: the library reads which
      // graph it came from and a fingerprint of the graph as saved, so it
      // can say when the nodes and edges have moved on since it was drawn.
      if (documentPath && isGraphPackagePath(documentPath)) {
        const collectionPath = documentPath.replace(/\/+$/, '')
        const fingerprint = graphFingerprint(JSON.parse(serializeGraphDocument(currentDocument)))
        await updateAssetMetadata({
          collectionPath,
          relativePath: `${GRAPH_ASSET_FIGURES_DIR}/${safeName}`,
          label: currentDocument.title,
          caption: currentDocument.title,
          description: withLiveSource('PureGraph export linked to its source graph document.', {
            kind: 'graph',
            fingerprint,
            view: options.scope === 'selected' ? 'selection' : options.scope === 'view' ? 'view' : null,
            render: { width: options.width, height: options.height, palette: 'source', format },
          }),
          sourceDocumentPath: livePathFor(collectionPath, documentPath),
          sourceAppSlug: GRAPH_APP_SLUG,
        })
      }
    }
    setStatus(`Saved ${safeName}`)
    return `Saved graph to ${path}`
  }, [currentDocument, documentPath, boot.prefs.workingDirectory, getCy, visibleElements])

  const readGraphFile = useCallback(async (path: string): Promise<string> => {
    return readTextFile(path)
  }, [])

  const fit = useCallback(() => {
    const cy = getCy(); const ids = new Set(visibleElements.map(element => element.data.id)); const included = cy.elements().filter(element => ids.has(element.id())); if (included.length) cy.fit(included, 32)
    setStatus('Fit graph')
  }, [getCy, visibleElements])

  const loadSample = useCallback(
    (sample: GraphSample) => {
      return onLoadSample(sample)
    },
    [onLoadSample],
  )

  const loadSampleById = useCallback(
    async (sampleId: string): Promise<string> => {
      const sample = SAMPLE_GRAPHS.find(item => item.id === sampleId)
      if (!sample) {
        throw new GraphToolError(
          `No sample "${sampleId}". Samples: ${SAMPLE_GRAPHS.map(item => item.id).join(', ')}.`,
        )
      }
      await loadSample(sample)
      return `Opened the "${sample.name}" sample as a new graph document.`
    },
    [loadSample],
  )

  const saveGraph = useCallback(async (): Promise<string> => {
    const path = await onSaveDocument()
    if (!path) throw new GraphToolError('The graph could not be saved.')
    return path
  }, [onSaveDocument])

  const agentContext = useMemo<PureGraphAgentContext | null>(() => {
    if (!cyReady) return null
    return {
      queryGraph: input => queryGraph(currentDocument.elements, input),
      analyzeGraph: input => analyzeGraph(currentDocument.elements, { ...input, directed: input.directed ?? currentDocument.style.directed }),
      exploreGraph: input => {
        if (input.action === 'reset') { changeExploreView(emptyGraphView()); selectElements([]); return 'Restored the whole graph.' }
        if (input.action === 'openView') { const saved = currentDocument.views?.find(view => view.id === input.viewId); if (!saved) throw new Error('Unknown saved view. Read getGraphContext.'); openView(saved); return `Opened ${saved.name}.` }
        const ids = input.ids ?? []
        if (!ids.length || ids.some(id => !currentDocument.elements.some(element => element.data.id === id))) throw new Error('Provide existing element IDs from queryGraph or analyzeGraph.')
        selectElements(ids)
        if (input.action === 'focus') changeExploreView({ ...view, focusIds: ids })
        else if (input.action === 'exclude') changeExploreView({ ...view, hiddenIds: [...new Set([...view.hiddenIds, ...ids])] })
        else if (input.action !== 'select') throw new Error('Choose select, focus, exclude, reset, or openView.')
        return `${input.action}: ${ids.join(', ')}. Document data unchanged.`
      },
      saveGraphView: (name, caption) => { saveView(name, caption); return `Saved view ${name}.` },
      applyGraphPalette: () => onPropose('Apply measured category palette', graphPalettePlan(currentDocument).commands),
      createGraph: async document => { const base = currentDocument; const next = document.elements.length ? await prepareLayout(document, document.layout) : document; if (liveDocument.current !== base) throw new Error('The open graph changed while preparing the new graph. Try again.'); await onCreateGraph(next); return JSON.stringify({ status: 'created', title: document.title, message: 'Opened as a separate graph; the previous document is preserved. Autosave is scheduled. Verify with getGraphContext and saveGraph.' }) },
      proposeGraph: prepareProposal,
      addEdge: async input => onPropose('Add an edge', [{ type: 'add', elements: [{ data: { ...input, id: input.id || `e${crypto.randomUUID()}` } }] }]),
      addNode: async input => onPropose('Add a node', [{ type: 'add', elements: [{ data: { ...input, id: input.id || `n${crypto.randomUUID()}` } }] }]),
      saveGraph,
      exportGraph,
      fit,
      getContext: () => ({ ...graphContext(), views: currentDocument.views?.map(({ id, name, caption }) => ({ id, name, caption })), view, pendingProposalNote: 'Proposals are preserved per document. Apply by ID only when authorized; do not repeat blocked mutations.', pendingProposal: proposal ? { id: proposal.id, title: proposal.title, impact: proposal.impact } : null }),
      applyGraphProposal: async id => { onApplyProposal(id); return JSON.stringify({ status: 'applied', proposalId: id, message: 'Applied as one undoable edit. Autosave is scheduled; call getGraphContext to verify, then saveGraph if a saved artifact is needed.' }) },
      discardGraphProposal: async id => { onDiscardProposal(id); return JSON.stringify({ status: 'discarded', proposalId: id }) },
      loadGraph: async (elements, _source, options) => {
        if (liveDocument.current !== currentDocument) throw new Error('The open document changed while reading the file. Try again in the intended document.');
        if (currentDocument.elements.length && !options.replace) throw new GraphToolError('Use replace: true to propose replacing this graph.')
        return onPropose('Replace graph data', [{ type: 'replace', elements }])
      },
      loadSample: loadSampleById,
      readGraphFile,
      clearGraph: async options => { if (!options.confirm) throw new GraphToolError('Use confirm: true to propose clearing the graph.'); return onPropose('Clear graph', [{ type: 'replace', elements: [] }]) },
      removeElement: async id => onPropose(`Remove ${id}`, [{ type: 'remove', ids: [id] }]),
      runLayout: async name => prepareProposal(`Apply ${name} layout`, [{ type: 'layout', name }]),
      setElementLabel: async (id, label) => onPropose(`Relabel ${id}`, [{ type: 'update', ids: [id], data: { label } }]),
      setStyle: async style => onPropose('Change graph style', [{ type: 'style', style }]),
    }
  }, [
    view, saveView, openView, changeExploreView, selectElements, prepareLayout, prepareProposal,
    onCreateGraph, onPropose, onApplyProposal, onDiscardProposal, proposal, currentDocument,
    addEdge,
    addNode,
    applyGraphElements,
    cyReady,
    clearGraph,
    saveGraph,
    exportGraph,
    fit,
    graphContext,
    loadSampleById,
    readGraphFile,
    removeElement,
    runLayout,
    setElementLabel,
    setStyle,
  ])

  usePureGraphAgentTools(ready, agentContext)

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || !['z', 'y'].includes(event.key.toLowerCase())) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      const redo = event.key.toLowerCase() === 'y' || event.shiftKey
      if (redo ? !canRedo : !canUndo) return
      event.preventDefault(); redo ? onRedo() : onUndo()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [canUndo, canRedo, onUndo, onRedo])


  const graphStats = useMemo(() => {
    if (!cyRef.current) return { edges: 0, nodes: 0, selected: 0 }
    return {
      edges: cyRef.current.edges().length,
      nodes: cyRef.current.nodes().length,
      selected: selectedIds.length,
    }
  }, [cyReady, graphVersion, selectedIds.length])

  const selectedElement = useMemo(() => {
    const id = selectedIds[0]
    if (!id || !cyRef.current) return null
    const element = cyRef.current.getElementById(id)
    if (element.empty()) return null
    return {
      id,
      kind: element.isNode() ? 'node' : 'edge',
      source: element.isEdge() ? String(element.data('source') ?? '') : null,
      target: element.isEdge() ? String(element.data('target') ?? '') : null,
    }
  }, [graphVersion, selectedIds])

  const createNodeFromDraft = useCallback(() => {
    addNode({
      id: draftNodeId.trim() || undefined,
      label: draftNodeLabel.trim() || undefined,
    })
      .then(() => {
        setDraftNodeId('')
        setDraftNodeLabel('')
      })
      .catch(error => setStatus(error instanceof Error ? error.message : String(error)))
  }, [addNode, draftNodeId, draftNodeLabel])

  const createEdgeFromDraft = useCallback(() => {
    addEdge({
      source: draftEdgeSource.trim(),
      target: draftEdgeTarget.trim(),
      label: draftEdgeLabel.trim() || undefined,
    })
      .then(() => {
        setDraftEdgeSource('')
        setDraftEdgeTarget('')
        setDraftEdgeLabel('')
      })
      .catch(error => setStatus(error instanceof Error ? error.message : String(error)))
  }, [addEdge, draftEdgeLabel, draftEdgeSource, draftEdgeTarget])

  return (
    <Root data-app="graph">
      <div>
      <Header>
        <Status>{status} · {saveStatus}</Status>
        <Actions>
          {saveStatus === 'Not saved' && <GhostButton onClick={onRetrySave}>Retry save</GhostButton>}
          {layoutBusy && <GhostButton onClick={() => layoutAbort.current?.abort()}>Cancel layout</GhostButton>}
          <GhostButton onClick={() => setCollapsed(!collapsed)}>{collapsed ? 'Show controls' : 'Hide controls'}</GhostButton>
          <GhostButton disabled={!canUndo} onClick={onUndo}>Undo</GhostButton>
          <GhostButton disabled={!canRedo} onClick={onRedo}>Redo</GhostButton>
          <GhostButton type="button" disabled={!cyReady} onClick={fit}>
            Fit
          </GhostButton>

        </Actions>
      </Header>
      <GraphProposalReview document={currentDocument} proposal={proposal} onApply={onApplyProposal} onDiscard={onDiscardProposal} />
      </div>
      <Workspace style={{ '--graph-panel-width': collapsed ? '0px' : `${activePanel === 'Data' ? Math.max(panelWidth, 520) : panelWidth}px` } as React.CSSProperties}>
        <Panel style={{ display: collapsed ? 'none' : undefined }}>
          <label style={{ fontSize: 11 }}>Pane width<input aria-label="Pane width" type="range" min={300} max={680} value={panelWidth} onChange={event => setPanelWidth(Number(event.target.value))} /></label>
          <Navigation aria-label="Graph workspace">
            {['Data', 'Graph', 'Explore', 'Style', 'Review', 'Export'].map(panel => <GhostButton key={panel} aria-pressed={activePanel === panel} onClick={() => setActivePanel(panel)}>{panel}</GhostButton>)}
          </Navigation>
          <Section hidden={activePanel !== 'Graph'}>
            <SectionTitle>Overview</SectionTitle>
            <StatGrid>
              <Stat>
                <StatValue>{graphStats.nodes}</StatValue>
                <StatLabel>Nodes</StatLabel>
              </Stat>
              <Stat>
                <StatValue>{graphStats.edges}</StatValue>
                <StatLabel>Edges</StatLabel>
              </Stat>
              <Stat>
                <StatValue>{graphStats.selected}</StatValue>
                <StatLabel>Selected</StatLabel>
              </Stat>
            </StatGrid>
          </Section>

          <div hidden={activePanel !== 'Data'}><GraphData elements={currentDocument.elements} documentKey={documentPath ?? documentTitle} onCommand={onCommand} selected={selectedIds} onSelect={selectElements} /></div>
          <div hidden={activePanel !== 'Explore'}><GraphExplore key={documentPath ?? documentTitle} document={currentDocument} selectedIds={selectedIds} view={view} onView={changeExploreView} onSelect={selectElements} onCommand={onCommand} onFit={fit} onSaveView={saveView} onOpenView={openView} /></div>
          <Section hidden={activePanel !== 'Graph'}>
            {SAMPLE_GRAPHS.length > 0 && <Details><Summary>Start from a sample</Summary>
              {SAMPLE_GRAPHS.map(sample => <GhostButton key={sample.id} onClick={() => { void loadSample(sample).catch(error => setStatus(String(error))) }}>{sample.name}</GhostButton>)}
            </Details>}
          </Section>

          <Section hidden={activePanel !== 'Graph'}>
            <Details>
              <Summary>Create nodes and edges</Summary>
              <TwoCol>
                <Label htmlFor="node-id">
                  Node id
                  <Input
                    id="node-id"
                    value={draftNodeId}
                    onChange={event => setDraftNodeId(event.target.value)}
                    placeholder="auto"
                  />
                </Label>
                <Label htmlFor="node-label">
                  Node label
                  <Input
                    id="node-label"
                    value={draftNodeLabel}
                    onChange={event => setDraftNodeLabel(event.target.value)}
                    placeholder="label"
                  />
                </Label>
              </TwoCol>
              <ButtonRow>
                <GhostButton
                  type="button"
                  disabled={!cyReady}
                  onClick={createNodeFromDraft}
                >
                  Add Node
                </GhostButton>
              </ButtonRow>
              <TwoCol>
                <GraphNodePicker label="Source" value={draftEdgeSource} onChange={setDraftEdgeSource} elements={currentDocument.elements} />
                <GraphNodePicker label="Target" value={draftEdgeTarget} onChange={setDraftEdgeTarget} elements={currentDocument.elements} />
                <GhostButton disabled={selectedIds.filter(id => currentDocument.elements.some(element => element.data.id === id && !element.data.source)).length !== 2} onClick={() => { const ids = selectedIds.filter(id => currentDocument.elements.some(element => element.data.id === id && !element.data.source)); setDraftEdgeSource(ids[0]); setDraftEdgeTarget(ids[1]) }}>Connect selected nodes</GhostButton>
              </TwoCol>
              <Label htmlFor="edge-label">
                Edge label
                <Input
                  id="edge-label"
                  value={draftEdgeLabel}
                  onChange={event => setDraftEdgeLabel(event.target.value)}
                  placeholder="optional"
                />
              </Label>
              <ButtonRow>
                <GhostButton
                  type="button"
                  disabled={!cyReady || !draftEdgeSource || !draftEdgeTarget}
                  onClick={createEdgeFromDraft}
                >
                  Add Edge
                </GhostButton>
              </ButtonRow>
            </Details>
          </Section>

          <Section hidden={activePanel !== 'Graph'}>
            <SectionTitle>Layout</SectionTitle>
            <ButtonRow>
              <GhostButton aria-pressed={layoutScope === 'all'} onClick={() => setLayoutScope('all')}>All nodes</GhostButton>
              <GhostButton aria-pressed={layoutScope === 'selected'} onClick={() => setLayoutScope('selected')}>Selected nodes</GhostButton>
            </ButtonRow>
            <ButtonRow>
              <GhostButton aria-pressed={layoutDirection === 'down'} onClick={() => setLayoutDirection('down')}>Top to bottom</GhostButton>
              <GhostButton aria-pressed={layoutDirection === 'right'} onClick={() => setLayoutDirection('right')}>Left to right</GhostButton>
            </ButtonRow>
            <ButtonRow>
              <GhostButton disabled={!selectedIds.length} onClick={() => onCommand([{ type: 'pin', ids: selectedIds, pinned: true }])}>Pin selected</GhostButton>
              <GhostButton disabled={!selectedIds.length} onClick={() => onCommand([{ type: 'pin', ids: selectedIds, pinned: false }])}>Unpin selected</GhostButton>
            </ButtonRow>
            <Label htmlFor="layout-select">Layout</Label>
            <SelectField id="layout-select" aria-label="layout-select" value={layout} options={SUPPORTED_LAYOUTS.map(value => ({ value, label: value }))} onValueChange={value => { void runLayout(value as GraphLayoutName).catch(error => setStatus(String(error))) }} />
          </Section>

          {activePanel === 'Style' && <GraphEncodings document={currentDocument} onCommand={onCommand} />}
          {activePanel === 'Style' && <GraphStylePresets onCommand={onCommand} document={currentDocument} onStyle={style => onCommand([{ type: 'style', style }])} />}
          <Section hidden={activePanel !== 'Style'}>
            <Details>
              <Summary>Visual style</Summary>
              <ColorRow>
                <Label htmlFor="node-color">
                  Nodes
                  <ColorInput
                    id="node-color"
                    type="color"
                    value={nodeColor}
                    onChange={event => {
                      void setStyle({ nodeColor: event.target.value })
                    }}
                  />
                </Label>
                <Label htmlFor="edge-color">
                  Edges
                  <ColorInput
                    id="edge-color"
                    type="color"
                    value={edgeColor}
                    onChange={event => {
                      void setStyle({ edgeColor: event.target.value })
                    }}
                  />
                </Label>
              </ColorRow>
              <ColorRow>
                <Label htmlFor="background-color">
                  Background
                  <ColorInput
                    id="background-color"
                    type="color"
                    value={backgroundColor}
                    onChange={event => {
                      void setStyle({ backgroundColor: event.target.value })
                    }}
                  />
                </Label>
                <Label htmlFor="node-shape">
                  Shape
                  <SelectField id="node-shape" aria-label="node-shape" value={nodeShape} options={SUPPORTED_NODE_SHAPES.map(value => ({ value, label: value }))} onValueChange={value => { void setStyle({ nodeShape: value as GraphNodeShape }) }} />
                </Label>
              </ColorRow>
              <ColorRow>
                <Label htmlFor="curve-style">
                  Edge curve
                  <SelectField id="curve-style" aria-label="curve-style" value={curveStyle} options={SUPPORTED_CURVE_STYLES.map(value => ({ value, label: value }))} onValueChange={value => { void setStyle({ curveStyle: value as GraphCurveStyle }) }} />
                </Label>
                <div>
                  <CheckboxLabel>
                    <input
                      id="directed-edges"
                      checked={directed}
                      type="checkbox"
                      onChange={event => {
                        void setStyle({ directed: event.target.checked })
                      }}
                    />
                    Directed edges
                  </CheckboxLabel>
                  <CheckboxLabel>
                    <input
                      id="show-labels"
                      checked={showLabels}
                      type="checkbox"
                      onChange={event => {
                        void setStyle({ showLabels: event.target.checked })
                      }}
                    />
                    Labels
                  </CheckboxLabel>
                </div>
              </ColorRow>
              <CheckboxLabel>
                <input type="checkbox" checked={styleState.showEdgeLabels ?? false} onChange={event => { void setStyle({ showEdgeLabels: event.target.checked }) }} />
                Edge labels
              </CheckboxLabel>
              <Label htmlFor="label-placement">
                Node labels
                <SelectField id="label-placement" aria-label="Node label placement" value={styleState.labelPlacement ?? 'outside'} options={[{ value: 'outside', label: 'Below nodes' }, { value: 'inside', label: 'Inside nodes' }]} onValueChange={value => { void setStyle({ labelPlacement: value as 'inside' | 'outside' }) }} />
              </Label>
              <Label htmlFor="node-size">
                Node size {nodeSize}
                <RangeInput
                  id="node-size"
                  max="96"
                  min="4"
                  type="range"
                  value={nodeSize}
                  onChange={event => {
                    void setStyle({ nodeSize: Number(event.target.value) })
                  }}
                />
              </Label>
              <Label htmlFor="edge-width">
                Edge width {edgeWidth}
                <RangeInput
                  id="edge-width"
                  max="10"
                  min="0.25"
                  step="0.25"
                  type="range"
                  value={edgeWidth}
                  onChange={event => {
                    void setStyle({ edgeWidth: Number(event.target.value) })
                  }}
                />
              </Label>
              <Label htmlFor="label-size">
                Label size {labelSize}
                <RangeInput
                  id="label-size"
                  max="24"
                  min="5"
                  type="range"
                  value={labelSize}
                  onChange={event => {
                    void setStyle({ labelSize: Number(event.target.value) })
                  }}
                />
              </Label>
            </Details>
          </Section>

          <Section hidden={activePanel !== 'Graph'}>
            <SectionTitle>Selection</SectionTitle>
            {selectedElement ? (
              <Inspector>
                <InspectorMeta>
                  {selectedElement.kind} · {selectedElement.id}
                </InspectorMeta>
                {selectedElement.source && selectedElement.target ? (
                  <InspectorMeta>
                    {selectedElement.source} -&gt; {selectedElement.target}
                  </InspectorMeta>
                ) : null}
                <Label htmlFor="selected-label">
                  Label
                  <Input
                    id="selected-label"
                    value={selectedLabel}
                    onChange={event => setSelectedLabel(event.target.value)}
                  />
                </Label>
                <ButtonRow>
                  <GhostButton
                    type="button"
                    onClick={() => {
                      setElementLabel(selectedElement.id, selectedLabel).catch(
                        error =>
                          setStatus(
                            error instanceof Error
                              ? error.message
                              : String(error),
                          ),
                      )
                    }}
                  >
                    Update
                  </GhostButton>
                  <GhostButton
                    type="button"
                    onClick={() => {
                      removeElement(selectedElement.id).catch(error =>
                        setStatus(
                          error instanceof Error ? error.message : String(error),
                        ),
                      )
                    }}
                  >
                    Remove
                  </GhostButton>
                </ButtonRow>
              </Inspector>
            ) : (
              <InspectorMeta>Select a node or edge on the canvas.</InspectorMeta>
            )}
          </Section>

          {activePanel === 'Export' && <GraphExport options={exportOptions} setOptions={setExportOptions} document={currentDocument} visibleElements={visibleElements} selectedIds={selectedIds} onExport={(format, options) => exportGraph({ format, options })} />}
          {activePanel === 'Review' && <GraphReview document={currentDocument} elements={cyRef.current ? fromCyElements(cyRef.current) : []} directed={directed} selectedIds={selectedIds} onSelect={selectElements} />}        </Panel>
        <GraphHost style={{ background: backgroundColor }}>
          <GraphCanvas ref={containerRef} />
          {currentDocument.elements.length > 0 && <CrossAppDragHandle label="graph"
            style={{position:'absolute',top:12,right:12,zIndex:2}}
            disabled={dragSnapshot?.request !== dragRequest} onError={setStatus}
            getContent={()=>{
              if(!dragSnapshot || dragSnapshot.request !== dragRequest)throw new Error('The graph is still being prepared.')
              return {name:`${currentDocument.title || 'graph'}.svg`,alt:currentDocument.title || 'Graph',dataUrl:dragSnapshot.dataUrl}
            }} />}

          {styleState.showLegend && <div aria-label="Graph legend" style={{ position: 'absolute', bottom: 16, left: 16, maxHeight: '30%', overflow: 'auto', background: backgroundColor, color: readableTextColor(backgroundColor), padding: 12, borderRadius: 8 }}>
            {graphLegend(currentDocument).map(entry => <div key={entry.label + entry.color} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ background: entry.color, width: 12, height: 12, display: 'inline-block', borderRadius: 3 }} />{entry.label}</div>)}
          </div>}
          {!cyReady ? (
            <EmptyOverlay>Loading graph</EmptyOverlay>
          ) : graphStats.nodes === 0 ? (
            <EmptyOverlay>
              Create a relationship map.<br /><GhostButton onClick={() => setActivePanel('Data')}>Import data</GhostButton> <GhostButton onClick={() => { setActivePanel('Graph'); document.querySelectorAll('details').forEach(item => { if (item.textContent?.includes('Create nodes and edges')) item.open = true }) }}>Add a node</GhostButton>
            </EmptyOverlay>
          ) : null}
        </GraphHost>
      </Workspace>
    </Root>
  )
}
