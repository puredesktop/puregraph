import { CrossAppDragHandle } from '@purescience/platform-ui/components/assets/CrossAppDragHandle'
import { svgAssetDataUrl } from '@purescience/platform-editor'
import { graphExportDocument } from '../lib/graphExportScope'
import { layoutGraphAsync } from '../lib/graphLayoutAsync'
import { alignNodePositions, distributeNodePositions, type GraphAlignMode, type GraphDistributeAxis } from '../lib/graphLayout'
import { applyGraphCommands, isEdge } from '../lib/graphCommands'
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
import { GraphExport, type GraphUiExportFormat } from './GraphExport'
import { graphSvg, pngFromGraphSvg, DEFAULT_EXPORT_OPTIONS, type GraphExportOptions } from '../canvas/graphExport'
import { buildStyle } from '../canvas/graphStyle'
import { GraphData } from './GraphData'
import { GraphReview } from './GraphReview'
import type { GraphCommand } from '../lib/graphCommands'
import { graphEdgesCsv, graphNodesCsv } from '../lib/graphCsv'
import cytoscape from 'cytoscape'
import type {
  Core,
} from 'cytoscape'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { PlatformIcon } from '@purescience/platform-ui/components/chrome/PlatformIcon'
import styled from 'styled-components'
import {
  AppSidebar,
  EditorToolbar,
  MetaText,
  SidebarSectionLabel,
} from '@purescience/platform-ui/components/common/containers/AppChrome'
import {
  SUPPORTED_CURVE_STYLES,
  SUPPORTED_LAYOUTS,
  SUPPORTED_NODE_SHAPES,
  type GraphCurveStyle,
  type GraphLayoutName,
  type GraphNodeShape,
} from '../constants'
import { usePureGraphAgentTools } from '../hooks/usePureGraphAgentTools'
import { usePanelOpen } from '../hooks/usePanelOpen'
import { compactPart } from '../hooks/useCompactInRoom'
import { usePlatformThemeDocumentAttrs } from '@purescience/platform-ui/bridge/react/usePlatformThemeDocumentAttrs'
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
import { restoreGraphCanvas } from '../canvas/graphCanvas'
import { DEFAULT_GRAPH_STYLE, safeColorString, serializeGraphDocument, type GraphDocument } from '../lib/graphDocument'
import { summarizeGraphContext } from '../lib/graphContext'
import { readableTextColor } from '../lib/contrast'
import { graphAssetExportPath, isGraphPackagePath, sanitizeFileName } from '../lib/graphPaths'
import { graphFingerprint, livePathFor, withLiveSource } from '@purescience/platform-ui/components/assets/asset-library/model/live'
import { GRAPH_APP_SLUG, GRAPH_ASSET_FIGURES_DIR } from '../constants'
import type { PureGraphBootState } from '../types'
import { enterprise } from '../enterpriseLook'
import { agentRefs, categoryRefs } from '../lib/agentRefs'

