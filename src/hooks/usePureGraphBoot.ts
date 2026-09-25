import { useEffect, useState } from 'react'
import {
  fetchGraphSettings,
  fetchShellPreferences,
} from '../bridge/platformBridge'
import type { PureGraphBootState } from '../types'

interface UsePureGraphBootResult {
  boot: PureGraphBootState | null
  bootError: Error | null
  booting: boolean
}

export function usePureGraphBoot(
  ready: boolean,
): UsePureGraphBootResult {
  const [boot, setBoot] = useState<PureGraphBootState | null>(null)
  const [bootError, setBootError] = useState<Error | null>(null)
  const [booting, setBooting] = useState(false)

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    setBooting(true)
    setBootError(null)

    async function bootApp(): Promise<void> {
      try {
        const [prefs, appSettings] = await Promise.all([
          fetchShellPreferences(),
          fetchGraphSettings(),
        ])
        if (!cancelled) setBoot({ prefs, appSettings })
      } catch (error) {
        if (!cancelled) {
          setBootError(error instanceof Error ? error : new Error(String(error)))
        }
      } finally {
        if (!cancelled) setBooting(false)
      }
    }

    void bootApp()
    return () => {
      cancelled = true
    }
  }, [ready])

  return { boot, bootError, booting }
}
