// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeShell } from '../test/fakeShell'
import { openTwoCopies } from '../test/twoCopies'
import { defaultGraphDocument, parseGraphDocument, serializeGraphDocument, type GraphDocument } from './graphDocument'
import { mergeGraphs } from './graphMerge'

vi.mock('@purescience/platform-ui/bridge/documents.mjs', async () => (await import('../test/fakeShell')).fakeDocumentsModule)
vi.mock('@purescience/platform-ui/bridge/workspace.mjs', async () => (await import('../test/fakeShell')).fakeWorkspaceModule)
vi.mock('@purescience/platform-ui/bridge/client.mjs', async () => (await import('../test/fakeShell')).fakeClientModule)

/** Two live copies of PureGraph over one `.graph` package, each with the real lifecycle, conditional write and merge. */
const node = (id: string, label = id) => ({ group: 'nodes', data: { id, label }, position: { x: 0, y: 0 } }) as GraphDocument['elements'][number]
const graph = (): GraphDocument => ({ ...defaultGraphDocument(), title: 'People', elements: [node('a'), node('b')] })
const config = {
  contentFile: 'graph.graph.json',
  files: (document: GraphDocument) => [{ name: 'graph.graph.json', content: serializeGraphDocument(document) }],
  parse: parseGraphDocument,
  merge: mergeGraphs,
}
const relabel = (id: string, label: string) => (document: GraphDocument): GraphDocument => ({
  ...document,
  elements: document.elements.map(element => (element.data.id === id ? { ...element, data: { ...element.data, label } } : element)),
})
const add = (id: string) => (document: GraphDocument): GraphDocument => ({ ...document, elements: [...document.elements, node(id)] })
const remove = (id: string) => (document: GraphDocument): GraphDocument => ({ ...document, elements: document.elements.filter(element => element.data.id !== id) })
const label = (document: GraphDocument, id: string) => document.elements.find(element => element.data.id === id)?.data.label
const ids = (document: GraphDocument) => document.elements.map(element => element.data.id).sort()

let close: (() => Promise<void>) | undefined
afterEach(async () => { await close?.(); close = undefined; fakeShell.reset() })
async function two() {
  const copies = await openTwoCopies(graph(), config)
  close = copies.close
  return copies
}

describe('two copies, one after the other', () => {
  it('a change in one reaches the other when it has nothing unsaved', async () => {
    const { a, b, settled, onDisk } = await two()
    await a.edit(relabel('a', 'From A'))
    await settled()
    expect(label(onDisk(), 'a')).toBe('From A')
    expect(label(b.document(), 'a')).toBe('From A')
  })
})

describe('two copies at the same moment', () => {
  it('both change different nodes: both stay, on disk and in each copy, and no save is left refused', async () => {
    const { a, b, together, settled, onDisk } = await two()
    await together(relabel('a', 'From A'), relabel('b', 'From B'))
    await settled()
    for (const document of [onDisk(), a.document(), b.document()]) {
      expect(label(document, 'a')).toBe('From A')
      expect(label(document, 'b')).toBe('From B')
    }
    expect(a.lifecycle().doc.error).toBeNull()
    expect(b.lifecycle().doc.error).toBeNull()
  })

  it('both add a node: both stay', async () => {
    const { together, settled, onDisk } = await two()
    await together(add('from-a'), add('from-b'))
    await settled()
    expect(ids(onDisk())).toEqual(['a', 'b', 'from-a', 'from-b'])
  })

  it('one removes a node while the other changes another: it stays removed', async () => {
    const { together, settled, onDisk } = await two()
    await together(remove('b'), relabel('a', 'From B'))
    await settled()
    expect(ids(onDisk())).toEqual(['a'])
    expect(label(onDisk(), 'a')).toBe('From B')
  })

  it('both relabel one node: they end agreeing', async () => {
    const { a, b, together, settled, onDisk } = await two()
    await together(relabel('a', 'From A'), relabel('a', 'From B'))
    await settled()
    expect(label(a.document(), 'a')).toBe(label(onDisk(), 'a'))
    expect(label(b.document(), 'a')).toBe(label(onDisk(), 'a'))
    expect(b.lifecycle().doc.error).toBeNull()
  })
})
