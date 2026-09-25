import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 } })
  await page.goto('http://localhost:5370')
  const fixture = await page.evaluate(async () => {
    const { defaultGraphDocument } = await import('/src/lib/graphDocument.ts')
    return JSON.stringify({ ...defaultGraphDocument(), elements: [
      { data: { id: 'a', label: 'First', category: 'Team', color: '#ff0000' } },
      { data: { id: 'b', label: 'Second', category: 'Partners', color: '#00ff00' } },
      { data: { id: 'c', label: 'Third', category: 'Clients', color: '#0000ff' } },
      { data: { id: 'ab', source: 'a', target: 'b' } },
      { data: { id: 'bc', source: 'b', target: 'c' } },
    ] })
  })
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await page.getByRole('textbox', { name: 'Import data' }).fill(fixture)
  await page.getByRole('button', { name: 'Preview import', exact: true }).click()
  await page.getByRole('button', { name: 'Replace graph', exact: true }).click()
  await page.getByRole('button', { name: 'Style', exact: true }).click()
  await page.getByRole('button', { name: 'Generate palette', exact: true }).click()
  await page.getByText('3 categories pass', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Apply generated palette', exact: true }).click()
  assert.equal(await page.getByLabel('Show category legend', { exact: true }).isChecked(), true)
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByText('Node colors pass the measured contrast and pair separation checks.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('button', { name: 'Style', exact: true }).click()
  assert.equal(await page.getByLabel('Show category legend', { exact: true }).isChecked(), false)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  assert.equal(await page.getByLabel('Show category legend', { exact: true }).isChecked(), true)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('img', { name: 'Graph export preview' }).waitFor()
  console.log('Palette preview, apply, Review, one-step undo/redo and export preview passed.')
} finally { await browser.close() }
