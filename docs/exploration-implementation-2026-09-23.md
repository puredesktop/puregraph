# PureGraph exploration implementation — 23 September 2026

This is the implementation status for the broader scope identified in `product-review-2026-09-23.md`. All changes belong to the PureGraph submodule; no shell implementation change is required.

## Source of truth and flows

`GraphDocument` owns graph elements, evidence attributes, visual mappings, and saved views. Graph commands provide one undoable transaction per accepted change. Exploration filters, focus, and temporary exclusions do not mutate graph data. Per-element visual overrides take precedence over mappings and can be reset explicitly.

- **Data:** shared strict JSON/table parsing for imports and assistant tools, explicit endpoint repair notes, editable fields with visible rejection, retained import drafts, shared canvas/table selection, stable pagination.
- **Graph:** incremental rendering preserves unchanged nodes, selection, positions and pins; labels inside nodes are measured outside Cytoscape batches. Layouts run in a cancellable worker, reject stale results, and preserve the center of selected layouts. Preset preserves exact positions.
- **Explore:** paginated attribute search, categories, hide/dim, directed neighborhoods, actual shortest paths, automatic fit after focus/filter changes, notes/source/provenance/confidence, synthetic-data markers, saved views with captions and viewport, temporary what-if exclusion with component counts, date windows and comparison by stable element IDs.
- **Style and Review:** data-driven node sizes/colors/shapes and edge widths, legends, explicit override reset, measured category palettes, finite palette fallback, edge/arrow and label contrast review. The pane is resizable and can be hidden; Data has more space.
- **Proposals:** dedicated review flow, per-document local persistence, reload restoration, empty-base preview, stale-content checks, one undoable apply, discard by exact proposal ID. Storage is local to this installation, not portable collaboration history.
- **Assistant:** paginated full-attribute query, real graph analysis, selection/focus/exclusion, saved views, palette proposals, worker-backed graph creation/layout, explicit synthetic-data labeling and scope-aware exports. A new graph is a separate document; staged edits remain proposals until applied.
- **Export:** shared scope resolution for whole/current/selected graphs and preview; offline interactive HTML embeds its renderer, saved stories and optional evidence. Viewer-created views can be downloaded into a new HTML file. See `interactive-html-export.md`.
- **Lifecycle:** reopening restores the last document and its pending proposal. Document thumbnails render actual content and use a bounded content-keyed cache.

## Verification

- 107 unit tests across 20 files; affected TypeScript and production build pass.
- `verify-exploration.mjs`: import draft, inside labels, rejected ID edits, selection/rename, evidence, filtering and path focus/fit, saved views and undo/redo, actual layout worker and cancellation, deletion pagination, 1280/800px UI.
- `verify-html-export.mjs`: offline Chrome, no external requests, search, directed path, category filters, keyboard table, hostile text, labels, saved-view download and reopening, 1280/800/390px.
- `verify-desktop-explore.mjs`: actual Electron tool routing and filesystem, 310-node graph creation, inspection beyond the context cap, computed paths, view persistence, proposal reload/apply/discard and HTML stories.
- `verify-desktop-recovery.mjs`: write failure followed by reload; unsaved work recovered into a separate document, original preserved.
- `verify-desktop-conflict.mjs`: competing bridge writer causes stale-save rejection; conflict copy preserves both versions.
- Real drawer-model session: inspected node 309, computed a real path, created a separate six-node/seven-edge synthetic team graph, focused a path, saved a captioned view and document, staged one label change, then discarded it and verified the original label and counts. This is one successful live scenario, not a statistical model reliability claim.

## Measured performance and boundaries

`benchmark-exploration.mjs`, local Chrome:

| Nodes / edges | Initial canvas | Single edit | Query + path | Worker grid layout |
|---|---:|---:|---:|---:|
| 250 / 1,500 | 84 ms | 12 ms | 1 ms | 100 ms |
| 1,000 / 6,000 | 248 ms | 34 ms | 3 ms | 240 ms |

The main thread continued ticking during worker layouts. These are local grid-layout measurements, not a maximum supported graph size or force-layout benchmark. Layouts time out after 30 seconds and can be cancelled. The build still reports its large main-chunk advisory; HTML runtime is lazy-loaded. Undo and recovery still retain full document snapshots.

Time exploration is an attribute range filter; comparison reports added/removed/changed IDs; what-if is a reversible view exclusion. These are useful first implementations, not temporal animation, semantic graph merging, or predictive simulation. Color checks and keyboard-accessible controls do not constitute an accessibility certification. No cloud publishing, collaborative editing, or automatic push/merge is part of this build.
