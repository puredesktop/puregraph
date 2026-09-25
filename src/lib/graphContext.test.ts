import { describe, expect, it } from 'vitest'
import { DEFAULT_GRAPH_STYLE } from './graphDocument'
import {
  CONTEXT_EDGE_LIMIT,
  CONTEXT_NODE_LIMIT,
  summarizeGraphContext,
} from './graphContext'

function nodes(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `n${index}`,
    label: `Node ${index}`,
  }))
}

function edges(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `e${index}`,
    source: `n${index}`,
    target: `n${index + 1}`,
    label: null,
  }))
}

describe('graph context summary', () => {
  it('lists everything on a small graph and reports the document binding', () => {
    const summary = summarizeGraphContext({
      title: 'Small',
      documentPath: '/tmp/Small.graph',
      layout: 'grid',
      style: DEFAULT_GRAPH_STYLE,
      selectedIds: ['n1'],
      nodes: nodes(3),
      edges: edges(2),
    })
    expect(summary.truncated).toBe(false)
    expect(summary.note).toBeUndefined()
    expect(summary.nodeCount).toBe(3)
    expect(summary.edgeCount).toBe(2)
    expect(summary.nodes).toHaveLength(3)
    expect(summary.documentPath).toBe('/tmp/Small.graph')
    expect(summary.layout).toBe('grid')
  })

  it('caps large graphs, keeps counts exact, and lists selected elements first', () => {
    const summary = summarizeGraphContext({
      title: 'Big',
      documentPath: null,
      layout: 'cose',
      style: DEFAULT_GRAPH_STYLE,
      selectedIds: ['n450', 'e300'],
      nodes: nodes(500),
      edges: edges(400),
    })
    expect(summary.truncated).toBe(true)
    expect(summary.note).toMatch(/200 of 500 nodes/)
    expect(summary.nodeCount).toBe(500)
    expect(summary.edgeCount).toBe(400)
    expect(summary.nodes).toHaveLength(CONTEXT_NODE_LIMIT)
    expect(summary.edges).toHaveLength(CONTEXT_EDGE_LIMIT)
    expect(summary.nodes[0].id).toBe('n450')
    expect(summary.edges[0].id).toBe('e300')
  })

  it('truncates when only one side exceeds its limit', () => {
    const summary = summarizeGraphContext({
      title: 'Wide',
      documentPath: null,
      layout: 'cose',
      style: DEFAULT_GRAPH_STYLE,
      selectedIds: [],
      nodes: nodes(10),
      edges: edges(CONTEXT_EDGE_LIMIT + 1),
    })
    expect(summary.truncated).toBe(true)
    expect(summary.nodes).toHaveLength(10)
    expect(summary.edges).toHaveLength(CONTEXT_EDGE_LIMIT)
  })
})
