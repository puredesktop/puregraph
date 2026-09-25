import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors = []
 page.on('pageerror', error => errors.push(error.message))
 await page.goto('http://localhost:5370')
 const button = name => page.getByRole('button', { name, exact: true })
 const fixture = await page.evaluate(async () => {
  const { defaultGraphDocument } = await import('/src/lib/graphDocument.ts')
  return { ...defaultGraphDocument(), title: 'Exploration QA', style: { ...defaultGraphDocument().style, labelPlacement: 'inside' }, elements: [
   { data: { id: 'a', label: 'Long Alpha label', category: 'Team', score: 10 }, position: { x: 100, y: 100 } },
   { data: { id: 'b', label: 'Beta', category: 'Team', score: 20 }, position: { x: 300, y: 200 } },
   { data: { id: 'c', label: 'Gamma', category: 'Evidence', score: 30 }, position: { x: 500, y: 100 } },
   { data: { id: 'ab', source: 'a', target: 'b' } }, { data: { id: 'bc', source: 'b', target: 'c' } },
  ] }
 })
 await button('Data').click(); await page.getByRole('textbox', { name: 'Import data', exact: true }).fill(JSON.stringify(fixture))
 await button('Explore').click(); await button('Data').click()
 assert.equal(await page.getByRole('textbox', { name: 'Import data', exact: true }).inputValue(), JSON.stringify(fixture))
 await button('Preview import').click(); await button('Replace graph').click()
 const cyRead = action => page.locator('canvas').first().evaluate((canvas, action) => { const cy = canvas.parentElement.parentElement._cyreg.cy; if (action === 'nodes') return cy.nodes().map(n => ({ id: n.id(), visible: n.visible(), position: n.position() })); if (action === 'selected') return cy.$(':selected').map(n => n.id()); return cy.elements().filter(n => n.visible()).map(n => n.id()) }, action)
 assert((await cyRead('nodes')).every(node => node.visible))
 await page.getByRole('textbox', { name: 'a id', exact: true }).fill('b'); await page.getByRole('textbox', { name: 'Search', exact: true }).click()
 assert.equal(await page.getByRole('textbox', { name: 'a id', exact: true }).getAttribute('aria-invalid'), 'true')
 await page.getByRole('textbox', { name: 'a id', exact: true }).focus(); await page.keyboard.press('Escape')
 assert.equal(await page.getByRole('textbox', { name: 'a id', exact: true }).inputValue(), 'a')
 await page.getByRole('checkbox', { name: 'Select a', exact: true }).check()
 assert.deepEqual(await cyRead('selected'), ['a'])
 await page.getByRole('textbox', { name: 'a id', exact: true }).fill('renamed'); await page.getByRole('textbox', { name: 'Search', exact: true }).click()
 await page.getByRole('textbox', { name: 'renamed id', exact: true }).waitFor()
 assert.deepEqual(await cyRead('selected'), ['renamed'])
 await button('Explore').click(); await page.getByRole('textbox', { name: 'Selected notes', exact: true }).fill('Evidence from the test fixture'); await page.keyboard.press('Enter')
 await page.getByText('Find a path', { exact: true }).click()
 await page.getByRole('combobox', { name: 'Path start', exact: true }).fill('renamed'); await page.keyboard.press('Escape')
 await page.getByRole('combobox', { name: 'Path end', exact: true }).fill('c'); await page.keyboard.press('Escape')
 await page.locator('canvas').first().evaluate(canvas => canvas.parentElement.parentElement._cyreg.cy.zoom(.01))
 await button('Find and focus path').click(); assert((await cyRead('selected')).includes('bc'))
 await page.waitForFunction(() => document.querySelector('canvas').parentElement.parentElement._cyreg.cy.zoom() > .1)
 await button('Reset view').click()
 await page.getByText('Categories and focus', { exact: true }).click(); await page.getByRole('checkbox', { name: 'Evidence', exact: true }).uncheck()
 await page.waitForFunction(() => { const cy = document.querySelector('canvas').parentElement.parentElement._cyreg.cy; return !cy.getElementById('c').visible() })
 assert.deepEqual((await cyRead('visible')).sort(), ['ab','b','renamed'])
 await page.getByText('Saved views and story', { exact: true }).click(); await page.getByLabel('View name', { exact: true }).fill('Team view'); await page.getByLabel('Caption', { exact: true }).fill('The team and its connection.'); await button('Save view').click()
 await button('Reset view').click(); await button('1. Team view').click(); await page.waitForFunction(() => !document.querySelector('canvas').parentElement.parentElement._cyreg.cy.getElementById('c').visible()); assert.equal((await cyRead('visible')).length, 3)
 await button('Undo').click(); assert.equal(await button('1. Team view').count(), 0); await button('Redo').click(); await button('1. Team view').waitFor()
 await button('Reset view').click(); await button('Graph').click()
 const workerResult = await page.evaluate(async fixture => {
  const { layoutGraphAsync } = await import('/src/lib/graphLayoutAsync.ts')
  const controller = new AbortController()
  const cancelled = layoutGraphAsync(fixture, 'grid', undefined, 'down', controller.signal).then(() => false, error => error.message === 'Layout cancelled.')
  controller.abort()
  if (!await cancelled) throw new Error('Layout cancellation did not reject.')
  const next = await layoutGraphAsync(fixture, 'grid')
  return next.elements.filter(e => !e.data.source).every(e => Number.isFinite(e.position.x))
 }, fixture)
 assert(workerResult)
 await button('Explore').click()
 for (const width of [1280,800]) { await page.setViewportSize({width,height:900}); assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({path:`/tmp/puregraph-explore-${width}.png`}) }
 await button('Data').click(); const many = { ...fixture, elements: Array.from({ length: 31 }, (_, i) => ({ data: { id: `n${i}`, label: `Node ${i}` } })) }
 await page.getByRole('textbox', { name: 'Import data', exact: true }).fill(JSON.stringify(many)); await button('Preview import').click(); await button('Replace graph').click(); await button('Next').click(); await button('Select this page').click(); await button('Delete selected and connected edges').click(); assert.equal(await page.locator('table[aria-label="nodes table"] tbody tr').count(), 30)
 assert.deepEqual(errors, [])
 console.log('PASS exploration: import draft, inside labels, rejected edits, shared selection/rename, evidence, filters/path, saved views/undo, layout worker, pagination, desktop/narrow UI.')
} finally { await browser.close() }
