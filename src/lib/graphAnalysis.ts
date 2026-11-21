import type { GraphElement } from './graphParser'
import { isEdge, validateElements } from './graphCommands'

function adjacency(elements: GraphElement[], directed: boolean) {
  validateElements(elements)
  const neighbors = new Map<string, { node: string; edge: string }[]>()
  elements.filter(element => !isEdge(element)).forEach(element => neighbors.set(element.data.id!, []))
  for (const { data } of elements.filter(isEdge)) {
    neighbors.get(data.source!)!.push({ node: data.target!, edge: data.id! })
    if (!directed) neighbors.get(data.target!)!.push({ node: data.source!, edge: data.id! })
  }
  return neighbors
}

export function neighborhood(elements: GraphElement[], id: string, direction: 'incoming' | 'outgoing' | 'both' = 'both'): string[] {
  if (!elements.some(element => !isEdge(element) && element.data.id === id)) throw new Error(`No node "${id}".`)
  const result = new Set([id])
  for (const { data } of elements.filter(isEdge)) {
    if ((direction !== 'incoming' && data.source === id) || (direction !== 'outgoing' && data.target === id)) {
      result.add(data.id!); result.add(data.source!); result.add(data.target!)
    }
  }
  return [...result]
}

/** Weakly connected components: arrow direction is intentionally ignored. */
export function connectedComponents(elements: GraphElement[]): string[][] {
  const graph = adjacency(elements, false)
  const seen = new Set<string>(), result: string[][] = []
  for (const start of graph.keys()) {
    if (seen.has(start)) continue
    const component = [start]; seen.add(start)
    for (let i = 0; i < component.length; i++) for (const { node } of graph.get(component[i])!) {
      if (!seen.has(node)) { seen.add(node); component.push(node) }
    }
    result.push(component)
  }
  return result
}

/** Unweighted shortest path (fewest edges), with traversal direction explicit. */
export function shortestPath(elements: GraphElement[], start: string, end: string, directed: boolean): { nodes: string[]; edges: string[] } | null {
  const graph = adjacency(elements, directed)
  if (!graph.has(start) || !graph.has(end)) throw new Error('Choose two existing nodes.')
  const parent = new Map<string, { node: string; edge: string }>()
  const seen = new Set([start]), queue = [start]
  for (let i = 0; i < queue.length && !seen.has(end); i++) {
    for (const step of graph.get(queue[i])!) if (!seen.has(step.node)) {
      seen.add(step.node); parent.set(step.node, { node: queue[i], edge: step.edge }); queue.push(step.node)
    }
  }
  if (!seen.has(end)) return null
  const nodes = [end], edges: string[] = []
  while (nodes.at(-1) !== start) { const step = parent.get(nodes.at(-1)!)!; nodes.push(step.node); edges.push(step.edge) }
  return { nodes: nodes.reverse(), edges: edges.reverse() }
}

/** Iterative DFS avoids call-stack limits on large imported graphs. */
export function findCycle(elements: GraphElement[], directed: boolean): string[] | null {
  const graph = adjacency(elements, directed), state = new Map<string, number>()
  for (const start of graph.keys()) {
    if (state.has(start)) continue
    const stack = [{ node: start, via: '', index: 0 }]
    state.set(start, 1)
    while (stack.length) {
      const frame = stack[stack.length - 1], neighbors = graph.get(frame.node)!
      if (frame.index === neighbors.length) { state.set(frame.node, 2); stack.pop(); continue }
      const step = neighbors[frame.index++]
      if (!directed && step.edge === frame.via) continue
      if (state.get(step.node) === 1) {
        const at = stack.findIndex(entry => entry.node === step.node)
        return [...stack.slice(at).map(entry => entry.node), step.node]
      }
      if (!state.has(step.node)) { state.set(step.node, 1); stack.push({ node: step.node, via: step.edge, index: 0 }) }
    }
  }
  return null
}

/** Deduplicated node IDs plus the connecting cycle edge IDs for selecting a cycle cleanly. */
export function cycleSelectionIds(elements: GraphElement[], cycle: string[], directed: boolean): string[] {
  const uniqueNodes = [...new Set(cycle)]
  const edges = elements.filter(isEdge)
  const usedEdges = new Set<string>()
  const edgeIds: string[] = []
  for (let i = 0; i < cycle.length - 1; i++) {
    const from = cycle[i]!, to = cycle[i + 1]!
    const match = edges.find(edge => {
      const id = edge.data.id!
      if (usedEdges.has(id)) return false
      if (edge.data.source === from && edge.data.target === to) return true
      return !directed && edge.data.source === to && edge.data.target === from
    })
    if (match) {
      usedEdges.add(match.data.id!)
      edgeIds.push(match.data.id!)
    }
  }
  return [...uniqueNodes, ...edgeIds]
}

export interface GraphHubMetric {
  id: string
  label: string
  degree: number
  inDegree: number
  outDegree: number
}

export interface GraphMetrics {
  nodeCount: number
  edgeCount: number
  density: number
  averageDegree: number
  selfLoopCount: number
  isolatedNodeIds: string[]
  topHubs: GraphHubMetric[]
}

/** Summary network metrics for the Review panel: density, degree, loops, orphans, and hubs. */
export function graphMetrics(elements: GraphElement[], directed: boolean): GraphMetrics {
  const nodes = elements.filter(element => !isEdge(element))
  const edges = elements.filter(isEdge)
  const inDeg = new Map<string, number>()
  const outDeg = new Map<string, number>()
  for (const node of nodes) {
    const id = node.data.id!
    inDeg.set(id, 0)
    outDeg.set(id, 0)
  }
  let selfLoopCount = 0
  const uniqueNonLoopPairs = new Set<string>()
  for (const edge of edges) {
    const src = edge.data.source!
    const tgt = edge.data.target!
    if (outDeg.has(src)) outDeg.set(src, outDeg.get(src)! + 1)
    if (inDeg.has(tgt)) inDeg.set(tgt, inDeg.get(tgt)! + 1)
    if (src === tgt) {
      selfLoopCount++
    } else {
      const pairKey = directed ? `${src}\0${tgt}` : src < tgt ? `${src}\0${tgt}` : `${tgt}\0${src}`
      uniqueNonLoopPairs.add(pairKey)
    }
  }
  const nodeCount = nodes.length
  const edgeCount = edges.length
  const possible = nodeCount > 1 ? (directed ? nodeCount * (nodeCount - 1) : (nodeCount * (nodeCount - 1)) / 2) : 0
  const density = possible > 0 ? uniqueNonLoopPairs.size / possible : 0
  const averageDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0
  const isolatedNodeIds: string[] = []
  const hubList: GraphHubMetric[] = []
  for (const node of nodes) {
    const id = node.data.id!
    const inDegree = inDeg.get(id) ?? 0
    const outDegree = outDeg.get(id) ?? 0
    const degree = inDegree + outDegree
    if (degree === 0) isolatedNodeIds.push(id)
    hubList.push({
      id,
      label: String(node.data.label || id),
      degree,
      inDegree,
      outDegree,
    })
  }
  hubList.sort((a, b) => b.degree - a.degree || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return {
    nodeCount,
    edgeCount,
    density,
    averageDegree,
    selfLoopCount,
    isolatedNodeIds,
    topHubs: hubList.filter(hub => hub.degree > 0).slice(0, 5),
  }
}
