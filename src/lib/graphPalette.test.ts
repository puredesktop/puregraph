import { describe, expect, it } from 'vitest'
import { defaultGraphDocument, parseGraphDocument, serializeGraphDocument } from './graphDocument'
import { applyGraphCommands } from './graphCommands'
import { generateGraphPalette, graphPalettePlan, reviewGraphColors, separation } from './graphPalette'
import { colorDistance, contrastRatio } from './graphColorMath'
import { graphNodeColor } from '../canvas/graphStyle'

function fixture() {
  return { ...defaultGraphDocument(), elements: ['#ff0000', '#00ff00', '#0000ff'].map((color, index) => ({ data: { id: `n${index}`, color, shape: 'diamond' }, position: { x: index * 100, y: 20 } })) }
}

describe('measured graph palettes', () => {
  it('uses finite, distinct palettes on both light and dark paper', () => {
    for (const background of ['#ffffff', '#182332']) {
      const result = generateGraphPalette(20, background)
      expect(result.colors.length).toBeGreaterThan(1)
      expect(result.overflow).toBe(20 - result.colors.length)
      expect(new Set(result.colors).size).toBe(result.colors.length)
      for (const color of result.colors) expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(3)
      for (let i = 0; i < result.colors.length; i++) for (let j = i + 1; j < result.colors.length; j++) expect(separation(result.colors[i]!, result.colors[j]!)).toBeGreaterThanOrEqual(1)
      expect(generateGraphPalette(20, background)).toEqual(result)
    }
  })
  it('refuses unmeasurable backgrounds and handles empty graphs', () => {
    expect(() => generateGraphPalette(3, 'red')).toThrow('hex background')
    expect(generateGraphPalette(0, '#ffffff').colors).toEqual([])
  })
  it('screens all category pairs, explicit overrides and faint marks', () => {
    const document = { ...defaultGraphDocument(), elements: [
      { data: { id: 'a', category: 'First', color: '#ffffff' } },
      { data: { id: 'b', category: 'Middle', color: '#0000ff' } },
      { data: { id: 'c', category: 'Last', color: '#ffffff' } },
    ] }
    const warnings = reviewGraphColors(document).join(' ')
    expect(warnings).toContain('low contrast')
    expect(warnings).toContain('1 category pairs')
    expect(colorDistance('#ff0000', '#ff0000', 'deutan')).toBe(0)
    expect(contrastRatio('#000', '#fff')).toBe(21)
  })
  it('replaces explicit colors, preserves geometry, and saves a stable mapping', () => {
    const document = fixture(), original = structuredClone(document)
    const plan = graphPalettePlan(document)
    const next = applyGraphCommands(document, plan.commands)
    expect(document).toEqual(original)
    expect(plan.overflow).toBe(0)
    for (const node of next.elements) {
      expect(node.data.shape).toBe('diamond')
      expect(node.position).toEqual(document.elements.find(el => el.data.id === node.data.id)!.position)
      expect(graphNodeColor(node.data, next.style)).toBe(next.style.categoryColors![String(node.data.category)])
    }
    expect(reviewGraphColors(next)).toEqual([])
    const reopened = parseGraphDocument(serializeGraphDocument(next))
    expect(reopened.style.categoryColors).toEqual(next.style.categoryColors)
    expect(graphPalettePlan(reopened).categoryColors).toEqual(plan.categoryColors)
    expect(graphPalettePlan({ ...document, elements: [...document.elements].reverse() }).categoryColors).toEqual(plan.categoryColors)
  })
})
