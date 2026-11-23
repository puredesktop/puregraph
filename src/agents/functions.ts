import {
  defineAppFunction,
  type AppFunctionDefinition,
} from '@purescience/platform-ui/bridge/appFunctions'
import { DEFAULT_EXPORT_OPTIONS } from '../canvas/graphExport'
import {
  SUPPORTED_CURVE_STYLES,
  SUPPORTED_LAYOUTS,
  SUPPORTED_NODE_SHAPES,
  type GraphCurveStyle,
  type GraphLayoutName,
  type GraphNodeShape,
} from '../constants'
import { prepareNewGraph } from '../lib/createGraph'
import {
  connectedComponents,
  cycleSelectionIds,
  findCycle,
  graphMetrics,
} from '../lib/graphAnalysis'
import {
  applyGraphCommands,
  isEdge,
  type GraphCommand,
} from '../lib/graphCommands'
import { defaultGraphDocument, type GraphDocument } from '../lib/graphDocument'
import { graphCategory } from '../lib/graphExplore'
import { graphPalettePlan, reviewGraphColors } from '../lib/graphPalette'
import type { GraphElement } from '../lib/graphParser'
import {
  GraphToolError,
  type GraphStyleState,
  type PureGraphAgentContext,
} from './context'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getTrimmedString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getPositiveInt(
  args: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = args[key]
  if (value === undefined) return fallback
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new GraphToolError(`${key} must be an integer between ${min} and ${max}.`)
  }
  return value
}

