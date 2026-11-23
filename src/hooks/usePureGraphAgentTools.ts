/**
 * Registering PureGraph's exposed operations with the platform:
 *   - 5 composite `fn_*` functions (always exposed)
 *   - 5 core atomic tools (~23% of 22, always exposed)
 *   - 3 universal escape-hatch meta-tools (`discoverAppTools`,
 *     `callExtendedReadTool`, `callExtendedTool`) giving full on-demand access
 *     to all 17 specialist atomic tools.
 */
import { useMemo, useRef } from 'react'
import type { AgentToolHandler } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { usePlatformAgentTools } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import {
  EXPOSED_TOOL_NAMES,
  PUREGRAPH_AGENT_LOG_LABEL,
} from '../agents/catalog'
import { GraphToolError, type PureGraphAgentContext } from '../agents/context'
import { buildPureGraphHandlers } from '../agents/operationsRegistry'

export function usePureGraphAgentTools(
  ready: boolean,
  context: PureGraphAgentContext | null,
): void {
  const contextRef = useRef(context)
  contextRef.current = context

  const registryHandlers = useMemo(
    () =>
      buildPureGraphHandlers(() => {
        if (!contextRef.current) throw new GraphToolError('Graph is not ready.')
        return contextRef.current
      }),
    [],
  )

  // Statically key-preserving registration so `scripts/check-manifests.mjs`
  // can verify every manifest tool has a live registered handler at build time.
  const handlers = useMemo(
    () =>
      Object.fromEntries(
        EXPOSED_TOOL_NAMES.map(name => [
          name,
          async (invoke: Parameters<AgentToolHandler>[0]) =>
            registryHandlers[name]!(invoke),
        ]),
      ),
    [registryHandlers],
  )

  usePlatformAgentTools({
    ready,
    tools: EXPOSED_TOOL_NAMES,
    logLabel: PUREGRAPH_AGENT_LOG_LABEL,
    errorType: GraphToolError,
    handlers,
  })
}
