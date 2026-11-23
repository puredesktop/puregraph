import type {
  AppOperationExposure,
  AppOperationRisk,
} from '@purescience/platform-ui/bridge/appFunctions'

export interface AtomicToolSchemaSpec {
  name: string
  exposure: AppOperationExposure
  category: string
  risk: AppOperationRisk
  requiresApproval: boolean
  releaseButton?: string
  deletesPermanently?: boolean
  riskWhen?: Record<string, 'write' | 'destructive' | 'external' | 'release'>
  requiresCapabilities?: Array<'vision'>
  description: string
  inputSchema: Record<string, unknown> & { type: 'object' }
}

/**
 * All 22 atomic PureGraph tools with 3-tier exposure metadata:
 *   - "always" (5, ~23%): core read/create/propose/apply/save verbs directly exposed in plugin.json.
 *   - "extended" (17, ~77%): specialist query/analysis/exploration/import/element-editing/styling/
 *     export tools discoverable via `discoverAppTools` and callable via `callExtendedReadTool` /
 *     `callExtendedTool` with zero loss of functionality.
 */
export const PUREGRAPH_ATOMIC_TOOL_SCHEMAS: readonly AtomicToolSchemaSpec[] = [
  // ── Core atomic tools (exposure: 'always') ───────────────────────────────
  {
    name: 'getGraphContext',
    exposure: 'always',
    category: 'read',
    risk: 'read',
    requiresApproval: false,
    description:
      'Read the current graph: title, documentPath (null while unsaved), node and edge counts, active layout, style, selectedIds, and the nodes and edges with their ids. Call this first — every other tool takes ids from it. Large graphs are capped (truncated: true) with selected elements listed first; counts are always exact. Includes pendingProposal (id, title, impact) or null. Counts describe applied data only.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'createGraph',
    exposure: 'always',
    category: 'documents',
    risk: 'write',
    requiresApproval: true,
    description:
      'Create and open a NEW graph document from complete data, preserving the current document. Use for make up data, new examples, unrelated graphs, or start a new graph. This directly creates the requested document, not a proposal replacing the current graph. Provide all nodes and edges together. After creation verify getGraphContext, fit, and saveGraph (or use fn_buildAndSaveGraph to do all steps in one call). Do not use for preview-only requests.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
        },
        elements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
              },
              position: {
                type: 'object',
              },
            },
            required: ['data'],
          },
        },
        layout: {
          type: 'string',
          enum: [
            'cose',
            'grid',
            'circle',
            'concentric',
            'breadthfirst',
            'preset',
          ],
        },
        style: {
          type: 'object',
        },
        synthetic: {
          type: 'boolean',
          description:
            'True for made-up, illustrative or demo data. Marks all elements accordingly.',
        },
      },
      required: ['title', 'elements'],
      additionalProperties: false,
    },
  },
  {
    name: 'proposeGraph',
    exposure: 'always',
    category: 'editing',
    risk: 'write',
    requiresApproval: true,
    description:
      'Prepare a validated atomic set of graph edits for user review. Returns pending status and proposalId. For user-authorized work, follow with applyGraphProposal (or use fn_editGraphAndApply to stage, apply, fit, and save in one call); for preview-only requests, leave it pending. Use one proposal for related edits; Undo reverts the whole proposal. Commands: add/replace {elements}; update {ids,data}; rename {id,nextId}; remove {ids}; pin {ids,pinned}; positions {positions}; style {style}; title {title}; layout {name,ids?,direction?}. Read getGraphContext to resolve an existing proposal with applyGraphProposal or discardGraphProposal; do not retry blocked writes. Include data, title, layout and styling in ONE proposal. Nodes must use {data:{id,label,...}}, edges {data:{id,source,target,...}}. Also accepts encodings {encodings:[{channel:nodeSize|nodeColor|nodeShape|edgeWidth,field,values?}]} and views {views:[...]}. Prefer saveGraphView for the current view.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
        },
        commands: {
          type: 'array',
          minItems: 1,
          maxItems: 1000,
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: [
                  'add',
                  'replace',
                  'update',
                  'rename',
                  'remove',
                  'pin',
                  'positions',
                  'style',
                  'title',
                  'layout',
                  'encodings',
                  'views',
                ],
              },
              elements: {
                type: 'array',
                items: {
                  type: 'object',
                },
              },
              encodings: {
                type: 'array',
                items: {
                  type: 'object',
                },
              },
              views: {
                type: 'array',
                items: {
                  type: 'object',
                },
              },
              ids: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              data: {
                type: 'object',
              },
              id: {
                type: 'string',
              },
              nextId: {
                type: 'string',
              },
              pinned: {
                type: 'boolean',
              },
              positions: {
                type: 'object',
              },
              style: {
                type: 'object',
              },
              title: {
                type: 'string',
              },
              name: {
                type: 'string',
                enum: [
                  'cose',
                  'grid',
                  'circle',
                  'concentric',
                  'breadthfirst',
                  'preset',
                ],
              },
              direction: {
                type: 'string',
                enum: ['down', 'right'],
              },
            },
            required: ['type'],
            additionalProperties: false,
          },
        },
      },
      required: ['title', 'commands'],
      additionalProperties: false,
    },
  },
  {
    name: 'applyGraphProposal',
    exposure: 'always',
    category: 'proposals',
    risk: 'write',
    requiresApproval: true,
    description:
      'Apply the exact pending proposal identified by proposalId as one undoable edit. Use when the user requested these changes or explicitly approved the pending proposal, including “make the graph”. Do not apply preview-only requests or an unrelated proposal. Rejects stale proposals; verify afterward with getGraphContext.',
    inputSchema: {
      type: 'object',
      properties: {
        proposalId: {
          type: 'string',
        },
      },
      required: ['proposalId'],
      additionalProperties: false,
    },
  },
  {
    name: 'saveGraph',
    exposure: 'always',
    category: 'documents',
    risk: 'write',
    requiresApproval: true,
    description:
      'Save the current graph into its app-managed .graph package and return the durable artifact path. Call this after graph edits before completing a mission; operates on the applied document, never a pending proposal.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ── Extended specialist atomic tools (exposure: 'extended') ──────────────
  {
    name: 'discardGraphProposal',
    exposure: 'extended',
    category: 'proposals',
    risk: 'write',
    requiresApproval: true,
    description:
      'Discard the identified pending proposal without changing the graph. Use when the user cancels, changes their request, or the proposal is stale and must be rebuilt. Read getGraphContext for its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        proposalId: {
          type: 'string',
        },
      },
      required: ['proposalId'],
      additionalProperties: false,
    },
  },
  {
    name: 'loadGraph',
    exposure: 'extended',
    category: 'import',
    risk: 'destructive',
    requiresApproval: false,
    description:
      'Prepares a proposal for user review; it does not immediately apply changes. Prefer proposeGraph for multiple related edits. Replace the graph from a JSON or CSV/TSV edge-list string. When the canvas already holds nodes, data loads need replace: true; use addNode/addEdge to grow an existing graph instead.',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description:
            'Graph data: JSON (an element array, { elements }, or { nodes, edges }) or a CSV/TSV edge list with source/target (or from/to) columns and an optional label column.',
        },
        replace: {
          type: 'boolean',
          description:
            'Required (true) to replace a graph that already has nodes. Say what is being replaced in your reply.',
        },
      },
      required: ['data'],
    },
  },
  {
    name: 'importGraphFile',
    exposure: 'extended',
    category: 'import',
    risk: 'destructive',
    requiresApproval: false,
    description:
      'Call getGraphContext first to inspect whether the canvas already holds nodes. Prepares a proposal for user review; it does not immediately apply changes. Prefer proposeGraph for multiple related edits. Replace the graph with the contents of an absolute JSON, CSV, or TSV file path. When the canvas already holds nodes this needs replace: true.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to a JSON, CSV, or TSV file.',
        },
        replace: {
          type: 'boolean',
          description:
            'Required (true) to replace a graph that already has nodes.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'addNode',
    exposure: 'extended',
    category: 'editing',
    risk: 'write',
    requiresApproval: false,
    description:
      'Prepares a proposal for user review; it does not immediately apply changes. Prefer proposeGraph for multiple related edits. Add a node to the graph. The id must be new (call getGraphContext to see existing ids); when omitted one is generated. The label defaults to the id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
        },
        label: {
          type: 'string',
        },
      },
    },
  },
  {
    name: 'addEdge',
    exposure: 'extended',
    category: 'editing',
    risk: 'write',
    requiresApproval: false,
    description:
      'Prepares a proposal for user review; it does not immediately apply changes. Prefer proposeGraph for multiple related edits. Connect two existing nodes with an edge. Both source and target must be node ids from getGraphContext (include missing nodes and edges together in one proposeGraph call).',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
        },
        target: {
          type: 'string',
        },
        id: {
          type: 'string',
        },
        label: {
          type: 'string',
        },
      },
      required: ['source', 'target'],
    },
  },
  {
    name: 'setNodeLabel',
    exposure: 'extended',
    category: 'editing',
    risk: 'write',
    requiresApproval: false,
    description:
      'Prepares a proposal for user review; it does not immediately apply changes. Prefer proposeGraph for multiple related edits. Change a node or edge label by id (ids come from getGraphContext).',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
        },
        label: {
          type: 'string',
        },
      },
      required: ['id', 'label'],
    },
  },
  {
    name: 'removeElement',
    exposure: 'extended',
    category: 'editing',
    risk: 'destructive',
    requiresApproval: true,
    description:
      'Prepares a proposal for user review; it does not immediately apply changes. Prefer proposeGraph for multiple related edits. Delete one node (and every edge connected to it) or one edge by id. Confirm the id against getGraphContext first; applying the proposal can be undone.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'clearGraph',
    exposure: 'extended',
    category: 'editing',
    risk: 'destructive',
    requiresApproval: true,
    description:
      "Prepares a proposal for user review; it does not immediately apply changes. Prefer proposeGraph for multiple related edits. Remove every node and edge from the graph. Only for 'start over' requests: when the graph is not empty the call is refused unless confirm is true. To delete one element use removeElement.",
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Must be true to clear a non-empty graph.',
        },
      },
    },
  },
  {
    name: 'runLayout',
    exposure: 'extended',
    category: 'styling',
    risk: 'write',
    requiresApproval: false,
    description:
      'Prepares a proposal for user review; it does not immediately apply changes. Prefer proposeGraph for multiple related edits. Arrange the whole graph with a layout: cose (force-directed webs), breadthfirst (hierarchies), grid, circle, concentric, or preset (keep supplied positions).',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          enum: [
            'cose',
            'grid',
            'circle',
            'concentric',
            'breadthfirst',
            'preset',
          ],
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'setStyle',
    exposure: 'extended',
    category: 'styling',
    risk: 'write',
    requiresApproval: false,
    description:
      'Prepares a proposal for user review; it does not immediately apply changes. Prefer proposeGraph for multiple related edits. Change visual graph styling: colors, node shape/size, edge width/curve, labels, direction, and background.',
    inputSchema: {
      type: 'object',
      properties: {
        backgroundColor: {
          type: 'string',
          description: 'Hex background color.',
        },
        nodeColor: {
          type: 'string',
          description: 'Hex color for nodes.',
        },
        edgeColor: {
          type: 'string',
          description: 'Hex color for edges.',
        },
        nodeShape: {
          type: 'string',
          enum: ['ellipse', 'round-rectangle', 'diamond', 'hexagon', 'triangle'],
        },
        curveStyle: {
          type: 'string',
          enum: ['bezier', 'straight', 'taxi'],
        },
        nodeSize: {
          type: 'number',
          description: 'Node diameter in pixels, from 4 to 96.',
        },
        edgeWidth: {
          type: 'number',
          description: 'Edge stroke width in pixels, from 0.25 to 10.',
        },
        labelSize: {
          type: 'number',
          description: 'Label font size in pixels, from 5 to 24.',
        },
        showLabels: {
          type: 'boolean',
        },
        directed: {
          type: 'boolean',
          description: 'Whether edges show target arrows.',
        },
        showEdgeLabels: {
          type: 'boolean',
        },
        showLegend: {
          type: 'boolean',
        },
        labelPlacement: {
          type: 'string',
          enum: ['inside', 'outside'],
        },
        categoryColors: {
          type: 'object',
          additionalProperties: {
            type: 'string',
          },
        },
      },
    },
  },
  {
    name: 'fit',
    exposure: 'extended',
    category: 'exploration',
    risk: 'read',
    requiresApproval: false,
    description:
      'Zoom and pan the PureGraph canvas viewport so every currently visible node and edge fits comfortably in view without editing document data.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'exportGraph',
    exposure: 'extended',
    category: 'export',
    risk: 'write',
    requiresApproval: true,
    description:
      'Export the graph as an offline interactive HTML explorer, SVG, PNG, or editable JSON. HTML includes visual fields only by default.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['png', 'svg', 'json', 'html'],
        },
        filename: {
          type: 'string',
          description:
            'Base name without extension; unsafe characters are replaced.',
        },
        scope: {
          type: 'string',
          enum: ['all', 'view', 'selected'],
        },
        attributeKeys: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'Extra evidence attributes to embed in HTML; omitted attributes are not shared.',
        },
        includeViews: {
          type: 'boolean',
        },
        initialViewId: {
          type: 'string',
        },
      },
    },
  },
  {
    name: 'queryGraph',
    exposure: 'extended',
    category: 'read',
    risk: 'read',
    requiresApproval: false,
    description:
      'Read matching nodes and relationships, including attributes and positions. Page with nextOffset. Never infer absent data from the capped context summary.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
        },
        kind: {
          type: 'string',
          enum: ['nodes', 'edges', 'all'],
        },
        ids: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        category: {
          type: 'string',
        },
        offset: {
          type: 'integer',
          minimum: 0,
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
        },
      },
      required: [],
    },
  },
  {
    name: 'analyzeGraph',
    exposure: 'extended',
    category: 'analysis',
    risk: 'read',
    requiresApproval: false,
    description:
      'Compute actual graph paths, neighborhoods, or weakly connected components. Use returned IDs with exploreGraph; do not guess paths.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['path', 'neighborhood', 'components'],
        },
        start: {
          type: 'string',
        },
        end: {
          type: 'string',
        },
        directed: {
          type: 'boolean',
        },
        depth: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
        },
        direction: {
          type: 'string',
          enum: ['incoming', 'outgoing', 'both'],
        },
      },
      required: ['operation'],
    },
  },
  {
    name: 'exploreGraph',
    exposure: 'extended',
    category: 'exploration',
    risk: 'read',
    requiresApproval: false,
    description:
      'Select, focus, temporarily exclude, reset, or open a saved view. Changes the view, never deletes data. Include node and edge IDs for a path.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['select', 'focus', 'exclude', 'reset', 'openView'],
        },
        ids: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        viewId: {
          type: 'string',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'saveGraphView',
    exposure: 'extended',
    category: 'exploration',
    risk: 'write',
    requiresApproval: true,
    description:
      'Save the current exploration state and viewport with a name and explanatory caption, as an undoable document edit.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
        },
        caption: {
          type: 'string',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'applyGraphPalette',
    exposure: 'extended',
    category: 'styling',
    risk: 'write',
    requiresApproval: true,
    description:
      'Stage a programmatically measured category palette. Apply the returned proposal ID when authorized.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]
