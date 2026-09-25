import { chromium } from 'playwright'
import { writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const directory = await mkdtemp(join(tmpdir(), 'puregraph-html-'))
try {
  const page = await browser.newPage()
  await page.goto('http://localhost:5370')
  const exports = await page.evaluate(async () => {
    const { graphHtml } = await import('/src/canvas/graphHtml.ts')
    const { defaultGraphDocument } = await import('/src/lib/graphDocument.ts')
    const doc = defaultGraphDocument()
    doc.title = 'Research connections <offline>'
    doc.style.categoryColors = { Research: '#517987', Evidence: '#a07555' }
    doc.elements = [
      { data: { id: 'a', label: 'Alpha', category: 'Research', notes: '</script><img src=x onerror="window.injected=true">', private: 'do not share' }, position: { x: 100, y: 100 } },
      { data: { id: 'b', label: 'Beta', category: 'Research' }, position: { x: 280, y: 160 } },
      { data: { id: 'c', label: 'Gamma', category: 'Evidence', sourceUrl: 'https://example.com' }, position: { x: 430, y: 80 } },
      { data: { id: 'ab', source: 'a', target: 'b', label: 'supports' } },
      { data: { id: 'bc', source: 'b', target: 'c', label: 'explains' } },
    ]
    return { outside: graphHtml(doc, { attributeKeys: ['notes', 'sourceUrl'] }), inside: graphHtml({ ...doc, style: { ...doc.style, labelPlacement: 'inside' } }) }
  })
  const html = exports.outside
  assert(!html.includes('do not share'))
  const path = join(directory, 'graph.html'); await writeFile(path, html)
  const context = await browser.newContext({ offline: true, viewport: { width: 1280, height: 850 } })
  const viewer = await context.newPage(), errors = [], network = []
  viewer.on('pageerror', error => errors.push(error.message))
  viewer.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()) })
  await viewer.goto(`file://${path}`)
  await viewer.getByRole('status').filter({ hasText: '3 of 3 nodes' }).waitFor()
  await viewer.getByRole('searchbox').fill('Alpha')
  await viewer.locator('#results').getByRole('button', { name: 'Alpha', exact: true }).click()
  assert.equal(await viewer.locator('#details img').count(), 0)
  assert((await viewer.locator('#details').textContent()).includes('</script><img'))
  assert.equal(await viewer.evaluate(() => window.injected), undefined)
  await viewer.getByRole('button', { name: 'Start a path here' }).click()
  await viewer.getByRole('searchbox').fill('Gamma')
  await viewer.locator('#results').getByRole('button', { name: 'Gamma', exact: true }).click()
  await viewer.getByRole('button', { name: 'Find path to here' }).click()
  assert((await viewer.getByRole('status').textContent()).includes('2 relationships'))
  await viewer.getByRole('button', { name: 'Reset view' }).click()
  await viewer.getByLabel('Evidence', { exact: true }).uncheck()
  assert((await viewer.getByRole('status').textContent()).includes('2 of 3 nodes'))
  await viewer.getByLabel('Caption', { exact: true }).fill('Research only')
  await viewer.getByRole('button', { name: 'Save this view' }).click()
  await viewer.getByRole('button', { name: 'Reset view' }).click()
  await viewer.getByRole('button', { name: 'Research only', exact: true }).click()
  assert((await viewer.getByRole('status').textContent()).includes('2 of 3 nodes'))
  await viewer.getByRole('button', { name: 'Show data table' }).click()
  assert.equal(await viewer.locator('#rows tr').count(), 3)
  await viewer.locator('#rows').getByRole('button', { name: 'Alpha', exact: true }).focus()
  await viewer.keyboard.press('Enter')
  assert.equal(await viewer.locator('#details h2').first().textContent(), 'Alpha')
  await viewer.getByRole('button', { name: 'Show immediate connections' }).click()
  await viewer.getByRole('button', { name: 'Show graph', exact: true }).click()
  const downloaded = viewer.waitForEvent('download')
  await viewer.getByRole('button', { name: 'Download HTML with saved views', exact: true }).click()
  const copy = await downloaded, copyPath = join(directory, 'with-views.html'); await copy.saveAs(copyPath)
  await viewer.goto(`file://${copyPath}`)
  await viewer.getByRole('button', { name: 'Research only', exact: true }).click()
  assert((await viewer.getByRole('status').textContent()).includes('2 of 3 nodes'))
  await viewer.getByRole('button', { name: 'Reset view' }).click()
  await viewer.screenshot({ path: '/tmp/puregraph-html-desktop.png' })
  for (const width of [800, 390]) {
    await viewer.setViewportSize({ width, height: 850 })
    await viewer.getByRole('button', { name: 'Fit visible graph', exact: true }).click()
    assert(await viewer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `overflow at ${width}`)
    await viewer.screenshot({ path: `/tmp/puregraph-html-${width}.png`, fullPage: true })
  }
  const insidePath = join(directory, 'inside.html'); await writeFile(insidePath, exports.inside)
  await viewer.goto(`file://${insidePath}`)
  await viewer.getByRole('status').filter({ hasText: '3 of 3 nodes' }).waitFor()
  assert.equal(await viewer.locator('#graph').evaluate(node => node._cyreg.cy.nodes().filter(item => item.visible()).length), 3)
  assert.deepEqual(errors, []); assert.deepEqual(network, [])
  console.log(`PASS: offline file, paths, filters, views, table keyboard access, injection safety, responsive layout. ${path}`)
} finally { await browser.close() }
