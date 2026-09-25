import { expect, it } from 'vitest'
import { defaultGraphDocument } from './graphDocument'
import { applyGraphCommands, graphChangeSummary } from './graphCommands'
const graph = () => ({ ...defaultGraphDocument(), elements: [
  { data: { id: 'a' }, position: { x: 10, y: 20 } }, { data: { id: 'b' } },
  { data: { id: 'ab', source: 'a', target: 'b' } },
] })
it('renames nodes and incident endpoints atomically', () => {
  const original = graph()
  const next = applyGraphCommands(original, [{ type: 'rename', id: 'a', nextId: 'c' }])
  expect(next.elements[2].data.source).toBe('c')
  expect(next.elements[0].position).toEqual({ x: 10, y: 20 })
  expect(original.elements[0].data.id).toBe('a')
})
it('rejects the entire transaction on duplicate ids or dangling endpoints', () => {
  const original = graph()
  expect(() => applyGraphCommands(original, [{ type: 'title', title: 'Changed' }, { type: 'rename', id: 'a', nextId: 'b' }])).toThrow('Duplicate')
  expect(original.title).toBe('Untitled graph')
  expect(() => applyGraphCommands(original, [{ type: 'update', ids: ['ab'], data: { target: 'missing' } }])).toThrow('missing node')
  expect(() => applyGraphCommands(original, [{ type: 'add', elements: [{ data: { id: 'ab' } }] }])).toThrow('Duplicate')
})
it('removes incident edges together and reports destructive impact', () => {
  const original = graph(), next = applyGraphCommands(original, [{ type: 'remove', ids: ['a'] }])
  expect(next.elements.map(element => element.data.id)).toEqual(['b'])
  expect(graphChangeSummary(original, next).removed).toBe(2)
})
it('pins positions while allowing explicit unpinning and rejects invalid coordinates', () => {
  const pinned = applyGraphCommands(graph(), [{ type: 'pin', ids: ['a'], pinned: true }, { type: 'positions', positions: { a: { x: 999, y: 999 } } }])
  expect(pinned.elements[0].position).toEqual({ x: 10, y: 20 })
  expect(() => applyGraphCommands(pinned, [{ type: 'positions', positions: { b: { x: NaN, y: 1 } } }])).toThrow('Invalid position')
})

it('rejects malformed runtime commands and node-to-edge type changes', () => {
  for (const command of [
    { type: 'pin', ids: ['a'], pinned: 'false' },
    { type: 'remove', ids: 'a' },
    { type: 'layout', name: 'missing' },
    { type: 'update', ids: ['a'], data: { source: 'a', target: 'b' } },
  ]) expect(() => applyGraphCommands({ ...graph(), elements: graph().elements.map(element => ({ ...element, group: element.data.source ? 'edges' : 'nodes' })) }, [command as never])).toThrow()
})
