import { chromium } from 'playwright'
import { readFile, chmod, stat } from 'node:fs/promises'
import assert from 'node:assert/strict'
const browser = await chromium.connectOverCDP('http://localhost:9336')
const page = browser.contexts()[0].pages().find(page => page.url().startsWith('http://localhost:5170'))
page.setDefaultTimeout(10000)
const f = page?.frames().find(frame => frame.url().startsWith('http://localhost:5370'))
if (!f) throw new Error('Open PureGraph in the desktop shell before running this check.')
const title = `PureGraph QA recovery ${Date.now()}`, folder = `/Users/developer/Pure/Drafts/${title}.graph`
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
  protectedFiles = true
  await chmod(folder, 0o555); await chmod(contentPath, 0o444); await chmod(`${folder}/manifest.json`, 0o444)
  await f.getByRole('textbox', { name: 'a label', exact: true }).fill('Recovered Alpha')
  await f.getByRole('textbox', { name: 'Search', exact: true }).click()
  await f.getByRole('button', { name: 'Retry save', exact: true }).waitFor()
  const previous = await readFile(contentPath, 'utf8')
  await f.goto(f.url())
  const recovery = f.getByRole('status').filter({ hasText: `Interrupted work: ${title}` })
  await recovery.getByRole('button', { name: 'Recover a copy', exact: true }).waitFor()
  await chmod(folder, 0o755); await chmod(contentPath, 0o644); await chmod(`${folder}/manifest.json`, 0o644); protectedFiles = false
  await recovery.getByRole('button', { name: 'Recover a copy', exact: true }).click()
  const recoveredPath = `/Users/developer/Pure/Drafts/${title} — recovered.graph/graph.graph.json`
  await poll(async () => {
    const recovered = JSON.parse(await readFile(recoveredPath, 'utf8'))
    assert.equal(recovered.elements[0].data.label, 'Recovered Alpha')
    assert.equal(recovered.elements[0].position.x, 100)
  })
  assert.equal(await readFile(contentPath, 'utf8'), previous)
  console.log(JSON.stringify({ result: 'Interrupted unsaved edits recovered to a separate graph; original unchanged', recoveredPath }))
} finally {
  if (protectedFiles) { await chmod(folder, 0o755); await chmod(contentPath, 0o644); await chmod(`${folder}/manifest.json`, 0o644) }
  await cdp.send('Emulation.clearDeviceMetricsOverride')
  await page.keyboard.press('Escape')
  await appearance(originalAppearance).catch(() => {})
  if (original?.endsWith('.graph')) { await openPicker(); await f.getByText(original.replace(/\.graph$/, ''), { exact: true }).first().click() }
  await browser.close()
}
