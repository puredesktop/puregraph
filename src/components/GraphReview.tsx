import type { GraphDocument } from '../lib/graphDocument'
import { reviewGraphColors } from '../lib/graphPalette'
import { GraphPanel } from './GraphPanel'
import styled from 'styled-components'
import { useMemo } from 'react'
import type { GraphElement } from '../lib/graphParser'
import { connectedComponents, cycleSelectionIds, findCycle, graphMetrics } from '../lib/graphAnalysis'

const Review = styled(GraphPanel)`
  button { text-align: left; }
`

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
`

const MetricCard = styled.div`
  border: 1px solid var(--pure-chrome-line, #dce1e5);
  border-radius: 6px;
  padding: 6px 8px;
  background: var(--pure-chrome-surface, white);
  strong { display: block; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
  span { font-size: 11px; color: var(--pure-chrome-muted, #67727d); }
`

export function GraphReview({
  document,
  elements,
  directed,
  onSelect,
}: {
  document: GraphDocument
  elements: GraphElement[]
  directed: boolean
  selectedIds?: string[]
  onSelect: (ids: string[]) => void
}) {
  const analysis = useMemo(
    () => ({
      components: connectedComponents(elements),
      cycle: findCycle(elements, directed),
      metrics: graphMetrics(elements, directed),
    }),
    [elements, directed],
  )
  const colorWarnings = useMemo(() => reviewGraphColors(document), [document])
  const { metrics } = analysis
  return (
    <Review aria-label="Graph analysis">
      <h2>Review</h2>
      <p>
        {metrics.nodeCount} nodes · {metrics.edgeCount} edges · {analysis.components.length} weakly connected components
      </p>
      <MetricGrid aria-label="Network metrics">
        <MetricCard>
          <strong>{metrics.density.toFixed(3)}</strong>
          <span>Density</span>
        </MetricCard>
        <MetricCard>
          <strong>{metrics.averageDegree.toFixed(2)}</strong>
          <span>Average degree</span>
        </MetricCard>
        <MetricCard>
          <strong>{metrics.selfLoopCount}</strong>
          <span>Self-loops</span>
        </MetricCard>
        <MetricCard>
          <strong>{metrics.isolatedNodeIds.length}</strong>
          <span>Isolated nodes</span>
        </MetricCard>
      </MetricGrid>
      {metrics.isolatedNodeIds.length > 0 && (
        <button type="button" onClick={() => onSelect(metrics.isolatedNodeIds)}>
          Select isolated nodes ({metrics.isolatedNodeIds.length})
        </button>
      )}
      {metrics.topHubs.length > 0 && (
        <>
          <h3>Top hubs by degree</h3>
          {metrics.topHubs.map(hub => (
            <button key={hub.id} type="button" onClick={() => onSelect([hub.id])}>
              {hub.label} · degree {hub.degree}
              {directed ? ` (${hub.inDegree} in / ${hub.outDegree} out)` : ''}
            </button>
          ))}
        </>
      )}
      <h3>Structure</h3>
      <p>
        Components ignore arrow direction. Paths count edges equally and {directed ? 'follow arrows' : 'can travel either way'}.
      </p>
      {analysis.components.slice(0, 30).map((component, index) => (
        <button key={component[0]} type="button" onClick={() => onSelect(component)}>
          Component {index + 1} · {component.length} nodes
        </button>
      ))}
      <p>
        {analysis.cycle
          ? `Cycle found: ${analysis.cycle.join(' → ')}`
          : `No ${directed ? 'directed' : 'undirected'} cycles found.`}
      </p>
      {analysis.cycle && (
        <button
          type="button"
          onClick={() => onSelect(cycleSelectionIds(elements, analysis.cycle!, directed))}
        >
          Select cycle
        </button>
      )}
      <h3>Color accessibility</h3>
      {colorWarnings.length ? (
        colorWarnings.map(warning => <p key={warning}>{warning}</p>)
      ) : (
        <p>Measured colors pass the current contrast and separation checks.</p>
      )}
      <p>
        Checks simulate protanopia, deuteranopia and tritanopia. They are guidance, not an accessibility certification; keep labels and shapes as additional cues.
      </p>
      <p>Use Explore for neighborhoods, paths, filters, and saved views.</p>
    </Review>
  )
}
