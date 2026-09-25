import { expect, it } from 'vitest'
import { prepareNewGraph } from './createGraph'
it('creates a complete named graph from nodes and edges in one call', () => {
  const input = { title: 'Synthetic project', elements: [{ data: { id: 'a', label: 'Research' } }, { data: { id: 'b', label: 'Design' } }, { data: { id: 'ab', source: 'a', target: 'b' } }], layout: 'breadthfirst' }
  const before = structuredClone(input)
  const document = prepareNewGraph(input)
  expect(document.title).toBe('Synthetic project')
  expect(document.elements).toHaveLength(3)
  expect(document.elements[0].position?.x).toEqual(expect.any(Number))
  expect(document.style.labelPlacement).toBe('outside')
  expect(input).toEqual(before)
})
it('rejects malformed input before switching documents', () => {
  expect(() => prepareNewGraph({ title: '', elements: [] })).toThrow('title')
  expect(() => prepareNewGraph({ title: 'Bad', elements: [{ data: { id: 'bad', source: 'a', target: 'b' } }] })).toThrow('missing node')
  expect(() => prepareNewGraph({ title: 'Bad', elements: [], layout: 'unknown' })).toThrow('layout')
})