function parseJsonSafe(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function sanitizeStylePartial(
  raw: Record<string, unknown>,
): Partial<GraphStyleState> {
  const style: Partial<GraphStyleState> = {}
  if (typeof raw.backgroundColor === 'string' && raw.backgroundColor.trim()) {
    style.backgroundColor = raw.backgroundColor.trim()
  }
  if (typeof raw.nodeColor === 'string' && raw.nodeColor.trim()) {
    style.nodeColor = raw.nodeColor.trim()
  }
  if (typeof raw.edgeColor === 'string' && raw.edgeColor.trim()) {
    style.edgeColor = raw.edgeColor.trim()
  }
  if (raw.nodeShape !== undefined) {
    if (
      typeof raw.nodeShape !== 'string' ||
      !SUPPORTED_NODE_SHAPES.includes(raw.nodeShape as GraphNodeShape)
    ) {
      throw new GraphToolError(
        `nodeShape must be one of ${SUPPORTED_NODE_SHAPES.join(', ')}.`,
      )
    }
    style.nodeShape = raw.nodeShape as GraphNodeShape
  }
  if (raw.curveStyle !== undefined) {
    if (
      typeof raw.curveStyle !== 'string' ||
      !SUPPORTED_CURVE_STYLES.includes(raw.curveStyle as GraphCurveStyle)
    ) {
      throw new GraphToolError(
        `curveStyle must be one of ${SUPPORTED_CURVE_STYLES.join(', ')}.`,
      )
    }
    style.curveStyle = raw.curveStyle as GraphCurveStyle
  }
  if (typeof raw.nodeSize === 'number' && Number.isFinite(raw.nodeSize)) {
    style.nodeSize = raw.nodeSize
  }
  if (typeof raw.edgeWidth === 'number' && Number.isFinite(raw.edgeWidth)) {
    style.edgeWidth = raw.edgeWidth
  }
  if (typeof raw.labelSize === 'number' && Number.isFinite(raw.labelSize)) {
    style.labelSize = raw.labelSize
  }
  if (typeof raw.showLabels === 'boolean') style.showLabels = raw.showLabels
  if (typeof raw.directed === 'boolean') style.directed = raw.directed
  if (typeof raw.showEdgeLabels === 'boolean') {
    style.showEdgeLabels = raw.showEdgeLabels
  }
  if (typeof raw.showLegend === 'boolean') style.showLegend = raw.showLegend
  if (raw.labelPlacement === 'inside' || raw.labelPlacement === 'outside') {
    style.labelPlacement = raw.labelPlacement
  }
  if (isPlainObject(raw.categoryColors)) {
    style.categoryColors = Object.fromEntries(
      Object.entries(raw.categoryColors).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  }
  return style
}

/**
 * Retrieve the full uncapped document when `ctx.getDocument` is available,
 * otherwise reconstruct it cleanly by paging `ctx.queryGraph` + `ctx.getContext`.
 */
function readFullDocument(ctx: PureGraphAgentContext): GraphDocument {
  if (ctx.getDocument) return ctx.getDocument()
  const summary = ctx.getContext()
  const elements: GraphElement[] = []
  let offset = 0
  while (true) {
    const page = ctx.queryGraph({ kind: 'all', offset, limit: 200 })
    elements.push(...page.elements)
    if (page.nextOffset === null || page.elements.length === 0) break
    offset = page.nextOffset
  }
  return {
    ...defaultGraphDocument(),
    title: summary.title,
    layout: summary.layout,
    style: summary.style,
    elements,
  }
}

async function resolvePendingProposalForWrite(
  ctx: PureGraphAgentContext,
  discardExisting: boolean,
): Promise<string | null> {
  const pending = ctx.getContext().pendingProposal
  if (!pending) return null
  if (!discardExisting) {
    throw new GraphToolError(
      `Pending proposal "${pending.id}" ("${pending.title}") must be resolved first. Apply it with applyGraphProposal, discard it via discardGraphProposal, or re-call with discardExistingProposal: true if it is obsolete.`,
    )
  }
  await ctx.discardGraphProposal(pending.id)
  return pending.id
}

function summarizeElement(el: GraphElement): Record<string, unknown> {
  const edge = isEdge(el)
  return {
    id: el.data.id,
    kind: edge ? 'edge' : 'node',
    label: el.data.label ?? (edge ? null : el.data.id),
    ...(edge ? { source: el.data.source, target: el.data.target } : {}),
    category: edge ? undefined : graphCategory(el),
    data: el.data,
    ...(el.position ? { position: el.position } : {}),
  }
}

// ── 1. fn_inspectGraphHealth ─────────────────────────────────────────────────

export const fnInspectGraphHealth: AppFunctionDefinition<PureGraphAgentContext> =
  defineAppFunction<PureGraphAgentContext>({
    name: 'fn_inspectGraphHealth',
    category: 'analysis',
    risk: 'read',
    requiresApproval: false,
    replaces: ['getGraphContext', 'queryGraph', 'analyzeGraph'],
    description:
      'Audit the current graph in one read-only call: exact counts, density, average degree, top hubs, isolated nodes, weakly connected components, cycle detection, category breakdown, WCAG/color-blind contrast warnings, and provenance/confidence/synthetic coverage. Replaces repeated getGraphContext + queryGraph + analyzeGraph calls.',
    inputSchema: {
      type: 'object',
      properties: {
        directed: { type: 'boolean' },
        category: { type: 'string' },
        topHubsLimit: { type: 'integer', minimum: 1, maximum: 50 },
        includeIsolatedIds: { type: 'boolean' },
        includeEvidenceAudit: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const context = ctx.getContext()
      const doc = readFullDocument(ctx)
      const directed =
        typeof args.directed === 'boolean'
          ? args.directed
          : Boolean(doc.style.directed)
      const categoryFilter = getTrimmedString(args, 'category')
      const topHubsLimit = getPositiveInt(args, 'topHubsLimit', 8, 1, 50)
      const includeIsolatedIds = args.includeIsolatedIds !== false
      const includeEvidenceAudit = args.includeEvidenceAudit !== false

      let scopedElements = doc.elements
      if (categoryFilter) {
        const matchedNodes = doc.elements.filter(
          el => !isEdge(el) && graphCategory(el) === categoryFilter,
        )
        const nodeIdSet = new Set(matchedNodes.map(n => n.data.id!))
        const internalEdges = doc.elements.filter(
          el =>
            isEdge(el) &&
            nodeIdSet.has(el.data.source!) &&
            nodeIdSet.has(el.data.target!),
        )
        scopedElements = [...matchedNodes, ...internalEdges]
      }

      const nodes = scopedElements.filter(el => !isEdge(el))
      const edges = scopedElements.filter(isEdge)
      const metrics = graphMetrics(scopedElements, directed)
      const components = connectedComponents(scopedElements).sort(
        (a, b) => b.length - a.length,
      )
      const cycle = findCycle(scopedElements, directed)
      const cycleIds = cycle
        ? cycleSelectionIds(scopedElements, cycle, directed)
        : []

      // Expand hub list up to topHubsLimit deterministically
      const degreeMap = new Map<
        string,
        { id: string; label: string; category: string; inDegree: number; outDegree: number }
      >()
      for (const node of nodes) {
        const id = node.data.id!
        degreeMap.set(id, {
          id,
          label: String(node.data.label || id),
          category: graphCategory(node),
          inDegree: 0,
          outDegree: 0,
        })
      }
      for (const edge of edges) {
        const src = degreeMap.get(edge.data.source!)
        const tgt = degreeMap.get(edge.data.target!)
        if (src) src.outDegree += 1
        if (tgt) tgt.inDegree += 1
      }
      const topHubs = [...degreeMap.values()]
        .map(entry => ({
          ...entry,
          degree: entry.inDegree + entry.outDegree,
        }))
        .filter(entry => entry.degree > 0)
        .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id))
        .slice(0, topHubsLimit)

      // Category breakdown
      const categoryCounts = new Map<string, number>()
      for (const node of nodes) {
        const cat = graphCategory(node)
        categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1)
      }
      const categories = [...categoryCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, count]) => ({
          name,
          nodeCount: count,
          color: doc.style.categoryColors?.[name] ?? null,
        }))

      // Accessibility & contrast warnings on the live document
      const colorWarnings = reviewGraphColors(doc)

      // Evidence & provenance coverage
      let evidenceAudit: Record<string, unknown> | undefined
      if (includeEvidenceAudit) {
        let syntheticCount = 0
        let withSourceUrl = 0
        let withProvenance = 0
        let withDate = 0
        let withConfidence = 0
        let withNotes = 0
        const unattributedNodeIds: string[] = []
        const lowConfidenceNodeIds: Array<{ id: string; confidence: number }> = []

        for (const el of scopedElements) {
          const data = el.data as Record<string, unknown>
          if (data.synthetic === true) syntheticCount += 1
          const hasSourceUrl =
            typeof data.sourceUrl === 'string' && data.sourceUrl.trim().length > 0
          const hasProvenance =
            typeof data.provenance === 'string' &&
            data.provenance.trim().length > 0
          if (hasSourceUrl) withSourceUrl += 1
          if (hasProvenance) withProvenance += 1
          if (typeof data.date === 'string' && data.date.trim().length > 0) {
            withDate += 1
          }
          if (typeof data.notes === 'string' && data.notes.trim().length > 0) {
            withNotes += 1
          }
          if (
            typeof data.confidence === 'number' &&
            Number.isFinite(data.confidence)
          ) {
            withConfidence += 1
            if (!isEdge(el) && data.confidence < 0.5 && lowConfidenceNodeIds.length < 25) {
              lowConfidenceNodeIds.push({
                id: el.data.id!,
                confidence: data.confidence,
              })
            }
          }
          if (
            !isEdge(el) &&
            !hasSourceUrl &&
            !hasProvenance &&
            data.synthetic !== true &&
            unattributedNodeIds.length < 25
          ) {
            unattributedNodeIds.push(el.data.id!)
          }
        }
        evidenceAudit = {
          totalElements: scopedElements.length,
          syntheticCount,
          withSourceUrl,
          withProvenance,
          withDate,
          withConfidence,
          withNotes,
          unattributedNodeSample: unattributedNodeIds,
          lowConfidenceNodes: lowConfidenceNodeIds,
        }
      }

      const scopeLabel = categoryFilter ? ` (category "${categoryFilter}")` : ''
      const summary = `Audited "${doc.title}"${scopeLabel}: ${metrics.nodeCount} nodes, ${metrics.edgeCount} edges, ${components.length} component${components.length === 1 ? '' : 's'}, ${metrics.isolatedNodeIds.length} isolated, ${cycle ? 'cycle detected' : 'acyclic'}, ${colorWarnings.length} color warning${colorWarnings.length === 1 ? '' : 's'}.`

      return {
        summary,
        mutated: false,
        data: {
          title: doc.title,
          documentPath: context.documentPath,
          layout: doc.layout,
          directed,
          categoryFilter: categoryFilter ?? null,
          pendingProposal: context.pendingProposal ?? null,
          selectedIds: context.selectedIds,
          savedViewsCount: doc.views?.length ?? context.views?.length ?? 0,
          savedViews:
            doc.views?.map(({ id, name, caption }) => ({ id, name, caption })) ??
            context.views ??
            [],
          encodingsCount: doc.encodings?.length ?? 0,
          metrics: {
            nodeCount: metrics.nodeCount,
            edgeCount: metrics.edgeCount,
            density: Number(metrics.density.toFixed(4)),
            averageDegree: Number(metrics.averageDegree.toFixed(3)),
            selfLoopCount: metrics.selfLoopCount,
            isolatedCount: metrics.isolatedNodeIds.length,
            ...(includeIsolatedIds
              ? { isolatedNodeIds: metrics.isolatedNodeIds.slice(0, 50) }
              : {}),
          },
          topHubs,
          components: {
            count: components.length,
            largestSize: components[0]?.length ?? 0,
            smallestSize: components.at(-1)?.length ?? 0,
            breakdown: components.slice(0, 20).map((ids, index) => ({
              rank: index + 1,
              size: ids.length,
              sampleIds: ids.slice(0, 10),
            })),
          },
          cycle: cycle
            ? {
                detected: true,
                nodeSequence: cycle,
                selectionIds: cycleIds,
              }
            : { detected: false, nodeSequence: [], selectionIds: [] },
          categories,
          colorAudit: {
            warningCount: colorWarnings.length,
            warnings: colorWarnings,
          },
          ...(evidenceAudit ? { evidenceAudit } : {}),
        },
      }
    },
  })

