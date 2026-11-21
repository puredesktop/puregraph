import type { GraphDocument } from './graphDocument'
import { isEdge } from './graphValidation'

const FORMULA_PREFIX_RE = /^[\s\u0000-\u001f]*[=+\-@]|^[\t\r]/

/**
 * RFC-4180 CSV cell escaping with OWASP spreadsheet formula-injection protection.
 * Prefixes cells whose leading non-whitespace/control character is =, +, -, or @
 * (or that start with tab/CR) with a single quote so spreadsheet apps treat them
 * as literal text. Genuine finite JS numbers (such as negative coordinates) pass
 * through unprefixed so numeric columns round-trip cleanly on re-import.
 */
export function csvEscapeCell(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (FORMULA_PREFIX_RE.test(text)) {
    text = `'${text}`
  }
  if (/[",\n\r\t]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function serializeCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscapeCell).join(',')]
  for (const row of rows) {
    lines.push(row.map(csvEscapeCell).join(','))
  }
  return `${lines.join('\n')}\n`
}

export function graphNodesCsv(document: GraphDocument): string {
  const nodes = document.elements.filter(element => !isEdge(element))
  const reserved = new Set(['id', 'label', 'category', 'x', 'y'])
  const extraKeys = [...new Set(nodes.flatMap(node => Object.keys(node.data)))]
    .filter(key => !reserved.has(key))
    .sort()
  const headers = ['id', 'label', 'category', 'x', 'y', ...extraKeys]
  const rows = nodes.map(node => [
    node.data.id ?? '',
    node.data.label ?? '',
    node.data.category ?? '',
    node.position?.x ?? '',
    node.position?.y ?? '',
    ...extraKeys.map(key => node.data[key]),
  ])
  return serializeCsv(headers, rows)
}

export function graphEdgesCsv(document: GraphDocument): string {
  const edges = document.elements.filter(isEdge)
  const reserved = new Set(['id', 'source', 'target', 'label'])
  const extraKeys = [...new Set(edges.flatMap(edge => Object.keys(edge.data)))]
    .filter(key => !reserved.has(key))
    .sort()
  const headers = ['id', 'source', 'target', 'label', ...extraKeys]
  const rows = edges.map(edge => [
    edge.data.id ?? '',
    edge.data.source ?? '',
    edge.data.target ?? '',
    edge.data.label ?? '',
    ...extraKeys.map(key => edge.data[key]),
  ])
  return serializeCsv(headers, rows)
}
