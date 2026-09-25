import { encodedGraphDocument } from './graphEncoding'
import { readableTextColor } from './contrast'
import { colorDistance, contrastRatio, isHexColor, lightnessAndChroma, NORMAL_VISION_FLOOR, CVD_TARGET } from './graphColorMath'
import { graphNodeColor } from '../canvas/graphStyle'
import { isEdge, type GraphCommand } from './graphCommands'
import type { GraphDocument } from './graphDocument'

const VISIONS = ['protan', 'deutan', 'tritan'] as const
/** All pairs matter in a network, not just neighbouring palette slots. */
export function separation(a: string, b: string): number {
  return Math.min(colorDistance(a, b) / NORMAL_VISION_FLOOR, ...VISIONS.map(vision => colorDistance(a, b, vision) / CVD_TARGET))
}

const CANDIDATES = (() => {
  const colors = ['#387ec1', '#b4612d', '#059068', '#8667b9', '#71841f', '#b0508e']
  for (const r of [32, 64, 96, 128, 160, 192, 224]) for (const g of [32, 64, 96, 128, 160, 192, 224]) for (const b of [32, 64, 96, 128, 160, 192, 224]) {
    const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')
    const { chroma } = lightnessAndChroma(hex)
    if (chroma >= .06 && chroma <= .19) colors.push(hex)
  }
  return colors
})()

export function generateGraphPalette(count: number, background: string): { colors: string[]; overflow: number; neutral: string } {
  if (!isHexColor(background)) throw new Error('Choose a hex background color before generating a measured palette.')
  const candidates = CANDIDATES.filter(color => contrastRatio(color, background) >= 3)
  // Try several starting points; keep the largest set. Order and ties are deterministic.
  let colors: string[] = []
  for (const seed of candidates.slice(0, 12)) {
    const selected = [seed]
    while (selected.length < Math.min(count, 12)) {
      let best = '', score = -1
      for (const candidate of candidates) {
        const distance = Math.min(...selected.map(color => separation(color, candidate)))
        if (distance > score) { score = distance; best = candidate }
      }
      if (score < 1) break
      selected.push(best)
    }
    if (selected.length > colors.length) colors = selected
    if (colors.length >= count) break
  }
  colors = colors.slice(0, Math.max(0, count))
  const neutral = ['#68717d', '#b9c1cb', '#17212b', '#ffffff'].sort((a, b) => contrastRatio(b, background) - contrastRatio(a, background))[0]
  return { colors, overflow: Math.max(0, count - colors.length), neutral }
}

export function graphColorGroups(document: GraphDocument) {
  const groups = new Map<string, { label: string; ids: string[] }>()
  const unnamedColors = [...new Set(document.elements.filter(el => !isEdge(el) && !el.data.category && !el.data.cluster).map(el => graphNodeColor(el.data, document.style)))].sort()
  const usedNames = new Set(document.elements.flatMap(el => [String(el.data.category ?? el.data.cluster ?? '')]))
  const unnamedNames = unnamedColors.map((_, index) => {
    let name = `Color group ${index + 1}`
    while (usedNames.has(name)) name += ' (unassigned)'
    usedNames.add(name)
    return name
  })
  for (const node of document.elements.filter(el => !isEdge(el))) {
    const explicit = String(node.data.category ?? node.data.cluster ?? '')
    const index = unnamedColors.indexOf(graphNodeColor(node.data, document.style))
    const label = explicit || unnamedNames[index]!
    const group = groups.get(label) ?? { label, ids: [] }
    group.ids.push(node.data.id!); groups.set(label, group)
  }
  return [...groups.values()].sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0)
}

export function graphPalettePlan(document: GraphDocument) {
  const groups = graphColorGroups(document)
  const result = generateGraphPalette(groups.length, document.style.backgroundColor)
  const categoryColors = Object.fromEntries(groups.map((group, index) => [group.label, result.colors[index] ?? result.neutral]))
  const commands: GraphCommand[] = groups.map(group => ({ type: 'update', ids: group.ids, data: { category: group.label, color: undefined } }))
  commands.push({ type: 'style', style: { categoryColors, showLegend: true } })
  return { ...result, groups, categoryColors, commands }
}

/** Audit actual rendered node colors, including explicit per-node overrides. */
export function reviewGraphColors(document: GraphDocument): string[] {
  document = encodedGraphDocument(document)
  const warnings: string[] = []
  const background = document.style.backgroundColor
  if (!isHexColor(background)) return ['Color checks need a hex background color.']
  const entries = new Map<string, { label: string; color: string }>()
  for (const node of document.elements.filter(el => !isEdge(el))) {
    const color = graphNodeColor(node.data, document.style)
    const label = String(node.data.category ?? node.data.cluster ?? `Color ${color}`)
    entries.set(`${label}\0${color}`, { label, color })
  }
  const colors = [...entries.values()]
  const unsupported = colors.filter(entry => !isHexColor(entry.color))
  if (unsupported.length) warnings.push(`${unsupported.length} color groups use colors that cannot be measured here. Use hex colors.`)
  const valid = colors.filter(entry => isHexColor(entry.color))
  const faint = valid.filter(entry => contrastRatio(entry.color, background) < 3)
  if (faint.length) warnings.push(`${faint.length} color groups have low contrast against the background: ${faint.slice(0, 3).map(e => e.label).join(', ')}.`)
  let close = 0
  // Bound review cost for imported documents with thousands of individual colors.
  const measured = valid.slice(0, 100)
  for (let a = 0; a < measured.length; a++) for (let b = a + 1; b < measured.length; b++) {
    if (measured[a]!.label !== measured[b]!.label && separation(measured[a]!.color, measured[b]!.color) < 1) close++
  }
  if (valid.length > measured.length) warnings.push('Only the first 100 color groups were checked for pair separation. Reduce the number of categories.')
  if (close) warnings.push(`${close} category pairs are too similar in one or more vision checks. Use distinct shapes and labels, or generate a palette in Style.`)
  if (!document.style.showLabels && colors.length > 1) warnings.push('Node labels are hidden. Keep labels or distinct shapes so color is not the only cue.')
  const composite = (color: string, opacity: number) => '#' + [1, 3, 5].map(offset => Math.round(parseInt(color.slice(offset, offset + 2), 16) * opacity + parseInt(background.slice(offset, offset + 2), 16) * (1 - opacity)).toString(16).padStart(2, '0')).join('')
  const edgeColors = [...new Set(document.elements.filter(isEdge).map(edge => String(edge.data.color || document.style.edgeColor)))]
  if (edgeColors.some(color => !isHexColor(color))) warnings.push('Some edge/arrow colors cannot be measured; use hex colors.')
  if (edgeColors.some(color => isHexColor(color) && contrastRatio(composite(color, 0.7), background) < 3)) warnings.push('Some edges or arrows have low contrast at the rendered opacity. Darken or lighten their colors in Style.')
  if (document.style.showLabels) {
    const papers = document.style.labelPlacement === 'inside' ? valid.map(entry => entry.color) : [background]
    if (papers.some(paper => contrastRatio(readableTextColor(paper), paper) < 4.5)) warnings.push('Some node labels fall below 4.5:1 contrast.')
    if (document.style.showEdgeLabels && edgeColors.length && contrastRatio(composite(readableTextColor(background), .75), background) < 4.5) warnings.push('Edge labels fall below 4.5:1 contrast at the rendered text opacity.')
  }
  return warnings
}
