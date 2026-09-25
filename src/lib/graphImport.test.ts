import { expect, it } from 'vitest'
import { mergeGraphElements, previewGraphImport } from './graphImport'
it('accepts spreadsheet node tables and quoted multiline labels', () => {
  const preview = previewGraphImport('id\tlabel\na\t"First\nnode"\nb\tSecond')
  expect(preview.elements[0].data.label).toBe('First\nnode')
  expect(preview.elements).toHaveLength(2)
})
it('makes edge-table endpoints explicit in the preview', () => {
  const preview = previewGraphImport('source,target,label\na,b,connects')
  expect(preview.elements).toHaveLength(3)
  expect(preview.notes.join(' ')).toContain('2 endpoint nodes')
})
it('rejects duplicate IDs, missing endpoints and incomplete rows instead of silently dropping data', () => {
  expect(() => previewGraphImport('id,label\na,First\na,Second')).toThrow('Duplicate')
  expect(() => previewGraphImport('source,target\na,')).toThrow('Row 2')
  expect(previewGraphImport(JSON.stringify([{ data: { id: 'edge', source: 'missing', target: 'other' } }])).notes.join(' ')).toContain('2 endpoint nodes')
  expect(() => previewGraphImport('id,label\na')).toThrow('expected 2')
})
it('merges nodes without resetting saved placement or labels and rejects conflicting edges', () => {
  const original = [{ data: { id: 'a', label: 'Edited' }, position: { x: 3, y: 4 } }]
  const incoming = previewGraphImport('source,target\na,b').elements
  const merged = mergeGraphElements(original, incoming)
  expect(merged[0]).toEqual(original[0])
  expect(merged).toHaveLength(3)
  expect(() => mergeGraphElements(merged, [{ data: { id: 'a-b', source: 'b', target: 'a' } }])).toThrow('conflicts')
  expect(original).toHaveLength(1)
})

it('round-trips complete JSON documents including styling, layout and node positions', async () => {
  const { defaultGraphDocument, serializeGraphDocument } = await import('./graphDocument')
  const document = { ...defaultGraphDocument(), title: 'Published graph', layout: 'circle' as const, elements: [{ data: { id: 'a', pinned: true }, position: { x: 13, y: 21 } }] }
  document.style.nodeColor = '#123456'
  const preview = previewGraphImport(serializeGraphDocument(document))
  expect(preview.document?.title).toBe(document.title)
  expect(preview.document?.style).toEqual(document.style)
  expect(preview.document?.layout).toBe('circle')
  expect(preview.elements[0].position).toEqual({ x: 13, y: 21 })
  expect(preview.elements[0].data.pinned).toBe(true)
})