// ── 2. fn_traceAndFocusSubgraph ──────────────────────────────────────────────

export const fnTraceAndFocusSubgraph: AppFunctionDefinition<PureGraphAgentContext> =
  defineAppFunction<PureGraphAgentContext>({
    name: 'fn_traceAndFocusSubgraph',
    category: 'exploration',
    risk: 'read',
    requiresApproval: false,
    replaces: ['analyzeGraph', 'queryGraph', 'exploreGraph', 'fit'],
    description:
      'Call getGraphContext first to inspect node IDs. Compute a grounded subgraph (shortest path, k-hop neighborhood, connected component, cycle, or query), hydrate node/edge attributes, apply canvas viewAction (focus/select/exclude/none), and fit viewport in one read-only call. Use mode "reset" to clear exploration filters.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['path', 'neighborhood', 'component', 'query', 'cycle', 'reset'],
        },
        start: { type: 'string' },
        end: { type: 'string' },
        directed: { type: 'boolean' },
        depth: { type: 'integer', minimum: 1, maximum: 10 },
        direction: { type: 'string', enum: ['incoming', 'outgoing', 'both'] },
        componentIndex: { type: 'integer', minimum: 0 },
        query: { type: 'string' },
        category: { type: 'string' },
        kind: { type: 'string', enum: ['nodes', 'edges', 'all'] },
        ids: { type: 'array', items: { type: 'string' } },
        viewAction: { type: 'string', enum: ['focus', 'select', 'exclude', 'none'] },
        fit: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      required: ['mode'],
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const mode = getTrimmedString(args, 'mode')
      if (
        !mode ||
        !['path', 'neighborhood', 'component', 'query', 'cycle', 'reset'].includes(
          mode,
        )
      ) {
        throw new GraphToolError(
          'mode must be one of path, neighborhood, component, query, cycle, or reset.',
        )
      }

      if (mode === 'reset') {
        const message = ctx.exploreGraph({ action: 'reset' })
        const shouldFit = args.fit !== false
        if (shouldFit) ctx.fit()
        return {
          summary: shouldFit
            ? 'Reset exploration view and fitted full graph.'
            : 'Reset exploration view.',
          mutated: false,
          data: {
            mode: 'reset',
            viewAction: 'reset',
            fitted: shouldFit,
            message,
          },
        }
      }

      const viewActionRaw = getTrimmedString(args, 'viewAction') ?? 'focus'
      if (!['focus', 'select', 'exclude', 'none'].includes(viewActionRaw)) {
        throw new GraphToolError(
          'viewAction must be one of focus, select, exclude, or none.',
        )
      }
      const viewAction = viewActionRaw as 'focus' | 'select' | 'exclude' | 'none'
      const limit = getPositiveInt(args, 'limit', 100, 1, 200)
      const doc = readFullDocument(ctx)
      const directed =
        typeof args.directed === 'boolean'
          ? args.directed
          : Boolean(doc.style.directed)

      let matchedIds: string[] = []
      let modeMeta: Record<string, unknown> = {}

      if (mode === 'path') {
        const start = getTrimmedString(args, 'start')
        const end = getTrimmedString(args, 'end')
        if (!start || !end) {
          throw new GraphToolError('Mode "path" requires both start and end node IDs.')
        }
        const result = ctx.analyzeGraph({
          operation: 'path',
          start,
          end,
          directed,
        }) as { path: { nodes: string[]; edges: string[] } | null }
        if (!result.path) {
          return {
            summary: `No ${directed ? 'directed' : 'undirected'} route found between "${start}" and "${end}".`,
            mutated: false,
            data: {
              mode: 'path',
              found: false,
              directed,
              start,
              end,
              matchedIds: [],
              nodes: [],
              edges: [],
              viewAction: 'none',
              fitted: false,
            },
          }
        }
        matchedIds = [...result.path.nodes, ...result.path.edges]
        modeMeta = {
          directed,
          start,
          end,
          hopCount: result.path.edges.length,
          nodeSequence: result.path.nodes,
          edgeSequence: result.path.edges,
        }
      } else if (mode === 'neighborhood') {
        const start = getTrimmedString(args, 'start')
        if (!start) {
          throw new GraphToolError('Mode "neighborhood" requires a start node ID.')
        }
        const depth = getPositiveInt(args, 'depth', 1, 1, 10)
        const directionRaw = getTrimmedString(args, 'direction') ?? 'both'
        if (!['incoming', 'outgoing', 'both'].includes(directionRaw)) {
          throw new GraphToolError(
            'direction must be incoming, outgoing, or both.',
          )
        }
        const result = ctx.analyzeGraph({
          operation: 'neighborhood',
          start,
          depth,
          direction: directionRaw as 'incoming' | 'outgoing' | 'both',
        }) as { ids: string[] }
        matchedIds = result.ids
        modeMeta = { start, depth, direction: directionRaw }
      } else if (mode === 'component') {
        const start = getTrimmedString(args, 'start')
        const result = ctx.analyzeGraph({ operation: 'components' }) as {
          components: string[][]
        }
        const sorted = [...result.components].sort((a, b) => b.length - a.length)
        let chosen: string[] | undefined
        let rank = -1
        if (start) {
          rank = sorted.findIndex(comp => comp.includes(start))
          if (rank === -1) {
            throw new GraphToolError(`Node "${start}" was not found in any component.`)
          }
          chosen = sorted[rank]
        } else {
          const index = getPositiveInt(
            args,
            'componentIndex',
            0,
            0,
            Math.max(0, sorted.length - 1),
          )
          chosen = sorted[index]
          rank = chosen ? index : -1
        }
        const nodeSet = new Set(chosen ?? [])
        const internalEdgeIds = doc.elements
          .filter(
            el =>
              isEdge(el) &&
              nodeSet.has(el.data.source!) &&
              nodeSet.has(el.data.target!),
          )
          .map(el => el.data.id!)
        matchedIds = [...nodeSet, ...internalEdgeIds]
        modeMeta = {
          componentRank: rank >= 0 ? rank + 1 : null,
          totalComponents: sorted.length,
          componentNodeCount: nodeSet.size,
        }
      } else if (mode === 'cycle') {
        const cycle = findCycle(doc.elements, directed)
        if (!cycle) {
          return {
            summary: `No ${directed ? 'directed' : 'undirected'} cycle found in "${doc.title}".`,
            mutated: false,
            data: {
              mode: 'cycle',
              found: false,
              directed,
              matchedIds: [],
              nodes: [],
              edges: [],
              viewAction: 'none',
              fitted: false,
            },
          }
        }
        matchedIds = cycleSelectionIds(doc.elements, cycle, directed)
        modeMeta = { directed, nodeSequence: cycle }
      } else if (mode === 'query') {
        const kindRaw = getTrimmedString(args, 'kind')
        if (kindRaw && !['nodes', 'edges', 'all'].includes(kindRaw)) {
          throw new GraphToolError('kind must be nodes, edges, or all.')
        }
        const idsArg = Array.isArray(args.ids)
          ? args.ids.filter((id): id is string => typeof id === 'string')
          : undefined
        const page = ctx.queryGraph({
          query: getTrimmedString(args, 'query'),
          category: getTrimmedString(args, 'category'),
          kind: (kindRaw as 'nodes' | 'edges' | 'all' | undefined) ?? 'all',
          ids: idsArg,
          offset: 0,
          limit,
        })
        const matchedNodes = page.elements.filter(el => !isEdge(el))
        const matchedEdges = page.elements.filter(isEdge)
        const idSet = new Set(page.elements.map(el => el.data.id!))
        // Include internal edges connecting matched nodes when querying nodes/all
        if (kindRaw !== 'edges' && matchedNodes.length > 1) {
          const nodeIds = new Set(matchedNodes.map(n => n.data.id!))
          for (const el of doc.elements) {
            if (
              isEdge(el) &&
              nodeIds.has(el.data.source!) &&
              nodeIds.has(el.data.target!)
            ) {
              idSet.add(el.data.id!)
            }
          }
        }
        matchedIds = [...idSet]
        modeMeta = {
          totalMatchedBeforeCap: page.total,
          nextOffset: page.nextOffset,
          matchedDirectEdges: matchedEdges.length,
        }
      }

      const uniqueIds = [...new Set(matchedIds)]
      const idLookup = new Set(uniqueIds)
      const hydrated = doc.elements
        .filter(el => idLookup.has(el.data.id!))
        .slice(0, limit)
      const hydratedNodes = hydrated
        .filter(el => !isEdge(el))
        .map(summarizeElement)
      const hydratedEdges = hydrated.filter(isEdge).map(summarizeElement)

      let exploreMessage: string | null = null
      let fitted = false
      if (uniqueIds.length > 0 && viewAction !== 'none') {
        exploreMessage = ctx.exploreGraph({
          action: viewAction,
          ids: uniqueIds,
        })
        if (args.fit !== false) {
          ctx.fit()
          fitted = true
        }
      }

      const summary =
        uniqueIds.length > 0
          ? `Traced ${mode} subgraph (${hydratedNodes.length} nodes, ${hydratedEdges.length} edges${uniqueIds.length > hydrated.length ? ` shown of ${uniqueIds.length} matched` : ''})${viewAction !== 'none' ? ` and applied ${viewAction}${fitted ? ' + fit' : ''}` : ''}.`
          : `No elements matched ${mode} query.`

      return {
        summary,
        mutated: false,
        data: {
          mode,
          found: uniqueIds.length > 0,
          ...modeMeta,
          matchedIdCount: uniqueIds.length,
          matchedIds: uniqueIds.slice(0, limit),
          viewAction: uniqueIds.length > 0 ? viewAction : 'none',
          exploreMessage,
          fitted,
          nodes: hydratedNodes,
          edges: hydratedEdges,
        },
      }
    },
  })

