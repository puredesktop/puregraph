import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const browser = await chromium.connectOverCDP('http://localhost:9336')
const page = browser.contexts()[0].pages().find(page => page.url().startsWith('http://localhost:5170'))
const frame = page?.frames().find(frame => frame.url().startsWith('http://localhost:5370'))
if (!frame) { await browser.close(); throw new Error('Open PureGraph in Electron first.') }
page.setDefaultTimeout(12000)
if (await frame.getByRole('button', { name: 'Review proposal', exact: true }).count()) { await browser.close(); throw new Error('A user proposal is pending; leave it untouched.') }
const original = await frame.locator('button[title="Switch documents (⌘O)"]').textContent()
const originalPanel = await frame.getByRole('navigation', { name: 'Graph workspace' }).locator('button[aria-pressed="true"]').textContent().catch(() => null)
const title = `PureGraph HTML QA ${Date.now()}`
const folder = `/Users/developer/Pure/Drafts/${title}.graph`
const cdp = await page.context().newCDPSession(page)
async function picker() { await frame.locator('button[title="Switch documents (⌘O)"]').click(); await frame.getByText('Open a graph', { exact: true }).waitFor() }
try {
  await picker(); await frame.getByRole('button', { name: /^New graph/ }).click()
  const fixture = await frame.evaluate(async title => {
    const { defaultGraphDocument } = await import('/src/lib/graphDocument.ts')
    return { ...defaultGraphDocument(), title, elements: [
      { data: { id: 'a', label: 'Alpha', notes: 'Shared evidence' }, position: { x: 100, y: 100 } },
      { data: { id: 'b', label: 'Beta' }, position: { x: 300, y: 200 } },
      { data: { id: 'ab', source: 'a', target: 'b' } },
    ] }
  }, title)
  await frame.getByRole('button', { name: 'Data', exact: true }).click()
  await frame.getByRole('textbox', { name: 'Import data' }).fill(JSON.stringify(fixture))
  await frame.getByRole('button', { name: 'Preview import', exact: true }).click()
  await frame.getByRole('button', { name: 'Replace graph', exact: true }).click()
  await frame.getByRole('button', { name: 'Export', exact: true }).click()
  for (const width of [1280, 800]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    assert(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await frame.getByRole('button', { name: 'Save interactive HTML' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `/tmp/puregraph-html-export-panel-${width}.png` })
  }
  await frame.getByText('Include extra attributes (0)', { exact: true }).click()
  await frame.getByLabel('notes', { exact: true }).check()
  await frame.getByRole('button', { name: 'Save interactive HTML' }).click()
  await frame.getByRole('status').filter({ hasText: /Saved graph to .*\.html/ }).waitFor()
  const path = `${folder}/assets/figures/${title.replaceAll(' ', '_')}.html`
  const html = await readFile(path, 'utf8')
  assert(html.includes('Shared evidence')); assert(html.includes('graph-data'))
  console.log(`PASS: Electron export control, attribute opt-in, actual bridge write, desktop/narrow panels. ${path}`)
} finally {
  await cdp.send('Emulation.clearDeviceMetricsOverride')
  if (original?.endsWith('.graph')) { await picker(); await frame.getByText(original.replace(/\.graph$/, ''), { exact: true }).first().click(); }
  if (originalPanel) await frame.getByRole('button', { name: originalPanel, exact: true }).click().catch(() => {})
  await browser.close()
}
