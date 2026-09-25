import { normalizeEncodings, type GraphEncoding } from './graphEncoding'
import { normalizeSavedViews, type GraphSavedView } from './graphExplore'
import { validateElements } from './graphValidation'
import type { GraphStyleState } from '../agents/context'
import {
  SUPPORTED_CURVE_STYLES,
  SUPPORTED_LAYOUTS,
  SUPPORTED_NODE_SHAPES,
  type GraphCurveStyle,
  type GraphLayoutName,
  type GraphNodeShape,
} from '../constants'
import type { GraphElement, GraphSample } from './graphParser'
import { parseGraph } from './graphParser'

export interface GraphDocument {
  schemaVersion: 1
  title: string
  layout: GraphLayoutName
  style: GraphStyleState
  elements: GraphElement[]
  encodings?: GraphEncoding[]
  views?: GraphSavedView[]
  revision?: string
  savedAt?: string
}

export const DEFAULT_GRAPH_TITLE = 'Untitled graph'
export const DEFAULT_GRAPH_LAYOUT: GraphLayoutName = 'cose'

export const DEFAULT_GRAPH_STYLE: GraphStyleState = {
  backgroundColor: '#ffffff',
  curveStyle: 'bezier',
  directed: true,
  edgeColor: '#9aa8b6',
  edgeWidth: 1.2,
  labelSize: 11,
  labelPlacement: 'outside',
  nodeColor: '#668b9b',
  nodeShape: 'ellipse',
  nodeSize: 20,
  showLabels: true,
  showEdgeLabels: false,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

// Cytoscape accepts any CSS colour and the label-contrast helper tolerates
// what it cannot parse, so a colour only has to be a non-empty string.
function colorString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/** Whatever a file or sample supplies, completed to a full, typed style. */
export function normalizeGraphStyle(
  style: Partial<GraphStyleState> | Record<string, unknown> | undefined,
): GraphStyleState {
  const input: Record<string, unknown> = isRecord(style) ? style : {}
  const base = DEFAULT_GRAPH_STYLE
  return {
    backgroundColor: colorString(input.backgroundColor, base.backgroundColor),
    curveStyle: isOneOf<GraphCurveStyle>(input.curveStyle, SUPPORTED_CURVE_STYLES)
      ? input.curveStyle
      : base.curveStyle,
    directed: typeof input.directed === 'boolean' ? input.directed : base.directed,
    edgeColor: colorString(input.edgeColor, base.edgeColor),
    edgeWidth: Math.max(0.25, Math.min(10, finiteNumber(input.edgeWidth, base.edgeWidth))),
    labelPlacement: input.labelPlacement === 'inside' ? 'inside' : 'outside',
    labelSize: Math.max(5, Math.min(48, finiteNumber(input.labelSize, base.labelSize))),
    nodeColor: colorString(input.nodeColor, base.nodeColor),
    nodeShape: isOneOf<GraphNodeShape>(input.nodeShape, SUPPORTED_NODE_SHAPES)
      ? input.nodeShape
      : base.nodeShape,
    nodeSize: Math.max(4, Math.min(200, finiteNumber(input.nodeSize, base.nodeSize))),
    showLabels: typeof input.showLabels === 'boolean' ? input.showLabels : base.showLabels,
    showEdgeLabels: typeof input.showEdgeLabels === 'boolean' ? input.showEdgeLabels : false,
    ...(typeof input.showLegend === 'boolean' ? { showLegend: input.showLegend } : {}),
    ...(isRecord(input.categoryColors) ? { categoryColors: Object.fromEntries(Object.entries(input.categoryColors).filter(([, value]) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))) as Record<string, string> } : {}),
  }
}

export function normalizeGraphLayout(value: unknown): GraphLayoutName {
  return isOneOf<GraphLayoutName>(value, SUPPORTED_LAYOUTS)
    ? value
    : DEFAULT_GRAPH_LAYOUT
}

/**
 * A new graph is empty. Sample data is loaded only by an explicit user (or
 * agent) action — see `graphDocumentFromSample` — never shipped into a
 * document by default.
 */
export function defaultGraphDocument(): GraphDocument {
  return {
    schemaVersion: 1,
    title: DEFAULT_GRAPH_TITLE,
    layout: DEFAULT_GRAPH_LAYOUT,
    style: { ...DEFAULT_GRAPH_STYLE },
    elements: [],
  }
}

export function graphDocumentFromSample(sample: GraphSample): GraphDocument {
  return {
    schemaVersion: 1,
    title: sample.name,
    layout: sample.layout,
    style: normalizeGraphStyle(sample.style),
    elements: parseGraph(sample.data).map(element => ({ ...element, data: { ...element.data, synthetic: true, provenance: 'Built-in illustrative sample' } })),
  }
}

export function parseGraphDocument(text: string): GraphDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(
      `Not a graph document: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!isRecord(parsed)) throw new Error('Unrecognized graph document.')
  if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 1) throw new Error('This graph uses an unsupported document version.')
  if (parsed.elements !== undefined && !Array.isArray(parsed.elements)) throw new Error('Graph elements must be an array.')
  if (parsed.schemaVersion === 1) validateElements((parsed.elements ?? []) as GraphElement[])
  const elements = Array.isArray(parsed.elements)
    ? parseGraph(JSON.stringify(parsed.elements))
    : []
  return {
    schemaVersion: 1,
    title: typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim()
      : DEFAULT_GRAPH_TITLE,
    layout: normalizeGraphLayout(parsed.layout),
    style: normalizeGraphStyle(isRecord(parsed.style) ? parsed.style : undefined),
    elements,
    ...(Array.isArray(parsed.encodings) ? { encodings: normalizeEncodings(parsed.encodings) } : {}),
    ...(Array.isArray(parsed.views) ? { views: normalizeSavedViews(parsed.views) } : {}),
    revision: typeof parsed.revision === 'string' ? parsed.revision : undefined,
    savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : undefined,
  }
}

export function serializeGraphDocument(document: GraphDocument): string {
  return `${JSON.stringify(
    {
      ...document,
      savedAt: new Date().toISOString(),
      revision: crypto.randomUUID(),
    },
    null,
    2,
  )}\n`
}

/** Save metadata is not an edit; normalize legacy element defaults consistently. */
export function graphContentFingerprint(document: GraphDocument): string {
  const normalized = parseGraphDocument(JSON.stringify(document))
  return JSON.stringify({ ...normalized, savedAt: undefined, revision: undefined })
}