/** The held dark ground (docs/held-apps.md). */
const HELD_DARK_GROUND = '#1c1c1c'

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
  /** Held inside a page (useCompactInRoom): the graph first, and only what edits it. */
  compact?: boolean
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
  /* The page is white (ui/look.ts); parts are told apart by hairlines and a shade of grey. */
  --canvas: var(--n-sheet, var(--platform-colors-bg, #f5f7f8));
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

const HeaderStart = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
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

  ${enterprise} & {
    border-radius: var(--pure-chrome-radius, 3px);
    border-color: var(--p-text); background: var(--p-text); color: var(--p-on-text); font-weight: 600;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.18), 0 1px 2px rgb(0 0 0 / 0.24);
  }
  ${enterprise} &:hover:not(:disabled) { filter: none; border-color: var(--p-deep); background: var(--p-deep); }
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

  /* Every action that is not the main one: raised plain, on a firm edge. */
  ${enterprise} && { border: 1px solid var(--n-btn-line); border-bottom-color: var(--n-btn-foot); background: var(--n-sheet); box-shadow: 0 1px 1px rgb(0 0 0 / 0.08); color: var(--n-ink); font-weight: 600; }
  ${enterprise} &&:hover:not(:disabled) { border-color: var(--n-btn-foot); background: var(--n-hover); }
  ${enterprise} &&:disabled { border-color: var(--n-fence); background: var(--n-panel); box-shadow: none; color: var(--n-faint); opacity: 1; }
`

/** Icon-only toolbar button that closes and reopens the controls column. */
const PanelToggle = styled(GhostButton)`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  padding: 0;
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
  /* The open tab takes the shared selected look; no box round the row. */
  ${enterprise} & {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 2px;
    margin: 0 -12px; padding: 8px 12px; border: 0; border-bottom: 1px solid var(--n-line); border-radius: 0; background: transparent;
  }
  ${enterprise} && button { min-height: 28px; padding: 0 4px; }
  ${enterprise} && button { border-color: transparent; border-radius: 3px; background: transparent; box-shadow: none; color: var(--n-soft); font-weight: 500; }
  ${enterprise} && button:hover:not([aria-pressed='true']) { border-color: transparent; background: var(--n-hover); color: var(--n-ink); }
  ${enterprise} && button[aria-pressed='true'] { border-color: transparent; background: var(--p-chosen); box-shadow: var(--p-chosen-edge); color: var(--n-ink); font-weight: 600; }
`

const Workspace = styled.div`
  button[aria-pressed='true'] { font-weight: 600; background: var(--pure-chrome-hover, #e8eeee); }
  /* A chosen option takes the shared selected look. */
  ${enterprise} && button[aria-pressed='true'] { border-color: transparent; background: var(--p-chosen); box-shadow: var(--p-chosen-edge); color: var(--n-ink); }
  button:focus-visible, input:focus-visible, textarea:focus-visible, summary:focus-visible {
    outline: 2px solid var(--pure-chrome-accent, #267b66);
    outline-offset: 2px;
  }
  display: grid;
  grid-template-columns: minmax(0, var(--graph-panel-width, 320px)) minmax(120px, 1fr);
  @media (max-width: 700px) { grid-template-columns: minmax(0, min(var(--graph-panel-width, 320px), calc(100vw - 140px))) minmax(120px, 1fr); }
  min-width: 0;
  min-height: 0;
  /* Closed controls give the whole width to the graph. */
  &[data-controls-hidden='true'] { grid-template-columns: minmax(0, 1fr); }
`

// Give graph tables and controls room while keeping the canvas primary.
const Panel = styled(AppSidebar)`
  && {
  display: grid;
  align-content: start;
  gap: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  min-width: 0;
  /* One column grid: tabs on top, then each group on its own band, ruled by a hairline. */
  padding: 0 12px 12px;
  width: auto;
  box-sizing: border-box;
  border: 0;
  background: transparent;

  }
  &&[hidden] { display: none; }
`

const Section = styled.section`
  &[hidden] { display: none; }
  display: grid;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid var(--n-fence, var(--pure-chrome-line));
`

/** How wide the controls are: a quiet setting at the foot of the column, label and slider on one line. */
const PaneWidth = styled.label`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 12px 0 0;
  color: var(--pure-chrome-muted, #67727d);
  font-size: 12px;
  input { width: 100%; margin: 0; accent-color: var(--p-text, var(--pure-chrome-accent)); }
`

// The sidebar already carries the inset, so section labels sit flush.
const SectionTitle = styled(SidebarSectionLabel).attrs({ as: 'h2' })`
  && {
  margin: 0;
  padding: 0;

  }
  ${enterprise} && {
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: normal;
    text-transform: none;
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
  padding: 6px 10px;

  &[open] {
    display: grid;
    gap: 8px;
    padding-bottom: 10px;
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
  background: var(--n-sheet, var(--pure-chrome-well));
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
  ${enterprise} && {
    font-family: inherit;
    font-size: 11px;
    letter-spacing: normal;
    text-transform: none;
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
  ${enterprise} & { font-family: inherit; font-size: 12px; }
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

/** Buttons in a group share one grid: two equal columns, so their edges line up down the column. */
const ButtonRow = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
  [data-controls-hidden='true'] > & { margin-left: 12px; }
  border: 1px solid var(--pure-chrome-line, #dce1e5);
  border-radius: 12px;
  overflow: hidden;
  ${enterprise} & { border-radius: var(--pure-chrome-radius, 3px); }
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

const ZoomControls = styled.div`
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--pure-chrome-line, #dce1e5);
  border-radius: 8px;
  background: var(--pure-chrome-surface, white);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
  button {
    min-height: 26px;
    min-width: 28px;
    padding: 0 6px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--platform-colors-text, #29333d);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: var(--pure-chrome-hover, #e8eeee);
  }
  ${enterprise} & { border-radius: var(--pure-chrome-radius, 3px); }
`

const CanvasFloatingBar = styled.div`
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - 96px);
  padding: 5px 8px;
  border: 1px solid var(--pure-chrome-line, #dce1e5);
  border-radius: 8px;
  background: var(--pure-chrome-surface, white);
  color: var(--platform-colors-text, #29333d);
  box-shadow: 0 2px 10px rgb(0 0 0 / 0.1);
  font-size: 12px;
  input {
    min-width: 140px;
    max-width: 220px;
    min-height: 26px;
    padding: 3px 7px;
    border: 1px solid var(--pure-chrome-line, #dce1e5);
    border-radius: 5px;
    background: var(--pure-chrome-paper, white);
    color: inherit;
    font: inherit;
  }
  button {
    min-height: 26px;
    padding: 0 8px;
    border: 1px solid var(--pure-chrome-line, #dce1e5);
    border-radius: 5px;
    background: var(--pure-chrome-surface, white);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: var(--pure-chrome-hover, #e8eeee);
  }
  ${enterprise} & { border-radius: var(--pure-chrome-radius, 3px); }
`

const ThreeCol = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
`

const EMPTY_IDS: string[] = []

function toColorPickerHex(color: unknown, fallback: string): string {
  const raw = typeof color === 'string' && color.trim() ? color.trim() : fallback.trim()
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return '#' + raw.slice(1).split('').map(c => c + c).join('')
  }
  return /^#[0-9a-f]{6}$/i.test(fallback) ? fallback : '#668b9b'
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
  compact = false,
}: GraphWorkspaceProps): React.ReactElement {
  const [activePanel, setActivePanel] = useState('Graph')
  const [panelWidth, setPanelWidth] = useState(320)
  // The controls column can be closed so the graph takes the room; the
  // choice is remembered across reloads.
  const [wholeAppControlsOpen, setWholeAppControlsOpen] = usePanelOpen('puregraph.controlsOpen')
  // Held in a page the graph has the box, and the controls open beside it only when asked for. What is done here never
  // touches the full app's own choice, which Full app reads back untouched.
  const [compactControlsOpen, setCompactControlsOpen] = useState(false)
  const controlsOpen = compact ? compactControlsOpen : wholeAppControlsOpen
  const setControlsOpen = compact ? setCompactControlsOpen : setWholeAppControlsOpen
  const collapsed = !controlsOpen
  const showPanel = (panel: string): void => { setActivePanel(panel); setControlsOpen(true) }
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
  // Held in a page in a dark theme, a graph left on the default white is drawn on the held dark ground (docs/held-apps.md).
  // Only the drawing changes: a ground someone chose stays, and the document keeps its own.
  const themeMode = usePlatformThemeDocumentAttrs(compact).mode
  const drawnStyle = useMemo(() => (compact && themeMode === 'dark' && backgroundColor.toLowerCase() === DEFAULT_GRAPH_STYLE.backgroundColor
    ? { ...styleState, backgroundColor: HELD_DARK_GROUND }
    : styleState), [compact, themeMode, backgroundColor, styleState])
  const drawnBackground = drawnStyle.backgroundColor
  const [layoutScope, setLayoutScope] = useState<'all' | 'selected'>('all')
  const [layoutDirection, setLayoutDirection] = useState<'down' | 'right'>('down')
  const commandRef = useRef(onCommand)
  commandRef.current = onCommand
  const [graphVersion, setGraphVersion] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [documentSessionId, setDocumentSessionId] = useState(0)
  const [zoomPercent, setZoomPercent] = useState(100)
  const [connectMode, setConnectMode] = useState(false)
  const [connectSource, setConnectSource] = useState<string | null>(null)
  const connectModeRef = useRef(connectMode); connectModeRef.current = connectMode
  const connectSourceRef = useRef(connectSource); connectSourceRef.current = connectSource
  const [quickSearchOpen, setQuickSearchOpen] = useState(false)
  const [quickSearchQuery, setQuickSearchQuery] = useState('')
  const [quickSearchIndex, setQuickSearchIndex] = useState(0)
  const quickSearchInputRef = useRef<HTMLInputElement | null>(null)
  const createDetailsRef = useRef<HTMLDetailsElement | null>(null)
  const [bulkColor, setBulkColor] = useState('#668b9b')
  const [bulkCategory, setBulkCategory] = useState('')
  const messageRef = useRef(message); messageRef.current = message

  // Keep activePanel on a visible tab when entering compact mode.
  useEffect(() => {
    if (compact && !['Data', 'Graph', 'Style'].includes(activePanel)) {
      setActivePanel('Graph')
    }
  }, [compact, activePanel])

  // Export and cross-app dragging share one set of image settings.
  const [exportOptions, setExportOptions] = useState(DEFAULT_EXPORT_OPTIONS)
  const dragScope = exportOptions.scope ?? 'all'
  const dragVisible = dragScope === 'view' ? visibleElements : currentDocument.elements
  const dragSelected = dragScope === 'selected' ? selectedIds : EMPTY_IDS
  const dragRequest = useMemo(
    () => ({ document: currentDocument, options: exportOptions, visibleElements: dragVisible, selectedIds: dragSelected }),
    [currentDocument, exportOptions, dragVisible, dragSelected],
  )
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
    const unique = [...new Set(ids)]
    selectionRef.current = unique; setSelectedIds(unique)
    if (!cyRef.current) return
    suppressDocumentChangeRef.current = true
    cyRef.current.elements().unselect()
    unique.forEach(id => cyRef.current!.getElementById(id).select())
    suppressDocumentChangeRef.current = false
  }, [])
  const selectElementsRef = useRef(selectElements)
  selectElementsRef.current = selectElements
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
    for (const command of commands) {
      if (command && typeof command === 'object' && command.type === 'layout') {
        if (!SUPPORTED_LAYOUTS.includes(command.name) || (command.direction !== undefined && !['down', 'right'].includes(command.direction))) {
          throw new Error('Invalid layout or direction.')
        }
        if (command.ids !== undefined) {
          if (!Array.isArray(command.ids) || command.ids.some(id => typeof id !== 'string')) {
            throw new Error('IDs must be an array of strings.')
          }
          for (const id of command.ids) {
            if (!next.elements.some(element => element.data.id === id)) throw new Error(`No element "${id}".`)
          }
        }
        next = await prepareLayout(next, command.name, command.ids, command.direction)
      } else {
        next = applyGraphCommands(next, [command])
      }
    }
    if (liveDocument.current !== base) throw new Error('The document changed while preparing this proposal. Read context and prepare it again.')
    return onPropose(title, [{ type: 'document', document: next }])
  }, [currentDocument, onPropose, prepareLayout, proposal])

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: buildStyle(drawnStyle),
    })
    let dragTimer: number | null = null
    const updateZoom = () => {
      const level = cy.zoom()
      if (typeof level === 'number' && Number.isFinite(level)) {
        setZoomPercent(Math.round(level * 100))
      }
    }
    cy.on('zoom', updateZoom)
    cy.on('select unselect', () => {
      if (suppressDocumentChangeRef.current) return
      selectionRef.current = cy.$(':selected').map(element => element.id())
      setSelectedIds(selectionRef.current)
      setGraphVersion(version => version + 1)
    })
    cy.on('dragfree', () => {
      if (suppressDocumentChangeRef.current) return
      if (dragTimer !== null) window.clearTimeout(dragTimer)
      dragTimer = window.setTimeout(() => {
        dragTimer = null
        if (suppressDocumentChangeRef.current || !cyRef.current) return
        try {
          const positions = Object.fromEntries(cyRef.current.nodes().map(node => [node.id(), { ...node.position() }]))
          commandRef.current([{ type: 'positions', positions }])
        } catch (error) {
          setStatus(error instanceof Error ? error.message : String(error))
        }
      }, 0)
    })
    cy.on('dbltap', event => {
      if (event.target !== cy) return
      const pos = event.position
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return
      const id = `n${crypto.randomUUID().slice(0, 8)}`
      commandRef.current([{
        type: 'add',
        elements: [{ group: 'nodes', data: { id, label: id }, position: { x: Math.round(pos.x), y: Math.round(pos.y) } }],
      }])
      selectElementsRef.current([id])
      setStatus(`Added node ${id}`)
    })
    cy.on('tap', 'node', event => {
      if (!connectModeRef.current) return
      const nodeId = event.target.id()
      const currentSource = connectSourceRef.current
      if (!currentSource) {
        setConnectSource(nodeId)
        selectElementsRef.current([nodeId])
        setStatus(`Connect from ${String(event.target.data('label') || nodeId)}: click a target node (Esc to cancel)`)
      } else {
        const edgeId = `e${crypto.randomUUID().slice(0, 8)}`
        try {
          commandRef.current([{
            type: 'add',
            elements: [{ group: 'edges', data: { id: edgeId, source: currentSource, target: nodeId, label: '' } }],
          }])
          setStatus(`Connected ${currentSource} → ${nodeId}`)
        } catch (error) {
          setStatus(error instanceof Error ? error.message : String(error))
        }
        setConnectSource(null)
      }
    })
    cy.on('tap', event => {
      if (event.target === cy && connectModeRef.current && connectSourceRef.current) {
        setConnectSource(null)
        setStatus('Connect mode: click a source node')
      }
    })
    const observer = new ResizeObserver(() => cy.resize())
    observer.observe(containerRef.current)
    cyRef.current = cy
    updateZoom()
    setCyReady(true)
    setGraphVersion(version => version + 1)
    return () => {
      if (dragTimer !== null) window.clearTimeout(dragTimer)
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
    cyRef.current.style(buildStyle(drawnStyle)).update()
    cyRef.current.container()?.style.setProperty('background-color', safeColorString(drawnBackground, DEFAULT_GRAPH_STYLE.backgroundColor))
  }, [drawnBackground, drawnStyle])

  useEffect(() => {
    if (!loadedDocument || !cyRef.current) return
    const { document } = loadedDocument
    const isNewDocument = loadedDocument.resetView !== false
    suppressDocumentChangeRef.current = true
    try {
      const cy = cyRef.current
      restoreGraphCanvas(cy, document, isNewDocument)
      if (isNewDocument) {
        selectionRef.current = []
        setView(emptyGraphView())
        setConnectMode(false)
        setConnectSource(null)
        setQuickSearchOpen(false)
        setQuickSearchQuery('')
        setQuickSearchIndex(0)
        setDocumentSessionId(id => id + 1)
      }
      cy.elements().unselect()
      selectionRef.current = selectionRef.current.filter(id => cy.getElementById(id).nonempty())
      selectionRef.current.forEach(id => cy.getElementById(id).select())
      setSelectedIds(selectionRef.current)
      const level = cy.zoom()
      if (typeof level === 'number' && Number.isFinite(level)) setZoomPercent(Math.round(level * 100))
      setGraphVersion(version => version + 1)
      if (isNewDocument && !messageRef.current) {
        setStatus(
          document.elements.length
            ? `Opened ${document.title}`
            : `${document.title} — paste data, import a file, or add a node to begin.`,
        )
      }
    } finally {
      suppressDocumentChangeRef.current = false
    }
  }, [loadedDocument])

  const primarySelectedId = selectedIds[0] ?? null
  const primarySelectedDocElement = useMemo(
    () => (primarySelectedId ? currentDocument.elements.find(el => el.data.id === primarySelectedId) ?? null : null),
    [currentDocument.elements, primarySelectedId],
  )
  const primaryAuthoritativeLabel = primarySelectedDocElement ? String(primarySelectedDocElement.data.label ?? '') : ''

  useEffect(() => {
    setSelectedLabel(primaryAuthoritativeLabel)
  }, [primarySelectedId, primaryAuthoritativeLabel])

  const graphContext = useCallback((): GraphContextSummary => {
    const nodes = currentDocument.elements
      .filter(element => !isEdge(element))
      .map(node => ({
        data: {
          category: node.data.category,
          cluster: node.data.cluster,
          pinned: node.data.pinned,
          synthetic: node.data.synthetic,
        },
        ...(node.position ? { position: { ...node.position } } : {}),
        id: String(node.data.id ?? ''),
        label: String(node.data.label ?? node.data.id ?? ''),
      }))
    const edges = currentDocument.elements
      .filter(isEdge)
      .map(edge => ({
        id: String(edge.data.id ?? ''),
        source: String(edge.data.source ?? ''),
        target: String(edge.data.target ?? ''),
        label: edge.data.label ? String(edge.data.label) : null,
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
  }, [currentDocument.elements, documentPath, documentTitle, layout, selectedIds, styleState])

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

  const exportGraph = useCallback(async ({ filename, format = 'png', options = DEFAULT_EXPORT_OPTIONS }: {
    filename?: string; format?: 'png' | 'svg' | 'json' | 'html'; options?: GraphExportOptions
  }): Promise<string> => {
    const exportDocument = graphExportDocument(currentDocument, options.scope, visibleElements, selectedIds)
    if (!exportDocument.elements.length && options.scope && options.scope !== 'all') throw new Error('This export scope has no elements. Select nodes or reset the view.')
    const safeName = sanitizeFileName(filename || currentDocument.title, format)
    const path = graphAssetExportPath(documentPath, safeName, boot.prefs.workingDirectory)
    if (format === 'html') {
      const { graphHtml } = await import('../canvas/graphHtml')
      await writeTextFile(path, graphHtml(exportDocument, options.html, selectedIds))
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
  }, [currentDocument, documentPath, boot.prefs.workingDirectory, selectedIds, visibleElements])

  const exportGraphUi = useCallback(async (format: GraphUiExportFormat, options: GraphExportOptions): Promise<string> => {
    if (format === 'csv-nodes' || format === 'csv-edges') {
      const exportDocument = graphExportDocument(currentDocument, options.scope, visibleElements, selectedIds)
      const suffix = format === 'csv-nodes' ? 'nodes' : 'edges'
      const csv = format === 'csv-nodes' ? graphNodesCsv(exportDocument) : graphEdgesCsv(exportDocument)
      const safeName = sanitizeFileName(`${currentDocument.title || 'graph'}_${suffix}`, 'csv')
      const path = graphAssetExportPath(documentPath, safeName, boot.prefs.workingDirectory)
      await writeTextFile(path, csv)
      setStatus(`Saved ${safeName}`)
      return `Saved ${suffix} CSV to ${path}`
    }
    return exportGraph({ format, options })
  }, [boot.prefs.workingDirectory, currentDocument, documentPath, exportGraph, selectedIds, visibleElements])

  const readGraphFile = useCallback(async (path: string): Promise<string> => {
    return readTextFile(path)
  }, [])

  const fit = useCallback(() => {
    const cy = getCy(); const ids = new Set(visibleElements.map(element => element.data.id)); const included = cy.elements().filter(element => ids.has(element.id())); if (included.length) cy.fit(included, 32)
    setStatus('Fit graph')
  }, [getCy, visibleElements])

  const zoomBy = useCallback((factor: number) => {
    const cy = cyRef.current
    if (!cy) return
    const current = cy.zoom()
    if (typeof current !== 'number' || !Number.isFinite(current)) return
    const next = Math.max(0.05, Math.min(8, current * factor))
    const width = cy.width()
    const height = cy.height()
    if (typeof width === 'number' && typeof height === 'number' && Number.isFinite(width) && Number.isFinite(height)) {
      cy.zoom({ level: next, renderedPosition: { x: width / 2, y: height / 2 } })
    } else {
      cy.zoom(next)
    }
  }, [])

  const resetZoom = useCallback(() => {
    const cy = cyRef.current
    if (!cy) return
    const width = cy.width()
    const height = cy.height()
    if (typeof width === 'number' && typeof height === 'number' && Number.isFinite(width) && Number.isFinite(height)) {
      cy.zoom({ level: 1, renderedPosition: { x: width / 2, y: height / 2 } })
    } else {
      cy.zoom(1)
    }
  }, [])

  const duplicateSelection = useCallback(() => {
    const selectedSet = new Set(selectedIds)
    const nodes = currentDocument.elements.filter(el => !isEdge(el) && selectedSet.has(el.data.id!))
    if (!nodes.length) return
    const usedIds = new Set(currentDocument.elements.map(el => el.data.id!))
    const nextId = (base: string) => {
      let candidate = `${base}-copy`, index = 2
      while (usedIds.has(candidate)) candidate = `${base}-copy-${index++}`
      usedIds.add(candidate)
      return candidate
    }
    const idMap = new Map<string, string>()
    const clones: GraphElement[] = []
    for (const node of nodes) {
      const oldId = node.data.id!
      const newId = nextId(oldId)
      idMap.set(oldId, newId)
      clones.push({
        group: 'nodes',
        data: { ...structuredClone(node.data), id: newId, pinned: false },
        position: node.position ? { x: node.position.x + 40, y: node.position.y + 40 } : undefined,
      })
    }
    for (const edge of currentDocument.elements.filter(isEdge)) {
      const newSource = idMap.get(edge.data.source!)
      const newTarget = idMap.get(edge.data.target!)
      if (!newSource || !newTarget) continue
      const newEdgeId = nextId(edge.data.id!)
      clones.push({
        group: 'edges',
        data: { ...structuredClone(edge.data), id: newEdgeId, source: newSource, target: newTarget },
      })
    }
    onCommand([{ type: 'add', elements: clones }])
    selectElements(clones.map(el => el.data.id!))
    setStatus(`Duplicated ${nodes.length} node${nodes.length === 1 ? '' : 's'}`)
  }, [currentDocument.elements, onCommand, selectElements, selectedIds])

  const quickSearchMatches = useMemo(() => {
    const q = quickSearchQuery.trim().toLowerCase()
    if (!q) return []
    return visibleElements.filter(el => {
      if (isEdge(el)) return false
      const text = `${el.data.id ?? ''} ${el.data.label ?? ''} ${el.data.category ?? ''}`.toLowerCase()
      return text.includes(q)
    })
  }, [quickSearchQuery, visibleElements])

  const jumpToSearchMatch = useCallback((index: number) => {
    if (!quickSearchMatches.length) return
    const wrapped = ((index % quickSearchMatches.length) + quickSearchMatches.length) % quickSearchMatches.length
    setQuickSearchIndex(wrapped)
    const match = quickSearchMatches[wrapped]!
    const id = match.data.id!
    selectElements([id])
    const cy = cyRef.current
    if (cy) {
      const target = cy.getElementById(id)
      if (target && !target.empty()) {
        cy.center(target)
      }
    }
  }, [quickSearchMatches, selectElements])

  // Going into the box, or growing to the full app, the graph is fitted to the room it now has.
  const fitRef = useRef(fit)
  fitRef.current = fit
  const wasCompact = useRef(compact)
  useEffect(() => {
    if (wasCompact.current === compact) return undefined
    wasCompact.current = compact
    const frame = requestAnimationFrame(() => { if (cyRef.current) fitRef.current() })
    return () => cancelAnimationFrame(frame)
  }, [compact])

  const loadSample = useCallback(
    (sample: GraphSample) => {
      return onLoadSample(sample)
    },
    [onLoadSample],
  )

  const loadSampleById = useCallback(
    async (sampleId: string): Promise<string> => {
      if (!SAMPLE_GRAPHS.length) {
        throw new GraphToolError('No built-in samples are bundled. Use createGraph or loadGraph with data instead.')
      }
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
      addEdge: async input => onPropose('Add an edge', [{ type: 'add', elements: [{ group: 'edges', data: { ...input, id: input.id || `e${crypto.randomUUID()}`, label: input.label ?? '' } }] }]),
      addNode: async input => { const id = input.id || `n${crypto.randomUUID()}`; return onPropose('Add a node', [{ type: 'add', elements: [{ group: 'nodes', data: { ...input, id, label: input.label ?? id } }] }]) },
      saveGraph,
      exportGraph,
      fit,
      getContext: () => ({ ...graphContext(), views: currentDocument.views?.map(({ id, name, caption }) => ({ id, name, caption })), view, pendingProposalNote: 'Proposals are preserved per document. Apply by ID only when authorized; do not repeat blocked mutations.', pendingProposal: proposal ? { id: proposal.id, title: proposal.title, impact: proposal.impact } : null }),
      getDocument: () => liveDocument.current,
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
    cyReady,
    saveGraph,
    exportGraph,
    fit,
    graphContext,
    loadSampleById,
    readGraphFile,
  ])

  usePureGraphAgentTools(ready, agentContext)

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (
        target?.closest('dialog, [role="dialog"], [aria-modal="true"]') ||
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
      ) {
        return
      }
      const inEditable = !!(
        target?.isContentEditable ||
        target?.closest('input, textarea, select, [contenteditable="true"]')
      )
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (mod && !event.altKey && key === 'f') {
        event.preventDefault()
        setQuickSearchOpen(true)
        requestAnimationFrame(() => quickSearchInputRef.current?.focus())
        return
      }
      if (event.key === 'Escape') {
        if (quickSearchOpen && (!inEditable || target === quickSearchInputRef.current)) {
          event.preventDefault()
          setQuickSearchOpen(false)
          return
        }
        if (inEditable) return
        if (connectMode) {
          event.preventDefault()
          setConnectMode(false)
          setConnectSource(null)
          setStatus('Exited connect mode')
          return
        }
        if (selectedIds.length > 0) {
          event.preventDefault()
          selectElements([])
          return
        }
      }
      if (inEditable) return

      if (mod && !event.altKey && ['z', 'y'].includes(key)) {
        const redo = key === 'y' || event.shiftKey
        if (redo ? !canRedo : !canUndo) return
        event.preventDefault()
        redo ? onRedo() : onUndo()
        return
      }
      if (mod && !event.altKey && key === 'a') {
        event.preventDefault()
        selectElements(visibleElements.map(el => el.data.id!))
        return
      }
      if (mod && !event.altKey && key === 'd') {
        if (selectedIds.length > 0) {
          event.preventDefault()
          duplicateSelection()
        }
        return
      }
      if (!mod && !event.altKey && (event.key === 'Delete' || event.key === 'Backspace')) {
        if (selectedIds.length > 0) {
          event.preventDefault()
          onCommand([{ type: 'remove', ids: selectedIds }])
          selectElements([])
          setStatus(`Removed ${selectedIds.length} element${selectedIds.length === 1 ? '' : 's'}`)
        }
        return
      }
      if (!mod && !event.altKey && (event.key === '+' || event.key === '=')) {
        event.preventDefault()
        zoomBy(1.25)
        return
      }
      if (!mod && !event.altKey && event.key === '-') {
        event.preventDefault()
        zoomBy(0.8)
        return
      }
      if (!mod && !event.altKey && event.key === '0') {
        event.preventDefault()
        fit()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [
    canUndo, canRedo, onUndo, onRedo,
    quickSearchOpen, connectMode, selectedIds, selectElements,
    visibleElements, duplicateSelection, onCommand, zoomBy, fit,
  ])

  const graphStats = useMemo(() => ({
    edges: currentDocument.elements.filter(isEdge).length,
    nodes: currentDocument.elements.filter(el => !isEdge(el)).length,
    selected: selectedIds.length,
  }), [currentDocument.elements, selectedIds.length])

  const selectedNodeIds = useMemo(
    () => selectedIds.filter(id => currentDocument.elements.some(el => el.data.id === id && !isEdge(el))),
    [currentDocument.elements, selectedIds],
  )
  const selectedEdgeIds = useMemo(
    () => selectedIds.filter(id => currentDocument.elements.some(el => el.data.id === id && isEdge(el))),
    [currentDocument.elements, selectedIds],
  )

  const selectedElement = useMemo(() => {
    if (!primarySelectedDocElement) return null
    const edge = isEdge(primarySelectedDocElement)
    return {
      id: primarySelectedDocElement.data.id!,
      kind: edge ? ('edge' as const) : ('node' as const),
      source: edge ? String(primarySelectedDocElement.data.source ?? '') : null,
      target: edge ? String(primarySelectedDocElement.data.target ?? '') : null,
      data: primarySelectedDocElement.data,
    }
  }, [primarySelectedDocElement])

  const runAlign = useCallback((mode: GraphAlignMode) => {
    try {
      const positions = alignNodePositions(currentDocument.elements, selectedNodeIds, mode)
      onCommand([{ type: 'positions', positions }])
      setStatus(`Aligned ${Object.keys(positions).length} nodes (${mode})`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }, [currentDocument.elements, onCommand, selectedNodeIds])

  const runDistribute = useCallback((axis: GraphDistributeAxis) => {
    try {
      const positions = distributeNodePositions(currentDocument.elements, selectedNodeIds, axis)
      onCommand([{ type: 'positions', positions }])
      setStatus(`Distributed ${Object.keys(positions).length} nodes (${axis})`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }, [currentDocument.elements, onCommand, selectedNodeIds])

  const stableDocumentKey = `session-${documentSessionId}`

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
    <Root data-app="graph" {...compactPart(compact, 'root')}>
      <div>
      <Header>
        <HeaderStart>
          <PanelToggle
            aria-label={collapsed ? 'Show controls' : 'Hide controls'}
            title={collapsed ? 'Show controls' : 'Hide controls'}
            aria-expanded={controlsOpen}
            aria-controls="puregraph-controls"
            onClick={() => setControlsOpen(open => !open)}
          >
            <PlatformIcon icon={collapsed ? PanelLeftOpen : PanelLeftClose} size={16} />
          </PanelToggle>
          <Status>{status} · {saveStatus}</Status>
        </HeaderStart>
        <Actions>
          {saveStatus === 'Not saved' && <GhostButton onClick={onRetrySave}>Retry save</GhostButton>}
          {layoutBusy && <GhostButton onClick={() => layoutAbort.current?.abort()}>Cancel layout</GhostButton>}
          <GhostButton
            type="button"
            disabled={!cyReady}
            aria-pressed={connectMode}
            title="Click a source node, then a target node to add an edge (Esc to exit)"
            onClick={() => {
              setConnectMode(active => {
                const next = !active
                setConnectSource(null)
                setStatus(next ? 'Connect mode: click a source node (Esc to exit)' : 'Exited connect mode')
                return next
              })
            }}
          >
            Connect
          </GhostButton>
          <GhostButton disabled={!canUndo} onClick={onUndo}>Undo</GhostButton>
          <GhostButton disabled={!canRedo} onClick={onRedo}>Redo</GhostButton>
          <GhostButton type="button" disabled={!cyReady} onClick={fit}>
            Fit
          </GhostButton>

        </Actions>
      </Header>
      <GraphProposalReview document={currentDocument} proposal={proposal} onApply={onApplyProposal} onDiscard={onDiscardProposal} />
      </div>
      <Workspace data-controls-hidden={collapsed} {...compactPart(compact, 'workspace')} style={{ '--graph-panel-width': `${activePanel === 'Data' ? Math.max(panelWidth, 520) : panelWidth}px` } as React.CSSProperties}>
        <Panel id="puregraph-controls" aria-label="Graph controls" hidden={collapsed}>
          <Navigation aria-label="Graph workspace">
            {['Data', 'Graph', 'Explore', 'Style', 'Review', 'Export'].map(panel => <GhostButton key={panel} {...compactPart(compact && !['Data', 'Graph', 'Style'].includes(panel), 'hide')} aria-pressed={activePanel === panel} onClick={() => setActivePanel(panel)}>{panel}</GhostButton>)}
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

          <div hidden={activePanel !== 'Data'}><GraphData elements={currentDocument.elements} documentKey={stableDocumentKey} onCommand={onCommand} selected={selectedIds} onSelect={selectElements} /></div>
          <div hidden={activePanel !== 'Explore'}><GraphExplore key={stableDocumentKey} document={currentDocument} selectedIds={selectedIds} view={view} onView={changeExploreView} onSelect={selectElements} onCommand={onCommand} onFit={fit} onSaveView={saveView} onOpenView={openView} /></div>
          <Section hidden={activePanel !== 'Graph' || SAMPLE_GRAPHS.length === 0}>
            {SAMPLE_GRAPHS.length > 0 && <Details><Summary>Start from a sample</Summary>
              {SAMPLE_GRAPHS.map(sample => <GhostButton key={sample.id} onClick={() => { void loadSample(sample).catch(error => setStatus(String(error))) }}>{sample.name}</GhostButton>)}
            </Details>}
          </Section>

          <Section hidden={activePanel !== 'Graph'}>
            <Details ref={createDetailsRef}>
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
                <GhostButton disabled={selectedNodeIds.length !== 2} onClick={() => { setDraftEdgeSource(selectedNodeIds[0]!); setDraftEdgeTarget(selectedNodeIds[1]!) }}>Connect selected nodes</GhostButton>
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
              <GhostButton disabled={!selectedNodeIds.length} onClick={() => onCommand([{ type: 'pin', ids: selectedNodeIds, pinned: true }])}>Pin selected</GhostButton>
              <GhostButton disabled={!selectedNodeIds.length} onClick={() => onCommand([{ type: 'pin', ids: selectedNodeIds, pinned: false }])}>Unpin selected</GhostButton>
            </ButtonRow>
            <Label htmlFor="layout-select">Layout</Label>
            <SelectField id="layout-select" aria-label="layout-select" value={layout} options={SUPPORTED_LAYOUTS.map(value => ({ value, label: value }))} onValueChange={value => { void runLayout(value as GraphLayoutName).catch(error => setStatus(String(error))) }} />
            <Button
              type="button"
              disabled={!cyReady || layoutBusy || (layoutScope === 'selected' ? selectedNodeIds.length === 0 : graphStats.nodes === 0)}
              onClick={() => { void runLayout(layout).then(msg => setStatus(msg)).catch(error => setStatus(error instanceof Error ? error.message : String(error))) }}
            >
              Apply layout
            </Button>
            {selectedNodeIds.length >= 2 && (
              <Details open>
                <Summary>Align &amp; distribute ({selectedNodeIds.length} nodes)</Summary>
                <ThreeCol>
                  <GhostButton type="button" onClick={() => runAlign('left')}>Left</GhostButton>
                  <GhostButton type="button" onClick={() => runAlign('center')}>Center</GhostButton>
                  <GhostButton type="button" onClick={() => runAlign('right')}>Right</GhostButton>
                  <GhostButton type="button" onClick={() => runAlign('top')}>Top</GhostButton>
                  <GhostButton type="button" onClick={() => runAlign('middle')}>Middle</GhostButton>
                  <GhostButton type="button" onClick={() => runAlign('bottom')}>Bottom</GhostButton>
                </ThreeCol>
                <ButtonRow>
                  <GhostButton type="button" disabled={selectedNodeIds.length < 3} onClick={() => runDistribute('horizontal')}>Distribute H</GhostButton>
                  <GhostButton type="button" disabled={selectedNodeIds.length < 3} onClick={() => runDistribute('vertical')}>Distribute V</GhostButton>
                </ButtonRow>
              </Details>
            )}
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
                    value={toColorPickerHex(nodeColor, DEFAULT_GRAPH_STYLE.nodeColor)}
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
                    value={toColorPickerHex(edgeColor, DEFAULT_GRAPH_STYLE.edgeColor)}
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
                    value={toColorPickerHex(backgroundColor, DEFAULT_GRAPH_STYLE.backgroundColor)}
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
            {selectedIds.length > 1 ? (
              <Inspector>
                <InspectorMeta>
                  {selectedIds.length} selected ({selectedNodeIds.length} node{selectedNodeIds.length === 1 ? '' : 's'} · {selectedEdgeIds.length} edge{selectedEdgeIds.length === 1 ? '' : 's'})
                </InspectorMeta>
                {selectedNodeIds.length === 2 && (
                  <Button
                    type="button"
                    onClick={() => {
                      addEdge({ source: selectedNodeIds[0]!, target: selectedNodeIds[1]! })
                        .then(msg => setStatus(msg))
                        .catch(error => setStatus(error instanceof Error ? error.message : String(error)))
                    }}
                  >
                    Connect 2 selected nodes
                  </Button>
                )}
                {selectedNodeIds.length > 0 && (
                  <ButtonRow>
                    <GhostButton type="button" onClick={() => onCommand([{ type: 'pin', ids: selectedNodeIds, pinned: true }])}>
                      Pin ({selectedNodeIds.length})
                    </GhostButton>
                    <GhostButton type="button" onClick={() => onCommand([{ type: 'pin', ids: selectedNodeIds, pinned: false }])}>
                      Unpin ({selectedNodeIds.length})
                    </GhostButton>
                  </ButtonRow>
                )}
                <ColorRow>
                  <Label htmlFor="bulk-color">
                    Bulk color
                    <ColorInput
                      id="bulk-color"
                      type="color"
                      value={bulkColor}
                      onChange={event => setBulkColor(event.target.value)}
                    />
                  </Label>
                  <div style={{ display: 'grid', alignContent: 'end' }}>
                    <GhostButton type="button" onClick={() => onCommand([{ type: 'update', ids: selectedIds, data: { color: bulkColor } }])}>
                      Apply color
                    </GhostButton>
                  </div>
                </ColorRow>
                {selectedNodeIds.length > 0 && (
                  <TwoCol>
                    <Input
                      aria-label="Bulk category"
                      value={bulkCategory}
                      placeholder="Category"
                      onChange={event => setBulkCategory(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          onCommand([{ type: 'update', ids: selectedNodeIds, data: { category: bulkCategory.trim() || undefined } }])
                        }
                      }}
                    />
                    <GhostButton
                      type="button"
                      onClick={() => onCommand([{ type: 'update', ids: selectedNodeIds, data: { category: bulkCategory.trim() || undefined } }])}
                    >
                      Set category
                    </GhostButton>
                  </TwoCol>
                )}
                <ButtonRow>
                  <GhostButton type="button" onClick={duplicateSelection} disabled={selectedNodeIds.length === 0}>
                    Duplicate
                  </GhostButton>
                  <GhostButton
                    type="button"
                    onClick={() => {
                      onCommand([{ type: 'remove', ids: selectedIds }])
                      selectElements([])
                    }}
                  >
                    Delete ({selectedIds.length})
                  </GhostButton>
                </ButtonRow>
              </Inspector>
            ) : selectedElement ? (
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
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        setElementLabel(selectedElement.id, selectedLabel).catch(error =>
                          setStatus(error instanceof Error ? error.message : String(error)),
                        )
                      }
                    }}
                  />
                </Label>
                {selectedElement.kind === 'node' ? (
                  <>
                    <ColorRow>
                      <Label htmlFor="selected-node-color">
                        Node color
                        <ColorInput
                          id="selected-node-color"
                          type="color"
                          value={toColorPickerHex(selectedElement.data.color, nodeColor)}
                          onChange={event => onCommand([{ type: 'update', ids: [selectedElement.id], data: { color: event.target.value } }])}
                        />
                      </Label>
                      <Label htmlFor="selected-node-shape">
                        Node shape
                        <SelectField
                          id="selected-node-shape"
                          aria-label="Selected node shape"
                          value={typeof selectedElement.data.shape === 'string' ? selectedElement.data.shape : ''}
                          options={[{ value: '', label: 'Default' }, ...SUPPORTED_NODE_SHAPES.map(value => ({ value, label: value }))]}
                          onValueChange={value => onCommand([{ type: 'update', ids: [selectedElement.id], data: { shape: value || undefined } }])}
                        />
                      </Label>
                    </ColorRow>
                    <Label htmlFor="selected-node-size">
                      Node size {typeof selectedElement.data.size === 'number' ? selectedElement.data.size : `default (${nodeSize})`}
                      <RangeInput
                        id="selected-node-size"
                        type="range"
                        min="4"
                        max="96"
                        value={typeof selectedElement.data.size === 'number' ? selectedElement.data.size : nodeSize}
                        onChange={event => onCommand([{ type: 'update', ids: [selectedElement.id], data: { size: Number(event.target.value) } }])}
                      />
                    </Label>
                    <ButtonRow>
                      <GhostButton
                        type="button"
                        onClick={() => onCommand([{ type: 'pin', ids: [selectedElement.id], pinned: !selectedElement.data.pinned }])}
                      >
                        {selectedElement.data.pinned ? 'Unpin' : 'Pin'}
                      </GhostButton>
                      <GhostButton
                        type="button"
                        onClick={() => onCommand([{ type: 'update', ids: [selectedElement.id], data: { color: undefined, shape: undefined, size: undefined, borderWidth: undefined } }])}
                      >
                        Reset style
                      </GhostButton>
                    </ButtonRow>
                  </>
                ) : (
                  <>
                    <ColorRow>
                      <Label htmlFor="selected-edge-color">
                        Edge color
                        <ColorInput
                          id="selected-edge-color"
                          type="color"
                          value={toColorPickerHex(selectedElement.data.color, edgeColor)}
                          onChange={event => onCommand([{ type: 'update', ids: [selectedElement.id], data: { color: event.target.value } }])}
                        />
                      </Label>
                      <div style={{ display: 'grid', alignContent: 'end' }}>
                        <GhostButton
                          type="button"
                          onClick={() => onCommand([{ type: 'update', ids: [selectedElement.id], data: { color: undefined, width: undefined } }])}
                        >
                          Reset style
                        </GhostButton>
                      </div>
                    </ColorRow>
                    <Label htmlFor="selected-edge-width">
                      Edge width {typeof selectedElement.data.width === 'number' ? selectedElement.data.width : `default (${edgeWidth})`}
                      <RangeInput
                        id="selected-edge-width"
                        type="range"
                        min="0.25"
                        max="10"
                        step="0.25"
                        value={typeof selectedElement.data.width === 'number' ? selectedElement.data.width : edgeWidth}
                        onChange={event => onCommand([{ type: 'update', ids: [selectedElement.id], data: { width: Number(event.target.value) } }])}
                      />
                    </Label>
                    <GhostButton
                      type="button"
                      disabled={!selectedElement.source || !selectedElement.target || selectedElement.source === selectedElement.target}
                      onClick={() => {
                        if (!selectedElement.source || !selectedElement.target) return
                        onCommand([{ type: 'update', ids: [selectedElement.id], data: { source: selectedElement.target, target: selectedElement.source } }])
                        setStatus(`Reversed edge ${selectedElement.id}`)
                      }}
                    >
                      Reverse edge direction
                    </GhostButton>
                  </>
                )}
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
              <InspectorMeta>Select a node or edge on the canvas. Double-click canvas to add a node.</InspectorMeta>
            )}
          </Section>

          {activePanel === 'Export' && <GraphExport options={exportOptions} setOptions={setExportOptions} document={currentDocument} visibleElements={visibleElements} selectedIds={selectedIds} onExport={exportGraphUi} />}
          {activePanel === 'Review' && <GraphReview document={currentDocument} elements={currentDocument.elements} directed={directed} selectedIds={selectedIds} onSelect={selectElements} />}
          <PaneWidth {...compactPart(compact, 'hide')}>Pane width<input aria-label="Pane width" type="range" min={300} max={680} value={panelWidth} onChange={event => setPanelWidth(Number(event.target.value))} /></PaneWidth>
        </Panel>
        <GraphHost style={{ backgroundColor: safeColorString(drawnBackground, DEFAULT_GRAPH_STYLE.backgroundColor) }} {...compactPart(compact, 'host')}>
          <GraphCanvas ref={containerRef} {...agentRefs(['@open', documentPath, documentPath && `path:${documentPath}`], documentTitle)} />
          {quickSearchOpen && (
            <CanvasFloatingBar role="search" aria-label="Quick node search">
              <input
                ref={quickSearchInputRef}
                type="search"
                aria-label="Find node on canvas"
                placeholder="Find node…"
                value={quickSearchQuery}
                onChange={event => {
                  setQuickSearchQuery(event.target.value)
                  setQuickSearchIndex(0)
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    jumpToSearchMatch(event.shiftKey ? quickSearchIndex - 1 : quickSearchIndex + (quickSearchMatches.length > 1 && selectedIds[0] === quickSearchMatches[quickSearchIndex]?.data.id ? 1 : 0))
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    setQuickSearchOpen(false)
                  }
                }}
              />
              <span>
                {quickSearchQuery.trim()
                  ? quickSearchMatches.length
                    ? `${(quickSearchIndex % quickSearchMatches.length) + 1}/${quickSearchMatches.length}`
                    : '0'
                  : ''}
              </span>
              <button type="button" disabled={!quickSearchMatches.length} onClick={() => jumpToSearchMatch(quickSearchIndex - 1)}>Prev</button>
              <button type="button" disabled={!quickSearchMatches.length} onClick={() => jumpToSearchMatch(quickSearchIndex + 1)}>Next</button>
              <button type="button" aria-label="Close search" onClick={() => setQuickSearchOpen(false)}>×</button>
            </CanvasFloatingBar>
          )}
          {!quickSearchOpen && connectMode && (
            <CanvasFloatingBar role="status">
              <span>{connectSource ? `Connect from ${connectSource}: click target node` : 'Connect mode: click source node'}</span>
              <button type="button" onClick={() => { setConnectMode(false); setConnectSource(null); setStatus('Exited connect mode') }}>Done</button>
            </CanvasFloatingBar>
          )}
          {currentDocument.elements.length > 0 && <CrossAppDragHandle label="graph"
            style={{position:'absolute',top:12,right:12,zIndex:2}}
            disabled={dragSnapshot?.request !== dragRequest} onError={setStatus}
            getContent={()=>{
              if(!dragSnapshot || dragSnapshot.request !== dragRequest)throw new Error('The graph is still being prepared.')
              return {name:`${currentDocument.title || 'graph'}.svg`,alt:currentDocument.title || 'Graph',dataUrl:dragSnapshot.dataUrl}
            }} />}

          {styleState.showLegend && <div aria-label="Graph legend" style={{ position: 'absolute', bottom: 16, left: 16, maxHeight: '30%', overflow: 'auto', backgroundColor: safeColorString(drawnBackground, DEFAULT_GRAPH_STYLE.backgroundColor), color: readableTextColor(drawnBackground), padding: 12, borderRadius: 8 }}>
            {graphLegend(currentDocument).map(entry => <div key={entry.label + entry.color} {...categoryRefs(entry.label)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ backgroundColor: safeColorString(entry.color, drawnStyle.nodeColor), width: 12, height: 12, display: 'inline-block', borderRadius: 3 }} />{entry.label}</div>)}
          </div>}
          {cyReady && (
            <ZoomControls aria-label="Canvas zoom controls">
              <button type="button" aria-label="Zoom out" title="Zoom out (-)" onClick={() => zoomBy(0.8)}>−</button>
              <button type="button" aria-label="Reset zoom to 100%" title="Reset zoom to 100%" onClick={resetZoom}>{zoomPercent}%</button>
              <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomBy(1.25)}>+</button>
              <button type="button" aria-label="Fit graph" title="Fit graph (0)" onClick={fit}>Fit</button>
            </ZoomControls>
          )}
          {!cyReady ? (
            <EmptyOverlay>Loading graph</EmptyOverlay>
          ) : graphStats.nodes === 0 ? (
            <EmptyOverlay>
              Create a relationship map.<br /><GhostButton onClick={() => showPanel('Data')}>Import data</GhostButton> <GhostButton onClick={() => { showPanel('Graph'); if (createDetailsRef.current) createDetailsRef.current.open = true }}>Add a node</GhostButton>
            </EmptyOverlay>
          ) : null}
        </GraphHost>
      </Workspace>
    </Root>
  )
}
