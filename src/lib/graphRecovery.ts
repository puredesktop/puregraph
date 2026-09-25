import { parseGraphDocument, type GraphDocument } from './graphDocument'

const PREFIX = 'puregraph:recovery:'
export interface RecoveryEntry { id: string; path: string | null; updatedAt: number; document: GraphDocument }

/** Independent of the document file: a recovery never replaces the last disk save. */
export function writeRecovery(storage: Storage, entry: RecoveryEntry): void {
  storage.setItem(PREFIX + entry.id, JSON.stringify(entry))
}
export function removeRecovery(storage: Storage, id: string): void { storage.removeItem(PREFIX + id) }
export function readRecoveries(storage: Storage): RecoveryEntry[] {
  const found: RecoveryEntry[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key?.startsWith(PREFIX)) continue
    try {
      const value = JSON.parse(storage.getItem(key) ?? '')
      if (typeof value.id !== 'string' || !Number.isFinite(value.updatedAt) || !Array.isArray(value.document?.elements)) continue
      found.push({ id: value.id, path: typeof value.path === 'string' ? value.path : null, updatedAt: value.updatedAt, document: parseGraphDocument(JSON.stringify(value.document)) })
    } catch { /* A corrupt entry does not hide the remaining recoverable work. */ }
  }
  return found.sort((a, b) => b.updatedAt - a.updatedAt)
}
export function recoveryMatches(entry: RecoveryEntry, content: string): boolean {
  try {
    const normalize = (value: GraphDocument) => JSON.stringify({ ...parseGraphDocument(JSON.stringify(value)), savedAt: undefined, revision: undefined })
    return normalize(entry.document) === normalize(parseGraphDocument(content))
  } catch { return false }
}

export const recoveryLockName = (id: string): string => `puregraph:recovery-owner:${id}`

/** Never offer a live window's backup as interrupted work. Include pending lock
 * requests so a mounting window is protected before its lock callback runs. */
export async function availableRecoveries(storage: Storage, locks: LockManager | undefined, ownId: string): Promise<RecoveryEntry[]> {
  if (!locks) throw new Error('Recovery ownership requires Web Locks.')
  const snapshot = await locks.query()
  const active = new Set([...snapshot.held ?? [], ...snapshot.pending ?? []].map(lock => lock.name))
  return readRecoveries(storage).filter(entry => entry.id !== ownId && !active.has(recoveryLockName(entry.id)))
}
