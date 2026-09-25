import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { GraphWorkspace } from './components/GraphWorkspace'
const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  writes: [] as string[],
  listeners: new Set<(change: { kind: string; path: string }) => void>(),
  instances: new Map<string, ComponentProps<typeof GraphWorkspace>>(),
  workspace: null as unknown as ComponentProps<typeof GraphWorkspace>,
  open: null as unknown as (path: string) => void,
  fail: false,
  delayed: null as null | (() => Promise<string>),
}))
vi.mock('./bridge/platformBridge', () => ({
  isStandaloneDevMode: () => false,
  readTextFile: async (path: string) => { if (state.delayed) return state.delayed(); if (!state.files.has(path)) throw new Error(`Missing ${path}`); return state.files.get(path)! },
  writeTextFile: async (path: string, text: string) => { state.files.set(path, text) },
  updateGraphSettings: async () => ({}), deleteFile: vi.fn(), updateAssetMetadata: vi.fn(), writeBinaryFile: vi.fn(),
}))
vi.mock('@purescience/platform-ui/bridge/documents', () => ({
  registerPlatformAppObject: vi.fn(),
  createPlatformDraft: async ({ title, files }: { title: string; files: { name: string; content: string }[] }) => {
    const path = `/Drafts/${title}.graph`
    files.forEach(file => state.files.set(`${path}/${file.name}`, file.content))
    return { path }
  },
  autosavePlatformDocument: async ({ path, files, revision }: { revision?: { file: string; field: string; expected: string | null }; path: string; files: { name: string | null; content: string }[] }) => {
    if (state.fail) throw new Error('Disk is read only')
    if (revision && (JSON.parse(state.files.get(`${path}/${revision.file}`) ?? '{}')[revision.field] ?? null) !== revision.expected) throw new Error('Save conflict: changed in another window')
    state.writes.push(path)
    files.forEach(file => state.files.set(file.name ? `${path}/${file.name}` : path, file.content))
    return { savedAt: new Date().toISOString() }
  },
  onPlatformDocumentsChanged: (listener: (change: { kind: string; path: string }) => void) => { state.listeners.add(listener); return () => state.listeners.delete(listener) }, touchPlatformRecentDocument: async () => {},
  duplicatePlatformDocument: vi.fn(), promotePlatformDocument: vi.fn(), renamePlatformDocument: vi.fn(),
}))
vi.mock('@purescience/platform-ui/bridge/client', () => ({ bridge: { onEvent: () => () => {}, call: async () => ({}) } }))
vi.mock('@purescience/platform-ui/bridge/react/usePlatformBridge', () => ({ usePlatformBridge: () => ({ ready: true, meta: {}, error: null }) }))
vi.mock('@purescience/platform-ui/bridge/react/usePlatformViewportResource', () => ({ usePlatformViewportResource: () => ({ resource: null, clearResource: () => {} }) }))
vi.mock('@purescience/platform-ui/bridge/react/useDocumentHotkeys', () => ({ useDocumentHotkeys: () => {} }))
vi.mock('./hooks/usePureGraphBoot', () => ({ usePureGraphBoot: () => ({ boot: { appSettings: {} }, bootError: null }) }))
vi.mock('@purescience/platform-bridge/components/AppFrame', () => ({ AppFrame: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@purescience/platform-ui/components/common/documents', () => ({ DocumentHeaderActions: () => null, DocumentSwitcher: (props: { onOpenDocument: (path: string) => void }) => { state.open = props.onOpenDocument; return null } }))
vi.mock('./components/GraphWorkspace', async () => { const { useId } = await import('react'); return { GraphWorkspace: (props: ComponentProps<typeof GraphWorkspace>) => { state.instances.set(useId(), props); state.workspace = props; return null } } })
import { App } from './App'
import { defaultGraphDocument } from './lib/graphDocument'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function mount() {
  state.instances.clear(); state.files.clear(); state.writes.length = 0; state.listeners.clear(); state.fail = false; state.delayed = null
  for (const title of ['A', 'B']) state.files.set(`/${title}.graph/graph.graph.json`, JSON.stringify({ ...defaultGraphDocument(), title, elements: [{ data: { id: title }, position: { x: 17, y: 91 } }] }))
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(<App />))
  await act(async () => state.open('/A.graph'))
  return root
}
it('blocks document replacement when the outgoing save fails', async () => {
  const root = await mount()
  try {
    state.fail = true
    await act(async () => state.open('/B.graph'))
    expect(state.workspace.documentTitle).toBe('A')
    expect(state.workspace.message).toContain('Disk is read only')
    state.fail = false
    await act(async () => state.open('/B.graph'))
    expect(state.workspace.documentTitle).toBe('B')
  } finally { await act(async () => root.unmount()) }
})
it('adopts external changes without echo writes', async () => {
  const root = await mount()
  try {
    state.writes.length = 0
    state.files.set('/A.graph/graph.graph.json', JSON.stringify({ ...defaultGraphDocument(), title: 'External' }))
    await act(async () => state.listeners.forEach(listener => listener({ kind: 'content', path: '/A.graph' })))
    expect(state.workspace.documentTitle).toBe('External')
    expect(state.writes).toEqual([])
  } finally { await act(async () => root.unmount()) }
})
it('rejects a delayed read after a local edit', async () => {
  const root = await mount()
  try {
    let resolve!: (text: string) => void
    state.delayed = () => new Promise<string>(done => { resolve = done })
    await act(async () => state.open('/B.graph'))
    await act(async () => state.workspace.onCommand([{ type: 'title', title: 'My edit' }]))
    await act(async () => resolve(JSON.stringify({ ...defaultGraphDocument(), title: 'B' })))
    expect(state.workspace.documentTitle).toBe('My edit')
  } finally { await act(async () => root.unmount()) }
})
it('undo is document-local across repeated switches', async () => {
  const root = await mount()
  try {
    for (const title of ['B', 'A', 'B', 'A']) {
      await act(async () => state.open(`/${title}.graph`))
      expect(state.workspace.documentTitle).toBe(title)
      expect(state.workspace.loadedDocument?.document.elements[0].position).toEqual({ x: 17, y: 91 })
      expect(state.workspace.canUndo).toBe(false)
    }
    await act(async () => state.workspace.onCommand([{ type: 'replace', elements: [] }]))
    expect(state.workspace.canUndo).toBe(true)
    await act(async () => state.workspace.onUndo())
    expect(state.workspace.loadedDocument?.document.elements).toHaveLength(1)
    await act(async () => state.workspace.onRedo())
    expect(state.workspace.loadedDocument?.document.elements).toHaveLength(0)
  } finally { await act(async () => root.unmount()) }
})

it('keeps proposals pending, applies atomically, and clears them on document switches', async () => {
  const root = await mount()
  try {
    await act(async () => {
      const result = state.workspace.onPropose('Add two nodes', [{ type: 'add', elements: [{ data: { id: 'x' } }, { data: { id: 'y' } }] }])
      expect(result).toContain('Nothing has been applied')
    })
    expect(state.workspace.currentDocument.elements).toHaveLength(1)
    expect(state.workspace.proposal?.impact.added).toBe(2)
    const proposalId = state.workspace.proposal!.id
    expect(() => state.workspace.onApplyProposal('outdated-id')).toThrow('Proposal ID')
    expect(() => state.workspace.onDiscardProposal('outdated-id')).toThrow('Proposal ID')
    expect(state.workspace.currentDocument.elements).toHaveLength(1)
    await act(async () => state.workspace.onApplyProposal(proposalId))
    expect(state.workspace.currentDocument.elements).toHaveLength(3)
    expect(state.workspace.proposal).toBeNull()
    await act(async () => state.workspace.onUndo())
    expect(state.workspace.currentDocument.elements).toHaveLength(1)
    await act(async () => state.workspace.onPropose('Pending', [{ type: 'title', title: 'Pending title' }]))
    await act(async () => state.open('/B.graph'))
    expect(state.workspace.proposal).toBeNull()
    expect(state.workspace.currentDocument.title).toBe('B')
  } finally { await act(async () => root.unmount()) }
})

it('rejects a concurrent disk revision without losing local changes', async () => {
  const root = await mount()
  try {
    await act(async () => state.workspace.onCommand([{ type: 'update', ids: ['A'], data: { label: 'Local edit' } }]))
    const concurrent = { ...JSON.parse(state.files.get('/A.graph/graph.graph.json')!), revision: 'another-window', title: 'Concurrent graph' }
    state.files.set('/A.graph/graph.graph.json', JSON.stringify(concurrent))
    await act(async () => { await expect(state.workspace.onSaveDocument()).rejects.toThrow('Save conflict') })
    expect(state.workspace.currentDocument.elements[0].data.label).toBe('Local edit')
    expect(JSON.parse(state.files.get('/A.graph/graph.graph.json')!).title).toBe('Concurrent graph')
  } finally { await act(async () => root.unmount()) }
})

it('synchronizes two independent clean sessions without echo saves and protects dirty sessions', async () => {
  const first = await mount(), firstId = [...state.instances.keys()][0]
  const before = new Set(state.listeners)
  const second = createRoot(document.createElement('div'))
  try {
    await act(async () => second.render(<App />))
    await act(async () => state.open('/A.graph'))
    const secondId = [...state.instances.keys()].find(id => id !== firstId)!
    const firstListener = [...before][0], secondListener = [...state.listeners].find(listener => !before.has(listener))!
    const a = () => state.instances.get(firstId)!, b = () => state.instances.get(secondId)!
    await act(async () => a().onCommand([{ type: 'update', ids: ['A'], data: { label: 'First save' } }]))
    await act(async () => { await a().onSaveDocument() })
    const writes = state.writes.length
    await act(async () => secondListener({ kind: 'content', path: '/A.graph' }))
    expect(b().currentDocument.elements[0].data.label).toBe('First save')
    expect(state.writes).toHaveLength(writes)
    await act(async () => b().onCommand([{ type: 'update', ids: ['A'], data: { label: 'Second save' } }]))
    await act(async () => { await b().onSaveDocument() })
    await act(async () => firstListener({ kind: 'content', path: '/A.graph' }))
    expect(a().currentDocument.elements[0].data.label).toBe('Second save')
    await act(async () => a().onCommand([{ type: 'update', ids: ['A'], data: { label: 'Unsaved first' } }]))
    await act(async () => b().onCommand([{ type: 'update', ids: ['A'], data: { label: 'Newer second' } }]))
    await act(async () => { await b().onSaveDocument() })
    await act(async () => firstListener({ kind: 'content', path: '/A.graph' }))
    expect(a().currentDocument.elements[0].data.label).toBe('Unsaved first')
    await act(async () => { await expect(a().onSaveDocument()).rejects.toThrow('Save conflict') })
  } finally { await act(async () => { first.unmount(); second.unmount() }) }
})

it('opens a full exported JSON as a separate draft without dropping its style or positions', async () => {
  const root = await mount()
  try {
    const exported = { ...defaultGraphDocument(), title: 'Imported full graph', style: { ...defaultGraphDocument().style, nodeColor: '#123456' }, elements: [{ data: { id: 'x' }, position: { x: 31, y: 57 } }] }
    state.files.set('/export.json', JSON.stringify(exported))
    await act(async () => state.open('/export.json'))
    expect(state.workspace.currentDocument.title).toBe(exported.title)
    expect(state.workspace.currentDocument.style.nodeColor).toBe('#123456')
    expect(state.workspace.currentDocument.elements[0].position).toEqual({ x: 31, y: 57 })
    expect(JSON.parse(state.files.get('/A.graph/graph.graph.json')!).title).toBe('A')
  } finally { await act(async () => root.unmount()) }
})


it('creates a separate graph without overwriting the current document', async () => {
  const root = await mount()
  try {
    await act(async () => state.workspace.onCommand([{ type: 'title', title: 'Preserved work' }]))
    const created = { ...defaultGraphDocument(), title: 'Synthetic example', elements: [{ data: { id: 'new', label: 'New data' } }] }
    await act(async () => state.workspace.onCreateGraph(created))
    expect(state.workspace.currentDocument.title).toBe('Synthetic example')
    expect(state.workspace.currentDocument.elements[0].data.id).toBe('new')
    expect(JSON.parse(state.files.get('/A.graph/graph.graph.json')!).title).toBe('Preserved work')
    expect(JSON.parse(state.files.get('/A.graph/graph.graph.json')!).elements[0].data.id).toBe('A')
    expect(state.workspace.canUndo).toBe(false)
    await act(async () => state.workspace.onSaveDocument())
    expect(state.workspace.documentPath).not.toBe('/A.graph')
  } finally { await act(async () => root.unmount()) }
})
it('keeps the current document open if new graph creation cannot save outgoing work', async () => {
  const root = await mount()
  try {
    state.fail = true
    await act(async () => { await expect(state.workspace.onCreateGraph({ ...defaultGraphDocument(), title: 'New' })).rejects.toThrow('Could not create') })
    expect(state.workspace.documentTitle).toBe('A')
    expect(state.workspace.currentDocument.elements[0].data.id).toBe('A')
  } finally { state.fail = false; await act(async () => root.unmount()) }
})
