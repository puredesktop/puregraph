import { beforeEach, expect, it } from 'vitest'
import { defaultGraphDocument, parseGraphDocument, serializeGraphDocument } from './graphDocument'
import { availableRecoveries, readRecoveries, recoveryLockName, recoveryMatches, writeRecovery } from './graphRecovery'
beforeEach(() => localStorage.clear())
it('matches saved content independent of save timestamps and preserves changed work', () => {
  const document = { ...defaultGraphDocument(), elements: [{ data: { id: 'a' }, position: { x: 3, y: 9 } }] }
  const entry = { id: 'window-a', document, path: '/A.graph', updatedAt: 1 }
  writeRecovery(localStorage, entry)
  expect(readRecoveries(localStorage)[0]).toEqual({ ...entry, document: parseGraphDocument(JSON.stringify(document)) })
  expect(recoveryMatches(entry, serializeGraphDocument(document))).toBe(true)
  expect(recoveryMatches(entry, serializeGraphDocument({ ...document, elements: [] }))).toBe(false)
})
it('offers only interrupted windows, excluding held and pending owner locks', async () => {
  for (const id of ['mine', 'live', 'mounting', 'interrupted']) writeRecovery(localStorage, { id, document: defaultGraphDocument(), path: null, updatedAt: 1 })
  const locks = { query: async () => ({ held: [{ name: recoveryLockName('live') }], pending: [{ name: recoveryLockName('mounting') }] }) } as LockManager
  expect((await availableRecoveries(localStorage, locks, 'mine')).map(entry => entry.id)).toEqual(['interrupted'])
  await expect(availableRecoveries(localStorage, undefined, 'mine')).rejects.toThrow('Web Locks')
})
it('a damaged entry does not hide other recoveries', () => {
  localStorage.setItem('puregraph:recovery:bad', '{')
  writeRecovery(localStorage, { id: 'good', document: defaultGraphDocument(), path: null, updatedAt: 1 })
  expect(readRecoveries(localStorage)).toHaveLength(1)
})
