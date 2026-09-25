import { graphContentFingerprint, type GraphDocument } from './graphDocument'
import { graphSvg } from '../canvas/graphExport'
const cache = new Map<string, Promise<string | null>>()
/** A bounded cache of actual renderer snapshots; a changed document gets a new key. */
export function graphSnapshotHtml(document: GraphDocument): Promise<string | null> {
  if (!document.elements.length) return Promise.resolve(null)
  const key = graphContentFingerprint(document)
  const existing = cache.get(key)
  if (existing) return existing
  const result = graphSvg(document, { width: 620, height: 480, transparent: false }).then(svg => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}svg{display:block;width:100%;height:100vh}</style></head><body>${svg}</body></html>`).catch(() => { cache.delete(key); return null })
  cache.set(key, result)
  if (cache.size > 12) cache.delete(cache.keys().next().value!)
  return result
}
