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
