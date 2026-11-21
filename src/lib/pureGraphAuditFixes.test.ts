import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import cytoscape from 'cytoscape'
import { describe, expect, it, vi } from 'vitest'
import pluginManifest from '../../plugin.json'
import { buildStyle, graphEdgeColor, graphNodeColor } from '../canvas/graphStyle'
import { restoreGraphCanvas } from '../canvas/graphCanvas'
import { graphHtml, graphHtmlPayload } from '../canvas/graphHtml'
import { useGraphSession } from '../hooks/useGraphSession'
import { cycleSelectionIds, findCycle, graphMetrics } from './graphAnalysis'
import { applyGraphCommands } from './graphCommands'
import { csvEscapeCell, graphEdgesCsv, graphNodesCsv } from './graphCsv'
import { defaultGraphDocument, isSafeColor, normalizeGraphStyle, parseGraphDocument, safeColorString } from './graphDocument'
import { encodedGraphDocument, isNumericEncodingValue } from './graphEncoding'
import { emptyGraphView, graphCategory } from './graphExplore'
import { previewGraphImport } from './graphImport'
import { parseGraphInput } from './graphInput'
import { alignNodePositions, distributeNodePositions, layoutGraph } from './graphLayout'
import { graphCategoryLegend, graphLegend } from './graphLegend'
import { mergeGraphs } from './graphMerge'
import { reviewGraphColors } from './graphPalette'
import { graphAssetExportPath, sanitizeFileName } from './graphPaths'
import { readStoredProposal, storeProposal } from './graphProposal'
import { validateElements } from './graphValidation'
import { GraphNodePicker } from '../components/GraphNodePicker'
import { GraphStylePresets } from '../components/GraphStylePresets'
import { GraphExplore } from '../components/GraphExplore'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

