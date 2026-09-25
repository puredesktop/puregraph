import { htmlExportAlias } from './scripts/html-export-runtime.mjs'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

import { appDevServerFromManifest } from '../../scripts/vite/app-server.mjs'

export default defineConfig({
  cacheDir: "node_modules/.vite/puregraph",
  resolve: { alias: htmlExportAlias },
  plugins: [react()],
  optimizeDeps: { exclude: ['puregraph-cytoscape-runtime', 'puregraph-cytoscape-runtime?raw'] },
  server: appDevServerFromManifest(import.meta.url),
})
