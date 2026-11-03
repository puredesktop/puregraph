import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultGraphDocument, type GraphDocument } from '../lib/graphDocument'
import { GraphWorkspace } from './GraphWorkspace'

// Cytoscape draws on a real canvas, which this environment does not have. Everything asked of it here answers quietly.
vi.mock('cytoscape', () => {
  const quiet = (): unknown => new Proxy(function () {} as object, {
    get: (_target, key) => {
      if (key === Symbol.iterator) return function* () {}
      if (key === 'length') return 0
      if (key === Symbol.toPrimitive) return () => 0
      if (key === 'then') return undefined
      return quiet()
    },
    apply: () => quiet(),
  })
  const factory = Object.assign(() => quiet(), { use: () => {} })
  return { default: factory }
})
vi.mock('@purescience/platform-ui/components/assets/CrossAppDragHandle', () => ({ CrossAppDragHandle: () => <span data-testid="drag" /> }))
vi.mock('../hooks/usePureGraphAgentTools', () => ({ usePureGraphAgentTools: vi.fn() }))
vi.mock('../bridge/platformBridge', () => ({
  readTextFile: vi.fn(), writeTextFile: vi.fn(), writeBinaryFile: vi.fn(), openExportDialog: vi.fn(), openAssistantDrawer: vi.fn(),
  isStandaloneDevMode: () => false, updateGraphSettings: vi.fn(),
}))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root, container: HTMLDivElement
const document_: GraphDocument = { ...defaultGraphDocument(), title: 'People', elements: [{ group: 'nodes', data: { id: 'a', label: 'A' }, position: { x: 0, y: 0 } }] as GraphDocument['elements'] }
const props = () => ({
  ready: false, boot: { prefs: {}, appSettings: {} } as never, proposal: null, onPropose: () => '', onApplyProposal: vi.fn(), onDiscardProposal: vi.fn(),
  currentDocument: document_, documentPath: '/Documents/people.graph', documentTitle: 'People', loadedDocument: null, message: null,
  onSaveDocument: async () => null, onLoadSample: async () => {}, onCreateGraph: async () => {}, canUndo: false, canRedo: false, onUndo: vi.fn(), onRedo: vi.fn(),
  saveStatus: 'Saved', onRetrySave: vi.fn(), onCommand: vi.fn(),
})
const controls = () => container.querySelector<HTMLElement>('#puregraph-controls')!
const hiddenByCompact = (element: Element) => element.closest('[data-compact="hide"]') !== null

beforeEach(async () => {
  localStorage.setItem('puregraph.controlsOpen', 'open')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<GraphWorkspace {...props()} compact />))
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear() })

it('held in a page, the graph has the box and the controls are closed, whatever the full app remembers', () => {
  expect(controls().hidden).toBe(true)
  expect(container.querySelector('[data-compact="workspace"]')?.getAttribute('data-controls-hidden')).toBe('true')
  expect(container.querySelector('[data-compact="host"]')).toBeTruthy()
})

it('the controls open beside it with only what edits it; the full app\'s own choice is untouched', async () => {
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show controls"]')!.click())
  expect(controls().hidden).toBe(false)
  const tabs = [...controls().querySelectorAll('nav button')].filter(tab => !hiddenByCompact(tab)).map(tab => tab.textContent)
  expect(tabs).toEqual(['Data', 'Graph', 'Style'])
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Hide controls"]')!.click())
  expect(localStorage.getItem('puregraph.controlsOpen')).toBe('open')
})

it('Full app gives the whole app back with the same canvas and no remount', async () => {
  const host = container.querySelector('main')
  await act(async () => root.render(<GraphWorkspace {...props()} compact={false} />))
  expect(container.querySelector('main')).toBe(host)
  expect(container.querySelector('[data-compact]')).toBeNull()
  expect(controls().hidden).toBe(false)
})
