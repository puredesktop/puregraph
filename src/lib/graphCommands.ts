import { normalizeEncodings, type GraphEncoding } from './graphEncoding'
import { normalizeSavedViews, type GraphSavedView } from './graphExplore'
import { layoutGraph, placeMissingNodes } from './graphLayout'
import { SUPPORTED_LAYOUTS, type GraphLayoutName } from '../constants'
import { parseGraphDocument, normalizeGraphStyle, type GraphDocument } from './graphDocument'
import type { GraphElement, GraphElementData } from './graphParser'
import type { GraphStyleState } from '../agents/context'

export { isEdge, validateElements } from './graphValidation'
import { isEdge, validateElements } from './graphValidation'

export type GraphCommand =
  | { type: 'encodings'; encodings: GraphEncoding[] }
  | { type: 'views'; views: GraphSavedView[] }
  | { type: 'document'; document: GraphDocument }
  | { type: 'layout'; name: GraphLayoutName; ids?: string[]; direction?: 'down' | 'right' }
  | { type: 'add'; elements: GraphElement[] }
  | { type: 'replace'; elements: GraphElement[] }
  | { type: 'update'; ids: string[]; data: Partial<GraphElementData> }
  | { type: 'rename'; id: string; nextId: string }
  | { type: 'remove'; ids: string[] }
  | { type: 'positions'; positions: Record<string, { x: number; y: number }> }
  | { type: 'pin'; ids: string[]; pinned: boolean }
  | { type: 'style'; style: Partial<GraphStyleState> }
  | { type: 'title'; title: string }

/** A whole transaction either validates and returns once, or throws without changing its input. */
export function applyGraphCommands(document: GraphDocument, commands: GraphCommand[]): GraphDocument {
  let next = structuredClone(document)
  for (const command of commands) {
    if (!command || typeof command !== 'object' || !['encodings', 'views', 'document', 'layout', 'add', 'replace', 'title', 'style', 'update', 'rename', 'remove', 'pin', 'positions'].includes(command.type)) throw new Error('Unknown graph command.')
    if ('ids' in command && command.ids !== undefined && (!Array.isArray(command.ids) || command.ids.some(id => typeof id !== 'string'))) throw new Error('IDs must be an array of strings.')
    if (['update', 'remove', 'pin'].includes(command.type) && !Array.isArray((command as { ids?: unknown }).ids)) throw new Error('This command requires IDs.')
    if (command.type === 'pin' && typeof command.pinned !== 'boolean') throw new Error('Pinned must be true or false.')
    if (command.type === 'title' && typeof command.title !== 'string') throw new Error('Title must be text.')
    if (command.type === 'rename' && (typeof command.id !== 'string' || typeof command.nextId !== 'string')) throw new Error('Rename requires the old and new IDs.')
    if (command.type === 'layout' && (!SUPPORTED_LAYOUTS.includes(command.name) || (command.direction !== undefined && !['down', 'right'].includes(command.direction)))) throw new Error('Invalid layout or direction.')
    if (command.type === 'update' && (!command.data || typeof command.data !== 'object' || Array.isArray(command.data))) throw new Error('Update requires a data object.')
    if ((command.type === 'add' || command.type === 'replace') && !Array.isArray(command.elements)) throw new Error('Elements must be an array.')
    if (command.type === 'encodings') next.encodings = normalizeEncodings(command.encodings)
    if (command.type === 'views') next.views = normalizeSavedViews(command.views)
    if (command.type === 'document') next = parseGraphDocument(JSON.stringify(command.document))
    if (command.type === 'layout') { validateElements(next.elements); next = layoutGraph(next, command.name, command.ids, command.direction) }
    if (command.type === 'add') next.elements.push(...structuredClone(command.elements))
    if (command.type === 'replace') next.elements = structuredClone(command.elements)
    if (command.type === 'title') {
      if (!command.title.trim()) throw new Error('A graph needs a title.')
      next.title = command.title.trim()
    }
    if (command.type === 'style') next.style = normalizeGraphStyle({ ...next.style, ...Object.fromEntries(Object.entries(command.style).filter(([, value]) => value !== undefined)) })
    if ('ids' in command && command.ids) {
      for (const id of command.ids) if (!next.elements.some(element => element.data.id === id)) throw new Error(`No element "${id}".`)
    }
    if (command.type === 'update') {
      if ('id' in command.data) throw new Error('Use rename to change an ID and update its connected edges.')
      next.elements = next.elements.map(element => command.ids.includes(element.data.id!) ? { ...element, data: { ...element.data, ...command.data } } : element)
    }
    if (command.type === 'rename') {
      if (!next.elements.some(element => element.data.id === command.id)) throw new Error(`No element "${command.id}".`)
      if (next.elements.some(element => element.data.id === command.nextId && element.data.id !== command.id)) throw new Error(`Duplicate ID "${command.nextId}".`)
      if (!command.nextId.trim()) throw new Error('An ID cannot be empty.')
      next.views = next.views?.map(view => ({ ...view, selectedIds: view.selectedIds.map(id => id === command.id ? command.nextId : id), state: { ...view.state, hiddenIds: view.state.hiddenIds.map(id => id === command.id ? command.nextId : id), focusIds: view.state.focusIds?.map(id => id === command.id ? command.nextId : id) ?? null } }))
      next.elements = next.elements.map(element => ({ ...element, data: {
        ...element.data,
        id: element.data.id === command.id ? command.nextId : element.data.id,
        ...(element.data.source === command.id ? { source: command.nextId } : {}),
        ...(element.data.target === command.id ? { target: command.nextId } : {}),
      } }))
    }
    if (command.type === 'remove') {
      const ids = new Set(command.ids)
      next.elements = next.elements.filter(element => !ids.has(element.data.id!) && !ids.has(element.data.source!) && !ids.has(element.data.target!))
    }
    if (command.type === 'pin') next.elements = next.elements.map(element => command.ids.includes(element.data.id!) && !isEdge(element) ? { ...element, data: { ...element.data, pinned: command.pinned } } : element)
    if (command.type === 'positions') {
      const nodes = new Map(next.elements.filter(element => !isEdge(element)).map(element => [element.data.id, element]))
      for (const [id, position] of Object.entries(command.positions)) {
        const node = nodes.get(id)
        if (!node) throw new Error(`No node "${id}".`)
        if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error(`Invalid position for "${id}".`)
        if (!node.data.pinned) node.position = { ...position }
      }
    }
  }
  validateElements(next.elements)
  return placeMissingNodes(next)
}

export function graphChangeSummary(before: GraphDocument, after: GraphDocument) {
  const old = new Map(before.elements.map(element => [element.data.id, element]))
  const current = new Map(after.elements.map(element => [element.data.id, element]))
  return {
    added: after.elements.filter(element => !old.has(element.data.id)).length,
    removed: before.elements.filter(element => !current.has(element.data.id)).length,
    changed: after.elements.filter(element => old.has(element.data.id) && JSON.stringify(old.get(element.data.id)) !== JSON.stringify(element)).length,
    styleChanged: JSON.stringify(before.style) !== JSON.stringify(after.style),
  }
}
