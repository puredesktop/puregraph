import { chromium } from 'playwright'
import { readFile, chmod, stat } from 'node:fs/promises'
import assert from 'node:assert/strict'
const browser = await chromium.connectOverCDP('http://localhost:9336')
const page = browser.contexts()[0].pages().find(page => page.url().startsWith('http://localhost:5170'))
page.setDefaultTimeout(10000)
const f = page?.frames().find(frame => frame.url().startsWith('http://localhost:5370'))
if (!f) throw new Error('Open PureGraph in the desktop shell before running this check.')
const title = `PureGraph QA ${Date.now()}`, folder = `/Users/developer/Pure/Drafts/${title}.graph`
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
  for (const value of ['white', 'glass']) await appearance(value)
  for (const width of [1280, 800]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    for (const panel of ['Data', 'Graph', 'Style', 'Review', 'Export']) {
      await f.getByRole('button', { name: panel, exact: true }).click()
      assert.equal(await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.screenshot({ path: `/tmp/puregraph-electron-${panel}-${width}.png` })
    }
  }
  await f.getByRole('button', { name: 'Export', exact: true }).click()
  for (const format of ['SVG', 'PNG', 'JSON']) {
    await f.getByRole('button', { name: `Save ${format}`, exact: true }).click()
    await poll(() => stat(`${folder}/assets/figures/${title.replaceAll(' ', '_')}.${format.toLowerCase()}`))
  }
  const svg = await readFile(`${folder}/assets/figures/${title.replaceAll(' ', '_')}.svg`, 'utf8')
  assert.match(svg, /Saved Alpha/); assert.match(svg, /connects/); assert.match(svg, /Team/)
  const png = await readFile(`${folder}/assets/figures/${title.replaceAll(' ', '_')}.png`)
  assert.equal(png.readUInt32BE(16), 1600); assert.equal(png.readUInt32BE(20), 1000)
  const saved = await disk()
  await f.goto(f.url()); await f.getByRole('navigation', { name: 'Graph workspace' }).waitFor()
  await openPicker(); await f.getByText(title, { exact: true }).first().click()
  await f.getByRole('button', { name: 'Data', exact: true }).click()
  await f.getByRole('textbox', { name: 'a label', exact: true }).waitFor()
  assert.equal(await f.getByRole('textbox', { name: 'a label', exact: true }).inputValue(), 'Saved Alpha')
  assert.deepEqual((await disk()).elements, saved.elements)
  protectedFiles = true
  await chmod(folder, 0o555); await chmod(contentPath, 0o444); await chmod(`${folder}/manifest.json`, 0o444)
  await f.getByRole('textbox', { name: 'a label', exact: true }).fill('Recovered Alpha')
  await f.getByRole('textbox', { name: 'Search', exact: true }).click()
  await f.getByRole('button', { name: 'Retry save', exact: true }).waitFor()
  await openPicker(); await f.getByRole('button', { name: /^New graph/ }).click()
  assert.equal(await f.getByRole('textbox', { name: 'a label', exact: true }).inputValue(), 'Recovered Alpha')
  assert.equal((await disk()).elements[0].data.label, 'Saved Alpha')
  await chmod(folder, 0o755); await chmod(contentPath, 0o644); await chmod(`${folder}/manifest.json`, 0o644); protectedFiles = false
  await f.getByRole('button', { name: 'Retry save', exact: true }).click()
  await poll(async () => assert.equal((await disk()).elements[0].data.label, 'Recovered Alpha'))
  console.log(JSON.stringify({ result: 'Desktop import/edit/save/reopen/export/appearance/narrow panels and failed-save navigation/retry passed', folder }))
} finally {
  if (protectedFiles) { await chmod(folder, 0o755); await chmod(contentPath, 0o644); await chmod(`${folder}/manifest.json`, 0o644) }
  await cdp.send('Emulation.clearDeviceMetricsOverride')
  await page.keyboard.press('Escape')
  await appearance(originalAppearance).catch(() => {})
  if (original?.endsWith('.graph')) { await openPicker(); await f.getByText(original.replace(/\.graph$/, ''), { exact: true }).first().click() }
  await browser.close()
}
