import { dirname } from 'node:path'
import { realpathSync } from 'node:fs'
import { htmlExportAlias } from './scripts/html-export-runtime.mjs'
import { defineConfig } from 'vitest/config'

const cytoscapeRuntimePath = htmlExportAlias['puregraph-cytoscape-runtime?raw'].replace(/\?raw$/, '')
const allowedDirs = [
  '../..',
  dirname(cytoscapeRuntimePath),
  (() => {
    try { return dirname(realpathSync(cytoscapeRuntimePath)) } catch { return dirname(cytoscapeRuntimePath) }
  })(),
]

export default defineConfig({
  resolve: { alias: htmlExportAlias },
  server: { fs: { allow: allowedDirs } },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
})
