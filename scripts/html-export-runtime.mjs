import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// Resolve the installed UMD build through Cytoscape's CommonJS export condition.
// This keeps the portable viewer on the exact renderer version used by the app.
export const htmlExportAlias = {
  'puregraph-cytoscape-runtime?raw': `${require.resolve('cytoscape/dist/cytoscape.min.js')}?raw`,
}
