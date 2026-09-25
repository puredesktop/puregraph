export const PUREGRAPH_AGENT_TOOL_NAMES = [
  'getGraphContext',
  'createGraph',
  'proposeGraph',
  'applyGraphProposal',
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
  'saveGraph',
  'exportGraph', 'queryGraph', 'analyzeGraph', 'exploreGraph', 'saveGraphView', 'applyGraphPalette',
] as const

export type PureGraphAgentToolName =
  (typeof PUREGRAPH_AGENT_TOOL_NAMES)[number]

export const PUREGRAPH_AGENT_LOG_LABEL = 'puregraph'
