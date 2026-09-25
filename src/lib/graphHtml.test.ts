import { describe, expect, it } from 'vitest'
import { graphAttributeKeys, graphHtml, graphHtmlPayload } from '../canvas/graphHtml'
import { defaultGraphDocument } from './graphDocument'
const fixture = () => ({ ...defaultGraphDocument(), title: '</script><img src=x onerror=alert(1)>', elements: [
  { data: { id: 'a', label: '<script>alert(1)</script>', category: 'Team', notes: 'Private note', sourceUrl: 'https://example.com' }, position: { x: 20, y: 30 } },
  { data: { id: 'b', label: 'Beta', category: 'Team' }, position: { x: 100, y: 30 } },
  { data: { id: 'c', label: 'Gamma' }, position: { x: 200, y: 30 } },
  { data: { id: 'ab', source: 'a', target: 'b', label: 'knows' } },
  { data: { id: 'bc', source: 'b', target: 'c' } },
] })
describe('interactive HTML export', () => {
  it('exports positions and resolved styles without mutating the document', () => {
    const document = fixture(), before = JSON.stringify(document)
    document.style.categoryColors = { Team: '#123456' }
    const result = graphHtmlPayload(document)
    expect(result.elements[0].position).toEqual({ x: 20, y: 30 })
    expect(result.styles.find(rule => rule.selector === '.export-0')?.style['background-color']).toBe('#123456')
    delete document.style.categoryColors
    expect(JSON.stringify(document)).toBe(before)
  })
  it('shares extra attributes only when explicitly included', () => {
    expect(graphAttributeKeys(fixture())).toEqual(['notes', 'sourceUrl'])
    expect(graphHtmlPayload(fixture()).elements[0].data).not.toHaveProperty('notes')
    expect(graphHtmlPayload(fixture(), { attributeKeys: ['notes'] }).elements[0].data.notes).toBe('Private note')
  })
  it('exports the selected induced subgraph without dangling edges', () => {
    expect(graphHtmlPayload(fixture(), { selectedOnly: true }, ['a', 'b']).elements.map(item => item.data.id)).toEqual(['a', 'b', 'ab'])
    expect(() => graphHtmlPayload(fixture(), { selectedOnly: true }, ['ab'])).toThrow('Select at least one node')
    expect(() => graphHtmlPayload(defaultGraphDocument())).toThrow('Add nodes')
  })
  it('keeps untrusted graph text inside inert JSON and embeds an offline runtime', () => {
    const html = graphHtml(fixture())
    const data = html.match(/<script id="graph-data" type="application\/json">(.*?)<\/script>/s)![1]
    expect(data).not.toContain('<')
    expect(JSON.parse(data).title).toBe(fixture().title)
    expect(html).not.toMatch(/<script[^>]+src=/)
    expect(html).toContain("connect-src 'none'")
  })
})
