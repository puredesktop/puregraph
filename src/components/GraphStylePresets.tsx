import { graphPalettePlan } from '../lib/graphPalette'
import type { GraphCommand } from '../lib/graphCommands'
import { GraphPanel } from './GraphPanel'
import styled from 'styled-components'
import { useMemo, useState } from 'react'
import type { GraphDocument } from '../lib/graphDocument'
import { DEFAULT_GRAPH_STYLE, normalizeGraphStyle } from '../lib/graphDocument'
import type { GraphStyleState } from '../agents/context'
import { graphLegend } from '../lib/graphLegend'
const Presets = styled(GraphPanel)`
  input[type=color] { padding: 3px; width: 38px; height: 30px; border: 1px solid var(--pure-chrome-line, #dce1e5); border-radius: 6px; background: var(--pure-chrome-surface, white); }
`
const KEY = 'puregraph:style-presets'
const BUILTIN: Record<string, GraphStyleState> = {
  Paper: { ...DEFAULT_GRAPH_STYLE },
  Diagram: { ...DEFAULT_GRAPH_STYLE, labelPlacement: 'inside', nodeShape: 'round-rectangle', nodeSize: 28 },
  Midnight: { ...DEFAULT_GRAPH_STYLE, backgroundColor: '#182332', nodeColor: '#587caa', edgeColor: '#c3cfde' },
  Blueprint: { ...DEFAULT_GRAPH_STYLE, backgroundColor: '#edf3f9', nodeColor: '#4169a8', edgeColor: '#6282a7', nodeShape: 'ellipse', curveStyle: 'straight' },
}
export function GraphStylePresets({ document, onStyle, onCommand }: { document: GraphDocument; onCommand: (commands: GraphCommand[]) => void; onStyle: (style: Partial<GraphStyleState>) => void }) {
  const [presets, setPresets] = useState<Record<string, GraphStyleState>>(() => {
    try { const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return Object.fromEntries(Object.entries(raw).map(([name, style]) => [name, normalizeGraphStyle(style as GraphStyleState)])) } catch { return {} }
  })
  const [name, setName] = useState(''), [error, setError] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const palette = useMemo(() => { if (!paletteOpen) return { plan: null, error: '' }; try { return { plan: graphPalettePlan(document), error: '' } } catch (error) { return { plan: null, error: String(error) } } }, [document, paletteOpen])
  const categories = [...new Set(graphLegend(document).map(entry => entry.label))]
  return <Presets aria-label="Style presets">
    <h2 style={{ fontSize: 16, margin: 0 }}>Style</h2>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{Object.entries({ ...BUILTIN, ...presets }).map(([title, style]) => <button key={title} onClick={() => onStyle({ ...style, categoryColors: style.categoryColors ?? {}, showLegend: style.showLegend ?? false })}>{title}</button>)}</div>
    <h3>Category palette</h3>
    <p>Measured against this background and every category pair, including simulated color vision differences.</p>
    <button disabled={!document.elements.some(element => element.data.source === undefined)} onClick={() => setPaletteOpen(value => !value)}>Generate palette</button>
    {paletteOpen && <>
      {palette.error && <p role="alert">{palette.error}</p>}
      {palette.plan && <>
        <div aria-label="Generated palette" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{palette.plan.groups.map(group => <span key={group.label} title={group.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}><span style={{ width: 14, height: 14, borderRadius: '50%', background: palette.plan!.categoryColors[group.label] }} />{group.label}</span>)}</div>
        <p>{palette.plan.overflow ? `${palette.plan.colors.length} categories can be separated by this generator; ${palette.plan.overflow} additional categories will share gray. Keep distinct shapes and labels, or reduce categories.` : `${palette.plan.groups.length} categories pass the generator’s contrast and color separation checks.`}</p>
        <p>Replaces node colors and enables the legend. Unnamed color groups become categories. Shapes and connections stay the same.</p>
        <button onClick={() => { onCommand(palette.plan!.commands); setPaletteOpen(false) }}>Apply generated palette</button>
      </>}
    </>}
    <label>Preset name<input value={name} onChange={event => setName(event.target.value)} /></label>
    <button disabled={!name.trim()} onClick={() => { try { const next = { ...presets, [name.trim()]: document.style }; localStorage.setItem(KEY, JSON.stringify(next)); setPresets(next); setError('') } catch { setError('Could not store this preset. The document still keeps its styling.') } }}>Save current style</button>
    <label><input type="checkbox" checked={document.style.showLegend ?? false} onChange={event => onStyle({ showLegend: event.target.checked })} /> Show category legend</label>
    {categories.map(category => <label key={category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>{category}<input aria-label={`${category} category color`} type="color" value={document.style.categoryColors?.[category] ?? graphLegend(document).find(entry => entry.label === category)!.color} onChange={event => onStyle({ categoryColors: { ...document.style.categoryColors, [category]: event.target.value } })} /></label>)}
    {error && <p role="alert">{error}</p>}
  </Presets>
}
