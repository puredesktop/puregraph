import { bridge } from '@purescience/platform-ui/bridge/client'
import { PLATFORM_BRIDGE_METHODS } from '@purescience/platform-ui/bridge/methods'
import { getPlatformPreferences } from '@purescience/platform-ui/bridge/preferences'
import { updateCollectionAsset } from '@purescience/platform-ui/bridge/assets'
import { GRAPH_APP_SLUG } from '../constants'
import type {
  PlatformAppSettingsUpdateRequest,
  PureGraphSettings,
  ShellPreferences,
} from '../types'

export { bridge }

const STANDALONE_SETTINGS_KEY = 'purescience:puregraph:settings'

export function isStandaloneDevMode(): boolean {
  return import.meta.env.DEV && window.parent === window
}

function readStandaloneJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStandaloneJson(key: string, value: unknown): void {
  window.localStorage.setItem(key, JSON.stringify(value))
}

export async function fetchShellPreferences(): Promise<ShellPreferences> {
  if (isStandaloneDevMode()) {
    return { workingDirectory: '', theme: 'light' }
  }

  return getPlatformPreferences() as Promise<ShellPreferences>
}

export async function fetchGraphSettings(): Promise<PureGraphSettings> {
  if (isStandaloneDevMode()) {
    return readStandaloneJson<PureGraphSettings>(
      STANDALONE_SETTINGS_KEY,
      {},
    )
  }

  return bridge.call<PureGraphSettings>(
    PLATFORM_BRIDGE_METHODS.SETTINGS_APP_GET,
    [GRAPH_APP_SLUG],
  )
}

export async function updateGraphSettings(
  patch: Partial<PureGraphSettings>,
): Promise<PureGraphSettings> {
  if (isStandaloneDevMode()) {
    const nextSettings = {
      ...readStandaloneJson<PureGraphSettings>(
        STANDALONE_SETTINGS_KEY,
        {},
      ),
      ...patch,
    }
    writeStandaloneJson(STANDALONE_SETTINGS_KEY, nextSettings)
    return nextSettings
  }

  const request: PlatformAppSettingsUpdateRequest = {
    appSlug: GRAPH_APP_SLUG,
    patch,
  }
  return bridge.call<PureGraphSettings>(
    PLATFORM_BRIDGE_METHODS.SETTINGS_APP_UPDATE,
    [request],
  )
}

export async function readTextFile(path: string): Promise<string> {
  if (isStandaloneDevMode()) {
    const value = window.localStorage.getItem(`purescience:file:${path}`)
    if (value === null) throw new Error(`File not found: ${path}`)
    return value
  }

  return bridge.call<string>(PLATFORM_BRIDGE_METHODS.FS_READ, [path])
}

export async function writeTextFile(
  path: string,
  content: string,
): Promise<void> {
  if (isStandaloneDevMode()) {
    window.localStorage.setItem(`purescience:file:${path}`, content)
    return
  }

  await bridge.call(PLATFORM_BRIDGE_METHODS.FS_WRITE, [path, content])
}

export async function writeBinaryFile(
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  if (isStandaloneDevMode()) {
    window.localStorage.setItem(
      `purescience:file:${path}`,
      JSON.stringify(Array.from(bytes)),
    )
    return
  }

  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  await bridge.call(PLATFORM_BRIDGE_METHODS.FS_WRITE_BINARY, [
    { path, base64: btoa(binary) },
  ])
}

/**
 * Tell the asset library what a figure is: which graph it was drawn from,
 * and the tags the library reads to know when the graph has moved on.
 */
export async function updateAssetMetadata(input: {
  collectionPath: string
  relativePath: string
  label?: string
  caption?: string
  description?: string
  sourceDocumentPath?: string
  sourceAppSlug?: string
}): Promise<void> {
  if (isStandaloneDevMode()) return
  await updateCollectionAsset(input)
}
