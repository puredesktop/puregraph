import { encodedGraphDocument } from '../lib/graphEncoding'
import type { Core, ElementDefinition } from 'cytoscape'
import type { GraphDocument } from '../lib/graphDocument'
import type { GraphElement } from '../lib/graphParser'

export function toElements(elements: GraphElement[]): ElementDefinition[] {
  // Cytoscape can mutate its input. Never hand it the document's owned objects.
  return structuredClone(elements) as ElementDefinition[]
}
export function fromCyElements(cy: Core): GraphElement[] {
  return cy.elements().map(element => ({
    group: element.isNode() ? 'nodes' : 'edges',
    data: structuredClone(element.data()),
    ...(element.isNode() ? { position: { ...element.position() } } : {}),
  })) as GraphElement[]
}
export function restoreGraphCanvas(cy: Core, document: GraphDocument, resetView = true): void {
  document = encodedGraphDocument(document)
  const selected = resetView ? [] : cy.$(':selected').map(element => element.id())
  const zoom = cy.zoom(), pan = { ...cy.pan() }
  const wanted = new Map(document.elements.map(element => [element.data.id!, element]))
  if (resetView) cy.elements().remove()
  // Diff by ID: editing a label does not destroy every canvas element.
  cy.batch(() => cy.elements().forEach(element => {
    const next = wanted.get(element.id())
    if (!next || element.isEdge() !== (next.data.source !== undefined) || (element.isEdge() && (element.data('source') !== next.data.source || element.data('target') !== next.data.target))) element.remove()
  }))
  for (const group of [false, true]) {
    cy.batch(() => {
    for (const next of document.elements.filter(element => (element.data.source !== undefined) === group)) {
      let element = cy.getElementById(next.data.id!)
      if (element.empty()) element = cy.add(toElements([next]))
      else {
        for (const key of Object.keys(element.data())) if (!(key in next.data) && !['id', 'source', 'target'].includes(key)) element.removeData(key)
        element.data(structuredClone(next.data))
        if (element.isNode() && next.position) { element.unlock(); element.position(next.position) }
      }
      if (element.isNode()) { if (next.data.pinned) element.lock(); else element.unlock() }
    }
    })
    // Finish label measurement before adding edges to their endpoints.
    if (!group) { cy.nodes().boundingBox(); cy.style()?.update() }
  }
  selected.forEach(id => cy.getElementById(id).select())
  if (resetView) cy.fit(undefined, 32)
  else { cy.zoom(zoom); cy.pan(pan) }
}
