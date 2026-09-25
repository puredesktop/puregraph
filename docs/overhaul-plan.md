# PureGraph overhaul

Source of truth for the requested full overhaul. No phase is complete until its
behavior is implemented and verified; baseline tests alone do not prove completion.

1. Reliable documents: preserve saved positions; block navigation on failed save;
   reject stale reads; avoid external reload/write loops; save status, retry and recovery.
2. Session and commands: document-owned state, undo/redo for all edits, dragging,
   layouts and assistant transactions; canvas adapter owns rendering only.
3. Workspace: Data / Graph / Style / Review / Export, selection inspector,
   glass and white appearance, desktop and narrow layouts.
4. Creation: editable node/edge tables, spreadsheet paste, import preview,
   merge/replace, ID and endpoint validation, search, multiselect and bulk edits.
5. Layout and analysis: explicit auto-layout, pinned nodes, selection scope,
   direction controls, neighborhoods, components, paths and cycle detection.
6. Publishing: labels/arrows/routing/category styles/legends/style presets;
   export preview, dimensions, transparency, SVG/PNG and full document JSON.
7. Assistant review: validated proposals, destructive impact, atomic apply/undo,
   truthful save/export errors.

Final verification: real Electron multiple-document navigation, cross-window
changes, failed saves and recovery, delayed imports, large graphs, proposals,
export parity, desktop/narrow and both appearances. Keep app product logic local;
isolate any required generic platform fixes.

## Current implementation slice

Document session owns commands, history and document snapshots. App owns package
binding and persistence. The canvas adapter renders document state and submits
completed drag positions as commands. See completion-audit.md for the current
requirement matrix; progress entries below are chronological.

## Progress — reliability foundation

Implemented session snapshots and bounded undo/redo, resetting history on document
adoption. Added a canvas adapter that clones input/output and preserves complete
saved positions. Removed implicit relayout after structural edits. Navigation
uses generation/edit guards and stops on outgoing save failure. External loads
remain read-only. Recovery uses per-window Web Locks, separate local copies,
claim checks and timestamp-independent saved-content matching. Added visible save
status/retry. JSON export now includes the whole document.

Evidence: App lifecycle tests (4), history tests (3), canvas position test (1),
recovery tests (3), existing tests (41), typecheck and production build. Recovery
fixture was corrected to expect parser normalization; focused tests pass.

Still required: complete command/session ownership (workspace still owns style
and edit commands), atomic assistant workflows, stronger recovery integration
checks, pending edit flush semantics, in-flight save/edit races, stale local file
imports, all workspace/creation/analysis/publishing improvements, and real Electron
verification. The first two phases are in progress, not complete. No shell changes
or submodule commits/pushes made for this overhaul yet.

## Progress — commands and analysis

Added validated, immutable command transactions for add/replace/update/rename/
remove/position/pin/style/title. Node and edge creation, label changes, removals,
clear and style now call the session through App; removed their old Cytoscape
mutation implementations. ID rename updates endpoints, delete includes incident
edges, and invalid transactions leave their input unchanged.

Added iterative graph algorithms (weak components, directional neighborhoods,
unweighted directed/undirected paths, directed/undirected cycle detection),
including tests for parallel edges, self loops and a 12,000-node chain. Added
Data/Graph/Style/Review/Export navigation and a Review panel using these functions.

Verification: 13 focused command/analysis/App tests and typecheck pass. Standalone
Chrome renders all panels at 1280/800 without runtime errors or page overflow;
reviewed the Review screenshot and fixed missing standalone sizing fallbacks.
This is not Electron verification. Script: scripts/verify-workspace.mjs.

Remaining architecture: layout/import/drag still emit canvas snapshots; migrate
those to document commands, preserve selection/viewport on edits, and move style
state out of the workspace. Review styling and the broader panel redesign remain
in progress. No completion claim for any full phase yet.

## Progress — data editing and import review

Replaced the immediate destructive data loader with GraphData. It provides
paginated editable node/edge tables (30 rows), search, page selection, bulk label
and deletion, file/paste previews and explicit merge/replace/cancel. JSON imports
validate IDs and endpoints without silently dropping malformed records. CSV/TSV
supports node and edge headers, escaped quotes and multiline cells; edge-table
endpoint creation is explained in the preview. Merge preserves existing node
properties/positions and rejects ID/type/endpoint collisions. Async file reads
have a generation guard across document changes and newer pasted/file content.

