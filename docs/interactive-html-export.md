# Interactive HTML export

Implemented in PureGraph on 23 September 2026. The broader implementation is recorded in `exploration-implementation-2026-09-23.md`.

## Export flow

Open **Export → Save interactive HTML**. The default includes the whole graph. Optionally export the current filtered view or selected nodes and the edges connecting them. Canvas and Data-panel selection are shared. No nodes selected produces an actionable error rather than an empty file.

Names, categories, shapes, colors, sizes, labels, and positions are included. Extra attributes (such as notes and source URLs) require explicit opt-in. The assistant can use `exportGraph` with `format: "html"`; it defaults to the whole graph with visual fields only and accepts scope, attribute keys, saved-view inclusion and initial-view options.

Files use the existing graph export destination: the graph package's `assets/figures` directory, or the established working-directory fallback. As with existing image exports, exporting to the same filename replaces that exported artifact.

## Viewer

The file opens offline without PureGraph, a server, fonts, or a CDN. It embeds the installed Cytoscape runtime and resolves the editor's shared styles at export time. The runtime loads lazily in the editor when HTML export is requested.

The viewer supports pan/zoom, label/ID/attribute search, category filters with text labels, node and relationship details, immediate connections, shortest paths respecting the graph's direction setting, fit/reset, and a keyboard-accessible table. Node positions are fixed; exploring does not edit the graph. Category filters and connection/path views also govern table contents.

Saved views remember filters, focus, pan, zoom, and a caption. Document views can be included in the export and chosen as the initial view. Views added in the viewer can be persisted using **Download HTML with saved views**, which creates a new self-contained file. Evidence is displayed only when its attributes were included; exporting does not invent notes or sources. Search shows at most 60 matching node buttons with an explicit count; refine the query to narrow results.

Graph data is embedded as escaped inert JSON and rendered with text nodes. Only HTTP(S) attribute URLs become links. The content-security policy blocks network requests and remote assets. User-activated source links open separately.

## Ownership and verification

The GraphDocument remains the source of truth. `graphHtml.ts` prepares an immutable export, resolves `buildStyle` function values, and embeds the viewer. `graphHtmlViewer.js` and `.css` belong to the app and have no shell dependency. SVG, PNG, and JSON export behavior remains intact. No shared shell changes are required.

Verified:

- 107 unit tests, including export tests for scope, data inclusion, styles/positions, and escaping.
- Typecheck and production build.
- `node scripts/verify-html-export.mjs`: real local HTML files in offline Chrome, no network requests or runtime errors, search, directed path, category filter, saved view, download and reopen saved views, keyboard table, hostile text, inside/outside node labels, and 1280/800/390px widths.
- `node scripts/verify-html-desktop.mjs`: real Electron export controls, opt-in attribute, bridge file write, and 1280/800px panels. Uses a dedicated QA document and restores the original document; refuses to run over a pending user proposal.

The browser scripts assume the local dev server on port 5370; the desktop script also assumes Electron CDP on port 9336. Accessibility certification and formal large-graph capacity guarantees are not covered. Shared stories are persisted in the exported file; edits do not synchronize back to the original GraphDocument.
