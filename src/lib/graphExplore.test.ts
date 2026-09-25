import { describe, expect, it } from 'vitest'
import { defaultGraphDocument, parseGraphDocument, serializeGraphDocument } from './graphDocument'
import { analyzeGraph, emptyGraphView, graphNeighborhood, queryGraph, viewElements, compareGraphElements } from './graphExplore'
import { applyGraphCommands } from './graphCommands'
import { encodedGraphDocument } from './graphEncoding'
import { layoutGraph } from './graphLayout'
import { graphHtmlPayload } from '../canvas/graphHtml'
import { parseGraph } from './graphParser'
import { previewGraphImport } from './graphImport'
import { createGraphProposal, acceptGraphProposal, readStoredProposal, storeProposal } from './graphProposal'
import { generateGraphPalette, reviewGraphColors } from './graphPalette'
import { contrastRatio } from './graphColorMath'
const fixture = () => ({ ...defaultGraphDocument(), elements: [
  { data: { id: 'a', label: 'Alpha', category: 'Team', score: 10, date: '2025-01-01' }, position: { x: 700, y: 900 } },
  { data: { id: 'b', label: 'Beta', category: 'Team', score: 20 }, position: { x: 800, y: 1000 } },
  { data: { id: 'c', label: 'Gamma', category: 'Evidence', score: 30 }, position: { x: 900, y: 900 } },
  { data: { id: 'ab', source: 'a', target: 'b' } }, { data: { id: 'bc', source: 'b', target: 'c' } },
] })
describe('explorable documents', () => {
  it('queries past the context cap and pages deterministically', () => {
    const elements = Array.from({ length: 450 }, (_, i) => ({ data: { id: `n${i}`, notes: `Evidence ${i}` } }))
    expect(queryGraph(elements, { offset: 400, limit: 40 }).nextOffset).toBe(440)
    expect(queryGraph(elements, { ids: ['n449'] }).elements[0].data.notes).toBe('Evidence 449')
    expect(() => queryGraph(elements, { limit: 1000 })).toThrow('200')
  })
  it('filters categories and excluded nodes without dangling edges or mutating data', () => {
    const doc = fixture(), before = JSON.stringify(doc)
    const shown = viewElements(doc.elements, { ...emptyGraphView(), hiddenIds: ['b'] })
    expect(shown.map(element => element.data.id)).toEqual(['a', 'c'])
    expect(JSON.stringify(doc)).toBe(before)
    expect(viewElements(doc.elements, { ...emptyGraphView(), hiddenCategories: ['Evidence'] }).map(element => element.data.id)).toEqual(['a', 'b', 'ab'])
  })
  it('computes directed paths and adjustable neighborhoods from real edges', () => {
    expect(analyzeGraph(fixture().elements, { operation: 'path', start: 'c', end: 'a', directed: true })).toEqual({ path: null })
    expect(graphNeighborhood(fixture().elements, 'a', 2, 'outgoing')).toContain('c')
    expect(graphNeighborhood(fixture().elements, 'a', 1, 'incoming')).toEqual(['a'])
  })
  it('filters time while keeping undated records', () => {
    expect(viewElements(fixture().elements, { ...emptyGraphView(), time: { field: 'date', from: '2026-01-01', to: '' } }).map(element => element.data.id)).toEqual(['b', 'c', 'bc'])
  })
  it('round trips saved stories, remaps renamed IDs, and exports only included elements', () => {
    const doc = applyGraphCommands(fixture(), [{ type: 'views', views: [{ id: 'view1', name: 'Team', caption: 'Evidence links', state: { ...emptyGraphView(), focusIds: ['a', 'b', 'ab'] }, selectedIds: ['a'] }] }, { type: 'rename', id: 'a', nextId: 'renamed' }])
    expect(parseGraphDocument(serializeGraphDocument(doc)).views).toEqual(doc.views)
    expect(doc.views![0].selectedIds).toEqual(['renamed'])
    expect(graphHtmlPayload(doc, { selectedOnly: true }, ['renamed']).views[0].focus).toEqual(['renamed'])
  })
  it('derives encodings dynamically, preserves overrides and source attributes', () => {
    const doc = applyGraphCommands(fixture(), [{ type: 'encodings', encodings: [{ channel: 'nodeSize', field: 'score' }] }, { type: 'update', ids: ['b'], data: { size: 33 } }])
    const rendered = encodedGraphDocument(doc)
    expect(rendered.elements[0].data.size).toBe(14)
    expect(rendered.elements[1].data.size).toBe(33)
    expect(rendered.elements[2].data.size).toBe(56)
    expect(doc.elements[0].data).not.toHaveProperty('size')
    expect(parseGraphDocument(serializeGraphDocument(doc)).encodings).toEqual(doc.encodings)
  })
  it('keeps defaults for categorical encodings without a value map', () => {
    const doc = applyGraphCommands(fixture(), [{ type: 'encodings', encodings: [{ channel: 'nodeColor', field: 'score' }, { channel: 'nodeShape', field: 'score' }] }])
    const rendered = encodedGraphDocument(doc)
    expect(rendered.elements[0].data).not.toHaveProperty('color')
    expect(rendered.elements[0].data).not.toHaveProperty('shape')
  })
  it('preserves preset positions and selection layout center', () => {
    const doc = fixture()
    expect(layoutGraph(doc, 'preset', undefined, 'right').elements).toEqual(doc.elements)
    expect(layoutGraph(doc, 'grid', ['a']).elements[0].position).toEqual(doc.elements[0].position)
  })
  it('uses the same parser for assistant and import, with explicit repairs', () => {
    const text = JSON.stringify({ nodes: [{ id: 'a' }], edges: [{ source: 'a', target: 'b' }] })
    expect(previewGraphImport(text).elements).toEqual(parseGraph(text))
    expect(previewGraphImport(text).notes).toHaveLength(2)
  })
  it('stores proposals by document and ignores save metadata when applying', () => {
    const doc = fixture(), proposal = createGraphProposal(doc, 'Rename label', [{ type: 'update', ids: ['a'], data: { label: 'Changed' } }])
    storeProposal('test-a', proposal)
    expect(readStoredProposal('test-a')?.id).toBe(proposal.id)
    expect(readStoredProposal('test-b')).toBeNull()
    expect(acceptGraphProposal({ ...doc, revision: 'new', savedAt: 'later' }, proposal).elements[0].data.label).toBe('Changed')
    expect(() => acceptGraphProposal({ ...doc, title: 'Different' }, proposal)).toThrow('changed')
    storeProposal('test-a', null)
  })
  it('compares stable IDs rather than labels', () => {
    expect(compareGraphElements(fixture().elements, [{ data: { id: 'a', label: 'Changed' } }])).toEqual({ added: [], removed: ['b', 'c', 'ab', 'bc'], changed: ['a'] })
  })
  it('measures neutral fallback and low-contrast edges', () => {
    expect(contrastRatio(generateGraphPalette(20, '#808080').neutral, '#808080')).toBeGreaterThanOrEqual(3)
    const doc = fixture(); doc.style.edgeColor = '#ffffff'
    expect(reviewGraphColors(doc).join(' ')).toContain('edges or arrows')
  })
})
