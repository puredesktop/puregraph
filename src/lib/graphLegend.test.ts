import { expect, it } from 'vitest'
import { DEFAULT_GRAPH_STYLE, defaultGraphDocument, normalizeGraphStyle, parseGraphDocument, serializeGraphDocument } from './graphDocument'
import { graphLegend } from './graphLegend'
import { graphNodeColor } from '../canvas/graphStyle'
it('uses the same category/color resolution for canvas and legend', () => {
  const document = { ...defaultGraphDocument(), elements: [{ data: { id: 'a', category: 'Team' } }, { data: { id: 'b', category: 'Team' } }, { data: { id: 'c' } }] }
  document.style = { ...document.style, categoryColors: { Team: '#123456', Nodes: '#abcdef' }, showLegend: true }
  expect(graphLegend(document)).toEqual([{ label: 'Team', color: '#123456' }, { label: 'Nodes', color: '#abcdef' }])
  expect(graphNodeColor(document.elements[0].data, document.style)).toBe('#123456')
  expect(parseGraphDocument(serializeGraphDocument(document)).style).toEqual(document.style)
})
it('clamps sizes and ignores unsafe category color strings', () => {
  const style = normalizeGraphStyle({ nodeSize: -100, edgeWidth: Infinity, labelSize: 900, categoryColors: { safe: '#abcdef', bad: 'url(javascript:x)' } })
  expect(style.nodeSize).toBe(4); expect(style.edgeWidth).toBe(DEFAULT_GRAPH_STYLE.edgeWidth); expect(style.labelSize).toBe(48)
  expect(style.categoryColors).toEqual({ safe: '#abcdef' })
})
