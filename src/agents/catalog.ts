/**
 * Exposed PureGraph operations (must stay in sync 1:1 with `plugin.json` → `app.agents.tools[].name`).
 *
 * 3-tier exposure (built on `@purescience/platform-ui/bridge/appFunctions`):
 *   1. 5 composite `function` workflows (`fn_*`) — replace 3–8 atomic round-trips each
 *   2. 5 core atomic tools (~23% of 22) — indispensable direct read/create/propose/apply/save verbs
 *   3. 3 universal escape-hatch meta-tools (`discoverAppTools`, `callExtendedReadTool`, `callExtendedTool`)
 *      providing full on-demand access to the remaining 17 specialist atomic tools.
 */
export const PUREGRAPH_FUNCTION_NAMES = [
  'fn_inspectGraphHealth',
  'fn_traceAndFocusSubgraph',
  'fn_buildAndSaveGraph',
  'fn_editGraphAndApply',
  'fn_polishAndExportGraph',
] as const

export const PUREGRAPH_CORE_TOOL_NAMES = [
  'getGraphContext',
  'createGraph',
  'proposeGraph',
  'applyGraphProposal',
  'saveGraph',
] as const

export const PUREGRAPH_META_TOOL_NAMES = [
  'discoverAppTools',
  'callExtendedReadTool',
  'callExtendedTool',
] as const

export const EXPOSED_TOOL_NAMES = [
  ...PUREGRAPH_FUNCTION_NAMES,
  ...PUREGRAPH_CORE_TOOL_NAMES,
  ...PUREGRAPH_META_TOOL_NAMES,
] as const

/** Keep in sync with `plugin.json` → `app.agents.tools[].name`. */
export const PUREGRAPH_AGENT_TOOL_NAMES = EXPOSED_TOOL_NAMES

export type PureGraphAgentToolName =
  (typeof PUREGRAPH_AGENT_TOOL_NAMES)[number]

export const PUREGRAPH_EXTENDED_TOOL_NAMES = [
  'discardGraphProposal',
  'loadGraph',
  'importGraphFile',
  'addNode',
  'addEdge',
  'setNodeLabel',
  'removeElement',
  'clearGraph',
  'runLayout',
  'setStyle',
  'fit',
  'exportGraph',
  'queryGraph',
  'analyzeGraph',
  'exploreGraph',
  'saveGraphView',
  'applyGraphPalette',
] as const

export const PUREGRAPH_ALL_ATOMIC_TOOL_NAMES = [
  ...PUREGRAPH_CORE_TOOL_NAMES,
  ...PUREGRAPH_EXTENDED_TOOL_NAMES,
] as const

export const PUREGRAPH_AGENT_LOG_LABEL = 'puregraph'
