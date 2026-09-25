import type { GraphDocument } from './graphDocument'
import type { GraphLayoutName } from '../constants'
import { layoutGraph } from './graphLayout'
/** Layout work is isolated so large force simulations do not block typing or Cancel. */
export function layoutGraphAsync(document: GraphDocument, name: GraphLayoutName, ids?: string[], direction: 'down' | 'right' = 'down', signal?: AbortSignal): Promise<GraphDocument> {
  if (name === 'preset') return Promise.resolve(layoutGraph(document, name, ids, direction))
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Layout cancelled.')); return }
    const worker = new Worker(new URL('./graphLayoutWorker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => { worker.terminate(); clearTimeout(timeout); signal?.removeEventListener('abort', cancel) }
    const cancel = () => { cleanup(); reject(new Error('Layout cancelled.')) }
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Layout exceeded 30 seconds. Try a smaller selection or a grid layout.')) }, 30000)
    signal?.addEventListener('abort', cancel, { once: true })
    worker.onmessage = event => { cleanup(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.document) }
    worker.onerror = event => { cleanup(); reject(new Error(event.message || 'Layout worker failed.')) }
    worker.postMessage({ document, name, ids, direction })
  })
}
