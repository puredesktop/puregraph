import { prepareNewGraph } from '../lib/createGraph'
import type { GraphCommand } from '../lib/graphCommands'
import { usePlatformAgentTools } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { useRef } from 'react'
import {
  PUREGRAPH_AGENT_LOG_LABEL,
  PUREGRAPH_AGENT_TOOL_NAMES,
} from '../agents/catalog'
import type { PureGraphAgentContext } from '../agents/context'
import { GraphToolError } from '../agents/context'
import {
  addEdgeHandler,
  addNodeHandler,
  clearGraphHandler,
  saveGraphHandler,
  exportGraphHandler,
  fitHandler,
  getGraphContextHandler,
  importGraphFileHandler,
  loadGraphHandler,
  removeElementHandler,
  runLayoutHandler,
  setNodeLabelHandler,
  setStyleHandler,
} from '../agents/handlers'

export function usePureGraphAgentTools(
  ready: boolean,
  context: PureGraphAgentContext | null,
): void {
  const contextRef = useRef(context)
  contextRef.current = context

  function requireContext(): PureGraphAgentContext {
    if (!contextRef.current) throw new GraphToolError('Graph is not ready.')
    return contextRef.current
  }

  usePlatformAgentTools({
    ready,
    tools: PUREGRAPH_AGENT_TOOL_NAMES,
    logLabel: PUREGRAPH_AGENT_LOG_LABEL,
    errorType: GraphToolError,
    handlers: {
      queryGraph: async invoke => ({ content: JSON.stringify(requireContext().queryGraph(invoke.arguments ?? {})) }),
      analyzeGraph: async invoke => ({ content: JSON.stringify(requireContext().analyzeGraph((invoke.arguments ?? {}) as Parameters<PureGraphAgentContext['analyzeGraph']>[0])) }),
      exploreGraph: async invoke => ({ content: requireContext().exploreGraph((invoke.arguments ?? {}) as Parameters<PureGraphAgentContext['exploreGraph']>[0]) }),
      saveGraphView: async invoke => {
        if (typeof invoke.arguments?.name !== 'string') throw new GraphToolError('Provide a name for this view.')
        return { content: requireContext().saveGraphView(invoke.arguments.name, String(invoke.arguments.caption ?? '')) }
      },
      applyGraphPalette: async () => ({ content: requireContext().applyGraphPalette() }),
      createGraph: async invoke => ({ content: await requireContext().createGraph(prepareNewGraph(invoke.arguments ?? {})) }),
      applyGraphProposal: async invoke => {
        const id = invoke.arguments?.proposalId
        if (typeof id !== 'string' || !id.trim()) throw new GraphToolError('Provide the proposalId returned by proposeGraph or getGraphContext.')
        return { content: await requireContext().applyGraphProposal(id) }
      },
      discardGraphProposal: async invoke => {
        const id = invoke.arguments?.proposalId
        if (typeof id !== 'string' || !id.trim()) throw new GraphToolError('Provide the pending proposalId from getGraphContext.')
        return { content: await requireContext().discardGraphProposal(id) }
      },
      proposeGraph: async invoke => {
        const title = invoke.arguments?.title, commands = invoke.arguments?.commands
        if (typeof title !== 'string' || !Array.isArray(commands)) throw new GraphToolError('Provide title and commands for the proposal.')
        return { content: await requireContext().proposeGraph(title, commands as GraphCommand[]) }
      },
      getGraphContext: async () => getGraphContextHandler(requireContext()),
      loadGraph: invoke => loadGraphHandler(requireContext(), invoke),
      importGraphFile: invoke =>
        importGraphFileHandler(requireContext(), invoke),
      addNode: invoke => addNodeHandler(requireContext(), invoke),
      addEdge: invoke => addEdgeHandler(requireContext(), invoke),
      setNodeLabel: invoke => setNodeLabelHandler(requireContext(), invoke),
      removeElement: invoke => removeElementHandler(requireContext(), invoke),
      clearGraph: invoke => clearGraphHandler(requireContext(), invoke),
      runLayout: invoke => runLayoutHandler(requireContext(), invoke),
      setStyle: invoke => setStyleHandler(requireContext(), invoke),
      fit: () => fitHandler(requireContext()),
      saveGraph: () => saveGraphHandler(requireContext()),
      exportGraph: invoke => exportGraphHandler(requireContext(), invoke),
    },
  })
}
