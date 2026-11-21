import { graphContentFingerprint, parseGraphDocument, type GraphDocument } from './graphDocument'
import { applyGraphCommands, graphChangeSummary, type GraphCommand } from './graphCommands'
export interface GraphProposal {
  id: string; title: string; base: string; next: GraphDocument
  impact: ReturnType<typeof graphChangeSummary>
}
export function createGraphProposal(document: GraphDocument, title: string, commands: GraphCommand[]): GraphProposal {
  if (!title.trim()) throw new Error('Describe the proposed change.')
  if (!Array.isArray(commands) || !commands.length || commands.length > 1000) throw new Error('A proposal needs between 1 and 1000 commands.')
  const next = applyGraphCommands(document, commands)
  return { id: crypto.randomUUID(), title, base: graphContentFingerprint(document), next, impact: graphChangeSummary(document, next) }
}
export function acceptGraphProposal(document: GraphDocument, proposal: GraphProposal): GraphDocument {
  if (graphContentFingerprint(document) !== proposal.base) throw new Error('The graph changed after this proposal was prepared. Discard it and request a fresh proposal.')
  return structuredClone(proposal.next)
}

export function readStoredProposal(key: string): GraphProposal | null {
  try {
    const proposal = JSON.parse(localStorage.getItem(`puregraph.proposal:${key}`) || 'null')
    if (!proposal || typeof proposal.id !== 'string' || typeof proposal.title !== 'string' || typeof proposal.base !== 'string' || !proposal.impact || !proposal.next) return null
    // Validate stored data through document parsing and the transaction boundary before exposing Apply.
    const next = applyGraphCommands(parseGraphDocument(JSON.stringify(proposal.next)), [])
    return { ...proposal, next }
  } catch { return null }
}
export function storeProposal(key: string, proposal: GraphProposal | null): void {
  try {
    if (proposal) localStorage.setItem(`puregraph.proposal:${key}`, JSON.stringify(proposal))
    else localStorage.removeItem(`puregraph.proposal:${key}`)
  } catch {
    // Storage quota or restricted storage must not break editing or document binding.
  }
}
