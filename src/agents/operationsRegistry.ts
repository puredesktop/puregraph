import {
  createAppOperationsRegistry,
  defineAppTool,
  type AppAtomicToolDefinition,
  type BuildHandlersOptions,
} from '@purescience/platform-ui/bridge/appFunctions'
import type {
  AgentToolHandler,
  AgentToolHandlerResult,
  AgentToolInvokeContext,
} from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { PUREGRAPH_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import { GraphToolError, type PureGraphAgentContext } from './context'
import { PUREGRAPH_FUNCTIONS } from './functions'
import {
  addEdgeHandler,
  addNodeHandler,
  analyzeGraphHandler,
  applyGraphPaletteHandler,
  applyGraphProposalHandler,
  clearGraphHandler,
  createGraphHandler,
  discardGraphProposalHandler,
  exploreGraphHandler,
  exportGraphHandler,
  fitHandler,
  getGraphContextHandler,
  importGraphFileHandler,
  loadGraphHandler,
  proposeGraphHandler,
  queryGraphHandler,
  removeElementHandler,
  runLayoutHandler,
  saveGraphHandler,
  saveGraphViewHandler,
  setNodeLabelHandler,
  setStyleHandler,
} from './handlers'

type AtomicRunner = (
  ctx: PureGraphAgentContext,
  invoke: AgentToolInvokeContext,
) => AgentToolHandlerResult | Promise<AgentToolHandlerResult>

const ATOMIC_RUNNERS: Record<string, AtomicRunner> = {
  getGraphContext: ctx => getGraphContextHandler(ctx),
  createGraph: (ctx, invoke) => createGraphHandler(ctx, invoke),
  proposeGraph: (ctx, invoke) => proposeGraphHandler(ctx, invoke),
  applyGraphProposal: (ctx, invoke) => applyGraphProposalHandler(ctx, invoke),
  discardGraphProposal: (ctx, invoke) =>
    discardGraphProposalHandler(ctx, invoke),
  loadGraph: (ctx, invoke) => loadGraphHandler(ctx, invoke),
  importGraphFile: (ctx, invoke) => importGraphFileHandler(ctx, invoke),
  addNode: (ctx, invoke) => addNodeHandler(ctx, invoke),
  addEdge: (ctx, invoke) => addEdgeHandler(ctx, invoke),
  setNodeLabel: (ctx, invoke) => setNodeLabelHandler(ctx, invoke),
  removeElement: (ctx, invoke) => removeElementHandler(ctx, invoke),
  clearGraph: (ctx, invoke) => clearGraphHandler(ctx, invoke),
  runLayout: (ctx, invoke) => runLayoutHandler(ctx, invoke),
  setStyle: (ctx, invoke) => setStyleHandler(ctx, invoke),
  fit: ctx => fitHandler(ctx),
  saveGraph: ctx => saveGraphHandler(ctx),
  exportGraph: (ctx, invoke) => exportGraphHandler(ctx, invoke),
  queryGraph: (ctx, invoke) => queryGraphHandler(ctx, invoke),
  analyzeGraph: (ctx, invoke) => analyzeGraphHandler(ctx, invoke),
  exploreGraph: (ctx, invoke) => exploreGraphHandler(ctx, invoke),
  saveGraphView: (ctx, invoke) => saveGraphViewHandler(ctx, invoke),
  applyGraphPalette: ctx => applyGraphPaletteHandler(ctx),
}

const atomicTools: AppAtomicToolDefinition<PureGraphAgentContext>[] =
  PUREGRAPH_ATOMIC_TOOL_SCHEMAS.map(schema =>
    defineAppTool<PureGraphAgentContext>({
      ...schema,
      run: async (ctx, args, invoke) => {
        const runner = ATOMIC_RUNNERS[schema.name]
        if (!runner) {
          throw new GraphToolError(
            `Missing atomic tool handler for "${schema.name}".`,
          )
        }
        return runner(ctx, { ...invoke, arguments: args })
      },
    }),
  )

/**
 * PureGraph's unified Operations Registry built on `@purescience/platform-ui/bridge/appFunctions`:
 *   - 5 composite `function` workflows (`fn_*`, always exposed)
 *   - 5 core atomic tools (~23% of 22, always exposed)
 *   - 3 universal escape-hatch meta-tools (always exposed)
 *   - 17 extended specialist atomic tools (hidden by default, 100% reachable on demand)
 */
export const PUREGRAPH_OPERATIONS_REGISTRY =
  createAppOperationsRegistry<PureGraphAgentContext>({
    appSlug: 'graph',
    appName: 'PureGraph',
    functions: PUREGRAPH_FUNCTIONS,
    tools: atomicTools,
  })

export function buildPureGraphHandlers(
  getCtx: () => PureGraphAgentContext,
  options: BuildHandlersOptions<PureGraphAgentContext> = {},
): Record<string, AgentToolHandler> {
  return PUREGRAPH_OPERATIONS_REGISTRY.buildHandlers(getCtx, {
    createError: message => new GraphToolError(message),
    ...options,
  })
}