// ── 3. fn_buildAndSaveGraph ──────────────────────────────────────────────────

export const fnBuildAndSaveGraph: AppFunctionDefinition<PureGraphAgentContext> =
  defineAppFunction<PureGraphAgentContext>({
    name: 'fn_buildAndSaveGraph',
    category: 'documents',
    risk: 'write',
    requiresApproval: true,
    replaces: ['createGraph', 'applyGraphPalette', 'getGraphContext', 'fit', 'saveGraph'],
    description:
      'Create and open a NEW graph document from complete nodes and edges (preserving the current graph), optionally apply a measured color-blind-safe category palette (autoPalette), fit viewport, save the .graph package, and return verified counts and artifactPath in one call.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        elements: { type: 'array', items: { type: 'object', required: ['data'] } },
        layout: {
          type: 'string',
          enum: ['cose', 'grid', 'circle', 'concentric', 'breadthfirst', 'preset'],
        },
        style: { type: 'object' },
        synthetic: { type: 'boolean' },
        autoPalette: { type: 'boolean' },
        fit: { type: 'boolean' },
        save: { type: 'boolean' },
      },
      required: ['title', 'elements'],
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      let doc = prepareNewGraph(args)
      let appliedPalette: Record<string, unknown> | null = null

      if (args.autoPalette === true && doc.elements.some(el => !isEdge(el))) {
        const plan = graphPalettePlan(doc)
        doc = applyGraphCommands(doc, plan.commands)
        appliedPalette = {
          categoryCount: plan.groups.length,
          categoryColors: plan.categoryColors,
          overflow: plan.overflow,
        }
      }

      const colorWarnings = reviewGraphColors(doc)
      const createRaw = await ctx.createGraph(doc)
      const createResult = parseJsonSafe(createRaw)

      const shouldFit = args.fit !== false
      if (shouldFit) ctx.fit()

      let artifactPath: string | null = null
      const shouldSave = args.save !== false
      if (shouldSave) {
        artifactPath = await ctx.saveGraph()
      }

      const verified = ctx.getContext()
      const expectedNodes = doc.elements.filter(el => !isEdge(el)).length
      const expectedEdges = doc.elements.filter(isEdge).length

      const summary = `Created "${doc.title}" (${expectedNodes} nodes, ${expectedEdges} edges, layout ${doc.layout})${appliedPalette ? ' with measured palette' : ''}${artifactPath ? ` and saved to ${artifactPath}` : ''}.`

      return {
        summary,
        mutated: true,
        data: {
          status: 'created',
          title: doc.title,
          layout: doc.layout,
          synthetic: args.synthetic === true,
          nodeCount: expectedNodes,
          edgeCount: expectedEdges,
          fitted: shouldFit,
          saved: shouldSave,
          artifactPath,
          documentPath: verified.documentPath ?? artifactPath,
          appliedPalette,
          colorWarnings,
          createResult,
          verifiedContext: {
            title: verified.title,
            nodeCount: verified.nodeCount,
            edgeCount: verified.edgeCount,
            layout: verified.layout,
            documentPath: verified.documentPath,
          },
        },
      }
    },
  })

