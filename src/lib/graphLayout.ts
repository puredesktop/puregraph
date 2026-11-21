import cytoscape from 'cytoscape'
import type { GraphDocument } from './graphDocument'
import type { GraphElement } from './graphParser'
import type { GraphLayoutName } from '../constants'

export type GraphAlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type GraphDistributeAxis = 'horizontal' | 'vertical'

/** Give only new/unpositioned nodes stable initial positions without moving existing work. */
export function placeMissingNodes(document: GraphDocument): GraphDocument {
  const next = structuredClone(document)
  const nodes = next.elements.filter(element => element.data.source === undefined)
  const positioned = nodes.filter(node => Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y))
  const offset = positioned.length ? Math.max(...positioned.map(node => node.position!.x)) + 160 : 0
  let index = 0
  for (const node of nodes) {
    if (Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y)) continue
    node.position = { x: offset + (index % 8) * 160, y: Math.floor(index / 8) * 120 }
    index++
  }
  return next
}

export function layoutGraph(document: GraphDocument, name: GraphLayoutName, ids?: string[], direction: 'down' | 'right' = 'down'): GraphDocument {
  const next = placeMissingNodes(document)
  if (name === 'preset') return { ...next, layout: name }
  const targets = new Set(ids ?? next.elements.filter(element => !element.data.source).map(element => element.data.id!))
  const nodes = next.elements.filter(element => !element.data.source && targets.has(element.data.id!))
  if (!nodes.length) {
    if (ids !== undefined) throw new Error('Select at least one node to lay out.')
    return { ...next, layout: name }
  }
  const movable = nodes.filter(node => !node.data.pinned)
  if (!movable.length) return { ...next, layout: name }
  const included = new Set(nodes.map(node => node.data.id))
  const elements = next.elements.filter(element => !element.data.source ? included.has(element.data.id) : included.has(element.data.source) && included.has(element.data.target))
  const cy = cytoscape({ headless: true, elements: structuredClone(elements), layout: { name: 'preset' } })
  try {
    for (const node of nodes) if (node.data.pinned) cy.getElementById(node.data.id!).lock()
    const boxW = Math.max(640, Math.sqrt(nodes.length) * 150)
    const boxH = Math.max(480, Math.sqrt(nodes.length) * 120)
    cy.layout({ name, animate: false, fit: false, boundingBox: { x1: 0, y1: 0, w: boxW, h: boxH }, ...(name === 'breadthfirst' ? { directed: document.style.directed } : {}) }).run()
    const center = { x: movable.reduce((sum, node) => sum + node.position!.x, 0) / movable.length, y: movable.reduce((sum, node) => sum + node.position!.y, 0) / movable.length }
    const movablePositions = movable.map(node => cy.getElementById(node.data.id!).position())
    const generated =
      movablePositions.length > 1
        ? { x: movablePositions.reduce((sum, p) => sum + p.x, 0) / movablePositions.length, y: movablePositions.reduce((sum, p) => sum + p.y, 0) / movablePositions.length }
        : nodes.length > 1
          ? { x: boxW / 2, y: boxH / 2 }
          : movablePositions[0]!
    for (const node of movable) {
      const position = cy.getElementById(node.data.id!).position()
      const dx = position.x - generated.x, dy = position.y - generated.y
      node.position = direction === 'right' && name === 'breadthfirst' ? { x: center.x + dy, y: center.y + dx } : { x: center.x + dx, y: center.y + dy }
    }
    next.layout = name
    return next
  } finally { cy.destroy() }
}

/** Align selected unpinned nodes along an edge or center axis. */
export function alignNodePositions(
  elements: GraphElement[],
  ids: string[],
  mode: GraphAlignMode,
): Record<string, { x: number; y: number }> {
  const idSet = new Set(ids)
  const nodes = elements.filter(
    el => el.data.source === undefined && idSet.has(el.data.id!) && !el.data.pinned && Number.isFinite(el.position?.x) && Number.isFinite(el.position?.y),
  )
  if (nodes.length < 2) throw new Error('Select at least 2 unpinned nodes to align.')
  const xs = nodes.map(n => n.position!.x)
  const ys = nodes.map(n => n.position!.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const positions: Record<string, { x: number; y: number }> = {}
  for (const node of nodes) {
    let { x, y } = node.position!
    if (mode === 'left') x = minX
    else if (mode === 'right') x = maxX
    else if (mode === 'center') x = (minX + maxX) / 2
    else if (mode === 'top') y = minY
    else if (mode === 'bottom') y = maxY
    else if (mode === 'middle') y = (minY + maxY) / 2
    positions[node.data.id!] = { x, y }
  }
  return positions
}

/** Evenly distribute selected unpinned nodes horizontally or vertically. */
export function distributeNodePositions(
  elements: GraphElement[],
  ids: string[],
  axis: GraphDistributeAxis,
): Record<string, { x: number; y: number }> {
  const idSet = new Set(ids)
  const nodes = elements.filter(
    el => el.data.source === undefined && idSet.has(el.data.id!) && !el.data.pinned && Number.isFinite(el.position?.x) && Number.isFinite(el.position?.y),
  )
  if (nodes.length < 3) throw new Error('Select at least 3 unpinned nodes to distribute.')
  const sorted = [...nodes].sort((a, b) => axis === 'horizontal' ? a.position!.x - b.position!.x : a.position!.y - b.position!.y)
  const first = axis === 'horizontal' ? sorted[0]!.position!.x : sorted[0]!.position!.y
  const last = axis === 'horizontal' ? sorted[sorted.length - 1]!.position!.x : sorted[sorted.length - 1]!.position!.y
  const step = (last - first) / (sorted.length - 1)
  const positions: Record<string, { x: number; y: number }> = {}
  sorted.forEach((node, index) => {
    const value = first + step * index
    positions[node.data.id!] = axis === 'horizontal'
      ? { x: value, y: node.position!.y }
      : { x: node.position!.x, y: value }
  })
  return positions
}