describe('PureGraph audit security & validation fixes', () => {
  it('enforces strict CSS color allowlist for style and element colors while keeping valid CSS colors', () => {
    const injected = normalizeGraphStyle({
      backgroundColor: 'url(https://evil.example/leak)',
      nodeColor: 'expression(alert(1))',
      edgeColor: 'red; background-image: url(x)',
    })
    expect(injected.backgroundColor).toBe('#ffffff')
    expect(injected.nodeColor).toBe('#668b9b')
    expect(injected.edgeColor).toBe('#9aa8b6')

    const bypassAttempts = [
      'var(--secret)',
      'image-set(url("https://evil.example/x.png") 1x)',
      'linear-gradient(red, blue)',
      'calc(1 + 1)',
      '#fff { color: red }',
      'red}body{',
      'rgb(1, 2, url(x))',
    ]
    for (const bad of bypassAttempts) {
      expect(isSafeColor(bad)).toBe(false)
      expect(safeColorString(bad, '#000000')).toBe('#000000')
    }

    const valid = normalizeGraphStyle({
      backgroundColor: '#182332',
      nodeColor: 'rebeccapurple',
      edgeColor: 'rgb(12, 34, 56)',
    })
    expect(valid.backgroundColor).toBe('#182332')
    expect(valid.nodeColor).toBe('rebeccapurple')
    expect(valid.edgeColor).toBe('rgb(12, 34, 56)')
    expect(normalizeGraphStyle({ nodeColor: 'hsl(210, 40%, 50%)' }).nodeColor).toBe('hsl(210, 40%, 50%)')
    expect(isSafeColor('oklch(0.65 0.15 180 / 90%)')).toBe(true)
    expect(isSafeColor('#abcd')).toBe(true)
    expect(isSafeColor('#11223380')).toBe(true)

    // Element-level color overrides also enforce the allowlist.
    const style = defaultGraphDocument().style
    expect(graphNodeColor({ id: 'a', color: 'image-set(url(x))' }, style)).toBe(style.nodeColor)
    expect(graphNodeColor({ id: 'a', color: 'rgb(10, 20, 30)' }, style)).toBe('rgb(10, 20, 30)')
    expect(graphEdgeColor({ id: 'e', color: 'url(https://evil.example)' }, style)).toBe(style.edgeColor)
    expect(graphEdgeColor({ id: 'e', color: '#112233' }, style)).toBe('#112233')
  })

  it('strips leading dots in sanitizeFileName and rejects traversal and control chars in graphAssetExportPath', () => {
    expect(sanitizeFileName('..', 'png')).toBe('graph.png')
    expect(sanitizeFileName('.', 'svg')).toBe('graph.svg')
    expect(sanitizeFileName('.env', 'png')).toBe('env.png')
    expect(sanitizeFileName('...secret..name', 'json')).toBe('secret_name.json')
    expect(sanitizeFileName('graph.png', 'csv')).toBe('graph.csv')

    expect(() => graphAssetExportPath('/tmp/a.graph', '../escape.png', '/tmp')).toThrow('Invalid export filename')
    expect(() => graphAssetExportPath('/tmp/a.graph', 'sub/file.png', '/tmp')).toThrow('Invalid export filename')
    expect(() => graphAssetExportPath('/tmp/a.graph', 'sub\\file.png', '/tmp')).toThrow('Invalid export filename')
    expect(() => graphAssetExportPath('/tmp/a.graph', '.hidden.png', '/tmp')).toThrow('Invalid export filename')
    expect(() => graphAssetExportPath('/tmp/a.graph', 'bad\0name.png', '/tmp')).toThrow('Invalid export filename')
    expect(() => graphAssetExportPath('/tmp/a.graph', 'bad\nname.png', '/tmp')).toThrow('Invalid export filename')
    expect(() => graphAssetExportPath('/tmp/a.graph', 'bad\rname.png', '/tmp')).toThrow('Invalid export filename')
    expect(() => graphAssetExportPath('/tmp/a.graph', '   ', '/tmp')).toThrow('Invalid export filename')
  })

  it('normalizes 3-digit and hashless hex in reviewGraphColors composite without NaN', () => {
    const doc = {
      ...defaultGraphDocument(),
      style: {
        ...defaultGraphDocument().style,
        backgroundColor: '#fff',
        edgeColor: '#fff',
        showEdgeLabels: true,
      },
      elements: [
        { data: { id: 'a', label: 'A', color: '#112233' } },
        { data: { id: 'b', label: 'B', color: '#334455' } },
        { data: { id: 'ab', source: 'a', target: 'b', label: 'link' } },
      ],
    }
    const warnings = reviewGraphColors(doc)
    expect(warnings.join(' ')).toContain('edges or arrows')

    const hashless = {
      ...doc,
      style: { ...doc.style, backgroundColor: 'ffffff', edgeColor: 'ffffff' },
    }
    expect(reviewGraphColors(hashless).join(' ')).toContain('edges or arrows')
  })

  it('maintains plugin.json tool schema parity for proposeGraph and runLayout', () => {
    const tools = pluginManifest.app.agents.tools
    const propose = tools.find(t => t.name === 'proposeGraph')!
    const cmdProps = propose.inputSchema.properties.commands!.items.properties
    expect(cmdProps.type.enum).toContain('encodings')
    expect(cmdProps.type.enum).toContain('views')
    expect(cmdProps).toHaveProperty('encodings')
    expect(cmdProps).toHaveProperty('views')

    const runLayout = tools.find(t => t.name === 'runLayout')!
    expect(runLayout.inputSchema.properties.name!.enum).toContain('preset')

    const loadGraph = tools.find(t => t.name === 'loadGraph')!
    expect(loadGraph.inputSchema.properties).not.toHaveProperty('sample')
    expect(loadGraph.inputSchema.required).toEqual(['data'])
  })
})

