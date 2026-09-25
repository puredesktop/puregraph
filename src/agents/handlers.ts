import { DEFAULT_EXPORT_OPTIONS } from '../canvas/graphExport'
import { formatAgentToolJson } from '@purescience/platform-ui/bridge/agentToolHelpers'
import type {
  AgentToolHandlerResult,
  AgentToolInvokeContext,
} from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import {
  SUPPORTED_CURVE_STYLES,
  SUPPORTED_LAYOUTS,
  SUPPORTED_NODE_SHAPES,
  type GraphCurveStyle,
  type GraphLayoutName,
  type GraphNodeShape,
} from '../constants'
import { parseGraphInput } from '../lib/graphParser'
import { GraphToolError, type PureGraphAgentContext } from './context'

function ok(content: string): AgentToolHandlerResult {
  return { content }
}

function getString(
  input: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getLayoutName(value: unknown): GraphLayoutName {
  if (
    typeof value === 'string' &&
    SUPPORTED_LAYOUTS.includes(value as GraphLayoutName)
  ) {
    return value as GraphLayoutName
  }
  throw new GraphToolError(
    `layout must be one of ${SUPPORTED_LAYOUTS.join(', ')}.`,
  )
}

function getNodeShape(value: unknown): GraphNodeShape | undefined {
  if (value == null) return undefined
  if (
    typeof value === 'string' &&
    SUPPORTED_NODE_SHAPES.includes(value as GraphNodeShape)
  ) {
    return value as GraphNodeShape
  }
  throw new GraphToolError(
    `nodeShape must be one of ${SUPPORTED_NODE_SHAPES.join(', ')}.`,
  )
}

function getCurveStyle(value: unknown): GraphCurveStyle | undefined {
  if (value == null) return undefined
  if (
    typeof value === 'string' &&
    SUPPORTED_CURVE_STYLES.includes(value as GraphCurveStyle)
  ) {
    return value as GraphCurveStyle
  }
  throw new GraphToolError(
    `curveStyle must be one of ${SUPPORTED_CURVE_STYLES.join(', ')}.`,
  )
}

function getNumber(
  input: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = input?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getBoolean(
  input: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = input?.[key]
  return typeof value === 'boolean' ? value : undefined
}

export function getGraphContextHandler(
  context: PureGraphAgentContext,
): AgentToolHandlerResult {
  return ok(formatAgentToolJson(context.getContext()))
}

export async function loadGraphHandler(
  context: PureGraphAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  const sample = getString(invoke.arguments, 'sample')
  if (sample) return ok(await context.loadSample(sample))
  const data = getString(invoke.arguments, 'data')
  if (!data) {
    throw new GraphToolError(
      'Provide graph data (JSON, CSV, or TSV), or a sample id to open a built-in sample.',
    )
  }
  const parsed = parseGraphInput(data)
  return ok(JSON.stringify({ ...JSON.parse(await context.loadGraph(parsed.elements, 'agent', { replace: getBoolean(invoke.arguments, 'replace') })), importNotes: parsed.notes }))
}

export async function importGraphFileHandler(
  context: PureGraphAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  const path = getString(invoke.arguments, 'path')
  if (!path) throw new GraphToolError('Provide an absolute path.')
  const data = await context.readGraphFile(path)
  const parsed = parseGraphInput(data)
  return ok(JSON.stringify({ ...JSON.parse(await context.loadGraph(parsed.elements, path, { replace: getBoolean(invoke.arguments, 'replace') })), importNotes: parsed.notes }))
}

export async function addNodeHandler(
  context: PureGraphAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  return ok(
    await context.addNode({
      id: getString(invoke.arguments, 'id'),
      label: getString(invoke.arguments, 'label'),
    }),
  )
}

export async function addEdgeHandler(
  context: PureGraphAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  const source = getString(invoke.arguments, 'source')
  const target = getString(invoke.arguments, 'target')
  if (!source || !target) {
    throw new GraphToolError('Provide source and target node ids.')
  }
  return ok(
    await context.addEdge({
      source,
      target,
      id: getString(invoke.arguments, 'id'),
      label: getString(invoke.arguments, 'label'),
    }),
  )
}

export async function setNodeLabelHandler(
  context: PureGraphAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  const id = getString(invoke.arguments, 'id')
  const label =
    typeof invoke.arguments?.label === 'string' ? invoke.arguments.label : undefined
  if (!id || label == null) {
    throw new GraphToolError('Provide an element id and label.')
  }
  return ok(await context.setElementLabel(id, label))
}

export async function removeElementHandler(
  context: PureGraphAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  const id = getString(invoke.arguments, 'id')
  if (!id) throw new GraphToolError('Provide an element id.')
  return ok(await context.removeElement(id))
}

export async function clearGraphHandler(
  context: PureGraphAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  return ok(
    await context.clearGraph({
      confirm: getBoolean(invoke.arguments, 'confirm'),
    }),
  )
}

export async function runLayoutHandler(
  context: PureGraphAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  return ok(await context.runLayout(getLayoutName(invoke.arguments?.name)))
}

export async function setStyleHandler(
  context: PureGraphAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  return ok(
    await context.setStyle({
      backgroundColor: getString(invoke.arguments, 'backgroundColor'),
      nodeColor: getString(invoke.arguments, 'nodeColor'),
      edgeColor: getString(invoke.arguments, 'edgeColor'),
      nodeShape: getNodeShape(invoke.arguments?.nodeShape),
      curveStyle: getCurveStyle(invoke.arguments?.curveStyle),
      nodeSize: getNumber(invoke.arguments, 'nodeSize'),
      edgeWidth: getNumber(invoke.arguments, 'edgeWidth'),
      labelSize: getNumber(invoke.arguments, 'labelSize'),
      showLabels: getBoolean(invoke.arguments, 'showLabels'),
      directed: getBoolean(invoke.arguments, 'directed'),
      showEdgeLabels: getBoolean(invoke.arguments, 'showEdgeLabels'),
      showLegend: getBoolean(invoke.arguments, 'showLegend'),
      labelPlacement: invoke.arguments?.labelPlacement === 'inside' ? 'inside' : invoke.arguments?.labelPlacement === 'outside' ? 'outside' : undefined,
      categoryColors: invoke.arguments?.categoryColors && typeof invoke.arguments.categoryColors === 'object' ? invoke.arguments.categoryColors as Record<string, string> : undefined,
    }),
  )
}

export async function fitHandler(
  context: PureGraphAgentContext,
): Promise<AgentToolHandlerResult> {
  context.fit()
  return ok('Zoomed to fit.')
}

export async function saveGraphHandler(
  context: PureGraphAgentContext,
): Promise<AgentToolHandlerResult> {
  const path = await context.saveGraph()
  return ok(formatAgentToolJson({ artifactPaths: [path] }))
}

export async function exportGraphHandler(
  context: PureGraphAgentContext,
  invoke: AgentToolInvokeContext,
): Promise<AgentToolHandlerResult> {
  const rawFormat = getString(invoke.arguments, 'format') ?? 'png'
  if (rawFormat !== 'png' && rawFormat !== 'svg' && rawFormat !== 'json' && rawFormat !== 'html') {
    throw new GraphToolError('format must be png, svg, json or html.')
  }
  return ok(
    await context.exportGraph({
      format: rawFormat,
      options: { ...DEFAULT_EXPORT_OPTIONS, scope: invoke.arguments?.scope === 'view' ? 'view' : invoke.arguments?.scope === 'selected' ? 'selected' : 'all', html: { attributeKeys: Array.isArray(invoke.arguments?.attributeKeys) ? invoke.arguments.attributeKeys.filter((key): key is string => typeof key === 'string') : [], includeViews: invoke.arguments?.includeViews !== false, initialViewId: getString(invoke.arguments, 'initialViewId') } },
      filename: getString(invoke.arguments, 'filename'),
    }),
  )
}
