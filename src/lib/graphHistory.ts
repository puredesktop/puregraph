import type { GraphDocument } from './graphDocument'

export interface GraphHistory {
  present: GraphDocument
  past: GraphDocument[]
  future: GraphDocument[]
}
export function createGraphHistory(document: GraphDocument): GraphHistory {
  return { present: structuredClone(document), past: [], future: [] }
}
export function commitGraph(history: GraphHistory, document: GraphDocument): GraphHistory {
  if (JSON.stringify(history.present) === JSON.stringify(document)) return history
  return {
    present: structuredClone(document),
    past: [...history.past.slice(-99), history.present],
    future: [],
  }
}
export function moveGraphHistory(history: GraphHistory, direction: 'undo' | 'redo'): GraphHistory {
  const source = direction === 'undo' ? history.past : history.future
  const next = source.at(-1)
  if (!next) return history
  return direction === 'undo'
    ? { present: next, past: source.slice(0, -1), future: [...history.future, history.present] }
    : { present: next, past: [...history.past, history.present], future: source.slice(0, -1) }
}
