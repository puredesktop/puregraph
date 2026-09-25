import {
  DEFAULT_GRAPH_EXPORT_NAME,
  GRAPH_ASSET_FIGURES_DIR,
  GRAPH_DOCUMENT_FILE,
  GRAPH_PACKAGE_SUFFIX,
} from '../constants'

function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/g, '')
}

function fileNameFromPath(path: string): string {
  return trimTrailingSlash(path).replace(/\\/g, '/').split('/').pop() ?? path
}

export function isGraphPackagePath(path: string): boolean {
  return trimTrailingSlash(path).toLowerCase().endsWith(GRAPH_PACKAGE_SUFFIX)
}

/**
 * The `.graph` package a path refers to — the package itself, or its content
 * file inside it — or null when the path is not part of a package (a loose
 * JSON/CSV file to import rather than bind to).
 */
export function resolveGraphPackagePath(path: string): string | null {
  const normalized = trimTrailingSlash(path.replace(/\\/g, '/'))
  if (normalized.toLowerCase().endsWith(`/${GRAPH_DOCUMENT_FILE}`)) {
    const parent = normalized.slice(0, -(GRAPH_DOCUMENT_FILE.length + 1))
    return isGraphPackagePath(parent) ? parent : null
  }
  return isGraphPackagePath(normalized) ? normalized : null
}

export function graphPackageContentPath(packagePath: string): string {
  return `${trimTrailingSlash(packagePath)}/${GRAPH_DOCUMENT_FILE}`
}

export function graphTitleFromPath(path: string): string {
  const name = fileNameFromPath(path)
  if (name.toLowerCase().endsWith(GRAPH_PACKAGE_SUFFIX)) {
    return name.slice(0, -GRAPH_PACKAGE_SUFFIX.length) || DEFAULT_GRAPH_EXPORT_NAME
  }
  if (name.toLowerCase() === GRAPH_DOCUMENT_FILE) {
    return graphTitleFromPath(trimTrailingSlash(path).replace(/\/[^/]+$/, ''))
  }
  return name.replace(/\.[^.]+$/g, '') || DEFAULT_GRAPH_EXPORT_NAME
}

export function graphAssetExportPath(
  packagePath: string | null,
  filename: string,
  fallbackDirectory: string | undefined,
): string {
  if (packagePath && isGraphPackagePath(packagePath)) {
    return `${trimTrailingSlash(packagePath)}/${GRAPH_ASSET_FIGURES_DIR}/${filename}`
  }
  const directory = fallbackDirectory?.trim()
  if (!directory) throw new Error('Choose a PureDesktop working directory before exporting.')
  return `${trimTrailingSlash(directory)}/${filename}`
}
