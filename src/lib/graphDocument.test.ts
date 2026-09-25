import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRAPH_STYLE,
  DEFAULT_GRAPH_TITLE,
  defaultGraphDocument,
  graphDocumentFromSample,
  normalizeGraphStyle,
  parseGraphDocument,
  serializeGraphDocument,
} from './graphDocument'
import { SAMPLE_GRAPHS } from './graphParser'

describe('graph document', () => {
  it('starts empty: a new graph ships no sample data', () => {
    const document = defaultGraphDocument()
    expect(document.elements).toEqual([])
    expect(document.title).toBe(DEFAULT_GRAPH_TITLE)
    expect(document.layout).toBe('cose')
    expect(document.style).toEqual(DEFAULT_GRAPH_STYLE)
  })

  it('round-trips a .graph document payload', () => {
    const document = graphDocumentFromSample(SAMPLE_GRAPHS[0])
    const parsed = parseGraphDocument(serializeGraphDocument(document))

    expect(parsed.title).toBe(document.title)
    expect(parsed.layout).toBe(document.layout)
    expect(parsed.elements.length).toBe(document.elements.length)
    expect(parsed.style.backgroundColor).toBe('#ffffff')
    expect(parsed.style.nodeSize).toBeGreaterThan(0)
  })

  it('builds a sample only on request, with its own title and style', () => {
    const sample = SAMPLE_GRAPHS.find(item => item.id === 'pathway-atlas')!
    const document = graphDocumentFromSample(sample)
    expect(document.title).toBe('Pathway Atlas')
    expect(document.layout).toBe('preset')
    expect(document.style.directed).toBe(false)
    expect(document.elements.length).toBeGreaterThan(0)
  })

  it('reads the createEntities template as an empty untitled graph', () => {
    const parsed = parseGraphDocument(
      '{\n  "schemaVersion": 1,\n  "title": "Untitled graph",\n  "layout": "cose",\n  "style": {},\n  "elements": []\n}\n',
    )
    expect(parsed.elements).toEqual([])
    expect(parsed.style).toEqual(DEFAULT_GRAPH_STYLE)
  })

  it('fills missing style fields when opening older payloads', () => {
    const parsed = parseGraphDocument(
      JSON.stringify({
        title: 'Legacy graph',
        layout: 'preset',
        style: { showLabels: false },
        elements: [{ group: 'nodes', data: { id: 'a', label: 'A' } }],
      }),
    )

    expect(parsed.title).toBe('Legacy graph')
    expect(parsed.style.showLabels).toBe(false)
    expect(parsed.style.edgeColor).toBeTruthy()
    expect(parsed.elements[0].data.id).toBe('a')
  })

  it('falls back on unknown layouts and mistyped style values', () => {
    const parsed = parseGraphDocument(
      JSON.stringify({
        layout: 'dagre',
        style: { nodeSize: 'big', nodeShape: 'star', directed: 'yes', nodeColor: '' },
      }),
    )
    expect(parsed.layout).toBe('cose')
    expect(parsed.style.nodeSize).toBe(DEFAULT_GRAPH_STYLE.nodeSize)
    expect(parsed.style.nodeShape).toBe(DEFAULT_GRAPH_STYLE.nodeShape)
    expect(parsed.style.directed).toBe(true)
    expect(parsed.style.nodeColor).toBe(DEFAULT_GRAPH_STYLE.nodeColor)
    expect(parsed.elements).toEqual([])
    expect(parsed.title).toBe(DEFAULT_GRAPH_TITLE)
  })

  it('keeps any non-empty colour string', () => {
    expect(normalizeGraphStyle({ nodeColor: 'rebeccapurple' }).nodeColor).toBe(
      'rebeccapurple',
    )
  })

  it('rejects malformed documents instead of opening a half graph', () => {
    expect(() => parseGraphDocument('{"elements": [')).toThrow(/Not a graph document/)
    expect(() => parseGraphDocument('[]')).toThrow(/Unrecognized graph document/)
    expect(() =>
      parseGraphDocument(JSON.stringify({ elements: [{ data: { source: 'a', target: 'b' } }] })),
    ).not.toThrow()
  })
})

it('refuses unsupported versions and corrupt current documents before normalization can discard data', () => {
  expect(() => parseGraphDocument('{"schemaVersion":2,"elements":[]}')).toThrow('unsupported')
  expect(() => parseGraphDocument('{"schemaVersion":1,"elements":{}}')).toThrow('array')
  expect(() => parseGraphDocument(JSON.stringify({ schemaVersion: 1, elements: [{ data: { id: 'a' } }, { data: { id: 'a' } }] }))).toThrow('Duplicate')
  expect(() => parseGraphDocument(JSON.stringify({ schemaVersion: 1, elements: [{ data: { id: 'ab', source: 'a', target: 'b' } }] }))).toThrow('missing node')
})
