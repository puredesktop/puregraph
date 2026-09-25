import type { GraphDocument } from './graphDocument'
import type { GraphElement } from './graphParser'
/** One scope calculation shared by the preview and the actual exporter. */
export function graphExportDocument(document: GraphDocument, scope: 'all' | 'view' | 'selected' = 'all', visibleElements: GraphElement[] = document.elements, selectedIds: string[] = []): GraphDocument {
  if (scope === 'all') return document
  const ids = new Set(selectedIds)
  const elements = scope === 'view' ? visibleElements : document.elements.filter(element => element.data.source === undefined ? ids.has(element.data.id!) : ids.has(element.data.source) && ids.has(element.data.target!))
  return { ...document, elements }
}
