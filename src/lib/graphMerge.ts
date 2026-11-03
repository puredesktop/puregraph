import type { GraphDocument } from './graphDocument'
import { threeWayMerge } from './threeWayMerge'

const elementOrItemId = (item: unknown): string | null => {
  const entry = (item ?? {}) as { id?: unknown; data?: { id?: unknown } }
  const id = entry.data?.id ?? entry.id
  return typeof id === 'string' ? id : null
}

/** Two copies' work on one graph: node by node and edge by edge, and field by field inside each. */
export function mergeGraphs(base: GraphDocument, local: GraphDocument, remote: GraphDocument): GraphDocument {
  return threeWayMerge(base, local, remote, { idOf: elementOrItemId })
}
