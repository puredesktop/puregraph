import type { GraphContextSummary, GraphStyleState } from '../agents/context'
import type { GraphLayoutName } from '../constants'

/**
 * How many nodes and edges a context read lists. Sample graphs alone reach
 * 289 nodes and 430 edges; a whole-graph dump on every read would swamp the
 * model's window, so past the cap the read says `truncated` and the model
 * works from counts and the listed ids.
 */
export const CONTEXT_NODE_LIMIT = 200
export const CONTEXT_EDGE_LIMIT = 200

export interface GraphContextInput {
  documentPath: string | null
  edges: GraphContextSummary['edges']
  layout: GraphLayoutName
  nodes: GraphContextSummary['nodes']
  selectedIds: string[]
  style: GraphStyleState
  title: string
}

export function summarizeGraphContext(input: GraphContextInput): GraphContextSummary {
  const nodeCount = input.nodes.length
  const edgeCount = input.edges.length
  const truncated =
    nodeCount > CONTEXT_NODE_LIMIT || edgeCount > CONTEXT_EDGE_LIMIT
  // Selected elements are what "this node" refers to; they stay listed even
  // when the rest of the graph is cut.
  const selected = new Set(input.selectedIds)
  const nodes = truncated
    ? [
        ...input.nodes.filter(node => selected.has(node.id)),
        ...input.nodes.filter(node => !selected.has(node.id)),
      ].slice(0, CONTEXT_NODE_LIMIT)
    : input.nodes
  const edges = truncated
    ? [
        ...input.edges.filter(edge => selected.has(edge.id)),
        ...input.edges.filter(edge => !selected.has(edge.id)),
      ].slice(0, CONTEXT_EDGE_LIMIT)
    : input.edges
  return {
    title: input.title,
    documentPath: input.documentPath,
    nodeCount,
    edgeCount,
    layout: input.layout,
    style: input.style,
    selectedIds: input.selectedIds,
    truncated,
    ...(truncated
      ? {
          note: `Listing ${nodes.length} of ${nodeCount} nodes and ${edges.length} of ${edgeCount} edges. Selected elements are listed first. Work from the counts and the listed ids; use queryGraph with offset/limit or IDs for attributes, and analyzeGraph for grounded paths and neighborhoods.`,
        }
      : {}),
    nodes,
    edges,
  }
}
