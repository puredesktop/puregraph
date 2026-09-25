import { describe, expect, it } from 'vitest'
import { defaultGraphDocument } from './graphDocument'
import { commitGraph, createGraphHistory, moveGraphHistory } from './graphHistory'

describe('graph document history', () => {
  it('restores position, data and style together and supports redo', () => {
    const original = defaultGraphDocument()
    const next = { ...original, elements: [{ data: { id: 'a' }, position: { x: 12, y: 34 } }], style: { ...original.style, nodeSize: 72 } }
    const edited = commitGraph(createGraphHistory(original), next)
    const undone = moveGraphHistory(edited, 'undo')
    expect(undone.present).toEqual(original)
    expect(moveGraphHistory(undone, 'redo').present).toEqual(next)
    next.elements[0].position.x = 900
    expect(edited.present.elements[0].position?.x).toBe(12)
  })
  it('drops the redo branch on new edits and ignores duplicate snapshots', () => {
    const start = createGraphHistory(defaultGraphDocument())
    const first = commitGraph(start, { ...start.present, title: 'One' })
    expect(commitGraph(first, structuredClone(first.present))).toBe(first)
    const second = commitGraph(moveGraphHistory(first, 'undo'), { ...start.present, title: 'Two' })
    expect(second.future).toEqual([])
    expect(moveGraphHistory(second, 'redo')).toBe(second)
  })
  it('adoption clears history between documents', () => {
    const first = createGraphHistory(defaultGraphDocument())
    const edited = commitGraph(first, { ...first.present, title: 'Edited' })
    const next = createGraphHistory({ ...edited.present, title: 'Other' })
    expect(moveGraphHistory(next, 'undo').present.title).toBe('Other')
  })
})
