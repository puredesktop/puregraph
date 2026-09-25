import { describe, expect, it } from 'vitest'
import {
  elementsFromNodesEdges,
  parseGraph,
  SAMPLE_GRAPH,
  SAMPLE_GRAPHS,
} from './graphParser'

function nodesOf(text: string) {
  return parseGraph(text).filter(element => element.group === 'nodes')
}

function edgesOf(text: string) {
  return parseGraph(text).filter(element => element.group === 'edges')
}

describe('graph parser', () => {
  it('parses csv edge lists and creates missing nodes', () => {
    const elements = parseGraph(SAMPLE_GRAPH)
    const nodes = elements.filter(element => element.group === 'nodes')
    const edges = elements.filter(element => element.group === 'edges')

    expect(nodes).toHaveLength(24)
    expect(edges).toHaveLength(40)
    expect(edges[0].data).toMatchObject({
      source: 'satellite',
      target: 'heat',
      label: 'surface temp',
    })
  })

  it('parses node and edge JSON', () => {
    const elements = parseGraph(
      JSON.stringify({
        nodes: [{ id: 'a', label: 'Alpha' }],
        edges: [{ source: 'a', target: 'b', label: 'to beta' }],
      }),
    )

    expect(elements.map(element => element.data.id)).toContain('b')
    expect(elements.find(element => element.group === 'edges')?.data).toMatchObject({
      source: 'a',
      target: 'b',
      label: 'to beta',
    })
  })

  it('normalizes plain node and edge records', () => {
    expect(
      elementsFromNodesEdges([{ id: 'node' }], [{ from: 'node', to: 'next' }]),
    ).toMatchObject([
      { group: 'nodes', data: { id: 'node', label: 'node' } },
      { group: 'nodes', data: { id: 'next', label: 'next' } },
      { group: 'edges', data: { source: 'node', target: 'next' } },
    ])
  })

  describe('JSON shapes', () => {
    it('reads a Cytoscape element array and keeps node positions', () => {
      const text = JSON.stringify([
        { group: 'nodes', data: { id: 'a', label: 'A' }, position: { x: 10, y: 20 } },
        { data: { id: 'b' } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
      ])
      expect(nodesOf(text)).toHaveLength(2)
      expect(nodesOf(text)[0].position).toEqual({ x: 10, y: 20 })
      expect(edgesOf(text)[0].data.id).toBe('ab')
    })

    it('reads { elements: { nodes, edges } } as exported by cytoscape.json()', () => {
      const text = JSON.stringify({
        elements: {
          nodes: [{ data: { id: 'a' }, position: { x: 1, y: 2 }, selected: true }],
          edges: [{ data: { id: 'e', source: 'a', target: 'a' } }],
        },
      })
      expect(nodesOf(text)).toHaveLength(1)
      expect(edgesOf(text)).toHaveLength(1)
    })

    it('reads a saved .graph document body through its elements', () => {
      const text = JSON.stringify({
        schemaVersion: 1,
        title: 'Doc',
        elements: [{ data: { id: 'x' } }, { data: { source: 'x', target: 'y' } }],
      })
      expect(nodesOf(text).map(node => node.data.id)).toEqual(['x', 'y'])
    })

    it('creates nodes for dangling edge endpoints in every shape', () => {
      // Cytoscape throws on an edge whose endpoint does not exist; the parser
      // must never hand it one.
      const array = JSON.stringify([{ data: { id: 'e', source: 'p', target: 'q' } }])
      expect(nodesOf(array).map(node => node.data.id)).toEqual(['p', 'q'])
      const nested = JSON.stringify({
        elements: { edges: [{ data: { source: 'p', target: 'q' } }] },
      })
      expect(nodesOf(nested)).toHaveLength(2)
    })

    it('rejects duplicate explicit IDs instead of silently discarding records', () => {
      const text = JSON.stringify({
        nodes: [{ id: 'a', label: 'first' }, { id: 'a', label: 'second' }],
        edges: [
          { id: 'e', source: 'a', target: 'a' },
          { id: 'e', source: 'a', target: 'a' },
          { id: 'a', source: 'a', target: 'a' },
        ],
      })
      expect(() => parseGraph(text)).toThrow('Duplicate ID')
    })

    it('stringifies numeric IDs and rejects nodes without an ID', () => {
      const text = JSON.stringify({
        nodes: [{ id: 1 }, { label: 'no id' }],
        edges: [{ source: 1, target: 2 }],
      })
      expect(() => parseGraph(text)).toThrow('nonempty ID')
      expect(nodesOf(JSON.stringify({ nodes: [{ id: 1 }], edges: [{ source: 1, target: 2 }] })).map(node => node.data.id)).toEqual(['1', '2'])
    })

    it('rejects malformed and unrecognized JSON with a readable error', () => {
      expect(() => parseGraph('{"nodes": [')).toThrow(/Invalid JSON/)
      expect(() => parseGraph('{"title": "no graph here"}')).toThrow(
        /Unrecognized JSON graph shape/,
      )
      expect(() => parseGraph('[1, 2, 3]')).toThrow('object')
    })
  })

  describe('delimited edge lists', () => {
    it('reads a headed csv with quoted cells and a label column', () => {
      const text = 'source,target,label\n"Smith, A",b,"says ""hi"""\nb,c,\n'
      const edges = edgesOf(text)
      expect(edges).toHaveLength(2)
      expect(edges[0].data).toMatchObject({
        source: 'Smith, A',
        target: 'b',
        label: 'says "hi"',
      })
      expect(nodesOf(text).map(node => node.data.id)).toEqual(['Smith, A', 'b', 'c'])
    })

    it('reads from/to headers in any column order', () => {
      const text = 'weight\tto\tfrom\n1\tb\ta\n'
      expect(edgesOf(text)[0].data).toMatchObject({ source: 'a', target: 'b' })
    })

    it('reads a headerless tsv and a semicolon list', () => {
      expect(edgesOf('a\tb\tlinks\nb\tc\n')).toHaveLength(2)
      expect(edgesOf('a\tb\tlinks\nb\tc\n')[0].data.label).toBe('links')
      expect(edgesOf('a;b\nb;c\nc;a')).toHaveLength(3)
    })

    it('rejects rows without both endpoints', () => {
      const text = 'source,target\na,b\nc,\n,d\n'
      expect(() => parseGraph(text)).toThrow('source and target')
    })

    it('rejects a header that names only one endpoint column', () => {
      expect(() => parseGraph('source,weight\na,1\n')).toThrow(/target/)
    })

    it('rejects empty and edge-free input', () => {
      expect(() => parseGraph('   \n  ')).toThrow(/No data/)
      expect(() => parseGraph('source,target\n')).toThrow(/No edges parsed/)
      expect(() => parseGraph('just one cell')).toThrow(/source and target/)
    })
  })

  it('parses every built-in sample without dangling endpoints', () => {
    for (const sample of SAMPLE_GRAPHS) {
      const elements = parseGraph(sample.data)
      const nodeIds = new Set(
        elements.filter(element => element.group === 'nodes').map(element => element.data.id),
      )
      for (const edge of elements.filter(element => element.group === 'edges')) {
        expect(nodeIds.has(String(edge.data.source))).toBe(true)
        expect(nodeIds.has(String(edge.data.target))).toBe(true)
      }
      expect(nodeIds.size).toBeGreaterThan(0)
    }
  })
})
