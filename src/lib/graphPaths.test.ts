import { describe, expect, it } from 'vitest'
import {
  graphAssetExportPath,
  graphPackageContentPath,
  graphTitleFromPath,
  isGraphPackagePath,
  resolveGraphPackagePath,
} from './graphPaths'

describe('graph paths', () => {
  it('detects .graph packages and resolves content', () => {
    expect(isGraphPackagePath('/tmp/network.graph')).toBe(true)
    expect(isGraphPackagePath('/tmp/network.graph/')).toBe(true)
    expect(isGraphPackagePath('/tmp/network.json')).toBe(false)
    expect(graphPackageContentPath('/tmp/network.graph')).toBe(
      '/tmp/network.graph/graph.graph.json',
    )
  })

  it('resolves a package from itself or its content file, never from loose files', () => {
    expect(resolveGraphPackagePath('/tmp/network.graph')).toBe('/tmp/network.graph')
    expect(resolveGraphPackagePath('/tmp/network.graph/')).toBe('/tmp/network.graph')
    expect(resolveGraphPackagePath('/tmp/network.graph/graph.graph.json')).toBe(
      '/tmp/network.graph',
    )
    expect(resolveGraphPackagePath('/tmp/edges.csv')).toBeNull()
    expect(resolveGraphPackagePath('/tmp/loose/graph.graph.json')).toBeNull()
  })

  it('derives titles and asset export paths', () => {
    expect(graphTitleFromPath('/tmp/Protein map.graph')).toBe('Protein map')
    expect(
      graphAssetExportPath('/tmp/Protein map.graph', 'figure.png', '/tmp'),
    ).toBe('/tmp/Protein map.graph/assets/figures/figure.png')
    expect(graphAssetExportPath(null, 'figure.png', '/tmp/out')).toBe(
      '/tmp/out/figure.png',
    )
  })
})
