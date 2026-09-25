import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://localhost:5370')
  await page.getByRole('navigation', { name: 'Graph workspace' }).waitFor()
  for (const width of [1280, 800]) {
    await page.setViewportSize({ width, height: 900 })
    for (const panel of ['Data', 'Graph', 'Style', 'Review', 'Export']) {
      await page.getByRole('button', { name: panel, exact: true }).click()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${panel} page at ${width}`)
      await page.screenshot({ path: `/tmp/puregraph-${panel.toLowerCase()}-${width}.png` })
    }
  }
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await page.getByRole('textbox', { name: 'Import data' }).fill('id,label\na,Alpha\nb,Beta')
  await page.getByRole('button', { name: 'Preview import', exact: true }).click()
  assert.equal(await page.getByRole('table', { name: 'nodes table' }).locator('tbody tr').count(), 0)
  await page.getByRole('button', { name: 'Replace graph', exact: true }).click()
  await page.getByRole('textbox', { name: 'a label', exact: true }).waitFor()
  await page.getByRole('textbox', { name: 'a label', exact: true }).fill('Edited Alpha')
  await page.getByRole('textbox', { name: 'Search', exact: true }).click()
  assert.equal(await page.getByRole('textbox', { name: 'a label', exact: true }).inputValue(), 'Edited Alpha')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('input[aria-label="a label"]')?.value === 'Alpha')
  await page.getByRole('textbox', { name: 'Import data' }).fill('source,target\na,b')
  await page.getByRole('button', { name: 'Preview import', exact: true }).click()
  await page.getByRole('button', { name: 'Merge into graph', exact: true }).click()
  await page.getByRole('button', { name: 'edges', exact: true }).click()
  assert.equal(await page.getByRole('table', { name: 'edges table' }).locator('tbody tr').count(), 1)
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByRole('textbox', { name: 'Path start', exact: true }).fill('a')
  await page.getByRole('textbox', { name: 'Path end', exact: true }).fill('b')
  await page.getByRole('button', { name: 'Find path', exact: true }).click()
  assert.equal(await page.getByText('1 edges: a → b', { exact: true }).count(), 1)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const preview = page.getByRole('img', { name: 'Graph export preview' })
  await preview.waitFor()
  await preview.evaluate(image => image.decode())
  await page.screenshot({ path: '/tmp/puregraph-export-populated.png' })
  const result = await page.evaluate(async () => {
    const { graphSvg, pngFromGraphSvg } = await import('/src/canvas/graphExport.ts')
    const { defaultGraphDocument } = await import('/src/lib/graphDocument.ts')
    const document = { ...defaultGraphDocument(), style: { ...defaultGraphDocument().style, showEdgeLabels: true }, elements: [{ data: { id: 'a', label: 'Alpha' }, position: { x: 40, y: 40 } }, { data: { id: 'b', label: 'Beta' }, position: { x: 200, y: 150 } }, { data: { id: 'ab', source: 'a', target: 'b', label: 'connects' } }] }
    const options = { width: 900, height: 600, transparent: true }
    const svg = await graphSvg(document, options)
    const bytes = await pngFromGraphSvg(svg, options)
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = window.document.createElement('canvas'); canvas.width = 900; canvas.height = 600
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0)
    const transparentAlpha = context.getImageData(0, 0, 1, 1).data[3]
    const solidSvg = await graphSvg(document, { ...options, transparent: false })
    const solid = await createImageBitmap(new Blob([await pngFromGraphSvg(solidSvg, options)], { type: 'image/png' }))
    context.clearRect(0, 0, 900, 600); context.drawImage(solid, 0, 0)
    const solidAlpha = context.getImageData(0, 0, 1, 1).data[3]
    return { transparentAlpha, solidAlpha, width: bitmap.width, height: bitmap.height, svg, png: Array.from(bytes.slice(0, 8)) }
  })
  assert.equal(result.transparentAlpha, 0); assert.equal(result.solidAlpha, 255)
  assert.equal(result.width, 900); assert.equal(result.height, 600)
  assert.match(result.svg, /Alpha/); assert.match(result.svg, /connects/)
  assert.deepEqual(result.png, [137,80,78,71,13,10,26,10])
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await page.evaluate(() => {
    const original = File.prototype.text
    window.__restoreFileText = () => { File.prototype.text = original }
    File.prototype.text = function() { return new Promise(resolve => { window.__finishFileRead = () => resolve('id,label\nold,Stale file') }) }
  })
  try {
    await page.locator('input[type=file]').setInputFiles({ name: 'delayed.csv', mimeType: 'text/csv', buffer: Buffer.from('id,label\nold,Stale file') })
    await page.getByRole('textbox', { name: 'Import data' }).fill('id,label\nnew,Newest paste')
    await page.evaluate(() => window.__finishFileRead())
    assert.equal(await page.getByRole('textbox', { name: 'Import data' }).inputValue(), 'id,label\nnew,Newest paste')
    assert.equal(await page.getByRole('button', { name: 'Replace graph', exact: true }).count(), 0)
  } finally { await page.evaluate(() => window.__restoreFileText()) }
  const started = Date.now()
  const chain = 'source,target,label\n' + Array.from({ length: 1999 }, (_, i) => `n${i},n${i + 1},edge ${i}`).join('\n')
  await page.getByRole('textbox', { name: 'Import data' }).fill(chain)
  await page.getByRole('button', { name: 'Preview import', exact: true }).click()
  await page.getByRole('button', { name: 'Replace graph', exact: true }).click()
  await page.getByRole('button', { name: 'nodes', exact: true }).click()
  await page.getByText('2000 nodes · 0 selected', { exact: true }).waitFor()
  assert.equal(await page.getByRole('table', { name: 'nodes table' }).locator('tbody tr').count(), 30)
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('n1999')
  assert.equal(await page.getByRole('table', { name: 'nodes table' }).locator('tbody tr').count(), 1)
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByRole('textbox', { name: 'Path start' }).fill('n0')
  await page.getByRole('textbox', { name: 'Path end' }).fill('n1999')
  await page.getByRole('button', { name: 'Find path', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '1999 edges:' }).waitFor()
  console.log(`Imported, searched and traversed a 2,000-node / 1,999-edge graph in ${Date.now() - started}ms.`)
  assert.deepEqual(errors, [])
  console.log('Workspace panels render at 1280px and 800px without page overflow or runtime errors.')
} finally { await browser.close() }