Evidence: graphImport tests (4), typecheck, and the Chrome workspace verifier.
The verifier now exercises preview without mutation, replace, cell editing,
undo, merge and shortest path through the visible UI. Undo verification waits
for the canvas-to-table render effect rather than reading before it settles.

Still open: document/canvas position ownership on first import, delayed import
integration tests, virtualized or broader large-graph UI checks, selection and
viewport retention, full-document import style round trip, layout controls,
exports, proposal workflow and Electron final gates.

## Progress — authoritative positions and layout

Document commands now own layout results, initial import positions and completed
drags. Removed workspace autosave timers and canvas mutation listeners; saves no
longer depend on a deferred canvas snapshot. Removed eleven editable style state
copies; controls read the current document style. The canvas adapter only restores
supplied positions, locks pinned nodes and preserves selection/viewport on edits.
Explicit layouts support all/selected nodes and down/right direction; pin/unpin
controls are available in Graph. Legacy unpositioned documents receive stable
initial placement when adopted; existing positions remain unchanged.

Evidence: layout tests (3), canvas tests (2), App/command tests, typecheck and
visible browser data/edit/undo/merge/path checks pass. Remaining: full publishing,
proposal workflow, import document-style round trip, stricter style validation,
keyboard undo, graph QA at scale, lifecycle concurrency audit, real Electron gates.

## Progress — publishing

Extracted shared canvas styling; added SVG export through cytoscape-svg, an
isolated unselected export renderer, PNG rasterization from that same SVG, export
preview, pixel dimensions and transparency controls. Agent format validation and
manifest now accept SVG. JSON export reads the document, and previewing a full
JSON document now supports restoring its title/layout/style/positions on Replace.

Browser verification caught missing nodes/edges when Cytoscape calculated edge
visibility before label-sized endpoints were measured. Export now measures nodes
before adding edges; the nonempty SVG includes both node labels and edge labels,
and PNG decodes at the requested 900x600. Typecheck, import round-trip tests and
App tests pass. Package dependency cytoscape-svg added; parent package-lock updated
alongside its already-existing unrelated changes (do not stage wholesale).

Remaining publishing: category-style controls and legends, reusable styles,
stronger pixel/appearance parity checks, full export Electron filesystem gate.
Remaining overall: assistant proposal review, lifecycle/concurrency audit and
complete desktop gates. Goal still incomplete.

## Progress — assistant proposals

Added session-owned pending proposals, pre-validation, impact counts including
incident edge deletion, stale-base rejection, Apply/Discard UI, atomic apply and
whole-proposal undo. Existing graph mutation tools now stage proposals; the new
proposeGraph tool groups related commands. Updated manifest, tool catalog and
runtime assistant guidance. Pending proposals clear on document adoption, and
save/export operate on the applied document. Proposal title and impact appear in
the sidebar until resolved.

Evidence: proposal tests (3), App lifecycle/proposal integration (5), typecheck,
and existing browser data/export workflow pass. Full real assistant bridge and
visible Apply/Undo checks still pending. Sample opening still follows its old
separate-document lifecycle and needs truthful failure/await audit.

## Progress — reusable styling and legends

Added built-in Paper/Midnight/Blueprint presets and named reusable local presets
with storage-failure feedback. Category colors and legend visibility are document
style, preserved by JSON round trips. Node category is editable in the Data table.
Canvas and legend share the same color resolution (per-node overrides, category
palette, legacy cluster defaults, base color). Editor legend and SVG/PNG legend
use those same entries. Bounded normalized sizes prevent invalid dimensions.
Sample opening now awaits document transition and rejects on failed outgoing
save, so assistant success is no longer reported before it actually opens.

Evidence: legend/style tests (2), existing document tests (8), App tests (5),
typecheck and browser data/export workflow pass. Need visible preset/category/
legend export verification, full Electron/assistant transport tests, recovery/
concurrency/large-data audit and remaining UX cleanup before completion.

## Progress — real Electron verification

Added and ran scripts/verify-desktop.mjs against the running Electron shell on
CDP 9336 and PureGraph 5370. It created its own timestamped QA graph, imported a
complete document, edited and verified disk autosave, switched White/Glass,
visited all panels at 1280/800, exported SVG/PNG/JSON to the package, checked node,
edge and legend text and PNG dimensions, reloaded/reopened with saved positions,
and used actual filesystem write protection to verify failed-save navigation
blocking and Retry. The successful run retained QA document:
/Users/developer/Pure/Drafts/PureGraph QA 1790165381743.graph.
All temporary permissions and viewport overrides were restored. Existing graphs
were not overwritten. Screenshot review prompted consistent preset control styling.

