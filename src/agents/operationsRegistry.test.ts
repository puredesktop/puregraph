import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { applyGraphCommands, isEdge, type GraphCommand } from '../lib/graphCommands'
import { summarizeGraphContext } from '../lib/graphContext'
import { defaultGraphDocument, type GraphDocument } from '../lib/graphDocument'
import {
  analyzeGraph,
  emptyGraphView,
  queryGraph,
  type GraphViewState,
} from '../lib/graphExplore'
import { graphPalettePlan } from '../lib/graphPalette'
import {
  acceptGraphProposal,
  createGraphProposal,
  type GraphProposal,
} from '../lib/graphProposal'
import { PUREGRAPH_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import {
  EXPOSED_TOOL_NAMES,
  PUREGRAPH_AGENT_TOOL_NAMES,
  PUREGRAPH_ALL_ATOMIC_TOOL_NAMES,
  PUREGRAPH_CORE_TOOL_NAMES,
  PUREGRAPH_EXTENDED_TOOL_NAMES,
  PUREGRAPH_FUNCTION_NAMES,
  PUREGRAPH_META_TOOL_NAMES,
} from './catalog'
import { GraphToolError, type PureGraphAgentContext } from './context'
import {
  PUREGRAPH_OPERATIONS_REGISTRY,
  buildPureGraphHandlers,
} from './operationsRegistry'

const invoke = (shortName: string, args: Record<string, unknown> = {}) => ({
  toolCallId: `tc_${shortName}`,
  shortName,
  arguments: args,
})

const RELEASE_VERBS = new Set([
  'send',
  'sends',
  'sending',
  'merge',
  'merges',
  'merging',
  'publish',
  'publishes',
  'publishing',
  'deposit',
  'deposits',
  'depositing',
  'deploy',
  'deploys',
  'deploying',
  'post',
  'posts',
  'posting',
])

function makeRichDocument(): GraphDocument {
  const base = defaultGraphDocument()
  return {
    ...base,
    title: 'Research Citation Network',
    layout: 'cose',
    style: {
      ...base.style,
      directed: true,
      backgroundColor: '#ffffff',
      nodeColor: '#387ec1',
      edgeColor: '#6b7785',
      showLabels: true,
      showLegend: true,
    },
    elements: [
      {
        data: {
          id: 'p1',
          label: 'Foundations Paper',
          category: 'Core',
          sourceUrl: 'https://doi.org/10.1000/p1',
          provenance: 'Crossref',
          date: '2024-01-10',
          confidence: 0.95,
          notes: 'Seminal work',
        },
        position: { x: 0, y: 0 },
      },
      {
        data: {
          id: 'p2',
          label: 'Methods Follow-up',
          category: 'Methods',
          sourceUrl: 'https://doi.org/10.1000/p2',
          provenance: 'Crossref',
          confidence: 0.85,
        },
        position: { x: 120, y: 0 },
      },
      {
        data: {
          id: 'p3',
          label: 'Applied Benchmark',
          category: 'Applied',
          provenance: 'Manual curation',
          confidence: 0.4,
        },
        position: { x: 240, y: 0 },
      },
      {
        data: {
          id: 'p4',
          label: 'Replication Study',
          category: 'Methods',
          synthetic: true,
        },
        position: { x: 120, y: 120 },
      },
      {
        data: {
          id: 'orphan',
          label: 'Unlinked Note',
          category: 'Notes',
        },
        position: { x: 300, y: 200 },
      },
      {
        data: {
          id: 'e12',
          source: 'p1',
          target: 'p2',
          label: 'cites',
          provenance: 'Crossref',
        },
      },
      {
        data: {
          id: 'e23',
          source: 'p2',
          target: 'p3',
          label: 'extends',
        },
      },
      {
        data: {
          id: 'e31',
          source: 'p3',
          target: 'p1',
          label: 'feedback',
        },
      },
      {
        data: {
          id: 'e24',
          source: 'p2',
          target: 'p4',
          label: 'replicates',
        },
      },
    ],
  }
}

interface MockHarness {
  ctx: PureGraphAgentContext
  state: {
    doc: GraphDocument
    documentPath: string | null
    proposal: GraphProposal | null
    selectedIds: string[]
    view: GraphViewState
    fitCount: number
    savedPaths: string[]
    exports: Array<{ format?: string; filename?: string; scope?: string; attributeKeys?: string[] }>
    savedViews: Array<{ name: string; caption: string }>
    createdDocs: GraphDocument[]
    files: Map<string, string>
  }
}

function createHarness(
  initialDoc: GraphDocument = makeRichDocument(),
  options: { includeGetDocument?: boolean } = {},
): MockHarness {
  const state: MockHarness['state'] = {
    doc: structuredClone(initialDoc),
    documentPath: '/Graphs/research.graph',
    proposal: null,
    selectedIds: [],
    view: emptyGraphView(),
    fitCount: 0,
    savedPaths: [],
    exports: [],
    savedViews: [],
    createdDocs: [],
    files: new Map<string, string>([
      [
        '/tmp/import.csv',
        'source,target,label\nalpha,beta,links\nbeta,gamma,feeds\n',
      ],
    ]),
  }

  const getContext = () => {
    const nodes = state.doc.elements
      .filter(el => !isEdge(el))
      .map(el => ({
        id: el.data.id!,
        label: String(el.data.label ?? el.data.id!),
        data: el.data,
        position: el.position,
      }))
    const edges = state.doc.elements.filter(isEdge).map(el => ({
      id: el.data.id!,
      label: el.data.label ? String(el.data.label) : null,
      source: el.data.source!,
      target: el.data.target!,
      data: el.data,
    }))
    return {
      ...summarizeGraphContext({
        title: state.doc.title,
        documentPath: state.documentPath,
        layout: state.doc.layout,
        style: state.doc.style,
        selectedIds: state.selectedIds,
        nodes,
        edges,
      }),
      views: state.doc.views?.map(({ id, name, caption }) => ({
        id,
        name,
        caption,
      })),
      view: state.view,
      pendingProposal: state.proposal
        ? {
            id: state.proposal.id,
            title: state.proposal.title,
            impact: state.proposal.impact,
          }
        : null,
    }
  }

  const stageProposal = (title: string, commands: GraphCommand[]): string => {
    if (state.proposal) {
      throw new GraphToolError(
        `Proposal ${state.proposal.id} is pending. Resolve it first.`,
      )
    }
    state.proposal = createGraphProposal(state.doc, title, commands)
    return JSON.stringify({
      status: 'pending',
      proposalId: state.proposal.id,
      title,
      impact: state.proposal.impact,
    })
  }

  const ctx: PureGraphAgentContext = {
    getContext,
    ...(options.includeGetDocument !== false
      ? { getDocument: () => state.doc }
      : {}),
    queryGraph: input => queryGraph(state.doc.elements, input),
    analyzeGraph: input =>
      analyzeGraph(state.doc.elements, {
        ...input,
        directed: input.directed ?? state.doc.style.directed,
      }),
    exploreGraph: input => {
      if (input.action === 'reset') {
        state.view = emptyGraphView()
        state.selectedIds = []
        return 'Restored the whole graph.'
      }
      if (input.action === 'openView') {
        const saved = state.doc.views?.find(v => v.id === input.viewId)
        if (!saved) throw new GraphToolError('Unknown saved view.')
        state.view = saved.state
        state.selectedIds = saved.selectedIds
        return `Opened ${saved.name}.`
      }
      const ids = input.ids ?? []
      if (
        !ids.length ||
        ids.some(id => !state.doc.elements.some(el => el.data.id === id))
      ) {
        throw new GraphToolError('Provide existing element IDs.')
      }
      state.selectedIds = [...ids]
      if (input.action === 'focus') {
        state.view = { ...state.view, focusIds: [...ids] }
      } else if (input.action === 'exclude') {
        state.view = {
          ...state.view,
          hiddenIds: [...new Set([...state.view.hiddenIds, ...ids])],
        }
      }
      return `${input.action}: ${ids.join(', ')}. Document data unchanged.`
    },
    saveGraphView: (name, caption) => {
      state.savedViews.push({ name, caption })
      const nextViews = [
        ...(state.doc.views ?? []),
        {
          id: `view_${state.savedViews.length}`,
          name,
          caption,
          state: structuredClone(state.view),
          selectedIds: [...state.selectedIds],
        },
      ]
      state.doc = applyGraphCommands(state.doc, [
        { type: 'views', views: nextViews },
      ])
      return `Saved view ${name}.`
    },
    applyGraphPalette: () =>
      stageProposal(
        'Apply measured category palette',
        graphPalettePlan(state.doc).commands,
      ),
    createGraph: async nextDoc => {
      state.createdDocs.push(structuredClone(nextDoc))
      state.doc = structuredClone(nextDoc)
      state.documentPath = `/Drafts/${nextDoc.title}.graph`
      state.proposal = null
      return JSON.stringify({ status: 'created', title: nextDoc.title })
    },
    proposeGraph: async (title, commands) => stageProposal(title, commands),
    applyGraphProposal: async proposalId => {
      if (!state.proposal || state.proposal.id !== proposalId) {
        throw new GraphToolError('Proposal ID does not match the pending proposal.')
      }
      state.doc = acceptGraphProposal(state.doc, state.proposal)
      state.proposal = null
      return JSON.stringify({ status: 'applied', proposalId })
    },
    discardGraphProposal: async proposalId => {
      if (!state.proposal || state.proposal.id !== proposalId) {
        throw new GraphToolError('Proposal ID does not match the pending proposal.')
      }
      state.proposal = null
      return JSON.stringify({ status: 'discarded', proposalId })
    },
    addNode: async input => {
      const id = input.id || 'n_auto'
      return stageProposal('Add a node', [
        { type: 'add', elements: [{ data: { id, label: input.label ?? id } }] },
      ])
    },
    addEdge: async input =>
      stageProposal('Add an edge', [
        {
          type: 'add',
          elements: [
            {
              data: {
                id: input.id || `e_${input.source}_${input.target}`,
                source: input.source,
                target: input.target,
                label: input.label ?? '',
              },
            },
          ],
        },
      ]),
    setElementLabel: async (id, label) =>
      stageProposal(`Relabel ${id}`, [
        { type: 'update', ids: [id], data: { label } },
      ]),
    removeElement: async id =>
      stageProposal(`Remove ${id}`, [{ type: 'remove', ids: [id] }]),
    clearGraph: async options => {
      if (!options.confirm) {
        throw new GraphToolError('Use confirm: true to propose clearing the graph.')
      }
      return stageProposal('Clear graph', [{ type: 'replace', elements: [] }])
    },
    runLayout: async name =>
      stageProposal(`Apply ${name} layout`, [{ type: 'layout', name }]),
    setStyle: async style =>
      stageProposal('Change graph style', [{ type: 'style', style }]),
    loadGraph: async (elements, _source, opts) => {
      if (state.doc.elements.length && !opts.replace) {
        throw new GraphToolError('Use replace: true to propose replacing this graph.')
      }
      return stageProposal('Replace graph data', [
        { type: 'replace', elements },
      ])
    },
    loadSample: async sampleId => `Opened sample ${sampleId}.`,
    readGraphFile: async path => {
      const content = state.files.get(path)
      if (!content) throw new GraphToolError(`Missing file ${path}`)
      return content
    },
    fit: () => {
      state.fitCount += 1
    },
    saveGraph: async () => {
      const path = state.documentPath ?? '/Drafts/Untitled.graph'
      state.documentPath = path
      state.savedPaths.push(path)
      return path
    },
    exportGraph: async input => {
      state.exports.push({
        format: input.format,
        filename: input.filename,
        scope: input.options?.scope,
        attributeKeys: input.options?.html?.attributeKeys,
      })
      return `Exported ${input.format ?? 'png'} to /Graphs/assets/${input.filename ?? 'graph'}.${input.format ?? 'png'}`
    },
  }

  return { ctx, state }
}

describe('PUREGRAPH_OPERATIONS_REGISTRY invariants & plugin.json parity', () => {
  it('enforces exact 3-tier exposure counts and catalog name parity', () => {
    const summary = PUREGRAPH_OPERATIONS_REGISTRY.auditSummary()
    expect(summary).toEqual({
      appSlug: 'graph',
      functions: 5,
      coreTools: 5,
      extendedTools: 17,
      metaTools: 3,
      totalExposed: 13,
      totalAtomicTools: 22,
      totalRegistered: 27,
      schemaReductionPercent: 41,
    })

    expect(PUREGRAPH_OPERATIONS_REGISTRY.functions.map(f => f.name)).toEqual([
      ...PUREGRAPH_FUNCTION_NAMES,
    ])
    expect(PUREGRAPH_OPERATIONS_REGISTRY.coreTools.map(t => t.name)).toEqual([
      ...PUREGRAPH_CORE_TOOL_NAMES,
    ])
    expect(
      PUREGRAPH_OPERATIONS_REGISTRY.extendedTools.map(t => t.name),
    ).toEqual([...PUREGRAPH_EXTENDED_TOOL_NAMES])
    expect(PUREGRAPH_OPERATIONS_REGISTRY.exposedToolNames).toEqual([
      ...EXPOSED_TOOL_NAMES,
    ])
    expect([...PUREGRAPH_AGENT_TOOL_NAMES]).toEqual([...EXPOSED_TOOL_NAMES])
    expect(PUREGRAPH_OPERATIONS_REGISTRY.allAtomicToolNames).toEqual([
      ...PUREGRAPH_ALL_ATOMIC_TOOL_NAMES,
    ])
    expect(PUREGRAPH_META_TOOL_NAMES).toEqual([
      'discoverAppTools',
      'callExtendedReadTool',
      'callExtendedTool',
    ])
  })

  it('keeps plugin.json app.agents.tools 100% synced with registry.manifestTools', () => {
    const manifestPath = resolve(process.cwd(), 'plugin.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    expect(manifest.app.agents.tools).toEqual(
      PUREGRAPH_OPERATIONS_REGISTRY.manifestTools,
    )
  })

  it('satisfies manifest quality gates: >= 80 char descriptions, explicit approvals, and no release verbs on non-release ops', () => {
    for (const entry of PUREGRAPH_OPERATIONS_REGISTRY.manifestTools) {
      expect(
        entry.description.trim().replace(/\s+/g, ' ').length,
        `${entry.name} description too short`,
      ).toBeGreaterThanOrEqual(80)
      expect(typeof entry.requiresApproval).toBe('boolean')
      expect(['read', 'write', 'destructive', 'external', 'release']).toContain(
        entry.risk,
      )
      const firstNameWord =
        entry.name
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .split(/[^A-Za-z]+/)
          .find(Boolean)
          ?.toLowerCase() ?? ''
      const firstDescWord =
        entry.description
          .trim()
          .split(/[^A-Za-z]+/)
          .find(Boolean)
          ?.toLowerCase() ?? ''
      if (entry.risk !== 'release') {
        expect(RELEASE_VERBS.has(firstNameWord), entry.name).toBe(false)
        expect(RELEASE_VERBS.has(firstDescWord), entry.name).toBe(false)
      }
    }

    // All 22 atomic schemas also maintain >= 80 char descriptions & explicit risk/approval
    expect(PUREGRAPH_ATOMIC_TOOL_SCHEMAS).toHaveLength(22)
    for (const schema of PUREGRAPH_ATOMIC_TOOL_SCHEMAS) {
      expect(schema.description.length, schema.name).toBeGreaterThanOrEqual(80)
      expect(typeof schema.requiresApproval).toBe('boolean')
    }
  })

  it('builds one live handler for every exposed tool name', () => {
    const { ctx } = createHarness()
    const handlers = buildPureGraphHandlers(() => ctx)
    expect(Object.keys(handlers).sort()).toEqual([...EXPOSED_TOOL_NAMES].sort())
  })
})

describe('PureGraph composite App Functions (fn_*)', () => {
  it('fn_inspectGraphHealth computes topology, hubs, components, cycle, color warnings, and evidence audit', async () => {
    const { ctx } = createHarness()
    const handlers = buildPureGraphHandlers(() => ctx)

    const res = await handlers.fn_inspectGraphHealth!(
      invoke('fn_inspectGraphHealth', { topHubsLimit: 3 }),
    )
    const payload = JSON.parse(res.content)
    expect(payload.ok).toBe(true)
    expect(payload.opClass).toBe('function')
    expect(payload.function).toBe('fn_inspectGraphHealth')

    const { data } = payload
    expect(data.metrics.nodeCount).toBe(5)
    expect(data.metrics.edgeCount).toBe(4)
    expect(data.metrics.isolatedCount).toBe(1)
    expect(data.metrics.isolatedNodeIds).toEqual(['orphan'])
    expect(data.topHubs[0].id).toBe('p2')
    expect(data.topHubs[0].degree).toBe(3)
    expect(data.topHubs).toHaveLength(3)
    expect(data.components.count).toBe(2)
    expect(data.components.largestSize).toBe(4)
    expect(data.cycle.detected).toBe(true)
    expect(data.cycle.nodeSequence.length).toBeGreaterThanOrEqual(4)
    expect(data.cycle.selectionIds.length).toBeGreaterThanOrEqual(6)
    expect(data.evidenceAudit.syntheticCount).toBe(1)
    expect(data.evidenceAudit.withSourceUrl).toBe(2)
    expect(data.evidenceAudit.withProvenance).toBe(4)
    expect(data.evidenceAudit.lowConfidenceNodes).toEqual([
      { id: 'p3', confidence: 0.4 },
    ])
    expect(data.evidenceAudit.unattributedNodeSample).toEqual(['orphan'])
  })

  it('fn_inspectGraphHealth supports category filtering and fallback when getDocument is unavailable', async () => {
    const { ctx } = createHarness(makeRichDocument(), {
      includeGetDocument: false,
    })
    const handlers = buildPureGraphHandlers(() => ctx)

    const res = await handlers.fn_inspectGraphHealth!(
      invoke('fn_inspectGraphHealth', {
        category: 'Methods',
        includeEvidenceAudit: false,
      }),
    )
    const { data } = JSON.parse(res.content)
    expect(data.categoryFilter).toBe('Methods')
    expect(data.metrics.nodeCount).toBe(2)
    expect(data.metrics.edgeCount).toBe(1)
    expect(data.evidenceAudit).toBeUndefined()
  })

  it('fn_traceAndFocusSubgraph traces paths, neighborhoods, components, cycles, queries, and resets cleanly', async () => {
    const { ctx, state } = createHarness()
    const handlers = buildPureGraphHandlers(() => ctx)

    // 1. Shortest path
    const pathRes = await handlers.fn_traceAndFocusSubgraph!(
      invoke('fn_traceAndFocusSubgraph', {
        mode: 'path',
        start: 'p1',
        end: 'p4',
      }),
    )
    const pathData = JSON.parse(pathRes.content).data
    expect(pathData.found).toBe(true)
    expect(pathData.nodeSequence).toEqual(['p1', 'p2', 'p4'])
    expect(pathData.edgeSequence).toEqual(['e12', 'e24'])
    expect(pathData.fitted).toBe(true)
    expect(state.view.focusIds).toEqual(['p1', 'p2', 'p4', 'e12', 'e24'])
    expect(state.fitCount).toBe(1)

    // 2. Unreachable path returns found: false without throwing
    const missingPath = await handlers.fn_traceAndFocusSubgraph!(
      invoke('fn_traceAndFocusSubgraph', {
        mode: 'path',
        start: 'p1',
        end: 'orphan',
      }),
    )
    expect(JSON.parse(missingPath.content).data.found).toBe(false)

    // 3. Neighborhood with viewAction: 'select'
    const hoodRes = await handlers.fn_traceAndFocusSubgraph!(
      invoke('fn_traceAndFocusSubgraph', {
        mode: 'neighborhood',
        start: 'p2',
        depth: 1,
        direction: 'outgoing',
        viewAction: 'select',
        fit: false,
      }),
    )
    const hoodData = JSON.parse(hoodRes.content).data
    expect(hoodData.matchedIds).toEqual(
      expect.arrayContaining(['p2', 'p3', 'p4', 'e23', 'e24']),
    )
    expect(hoodData.fitted).toBe(false)

    // 4. Component by index (second largest = orphan)
    const compRes = await handlers.fn_traceAndFocusSubgraph!(
      invoke('fn_traceAndFocusSubgraph', {
        mode: 'component',
        componentIndex: 1,
        viewAction: 'none',
      }),
    )
    const compData = JSON.parse(compRes.content).data
    expect(compData.matchedIds).toEqual(['orphan'])
    expect(compData.componentRank).toBe(2)

    // 5. Cycle detection
    const cycleRes = await handlers.fn_traceAndFocusSubgraph!(
      invoke('fn_traceAndFocusSubgraph', { mode: 'cycle', viewAction: 'select' }),
    )
    expect(JSON.parse(cycleRes.content).data.found).toBe(true)

    // 6. Query by category (includes internal edges)
    const queryRes = await handlers.fn_traceAndFocusSubgraph!(
      invoke('fn_traceAndFocusSubgraph', {
        mode: 'query',
        category: 'Methods',
        viewAction: 'focus',
      }),
    )
    const queryData = JSON.parse(queryRes.content).data
    expect(queryData.matchedIds).toEqual(
      expect.arrayContaining(['p2', 'p4', 'e24']),
    )

    // 7. Reset exploration view
    const resetRes = await handlers.fn_traceAndFocusSubgraph!(
      invoke('fn_traceAndFocusSubgraph', { mode: 'reset' }),
    )
    expect(JSON.parse(resetRes.content).data.mode).toBe('reset')
    expect(state.view.focusIds).toBeNull()
    expect(state.selectedIds).toEqual([])
  })

  it('fn_buildAndSaveGraph creates, auto-palettes, fits, saves, and verifies a new graph in one call', async () => {
    const { ctx, state } = createHarness()
    const recordOperation = vi.fn()
    const handlers = buildPureGraphHandlers(() => ctx, { recordOperation })

    const res = await handlers.fn_buildAndSaveGraph!(
      invoke('fn_buildAndSaveGraph', {
        title: 'Supply Chain Demo',
        layout: 'breadthfirst',
        synthetic: true,
        autoPalette: true,
        elements: [
          { data: { id: 'sup', label: 'Supplier', category: 'Upstream' } },
          { data: { id: 'mfg', label: 'Factory', category: 'Production' } },
          { data: { id: 'ret', label: 'Retailer', category: 'Downstream' } },
          { data: { id: 'e1', source: 'sup', target: 'mfg', label: 'ships' } },
          { data: { id: 'e2', source: 'mfg', target: 'ret', label: 'distributes' } },
        ],
      }),
    )

    const { data } = JSON.parse(res.content)
    expect(data.status).toBe('created')
    expect(data.nodeCount).toBe(3)
    expect(data.edgeCount).toBe(2)
    expect(data.synthetic).toBe(true)
    expect(data.fitted).toBe(true)
    expect(data.saved).toBe(true)
    expect(data.artifactPath).toBe('/Drafts/Supply Chain Demo.graph')
    expect(data.appliedPalette.categoryCount).toBe(3)
    expect(Object.keys(data.appliedPalette.categoryColors)).toEqual([
      'Downstream',
      'Production',
      'Upstream',
    ])
    expect(state.doc.elements.every(el => el.data.synthetic === true)).toBe(true)
    expect(state.fitCount).toBe(1)
    expect(state.savedPaths).toEqual(['/Drafts/Supply Chain Demo.graph'])
    expect(recordOperation).toHaveBeenCalledWith(
      ctx,
      'function.fn_buildAndSaveGraph',
      expect.stringContaining('Supply Chain Demo'),
    )
  })

  it('fn_editGraphAndApply enforces destructive & pending-proposal gates, supports previewOnly, and applies atomically', async () => {
    const { ctx, state } = createHarness()
    const handlers = buildPureGraphHandlers(() => ctx)

    // Refuses destructive remove without allowDestructiveCommands: true
    await expect(
      handlers.fn_editGraphAndApply!(
        invoke('fn_editGraphAndApply', {
          title: 'Remove orphan',
          commands: [{ type: 'remove', ids: ['orphan'] }],
        }),
      ),
    ).rejects.toThrow(/allowDestructiveCommands: true/)

    // Refuses destructive document overwrite without allowDestructiveCommands: true
    await expect(
      handlers.fn_editGraphAndApply!(
        invoke('fn_editGraphAndApply', {
          title: 'Overwrite whole doc',
          commands: [{ type: 'document', document: defaultGraphDocument() }],
        }),
      ),
    ).rejects.toThrow(/allowDestructiveCommands: true/)

    // Stages preview-only proposal without applying
    const previewRes = await handlers.fn_editGraphAndApply!(
      invoke('fn_editGraphAndApply', {
        title: 'Preview new node',
        commands: [
          { type: 'add', elements: [{ data: { id: 'p5', label: 'Draft' } }] },
        ],
        previewOnly: true,
      }),
    )
    const previewPayload = JSON.parse(previewRes.content)
    expect(previewPayload.data.status).toBe('pending')
    expect(previewPayload.data.applied).toBe(false)
    expect(state.proposal).not.toBeNull()
    expect(state.doc.elements).toHaveLength(9)

    // Refuses another write while pending proposal exists unless discardExistingProposal: true
    await expect(
      handlers.fn_editGraphAndApply!(
        invoke('fn_editGraphAndApply', {
          title: 'Competing edit',
          commands: [{ type: 'title', title: 'New Title' }],
        }),
      ),
    ).rejects.toThrow(/Pending proposal/)

    // Discards obsolete proposal and applies destructive removal when authorized
    const appliedRes = await handlers.fn_editGraphAndApply!(
      invoke('fn_editGraphAndApply', {
        title: 'Clean orphan and retitle',
        discardExistingProposal: true,
        allowDestructiveCommands: true,
        commands: [
          { type: 'remove', ids: ['orphan'] },
          { type: 'title', title: 'Cleaned Citation Network' },
        ],
      }),
    )
    const appliedData = JSON.parse(appliedRes.content).data
    expect(appliedData.status).toBe('applied')
    expect(appliedData.applied).toBe(true)
    expect(appliedData.discardedProposalId).toBe(previewPayload.data.proposalId)
    expect(appliedData.verifiedContext.title).toBe('Cleaned Citation Network')
    expect(appliedData.verifiedContext.nodeCount).toBe(4)
    expect(state.proposal).toBeNull()
    expect(state.fitCount).toBe(1)
    expect(state.savedPaths).toHaveLength(1)
  })

  it('fn_polishAndExportGraph applies palette + layout + style, saves view & package, and exports deliverables', async () => {
    const { ctx, state } = createHarness()
    const handlers = buildPureGraphHandlers(() => ctx)

    const res = await handlers.fn_polishAndExportGraph!(
      invoke('fn_polishAndExportGraph', {
        autoPalette: true,
        layout: 'breadthfirst',
        direction: 'right',
        style: { showEdgeLabels: true, nodeShape: 'round-rectangle' },
        saveView: {
          name: 'Citation Overview',
          caption: 'Polished directed overview with measured categories',
        },
        exports: [
          {
            format: 'html',
            filename: 'citation_explorer',
            scope: 'all',
            attributeKeys: ['sourceUrl', 'confidence'],
          },
          { format: 'svg', filename: 'citation_figure', scope: 'view' },
        ],
      }),
    )

    const { data } = JSON.parse(res.content)
    expect(data.status).toBe('delivered')
    expect(data.appliedPolish).toBe(true)
    expect(data.savedView.name).toBe('Citation Overview')
    expect(data.fitted).toBe(true)
    expect(data.saved).toBe(true)
    expect(data.artifactPath).toBe('/Graphs/research.graph')
    expect(data.exports).toHaveLength(2)
    expect(state.doc.layout).toBe('breadthfirst')
    expect(state.doc.style.showEdgeLabels).toBe(true)
    expect(state.doc.style.nodeShape).toBe('round-rectangle')
    expect(state.doc.style.showLegend).toBe(true)
    expect(state.savedViews).toEqual([
      {
        name: 'Citation Overview',
        caption: 'Polished directed overview with measured categories',
      },
    ])
    expect(state.exports).toEqual([
      {
        format: 'html',
        filename: 'citation_explorer',
        scope: 'all',
        attributeKeys: ['sourceUrl', 'confidence'],
      },
      {
        format: 'svg',
        filename: 'citation_figure',
        scope: 'view',
        attributeKeys: [],
      },
    ])
  })

  it('fn_polishAndExportGraph stops at pending proposal when previewOnly is true', async () => {
    const { ctx, state } = createHarness()
    const handlers = buildPureGraphHandlers(() => ctx)

    const res = await handlers.fn_polishAndExportGraph!(
      invoke('fn_polishAndExportGraph', {
        autoPalette: true,
        layout: 'circle',
        previewOnly: true,
        exports: [{ format: 'svg' }],
      }),
    )

    const { data } = JSON.parse(res.content)
    expect(data.status).toBe('pending')
    expect(data.appliedPolish).toBe(false)
    expect(state.proposal).not.toBeNull()
    expect(state.exports).toHaveLength(0)
    expect(state.savedPaths).toHaveLength(0)

    // previewOnly with no polish changes does not save or export
    const noopRes = await handlers.fn_polishAndExportGraph!(
      invoke('fn_polishAndExportGraph', {
        previewOnly: true,
        save: true,
        exports: [{ format: 'svg' }],
      }),
    )
    const noopData = JSON.parse(noopRes.content).data
    expect(noopData.status).toBe('noop')
    expect(state.exports).toHaveLength(0)
    expect(state.savedPaths).toHaveLength(0)
  })
})

describe('Universal escape-hatch meta-tools & extended tool routing', () => {
  it('discoverAppTools searches extended tools, filters by category, and inspects exact schemas by name', async () => {
    const { ctx } = createHarness()
    const handlers = buildPureGraphHandlers(() => ctx)

    // List all 17 extended tools
    const allRes = await handlers.discoverAppTools!(invoke('discoverAppTools'))
    const allPayload = JSON.parse(allRes.content)
    expect(allPayload.totalMatched).toBe(17)
    expect(allPayload.categories).toEqual([
      'analysis',
      'editing',
      'exploration',
      'export',
      'import',
      'proposals',
      'read',
      'styling',
    ])

    // Query for CSV import
    const searchRes = await handlers.discoverAppTools!(
      invoke('discoverAppTools', { query: 'csv import file' }),
    )
    const searchPayload = JSON.parse(searchRes.content)
    const names = searchPayload.operations.map((o: { name: string }) => o.name)
    expect(names).toContain('importGraphFile')
    expect(names).toContain('loadGraph')

    // Exact schema inspection via names
    const describeRes = await handlers.discoverAppTools!(
      invoke('discoverAppTools', {
        names: ['exportGraph', 'fit', 'nonExistentTool'],
      }),
    )
    const descPayload = JSON.parse(describeRes.content)
    expect(descPayload.mode).toBe('describe')
    expect(descPayload.operations[0]).toMatchObject({
      name: 'exportGraph',
      found: true,
      invokeVia: 'callExtendedTool',
    })
    expect(descPayload.operations[1]).toMatchObject({
      name: 'fit',
      found: true,
      invokeVia: 'callExtendedReadTool',
    })
    expect(descPayload.operations[2]).toMatchObject({
      name: 'nonExistentTool',
      found: false,
    })
  })

  it('callExtendedReadTool runs read-only extended tools and refuses mutating or direct tools', async () => {
    const { ctx, state } = createHarness()
    const handlers = buildPureGraphHandlers(() => ctx)

    // Valid read-only extended calls
    const queryRes = await handlers.callExtendedReadTool!(
      invoke('callExtendedReadTool', {
        tool: 'queryGraph',
        arguments: { category: 'Core' },
      }),
    )
    expect(JSON.parse(queryRes.content).total).toBe(1)

    const fitRes = await handlers.callExtendedReadTool!(
      invoke('callExtendedReadTool', { tool: 'fit' }),
    )
    expect(fitRes.content).toBe('Zoomed to fit.')
    expect(state.fitCount).toBe(1)

    // Refuses mutating extended tools
    await expect(
      handlers.callExtendedReadTool!(
        invoke('callExtendedReadTool', {
          tool: 'addNode',
          arguments: { id: 'x' },
        }),
      ),
    ).rejects.toThrow(/cannot run through callExtendedReadTool/)

    // Refuses directly exposed tools
    await expect(
      handlers.callExtendedReadTool!(
        invoke('callExtendedReadTool', { tool: 'getGraphContext' }),
      ),
    ).rejects.toThrow(/already directly exposed/)

    // Refuses unknown tool
    await expect(
      handlers.callExtendedReadTool!(
        invoke('callExtendedReadTool', { tool: 'doesNotExist' }),
      ),
    ).rejects.toThrow(/Unknown extended tool/)
  })

  it('callExtendedTool runs write tools, escalates destructive tools via confirmDestructive, and refuses read/direct tools', async () => {
    const { ctx, state } = createHarness()
    const recordOperation = vi.fn()
    const handlers = buildPureGraphHandlers(() => ctx, { recordOperation })

    // Non-destructive write extended tool works directly
    const addRes = await handlers.callExtendedTool!(
      invoke('callExtendedTool', {
        tool: 'addNode',
        arguments: { id: 'p9', label: 'Extra Node' },
      }),
    )
    const addProposal = JSON.parse(addRes.content)
    expect(addProposal.status).toBe('pending')
    expect(recordOperation).toHaveBeenCalledWith(
      ctx,
      'extended.addNode',
      'Executed extended tool addNode',
    )

    // Discard pending proposal via extended tool
    const discardRes = await handlers.callExtendedTool!(
      invoke('callExtendedTool', {
        tool: 'discardGraphProposal',
        arguments: { proposalId: addProposal.proposalId },
      }),
    )
    expect(JSON.parse(discardRes.content).status).toBe('discarded')

    // Refuses read-only extended tools
    await expect(
      handlers.callExtendedTool!(
        invoke('callExtendedTool', { tool: 'queryGraph' }),
      ),
    ).rejects.toThrow(/is read-only/)

    // Refuses directly exposed tools
    await expect(
      handlers.callExtendedTool!(
        invoke('callExtendedTool', { tool: 'saveGraph' }),
      ),
    ).rejects.toThrow(/already directly exposed/)

    // Refuses destructive extended tools without confirmDestructive: true
    await expect(
      handlers.callExtendedTool!(
        invoke('callExtendedTool', {
          tool: 'removeElement',
          arguments: { id: 'orphan' },
        }),
      ),
    ).rejects.toThrow(/confirmDestructive: true/)

    await expect(
      handlers.callExtendedTool!(
        invoke('callExtendedTool', {
          tool: 'importGraphFile',
          arguments: { path: '/tmp/import.csv', replace: true },
        }),
      ),
    ).rejects.toThrow(/confirmDestructive: true/)

    // Succeeds when confirmDestructive: true is supplied
    const importRes = await handlers.callExtendedTool!(
      invoke('callExtendedTool', {
        tool: 'importGraphFile',
        arguments: { path: '/tmp/import.csv', replace: true },
        confirmDestructive: true,
      }),
    )
    expect(JSON.parse(importRes.content).status).toBe('pending')
    expect(state.proposal).not.toBeNull()
  })

  it('enforces beforeInvoke uniformly across direct, function, and extended calls', async () => {
    const { ctx } = createHarness()
    const seen: string[] = []
    const handlers = buildPureGraphHandlers(() => ctx, {
      beforeInvoke: guard => {
        seen.push(`${guard.opClass}:${guard.name}:${guard.viaExtended}`)
      },
    })

    await handlers.getGraphContext!(invoke('getGraphContext'))
    await handlers.fn_inspectGraphHealth!(invoke('fn_inspectGraphHealth'))
    await handlers.callExtendedReadTool!(
      invoke('callExtendedReadTool', { tool: 'fit' }),
    )

    expect(seen).toEqual([
      'tool:getGraphContext:false',
      'function:fn_inspectGraphHealth:false',
      'tool:fit:true',
    ])
  })
})
