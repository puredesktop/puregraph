import { chromium } from 'playwright'
import { readFile, chmod, stat } from 'node:fs/promises'
import assert from 'node:assert/strict'
const browser = await chromium.connectOverCDP('http://localhost:9336')
const page = browser.contexts()[0].pages().find(page => page.url().startsWith('http://localhost:5170'))
page.setDefaultTimeout(10000)
const f = page?.frames().find(frame => frame.url().startsWith('http://localhost:5370'))
if (!f) throw new Error('Open PureGraph in the desktop shell before running this check.')
const title = `PureGraph QA tools ${Date.now()}`, folder = `/Users/developer/Pure/Drafts/${title}.graph`
const contentPath = `${folder}/graph.graph.json`
const original = await f.locator('button[title="Switch documents (⌘O)"]').textContent()
const originalAppearance = await f.evaluate(() => document.documentElement.dataset.platformAppearance || 'glass')
const cdp = await page.context().newCDPSession(page)
async function poll(test) { const deadline = Date.now() + 15000; let failure; do { try { return await test() } catch (error) { failure = error; await new Promise(resolve => setTimeout(resolve, 150)) } } while (Date.now() < deadline); throw failure }
async function disk() { return JSON.parse(await readFile(contentPath, 'utf8')) }
async function openPicker() { if (await f.getByText('Open a graph', { exact: true }).isVisible()) return; await f.locator('button[title="Switch documents (⌘O)"]').click(); await f.getByText('Open a graph', { exact: true }).waitFor() }
async function appearance(value) {
  await f.getByRole('button', { name: 'Settings', exact: true }).click()
  await f.getByRole('button', { name: 'Appearance', exact: true }).click()
  const current = await f.evaluate(() => document.documentElement.dataset.platformAppearance || 'glass')
  if (current !== value) { await f.getByRole('button', { name: current === 'glass' ? 'Glass' : 'White', exact: true }).click(); await f.getByText(value === 'glass' ? 'Glass' : 'White', { exact: true }).click() }
  await f.getByRole('button', { name: 'Close settings', exact: true }).click()
}
let protectedFiles = false
try {
  if (await f.getByRole('button', { name: 'Review proposal', exact: true }).count()) throw new Error('A user proposal is pending. Leave it intact; run this check after it is resolved.')
  await openPicker(); await f.getByRole('button', { name: /^New graph/ }).click()
  const fixture = await f.evaluate(async title => {
    const { defaultGraphDocument } = await import('/src/lib/graphDocument.ts')
    return { ...defaultGraphDocument(), title, style: { ...defaultGraphDocument().style, showLegend: true, categoryColors: { Team: '#4169a8' } }, elements: [{ data: { id: 'a', label: 'Alpha', category: 'Team' }, position: { x: 100, y: 100 } }, { data: { id: 'b', label: 'Beta', category: 'Team' }, position: { x: 350, y: 200 } }, { data: { id: 'ab', source: 'a', target: 'b', label: 'connects' } }] }
  }, title)
  await f.getByRole('button', { name: 'Data', exact: true }).click()
  await f.getByRole('textbox', { name: 'Import data' }).fill(JSON.stringify(fixture))
  await f.getByRole('button', { name: 'Preview import', exact: true }).click()
  await f.getByRole('button', { name: 'Replace graph', exact: true }).click()
  await poll(async () => { const doc = await disk(); assert.equal(doc.title, title); assert.equal(doc.elements.length, 3) })
  await f.getByRole('textbox', { name: 'a label', exact: true }).fill('Saved Alpha')
  await f.getByRole('textbox', { name: 'Search', exact: true }).click()
  await poll(async () => assert.equal((await disk()).elements[0].data.label, 'Saved Alpha'))
  await page.evaluate(async () => {
    const { router } = await import('/src/renderer/assistants/toolCalls/appTools/Router.ts')
    const { toolCalls } = await import('/src/renderer/assistants/toolCalls/api.ts')
    const { api } = await import('/src/renderer/workspace/api.ts')
    const tab = (await api.get()).tabs.find(t => t.appId === 'graph')
    const records = new Map(), pending = new Map()
    const get = toolCalls.get, complete = toolCalls.complete
    toolCalls.get = id => records.has(id) ? Promise.resolve(records.get(id)) : get(id)
    toolCalls.complete = async input => {
      const done = pending.get(input.resultForToolCallId)
      if (!done) return complete(input)
      pending.delete(input.resultForToolCallId)
      done(input.content)
    }
    window.__graphToolQA = {
      restore: () => { toolCalls.get = get; toolCalls.complete = complete; delete window.__graphToolQA },
      invoke: async (name, args = {}) => {
        const id = `graph-qa-${crypto.randomUUID()}`
        records.set(id, { id, toolName: `graph.${name}`, arguments: args })
        const result = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Tool timed out: ${name}`)), 15000)
          pending.set(id, content => { clearTimeout(timer); resolve(content) })
        })
        await router.request(id, tab.sessionId)
        return result
      },
    }
  })
  const invoke = (name, args) => page.evaluate(({ name, args }) => window.__graphToolQA.invoke(name, args), { name, args })
  const call = await invoke('proposeGraph', { title: 'Review two related edits', commands: [{ type: 'update', ids: ['a'], data: { label: 'Proposed Alpha' } }, { type: 'add', elements: [{ data: { id: 'c', label: 'Proposed Gamma' } }] }] })
  assert.match(call, /Nothing has been applied/)
  assert.equal((await disk()).elements.length, 3)
  await f.getByRole('button', { name: 'Style', exact: true }).click()
  await f.locator('[data-chrome="sidebar"]').evaluate(el => { el.scrollTop = el.scrollHeight })
  assert.equal(await f.getByRole('button', { name: 'Review proposal', exact: true }).isVisible(), true)
  await f.getByRole('button', { name: 'Review proposal', exact: true }).click()
  const review = f.getByRole('dialog', { name: 'Review graph proposal' })
  await review.waitFor()
  await review.getByRole('img', { name: 'Current graph', exact: true }).waitFor()
  await review.getByRole('img', { name: 'Proposed graph', exact: true }).waitFor()
  for (const width of [1280, 800]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    assert(await review.evaluate(el => el.scrollWidth <= el.clientWidth))
    await page.screenshot({ path: `/tmp/graph-proposal-review-${width}.png` })
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride')
  await review.getByRole('button', { name: 'Back to graph', exact: true }).click()
  assert.equal((await disk()).elements.length, 3)
  const proposalId = JSON.parse(call).proposalId
  const context = JSON.parse(await invoke('getGraphContext'))
  assert.equal(context.pendingProposal.id, proposalId)
  assert.match(await invoke('applyGraphProposal', { proposalId: 'stale-id' }), /Proposal ID/)
  assert.equal((await disk()).elements.length, 3)
  const applied = JSON.parse(await invoke('applyGraphProposal', { proposalId }))
  assert.equal(applied.status, 'applied')
  await invoke('saveGraph')
  assert.equal((await disk()).elements.length, 4)
  assert.equal((await disk()).elements[0].data.label, 'Proposed Alpha')
  await f.getByRole('button', { name: 'Graph', exact: true }).click()
  await f.locator('[data-app="graph"]').last().dispatchEvent('keydown', { key: 'z', metaKey: true, bubbles: true })
  await invoke('saveGraph')
  assert.equal((await disk()).elements.length, 3)
  assert.equal((await disk()).elements[0].data.label, 'Saved Alpha')
  const invalid = await invoke('proposeGraph', { title: 'Invalid edge', commands: [{ type: 'add', elements: [{ data: { id: 'bad', source: 'missing', target: 'a' } }] }] })
  assert.match(invalid, /missing node/)
  assert.equal(await f.getByRole('button', { name: 'Apply proposal', exact: true }).count(), 0)
  const pending = JSON.parse(await invoke('proposeGraph', { title: 'Discard this', commands: [{ type: 'title', title: 'Not applied' }] }))
  assert.equal(JSON.parse(await invoke('discardGraphProposal', { proposalId: pending.proposalId })).status, 'discarded')
  assert.equal(JSON.parse(await invoke('getGraphContext')).pendingProposal, null)
  await invoke('proposeGraph', { title: 'Review in dedicated screen', commands: [{ type: 'title', title: 'Reviewed graph' }] })
  await f.getByRole('button', { name: 'Review proposal', exact: true }).click()
  await f.getByRole('dialog', { name: 'Review graph proposal' }).getByRole('button', { name: 'Discard proposal', exact: true }).click()
  assert.equal(JSON.parse(await invoke('getGraphContext')).pendingProposal, null)
  const beforeCreate = await disk()
  const created = JSON.parse(await invoke('createGraph', { title: `${title} new example`, layout: 'breadthfirst', elements: [
    { data: { id: 'research', label: 'Research' } }, { data: { id: 'design', label: 'Design' } }, { data: { id: 'rd', source: 'research', target: 'design' } },
  ] }))
  assert.equal(created.status, 'created')
  await invoke('saveGraph')
  const fresh = JSON.parse(await invoke('getGraphContext'))
  assert.equal(fresh.title, `${title} new example`)
  assert.equal(fresh.nodeCount, 2)
  assert.equal(fresh.edgeCount, 1)
  assert.notEqual(fresh.documentPath, folder)
  assert.deepEqual((await disk()).elements, beforeCreate.elements)
  assert.equal((await disk()).title, beforeCreate.title)
  const newSaved = JSON.parse(await readFile(`${fresh.documentPath}/graph.graph.json`, 'utf8'))
  assert.equal(newSaved.elements[0].data.id, 'research')
  console.log(JSON.stringify({ result: 'Desktop tool transport, dedicated proposal preview, apply/discard/undo, and separate graph creation passed', folder }))
} finally {
  await page.evaluate(() => window.__graphToolQA?.restore()).catch(() => {})
  if (protectedFiles) { await chmod(folder, 0o755); await chmod(contentPath, 0o644); await chmod(`${folder}/manifest.json`, 0o644) }
  await cdp.send('Emulation.clearDeviceMetricsOverride')
  await page.keyboard.press('Escape')
  await appearance(originalAppearance).catch(() => {})
  if (original?.endsWith('.graph')) { await openPicker(); await f.getByText(original.replace(/\.graph$/, ''), { exact: true }).first().click() }
  await browser.close()
}
