import { chromium } from 'playwright'
import { readFile, chmod, stat } from 'node:fs/promises'
import assert from 'node:assert/strict'
const browser = await chromium.connectOverCDP('http://localhost:9336')
const page = browser.contexts()[0].pages().find(page => page.url().startsWith('http://localhost:5170'))
page.setDefaultTimeout(10000)
await page.frameLocator('iframe[src*=":5370"]').getByRole('navigation', { name: 'Graph workspace' }).waitFor()
const f = page?.frames().find(frame => frame.url().startsWith('http://localhost:5370'))
if (!f) throw new Error('Open PureGraph in the desktop shell before running this check.')
const title = `PureGraph QA explore ${Date.now()}`, folder = `/Users/developer/Pure/Drafts/${title}.graph`
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

try {
  if (await f.getByRole('button', { name: 'Review proposal', exact: true }).count()) throw new Error('A user proposal is pending; leave it untouched.')
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

  const created = JSON.parse(await invoke('createGraph', { title, synthetic: true, layout: 'grid', elements: [
    ...Array.from({ length: 310 }, (_, i) => ({ data: { id: `n${i}`, label: `Node ${i}`, category: i < 150 ? 'Research' : 'Evidence', notes: `Evidence ${i}`, score: i } })),
    ...Array.from({ length: 309 }, (_, i) => ({ data: { id: `e${i}`, source: `n${i}`, target: `n${i + 1}` } })),
  ] }))
  assert.equal(created.status, 'created'); await invoke('saveGraph')
  const query = JSON.parse(await invoke('queryGraph', { ids: ['n309'] }))
  assert.equal(query.elements[0].data.notes, 'Evidence 309'); assert.equal(query.elements[0].data.synthetic, true)
  const page2 = JSON.parse(await invoke('queryGraph', { kind: 'nodes', offset: 300, limit: 10 }))
  assert.equal(page2.elements.length, 10); assert.equal(page2.nextOffset, null)
  const analysis = JSON.parse(await invoke('analyzeGraph', { operation: 'path', start: 'n305', end: 'n309', directed: true }))
  assert.equal(analysis.path.edges.length, 4)
  await invoke('exploreGraph', { action: 'focus', ids: [...analysis.path.nodes, ...analysis.path.edges] })
  await invoke('saveGraphView', { name: 'Last segment', caption: 'Four evidence relationships.' }); await invoke('saveGraph')
  await poll(async () => assert.equal((await disk()).views[0].name, 'Last segment'))
  const proposal = JSON.parse(await invoke('proposeGraph', { title: 'Durable proposal', commands: [{ type: 'update', ids: ['n309'], data: { label: 'Proposed final node' } }] }))
  await f.goto(f.url()); await f.getByRole('button', { name: 'Review proposal', exact: true }).waitFor()
  assert.equal(JSON.parse(await invoke('getGraphContext')).pendingProposal.id, proposal.proposalId)
  await f.getByRole('button', { name: 'Explore', exact: true }).click(); await f.getByText('Saved views and story', { exact: true }).click(); await f.getByRole('button', { name: '1. Last segment', exact: true }).click()
  await invoke('applyGraphProposal', { proposalId: proposal.proposalId }); await invoke('saveGraph')
  await poll(async () => assert.equal((await disk()).elements.find(e => e.data.id === 'n309').data.label, 'Proposed final node'))
  const empty = JSON.parse(await invoke('proposeGraph', { title: 'Preview empty graph', commands: [{ type: 'replace', elements: [] }] }))
  await f.getByRole('button', { name: 'Review proposal', exact: true }).click(); await f.getByText('Empty graph', { exact: true }).waitFor(); await f.getByRole('button', { name: 'Back to graph', exact: true }).click()
  await invoke('discardGraphProposal', { proposalId: empty.proposalId })
  const result = await invoke('exportGraph', { format: 'html', filename: 'explorable-story' }); assert.match(result, /explorable-story.html/)
  const html = await readFile(`${folder}/assets/figures/explorable-story.html`, 'utf8'); assert(html.includes('Last segment')); assert(!html.includes('Evidence 309'))
  for (const width of [1280, 800]) { await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }); await f.getByRole('button', { name: 'Explore', exact: true }).click(); assert(await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: `/tmp/puregraph-explore-electron-${width}.png` }) }
  console.log(JSON.stringify({ result: 'PASS Electron: createGraph worker, paginated attributes beyond 200, grounded path/focus, saved-view disk persistence, proposal reload/apply, empty preview/discard, HTML story export, responsive panes.', folder }))
} finally {
  await page.evaluate(() => window.__graphToolQA?.restore()).catch(() => {})
  await cdp.send('Emulation.clearDeviceMetricsOverride')
  if (original?.endsWith('.graph')) { await openPicker(); await f.getByText(original.replace(/\.graph$/, ''), { exact: true }).first().click() }
  await browser.close()
}
