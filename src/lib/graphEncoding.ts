import type { GraphDocument } from './graphDocument'
import { SUPPORTED_NODE_SHAPES } from '../constants'
export interface GraphEncoding { channel: 'nodeSize' | 'nodeColor' | 'nodeShape' | 'edgeWidth'; field: string; values?: Record<string, string> }
export function normalizeEncodings(value: unknown): GraphEncoding[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.filter(item => {
    if (!item || !['nodeSize', 'nodeColor', 'nodeShape', 'edgeWidth'].includes(item.channel) || typeof item.field !== 'string' || !item.field.trim() || seen.has(item.channel)) return false
    seen.add(item.channel); return true
  }).map(item => ({ channel: item.channel, field: item.field, ...(item.values && typeof item.values === 'object' ? { values: Object.fromEntries(Object.entries(item.values).filter(([, value]) => typeof value === 'string' && (item.channel === 'nodeColor' ? /^#[0-9a-f]{6}$/i.test(value) : SUPPORTED_NODE_SHAPES.includes(value as typeof SUPPORTED_NODE_SHAPES[number])))) as Record<string, string> } : {}) }))
}
export function encodingDomain(document: GraphDocument, encoding: GraphEncoding) {
  return document.elements.filter(element => (element.data.source !== undefined) === (encoding.channel === 'edgeWidth')).map(element => element.data[encoding.field]).filter(value => value !== undefined && value !== null && value !== '')
}
/** Derived visual values never overwrite evidence or stored per-element overrides. */
export function encodedGraphDocument(document: GraphDocument): GraphDocument {
  if (!document.encodings?.length) return document
  const next = { ...document, elements: document.elements.map(element => ({ ...element, data: { ...element.data } })) }
  for (const encoding of document.encodings) {
    const numeric = encodingDomain(document, encoding).map(Number).filter(Number.isFinite)
    let min = Infinity, max = -Infinity
    for (const value of numeric) { min = Math.min(min, value); max = Math.max(max, value) }
    for (const element of next.elements) {
      if ((element.data.source !== undefined) !== (encoding.channel === 'edgeWidth')) continue
      const field = encoding.channel === 'nodeSize' ? 'size' : encoding.channel === 'nodeColor' ? 'color' : encoding.channel === 'nodeShape' ? 'shape' : 'width'
      if (element.data[field] !== undefined && element.data[field] !== null) continue
      const value = element.data[encoding.field]
      if (value === undefined || value === null || value === '') continue
      if (encoding.values) { const mapped = encoding.values[String(value)]; if (mapped) element.data[field] = mapped }
      else if ((encoding.channel === 'nodeSize' || encoding.channel === 'edgeWidth') && Number.isFinite(Number(value)) && Number.isFinite(min)) {
        const ratio = max === min ? .5 : (Number(value) - min) / (max - min)
        element.data[field] = encoding.channel === 'edgeWidth' ? 1 + ratio * 5 : 14 + Math.sqrt(ratio) * 42
      }
    }
  }
  return next
}
export function encodingLegend(document: GraphDocument): { label: string; color: string }[] {
  return (document.encodings ?? []).flatMap(encoding => {
    const channel = { nodeSize: 'Node size', edgeWidth: 'Edge width', nodeShape: 'Shape', nodeColor: 'Color' }[encoding.channel]
    if (encoding.values) return Object.entries(encoding.values).map(([value, mapped]) => ({ label: `${encoding.field}: ${value}${encoding.channel === 'nodeShape' ? ` · ${mapped}` : ''}`, color: encoding.channel === 'nodeColor' ? mapped : document.style.nodeColor }))
    const values = encodingDomain(document, encoding).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
    return [{ label: `${channel} · ${encoding.field}: ${values[0] ?? '—'} to ${values.at(-1) ?? '—'} (missing: default)`, color: encoding.channel === 'edgeWidth' ? document.style.edgeColor : document.style.nodeColor }]
  })
}
