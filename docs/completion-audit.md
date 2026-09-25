# PureGraph overhaul completion audit

Scope: all seven phases in overhaul-plan.md. Source of truth is the current
worktree. This records implemented behavior and the actual validation scope;
no publishing, pushing or merging is claimed.

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Preserve positions on open; edits do not rearrange graph | graphLayout, graphCanvas; document positions authoritative | canvas/layout tests; desktop saved/reopened coordinates |
| Save failures block destructive navigation; retry | App start/open guards; lifecycle throwOnError | App tests; real read-only package/New/Retry in verify-desktop |
| Stale reads and reload loops | navigation generation and content identity; saved-content fingerprint | delayed-read and two-session App tests; no echo writes |
| Recovery after interruption | per-window local copies, Web Locks ownership, recover separate draft | recovery tests; verify-desktop-recovery reload after real write failure |
| Concurrent saves preserve both edits | UUID revision checks using existing serialized shell writes; conflict-copy action | two independent App sessions; verify-desktop-conflict competing real bridge writer and copy |
| Whole-document undo/redo | graphHistory/useGraphSession; all commands, layout, positions and proposals commit through session | history/command/layout tests; browser edit undo; Electron proposal keyboard undo |
| Canvas owns only rendering | graphCanvas restores supplied state; dragfree submits positions command; style read from currentDocument | source inspection; removed snapshot emitter/timer and unused callback; noUnused typecheck |
| Data/Graph/Style/Review/Export and inspector | GraphWorkspace navigation and selection inspector; extracted Data/Review/Export/preset panels | browser and Electron visits at 1280/800; screenshot inspection |
| Glass/White appearance | shared AppFrame settings | verify-desktop uses actual settings bridge and restores initial appearance |
| Editable nodes/edges, search, bulk edits | GraphData paginated table, rename/label/endpoints/category; multi-select and label/delete commands | import/command tests; visible browser cell edit/search; 30 rows mounted for 2,000 nodes |
| Spreadsheet paste, preview, merge/replace | graphImport and GraphData; delayed-file generation guard | import tests; browser preview no mutation, replace, merge and delayed File.text vs newer paste |
| IDs and endpoints validated | graphValidation shared by commands/current documents/import | invalid/duplicate/dangling/type/schema tests; invalid assistant proposal rejected |
| Explicit layouts, pins, scope, direction | graphLayout command; Graph controls; pinned nodes locked | scoped/pinned/layout tests; authoritative serialized coordinates |
| Neighborhoods, components, shortest paths, cycles | iterative graphAnalysis; explicit traversal assumptions in Review | directed/undirected/self-loop/parallel tests; 12k chain unit case; 2k-node visible path |
| Labels/arrows/routing and category styling | shared graphStyle, document style, controls and category table field | shared renderer source; exported node/edge text; legend/style tests |
| Reusable styles and legends | named local presets plus built-ins; document category palette and legend flag | preset source/storage error path; legend round-trip tests; actual SVG contains Team legend |
| Preview, dimensions, transparency, SVG/PNG | isolated same-style Cytoscape SVG; preview and PNG share that SVG | nonempty browser SVG labels and PNG decode; corner-alpha 0/255; Electron files and 1600x1000 PNG |
| Complete JSON round trip | serialized GraphDocument; Data and loose-file open preserve style/layout/positions | import and App exported JSON tests; actual Electron JSON export |
| Assistant proposals and destructive impact | new proposeGraph and staged mutation tools; validated pending state; Apply/Discard; stale-base refusal | proposal tests; real shell router -> iframe -> completion verifier with visible Apply/Undo |
| Truthful persistence failures | save/export await writes; sample waits for transition; errors reject | App failure tests; Electron permission failure/retry; source inspection |

## Verification scope

Unit/integration tests use actual App/session/lifecycle hooks with an in-memory
filesystem transport. Two independent mounted editors test bidirectional clean
updates and dirty-session protection. Electron checks exercise the real shell
filesystem/settings/tool routing. The competing-writer check issues a second
real autosave request, rather than opening a second Electron main window (the
current desktop exposes one main workspace window). It verifies host conflict
protection and visible copy resolution, complementing the two-editor event test.

Assistant verification does not call a model: only tool record lookup and result
persistence are fixtures; routing, app invocation, proposal UI and saves are real.
Large-editor evidence is a 2,000-node/1,999-edge fixture; algorithm stress evidence
is a 12,000-node chain. No universal performance limit is claimed.

## Build and repository state

Production build succeeds with Vite's large-chunk advisory (about 965KB minified,
304KB gzip). No shell source changes were made in this overhaul. The app uses
existing shared appearance, lifecycle and revision primitives. cytoscape-svg was
added to the app manifest and parent lockfile; the parent already contains other
unrelated changes and must not be staged wholesale. Publishing is scoped to the PureGraph submodule.
QA documents are retained under Pure/Drafts with timestamped PureGraph QA names;
permissions, viewport overrides, appearance preferences and tool hooks are restored.

Latest run: 85 tests in 16 files pass; standard and no-unused TypeScript checks
pass; production build passes. Browser workflow and all four Electron scripts
passed in the final verification cycle. The final loose-JSON-open fix additionally
passed its App regression test and the full suite/build. All seven planned phases
are implemented with the verification scope documented above.


## UI, palettes, and drawer follow-up

The sidebar now adapts from 320 to 400px, uses consistent form controls, and
keeps panel navigation beside the canvas. Default graph marks are compact with
external labels; edge labels are optional. Style includes a Diagram preset.

The category palette generator adapts PureChart color math locally (no sibling
runtime import), checking all pairs in normal vision and simulated protanopia,
deuteranopia and tritanopia, plus mark/background contrast. It has finite
capacity, previews replacements, and warns on overflow. Review audits actual
node colors, including explicit overrides. These checks are screening heuristics,
not an accessibility certification. Palette application persists and undoes as
one transaction; browser workflow and Electron narrow/desktop checks passed.

A recorded drawer session got stuck after a pending replacement: the tools had
no apply/discard route and the instructions mixed immediate and staged edits.
Context now exposes the pending proposal ID and impact. applyGraphProposal and
discardGraphProposal require that exact ID; stale IDs and stale document bases
are rejected. The instructions use one data/title/layout/style proposal followed
by apply, context verification, fit and save for user-authorized requests.
Preview-only requests remain pending. Existing manual Apply/Discard still work.

Verification: all 85 tests pass; typecheck and production build pass. The actual
Electron router -> iframe -> tool completion path verified pending context,
wrong-ID refusal, tool application, disk persistence, keyboard undo, and discard.
The model itself was not rerun; verification exercised the tools it uses.
The Vite chunk-size advisory remains. Shared suite settings dependency PR #634
was open at publication; no parent-suite changes are included here.


## Dedicated proposal review and new documents

Proposals now have a persistent notice outside the scrolling inspector and a
separate review dialog with current/proposed previews, impact, stale-edit refusal
and Apply/Discard actions. The drawer's createGraph tool validates complete input,
flushes outgoing work and opens a separate new graph. Fresh examples default to
this tool; proposals are for edits to the current document. Save failure preserves
the outgoing document. Validation: 89 tests pass, typecheck and build pass; actual
Electron transport verified creation and persistence in a different package with
the previous graph intact, plus the dedicated review flow at 1280px and 800px.
