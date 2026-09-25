import { chromium } from 'playwright'
import { readFile, chmod, stat } from 'node:fs/promises'
import assert from 'node:assert/strict'
const browser = await chromium.connectOverCDP('http://localhost:9336')
const page = browser.contexts()[0].pages().find(page => page.url().startsWith('http://localhost:5170'))
page.setDefaultTimeout(10000)
const f = page?.frames().find(frame => frame.url().startsWith('http://localhost:5370'))
if (!f) throw new Error('Open PureGraph in the desktop shell before running this check.')
const title = `PureGraph QA conflict ${Date.now()}`, folder = `/Users/developer/Pure/Drafts/${title}.graph`
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
  const baseline = await disk()
  await f.getByRole('textbox', { name: 'a label', exact: true }).fill('Local conflict edit')
  await f.getByRole('textbox', { name: 'Search', exact: true }).click()
  const remote = structuredClone(baseline)
  remote.elements[0].data.label = 'Other writer edit'; remote.revision = crypto.randomUUID()
  await f.evaluate(async ({ folder, remote, revision }) => {
    const { autosavePlatformDocument } = await import('/@fs/Users/developer/ps-suite-20260922/packages/ui/src/bridge/documents.mjs')
    await autosavePlatformDocument({ path: folder, files: [{ name: 'graph.graph.json', content: JSON.stringify(remote) }], revision: { file: 'graph.graph.json', field: 'revision', expected: revision } })
  }, { folder, remote, revision: baseline.revision })
  const rejected = await invoke('saveGraph')
  assert.match(rejected, /Save conflict/)
  assert.equal((await disk()).elements[0].data.label, 'Other writer edit')
  assert.equal(await f.getByRole('textbox', { name: 'a label', exact: true }).inputValue(), 'Local conflict edit')
  await f.getByRole('button', { name: 'Save my edits as a new graph', exact: true }).click()
  const copy = `/Users/developer/Pure/Drafts/${title} — conflict copy.graph/graph.graph.json`
  await poll(async () => assert.equal(JSON.parse(await readFile(copy, 'utf8')).elements[0].data.label, 'Local conflict edit'))
  assert.equal((await disk()).elements[0].data.label, 'Other writer edit')
  console.log(JSON.stringify({ result: 'Actual competing bridge writer rejected stale save; conflict copy preserved both versions', folder, copy }))
} finally {
  await page.evaluate(() => window.__graphToolQA?.restore()).catch(() => {})
  if (protectedFiles) { await chmod(folder, 0o755); await chmod(contentPath, 0o644); await chmod(`${folder}/manifest.json`, 0o644) }
  await cdp.send('Emulation.clearDeviceMetricsOverride')
  await page.keyboard.press('Escape')
  await appearance(originalAppearance).catch(() => {})
  if (original?.endsWith('.graph')) { await openPicker(); await f.getByText(original.replace(/\.graph$/, ''), { exact: true }).first().click() }
  await browser.close()
}
