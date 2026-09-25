import type { GraphExportOptions } from '../canvas/graphExport'
import type { queryGraph, analyzeGraph, GraphViewState } from '../lib/graphExplore'
import type { GraphDocument } from '../lib/graphDocument'
import type { GraphCommand } from '../lib/graphCommands'
import type { GraphElement } from '../lib/graphParser'
import type {
  GraphCurveStyle,
  GraphLayoutName,
  GraphNodeShape,
} from '../constants'

export interface GraphStyleState {
  backgroundColor: string
  curveStyle: GraphCurveStyle
  directed: boolean
  edgeColor: string
  edgeWidth: number
  labelPlacement?: 'inside' | 'outside'
  labelSize: number
  nodeColor: string
  nodeShape: GraphNodeShape
  nodeSize: number
  showLabels: boolean
  showEdgeLabels?: boolean
  showLegend?: boolean
  categoryColors?: Record<string, string>
}

export interface GraphContextSummary {
  pendingProposal?: { id: string; title: string; impact: Record<string, number | boolean> } | null
  title: string
  /** The bound .graph package, or null while the graph is an unsaved new document. */
  documentPath: string | null
  edgeCount: number
  edges: Array<{
    data?: Record<string, unknown>
    position?: { x: number; y: number }
    id: string
    label: string | null
    source: string
    target: string
  }>
  layout: GraphLayoutName
  nodeCount: number
  nodes: Array<{
    data?: Record<string, unknown>
    position?: { x: number; y: number }
    id: string
    label: string
  }>
  selectedIds: string[]
  style: GraphStyleState
  /** True when nodes/edges are capped; counts are always complete. */
  truncated: boolean
  note?: string
}

export interface LoadGraphOptions {
  /** Required when the graph already holds elements. */
  replace?: boolean
}

export interface PureGraphAgentContext {
  queryGraph(input: Parameters<typeof queryGraph>[1]): ReturnType<typeof queryGraph>
  analyzeGraph(input: Parameters<typeof analyzeGraph>[1]): ReturnType<typeof analyzeGraph>
  exploreGraph(input: { action: 'select' | 'focus' | 'exclude' | 'reset' | 'openView'; ids?: string[]; viewId?: string }): string
  saveGraphView(name: string, caption: string): string
  applyGraphPalette(): string

  createGraph(document: GraphDocument): Promise<string>
  applyGraphProposal(proposalId: string): Promise<string>
  discardGraphProposal(proposalId: string): Promise<string>
  proposeGraph(title: string, commands: GraphCommand[]): Promise<string>
  addEdge(input: {
    id?: string
    label?: string
    source: string
    target: string
  }): Promise<string>
  addNode(input: { id?: string; label?: string }): Promise<string>
  saveGraph(): Promise<string>
  exportGraph(input: { filename?: string; format?: 'png' | 'svg' | 'json' | 'html'; options?: GraphExportOptions }): Promise<string>
  fit(): void
  getContext(): GraphContextSummary
  loadGraph(
    elements: GraphElement[],
    source: string | undefined,
    options: LoadGraphOptions,
  ): Promise<string>
  /** Open a built-in sample as a new graph document (never over the open one). */
  loadSample(sampleId: string): Promise<string>
  readGraphFile(path: string): Promise<string>
  clearGraph(options: { confirm?: boolean }): Promise<string>
  removeElement(id: string): Promise<string>
  runLayout(name: GraphLayoutName): Promise<string>
  setElementLabel(id: string, label: string): Promise<string>
  setStyle(input: Partial<GraphStyleState>): Promise<string>
}

export class GraphToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GraphToolError'
  }
}
