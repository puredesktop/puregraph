import { expect, it } from 'vitest'
import { defaultGraphDocument } from './graphDocument'
import { createGraphProposal, acceptGraphProposal } from './graphProposal'
import { commitGraph, createGraphHistory, moveGraphHistory } from './graphHistory'
it('validates and previews a multi-command change without mutating the current graph', () => {
  const original = defaultGraphDocument()
  const proposal = createGraphProposal(original, 'Connect two nodes', [
    { type: 'add', elements: [{ data: { id: 'a' } }, { data: { id: 'b' } }] },
    { type: 'add', elements: [{ data: { id: 'ab', source: 'a', target: 'b' } }] },
  ])
  expect(original.elements).toEqual([])
  expect(proposal.impact.added).toBe(3)
  const accepted = acceptGraphProposal(original, proposal)
  const history = commitGraph(createGraphHistory(original), accepted)
  expect(moveGraphHistory(history, 'undo').present).toEqual(original)
  expect(moveGraphHistory(moveGraphHistory(history, 'undo'), 'redo').present).toEqual(accepted)
})
it('refuses stale proposals and invalid command batches', () => {
  const original = defaultGraphDocument()
  const proposal = createGraphProposal(original, 'Rename', [{ type: 'title', title: 'New' }])
  expect(() => acceptGraphProposal({ ...original, title: 'Edited meanwhile' }, proposal)).toThrow('changed after')
  expect(() => createGraphProposal(original, 'Invalid', [{ type: 'add', elements: [{ data: { id: 'ab', source: 'a', target: 'b' } }] }])).toThrow('missing node')
  expect(() => createGraphProposal(original, 'Invalid', [{ type: 'unknown' } as never])).toThrow('Unknown')
})
it('includes connected-edge removals in destructive impact', () => {
  const original = { ...defaultGraphDocument(), elements: [{ data: { id: 'a' } }, { data: { id: 'b' } }, { data: { id: 'ab', source: 'a', target: 'b' } }] }
  const proposal = createGraphProposal(original, 'Delete a node', [{ type: 'remove', ids: ['a'] }])
  expect(proposal.impact.removed).toBe(2)
})
