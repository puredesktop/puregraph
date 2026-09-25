import type { GraphElement } from './graphParser'
import { isEdge } from './graphValidation'
import { neighborhood, shortestPath, connectedComponents } from './graphAnalysis'
export interface GraphViewState {
  hiddenIds: string[]
  hiddenCategories: string[]
  focusIds: string[] | null
  mode: 'hide' | 'dim'
  time?: { field: string; from: string; to: string }
}
export interface GraphSavedView { id: string; name: string; caption: string; state: GraphViewState; selectedIds: string[]; viewport?: { zoom: number; pan: { x: number; y: number } } }
export const emptyGraphView = (): GraphViewState => ({ hiddenIds: [], hiddenCategories: [], focusIds: null, mode: 'hide' })
export const graphCategory = (element: GraphElement) => String(element.data.category ?? element.data.cluster ?? 'Nodes')
export function viewElements(elements: GraphElement[], state: GraphViewState): GraphElement[] {
  const hidden = new Set(state.hiddenIds), categories = new Set(state.hiddenCategories), focus = state.focusIds ? new Set(state.focusIds) : null
  const matches = (element: GraphElement) => {
    if (hidden.has(element.data.id!)) return false
    if (focus && !focus.has(element.data.id!)) return false
    if (state.time?.field) {
      const raw = element.data[state.time.field]
      if (raw !== undefined && raw !== '') {
        const timestamp = Date.parse(String(raw)), from = state.time.from ? Date.parse(state.time.from) : -Infinity, to = state.time.to ? Date.parse(state.time.to) + 86400000 - 1 : Infinity
        if (!Number.isFinite(timestamp) || timestamp < from || timestamp > to) return false
      }
    }
    return true
  }
  const nodes = elements.filter(element => !isEdge(element) && !categories.has(graphCategory(element)) && matches(element))
  const ids = new Set(nodes.map(element => element.data.id))
  return [...nodes, ...elements.filter(element => isEdge(element) && ids.has(element.data.source) && ids.has(element.data.target) && matches(element))]
}
export function graphNeighborhood(elements: GraphElement[], id: string, depth: number, direction: 'incoming' | 'outgoing' | 'both') {
  if (!Number.isInteger(depth) || depth < 1 || depth > 10) throw new Error('Neighborhood depth must be between 1 and 10.')
  let ids = new Set([id]), frontier = [id]
  for (let i = 0; i < depth && frontier.length; i++) {
    const next = new Set<string>()
    for (const current of frontier) for (const found of neighborhood(elements, current, direction)) if (!ids.has(found)) next.add(found)
    next.forEach(found => ids.add(found))
    frontier = elements.filter(element => !isEdge(element) && next.has(element.data.id!)).map(element => element.data.id!)
  }
  return [...ids]
}
export function queryGraph(elements: GraphElement[], input: { query?: string; kind?: 'nodes' | 'edges' | 'all'; ids?: string[]; category?: string; offset?: number; limit?: number }) {
  const offset = input.offset ?? 0, limit = input.limit ?? 50
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Use offset ≥ 0 and limit between 1 and 200.')
  const ids = input.ids ? new Set(input.ids) : null
  const result = elements.filter(element => (!ids || ids.has(element.data.id!)) && (!input.kind || input.kind === 'all' || (isEdge(element) ? 'edges' : 'nodes') === input.kind) && (!input.category || graphCategory(element) === input.category) && (!input.query || JSON.stringify(element.data).toLowerCase().includes(input.query.toLowerCase())))
  return { total: result.length, offset, nextOffset: offset + limit < result.length ? offset + limit : null, elements: structuredClone(result.slice(offset, offset + limit)) }
}
export function analyzeGraph(elements: GraphElement[], input: { operation: 'path' | 'neighborhood' | 'components'; start?: string; end?: string; directed?: boolean; depth?: number; direction?: 'incoming' | 'outgoing' | 'both' }) {
  if (input.operation === 'components') return { components: connectedComponents(elements) }
  if (input.operation === 'neighborhood') return { ids: graphNeighborhood(elements, input.start || '', input.depth ?? 1, input.direction ?? 'both') }
  if (input.operation === 'path') return { path: shortestPath(elements, input.start || '', input.end || '', !!input.directed) }
  throw new Error('Choose path, neighborhood, or components.')
}
export function compareGraphElements(before: GraphElement[], after: GraphElement[]) {
  const old = new Map(before.map(element => [element.data.id, element])), next = new Map(after.map(element => [element.data.id, element]))
  return { added: after.filter(element => !old.has(element.data.id)).map(element => element.data.id!), removed: before.filter(element => !next.has(element.data.id)).map(element => element.data.id!), changed: after.filter(element => old.has(element.data.id) && JSON.stringify(old.get(element.data.id)) !== JSON.stringify(element)).map(element => element.data.id!) }
}
export function normalizeSavedViews(value: unknown): GraphSavedView[] {
  if (!Array.isArray(value)) return []
  const strings = (items: unknown): string[] => Array.isArray(items) ? items.filter(item => typeof item === 'string') : []
  return value.filter(view => view && typeof view.id === 'string' && typeof view.name === 'string' && view.state).slice(0, 100).map(view => ({
    id: view.id, name: view.name, caption: typeof view.caption === 'string' ? view.caption : '', selectedIds: strings(view.selectedIds),
    state: { hiddenIds: strings(view.state.hiddenIds), hiddenCategories: strings(view.state.hiddenCategories), focusIds: Array.isArray(view.state.focusIds) ? strings(view.state.focusIds) : null, mode: view.state.mode === 'dim' ? 'dim' : 'hide', ...(view.state.time && typeof view.state.time.field === 'string' ? { time: { field: view.state.time.field, from: String(view.state.time.from || ''), to: String(view.state.time.to || '') } } : {}) },
    ...(Number.isFinite(view.viewport?.zoom) && view.viewport.zoom > 0 && Number.isFinite(view.viewport?.pan?.x) && Number.isFinite(view.viewport?.pan?.y) ? { viewport: view.viewport } : {}),
  }))
}
