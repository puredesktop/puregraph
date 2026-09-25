import cytoscape from 'cytoscape'
import type { GraphDocument } from './graphDocument'
import type { GraphLayoutName } from '../constants'

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
  if (!nodes.length) throw new Error('Select at least one node to lay out.')
  const included = new Set(nodes.map(node => node.data.id))
  const elements = next.elements.filter(element => !element.data.source ? included.has(element.data.id) : included.has(element.data.source) && included.has(element.data.target))
  const cy = cytoscape({ headless: true, elements: structuredClone(elements), layout: { name: 'preset' } })
  try {
    for (const node of nodes) if (node.data.pinned) cy.getElementById(node.data.id!).lock()
    cy.layout({ name, animate: false, fit: false, boundingBox: { x1: 0, y1: 0, w: Math.max(640, Math.sqrt(nodes.length) * 150), h: Math.max(480, Math.sqrt(nodes.length) * 120) }, ...(name === 'breadthfirst' ? { directed: document.style.directed } : {}) }).run()
    const center = { x: nodes.reduce((sum, node) => sum + node.position!.x, 0) / nodes.length, y: nodes.reduce((sum, node) => sum + node.position!.y, 0) / nodes.length }
    const positions = cy.nodes().map(node => node.position())
    const generated = { x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length, y: positions.reduce((sum, p) => sum + p.y, 0) / positions.length }
    for (const node of nodes) {
      if (node.data.pinned) continue
      const position = cy.getElementById(node.data.id!).position()
      const dx = position.x - generated.x, dy = position.y - generated.y
      node.position = direction === 'right' && name === 'breadthfirst' ? { x: center.x + dy, y: center.y + dx } : { x: center.x + dx, y: center.y + dy }
    }
    next.layout = name
    return next
  } finally { cy.destroy() }
}
