import { encodingLegend } from './graphEncoding'
import type { GraphDocument } from './graphDocument'
import { graphNodeColor } from '../canvas/graphStyle'
export function graphLegend(document: GraphDocument): { label: string; color: string }[] {
  const result = new Map<string, { label: string; color: string }>()
  for (const element of document.elements) {
    if (element.data.source !== undefined) continue
    const label = String(element.data.category ?? element.data.cluster ?? 'Nodes'), color = graphNodeColor(element.data, document.style)
    result.set(`${label}\0${color}`, { label, color })
  }
  return [...encodingLegend(document), ...result.values()]
}
