function getFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function isDebugEnabled(area: string): boolean {
  const envFlag = (import.meta as any).env?.VITE_DEBUG_ICONS
  if (envFlag === '1' && area === 'icons') return true

  const v = getFlag(`dota.debug.${area}`)
  return v === '1' || v === 'true'
}

export function debugFilterValue(area: string): string | null {
  return getFlag(`dota.debug.${area}.filter`)
}

export function debugLog(area: string, msg: string, extra?: unknown) {
  if (!isDebugEnabled(area)) return

  // Many consoles hide console.debug by default; use log so it's visible.
  // eslint-disable-next-line no-console
  ;(window as any).__dotaDebugAreas ??= new Set<string>()
  const seen: Set<string> = (window as any).__dotaDebugAreas
  if (!seen.has(area)) {
    seen.add(area)
    // eslint-disable-next-line no-console
    console.log(`[${area}] debug enabled`)
  }

  const filter = debugFilterValue(area)
  if (filter && !msg.includes(filter)) return

  // Keep it console-only; no UI impact.
  if (extra !== undefined) {
    // eslint-disable-next-line no-console
    console.log(`[${area}] ${msg}`, extra)
  } else {
    // eslint-disable-next-line no-console
    console.log(`[${area}] ${msg}`)
  }
}
