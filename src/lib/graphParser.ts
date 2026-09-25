import type {
  GraphCurveStyle,
  GraphLayoutName,
  GraphNodeShape,
} from '../constants'

export interface GraphElementData {
  id?: string
  source?: string
  target?: string
  label?: string
  [key: string]: unknown
}

export interface GraphElement {
  group?: 'nodes' | 'edges'
  data: GraphElementData
  position?: {
    x: number
    y: number
  }
}

export interface GraphSample {
  id: string
  name: string
  layout: GraphLayoutName
  style: GraphSampleStyle
  data: string
}

export interface GraphSampleStyle {
  backgroundColor?: string
  curveStyle?: GraphCurveStyle
  directed?: boolean
  edgeColor?: string
  edgeWidth?: number
  labelSize?: number
  nodeColor?: string
  nodeShape?: GraphNodeShape
  nodeSize?: number
  showLabels?: boolean
}

export { parseGraphInput } from './graphInput'
import { parseGraphInput } from './graphInput'
export function parseGraph(text: string): GraphElement[] { return parseGraphInput(text).elements }
export function elementsFromNodesEdges(nodes: Array<GraphElement | GraphElementData> = [], edges: Array<GraphElement | GraphElementData> = []): GraphElement[] {
  return parseGraph(JSON.stringify({ nodes, edges }))
}

/** No bundled sample graphs. */
export const SAMPLE_GRAPHS: GraphSample[] = []
export const SAMPLE_GRAPH = ''
