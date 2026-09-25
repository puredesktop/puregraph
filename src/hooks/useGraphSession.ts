import { useCallback, useRef, useState } from 'react'
import { defaultGraphDocument, type GraphDocument } from '../lib/graphDocument'
import { applyGraphCommands, type GraphCommand } from '../lib/graphCommands'
import { createGraphProposal, acceptGraphProposal, readStoredProposal, storeProposal, type GraphProposal } from '../lib/graphProposal'
import { commitGraph, createGraphHistory, moveGraphHistory } from '../lib/graphHistory'

/** Synchronous document ownership lets async commands observe the latest edit. */
export function useGraphSession() {
  const [history, setHistory] = useState(() => createGraphHistory(defaultGraphDocument()))
  const ref = useRef(history)
  const [proposal, setProposal] = useState<GraphProposal | null>(null)
  const keyRef = useRef('unsaved')
  const gesture = useRef({ key: '', at: 0 })
  const proposalRef = useRef<GraphProposal | null>(null)
  const publish = useCallback((next: typeof history) => {
    ref.current = next
    setHistory(next)
    return next.present
  }, [])
  const commit = useCallback((document: GraphDocument) => publish(commitGraph(ref.current, document)), [publish])
  const adopt = useCallback((document: GraphDocument, key = `unsaved:${crypto.randomUUID()}`) => {
    gesture.current = { key: '', at: 0 }
    keyRef.current = key
    proposalRef.current = readStoredProposal(key); setProposal(proposalRef.current)
    return publish(createGraphHistory(document))
  }, [publish])
  const bindKey = useCallback((key: string) => {
    if (key === keyRef.current) return
    const previous = keyRef.current
    storeProposal(key, proposalRef.current)
    storeProposal(previous, null)
    keyRef.current = key
  }, [])
  const move = useCallback((direction: 'undo' | 'redo') => { gesture.current = { key: '', at: 0 }; return publish(moveGraphHistory(ref.current, direction)) }, [publish])
  const execute = useCallback((commands: GraphCommand[]) => {
    const next = applyGraphCommands(ref.current.present, commands)
    const key = commands.length === 1 && commands[0].type === 'style' ? Object.keys(commands[0].style).sort().join(',') : ''
    const coalesce = key && gesture.current.key === key && Date.now() - gesture.current.at < 400
    gesture.current = { key, at: Date.now() }
    return coalesce ? publish({ ...ref.current, present: next, future: [] }) : commit(next)
  }, [commit, publish])
  const propose = useCallback((title: string, commands: GraphCommand[]) => {
    if (proposalRef.current) throw new Error(`Proposal ${proposalRef.current.id} is pending. Read getGraphContext, then applyGraphProposal if authorized or discardGraphProposal before preparing another. Do not retry the same edit.`)
    const next = createGraphProposal(ref.current.present, title, commands)
    storeProposal(keyRef.current, next)
    proposalRef.current = next; setProposal(next)
    return JSON.stringify({ status: 'pending', proposalId: next.id, title, impact: next.impact, message: 'Nothing has been applied. If the user requested these changes, call applyGraphProposal with this proposalId. If they asked only for a preview, stop here.' })
  }, [])
  const discardProposal = useCallback((proposalId?: string) => { if (proposalId && proposalRef.current?.id !== proposalId) throw new Error('Proposal ID does not match the pending proposal. Read getGraphContext.'); storeProposal(keyRef.current, null); proposalRef.current = null; setProposal(null) }, [])
  const applyProposal = useCallback((proposalId?: string) => {
    if (!proposalRef.current) throw new Error('There is no pending proposal.')
    if (proposalId && proposalRef.current.id !== proposalId) throw new Error('Proposal ID does not match the pending proposal. Read getGraphContext.')
    const next = acceptGraphProposal(ref.current.present, proposalRef.current)
    discardProposal()
    return commit(next)
  }, [commit, discardProposal])
  return { bindKey, proposal, propose, applyProposal, discardProposal, execute, document: history.present, commit, adopt, move,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0 }
}
