import { useState } from 'react'
import { SelectField } from '@purescience/platform-ui/components/common/inputs/SelectField'
import { GraphPanel } from './GraphPanel'
import { SUPPORTED_NODE_SHAPES } from '../constants'
import { encodingDomain, encodingLegend, type GraphEncoding } from '../lib/graphEncoding'
import { generateGraphPalette } from '../lib/graphPalette'
import type { GraphDocument } from '../lib/graphDocument'
import type { GraphCommand } from '../lib/graphCommands'
export function GraphEncodings({ document, onCommand }: { document: GraphDocument; onCommand: (commands: GraphCommand[]) => void }) {
  const [channel, setChannel] = useState<GraphEncoding['channel']>('nodeSize'), [field, setField] = useState(''), [message, setMessage] = useState('')
  const fields = [...new Set(document.elements.filter(element => !!element.data.source === (channel === 'edgeWidth')).flatMap(element => Object.keys(element.data)))].filter(key => !['id', 'source', 'target'].includes(key)).sort()
  return <GraphPanel><details><summary>Map data to appearance</summary><p>Mappings update as data changes. Explicit element styling takes precedence; reset overrides in Explore to use a mapping.</p>
    <SelectField aria-label="Encoding channel" value={channel} options={['nodeSize', 'nodeColor', 'nodeShape', 'edgeWidth'].map(value => ({ value, label: ({ nodeSize: 'Node size', nodeColor: 'Node color', nodeShape: 'Node shape', edgeWidth: 'Edge width' } as Record<string, string>)[value] }))} onValueChange={value => setChannel(value as GraphEncoding['channel'])} />
    <SelectField aria-label="Encoding attribute" value={field} options={[{ value: '', label: 'Choose an attribute' }, ...fields.map(value => ({ value, label: value }))]} onValueChange={setField} />
    <button onClick={() => { try {
      if (!field) throw new Error('Choose an attribute.')
      const encoding: GraphEncoding = { channel, field }, domain = encodingDomain(document, encoding)
      if (channel === 'nodeColor' || channel === 'nodeShape') {
        const categories = [...new Set(domain.map(String))].sort()
        if (!categories.length) throw new Error('This attribute has no values.')
        const palette = channel === 'nodeColor' ? generateGraphPalette(categories.length, document.style.backgroundColor) : null
        encoding.values = Object.fromEntries(categories.map((value, index) => [value, palette ? palette.colors[index] ?? palette.neutral : SUPPORTED_NODE_SHAPES[index % SUPPORTED_NODE_SHAPES.length]]))
        setMessage(palette?.overflow ? `${palette.overflow} categories share a neutral fallback; use labels or shapes too.` : categories.length > SUPPORTED_NODE_SHAPES.length && channel === 'nodeShape' ? 'Shapes repeat; keep labels or colors as additional cues.' : '')
      } else { if (!domain.some(value => Number.isFinite(Number(value)))) throw new Error('Choose an attribute containing numbers.'); setMessage('') }
      onCommand([{ type: 'encodings', encodings: [...(document.encodings ?? []).filter(item => item.channel !== channel), encoding] }, { type: 'style', style: { showLegend: true } }])
    } catch (error) { setMessage(String(error)) } }}>Apply mapping</button>
    {(document.encodings ?? []).map(encoding => <div key={encoding.channel}><p>{encoding.channel} ← {encoding.field}</p><button onClick={() => onCommand([{ type: 'encodings', encodings: document.encodings!.filter(item => item.channel !== encoding.channel) }])}>Remove {encoding.channel} mapping</button></div>)}
    {encodingLegend(document).map(entry => <p key={entry.label}>{entry.label}</p>)}<p role="status">{message}</p>
  </details></GraphPanel>
}
