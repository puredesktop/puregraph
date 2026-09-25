import { expect, it } from 'vitest'
import { connectedComponents, findCycle, neighborhood, shortestPath } from './graphAnalysis'
import type { GraphElement } from './graphParser'
const nodes = ['a', 'b', 'c', 'isolated'].map(id => ({ data: { id } }))
const edges = [{ data: { id: 'ab', source: 'a', target: 'b' } }, { data: { id: 'bc', source: 'b', target: 'c' } }]
const elements: GraphElement[] = [...nodes, ...edges]
it('finds weak components including isolated nodes', () => {
  expect(connectedComponents(elements)).toEqual([['a', 'b', 'c'], ['isolated']])
})
it('reports unweighted paths with explicit traversal direction', () => {
  expect(shortestPath(elements, 'c', 'a', true)).toBeNull()
  expect(shortestPath(elements, 'c', 'a', false)).toEqual({ nodes: ['c', 'b', 'a'], edges: ['bc', 'ab'] })
  expect(shortestPath(elements, 'a', 'a', true)).toEqual({ nodes: ['a'], edges: [] })
  expect(shortestPath(elements, 'a', 'isolated', false)).toBeNull()
})
it('selects incoming and outgoing neighborhoods without including unrelated edges', () => {
  expect(neighborhood(elements, 'b', 'incoming')).toEqual(['b', 'ab', 'a'])
  expect(neighborhood(elements, 'b', 'outgoing')).toEqual(['b', 'bc', 'c'])
})
it('distinguishes directed DAGs, cycles, self loops and parallel undirected edges', () => {
  expect(findCycle(elements, true)).toBeNull()
  expect(findCycle(elements, false)).toBeNull()
  const triangle = [...elements, { data: { id: 'ac', source: 'a', target: 'c' } }]
  expect(findCycle(triangle, true)).toBeNull()
  expect(findCycle(triangle, false)).toEqual(['a', 'b', 'c', 'a'])
  expect(findCycle([...elements, { data: { id: 'ca', source: 'c', target: 'a' } }], true)).toEqual(['a', 'b', 'c', 'a'])
  expect(findCycle([...elements, { data: { id: 'aa', source: 'a', target: 'a' } }], true)).toEqual(['a', 'a'])
  expect(findCycle([...elements, { data: { id: 'ab2', source: 'a', target: 'b' } }], false)).toEqual(['a', 'b', 'a'])
})
it('handles a long chain without recursive stack overflow', () => {
  const count = 12000
  const large = Array.from({ length: count }, (_, i) => ({ data: { id: `n${i}` } })) as GraphElement[]
  for (let i = 1; i < count; i++) large.push({ data: { id: `e${i}`, source: `n${i - 1}`, target: `n${i}` } })
  expect(findCycle(large, true)).toBeNull()
  expect(connectedComponents(large)[0]).toHaveLength(count)
})
