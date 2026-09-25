import { defaultGraphDocument } from './graphDocument'
import { applyGraphCommands, type GraphCommand } from './graphCommands'
import { SUPPORTED_LAYOUTS, type GraphLayoutName } from '../constants'

/** Validate the entire new document before the app saves or switches anything. */
export function prepareNewGraph(input: Record<string, unknown>) {
  if (typeof input.title !== 'string' || !input.title.trim()) throw new Error('Provide a title for the new graph.')
  if (!Array.isArray(input.elements)) throw new Error('Provide elements with node data and edge data.')
  const layout = input.layout ?? 'cose'
  if (!SUPPORTED_LAYOUTS.includes(layout as GraphLayoutName)) throw new Error('Choose a supported layout.')
  if (input.style !== undefined && (!input.style || typeof input.style !== 'object' || Array.isArray(input.style))) throw new Error('Style must be an object.')
  const commands: GraphCommand[] = [
    { type: 'title', title: input.title },
    { type: 'add', elements: input.elements.map(element => input.synthetic === true ? { ...element, data: { ...element.data, synthetic: true, provenance: element.data?.provenance || 'Synthetic example created by assistant' } } : element) },
    ...(input.style ? [{ type: 'style', style: input.style } as GraphCommand] : []),

  ]
  return { ...applyGraphCommands(defaultGraphDocument(), commands), layout: layout as GraphLayoutName }
}
