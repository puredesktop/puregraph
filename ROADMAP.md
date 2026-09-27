# puregraph roadmap

## Scope

Keep graph data, existing layouts and encodings, and the current proposal-before-apply workflow.

These are proposed, incremental improvements, not a release schedule or a list of missing core features. Keep each change small and preserve existing file formats, user data and app workflows.

## Improvements

1. **Import endpoint diagnostics.** For an edge referencing a missing node, report its row, source and target identifiers in the import preview before applying changes.

2. **Duplicate identifier feedback.** Identify repeated node or edge IDs in an import with their row locations so users can repair the data without guessing.

3. **Import delimiter preview.** Show the detected CSV or TSV delimiter and parsed column headings before import, with a clear error when the table shape is inconsistent.

4. **Node picker disambiguation.** Include a node's ID beside duplicate labels in node pickers so path and edge actions target the intended node.

5. **Node picker keyboard polish.** Keep filtered options keyboard reachable, announce the result count and return focus predictably after a choice.

6. **Selected element count.** Show selected node and edge counts separately near bulk actions so users can understand the scope of a label or delete operation.

7. **Deletion impact summary.** Before deleting selected nodes, show how many connected edges will also be removed through the existing operation.

8. **Data-table pagination context.** Show the visible row range and filtered total beside Previous and Next in the node and edge tables.

9. **Search empty-state reset.** Offer a clear-query action when the data table has no matches, distinct from an actually empty graph.

10. **Layout descriptions.** Add a one-sentence explanation to each existing layout choice to help users choose between hierarchy, circular and force-based arrangements.

11. **Layout progress feedback.** Show when a layout is running and prevent repeated submissions of the same action until the current result is ready.

12. **Long node label handling.** Expose complete labels on focus or selection while keeping the current canvas label settings unchanged.

13. **Edge direction legend.** Clarify how arrowheads represent direction in the current style controls and exported legend when directed edges are shown.

14. **Encoding missing-value summary.** Show how many elements lack the chosen encoding attribute and explain the fallback size or colour they will receive.

15. **Colour mapping preview.** List the category-to-colour mapping before applying an existing categorical encoding so similar colours can be spotted early.

16. **Path result explanation.** Distinguish no connecting path from missing endpoints and include the start and end node names in the result message.

17. **Cycle selection feedback.** After selecting a detected cycle, display its node count and a short ordered label list alongside the existing analysis result.

18. **Separate node and edge impact.** Break the existing aggregate proposal counts into nodes and edges for additions, changes and removals, so graph restructuring is easier to review.

19. **Export dimension validation.** Explain invalid width or height values next to the relevant export field and show the supported bounds.

20. **Interactive export guidance.** State what the existing HTML export preserves, including navigation behavior and embedded data, before saving the file.

## References

- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Current implementation](src/components/GraphWorkspace.tsx)
