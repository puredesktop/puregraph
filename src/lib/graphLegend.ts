import { encodingLegend } from './graphEncoding'
import { graphCategory } from './graphExplore'
import type { GraphDocument } from './graphDocument'
import { graphNodeColor } from '../canvas/graphStyle'

export function graphCategoryLegend(document: GraphDocument): { label: string; color: string }[] {
  const result = new Map<string, { label: string; color: string }>()
  for (const element of document.elements) {
    if (element.data.source !== undefined) continue
    const label = graphCategory(element), color = graphNodeColor(element.data, document.style)
    result.set(`${label}\0${color}`, { label, color })
  }
  return [...result.values()]
}

export function graphLegend(document: GraphDocument): { label: string; color: string }[] {
  return [...encodingLegend(document), ...graphCategoryLegend(document)]
}