// ── 4. fn_editGraphAndApply ──────────────────────────────────────────────────

export const fnEditGraphAndApply: AppFunctionDefinition<PureGraphAgentContext> =
  defineAppFunction<PureGraphAgentContext>({
    name: 'fn_editGraphAndApply',
    category: 'editing',
    risk: 'write',
    requiresApproval: true,
    riskWhen: { allowDestructiveCommands: 'destructive' },
    replaces: [
      'discardGraphProposal',
      'proposeGraph',
      'applyGraphProposal',
      'fit',
      'saveGraph',
      'getGraphContext',
    ],
    description:
      'Stage a validated proposeGraph command batch on the current graph (optionally discarding an obsolete pending proposal), apply atomically as one undoable edit (or leave pending when previewOnly is true), fit viewport, save the .graph package, and return verified counts. Destructive replace/remove commands require allowDestructiveCommands: true.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        commands: {
          type: 'array',
          minItems: 1,
          maxItems: 1000,
          items: { type: 'object', required: ['type'] },
        },
        previewOnly: { type: 'boolean' },
        discardExistingProposal: { type: 'boolean' },
        allowDestructiveCommands: { type: 'boolean' },
        fit: { type: 'boolean' },
        save: { type: 'boolean' },
      },
      required: ['title', 'commands'],
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const title = getTrimmedString(args, 'title')
      if (!title) {
        throw new GraphToolError('Provide a non-empty title for this graph edit.')
      }
      if (!Array.isArray(args.commands) || args.commands.length === 0) {
        throw new GraphToolError('Provide at least one graph command.')
      }
      const commands = args.commands as GraphCommand[]
      const hasDestructive = commands.some(
        cmd => cmd && (cmd.type === 'replace' || cmd.type === 'remove'),
      )
      if (hasDestructive && args.allowDestructiveCommands !== true) {
        throw new GraphToolError(
          'Commands include destructive "replace" or "remove" operations. Re-call fn_editGraphAndApply with allowDestructiveCommands: true after confirming with the user.',
        )
      }

      const discardedProposalId = await resolvePendingProposalForWrite(
        ctx,
        args.discardExistingProposal === true,
      )

      const proposedRaw = await ctx.proposeGraph(title, commands)
      const proposed = parseJsonSafe(proposedRaw)
      const proposalId =
        typeof proposed?.proposalId === 'string'
          ? proposed.proposalId
          : ctx.getContext().pendingProposal?.id
      if (!proposalId) {
        throw new GraphToolError(
          'Proposal was staged without returning a proposalId.',
        )
      }

      if (args.previewOnly === true) {
        return {
          summary: `Staged preview proposal "${title}" (${proposalId}) without applying.`,
          mutated: false,
          data: {
            status: 'pending',
            applied: false,
            proposalId,
            title,
            discardedProposalId,
            impact: proposed?.impact ?? null,
          },
        }
      }

      await ctx.applyGraphProposal(proposalId)

      const shouldFit = args.fit !== false
      if (shouldFit) ctx.fit()

      let artifactPath: string | null = null
      const shouldSave = args.save !== false
      if (shouldSave) {
        artifactPath = await ctx.saveGraph()
      }

      const verified = ctx.getContext()
      const summary = `Applied "${title}" (${commands.length} command${commands.length === 1 ? '' : 's'}) to "${verified.title}" (${verified.nodeCount} nodes, ${verified.edgeCount} edges)${artifactPath ? ` and saved to ${artifactPath}` : ''}.`

      return {
        summary,
        mutated: true,
        data: {
          status: 'applied',
          applied: true,
          proposalId,
          title,
          discardedProposalId,
          commandCount: commands.length,
          impact: proposed?.impact ?? null,
          fitted: shouldFit,
          saved: shouldSave,
          artifactPath,
          verifiedContext: {
            title: verified.title,
            documentPath: verified.documentPath,
            nodeCount: verified.nodeCount,
            edgeCount: verified.edgeCount,
            layout: verified.layout,
          },
        },
      }
    },
  })

