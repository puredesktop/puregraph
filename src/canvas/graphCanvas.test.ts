import cytoscape from 'cytoscape'
import { expect, it } from 'vitest'
import { defaultGraphDocument } from '../lib/graphDocument'
import { fromCyElements, restoreGraphCanvas } from './graphCanvas'

it('preserves exact saved positions across switches even with force-directed layout selected', () => {
  const cy = cytoscape({ headless: true })
  const document = { ...defaultGraphDocument(), elements: [
    { data: { id: 'a' }, position: { x: 71, y: -52 } },
    { data: { id: 'b' }, position: { x: 313, y: 123 } },
    { data: { id: 'ab', source: 'a', target: 'b' } },
  ] }
  try {
    restoreGraphCanvas(cy, document)
    expect(cy.getElementById('a').position()).toEqual({ x: 71, y: -52 })
    const snapshot = fromCyElements(cy)
    cy.getElementById('a').position({ x: 999, y: 999 })
    expect(snapshot[0].position).toEqual({ x: 71, y: -52 })
    expect(document.elements[0].position).toEqual({ x: 71, y: -52 })
    restoreGraphCanvas(cy, { ...defaultGraphDocument(), elements: [] })
    restoreGraphCanvas(cy, document)
    expect(cy.getElementById('b').position()).toEqual({ x: 313, y: 123 })
  } finally { cy.destroy() }
})

it('keeps viewport and selection on document edits and locks pinned nodes', () => {
  const cy = cytoscape({ headless: true })
  const document = { ...defaultGraphDocument(), elements: [{ data: { id: 'a' }, position: { x: 71, y: 52 } }] }
  try {
    restoreGraphCanvas(cy, document)
    cy.getElementById('a').select(); cy.zoom(2); cy.pan({ x: 11, y: 12 })
    restoreGraphCanvas(cy, { ...document, elements: [{ ...document.elements[0], data: { id: 'a', pinned: true } }] }, false)
    expect(cy.zoom()).toBe(2)
    expect(cy.pan()).toEqual({ x: 11, y: 12 })
    expect(cy.getElementById('a').selected()).toBe(true)
    expect(cy.getElementById('a').locked()).toBe(true)
  } finally { cy.destroy() }
})
