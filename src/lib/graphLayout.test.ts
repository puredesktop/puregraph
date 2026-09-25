import { expect, it } from 'vitest'
import { defaultGraphDocument } from './graphDocument'
import { applyGraphCommands } from './graphCommands'
import { layoutGraph, placeMissingNodes } from './graphLayout'
it('positions imported nodes once without moving previously placed nodes', () => {
  const original = { ...defaultGraphDocument(), elements: [{ data: { id: 'a' }, position: { x: 77, y: 99 } }, { data: { id: 'b' } }] }
  const next = placeMissingNodes(original)
  expect(next.elements[0].position).toEqual({ x: 77, y: 99 })
  expect(next.elements[1].position).toEqual({ x: 237, y: 0 })
  expect(placeMissingNodes(next)).toEqual(next)
  expect(original.elements[1].position).toBeUndefined()
})
it('restricts layouts to selected nodes and preserves pinned nodes', () => {
  const document = placeMissingNodes({ ...defaultGraphDocument(), elements: [
    { data: { id: 'a', pinned: true }, position: { x: 4, y: 7 } },
    { data: { id: 'b' }, position: { x: 20, y: 30 } },
    { data: { id: 'c' }, position: { x: 1000, y: 1000 } },
  ] })
  const next = layoutGraph(document, 'grid', ['a', 'b'], 'right')
  expect(next.elements[0].position).toEqual(document.elements[0].position)
  expect(next.elements[2].position).toEqual(document.elements[2].position)
  expect(next.elements[1].position).not.toEqual(document.elements[1].position)
  expect(() => layoutGraph(document, 'grid', [])).toThrow('Select')
})
it('records replacement and layout as a complete positioned document transaction', () => {
  const next = applyGraphCommands(defaultGraphDocument(), [
    { type: 'replace', elements: [{ data: { id: 'a' } }, { data: { id: 'b' } }] },
    { type: 'layout', name: 'circle' },
  ])
  expect(next.layout).toBe('circle')
  expect(next.elements.every(element => Number.isFinite(element.position?.x))).toBe(true)
})
