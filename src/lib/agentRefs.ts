/**
 * Markup for the suite's agent activity layer: the refs an agent tool call names when it touches this item, so the
 * layer can mark it on screen. Refs are space-separated, so a value holding whitespace cannot be one and is left out.
 *
 * Nodes and relationships are drawn by Cytoscape on a <canvas>, so they cannot be tagged themselves; their DOM
 * stand-ins are the Data table rows, Explore's search matches and the selected element's details.
 */
export function agentRefs(
  refs: ReadonlyArray<string | null | undefined | false>,
  label?: string | null,
): { 'data-agent-ref': string; 'data-agent-label'?: string } {
  const tag = refs.filter((ref): ref is string => typeof ref === 'string' && ref !== '' && !/\s/.test(ref)).join(' ')
  return label ? { 'data-agent-ref': tag, 'data-agent-label': label } : { 'data-agent-ref': tag }
}

/**
 * A node or relationship. The bare id matches every argument that names it (id, source, target, start, end, ids[]),
 * and `id:` / `ids:` match queryGraph / exploreGraph answers.
 */
export function elementRefs(data: { id?: string; label?: unknown }): ReturnType<typeof agentRefs> {
  const id = data.id
  return agentRefs(id ? [id, `id:${id}`, `ids:${id}`] : [], String(data.label || id || '') || undefined)
}

/** A category, as queryGraph's category argument names it. */
export function categoryRefs(category: string): ReturnType<typeof agentRefs> {
  return agentRefs([`category:${category}`], category)
}

/** A saved view, as exploreGraph (viewId) and exportGraph (initialViewId) name it. */
export function viewRefs(view: { id: string; name?: string }): ReturnType<typeof agentRefs> {
  return agentRefs([view.id, `viewId:${view.id}`, `initialViewId:${view.id}`], view.name)
}

/** A pending proposal, as applyGraphProposal / discardGraphProposal name it. */
export function proposalRefs(proposal: { id: string; title?: string }): ReturnType<typeof agentRefs> {
  return agentRefs([proposal.id, `proposalId:${proposal.id}`], proposal.title)
}
