import { layoutGraph } from './graphLayout'
self.onmessage = event => {
  try { self.postMessage({ document: layoutGraph(event.data.document, event.data.name, event.data.ids, event.data.direction) }) }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }) }
}
