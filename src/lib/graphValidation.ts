import type { GraphElement } from './graphParser'

export const isEdge = (element: GraphElement): boolean => element.group === 'edges' || element.data.source !== undefined || element.data.target !== undefined

export function validateElements(elements: GraphElement[]): void {
  if (!Array.isArray(elements)) throw new Error('Elements must be an array.')
  const ids = new Set<string>()
  const nodes = new Set<string>()
  for (const element of elements) {
    if (!element || typeof element !== 'object' || !element.data || typeof element.data !== 'object') throw new Error('Each element needs a data object.')
    if (element.group === 'nodes' && (element.data.source !== undefined || element.data.target !== undefined)) throw new Error('A node cannot have edge endpoints.')
    const id = element.data.id
    if (typeof id !== 'string' || !id.trim()) throw new Error('Every element needs a nonempty ID.')
    if (ids.has(id)) throw new Error(`Duplicate ID "${id}". IDs must be unique across nodes and edges.`)
    ids.add(id)
    if (!isEdge(element)) nodes.add(id)
    if (element.position && (!Number.isFinite(element.position.x) || !Number.isFinite(element.position.y))) throw new Error(`Invalid position for "${id}".`)
  }
  for (const element of elements.filter(isEdge)) {
    for (const endpoint of [element.data.source, element.data.target]) {
      if (typeof endpoint !== 'string' || !nodes.has(endpoint)) throw new Error(`Edge "${element.data.id}" references missing node "${endpoint ?? ''}".`)
    }
  }
}

