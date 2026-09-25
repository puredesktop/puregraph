import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
// React requires an explicit act environment outside Testing Library.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { useGraphSession } from './useGraphSession'
import { defaultGraphDocument } from '../lib/graphDocument'

it('preserves per-document proposals across switching and remount, and does not apply stale proposals', async () => {
  let session!: ReturnType<typeof useGraphSession>
  function Harness() { session = useGraphSession(); return null }
  const container = document.createElement('div'); document.body.append(container)
  let root = createRoot(container)
  const a = { ...defaultGraphDocument(), title: 'A' }, b = { ...defaultGraphDocument(), title: 'B' }
  try {
    await act(async () => root.render(createElement(Harness)))
    await act(async () => { session.adopt(a, 'session-test-A') })
    let proposalId = ''
    await act(async () => { proposalId = JSON.parse(session.propose('Add node', [{ type: 'add', elements: [{ data: { id: 'a' } }] }])).proposalId })
    await act(async () => { session.adopt(b, 'session-test-B') })
    expect(session.proposal).toBeNull()
    await act(async () => { session.adopt(a, 'session-test-A') })
    expect(session.proposal?.id).toBe(proposalId)
    await act(async () => root.unmount()); root = createRoot(container)
    await act(async () => root.render(createElement(Harness)))
    await act(async () => { session.adopt({ ...a, revision: 'saved' }, 'session-test-A') })
    expect(session.proposal?.id).toBe(proposalId)
    await act(async () => { session.execute([{ type: 'title', title: 'A edited' }]) })
    expect(() => session.applyProposal(proposalId)).toThrow('changed')
    await act(async () => { session.move('undo'); session.applyProposal(proposalId) })
    expect(session.document.elements).toHaveLength(1)
    expect(session.proposal).toBeNull()
    await act(async () => { session.move('undo') })
    expect(session.document.elements).toHaveLength(0)
  } finally { await act(async () => root.unmount()); container.remove(); localStorage.removeItem('puregraph.proposal:session-test-A') }
})

it('migrates proposals when a draft is filed and groups slider changes without swallowing edits after Undo', async () => {
  let session!: ReturnType<typeof useGraphSession>
  function Harness() { session = useGraphSession(); return null }
  const container = document.createElement('div'), root = createRoot(container)
  try {
    await act(async () => root.render(createElement(Harness)))
    await act(async () => { session.adopt(defaultGraphDocument(), 'session-test-draft'); session.propose('Name', [{ type: 'title', title: 'New name' }]); session.bindKey('session-test-file') })
    expect(localStorage.getItem('puregraph.proposal:session-test-draft')).toBeNull()
    expect(localStorage.getItem('puregraph.proposal:session-test-file')).not.toBeNull()
    await act(async () => { session.discardProposal(); session.execute([{ type: 'style', style: { nodeSize: 30 } }]); session.execute([{ type: 'style', style: { nodeSize: 40 } }]) })
    await act(async () => { session.move('undo') })
    expect(session.document.style.nodeSize).toBe(20)
    await act(async () => { session.execute([{ type: 'style', style: { nodeSize: 50 } }]); session.move('undo') })
    expect(session.document.style.nodeSize).toBe(20)
  } finally { await act(async () => root.unmount()); container.remove(); localStorage.removeItem('puregraph.proposal:session-test-file') }
})
