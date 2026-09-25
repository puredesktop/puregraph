import type { StylesheetStyle, NodeSingular } from 'cytoscape'
import type { GraphStyleState } from '../agents/context'
import { readableTextColor } from '../lib/contrast'

export const CLUSTER_COLORS: Record<string, string> = {
  source: '#526070',
  climate: '#b04d3f',
  biology: '#3f7f5f',
  mobility: '#2f7886',
  social: '#9b6b2e',
  intervention: '#4169a8',
  model: '#7b5fb2',
  process: '#2f7886',
  output: '#b05a2b',
  outcome: '#3f4f9f',
  memory: '#5e6572',
}

export function buildStyle(style: GraphStyleState): StylesheetStyle[] {
  const outside = style.labelPlacement !== 'inside'
  return [
    { selector: '.explore-hidden', style: { display: 'none' } },
    { selector: '.explore-dim', style: { opacity: 0.12 } },
    {
      selector: 'node',
      style: {
        label: style.showLabels ? 'data(label)' : '',
        shape: style.nodeShape,
        'background-color': (element: NodeSingular) => graphNodeColor(element.data(), style),
        color: (element: NodeSingular) => readableTextColor(outside ? style.backgroundColor : graphNodeColor(element.data(), style)),
        'text-valign': outside ? 'bottom' : 'center',
        'text-margin-y': outside ? 7 : 0,
        'text-halign': 'center',
        'font-size': style.labelSize,
        'font-weight': 500,
        'font-family': 'Geist, Inter, system-ui, sans-serif',
        // External labels give compact marks a consistent size without
        // squeezing text into circles, diamonds, or narrow rectangles.
        'text-max-width': `${Math.max(100, Math.round(style.nodeSize * 2.4))}px`,
        'text-wrap': 'wrap',
        width: outside ? style.nodeSize : 'label',
        height: outside ? style.nodeSize : 'label',
        padding: outside ? '0px' : `${Math.max(6, Math.round(style.nodeSize * 0.16))}px`,
        'border-color': style.backgroundColor,
        'border-width': 1.5,
      },
    },
    {
      selector: 'node[shape = "ellipse"]',
      style: {
        shape: 'ellipse',
      },
    },
    {
      selector: 'node[shape = "round-rectangle"]',
      style: {
        shape: 'round-rectangle',
      },
    },
    {
      selector: 'node[shape = "diamond"]',
      style: {
        shape: 'diamond',
      },
    },
    {
      selector: 'node[shape = "hexagon"]',
      style: {
        shape: 'hexagon',
      },
    },
    {
      selector: 'node[shape = "triangle"]',
      style: {
        shape: 'triangle',
      },
    },
    {
      selector: 'node[size]',
      style: {
        // An explicit size is an instruction, so honour it — but wrap the
        // label to fit rather than letting it run past the edge.
        width: 'data(size)',
        height: 'data(size)',
        padding: '0px',
        'text-max-width': (element: NodeSingular) =>
          `${outside ? Math.max(100, style.nodeSize * 2.4) : Math.max(16, Math.round(Number(element.data('size') ?? 0) * 0.7))}px`,
      },
    },
    {
      selector: 'node[borderWidth]',
      style: {
        'border-width': 'data(borderWidth)',
      },
    },
    {
      selector: 'node[callout]',
      style: {
        label: 'data(label)',
        'font-size': Math.max(8, style.labelSize),
      },
    },
    {
      selector: 'edge',
      style: {
        width: style.edgeWidth,
        'line-color': style.edgeColor,
        'target-arrow-color': style.edgeColor,
        'target-arrow-shape': style.directed ? 'triangle' : 'none',
        'curve-style': style.curveStyle,
        label: style.showLabels && style.showEdgeLabels ? 'data(label)' : '',
        // The label sits on a chip of the canvas colour, so a fixed grey went
        // invisible the moment the background was darkened.
        color: readableTextColor(style.backgroundColor),
        'font-size': Math.max(8, style.labelSize - 2),
        'font-family': 'Geist, Inter, system-ui, sans-serif',
        'font-weight': 400,
        'text-opacity': 0.75,
        'line-opacity': 0.7,
        'arrow-scale': 0.7,
        'text-background-color': style.backgroundColor,
        'text-background-opacity': 0.92,
        'text-background-padding': '2px',
      },
    },
    {
      selector: 'edge[color]',
      style: {
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
      },
    },
    {
      selector: 'edge[width]',
      style: {
        width: 'data(width)',
      },
    },
    {
      selector: ':selected',
      style: {
        'border-width': 2,
        // Near-black selection disappeared entirely on a dark canvas.
        'border-color': readableTextColor(style.backgroundColor),
        'line-color': readableTextColor(style.backgroundColor),
        'target-arrow-color': readableTextColor(style.backgroundColor),
      },
    },
  ]
}


export function graphNodeColor(data: Record<string, unknown>, style: GraphStyleState): string {
  const category = String(data.category ?? data.cluster ?? 'Nodes')
  return typeof data.color === 'string' ? data.color : style.categoryColors?.[category] ?? CLUSTER_COLORS[category] ?? style.nodeColor
}
