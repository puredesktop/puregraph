import type { GraphDocument } from '../lib/graphDocument'
import { reviewGraphColors } from '../lib/graphPalette'
import { GraphPanel } from './GraphPanel'
import styled from 'styled-components'
import { useMemo, useState } from 'react'
import type { GraphElement } from '../lib/graphParser'
import { connectedComponents, findCycle, neighborhood, shortestPath } from '../lib/graphAnalysis'

const Review = styled(GraphPanel)`
  button { text-align: left; }
`

export function GraphReview({ document, elements, directed, selectedIds, onSelect }: {
  document: GraphDocument; elements: GraphElement[]; directed: boolean; selectedIds: string[]; onSelect: (ids: string[]) => void
}) {
  const [start, setStart] = useState(''), [end, setEnd] = useState(''), [message, setMessage] = useState('')
  const analysis = useMemo(() => ({ components: connectedComponents(elements), cycle: findCycle(elements, directed) }), [elements, directed])
  const colorWarnings = useMemo(() => reviewGraphColors(document), [document])
  const selected = selectedIds.find(id => elements.some(element => element.data.id === id && !element.data.source))
  function run(action: () => void) { try { action() } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } }
  return <Review aria-label="Graph analysis">
    <h2>Review</h2>
    <p>{elements.filter(element => !element.data.source).length} nodes · {analysis.components.length} weakly connected components</p>
    <p>Components ignore arrow direction. Paths count edges equally and {directed ? 'follow arrows' : 'can travel either way'}.</p>
    {analysis.components.slice(0, 30).map((component, index) => <button key={component[0]} onClick={() => onSelect(component)}>Component {index + 1} · {component.length} nodes</button>)}
    <p>{analysis.cycle ? `Cycle found: ${analysis.cycle.join(' → ')}` : `No ${directed ? 'directed' : 'undirected'} cycles found.`}</p>
    {analysis.cycle && <button onClick={() => onSelect(analysis.cycle!)}>Select cycle</button>}
    <h3>Color accessibility</h3>
    {colorWarnings.length ? colorWarnings.map(warning => <p key={warning}>{warning}</p>) : <p>Measured colors pass the current contrast and separation checks.</p>}
    <p>Checks simulate protanopia, deuteranopia and tritanopia. They are guidance, not an accessibility certification; keep labels and shapes as additional cues.</p>
    <p>Use Explore for neighborhoods, paths, filters, and saved views.</p>
    <p role="status">{message}</p>
  </Review>
}
