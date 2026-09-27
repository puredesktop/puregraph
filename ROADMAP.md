# puregraph contribution roadmap

Build something you can see and try in the app. The first five items are **good first contributions**: bounded changes with a concrete demonstration. Choose a feature below, fix a bug, or propose your own improvement.

## Scope

Keep graph data, existing layouts and encodings, and the current proposal-before-apply workflow.

Size describes scope, not a promised completion time: **Small** = one focused interface change; **Medium** = coordinated interface/state work; **Large** = a feature across several flows, storage or export paths. All items are proposals, not claims that existing features are absent. Check the current code and extend what is there. Maintainers review code and tests before merging. Attribution is your choice.

## Good first contributions

1. **See how many nodes and edges are selected.** Show selected node and edge counts separately near bulk actions so users can understand the scope of a label or delete operation.
   <!-- contribution: {"id": "selected-element-count", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/selected-element-count.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/selected-element-count.md)

2. **See your place in a large data table.** Show the visible row range and filtered total beside Previous and Next in the node and edge tables.
   <!-- contribution: {"id": "data-table-pagination-context", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/data-table-pagination-context.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/data-table-pagination-context.md)

3. **Reset an empty graph search.** Offer a clear-query action when the data table has no matches, distinct from an actually empty graph.
   <!-- contribution: {"id": "search-empty-state-reset", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/search-empty-state-reset.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/search-empty-state-reset.md)

4. **Choose a layout by what it looks like.** Add a one-sentence explanation to each existing layout choice to help users choose between hierarchy, circular and force-based arrangements.
   <!-- contribution: {"id": "layout-descriptions", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/layout-descriptions.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/layout-descriptions.md)

5. **Tell identically named nodes apart.** Include a node's ID beside duplicate labels in node pickers so path and edge actions target the intended node.
   <!-- contribution: {"id": "node-picker-disambiguation", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/node-picker-disambiguation.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/node-picker-disambiguation.md)

## More improvements

6. **Find missing endpoints before importing edges.** For an edge referencing a missing node, report its row, source and target identifiers in the import preview before applying changes.
   <!-- contribution: {"id": "import-endpoint-diagnostics", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/import-endpoint-diagnostics.md"} -->
   [Medium · Implementation brief](docs/contributions/import-endpoint-diagnostics.md)

7. **Locate duplicate graph IDs.** Identify repeated node or edge IDs in an import with their row locations so users can repair the data without guessing.
   <!-- contribution: {"id": "duplicate-identifier-feedback", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/duplicate-identifier-feedback.md"} -->
   [Medium · Implementation brief](docs/contributions/duplicate-identifier-feedback.md)

8. **Preview table columns before graph import.** Show the detected CSV or TSV delimiter and parsed column headings before import, with a clear error when the table shape is inconsistent.
   <!-- contribution: {"id": "import-delimiter-preview", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/import-delimiter-preview.md"} -->
   [Medium · Implementation brief](docs/contributions/import-delimiter-preview.md)

9. **Choose a node with the keyboard.** Keep filtered options keyboard reachable, announce the result count and return focus predictably after a choice.
   <!-- contribution: {"id": "node-picker-keyboard-polish", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/node-picker-keyboard-polish.md"} -->
   [Medium · Implementation brief](docs/contributions/node-picker-keyboard-polish.md)

10. **See which edges deleting nodes will remove.** Before deleting selected nodes, show how many connected edges will also be removed through the existing operation.
   <!-- contribution: {"id": "deletion-impact-summary", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/deletion-impact-summary.md"} -->
   [Medium · Implementation brief](docs/contributions/deletion-impact-summary.md)

11. **See when a layout is still running.** Show when a layout is running and prevent repeated submissions of the same action until the current result is ready.
   <!-- contribution: {"id": "layout-progress-feedback", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/layout-progress-feedback.md"} -->
   [Medium · Implementation brief](docs/contributions/layout-progress-feedback.md)

12. **Read a complete node label.** Expose complete labels on focus or selection while keeping the current canvas label settings unchanged.
   <!-- contribution: {"id": "long-node-label-handling", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/long-node-label-handling.md"} -->
   [Small · Implementation brief](docs/contributions/long-node-label-handling.md)

13. **Understand directed edge arrows.** Clarify how arrowheads represent direction in the current style controls and exported legend when directed edges are shown.
   <!-- contribution: {"id": "edge-direction-legend", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/edge-direction-legend.md"} -->
   [Small · Implementation brief](docs/contributions/edge-direction-legend.md)

14. **See which nodes lack an encoding value.** Show how many elements lack the chosen encoding attribute and explain the fallback size or colour they will receive.
   <!-- contribution: {"id": "encoding-missing-value-summary", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/encoding-missing-value-summary.md"} -->
   [Medium · Implementation brief](docs/contributions/encoding-missing-value-summary.md)

15. **Preview category colours.** List the category-to-colour mapping before applying an existing categorical encoding so similar colours can be spotted early.
   <!-- contribution: {"id": "colour-mapping-preview", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/colour-mapping-preview.md"} -->
   [Medium · Implementation brief](docs/contributions/colour-mapping-preview.md)

16. **Understand a path search result.** Distinguish no connecting path from missing endpoints and include the start and end node names in the result message.
   <!-- contribution: {"id": "path-result-explanation", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/path-result-explanation.md"} -->
   [Medium · Implementation brief](docs/contributions/path-result-explanation.md)

17. **Inspect the nodes in a cycle.** After selecting a detected cycle, display its node count and a short ordered label list alongside the existing analysis result.
   <!-- contribution: {"id": "cycle-selection-feedback", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/cycle-selection-feedback.md"} -->
   [Medium · Implementation brief](docs/contributions/cycle-selection-feedback.md)

18. **Review node and edge changes separately.** Break the existing aggregate proposal counts into nodes and edges for additions, changes and removals, so graph restructuring is easier to review.
   <!-- contribution: {"id": "separate-node-and-edge-impact", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/separate-node-and-edge-impact.md"} -->
   [Medium · Implementation brief](docs/contributions/separate-node-and-edge-impact.md)

19. **Choose valid image export dimensions.** Explain invalid width or height values next to the relevant export field and show the supported bounds.
   <!-- contribution: {"id": "export-dimension-validation", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/export-dimension-validation.md"} -->
   [Small · Implementation brief](docs/contributions/export-dimension-validation.md)

20. **Know what an interactive export includes.** State what the existing HTML export preserves, including navigation behavior and embedded data, before saving the file.
   <!-- contribution: {"id": "interactive-export-guidance", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/interactive-export-guidance.md"} -->
   [Small · Implementation brief](docs/contributions/interactive-export-guidance.md)

21. **Compare two graph views side by side.** Show two existing saved graph views next to each other with linked node selection. Reuse saved view state and graph data; layout and zoom in one pane must not mutate the other saved view.
   <!-- contribution: {"id": "compare-two-graph-views-side-by-side", "size": "large", "goodFirstIssue": false, "guide": "docs/contributions/compare-two-graph-views-side-by-side.md"} -->
   [Large · Implementation brief](docs/contributions/compare-two-graph-views-side-by-side.md)

## References

- [Contribution brief index](docs/contributions/README.md)
- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Contributing](CONTRIBUTING.md)
