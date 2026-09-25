export const GRAPH_APP_SLUG = 'graph'
export const DEFAULT_GRAPH_EXPORT_NAME = 'graph'
export const GRAPH_PACKAGE_SUFFIX = '.graph'
export const GRAPH_DOCUMENT_FILE = 'graph.graph.json'
export const GRAPH_ASSET_FIGURES_DIR = 'assets/figures'

export const SUPPORTED_LAYOUTS = [
  'cose',
  'grid',
  'circle',
  'concentric',
  'breadthfirst',
  'preset',
] as const

export type GraphLayoutName = (typeof SUPPORTED_LAYOUTS)[number]

export const SUPPORTED_NODE_SHAPES = [
  'ellipse',
  'round-rectangle',
  'diamond',
  'hexagon',
  'triangle',
] as const

export type GraphNodeShape = (typeof SUPPORTED_NODE_SHAPES)[number]

export const SUPPORTED_CURVE_STYLES = [
  'bezier',
  'straight',
  'taxi',
] as const

export type GraphCurveStyle = (typeof SUPPORTED_CURVE_STYLES)[number]
