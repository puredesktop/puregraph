import { htmlExportAlias } from './scripts/html-export-runtime.mjs'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: htmlExportAlias },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
})
