import type { GraphDocument } from './graphDocument'
import { threeWayMerge } from './threeWayMerge'
import { isEdge } from './graphValidation'

const elementOrItemId = (item: unknown): string | null => {
  const entry = (item ?? {}) as { id?: unknown; data?: { id?: unknown } }
  const id = entry.data?.id ?? entry.id
  return typeof id === 'string' ? id : null
}

/** Two copies' work on one graph: node by node and edge by edge, and field by field inside each. */
export function mergeGraphs(base: GraphDocument, local: GraphDocument, remote: GraphDocument): GraphDocument {
  const merged = threeWayMerge(base, local, remote, { idOf: elementOrItemId })
  const nodeIds = new Set(
    merged.elements
      .filter(element => !isEdge(element) && typeof element.data?.id === 'string')
      .map(element => element.data.id!),
  )
  const elements = merged.elements.filter(
    element =>
      !isEdge(element) ||
      (typeof element.data?.source === 'string' &&
        typeof element.data?.target === 'string' &&
        nodeIds.has(element.data.source) &&
        nodeIds.has(element.data.target)),
  )
  if (elements.length === merged.elements.length) return merged
  const validIds = new Set(elements.map(element => element.data.id!))
  const views = merged.views?.map(view => ({
    ...view,
    selectedIds: view.selectedIds.filter(id => validIds.has(id)),
    state: {
      ...view.state,
      hiddenIds: view.state.hiddenIds.filter(id => validIds.has(id)),
      focusIds: view.state.focusIds ? view.state.focusIds.filter(id => validIds.has(id)) : null,
    },
  }))
  return { ...merged, elements, ...(views ? { views } : {}) }
}
