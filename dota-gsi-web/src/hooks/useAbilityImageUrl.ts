import { useQuery } from '@tanstack/react-query'
import { probeImage } from '../lib/imageProbe'
import { buildSteamstaticUrls } from '../lib/steamStatic'

function getAbilityImageCandidates(abilityName: string): string[] {
  // Note: abilityName includes hero prefix, e.g. sandking_sand_storm
  const path = `apps/dota2/images/dota_react/abilities/${abilityName}.png`
  return buildSteamstaticUrls(path)
}

async function fetchStatus(url: string): Promise<'ok' | 'notFound' | 'unknown'> {
  try {
    // Some CDNs block HEAD via CORS; GET is more likely to work.
    const resp = await fetch(url, { method: 'GET', cache: 'force-cache' })
    // Avoid buffering the full image payload.
    try {
      await resp.body?.cancel()
    } catch {
      // ignore
    }
    if (resp.status === 404) return 'notFound'
    if (resp.ok) return 'ok'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

async function resolveAbilityIcon(candidates: string[]): Promise<{ url: string | null; notFound: boolean }> {
  // Sequential probing is intentional (avoid spamming CDN hosts).
  for (const url of candidates) {
    const status = await fetchStatus(url)
    if (status === 'ok') return { url, notFound: false }
    // One explicit 404 is enough to treat the icon as missing.
    if (status === 'notFound') return { url: null, notFound: true }
    // If HEAD/GET is blocked (CORS) or flaky, fall back to loading the image.
    if (await probeImage(url)) return { url, notFound: false }
  }

  // Exhausted candidates without an explicit 404: unknown, not a hard miss.
  return { url: null, notFound: false }
}

export function useAbilityImageUrl(abilityName: string | undefined, passive: boolean | undefined) {
  return useQuery({
    queryKey: ['abilityImageUrl', abilityName, passive === true],
    enabled: Boolean(abilityName),
    queryFn: async () => {
      if (!abilityName) return { url: null, notFound: false }
      const candidates = getAbilityImageCandidates(abilityName)
      const resolved = await resolveAbilityIcon(candidates)

      // If we cannot resolve an icon, passive abilities should not be shown.
      // In practice, CORS can prevent us from reading 404 from fetch(), but the icon still won't load.
      if (!resolved.url && passive === true) {
        return { url: null, notFound: true }
      }
      return resolved
    },
    staleTime: 7 * 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    refetchOnReconnect: true,
    // If we couldn't resolve an image (network down / CDN hiccup), retry periodically
    // but do NOT spam: at most once per minute per ability.
    refetchInterval: (query) => {
      const data = query.state.data as { url: string | null; notFound: boolean } | undefined
      if (!data) return 60_000
      if (data.notFound) return false
      return data.url ? false : 60_000
    },
  })
}