Still outstanding: multi-window conflicts, interrupted-work recovery after reload,
real assistant proposal transport and visible Apply/Undo, delayed reads/imports,
large graph editor behavior, keyboard shortcuts, native selector cleanup, and a
requirement-by-requirement completion audit. Do not treat the successful desktop
smoke check as proof of those remaining cases.

## Progress — interrupted recovery and revision checks

Ran real Electron recovery fault injection: edits made while the QA package was
read-only survived iframe reload and recovered into a distinct draft. Verified
original disk content unchanged and recovered node positions intact. Script:
scripts/verify-desktop-recovery.mjs; output retained under Pure/Drafts with the
PureGraph QA recovery prefix.

Connected PureGraph to the existing shell document revision check (inspected
service.ts/revision.ts: check executes inside serialized withDocumentWrite).
Each serialized graph gets a UUID revision; App tracks loaded/last-saved revision.
Conflicting writes preserve local edits and provide an explicit Save my edits as
a new graph action. Recovery matching ignores save metadata/revision. App test
verifies changed disk revision rejects local save without overwriting either state.
Guarded new/sample transitions against edits made while outgoing save awaits.

Evidence: App tests (6), document/recovery tests and typecheck pass. Reran real
Electron import/edit/save/reopen/export/failure-retry successfully after revision
wiring. Real two-window conflict simulation, assistant transport, large-editor
checks and full audit are still outstanding.

## Progress — live assistant transport and larger graphs

Added scripts/verify-desktop-tools.mjs. Uses the real desktop shell Router ->
viewport -> app tool handler -> completion bridge, with only tool-record lookup
and result persistence stubbed (no model call or session messages). A two-edit
proposal remained unapplied until visible Apply, persisted atomically, and one
keyboard Undo restored the prior graph. Invalid endpoint proposals were rejected.
Temporary tool hooks were restored. QA graph retained under PureGraph QA tools.

Added Cmd/Ctrl-Z, Shift-Z and Ctrl-Y document history shortcuts, preserving native
text-field undo. Replaced remaining native select controls with shared SelectField.
Extended browser verification: imported 2,000 nodes / 1,999 edges, confirmed only
30 table rows mounted, searched final node, and traversed the full path. Completed
in 3.5 seconds in this run; this is evidence for that fixture, not a general bound.

Full suite now passes: 77 tests across 15 files. Typecheck passed. Remaining:
actual concurrent window conflict behavior and copy resolution, delayed file-read
integration, duplicate command/input edge cases, visual/control audit, build and
requirement-by-requirement completion audit. Goal remains active.

## Progress — competing saves and delayed import reads

scripts/verify-desktop-conflict.mjs uses an independent autosave request through
the real shell bridge while the editor has local changes. The stale editor save
was rejected by the host revision check, both local/remote values were preserved,
and visible Save my edits as a new graph created a separate conflict copy. This
proves the competing-writer path, not a literal two-Electron-window UI scenario.

Added runtime checks for malformed command ids, boolean pin state, layout names,
node/edge type mismatches and required objects/arrays. Extended browser verifier
with a delayed File.text promise: newer pasted data remained authoritative when
the old file read completed. Relevant command tests/typecheck pass; browser
workflow including large graph and delayed import passes.

Remaining audit: package parsing strictness, literal multi-window UI behavior,
final visual export parity/alpha checks, build and final requirement matrix.

## Progress — strict file parsing and export alpha

Moved structural validation into graphValidation, reused by commands and current
schema document parsing. Current saved documents reject duplicate IDs, missing
endpoints, wrong elements shapes and future schema versions before the legacy
parser can normalize away errors. Legacy schema-less files retain compatibility.
Imports also reject unsupported document versions.

Pixel verification found opaque PNG margins were transparent when output and
content aspect ratios differed. Fixed by placing the paper background in an outer
SVG viewport and fitting the graph/legend in its inner SVG. Browser check verifies
transparent corner alpha=0 and opaque corner alpha=255, labels, PNG size and valid
encoding. Full browser data/export/delayed-read/2,000-node workflow passes;
focused parser tests (14), typecheck and production build pass. Build reports the
existing large-bundle advisory (~965KB JS, ~304KB gzip); no build errors.

Remaining: final cross-window session/event verification and requirement matrix,
followed by final full-suite/runtime checks. Work is not yet marked complete.
