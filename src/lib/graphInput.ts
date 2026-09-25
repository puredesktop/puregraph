import type { GraphElement } from './graphParser'
import { validateElements } from './graphValidation'

function tableRows(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0], delimiter = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ','
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted }
    else if (!quoted && (char === delimiter || char === '\n' || char === '\r')) {
      row.push(cell.trim()); cell = ''
      if (char !== delimiter) { if (row.some(Boolean)) rows.push(row); row = []; if (char === '\r' && text[i + 1] === '\n') i++ }
    } else cell += char
  }
  if (quoted) throw new Error('Unclosed quoted cell.')
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row)
  return rows
}
/** Shared parser for pasted data, files, documents and assistant tools. Repairs are reported. */
export function parseGraphInput(text: string): { elements: GraphElement[]; notes: string[] } {
  if (!text.trim()) throw new Error('No data provided. Paste JSON or a table first.')
  let list: unknown[], table = false
  const notes: string[] = []
  if (/^\s*[\[{]/.test(text)) {
    let parsed: any
    try { parsed = JSON.parse(text) } catch (error) { throw new Error(`Invalid JSON: ${String(error)}`) }
    if (!parsed || typeof parsed !== 'object') throw new Error('Unrecognized JSON graph shape.')
    if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 1) throw new Error('This graph uses an unsupported document version.')
    const body = parsed.elements ?? parsed
    if (Array.isArray(body)) list = body
    else if (Array.isArray(body.nodes) || Array.isArray(body.edges)) list = [...(body.nodes ?? []), ...(body.edges ?? [])]
    else throw new Error('Unrecognized JSON graph shape. Expected elements, or nodes and edges.')
  } else {
    table = true
    const rows = tableRows(text), first = rows[0].map(cell => cell.toLowerCase().replace(/^from$/, 'source').replace(/^to$/, 'target'))
    const hasHeader = first.includes('id') || first.includes('source') || first.includes('target')
    const header = hasHeader ? first : ['source', 'target', ...(rows[0].length > 2 ? ['label'] : [])]
    if (new Set(header).size !== header.length || header.some(key => !key)) throw new Error('Column names must be nonempty and unique.')
    if (header.includes('source') !== header.includes('target')) throw new Error('Edge tables need both source and target columns.')
    list = rows.slice(hasHeader ? 1 : 0).map((row, index) => {
      if (!hasHeader && row.length === 2 && header.length === 3) row.push('')
      if (header.includes('source') && (!row[header.indexOf('source')] || !row[header.indexOf('target')])) throw new Error(`Row ${index + (hasHeader ? 2 : 1)} needs a source and target.`)
      if (row.length !== header.length) throw new Error(`Row ${index + (hasHeader ? 2 : 1)} has ${row.length} cells; expected ${header.length}.`)
      return Object.fromEntries(header.map((key, i) => [key, row[i]]))
    })
    if (!list.length) throw new Error('No edges parsed or nodes found in the table.')
  }
  const used = new Set<string>(), elements: GraphElement[] = [], automatic: GraphElement[] = []
  for (const value of list) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Each element must be an object.')
    const raw = value as Record<string, any>, data = { ...(raw.data ?? raw) }
    if (data.source === undefined && data.from !== undefined) data.source = data.from
    if (data.target === undefined && data.to !== undefined) data.target = data.to
    const edge = data.source !== undefined || data.target !== undefined
    const position = raw.position ?? (Number.isFinite(data.x) && Number.isFinite(data.y) ? { x: data.x, y: data.y } : undefined)
    delete data.x; delete data.y; delete data.position; delete data.group
    for (const key of ['id', 'source', 'target', 'label']) if (data[key] != null) data[key] = String(data[key])
    if (edge && (!data.source || !data.target)) throw new Error('Every edge needs a source and target.')
    const element: GraphElement = { group: edge ? 'edges' : 'nodes', data, ...(position ? { position } : {}) }
    if (!data.id && edge) automatic.push(element)
    else {
      if (!data.id) throw new Error('Every node needs a nonempty ID.')
      if (used.has(data.id)) throw new Error(`Duplicate ID "${data.id}". Rename it before importing.`)
      used.add(data.id)
    }
    data.label ??= edge ? '' : data.id
    elements.push(element)
  }
  for (const element of automatic) {
    const base = `${element.data.source}-${element.data.target}`; let id = base, suffix = 1
    while (used.has(id)) id = `${base}-${suffix++}`
    element.data.id = id; used.add(id)
  }
  if (automatic.length) notes.push(`Assigned stable IDs to ${automatic.length} edges without IDs.`)
  const nodeIds = new Set(elements.filter(element => element.group === 'nodes').map(element => element.data.id))
  const missing = new Set<string>()
  for (const edge of elements.filter(element => element.group === 'edges')) for (const id of [edge.data.source!, edge.data.target!]) if (!nodeIds.has(id)) missing.add(id)
  for (const id of missing) {
    if (used.has(id)) throw new Error(`Endpoint "${id}" is an edge ID, not a node.`)
    used.add(id); elements.push({ group: 'nodes', data: { id, label: id } })
  }
  if (missing.size) notes.push(`Created ${missing.size} endpoint nodes from ${table ? 'the edge table' : 'undeclared endpoints'}.`)
  validateElements(elements)
  return { elements: [...elements.filter(element => element.group === 'nodes'), ...elements.filter(element => element.group === 'edges')], notes }
}
