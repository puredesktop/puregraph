import { encodedGraphDocument } from '../lib/graphEncoding'
import type { GraphHtmlOptions } from '../lib/graphHtmlOptions'
import { graphLegend } from '../lib/graphLegend'
import { readableTextColor } from '../lib/contrast'
import cytoscape from 'cytoscape'
import svgExtension from 'cytoscape-svg'
import type { GraphDocument } from '../lib/graphDocument'
import { buildStyle } from './graphStyle'
import { toElements } from './graphCanvas'
cytoscape.use(svgExtension)

export interface GraphExportOptions { width: number; height: number; transparent: boolean; html?: GraphHtmlOptions; scope?: 'all' | 'view' | 'selected' }
export const DEFAULT_EXPORT_OPTIONS: GraphExportOptions = { width: 1600, height: 1000, transparent: false }

/** Uses the same Cytoscape renderer and style as the editor, without selection decoration. */
export async function graphSvg(document: GraphDocument, options: GraphExportOptions): Promise<string> {
  document = encodedGraphDocument(document)
  for (const value of [options.width, options.height]) if (!Number.isInteger(value) || value < 100 || value > 8192) throw new Error('Export dimensions must be whole numbers between 100 and 8192 pixels.')
  if (!document.elements.length) throw new Error('Add nodes before exporting an image.')
  const container = window.document.createElement('div')
  Object.assign(container.style, { position: 'fixed', left: '-20000px', top: '0', width: '1000px', height: '800px' })
  window.document.body.append(container)
  const cy = cytoscape({ container, elements: toElements(document.elements.filter(element => element.data.source === undefined)), style: buildStyle(document.style), layout: { name: 'preset' } })
  try {
    // Measure label-sized nodes before connecting edges. Otherwise the first
    // visibility calculation can cache an endpoint as zero-sized.
    cy.nodes().boundingBox(); cy.style().update()
    cy.add(toElements(document.elements.filter(element => element.data.source !== undefined)))
    cy.resize(); cy.fit(undefined, 32)
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const raw = (cy as unknown as { svg(options: object): string }).svg({ full: true, scale: 1 })
    const xml = new DOMParser().parseFromString(raw, 'image/svg+xml')
    const svg = xml.documentElement
    if (xml.querySelector('parsererror')) throw new Error('Could not render the graph as SVG.')
    const width = Number.parseFloat(svg.getAttribute('width') || '1000'), height = Number.parseFloat(svg.getAttribute('height') || '800')
    const legend = document.style.showLegend ? graphLegend(document) : []
    const totalWidth = Math.max(width, ...legend.map(entry => entry.label.length * 8 + 48))
    const totalHeight = height + (legend.length ? legend.length * 22 + 20 : 0)
    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`)
    legend.forEach((entry, index) => {
      const swatch = xml.createElementNS('http://www.w3.org/2000/svg', 'rect')
      swatch.setAttribute('x', '12'); swatch.setAttribute('y', String(height + 14 + index * 22)); swatch.setAttribute('width', '12'); swatch.setAttribute('height', '12'); swatch.setAttribute('fill', entry.color)
      const label = xml.createElementNS('http://www.w3.org/2000/svg', 'text')
      label.setAttribute('x', '32'); label.setAttribute('y', String(height + 25 + index * 22)); label.setAttribute('font-size', '13'); label.setAttribute('font-family', 'sans-serif'); label.setAttribute('fill', readableTextColor(document.style.backgroundColor)); label.textContent = entry.label
      svg.append(swatch, label)
    })
    svg.setAttribute('width', String(options.width)); svg.setAttribute('height', String(options.height))
    // The outer viewport owns the paper; the inner SVG letterboxes the graph.
    // A background inside the fitted viewBox leaves transparent output margins.
    const output = xml.createElementNS('http://www.w3.org/2000/svg', 'svg')
    output.setAttribute('width', String(options.width)); output.setAttribute('height', String(options.height))
    output.setAttribute('viewBox', `0 0 ${options.width} ${options.height}`)
    xml.replaceChild(output, svg)
    if (!options.transparent) {
      const background = xml.createElementNS('http://www.w3.org/2000/svg', 'rect')
      background.setAttribute('width', '100%'); background.setAttribute('height', '100%'); background.setAttribute('fill', document.style.backgroundColor)
      output.append(background)
    }
    output.append(svg)
    return new XMLSerializer().serializeToString(output)
  } finally { cy.destroy(); container.remove() }
}

export async function pngFromGraphSvg(svg: string, options: GraphExportOptions): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image(); image.src = url
    await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = options.width; canvas.height = options.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('PNG rendering is unavailable.')
    context.drawImage(image, 0, 0, options.width, options.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encoding failed.')), 'image/png'))
    return new Uint8Array(await blob.arrayBuffer())
  } finally { URL.revokeObjectURL(url) }
}