// ── 5. fn_polishAndExportGraph ───────────────────────────────────────────────

export const fnPolishAndExportGraph: AppFunctionDefinition<PureGraphAgentContext> =
  defineAppFunction<PureGraphAgentContext>({
    name: 'fn_polishAndExportGraph',
    category: 'export',
    risk: 'write',
    requiresApproval: true,
    replaces: [
      'applyGraphPalette',
      'runLayout',
      'setStyle',
      'applyGraphProposal',
      'saveGraphView',
      'fit',
      'saveGraph',
      'exportGraph',
    ],
    description:
      'Polish and deliver the current graph in one call: optionally apply a measured category palette (autoPalette), layout, and style overrides (or previewOnly), save a named exploration view, fit viewport, save the .graph package, and export deliverables (html, svg, png, or json).',
    inputSchema: {
      type: 'object',
      properties: {
        autoPalette: { type: 'boolean' },
        layout: {
          type: 'string',
          enum: ['cose', 'grid', 'circle', 'concentric', 'breadthfirst', 'preset'],
        },
        direction: { type: 'string', enum: ['down', 'right'] },
        style: { type: 'object' },
        previewOnly: { type: 'boolean' },
        discardExistingProposal: { type: 'boolean' },
        saveView: {
          type: 'object',
          properties: { name: { type: 'string' }, caption: { type: 'string' } },
          required: ['name'],
          additionalProperties: false,
        },
        fit: { type: 'boolean' },
        save: { type: 'boolean' },
        exports: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              format: { type: 'string', enum: ['html', 'svg', 'png', 'json'] },
              filename: { type: 'string' },
              scope: { type: 'string', enum: ['all', 'view', 'selected'] },
              attributeKeys: { type: 'array', items: { type: 'string' } },
              includeViews: { type: 'boolean' },
              initialViewId: { type: 'string' },
            },
            required: ['format'],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const doc = readFullDocument(ctx)
      const polishCommands: GraphCommand[] = []
      const polishSteps: string[] = []

      if (args.autoPalette === true && doc.elements.some(el => !isEdge(el))) {
        const plan = graphPalettePlan(doc)
        polishCommands.push(...plan.commands)
        polishSteps.push(`measured palette (${plan.groups.length} categories)`)
      }

      if (args.style !== undefined) {
        if (!isPlainObject(args.style)) {
          throw new GraphToolError('style must be an object.')
        }
        const style = sanitizeStylePartial(args.style)
        if (Object.keys(style).length > 0) {
          polishCommands.push({ type: 'style', style })
          polishSteps.push('style overrides')
        }
      }

      if (args.layout !== undefined) {
        if (
          typeof args.layout !== 'string' ||
          !SUPPORTED_LAYOUTS.includes(args.layout as GraphLayoutName)
        ) {
          throw new GraphToolError(
            `layout must be one of ${SUPPORTED_LAYOUTS.join(', ')}.`,
          )
        }
        const direction = getTrimmedString(args, 'direction')
        if (direction && direction !== 'down' && direction !== 'right') {
          throw new GraphToolError('direction must be "down" or "right".')
        }
        polishCommands.push({
          type: 'layout',
          name: args.layout as GraphLayoutName,
          ...(direction ? { direction: direction as 'down' | 'right' } : {}),
        })
        polishSteps.push(`${args.layout} layout`)
      }

      const rawExports = args.exports
      if (rawExports !== undefined && !Array.isArray(rawExports)) {
        throw new GraphToolError('exports must be an array of export specifications.')
      }
      const exportSpecs = (rawExports ?? []).map((spec, index) => {
        if (!isPlainObject(spec)) {
          throw new GraphToolError(`exports[${index}] must be an object.`)
        }
        const rawFormat = getTrimmedString(spec, 'format')
        if (
          rawFormat !== 'png' &&
          rawFormat !== 'svg' &&
          rawFormat !== 'json' &&
          rawFormat !== 'html'
        ) {
          throw new GraphToolError(
            `exports[${index}].format must be png, svg, json, or html.`,
          )
        }
        const format: 'png' | 'svg' | 'json' | 'html' = rawFormat
        const scope: 'all' | 'view' | 'selected' =
          spec.scope === 'view'
            ? 'view'
            : spec.scope === 'selected'
              ? 'selected'
              : 'all'
        return {
          format,
          filename: getTrimmedString(spec, 'filename'),
          scope,
          attributeKeys: Array.isArray(spec.attributeKeys)
            ? spec.attributeKeys.filter(
                (key): key is string => typeof key === 'string',
              )
            : [],
          includeViews: spec.includeViews !== false,
          initialViewId: getTrimmedString(spec, 'initialViewId'),
        }
      })

      let saveViewInput: { name: string; caption: string } | null = null
      if (args.saveView !== undefined) {
        if (
          !isPlainObject(args.saveView) ||
          typeof args.saveView.name !== 'string' ||
          !args.saveView.name.trim()
        ) {
          throw new GraphToolError('saveView requires a non-empty name string.')
        }
        saveViewInput = {
          name: args.saveView.name.trim(),
          caption:
            typeof args.saveView.caption === 'string'
              ? args.saveView.caption
              : '',
        }
      }

      let proposalId: string | null = null
      let discardedProposalId: string | null = null
      let appliedPolish = false
      let postPolishDoc = doc

      if (polishCommands.length > 0) {
        discardedProposalId = await resolvePendingProposalForWrite(
          ctx,
          args.discardExistingProposal === true,
        )
        const proposalTitle = `Polish graph (${polishSteps.join(', ')})`
        const proposedRaw = await ctx.proposeGraph(proposalTitle, polishCommands)
        const proposed = parseJsonSafe(proposedRaw)
        proposalId =
          typeof proposed?.proposalId === 'string'
            ? proposed.proposalId
            : ctx.getContext().pendingProposal?.id ?? null
        if (!proposalId) {
          throw new GraphToolError(
            'Polish proposal was staged without returning a proposalId.',
          )
        }
        if (args.previewOnly === true) {
          return {
            summary: `Staged polish preview (${polishSteps.join(', ')}) as proposal ${proposalId}.`,
            mutated: false,
            data: {
              status: 'pending',
              appliedPolish: false,
              proposalId,
              discardedProposalId,
              polishSteps,
              impact: proposed?.impact ?? null,
            },
          }
        }
        await ctx.applyGraphProposal(proposalId)
        appliedPolish = true
        postPolishDoc = applyGraphCommands(doc, polishCommands)
      }

      let savedViewMessage: string | null = null
      if (saveViewInput) {
        savedViewMessage = ctx.saveGraphView(
          saveViewInput.name,
          saveViewInput.caption,
        )
      }

      const shouldFit = args.fit !== false
      if (shouldFit) ctx.fit()

      let artifactPath: string | null = null
      const shouldSave = args.save !== false
      if (shouldSave) {
        artifactPath = await ctx.saveGraph()
      }

      const exportResults: Array<{
        format: 'html' | 'svg' | 'png' | 'json'
        scope: 'all' | 'view' | 'selected'
        result: string
      }> = []
      for (const spec of exportSpecs) {
        const result = await ctx.exportGraph({
          format: spec.format,
          filename: spec.filename,
          options: {
            ...DEFAULT_EXPORT_OPTIONS,
            scope: spec.scope,
            html: {
              attributeKeys: spec.attributeKeys,
              includeViews: spec.includeViews,
              initialViewId: spec.initialViewId,
            },
          },
        })
        exportResults.push({
          format: spec.format,
          scope: spec.scope,
          result,
        })
      }

      const verified = ctx.getContext()
      const colorWarnings = reviewGraphColors(postPolishDoc)
      const mutated =
        appliedPolish ||
        Boolean(saveViewInput) ||
        Boolean(artifactPath) ||
        exportResults.length > 0

      const parts: string[] = []
      if (appliedPolish) parts.push(`applied ${polishSteps.join(', ')}`)
      if (saveViewInput) parts.push(`saved view "${saveViewInput.name}"`)
      if (artifactPath) parts.push(`saved package to ${artifactPath}`)
      if (exportResults.length > 0) {
        parts.push(
          `exported ${exportResults.map(e => e.format.toUpperCase()).join(', ')}`,
        )
      }
      const summary =
        parts.length > 0
          ? `Delivered "${verified.title}": ${parts.join('; ')}.`
          : `Verified and fitted "${verified.title}" with no edits or exports requested.`

      return {
        summary,
        mutated,
        data: {
          status: 'delivered',
          appliedPolish,
          polishSteps,
          proposalId,
          discardedProposalId,
          savedView: saveViewInput
            ? { ...saveViewInput, message: savedViewMessage }
            : null,
          fitted: shouldFit,
          saved: shouldSave,
          artifactPath,
          exports: exportResults,
          colorWarnings,
          verifiedContext: {
            title: verified.title,
            documentPath: verified.documentPath,
            nodeCount: verified.nodeCount,
            edgeCount: verified.edgeCount,
            layout: verified.layout,
          },
        },
      }
    },
  })

export const PUREGRAPH_FUNCTIONS: readonly AppFunctionDefinition<PureGraphAgentContext>[] =
  [
    fnInspectGraphHealth,
    fnTraceAndFocusSubgraph,
    fnBuildAndSaveGraph,
    fnEditGraphAndApply,
    fnPolishAndExportGraph,
  ]
