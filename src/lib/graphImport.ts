import { parseGraphDocument, type GraphDocument } from './graphDocument'
import type { GraphElement } from './graphParser'
import { isEdge, validateElements } from './graphCommands'

import { parseGraphInput } from './graphInput'
export function previewGraphImport(text: string): { elements: GraphElement[]; notes: string[]; document?: GraphDocument } {
  const parsed = parseGraphInput(text)
  if (/^\s*\{/.test(text) && JSON.parse(text).schemaVersion === 1) {
    const document = parseGraphDocument(text)
    return { ...parsed, document, notes: [...parsed.notes, 'Full document: Replace also restores title, layout and styling. Merge uses only its elements.'] }
  }
  return parsed
}

/** Existing nodes keep their positions and properties; matching edge IDs must agree. */
export function mergeGraphElements(existing: GraphElement[], incoming: GraphElement[]): GraphElement[] {
  const result = structuredClone(existing), byId = new Map(result.map(element => [element.data.id, element]))
  for (const element of incoming) {
    const previous = byId.get(element.data.id)
    if (!previous) { const copy = structuredClone(element); result.push(copy); byId.set(copy.data.id, copy); continue }
    if (isEdge(previous) !== isEdge(element) || (isEdge(element) && (previous.data.source !== element.data.source || previous.data.target !== element.data.target))) {
      throw new Error(`ID "${element.data.id}" conflicts with an existing element. Rename it before merging.`)
    }
  }
  validateElements(result)
  return result
}
