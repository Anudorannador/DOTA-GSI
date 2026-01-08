import { useQuery } from '@tanstack/react-query'
import { firstReachableImageUrl } from '../lib/imageProbe'
import { buildSteamstaticUrls } from '../lib/steamStatic'

function stripItemPrefix(value: string): string {
  const prefix = 'item_'
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

function getItemImageCandidates(itemName: string): string[] {
  const key = stripItemPrefix(itemName)
  const path = `apps/dota2/images/dota_react/items/${key}.png`
  return buildSteamstaticUrls(path)
}

export function useItemImageUrl(itemName: string | undefined) {
  return useQuery({
    queryKey: ['itemImageUrl', itemName],
    enabled: Boolean(itemName),
    queryFn: async () => {
      if (!itemName) return null
      const candidates = getItemImageCandidates(itemName)
      return firstReachableImageUrl(candidates)
    },
    staleTime: 7 * 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      return query.state.data ? false : 60_000
    },
  })
}

export function formatItemFallbackLabel(itemName: string): string {
  const key = stripItemPrefix(itemName)
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