describe('PureGraph data, rendering, command, merge & export fixes', () => {
  it('strips UTF-8 BOM, parses numeric string x/y in CSV, and guards quote-only input', () => {
    const csvWithBom = '\uFEFFid,label,x,y\na,Alpha,100,-25.5\nb,Beta,200,50\n'
    const parsed = parseGraphInput(csvWithBom)
    expect(parsed.elements).toHaveLength(2)
    expect(parsed.elements[0].position).toEqual({ x: 100, y: -25.5 })
    expect(parsed.elements[0].data).not.toHaveProperty('x')
    expect(parsed.elements[0].data).not.toHaveProperty('y')

    const jsonWithBom = `\uFEFF${JSON.stringify({ ...defaultGraphDocument(), title: 'BOM Doc' })}`
    expect(parseGraphDocument(jsonWithBom).title).toBe('BOM Doc')
    expect(previewGraphImport(jsonWithBom).document?.title).toBe('BOM Doc')

    expect(() => parseGraphInput('""')).toThrow(/No data/)
  })

  it('ignores empty-string visual attributes and keeps self-loops bezier under straight/taxi', () => {
    const style = { ...defaultGraphDocument().style, curveStyle: 'straight' as const, categoryColors: { Nodes: '#123456' } }
    expect(graphNodeColor({ id: 'a', color: '', category: '' }, style)).toBe('#123456')
    expect(graphCategory({ data: { id: 'a', category: '   ', cluster: '' } })).toBe('Nodes')
    expect(graphCategory({ data: { id: 'a', category: '', cluster: 'Bio' } })).toBe('Bio')

    const rules = buildStyle(style)
    const loopRule = rules.find(r => r.selector === 'edge:loop')
    expect(loopRule?.style).toMatchObject({ 'curve-style': 'bezier' })
    expect(rules.some(r => r.selector === 'node[size][size != ""]')).toBe(true)
    expect(rules.some(r => r.selector === 'edge[width][width != ""]')).toBe(true)
    expect(rules.some(r => r.selector === 'node[borderWidth][borderWidth != ""]')).toBe(true)
  })

  it('defaults node labels on add/replace, strips undefined on update, validates objects, prunes views, and checks layout ids', () => {
    const base = defaultGraphDocument()
    const added = applyGraphCommands(base, [
      { type: 'add', elements: [{ data: { id: 'a' } }, { data: { id: 'b', label: 'Beta' } }, { data: { id: 'ab', source: 'a', target: 'b' } }] },
    ])
    expect(added.elements[0].data.label).toBe('a')
    expect(added.elements[1].data.label).toBe('Beta')

    const styled = applyGraphCommands(added, [{ type: 'update', ids: ['a'], data: { color: '#ff0000', shape: 'diamond' } }])
    const reset = applyGraphCommands(styled, [{ type: 'update', ids: ['a'], data: { color: undefined, shape: undefined } }])
    expect('color' in reset.elements[0].data).toBe(false)
    expect('shape' in reset.elements[0].data).toBe(false)

    // Verify restoreGraphCanvas clears removed keys on Cytoscape nodes.
    const cy = cytoscape({ headless: true })
    try {
      restoreGraphCanvas(cy, styled)
      expect(cy.getElementById('a').data('color')).toBe('#ff0000')
      restoreGraphCanvas(cy, reset, false)
      expect(cy.getElementById('a').data('color')).toBeUndefined()
    } finally {
      cy.destroy()
    }

    // Plain-object guards.
    expect(() => applyGraphCommands(added, [{ type: 'style', style: null as never }])).toThrow('Style must be an object')
    expect(() => applyGraphCommands(added, [{ type: 'positions', positions: null as never }])).toThrow('Positions must be an object')
    expect(() => applyGraphCommands(added, [{ type: 'positions', positions: { a: null as never } }])).toThrow('Invalid position')

    // Layout validates IDs before running.
    expect(() => applyGraphCommands(added, [{ type: 'layout', name: 'grid', ids: ['missing'] }])).toThrow('No element "missing"')

    // Remove prunes deleted IDs and incident edges from saved views.
    const withViews = applyGraphCommands(added, [
      {
        type: 'views',
        views: [{
          id: 'v1',
          name: 'View',
          caption: '',
          selectedIds: ['a', 'b'],
          state: { ...emptyGraphView(), hiddenIds: ['a', 'ab'], focusIds: ['a', 'b', 'ab'] },
        }],
      },
      { type: 'remove', ids: ['a'] },
    ])
    expect(withViews.views![0].selectedIds).toEqual(['b'])
    expect(withViews.views![0].state.hiddenIds).toEqual([])
    expect(withViews.views![0].state.focusIds).toEqual(['b'])
  })

  it('excludes pinned outlier nodes from both center and generated layout averages', () => {
    const empty = layoutGraph(defaultGraphDocument(), 'grid')
    expect(empty.layout).toBe('grid')
    expect(empty.elements).toEqual([])

    const doc = {
      ...defaultGraphDocument(),
      elements: [
        { data: { id: 'p', pinned: true }, position: { x: 10000, y: 10000 } },
        { data: { id: 'a' }, position: { x: 0, y: 0 } },
        { data: { id: 'b' }, position: { x: 100, y: 0 } },
      ],
    }
    const laidOut = layoutGraph(doc, 'grid')
    expect(laidOut.elements[0].position).toEqual({ x: 10000, y: 10000 })
    // Unpinned nodes remain centered around their original centroid (50, 0), not flung toward (10000, 10000).
    const avgX = (laidOut.elements[1].position!.x + laidOut.elements[2].position!.x) / 2
    const avgY = (laidOut.elements[1].position!.y + laidOut.elements[2].position!.y) / 2
    expect(avgX).toBeCloseTo(50, 3)
    expect(avgY).toBeCloseTo(0, 3)

    const allPinned = {
      ...defaultGraphDocument(),
      elements: [{ data: { id: 'p', pinned: true }, position: { x: 50, y: 60 } }],
    }
    expect(layoutGraph(allPinned, 'circle').elements[0].position).toEqual({ x: 50, y: 60 })
  })

  it('aligns and distributes multi-selected unpinned nodes accurately', () => {
    const elements = [
      { data: { id: 'a' }, position: { x: 10, y: 20 } },
      { data: { id: 'b' }, position: { x: 40, y: 80 } },
      { data: { id: 'c' }, position: { x: 130, y: 50 } },
    ]
    expect(alignNodePositions(elements, ['a', 'b', 'c'], 'left')).toEqual({
      a: { x: 10, y: 20 },
      b: { x: 10, y: 80 },
      c: { x: 10, y: 50 },
    })
    expect(alignNodePositions(elements, ['a', 'b', 'c'], 'middle')).toEqual({
      a: { x: 10, y: 50 },
      b: { x: 40, y: 50 },
      c: { x: 130, y: 50 },
    })
    expect(distributeNodePositions(elements, ['a', 'b', 'c'], 'horizontal')).toEqual({
      a: { x: 10, y: 20 },
      b: { x: 70, y: 80 },
      c: { x: 130, y: 50 },
    })
  })

  it('prunes dangling edges created during 3-way graph merge', () => {
    const base = {
      ...defaultGraphDocument(),
      elements: [
        { data: { id: 'a', label: 'A' }, position: { x: 0, y: 0 } },
        { data: { id: 'b', label: 'B' }, position: { x: 100, y: 0 } },
      ],
    }
    // Remote deletes node b; local adds edge a -> b without touching b.
    const remote = {
      ...base,
      elements: [base.elements[0]],
    }
    const local = {
      ...base,
      elements: [...base.elements, { data: { id: 'ab', source: 'a', target: 'b', label: 'link' } }],
    }
    const merged = mergeGraphs(base, local, remote)
    expect(merged.elements.map(e => e.data.id)).toEqual(['a'])
    expect(() => validateElements(merged.elements)).not.toThrow()
  })

  it('guards storeProposal against storage errors and validates stored proposal.next', () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    try {
      expect(() =>
        storeProposal('quota-test', {
          id: 'p1',
          title: 'Test',
          base: '{}',
          next: defaultGraphDocument(),
          impact: { added: 0, removed: 0, changed: 0, styleChanged: false },
        }),
      ).not.toThrow()
    } finally {
      setSpy.mockRestore()
    }

    localStorage.setItem(
      'puregraph.proposal:corrupt',
      JSON.stringify({
        id: 'p2',
        title: 'Bad',
        base: '{}',
        impact: { added: 0, removed: 0, changed: 0, styleChanged: false },
        next: { schemaVersion: 99, elements: [] },
      }),
    )
    expect(readStoredProposal('corrupt')).toBeNull()
    localStorage.removeItem('puregraph.proposal:corrupt')
  })

  it('exports saved view hidden categories without locking them out via focus, plus pan/zoom and resilient HTML viewer', () => {
    const doc = {
      ...defaultGraphDocument(),
      elements: [
        { data: { id: 'a', label: 'A', category: 'Team' }, position: { x: 10, y: 20 } },
        { data: { id: 'b', label: 'B', category: 'Other' }, position: { x: 100, y: 20 } },
      ],
      views: [
        {
          id: 'v1',
          name: 'Zoomed Team',
          caption: 'Team only',
          selectedIds: ['a'],
          state: { ...emptyGraphView(), hiddenCategories: ['Other'] },
          viewport: { zoom: 1.5, pan: { x: 42, y: -18 } },
        },
        {
          id: 'v2',
          name: 'Focused with hidden category',
          caption: '',
          selectedIds: [],
          state: { ...emptyGraphView(), focusIds: ['a', 'b'], hiddenCategories: ['Other'] },
        },
      ],
    }
    const payload = graphHtmlPayload(doc)
    expect(payload.views[0].hidden).toEqual(['Other'])
    expect(payload.views[0].focus).toBeNull()
    expect(payload.views[0].zoom).toBe(1.5)
    expect(payload.views[0].pan).toEqual({ x: 42, y: -18 })
    // Focus keeps 'b' so unchecking/rechecking 'Other' in the viewer reveals it.
    expect(payload.views[1].hidden).toEqual(['Other'])
    expect(payload.views[1].focus).toEqual(['a', 'b'])

    const html = graphHtml(doc)
    expect(html).toContain("typeof crypto.randomUUID === 'function'")
    expect(html).not.toContain('new ResizeObserver(() => { cy.resize(); fit(); })')
  })

  it('rejects booleans as numeric encoding values and separates category legend from encoding legend', () => {
    expect(isNumericEncodingValue(true)).toBe(false)
    expect(isNumericEncodingValue(false)).toBe(false)
    expect(isNumericEncodingValue('')).toBe(false)
    expect(isNumericEncodingValue('  ')).toBe(false)
    expect(isNumericEncodingValue('42')).toBe(true)
    expect(isNumericEncodingValue(0)).toBe(true)

    const doc = {
      ...defaultGraphDocument(),
      encodings: [{ channel: 'nodeSize' as const, field: 'synthetic' }],
      elements: [
        { data: { id: 'a', category: 'Alpha', synthetic: true } },
        { data: { id: 'b', category: 'Beta', synthetic: false } },
      ],
    }
    const encoded = encodedGraphDocument(doc)
    expect(encoded.elements[0].data.size).toBeUndefined()
    expect(graphCategoryLegend(doc).map(e => e.label)).toEqual(['Alpha', 'Beta'])
    expect(graphLegend(doc).length).toBeGreaterThan(2)
  })

  it('deduplicates cycle node IDs + includes cycle edges, and computes network metrics', () => {
    const elements = [
      { data: { id: 'a', label: 'A' } },
      { data: { id: 'b', label: 'B' } },
      { data: { id: 'c', label: 'C' } },
      { data: { id: 'iso', label: 'Orphan' } },
      { data: { id: 'ab', source: 'a', target: 'b' } },
      { data: { id: 'bc', source: 'b', target: 'c' } },
      { data: { id: 'ca', source: 'c', target: 'a' } },
      { data: { id: 'aa', source: 'a', target: 'a' } },
    ]
    const cycle = findCycle(elements, true)!
    expect(cycle).toEqual(['a', 'b', 'c', 'a'])
    const selectedCycle = cycleSelectionIds(elements, cycle, true)
    expect(new Set(selectedCycle).size).toBe(selectedCycle.length)
    expect(selectedCycle).toEqual(['a', 'b', 'c', 'ab', 'bc', 'ca'])

    const metrics = graphMetrics(elements, true)
    expect(metrics.nodeCount).toBe(4)
    expect(metrics.edgeCount).toBe(4)
    expect(metrics.selfLoopCount).toBe(1)
    expect(metrics.isolatedNodeIds).toEqual(['iso'])
    expect(metrics.density).toBeCloseTo(3 / 12, 5) // 3 non-loop directed edges / (4*3)
    expect(metrics.averageDegree).toBeCloseTo(2, 5)
    expect(metrics.topHubs[0]).toMatchObject({ id: 'a', degree: 4, inDegree: 2, outDegree: 2 })
  })

  it('escapes CSV formula-injection prefixes (including leading whitespace), keeps negative numeric coords, and avoids duplicate x/y columns', () => {
    expect(csvEscapeCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)")
    expect(csvEscapeCell(' =SUM(A1:A2)')).toBe("' =SUM(A1:A2)")
    expect(csvEscapeCell('\n+cmd|calc')).toBe('"\'\n+cmd|calc"')
    expect(csvEscapeCell('+cmd|calc')).toBe("'+cmd|calc")
    expect(csvEscapeCell('-2+3')).toBe("'-2+3")
    expect(csvEscapeCell('-25.5')).toBe("'-25.5")
    expect(csvEscapeCell(-25.5)).toBe('-25.5')
    expect(csvEscapeCell('@SUM(1,1)')).toBe('"\'@SUM(1,1)"')
    expect(csvEscapeCell('\tmalicious')).toBe('"\'\tmalicious"')
    expect(csvEscapeCell('\rmalicious')).toBe('"\'\rmalicious"')
    expect(csvEscapeCell('plain, "quoted"')).toBe('"plain, ""quoted"""')

    const doc = {
      ...defaultGraphDocument(),
      elements: [
        { data: { id: 'n1', label: '=HYPERLINK("x")', category: 'Team', score: 10, x: 999, y: 888 }, position: { x: -12.5, y: 34 } },
        { data: { id: 'n2', label: 'Safe', category: 'Team' }, position: { x: 50, y: -60 } },
        { data: { id: 'e1', source: 'n1', target: 'n2', label: '+edge' } },
      ],
    }
    const nodesCsv = graphNodesCsv(doc)
    const headerLine = nodesCsv.split('\n')[0]
    expect(headerLine).toBe('id,label,category,x,y,score')
    expect(nodesCsv).toContain('"\'=HYPERLINK(""x"")",Team,-12.5,34,10')
    // Re-importing the exported nodes CSV parses negative numeric coordinates cleanly.
    const reimported = parseGraphInput(nodesCsv)
    expect(reimported.elements[0].position).toEqual({ x: -12.5, y: 34 })

    const edgesCsv = graphEdgesCsv(doc)
    expect(edgesCsv).toContain('id,source,target,label')
    expect(edgesCsv).toContain("e1,n1,n2,'+edge")
  })
})

