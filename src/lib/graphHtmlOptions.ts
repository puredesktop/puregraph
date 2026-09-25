import type { GraphDocument } from './graphDocument'

export interface GraphHtmlOptions {
  selectedOnly?: boolean
  includeViews?: boolean
  initialViewId?: string
  attributeKeys?: string[]
}
export const visualKeys = new Set(['id', 'source', 'target', 'label', 'category', 'cluster', 'color', 'shape', 'size', 'width', 'borderWidth', 'callout'])
export function graphAttributeKeys(document: GraphDocument): string[] {
  return [...new Set(document.elements.flatMap(element => Object.keys(element.data)))].filter(key => !visualKeys.has(key) && key !== 'pinned').sort()
}