describe('PureGraph UI component regressions', () => {
  it('GraphNodePicker avoids nested button in label, ignores undefined, and supports arrow keys', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const onChange = vi.fn()
    const elements = [
      { data: { id: 'alpha' } },
      { data: { id: 'beta', label: 'Second' } },
    ]
    try {
      await act(async () => {
        root.render(createElement(GraphNodePicker, { label: 'Source', value: 'undefined', onChange, elements }))
      })
      const input = container.querySelector('input[role="combobox"]') as HTMLInputElement
      await act(async () => { input.focus() })
      expect(container.querySelectorAll('button[role="option"]')).toHaveLength(0)

      await act(async () => {
        root.render(createElement(GraphNodePicker, { label: 'Source', value: '', onChange, elements }))
      })
      const options = container.querySelectorAll('button[role="option"]')
      expect(options).toHaveLength(2)
      // No button should be nested inside a <label>.
      expect(container.querySelector('label button')).toBeNull()

      // ArrowDown + Enter selects first option.
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      })
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })
      expect(onChange).toHaveBeenCalledWith('alpha')

      // Reopen dropdown, then Escape closes it and prevents/stops propagation to window shortcuts.
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      })
      expect(container.querySelector('[role="listbox"]')).not.toBeNull()
      let windowSawUnpreventedEscape = false
      const listener = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) windowSawUnpreventedEscape = true }
      window.addEventListener('keydown', listener)
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      })
      window.removeEventListener('keydown', listener)
      expect(container.querySelector('[role="listbox"]')).toBeNull()
      expect(windowSawUnpreventedEscape).toBe(false)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it('GraphStylePresets does not render color pickers for encodingLegend strings', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const doc = {
      ...defaultGraphDocument(),
      encodings: [{ channel: 'nodeSize' as const, field: 'score' }],
      elements: [{ data: { id: 'a', category: 'Team', score: 10 } }],
    }
    try {
      await act(async () => {
        root.render(createElement(GraphStylePresets, { document: doc, onCommand: vi.fn(), onStyle: vi.fn() }))
      })
      const pickers = [...container.querySelectorAll('input[type="color"]')].map(el => el.getAttribute('aria-label'))
      expect(pickers).toEqual(['Team category color'])
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it('GraphExplore Focus selection preserves induced edges between selected nodes', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const onView = vi.fn()
    const onSelect = vi.fn()
    const doc = {
      ...defaultGraphDocument(),
      elements: [
        { data: { id: 'a', label: 'A' } },
        { data: { id: 'b', label: 'B' } },
        { data: { id: 'c', label: 'C' } },
        { data: { id: 'ab', source: 'a', target: 'b' } },
        { data: { id: 'bc', source: 'b', target: 'c' } },
      ],
    }
    try {
      await act(async () => {
        root.render(createElement(GraphExplore, {
          document: doc,
          selectedIds: ['a', 'b'],
          view: emptyGraphView(),
          onView,
          onSelect,
          onCommand: vi.fn(),
          onFit: vi.fn(),
          onSaveView: vi.fn(),
          onOpenView: vi.fn(),
        }))
      })
      const btn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Focus selection')!
      await act(async () => { btn.click() })
      expect(onView).toHaveBeenCalledWith(expect.objectContaining({ focusIds: ['a', 'b', 'ab'] }))
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it('useGraphSession coalesces rapid inspector update commands for the same ids and keys', async () => {
    let session!: ReturnType<typeof useGraphSession>
    function Harness() { session = useGraphSession(); return null }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const doc = { ...defaultGraphDocument(), elements: [{ data: { id: 'a', label: 'A', size: 20 } }] }
    try {
      await act(async () => root.render(createElement(Harness)))
      await act(async () => { session.adopt(doc, 'coalesce-test') })
      await act(async () => {
        session.execute([{ type: 'update', ids: ['a'], data: { size: 24 } }])
        session.execute([{ type: 'update', ids: ['a'], data: { size: 30 } }])
        session.execute([{ type: 'update', ids: ['a'], data: { size: 40 } }])
      })
      expect(session.document.elements[0].data.size).toBe(40)
      await act(async () => { session.move('undo') })
      expect(session.document.elements[0].data.size).toBe(20)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
